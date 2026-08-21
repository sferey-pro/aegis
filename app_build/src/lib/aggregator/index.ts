import {
	type Annotation,
	getAnnotationsForProject,
} from "../../db/annotations";
import { listProjects } from "../../db/projects";
import { getLatestRun } from "../../db/runs";
import type { Severity, Vulnerability } from "../parsers/types";

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
			const cveTrimmed = vuln.cve?.trim();
			const ref = cveTrimmed && cveTrimmed.length > 0 ? cveTrimmed : null;
			const groupKey = ref ? ref : `${vuln.package}: ${vuln.title}`;

			const existing = projectOccurrences.get(groupKey);
			if (
				!existing ||
				SEV_ORDER[vuln.severity] < SEV_ORDER[existing.severity]
			) {
				projectOccurrences.set(groupKey, vuln);
			}
		}

		// Intégrer aux groupes globaux
		for (const [groupKey, vuln] of projectOccurrences.entries()) {
			const cveTrimmed = vuln.cve?.trim();
			const ref = cveTrimmed && cveTrimmed.length > 0 ? cveTrimmed : null;

			const ann = annMap.get(groupKey);
			const status = ann?.status || "pending";
			const note = ann?.note || "";

			// Override de la version corrigée: annotation > vuln > null
			const fixedIn = ann?.fixed_in || vuln.fixedIn || null;

			const occurrence: CveOccurrence = {
				projectId: project.id,
				projectName: project.name,
				tool: project.tool,
				package: vuln.package,
				severity: vuln.severity,
				versionRange: vuln.versionRange || null,
				fixedIn,
				title: vuln.title,
				link: vuln.link || null,
				status,
				note,
				isGlobal: ann ? ann.project_id === -1 : false,
				cvssVector: vuln.cvssVector || null,
				publishedAt: vuln.publishedAt,
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
					worst: vuln.severity,
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
				if (SEV_ORDER[vuln.severity] < SEV_ORDER[existingGroup.worst]) {
					existingGroup.worst = vuln.severity;
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
