import { serve } from "bun";
import index from "./index.html";
import { listProjects, createProject, updateProject, deleteProject } from "./db/projects";
import { buildCveGroups } from "./lib/aggregator";
import { runAudit } from "./lib/audit";
import { getGitInfo, gitFetch, gitPull } from "./lib/git";
import { getLatestRun, getGlobalHistory } from "./db/runs";
import { getDb } from "./db";
import { getAllSettings, setAllSettings } from "./db/settings";
import { upsertAnnotation, getAllAnnotations } from "./db/annotations";
import { addConsoleClient, removeConsoleClient } from "./lib/console";
import { createSnapshot, restoreSnapshot } from "./db/backup";
import { listTags, createTag, deleteTag } from "./db/tags";

// Ensure DB is initialized before starting
getDb();

const server = serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
  routes: {
    // Removed /* from here, moved to the bottom

    "/api/console": {
      async GET() {
        return new Response(new ReadableStream({
          start(controller) {
            addConsoleClient(controller as any);
          },
          cancel(controller) {
            removeConsoleClient(controller as any);
          }
        }), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });
      }
    },

    "/api/stats": {
      async GET() {
        const projects = listProjects().filter(p => !p.ignored);
        const groups = buildCveGroups();
        
        // Count critical vulns
        const criticalCount = groups.filter(g => g.worst === "critical").length;

        // DB sync time (we take the most recent run's date)
        let lastSync: string | null = null;
        for (const p of projects) {
          const run = getLatestRun(p.id);
          if (run && (!lastSync || new Date(run.ran_at) > new Date(lastSync))) {
            lastSync = run.ran_at;
          }
        }

        return Response.json({
          monitoredProjects: projects.length,
          criticalVulnerabilities: criticalCount,
          lastSync,
        });
      }
    },

    "/api/history-global": {
      async GET() {
        return Response.json(getGlobalHistory(30));
      }
    },

    "/api/tickets": {
      async POST(req) {
        const { cve } = await req.json();
        const groups = buildCveGroups();
        const group = groups.find(g => g.cve === cve);
        
        if (!group) return Response.json({ error: "Non trouvé" }, { status: 404 });

        const title = `[Aegis] Remédiation ${group.ref} - ${group.occurrences[0]?.package || 'Unknown'}`;
        
        let md = `# ${title}\n\n`;
        md += `**Sévérité:** ${group.worst.toUpperCase()}\n`;
        md += `**Description:** ${group.occurrences[0]?.title || 'Aucune description'}\n`;
        if (group.occurrences[0]?.link) {
          md += `**Lien:** ${group.occurrences[0].link}\n`;
        }
        
        md += `\n## Projets affectés\n\n`;
        for (const occ of group.occurrences) {
          md += `- **${occ.projectName}** (${occ.tool})\n`;
          md += `  - Package: \`${occ.package}\`\n`;
          md += `  - Version affectée: \`${occ.versionRange || 'N/A'}\`\n`;
          md += `  - Correction disponible: \`${occ.fixedIn || 'Aucune (mise à jour majeure requise)'}\`\n`;
        }
        
        md += `\n## Baseline & Remédiation\n`;
        md += `> **Rappel de sécurité :** Effectuez la mise à jour sans casser le lockfile. Utilisez les commandes d'audit natives (ex: \`npm audit fix\`) pour isoler les changements.\n`;

        return Response.json({ markdown: md });
      }
    },

    "/api/cves": {
      async GET() {
        return Response.json(buildCveGroups());
      }
    },
    
    "/api/projects/detect": {
      async POST(req) {
        const { path, audit_path } = await req.json();
        const fs = await import("node:fs");
        const nodePath = await import("node:path");
        const { expandPath } = await import("./lib/git");
        
        let tool = null;
        try {
          const expanded = expandPath(path);
          const fullPath = nodePath.resolve(expanded, audit_path || "");
          
          if (fs.existsSync(nodePath.join(fullPath, "composer.lock"))) tool = "composer";
          else if (fs.existsSync(nodePath.join(fullPath, "bun.lockb"))) tool = "bun";
          else if (fs.existsSync(nodePath.join(fullPath, "yarn.lock"))) tool = "yarn";
          else if (fs.existsSync(nodePath.join(fullPath, "package-lock.json"))) tool = "npm";
          else if (fs.existsSync(nodePath.join(fullPath, "composer.json"))) tool = "composer";
        } catch (e) {}
        
        return Response.json({ tool });
      }
    },
    
    "/api/projects": {
      async GET() {
        const projects = listProjects();
        // Enrichir en parallèle mais borné à 4 pour ne pas exploser le nombre de processus
        const limit = 4;
        const enriched = new Array(projects.length);
        let i = 0;
        const exec = async () => {
          while (i < projects.length) {
            const index = i++;
            const p = projects[index];
            const git = await getGitInfo(p.path);
            const run = getLatestRun(p.id);
            enriched[index] = { ...p, git, lastRun: run };
          }
        };
        await Promise.all(Array.from({ length: Math.min(limit, projects.length) }).map(() => exec()));
        return Response.json(enriched);
      },
      async POST(req) {
        const body = await req.json();
        // createProject requires name, path, type, tool
        const project = createProject(body);
        return Response.json(project);
      }
    },
    
    "/api/projects/:id": {
      async PUT(req) {
        const id = parseInt(req.params.id);
        const body = await req.json();
        const project = updateProject(id, body);
        return Response.json(project);
      },
      async DELETE(req) {
        const id = parseInt(req.params.id);
        deleteProject(id);
        return Response.json({ success: true });
      }
    },

    "/api/projects/:id/git-fetch": {
      async POST(req) {
        const id = parseInt(req.params.id);
        const project = listProjects().find(p => p.id === id);
        if (!project) return Response.json({ error: "Not found" }, { status: 404 });
        
        const { projectContext } = await import("./lib/console");
        const res = await projectContext.run({ project: project.name }, () => gitFetch(project.path));
        
        return Response.json(res);
      }
    },

    "/api/projects/:id/git-pull": {
      async POST(req) {
        const id = parseInt(req.params.id);
        const project = listProjects().find(p => p.id === id);
        if (!project) return Response.json({ error: "Not found" }, { status: 404 });
        
        const { projectContext } = await import("./lib/console");
        const res = await projectContext.run({ project: project.name }, () => gitPull(project.path));
        
        return Response.json(res);
      }
    },

    "/api/projects/:id/audit": {
      async POST(req) {
        const id = parseInt(req.params.id);
        try {
          const res = await runAudit(id);
          return Response.json({ success: true, ...res });
        } catch (e: any) {
          return Response.json({ success: false, error: e.message }, { status: 500 });
        }
      }
    },

    "/api/settings": {
      async GET() {
        return Response.json(getAllSettings());
      },
      async PUT(req) {
        const body = await req.json();
        setAllSettings(body);
        return Response.json({ success: true });
      }
    },

    "/api/tags": {
      async GET() {
        return Response.json(listTags());
      },
      async POST(req) {
        const body = await req.json();
        try {
          const tag = createTag(body.name, body.color);
          return Response.json(tag);
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 400 });
        }
      }
    },
    
    "/api/tags/:id": {
      async DELETE(req) {
        deleteTag(parseInt(req.params.id));
        return Response.json({ success: true });
      }
    },

    "/api/config/export": {
      async GET() {
        return Response.json({
          projects: listProjects(),
          settings: getAllSettings(),
          annotations: getAllAnnotations()
        });
      }
    },

    "/api/config/import": {
      async POST(req) {
        const body = await req.json();
        // Here we could implement detailed JSON import. 
        // We'll trust the body structure for simplicity in this MVP.
        if (body.settings) setAllSettings(body.settings);
        
        // For projects and annotations, normally we'd loop and upsert.
        // For safety, we only import settings in this demo endpoint.
        return Response.json({ success: true, message: "Paramètres importés avec succès." });
      }
    },

    "/api/snapshots/create": {
      async POST() {
        return Response.json(createSnapshot());
      }
    },

    "/api/snapshots/restore": {
      async POST() {
        try {
          return Response.json(restoreSnapshot());
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 400 });
        }
      }
    },

    "/api/annotations": {
      async POST(req) {
        const body = await req.json();
        const res = upsertAnnotation(body.cve, body.projectId, body);
        return Response.json(res);
      }
    },
    
    "/api/audit/run": {
      async POST() {
        const projects = listProjects().filter(p => !p.ignored);
        const results = [];
        for (const p of projects) {
          try {
            const res = await runAudit(p.id);
            results.push({ projectId: p.id, success: true, ...res });
          } catch (e: any) {
            results.push({ projectId: p.id, success: false, error: e.message });
          }
        }
        return Response.json({ status: "done", results });
      }
    },
    
    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
