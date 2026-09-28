import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	Edit2,
	GitBranch,
	GitCommit,
	Globe,
	Loader2,
	Play,
	Shield,
	Trash2,
} from "lucide-react";
import React from "react";
import { TagBadge } from "../../molecules/TagBadge";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import type { ProjectCardProps } from "./index";

function getWebUrl(rawUrl: string, sha?: string | null): string {
	try {
		if (rawUrl.startsWith("https://raw.githubusercontent.com/")) {
			const path = rawUrl.replace("https://raw.githubusercontent.com/", "");
			const parts = path.split("/");
			const owner = parts[0];
			const repo = parts[1];
			const rest = parts.slice(2);
			if (rest[0] === "refs" && rest[1] === "heads") {
				rest.splice(0, 2);
			}
			const targetBranchOrSha = sha || rest[0];
			const filePath = rest.slice(1).join("/");
			return `https://github.com/${owner}/${repo}/blob/${targetBranchOrSha}/${filePath}`;
		}
		// GitLab
		if (rawUrl.includes("/-/raw/")) {
			return rawUrl.replace("/-/raw/", "/-/blob/"); // TODO support SHA for Gitlab
		}
		return rawUrl;
	} catch (e) {
		return rawUrl;
	}
}

export const RemoteProjectCard = React.memo(function RemoteProjectCard({
	p,
	index,
	auditState,
	onOpen,
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

				<span className="shrink-0 text-[10px] font-bold bg-secondary text-secondary-foreground px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm border border-secondary/50">
					{p.tool}
				</span>
			</div>

			<div className="grid grid-cols-2 gap-4 mt-2 p-3 bg-muted/50 rounded-lg border border-border/50 shadow-sm">
				<div className="flex flex-col gap-1">
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Source
					</span>
					<div className="flex items-center gap-1.5 text-xs">
						<Globe className="w-3 h-3 text-primary/70" />
						<a
							href={getWebUrl((p as any).remote_url, (p as any).git?.sha)}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => e.stopPropagation()}
							className="text-primary hover:underline font-medium"
							title="Ouvrir le fichier distant (immuable)"
						>
							Fichier source
						</a>
					</div>
				</div>

				<div className="flex flex-col gap-1 items-end">
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Version
					</span>
					<div className="flex items-center gap-2 text-xs font-mono">
						{(p as any).git?.branch && (
							<span
								className="flex items-center gap-1 text-muted-foreground"
								title="Branche surveillée"
							>
								<GitBranch className="w-3 h-3" />
								{typeof (p as any).git.branch === "string" &&
								(p as any).git.branch.endsWith(" (Active)") ? (
									<>
										{(p as any).git.branch.replace(" (Active)", "")}
										<span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold uppercase tracking-wider leading-none shadow-sm border border-emerald-500/20">
											Active
										</span>
									</>
								) : (
									(p as any).git.branch
								)}
							</span>
						)}
						{(p as any).git?.sha && (
							<span className="flex items-center gap-1" title="Commit audité">
								<GitCommit className="w-3 h-3 text-primary/50" />
								{(p as any).git.sha.substring(0, 7)}
							</span>
						)}
						{!(p as any).git?.isRepo && (
							<span className="text-muted-foreground italic">
								Non synchronisé
							</span>
						)}
					</div>
				</div>
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
