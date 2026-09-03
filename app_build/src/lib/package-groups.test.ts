import { describe, expect, test } from "bun:test";

import type { CveGroup, CveOccurrence } from "@/lib/aggregator";
import { buildPackageGroups } from "./package-groups";

function occ(over: Partial<CveOccurrence> = {}): CveOccurrence {
	return {
		projectId: 7,
		projectName: "Mon API",
		tool: "npm",
		package: "lodash",
		severity: "high",
		versionRange: "<4",
		fixedIn: "4.17.21",
		title: "Prototype pollution",
		link: null,
		status: "pending",
		note: "",
		...over,
	};
}

function groupe(cve: string, occurrences: CveOccurrence[]): CveGroup {
	return { cve, ref: cve, worst: "high", occurrences };
}

describe("lib/package-groups", () => {
	test("regroupe par (projet, paquet), toutes CVE confondues", () => {
		const groupes = buildPackageGroups([
			groupe("CVE-1", [occ(), occ({ projectId: 8, projectName: "Autre" })]),
			groupe("CVE-2", [occ({ severity: "critical" })]),
		]);
		expect(groupes.map((g) => g.key).sort()).toEqual([
			"7::lodash",
			"8::lodash",
		]);
		const lodash7 = groupes.find((g) => g.key === "7::lodash");
		expect(lodash7?.cves.map((c) => c.cve)).toEqual(["CVE-1", "CVE-2"]);
		expect(lodash7?.worstSeverity).toBe("critical");
		expect(lodash7?.pendingCount).toBe(2);
	});

	test("projectId ne garde qu'un projet", () => {
		const groupes = buildPackageGroups(
			[groupe("CVE-1", [occ(), occ({ projectId: 8 })])],
			{ projectId: 8 },
		);
		expect(groupes.map((g) => g.projectId)).toEqual([8]);
	});

	test("hideProcessed écarte les occurrences déjà statuées", () => {
		const groupes = buildPackageGroups(
			[groupe("CVE-1", [occ({ status: "ignored" })]), groupe("CVE-2", [occ()])],
			{ hideProcessed: true },
		);
		expect(groupes[0]?.cves.map((c) => c.cve)).toEqual(["CVE-2"]);
	});

	test("la recherche porte sur la référence, le paquet et le titre", () => {
		const cves = [
			groupe("CVE-1", [occ()]),
			groupe("CVE-2", [occ({ package: "axios", title: "SSRF" })]),
		];
		expect(buildPackageGroups(cves, { query: "ssrf" })[0]?.package).toBe(
			"axios",
		);
		expect(buildPackageGroups(cves, { query: "LODASH" })[0]?.package).toBe(
			"lodash",
		);
		expect(buildPackageGroups(cves, { query: "cve-2" })[0]?.package).toBe(
			"axios",
		);
		expect(buildPackageGroups(cves, { query: "rien" })).toHaveLength(0);
	});

	test("la version cible est la plus haute des correctifs connus", () => {
		const [g] = buildPackageGroups([
			groupe("CVE-1", [occ({ fixedIn: "4.17.21" })]),
			groupe("CVE-2", [occ({ fixedIn: "4.18.0" })]),
			groupe("CVE-3", [occ({ fixedIn: null })]),
		]);
		expect(g?.targetPatch).toBe("4.18.0");
	});

	test("la plus ancienne des dates porte le SLA, les illisibles sont ignorées", () => {
		const [g] = buildPackageGroups([
			groupe("CVE-1", [
				occ({ firstSeenAt: "2026-02-01", publishedAt: "pas une date" }),
			]),
			groupe("CVE-2", [
				occ({ firstSeenAt: "2026-01-01", publishedAt: "2025-12-01" }),
			]),
		]);
		expect(g?.firstSeenAt).toBe("2026-01-01");
		expect(g?.publishedAt).toBe("2025-12-01");
	});
});
