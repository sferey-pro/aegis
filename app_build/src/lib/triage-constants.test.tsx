import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
	compareVersions,
	SEV_ORDER,
	SEVERITY_COLORS,
	SEVERITY_ICONS,
	SEVERITY_LABELS,
} from "./triage-constants";

const NIVEAUX = ["critical", "high", "moderate", "low", "info", "unknown"];

describe("SEVERITY_COLORS", () => {
	test("les six niveaux sont couverts", () => {
		for (const n of NIVEAUX) expect(SEVERITY_COLORS[n]).toBeString();
	});

	test("chaque niveau porte un fond, un texte et une bordure", () => {
		// La palette ne portait qu'un fond à 10 % d'opacité : sur carte blanche,
		// `critical` et `moderate` ne se distinguaient que par une nuance très
		// pâle, alors que repérer les criticals d'un coup d'œil est la fonction
		// première de cet écran.
		for (const n of NIVEAUX) {
			const classes = SEVERITY_COLORS[n] as string;
			expect(classes).toMatch(/\bbg-/);
			expect(classes).toMatch(/\btext-/);
			expect(classes).toMatch(/\bborder-/);
		}
	});

	test("chaque niveau a une variante sombre", () => {
		for (const n of NIVEAUX) {
			expect(SEVERITY_COLORS[n]).toContain("dark:");
		}
	});

	test("aucune classe amputée ni espace résiduel", () => {
		// Les doubles espaces marquaient l'endroit où texte et bordure avaient
		// disparu lors d'une réécriture. Une classe commençant par « : » ne résout
		// rien et ne déclenche aucun avertissement.
		for (const n of NIVEAUX) {
			const classes = SEVERITY_COLORS[n] as string;
			expect(classes).not.toMatch(/\s:/);
			expect(classes).not.toMatch(/ {2}/);
			expect(classes.trim()).toBe(classes);
		}
	});

	test("les teintes de texte sont contrastées, jamais la 500", () => {
		// La 500 ne tient le ratio 4,5:1 ni sur fond clair ni sur fond sombre.
		for (const n of NIVEAUX) {
			expect(SEVERITY_COLORS[n]).not.toMatch(/\btext-[a-z]+-500\b/);
		}
	});
});

describe("SEVERITY_ICONS", () => {
	test("les six niveaux ont une icône", () => {
		for (const n of NIVEAUX) expect(SEVERITY_ICONS[n]).toBeDefined();
	});

	test("les six formes sont distinctes", () => {
		// `low` et `info` partageaient `Info` : deux niveaux différents rendus par
		// le même pictogramme, ce qui annulait le doublage de l'information par la
		// forme (WCAG 1.4.1).
		const formes = NIVEAUX.map((n) =>
			renderToStaticMarkup(SEVERITY_ICONS[n] as React.ReactElement),
		);
		expect(new Set(formes).size).toBe(NIVEAUX.length);
	});

	test("les icônes héritent de la couleur du texte", () => {
		// Aucune classe de couleur : elles suivent la palette du conteneur au lieu
		// d'être monochromes.
		for (const n of NIVEAUX) {
			const html = renderToStaticMarkup(
				SEVERITY_ICONS[n] as React.ReactElement,
			);
			expect(html).not.toMatch(/class="[^"]*\btext-[a-z]+-\d/);
		}
	});
});

describe("SEVERITY_LABELS", () => {
	test("les six niveaux ont un libellé français", () => {
		// Les écrans les écrivaient en dur, un `&&` par niveau : `low`, `info` et
		// `unknown` n'affichaient rien, donc une faille basse apparaissait sans
		// aucun indicateur de gravité.
		for (const n of NIVEAUX) expect(SEVERITY_LABELS[n]).toBeString();
		expect(new Set(Object.values(SEVERITY_LABELS)).size).toBe(NIVEAUX.length);
	});
});

describe("SEV_ORDER", () => {
	test("l'ordre va du plus grave au moins grave", () => {
		const tries = [...NIVEAUX].sort(
			(a, b) => (SEV_ORDER[b] ?? 0) - (SEV_ORDER[a] ?? 0),
		);
		expect(tries).toEqual(NIVEAUX);
	});
});

describe("compareVersions", () => {
	test("compare segment par segment", () => {
		expect(compareVersions("4.17.21", "4.17.20")).toBe(1);
		expect(compareVersions("4.17.20", "4.17.21")).toBe(-1);
		expect(compareVersions("4.17.21", "4.17.21")).toBe(0);
	});

	test("un segment manquant vaut zéro", () => {
		expect(compareVersions("4.18", "4.17.9")).toBe(1);
		expect(compareVersions("4.17", "4.17.0")).toBe(0);
	});

	test("un préfixe non numérique est ignoré", () => {
		expect(compareVersions("v2.0.0", "1.9.9")).toBe(1);
		expect(compareVersions("^1.2.3", "1.2.4")).toBe(-1);
	});

	test("une version absente perd", () => {
		expect(compareVersions("", "1.0.0")).toBe(-1);
		expect(compareVersions("1.0.0", "")).toBe(1);
	});
});
