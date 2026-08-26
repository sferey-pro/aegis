import type { GitInfo } from "@/lib/git";
import { getDb } from "./index";

/**
 * Dernier état git connu de chaque projet, **persisté**.
 *
 * L'état git était calculé à la demande et jamais conservé : au rechargement de
 * la page Projets, tout le parc repassait à « non chargé », et la vérification
 * qu'on venait de lancer n'avait laissé aucune trace. Or `behind` — le seul
 * chiffre qui demande une action — ne bouge que sur un `fetch` ou un commit
 * local : le recalculer à chaque affichage coûtait cinq sous-processus par projet
 * pour une valeur qui n'avait pas changé.
 *
 * ⚠️ **C'est un cache daté, pas un état live.** `checked_at` est donc lu et rendu
 * avec l'état : l'interface doit dire *quand* la mesure a été prise. Sans cette
 * date, un `dirty` vieux de trois jours se lirait comme la situation actuelle —
 * et c'est le champ le plus volatile du lot, puisqu'il change à chaque fichier
 * modifié.
 *
 * Table séparée, et non colonnes sur `projects` : c'est de la donnée dérivée,
 * reconstructible d'un clic, alors que `projects` porte la configuration du parc.
 * La cascade la retire avec le projet.
 */

/** État git persisté, avec la date de la mesure. */
export interface StoredGitState {
	git: GitInfo | { isRepo: false };
	checkedAt: string;
}

interface GitStateRow {
	project_id: number;
	state: string;
	checked_at: string;
}

function parseRow(row: GitStateRow): StoredGitState {
	return { git: JSON.parse(row.state), checkedAt: row.checked_at };
}

export function saveGitState(
	projectId: number,
	git: GitInfo | { isRepo: false },
): void {
	getDb()
		.query(`
			INSERT INTO git_states (project_id, state, checked_at)
			VALUES ($id, $state, CURRENT_TIMESTAMP)
			ON CONFLICT(project_id) DO UPDATE SET
				state = $state,
				checked_at = CURRENT_TIMESTAMP
		`)
		.run({ $id: projectId, $state: JSON.stringify(git) });
}

export function getGitState(projectId: number): StoredGitState | null {
	const row = getDb()
		.query(`SELECT * FROM git_states WHERE project_id = ?`)
		.get(projectId) as GitStateRow | null;
	return row ? parseRow(row) : null;
}

/**
 * États de plusieurs projets, indexés par identifiant.
 *
 * Une seule requête : le listing en a besoin pour tout le parc, et un appel par
 * projet reproduirait le N+1 que `getLatestRunsByProjectIds` a supprimé.
 */
export function getGitStates(
	projectIds: number[],
): Record<number, StoredGitState> {
	if (projectIds.length === 0) return {};
	const rows = getDb()
		// SQL construit à partir du **nombre** de paramètres, jamais de leurs
		// valeurs : les identifiants restent liés. `query()` met en cache par texte
		// SQL, donc un parc de taille stable réutilise l'instruction préparée.
		.query(
			`SELECT * FROM git_states WHERE project_id IN (${projectIds.map(() => "?").join(",")})`,
		)
		.all(...projectIds) as GitStateRow[];

	const out: Record<number, StoredGitState> = {};
	for (const row of rows) out[row.project_id] = parseRow(row);
	return out;
}

/** Oublie l'état d'un projet. Utile quand son chemin change. */
export function forgetGitState(projectId: number): void {
	getDb().query(`DELETE FROM git_states WHERE project_id = ?`).run(projectId);
}
