import { expect, test, describe } from "bun:test";
import { getGitInfo, gitFetch, expandPath } from "./index";

describe("Integration: Git", () => {
  const CURRENT_REPO = process.cwd(); // Utilise le dossier courant (Aegis) pour tester

  test("expandPath resolves tilde properly", () => {
    expect(expandPath("~/test")).toMatch(/test$/);
    expect(expandPath("/absolute/path")).toBe("/absolute/path");
  });

  test("getGitInfo on the current repository", async () => {
    const info = await getGitInfo(CURRENT_REPO);
    
    expect(info.isRepo).toBe(true);
    expect(info.branch).toBeDefined(); // ex: main ou HEAD
    expect(info.sha).toBeDefined(); // sha complet
    expect(info.sha?.length).toBeGreaterThan(0);
    
    // Le repo courant a peut-être un upstream ou non, mais les champs doivent être présents
    expect(typeof info.ahead).toBe("number");
    expect(typeof info.behind).toBe("number");
    expect(typeof info.dirty).toBe("boolean");
    
    // On log l'état pour que tu puisses voir ce que Git a retourné
    console.log("GitInfo actuel:", info);
  });

  test("getGitInfo on non-existent folder", async () => {
    const info = await getGitInfo("/tmp/does_not_exist_xyz123");
    expect(info.isRepo).toBe(false);
  });
  
  test("gitFetch on current repository", async () => {
    const result = await gitFetch(CURRENT_REPO);
    
    // Ne doit pas crasher, même s'il n'y a pas de réseau ou d'upstream (exitCode 1)
    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.log).toBe("string");
    
    console.log("Résultat Fetch:", result.ok, "| Log:", result.log.substring(0, 50) + "...");
  });
});
