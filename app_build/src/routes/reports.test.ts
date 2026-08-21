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
