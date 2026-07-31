import { getDb } from "./index";

export interface Ticket {
	id: number;
	project_id: number;
	package: string;
	url: string; // Stocke la référence du ticket (ex: SEC-1234)
	cves: string[]; // Tableau de refs de CVEs
	content_hash?: string;
	updated_at: string;
}

export function getTickets(): Ticket[] {
	const db = getDb();
	const rows = db.query(`SELECT * FROM tickets`).all() as any[];
	return rows.map((r) => ({
		...r,
		cves: JSON.parse(r.cves || "[]"),
	}));
}

export function saveTicket(
	projectId: number,
	pkg: string,
	url: string,
	cves: string[],
	contentHash?: string | null
) {
	const db = getDb();
	db.query(`
    INSERT INTO tickets (project_id, package, url, cves, content_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(project_id, package) DO UPDATE SET
      url = excluded.url,
      cves = excluded.cves,
      content_hash = excluded.content_hash,
      updated_at = CURRENT_TIMESTAMP
  `).run(projectId, pkg, url, JSON.stringify(cves), contentHash || null);
}

export function getTicketByHash(hash: string): Ticket | undefined {
	const db = getDb();
	const row = db.query(`SELECT * FROM tickets WHERE content_hash = ?`).get(hash) as any;
	if (!row) return undefined;
	return {
		...row,
		cves: JSON.parse(row.cves || "[]"),
	};
}

export function deleteTicket(projectId: number, pkg: string) {
	const db = getDb();
	db.query(`DELETE FROM tickets WHERE project_id = ? AND package = ?`).run(
		projectId,
		pkg,
	);
}
