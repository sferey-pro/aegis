import type { Annotation, AnnotationStatus } from "../db/annotations";
import type { Project, ProjectTool, ProjectType } from "../db/projects";
import type { Prompt } from "../db/prompts";
import type { Report, ReportDetail } from "../db/reports";
import type { Run } from "../db/runs";
import type { Tag } from "../db/tags";
import type { Ticket } from "../db/tickets";
import type { CveGroup, CveOccurrence } from "./aggregator";
import type { GitInfo } from "./git";
import type { Severity, Vulnerability } from "./parsers/types";

/**
 * Formes des réponses HTTP, telles que le frontend les reçoit.
 *
 * Ce module ne définit aucun type métier : il compose ceux de `db/` et `lib/`
 * pour décrire ce que chaque endpoint renvoie réellement. Plusieurs routes
 * enrichissent l'entité stockée (`/api/projects` ajoute l'état git et le dernier
 * run), et c'est cet écart que le frontend traduisait en `any`.
 *
 * Conséquence utile : si une route change de forme, le frontend cesse de
 * compiler au lieu de continuer en silence.
 *
 * ⚠️ Ce sont des types, pas des validations. `await res.json()` n'est pas
 * vérifié à l'exécution ; ces déclarations sont une affirmation sur le contrat,
 * garantie par le fait que les deux côtés vivent dans le même dépôt et se
 * déploient ensemble.
 */

// ---------------------------------------------------------------- projets

/** L'état git est absent ou partiel si le chemin n'est pas un dépôt. */
export type ProjectGitState = GitInfo | { isRepo: false };

/** `GET /api/projects` et `GET /api/projects/:id`. */
export type ProjectListItem = Project & {
	git: ProjectGitState;
	lastRun: Run | null;
};

/** `POST /api/projects/detect` — un seul outil deviné, ou aucun. */
export interface DetectResponse {
	tool: string | null;
}

/** `POST /api/projects/:id/audit`. */
export interface AuditResponse {
	success: boolean;
	run?: Run | null;
	deduped?: boolean;
	newCves?: NewCve[];
	error?: string;
}

/** Entrée du diff « nouvelles CVE » d'un run (CONTEXT.md §2). */
export interface NewCve {
	ref: string;
	package: string;
	severity: Severity;
}

/** `POST /api/projects/:id/git-fetch` et `git-pull`. */
export interface GitActionResponse {
	ok: boolean;
	log: string;
}

// ---------------------------------------------------------------- tableau de bord

/** Une entrée de « Top projets à risque ». */
export interface ProjectRisk {
	id: number;
	name: string;
	critical: number;
	high: number;
	risk: number;
}

/** Une entrée de « Vulnérabilités les plus fréquentes ». */
export interface TopCve {
	cve: string;
	title: string;
	worst: Severity;
	count: number;
}

/** `GET /api/stats`. */
export interface StatsResponse {
	monitoredProjects: number;
	criticalVulnerabilities: number;
	pendingCves: number;
	lastSync: string | null;
	healthGrade: string;
	topProjects: ProjectRisk[];
	topCves: TopCve[];
}

/**
 * `GET /api/history-global` — un point de la série temporelle.
 *
 * `date` est un libellé d'affichage (« JJ/MM », ou « NNh » en vue horaire) ;
 * `rawDate` porte la clé du bucket. `info` et `unknown` ne sont pas agrégés par
 * l'implémentation actuelle (écart N13 relevé dans docs/ISSUE.md).
 */
export interface HistoryPoint {
	date: string;
	rawDate: string;
	critical: number;
	high: number;
	moderate: number;
	low: number;
}

/** `GET /api/audit/status`. */
export interface AuditStatusResponse {
	isRunning: boolean;
	currentProject: number | null;
	progress: number;
	total: number;
}

// ---------------------------------------------------------------- triage

/**
 * Unité de travail du triage : un package dans un projet, avec toutes les CVE
 * qui le frappent. Construit côté client depuis `GET /api/cves`
 * (CONTEXT.md §8, clé de regroupement `projectId::package`).
 */
export interface PackageGroup {
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
	> {
	/** Clé du groupe CVE (référence, ou libellé de repli). */
	cve: string;
	/** Référence affichable, `null` si l'avis n'en porte pas. */
	ref: string | null;
}

/** Corps de `POST /api/annotations`. */
export interface AnnotationPayload {
	cve: string;
	projectId: number;
	status?: Annotation["status"];
	note?: string;
	fixedIn?: string | null;
}

// ---------------------------------------------------------------- rapports

/**
 * Vulnérabilité telle que l'écran Rapports la manipule lors d'un diff entre deux
 * comptes-rendus : la vulnérabilité du run, plus le nom du projet d'origine et
 * la clé d'identité utilisée par le diff (`projectId-package-cve|title`), qui
 * sert aussi de clé de rendu React.
 */
export type DiffVuln = Vulnerability & {
	projectName: string;
	_key: string;
};

// ---------------------------------------------------------------- interface

/** Notification éphémère affichée en bas d'écran. */
export interface Toast {
	title: string;
	message: React.ReactNode;
	type: "success" | "error" | "info";
}

// ---------------------------------------------------------------- réexports

export type {
	Annotation,
	AnnotationStatus,
	CveGroup,
	CveOccurrence,
	GitInfo,
	Project,
	ProjectTool,
	ProjectType,
	Prompt,
	Report,
	ReportDetail,
	Run,
	Tag,
	Ticket,
	Vulnerability,
};
