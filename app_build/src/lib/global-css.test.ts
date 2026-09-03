import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contrats du CSS global qu'aucun outil ne vérifie.
 *
 * La feuille impose une barre de défilement de 12 px, non superposée. Sans
 * gouttière réservée, la largeur utile de la page change de 12 px selon qu'elle
 * dépasse ou non la fenêtre : le contenu centré et l'en-tête fixe se décalaient
 * de 6 px à chaque navigation entre une page courte et une page longue.
 */
describe("index.css (src/index.css)", () => {
	const css = readFileSync(join(import.meta.dir, "..", "index.css"), "utf-8");

	test("la gouttière de l'ascenseur est réservée sur la racine", () => {
		expect(css).toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable/);
	});
});
