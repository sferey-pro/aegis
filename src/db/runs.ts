import type { Vulnerability } from "../lib/parsers/types";
import { getDb } from "./index";

export type RunStatus = "ok" | "vulnerable" | "error";

export interface RunCounts {
	critical: number;
	high: number;
	moderate: number;
	low: number;
	info: number;
	unknown: number;
}

export interface Run {
	id: number;
	project_id: number;
	status: RunStatus;
	total: number;
	counts: RunCounts;
	vulnerabilities: Vulnerability[];
	command: string | null;
	commit_sha: string | null;
	error: string | null;
	duration_ms: number;
	ran_at: string;
}

export interface CreateRunInput {
	project_id: number;
	status: RunStatus;
	total: number;
	counts: RunCounts;
	vulnerabilities: any[];
	command?: string | null;
	commit_sha?: string | null;
	error?: string | null;
	duration_ms: number;
}

function parseRun(row: any): Run {
	return {
		...row,
		counts:
			typeof row.counts === "string" ? JSON.parse(row.counts) : row.counts,
		vulnerabilities:
			typeof row.vulnerabilities === "string"
				? JSON.parse(row.vulnerabilities)
				: row.vulnerabilities,
	};
}

export function addRun(input: CreateRunInput): Run {
	const db = getDb();

	const query = db.query(`
    INSERT INTO runs (
      project_id, status, total, counts, vulnerabilities, 
      command, commit_sha, error, duration_ms
    ) VALUES (
      $project_id, $status, $total, $counts, $vulnerabilities, 
      $command, $commit_sha, $error, $duration_ms
    )
    RETURNING *
  `);

	const row = query.get({
		$project_id: input.project_id,
		$status: input.status,
		$total: input.total,
		$counts: JSON.stringify(input.counts),
		$vulnerabilities: JSON.stringify(input.vulnerabilities),
		$command: input.command || null,
		$commit_sha: input.commit_sha || null,
		$error: input.error || null,
		$duration_ms: input.duration_ms,
	});

	return parseRun(row);
}

export function getRunsForProject(projectId: number, limit = 30): Run[] {
	const db = getDb();
	const rows = db
		.query(`
    SELECT * FROM runs 
    WHERE project_id = ? 
    ORDER BY ran_at DESC, id DESC 
    LIMIT ?
  `)
		.all(projectId, limit);

	return rows.map(parseRun);
}

export function getLatestRun(projectId: number): Run | null {
	const db = getDb();
	const row = db
		.query(`
    SELECT * FROM runs 
    WHERE project_id = ? 
    ORDER BY ran_at DESC, id DESC 
    LIMIT 1
  `)
		.get(projectId);

	return row ? parseRun(row) : null;
}

export function deleteRun(id: number): void {
	const db = getDb();
	db.query(`DELETE FROM runs WHERE id = ?`).run(id);
}

export function getGlobalHistory(days = 30) {
	const db = getDb();
	const projects = db
		.query(`SELECT id FROM projects WHERE ignored = 0`)
		.all() as { id: number }[];
	const projectIds = projects.map((p) => p.id).join(",");

	const isHourly = days === 1;
	const today = new Date();
	const buckets: string[] = [];

	if (isHourly) {
		for (let i = 23; i >= 0; i--) {
			const d = new Date(today);
			d.setHours(d.getHours() - i);
			const y = d.getFullYear();
			const m = String(d.getMonth() + 1).padStart(2, "0");
			const day = String(d.getDate()).padStart(2, "0");
			const h = String(d.getHours()).padStart(2, "0");
			buckets.push(`${y}-${m}-${day} ${h}`);
		}
	} else {
		for (let i = days - 1; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			const y = d.getFullYear();
			const m = String(d.getMonth() + 1).padStart(2, "0");
			const day = String(d.getDate()).padStart(2, "0");
			buckets.push(`${y}-${m}-${day}`);
		}
	}

	if (!projectIds) {
		return buckets.map((b) => ({
			date: isHourly
				? b.split(" ")[1] + "h"
				: b.split("-")[2] + "/" + b.split("-")[1],
			rawDate: b,
			critical: 0,
			high: 0,
			moderate: 0,
			low: 0,
		}));
	}

	const rows = db
		.query(`
    SELECT project_id, ran_at, counts, status
    FROM runs
    WHERE project_id IN (${projectIds})
    ORDER BY ran_at ASC
  `)
		.all() as any[];

	const latestCounts = new Map<number, RunCounts>();
	const rowsByBucket = new Map<string, any[]>();

	for (const r of rows) {
		const runDate = new Date(r.ran_at.replace(" ", "T") + "Z");
		if (isNaN(runDate.getTime())) continue;

		const y = runDate.getFullYear();
		const m = String(runDate.getMonth() + 1).padStart(2, "0");
		const day = String(runDate.getDate()).padStart(2, "0");
		const h = String(runDate.getHours()).padStart(2, "0");

		const bucket = isHourly ? `${y}-${m}-${day} ${h}` : `${y}-${m}-${day}`;
		if (!rowsByBucket.has(bucket)) rowsByBucket.set(bucket, []);
		rowsByBucket.get(bucket)!.push(r);
	}

	const firstBucketDateStr = isHourly
		? buckets[0] + ":00:00"
		: buckets[0] + " 00:00:00";
	const firstBucketDate = new Date(firstBucketDateStr.replace(" ", "T"));

	for (const r of rows) {
		const runDate = new Date(r.ran_at.replace(" ", "T") + "Z");
		if (isNaN(runDate.getTime())) continue;
		if (runDate < firstBucketDate) {
			if (r.status === "ok" || r.status === "vulnerable") {
				latestCounts.set(
					r.project_id,
					typeof r.counts === "string" ? JSON.parse(r.counts) : r.counts,
				);
			}
		}
	}

	const result = [];
	for (const b of buckets) {
		const bRows = rowsByBucket.get(b) || [];
		for (const r of bRows) {
			if (r.status === "ok" || r.status === "vulnerable") {
				latestCounts.set(
					r.project_id,
					typeof r.counts === "string" ? JSON.parse(r.counts) : r.counts,
				);
			}
		}

		let critical = 0,
			high = 0,
			moderate = 0,
			low = 0;
		for (const counts of latestCounts.values()) {
			critical += counts.critical || 0;
			high += counts.high || 0;
			moderate += counts.moderate || 0;
			low += counts.low || 0;
		}

		const label = isHourly
			? b.split(" ")[1] + "h"
			: b.split("-")[2] + "/" + b.split("-")[1];
		result.push({ date: label, rawDate: b, critical, high, moderate, low });
	}

	return result;
}
