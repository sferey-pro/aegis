import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { memo } from "react";
import type { LogEntry } from "../organisms/console-types";

interface ConsoleLogItemProps {
	log: LogEntry;
	debugMode: boolean;
	showProjectBadge?: boolean;
}

export const ConsoleLogItem = memo(function ConsoleLogItem({
	log,
	debugMode,
	showProjectBadge = false,
}: ConsoleLogItemProps) {
	return (
		<div className="flex gap-3 break-words whitespace-pre-wrap">
			<div className="w-4 flex-shrink-0 mt-0.5">
				{log.status === "running" && <Loader2 className="w-4 h-4 animate-spin" />}
				{log.status === "success" && <CheckCircle className="w-4 h-4 text-green-500" />}
				{log.status === "error" && <XCircle className="w-4 h-4 text-red-500" />}
			</div>

			<div className="flex-1 flex flex-col min-w-0">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="font-semibold text-xs px-2 py-0.5 rounded bg-muted">
						{log.label.toUpperCase()}
					</span>

					{showProjectBadge && log.project && (
						<span className="text-xs text-muted-foreground px-2 py-0.5 rounded border">
							{log.project}
						</span>
					)}

					<code className="text-amber-600 dark:text-amber-300 font-bold text-xs break-all">
						$ {log.cmd}
					</code>

					{log.status !== "running" && log.ms !== undefined && (
						<span className="text-xs text-muted-foreground shrink-0">
							({log.ms}ms)
						</span>
					)}

					{log.status === "error" && log.exitCode !== undefined && (
						<span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 shrink-0">
							code {log.exitCode}
						</span>
					)}
				</div>

				{log.cwd && (
					<div className="text-xs text-muted-foreground/70 mt-1 pl-2 border-l-2 border-border truncate">
						{log.cwd}
					</div>
				)}

				{log.status === "error" && log.errorText && !debugMode ? (
					<div className="text-xs mt-1 pl-2 border-l-2 border-red-500/50 p-2 bg-red-500/10 rounded break-all text-red-800 dark:text-red-200">
						{log.errorText}
					</div>
				) : null}

				{debugMode && log.status !== "running" ? (
					<div className="mt-2 flex flex-col gap-2 w-full max-w-full overflow-hidden">
						{log.outText ? (
							<div className="text-[10px] border-l-2 border-blue-500/50 p-2 bg-blue-500/10 rounded overflow-x-auto whitespace-pre-wrap break-words w-full text-blue-800 dark:text-blue-200 font-mono">
								<span className="font-bold block mb-1 text-blue-600 dark:text-blue-400">STDOUT :</span>
								{log.outText}
							</div>
						) : null}
						{log.errorText ? (
							<div className="text-[10px] border-l-2 border-red-500/50 p-2 bg-red-500/10 rounded overflow-x-auto whitespace-pre-wrap break-words w-full text-red-800 dark:text-red-200 font-mono">
								<span className="font-bold block mb-1 text-red-600 dark:text-red-400">STDERR :</span>
								{log.errorText}
							</div>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	);
});
