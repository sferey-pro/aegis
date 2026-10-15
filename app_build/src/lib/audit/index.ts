import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "bun";
import { errorMessage } from "@/lib/utils";
import { occurrenceKey, vulnRef } from "@/lib/vuln-identity";
import { getDb } from "../../db";
import { ensureOccurrences } from "../../db/occurrences";
import {
	getProjectById,
	type Project,
	type ProjectTool,
} from "../../db/projects";
import { addRun, getLatestRun, type Run } from "../../db/runs";
import { emitConsoleEnd, emitConsoleStart, projectContext } from "../console";
import { expandPath } from "../git";
import { parseAuditOutput } from "../parsers";
import type { Severity, Vulnerability } from "../parsers/types";
import { getAdapter } from "../project-adapters";
import { auditCommand, isKnownTool, preflightAudit } from "./preflight";

/** Entrée du diff « nouvelles CVE » d'un run (CONTEXT.md §2). */
export interface NewCve {
	ref: string;
	package: string;
	severity: Severity;
}

/**
 * Vulnérabilités absentes du run précédent.
 *
 * `CONTEXT.md` §2 définit `newCves` comme le **diff contre le dernier run
 * non-erreur**, sur la clé `package::cve` avec repli sur le titre. Une seule
 * implémentation pour les deux portes d'entrée — audit local et ingestion CI —
 * parce qu'elles répondent à la même question et que la réponse sert de porte
 * de non-régression côté client.
 *
 * `precedent` à `null` (premier run, ou précédent en erreur) : **tout** est
 * nouveau. C'est délibéré — on ne peut pas affirmer qu'une faille était déjà là
 * sans point de comparaison, et un rapport vide serait plus trompeur qu'un
 * rapport complet.
 */
export function diffNewCves(
	precedent: Run | null,
	courant: Vulnerability[],
): NewCve[] {
	const connues =
		precedent && precedent.status !== "error"
			? new Set(precedent.vulnerabilities.map((v) => occurrenceKey(v)))
			: null;

	const nouvelles: NewCve[] = [];
	for (const v of courant) {
		if (connues?.has(occurrenceKey(v))) continue;
		nouvelles.push({
			ref: vulnRef(v.cve) ?? v.package,
			package: v.package,
			severity: v.severity,
		});
	}
	return nouvelles;
}

/**
 * Complète les vulnérabilités d'un run avec ce que l'on sait déjà.
 *
 * **Aucun appel réseau** (CONTEXT.md §2, défaut N1) : l'enrichissement lit le
 * cache d'avis local. Ce qu'il n'y trouve pas reste tel que l'outil d'audit l'a
 * rapporté, et sera complété par la porte manuelle de `/api/advisories/sync`.
 * Un audit est donc hors ligne, déterministe et borné par le disque.
 */
async function enhanceVulnerabilities(
	projectId: number,
	tool: ProjectTool,
	parsedVulns: Vulnerability[],
	isBaseline: boolean,
) {
	const { resolveFixedVersionFromCache } = await import("../github");
	const { sortVulnerabilities } = await import("../parsers/utils");

	// Ensure occurrences to freeze first_seen_at
	const occurrencesMap = ensureOccurrences(projectId, parsedVulns, isBaseline);

	const enhancedVulns = [];
	for (const v of parsedVulns) {
		const res = resolveFixedVersionFromCache({
			tool: v.tool || tool,
			package: v.package,
			cve: v.cve,
			link: v.link,
			versionRange: v.versionRange,
			originalFixedIn: v.fixedIn,
		});

		const key = occurrenceKey(v);
		const occ = occurrencesMap.get(key) || {
			firstSeenAt: new Date().toISOString(),
			isBaseline: isBaseline,
		};

		enhancedVulns.push({
			...v,
			firstSeenAt: occ.firstSeenAt,
			isBaseline: occ.isBaseline,
			publishedAt: res.published_at || null,
			fixedIn: res.fixedIn,
			severity: res.severity !== "unknown" ? res.severity : v.severity,
			link: res.html_url || v.link,
			cvssVector: res.cvss_vector || v.cvssVector || null,
		});
	}

	// L'enrichissement peut relever une sévérité : le tri du parseur (§3) n'est
	// plus valide, et la liste persistée n'était donc plus ordonnée par gravité.
	// On retrie avant de compter, pour que l'ordre et les compteurs décrivent la
	// même chose.
	const triees = sortVulnerabilities(enhancedVulns);

	const counts = {
		critical: 0,
		high: 0,
		moderate: 0,
		low: 0,
		info: 0,
		unknown: 0,
	};
	for (const v of triees) {
		const sev = (v.severity || "unknown") as Severity;
		if (sev in counts) counts[sev]++;
		else counts.unknown++;
	}

	return { enhancedVulns: triees, counts };
}

