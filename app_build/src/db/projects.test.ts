import { describe, expect, test } from "bun:test";

import { useTempDb } from "@/test/db";
import { getDb } from "./index";
import {
	createProject,
	deleteProject,
	getProjectById,
	getProjectBySlug,
	listProjects,
	toggleIgnoreProject,
	updateProject,
} from "./projects";

const base = {
	name: "Mon API",
	path: "/srv/api",
	type: "node" as const,
	tool: "npm" as const,
};

describe("db/projects", () => {
	useTempDb("projects");

	test("crée un projet et le relit", () => {
		const p = createProject(base);
		expect(p.id).toBeGreaterThan(0);
		expect(getProjectById(p.id)?.name).toBe("Mon API");
	});

	test("les valeurs par défaut sont appliquées", () => {
		const p = createProject(base);
		expect(p.tags).toEqual([]);
		expect(p.ignored).toBe(false);
		expect(p.is_remote).toBe(false);
		expect(p.audit_path).toBeNull();
	});

	test("les booléens SQLite 0/1 sont réhydratés en vrais booléens", () => {
		// La colonne stocke des entiers : sans conversion, `ignored` vaudrait 0,
		// qui est falsy mais pas `false`.
		const p = createProject({ ...base, ignored: true, is_remote: true });
		expect(p.ignored).toBe(true);
		expect(p.is_remote).toBe(true);
	});

	test("les tags sont stockés en JSON et relus en tableau", () => {
		const p = createProject({ ...base, tags: ["prod", "api"] });
		expect(p.tags).toEqual(["prod", "api"]);
		expect(getProjectById(p.id)?.tags).toEqual(["prod", "api"]);

		// La colonne contient bien du JSON, pas un tableau.
		const brut = getDb()
			.query("SELECT tags FROM projects WHERE id = ?")
			.get(p.id) as { tags: string };
		expect(typeof brut.tags).toBe("string");
	});

	test("le slug est dérivé du nom", () => {
		expect(createProject(base).slug).toBe("mon-api");
	});

	test("le slug est assaini des caractères non alphanumériques", () => {
		const p = createProject({ ...base, name: "Mon API (v2) — Prod !" });
		expect(p.slug).toBe("mon-api-v2-prod");
	});

	test("un nom sans caractère exploitable retombe sur project", () => {
		expect(createProject({ ...base, name: "!!!" }).slug).toBe("project");
	});

	test("les slugs sont uniques, suffixés en cas de collision", () => {
		const a = createProject(base);
		const b = createProject(base);
		const c = createProject(base);
		expect([a.slug, b.slug, c.slug]).toEqual([
			"mon-api",
			"mon-api-1",
			"mon-api-2",
		]);
	});

	test("getProjectBySlug retrouve le projet", () => {
		const p = createProject(base);
		expect(getProjectBySlug("mon-api")?.id).toBe(p.id);
		expect(getProjectBySlug("inexistant")).toBeNull();
	});

	test("un id inexistant renvoie null, sans lever", () => {
		expect(getProjectById(999_999)).toBeNull();
	});

	test("listProjects trie par création décroissante", () => {
		const a = createProject({ ...base, name: "Premier" });
		const b = createProject({ ...base, name: "Second" });
		// created_at a une seconde de granularité : le départage se fait par id.
		expect(listProjects().map((p) => p.id)).toEqual([b.id, a.id]);
	});

	test("updateProject écrit tous les champs éditables", () => {
		const p = createProject(base);
		const modifie = updateProject(p.id, {
			name: "Renommé",
			path: "/srv/autre",
			audit_path: "app",
			type: "composer",
			tool: "composer",
			tags: ["prod"],
			ignored: true,
		});
		expect(modifie.name).toBe("Renommé");
		expect(modifie.path).toBe("/srv/autre");
		expect(modifie.audit_path).toBe("app");
		expect(modifie.tool).toBe("composer");
		expect(modifie.tags).toEqual(["prod"]);
		expect(modifie.ignored).toBe(true);
	});

	test("toggleIgnoreProject inverse l'état courant", () => {
		// Il ne prend pas de valeur cible : il bascule depuis l'état lu en base.
		const p = createProject(base);
		expect(toggleIgnoreProject(p.id).ignored).toBe(true);
		expect(toggleIgnoreProject(p.id).ignored).toBe(false);
	});

	test("toggleIgnoreProject lève sur un id inexistant", () => {
		expect(() => toggleIgnoreProject(999_999)).toThrow(/not found/);
	});

	test("deleteProject supprime le projet", () => {
		const p = createProject(base);
		deleteProject(p.id);
		expect(getProjectById(p.id)).toBeNull();
	});

	test("deleteProject est idempotent sur un id inexistant", () => {
		expect(() => deleteProject(999_999)).not.toThrow();
	});

	test("un chemin vide retombe sur la chaîne remote", () => {
		// Comportement de `createProject` documenté ici : la validation Zod des
		// routes empêche normalement ce cas d'arriver par l'API.
		const p = createProject({ ...base, path: "" });
		expect(p.path).toBe("remote");
	});
});
