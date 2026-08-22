import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

/**
 * Base séparée pour tout ce qui concerne les avis GitHub.
 *
 * **Pourquoi un second fichier.** La remise à zéro de la configuration doit
 * conserver deux choses : le cache d'avis, coûteux à reconstruire en quota, et la
 * clé GHSA, coûteuse à régénérer. Tant qu'elles vivaient dans le fichier
 * principal, le reset devait **énumérer** les tables à vider — et une table
 * ajoutée plus tard y aurait survécu en silence, sans que rien ne le signale.
 *
 * En les isolant, la remise à zéro devient la suppression du fichier principal :
 * il n'y a plus de liste à tenir à jour, donc plus rien à oublier. La propriété
 * est structurelle, pas déclarative.
 *
 * **Ce que ce fichier contient** : le cache d'avis, la clé GHSA, et l'état du
 * quota GitHub. Autrement dit tout ce qui relève du dialogue avec GitHub — un
 * concerne unique, des données publiques ou une identité d'accès, rien de la
 * configuration du parc.
 *
 * **Chemin** : dérivé de `DB_PATH` plutôt que configuré séparément, pour que les
 * deux fichiers restent côte à côte et qu'une base de test reste isolée.
 * `ADVISORY_DB_PATH` permet de le surcharger.
 */

let db: Database | null = null;

/** Chemin du fichier d'avis, dérivé de celui de la base principale. */
export function advisoryDbPath(): string {
	if (process.env.ADVISORY_DB_PATH) return process.env.ADVISORY_DB_PATH;
	const principal = process.env.DB_PATH || "audit.sqlite";
	return principal.replace(/(\.sqlite|\.db)?$/, "-advisories.sqlite");
}

export function getAdvisoryDb(): Database {
	if (!db) {
		db = new Database(advisoryDbPath(), { create: true });
		db.exec("PRAGMA journal_mode = WAL;");
		db.exec("PRAGMA synchronous = NORMAL;");
		db.exec("PRAGMA wal_autocheckpoint = 500;");
		db.exec("PRAGMA busy_timeout = 5000;");
		initAdvisoryDb(db);
		migrerDepuisBasePrincipale(db);
	}
	return db;
}

export function closeAdvisoryDb(): void {
	if (db) {
		db.close();
		db = null;
	}
}

function initAdvisoryDb(database: Database): void {
	database.exec(`
    CREATE TABLE IF NOT EXISTS advisory_cache (
      id TEXT PRIMARY KEY,
      severity TEXT,
      fixes JSON,
      html_url TEXT,
      cvss_vector TEXT,
      published_at DATETIME,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS github_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

/** Clés de configuration GitHub, désormais hors de la base principale. */
export const GITHUB_CONFIG_KEYS = [
	"GITHUB_TOKEN",
	"GITHUB_RL_LIMIT",
	"GITHUB_RL_REMAINING",
	"GITHUB_RL_RESET",
] as const;

export function getGithubConfig(key: string, defaultValue = ""): string {
	const row = getAdvisoryDb()
		.query("SELECT value FROM github_config WHERE key = ?")
		.get(key) as { value: string } | undefined;
	return row ? row.value : defaultValue;
}

export function setGithubConfig(key: string, value: string): void {
	getAdvisoryDb()
		.query(`
			INSERT INTO github_config (key, value) VALUES ($key, $value)
			ON CONFLICT(key) DO UPDATE SET value = $value
		`)
		.run({ $key: key, $value: value });
}

export function getAllGithubConfig(): Record<string, string> {
	const rows = getAdvisoryDb()
		.query("SELECT key, value FROM github_config")
		.all() as { key: string; value: string }[];
	const out: Record<string, string> = {};
	for (const r of rows) out[r.key] = r.value;
	return out;
}

/**
 * Reprend le cache et la configuration GitHub restés dans la base principale.
 *
 * Migration ponctuelle, idempotente, exécutée à la première ouverture : les
 * instances existantes ne doivent pas perdre leur cache — c'est précisément ce
 * que la séparation cherche à protéger. Les lignes reprises sont supprimées de la
 * base principale, sans quoi la table y resterait et le prochain reset la
 * viderait sans que personne ne s'en aperçoive.
 *
 * `ATTACH` plutôt qu'une lecture ligne à ligne : la copie reste une seule
 * transaction SQLite, donc atomique.
 */
function migrerDepuisBasePrincipale(database: Database): void {
	const principal = process.env.DB_PATH || "audit.sqlite";
	if (!existsSync(principal)) return;

	database.exec(
		`ATTACH DATABASE '${principal.replace(/'/g, "''")}' AS principal`,
	);
	try {
		const aTable = (nom: string): boolean =>
			(
				database
					.query(
						"SELECT COUNT(*) AS n FROM principal.sqlite_master WHERE type = 'table' AND name = ?",
					)
					.get(nom) as { n: number }
			).n > 0;

		if (aTable("advisory_cache")) {
			database.exec(`
				INSERT OR IGNORE INTO advisory_cache
					(id, severity, fixes, html_url, cvss_vector, published_at, fetched_at)
				SELECT id, severity, fixes, html_url, cvss_vector, published_at, fetched_at
				FROM principal.advisory_cache
			`);
			database.exec("DROP TABLE principal.advisory_cache");
		}

		if (aTable("settings")) {
			const marques = GITHUB_CONFIG_KEYS.map(() => "?").join(", ");
			database
				.query(`
					INSERT OR IGNORE INTO github_config (key, value)
					SELECT key, value FROM principal.settings WHERE key IN (${marques})
				`)
				.run(...GITHUB_CONFIG_KEYS);
			database
				.query(`DELETE FROM principal.settings WHERE key IN (${marques})`)
				.run(...GITHUB_CONFIG_KEYS);
		}
	} finally {
		database.exec("DETACH DATABASE principal");
	}
}
