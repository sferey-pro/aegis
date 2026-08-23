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
	// `query` et non `prepare` : `prepare` crée une instruction par appel et ne la
	// finalise jamais. Chaque instruction vivante empêche la fermeture de la base,
	// et un `closeDb()` qui ne ferme pas laisse le fichier verrouillé — c'est ce
	// qui faisait échouer la restauration sur « database is locked ».
	const stmt = db.query(`
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
	// N38 : `created_at` a une résolution d'une seconde. Sans départage par `id`,
	// deux audits lancés dans la même seconde remontaient dans un ordre indéfini —
	// or c'est cet ordre qui détermine quel compte-rendu l'écran Rapports compare
	// au précédent. Même règle que `getLatestRun` pour les runs.
	const rows = db
		.query(`SELECT * FROM reports ORDER BY created_at DESC, id DESC`)
		.all() as ReportRow[];

	return rows.map((r) => ({
		...r,
		counts: JSON.parse(r.counts),
		details: JSON.parse(r.details || "[]"),
	}));
}

export function deleteReport(id: number): boolean {
	const db = getDb();
	// N37 : retourne s'il y a bien eu suppression, pour que la route réponde
	// 404 sur un identifiant inconnu. Sans cela, l'interface ne distinguait
	// pas « supprimé » de « n'existait pas », ce qui masquait une
	// désynchronisation entre la liste affichée et l'état réel.
	const info = db.query(`DELETE FROM reports WHERE id = ?`).run(id);
	return info.changes > 0;
}
