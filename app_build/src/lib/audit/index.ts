import { resolve } from "node:path";
import { spawn } from "bun";
import { errorMessage } from "@/lib/utils";
import { getDb } from "../../db";
import { ensureOccurrences } from "../../db/occurrences";
import { getProjectById, type Project } from "../../db/projects";
import { addRun, getLatestRun, type Run } from "../../db/runs";
import { emitConsoleEnd, emitConsoleStart, projectContext } from "../console";
import { expandPath, getGitInfo } from "../git";
import { parseAuditOutput } from "../parsers";
import type { Severity } from "../parsers/types";

async function enhanceVulnerabilities(
	projectId: number,
	tool: any,
	parsedVulns: any[],
	isBaseline: boolean,
) {
	const { resolveFixedVersion } = await import("../github");

	// Ensure occurrences to freeze first_seen_at
	const occurrencesMap = ensureOccurrences(projectId, parsedVulns, isBaseline);

	const enhancedVulns = [];
	for (const v of parsedVulns) {
		const res = await resolveFixedVersion({
			tool: tool,
			package: v.package,
			cve: v.cve,
			link: v.link,
			versionRange: v.versionRange,
			originalFixedIn: v.fixedIn,
		});

		const key = `${v.package}::${v.cve || v.package}`;
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

	const counts = {
		critical: 0,
		high: 0,
		moderate: 0,
		low: 0,
		info: 0,
		unknown: 0,
	};
	for (const v of enhancedVulns) {
		const sev = (v.severity || "unknown") as Severity;
		if (sev in counts) counts[sev]++;
		else counts.unknown++;
	}

	return { enhancedVulns, counts };
}

function getAuditMaxAgeHours(): number {
	const db = getDb();
	const row = db
		.query(`SELECT value FROM settings WHERE key = 'AUDIT_MAX_AGE_HOURS'`)
		.get() as any;
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

export function getAuditTarget(project: Project): string {
	const root = expandPath(project.path);
	if (!project.audit_path) return root;

	// Si le chemin commence par / ou ~, c'est un chemin absolu à part entière
	if (
		project.audit_path.startsWith("/") ||
		project.audit_path.startsWith("~")
	) {
		return expandPath(project.audit_path);
	}

	// Sinon, c'est relatif à la racine Git (root)
	return resolve(root, project.audit_path);
}

export async function runAudit(
	projectId: number,
	force = false,
): Promise<{ run: Run | null; deduped: boolean; newCves: any[] }> {
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
				counts: counts as any,
				vulnerabilities: enhancedVulns,
				command: commandStr,
				commit_sha: gitInfo.sha,
				error: null,
				duration_ms,
			});

			// Calculer newCves par rapport à l'ancien run valide
			const newCves = [];
			if (lastRun && lastRun.status !== "error") {
				const oldSet = new Set(
					lastRun.vulnerabilities.map(
						(v: any) => `${v.package}::${v.cve || v.title}`,
					),
				);
				for (const v of enhancedVulns) {
					const key = `${v.package}::${v.cve || v.title}`;
					if (!oldSet.has(key)) {
						newCves.push({
							ref: v.cve || v.package,
							package: v.package,
							severity: v.severity,
						});
					}
				}
			} else {
				// Premier run ou précédent en erreur -> toutes les failles trouvées sont considérées "nouvelles"
				for (const v of enhancedVulns) {
					newCves.push({
						ref: v.cve || v.package,
						package: v.package,
						severity: v.severity,
					});
				}
			}

			return { run: successRun, deduped: false, newCves };
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
): Promise<{ run: Run | null; newCves: any[] }> {
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

	const { buildCveGroups } = await import("../aggregator");
	const groups = buildCveGroups();

	const newCves = [];
	const projectGroups = groups.filter((g) =>
		g.occurrences.some((o) => o.projectId === projectId),
	);
	for (const g of projectGroups) {
		if (
			g.occurrences.some(
				(o) => o.projectId === projectId && o.status === "pending",
			)
		) {
			newCves.push(g);
		}
	}

	return { run, newCves };
}
