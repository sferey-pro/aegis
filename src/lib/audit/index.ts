import { spawn } from "bun";
import { resolve } from "node:path";
import { getGitInfo, expandPath } from "../git";
import { getProjectById, type Project } from "../../db/projects";
import { getLatestRun, addRun, type Run } from "../../db/runs";
import { parseAuditOutput } from "../parsers";
import { getDb } from "../../db";

function getAuditMaxAgeHours(): number {
  const db = getDb();
  const row = db.query(`SELECT value FROM settings WHERE key = 'AUDIT_MAX_AGE_HOURS'`).get() as any;
  if (!row) return 24;
  const val = parseFloat(row.value);
  if (isNaN(val)) return 24;
  return val;
}

function isFresh(ranAtStr: string, maxAgeHours: number): boolean {
  if (maxAgeHours < 0) return false;
  if (maxAgeHours === 0) return true;
  
  const ranAt = new Date(ranAtStr + "Z"); // SQLite CURRENT_TIMESTAMP is UTC
  if (isNaN(ranAt.getTime())) return true; // Date illisible -> on garde frais par sécurité
  
  const now = new Date();
  const diffHours = (now.getTime() - ranAt.getTime()) / (1000 * 60 * 60);
  return diffHours <= maxAgeHours;
}

export function getAuditTarget(project: Project): string {
  const root = expandPath(project.path);
  if (!project.audit_path) return root;
  
  // Si le chemin commence par / ou ~, c'est un chemin absolu à part entière
  if (project.audit_path.startsWith("/") || project.audit_path.startsWith("~")) {
    return expandPath(project.audit_path);
  }
  
  // Sinon, c'est relatif à la racine Git (root)
  return resolve(root, project.audit_path);
}

export async function runAudit(projectId: number, force = false): Promise<{ run: Run | null, deduped: boolean, newCves: any[] }> {
  const project = getProjectById(projectId);
  if (!project) throw new Error("Projet introuvable");

  const cwd = getAuditTarget(project);
  
  // 1. Lire l'état git
  const gitInfo = await getGitInfo(project.path); // gitInfo sur la racine git

  // 2. Chercher le dernier run
  const lastRun = getLatestRun(projectId);
  
  // 3. Déduplication
  if (!force && !gitInfo.dirty && gitInfo.sha && lastRun && lastRun.status !== "error" && lastRun.commit_sha === gitInfo.sha) {
    const maxAge = getAuditMaxAgeHours();
    if (isFresh(lastRun.ran_at, maxAge)) {
      return { run: lastRun, deduped: true, newCves: [] }; // Dédupliqué !
    }
  }

  // 4. Lancement de l'audit
  let commandStr = "";
  let args: string[] = [];
  
  if (project.tool === "npm") { args = ["npm", "audit", "--json"]; }
  else if (project.tool === "yarn") { args = ["yarn", "audit", "--json"]; }
  else if (project.tool === "bun") { args = ["bun", "audit", "--json"]; }
  else if (project.tool === "composer") { args = ["composer", "audit", "--format=json", "--locked", "--no-interaction"]; }

  commandStr = args.join(" ");
  const startTime = Date.now();
  
  let stdout = "";
  let stderr = "";
  let exitCode = 1;
  let systemError = null;

  try {
    const proc = spawn(args, {
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    stdout = await new Response(proc.stdout).text();
    stderr = await new Response(proc.stderr).text();
    exitCode = await proc.exited;
  } catch (err: any) {
    systemError = err.message;
  }

  const duration_ms = Date.now() - startTime;

  if (systemError || (stdout.trim() === "" && exitCode !== 0)) {
    let errMsg = systemError ? `Erreur système: ${systemError}` : (stderr.trim() || `${project.tool}: aucune sortie (exit ${exitCode})`);
    
    // Format de l'erreur multi-ligne
    const errorBody = [
      errMsg,
      `cwd: ${cwd}`,
      `exit: ${exitCode}`,
      stderr,
      stdout
    ].filter(Boolean).join("\n");

    const errRun = addRun({
      project_id: projectId,
      status: "error",
      total: 0,
      counts: { critical:0, high:0, moderate:0, low:0, info:0, unknown:0 },
      vulnerabilities: [],
      command: commandStr,
      commit_sha: gitInfo.sha,
      error: errorBody,
      duration_ms
    });
    return { run: errRun, deduped: false, newCves: [] };
  }

  // Parsing
  try {
    const parsed = parseAuditOutput(project.tool, stdout);
    
    const successRun = addRun({
      project_id: projectId,
      status: parsed.total > 0 ? "vulnerable" : "ok",
      total: parsed.total,
      counts: parsed.counts,
      vulnerabilities: parsed.vulnerabilities,
      command: commandStr,
      commit_sha: gitInfo.sha,
      error: null,
      duration_ms
    });

    // Calculer newCves par rapport à l'ancien run valide
    const newCves = [];
    if (lastRun && lastRun.status !== "error") {
      const oldSet = new Set(lastRun.vulnerabilities.map((v: any) => `${v.package}::${v.cve || v.title}`));
      for (const v of parsed.vulnerabilities) {
        const key = `${v.package}::${v.cve || v.title}`;
        if (!oldSet.has(key)) {
          newCves.push({ ref: v.cve || v.package, package: v.package, severity: v.severity });
        }
      }
    } else {
      // Premier run ou précédent en erreur -> toutes les failles trouvées sont considérées "nouvelles"
      for (const v of parsed.vulnerabilities) {
        newCves.push({ ref: v.cve || v.package, package: v.package, severity: v.severity });
      }
    }

    return { run: successRun, deduped: false, newCves };

  } catch (err: any) {
    const errorBody = [
      err.message,
      `cwd: ${cwd}`,
      `exit: ${exitCode}`,
      stderr,
      stdout
    ].filter(Boolean).join("\n");

    const parseErrRun = addRun({
      project_id: projectId,
      status: "error",
      total: 0,
      counts: { critical:0, high:0, moderate:0, low:0, info:0, unknown:0 },
      vulnerabilities: [],
      command: commandStr,
      commit_sha: gitInfo.sha,
      error: errorBody,
      duration_ms
    });
    return { run: parseErrRun, deduped: false, newCves: [] };
  }
}
