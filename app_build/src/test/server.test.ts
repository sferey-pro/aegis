import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

import { jsonBody, startTestServer, type TestServer } from "./server";

describe("helper: serveur de test", () => {
	let srv: TestServer;

	beforeAll(async () => {
		srv = await startTestServer("helper");
	});

	afterAll(() => {
		srv.stop();
	});

	test("écoute sur un port attribué automatiquement", () => {
		expect(srv.port).toBeGreaterThan(0);
		expect(srv.port).not.toBe(3001);
		expect(srv.url).toContain(String(srv.port));
	});

	test("la base est jetable et hors du dépôt", () => {
		expect(srv.dbPath.startsWith("/")).toBe(true);
		expect(srv.dbPath).not.toContain("/project/aegis");
		expect(srv.dbPath).toContain("aegis-helper-");
	});

	test("répond aux requêtes réelles", async () => {
		const { status, data } = await srv.json<unknown[]>("/api/tags");
		expect(status).toBe(200);
		expect(data).toEqual([]);
	});

	test("les écritures atteignent la base jetable, pas audit.sqlite", async () => {
		const cree = await srv.json<{ id: number; name: string }>(
			"/api/tags",
			jsonBody({ name: "issu-du-helper", color: "teal" }),
		);
		expect(cree.status).toBe(201);
		expect(cree.data.name).toBe("issu-du-helper");

		const relu = await srv.json<{ name: string }[]>("/api/tags");
		expect(relu.data.map((t) => t.name)).toEqual(["issu-du-helper"]);

		// La base de travail n'a pas été touchée : le serveur de test écrit ailleurs.
		expect(srv.dbPath).not.toContain("audit.sqlite");
		expect(existsSync(srv.dbPath)).toBe(true);
	});

	test("la validation du contrat est bien celle du vrai serveur", async () => {
		// Aucun mock ici : c'est le code de production qui répond.
		const vide = await srv.json<{ error: string }>(
			"/api/projects",
			jsonBody({}),
		);
		expect(vide.status).toBe(400);
		expect(vide.data.error).toBe("Nom requis");

		const mauvaisType = await srv.json<{ error: string }>(
			"/api/projects",
			jsonBody({ name: "X", path: "/tmp", type: "php", tool: "npm" }),
		);
		expect(mauvaisType.status).toBe(400);
		expect(mauvaisType.data.error).toBe("Type invalide (node|composer)");
	});
});
