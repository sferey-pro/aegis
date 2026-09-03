import { ArrowLeft, Loader2, Play, Table2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useProjectDetail } from "@/lib/useProjectDetail";
import { TagBadge } from "../components/molecules/TagBadge";
import { HistoryChart } from "../components/organisms/HistoryChart";
import { RunReport } from "../components/organisms/RunReport";
import { RunTimeline } from "../components/organisms/RunTimeline";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

/**
 * Détail d'un projet : sa fiche, l'évolution de ses vulnérabilités (§4), ses
 * trente derniers audits et le rapport de celui qu'on choisit.
 *
 * La page ne porte ni état serveur ni appel réseau : tout vit dans
 * `useProjectDetail`. Elle compose.
 */
export function ProjectDetail() {
	const { id } = useParams();
	const navigate = useNavigate();
	const projectId = id !== undefined && /^\d+$/.test(id) ? Number(id) : null;
	const detail = useProjectDetail(projectId);

	return (
		<main className="flex-1 w-full max-w-7xl mx-auto mt-4 z-10 flex flex-col gap-6">
			<Link
				to="/projects"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit"
			>
				<ArrowLeft className="w-4 h-4" />
				Retour aux projets
			</Link>

			{detail.loading && (
				<div className="flex items-center gap-2 text-muted-foreground p-8 justify-center">
					<Loader2 className="w-5 h-5 animate-spin" />
					Chargement du projet…
				</div>
			)}

			{!detail.loading && detail.error && (
				<div
					role="alert"
					className="flex items-center justify-between gap-4 rounded-2xl border border-red-500/50 bg-red-500/10 px-5 py-4"
				>
					<p className="text-sm font-medium">{detail.error}</p>
					{projectId !== null && (
						<Button variant="outline" onClick={() => void detail.reload()}>
							Réessayer
						</Button>
					)}
				</div>
			)}

			{!detail.loading && !detail.error && detail.project && (
				<>
					<header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
						<div className="flex flex-col gap-2 min-w-0">
							<div className="flex items-center gap-2 flex-wrap">
								<h1 className="text-2xl font-bold font-heading truncate">
									{detail.project.name}
								</h1>
								<Badge variant="outline">{detail.project.tool}</Badge>
								{detail.project.ignored && (
									<Badge variant="secondary">Ignoré</Badge>
								)}
								{detail.project.is_remote && (
									<Badge variant="secondary">Distant</Badge>
								)}
							</div>
							<p
								className="text-sm text-muted-foreground font-mono truncate"
								title={detail.project.path}
							>
								{detail.project.path}
								{detail.project.audit_path
									? ` → ${detail.project.audit_path}`
									: ""}
							</p>
							{detail.project.tags.length > 0 && (
								<div className="flex flex-wrap gap-1">
									{detail.project.tags.map((t) => (
										<TagBadge key={t} name={t} />
									))}
								</div>
							)}
						</div>
						<div className="flex items-center gap-2 shrink-0">
							<Button
								variant="outline"
								onClick={() => navigate(`/triage?project=${projectId}`)}
								className="flex items-center gap-2"
							>
								<Table2 className="w-4 h-4" />
								Voir le triage
							</Button>
							{!detail.project.is_remote && (
								<Button
									onClick={() => void detail.runAudit()}
									disabled={detail.auditing}
									className="flex items-center gap-2"
								>
									{detail.auditing ? (
										<Loader2 className="w-4 h-4 animate-spin" />
									) : (
										<Play className="w-4 h-4" />
									)}
									Auditer maintenant
								</Button>
							)}
						</div>
					</header>

					{detail.feedback && (
						<p
							role="status"
							className={
								detail.feedback.type === "error"
									? "text-sm text-red-700 dark:text-red-300"
									: "text-sm text-green-700 dark:text-green-300"
							}
						>
							{detail.feedback.text}
						</p>
					)}

					{projectId !== null && (
						<HistoryChart
							projectId={projectId}
							refreshToken={detail.refreshToken}
						/>
					)}

					<div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
						<aside className="bg-card border-border rounded-2xl p-4 flex flex-col gap-3">
							<h2 className="font-semibold">
								Audits ({detail.history.length})
							</h2>
							<RunTimeline
								runs={detail.history}
								selectedId={detail.selectedRun?.id ?? null}
								onSelect={detail.selectRun}
							/>
						</aside>
						<section className="bg-card border-border rounded-2xl p-6 min-w-0">
							{detail.selectedRun ? (
								<RunReport run={detail.selectedRun} />
							) : (
								<p className="text-sm text-muted-foreground">
									Aucun rapport : lancez un premier audit.
								</p>
							)}
						</section>
					</div>
				</>
			)}
		</main>
	);
}
