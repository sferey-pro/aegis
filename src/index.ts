import { serve } from "bun";
import { getDb, closeDb } from "./db";
import index from "./index.html";
import { annotationsRoutes } from "./routes/annotations";
import { auditRoutes } from "./routes/audit";
import { consoleRoutes } from "./routes/console";
import { cvesRoutes } from "./routes/cves";
import { projectsRoutes } from "./routes/projects";
import { promptsRoutes } from "./routes/prompts";
import { reportsRoutes } from "./routes/reports";
import { settingsRoutes } from "./routes/settings";
import { statsRoutes } from "./routes/stats";
import { tagsRoutes } from "./routes/tags";
import { ticketsRoutes } from "./routes/tickets";

// Ensure DB is initialized before starting
getDb();

export const server = serve({
	port: process.env.AEGIS_PORT ? parseInt(process.env.AEGIS_PORT) : 3001,
	hostname: process.env.HOST || "127.0.0.1",
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

		// Serve static assets
		"/aegis-logo.jpg": Bun.file("src/aegis-logo.jpg"),

		// Serve index.html for all unmatched routes.
		"/*": index,
	},

	development: process.env.NODE_ENV !== "production" && {
		hmr: true,
		console: true,
	},
});

console.log(`🚀 Server running at ${server.url}`);

process.on("SIGINT", () => {
	console.log("Shutting down... (SIGINT)");
	closeDb();
	process.exit(0);
});

process.on("SIGTERM", () => {
	console.log("Shutting down... (SIGTERM)");
	closeDb();
	process.exit(0);
});
