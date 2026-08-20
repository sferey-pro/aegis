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
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../ui/button";

export const Header = memo(function Header({
	handleRunAudit,
	auditing,
	pendingCves,
}: {
	handleRunAudit: () => void;
	auditing: boolean;
	pendingCves?: number;
}) {
	const location = useLocation();
	const navigate = useNavigate();

	const path = location.pathname;

	return (
		<header className="fixed top-0 left-0 right-0 z-50 border-b flex items-center justify-between py-4 px-6 md:px-12 w-full">
			<div className="flex items-center gap-2 select-none w-full max-w-7xl mx-auto justify-between">
				<div
					className="flex items-center gap-3 cursor-pointer"
					onClick={() => navigate("/")}
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
						variant={path === "/" ? "default" : "ghost"}
						onClick={() => navigate("/")}
						className={`flex items-center gap-2 rounded-xl text-sm font-medium ${path === "/" ? "" : "text-muted-foreground"}`}
					>
						<LayoutDashboard className="w-4 h-4" />
						Vue d'ensemble
					</Button>
					<Button
						variant={path === "/projects" ? "default" : "ghost"}
						onClick={() => navigate("/projects")}
						className={`flex items-center gap-2 rounded-xl text-sm font-medium ${path === "/projects" ? "" : "text-muted-foreground"}`}
					>
						<FolderGit2 className="w-4 h-4" />
						Projets
					</Button>
					<Button
						variant={path === "/triage" ? "default" : "ghost"}
						onClick={() => navigate("/triage")}
						className={`relative flex items-center gap-2 rounded-xl text-sm font-medium ${path === "/triage" ? "" : "text-muted-foreground"}`}
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
						variant={path === "/reports" ? "default" : "ghost"}
						onClick={() => navigate("/reports")}
						className={`flex items-center gap-2 rounded-xl text-sm font-medium ${path === "/reports" ? "" : "text-muted-foreground"}`}
					>
						<FileBarChart className="w-4 h-4" />
						Rapports
					</Button>
					<Button
						variant={path === "/prompts" ? "default" : "ghost"}
						onClick={() => navigate("/prompts")}
						className={`flex items-center gap-2 rounded-xl text-sm font-medium ${path === "/prompts" ? "" : "text-muted-foreground"}`}
					>
						<Terminal className="w-4 h-4" />
						Prompts
					</Button>

					<div className="w-px h-6 bg-border mx-1"></div>

					<Button
						variant={path === "/settings" ? "default" : "ghost"}
						size="icon"
						onClick={() => navigate("/settings")}
						className={`rounded-xl ${path === "/settings" ? "" : "text-muted-foreground"}`}
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
