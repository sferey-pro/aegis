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
  vulnerabilities: any[];
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
    counts: typeof row.counts === 'string' ? JSON.parse(row.counts) : row.counts,
    vulnerabilities: typeof row.vulnerabilities === 'string' ? JSON.parse(row.vulnerabilities) : row.vulnerabilities,
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
    $duration_ms: input.duration_ms
  });
  
  return parseRun(row);
}

export function getRunsForProject(projectId: number, limit = 30): Run[] {
  const db = getDb();
  const rows = db.query(`
    SELECT * FROM runs 
    WHERE project_id = ? 
    ORDER BY ran_at DESC, id DESC 
    LIMIT ?
  `).all(projectId, limit);
  
  return rows.map(parseRun);
}

export function getLatestRun(projectId: number): Run | null {
  const db = getDb();
  const row = db.query(`
    SELECT * FROM runs 
    WHERE project_id = ? 
    ORDER BY ran_at DESC, id DESC 
    LIMIT 1
  `).get(projectId);
  
  return row ? parseRun(row) : null;
}

export function deleteRun(id: number): void {
  const db = getDb();
  db.query(`DELETE FROM runs WHERE id = ?`).run(id);
}
