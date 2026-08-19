import {
	AlertOctagon,
	FileBarChart,
	FolderGit2,
	LayoutDashboard,
	Loader2,
	Settings,
	Terminal,
} from "lucide-react";
import { memo } from "react";
import { Button } from "../ui/button";

export const Header = memo(function Header({
	currentTab,
	setCurrentTab,
	setTriageProjectId,
	setTriageCveFilter,
	handleRunAudit,
	auditing,
	pendingCves,
}: {
	currentTab: string;
	setCurrentTab: (tab: any) => void;
	setTriageProjectId: (id: number | null) => void;
	setTriageCveFilter: (cve: string | null) => void;
	handleRunAudit: () => void;
	auditing: boolean;
	pendingCves?: number;
}) {
	// Dark mode logic completely removed

	return (
		<header className="fixed top-0 left-0 right-0 z-50 border-b flex items-center justify-between py-4 px-6 md:px-12 w-full">
			<div className="flex items-center gap-2 select-none w-full max-w-7xl mx-auto justify-between">
				<div
					className="flex items-center gap-3 cursor-pointer"
					onClick={() => setCurrentTab("overview")}
				>
					<div className="relative flex items-center justify-center w-11 h-11 rounded-xl border overflow-hidden (var(--primary),0.2)] (var(--primary),0.4)]">
						<img
							src="/aegis-logo.jpg"
							alt="Aegis Logo"
							className="w-full h-full object-cover scale-110"
						/>
					</div>
					<h1 className="text-2xl font-bold font-heading tracking-tight">
						Aegis
					</h1>
				</div>

				<nav className="flex items-center gap-1.5 p-1.5 bg-card border border-border rounded-2xl">
					<Button
						variant={currentTab === "overview" ? "default" : "ghost"}
						onClick={() => setCurrentTab("overview")}
						className={`flex items-center gap-2 rounded-xl text-sm font-medium ${currentTab === "overview" ? "" : "text-muted-foreground"}`}
					>
						<LayoutDashboard className="w-4 h-4" />
						Vue d'ensemble
					</Button>
					<Button
						variant={currentTab === "projects" ? "default" : "ghost"}
						onClick={() => setCurrentTab("projects")}
						className={`flex items-center gap-2 rounded-xl text-sm font-medium ${currentTab === "projects" ? "" : "text-muted-foreground"}`}
					>
						<FolderGit2 className="w-4 h-4" />
						Projets
					</Button>
					<Button
						variant={currentTab === "triage" ? "default" : "ghost"}
						onClick={() => {
							setTriageProjectId(null);
							setTriageCveFilter(null);
							setCurrentTab("triage");
						}}
						className={`relative flex items-center gap-2 rounded-xl text-sm font-medium ${currentTab === "triage" ? "" : "text-muted-foreground"}`}
					>
						<AlertOctagon className="w-4 h-4" />
						CVEs
						{pendingCves !== undefined && pendingCves > 0 && (
							<span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
								{pendingCves}
							</span>
						)}
					</Button>
					<Button
						variant={currentTab === "reports" ? "default" : "ghost"}
						onClick={() => setCurrentTab("reports")}
						className={`flex items-center gap-2 rounded-xl text-sm font-medium ${currentTab === "reports" ? "" : "text-muted-foreground"}`}
					>
						<FileBarChart className="w-4 h-4" />
						Rapports
					</Button>
					<Button
						variant={currentTab === "prompts" ? "default" : "ghost"}
						onClick={() => setCurrentTab("prompts")}
						className={`flex items-center gap-2 rounded-xl text-sm font-medium ${currentTab === "prompts" ? "" : "text-muted-foreground"}`}
					>
						<Terminal className="w-4 h-4" />
						Prompts
					</Button>

					<div className="w-px h-6 bg-border mx-1"></div>

					<Button
						variant={currentTab === "settings" ? "default" : "ghost"}
						size="icon"
						onClick={() => setCurrentTab("settings")}
						className={`rounded-xl ${currentTab === "settings" ? "" : "text-muted-foreground"}`}
						title="Paramètres"
					>
						<Settings className="w-5 h-5" />
					</Button>
				</nav>

				<Button
					onClick={handleRunAudit}
					disabled={auditing}
					className="hover:scale-105"
				>
					{auditing ? <Loader2 className="w-4 h-4 mr-2" /> : null}
					{auditing ? "Audit en cours..." : "Lancer l'audit global"}
				</Button>
			</div>
		</header>
	);
});
