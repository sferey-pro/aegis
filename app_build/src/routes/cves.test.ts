import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { getDb } from "@/db";
import { getAdvisoryDb } from "@/db/advisories";
import { upsertAnnotation } from "@/db/annotations";
import { createProject, type Project } from "@/db/projects";
import { addRun } from "@/db/runs";
import type { CveGroup } from "@/lib/aggregator";
import { getCachedAdvisory, putCachedAdvisory } from "@/lib/github";
import type { Vulnerability } from "@/lib/parsers/types";
import { jsonBody, startTestServer, type TestServer } from "@/test/server";

let srv: TestServer;
const natif = globalThis.fetch;

beforeAll(async () => {
	srv = await startTestServer("cves");
});
afterAll(() => srv.stop());
beforeEach(() => {
	getDb().query("DELETE FROM projects").run();
	// Le cache d'avis vit dans un fichier séparé depuis le 22/08/2026.
	getAdvisoryDb().query("DELETE FROM advisory_cache").run();
});
afterEach(() => {
	globalThis.fetch = natif;
});

function projet(nom = "api"): Project {
	return createProject({
		name: nom,
		path: `/srv/${nom}`,
		type: "node",
		tool: "npm",
	});
}

function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
	return {
		package: "lodash",
		severity: "high",
		title: "Prototype pollution",
		cve: "CVE-2020-8203",
		link: null,
		versionRange: "<4.17.21",
		...over,
	};
}

function run(projectId: number, vulns: Vulnerability[]) {
	return addRun({
		project_id: projectId,
		status: vulns.length ? "vulnerable" : "ok",
		total: vulns.length,
		counts: {
			critical: 0,
			high: vulns.length,
			moderate: 0,
			low: 0,
			info: 0,
			unknown: 0,
		},
		vulnerabilities: vulns,
		command: "npm audit --json",
		commit_sha: null,
		error: null,
		duration_ms: 5,
	});
}

describe("GET /api/cves", () => {
	test("un parc sans faille renvoie une liste vide", async () => {
		const { status, data } = await srv.json<CveGroup[]>("/api/cves");
		expect(status).toBe(200);
		expect(data).toEqual([]);
	});

	test("les groupes sont renvoyés avec leurs occurrences", async () => {
		const a = projet("a");
		const b = projet("b");
		run(a.id, [vuln()]);
		run(b.id, [vuln()]);

		const { data } = await srv.json<CveGroup[]>("/api/cves");
		expect(data).toHaveLength(1);
		expect(data[0]?.cve).toBe("CVE-2020-8203");
		expect(data[0]?.occurrences).toHaveLength(2);
	});

	test("le statut de triage est reporté sur l'occurrence", async () => {
		const p = projet();
		run(p.id, [vuln()]);
		upsertAnnotation("CVE-2020-8203", p.id, { status: "confirmed" });

		const { data } = await srv.json<CveGroup[]>("/api/cves");
		expect(data[0]?.occurrences[0]?.status).toBe("confirmed");
	});

	test("un projet ignoré n'apparaît pas", async () => {
		const p = projet();
		run(p.id, [vuln()]);
		getDb().query("UPDATE projects SET ignored = 1 WHERE id = ?").run(p.id);
		expect((await srv.json<CveGroup[]>("/api/cves")).data).toEqual([]);
	});

	test("les groupes arrivent triés par gravité", async () => {
		const p = projet();
		run(p.id, [
			vuln({ cve: "CVE-2020-1111", severity: "low" }),
			vuln({ cve: "CVE-2020-2222", severity: "critical" }),
		]);
		const { data } = await srv.json<CveGroup[]>("/api/cves");
		expect(data.map((g) => g.worst)).toEqual(["critical", "low"]);
	});
});

describe("POST /api/advisories/sync", () => {
	test("un avis récupéré remplace la version en cache", async () => {
		// C'est l'action « rafraîchir » de l'écran Triage : elle existe pour
		// contourner le cache quand GitHub a corrigé une sévérité.
		putCachedAdvisory("CVE-2020-8203", "low", {});
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response(
					JSON.stringify([
						{
							severity: "critical",
							html_url: "https://x",
							vulnerabilities: [],
						},
					]),
					{ headers: { "content-type": "application/json" } },
				),
			)) as unknown as typeof fetch;

		const { status, data } = await srv.json<{
			success: boolean;
			advisory: { severity: string };
		}>("/api/advisories/sync", jsonBody({ cve: "CVE-2020-8203" }));

		expect(status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.advisory.severity).toBe("critical");
		expect(getCachedAdvisory("CVE-2020-8203")?.severity).toBe("critical");
	});

	test("sans identifiant exploitable, success vaut faux", async () => {
		const { status, data } = await srv.json<{ success: boolean }>(
			"/api/advisories/sync",
			jsonBody({ cve: null, link: null }),
		);
		expect(status).toBe(200);
		expect(data.success).toBe(false);
	});

	test("un échec réseau renvoie success faux, pas une erreur serveur", async () => {
		globalThis.fetch = (() =>
			Promise.reject(new Error("hors ligne"))) as unknown as typeof fetch;
		const { status, data } = await srv.json<{ success: boolean }>(
			"/api/advisories/sync",
			jsonBody({ cve: "CVE-2020-8203" }),
		);
		expect(status).toBe(200);
		expect(data.success).toBe(false);
	});
});

