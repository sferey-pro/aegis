import { serve } from "bun";
import index from "./index.html";
import { listProjects, createProject, updateProject, deleteProject } from "./db/projects";
import { buildCveGroups } from "./lib/aggregator";
import { runAudit } from "./lib/audit";
import { getLatestRun } from "./db/runs";
import { getDb } from "./db";
import { getAllSettings, setAllSettings } from "./db/settings";
import { upsertAnnotation } from "./db/annotations";
import { addConsoleClient, removeConsoleClient } from "./lib/console";

// Ensure DB is initialized before starting
getDb();

const server = serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

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

    "/api/cves": {
      async GET() {
        return Response.json(buildCveGroups());
      }
    },
    
    "/api/projects": {
      async GET() {
        return Response.json(listProjects());
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
    }
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
