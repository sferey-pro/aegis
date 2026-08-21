import type { ParseResult, Vulnerability } from "./types";
import { buildParseResult, normSeverity } from "./utils";

/** Attente sur la sortie de l'outil ; voir la note de `npm.ts`. */
interface RawComposerAdvisory {
	packageName?: string;
	title?: string;
	link?: string;
	severity?: string;
	cve?: string;
	affectedVersions?: string;
}

interface RawComposerOutput {
	advisories?: Record<string, RawComposerAdvisory[]>;
	abandoned?: Record<string, string | null>;
}

export function parseComposer(output: string): ParseResult {
	let parsed: RawComposerOutput | null;
	try {
		parsed = JSON.parse(output);
	} catch (e) {
		throw new Error(`Sortie JSON illisible (${(e as Error).message})`);
	}

	const rawVulns: Vulnerability[] = [];

	// Parse advisories
	const advisories: Record<string, RawComposerAdvisory[]> =
		parsed?.advisories ?? {};
	for (const pkgName of Object.keys(advisories)) {
		const advs = advisories[pkgName];
		if (!Array.isArray(advs)) continue;

		for (const adv of advs) {
			if (!adv || typeof adv !== "object") continue;

			rawVulns.push({
				package: adv.packageName || pkgName,
				severity: normSeverity(adv.severity),
				title: adv.title || "Advisory",
				cve: adv.cve || null,
				link: adv.link || null,
				versionRange: adv.affectedVersions || null,
			});
		}
	}

	// Parse abandoned
	const abandoned = parsed?.abandoned || {};
	for (const pkgName of Object.keys(abandoned)) {
		const replacement = abandoned[pkgName];

		let title = "Aucun remplacement suggéré";
		if (typeof replacement === "string" && replacement.trim() !== "") {
			title = `Remplacer par ${replacement}`;
		}

		rawVulns.push({
			package: pkgName,
			severity: "info",
			title,
			cve: null,
			link: null,
			versionRange: null,
			abandoned: true,
		});
	}

	return buildParseResult(rawVulns);
}