/** Compteurs d'un run sans vulnérabilité — un échec n'est pas un projet sain. */
function emptyCounts() {
	return {
		critical: 0,
		high: 0,
		moderate: 0,
		low: 0,
		info: 0,
		unknown: 0,
	};
}

/**
 * Persiste un run en erreur (CONTEXT.md §2) : compteurs à zéro, aucune
 * vulnérabilité, `command` conservée telle qu'elle a été tentée.
 *
 * Un seul endroit, parce qu'il y a désormais quatre chemins d'échec — outil
 * inconnu, contrôle préalable, exécution, parsing — et qu'un compteur oublié
 * dans l'un d'eux ferait passer un échec pour un projet propre.
 */
function addErrorRun(fields: {
	projectId: number;
	command: string;
	commitSha: string | null;
	error: string;
	duration_ms: number;
}): Run {
	return addRun({
		project_id: fields.projectId,
		status: "error",
		total: 0,
		counts: emptyCounts(),
		vulnerabilities: [],
		command: fields.command,
		commit_sha: fields.commitSha,
		error: fields.error,
		duration_ms: fields.duration_ms,
	});
}

function getAuditMaxAgeHours(): number {
	const db = getDb();
	const row = db
		.query(`SELECT value FROM settings WHERE key = 'AUDIT_MAX_AGE_HOURS'`)
		.get() as { value: string } | null;
	if (!row) return 24;
	const val = parseFloat(row.value);
	if (Number.isNaN(val)) return 24;
	return val;
}

function isFresh(ranAtStr: string, maxAgeHours: number): boolean {
	if (maxAgeHours < 0) return false;
	if (maxAgeHours === 0) return true;

	const ranAt = new Date(`${ranAtStr}Z`); // SQLite CURRENT_TIMESTAMP is UTC
	if (Number.isNaN(ranAt.getTime())) return true; // Date illisible -> on garde frais par sécurité

	const now = new Date();
	const diffHours = (now.getTime() - ranAt.getTime()) / (1000 * 60 * 60);
	return diffHours <= maxAgeHours;
}

/**
 * Résout le dossier réellement audité depuis un couple (racine git, sous-dossier).
 *
 * Source de vérité unique : les contrôles d'autorisation de chemin et la
 * détection de doublon doivent appeler cette fonction, jamais recomposer le
 * chemin de leur côté. Les deux calculs avaient divergé, si bien qu'un
 * `audit_path` absolu était validé comme relatif puis exécuté comme absolu.
 */
export function resolveAuditTarget(
	path: string,
	auditPath?: string | null,
): string {
	const root = expandPath(path);
	if (!auditPath) return root;

	// Si le chemin commence par / ou ~, c'est un chemin absolu à part entière
	if (auditPath.startsWith("/") || auditPath.startsWith("~")) {
		return expandPath(auditPath);
	}

	// Sinon, c'est relatif à la racine Git (root)
	return resolve(root, auditPath);
}

export function getAuditTarget(project: Project): string {
	return resolveAuditTarget(project.path, project.audit_path);
}

/**
 * Clé d'unicité d'un projet : cible d'audit résolue, `/` finaux retirés
 * (CONTEXT.md §1). `~/app`, `/home/u/app` et `/home/u/app/` donnent la même clé.
 */
