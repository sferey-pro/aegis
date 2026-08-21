import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

import { createTempDb, useTempDb } from "./db";
import { fetchCalls, lastFetchCall, mockFetch, restoreFetch } from "./http";

describe("helper: mockFetch", () => {
	afterEach(restoreFetch);

	test("sert le corps déclaré, forme courte", async () => {
		mockFetch({ "/api/tags": [{ id: 1, name: "prod" }] });
		const res = await fetch("/api/tags");
		expect(res.ok).toBe(true);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([{ id: 1, name: "prod" }]);
	});

	test("distingue la méthode", async () => {
		mockFetch({
			"GET /api/tags": [],
			"POST /api/tags": { body: { id: 1 }, status: 201 },
		});
		expect((await fetch("/api/tags")).status).toBe(200);
		expect((await fetch("/api/tags", { method: "POST" })).status).toBe(201);
	});

	test("un statut >= 400 rend ok faux", async () => {
		mockFetch({ "/api/stats": { status: 500, body: { error: "boom" } } });
		const res = await fetch("/api/stats");
		expect(res.ok).toBe(false);
		expect(res.status).toBe(500);
	});

	test("invalidJson fait échouer res.json()", async () => {
		mockFetch({ "/api/stats": { invalidJson: true } });
		const res = await fetch("/api/stats");
		expect(res.ok).toBe(true);
		await expect(res.json()).rejects.toThrow();
	});

	test("networkError fait rejeter fetch lui-même", async () => {
		mockFetch({ "/api/stats": { networkError: "ECONNREFUSED" } });
		await expect(fetch("/api/stats")).rejects.toThrow("ECONNREFUSED");
	});

	test("enregistre méthode, chemin et corps décodé", async () => {
		mockFetch({ "POST /api/annotations": { body: { ok: true } } });
		await fetch("/api/annotations", {
			method: "POST",
			body: JSON.stringify({ cve: "CVE-1", projectId: 7 }),
		});
		expect(fetchCalls()).toHaveLength(1);
		expect(lastFetchCall()).toEqual({
			method: "POST",
			url: "/api/annotations",
			body: { cve: "CVE-1", projectId: 7 },
		});
	});

	test("l'URL absolue est réduite au chemin", async () => {
		mockFetch({ "/api/tags": [] });
		await fetch("http://localhost:3001/api/tags");
		expect(lastFetchCall()?.url).toBe("/api/tags");
	});

	test("restoreFetch remet le fetch d'origine", () => {
		const avant = globalThis.fetch;
		mockFetch({ "/api/tags": [] });
		expect(globalThis.fetch).not.toBe(avant);
		restoreFetch();
		expect(globalThis.fetch).toBe(avant);
	});
});

describe("helper: base jetable, contrôle manuel", () => {
	test("le chemin est absolu, hors du dépôt, et unique", () => {
		const a = createTempDb("x");
		const b = createTempDb("x");
		expect(a.path.startsWith("/")).toBe(true);
		expect(a.path).not.toContain("/project/aegis");
		expect(a.path).not.toBe(b.path);
	});

	test("open crée le fichier, destroy le supprime avec ses compagnons", () => {
		const db = createTempDb("cycle");
		expect(existsSync(db.path)).toBe(false);

		db.open();
		expect(existsSync(db.path)).toBe(true);

		db.destroy();
		for (const s of ["", "-wal", "-shm"]) {
			expect(existsSync(`${db.path}${s}`)).toBe(false);
		}
	});
});

describe("helper: base jetable câblée sur le cycle de vie", () => {
	const db = useTempDb("cycle-auto");
	const vus: string[] = [];

	test("premier test : la base existe", () => {
		expect(existsSync(db().path)).toBe(true);
		vus.push(db().path);
	});

	test("second test : c'est une base neuve", () => {
		expect(existsSync(db().path)).toBe(true);
		expect(vus).not.toContain(db().path);
	});
});
