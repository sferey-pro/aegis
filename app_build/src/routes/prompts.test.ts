import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { getDb } from "@/db";
import type { Prompt } from "@/db/prompts";
import { jsonBody, startTestServer, type TestServer } from "@/test/server";

let srv: TestServer;

beforeAll(async () => {
	srv = await startTestServer("prompts");
});
afterAll(() => srv.stop());
beforeEach(() => {
	getDb().query("DELETE FROM prompts").run();
});

/** Le paramètre de type permet aux tests d'erreur d'attendre `{ error }`. */
function creer<T = Prompt>(body: unknown) {
	return srv.json<T>("/api/prompts", jsonBody(body));
}

describe("GET /api/prompts", () => {
	test("une bibliothèque vide renvoie une liste vide", async () => {
		const { status, data } = await srv.json<Prompt[]>("/api/prompts");
		expect(status).toBe(200);
		expect(data).toEqual([]);
	});

	test("les prompts sont triés par titre", async () => {
		await creer({ title: "Zèbre" });
		await creer({ title: "Alpha" });
		const { data } = await srv.json<Prompt[]>("/api/prompts");
		expect(data.map((p) => p.title)).toEqual(["Alpha", "Zèbre"]);
	});
});

describe("POST /api/prompts", () => {
	test("crée le prompt et renvoie 201", async () => {
		const { status, data } = await creer({
			title: "Analyse CVE",
			body: "Explique {cve}",
			tags: ["ia"],
		});
		expect(status).toBe(201);
		expect(data.title).toBe("Analyse CVE");
		expect(data.body).toBe("Explique {cve}");
		expect(data.tags).toEqual(["ia"]);
	});

	test("seul le titre est requis", async () => {
		const { status, data } = await creer({ title: "Minimal" });
		expect(status).toBe(201);
		expect(data.body).toBe("");
		expect(data.tags).toEqual([]);
	});

	test("un titre vide renvoie 400", async () => {
		const { status, data } = await creer<{ error: string }>({ title: "  " });
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Titre requis" });
	});

	test("le corps conserve ses sauts de ligne à travers HTTP", async () => {
		// Les prompts sont des gabarits collés dans un LLM : perdre la mise en
		// forme changerait la sortie.
		const body = "Contexte :\n- {package}\n\nQuestion ?";
		expect((await creer({ title: "t", body })).data.body).toBe(body);
	});

	test("les tags sont normalisés", async () => {
		const { data } = await creer({ title: "t", tags: [" a ", "a", ""] });
		expect(data.tags).toEqual(["a"]);
	});
});

describe("PUT /api/prompts/:id", () => {
	test("met à jour les trois champs", async () => {
		const { data: cree } = await creer({ title: "avant", body: "a" });
		const { status, data } = await srv.json<Prompt>(`/api/prompts/${cree.id}`, {
			...jsonBody({ title: "après", body: "b", tags: ["x"] }),
			method: "PUT",
		});
		expect(status).toBe(200);
		expect(data.title).toBe("après");
		expect(data.body).toBe("b");
		expect(data.tags).toEqual(["x"]);
	});

	test("un identifiant inconnu renvoie 404, pas 500", async () => {
		// `updatePrompt` lève sur un id absent : la route doit traduire cela en 404.
		const { status, data } = await srv.json("/api/prompts/999999", {
			...jsonBody({ title: "t" }),
			method: "PUT",
		});
		expect(status).toBe(404);
		expect(data).toEqual({ error: "Prompt introuvable" });
	});

	test("un corps invalide renvoie 400 avant toute écriture", async () => {
		const { data: cree } = await creer({ title: "intact" });
		const { status } = await srv.json(`/api/prompts/${cree.id}`, {
			...jsonBody({ title: "" }),
			method: "PUT",
		});
		expect(status).toBe(400);

		const { data } = await srv.json<Prompt[]>("/api/prompts");
		expect(data[0]?.title).toBe("intact");
	});

	test("omettre les tags les vide", async () => {
		// Le schéma applique son défaut : le champ absent vaut liste vide, donc la
		// mise à jour est un remplacement, jamais une fusion.
		const { data: cree } = await creer({ title: "t", tags: ["a", "b"] });
		const { data } = await srv.json<Prompt>(`/api/prompts/${cree.id}`, {
			...jsonBody({ title: "t" }),
			method: "PUT",
		});
		expect(data.tags).toEqual([]);
	});
});

describe("DELETE /api/prompts/:id", () => {
	test("supprime le prompt et renvoie 204", async () => {
		const { data: cree } = await creer({ title: "à jeter" });
		const res = await srv.request(`/api/prompts/${cree.id}`, {
			method: "DELETE",
		});
		expect(res.status).toBe(204);

		const { data } = await srv.json<Prompt[]>("/api/prompts");
		expect(data).toEqual([]);
	});

	test("un identifiant inconnu renvoie aussi 204 — écart documenté", async () => {
		const res = await srv.request("/api/prompts/999999", { method: "DELETE" });
		expect(res.status).toBe(204);
	});
});
