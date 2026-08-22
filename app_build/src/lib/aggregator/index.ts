import {
	type Annotation,
	getAnnotationsForProject,
} from "../../db/annotations";
import { listProjects } from "../../db/projects";
import { getLatestRun } from "../../db/runs";
import {
	fixedVersionFromAdvisory,
	getAllCachedAdvisories,
	keyFrom,
} from "../github";
import type { Severity, Vulnerability } from "../parsers/types";
import { vulnKey, vulnRef } from "../vuln-identity";

const SEV_ORDER: Record<Severity, number> = {
	critical: 0,
	high: 1,
	moderate: 2,
	low: 3,
	info: 4,
	unknown: 5,
};

export interface CveOccurrence {
	projectId: number;
	projectName: string;
	tool: string;
	package: string;
	severity: Severity;
	versionRange: string | null;
	fixedIn: string | null;
	title: string;
	link: string | null;
	status: string;
	note: string;
	isGlobal?: boolean;
	cvssVector?: string | null;
	firstSeenAt?: string | null;
	ageInDays?: number;
	publishedAt?: string | null;
	isBaseline?: boolean;
}

export interface CveGroup {
	cve: string; // La clé
	ref: string | null; // L'identifiant affichable (CVE) ou null
	worst: Severity;
	occurrences: CveOccurrence[];
	cvssVector?: string | null;
	maxBaselineAgeInDays?: number;
	maxSlaAgeInDays?: number;
	hasBaseline?: boolean;
	hasNetDiscovery?: boolean;
}

