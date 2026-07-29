import { serve } from "bun";
import index from "./index.html";
import { getDb } from "./db";

import { consoleRoutes } from "./routes/console";
import { statsRoutes } from "./routes/stats";
import { ticketsRoutes } from "./routes/tickets";
import { cvesRoutes } from "./routes/cves";
import { projectsRoutes } from "./routes/projects";
import { settingsRoutes } from "./routes/settings";
import { tagsRoutes } from "./routes/tags";
import { promptsRoutes } from "./routes/prompts";
import { reportsRoutes } from "./routes/reports";
import { annotationsRoutes } from "./routes/annotations";
import { auditRoutes } from "./routes/audit";

// Ensure DB is initialized before starting
getDb();

export const server = serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
  routes: {
    ...consoleRoutes,
    ...statsRoutes,
    ...ticketsRoutes,
    ...cvesRoutes,
    ...projectsRoutes,
    ...settingsRoutes,
    ...tagsRoutes,
    ...promptsRoutes,
    ...reportsRoutes,
    ...annotationsRoutes,
    ...auditRoutes,

    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
