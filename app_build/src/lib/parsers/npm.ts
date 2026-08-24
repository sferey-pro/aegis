import { refFromLink } from "../vuln-identity";
import type { ParseResult, Vulnerability } from "./types";
import { buildParseResult, normSeverity } from "./utils";

/**
 * Formes attendues de la sortie de l'outil.
 *
 * Ce sont des *attentes*, pas des garanties : la sortie vient d'un exécutable
 * externe dont on ne maîtrise ni la version ni le format. Les vraies protections
 * restent les gardes du parseur (`typeof`, `Array.isArray`), que le contrat
 * impose d'ailleurs d'être tolérantes — section absente, valeur non-tableau et
 * champ manquant doivent être ignorés, pas rejetés (CONTEXT.md §3).
 *
 * C'est pourquoi ces formes sont déclarées en TypeScript plutôt que validées par
 * un schéma Zod : une validation stricte casserait cette tolérance, et son coût
 * d'exécution serait payé sur chaque vulnérabilité de chaque audit.
 */

interface RawNpmAdvisory {
	title?: string;
	url?: string;
	range?: string;
	severity?: string;
	cwe?: unknown;
}

interface RawNpmVuln {
	name?: string;
	severity?: string;
	range?: string;
	/** Objet `{ version }` quand un correctif existe, `true`/`false` sinon. */
	fixAvailable?: unknown;
	/** Mélange de chaînes (dépendances parentes) et d'objets (avis). */
	via?: unknown;
}

interface RawNpmOutput {
	vulnerabilities?: Record<string, RawNpmVuln>;
}

export function parseNpm(output: string): ParseResult {
	let parsed: RawNpmOutput | null;
	try {
		parsed = JSON.parse(output);
	} catch (e) {
		throw new Error(`Sortie JSON illisible (${(e as Error).message})`);
	}

	const rawVulns: Vulnerability[] = [];
	const vulnsMap: Record<string, RawNpmVuln> = parsed?.vulnerabilities ?? {};

	for (const pkgName of Object.keys(vulnsMap)) {
		const v = vulnsMap[pkgName];
		if (!v || typeof v !== "object") continue;

		const severity = normSeverity(v.severity);
		const range = v.range || null;
		let fixedIn = null;

		if (v.fixAvailable && typeof v.fixAvailable === "object") {
			const { version } = v.fixAvailable as { version?: unknown };
			if (typeof version === "string") fixedIn = version;
		}

		const via: unknown[] = Array.isArray(v.via) ? v.via : [];
		const advisories = via.filter(
			(item: unknown): item is RawNpmAdvisory =>
				typeof item === "object" && item !== null,
		);
		const stringVias = via.filter(
			(item: unknown): item is string => typeof item === "string",
		);

		if (advisories.length === 0) {
			// Cas A : Aucune advisory, juste une ou des dépendances parentes (transitives)
			const viaStr =
				stringVias.length > 0 ? stringVias.join(", ") : "dépendance transitive";
			rawVulns.push({
				package: v.name || pkgName,
				severity,
				title: `Dépendance vulnérable via ${viaStr}`,
				cve: null,
				link: null,
				versionRange: range,
				fixedIn,
			});
		} else {
			// Cas B : Au moins une advisory présente dans `via`
			for (const a of advisories) {
				// Même confusion que dans le parseur bun : `cwe` est une classe de
				// faiblesse, pas un identifiant de vulnérabilité. L'identifiant est le
				// GHSA de l'URL de l'avis.
				const cve = refFromLink(a.url);

				rawVulns.push({
					package: v.name || pkgName,
					severity: normSeverity(a.severity || v.severity),
					title: a.title || "Advisory",
					cve,
					link: a.url || null,
					versionRange: a.range || range,
					fixedIn,
				});
			}
		}
	}

	return buildParseResult(rawVulns);
}
