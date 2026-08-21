import type { ParseResult, Vulnerability } from "./types";
import { buildParseResult, normSeverity } from "./utils";

/** Attente sur la sortie de l'outil ; voir la note de `npm.ts`. */
interface RawBunAdvisory {
	title?: string;
	url?: string;
	severity?: string;
	vulnerable_versions?: string;
	cwe?: unknown;
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

			let cve: string | null = null;
			if (Array.isArray(adv.cwe) && adv.cwe.length > 0) {
				cve = adv.cwe.join(", ");
			}

			rawVulns.push({
				package: pkgName,
				severity: normSeverity(adv.severity),
				title: adv.title || "Advisory",
				cve,
				link: adv.url || null,
				versionRange: adv.vulnerable_versions || null,
			});
		}
	}

	return buildParseResult(rawVulns);
}
