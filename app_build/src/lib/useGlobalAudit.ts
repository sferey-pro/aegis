import { useCallback, useRef, useState } from "react";
import type { Run } from "@/db/runs";
import { apiErrorMessage, fetchJson } from "@/lib/api";
import type { NewCve } from "@/lib/audit";

/**
 * Orchestration de « Tout auditer », côté client.
 *
 * `CONTEXT.md` §2 confie cette orchestration au client — « aucun endpoint
 * batch » — en **parallèle borné à une concurrence max de 4**, sur les projets
 * *visibles*, avec un compte-rendu « trié erreurs d'abord puis projets avec le
 * plus de nouvelles CVE ».
 *
 * ## Ce qui était cassé (N8)
 *
 *  - **Séquentiel.** `for (const p of projets) { await fetch(…) }`. Quinze
 *    projets à ~8 s : deux minutes au lieu de trente secondes.
 *  - **Ni annulation ni délai.** Aucun `AbortController` dans tout le frontend.
 *    Un `npm audit` qui pend bloquait l'application indéfiniment, et le seul
 *    recours était de recharger la page.
 *  - **Compte-rendu non trié.** `newCves` est calculé par le serveur et n'était
 *    jamais lu, alors que c'est le critère de tri que §2 demande.
 *
 * Le périmètre n'est **pas** décidé ici : l'appelant le fournit. C'est ce qui
 * permet à la page Projets de passer sa liste filtrée, là où l'orchestrateur
 * refiltrait `!p.ignored` de son côté et auditait quinze projets quand l'écran
 * n'en montrait trois.
 */

/** Concurrence maximale, fixée par CONTEXT.md §2. */
export const CONCURRENCE_MAX = 4;

/** Réponse de `POST /api/projects/:id/audit`, telle que la route la construit. */
export interface AuditRunResponse {
	success: boolean;
	deduped?: boolean;
	run?: Run | null;
	newCves?: NewCve[];
	error?: string;
}

/** Projet minimal nécessaire à l'orchestration. */
export interface CibleAudit {
	id: number;
	name: string;
}

/** Ce qu'un projet a produit. Exactement une des trois formes. */
export interface ResultatAudit {
	project: CibleAudit;
	/** Réponse du serveur, `null` si l'appel a échoué ou été annulé. */
	reponse: AuditRunResponse | null;
	/** Message d'échec : appel en erreur, ou run persisté en `status: "error"`. */
	erreur: string | null;
	/** L'utilisateur a annulé avant que ce projet ne réponde. */
	annule: boolean;
}

export interface ProgressionAudit {
	/** Projets terminés, annulés compris. */
	faits: number;
	total: number;
	/** Noms des projets en cours, au plus `CONCURRENCE_MAX`. */
	enCours: string[];
}

/**
 * Trie le compte-rendu comme §2 l'exige : **erreurs d'abord**, puis par nombre
 * décroissant de nouvelles CVE.
 *
 * Exporté pour être testable seul : c'est une règle de contrat, pas un détail de
 * rendu, et elle était simplement absente.
 */
export function trierResultats(resultats: ResultatAudit[]): ResultatAudit[] {
	return [...resultats].sort((a, b) => {
		const erreurA = a.erreur ? 1 : 0;
		const erreurB = b.erreur ? 1 : 0;
		if (erreurA !== erreurB) return erreurB - erreurA;
		const nouvA = a.reponse?.newCves?.length ?? 0;
		const nouvB = b.reponse?.newCves?.length ?? 0;
		if (nouvA !== nouvB) return nouvB - nouvA;
		// Départage stable, pour que deux lots identiques rendent le même ordre.
		return a.project.name.localeCompare(b.project.name);
	});
}

export function useGlobalAudit() {
	const [enMarche, setEnMarche] = useState(false);
	const [progression, setProgression] = useState<ProgressionAudit | null>(null);
	const controleur = useRef<AbortController | null>(null);

	/**
	 * Interrompt le lot. Les projets déjà lancés voient leur requête avortée ; les
	 * suivants ne partent pas.
	 *
	 * L'annulation côté client n'arrête pas le sous-processus côté serveur — il
	 * n'y a pas d'endpoint pour cela — mais elle rend l'interface à l'utilisateur,
	 * ce qui était le vrai blocage : sans elle, un `npm audit` qui pend imposait
	 * de recharger la page.
	 */
	const annuler = useCallback(() => {
		controleur.current?.abort();
	}, []);

	/**
	 * Audite `projets` avec un pool de `CONCURRENCE_MAX`, et rend les résultats
	 * triés selon §2.
	 *
	 * Le pool est un simple ensemble de travailleurs se servant dans une file
	 * partagée : la charge se répartit d'elle-même, un projet lent n'immobilise
	 * pas un créneau pour les suivants.
	 */
	const lancer = useCallback(
		async (projets: CibleAudit[]): Promise<ResultatAudit[]> => {
			const ctrl = new AbortController();
			controleur.current = ctrl;
			setEnMarche(true);

			const total = projets.length;
			const restants = [...projets];
			const enCours = new Set<string>();
			const resultats: ResultatAudit[] = [];
			let faits = 0;

			const publier = () =>
				setProgression({ faits, total, enCours: [...enCours] });
			publier();

			const travailleur = async () => {
				for (;;) {
					const p = restants.shift();
					if (!p) return;

					// Annulé pendant l'attente : les projets restants ne partent pas, mais
					// ils figurent au compte-rendu comme annulés — un projet absent se
					// lirait comme un projet sain.
					if (ctrl.signal.aborted) {
						resultats.push({
							project: p,
							reponse: null,
							erreur: null,
							annule: true,
						});
						faits++;
						publier();
						continue;
					}

					enCours.add(p.name);
					publier();
					try {
						const reponse = await fetchJson<AuditRunResponse>(
							`/api/projects/${p.id}/audit`,
							{ method: "POST", signal: ctrl.signal },
						);
						resultats.push({
							project: p,
							reponse,
							// Un run persisté en erreur a des compteurs à zéro : c'est un
							// échec, pas un projet sain.
							erreur:
								reponse.run?.status === "error"
									? (reponse.run.error ?? "audit en erreur")
									: null,
							annule: false,
						});
					} catch (err) {
						const avorte =
							ctrl.signal.aborted ||
							(err instanceof Error && err.name === "AbortError");
						resultats.push({
							project: p,
							reponse: null,
							erreur: avorte ? null : apiErrorMessage(err),
							annule: avorte,
						});
					} finally {
						enCours.delete(p.name);
						faits++;
						publier();
					}
				}
			};

			try {
				await Promise.all(
					Array.from({ length: Math.min(CONCURRENCE_MAX, total) }).map(() =>
						travailleur(),
					),
				);
				return trierResultats(resultats);
			} finally {
				setEnMarche(false);
				setProgression(null);
				controleur.current = null;
			}
		},
		[],
	);

	return { enMarche, progression, lancer, annuler };
}
