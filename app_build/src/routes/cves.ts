import { errorMessage } from "@/lib/utils";
import { buildCveGroups } from "../lib/aggregator";
import { advisorySyncBodySchema } from "../lib/schemas";
import { parseBody } from "../lib/validate";

export const cvesRoutes = {
	"/api/cves": {
		async GET() {
			return Response.json(buildCveGroups());
		},
	},
	"/api/advisories/sync": {
		async POST(req: Request) {
			// N35 : le corps était lu à nu, donc un JSON malformé sortait en 500 au
			// lieu du 400 « JSON invalide » servi partout ailleurs.
			const { data, response } = await parseBody(req, advisorySyncBodySchema);
			if (!data) return response;

			try {
				const { cve, link } = data;
				const { syncAdvisory } = await import("../lib/github");
				const advisory = await syncAdvisory(cve, link);
				return Response.json({ success: !!advisory, advisory });
			} catch (e: unknown) {
				return Response.json(
					{ success: false, error: errorMessage(e) },
					{ status: 500 },
				);
			}
		},
	},

	"/api/advisories/sync-all": {
		async POST() {
			// Le verrou vit avec la fonction qu'il protège (`lib/advisory-sync`), pas
			// ici : le planificateur périodique doit partager le même, sinon un clic
			// pendant une passe planifiée doublerait les appels réseau sur la
			// ressource la plus rare du connecteur — le quota.
			const { syncAllAdvisories, SyncEnCoursError } = await import(
				"../lib/advisory-sync"
			);
			try {
				const result = await syncAllAdvisories();
				return Response.json({ success: true, ...result });
			} catch (e: unknown) {
				if (e instanceof SyncEnCoursError) {
					return Response.json(
						{ success: false, error: e.message },
						{ status: 409 },
					);
				}
				return Response.json(
					{ success: false, error: errorMessage(e) },
					{ status: 500 },
				);
			}
		},
	},

	"/api/advisories/cache": {
		async DELETE() {
			try {
				// La base d'avis est un fichier séparé : c'est là qu'il faut purger.
				const { getAdvisoryDb } = await import("../db/advisories");
				getAdvisoryDb().query("DELETE FROM advisory_cache").run();
				return Response.json({ success: true });
			} catch (e: unknown) {
				return Response.json(
					{ success: false, error: errorMessage(e) },
					{ status: 500 },
				);
			}
		},
	},
};
