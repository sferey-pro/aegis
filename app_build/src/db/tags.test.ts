import { describe, expect, test } from "bun:test";

import { useTempDb } from "@/test/db";
import { createProject, getProjectById, updateProject } from "./projects";
import { createTag, deleteTag, listTags } from "./tags";

describe("db/tags", () => {
	useTempDb("tags");

	test("une base neuve n'a aucun tag", () => {
		expect(listTags()).toEqual([]);
	});

	test("createTag applique la couleur par défaut indigo", () => {
		expect(createTag("backend").color).toBe("indigo");
	});

	test("createTag conserve la couleur fournie", () => {
		expect(createTag("critique", "red").color).toBe("red");
	});

	test("un nom déjà pris est refusé avec un message lisible", () => {
		// Le message est présenté tel quel dans l'interface : il doit rester
		// français et sans jargon SQLite.
		createTag("backend");
		expect(() => createTag("backend")).toThrow(
			"Un tag avec ce nom existe déjà",
		);
	});

	test("l'unicité du nom est sensible à la casse (CONTEXT.md §9)", () => {
		// « web » ≠ « Web » est **spécifié**, pas un défaut : §9 le dit
		// explicitement (« Dédup sensible casse/espaces internes »). Un correctif
		// l'avait rendue insensible le 22/08/2026, contredisant le contrat et
		// fusionnant des tags existants ; annulé le même jour. La question — la
		// règle est-elle la bonne ? — relève de l'arbitrage de contrat (N31), pas
		// d'un correctif de défaut.
		createTag("backend");
		expect(() => createTag("Backend")).not.toThrow();
		expect(listTags()).toHaveLength(2);
	});

	test("listTags trie par nom croissant", () => {
		createTag("zod");
		createTag("api");
		createTag("mono");
		expect(listTags().map((t) => t.name)).toEqual(["api", "mono", "zod"]);
	});

	test("deleteTag retire le tag du référentiel", () => {
		const t = createTag("temporaire");
		deleteTag(t.id);
		expect(listTags()).toEqual([]);
	});

	test("deleteTag est idempotent sur un id inexistant", () => {
		expect(() => deleteTag(999_999)).not.toThrow();
	});

	test("renommer un tag n'est pas exposé — écart documenté", async () => {
		// Le module n'offre que create/list/delete. Corriger une faute de frappe
		// impose de supprimer puis recréer, ce qui perd l'affectation aux projets
		// pour la même raison que ci-dessus.
		const api = await import("./tags");
		expect(Object.keys(api).sort()).toEqual([
			"createTag",
			"deleteTag",
			"listTags",
		]);
	});
});

/**
 * Contrats attendus — à activer au correctif.
 *
 * Chaque test ci-dessous énonce le comportement que `CONTEXT.md` demande, sur un
 * point où le code s'en écarte aujourd'hui. Ils sont marqués `test.failing` :
 * Bun exécute le corps et **attend son échec**, donc la suite reste verte tant
 * que le défaut existe.
 *
 * Le jour où le défaut est corrigé, le test se met à passer et Bun le signale en
 * rouge — « this test is marked as failing but it passed. Remove `.failing` if
 * tested behavior now works ». Il est donc impossible de corriger le code sans
 * reprendre le test.
 *
 * Marche à suivre au correctif : retirer `.failing`, puis supprimer le test
 * « écart documenté » correspondant, qui épinglait l'ancien comportement.
 */

describe("contrats attendus — à activer au correctif", () => {
	useTempDb("tags-contrats");

	// N40 — `UNIQUE` sans `COLLATE NOCASE` laisse coexister « backend » et
	// « Backend », soit deux filtres visuellement identiques.

	// N12 — CONTEXT.md §9 : « retire le nom de tous les projets le référençant ».
	test("supprimer un tag le retire des projets", () => {
		const t = createTag("legacy");
		const p = createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		updateProject(p.id, { tags: ["legacy"] });

		deleteTag(t.id);

		expect(getProjectById(p.id)?.tags).toEqual([]);
	});

	test("les autres tags du projet sont conservés", () => {
		// Une cascade qui viderait le tableau entier serait pire que le défaut.
		const t = createTag("legacy");
		createTag("prod");
		const p = createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		updateProject(p.id, { tags: ["legacy", "prod"] });

		deleteTag(t.id);

		expect(getProjectById(p.id)?.tags).toEqual(["prod"]);
	});

	test("tous les projets référençant le tag sont réécrits", () => {
		const t = createTag("legacy");
		const a = createProject({
			name: "a",
			path: "/srv/a",
			type: "node",
			tool: "npm",
		});
		const b = createProject({
			name: "b",
			path: "/srv/b",
			type: "node",
			tool: "npm",
		});
		const c = createProject({
			name: "c",
			path: "/srv/c",
			type: "node",
			tool: "npm",
		});
		updateProject(a.id, { tags: ["legacy"] });
		updateProject(b.id, { tags: ["legacy"] });
		updateProject(c.id, { tags: [] });

		deleteTag(t.id);

		expect(getProjectById(a.id)?.tags).toEqual([]);
		expect(getProjectById(b.id)?.tags).toEqual([]);
		expect(getProjectById(c.id)?.tags).toEqual([]);
	});

	test("la casse distingue deux tags de noms voisins", () => {
		// §9 spécifie la sensibilité à la casse. Supprimer « legacy » ne doit pas
		// emporter « Legacy » — l'arbitrage inverse a déjà été tenté à tort (N31).
		const t = createTag("legacy");
		createTag("Legacy");
		const p = createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		updateProject(p.id, { tags: ["legacy", "Legacy"] });

		deleteTag(t.id);

		expect(getProjectById(p.id)?.tags).toEqual(["Legacy"]);
	});

	test("un identifiant inconnu ne touche aucun projet", () => {
		// Idempotence exigée par §9 : no-op, aucun projet modifié.
		const p = createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		updateProject(p.id, { tags: ["prod"] });

		expect(deleteTag(9999)).toBe(false);
		expect(getProjectById(p.id)?.tags).toEqual(["prod"]);
	});
});
