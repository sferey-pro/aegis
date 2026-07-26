import { serve } from "bun";
import index from "./index.html";
import { listProjects, createProject, updateProject, deleteProject, getProjectBySlug } from "./db/projects";
import { buildCveGroups } from "./lib/aggregator";
import { runAudit, ingestAudit } from "./lib/audit";
import { getGitInfo, gitFetch, gitPull } from "./lib/git";
import { getLatestRun, getGlobalHistory } from "./db/runs";
import { getDb } from "./db";
import { getAllSettings, setAllSettings } from "./db/settings";
import { upsertAnnotation, getAllAnnotations } from "./db/annotations";
import { addConsoleClient, removeConsoleClient } from "./lib/console";
import { createSnapshot, restoreSnapshot } from "./db/backup";
import { listTags, createTag, deleteTag } from "./db/tags";
import { listPrompts, createPrompt, updatePrompt, deletePrompt } from "./db/prompts";
import { createReport, getReports, deleteReport } from "./db/reports";

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
        
        let criticalCount = 0;
        let highCount = 0;
        let moderateCount = 0;

        for (const g of groups) {
          if (g.worst === 'critical') criticalCount++;
          else if (g.worst === 'high') highCount++;
          else if (g.worst === 'moderate') moderateCount++;
        }

        let lastSync: string | null = null;
        
        const projectRisks = [];

        for (const p of projects) {
          const run = getLatestRun(p.id);
          if (run) {
            if (!lastSync || new Date(run.ran_at) > new Date(lastSync)) {
              lastSync = run.ran_at;
            }
            const c = run.counts;
            const risk = (c.critical * 20) + (c.high * 10) + (c.moderate * 2);
            if (risk > 0) {
              projectRisks.push({
                id: p.id,
                name: p.name,
                critical: c.critical,
                high: c.high,
                risk
              });
            }
          }
        }

        const scoreValue = 100 - (criticalCount * 20) - (highCount * 10) - (moderateCount * 2);
        let healthGrade = 'F';
        if (scoreValue >= 90) healthGrade = 'A';
        else if (scoreValue >= 80) healthGrade = 'B';
        else if (scoreValue >= 60) healthGrade = 'C';
        else if (scoreValue >= 40) healthGrade = 'D';
        else if (scoreValue >= 20) healthGrade = 'E';

        const topProjects = projectRisks.sort((a, b) => b.risk - a.risk).slice(0, 3);
        const topCves = groups.sort((a, b) => b.occurrences.length - a.occurrences.length).slice(0, 3).map(g => ({
          cve: g.cve,
          title: g.occurrences[0]?.title || g.cve,
          worst: g.worst,
          count: g.occurrences.length
        }));

        return Response.json({
          monitoredProjects: projects.length,
          criticalVulnerabilities: criticalCount,
          lastSync,
          healthGrade,
          topProjects,
          topCves
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
        const { projectId, packageName } = await req.json();
        const groups = buildCveGroups();
        
        const occurrences = [];
        for (const g of groups) {
          for (const occ of g.occurrences) {
            if (occ.projectId === projectId && occ.package === packageName) {
              occurrences.push({ cve: g.cve, ref: g.ref, worst: g.worst, ...occ });
            }
          }
        }
        
        if (occurrences.length === 0) return Response.json({ error: "Non trouvé" }, { status: 404 });
        
        const projectName = occurrences[0].projectName;
        const title = `[Aegis] Remédiation ${packageName} - ${projectName}`;
        
        let md = `# ${title}\n\n`;
        md += `**Projet:** ${projectName} (${occurrences[0].tool})\n`;
        md += `**Package:** \`${packageName}\`\n\n`;
        md += `## Vulnérabilités (${occurrences.length})\n\n`;
        
        for (const occ of occurrences) {
          md += `### ${occ.ref} - ${occ.severity.toUpperCase()}\n`;
          md += `**Description:** ${occ.title || 'Aucune description'}\n`;
          md += `**Version affectée:** \`${occ.versionRange || 'N/A'}\`\n`;
          md += `**Correction disponible:** \`${occ.fixedIn || 'Aucune (mise à jour majeure requise)'}\`\n`;
          if (occ.link) md += `**Lien:** ${occ.link}\n`;
          md += `\n`;
        }
        
        md += `## Recommandation / Raison du risque\n\n`;
        md += `> À compléter par le référent sécurité...\n`;

        return Response.json({ markdown: md });
      }
    },
    
    "/api/tickets/list": {
      async GET() {
        const { getTickets } = await import("./db/tickets");
        return Response.json(getTickets());
      }
    },
    "/api/tickets/link": {
      async POST(req) {
        const { projectId, packageName, ref, cves } = await req.json();
        const { saveTicket } = await import("./db/tickets");
        saveTicket(projectId, packageName, ref, cves);
        return Response.json({ success: true });
      }
    },
    "/api/tickets/unlink": {
      async POST(req) {
        const { projectId, packageName } = await req.json();
        const { deleteTicket } = await import("./db/tickets");
        deleteTicket(projectId, packageName);
        return Response.json({ success: true });
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
          // Retirer le slash initial de audit_path pour éviter que resolve() ne le considère comme absolu
          const safeAuditPath = (audit_path || "").replace(/^\/+/, '');
          const fullPath = nodePath.resolve(expanded, safeAuditPath);
          
          if (fs.existsSync(nodePath.join(fullPath, "composer.lock"))) tool = "composer";
          else if (fs.existsSync(nodePath.join(fullPath, "bun.lockb"))) tool = "bun";
          else if (fs.existsSync(nodePath.join(fullPath, "yarn.lock"))) tool = "yarn";
          else if (fs.existsSync(nodePath.join(fullPath, "package-lock.json"))) tool = "npm";
          else if (fs.existsSync(nodePath.join(fullPath, "composer.json"))) tool = "composer";
          else if (fs.existsSync(nodePath.join(fullPath, "package.json"))) tool = "npm";
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
            let git = { isRepo: false };
            try {
              git = await getGitInfo(p.path);
            } catch (e) {
              console.error(`Git error on ${p.path}:`, e);
            }
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
        const url = new URL(req.url);
        const force = url.searchParams.get("force") === "true";
        try {
          const res = await runAudit(id, force);
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

    "/api/prompts": {
      async GET() {
        return Response.json(listPrompts());
      },
      async POST(req) {
        const body = await req.json();
        try {
          const prompt = createPrompt(body.title, body.body, body.tags || []);
          return Response.json(prompt);
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 400 });
        }
      }
    },
    
    "/api/prompts/:id": {
      async PUT(req) {
        const id = parseInt(req.params.id);
        const body = await req.json();
        try {
          const prompt = updatePrompt(id, body.title, body.body, body.tags || []);
          return Response.json(prompt);
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 400 });
        }
      },
      async DELETE(req) {
        deletePrompt(parseInt(req.params.id));
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
        // Lancer l'audit en arrière-plan sans bloquer la requête HTTP
        setTimeout(async () => {
          for (const p of projects) {
            try {
              await runAudit(p.id);
            } catch (e) {
              console.error(`Audit background fail for ${p.id}`, e);
            }
          }
        }, 0);
        return Response.json({ status: "started", count: projects.length });
      }
    },
    
    "/api/reports": {
      async GET() {
        return Response.json(getReports());
      },
      async POST(req) {
        const body = await req.json();
        return Response.json(createReport(body));
      }
    },

    "/api/reports/:id": {
      async DELETE(req) {
        const id = parseInt(req.params.id);
        deleteReport(id);
        return Response.json({ success: true });
      }
    },

    "/api/ingest/:slug": {
      async POST(req) {
        const slug = req.params.slug;
        const project = getProjectBySlug(slug);
        
        if (!project) {
          return Response.json({ error: "Project introuvable" }, { status: 404 });
        }
        
        const url = new URL(req.url);
        const commitSha = url.searchParams.get('sha') || "";
        const stdout = await req.text();
        
        try {
          const res = await ingestAudit(project.id, stdout, commitSha);
          return Response.json({ success: true, run: res.run, newCvesCount: res.newCves.length });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 400 });
        }
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
