import { getDb } from "./index";

export function ensureOccurrences(
	projectId: number,
	vulns: { package: string; cve: string | null }[],
	isBaseline: boolean,
) {
	const db = getDb();
	const insertStmt = db.prepare(`
		INSERT INTO cve_occurrences (project_id, package, cve, is_baseline) 
		VALUES ($projectId, $package, $cve, $isBaseline)
		ON CONFLICT(project_id, package, cve) DO NOTHING
	`);

	db.transaction(() => {
		for (const v of vulns) {
			insertStmt.run({
				$projectId: projectId,
				$package: v.package,
				$cve: v.cve || v.package,
				$isBaseline: isBaseline ? 1 : 0,
			});
		}
	})();

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
		map.set(`${row.package}::${row.cve}`, {
			firstSeenAt: isoDate,
			isBaseline: row.is_baseline === 1,
		});
	}
	return map;
}
