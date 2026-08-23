import { statSync } from "node:fs";
import { join } from "node:path";
import type { ProjectTool } from "../../db/projects";

/**
 * Catalogue des outils d'audit : commande exacte et lockfiles attendus
 * (CONTEXT.md §2).
 *
 * Source de vérité unique de la commande lancée. Elle était auparavant construite
 * par une cascade de `if` dans `runAudit`, dont la branche par défaut laissait
 * `args` à `[]` : un `tool` hors énumération produisait un `spawn([])` qui levait,
 * un run en erreur sans commande, et donc un diagnostic vide (défaut N20).
 *
 * `bun` accepte **deux** lockfiles : `bun.lock` (format texte récent) et
 * `bun.lockb` (binaire). L'un suffit.
 */
export const AUDIT_TOOLS = {
	npm: {
		args: ["npm", "audit", "--json"],
		lockfiles: ["package-lock.json"],
	},
	yarn: {
		args: ["yarn", "audit", "--json"],
		lockfiles: ["yarn.lock"],
	},
	bun: {
		args: ["bun", "audit", "--json"],
		lockfiles: ["bun.lock", "bun.lockb"],
	},
	composer: {
		// `--locked` audite directement `composer.lock`, sans exiger `vendor/`.
		args: [
			"composer",
			"audit",
			"--format=json",
			"--locked",
			"--no-interaction",
		],
		lockfiles: ["composer.lock"],
	},
} as const satisfies Record<
	ProjectTool,
	{ args: readonly string[]; lockfiles: readonly string[] }
>;

/**
 * L'outil du projet est-il l'un des quatre outils connus ?
 *
 * Les portes d'entrée valident déjà `tool` par une énumération Zod
 * (`projectToolSchema`), création comme import. Ce contrôle couvre ce qu'elles ne
 * voient pas : une ligne écrite à la main dans SQLite, ou une base antérieure à
 * cette validation. Sans lui, l'outil inconnu ressort en `Erreur système:
 * spawn …` — un message qui accuse le système alors que la donnée est en cause.
 */
export function isKnownTool(tool: string): tool is ProjectTool {
	// `Object.hasOwn`, pas `in` : `in` remonte la chaîne de prototype, si bien
	// que `"constructor"` et `"toString"` passaient pour des outils valides.
	return Object.hasOwn(AUDIT_TOOLS, tool);
}

/** Commande d'audit d'un outil, en tableau — jamais de shell (§15). */
export function auditCommand(tool: ProjectTool): string[] {
	return [...AUDIT_TOOLS[tool].args];
}

/**
 * Contrôles préalables au lancement d'un audit (CONTEXT.md §2, « Cas limites »).
 *
 * Renvoie le message d'erreur exact du contrat, ou `null` si l'audit peut partir.
 * Deux vérifications, dans cet ordre :
 *
 * 1. **le dossier existe** — « Chemin introuvable: … » ;
 * 2. **le lockfile existe** — « Lockfile manquant: … (cherché dans `<cwd>`) ».
 *
 * L'intérêt n'est pas d'éviter un `spawn` : c'est de nommer la cause. Un dossier
 * renommé produisait un run en erreur portant le `ENOENT` brut de l'outil, à
 * charge du référent de l'interpréter — et un `npm audit` lancé dans un dossier
 * sans lockfile échoue avec un message qui parle de `package.json`, pas du vrai
 * problème.
 *
 * Un chemin qui existe **sans être un dossier** est traité comme introuvable :
 * en tant que cible d'audit, il n'existe pas. Le dire autrement conduirait au
 * message « Lockfile manquant » sur un fichier, ce qui égare.
 */
export function preflightAudit(tool: ProjectTool, cwd: string): string | null {
	let isDirectory = false;
	try {
		isDirectory = statSync(cwd).isDirectory();
	} catch {
		// ENOENT, ou un composant du chemin qui n'est pas un dossier : dans les
		// deux cas, la cible n'existe pas.
		isDirectory = false;
	}
	if (!isDirectory) return `Chemin introuvable: ${cwd}`;

	const { lockfiles } = AUDIT_TOOLS[tool];
	const found = lockfiles.some((name) => {
		try {
			return statSync(join(cwd, name)).isFile();
		} catch {
			return false;
		}
	});
	if (found) return null;

	return `Lockfile manquant: ${lockfiles.join(" ou ")} (cherché dans ${cwd})`;
}
