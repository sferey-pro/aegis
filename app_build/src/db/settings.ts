import { getAllGithubConfig } from "./advisories";
import { getDb, runInTransaction } from "./index";

export function getSetting(key: string, defaultValue = ""): string {
	const db = getDb();
	const row = db.query(`SELECT value FROM settings WHERE key = ?`).get(key) as
		| { value: string }
		| undefined;
	return row ? row.value : defaultValue;
}

export function setSetting(key: string, value: string): void {
	const db = getDb();
	db.query(`
    INSERT INTO settings (key, value) 
    VALUES ($key, $value)
    ON CONFLICT(key) DO UPDATE SET value = $value
  `).run({ $key: key, $value: value });
}

export function getAllSettings(): Record<string, string> {
	const db = getDb();
	const rows = db.query(`SELECT key, value FROM settings`).all() as {
		key: string;
		value: string;
	}[];
	return rows.reduce(
		(acc, row) => {
			acc[row.key] = row.value;
			return acc;
		},
		{} as Record<string, string>,
	);
}

export function setAllSettings(settings: Record<string, string>): void {
	const db = getDb();
	// `query` et non `prepare` : `query` met l'instruction en cache sur la
	// connexion, `prepare` en crée une nouvelle à chaque appel et laisse à
	// l'appelant le soin de la finaliser — ce qui n'était pas fait. Une
	// instruction non finalisée retient un verrou de lecture sur le fichier :
	// inoffensif tant que rien n'englobe l'appel, mais dès que cette fonction est
	// appelée depuis une transaction extérieure (import de configuration), le
	// verrou d'écriture n'est plus jamais relâché et la base reste bloquée jusqu'à
	// la fin du process. Diagnostiqué sur un `SQLITE_BUSY` au `PRAGMA
	// journal_mode` de la connexion suivante.
	const stmt = db.query<unknown, { $key: string; $value: string }>(`
    INSERT INTO settings (key, value) 
    VALUES ($key, $value)
    ON CONFLICT(key) DO UPDATE SET value = $value
  `);
	runInTransaction(() => {
		for (const [key, value] of Object.entries(settings)) {
			if (value !== undefined && value !== null) {
				stmt.run({ $key: key, $value: value.toString() });
			}
		}
	});
}

/**
 * Clés dont la valeur est un secret : elles ne sortent **jamais** de l'API.
 * Elles s'écrivent, elles ne se lisent pas.
 */
export const SECRET_SETTING_KEYS = ["GITHUB_TOKEN", "JIRA_API_KEY"] as const;

/**
 * Clés lisibles par le client. **Liste blanche, et non liste noire** : c'est le
 * défaut de la correction C2, qui masquait deux clés nommées et laissait donc
 * fuir par défaut tout secret ajouté ensuite. Ici, une nouvelle clé n'est pas
 * exposée tant qu'elle n'est pas inscrite ci-dessous.
 */
export const PUBLIC_SETTING_KEYS = [
	"AUDIT_MAX_AGE_HOURS",
	"CRITICAL_ONLY",
	"DISABLE_CONSOLE",
	"JIRA_BASE_URL",
	"JIRA_USER",
	"JIRA_PROJECT",
	"JIRA_COMPONENT",
	"JIRA_ISSUE_TYPE",
	"JIRA_PARENT_EPIC",
	"GITHUB_RL_LIMIT",
	"GITHUB_RL_REMAINING",
	"GITHUB_RL_RESET",
	"ADVISORY_SYNC_LAST_AT",
	"ADVISORY_SYNC_LAST_FETCHED",
] as const;

/**
 * Réglages destinés au client : les clés de la liste blanche telles quelles,
 * plus un booléen `<CLÉ>_CONFIGURED` par secret — de quoi afficher « configuré »
 * dans le formulaire sans jamais transporter la valeur (CONTEXT.md §12, N5).
 */
export function getPublicSettings(): Record<string, string> {
	// La configuration GitHub vit dans la base d'avis, pour survivre à une remise
	// à zéro. L'écran Réglages n'a pas à connaître ce découpage : il lit un seul
	// objet, recomposé ici.
	const tout = { ...getAllSettings(), ...getAllGithubConfig() };
	const sortie: Record<string, string> = {};

	for (const cle of PUBLIC_SETTING_KEYS) {
		if (tout[cle] !== undefined) sortie[cle] = tout[cle];
	}
	for (const cle of SECRET_SETTING_KEYS) {
		sortie[`${cle}_CONFIGURED`] = tout[cle] ? "true" : "false";
	}
	return sortie;
}
