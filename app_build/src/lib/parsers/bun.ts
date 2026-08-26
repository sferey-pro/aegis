import { refFromLink } from "../vuln-identity";
import type { ParseResult, Vulnerability } from "./types";
import { buildParseResult, normSeverity } from "./utils";

/** Attente sur la sortie de l'outil ; voir la note de `npm.ts`. */
interface RawBunAdvisory {
	title?: string;
	url?: string;
	severity?: string;
	vulnerable_versions?: string;
	cwe?: unknown;
	cvss?: unknown;
}

/**
 * Vecteur CVSS d'un avis, quand l'outil le fournit (`cvss.vectorString`).
 *
 * Lu défensivement : la forme vient d'un outil externe, et un `score` sans
 * `vectorString` existe. `null` plutôt qu'une chaîne vide — c'est ce que
 * l'enrichissement (§6) attend pour tenter de compléter depuis le cache.
 */
function cvssVectorOf(cvss: unknown): string | null {
	if (!cvss || typeof cvss !== "object") return null;
	const { vectorString } = cvss as { vectorString?: unknown };
	return typeof vectorString === "string" && vectorString.length > 0
		? vectorString
		: null;
}

export function parseBun(output: string): ParseResult {
	let jsonStr = output;
	const firstBrace = output.indexOf("{");
	if (firstBrace > 0) {
		jsonStr = output.substring(firstBrace);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonStr);
	} catch (e) {
		throw new Error(`Sortie JSON illisible (${(e as Error).message})`);
	}

	const rawVulns: Vulnerability[] = [];

	// `bun audit --json` renvoie un objet indexé par package.
	const byPackage = (parsed ?? {}) as Record<string, unknown>;
	for (const pkgName of Object.keys(byPackage)) {
		const advisories = byPackage[pkgName] as RawBunAdvisory[] | undefined;
		if (!Array.isArray(advisories)) continue;

		for (const adv of advisories) {
			if (!adv || typeof adv !== "object") continue;

			// `bun audit --json` ne rend aucun champ d'identifiant : la seule
			// référence stable est le GHSA porté par l'URL de l'avis. Ce parseur
			// mettait à la place la liste des **CWE**, qui sont des *classes de
			// faiblesse* partagées par des milliers de vulnérabilités — or `cve` est
			// la clé de regroupement du triage (§7) et du diff `newCves` (§2).
			const cve = refFromLink(adv.url);

			rawVulns.push({
				package: pkgName,
				severity: normSeverity(adv.severity),
				title: adv.title || "Advisory",
				cve,
				link: adv.url || null,
				versionRange: adv.vulnerable_versions || null,
				// Le vecteur CVSS est fourni par l'outil : le garder évite de dépendre
				// du cache d'avis (§6) pour l'afficher, donc du réseau.
				cvssVector: cvssVectorOf(adv.cvss),
			});
		}
	}

	return buildParseResult(rawVulns);
}
