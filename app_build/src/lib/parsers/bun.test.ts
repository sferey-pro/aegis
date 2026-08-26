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

	test("les champs sont extraits, le GHSA de l'URL sert d'identifiant", () => {
		// `bun audit --json` ne rend **aucun** champ d'identifiant : la seule
		// référence stable est le GHSA de l'URL de l'avis.
		const r = parseBun(
			JSON.stringify({
				tar: [
					{
						title: "Arbitrary File Creation",
						severity: "high",
						url: "https://github.com/advisories/GHSA-r628-mhmh-qjhw",
						vulnerable_versions: "<6.1.9",
						cwe: ["CWE-22"],
					},
				],
			}),
		);
		const [v] = r.vulnerabilities;
		expect(v?.package).toBe("tar");
		expect(v?.severity).toBe("high");
		expect(v?.cve).toBe("GHSA-R628-MHMH-QJHW");
		expect(v?.link).toBe("https://github.com/advisories/GHSA-r628-mhmh-qjhw");
		expect(v?.versionRange).toBe("<6.1.9");
	});

	test("la CWE n'est jamais prise pour un identifiant", () => {
		// Une CWE est une *classe de faiblesse* partagée par des milliers de
		// vulnérabilités ; `cve` est la clé de regroupement du triage entre projets
		// (§7). Deux failles distinctes partageant `CWE-200` se regroupaient donc en
		// une seule ligne, et annoter l'une annotait l'autre.
		const r = parseBun(
			JSON.stringify({
				tar: [{ title: "T", severity: "low", cwe: ["CWE-22", "CWE-200"] }],
			}),
		);
		expect(r.vulnerabilities[0]?.cve).toBeNull();
	});

	test("deux avis du même paquet gardent des identifiants distincts", () => {
		// C'est la propriété qui manquait : sans elle, les deux occurrences
		// partageaient `first_seen_at` et `is_baseline` (défaut N10).
		const r = parseBun(
			JSON.stringify({
				hono: [
					{
						title: "Cookie injection",
						severity: "moderate",
						url: "https://github.com/advisories/GHSA-3hrh-pfw6-9m5x",
						cwe: ["CWE-113"],
					},
					{
						title: "Proxy headers",
						severity: "low",
						url: "https://github.com/advisories/GHSA-79qm-7rj5-m7r9",
						cwe: ["CWE-200"],
					},
				],
			}),
		);
		const refs = r.vulnerabilities.map((v) => v.cve);
		expect(new Set(refs).size).toBe(2);
		expect(refs).toContain("GHSA-3HRH-PFW6-9M5X");
	});

	test("une URL sans référence reconnaissable laisse cve à null", () => {
		// Mieux vaut aucun identifiant qu'un identifiant faux : le repli sur le
		// titre est assuré en aval par `occurrenceRef` (§2).
		const r = parseBun(
			JSON.stringify({
				tar: [
					{ title: "T", severity: "low", url: "https://example.test/avis" },
				],
			}),
		);
		expect(r.vulnerabilities[0]?.cve).toBeNull();
	});

	test("une CVE dans l'URL est reconnue aussi", () => {
		const r = parseBun(
			JSON.stringify({
				tar: [
					{
						title: "T",
						severity: "low",
						url: "https://nvd.nist.gov/vuln/detail/CVE-2024-12345",
					},
				],
			}),
		);
		expect(r.vulnerabilities[0]?.cve).toBe("CVE-2024-12345");
	});

	test("le vecteur CVSS de l'outil est conservé", () => {
		// Fourni par bun : le garder évite de dépendre du cache d'avis (§6) — donc
		// du réseau — pour afficher un score.
		const r = parseBun(
			JSON.stringify({
				tar: [
					{
						title: "T",
						severity: "low",
						cvss: { score: 5.3, vectorString: "CVSS:3.1/AV:N/AC:L" },
					},
				],
			}),
		);
		expect(r.vulnerabilities[0]?.cvssVector).toBe("CVSS:3.1/AV:N/AC:L");
	});

	test("un cvss sans vectorString ne produit pas de vecteur vide", () => {
		const r = parseBun(
			JSON.stringify({
				tar: [{ title: "T", severity: "low", cvss: { score: 5.3 } }],
			}),
		);
		expect(r.vulnerabilities[0]?.cvssVector).toBeNull();
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
