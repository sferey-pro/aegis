import { useEffect, useState } from "react";
import { Console } from "./components/Console";
import { GlobalLoader } from "./components/layout/GlobalLoader";
import { Header } from "./components/layout/Header";
import { ReportModal } from "./components/layout/ReportModal";
import { Overview } from "./components/overview/Overview";
import { Projects } from "./components/Projects";
import { PromptsLibrary } from "./components/PromptsLibrary";
import { Reports } from "./components/Reports";
import { Settings } from "./components/Settings";
import { Triage } from "./components/Triage";

interface Stats {
	monitoredProjects: number;
	criticalVulnerabilities: number;
	pendingCves?: number;
	lastSync: string | null;
	healthGrade?: string;
	topProjects?: Array<{
		id: number;
		name: string;
		critical: number;
		high: number;
	}>;
	topCves?: Array<{ cve: string; title: string; count: number; worst: string }>;
}

export function App() {
	const [currentTab, setCurrentTab] = useState<
		"overview" | "projects" | "triage" | "reports" | "prompts" | "settings"
	>("overview");
	const [stats, setStats] = useState<Stats | null>(null);
	const [loading, setLoading] = useState(true);
	const [auditing, setAuditing] = useState(false);
	const [auditProgress, setAuditProgress] = useState<{
		current: number;
		total: number;
		name: string;
	} | null>(null);
	const [triageProjectId, setTriageProjectId] = useState<number | null>(null);
	const [triageCveFilter, setTriageCveFilter] = useState<string | null>(null);
	const [reportModal, setReportModal] = useState<any | null>(null);

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
			if (step < messages.length) {
				setLoadingMessage(messages[step]!);
			}
		}, 500);

		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		fetchStats(true);
	}, []);

	const fetchStats = async (initial = false) => {
		try {
			let res;
			if (initial) {
				[res] = await Promise.all([
					fetch("/api/stats"),
					new Promise((resolve) => setTimeout(resolve, 1000)),
				]);
			} else {
				res = await fetch("/api/stats");
			}
			const data = await res.json();
			setStats(data);
		} catch (err) {
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	const handleRunAudit = async () => {
		setAuditing(true);
		setAuditProgress(null);
		try {
			const res = await fetch("/api/projects");
			const allProjects = await res.json();
			const projectsToAudit = allProjects.filter((p: any) => !p.ignored);

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
			const reportDetails: any[] = [];

			for (const p of projectsToAudit) {
				setAuditProgress({ current, total, name: p.name });
				const auditRes = await fetch(`/api/projects/${p.id}/audit`, {
					method: "POST",
				});
				const auditData = await auditRes.json();

				if (auditData.run && auditData.run.counts) {
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

			const reportRes = await fetch("/api/reports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projects_audited: projectsToAudit.length,
					total_vulnerabilities: totalVulns,
					counts: counts,
					details: reportDetails,
				}),
			});
			const generatedReport = await reportRes.json();
			setReportModal(generatedReport);

			await fetchStats();
		} catch (err) {
			console.error(err);
		} finally {
			setAuditing(false);
			setAuditProgress(null);
		}
	};

	let syncDisplay = "Aucune synchronisation";
	if (stats?.lastSync) {
		const d = new Date(stats.lastSync + "Z");
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
				<Header
					currentTab={currentTab}
					setCurrentTab={setCurrentTab}
					setTriageProjectId={setTriageProjectId}
					setTriageCveFilter={setTriageCveFilter}
					handleRunAudit={handleRunAudit}
					auditing={auditing}
					pendingCves={stats?.pendingCves}
				/>

				<div className="pt-[88px] flex-1 flex flex-col w-full">
					{currentTab === "overview" && (
						<Overview
							stats={stats}
							loading={loading}
							setTriageProjectId={setTriageProjectId}
							setCurrentTab={setCurrentTab}
							setTriageCveFilter={setTriageCveFilter}
							syncDisplay={syncDisplay}
						/>
					)}

					{currentTab === "projects" && (
						<Projects
							onViewTriage={(id) => {
								setTriageProjectId(id);
								setCurrentTab("triage");
							}}
						/>
					)}
					{currentTab === "triage" && (
						<Triage
							projectId={triageProjectId}
							cveFilter={triageCveFilter}
							onClearProject={() => setTriageProjectId(null)}
							onClearCve={() => setTriageCveFilter(null)}
						/>
					)}
					{currentTab === "reports" && <Reports />}
					{currentTab === "prompts" && <PromptsLibrary />}
					{currentTab === "settings" && <Settings />}
				</div>

				<ReportModal
					reportModal={reportModal}
					setReportModal={setReportModal}
					setCurrentTab={setCurrentTab}
				/>

				<footer className="w-full text-center py-8 mt-12 border-t border-border/10 text-muted-foreground/60 text-sm animate-in fade-in duration-500">
					<p className="font-bold text-foreground/50 mb-1 tracking-wider uppercase text-xs">
						Aegis Security
					</p>
					<p>
						Parce que coder sans faille relève du mythe, mais les corriger avant
						le week-end est un art.
					</p>
				</footer>

				<Console />
			</div>
		</>
	);
}
