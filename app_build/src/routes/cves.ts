import { errorMessage } from "@/lib/utils";
import { buildCveGroups } from "../lib/aggregator";
import { advisorySyncBodySchema } from "../lib/schemas";
import { parseBody } from "../lib/validate";

/**
 * Une passe d'enrichissement à la fois.
 *
 * La passe est longue — un appel réseau par avis manquant — et l'écran n'a qu'un
 * bouton : deux clics rapides lanceraient deux boucles qui se disputeraient le
 * quota GitHub et écriraient les mêmes lignes. Un drapeau de module suffit :
 * l'état ne survit pas au process, et il n'y a rien à reprendre après un
 * redémarrage.
 */
let enrichissementEnCours = false;

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
			if (enrichissementEnCours) {
				return Response.json(
					{
						success: false,
						error: "Un enrichissement GHSA est déjà en cours.",
					},
					{ status: 409 },
				);
			}

			enrichissementEnCours = true;
			try {
				const { syncAllAdvisories } = await import("../lib/advisory-sync");
				const result = await syncAllAdvisories();
				return Response.json({ success: true, ...result });
			} catch (e: unknown) {
				return Response.json(
					{ success: false, error: errorMessage(e) },
					{ status: 500 },
				);
			} finally {
				enrichissementEnCours = false;
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
