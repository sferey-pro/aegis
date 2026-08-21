import { describe, expect, test } from "bun:test";

import type { Severity, Vulnerability } from "./types";
import {
	buildParseResult,
	dedupe,
	emptyCounts,
	normSeverity,
	sortVulnerabilities,
} from "./utils";

function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
	return {
		package: "lodash",
		severity: "high",
		title: "Prototype pollution",
		cve: "CVE-2024-1",
		link: null,
		versionRange: null,
		...over,
	};
}

describe("normSeverity (CONTEXT.md §3)", () => {
	test("les six sévérités canoniques sont conservées", () => {
		for (const s of ["critical", "high", "moderate", "low", "info"] as const) {
			expect(normSeverity(s)).toBe(s);
		}
	});

	test("les alias sont normalisés", () => {
		expect(normSeverity("medium")).toBe("moderate");
		expect(normSeverity("informational")).toBe("info");
	});

	test("la casse et les espaces sont ignorés", () => {
		expect(normSeverity("  CRITICAL  ")).toBe("critical");
		expect(normSeverity("High")).toBe("high");
	});

	test("toute autre valeur devient unknown", () => {
		for (const s of ["banana", "", "  ", null, undefined]) {
			expect(normSeverity(s)).toBe("unknown");
		}
	});
});

describe("dedupe (CONTEXT.md §3)", () => {
	test("la clé est package|title|cve", () => {
		const a = vuln();
		const b = vuln({
			link: "https://autre",
			versionRange: "<1",
			severity: "low",
		});
		// Même package, titre et CVE : doublon, malgré les autres champs différents.
		expect(dedupe([a, b])).toHaveLength(1);
	});

	test("la première occurrence est conservée", () => {
		const premier = vuln({ severity: "critical" });
		const second = vuln({ severity: "low" });
		expect(dedupe([premier, second])[0]?.severity).toBe("critical");
	});

	test("un titre différent n'est pas un doublon", () => {
		expect(dedupe([vuln(), vuln({ title: "Autre faille" })])).toHaveLength(2);
	});

	test("une CVE absente participe à la clé sous forme vide", () => {
		// `cve: null` et `cve: ""` produisent la même clé.
		expect(dedupe([vuln({ cve: null }), vuln({ cve: "" })])).toHaveLength(1);
	});

	test("l'ordre d'apparition est préservé", () => {
		const res = dedupe([
			vuln({ package: "a" }),
			vuln({ package: "b" }),
			vuln({ package: "c" }),
		]);
		expect(res.map((v) => v.package)).toEqual(["a", "b", "c"]);
	});

	test("une liste vide reste vide", () => {
		expect(dedupe([])).toEqual([]);
	});
});

describe("sortVulnerabilities (CONTEXT.md §3)", () => {
	test("critical d'abord, unknown en dernier", () => {
		const ordre: Severity[] = [
			"unknown",
			"info",
			"low",
			"moderate",
			"high",
			"critical",
		];
		const trie = sortVulnerabilities(
			ordre.map((severity) => vuln({ severity })),
		);
		expect(trie.map((v) => v.severity)).toEqual([
			"critical",
			"high",
			"moderate",
			"low",
			"info",
			"unknown",
		]);
	});

	test("le tri est stable à sévérité égale", () => {
		// Aucun critère secondaire : l'ordre d'entrée doit être préservé.
		const entree = ["a", "b", "c"].map((p) => vuln({ package: p }));
		expect(sortVulnerabilities(entree).map((v) => v.package)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	test("l'entrée n'est pas mutée", () => {
		const entree = [vuln({ severity: "low" }), vuln({ severity: "critical" })];
		sortVulnerabilities(entree);
		expect(entree[0]?.severity).toBe("low");
	});
});

describe("emptyCounts", () => {
	test("les six sévérités sont à zéro", () => {
		expect(emptyCounts()).toEqual({
			critical: 0,
			high: 0,
			moderate: 0,
			low: 0,
			info: 0,
			unknown: 0,
		});
	});

	test("chaque appel renvoie un objet neuf", () => {
		const a = emptyCounts();
		a.critical = 5;
		expect(emptyCounts().critical).toBe(0);
	});
});

describe("buildParseResult (CONTEXT.md §3)", () => {
	test("le pipeline est dédup puis tri puis comptage", () => {
		const res = buildParseResult([
			vuln({ severity: "low", package: "a" }),
			vuln({ severity: "critical", package: "b" }),
			// Doublon exact de la première : doit disparaître avant le comptage.
			vuln({ severity: "low", package: "a" }),
		]);
		expect(res.total).toBe(2);
		expect(res.vulnerabilities[0]?.severity).toBe("critical");
		expect(res.counts.low).toBe(1);
		expect(res.counts.critical).toBe(1);
	});

	test("total égale la longueur après dédup", () => {
		const res = buildParseResult([vuln(), vuln(), vuln()]);
		expect(res.total).toBe(1);
		expect(res.vulnerabilities).toHaveLength(1);
	});

	test("total égale la somme des six compteurs", () => {
		const res = buildParseResult([
			vuln({ package: "a", severity: "critical" }),
			vuln({ package: "b", severity: "info" }),
			vuln({ package: "c", severity: "unknown" }),
		]);
		const somme = Object.values(res.counts).reduce((a, b) => a + b, 0);
		expect(somme).toBe(res.total);
	});

	test("une liste vide donne des compteurs à zéro", () => {
		const res = buildParseResult([]);
		expect(res.total).toBe(0);
		expect(res.counts).toEqual(emptyCounts());
	});
});
