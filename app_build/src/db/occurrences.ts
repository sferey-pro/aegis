import { occurrenceRef } from "@/lib/vuln-identity";
import { getDb, runInTransaction } from "./index";

/**
 * Fige la date de première détection de chaque vulnérabilité d'un projet.
 *
 * La colonne `cve` porte la référence d'occurrence (`occurrenceRef`) : la CVE,
 * **repli sur le titre**, conformément à la clé de `newCves` (CONTEXT.md §2). Le
 * repli était le nom du paquet, donc identique pour tous les avis sans CVE d'un
 * même paquet, qui se fondaient en une ligne et partageaient leur
 * `first_seen_at` (défaut N10). Le `title` est donc requis dans l'entrée.
 */
export function ensureOccurrences(
	projectId: number,
	vulns: { package: string; title: string; cve: string | null }[],
	isBaseline: boolean,
) {
	const db = getDb();
	// `query` met l'instruction en cache sur la connexion ; `prepare` en créait une
	// nouvelle à chaque audit sans jamais la finaliser, et une instruction vivante
	// empêche la fermeture de la base.
	const insertStmt = db.query(`
		INSERT INTO cve_occurrences (project_id, package, cve, is_baseline) 
		VALUES ($projectId, $package, $cve, $isBaseline)
		ON CONFLICT(project_id, package, cve) DO NOTHING
	`);

	runInTransaction(() => {
		for (const v of vulns) {
			insertStmt.run({
				$projectId: projectId,
				$package: v.package,
				$cve: occurrenceRef(v),
				$isBaseline: isBaseline ? 1 : 0,
			});
		}
	});

	const rows = db
		.query(
			`SELECT package, cve, first_seen_at, is_baseline FROM cve_occurrences WHERE project_id = ?`,
		)
		.all(projectId) as {
		package: string;
		cve: string;
		first_seen_at: string;
		is_baseline: number;
	}[];

	const map = new Map<string, { firstSeenAt: string; isBaseline: boolean }>();
	for (const row of rows) {
		// SQLite CURRENT_TIMESTAMP is UTC 'YYYY-MM-DD HH:MM:SS'. We append 'Z' for ISO parsing.
		const isoDate = `${row.first_seen_at.replace(" ", "T")}Z`;
		// La colonne `cve` contient déjà la clé d'identité : la ligne se relit avec
		// la même forme que `occurrenceKey`.
		map.set(`${row.package}::${row.cve}`, {
			firstSeenAt: isoDate,
			isBaseline: row.is_baseline === 1,
		});
	}
	return map;
}
