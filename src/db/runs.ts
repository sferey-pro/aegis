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

export function getGlobalHistory(days = 30) {
  const db = getDb();
  const projects = db.query(`SELECT id FROM projects WHERE ignored = 0`).all() as {id:number}[];
  
  const today = new Date();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const projectIds = projects.map(p => p.id).join(',');
  if (!projectIds) return dates.map(date => ({ date, critical:0, high:0, moderate:0, low:0 }));

  const rows = db.query(`
    SELECT project_id, ran_at, counts, status
    FROM runs
    WHERE project_id IN (${projectIds})
    ORDER BY ran_at ASC
  `).all() as any[];

  const latestCounts = new Map<number, RunCounts>();
  const rowsByDay = new Map<string, any[]>();
  
  for (const r of rows) {
    const day = r.ran_at.split('T')[0].split(' ')[0];
    if (!rowsByDay.has(day)) rowsByDay.set(day, []);
    rowsByDay.get(day)!.push(r);
  }

  for (const [day, dayRows] of rowsByDay.entries()) {
    if (day < dates[0]) {
      for (const r of dayRows) {
        if (r.status === 'ok' || r.status === 'vulnerable') {
           latestCounts.set(r.project_id, typeof r.counts === 'string' ? JSON.parse(r.counts) : r.counts);
        }
      }
    }
  }

  const result = [];
  for (const date of dates) {
    const dayRows = rowsByDay.get(date) || [];
    for (const r of dayRows) {
        if (r.status === 'ok' || r.status === 'vulnerable') {
           latestCounts.set(r.project_id, typeof r.counts === 'string' ? JSON.parse(r.counts) : r.counts);
        }
    }
    
    let critical = 0, high = 0, moderate = 0, low = 0;
    for (const counts of latestCounts.values()) {
      critical += counts.critical || 0;
      high += counts.high || 0;
      moderate += counts.moderate || 0;
      low += counts.low || 0;
    }
    
    // Format date string from YYYY-MM-DD to DD/MM
    const [, month, day] = date.split('-');
    result.push({ date: `${day}/${month}`, rawDate: date, critical, high, moderate, low });
  }

  return result;
}
