import { describe, expect, test } from "bun:test";

import { parseBun } from "./bun";

describe("parseBun (CONTEXT.md §3)", () => {
	test("JSON illisible lève avec la raison", () => {
		expect(() => parseBun("pas du json")).toThrow(/Sortie JSON illisible/);
	});

	test("un bandeau texte précédant le JSON est retiré", () => {
		// `bun audit` peut préfixer sa sortie : on repart du premier `{`.
		const sortie = `bun audit v1.3.14\nAnalyse…\n${JSON.stringify({
			tar: [{ title: "Arbitrary File Creation", severity: "high" }],
		})}`;
		const r = parseBun(sortie);
		expect(r.total).toBe(1);
		expect(r.vulnerabilities[0]?.package).toBe("tar");
	});

	test("un objet vide donne une liste vide", () => {
		expect(parseBun("{}").total).toBe(0);
	});

	test("une valeur non-tableau est ignorée", () => {
		expect(parseBun(JSON.stringify({ tar: "oups" })).total).toBe(0);
		expect(parseBun(JSON.stringify({ tar: null })).total).toBe(0);
	});

	test("un avis non-objet dans le tableau est ignoré", () => {
		const r = parseBun(
			JSON.stringify({
				tar: ["oups", null, { title: "Vrai", severity: "low" }],
			}),
		);
		expect(r.total).toBe(1);
		expect(r.vulnerabilities[0]?.title).toBe("Vrai");
	});

	test("les champs sont extraits, CWE utilisé comme cve", () => {
		const r = parseBun(
			JSON.stringify({
				tar: [
					{
						title: "Arbitrary File Creation",
						severity: "high",
						url: "https://gh/advisories/GHSA-z",
						vulnerable_versions: "<6.1.9",
						cwe: ["CWE-22"],
					},
				],
			}),
		);
		const [v] = r.vulnerabilities;
		expect(v?.package).toBe("tar");
		expect(v?.severity).toBe("high");
		expect(v?.cve).toBe("CWE-22");
		expect(v?.link).toBe("https://gh/advisories/GHSA-z");
		expect(v?.versionRange).toBe("<6.1.9");
	});

	test("sans cwe, cve reste null", () => {
		const r = parseBun(
			JSON.stringify({ tar: [{ title: "T", severity: "low", cwe: [] }] }),
		);
		expect(r.vulnerabilities[0]?.cve).toBeNull();
	});

	test("bun ne fournit pas de version corrigée", () => {
		const r = parseBun(
			JSON.stringify({ tar: [{ title: "T", severity: "low" }] }),
		);
		expect(r.vulnerabilities[0]?.fixedIn).toBeUndefined();
	});

	test("un titre absent retombe sur Advisory", () => {
		const r = parseBun(JSON.stringify({ tar: [{ severity: "low" }] }));
		expect(r.vulnerabilities[0]?.title).toBe("Advisory");
	});

	test("plusieurs packages produisent plusieurs entrées", () => {
		const r = parseBun(
			JSON.stringify({
				tar: [{ title: "A", severity: "high" }],
				lodash: [{ title: "B", severity: "critical" }],
			}),
		);
		expect(r.total).toBe(2);
		// Tri par sévérité : critical d'abord.
		expect(r.vulnerabilities[0]?.package).toBe("lodash");
	});
});
