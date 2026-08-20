import { describe, expect, test } from "bun:test";
import { parseNpm } from "./npm";

describe("Parser: NPM", () => {
	test("throws on invalid JSON", () => {
		expect(() => parseNpm("not json")).toThrow("Sortie JSON illisible");
	});

	test("returns empty for no vulnerabilities", () => {
		const res = parseNpm(JSON.stringify({ vulnerabilities: {} }));
		expect(res.total).toBe(0);
		expect(res.counts.critical).toBe(0);
	});

	test("parses Cas A (transitive without advisory)", () => {
		const input = {
			vulnerabilities: {
				lodash: {
					name: "lodash",
					severity: "high",
					range: "<4.17.21",
					fixAvailable: false,
					via: ["some-parent"],
				},
			},
		};
		const res = parseNpm(JSON.stringify(input));
		expect(res.total).toBe(1);
		expect(res.vulnerabilities[0]?.package).toBe("lodash");
		expect(res.vulnerabilities[0]?.title).toBe(
			"Dépendance vulnérable via some-parent",
		);
		expect(res.vulnerabilities[0]?.cve).toBeNull();
		expect(res.vulnerabilities[0]?.severity).toBe("high");
	});

	test("parses Cas B (with advisories) and extracts fixedIn", () => {
		const input = {
			vulnerabilities: {
				"cross-spawn": {
					name: "cross-spawn",
					severity: "high",
					range: "<6.0.5",
					fixAvailable: {
						name: "cross-spawn",
						version: "6.0.5",
						isSemVerMajor: false,
					},
					via: [
						{
							title: "Regular Expression Denial of Service",
							url: "https://github.com/advisories/GHSA-123",
							cwe: ["CWE-400", "CWE-20"],
							severity: "high",
							range: "<6.0.5",
						},
					],
				},
			},
		};
		const res = parseNpm(JSON.stringify(input));
		expect(res.total).toBe(1);

		const vuln = res.vulnerabilities[0]!;
		expect(vuln.package).toBe("cross-spawn");
		expect(vuln.title).toBe("Regular Expression Denial of Service");
		expect(vuln.link).toBe("https://github.com/advisories/GHSA-123");
		expect(vuln.cve).toBe("CWE-400, CWE-20");
		expect(vuln.fixedIn).toBe("6.0.5");
		expect(vuln.versionRange).toBe("<6.0.5");
	});

	test("handles multiple advisories for same package", () => {
		const input = {
			vulnerabilities: {
				lib: {
					name: "lib",
					severity: "critical",
					range: "*",
					via: [
						{ title: "Bug 1", cwe: ["CWE-1"] },
						{ title: "Bug 2", cwe: ["CWE-2"] },
					],
				},
			},
		};
		const res = parseNpm(JSON.stringify(input));
		expect(res.total).toBe(2);
		expect(res.vulnerabilities[0]?.title).toBe("Bug 1");
		expect(res.vulnerabilities[1]?.title).toBe("Bug 2");
	});
});
