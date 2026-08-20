import type { Vulnerability } from "../lib/parsers/types";
import { getDb } from "./index";
import type { RunCounts } from "./runs";

/**
 * Détail d'un projet dans un compte-rendu d'audit global : le client envoie,
 * pour chaque projet ayant au moins une vulnérabilité, la liste complète telle
 * que le run l'a produite. C'est cette liste que l'écran Rapports compare d'un
 * compte-rendu au précédent.
 */
export interface ReportDetail {
	projectId: number;
	projectName: string;
	vulns: Vulnerability[];
}

/** Ligne `reports` brute : les colonnes JSON arrivent en chaîne. */
type ReportRow = Omit<Report, "counts" | "details"> & {
	counts: string;
	details: string | null;
};

export interface Report {
	id: number;
	projects_audited: number;
	total_vulnerabilities: number;
	counts: RunCounts;
	details: ReportDetail[];
	created_at: string;
}

export function createReport(data: {
	projects_audited: number;
	total_vulnerabilities: number;
	counts: RunCounts;
	details: ReportDetail[];
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
	}) as ReportRow;

	return {
		...row,
		counts: JSON.parse(row.counts),
		details: JSON.parse(row.details || "[]"),
	};
}

export function getReports(): Report[] {
	const db = getDb();
	const stmt = db.prepare(`SELECT * FROM reports ORDER BY created_at DESC`);
	const rows = stmt.all() as ReportRow[];

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
