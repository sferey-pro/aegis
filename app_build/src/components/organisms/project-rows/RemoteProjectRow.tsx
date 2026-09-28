import {
	Edit2,
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
							{p.tool} • Remote (Git)
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
				<span className="text-xs text-muted-foreground italic">Non applicable</span>
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