export function auditTargetKey(
	path: string,
	auditPath?: string | null,
): string {
	const target = resolveAuditTarget(path, auditPath);
	return target.length > 1 ? target.replace(/\/+$/, "") : target;
}

/**
 * Extrait le chemin relatif dans le dépôt à partir d'un chemin ou d'une URL raw GitHub.
 * Par exemple :
 * - "https://raw.githubusercontent.com/org/repo/main/frontend/yarn.lock" -> "frontend/yarn.lock"
 * - "https://raw.githubusercontent.com/org/repo/refs/heads/main/yarn.lock" -> "yarn.lock"
 * - "https://raw.githubusercontent.com/org/repo/env:prod/composer.lock" -> "composer.lock"
 * - "org/repo/main/frontend/yarn.lock" -> "frontend/yarn.lock"
 * - "frontend/yarn.lock" -> "frontend/yarn.lock"
 * - "yarn.lock" -> "yarn.lock"
 */
export function extractRepoRelativePath(pathOrUrl?: string | null): string {
	if (!pathOrUrl) return "";
	let cleaned = pathOrUrl.trim().replace(/\\/g, "/");
	const isRawUrl = cleaned.startsWith("https://raw.githubusercontent.com/");
	if (isRawUrl) {
		cleaned = cleaned.replace("https://raw.githubusercontent.com/", "");
	} else if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
		try {
			cleaned = new URL(cleaned).pathname.replace(/^\/+/, "");
		} catch {
			// conserve cleaned
		}
	} else {
		// Ce n'est pas une URL HTTP, c'est un chemin local ou relatif au dépôt (ex: "frontend/yarn.lock", "sub/dir/composer.lock")
		return cleaned.replace(/^\/+/, "");
	}

	const parts = cleaned.split("/").filter(Boolean);
	if (parts.length >= 4) {
		let relativeParts: string[];
		if (
			parts.length > 5 &&
			parts[2] === "refs" &&
			(parts[3] === "heads" || parts[3] === "tags")
		) {
			relativeParts = parts.slice(5);
		} else {
			relativeParts = parts.slice(3);
		}
		return relativeParts.join("/");
	}
	if (parts.length === 3) {
		return parts.slice(2).join("/");
	}
	return cleaned;
}

/**
 * Extrait le sous-dossier d'audit à partir d'un chemin, d'un nom de fichier lockfile ou d'une URL raw GitHub.
 * Par exemple:
 * - "frontend/yarn.lock" -> "frontend"
 * - "yarn.lock" -> ""
 * - "symfony" -> "symfony"
 * - "https://raw.githubusercontent.com/org/repo/main/frontend/yarn.lock" -> "frontend"
 * - "https://raw.githubusercontent.com/org/repo/refs/heads/main/yarn.lock" -> ""
 */
export function extractToolDirectory(pathOrFile?: string | null): string {
	if (!pathOrFile) return "";
	const repoRelative = extractRepoRelativePath(pathOrFile);
	const trimmed = repoRelative.trim().replace(/\\/g, "/");
	if (
		/\/(bun\.lockb?|package-lock\.json|yarn\.lock|composer\.lock|composer\.json|package\.json)$/i.test(
			trimmed,
		)
	) {
		const lastSlash = trimmed.lastIndexOf("/");
		return lastSlash >= 0 ? trimmed.substring(0, lastSlash) : "";
	}
	if (
		/^(bun\.lockb?|package-lock\.json|yarn\.lock|composer\.lock|composer\.json|package\.json)$/i.test(
			trimmed,
		)
	) {
		return "";
	}
	return trimmed.replace(/\/+$/, "");
}

