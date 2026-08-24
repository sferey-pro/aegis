import { useCallback, useRef, useState } from "react";
import { apiErrorMessage, fetchJson } from "@/lib/api";
import {
	type BatchOutcome,
	type BatchProgress,
	type BatchTarget,
	runBatch,
} from "@/lib/batch";
import type { GitInfo } from "@/lib/git";

/**
 * Orchestration de « Vérifier les mises à jour Git », côté client.
 *
 * Même mécanisme que « Tout auditer » (§2) : même pool, annulable, compte-rendu
 * portant les projets annulés — mais **un dépôt à la fois** (§5). La boucle précédente était `for (const p of …)
 * { await fetch(…) }` avec un `catch` qui journalisait dans la console du
 * navigateur — donc séquentielle sur quinze dépôts de réseau, non annulable, et
 * muette sur ses échecs. Exactement les défauts que N8 avait corrigés côté
 * audit, restés en place dans la fonctionnalité voisine.
 *
 * **`fetch` seulement, jamais `pull`.** §5 tient à ce que les deux actions
 * restent explicites : `git fetch` ne touche ni à l'arbre ni à la branche, alors
 * qu'un `pull --ff-only` en masse modifierait quinze copies de travail d'un
 * clic. Le `pull` reste une action par projet.
 *
 * Le périmètre n'est **pas** décidé ici : l'appelant fournit les projets
 * *visibles*. Le handler d'origine refiltrait de son côté (`!p.ignored &&
 * p.git?.isRepo`) et synchronisait donc quinze dépôts quand l'écran, filtré par
 * tag, n'en montrait trois — la même erreur de périmètre que N8.
 */

/** Réponse de `POST /api/projects/:id/git-fetch`, telle que la route la construit. */
export interface GitSyncResponse {
	ok: boolean;
	log: string;
	git: GitInfo;
}

export type GitSyncTarget = BatchTarget;
export type GitSyncOutcome = BatchOutcome<GitSyncResponse>;

export interface GitSyncProgress {
	done: number;
	total: number;
	running: string[];
}

/**
 * Trie le compte-rendu : **échecs d'abord**, puis par nombre décroissant de
 * commits de retard.
 *
 * `behind` est à la synchro ce que `newCves` est à l'audit : ce qui demande une
 * action. Un dépôt qui a pris dix commits de retard mérite d'être vu avant celui
 * qui était déjà à jour. Départage stable par nom, pour que deux lots identiques
 * rendent le même ordre.
 */
export function sortGitOutcomes(outcomes: GitSyncOutcome[]): GitSyncOutcome[] {
	return [...outcomes].sort((a, b) => {
		const errA = a.error ? 1 : 0;
		const errB = b.error ? 1 : 0;
		if (errA !== errB) return errB - errA;
		const behindA = a.value?.git?.behind ?? 0;
		const behindB = b.value?.git?.behind ?? 0;
		if (behindA !== behindB) return behindB - behindA;
		return a.project.name.localeCompare(b.project.name);
	});
}

export function useGlobalGitSync() {
	const [running, setRunning] = useState(false);
	const [progress, setProgress] = useState<GitSyncProgress | null>(null);
	const controller = useRef<AbortController | null>(null);

	/** Interrompt le lot : les requêtes en vol sont avortées, les suivantes ne partent pas. */
	const cancel = useCallback(() => {
		controller.current?.abort();
	}, []);

	/**
	 * `onSettled` est appelé projet par projet, sans attendre la fin du lot :
	 * c'est ce qui permet à une carte de se mettre à jour dès que *son* `git
	 * fetch` répond, au lieu de voir tout l'écran changer d'un coup à la fin.
	 */
	const start = useCallback(
		async (
			targets: GitSyncTarget[],
			onSettled?: (outcome: GitSyncOutcome) => void,
		): Promise<GitSyncOutcome[]> => {
			const ctrl = new AbortController();
			controller.current = ctrl;
			setRunning(true);

			try {
				const outcomes = await runBatch<GitSyncResponse>(
					targets,
					(target, signal) =>
						fetchJson<GitSyncResponse>(`/api/projects/${target.id}/git-fetch`, {
							method: "POST",
							signal,
						}),
					{
						signal: ctrl.signal,
						onProgress: (p: BatchProgress) => setProgress(p),
						describeError: apiErrorMessage,
						onSettled,
						// **Un dépôt à la fois.** Le pool de 4 vaut pour l'audit, où
						// chaque projet lit son propre lockfile ; ici les quatre `git
						// fetch` sortent par le même lien réseau et la même
						// authentification, et rien ne prouve que les paralléliser
						// raccourcisse le lot — alors que la sortie de la console, elle,
						// devient illisible : quatre dépôts y écrivent en même temps.
						concurrency: 1,
						// `git fetch` peut sortir non nul sur un 200 : dépôt sans amont,
						// authentification refusée, hôte injoignable. Le journal porte la
						// cause, et c'est lui qu'il faut montrer — l'ancienne boucle le
						// jetait.
						failureOf: (reponse) =>
							reponse.ok ? null : reponse.log || "git fetch en échec",
					},
				);
				return sortGitOutcomes(outcomes);
			} finally {
				setRunning(false);
				setProgress(null);
				controller.current = null;
			}
		},
		[],
	);

	return { running, progress, start, cancel };
}
