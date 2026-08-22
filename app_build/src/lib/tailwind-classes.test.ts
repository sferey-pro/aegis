import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Garde-fou sur les classes Tailwind écrites en dur, sur **tout** l'arbre source.
 *
 * Une réécriture avait amputé des préfixes de variante — `dark:bg-input/50`
 * devenu ` :bg-input/50` — et tronqué des valeurs arbitraires —
 * `shadow-[0_0_1px_rgba(var(--primary),0.2)]` réduit à `(var(--primary),0.2)]`.
 * Onze occurrences dans les atomes Shadcn, donc propagées à toute l'application,
 * plus quatre voiles `opacity-0` dont le fond avait disparu.
 *
 * Rien ne les signalait : Tailwind ignore silencieusement ce qu'il ne reconnaît
 * pas, Biome ne lit pas le contenu des chaînes, et `tsc` non plus. Le test se
 * substitue à cette absence de filet — le seul endroit où l'on peut voir ces
 * fragments, c'est la source.
 *
 * Il balaie l'arbre entier plutôt qu'un fichier : la version précédente ne
 * couvrait que `button.tsx`, alors que le défaut touchait huit fichiers.
 */

const RACINE = new URL("..", import.meta.url).pathname;

function fichiersSources(dossier: string): string[] {
	const trouves: string[] = [];
	for (const entree of readdirSync(dossier)) {
		if (entree === "node_modules") continue;
		const chemin = join(dossier, entree);
		if (statSync(chemin).isDirectory()) {
			trouves.push(...fichiersSources(chemin));
			continue;
		}
		// Les fichiers de test contiennent les motifs fautifs en littéral, pour les
		// documenter : les inclure ferait échouer le garde-fou sur lui-même.
		if (/\.test\.[jt]sx?$/.test(entree)) continue;
		if (/\.(tsx|ts|css)$/.test(entree)) trouves.push(chemin);
	}
	return trouves;
}

const SOURCES = fichiersSources(RACINE).map((chemin) => ({
	chemin: chemin.slice(RACINE.length),
	contenu: readFileSync(chemin, "utf8"),
}));

/** Chaque motif fautif, avec ce qu'il a coûté. */
const MOTIFS: Array<{ nom: string; motif: RegExp }> = [
	{
		// `dark:`, `hover:`, `focus-visible:`… amputés. Une classe valide ne
		// commence jamais par « : » précédé d'une espace.
		nom: "préfixe de variante amputé",
		motif: /\s:[a-z-]+[:/[]/,
	},
	{
		// Reste d'une valeur arbitraire tronquée : la parenthèse ouvrante et le
		// crochet fermant sans le crochet ouvrant ni l'utilitaire.
		nom: "valeur arbitraire tronquée",
		motif: /["'\s]\((?:var\(--|\d)[^[\]"']*\)\]/,
	},
	{
		// Modificateur d'opacité orphelin : `inset-0 /5` au lieu de
		// `inset-0 bg-primary/5`.
		nom: "modificateur d'opacité orphelin",
		motif: /\s\/\d{1,3}[\s"']/,
	},
];

describe("intégrité des classes Tailwind", () => {
	test("l'arbre source est bien balayé", () => {
		// Un balayage vide passerait tous les tests suivants sans rien vérifier.
		expect(SOURCES.length).toBeGreaterThan(50);
		expect(SOURCES.some((f) => f.chemin.includes("components/ui/button"))).toBe(
			true,
		);
	});

	for (const { nom, motif } of MOTIFS) {
		test(`aucun ${nom}`, () => {
			const coupables = SOURCES.filter((f) => motif.test(f.contenu)).map(
				(f) => f.chemin,
			);
			expect(coupables).toEqual([]);
		});
	}
});
