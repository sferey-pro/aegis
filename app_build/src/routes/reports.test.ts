import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { getDb } from "@/db";
import type { Report, ReportDetail } from "@/db/reports";
import { jsonBody, startTestServer, type TestServer } from "@/test/server";

let srv: TestServer;

beforeAll(async () => {
	srv = await startTestServer("reports");
});
afterAll(() => srv.stop());
beforeEach(() => {
	getDb().query("DELETE FROM reports").run();
});

const counts = {
	critical: 1,
	high: 2,
	moderate: 0,
	low: 0,
	info: 0,
	unknown: 0,
};

function creer<T = Report>(over: Record<string, unknown> = {}) {
	return srv.json<T>(
		"/api/reports",
		jsonBody({
			projects_audited: 3,
			total_vulnerabilities: 3,
			counts,
			details: [{ projectId: 1, projectName: "api", vulns: [] }],
			...over,
		}),
	);
}

describe("GET /api/reports", () => {
	test("aucun compte-rendu renvoie une liste vide", async () => {
		const { status, data } = await srv.json<Report[]>("/api/reports");
		expect(status).toBe(200);
		expect(data).toEqual([]);
	});

	test("les compte-rendus sont renvoyés avec leurs colonnes JSON décodées", async () => {
		await creer();
		const { data } = await srv.json<Report[]>("/api/reports");
		expect(data).toHaveLength(1);
		expect(data[0]?.counts).toEqual(counts);
		expect(data[0]?.details[0]?.projectName).toBe("api");
	});
});

describe("POST /api/reports", () => {
	test("crée le compte-rendu et le renvoie", async () => {
		const { status, data } = await creer();
		expect(status).toBe(200);
		expect(data.id).toBeGreaterThan(0);
		expect(data.projects_audited).toBe(3);
		expect(data.total_vulnerabilities).toBe(3);
	});

	test("un détail vide est accepté", async () => {
		const { data } = await creer({ details: [] });
		expect(data.details).toEqual([]);
	});

	test("le détail est conservé tel quel, sans inspection", async () => {
		// C'est un instantané : il doit survivre à la suppression du projet et à
		// tout changement de forme des vulnérabilités.
		const details: ReportDetail[] = [
			{
				projectId: 42,
				projectName: "api",
				vulns: [
					{
						package: "lodash",
						severity: "critical",
						title: "Prototype pollution",
						cve: "CVE-2020-8203",
						link: null,
						versionRange: "<4.17.21",
					},
				],
			},
		];
		const { data } = await creer({ details });
		expect(data.details).toEqual(details);
	});

	test("un corps sans détail est accepté et vaut liste vide", async () => {
		const { status, data } = await srv.json<Report>(
			"/api/reports",
			jsonBody({ projects_audited: 0, total_vulnerabilities: 0, counts }),
		);
		expect(status).toBe(200);
		expect(data.details).toEqual([]);
	});

	test("un JSON illisible renvoie 500 — écart documenté", async () => {
		// Cette route lit `req.json()` sans passer par `parseBody` : l'exception
		// remonte au gestionnaire d'erreur global, d'où un 500 au lieu du 400
		// « JSON invalide » servi par les autres routes.
		const { status } = await srv.json("/api/reports", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{ cassé",
		});
		expect(status).toBe(500);
	});

	test("un corps incomplet renvoie 500 — écart documenté", async () => {
		// `reportBodySchema` existe mais n'est pas branché ici : un corps sans
		// `counts` casse au moment du `JSON.stringify` en base.
		const { status } = await srv.json("/api/reports", jsonBody({}));
		expect(status).toBe(500);
	});
});

describe("DELETE /api/reports/:id", () => {
	test("supprime le compte-rendu visé", async () => {
		const { data: a } = await creer();
		const { data: b } = await creer();
		const { status, data } = await srv.json(`/api/reports/${a.id}`, {
			method: "DELETE",
		});
		expect(status).toBe(200);
		expect(data).toEqual({ success: true });

		const { data: liste } = await srv.json<Report[]>("/api/reports");
		expect(liste.map((r) => r.id)).toEqual([b.id]);
	});

	test("un identifiant inconnu répond succès — écart documenté", async () => {
		const { status, data } = await srv.json("/api/reports/999999", {
			method: "DELETE",
		});
		expect(status).toBe(200);
		expect(data).toEqual({ success: true });
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
	// N35 — `reportBodySchema` existe déjà dans src/lib/schemas.ts et n'est branché
	// nulle part : un corps illisible ou incomplet doit répondre 400, pas 500.
	test.failing("un JSON illisible renvoie 400 « JSON invalide » (N35)", async () => {
		const { status, data } = await srv.json("/api/reports", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{ cassé",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "JSON invalide" });
	});

	test.failing("un corps incomplet renvoie 400, pas 500 (N35)", async () => {
		const { status } = await srv.json("/api/reports", jsonBody({}));
		expect(status).toBe(400);
	});

	// N37 — supprimer un identifiant inexistant doit répondre 404, sinon
	// l'interface ne distingue pas « supprimé » de « n'existait pas ».
	test.failing("un identifiant inconnu renvoie 404 (N37)", async () => {
		const { status } = await srv.json("/api/reports/999999", {
			method: "DELETE",
		});
		expect(status).toBe(404);
	});
});
