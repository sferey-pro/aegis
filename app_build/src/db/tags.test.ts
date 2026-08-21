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

	test("l'unicité est sensible à la casse — écart documenté", () => {
		// `UNIQUE` sur du TEXT sans COLLATE NOCASE : « Backend » et « backend »
		// coexistent, ce qui produit deux filtres visuellement identiques.
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
