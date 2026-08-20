import { Folder, Globe } from "lucide-react";
import { memo } from "react";
import type { LogEntry } from "../organisms/console-types";

interface ConsoleTabsProps {
	tabs: string[];
	activeTab: string;
	setActiveTab: (tab: string) => void;
	logs: LogEntry[];
	globalRunningCount: number;
}

export const ConsoleTabs = memo(function ConsoleTabs({
	tabs,
	activeTab,
	setActiveTab,
	logs,
	globalRunningCount,
}: ConsoleTabsProps) {
	return (
		<div className="flex overflow-x-auto bg-muted/30 border-b border-border hide-scrollbar shrink-0 w-full">
			{tabs.map((t) => {
				const tabRunning =
					t === "Global"
						? globalRunningCount
						: logs.filter((l) => l.project === t && l.status === "running")
								.length;

				return (
					<button
						type="button"
						key={t}
						onClick={() => setActiveTab(t)}
						className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold whitespace-nowrap border-b-2 relative transition-colors ${
							activeTab === t
								? "text-primary border-primary"
								: "text-muted-foreground border-transparent hover:text-foreground"
						}`}
					>
						{t === "Global" ? (
							<Globe className="w-3.5 h-3.5" />
						) : (
							<Folder className="w-3.5 h-3.5" />
						)}
						{t}
						{tabRunning > 0 && (
							<span className="ml-1 flex h-2 w-2 relative">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
								<span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
});
