import { useCallback, useEffect, useState } from "react";
import {
	Route,
	Routes,
	useLocation,
	useNavigate,
	useSearchParams,
} from "react-router-dom";
import type { Report, ReportDetail } from "@/db/reports";
import { apiErrorMessage, fetchJson, jsonInit } from "@/lib/api";
import { useGlobalAudit } from "@/lib/useGlobalAudit";
import type { ProjectListItem } from "@/routes/projects";
import type { StatsResponse } from "@/routes/stats";

import { GlobalLoader } from "./components/layout/GlobalLoader";
import {
	type AuditFailure,
	ReportModal,
} from "./components/layout/ReportModal";
import { AuditProgressBar } from "./components/molecules/AuditProgressBar";
import { BlankLayout } from "./components/templates/BlankLayout";
import { MainLayout } from "./components/templates/MainLayout";
import { Debug } from "./pages/Debug";
import { Overview } from "./pages/Overview";
import { ProjectDetail } from "./pages/ProjectDetail";
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
	const [reportModal, setReportModal] = useState<Report | null>(null);

	const [loadingMessage, setLoadingMessage] = useState(
		"Connexion à la base de données...",
	);

	/**
	 * Orchestration de « Tout auditer » : pool de 4, annulable, triée (§2).
	 *
	 * Le tableau de messages tournant toutes les 800 ms a disparu avec le voile
	 * plein écran : « Recherche GHSA », « Calcul de la criticité » ne
	 * correspondaient à aucune étape réelle, et §2 interdit précisément tout appel
	 * GitHub pendant un audit.
	 */
	const { enMarche: auditing, progression, lancer, annuler } = useGlobalAudit();

	/**
	 * Périmètre de l'audit global : le filtre par tag de la page Projets, porté
	 * par l'URL.
	 *
	 * Il vivait dans l'état local de `Projects`, un composant enfant auquel `App`
	 * n'a pas accès : filtrer sur « Prod » pour n'auditer que trois projets en
	 * auditait quand même quinze. §2 fixe le périmètre aux projets **visibles**.
	 */
	const [searchParams] = useSearchParams();
	const filtreTag = searchParams.get("tag");

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
		setAuditErrors([]);
		try {
			const tous = await fetchJson<ProjectListItem[]>("/api/projects");
			// Périmètre = projets **visibles** (§2) : non ignorés, et filtrés par le
			// tag porté par l'URL quand il y en a un.
			const perimetre = tous
				.filter((p) => !p.ignored)
				.filter((p) => !filtreTag || p.tags?.includes(filtreTag));

			const resultats = await lancer(perimetre);

			const counts = {
				critical: 0,
				high: 0,
				moderate: 0,
				low: 0,
				info: 0,
				unknown: 0,
			};
			let totalVulns = 0;
			const reportDetails: ReportDetail[] = [];
			// N6 : les projets en échec sont recensés, pas ignorés. Les compter zéro
			// vulnérabilité produisait un compte-rendu faux — « 20 projets, 0
			// vulnérabilité » quand les vingt avaient échoué — puis l'archivait.
			const echecs: AuditFailure[] = [];

			// `resultats` arrive déjà trié : erreurs d'abord, puis plus de nouvelles
			// CVE (§2). L'ordre du compte-rendu et celui des détails en découlent.
			for (const r of resultats) {
				if (r.annule) continue;
				if (r.erreur) {
					echecs.push({
						projectId: r.project.id,
						name: r.project.name,
						message: r.erreur,
					});
					continue;
				}

				const run = r.reponse?.run;
				if (!run?.counts) continue;

				totalVulns += run.total || 0;
				counts.critical += run.counts.critical || 0;
				counts.high += run.counts.high || 0;
				counts.moderate += run.counts.moderate || 0;
				counts.low += run.counts.low || 0;
				counts.info += run.counts.info || 0;
				counts.unknown += run.counts.unknown || 0;

				if (run.vulnerabilities && run.vulnerabilities.length > 0) {
					reportDetails.push({
						projectId: r.project.id,
						projectName: r.project.name,
						vulns: run.vulnerabilities,
					});
				}
			}

			const annules = resultats.filter((r) => r.annule).length;

			// Un lot annulé de bout en bout n'a rien mesuré : l'archiver produirait un
			// compte-rendu qui décrit un parc qu'on n'a pas regardé.
			if (annules === resultats.length && resultats.length > 0) {
				setAuditErrors([
					{
						projectId: -1,
						name: "Audit global",
						message: "Audit annulé : aucun projet n'a été analysé.",
					},
				]);
				return;
			}

			const generatedReport = await fetchJson<Report>(
				"/api/reports",
				jsonInit("POST", {
					// Seuls les projets réellement audités sont comptés : le total et
					// le nombre de projets doivent décrire la même chose.
					projects_audited: resultats.length - echecs.length - annules,
					total_vulnerabilities: totalVulns,
					counts: counts,
					details: reportDetails,
				}),
			);
			setReportModal(generatedReport);
			setAuditErrors(
				annules > 0
					? [
							...echecs,
							{
								projectId: -1,
								name: "Audit global",
								message: `${annules} projet(s) non analysé(s) : audit annulé.`,
							},
						]
					: echecs,
			);

			await fetchStats();
		} catch (err) {
			// Échec avant même le lot — par exemple `GET /api/projects`. Aucun projet
			// n'est en cause, d'où l'identifiant sentinelle.
			setAuditErrors([
				{ projectId: -1, name: "Audit global", message: apiErrorMessage(err) },
			]);
		}
	}, [fetchStats, filtreTag, lancer]);

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
			{/* Le voile plein écran ne couvre plus que le chargement initial. Pendant
			    un audit, la page reste utilisable : c'est là que se trouve la console
			    live, seul endroit où l'on voit les commandes tourner et échouer. */}
			<GlobalLoader loading={loading} loadingMessage={loadingMessage} />

			<AuditProgressBar progression={progression} onCancel={annuler} />

			<div
				className={`flex flex-col min-h-screen overflow-x-hidden relative transition-opacity duration-300 ${loading ? "opacity-50 pointer-events-none blur-sm" : "opacity-100"}`}
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
						<Route path="/projects/:id" element={<ProjectDetail />} />
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
