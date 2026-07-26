import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { getDb, closeDb } from "./index";
import { createProject } from "./projects";
import { upsertAnnotation, setAnnotationFix, getAnnotationsForProject } from "./annotations";
import { unlinkSync, existsSync } from "node:fs";

describe("Database: Annotations", () => {
  const TEST_DB = "test_annotations.sqlite";
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

  test("can upsert an annotation", () => {
    const ann = upsertAnnotation("CVE-123", projectId, { status: "confirmed", note: "Need fix" });
    expect(ann.id).toBeDefined();
    expect(ann.cve).toBe("CVE-123");
    expect(ann.status).toBe("confirmed");
    expect(ann.note).toBe("Need fix");
    expect(ann.fixed_in).toBeNull();
  });

  test("upsert handles existing annotation", () => {
    upsertAnnotation("CVE-123", projectId, { status: "pending" });
    const updated = upsertAnnotation("CVE-123", projectId, { note: "Now confirmed", status: "confirmed" });
    
    expect(updated.status).toBe("confirmed");
    expect(updated.note).toBe("Now confirmed");

    const annotations = getAnnotationsForProject(projectId);
    expect(annotations.length).toBe(1); // Upsert updated the existing one
  });

  test("setAnnotationFix updates only fixed_in", () => {
    upsertAnnotation("CVE-123", projectId, { status: "ignored", note: "Wont fix" });
    const updated = setAnnotationFix("CVE-123", projectId, "1.2.3");
    
    expect(updated.fixed_in).toBe("1.2.3");
    expect(updated.status).toBe("ignored"); // presreved
    expect(updated.note).toBe("Wont fix"); // preserved
  });
});
