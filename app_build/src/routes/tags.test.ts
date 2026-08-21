import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { getDb } from "@/db";
import type { Tag } from "@/db/tags";
import { jsonBody, startTestServer, type TestServer } from "@/test/server";

let srv: TestServer;

beforeAll(async () => {
	srv = await startTestServer("tags");
});
afterAll(() => srv.stop());
beforeEach(() => {
	getDb().query("DELETE FROM tags").run();
});

/** Le paramètre de type permet aux tests d'erreur d'attendre `{ error }`. */
function creer<T = Tag>(body: unknown) {
	return srv.json<T>("/api/tags", jsonBody(body));
}

describe("GET /api/tags", () => {
	test("un référentiel vide renvoie une liste vide", async () => {
		const { status, data } = await srv.json<Tag[]>("/api/tags");
		expect(status).toBe(200);
		expect(data).toEqual([]);
	});

	test("les tags sont triés par nom", async () => {
		await creer({ name: "zod" });
		await creer({ name: "api" });
		const { data } = await srv.json<Tag[]>("/api/tags");
		expect(data.map((t) => t.name)).toEqual(["api", "zod"]);
	});
});

describe("POST /api/tags", () => {
	test("crée le tag et renvoie 201", async () => {
		const { status, data } = await creer({ name: "backend", color: "emerald" });
		expect(status).toBe(201);
		expect(data.name).toBe("backend");
		expect(data.color).toBe("emerald");
	});

	test("le nom est trimé et la couleur par défaut est indigo", async () => {
		const { data } = await creer({ name: "  backend  " });
		expect(data.name).toBe("backend");
		expect(data.color).toBe("indigo");
	});

	test("une couleur hors palette retombe sur indigo sans échouer", async () => {
		// Le champ pilote une classe Tailwind : une valeur libre donnerait un badge
		// sans style. Refuser la requête serait plus brutal que nécessaire.
		const { status, data } = await creer({ name: "t", color: "#ff0000" });
		expect(status).toBe(201);
		expect(data.color).toBe("indigo");
	});

	test("un nom vide renvoie 400", async () => {
		const { status, data } = await creer<{ error: string }>({ name: "   " });
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Nom requis" });
	});

	test("un doublon renvoie 400 avec un message lisible", async () => {
		await creer({ name: "backend" });
		const { status, data } = await creer<{ error: string }>({
			name: "backend",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Un tag avec ce nom existe déjà" });
	});

	test("le doublon est détecté après trim", async () => {
		await creer({ name: "backend" });
		expect((await creer({ name: " backend " })).status).toBe(400);
	});

	test("un JSON illisible renvoie 400 « JSON invalide »", async () => {
		const { status, data } = await srv.json("/api/tags", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "JSON invalide" });
	});
});

describe("DELETE /api/tags/:id", () => {
	test("supprime le tag et renvoie 204 sans corps", async () => {
		const { data } = await creer({ name: "temporaire" });
		const res = await srv.request(`/api/tags/${data.id}`, {
			method: "DELETE",
		});
		expect(res.status).toBe(204);
		expect(await res.text()).toBe("");

		const { data: liste } = await srv.json<Tag[]>("/api/tags");
		expect(liste).toEqual([]);
	});

	test("un identifiant inconnu renvoie aussi 204 — écart documenté", async () => {
		// La suppression est idempotente et la route ne vérifie pas l'existence :
		// l'interface ne peut pas distinguer « supprimé » de « inexistant ».
		const res = await srv.request("/api/tags/999999", { method: "DELETE" });
		expect(res.status).toBe(204);
	});

	test("un identifiant non numérique ne lève pas", async () => {
		const res = await srv.request("/api/tags/abc", { method: "DELETE" });
		expect(res.status).toBe(204);
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
	// N37 — 404 sur un identifiant inexistant.
	test.failing("un identifiant inconnu renvoie 404 (N37)", async () => {
		const res = await srv.request("/api/tags/999999", { method: "DELETE" });
		expect(res.status).toBe(404);
	});
});
