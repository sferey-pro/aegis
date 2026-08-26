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

/**
 * Largeur de modale écrite sans le préfixe `sm:`.
 *
 * L'atome `DialogContent` pose `sm:max-w-lg`. Un `max-w-2xl` nu ne le remplace
 * pas : les deux classes appartiennent à des groupes différents, `cn()` les garde
 * toutes les deux, et c'est la règle sous media query qui gagne. La modale reste
 * donc bornée à 512 px au-delà de `sm`, **quelle que soit la valeur écrite** —
 * silencieusement, comme les autres motifs de ce fichier.
 *
 * Le piège a mordu deux fois : la modale de rapport, puis celle du détail d'un
 * rapport. D'où ce balayage plutôt qu'un troisième correctif ponctuel.
 */
function modalesSansPrefixe(): string[] {
	const coupables: string[] = [];
	for (const { chemin, contenu } of SOURCES) {
		let depuis = 0;
		for (;;) {
			const debut = contenu.indexOf("<DialogContent", depuis);
			if (debut === -1) break;
			// **Bornée à la balise ouvrante.** Une regex `[^>]*className="…"` court
			// jusqu'au prochain `className` littéral du fichier quand la balise
			// utilise un gabarit : elle désignait alors des fichiers innocents. Un
			// garde-fou qui accuse à faux ne sert à rien.
			const fin = contenu.indexOf(">", debut);
			depuis = fin === -1 ? contenu.length : fin + 1;
			const balise = contenu.slice(debut, depuis);

			const classes = balise.match(/className=\{?["'`]([^"'`]*)["'`]/)?.[1];
			if (!classes) continue;

			// Toutes les tailles, pas seulement les grandes : `max-w-md` sur une
			// modale de confirmation est écrasé par le `sm:max-w-lg` de l'atome, donc
			// l'intention « plus étroite » ne s'applique jamais au-delà de `sm`.
			const nu =
				/(?:^|\s)max-w-(?:xs|sm|md|lg|xl|[2-9]xl|screen-\w+)(?:\s|$)/.test(
					classes,
				);
			const prefixe = /(?:^|\s)sm:max-w-/.test(classes);
			if (nu && !prefixe) coupables.push(chemin);
		}
	}
	return coupables;
}

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

	test("aucune largeur de modale sans préfixe sm:", () => {
		expect(modalesSansPrefixe()).toEqual([]);
	});

	test("le balayage des modales trouve bien des modales", () => {
		// Sans cette contre-épreuve, une expression régulière devenue inopérante
		// rendrait le test précédent toujours vert.
		const avecDialog = SOURCES.filter((f) =>
			/<DialogContent[^>]*className/.test(f.contenu),
		);
		expect(avecDialog.length).toBeGreaterThan(3);
	});
});
