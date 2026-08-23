import { listProjects } from "../db/projects";
import {
	getGlobalHistory,
	getLatestRun,
	HISTORY_DAYS_MAX,
	HISTORY_DAYS_MIN,
} from "../db/runs";
import { buildCveGroups } from "../lib/aggregator";
import type { Severity } from "../lib/parsers/types";

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

/**
 * Réponse de `GET /api/stats`. Déclarée ici, à côté du handler qui doit la
 * satisfaire : le `payload` typé plus bas fait échouer la compilation si l'un
 * des deux change sans l'autre.
 */
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
 * Un point de la série temporelle de `GET /api/history-global`.
 *
 * Le type est **celui de la couche de données** : la route ne remodèle rien, et
 * un changement de forme casse la compilation des deux côtés à la fois.
 */
export type { HistoryPoint } from "@/db/runs";

export const statsRoutes = {
	"/api/stats": {
		async GET() {
			const projects = listProjects().filter((p) => !p.ignored);
			const groups = buildCveGroups();

			let criticalCount = 0;
			let highCount = 0;
			let moderateCount = 0;
			let pendingCves = 0;

			for (const g of groups) {
				if (g.worst === "critical") criticalCount++;
				else if (g.worst === "high") highCount++;
				else if (g.worst === "moderate") moderateCount++;

				pendingCves += g.occurrences.filter(
					(o) => o.status === "pending",
				).length;
			}

			let lastSync: string | null = null;

			const projectRisks: ProjectRisk[] = [];

			for (const p of projects) {
				const run = getLatestRun(p.id);
				if (run) {
					if (!lastSync || new Date(run.ran_at) > new Date(lastSync)) {
						lastSync = run.ran_at;
					}
					const c = run.counts;
					const risk = c.critical * 20 + c.high * 10 + c.moderate * 2;
					if (risk > 0) {
						projectRisks.push({
							id: p.id,
							name: p.name,
							critical: c.critical,
							high: c.high,
							risk,
						});
					}
				}
			}

			const scoreValue =
				100 - criticalCount * 20 - highCount * 10 - moderateCount * 2;
			let healthGrade = "F";
			if (scoreValue >= 90) healthGrade = "A";
			else if (scoreValue >= 80) healthGrade = "B";
			else if (scoreValue >= 60) healthGrade = "C";
			else if (scoreValue >= 40) healthGrade = "D";
			else if (scoreValue >= 20) healthGrade = "E";

			const topProjects = projectRisks
				.sort((a, b) => b.risk - a.risk)
				.slice(0, 3);
			const topCves = groups
				.sort((a, b) => b.occurrences.length - a.occurrences.length)
				.slice(0, 3)
				.map((g) => ({
					cve: g.cve,
					title: g.occurrences[0]?.title || g.cve,
					worst: g.worst,
					count: g.occurrences.length,
				}));

			// Typé explicitement : toute divergence avec StatsResponse casse la compilation.
			const payload: StatsResponse = {
				monitoredProjects: projects.length,
				criticalVulnerabilities: criticalCount,
				pendingCves,
				lastSync,
				healthGrade,
				topProjects,
				topCves,
			};
			return Response.json(payload);
		},
	},

	"/api/history-global": {
		async GET(req: Request) {
			const url = new URL(req.url);
			const brut = url.searchParams.get("days");

			// `parseInt` sans garde : `?days=abc` donnait `NaN`, la boucle de buckets
			// ne tournait pas, et la réponse était `[]` en **200** — un graphique vide
			// sans la moindre erreur, indistinguable d'un parc sans historique.
			// `?days=100000` construisait cent mille buckets et bloquait le process.
			const jours = brut === null ? 30 : Number(brut);
			if (
				!Number.isInteger(jours) ||
				jours < HISTORY_DAYS_MIN ||
				jours > HISTORY_DAYS_MAX
			) {
				return Response.json(
					{
						error: `Fenêtre invalide : days doit être un entier entre ${HISTORY_DAYS_MIN} et ${HISTORY_DAYS_MAX}`,
					},
					{ status: 400 },
				);
			}

			return Response.json(getGlobalHistory(jours));
		},
	},
};
