import {
	Activity,
	AlertOctagon,
	AlertTriangle,
	Database,
	GitBranch,
	Shield,
} from "lucide-react";
import { memo } from "react";
import { HistoryChart } from "../HistoryChart";

export const Overview = memo(function Overview({
	stats,
	loading,
	setTriageProjectId,
	setCurrentTab,
	setTriageCveFilter,
	syncDisplay,
}: {
	stats: any;
	loading: boolean;
	setTriageProjectId: (id: number | null) => void;
	setCurrentTab: (tab: any) => void;
	setTriageCveFilter: (cve: string | null) => void;
	syncDisplay: string;
}) {
	return (
		<main className="flex-1 w-full max-w-7xl mx-auto mt-4 z-10 flex flex-col gap-6">
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
				{stats?.healthGrade && (
					<div className="bg-card border-border p-6 rounded-3xl flex flex-col items-center justify-center gap-2 relative overflow-hidden">
						<div className="absolute inset-0 /5 opacity-0"></div>
						<p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest z-10">
							Santé Globale
						</p>
						<div
							className={`relative z-10 w-24 h-24 mt-2 rounded-2xl flex items-center justify-center text-5xl font-black ${stats.healthGrade === "A" ? "bg-green-500/20 border " : stats.healthGrade === "B" ? "bg-blue-500/20 border " : stats.healthGrade === "C" ? "bg-yellow-500/20 border " : stats.healthGrade === "D" ? "bg-orange-500/20 border " : "bg-red-500/20 border "}`}
						>
							{stats.healthGrade}
						</div>
					</div>
				)}

				<div className="bg-card border-border p-6 rounded-3xl flex flex-col gap-4 relative overflow-hidden">
					<div className="absolute inset-0 /5 opacity-0"></div>
					<div className="flex items-center gap-3 relative z-10">
						<div className="w-12 h-12 rounded-2xl border flex items-center justify-center">
							<Activity className="w-6 h-6" />
						</div>
						<p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
							Failles Critiques
						</p>
					</div>
					<div className="mt-auto relative z-10">
						<h3 className="text-5xl font-black font-heading">
							{loading ? (
								<span className="opacity-50 text-3xl">...</span>
							) : (
								(stats?.criticalVulnerabilities ?? 0)
							)}
						</h3>
					</div>
				</div>

				<div className="bg-card border-border p-6 rounded-3xl flex flex-col gap-4 relative overflow-hidden">
					<div className="absolute inset-0 /5 opacity-0"></div>
					<div className="flex items-center gap-3 relative z-10">
						<div className="w-12 h-12 rounded-2xl border flex items-center justify-center">
							<GitBranch className="w-6 h-6" />
						</div>
						<p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
							Projets Surveillés
						</p>
					</div>
					<div className="mt-auto relative z-10">
						<h3 className="text-5xl font-black font-heading text-foreground">
							{loading ? (
								<span className="opacity-50 text-3xl">...</span>
							) : (
								(stats?.monitoredProjects ?? 0)
							)}
						</h3>
					</div>
				</div>

				<div className="bg-card border-border p-6 rounded-3xl flex flex-col gap-4 relative overflow-hidden">
					<div className="absolute inset-0 /5 opacity-0"></div>
					<div className="flex items-center gap-3 relative z-10">
						<div className="w-12 h-12 rounded-2xl border flex items-center justify-center">
							<Database className="w-6 h-6" />
						</div>
						<p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
							Base de Données
						</p>
					</div>
					<div className="mt-auto flex flex-col gap-1 relative z-10">
						<h3 className="text-2xl font-bold">
							{loading ? (
								<span className="opacity-50">...</span>
							) : stats?.lastSync ? (
								"Synchronisée"
							) : (
								"En attente"
							)}
						</h3>
						<p className="text-xs text-muted-foreground font-mono">
							{loading ? "--" : syncDisplay}
						</p>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
				{stats?.topProjects && stats.topProjects.length > 0 && (
					<div className="bg-card border-border p-6 rounded-3xl flex flex-col gap-6 relative">
						<div className="flex items-center gap-3 border-b pb-4">
							<Shield className="w-6 h-6" />
							<h3 className="font-bold text-xl font-heading">
								Top Projets à Risque
							</h3>
						</div>
						<div className="flex flex-col gap-3">
							{stats.topProjects.map((tp: any, i: number) => (
								<div
									key={i}
									onClick={() => {
										setTriageProjectId(tp.id);
										setCurrentTab("triage");
									}}
									className="group flex items-center justify-between dark:bg-black/20 p-4 rounded-2xl border cursor-pointer"
								>
									<div className="flex items-center gap-4">
										<div className="w-8 h-8 rounded-full bg-secondary text-muted-foreground flex items-center justify-center font-bold text-xs">
											#{i + 1}
										</div>
										<span className="font-semibold text-base" title={tp.name}>
											{tp.name}
										</span>
									</div>
									<div className="flex gap-2">
										{tp.critical > 0 && (
											<span className="flex items-center gap-1 border px-2.5 py-1 rounded-lg text-xs font-bold">
												<AlertOctagon className="w-3.5 h-3.5" /> {tp.critical}
											</span>
										)}
										{tp.high > 0 && (
											<span className="flex items-center gap-1 border px-2.5 py-1 rounded-lg text-xs font-bold">
												<AlertTriangle className="w-3.5 h-3.5" /> {tp.high}
											</span>
										)}
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{stats?.topCves && stats.topCves.length > 0 && (
					<div className="bg-card border-border p-6 rounded-3xl flex flex-col gap-6 relative">
						<div className="flex items-center gap-3 border-b pb-4">
							<Activity className="w-6 h-6" />
							<h3 className="font-bold text-xl font-heading">
								Vulnérabilités les plus fréquentes
							</h3>
						</div>
						<div className="flex flex-col gap-3">
							{stats.topCves.map((tc: any, i: number) => (
								<div
									key={i}
									onClick={() => {
										setTriageCveFilter(tc.cve);
										setCurrentTab("triage");
									}}
									className="group flex flex-col gap-2 dark:bg-black/20 p-4 rounded-2xl border cursor-pointer"
								>
									<div className="flex items-center justify-between">
										<span className="font-mono text-sm text-primary font-semibold">
											{tc.cve}
										</span>
										<span className="font-bold text-xs text-primary border px-2.5 py-1 rounded-lg">
											Présente {tc.count} fois
										</span>
									</div>
									<p
										className="text-xs text-muted-foreground truncate"
										title={tc.title}
									>
										{tc.title}
									</p>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] blur-[100px] rounded-full z-0 pointer-events-none"></div>

			<HistoryChart />
		</main>
	);
});
