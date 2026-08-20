import { Terminal } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { ConsoleHeader } from "../molecules/ConsoleHeader";
import { ConsoleLogItem } from "../molecules/ConsoleLogItem";
import { ConsoleTabs } from "../molecules/ConsoleTabs";
import { Button } from "../ui/button";
import type { ConsoleEvent, LogEntry } from "./console-types";

export const Console = memo(function Console() {
	const [isOpen, setIsOpen] = useState(false);
	const [isMaximized, setIsMaximized] = useState(false);
	const [debugMode, setDebugMode] = useState(false);
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [activeTab, setActiveTab] = useState<string>("Global");
	const [isDisabled, setIsDisabled] = useState<boolean>(false);

	const logsEndRef = useRef<HTMLDivElement>(null);

	// Extract unique projects to create tabs
	const projectTabs = Array.from(
		new Set(logs.map((l) => l.project).filter(Boolean)),
	) as string[];
	const tabs = ["Global", ...projectTabs];

	useEffect(() => {
		const evtSource = new EventSource("/api/console");

		evtSource.onmessage = (event) => {
			if (event.data === ": disabled") {
				setIsDisabled(true);
				evtSource.close();
				return;
			}
			// Ignore ping and connected messages
			if (event.data === ": ping" || event.data === ": connected") return;

			try {
				const data: ConsoleEvent = JSON.parse(event.data);

				setLogs((prev) => {
					if (data.phase === "start") {
						return [
							...prev,
							{
								id: data.id,
								cmd: data.cmd || "unknown",
								cwd: data.cwd || "",
								label: data.label || "unknown",
								project: data.project,
								status: "running" as const,
								startTime: Date.now(),
							},
						].slice(-200); // Keep last 200 logs
					} else {
						return prev.map((log) => {
							if (log.id === data.id) {
								return {
									...log,
									status: data.exitCode === 0 ? "success" : "error",
									exitCode: data.exitCode,
									ms: data.ms,
									outText: data.outText,
									errorText: data.errorText,
								};
							}
							return log;
						});
					}
				});
			} catch (e) {
				console.error("SSE parse error", e);
			}
		};

		return () => evtSource.close();
	}, []);

	// Auto-scroll logic
	useEffect(() => {
		if (isOpen) {
			const container = logsEndRef.current?.parentElement;
			if (container) {
				const isAtBottom =
					container.scrollHeight -
						container.scrollTop -
						container.clientHeight <
					150;
				if (isAtBottom) {
					logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
				}
			} else {
				logsEndRef.current?.scrollIntoView();
			}
		}
	}, [logs, isOpen, activeTab, debugMode]);

	const runningCount = logs.filter((l) => l.status === "running").length;

	// Filter logs for the active tab
	const filteredLogs =
		activeTab === "Global" ? logs : logs.filter((l) => l.project === activeTab);

	if (!isOpen) {
		return (
			<Button
				variant="outline"
				onClick={() => setIsOpen(true)}
				className="fixed bottom-6 right-6 p-4 rounded-full bg-card border border-border z-50 w-auto h-auto transition-transform hover:scale-105 shadow-xl"
				title="Ouvrir la Console Live"
				style={{ marginRight: "var(--removed-body-scroll-bar-size, 0px)" }}
			>
				<Terminal className="w-6 h-6 text-primary" />
				{runningCount > 0 && (
					<span className="absolute top-0 right-0 flex h-4 w-4">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
						<span className="relative inline-flex rounded-full h-4 w-4 bg-primary text-[9px] font-bold items-center justify-center text-primary-foreground">
							{runningCount}
						</span>
					</span>
				)}
			</Button>
		);
	}

	return (
		<div
			className={`fixed z-50 flex flex-col bg-background/95 backdrop-blur-xl border-border font-mono text-sm shadow-2xl transition-all duration-300 ease-in-out overflow-hidden
				${
					isMaximized
						? "inset-0 md:inset-4 md:rounded-2xl border"
						: "bottom-0 right-0 w-full h-[60vh] md:w-[700px] md:h-[450px] md:bottom-6 md:right-6 md:rounded-2xl border-t border-l md:border"
				}`}
			style={{ marginRight: "var(--removed-body-scroll-bar-size, 0px)" }}
		>
			<ConsoleHeader
				debugMode={debugMode}
				setDebugMode={setDebugMode}
				isMaximized={isMaximized}
				setIsMaximized={setIsMaximized}
				onClear={() => setLogs([])}
				onClose={() => setIsOpen(false)}
			/>

			<ConsoleTabs
				tabs={tabs}
				activeTab={activeTab}
				setActiveTab={setActiveTab}
				logs={logs}
				globalRunningCount={runningCount}
			/>

			{/* Logs Viewport */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4 bg-card/90 relative">
				{isDisabled ? (
					<div className="text-muted-foreground/50 h-full flex flex-col gap-4 items-center justify-center text-center px-4">
						<Terminal className="w-12 h-12 opacity-50" />
						<div>
							<p className="font-semibold text-lg text-foreground mb-2">
								Console Live Désactivée
							</p>
							<p className="text-sm">
								Pour préserver les performances, vous pouvez la réactiver depuis
								les paramètres.
							</p>
						</div>
					</div>
				) : filteredLogs.length === 0 ? (
					<div className="text-muted-foreground/50 h-full flex flex-col gap-3 items-center justify-center italic text-center">
						<Terminal className="w-8 h-8 opacity-20" />
						En attente de commandes réseau ou audit...
					</div>
				) : (
					filteredLogs.map((log) => (
						<ConsoleLogItem
							key={log.id}
							log={log}
							debugMode={debugMode}
							showProjectBadge={activeTab === "Global"}
						/>
					))
				)}
				<div ref={logsEndRef} className="h-1" />
			</div>
		</div>
	);
});
