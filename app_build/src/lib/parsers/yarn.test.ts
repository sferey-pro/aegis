import { describe, expect, test } from "bun:test";

import { parseYarn } from "./yarn";

/** Une ligne NDJSON `auditAdvisory` telle que yarn v1 l'émet. */
function ligne(advisory: Record<string, unknown>) {
	return JSON.stringify({ type: "auditAdvisory", data: { advisory } });
}

describe("parseYarn (CONTEXT.md §3)", () => {
	test("le bruit non-JSON est ignoré silencieusement", () => {
		// Contrairement aux autres parseurs, yarn ne lève jamais : le NDJSON de
		// yarn v1 contient des lignes de progression.
		const r = parseYarn(
			[
				"ceci n'est pas du json",
				"",
				"   ",
				ligne({ module_name: "lodash", title: "T", severity: "high" }),
			].join("\n"),
		);
		expect(r.total).toBe(1);
	});

	test("une sortie entièrement illisible donne une liste vide", () => {
		expect(parseYarn("bruit\nbruit").total).toBe(0);
	});

	test("seules les lignes auditAdvisory sont retenues", () => {
		const r = parseYarn(
			[
				JSON.stringify({ type: "auditSummary", data: { vulnerabilities: {} } }),
				JSON.stringify({ type: "info", data: "…" }),
				ligne({ module_name: "lodash", title: "T", severity: "high" }),
			].join("\n"),
		);
		expect(r.total).toBe(1);
	});

	test("une ligne auditAdvisory sans advisory est ignorée", () => {
		expect(
			parseYarn(JSON.stringify({ type: "auditAdvisory", data: {} })).total,
		).toBe(0);
	});

	test("les champs sont extraits, cves joints", () => {
		const r = parseYarn(
			ligne({
				module_name: "lodash",
				title: "Prototype Pollution",
				severity: "high",
				url: "https://npmjs.com/advisories/1523",
				vulnerable_versions: "<4.17.21",
				patched_versions: ">=4.17.21",
				cves: ["CVE-2024-9", "CVE-2024-10"],
			}),
		);
		const [v] = r.vulnerabilities;
		expect(v?.package).toBe("lodash");
		expect(v?.cve).toBe("CVE-2024-9, CVE-2024-10");
		expect(v?.link).toBe("https://npmjs.com/advisories/1523");
		expect(v?.versionRange).toBe("<4.17.21");
		// yarn est l'un des deux outils qui fournissent une version corrigée.
		expect(v?.fixedIn).toBe(">=4.17.21");
	});

	test("sans cves, cve reste null", () => {
		const r = parseYarn(
			ligne({ module_name: "lodash", title: "T", severity: "low", cves: [] }),
		);
		expect(r.vulnerabilities[0]?.cve).toBeNull();
	});

	test("un module sans nom retombe sur ?", () => {
		const r = parseYarn(ligne({ title: "T", severity: "low" }));
		expect(r.vulnerabilities[0]?.package).toBe("?");
	});

	test("les doublons du flux sont fusionnés", () => {
		// yarn répète un avis par chemin de dépendance : la dédup les fond.
		const l = ligne({ module_name: "lodash", title: "T", severity: "high" });
		expect(parseYarn([l, l, l].join("\n")).total).toBe(1);
	});
});
