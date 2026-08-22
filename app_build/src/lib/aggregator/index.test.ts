import { describe, expect, test } from "bun:test";

import { upsertAnnotation } from "@/db/annotations";
import { createProject, toggleIgnoreProject } from "@/db/projects";
import { addRun, type CreateRunInput } from "@/db/runs";
import { putCachedAdvisory } from "@/lib/github";
import type { Severity, Vulnerability } from "@/lib/parsers/types";
import { useTempDb } from "@/test/db";
import { buildCveGroups } from "./index";

function projet(nom: string, over: Record<string, unknown> = {}) {
	return createProject({
		name: nom,
		path: `/srv/${nom}`,
		type: "node",
		tool: "npm",
		...over,
	});
}

function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
	return {
		package: "lodash",
		severity: "high",
		title: "Prototype pollution",
		cve: "CVE-2024-1",
		link: null,
		versionRange: "<4.17.21",
		...over,
	};
}

/** Enregistre un run réussi portant les vulnérabilités données. */
function run(
	projectId: number,
	vulns: Vulnerability[],
	over: Partial<CreateRunInput> = {},
) {
	return addRun({
		project_id: projectId,
		status: vulns.length ? "vulnerable" : "ok",
		total: vulns.length,
		counts: {
			critical: 0,
			high: vulns.length,
			moderate: 0,
			low: 0,
			info: 0,
			unknown: 0,
		},
		vulnerabilities: vulns,
		command: "npm audit --json",
		commit_sha: null,
		error: null,
		duration_ms: 10,
		...over,
	});
}

/** Date ISO située il y a `jours` jours. */
function ilYA(jours: number): string {
	return new Date(Date.now() - jours * 86_400_000).toISOString();
}

