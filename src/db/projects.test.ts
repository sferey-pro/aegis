import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { getDb, closeDb } from "./index";
import { createProject, getProjectById, listProjects, updateProject, deleteProject, toggleIgnoreProject } from "./projects";
import { unlinkSync, existsSync } from "node:fs";

describe("Database: Projects", () => {
  const TEST_DB = "test_projects.sqlite";

  beforeEach(() => {
    process.env.DB_PATH = TEST_DB;
    getDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB);
    }
  });

  test("can create and retrieve a project", () => {
    const project = createProject({
      name: "Test App",
      path: "/var/www/html",
      type: "node",
      tool: "npm",
      tags: ["prod", "backend"]
    });

    expect(project.id).toBeDefined();
    expect(project.name).toBe("Test App");
    expect(project.tags).toEqual(["prod", "backend"]);
    expect(project.ignored).toBe(false);
    expect(project.audit_path).toBeNull();

    const fetched = getProjectById(project.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Test App");
  });

  test("can list projects ordered by created_at DESC", () => {
    createProject({ name: "App 1", path: "/path1", type: "node", tool: "npm" });
    createProject({ name: "App 2", path: "/path2", type: "node", tool: "npm" });

    const list = listProjects();
    expect(list.length).toBe(2);
    expect(list[0]!.name).toBe("App 2");
    expect(list[1]!.name).toBe("App 1");
  });

  test("can update a project", () => {
    const p = createProject({ name: "App", path: "/path", type: "node", tool: "npm" });
    const updated = updateProject(p.id, { name: "Updated App", ignored: true });
    
    expect(updated.name).toBe("Updated App");
    expect(updated.ignored).toBe(true);
    expect(updated.path).toBe("/path");

    const fetched = getProjectById(p.id);
    expect(fetched?.name).toBe("Updated App");
  });

  test("can delete a project", () => {
    const p = createProject({ name: "App", path: "/path", type: "node", tool: "npm" });
    deleteProject(p.id);
    expect(getProjectById(p.id)).toBeNull();
  });

  test("can toggle ignore status", () => {
    const p = createProject({ name: "App", path: "/path", type: "node", tool: "npm" });
    expect(p.ignored).toBe(false);
    
    const toggled = toggleIgnoreProject(p.id);
    expect(toggled.ignored).toBe(true);

    const untoggled = toggleIgnoreProject(p.id);
    expect(untoggled.ignored).toBe(false);
  });
});
