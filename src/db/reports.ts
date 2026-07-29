import { getDb } from "./index";
import type { RunCounts } from "./runs";

export interface Report {
	id: number;
	projects_audited: number;
	total_vulnerabilities: number;
	counts: RunCounts;
	details: any[];
	created_at: string;
}

export function createReport(data: {
	projects_audited: number;
	total_vulnerabilities: number;
	counts: RunCounts;
	details: any[];
}): Report {
	const db = getDb();
	const stmt = db.prepare(`
    INSERT INTO reports (projects_audited, total_vulnerabilities, counts, details)
    VALUES ($projects, $total, $counts, $details)
    RETURNING *
  `);

	const row = stmt.get({
		$projects: data.projects_audited,
		$total: data.total_vulnerabilities,
		$counts: JSON.stringify(data.counts),
		$details: JSON.stringify(data.details || []),
	}) as any;

	return {
		...row,
		counts: JSON.parse(row.counts),
		details: JSON.parse(row.details),
	};
}

export function getReports(): Report[] {
	const db = getDb();
	const stmt = db.prepare(`SELECT * FROM reports ORDER BY created_at DESC`);
	const rows = stmt.all() as any[];

	return rows.map((r) => ({
		...r,
		counts: JSON.parse(r.counts),
		details: JSON.parse(r.details || "[]"),
	}));
}

export function deleteReport(id: number) {
	const db = getDb();
	db.prepare(`DELETE FROM reports WHERE id = ?`).run(id);
}
