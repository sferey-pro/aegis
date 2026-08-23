import { serve } from "bun";
import { closeDb, getDb } from "./db";
import { closeAdvisoryDb } from "./db/advisories";
import index from "./index.html";
import {
	startAdvisoryScheduler,
	stopAdvisoryScheduler,
} from "./lib/advisory-scheduler";
import { closeConsoleClients } from "./lib/console";
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
	port: process.env.AEGIS_PORT ? parseInt(process.env.AEGIS_PORT, 10) : 3001,
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
		"/aegis-logo.jpg": {
			GET() {
				return new Response(Bun.file("src/aegis-logo.jpg"));
			},
		},

		/**
		 * N36 : tout ce qui commence par `/api/` et n'a pas été capté au-dessus est
		 * une erreur d'appel, pas une navigation client. Sans cette route, un
		 * chemin inconnu — ou une route atteinte avec une méthode qu'elle n'expose
		 * pas — tombait dans le fourre-tout `/*` et recevait `index.html` en 200.
		 * Le client échouait alors à son `res.json()` sur « Unexpected token < »,
		 * sans indice sur la cause.
		 *
		 * Doit rester **avant** `"/*"` : l'ordre de déclaration décide.
		 */
		"/api/*": {
			GET: () => Response.json({ error: "Route inconnue" }, { status: 404 }),
			POST: () => Response.json({ error: "Route inconnue" }, { status: 404 }),
			PUT: () => Response.json({ error: "Route inconnue" }, { status: 404 }),
			DELETE: () => Response.json({ error: "Route inconnue" }, { status: 404 }),
			PATCH: () => Response.json({ error: "Route inconnue" }, { status: 404 }),
		},

		// Serve index.html for all unmatched routes.
		"/*": index,
	},

	development: process.env.NODE_ENV !== "production" && {
		hmr: true,
		console: true,
	},

	error(err) {
		console.error("Unhandled Route Error:", err);
		return Response.json(
			{ error: "Internal Server Error", details: err.message },
			{ status: 500 },
		);
	},
});

console.log(`🚀 Server running at ${server.url}`);

/**
 * Rafraîchissement périodique des avis GHSA.
 *
 * Démarré après `serve()` : le serveur doit répondre avant qu'une tâche de fond
 * ne commence. La première passe est différée d'une minute, ce qui évite qu'un
 * rechargement à chaud n'en déclenche une à chaque sauvegarde de fichier.
 *
 * ⚠️ Non démarré sous test : la suite ne doit émettre aucun appel réseau, et
 * `bun test` partage un process — un minuteur survivrait d'un fichier à l'autre.
 */
if (process.env.NODE_ENV !== "test" && !process.env.AEGIS_TEST_NO_DOM) {
	startAdvisoryScheduler();
}

/**
 * Arrêt propre.
 *
 * L'ordre compte : fermer d'abord les flux SSE, ensuite les bases. Quitter sans
 * fermer les flux tranchait chaque connexion en plein chunk, et le navigateur
 * journalisait `ERR_INCOMPLETE_CHUNKED_ENCODING` à chaque redémarrage.
 */
function arretPropre(signal: string): void {
	console.log(`Shutting down... (${signal})`);
	stopAdvisoryScheduler();
	closeConsoleClients();
	closeAdvisoryDb();
	closeDb();
	process.exit(0);
}

process.on("SIGINT", () => arretPropre("SIGINT"));
process.on("SIGTERM", () => arretPropre("SIGTERM"));