export async function runAudit(
	projectId: number,
	force = false,
): Promise<{ run: Run | null; deduped: boolean; newCves: NewCve[] }> {
	const project = getProjectById(projectId);
	if (!project) throw new Error("Projet introuvable");

	return projectContext.run({ project: project.name }, async () => {
		const adapter = getAdapter(project);
		await adapter.prepare();
		const cwd = adapter.getAuditCwd();
		const gitInfo = await adapter.getGitInfo();

		// 2. Chercher le dernier run
		const lastRun = getLatestRun(projectId);

		// 3. Déduplication
		if (
			!force &&
			!gitInfo.dirty &&
			gitInfo.sha &&
			lastRun &&
			lastRun.status !== "error" &&
			lastRun.commit_sha === gitInfo.sha
		) {
			const maxAge = getAuditMaxAgeHours();
			if (isFresh(lastRun.ran_at, maxAge)) {
				return { run: lastRun, deduped: true, newCves: [] }; // Dédupliqué !
			}
		}

		// 4 & 5. Contrôles préalables pour chaque outil
		const toolsToRun: ProjectTool[] =
			project.tools && project.tools.length > 0
				? project.tools
				: [project.tool];

		const getToolCwd = (currentTool: ProjectTool): string => {
			const toolSubDir = extractToolDirectory(
				project.tool_paths?.[currentTool] ??
					(currentTool === project.tool ? project.audit_path : ""),
			);
			if (project.source_type === "local") {
				return toolSubDir ? resolveAuditTarget(project.path, toolSubDir) : cwd;
			}
			if (project.source_type === "remote") {
				const subPath = toolSubDir
					? join(project.path, toolSubDir)
					: project.path;
				return existsSync(subPath) ? subPath : project.path;
			}
			return cwd;
		};

		for (const currentTool of toolsToRun) {
			const toolCwd = getToolCwd(currentTool);

			if (!isKnownTool(currentTool)) {
				const errRun = addErrorRun({
					projectId,
					command: "",
					commitSha: gitInfo.sha,
					error: [
						`Outil d'audit inconnu: ${currentTool}`,
						`cwd: ${toolCwd}`,
					].join("\n"),
					duration_ms: 0,
				});
				return { run: errRun, deduped: false, newCves: [] };
			}

			const preflightError = preflightAudit(currentTool, toolCwd);
			if (preflightError) {
				const errRun = addErrorRun({
					projectId,
					command: auditCommand(currentTool).join(" "),
					commitSha: gitInfo.sha,
					error: [preflightError, `cwd: ${toolCwd}`].join("\n"),
					duration_ms: 0,
				});
				return { run: errRun, deduped: false, newCves: [] };
			}
		}

		// 6. Lancement séquentiel des audits pour chaque outil
		const allParsedVulns: Vulnerability[] = [];
		const commandsExecuted: string[] = [];
		let totalDurationMs = 0;

		for (const currentTool of toolsToRun) {
			const toolCwd = getToolCwd(currentTool);

			const args = auditCommand(currentTool);
			const commandStr = args.join(" ");
			commandsExecuted.push(commandStr);
			const startTime = Date.now();

			const eventId = emitConsoleStart({
				cmd: commandStr,
				cwd: toolCwd,
				label: "audit",
			});

			let stdout = "";
			let stderr = "";
			let exitCode = 1;
			let systemError = null;

			try {
				const proc = spawn(args, {
					cwd: toolCwd,
					env: { ...process.env, NO_COLOR: "1" },
					stdout: "pipe",
					stderr: "pipe",
				});
				const [stdoutText, stderrText] = await Promise.all([
					new Response(proc.stdout).text(),
					new Response(proc.stderr).text(),
				]);
				stdout = stdoutText;
				stderr = stderrText;
				exitCode = await proc.exited;
			} catch (err: unknown) {
				systemError = errorMessage(err);
			}

			const duration_ms = Date.now() - startTime;
			totalDurationMs += duration_ms;

			const errorOutput = systemError || (exitCode !== 0 ? stderr : undefined);
			emitConsoleEnd(eventId, {
				exitCode,
				ms: duration_ms,
				errorText: errorOutput?.trim(),
			});

			if (systemError || (stdout.trim() === "" && exitCode !== 0)) {
				const errMsg = systemError
					? `Erreur système: ${systemError}`
					: stderr.trim() || `${currentTool}: aucune sortie (exit ${exitCode})`;

				const errorBody = [
					errMsg,
					`cwd: ${toolCwd}`,
					`exit: ${exitCode}`,
					stderr,
					stdout,
				]
					.filter(Boolean)
					.join("\n");

				const errRun = addErrorRun({
					projectId,
					command: commandStr,
					commitSha: gitInfo.sha,
					error: errorBody,
					duration_ms: totalDurationMs,
				});
				return { run: errRun, deduped: false, newCves: [] };
			}

			// Parsing
			try {
				const parsed = parseAuditOutput(currentTool, stdout);
				for (const v of parsed.vulnerabilities) {
					v.tool = currentTool;
				}
				allParsedVulns.push(...parsed.vulnerabilities);
			} catch (err: unknown) {
				const errorBody = [
					errorMessage(err),
					`cwd: ${toolCwd}`,
					`exit: ${exitCode}`,
					stderr,
					stdout,
				]
					.filter(Boolean)
					.join("\n");

				const parseErrRun = addErrorRun({
					projectId,
					command: commandStr,
					commitSha: gitInfo.sha,
					error: errorBody,
					duration_ms: totalDurationMs,
				});
				return { run: parseErrRun, deduped: false, newCves: [] };
			}
		}

		// 7. Consolidation et persistance du run
		const isBaseline = !lastRun;
		const { enhancedVulns, counts } = await enhanceVulnerabilities(
			projectId,
			project.tool,
			allParsedVulns,
			isBaseline,
		);

		const successRun = addRun({
			project_id: projectId,
			status: enhancedVulns.length > 0 ? "vulnerable" : "ok",
			total: enhancedVulns.length,
			counts,
			vulnerabilities: enhancedVulns,
			command: commandsExecuted.join(" && "),
			commit_sha: gitInfo.sha,
			error: null,
			duration_ms: totalDurationMs,
		});

		return {
			run: successRun,
			deduped: false,
			newCves: diffNewCves(lastRun, enhancedVulns),
		};
	});
}

