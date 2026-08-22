import { getDb } from "./index";
import { SECRET_SETTING_KEYS } from "./settings";

/**
 * Réglages conservés par une remise à zéro.
 *
 * Seule la clé GHSA — le jeton GitHub qui sert à interroger la base d'avis —
 * survit. Elle est coûteuse à régénérer côté GitHub, et la reperdre à chaque
 * remise à zéro dissuaderait d'en faire une. Tout le reste est de la
 * configuration : URL Jira, identifiants, seuils, état de quota.
 */
const REGLAGES_CONSERVES = ["GITHUB_TOKEN"] as const;

/** Nombre de lignes retirées, par table. */
export interface ResetCounts {
	projects: number;
	runs: number;
	annotations: number;
	tickets: number;
	occurrences: number;
	tags: number;
	prompts: number;
	reports: number;
	settings: number;
}

/**
 * Vide la configuration de l'application, pour repartir d'un import propre.
 *
 * **Ce qui est supprimé** : les projets et tout ce qui en dépend (runs,
 * annotations, tickets, occurrences — par cascade de clé étrangère), le
 * catalogue de tags, la bibliothèque de prompts, les compte-rendus d'audit, et
 * tous les réglages sauf la clé GHSA.
 *
 * **Ce qui est conservé** :
 *  - la **clé GHSA** (`GITHUB_TOKEN`) ;
 *  - le **cache d'avis** (`advisory_cache`), qui n'est pas de la configuration
 *    mais un cache de données publiques, coûteux à reconstruire en quota et sans
 *    effet sur un import de projets. Un bouton dédié existe pour le vider
 *    séparément (`DELETE /api/advisories/cache`).
 *
 * **Ce qui n'est jamais touché** : les projets **sur le disque**. Cette fonction
 * n'écrit que dans SQLite ; aucun chemin du système de fichiers n'est lu ni
 * supprimé. C'est la garantie qui compte le plus ici, et elle est vérifiée par un
 * test.
 *
 * Le tout dans **une seule transaction** : une remise à zéro à moitié appliquée
 * laisserait un état plus difficile à comprendre que celui qu'on voulait quitter.
 */
export function resetConfiguration(): ResetCounts {
	const db = getDb();

	const compte = (sql: string, ...params: unknown[]): number => {
		const row = db.query(sql).get(...(params as [])) as { n: number };
		return row.n;
	};

	const marques = REGLAGES_CONSERVES.map(() => "?").join(", ");

	// Comptés avant suppression : après, il n'y a plus rien à compter.
	const counts: ResetCounts = {
		projects: compte("SELECT COUNT(*) AS n FROM projects"),
		runs: compte("SELECT COUNT(*) AS n FROM runs"),
		annotations: compte("SELECT COUNT(*) AS n FROM annotations"),
		tickets: compte("SELECT COUNT(*) AS n FROM tickets"),
		occurrences: compte("SELECT COUNT(*) AS n FROM cve_occurrences"),
		tags: compte("SELECT COUNT(*) AS n FROM tags"),
		prompts: compte("SELECT COUNT(*) AS n FROM prompts"),
		reports: compte("SELECT COUNT(*) AS n FROM reports"),
		settings: compte(
			`SELECT COUNT(*) AS n FROM settings WHERE key NOT IN (${marques})`,
			...REGLAGES_CONSERVES,
		),
	};

	db.transaction(() => {
		// `projects` d'abord : les quatre tables dépendantes partent en cascade.
		db.query("DELETE FROM projects").run();
		db.query("DELETE FROM tags").run();
		db.query("DELETE FROM prompts").run();
		db.query("DELETE FROM reports").run();
		db.query(`DELETE FROM settings WHERE key NOT IN (${marques})`).run(
			...REGLAGES_CONSERVES,
		);
	})();

	return counts;
}

/** Clés de réglages conservées, exposées pour l'affichage et les tests. */
export function preservedSettingKeys(): readonly string[] {
	return REGLAGES_CONSERVES;
}

/**
 * Vérifie que la clé GHSA fait bien partie des secrets connus.
 *
 * Garde-fou de cohérence : si `SECRET_SETTING_KEYS` évoluait sans que cette liste
 * suive, une remise à zéro effacerait un secret qu'elle croyait conserver.
 */
export function ghsaKeyIsPreserved(): boolean {
	return REGLAGES_CONSERVES.every((k) =>
		(SECRET_SETTING_KEYS as readonly string[]).includes(k),
	);
}