describe("lib/aggregator — regroupement", () => {
	useTempDb("aggregator");

	test("une base sans projet ne produit aucun groupe", () => {
		expect(buildCveGroups()).toEqual([]);
	});

	test("une CVE présente sur deux projets forme un seul groupe à deux occurrences", () => {
		// C'est la raison d'être de l'écran Triage : décider une fois par CVE, pas
		// une fois par projet.
		const a = projet("api");
		const b = projet("web");
		run(a.id, [vuln()]);
		run(b.id, [vuln()]);

		const groupes = buildCveGroups();
		expect(groupes).toHaveLength(1);
		expect(groupes[0]?.cve).toBe("CVE-2024-1");
		expect(groupes[0]?.ref).toBe("CVE-2024-1");
		// L'ordre suit `listProjects()`, c'est-à-dire du projet ajouté le plus
		// récemment au plus ancien — pas l'ordre alphabétique.
		expect(groupes[0]?.occurrences.map((o) => o.projectName)).toEqual([
			"web",
			"api",
		]);
	});

	test("la CVE est trimée avant de servir de clé", () => {
		const a = projet("api");
		const b = projet("web");
		run(a.id, [vuln({ cve: " CVE-2024-1 " })]);
		run(b.id, [vuln({ cve: "CVE-2024-1" })]);
		expect(buildCveGroups()).toHaveLength(1);
	});

	test("sans CVE, la clé est « paquet: titre »", () => {
		// Les avis Composer et certains avis npm n'ont pas de CVE ; sans clé de
		// repli, ils fusionneraient tous en un seul groupe.
		const p = projet("api");
		run(p.id, [
			vuln({ cve: null }),
			vuln({ cve: null, package: "axios", title: "SSRF" }),
		]);

		const groupes = buildCveGroups();
		expect(groupes.map((g) => g.cve).sort()).toEqual([
			"axios: SSRF",
			"lodash: Prototype pollution",
		]);
		expect(groupes.every((g) => g.ref === null)).toBe(true);
	});

	test("une CVE vide ou blanche est traitée comme absente", () => {
		const p = projet("api");
		run(p.id, [vuln({ cve: "   " })]);
		expect(buildCveGroups()[0]?.ref).toBeNull();
	});

	test("le même paquet à deux titres différents reste deux groupes", () => {
		const p = projet("api");
		run(p.id, [
			vuln({ cve: null, title: "Prototype pollution" }),
			vuln({ cve: null, title: "ReDoS" }),
		]);
		expect(buildCveGroups()).toHaveLength(2);
	});

	test("un doublon intra-projet est réduit à une occurrence, la pire sévérité gagne", () => {
		// `npm audit` remonte la même CVE une fois par chemin de dépendance : sans
		// déduplication, un projet compterait cinq fois la même faille.
		const p = projet("api");
		run(p.id, [
			vuln({ severity: "low" }),
			vuln({ severity: "critical" }),
			vuln({ severity: "moderate" }),
		]);

		const [g] = buildCveGroups();
		expect(g?.occurrences).toHaveLength(1);
		expect(g?.occurrences[0]?.severity).toBe("critical");
		expect(g?.worst).toBe("critical");
	});

	test("worst est la pire sévérité toutes occurrences confondues", () => {
		const a = projet("api");
		const b = projet("web");
		run(a.id, [vuln({ severity: "low" })]);
		run(b.id, [vuln({ severity: "critical" })]);
		expect(buildCveGroups()[0]?.worst).toBe("critical");
	});

	test("l'occurrence garde sa propre sévérité, distincte de worst", () => {
		const a = projet("api");
		const b = projet("web");
		run(a.id, [vuln({ severity: "low" })]);
		run(b.id, [vuln({ severity: "critical" })]);

		const [g] = buildCveGroups();
		expect(g?.occurrences.map((o) => o.severity).sort()).toEqual([
			"critical",
			"low",
		]);
	});

	test("l'occurrence porte le projet, son outil et le détail de la faille", () => {
		const p = projet("api", { tool: "yarn" });
		run(p.id, [vuln({ link: "https://ghsa/1", cvssVector: "CVSS:3.1/AV:N" })]);

		const [o] = buildCveGroups()[0]?.occurrences ?? [];
		expect(o?.projectId).toBe(p.id);
		expect(o?.projectName).toBe("api");
		expect(o?.tool).toBe("yarn");
		expect(o?.package).toBe("lodash");
		expect(o?.versionRange).toBe("<4.17.21");
		expect(o?.link).toBe("https://ghsa/1");
		expect(o?.cvssVector).toBe("CVSS:3.1/AV:N");
	});

	test("le vecteur CVSS du groupe est repris de la première occurrence qui en a un", () => {
		const a = projet("api");
		const b = projet("web");
		run(a.id, [vuln({ cvssVector: null })]);
		run(b.id, [vuln({ cvssVector: "CVSS:3.1/AV:N" })]);
		expect(buildCveGroups()[0]?.cvssVector).toBe("CVSS:3.1/AV:N");
	});
});

describe("lib/aggregator — projets exclus", () => {
	useTempDb("aggregator-exclus");

	test("un projet ignoré est exclu", () => {
		const p = projet("api");
		run(p.id, [vuln()]);
		toggleIgnoreProject(p.id);
		expect(buildCveGroups()).toEqual([]);
	});

	test("un projet sans run est exclu", () => {
		projet("api");
		expect(buildCveGroups()).toEqual([]);
	});

	test("un projet dont le dernier run est en erreur est exclu", () => {
		// Une erreur d'audit n'est pas une absence de faille : montrer un état vide
		// serait plus faux que ne rien montrer.
		const p = projet("api");
		run(p.id, [vuln()]);
		run(p.id, [], { status: "error", error: "npm introuvable" });
		expect(buildCveGroups()).toEqual([]);
	});

	test("seul le dernier run compte : les failles corrigées disparaissent", () => {
		const p = projet("api");
		run(p.id, [vuln()]);
		run(p.id, [], { status: "ok" });
		expect(buildCveGroups()).toEqual([]);
	});
});

