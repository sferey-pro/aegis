import type { CveOccurrence } from "@/lib/aggregator";
import type { Severity } from "@/lib/parsers/types";

/**
 * Types propres à l'écran de triage. Ils n'ont pas d'équivalent côté serveur :
 * `GET /api/cves` renvoie des `CveGroup` (regroupés par référence CVE), et le
 * client les réagrège par (projet, package) pour obtenir l'unité de travail
 * décrite en CONTEXT.md §8.
 *
 * Colocalisés ici, à côté des organismes qui les consomment, comme
 * `console-types.ts` l'est pour la console.
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
		| "isGlobal"
	> {
	/** Clé du groupe CVE : la référence, ou le libellé de repli. */
	cve: string;
	/** Référence affichable, `null` si l'avis n'en porte pas. */
	ref: string | null;
}

/** Notification éphémère affichée après une action de triage. */
export interface Toast {
	isOpen: boolean;
	title: string;
	message: React.ReactNode;
	type: "success" | "error" | "info";
}

/** État de la modale « Risque confirmé », qui exige une justification. */
export interface ConfirmModalState {
	isOpen: boolean;
	cve: string;
	projectId: number;
	reason: string;
}

/** État de la modale de préparation de ticket. */
export interface TicketModalState {
	isOpen: boolean;
	md: string;
	copied: boolean;
	group?: PackageGroup;
}
