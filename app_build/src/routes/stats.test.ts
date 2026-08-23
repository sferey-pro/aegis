import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { getDb } from "@/db";
import { upsertAnnotation } from "@/db/annotations";
import { createProject, type Project } from "@/db/projects";
import { addRun, type RunCounts } from "@/db/runs";
import type { Vulnerability } from "@/lib/parsers/types";
import { startTestServer, type TestServer } from "@/test/server";
import type { HistoryPoint, StatsResponse } from "./stats";

let srv: TestServer;

beforeAll(async () => {
	srv = await startTestServer("stats");
});
afterAll(() => srv.stop());
beforeEach(() => {
	getDb().query("DELETE FROM projects").run();
});

function projet(nom: string, over: Record<string, unknown> = {}): Project {
	return createProject({
		name: nom,
		path: `/srv/${nom}`,
		type: "node",
		tool: "npm",
		...over,
	});
}

function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
	return {
		package: "lodash",
		severity: "critical",
		title: "Prototype pollution",
		cve: "CVE-2020-8203",
		link: null,
		versionRange: null,
		...over,
	};
}

function compte(over: Partial<RunCounts> = {}): RunCounts {
	return {
		critical: 0,
		high: 0,
		moderate: 0,
		low: 0,
		info: 0,
		unknown: 0,
		...over,
	};
}

function run(
	projectId: number,
	vulns: Vulnerability[],
	counts = compte(),
	status: "ok" | "vulnerable" | "error" = "vulnerable",
) {
	return addRun({
		project_id: projectId,
		status,
		total: vulns.length,
		counts,
		vulnerabilities: vulns,
		command: "npm audit --json",
		commit_sha: null,
		error: null,
		duration_ms: 5,
	});
}

function stats() {
	return srv.json<StatsResponse>("/api/stats");
}

