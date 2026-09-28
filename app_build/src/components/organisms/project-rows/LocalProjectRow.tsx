import {
	AlertTriangle,
	ArrowDownToLine,
	CloudDownload,
	Edit2,
	GitBranch,
	Play,
	RefreshCw,
	Shield,
	Trash2,
} from "lucide-react";
import React from "react";
import { TagBadge } from "../../molecules/TagBadge";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { TableCell, TableRow } from "../../ui/table";
import type { ProjectRowProps } from "./index";

export const LocalProjectRow = React.memo(function LocalProjectRow({
	p,
	auditState,
	navigate,
	tagColors,
	detectingId,
	handleDetectGit,
	handleFetch,
	handlePull,
	handleForceAudit,
	handleEdit,
	handleDelete,
}: ProjectRowProps) {
	const hasCritical = (p.lastRun?.counts?.critical ?? 0) > 0;
	const hasNoCves =
		p.lastRun &&
		Object.values(p.lastRun.counts).reduce((a, b) => a + b, 0) === 0;

	return (
		<TableRow
			className={`group cursor-pointer ${p.ignored ? "opacity-50 grayscale" : ""} ${auditState[p.id] ? "opacity-60 bg-muted/40" : ""}`}
			onClick={() => navigate(`/projects/${p.id}`)}
		>
			<TableCell>
				<div className="flex items-center gap-3">
					<Shield
						className={`w-5 h-5 ${p.ignored ? "text-muted-foreground" : hasNoCves ? "text-green-500" : hasCritical ? "text-red-500" : "text-primary"}`}
					/>
					<div className="flex flex-col">
						<span className="font-bold">{p.name}</span>
						<span className="text-[10px] text-muted-foreground uppercase">
							{p.tool} • Local
						</span>
					</div>
				</div>
			</TableCell>
			<TableCell>
				<div className="flex flex-col gap-2 items-start">
					<div className="flex flex-wrap gap-1">
						{p.tags?.map((tag: string) => (
							<TagBadge key={tag} name={tag} color={tagColors[tag]} />
						))}
					</div>
					<div className="flex items-center gap-2">
						{hasNoCves && (
							<Badge variant="outline" className="text-[10px]">
								Sain
							</Badge>
						)}
						{hasCritical && (
							<Badge variant="outline" className="text-[10px]">
								Critique
							</Badge>
						)}
					</div>
				</div>
			</TableCell>
			<TableCell>
				{p.git?.isRepo ? (
					<div className="flex items-center gap-3 text-xs">
						<div className="flex items-center gap-1 font-mono">
							<GitBranch className="w-3 h-3" />
							<span
								className="truncate max-w-[80px]"
								title={p.git.branch || "detached"}
							>
								{p.git.branch || "detached"}
							</span>
						</div>
						{p.git.dirty && (
							<span title="Arbre de travail sale" className="inline-flex">
								<AlertTriangle className="w-3.5 h-3.5" />
							</span>
						)}
						{p.git.behind > 0 && (
							<span
								className="text-red-600 dark:text-red-400 font-bold flex items-center gap-0.5"
								title={`${p.git.behind} commits de retard`}
							>
								<ArrowDownToLine className="w-3 h-3" /> {p.git.behind}
							</span>
						)}
					</div>
				) : (
					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground italic">
							{p.git === null ? "Git non chargé" : "Non-Git"}
						</span>
						<button
							type="button"
							onClick={(e) => handleDetectGit(p.id, e)}
							disabled={detectingId === p.id}
							className="p-1 text-muted-foreground rounded disabled:opacity-50"
							title={
								p.git === null
									? "Lire l'état Git de ce projet"
									: "Re-détecter le dépôt Git"
							}
						>
							<RefreshCw
								className={`w-3 h-3 ${detectingId === p.id ? "animate-spin text-primary" : ""}`}
							/>
						</button>
					</div>
				)}
			</TableCell>
			<TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
				<div className="flex items-center justify-end gap-1">
					{p.git?.isRepo && (
						<>
							<Button
								variant="ghost"
								size="icon"
								onClick={(e) => handleFetch(p.id, e)}
								className="w-7 h-7 text-muted-foreground"
								title="Git Fetch"
							>
								<CloudDownload className="w-3.5 h-3.5" />
							</Button>
							{p.git.behind > 0 && (
								<Button
									variant="outline"
									size="sm"
									onClick={(e) => handlePull(p.id, e)}
									className="h-6 px-2 text-[10px] uppercase mx-1"
								>
									Pull
								</Button>
							)}
						</>
					)}
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => handleForceAudit(p.id, e)}
						className="w-7 h-7 text-muted-foreground"
						title="Forcer un audit"
					>
						<Play className="w-3.5 h-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => handleEdit(p, e)}
						className="w-7 h-7 text-muted-foreground"
					>
						<Edit2 className="w-3.5 h-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => handleDelete(p.id, e)}
						className="w-7 h-7 text-muted-foreground"
					>
						<Trash2 className="w-3.5 h-3.5" />
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
});