describe("lib/aggregator — annotations", () => {
	useTempDb("aggregator-annotations");

	test("sans annotation, le statut est pending et la note vide", () => {
		const p = projet("api");
		run(p.id, [vuln()]);
		const [o] = buildCveGroups()[0]?.occurrences ?? [];
		expect(o?.status).toBe("pending");
		expect(o?.note).toBe("");
	});

	test("l'annotation du projet est reportée sur son occurrence", () => {
		const p = projet("api");
		run(p.id, [vuln()]);
		upsertAnnotation("CVE-2024-1", p.id, {
			status: "not_affected",
			note: "hors chemin d'exécution",
		});

		const [o] = buildCveGroups()[0]?.occurrences ?? [];
		expect(o?.status).toBe("not_affected");
		expect(o?.note).toBe("hors chemin d'exécution");
	});

	test("l'annotation est par projet, pas par CVE", () => {
		// Deux projets peuvent conclure différemment sur la même faille.
		const a = projet("api");
		const b = projet("web");
		run(a.id, [vuln()]);
		run(b.id, [vuln()]);
		upsertAnnotation("CVE-2024-1", a.id, { status: "confirmed" });

		const parProjet = new Map(
			buildCveGroups()[0]?.occurrences.map((o) => [o.projectName, o.status]),
		);
		expect(parProjet.get("api")).toBe("confirmed");
		expect(parProjet.get("web")).toBe("pending");
	});

	test("une faille sans CVE est annotable via sa clé de repli", () => {
		// Le front annote avec `group.cve`, qui vaut « paquet: titre » : c'est bien
		// cette clé que l'agrégateur cherche dans les annotations.
		const p = projet("api");
		run(p.id, [vuln({ cve: null })]);
		upsertAnnotation("lodash: Prototype pollution", p.id, {
			status: "ignored",
		});
		expect(buildCveGroups()[0]?.occurrences[0]?.status).toBe("ignored");
	});

	test("fixed_in annoté prime sur celui du parseur", () => {
		// L'humain a vu le dépôt amont ; l'avis peut être en retard.
		const p = projet("api");
		run(p.id, [vuln({ fixedIn: "4.17.20" })]);
		upsertAnnotation("CVE-2024-1", p.id, { fixedIn: "4.17.21" });
		expect(buildCveGroups()[0]?.occurrences[0]?.fixedIn).toBe("4.17.21");
	});

	test("sans annotation, fixed_in vient du parseur, sinon null", () => {
		const a = projet("api");
		const b = projet("web");
		run(a.id, [vuln({ fixedIn: "4.17.21" })]);
		run(b.id, [vuln({ cve: "CVE-2024-2", fixedIn: null })]);

		const parCve = new Map(
			buildCveGroups().map((g) => [g.cve, g.occurrences[0]?.fixedIn]),
		);
		expect(parCve.get("CVE-2024-1")).toBe("4.17.21");
		expect(parCve.get("CVE-2024-2")).toBeNull();
	});

	test("isGlobal est toujours faux — écart documenté", () => {
		// Le drapeau vaut `ann.project_id === -1`, or aucune ligne -1 ne peut
		// exister : la colonne porte une clé étrangère vers `projects`. L'affichage
		// « annotation globale » du front est donc inatteignable.
		const p = projet("api");
		run(p.id, [vuln()]);
		upsertAnnotation("CVE-2024-1", p.id, { status: "ignored" });
		expect(buildCveGroups()[0]?.occurrences[0]?.isGlobal).toBe(false);
	});
});