export async function ingestAudit(
	projectId: number,
	stdout: string,
	commitSha: string = "",
	toolOverride?: ProjectTool,
): Promise<{ run: Run | null; newCves: NewCve[] }> {
	const project = getProjectById(projectId);
	if (!project) throw new Error("Projet introuvable");

	const toolToUse = toolOverride || project.tool;
	const commandStr = `ci-ingest ${toolToUse}`;

	if (stdout.trim() === "") {
		throw new Error("Payload vide");
	}

	// Parsing
	const { parseAuditOutput } = await import("../parsers");
	const parsed = parseAuditOutput(toolToUse, stdout);
	for (const v of parsed.vulnerabilities) {
		v.tool = toolToUse;
	}

	const lastRun = getLatestRun(projectId);
	const isBaseline = !lastRun;

	const { enhancedVulns, counts: finalCounts } = await enhanceVulnerabilities(
		projectId,
		toolToUse,
		parsed.vulnerabilities,
		isBaseline,
	);

	const run = addRun({
		project_id: projectId,
		status: enhancedVulns.length > 0 ? "vulnerable" : "ok",
		total: enhancedVulns.length,
		counts: finalCounts,
		vulnerabilities: enhancedVulns,
		command: commandStr,
		commit_sha: commitSha,
		error: null,
		duration_ms: 0,
	});

	/*
	 * Diff calculé sur le run précédent **de ce projet** (N45).
	 *
	 * Le calcul passait par `buildCveGroups()`, l'agrégat global, qui **exclut les
	 * projets ignorés** — un filtre dont la finalité est l'affichage. Un projet
	 * marqué « ignoré » qui ingérait un rapport obtenait donc toujours
	 * `newCvesCount: 0`, quelle que soit la charge : le run était bien enregistré
	 * avec ses vulnérabilités, mais la porte CI restait verte pour de bon.
	 *
	 * Le passage par l'agrégat introduisait par ailleurs deux écarts au contrat :
	 * il comptait les CVE **non triées** (`status === "pending"`) plutôt que les
	 * **nouvelles**, et reconstruisait tout l'agrégat du parc à chaque ingestion.
	 */
	return { run, newCves: diffNewCves(lastRun, enhancedVulns) };
}
