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
import { useStats, queryKeys } from "@/lib/api/queries";
import { useQueryClient } from "@tanstack/react-query";
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
import { TicketCreate } from "./pages/TicketCreate";
import { Triage } from "./pages/Triage";

export function App() {
	const navigate = useNavigate();
	const location = useLocation();

	const queryClient = useQueryClient();
	const { data: stats = null, error: statsErrorRaw, isLoading: loading, refetch: refetchStats } = useStats();
	const statsError = statsErrorRaw ? apiErrorMessage(statsErrorRaw) : null;
	/** Projets dont l'audit a échoué pendant le dernier lot. */
	const [auditErrors, setAuditErrors] = useState<AuditFailure[]>([]);

	const [reportModal, setReportModal] = useState<Report | null>(null);
	const [auditSummaryText, setAuditSummaryText] = useState<string | null>(null);

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

			let summaryText = "";

			// `resultats` arrive déjà trié : erreurs d'abord, puis plus de nouvelles
			// CVE (§2). L'ordre du compte-rendu et celui des détails en découlent.
			for (const r of resultats) {
				if (r.annule) continue;
				const p = r.project as ProjectListItem;
				if (r.erreur) {
					summaryText += `${p.name} - Erreur d'audit\n`;
					echecs.push({
						projectId: r.project.id,
						name: r.project.name,
						message: r.erreur,
					});
					continue;
				}

				const run = r.reponse?.run;
				if (!run?.counts) continue;

				const previousTotal = p.lastRun?.total ?? 0;
				const currentTotal = run.total || 0;
				const newCount = r.reponse?.newCves?.length || 0;
				let fixedCount = 0;
				if (p.lastRun) {
					fixedCount = Math.max(0, previousTotal + newCount - currentTotal);
				}

				if (currentTotal > 0 || fixedCount > 0 || newCount > 0) {
					const etat =
						currentTotal === 0
							? "Sain"
							: currentTotal < previousTotal
								? "En amélioration"
								: newCount > 0
									? "En danger"
									: "Vulnérable";
					summaryText += `${p.name} +${newCount} nouvelles CVEs (Total : ${currentTotal}) +${fixedCount} CVEs Corrigé - ${etat}\n`;
				}

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
				setAuditSummaryText(null);
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
			if (!summaryText) {
				summaryText = "Aucun projet vulnérable (Sain)\n";
			}
			setAuditSummaryText(summaryText);
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

			await queryClient.invalidateQueries({ queryKey: queryKeys.stats });
		} catch (err) {
			// Échec avant même le lot — par exemple `GET /api/projects`. Aucun projet
			// n'est en cause, d'où l'identifiant sentinelle.
			setAuditErrors([
				{ projectId: -1, name: "Audit global", message: apiErrorMessage(err) },
			]);
		}
	}, [filtreTag, lancer]);

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
				className={`flex flex-col min-h-screen overflow-x-hidden overflow-y-scroll relative transition-opacity duration-300 ${loading ? "opacity-50 pointer-events-none blur-sm" : "opacity-100"}`}
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
									onRetry={() => refetchStats()}
									loading={loading}
									syncDisplay={syncDisplay}
								/>
							}
						/>
						<Route path="/projects" element={<Projects />} />
						<Route path="/projects/:id" element={<ProjectDetail />} />
						<Route path="/triage" element={<Triage />} />
						<Route path="/tickets/new" element={<TicketCreate />} />
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
				summaryText={auditSummaryText}
			/>
		</>
	);
}