describe("GET /api/stats", () => {
	test("un parc vide renvoie un tableau de bord neutre", async () => {
		const { status, data } = await stats();
		expect(status).toBe(200);
		expect(data.monitoredProjects).toBe(0);
		expect(data.criticalVulnerabilities).toBe(0);
		expect(data.pendingCves).toBe(0);
		expect(data.lastSync).toBeNull();
		expect(data.topProjects).toEqual([]);
		expect(data.topCves).toEqual([]);
	});

	test("un parc sain obtient la note A", async () => {
		const p = projet("sain");
		run(p.id, [], compte(), "ok");
		const { data } = await stats();
		expect(data.healthGrade).toBe("A");
	});

	test("les projets ignorés ne sont pas comptés comme surveillés", async () => {
		projet("actif");
		projet("ignore", { ignored: true });
		expect((await stats()).data.monitoredProjects).toBe(1);
	});

	test("les CVE critiques sont comptées une fois par groupe, pas par occurrence", async () => {
		// C'est l'unité de décision : une CVE présente sur trois projets reste une
		// seule faille à traiter.
		const a = projet("a");
		const b = projet("b");
		run(a.id, [vuln()], compte({ critical: 1 }));
		run(b.id, [vuln()], compte({ critical: 1 }));

		const { data } = await stats();
		expect(data.criticalVulnerabilities).toBe(1);
	});

	test("les CVE en attente sont comptées par occurrence", async () => {
		// Là c'est l'inverse : chaque projet doit être trié séparément.
		const a = projet("a");
		const b = projet("b");
		run(a.id, [vuln()], compte({ critical: 1 }));
		run(b.id, [vuln()], compte({ critical: 1 }));

		expect((await stats()).data.pendingCves).toBe(2);
	});

	test("une CVE triée sort du compte des CVE en attente", async () => {
		const p = projet("triage");
		run(p.id, [vuln()], compte({ critical: 1 }));
		upsertAnnotation("CVE-2020-8203", p.id, { status: "not_affected" });
		expect((await stats()).data.pendingCves).toBe(0);
	});

	test("la note baisse avec la gravité accumulée", async () => {
		const p = projet("degrade");
		run(
			p.id,
			[
				vuln({ cve: "CVE-2020-1111", severity: "critical" }),
				vuln({ cve: "CVE-2020-2222", severity: "critical" }),
			],
			compte({ critical: 2 }),
		);
		// 100 - 2 x 20 = 60 -> C
		expect((await stats()).data.healthGrade).toBe("C");
	});

	test("cinq CVE critiques donnent la note F", async () => {
		const p = projet("f");
		run(
			p.id,
			Array.from({ length: 5 }, (_, i) =>
				vuln({ cve: `CVE-2020-100${i}`, severity: "critical" }),
			),
			compte({ critical: 5 }),
		);
		expect((await stats()).data.healthGrade).toBe("F");
	});

	test("lastSync retient la date du run le plus récent", async () => {
		const a = projet("a");
		const b = projet("b");
		const ancien = run(a.id, [], compte(), "ok");
		const recent = run(b.id, [], compte(), "ok");
		getDb()
			.query("UPDATE runs SET ran_at = '2020-01-01 00:00:00' WHERE id = ?")
			.run(ancien.id);

		const { data } = await stats();
		expect(data.lastSync).not.toBe("2020-01-01 00:00:00");
		expect(data.lastSync).toBe(
			(
				getDb()
					.query("SELECT ran_at FROM runs WHERE id = ?")
					.get(recent.id) as { ran_at: string }
			).ran_at,
		);
	});

	test("le score de risque pondère critique, haute et moyenne", async () => {
		// 20 / 10 / 2 : deux failles moyennes ne doivent pas peser autant qu'une
		// critique dans le classement.
		const p = projet("risque");
		run(p.id, [vuln()], compte({ critical: 1, high: 2, moderate: 3 }));

		const { data } = await stats();
		expect(data.topProjects[0]?.risk).toBe(20 + 20 + 6);
		expect(data.topProjects[0]?.critical).toBe(1);
		expect(data.topProjects[0]?.high).toBe(2);
	});

	test("un projet sans faille n'apparaît pas au classement des risques", async () => {
		const sain = projet("sain");
		const risque = projet("risque");
		run(sain.id, [], compte(), "ok");
		run(risque.id, [vuln()], compte({ critical: 1 }));

		const { data } = await stats();
		expect(data.topProjects.map((p) => p.name)).toEqual(["risque"]);
	});

	test("le classement des risques est limité à trois projets", async () => {
		for (let i = 0; i < 5; i++) {
			const p = projet(`p${i}`);
			run(p.id, [vuln()], compte({ critical: i + 1 }));
		}
		const { data } = await stats();
		expect(data.topProjects).toHaveLength(3);
		expect(data.topProjects[0]?.risk).toBeGreaterThan(
			data.topProjects[2]?.risk as number,
		);
	});

	test("les CVE les plus répandues sont classées par nombre d'occurrences", async () => {
		const a = projet("a");
		const b = projet("b");
		run(a.id, [vuln({ cve: "CVE-PARTOUT" }), vuln({ cve: "CVE-ISOLEE" })]);
		run(b.id, [vuln({ cve: "CVE-PARTOUT" })]);

		const { data } = await stats();
		expect(data.topCves[0]?.cve).toBe("CVE-PARTOUT");
		expect(data.topCves[0]?.count).toBe(2);
		expect(data.topCves[0]?.title).toBe("Prototype pollution");
	});

	test("le classement des CVE est limité à trois entrées", async () => {
		const p = projet("beaucoup");
		run(
			p.id,
			Array.from({ length: 6 }, (_, i) => vuln({ cve: `CVE-2020-200${i}` })),
		);
		expect((await stats()).data.topCves).toHaveLength(3);
	});

	test("un projet dont le dernier run est en erreur ne fausse pas les compteurs", async () => {
		// L'agrégation l'exclut, mais son run reste le plus récent : `lastSync`
		// avance sans qu'aucune faille ne soit comptée.
		const p = projet("erreur");
		run(p.id, [], compte(), "error");
		const { data } = await stats();
		expect(data.criticalVulnerabilities).toBe(0);
		expect(data.lastSync).not.toBeNull();
	});

	test("le compte de projets ignore l'existence de runs", async () => {
		projet("sans-run");
		expect((await stats()).data.monitoredProjects).toBe(1);
	});
});

