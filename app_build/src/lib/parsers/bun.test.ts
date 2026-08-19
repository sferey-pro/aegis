import { describe, expect, test } from "bun:test";
import { parseBun } from "./bun";

describe("Parser: Bun", () => {
	test("throws on invalid JSON", () => {
		expect(() => parseBun("not json")).toThrow("Sortie JSON illisible");
	});

	test("skips text banner before JSON", () => {
		const res = parseBun("bun audit found some issues...\n{\n}");
		expect(res.total).toBe(0);
	});

	test("parses valid bun output", () => {
		const input = {
			tar: [
				{
					title: "Arbitrary File Creation",
					url: "https://github.com/advisories/GHSA-123",
					cwe: ["CWE-22"],
					severity: "high",
					vulnerable_versions: "<4.4.18",
				},
			],
			ignored: "not an array",
		};

		const res = parseBun(`bun audit v1.2.0\n${JSON.stringify(input)}`);
		expect(res.total).toBe(1);

		const vuln = res.vulnerabilities[0]!;
		expect(vuln.package).toBe("tar");
		expect(vuln.severity).toBe("high");
		expect(vuln.title).toBe("Arbitrary File Creation");
		expect(vuln.cve).toBe("CWE-22");
		expect(vuln.link).toBe("https://github.com/advisories/GHSA-123");
		expect(vuln.versionRange).toBe("<4.4.18");
		expect(vuln.fixedIn).toBeUndefined(); // Pas de fixedIn géré par bun
	});
});
