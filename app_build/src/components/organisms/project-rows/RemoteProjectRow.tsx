import {
	Edit2,
	GitBranch,
	GitCommit,
	Play,
	Shield,
	Trash2,
} from "lucide-react";
import React from "react";
import { TagBadge } from "../../molecules/TagBadge";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { TableCell, TableRow } from "../../ui/table";
import type { ProjectRowProps } from "./index";

export const RemoteProjectRow = React.memo(function RemoteProjectRow({
	p,
	auditState,
	navigate,
	tagColors,
	handleForceAudit,
	handleEdit,
	handleDelete,
}: ProjectRowProps) {
	const rp = p as (typeof p & { remote_url: string; remote_token?: string });
	const isRepo = rp.git?.isRepo === true;
	const gitBranch = isRepo ? (rp.git as import("@/lib/git").GitInfo).branch : null;
	const gitSha = isRepo ? (rp.git as import("@/lib/git").GitInfo).sha : null;

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
						className={`w-5 h-5 ${p.ignored ? "text-muted-foreground" : hasNoCves ? "text-green-500" : hasCritical ? "text-destructive" : "text-primary"}`}
					/>
					<div className="flex flex-col">
						<span className="font-bold">{p.name}</span>
						<span className="text-[10px] text-muted-foreground uppercase">
							{p.tool} • <span className="text-purple-600 dark:text-purple-400 font-medium">Remote (Git)</span>
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
				<div className="flex flex-col gap-1 items-start text-xs font-mono">
					{gitBranch && (
						<span
							className="flex items-center gap-1 text-muted-foreground"
							title="Branche surveillée"
						>
							<GitBranch className="w-3 h-3" />
							{typeof gitBranch === "string" &&
							gitBranch.endsWith(" (Active)") ? (
								<>
									{gitBranch.replace(" (Active)", "")}
									<span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold uppercase tracking-wider leading-none shadow-sm border border-emerald-500/20">
										Active
									</span>
								</>
							) : (
								gitBranch
							)}
						</span>
					)}
					{gitSha && (
						<span className="flex items-center gap-1" title="Commit audité">
							<GitCommit className="w-3 h-3 text-primary/50" />
							{gitSha.substring(0, 7)}
						</span>
					)}
					{!isRepo && (
						<span className="text-muted-foreground italic">
							Non synchronisé
						</span>
					)}
				</div>
			</TableCell>
			<TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
				<div className="flex items-center justify-end gap-1">
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
