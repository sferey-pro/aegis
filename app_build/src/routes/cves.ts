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

	"/api/github/rate-limit": {
		/**
		 * État du quota GitHub, relu à la source.
		 *
		 * Appelée par l'écran Réglages à son affichage, et par lui seul :
		 * `GET /rate_limit` ne consomme pas de quota, mais il consomme du réseau, et
		 * l'invariant §15 veut que ce réseau soit demandé par un humain. Ni le
		 * planificateur ni le chemin d'audit ne passent ici.
		 *
		 * Sur échec, **502 et rien d'écrit** : l'écran garde la valeur persistée,
		 * datée, plutôt que d'afficher un quota inventé.
		 */
		async GET() {
			const { fetchRateLimit } = await import("../lib/github");
			const state = await fetchRateLimit();
			if (!state) {
				return Response.json(
					{ error: "Quota GitHub indisponible" },
					{ status: 502 },
				);
			}
			return Response.json(state);
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