describe("lib/aggregator — âge et baseline", () => {
	useTempDb("aggregator-age");

	test("une découverte nette compte son âge depuis first_seen_at", () => {
		// C'est le compteur de SLA : le temps écoulé depuis que *nous* avons vu la
		// faille pour la première fois, pas depuis sa publication.
		const p = projet("api");
		run(p.id, [vuln({ firstSeenAt: ilYA(10) })]);

		const [g] = buildCveGroups();
		expect(g?.occurrences[0]?.ageInDays).toBe(10);
		expect(g?.hasNetDiscovery).toBe(true);
		expect(g?.hasBaseline).toBe(false);
		expect(g?.maxSlaAgeInDays).toBe(10);
		expect(g?.maxBaselineAgeInDays).toBe(0);
	});

	test("une faille de baseline compte son âge depuis published_at", () => {
		// La baseline est l'existant découvert au premier audit : le dater de notre
		// première observation afficherait « 0 jour » pour une faille de 2019.
		const p = projet("api");
		run(p.id, [
			vuln({ isBaseline: true, publishedAt: ilYA(400), firstSeenAt: ilYA(1) }),
		]);

		const [g] = buildCveGroups();
		expect(g?.occurrences[0]?.ageInDays).toBe(400);
		expect(g?.hasBaseline).toBe(true);
		expect(g?.maxBaselineAgeInDays).toBe(400);
		expect(g?.maxSlaAgeInDays).toBe(0);
	});

	test("une baseline sans date de publication retombe sur first_seen_at", () => {
		const p = projet("api");
		run(p.id, [
			vuln({ isBaseline: true, publishedAt: null, firstSeenAt: ilYA(5) }),
		]);
		expect(buildCveGroups()[0]?.occurrences[0]?.ageInDays).toBe(5);
	});

	test("sans aucune date, l'âge est 0 plutôt que NaN", () => {
		const p = projet("api");
		run(p.id, [vuln()]);
		expect(buildCveGroups()[0]?.occurrences[0]?.ageInDays).toBe(0);
	});

	test("les deux compteurs coexistent dans un groupe mixte", () => {
		// Une même CVE peut être de l'existant ici et une régression là : les deux
		// âges maximaux sont suivis séparément.
		const a = projet("api");
		const b = projet("web");
		run(a.id, [vuln({ isBaseline: true, publishedAt: ilYA(300) })]);
		run(b.id, [vuln({ firstSeenAt: ilYA(7) })]);

		const [g] = buildCveGroups();
		expect(g?.hasBaseline).toBe(true);
		expect(g?.hasNetDiscovery).toBe(true);
		expect(g?.maxBaselineAgeInDays).toBe(300);
		expect(g?.maxSlaAgeInDays).toBe(7);
	});

	test("le compteur retient le maximum, pas la dernière valeur vue", () => {
		const a = projet("api");
		const b = projet("web");
		run(a.id, [vuln({ firstSeenAt: ilYA(30) })]);
		run(b.id, [vuln({ firstSeenAt: ilYA(2) })]);
		expect(buildCveGroups()[0]?.maxSlaAgeInDays).toBe(30);
	});
});

describe("lib/aggregator — tri", () => {
	useTempDb("aggregator-tri");

	test("les groupes sont triés par gravité décroissante", () => {
		const p = projet("api");
		run(p.id, [
			vuln({ cve: "CVE-LOW", severity: "low" }),
			vuln({ cve: "CVE-CRIT", severity: "critical" }),
			vuln({ cve: "CVE-MOD", severity: "moderate" }),
			vuln({ cve: "CVE-HIGH", severity: "high" }),
		]);
		expect(buildCveGroups().map((g) => g.cve)).toEqual([
			"CVE-CRIT",
			"CVE-HIGH",
			"CVE-MOD",
			"CVE-LOW",
		]);
	});

	test("à gravité égale, le plus répandu passe devant", () => {
		// Une CVE sur cinq projets se traite avant une CVE isolée de même gravité.
		const a = projet("api");
		const b = projet("web");
		run(a.id, [
			vuln({ cve: "CVE-PARTOUT", severity: "high" }),
			vuln({ cve: "CVE-ISOLEE", severity: "high" }),
		]);
		run(b.id, [vuln({ cve: "CVE-PARTOUT", severity: "high" })]);

		expect(buildCveGroups().map((g) => g.cve)).toEqual([
			"CVE-PARTOUT",
			"CVE-ISOLEE",
		]);
	});

	test("les six sévérités sont ordonnées de critical à unknown", () => {
		const p = projet("api");
		const sevs: Severity[] = [
			"unknown",
			"info",
			"low",
			"moderate",
			"high",
			"critical",
		];
		run(
			p.id,
			sevs.map((s) => vuln({ cve: `CVE-${s}`, severity: s })),
		);
		expect(buildCveGroups().map((g) => g.worst)).toEqual([
			"critical",
			"high",
			"moderate",
			"low",
			"info",
			"unknown",
		]);
	});
});

