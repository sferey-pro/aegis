import { describe, expect, test } from "bun:test";

import { buildCvssTooltip, parseCvssVector } from "./cvss";

const V31 = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
const V40 = "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N";

describe("lib/cvss — parseCvssVector", () => {
	test("regroupe les métriques d'un vecteur 3.1", () => {
		const g = parseCvssVector(V31);
		expect(Object.keys(g)).toEqual([
			"Exploitability Metrics",
			"Scope Metrics",
			"Vulnerable System Impact",
		]);
		expect(g["Exploitability Metrics"]).toHaveLength(4);
	});

	test("traduit les codes en libellés lisibles", () => {
		const g = parseCvssVector(V31);
		const av = g["Exploitability Metrics"]?.find(
			(m) => m.name === "Attack Vector",
		);
		expect(av?.value).toBe("Network");
	});

	test("reconnaît les métriques propres à la 4.0", () => {
		const g = parseCvssVector(V40);
		expect(g["Subsequent System Impact"]).toHaveLength(3);
		expect(
			g["Exploitability Metrics"]?.some(
				(m) => m.name === "Attack Requirements",
			),
		).toBe(true);
	});

	test("C/I/A de la 3.x et VC/VI/VA de la 4.0 tombent dans le même groupe", () => {
		// Les deux générations décrivent le même impact ; l'affichage doit être
		// homogène quelle que soit la version renvoyée par l'avis GitHub.
		expect(parseCvssVector(V31)["Vulnerable System Impact"]).toHaveLength(3);
		expect(parseCvssVector(V40)["Vulnerable System Impact"]).toHaveLength(3);
	});

	test("une valeur inconnue est rendue brute plutôt que perdue", () => {
		const g = parseCvssVector("CVSS:3.1/AV:Z");
		expect(g["Exploitability Metrics"]?.[0]?.value).toBe("Z");
	});

	test("une métrique inconnue est ignorée", () => {
		// Les vecteurs portent aussi des métriques temporelles et environnementales
		// (E, RL, CR…) que l'écran n'affiche pas.
		expect(parseCvssVector("CVSS:3.1/E:P/RL:O")).toEqual({});
	});

	test("les segments malformés sont ignorés sans lever", () => {
		const g = parseCvssVector("CVSS:3.1/AV/AC:/:H/AV:N");
		expect(g["Exploitability Metrics"]).toHaveLength(1);
	});

	test("une chaîne vide donne un objet vide", () => {
		expect(parseCvssVector("")).toEqual({});
	});

	test("le premier segment est toujours écarté — écart documenté", () => {
		// `split("/").slice(1)` suppose le préfixe `CVSS:x.y`. Un vecteur transmis
		// sans préfixe perd donc sa première métrique, silencieusement.
		expect(parseCvssVector("AV:N/AC:L")["Exploitability Metrics"]).toHaveLength(
			1,
		);
	});

	test("chaque métrique porte son groupe en propre", () => {
		const m = parseCvssVector(V31)["Scope Metrics"]?.[0];
		expect(m?.group).toBe("Scope Metrics");
		expect(m?.name).toBe("Scope");
		expect(m?.value).toBe("Unchanged");
	});
});

describe("lib/cvss — buildCvssTooltip", () => {
	test("rend un bloc par groupe, une ligne par métrique", () => {
		const t = buildCvssTooltip("CVSS:3.1/AV:N/S:U");
		expect(t).toBe(
			"[ Exploitability Metrics ]\n- Attack Vector: Network\n\n[ Scope Metrics ]\n- Scope: Unchanged",
		);
	});

	test("ni espace ni saut de ligne aux extrémités", () => {
		// L'infobulle est posée dans un attribut `title` : un saut de ligne initial
		// y créerait une ligne vide visible.
		const t = buildCvssTooltip("CVSS:3.1/AV:N");
		expect(t).toBe(t.trim());
	});

	test("un vecteur sans métrique connue donne une chaîne vide", () => {
		expect(buildCvssTooltip("CVSS:3.1/E:P")).toBe("");
		expect(buildCvssTooltip("")).toBe("");
	});

	test("l'ordre des groupes suit la première apparition dans le vecteur", () => {
		const t = buildCvssTooltip("CVSS:3.1/C:H/AV:N");
		expect(t.indexOf("Vulnerable System Impact")).toBeLessThan(
			t.indexOf("Exploitability Metrics"),
		);
	});
});

/**
 * Contrats attendus — à activer au correctif.
 *
 * Chaque test ci-dessous énonce le comportement que `CONTEXT.md` demande, sur un
 * point où le code s'en écarte aujourd'hui. Ils sont marqués `test.failing` :
 * Bun exécute le corps et **attend son échec**, donc la suite reste verte tant
 * que le défaut existe.
 *
 * Le jour où le défaut est corrigé, le test se met à passer et Bun le signale en
 * rouge — « this test is marked as failing but it passed. Remove `.failing` if
 * tested behavior now works ». Il est donc impossible de corriger le code sans
 * reprendre le test.
 *
 * Marche à suivre au correctif : retirer `.failing`, puis supprimer le test
 * « écart documenté » correspondant, qui épinglait l'ancien comportement.
 */

describe("contrats attendus — à activer au correctif", () => {
	// N34 — `slice(1)` suppose le préfixe `CVSS:x.y`. Un vecteur transmis sans
	// préfixe perd sa première métrique, silencieusement.
	test.failing("un vecteur sans préfixe garde toutes ses métriques (N34)", () => {
		const g = parseCvssVector("AV:N/AC:L");
		expect(g["Exploitability Metrics"]).toHaveLength(2);
	});
});
