/**
 * Types propres à l'écran de triage. Ils n'ont pas d'équivalent côté serveur :
 * `GET /api/cves` renvoie des `CveGroup` (regroupés par référence CVE), et le
 * client les réagrège par (projet, package) pour obtenir l'unité de travail
 * décrite en CONTEXT.md §8.
 *
 * Colocalisés ici, à côté des organismes qui les consomment, comme
 * `console-types.ts` l'est pour la console.
 */

import type { PackageGroup, PackageGroupCve } from "@/lib/package-groups";

/** Types déplacés dans la lib, réexportés pour les organismes qui les lisaient ici. */
export type { PackageGroup, PackageGroupCve };

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
