import type { BunRequest } from "bun";
import { deleteRun } from "../db/runs";

/**
 * Suppression unitaire d'un run.
 *
 * `deleteRun` existait, était testée, et **aucune route ne l'exposait** : un run
 * pollué — une sortie d'outil tronquée, un audit lancé sur un dossier à moitié
 * copié — restait l'état courant du projet jusqu'au prochain audit. Il comptait
 * donc dans l'agrégation CVE, dans les statistiques et dans la série globale, sans
 * aucun moyen de le retirer autrement qu'en réauditant (écart de contrat relevé
 * par N31).
 *
 * **Sans contrainte, et c'est voulu.** Le dernier run étant *recalculé* à chaque
 * lecture (§4), supprimer le plus récent fait du précédent l'état courant, et
 * supprimer le dernier restant laisse le projet sans état. Aucune de ces deux
 * situations n'est une erreur : ce sont les issues normales de l'opération, et
 * elles sont déjà gérées partout en aval.
 */
export const runsRoutes = {
	"/api/runs/:id": {
		async DELETE(req: BunRequest<"/api/runs/:id">) {
			const id = Number.parseInt(req.params.id, 10);

			// Un identifiant non numérique donnerait `NaN`, que SQLite ne trouve
			// jamais : la réponse serait un 404 correct mais pour la mauvaise raison.
			// Autant le dire.
			if (!Number.isInteger(id)) {
				return Response.json(
					{ error: "Identifiant de run invalide" },
					{ status: 400 },
				);
			}

			// 404 sur un identifiant inconnu, pas un succès : l'interface doit
			// distinguer « supprimé » de « n'existait pas », sinon elle masque une
			// désynchronisation entre la liste affichée et l'état réel (N37).
			if (!deleteRun(id)) {
				return Response.json({ error: "Run introuvable" }, { status: 404 });
			}

			return new Response(null, { status: 204 });
		},
	},
};
