import { listProjects, type Project } from "../../db/projects";
import { getLatestRun, type Run } from "../../db/runs";
import { getAnnotationsForProject, type Annotation } from "../../db/annotations";
import type { Severity, Vulnerability } from "../parsers/types";

const SEV_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
  info: 4,
  unknown: 5
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
}

export interface CveGroup {
  cve: string; // La clé
  ref: string | null; // L'identifiant affichable (CVE) ou null
  worst: Severity;
  occurrences: CveOccurrence[];
  cvssVector?: string | null;
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
      const ref = (cveTrimmed && cveTrimmed.length > 0) ? cveTrimmed : null;
      const groupKey = ref ? ref : `${vuln.package}: ${vuln.title}`;

      const existing = projectOccurrences.get(groupKey);
      if (!existing || SEV_ORDER[vuln.severity] < SEV_ORDER[existing.severity]) {
        projectOccurrences.set(groupKey, vuln);
      }
    }

    // Intégrer aux groupes globaux
    for (const [groupKey, vuln] of projectOccurrences.entries()) {
      const cveTrimmed = vuln.cve?.trim();
      const ref = (cveTrimmed && cveTrimmed.length > 0) ? cveTrimmed : null;
      
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
        cvssVector: vuln.cvssVector || null
      };

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          cve: groupKey,
          ref,
          worst: vuln.severity,
          occurrences: [occurrence],
          cvssVector: vuln.cvssVector || null
        });
      } else {
        const existingGroup = groups.get(groupKey)!;
        existingGroup.occurrences.push(occurrence);
        if (SEV_ORDER[vuln.severity] < SEV_ORDER[existingGroup.worst]) {
          existingGroup.worst = vuln.severity;
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