describe("GET /api/history-global", () => {
	function jourCourant() {
		return new Date().toISOString().slice(0, 10);
	}

	test("une base vide renvoie une série de buckets à zéro", async () => {
		const { status, data } = await srv.json<HistoryPoint[]>(
			"/api/history-global",
		);
		expect(status).toBe(200);
		expect(data.length).toBeGreaterThan(0);
		expect(data.every((p) => p.counts.critical === 0 && p.total === 0)).toBe(
			true,
		);
	});

	test("chaque point porte une date ISO et un libellé (N13)", async () => {
		// `date` portait un libellé d'affichage « JJ/MM » et la donnée métier vivait
		// dans un `rawDate` additionnel. §4 demande `date: "YYYY-MM-DD"`.
		const { data } = await srv.json<HistoryPoint[]>("/api/history-global");
		expect(data[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(data[0]?.label).toMatch(/^\d{2}\/\d{2}$/);
	});

	test("le paramètre days détermine la largeur de la fenêtre", async () => {
		const sept = (await srv.json<HistoryPoint[]>("/api/history-global?days=7"))
			.data;
		const trente = (
			await srv.json<HistoryPoint[]>("/api/history-global?days=30")
		).data;
		expect(trente.length).toBeGreaterThan(sept.length);
	});

	test("un run alimente le jour de son exécution", async () => {
		const p = projet("historique");
		const r = run(p.id, [vuln()], compte({ critical: 2, high: 1 }));
		getDb()
			.query("UPDATE runs SET ran_at = ? WHERE id = ?")
			.run(`${jourCourant()} 10:00:00`, r.id);

		const { data } = await srv.json<HistoryPoint[]>(
			"/api/history-global?days=7",
		);
		expect(data.at(-1)?.counts.critical).toBe(2);
		expect(data.at(-1)?.counts.high).toBe(1);
		expect(data.at(-1)?.total).toBe(3);
	});

	test("les projets ignorés sont exclus de la série", async () => {
		const p = projet("ignore-hist", { ignored: true });
		const r = run(p.id, [vuln()], compte({ critical: 5 }));
		getDb()
			.query("UPDATE runs SET ran_at = ? WHERE id = ?")
			.run(`${jourCourant()} 10:00:00`, r.id);

		const { data } = await srv.json<HistoryPoint[]>(
			"/api/history-global?days=7",
		);
		expect(data.at(-1)?.counts.critical).toBe(0);
	});

	test("chaque point porte les six sévérités et un total (N13)", async () => {
		const { data } = await srv.json<HistoryPoint[]>(
			"/api/history-global?days=7",
		);
		expect(Object.keys(data[0]?.counts ?? {}).sort()).toEqual([
			"critical",
			"high",
			"info",
			"low",
			"moderate",
			"unknown",
		]);
		expect(data[0]?.total).toBe(0);
	});

	test("un days non numérique est rejeté en 400 (N13)", async () => {
		// `parseInt("abc")` valait NaN, la boucle de buckets ne tournait pas, et la
		// réponse était `[]` en **200** : un graphique vide sans message, que rien ne
		// distinguait d'un parc sans historique.
		const { status, data } = await srv.json<{ error: string }>(
			"/api/history-global?days=abc",
		);
		expect(status).toBe(400);
		expect(data.error).toContain("Fenêtre invalide");
	});

	test("un days démesuré est rejeté (N13)", async () => {
		// `?days=100000` construisait cent mille buckets, chacun parcourant la map
		// d'état de tous les projets — sur un process unique, l'API se bloquait.
		const { status } = await srv.json("/api/history-global?days=100000");
		expect(status).toBe(400);
	});

	test("un days nul ou négatif est rejeté", async () => {
		for (const valeur of ["0", "-3"]) {
			const { status } = await srv.json(`/api/history-global?days=${valeur}`);
			expect(status).toBe(400);
		}
	});

	test("un days fractionnaire est rejeté", async () => {
		// `parseInt("7.5")` valait 7 en silence : la fenêtre demandée n'était pas
		// celle rendue.
		const { status } = await srv.json("/api/history-global?days=7.5");
		expect(status).toBe(400);
	});

	test("les bornes sont acceptées", async () => {
		expect((await srv.json("/api/history-global?days=1")).status).toBe(200);
		expect((await srv.json("/api/history-global?days=365")).status).toBe(200);
	});

	test("days absent retombe sur trente jours", async () => {
		const defaut = (await srv.json<HistoryPoint[]>("/api/history-global")).data;
		const trente = (
			await srv.json<HistoryPoint[]>("/api/history-global?days=30")
		).data;
		expect(defaut.length).toBe(trente.length);
	});
});
