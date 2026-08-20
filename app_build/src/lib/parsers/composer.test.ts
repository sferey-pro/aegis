import { describe, expect, test } from "bun:test";
import { parseComposer } from "./composer";

describe("Parser: Composer", () => {
	test("throws on invalid JSON", () => {
		expect(() => parseComposer("not json")).toThrow("Sortie JSON illisible");
	});

	test("returns empty for no vulnerabilities", () => {
		const res = parseComposer(
			JSON.stringify({ advisories: {}, abandoned: {} }),
		);
		expect(res.total).toBe(0);
	});

	test("parses advisories correctly", () => {
		const input = {
			advisories: {
				"vendor/pkg": [
					{
						packageName: "vendor/pkg",
						title: "SQL Injection",
						link: "https://example.com",
						cve: "CVE-2023-1234",
						severity: "critical",
						affectedVersions: "<1.2.3",
					},
				],
			},
		};
		const res = parseComposer(JSON.stringify(input));
		expect(res.total).toBe(1);

		const [vuln] = res.vulnerabilities;
		if (!vuln) throw new Error("attendu au moins une vulnérabilité");
		expect(vuln.package).toBe("vendor/pkg");
		expect(vuln.severity).toBe("critical");
		expect(vuln.title).toBe("SQL Injection");
		expect(vuln.cve).toBe("CVE-2023-1234");
		expect(vuln.link).toBe("https://example.com");
		expect(vuln.versionRange).toBe("<1.2.3");
	});

	test("parses abandoned packages correctly", () => {
		const input = {
			abandoned: {
				"old/pkg": "new/pkg",
				"dead/pkg": true,
			},
		};
		const res = parseComposer(JSON.stringify(input));
		expect(res.total).toBe(2);

		const v1 = res.vulnerabilities.find((v) => v.package === "old/pkg");
		if (!v1) throw new Error("paquet old/pkg introuvable");
		expect(v1.severity).toBe("info");
		expect(v1.title).toBe("Remplacer par new/pkg");
		expect(v1.abandoned).toBe(true);

		const v2 = res.vulnerabilities.find((v) => v.package === "dead/pkg");
		if (!v2) throw new Error("paquet dead/pkg introuvable");
		expect(v2.severity).toBe("info");
		expect(v2.title).toBe("Aucun remplacement suggéré");
		expect(v2.abandoned).toBe(true);
	});
});