describe("POST /api/advisories/sync-all", () => {
	/** Réponse GitHub, éventuellement retardée pour tenir le verrou ouvert. */
	function stubAvis(severity = "critical", delaiMs = 0) {
		globalThis.fetch = (() =>
			new Promise((resolve) => {
				const repondre = () =>
					resolve(
						new Response(
							JSON.stringify([
								{ severity, html_url: "https://x", vulnerabilities: [] },
							]),
							{ headers: { "content-type": "application/json" } },
						),
					);
				if (delaiMs) setTimeout(repondre, delaiMs);
				else repondre();
			})) as unknown as typeof fetch;
	}

	test("sur un parc vide, le bilan est à zéro", async () => {
		const { status, data } = await srv.json<{
			success: boolean;
			total: number;
			fetched: number;
		}>("/api/advisories/sync-all", { method: "POST" });

		expect(status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.total).toBe(0);
		expect(data.fetched).toBe(0);
	});

	test("elle remplit le cache pour les CVE du parc", async () => {
		const p = projet("a");
		run(p.id, [vuln()]);
		stubAvis("critical");

		const { status, data } = await srv.json<{
			total: number;
			fetched: number;
			alreadyCached: number;
		}>("/api/advisories/sync-all", { method: "POST" });

		expect(status).toBe(200);
		expect(data).toMatchObject({ total: 1, fetched: 1, alreadyCached: 0 });
		expect(getCachedAdvisory("CVE-2020-8203")?.severity).toBe("critical");
	});

	test("l'enrichissement est visible sans réauditer", async () => {
		// C'est la raison d'être du bouton. L'agrégateur superpose le cache aux
		// runs à la lecture : si la sévérité affichée n'avait bougé qu'au prochain
		// audit, remplir le cache n'aurait rien changé à l'écran.
		const p = projet("a");
		run(p.id, [vuln({ severity: "low" })]);
		expect((await srv.json<CveGroup[]>("/api/cves")).data[0]?.worst).toBe(
			"low",
		);

		stubAvis("critical");
		await srv.json("/api/advisories/sync-all", { method: "POST" });

		const { data } = await srv.json<CveGroup[]>("/api/cves");
		expect(data[0]?.worst).toBe("critical");
		expect(data[0]?.occurrences[0]?.severity).toBe("critical");
	});

	test("une seconde passe ne redemande rien", async () => {
		const p = projet("a");
		run(p.id, [vuln()]);
		stubAvis("high");
		await srv.json("/api/advisories/sync-all", { method: "POST" });

		const { data } = await srv.json<{
			fetched: number;
			alreadyCached: number;
		}>("/api/advisories/sync-all", { method: "POST" });

		// Le quota GitHub est la ressource rare : un second clic ne doit pas le
		// brûler pour rien.
		expect(data).toMatchObject({ fetched: 0, alreadyCached: 1 });
	});

	test("une passe déjà en cours répond 409", async () => {
		const p = projet("a");
		run(p.id, [vuln()]);
		stubAvis("high", 60);

		const premiere = srv.json("/api/advisories/sync-all", { method: "POST" });
		// La première requête tient le verrou le temps de son appel réseau simulé.
		const seconde = await srv.json<{ success: boolean; error: string }>(
			"/api/advisories/sync-all",
			{ method: "POST" },
		);

		expect(seconde.status).toBe(409);
		expect(seconde.data.error).toContain("déjà en cours");
		await premiere;
	});

	test("le verrou est relâché après la passe", async () => {
		const p = projet("a");
		run(p.id, [vuln()]);
		stubAvis("high", 20);

		await srv.json("/api/advisories/sync-all", { method: "POST" });
		const { status } = await srv.json("/api/advisories/sync-all", {
			method: "POST",
		});

		// Un verrou non relâché rendrait le bouton mort jusqu'au redémarrage.
		expect(status).toBe(200);
	});

	test("un échec réseau n'immobilise pas le verrou", async () => {
		const p = projet("a");
		run(p.id, [vuln()]);
		globalThis.fetch = (() =>
			Promise.reject(new Error("hors ligne"))) as unknown as typeof fetch;

		await srv.json("/api/advisories/sync-all", { method: "POST" });
		const { status } = await srv.json("/api/advisories/sync-all", {
			method: "POST",
		});
		expect(status).toBe(200);
	});
});

describe("DELETE /api/advisories/cache", () => {
	test("vide entièrement le cache d'avis", async () => {
		putCachedAdvisory("CVE-2020-8203", "high", {});
		putCachedAdvisory("GHSA-JF85-CPCP-J695", "low", {});

		const { status, data } = await srv.json("/api/advisories/cache", {
			method: "DELETE",
		});
		expect(status).toBe(200);
		expect(data).toEqual({ success: true });
		expect(getCachedAdvisory("CVE-2020-8203")).toBeNull();
	});

	test("vider un cache déjà vide réussit", async () => {
		const { status } = await srv.json("/api/advisories/cache", {
			method: "DELETE",
		});
		expect(status).toBe(200);
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
	// N35 — un corps illisible doit répondre 400 « JSON invalide », comme partout
	// ailleurs, plutôt que 500 via le gestionnaire d'erreur global.
	test("un JSON illisible renvoie 400 « JSON invalide » (N35)", async () => {
		const { status, data } = await srv.json("/api/advisories/sync", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "JSON invalide" });
	});
});