describe("superposition des avis GHSA", () => {
	useTempDb("aggregator-avis");

	test("la sévérité de l'avis prime sur celle de l'outil", () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: "CVE-2020-8203", severity: "unknown" })]);
		putCachedAdvisory("CVE-2020-8203", "critical", {});

		// Le run est le compte rendu brut de l'outil ; l'avis corrige les
		// « unknown » de `yarn audit` sans qu'il faille réauditer.
		const [g] = buildCveGroups();
		expect(g?.worst).toBe("critical");
		expect(g?.occurrences[0]?.severity).toBe("critical");
	});

	test("un avis de sévérité inconnue ne dégrade pas celle de l'outil", () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: "CVE-2020-8203", severity: "high" })]);
		putCachedAdvisory("CVE-2020-8203", "unknown", {});

		expect(buildCveGroups()[0]?.occurrences[0]?.severity).toBe("high");
	});

	test("le lien, le vecteur CVSS et la date viennent de l'avis", () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: "CVE-2020-8203" })]);
		putCachedAdvisory(
			"CVE-2020-8203",
			"high",
			{},
			"https://github.com/advisories/GHSA-x",
			"CVSS:3.1/AV:N",
			"2020-07-15T00:00:00Z",
		);

		const o = buildCveGroups()[0]?.occurrences[0];
		expect(o?.link).toBe("https://github.com/advisories/GHSA-x");
		expect(o?.cvssVector).toBe("CVSS:3.1/AV:N");
		expect(o?.publishedAt).toBe("2020-07-15T00:00:00Z");
	});

	test("la version corrigée est déduite de l'avis quand l'outil se taise", () => {
		const p = projet("app");
		run(p.id, [
			vuln({ cve: "CVE-2020-8203", package: "lodash", fixedIn: null }),
		]);
		putCachedAdvisory("CVE-2020-8203", "high", {
			"npm:lodash": [{ range: "<4.17.21", patched: "4.17.21" }],
		});

		// `npm audit` ne remonte pas toujours la version patchée : le « patch
		// recommandé » restait vide alors que GitHub la connaissait.
		expect(buildCveGroups()[0]?.occurrences[0]?.fixedIn).toBe("4.17.21");
	});

	test("un avis qui ne couvre pas le paquet préserve la valeur de l'outil", () => {
		const p = projet("app");
		run(p.id, [
			vuln({ cve: "CVE-2020-8203", package: "lodash", fixedIn: "4.17.20" }),
		]);
		putCachedAdvisory("CVE-2020-8203", "high", {
			"npm:autre-paquet": [{ range: "<2", patched: "2.0.0" }],
		});

		// N18 : écraser par `null` faisait lire « aucune correction disponible ».
		expect(buildCveGroups()[0]?.occurrences[0]?.fixedIn).toBe("4.17.20");
	});

	test("une annotation reste souveraine sur la version corrigée", () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: "CVE-2020-8203", package: "lodash" })]);
		putCachedAdvisory("CVE-2020-8203", "high", {
			"npm:lodash": [{ range: "<4.17.21", patched: "4.17.21" }],
		});
		upsertAnnotation("CVE-2020-8203", p.id, { fixedIn: "9.9.9" });

		expect(buildCveGroups()[0]?.occurrences[0]?.fixedIn).toBe("9.9.9");
	});

	test("sans avis en cache, rien ne change", () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: "CVE-2020-8203", severity: "moderate" })]);

		const o = buildCveGroups()[0]?.occurrences[0];
		expect(o?.severity).toBe("moderate");
		expect(o?.link).toBeNull();
	});
});
