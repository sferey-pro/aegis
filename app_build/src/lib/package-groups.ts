import type { CveGroup, CveOccurrence } from "@/lib/aggregator";
import type { Severity } from "@/lib/parsers/types";
import { compareVersions, SEV_ORDER } from "@/lib/triage-constants";

/**
 * Regroupement par (projet, paquet) de l'agrégat `GET /api/cves`.
 *
 * Le serveur regroupe par référence CVE (§7) ; l'unité de travail du triage et
 * du ticket Jira (§8) est le **paquet dans un projet**. Ce regroupement vivait
 * dans un `useMemo` de la page Triage ; la page de création de ticket en a
 * besoin aussi, d'où cette lib pure, sans React ni réseau.
 */

/** Unité de travail du triage : un package dans un projet, et ses CVE. */
export interface PackageGroup {
	/** Clé de regroupement `projectId::package`. */
	key: string;
	projectId: number;
	projectName: string;
	package: string;
	tool: string;
	cves: PackageGroupCve[];
	worstSeverity: Severity;
	pendingCount: number;
	hasConfirmed: boolean;
	maxBaselineAgeInDays: number;
	maxSlaAgeInDays: number;
	hasBaseline: boolean;
	hasNetDiscovery: boolean;
	/** Version cible retenue pour le package, `null` si aucune n'est connue. */
	targetPatch: string | null;
	/**
	 * Publication d'avis la plus ancienne du groupe (GHSA). `null` tant que
	 * l'enrichissement GHSA n'a pas tourné.
	 */
	publishedAt: string | null;
	/**
	 * Première détection par Aegis la plus ancienne du groupe. On retient la plus
	 * ancienne des deux dates parce que c'est elle qui porte le SLA : afficher la
	 * plus récente ferait paraître le groupe plus jeune qu'il ne l'est.
	 */
	firstSeenAt: string | null;
}

/** Une CVE au sein d'un `PackageGroup`, aplatie depuis une `CveOccurrence`. */
export interface PackageGroupCve
	extends Pick<
		CveOccurrence,
		| "title"
		| "severity"
		| "versionRange"
		| "fixedIn"
		| "link"
		| "status"
		| "note"
		| "cvssVector"
		| "ageInDays"
		| "firstSeenAt"
		| "publishedAt"
		| "isBaseline"
	> {
	/** Clé du groupe CVE : la référence, ou le libellé de repli. */
	cve: string;
	/** Référence affichable, `null` si l'avis n'en porte pas. */
	ref: string | null;
}

/**
 * La plus ancienne de deux dates ISO, en ignorant les absentes et les illisibles.
 *
 * Une date illisible traitée comme valide remonterait comme minimum et
 * afficherait « Invalid Date » sur toute la ligne.
 */
function plusAncienne(
	a: string | null,
	b: string | null | undefined,
): string | null {
	if (!b || Number.isNaN(new Date(b).getTime())) return a;
	if (!a) return b;
	return new Date(b) < new Date(a) ? b : a;
}

export interface PackageGroupFilters {
	/** Ne garder que ce projet. */
	projectId?: number | null;
	/** Ne garder que ce groupe CVE (égalité sur la clé). */
	cveFilter?: string | null;
	/** Écarter les occurrences dont le statut n'est plus `pending`. */
	hideProcessed?: boolean;
	/** Recherche partielle, insensible à la casse, sur référence, paquet, titre. */
	query?: string;
}

export function buildPackageGroups(
	cves: CveGroup[],
	{
		projectId = null,
		cveFilter = null,
		hideProcessed = false,
		query = "",
	}: PackageGroupFilters = {},
): PackageGroup[] {
	const map = new Map<string, PackageGroup>();
	// La recherche porte sur ce qu'on lit à l'écran — référence, paquet, titre —
	// et non sur les identifiants internes.
	const recherche = (query ?? "").trim().toLowerCase();

	cves.forEach((cveGroup) => {
		if (cveFilter && cveGroup.cve !== cveFilter) return;

		cveGroup.occurrences.forEach((occ) => {
			if (projectId && occ.projectId !== projectId) return;
			if (hideProcessed && occ.status !== "pending") return;
			if (
				recherche &&
				![cveGroup.cve, cveGroup.ref, occ.package, occ.title].some((champ) =>
					champ?.toLowerCase().includes(recherche),
				)
			) {
				return;
			}

			const key = `${occ.projectId}::${occ.package}`;
			let g = map.get(key);
			if (!g) {
				g = {
					key,
					projectId: occ.projectId,
					projectName: occ.projectName,
					package: occ.package,
					tool: occ.tool,
					cves: [],
					worstSeverity: occ.severity,
					pendingCount: 0,
					hasConfirmed: false,
					maxBaselineAgeInDays: 0,
					maxSlaAgeInDays: 0,
					hasBaseline: false,
					hasNetDiscovery: false,
					targetPatch: null as string | null,
					publishedAt: null as string | null,
					firstSeenAt: null as string | null,
				};
				map.set(key, g);
			}
			// La plus ancienne des deux dates : c'est celle qui porte le SLA.
			g.publishedAt = plusAncienne(g.publishedAt, occ.publishedAt);
			g.firstSeenAt = plusAncienne(g.firstSeenAt, occ.firstSeenAt);
			if (
				occ.fixedIn &&
				(!g.targetPatch || compareVersions(occ.fixedIn, g.targetPatch) > 0)
			) {
				g.targetPatch = occ.fixedIn;
			}
			const occAge = occ.ageInDays || 0;
			if (occ.isBaseline) {
				g.hasBaseline = true;
				if (occAge > g.maxBaselineAgeInDays) {
					g.maxBaselineAgeInDays = occAge;
				}
			} else {
				g.hasNetDiscovery = true;
				if (occAge > g.maxSlaAgeInDays) {
					g.maxSlaAgeInDays = occAge;
				}
			}
			if (
				(SEV_ORDER[occ.severity] ?? -1) > (SEV_ORDER[g.worstSeverity] ?? -1)
			) {
				g.worstSeverity = occ.severity;
			}
			if (occ.status === "pending") g.pendingCount++;
			if (occ.status === "confirmed") g.hasConfirmed = true;

			g.cves.push({
				cve: cveGroup.cve,
				ref: cveGroup.ref,
				title: occ.title || cveGroup.cve,
				severity: occ.severity,
				versionRange: occ.versionRange,
				fixedIn: occ.fixedIn,
				link: occ.link,
				status: occ.status,
				note: occ.note,
				cvssVector: occ.cvssVector,
				ageInDays: occ.ageInDays,
				firstSeenAt: occ.firstSeenAt,
				publishedAt: occ.publishedAt,
				isBaseline: occ.isBaseline,
			});
		});
	});
	return Array.from(map.values())
		.filter((g) => g.cves.length > 0)
		.sort((a, b) => b.projectName.localeCompare(a.projectName));
}
