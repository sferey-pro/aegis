import { describe, expect, test } from "bun:test";

import type { Vulnerability } from "@/lib/parsers/types";
import { useTempDb } from "@/test/db";
import { getDb } from "./index";
import { createReport, deleteReport, getReports } from "./reports";
import type { RunCounts } from "./runs";

const counts: RunCounts = {
	critical: 1,
	high: 2,
	moderate: 0,
	low: 0,
	info: 0,
	unknown: 0,
};

function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
	return {
		package: "lodash",
		severity: "critical",
		title: "Prototype pollution",
		cve: "CVE-2024-1",
		link: null,
		versionRange: null,
		...over,
	};
}

function rapport(over: Partial<Parameters<typeof createReport>[0]> = {}) {
	return createReport({
		projects_audited: 3,
		total_vulnerabilities: 3,
		counts,
		details: [{ projectId: 1, projectName: "api", vulns: [vuln()] }],
		...over,
	});
}

describe("db/reports", () => {
	useTempDb("reports");

	test("une base neuve n'a aucun compte-rendu", () => {
		expect(getReports()).toEqual([]);
	});

	test("createReport réhydrate counts et details", () => {
		const r = rapport();
		expect(r.projects_audited).toBe(3);
		expect(r.total_vulnerabilities).toBe(3);
		expect(r.counts).toEqual(counts);
		expect(r.details[0]?.projectName).toBe("api");
		expect(r.details[0]?.vulns[0]?.cve).toBe("CVE-2024-1");
	});

	test("les colonnes JSON sont stockées en chaîne", () => {
		const r = rapport();
		const brut = getDb()
			.query("SELECT counts, details FROM reports WHERE id = ?")
			.get(r.id) as { counts: string; details: string };
		expect(typeof brut.counts).toBe("string");
		expect(typeof brut.details).toBe("string");
	});

	test("un audit sans vulnérabilité donne un details vide, pas null", () => {
		const r = rapport({ total_vulnerabilities: 0, details: [] });
		expect(r.details).toEqual([]);
		expect(getReports()[0]?.details).toEqual([]);
	});

	test("le détail est un instantané : il survit à la suppression du projet", () => {
		// C'est ce qui permet la comparaison d'un compte-rendu au précédent même
		// après retrait d'un projet du parc — les détails ne sont pas des jointures.
		const r = rapport({
			details: [{ projectId: 42, projectName: "supprimé", vulns: [vuln()] }],
		});
		getDb().query("DELETE FROM projects WHERE id = 42").run();
		expect(
			getReports().find((x) => x.id === r.id)?.details[0]?.projectName,
		).toBe("supprimé");
	});

	test("plusieurs projets dans un même compte-rendu", () => {
		const r = rapport({
			details: [
				{ projectId: 1, projectName: "api", vulns: [vuln()] },
				{
					projectId: 2,
					projectName: "web",
					vulns: [vuln({ package: "axios", cve: "CVE-2024-2" })],
				},
			],
		});
		expect(r.details).toHaveLength(2);
		expect(r.details[1]?.vulns[0]?.package).toBe("axios");
	});

	test("getReports trie du plus récent au plus ancien", () => {
		const a = rapport();
		const b = rapport();
		// L'horodatage a une résolution d'une seconde : deux appels d'affilée
		// partagent le même `created_at`, on antidate donc le premier.
		getDb()
			.query(
				"UPDATE reports SET created_at = '2020-01-01 00:00:00' WHERE id = ?",
			)
			.run(a.id);
		expect(getReports().map((r) => r.id)).toEqual([b.id, a.id]);
	});

	test("à created_at égal, l'ordre n'est pas garanti — écart documenté", () => {
		// `ORDER BY created_at DESC` sans départage par id : deux audits lancés
		// dans la même seconde peuvent remonter dans n'importe quel ordre.
		const a = rapport();
		const b = rapport();
		const ids = getReports().map((r) => r.id);
		expect(ids).toHaveLength(2);
		expect(ids.slice().sort()).toEqual([a.id, b.id].sort());
	});

	test("deleteReport retire la ligne visée seulement", () => {
		const a = rapport();
		const b = rapport();
		deleteReport(a.id);
		expect(getReports().map((r) => r.id)).toEqual([b.id]);
	});

	test("deleteReport est idempotent sur un id inexistant", () => {
		expect(() => deleteReport(999_999)).not.toThrow();
	});

	test("total_vulnerabilities n'est pas recalculé depuis counts — écart documenté", () => {
		// La table accepte un total incohérent avec la somme des sévérités : c'est
		// l'appelant qui garantit la cohérence, pas le stockage.
		const r = rapport({ total_vulnerabilities: 999 });
		expect(r.total_vulnerabilities).toBe(999);
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
	useTempDb("reports-contrats");

	// N38 — `ORDER BY created_at DESC` sans départage par `id` : deux audits d'une
	// même seconde remontent dans un ordre indéfini, alors que c'est cet ordre qui
	// décide quel compte-rendu l'écran Rapports compare au précédent.
	test.failing("à created_at égal, l'id le plus grand passe devant (N38)", () => {
		const a = rapport();
		const b = rapport();
		expect(getReports().map((r) => r.id)).toEqual([b.id, a.id]);
	});
});
