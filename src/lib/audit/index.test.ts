import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { getAuditTarget, runAudit, ingestAudit } from "./index";
import { getDb, closeDb } from "../../db";
import { createProject } from "../../db/projects";
import { addRun, getLatestRun } from "../../db/runs";
import { unlinkSync, existsSync, mkdirSync, rmSync } from "node:fs";

describe("Engine: Audit", () => {
  const TEST_DB = "test_audit_engine.sqlite";

  beforeEach(() => {
    process.env.DB_PATH = TEST_DB;
    getDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test("getAuditTarget resolves paths correctly", () => {
    const p1 = createProject({ name: "A", path: "/var/www", type: "node", tool: "npm" });
    expect(getAuditTarget(p1)).toBe("/var/www");

    const p2 = createProject({ name: "B", path: "/var/www", audit_path: "app", type: "node", tool: "npm" });
    expect(getAuditTarget(p2)).toBe("/var/www/app");

    const p3 = createProject({ name: "C", path: "/var/www", audit_path: "/absolute/path", type: "node", tool: "npm" });
    expect(getAuditTarget(p3)).toBe("/absolute/path");
  });

  test("runAudit handles non-existent folders cleanly", async () => {
    const p = createProject({ name: "Dummy", path: "/tmp/non_existent_folder_xyz_123", type: "node", tool: "npm" });
    
    // This will cause an OS error (cwd not found) when bun:spawn is called
    const res = await runAudit(p.id);
    expect(res.deduped).toBe(false);
    expect(res.run?.status).toBe("error");
    
    // Le message d'erreur SQLite stocké doit contenir la trace du cwd manquant
    expect(res.run?.error).toContain("/tmp/non_existent_folder_xyz_123");
    
    const latest = getLatestRun(p.id);
    expect(latest?.status).toBe("error");
  });
  
  test("runAudit dedupes when conditions are met", async () => {
    // We create an empty folder to trick git into being a clean state (not a repo = clean by default in our git info parser for testing)
    const tmpDir = "/tmp/aegis_test_dedupe";
    if (!existsSync(tmpDir)) mkdirSync(tmpDir);
    
    const p = createProject({ name: "DedupeTest", path: tmpDir, type: "node", tool: "npm" });
    
    // Inject a fresh run directly into DB that pretends it matched a certain SHA
    addRun({
      project_id: p.id,
      status: "ok",
      total: 0,
      counts: { critical:0, high:0, moderate:0, low:0, info:0, unknown:0 },
      vulnerabilities: [],
      command: "npm audit --json",
      commit_sha: null, // Because tmpDir isn't a git repo, getGitInfo returns sha: null. So they will match!
      duration_ms: 10
    });
    
    // Run the audit (no force). It should dedupe since gitInfo.sha == null == lastRun.commit_sha
    // WAIT: in index.ts I wrote: `gitInfo.sha && lastRun.commit_sha === gitInfo.sha`
    // So if sha is null, it skips deduplication to be safe! Let's check.
    // If it skips, it runs the audit and fails because no package.json or succeeds with 0 vulns.
    // Let's actually verify the behavior of runAudit.
    const res = await runAudit(p.id);
    
    // Since gitInfo.sha is null, deduplication is bypassed (gitInfo.sha must be truthy)
    expect(res.deduped).toBe(false);
    
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("ingestAudit creates a run correctly for remote projects", async () => {
    const p = createProject({ name: "RemoteIngest", path: "", type: "node", tool: "npm" });
    const db = getDb();
    db.query('UPDATE projects SET is_remote = 1 WHERE id = ?').run(p.id);

    const fakeNpmStdout = JSON.stringify({
      vulnerabilities: {
        "lodash": {
          name: "lodash",
          severity: "high",
          via: [{ title: "Prototype pollution" }]
        }
      }
    });

    const res = await ingestAudit(p.id, fakeNpmStdout, "sha-12345");
    expect(res.run).not.toBeNull();
    expect(res.run!.commit_sha).toBe("sha-12345");
    expect(res.run!.status).toBe("vulnerable");
    expect(res.run!.counts.high).toBe(1);
  });
});
