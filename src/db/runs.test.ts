import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { getDb, closeDb } from "./index";
import { createProject } from "./projects";
import { addRun, getRunsForProject, getLatestRun, deleteRun } from "./runs";
import { unlinkSync, existsSync } from "node:fs";

describe("Database: Runs", () => {
  const TEST_DB = "test_runs.sqlite";
  let projectId: number;

  beforeEach(() => {
    process.env.DB_PATH = TEST_DB;
    getDb();
    const p = createProject({ name: "App", path: "/path", type: "node", tool: "npm" });
    projectId = p.id;
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB);
    }
  });

  test("can add and retrieve runs", () => {
    const run = addRun({
      project_id: projectId,
      status: "ok",
      total: 0,
      counts: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, unknown: 0 },
      vulnerabilities: [],
      command: "npm audit --json",
      duration_ms: 150
    });

    expect(run.id).toBeDefined();
    expect(run.status).toBe("ok");
    expect(run.total).toBe(0);

    const latest = getLatestRun(projectId);
    expect(latest?.id).toBe(run.id);
  });

  test("can list runs for a project", () => {
    addRun({ project_id: projectId, status: "error", total: 0, counts: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, unknown: 0 }, vulnerabilities: [], duration_ms: 100 });
    addRun({ project_id: projectId, status: "ok", total: 0, counts: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, unknown: 0 }, vulnerabilities: [], duration_ms: 100 });

    const runs = getRunsForProject(projectId);
    expect(runs.length).toBe(2);
    // The second added should be the latest
    expect(runs[0].status).toBe("ok");
    expect(runs[1].status).toBe("error");
  });

  test("can delete a run", () => {
    const run = addRun({ project_id: projectId, status: "ok", total: 0, counts: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, unknown: 0 }, vulnerabilities: [], duration_ms: 100 });
    deleteRun(run.id);
    expect(getLatestRun(projectId)).toBeNull();
  });
});