export function buildCveGroups(): CveGroup[] {
	const projects = listProjects();
	const groups = new Map<string, CveGroup>();

	/**
	 * Avis GitHub connus, superposés au run à la lecture.
	 *
	 * Un run enregistre ce que l'outil d'audit a rapporté ; les métadonnées d'avis
	 * — sévérité GitHub, vecteur CVSS, date de publication, version corrigée —
	 * viennent d'une source distincte qui évolue indépendamment. Les superposer
	 * ici plutôt que de réécrire les runs a deux effets : le run reste le compte
	 * rendu brut de l'outil, et un enrichissement devient **immédiatement visible**
	 * sans réauditer. Sans cela, remplir le cache ne changeait rien à l'écran.
	 *
	 * Chargé en **une** requête : une lecture par vulnérabilité aurait ajouté un
	 * N+1 sur le chemin le plus chaud de l'application.
	 */
	const avis = getAllCachedAdvisories();

	/** Avis connu pour cette vulnérabilité, s'il y en a un. */
	const avisDe = (vuln: Vulnerability) => {
		const cle = keyFrom(vuln.cve, vuln.link);
		return cle ? avis.get(cle.id) : undefined;
	};

	/**
	 * Sévérité retenue : celle de l'avis quand elle est connue, sinon celle de
	 * l'outil.
	 *
	 * L'avis fait autorité parce que c'est lui qui corrige les « unknown » de
	 * `yarn audit` et les libellés propres à Composer. Une seule fonction sert le
	 * tri, le dédoublonnage et l'affichage : les trois avaient divergé une fois,
	 * et un groupe pouvait s'annoncer « low » en contenant une occurrence
	 * « critical ».
	 */
	const severiteDe = (vuln: Vulnerability): Severity => {
		const a = avisDe(vuln);
		return a && a.severity !== "unknown" ? a.severity : vuln.severity;
	};

	for (const project of projects) {
		if (project.ignored) continue;

		const latestRun = getLatestRun(project.id);
		if (!latestRun || latestRun.status === "error") continue;

		const annotations = getAnnotationsForProject(project.id);
		const annMap = new Map<string, Annotation>();
		for (const ann of annotations) {
			annMap.set(ann.cve, ann);
		}

		// Dédup intra-projet (garder la pire sévérité pour une même ref)
		const projectOccurrences = new Map<string, Vulnerability>();

		for (const vuln of latestRun.vulnerabilities) {
			const groupKey = vulnKey(vuln);

			const existing = projectOccurrences.get(groupKey);
			if (
				!existing ||
				SEV_ORDER[severiteDe(vuln)] < SEV_ORDER[severiteDe(existing)]
			) {
				projectOccurrences.set(groupKey, vuln);
			}
		}

		// Intégrer aux groupes globaux
		for (const [groupKey, vuln] of projectOccurrences.entries()) {
			const ref = vulnRef(vuln.cve);

			const ann = annMap.get(groupKey);
			const status = ann?.status || "pending";
			const note = ann?.note || "";

			const avisConnu = avisDe(vuln);

			/*
			 * Version corrigée : annotation > avis > outil.
			 *
			 * L'annotation reste souveraine — c'est une décision humaine. Vient
			 * ensuite l'avis, qui donne la première version patchée par plage de
			 * versions vulnérables ; `npm audit` ne la remonte pas toujours, et le
			 * « patch recommandé » restait alors vide sur des CVE dont GitHub
			 * connaissait pourtant le correctif. La résolution retombe d'elle-même
			 * sur la valeur de l'outil quand l'avis ne couvre pas ce paquet.
			 */
			const fixedIn =
				ann?.fixed_in ||
				(avisConnu
					? fixedVersionFromAdvisory({
							advisory: avisConnu,
							tool: project.tool,
							package: vuln.package,
							versionRange: vuln.versionRange,
							originalFixedIn: vuln.fixedIn,
						})
					: vuln.fixedIn) ||
				null;

			const occurrence: CveOccurrence = {
				projectId: project.id,
				projectName: project.name,
				tool: project.tool,
				package: vuln.package,
				severity: severiteDe(vuln),
				versionRange: vuln.versionRange || null,
				fixedIn,
				title: vuln.title,
				link: avisConnu?.html_url || vuln.link || null,
				status,
				note,
				isGlobal: ann ? ann.project_id === -1 : false,
				cvssVector: avisConnu?.cvss_vector || vuln.cvssVector || null,
				publishedAt: avisConnu?.published_at ?? vuln.publishedAt,
				firstSeenAt: vuln.firstSeenAt,
				isBaseline: vuln.isBaseline,
				ageInDays:
					vuln.isBaseline && vuln.publishedAt
						? Math.floor(
								(Date.now() - new Date(vuln.publishedAt).getTime()) /
									(1000 * 3600 * 24),
							)
						: vuln.firstSeenAt
							? Math.floor(
									(Date.now() - new Date(vuln.firstSeenAt).getTime()) /
										(1000 * 3600 * 24),
								)
							: 0,
			};

			const existingGroup = groups.get(groupKey);
			if (!existingGroup) {
				groups.set(groupKey, {
					cve: groupKey,
					ref,
					worst: severiteDe(vuln),
					occurrences: [occurrence],
					cvssVector: vuln.cvssVector || null,
					maxBaselineAgeInDays: occurrence.isBaseline
						? occurrence.ageInDays || 0
						: 0,
					maxSlaAgeInDays: !occurrence.isBaseline
						? occurrence.ageInDays || 0
						: 0,
					hasBaseline: !!occurrence.isBaseline,
					hasNetDiscovery: !occurrence.isBaseline,
				});
			} else {
				existingGroup.occurrences.push(occurrence);
				if (SEV_ORDER[severiteDe(vuln)] < SEV_ORDER[existingGroup.worst]) {
					existingGroup.worst = severiteDe(vuln);
				}
				const occAge = occurrence.ageInDays || 0;
				if (occurrence.isBaseline) {
					existingGroup.hasBaseline = true;
					if (occAge > (existingGroup.maxBaselineAgeInDays || 0)) {
						existingGroup.maxBaselineAgeInDays = occAge;
					}
				} else {
					existingGroup.hasNetDiscovery = true;
					if (occAge > (existingGroup.maxSlaAgeInDays || 0)) {
						existingGroup.maxSlaAgeInDays = occAge;
					}
				}

				if (!existingGroup.cvssVector && vuln.cvssVector) {
					existingGroup.cvssVector = vuln.cvssVector;
				}
			}
		}
	}

	// Tri final: gravité décroissante, puis par nombre d'occurrences décroissant
	const result = Array.from(groups.values());
	result.sort((a, b) => {
		const diffSev = SEV_ORDER[a.worst] - SEV_ORDER[b.worst];
		if (diffSev !== 0) return diffSev;
		return b.occurrences.length - a.occurrences.length;
	});

	return result;
}
