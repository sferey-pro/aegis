import { describe, expect, test } from "bun:test";

import { parseNpm } from "./npm";

/** Enveloppe la forme réelle de `npm audit --json`. */
function sortie(vulnerabilities: Record<string, unknown>) {
	return JSON.stringify({ vulnerabilities });
}

describe("parseNpm (CONTEXT.md §3)", () => {
	test("JSON illisible lève avec la raison", () => {
		expect(() => parseNpm("pas du json")).toThrow(/Sortie JSON illisible/);
	});

	test("section absente donne une liste vide", () => {
		expect(parseNpm("{}").total).toBe(0);
		expect(parseNpm(sortie({})).total).toBe(0);
	});

	test("une entrée non-objet est ignorée", () => {
		expect(parseNpm(sortie({ lodash: "pas un objet" })).total).toBe(0);
		expect(parseNpm(sortie({ lodash: null })).total).toBe(0);
	});

	test("cas A : aucune advisory, la ou les dépendances parentes sont nommées", () => {
		const r = parseNpm(
			sortie({
				axios: {
					name: "axios",
					severity: "moderate",
					range: "<1.6",
					via: ["follow-redirects", "form-data"],
				},
			}),
		);
		expect(r.total).toBe(1);
		const [v] = r.vulnerabilities;
		expect(v?.title).toBe(
			"Dépendance vulnérable via follow-redirects, form-data",
		);
		expect(v?.cve).toBeNull();
		expect(v?.link).toBeNull();
		expect(v?.versionRange).toBe("<1.6");
	});

	test("cas A sans via nommé retombe sur un libellé générique", () => {
		const r = parseNpm(
			sortie({ axios: { name: "axios", severity: "low", via: [] } }),
		);
		expect(r.vulnerabilities[0]?.title).toBe(
			"Dépendance vulnérable via dépendance transitive",
		);
	});

	test("cas B : une entrée par advisory, GHSA de l'URL en identifiant", () => {
		const r = parseNpm(
			sortie({
				lodash: {
					name: "lodash",
					severity: "high",
					range: ">=4.0.0",
					via: [
						{
							title: "Prototype pollution",
							url: "https://github.com/advisories/GHSA-jf85-cpcp-j695",
							severity: "critical",
							range: ">=4.0.0 <4.17.21",
							cwe: ["CWE-1321", "CWE-915"],
						},
						{ title: "Autre", url: "https://gh/y", severity: "low" },
					],
				},
			}),
		);
		expect(r.total).toBe(2);
		const critique = r.vulnerabilities.find((v) => v.severity === "critical");
		// `cwe` est une classe de faiblesse, pas un identifiant de vulnérabilité.
		expect(critique?.cve).toBe("GHSA-JF85-CPCP-J695");
		expect(critique?.link).toBe(
			"https://github.com/advisories/GHSA-jf85-cpcp-j695",
		);
		// La plage de l'advisory prime sur celle du package.
		expect(critique?.versionRange).toBe(">=4.0.0 <4.17.21");
		// Sans cwe, `cve` reste null.
		expect(r.vulnerabilities.find((v) => v.title === "Autre")?.cve).toBeNull();
	});

	test("l'advisory sans plage retombe sur celle du package", () => {
		const r = parseNpm(
			sortie({
				lodash: {
					name: "lodash",
					severity: "high",
					range: ">=4.0.0",
					via: [{ title: "T", url: "u" }],
				},
			}),
		);
		expect(r.vulnerabilities[0]?.versionRange).toBe(">=4.0.0");
	});

	test("fixedIn n'est extrait que si fixAvailable est un objet", () => {
		const avec = parseNpm(
			sortie({
				lodash: {
					name: "lodash",
					severity: "high",
					fixAvailable: { version: "4.17.21" },
					via: [],
				},
			}),
		);
		expect(avec.vulnerabilities[0]?.fixedIn).toBe("4.17.21");

		// `true` est une valeur légitime de npm et ne doit pas produire de version.
		for (const fixAvailable of [true, false, "4.17.21", null]) {
			const r = parseNpm(
				sortie({
					lodash: { name: "lodash", severity: "high", fixAvailable, via: [] },
				}),
			);
			expect(r.vulnerabilities[0]?.fixedIn).toBeNull();
		}
	});

	test("le nom de package retombe sur la clé si absent", () => {
		const r = parseNpm(sortie({ lodash: { severity: "high", via: [] } }));
		expect(r.vulnerabilities[0]?.package).toBe("lodash");
	});

	test("un via non-tableau est traité comme vide", () => {
		const r = parseNpm(
			sortie({ lodash: { name: "lodash", severity: "high", via: "oups" } }),
		);
		expect(r.total).toBe(1);
		expect(r.vulnerabilities[0]?.title).toContain("dépendance transitive");
	});

	test("la sévérité de l'advisory prime sur celle du package", () => {
		const r = parseNpm(
			sortie({
				lodash: {
					name: "lodash",
					severity: "low",
					via: [{ title: "T", severity: "critical" }],
				},
			}),
		);
		expect(r.vulnerabilities[0]?.severity).toBe("critical");
	});

	test("une sévérité inconnue devient unknown", () => {
		const r = parseNpm(
			sortie({ lodash: { name: "lodash", severity: "banana", via: [] } }),
		);
		expect(r.vulnerabilities[0]?.severity).toBe("unknown");
		expect(r.counts.unknown).toBe(1);
	});
});
