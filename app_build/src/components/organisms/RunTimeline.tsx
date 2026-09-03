import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import type { ProjectHistoryItem } from "@/routes/projects";

/**
 * Les trente derniers runs d'un projet, du plus récent au plus ancien, dont un
 * est sélectionné. Les erreurs figurent dans la liste : c'est le signal que
 * l'historique apporte et qu'un audit unitaire ne donne pas (§4).
 */
export function RunTimeline({
	runs,
	selectedId,
	onSelect,
}: {
	runs: ProjectHistoryItem[];
	selectedId: number | null;
	onSelect: (id: number) => void;
}) {
	if (runs.length === 0) {
		return (
			<p className="text-sm text-muted-foreground p-4">
				Aucun audit enregistré pour ce projet.
			</p>
		);
	}

	return (
		<ol aria-label="Historique des audits" className="flex flex-col gap-1">
			{runs.map((run) => {
				const selected = run.id === selectedId;
				const nouveautes = run.newCves.length;
				return (
					<li key={run.id}>
						<button
							type="button"
							aria-pressed={selected}
							onClick={() => onSelect(run.id)}
							className={cn(
								"w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors",
								selected
									? "border-primary bg-primary/10"
									: "border-border hover:bg-accent",
							)}
						>
							<div className="flex items-center justify-between gap-2">
								<span className="font-medium">
									{formatDateTime(run.ran_at)}
								</span>
								<StatusIcon run={run} />
							</div>
							<div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
								<span>{statusLabel(run)}</span>
								{nouveautes > 0 && (
									<span className="font-semibold text-red-600 dark:text-red-400">
										+{nouveautes} nouvelle{nouveautes > 1 ? "s" : ""}
									</span>
								)}
							</div>
						</button>
					</li>
				);
			})}
		</ol>
	);
}

/** Libellé d'état d'un run : erreur, sain, ou le nombre de vulnérabilités. */
export function statusLabel(run: ProjectHistoryItem): string {
	if (run.status === "error") return "Erreur";
	if (run.total === 0) return "Sain";
	return `${run.total} vulnérabilité${run.total > 1 ? "s" : ""}`;
}

function StatusIcon({ run }: { run: ProjectHistoryItem }) {
	// L'icône double le libellé, elle ne le remplace pas : la couleur n'est
	// jamais seule porteuse du sens.
	if (run.status === "error") {
		return (
			<AlertTriangle
				aria-hidden="true"
				className="w-4 h-4 text-orange-600 dark:text-orange-400"
			/>
		);
	}
	if (run.total === 0) {
		return (
			<CheckCircle2
				aria-hidden="true"
				className="w-4 h-4 text-green-600 dark:text-green-400"
			/>
		);
	}
	return (
		<ShieldAlert
			aria-hidden="true"
			className="w-4 h-4 text-red-600 dark:text-red-400"
		/>
	);
}
