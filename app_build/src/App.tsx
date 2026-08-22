import { useCallback, useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Report, ReportDetail } from "@/db/reports";
import type { Run } from "@/db/runs";
import { apiErrorMessage, fetchJson, jsonInit } from "@/lib/api";
import type { ProjectListItem } from "@/routes/projects";
import type { StatsResponse } from "@/routes/stats";

/** Réponse de `POST /api/projects/:id/audit`, telle que la route la construit. */
interface AuditRunResponse {
	success: boolean;
	deduped?: boolean;
	run?: Run | null;
	error?: string;
}

import { GlobalLoader } from "./components/layout/GlobalLoader";
import {
	type AuditFailure,
	ReportModal,
} from "./components/layout/ReportModal";
import { BlankLayout } from "./components/templates/BlankLayout";
import { MainLayout } from "./components/templates/MainLayout";
import { Debug } from "./pages/Debug";
import { Overview } from "./pages/Overview";
import { Projects } from "./pages/Projects";
import { PromptsLibrary } from "./pages/PromptsLibrary";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { Triage } from "./pages/Triage";

export function App() {
	const navigate = useNavigate();
	const location = useLocation();

	const [stats, setStats] = useState<StatsResponse | null>(null);
	/** Message d'échec du chargement des statistiques, distinct de l'état vide. */
	const [statsError, setStatsError] = useState<string | null>(null);
	/** Projets dont l'audit a échoué pendant le dernier lot. */
	const [auditErrors, setAuditErrors] = useState<AuditFailure[]>([]);
	const [loading, setLoading] = useState(true);
	const [auditing, setAuditing] = useState(false);
	const [auditProgress, setAuditProgress] = useState<{
		current: number;
		total: number;
		name: string;
	} | null>(null);
	const [reportModal, setReportModal] = useState<Report | null>(null);

	const [loadingMessage, setLoadingMessage] = useState(
		"Connexion à la base de données...",
	);
	const [auditMessageIndex, setAuditMessageIndex] = useState(0);

	useEffect(() => {
		if (!auditing) return;
		let step = 0;
		const interval = setInterval(() => {
			step = (step + 1) % 4;
			setAuditMessageIndex(step);
		}, 800);
		return () => clearInterval(interval);
	}, [auditing]);

	useEffect(() => {
		const messages = [
			"Connexion à la base de données locale...",
			"Récupération des statistiques globales...",
			"Compilation des projets surveillés...",
			"Préparation de l'interface Aegis...",
		];
		let step = 0;
		const interval = setInterval(() => {
			step++;
			const next = messages[step];
			if (next) {
				setLoadingMessage(next);
			} else {
				clearInterval(interval);
			}
		}, 500);

		return () => clearInterval(interval);
	}, []);

	const fetchStats = useCallback(async (initial = false) => {
		try {
			let data: StatsResponse;
			if (initial) {
				[data] = await Promise.all([
					fetchJson<StatsResponse>("/api/stats"),
					new Promise<void>((resolve) => setTimeout(resolve, 1000)),
				]);
			} else {
				data = await fetchJson<StatsResponse>("/api/stats");
			}
			setStats(data);
			setStatsError(null);
		} catch (err) {
			// N6 : un chargement en échec ne doit pas se lire comme un parc sain.
			// `stats` est remis à null pour que l'affichage montre « — » et non
			// « 0 failles critiques », et l'erreur est portée à l'écran.
			setStats(null);
			setStatsError(apiErrorMessage(err));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchStats(true);
	}, [fetchStats]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.ctrlKey && e.shiftKey && e.key === "D") {
				e.preventDefault();
				navigate(location.pathname === "/debug" ? "/" : "/debug");
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [navigate, location.pathname]);

	const handleRunAudit = useCallback(async () => {
		setAuditing(true);
		setAuditProgress(null);
		setAuditErrors([]);
		try {
			const allProjects = await fetchJson<ProjectListItem[]>("/api/projects");
			const projectsToAudit = allProjects.filter((p) => !p.ignored);

			let current = 1;
			const total = projectsToAudit.length;
			let totalVulns = 0;
			const counts = {
				critical: 0,
				high: 0,
				moderate: 0,
				low: 0,
				info: 0,
				unknown: 0,
			};
			const reportDetails: ReportDetail[] = [];

			// N6 : les projets en échec sont recensés, pas ignorés. Les compter zéro
			// vulnérabilité produisait un compte-rendu faux — « 20 projets, 0
			// vulnérabilité » quand les vingt avaient échoué — puis l'archivait.
			const echecs: AuditFailure[] = [];

			for (const p of projectsToAudit) {
				setAuditProgress({ current, total, name: p.name });

				let auditData: AuditRunResponse | null = null;
				try {
					auditData = await fetchJson<AuditRunResponse>(
						`/api/projects/${p.id}/audit`,
						{ method: "POST" },
					);
				} catch (err) {
					echecs.push({
						projectId: p.id,
						name: p.name,
						message: apiErrorMessage(err),
					});
				}

				// Un run en erreur a des compteurs à zéro : c'est un échec, pas un
				// projet sain.
				if (auditData?.run?.status === "error") {
					echecs.push({
						projectId: p.id,
						name: p.name,
						message: auditData.run.error ?? "audit en erreur",
					});
				}

				if (auditData?.run?.counts && auditData.run.status !== "error") {
					totalVulns += auditData.run.total || 0;
					counts.critical += auditData.run.counts.critical || 0;
					counts.high += auditData.run.counts.high || 0;
					counts.moderate += auditData.run.counts.moderate || 0;
					counts.low += auditData.run.counts.low || 0;
					counts.info += auditData.run.counts.info || 0;
					counts.unknown += auditData.run.counts.unknown || 0;

					if (
						auditData.run.vulnerabilities &&
						auditData.run.vulnerabilities.length > 0
					) {
						reportDetails.push({
							projectId: p.id,
							projectName: p.name,
							vulns: auditData.run.vulnerabilities,
						});
					}
				}

				current++;
			}

			const generatedReport = await fetchJson<Report>(
				"/api/reports",
				jsonInit("POST", {
					// Seuls les projets réellement audités sont comptés : le total et
					// le nombre de projets doivent décrire la même chose.
					projects_audited: projectsToAudit.length - echecs.length,
					total_vulnerabilities: totalVulns,
					counts: counts,
					details: reportDetails,
				}),
			);
			setReportModal(generatedReport);
			setAuditErrors(echecs);

			await fetchStats();
		} catch (err) {
			// Échec avant même la boucle — par exemple `GET /api/projects`. Aucun
			// projet n'est en cause, d'où l'identifiant sentinelle.
			setAuditErrors([
				{ projectId: -1, name: "Audit global", message: apiErrorMessage(err) },
			]);
		} finally {
			setAuditing(false);
			setAuditProgress(null);
		}
	}, [fetchStats]);

	let syncDisplay = "Aucune synchronisation";
	if (stats?.lastSync) {
		const d = new Date(`${stats.lastSync}Z`);
		syncDisplay = d.toLocaleString("fr-FR", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
		});
	}

	return (
		<>
			<GlobalLoader
				loading={loading}
				auditing={auditing}
				loadingMessage={loadingMessage}
				auditProgress={auditProgress}
				auditMessageIndex={auditMessageIndex}
			/>

			<div
				className={`flex flex-col min-h-screen overflow-x-hidden relative transition-opacity duration-300 ${loading || auditing ? "opacity-50 pointer-events-none blur-sm" : "opacity-100"}`}
			>
				<Routes>
					<Route
						element={
							<MainLayout
								handleRunAudit={handleRunAudit}
								auditing={auditing}
								pendingCves={stats?.pendingCves}
							/>
						}
					>
						<Route
							path="/"
							element={
								<Overview
									stats={stats}
									error={statsError}
									onRetry={() => fetchStats()}
									loading={loading}
									syncDisplay={syncDisplay}
								/>
							}
						/>
						<Route path="/projects" element={<Projects />} />
						<Route path="/triage" element={<Triage />} />
						<Route path="/reports" element={<Reports auditing={auditing} />} />
						<Route path="/prompts" element={<PromptsLibrary />} />
						<Route path="/settings" element={<Settings />} />
					</Route>
					<Route element={<BlankLayout />}>
						<Route path="/debug" element={<Debug />} />
					</Route>
				</Routes>
			</div>

			<ReportModal
				reportModal={reportModal}
				setReportModal={setReportModal}
				auditErrors={auditErrors}
			/>
		</>
	);
}
