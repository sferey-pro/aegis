import {
	Activity,
	AlertOctagon,
	AlertTriangle,
	Database,
	GitBranch,
	Shield,
} from "lucide-react";
import { HistoryChart } from "../HistoryChart";

export function Overview({
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
		<main className="flex-1 w-full max-w-7xl mx-auto mt-4 z-10 flex flex-col gap-6 animate-in fade-in duration-500">
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
				{stats?.healthGrade && (
					<div className="glass-panel p-6 rounded-3xl flex flex-col items-center justify-center gap-2 animate-in fade-in zoom-in-95 duration-300 relative group overflow-hidden border-border/40 hover:border-border/80 transition-all shadow-lg hover:shadow-xl">
						<div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
						<p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest z-10">
							Santé Globale
						</p>
						<div
							className={`relative z-10 w-24 h-24 mt-2 rounded-2xl flex items-center justify-center text-5xl font-black shadow-lg ${stats.healthGrade === "A" ? "bg-green-500/20 text-green-400 shadow-green-500/20 border border-green-500/30" : stats.healthGrade === "B" ? "bg-blue-500/20 text-blue-400 shadow-blue-500/20 border border-blue-500/30" : stats.healthGrade === "C" ? "bg-yellow-500/20 text-yellow-400 shadow-yellow-500/20 border border-yellow-500/30" : stats.healthGrade === "D" ? "bg-orange-500/20 text-orange-400 shadow-orange-500/20 border border-orange-500/30" : "bg-red-500/20 text-red-500 shadow-red-500/20 border border-red-500/30"}`}
						>
							{stats.healthGrade}
						</div>
					</div>
				)}

				<div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300 relative group overflow-hidden border-border/40 hover:border-red-500/30 transition-all shadow-lg hover:shadow-xl">
					<div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
					<div className="flex items-center gap-3 relative z-10">
						<div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shadow-lg shadow-red-500/10">
							<Activity className="w-6 h-6 text-red-500" />
						</div>
						<p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
							Failles Critiques
						</p>
					</div>
					<div className="mt-auto relative z-10">
						<h3 className="text-5xl font-black font-heading text-red-500 drop-shadow-sm">
							{loading ? (
								<span className="opacity-50 text-3xl">...</span>
							) : (
								(stats?.criticalVulnerabilities ?? 0)
							)}
						</h3>
					</div>
				</div>

				<div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300 relative group overflow-hidden border-border/40 hover:border-blue-500/30 transition-all shadow-lg hover:shadow-xl">
					<div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
					<div className="flex items-center gap-3 relative z-10">
						<div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shadow-lg shadow-blue-500/10">
							<GitBranch className="w-6 h-6 text-blue-400" />
						</div>
						<p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
							Projets Surveillés
						</p>
					</div>
					<div className="mt-auto relative z-10">
						<h3 className="text-5xl font-black font-heading text-foreground drop-shadow-sm">
							{loading ? (
								<span className="opacity-50 text-3xl">...</span>
							) : (
								(stats?.monitoredProjects ?? 0)
							)}
						</h3>
					</div>
				</div>

				<div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300 relative group overflow-hidden border-border/40 hover:border-green-500/30 transition-all shadow-lg hover:shadow-xl">
					<div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
					<div className="flex items-center gap-3 relative z-10">
						<div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shadow-lg shadow-green-500/10">
							<Database className="w-6 h-6 text-green-400" />
						</div>
						<p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
							Base de Données
						</p>
					</div>
					<div className="mt-auto flex flex-col gap-1 relative z-10">
						<h3 className="text-2xl font-bold text-green-400">
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
					<div className="glass-panel p-6 rounded-3xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300 relative border-border/40 shadow-xl">
						<div className="flex items-center gap-3 border-b border-border/40 pb-4">
							<Shield className="w-6 h-6 text-orange-400" />
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
									className="group flex items-center justify-between bg-black/20 p-4 rounded-2xl border border-white/5 hover:bg-white/5 hover:border-white/10 cursor-pointer transition-all"
								>
									<div className="flex items-center gap-4">
										<div className="w-8 h-8 rounded-full bg-secondary text-muted-foreground flex items-center justify-center font-bold text-xs group-hover:bg-primary/20 group-hover:text-primary transition-colors">
											#{i + 1}
										</div>
										<span className="font-semibold text-base" title={tp.name}>
											{tp.name}
										</span>
									</div>
									<div className="flex gap-2">
										{tp.critical > 0 && (
											<span className="flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-lg text-xs font-bold">
												<AlertOctagon className="w-3.5 h-3.5" /> {tp.critical}
											</span>
										)}
										{tp.high > 0 && (
											<span className="flex items-center gap-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded-lg text-xs font-bold">
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
					<div className="glass-panel p-6 rounded-3xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300 relative border-border/40 shadow-xl">
						<div className="flex items-center gap-3 border-b border-border/40 pb-4">
							<Activity className="w-6 h-6 text-red-400" />
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
									className="group flex flex-col gap-2 bg-black/20 p-4 rounded-2xl border border-white/5 hover:bg-white/5 hover:border-white/10 cursor-pointer transition-all"
								>
									<div className="flex items-center justify-between">
										<span className="font-mono text-sm text-primary font-semibold group-hover:underline">
											{tc.cve}
										</span>
										<span className="font-bold text-xs bg-primary/20 text-primary border border-primary/20 px-2.5 py-1 rounded-lg">
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

			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] bg-primary/5 blur-[100px] rounded-full z-0 pointer-events-none"></div>

			<HistoryChart />
		</main>
	);
}
