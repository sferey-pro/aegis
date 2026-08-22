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

	test("supprimer un tag ne le retire pas des projets — écart documenté", () => {
		// Défaut N12 : `projects.tags` est un tableau JSON de **noms**, sans clé
		// étrangère vers `tags`. Supprimer le tag laisse donc son nom collé aux
		// projets, qui continuent de l'afficher alors qu'il n'est plus filtrable.
		const t = createTag("legacy");
		const p = createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		updateProject(p.id, { tags: ["legacy"] });

		deleteTag(t.id);

		expect(listTags()).toEqual([]);
		expect(getProjectById(p.id)?.tags).toEqual(["legacy"]);
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
	test.failing("supprimer un tag le retire des projets (N12)", () => {
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
});
