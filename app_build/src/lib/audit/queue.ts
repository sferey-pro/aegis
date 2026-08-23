import { runAudit } from "./index";

/**
 * Sérialisation des audits — **par projet**, plus globalement.
 *
 * ## Ce qui était cassé (N8)
 *
 * Un unique drapeau de module autorisait **un audit à la fois, quel que soit le
 * projet**. Or `CONTEXT.md` §2 prescrit une orchestration côté client en
 * « parallèle borné à une concurrence max de 4 ». Un client conforme au contrat
 * voyait donc trois audits sur quatre échouer systématiquement — et le refus
 * sortait en 500, indistinguable d'un plantage.
 *
 * C'était le résiduel de C8 : le verrou avait été posé pour protéger un endpoint
 * batch que la spécification interdit, et il bloquait le mode d'orchestration
 * qu'elle prescrit.
 *
 * ## Ce que ce module garantit maintenant
 *
 *  - **Un audit à la fois par projet.** Deux audits simultanés du même projet
 *    écriraient deux runs pour un seul état du lockfile, et se dédupliqueraient
 *    l'un contre l'autre de façon indéterminée.
 *  - **Quatre au plus, tous projets confondus.** Le plafond de §2 est ainsi
 *    *appliqué* et non seulement demandé : un client qui l'ignore est refusé au
 *    lieu de saturer la machine en `npm audit` concurrents.
 *  - **Un seul lot global à la fois**, qui emprunte le même pool.
 *
 * Le refus est un `AuditEnCoursError`, que les routes traduisent en **409** : un
 * conflit temporaire, pas une panne.
 */

/** Concurrence maximale, tous projets confondus (CONTEXT.md §2). */
export const MAX_AUDITS_SIMULTANES = 4;

/**
 * Refus de concurrence, distinct d'une erreur d'audit.
 *
 * Une classe plutôt qu'un message à reconnaître : les routes doivent répondre
 * 409 sans faire de correspondance sur le texte, qui est destiné à l'utilisateur
 * et peut être reformulé.
 */
export class AuditEnCoursError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AuditEnCoursError";
	}
}

/** Audits en vol, par identifiant de projet. */
const enVol = new Map<number, Promise<unknown>>();

/** Un lot global est en cours. Distinct des audits unitaires. */
let lotEnCours = false;
let totalInBatch = 0;
let completedInBatch = 0;

/**
 * Dernier lot terminé, conservé après sa fin (N39).
 *
 * `progress` et `total` étaient remis à zéro dès la fin du lot : un client qui
 * sondait après le dernier projet lisait `0/1`, indistinguable d'un état au
 * repos. Impossible de savoir, depuis l'API, si un lot venait de se terminer ou
 * n'avait jamais eu lieu — donc impossible d'afficher un compte-rendu final sans
 * sonder assez vite pour attraper le lot en vol.
 *
 * L'état vit dans le module, comme les verrous : il ne survit pas au
 * redémarrage, et c'est suffisant — un lot interrompu par un redémarrage n'a pas
 * de résultat à rapporter.
 */
let lastBatch: {
	completed: number;
	total: number;
	finishedAt: string;
} | null = null;

export function getAuditStatus() {
	const enCoursIds = [...enVol.keys()];
	return {
		/** Un audit, unitaire ou en lot, est en train d'écrire dans la base. */
		isRunning: lotEnCours || enCoursIds.length > 0,
		/**
		 * Un des projets en cours. Conservé pour les appelants existants ; avec la
		 * concurrence, `runningProjects` est la vue complète.
		 */
		currentProject: enCoursIds[0] ?? null,
		/** Tous les projets en cours d'audit. */
		runningProjects: enCoursIds,
		progress: completedInBatch,
		total: totalInBatch || 1,
		/** Projets traités par le dernier lot terminé, `null` si aucun. */
		lastCompleted: lastBatch?.completed ?? null,
		/** Taille du dernier lot terminé. */
		lastTotal: lastBatch?.total ?? null,
		/** Fin du dernier lot, en ISO. Distingue « terminé » de « jamais lancé ». */
		lastFinishedAt: lastBatch?.finishedAt ?? null,
	};
}

/**
 * Oublie le bilan du dernier lot.
 *
 * Appelé par la remise à zéro de la configuration : un bilan qui survit à la
 * suppression des projets qu'il décomptait n'a plus de sens, et l'écran
 * l'afficherait comme si le lot venait d'avoir lieu sur le parc actuel.
 *
 * Sert accessoirement à l'isolation des tests — la file est un état de module, et
 * `bun test` partage un seul process.
 */
export function resetAuditHistory(): void {
	lastBatch = null;
}

/**
 * Audite un projet, en refusant les doublons et au-delà du plafond.
 *
 * L'ordre des deux contrôles importe : le même projet déjà en vol donne un
 * message qui nomme la cause exacte, alors que le plafond est une condition de
 * charge sur laquelle l'utilisateur peut agir en attendant.
 */
export async function runSingleAudit(projectId: number, force = false) {
	if (enVol.has(projectId)) {
		throw new AuditEnCoursError(
			"Un audit de ce projet est déjà en cours, veuillez patienter.",
		);
	}
	if (enVol.size >= MAX_AUDITS_SIMULTANES) {
		throw new AuditEnCoursError(
			`Trop d'audits simultanés (${MAX_AUDITS_SIMULTANES} au maximum), veuillez patienter.`,
		);
	}

	const promesse = runAudit(projectId, force);
	// Enregistré avant tout `await` : deux appels dans le même tour de boucle
	// doivent voir le verrou l'un de l'autre.
	enVol.set(projectId, promesse);
	try {
		return await promesse;
	} finally {
		enVol.delete(projectId);
	}
}

/**
 * Lance un lot d'audits, en fond, avec la concurrence de §2.
 *
 * Reste **fire-and-forget** : la progression se sonde via `/api/audit/status`.
 * Cet endpoint batch n'est pas prévu par le contrat — §2 confie l'orchestration
 * au client — mais il existe, et le laisser séquentiel n'aurait servi personne.
 *
 * Un projet déjà en vol est **sauté**, pas attendu : le lot ne doit pas se
 * bloquer sur un audit unitaire lancé en parallèle, et le run de cet audit
 * couvrira le projet de toute façon.
 */
export function enqueueGlobalAudit(projectIds: number[]) {
	if (lotEnCours) {
		throw new AuditEnCoursError("Un audit est déjà en cours");
	}
	lotEnCours = true;
	totalInBatch = projectIds.length;
	completedInBatch = 0;

	(async () => {
		const restants = [...projectIds];

		const travailleur = async () => {
			for (;;) {
				const id = restants.shift();
				if (id === undefined) return;
				try {
					await runSingleAudit(id);
				} catch (e) {
					// Un projet en échec — ou déjà en vol — ne doit pas interrompre le
					// lot. Sans ce filet, un projet supprimé du disque empêchait l'audit
					// de tous les suivants.
					console.error(`Global audit error on project ${id}`, e);
				}
				completedInBatch++;
			}
		};

		await Promise.all(
			Array.from({
				length: Math.min(MAX_AUDITS_SIMULTANES, projectIds.length),
			}).map(() => travailleur()),
		);

		// Mémoriser **avant** la remise à zéro : c'est tout l'objet du correctif N39.
		lastBatch = {
			completed: completedInBatch,
			total: totalInBatch,
			finishedAt: new Date().toISOString(),
		};
		lotEnCours = false;
		totalInBatch = 0;
		completedInBatch = 0;
	})().catch(console.error);
}
