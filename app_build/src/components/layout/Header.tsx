import {
	AlertOctagon,
	FileBarChart,
	FolderGit2,
	LayoutDashboard,
	Loader2,
	Settings,
	Terminal,
	Sun,
	Moon,
} from "lucide-react";
import { memo, useState, useEffect } from "react";
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
	const [theme, setTheme] = useState("light");

	useEffect(() => {
		const stored = localStorage.getItem("aegis-theme");
		if (stored === "dark") {
			setTheme("dark");
			document.documentElement.classList.add("dark");
		} else {
			setTheme("light");
			document.documentElement.classList.remove("dark");
		}
	}, []);

	const toggleTheme = () => {
		const newTheme = theme === "light" ? "dark" : "light";
		setTheme(newTheme);
		localStorage.setItem("aegis-theme", newTheme);
		if (newTheme === "dark") {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	};

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

				<nav className="flex items-center gap-1.5 p-1.5 dark:bg-black/20 border border-border dark:border-white/5 rounded-2xl">
					<button
						onClick={() => setCurrentTab("overview")}
						className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${currentTab === "overview" ? "bg-primary text-primary-foreground (var(--primary),0.3)]" : "text-muted-foreground dark:hover:bg-white/5 "}`}
					>
						<LayoutDashboard className="w-4 h-4" />
						Vue d'ensemble
					</button>
					<button
						onClick={() => setCurrentTab("projects")}
						className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${currentTab === "projects" ? "bg-primary text-primary-foreground (var(--primary),0.3)]" : "text-muted-foreground dark:hover:bg-white/5 "}`}
					>
						<FolderGit2 className="w-4 h-4" />
						Projets
					</button>
					<button
						onClick={() => {
							setTriageProjectId(null);
							setTriageCveFilter(null);
							setCurrentTab("triage");
						}}
						className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${currentTab === "triage" ? "bg-primary text-primary-foreground (var(--primary),0.3)]" : "text-muted-foreground dark:hover:bg-white/5 "}`}
					>
						<AlertOctagon className="w-4 h-4" />
						CVEs
						{pendingCves !== undefined && pendingCves > 0 && (
							<span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
								{pendingCves}
							</span>
						)}
					</button>
					<button
						onClick={() => setCurrentTab("reports")}
						className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${currentTab === "reports" ? "bg-primary text-primary-foreground (var(--primary),0.3)]" : "text-muted-foreground dark:hover:bg-white/5 "}`}
					>
						<FileBarChart className="w-4 h-4" />
						Rapports
					</button>
					<button
						onClick={() => setCurrentTab("prompts")}
						className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${currentTab === "prompts" ? "bg-primary text-primary-foreground (var(--primary),0.3)]" : "text-muted-foreground dark:hover:bg-white/5 "}`}
					>
						<Terminal className="w-4 h-4" />
						Prompts
					</button>

					<div className="w-px h-6 dark:bg-white/10 mx-1"></div>

					<Button
						variant="ghost"
						size="icon"
						onClick={toggleTheme}
						className="rounded-xl text-muted-foreground dark:hover:bg-white/5"
						title="Changer de thème"
					>
						{theme === "light" ? (
							<Moon className="w-5 h-5" />
						) : (
							<Sun className="w-5 h-5" />
						)}
					</Button>

					<Button
						variant={currentTab === "settings" ? "default" : "ghost"}
						size="icon"
						onClick={() => setCurrentTab("settings")}
						className={`rounded-xl ${currentTab === "settings" ? "shadow-[0_0_15px_rgba(var(--primary),0.3)]" : "text-muted-foreground dark:hover:bg-white/5 "}`}
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
