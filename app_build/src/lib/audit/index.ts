import { resolve } from "node:path";
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
import { expandPath, getGitInfo } from "../git";
import { parseAuditOutput } from "../parsers";
import type { Severity, Vulnerability } from "../parsers/types";

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
			tool: tool,
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

export async function runAudit(
	projectId: number,
	force = false,
): Promise<{ run: Run | null; deduped: boolean; newCves: NewCve[] }> {
	const project = getProjectById(projectId);
	if (!project) throw new Error("Projet introuvable");

	return projectContext.run({ project: project.name }, async () => {
		const cwd = getAuditTarget(project);

		// 1. Lire l'état git
		const gitInfo = await getGitInfo(project.path); // gitInfo sur la racine git

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

		// 4. Lancement de l'audit
		let commandStr = "";
		let args: string[] = [];

		if (project.tool === "npm") {
			args = ["npm", "audit", "--json"];
		} else if (project.tool === "yarn") {
			args = ["yarn", "audit", "--json"];
		} else if (project.tool === "bun") {
			args = ["bun", "audit", "--json"];
		} else if (project.tool === "composer") {
			args = [
				"composer",
				"audit",
				"--format=json",
				"--locked",
				"--no-interaction",
			];
		}

		commandStr = args.join(" ");
		const startTime = Date.now();

		const eventId = emitConsoleStart({ cmd: commandStr, cwd, label: "audit" });

		let stdout = "";
		let stderr = "";
		let exitCode = 1;
		let systemError = null;

		try {
			const proc = spawn(args, {
				cwd,
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

		const errorOutput = systemError || (exitCode !== 0 ? stderr : undefined);
		emitConsoleEnd(eventId, {
			exitCode,
			ms: duration_ms,
			errorText: errorOutput?.trim(),
		});

		if (systemError || (stdout.trim() === "" && exitCode !== 0)) {
			const errMsg = systemError
				? `Erreur système: ${systemError}`
				: stderr.trim() || `${project.tool}: aucune sortie (exit ${exitCode})`;

			// Format de l'erreur multi-ligne
			const errorBody = [
				errMsg,
				`cwd: ${cwd}`,
				`exit: ${exitCode}`,
				stderr,
				stdout,
			]
				.filter(Boolean)
				.join("\n");

			const errRun = addRun({
				project_id: projectId,
				status: "error",
				total: 0,
				counts: {
					critical: 0,
					high: 0,
					moderate: 0,
					low: 0,
					info: 0,
					unknown: 0,
				},
				vulnerabilities: [],
				command: commandStr,
				commit_sha: gitInfo.sha,
				error: errorBody,
				duration_ms,
			});
			return { run: errRun, deduped: false, newCves: [] };
		}

		// Parsing
		try {
			const parsed = parseAuditOutput(project.tool, stdout);

			const isBaseline = !lastRun;
			const { enhancedVulns, counts } = await enhanceVulnerabilities(
				projectId,
				project.tool,
				parsed.vulnerabilities,
				isBaseline,
			);

			const successRun = addRun({
				project_id: projectId,
				status: enhancedVulns.length > 0 ? "vulnerable" : "ok",
				total: enhancedVulns.length,
				counts,
				vulnerabilities: enhancedVulns,
				command: commandStr,
				commit_sha: gitInfo.sha,
				error: null,
				duration_ms,
			});

			return {
				run: successRun,
				deduped: false,
				newCves: diffNewCves(lastRun, enhancedVulns),
			};
		} catch (err: unknown) {
			const errorBody = [
				errorMessage(err),
				`cwd: ${cwd}`,
				`exit: ${exitCode}`,
				stderr,
				stdout,
			]
				.filter(Boolean)
				.join("\n");

			const parseErrRun = addRun({
				project_id: projectId,
				status: "error",
				total: 0,
				counts: {
					critical: 0,
					high: 0,
					moderate: 0,
					low: 0,
					info: 0,
					unknown: 0,
				},
				vulnerabilities: [],
				command: commandStr,
				commit_sha: gitInfo.sha,
				error: errorBody,
				duration_ms,
			});
			return { run: parseErrRun, deduped: false, newCves: [] };
		}
	});
}

export async function ingestAudit(
	projectId: number,
	stdout: string,
	commitSha: string = "",
): Promise<{ run: Run | null; newCves: NewCve[] }> {
	const project = getProjectById(projectId);
	if (!project) throw new Error("Projet introuvable");

	const commandStr = `ci-ingest ${project.tool}`;

	if (stdout.trim() === "") {
		throw new Error("Payload vide");
	}

	// Parsing
	const { parseAuditOutput } = await import("../parsers");
	const parsed = parseAuditOutput(project.tool, stdout);

	const lastRun = getLatestRun(projectId);
	const isBaseline = !lastRun;

	const { enhancedVulns, counts: finalCounts } = await enhanceVulnerabilities(
		projectId,
		project.tool,
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
