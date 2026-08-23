import { runAudit } from "./index";

let isProcessing = false;
let currentProject: number | null = null;
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
 * L'état vit dans le module, comme le verrou : il ne survit pas au redémarrage,
 * et c'est suffisant — un lot interrompu par un redémarrage n'a pas de résultat
 * à rapporter.
 */
let lastBatch: {
	completed: number;
	total: number;
	finishedAt: string;
} | null = null;

export function getAuditStatus() {
	return {
		isRunning: isProcessing,
		currentProject,
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

export function enqueueGlobalAudit(projectIds: number[]) {
	if (isProcessing) {
		throw new Error("Un audit est déjà en cours");
	}
	isProcessing = true;
	totalInBatch = projectIds.length;
	completedInBatch = 0;

	// Fire and forget pour le batch
	(async () => {
		for (const id of projectIds) {
			currentProject = id;
			try {
				await runAudit(id, false);
			} catch (e) {
				console.error(`Global audit error on project ${id}`, e);
			}
			completedInBatch++;
		}
		// Mémoriser **avant** la remise à zéro : c'est tout l'objet du correctif.
		lastBatch = {
			completed: completedInBatch,
			total: totalInBatch,
			finishedAt: new Date().toISOString(),
		};
		isProcessing = false;
		currentProject = null;
		totalInBatch = 0;
		completedInBatch = 0;
	})().catch(console.error);
}

export async function runSingleAudit(projectId: number, force = false) {
	if (isProcessing) {
		throw new Error("Un audit est déjà en cours, veuillez patienter.");
	}
	isProcessing = true;
	currentProject = projectId;

	try {
		return await runAudit(projectId, force);
	} finally {
		isProcessing = false;
		currentProject = null;
	}
}
