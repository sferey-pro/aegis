import {
	AlertTriangle,
	ArrowDownToLine,
	CheckCircle2,
	Clock,
	CloudDownload,
	Edit2,
	GitBranch,
	HardDrive,
	Info,
	Loader2,
	MoreHorizontal,
	Play,
	RefreshCw,
	Shield,
	Trash2,
} from "lucide-react";
import React from "react";
import { relativeAge } from "@/lib/utils";
import { TagBadge } from "../../molecules/TagBadge";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import type { ProjectCardProps } from "./index";

export const LocalProjectCard = React.memo(function LocalProjectCard({
	p,
	index,
	auditState,
	onOpen,
	detectingId,
	handleDetectGit,
	handleFetch,
	handlePull,
	toggleIgnore,
	handleForceAudit,
	handleEdit,
	handleDelete,
	formatDate,
	tagColors,
}: ProjectCardProps) {
	const hasCritical = (p.lastRun?.counts?.critical ?? 0) > 0;
	const hasNoCves =
		p.lastRun &&
		Object.values(p.lastRun.counts).reduce((a, b) => a + b, 0) === 0;

	return (
		<div
			className={`group bg-card border-border p-5 rounded-xl flex flex-col gap-3 slide-in-from-bottom-4 relative overflow-hidden ${p.ignored ? "opacity-50 grayscale" : hasCritical ? "border-red-500/50 cursor-pointer " : "hover:-translate-y-1 cursor-pointer "}`}
			style={{
				animationDelay: `${(index % 20) * 50}ms`,
				animationFillMode: "backwards",
			}}
			role="button"
			tabIndex={0}
			aria-label={`Voir le détail du projet ${p.name}`}
			onClick={() => {
				if (onOpen) onOpen(p.id);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					if (onOpen) onOpen(p.id);
				}
			}}
		>
			{auditState[p.id] && (
				<div
					className="absolute inset-0 z-10 flex items-center justify-center flex-col gap-2 rounded-xl bg-card/85 backdrop-blur-[2px]"
					aria-live="polite"
				>
					<Loader2 className="w-6 h-6 text-primary animate-spin" />
					<span className="text-xs font-semibold">{auditState[p.id]}</span>
				</div>
			)}

			<div className="flex items-start justify-between">
				<div className="flex items-center gap-2 flex-wrap">
					<Shield
						className={`w-5 h-5 ${p.ignored ? "text-muted-foreground" : hasNoCves ? "text-green-500" : hasCritical ? "text-red-500" : "text-primary"}`}
					/>
					<h3
						className="font-bold text-lg leading-tight truncate max-w-[140px]"
						title={p.name}
					>
						{p.name}
					</h3>
					{hasNoCves && (
						<Badge
							variant="outline"
							className="text-[10px] flex items-center gap-1"
						>
							<CheckCircle2 className="w-3 h-3" />
							Sain
						</Badge>
					)}
					{hasCritical && (
						<Badge
							variant="outline"
							className="text-[10px] flex items-center gap-1"
						>
							<AlertTriangle className="w-3 h-3" />
							Critique
						</Badge>
					)}
				</div>

				<div className="relative group/menu">
					<button
						type="button"
						className="p-1.5 rounded-full text-muted-foreground hover:bg-muted"
						onClick={(e) => e.stopPropagation()}
					>
						<MoreHorizontal className="w-4 h-4" />
					</button>
					<div className="absolute right-0 top-full mt-1 w-48 bg-card border rounded-lg opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible z-50 flex flex-col p-1 shadow-md">
						<div className="px-2 py-1.5 text-xs text-muted-foreground border-b mb-1 flex items-center justify-between">
							<span>Outil d'audit</span>
							<span className="font-bold text-foreground uppercase">
								{p.tool}
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className="flex items-center gap-1 mt-0">
				<HardDrive className="w-3 h-3 text-muted-foreground" />
				<span className="text-xs text-muted-foreground">Local</span>
				<span
					title={`Racine Git : ${p.path}\nSous-dossier : ${p.audit_path || "Racine"}`}
					className="cursor-help inline-flex"
				>
					<Info className="w-3 h-3 text-muted-foreground/50" />
				</span>
			</div>

			{p.tags && p.tags.length > 0 && (
				<div className="flex flex-wrap gap-1 mt-2">
					{p.tags.map((tag: string) => (
						<TagBadge key={tag} name={tag} color={tagColors?.[tag]} />
					))}
				</div>
			)}

			<div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/70">
				<Clock className="w-3 h-3" />
				{p.lastRun ? (
					<span>Dernier audit : {formatDate(p.lastRun.ran_at)}</span>
				) : (
					<span>Ajouté le {formatDate(p.created_at)}</span>
				)}
			</div>

			{p.git?.isRepo ? (
				<div className="grid grid-cols-2 gap-2 mt-2 p-2 bg-muted/30 rounded-lg border text-xs">
					<div className="flex flex-col gap-1">
						<span
							className="text-[10px] text-muted-foreground uppercase tracking-wider"
							title={
								p.git.checkedAt
									? `État git lu ${relativeAge(p.git.checkedAt)}`
									: undefined
							}
						>
							Branche
							{p.git.checkedAt ? ` · ${relativeAge(p.git.checkedAt)}` : ""}
						</span>
						<div className="flex items-center gap-1 font-mono">
							<GitBranch className="w-3 h-3" />
							<span
								className="truncate max-w-[80px]"
								title={p.git.branch || "detached"}
							>
								{p.git.branch || "detached"}
							</span>
						</div>
					</div>

					<div className="flex flex-col gap-1 items-end">
						<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
							Actions
						</span>
						<div className="flex items-center gap-1.5">
							{p.git.dirty && (
								<span
									title="Arbre de travail sale (modifications non commitées)"
									className="inline-flex"
								>
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
							<button
								type="button"
								onClick={(e) => handleFetch(p.id, e)}
								className="p-1 text-muted-foreground rounded hover:bg-muted"
								title="Git Fetch"
							>
								<CloudDownload className="w-3.5 h-3.5" />
							</button>
							{p.git.behind > 0 && (
								<button
									type="button"
									onClick={(e) => handlePull(p.id, e)}
									className="px-1.5 py-0.5 rounded font-bold text-[10px] uppercase hover:bg-muted"
									title="Git Pull (Fast-Forward uniquement)"
								>
									Pull
								</button>
							)}
						</div>
					</div>
				</div>
			) : (
				<div className="flex items-center justify-between mt-2 p-2 bg-muted/30 rounded-lg border text-xs">
					<span className="text-muted-foreground italic">
						{p.git === null ? "État Git non chargé" : "Dépôt Non-Git"}
					</span>
					<button
						type="button"
						onClick={(e) => handleDetectGit(p.id, e)}
						disabled={detectingId === p.id}
						className="p-1 text-muted-foreground rounded flex items-center gap-1 disabled:opacity-50 hover:bg-muted"
						title={
							p.git === null
								? "Lire l'état Git de ce projet"
								: "Re-détecter le dépôt Git"
						}
					>
						<RefreshCw
							className={`w-3 h-3 ${detectingId === p.id ? "animate-spin text-primary" : ""}`}
						/>
						{detectingId === p.id
							? "Lecture..."
							: p.git === null
								? "Lire"
								: "Détecter"}
					</button>
				</div>
			)}

			<div className="flex items-center justify-between mt-auto pt-4 border-t border-border ">
				<button
					type="button"
					onClick={(e) => toggleIgnore(p, e)}
					className="text-xs text-muted-foreground hover:text-foreground"
				>
					{p.ignored ? "Réactiver" : "Ignorer le projet"}
				</button>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => handleForceAudit(p.id, e)}
						className="w-7 h-7 text-muted-foreground"
						title="Forcer un audit (sans déduplication)"
					>
						<Play className="w-3.5 h-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => handleEdit(p, e)}
						className="w-7 h-7 text-muted-foreground"
						title="Modifier"
					>
						<Edit2 className="w-3.5 h-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => handleDelete(p.id, e)}
						className="w-7 h-7 text-muted-foreground hover:text-destructive"
						title="Supprimer"
					>
						<Trash2 className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>
		</div>
	);
});
