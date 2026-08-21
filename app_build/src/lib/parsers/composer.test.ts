import { describe, expect, test } from "bun:test";

import { parseComposer } from "./composer";

describe("parseComposer (CONTEXT.md §3)", () => {
	test("JSON illisible lève avec la raison", () => {
		expect(() => parseComposer("pas du json")).toThrow(/Sortie JSON illisible/);
	});

	test("les deux sections absentes donnent une liste vide", () => {
		expect(parseComposer("{}").total).toBe(0);
	});

	test("une valeur d'advisory non-tableau est ignorée", () => {
		expect(
			parseComposer(JSON.stringify({ advisories: { "a/b": "oups" } })).total,
		).toBe(0);
	});

	test("les champs d'un avis sont extraits", () => {
		const r = parseComposer(
			JSON.stringify({
				advisories: {
					"vendor/pkg": [
						{
							packageName: "vendor/pkg",
							title: "SQL Injection",
							severity: "critical",
							cve: "CVE-2024-1",
							link: "https://x",
							affectedVersions: "<2.0",
						},
					],
				},
			}),
		);
		const [v] = r.vulnerabilities;
		expect(v?.package).toBe("vendor/pkg");
		expect(v?.severity).toBe("critical");
		expect(v?.cve).toBe("CVE-2024-1");
		expect(v?.link).toBe("https://x");
		expect(v?.versionRange).toBe("<2.0");
	});

	test("packageName absent retombe sur la clé", () => {
		const r = parseComposer(
			JSON.stringify({
				advisories: { "vendor/pkg": [{ title: "T", severity: "low" }] },
			}),
		);
		expect(r.vulnerabilities[0]?.package).toBe("vendor/pkg");
	});

	test("un titre absent retombe sur Advisory", () => {
		const r = parseComposer(
			JSON.stringify({ advisories: { "a/b": [{ severity: "low" }] } }),
		);
		expect(r.vulnerabilities[0]?.title).toBe("Advisory");
	});

	test("un package abandonné devient une entrée info, pas une faille", () => {
		// La sévérité est forcée à `info` hors de normSeverity : ce n'est pas une
		// vulnérabilité, mais une dette à signaler.
		const r = parseComposer(
			JSON.stringify({ abandoned: { "old/pkg": "new/pkg" } }),
		);
		const [v] = r.vulnerabilities;
		expect(v?.severity).toBe("info");
		expect(v?.abandoned).toBe(true);
		expect(v?.title).toBe("Remplacer par new/pkg");
		expect(r.counts.info).toBe(1);
	});

	test("un abandon sans remplacement le dit explicitement", () => {
		for (const remplacement of [null, "", "   "]) {
			const r = parseComposer(
				JSON.stringify({ abandoned: { "old/pkg": remplacement } }),
			);
			expect(r.vulnerabilities[0]?.title).toBe("Aucun remplacement suggéré");
		}
	});

	test("les deux sections se cumulent", () => {
		const r = parseComposer(
			JSON.stringify({
				advisories: {
					"vendor/pkg": [{ title: "SQLi", severity: "critical" }],
				},
				abandoned: { "old/pkg": "new/pkg" },
			}),
		);
		expect(r.total).toBe(2);
		// Tri par sévérité : le critique avant l'info.
		expect(r.vulnerabilities[0]?.severity).toBe("critical");
		expect(r.vulnerabilities[1]?.severity).toBe("info");
	});

	test("une sévérité composer inconnue devient unknown", () => {
		const r = parseComposer(
			JSON.stringify({
				advisories: { "a/b": [{ title: "T", severity: "severe" }] },
			}),
		);
		expect(r.vulnerabilities[0]?.severity).toBe("unknown");
	});
});
