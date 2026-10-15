import {
	AlertCircle,
	AlertTriangle,
	Check,
	CheckCircle2,
	Copy,
	FileText,
	LayoutList,
	Shield,
	TrendingDown,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Report } from "@/db/reports";
import { copyToClipboard } from "@/lib/utils";

/**
 * Échec d'audit d'un projet.
 */
export interface AuditFailure {
	projectId: number;
	name: string;
	message: string;
}

export interface SummaryProjectItem {
	id: string;
	name: string;
	newCount: number;
	total: number;
	fixedCount: number;
	etat: string;
	isError?: boolean;
	raw: string;
}

export function parseSummaryText(text: string): SummaryProjectItem[] {
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	return lines.map((line, index) => {
		const baseId = `summary-${index + 1}`;
		const match = line.match(
			/^(.+?)\s+\+(\d+)\s+nouvelles?\s+CVEs?\s+\(Total\s*:\s*(\d+)\)\s+\+(\d+)\s+CVEs?\s+Corrig[ée]s?\s*-\s*(.+)$/i,
		);
		if (
			match &&
			match[1] !== undefined &&
			match[2] !== undefined &&
			match[3] !== undefined &&
			match[4] !== undefined &&
			match[5] !== undefined
		) {
			return {
				id: `${baseId}-${match[1].trim()}`,
				name: match[1].trim(),
				newCount: parseInt(match[2], 10),
				total: parseInt(match[3], 10),
				fixedCount: parseInt(match[4], 10),
				etat: match[5].trim(),
				raw: line,
			};
		}
		if (line.includes("- Erreur d'audit")) {
			const name = line.replace(/\s*-\s*Erreur d'audit.*/, "").trim();
			return {
				id: `${baseId}-${name}-error`,
				name,
				newCount: 0,
				total: 0,
				fixedCount: 0,
				etat: "Erreur",
				isError: true,
				raw: line,
			};
		}
		return {
			id: `${baseId}-raw`,
			name: line,
			newCount: 0,
			total: 0,
			fixedCount: 0,
			etat: line.toLowerCase().includes("sain") ? "Sain" : "Info",
			raw: line,
		};
	});
}

function getStatusBadge(etat: string) {
	switch (etat) {
		case "En danger":
			return (
				<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
					<AlertTriangle className="w-3.5 h-3.5 shrink-0" />
					En danger
				</span>
			);
		case "Vulnérable":
			return (
				<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
					<AlertCircle className="w-3.5 h-3.5 shrink-0" />
					Vulnérable
				</span>
			);
		case "En amélioration":
			return (
				<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
					<TrendingDown className="w-3.5 h-3.5 shrink-0" />
					En amélioration
				</span>
			);
		case "Sain":
			return (
				<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
					<CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
					Sain
				</span>
			);
		case "Erreur":
			return (
				<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-destructive/15 text-destructive border border-destructive/30">
					<AlertCircle className="w-3.5 h-3.5 shrink-0" />
					Erreur
				</span>
			);
		default:
			return (
				<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border">
					{etat}
				</span>
			);
	}
}

import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";

export function ReportModal({
	reportModal,
	auditErrors = [],
	summaryText,
	setReportModal,
}: {
	reportModal: Report | null;
	auditErrors?: AuditFailure[];
	summaryText?: string | null;
	setReportModal: (val: Report | null) => void;
}) {
	const navigate = useNavigate();
	const [copied, setCopied] = useState(false);
	const [viewMode, setViewMode] = useState<"visual" | "raw">("visual");

	const summaryItems = useMemo(
		() => (summaryText ? parseSummaryText(summaryText) : []),
		[summaryText],
	);

	const isAllHealthy =
		summaryItems.length === 1 &&
		Boolean(summaryItems[0]?.name.toLowerCase().includes("aucun projet"));

	const handleCopy = async () => {
		if (summaryText) {
			await copyToClipboard(summaryText.trim());
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<Dialog
			open={!!reportModal}
			onOpenChange={(open) => {
				if (!open) setReportModal(null);
			}}
		>
			{/*
			 * Gabarit repris de la modale de projet, qui tient sur tous les
			 * écrans. Trois corrections par rapport à la version précédente :
			 *
			 *  - `sm:max-w-3xl` et non `max-w-xl` : sans le préfixe `sm:`, la
			 *    classe ne remplaçait pas le `sm:max-w-lg` de l'atome — les deux
			 *    survivaient à `cn()`, appartenant à des groupes différents, et
			 *    c'est la règle sous media query qui gagnait. La largeur
			 *    demandée n'était donc jamais appliquée au-delà de `sm`. Passée de
			 *    `2xl` à `3xl` : les descriptions de CVE sont de la prose, et à
			 *    672 px elles se coupaient tous les six ou sept mots.
			 *  - `gap-0` : l'atome pose `gap-4`, qui restait actif malgré `p-0`
			 *    et insérait un espace entre en-tête, corps et pied — chacun
			 *    portant déjà son propre `p-6`.
			 *  - `sm:min-w-[450px]` retiré : une largeur minimale sur une boîte
			 *    à largeur maximale n'apportait rien et gênait les petits
			 *    écrans.
			 */}
			<DialogContent className="w-[96vw] sm:w-[92vw] md:w-[88vw] lg:w-[82vw] xl:w-[75vw] sm:max-w-5xl 2xl:max-w-6xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
				<div className="absolute top-0 right-0 p-32 blur-[80px] rounded-full pointer-events-none"></div>

				<DialogHeader className="text-center sm:text-center p-6 pb-4 border-b shrink-0">
					<div className="w-16 h-16 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4 border bg-background">
						<Shield className="w-8 h-8" />
					</div>
					<DialogTitle className="text-2xl font-bold font-heading">
						Audit Terminé !
					</DialogTitle>
					<DialogDescription>
						Voici le résumé de l'analyse globale.
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto hide-scrollbar p-6">
					<div className="grid grid-cols-2 gap-4">
						<div className="bg-background/50 border p-4 rounded-xl flex flex-col items-center justify-center text-center">
							<span className="text-3xl font-bold">
								{reportModal?.projects_audited}
							</span>
							<span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">
								Projets
							</span>
						</div>
						<div className="bg-background/50 border p-4 rounded-xl flex flex-col items-center justify-center text-center">
							<span className="text-3xl font-bold">
								{reportModal?.total_vulnerabilities}
							</span>
							<span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">
								Vulnérabilités
							</span>
						</div>
					</div>

					{summaryText && (
						<div className="mt-5 flex flex-col gap-3">
							<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b">
								<div className="flex items-center gap-2">
									<p className="text-sm font-bold text-foreground">
										Résumé pour compte-rendu
									</p>
									{summaryItems.length > 0 && !isAllHealthy && (
										<span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
											{summaryItems.length} projet
											{summaryItems.length > 1 ? "s" : ""}
										</span>
									)}
								</div>

								<div className="flex items-center gap-2 self-end sm:self-auto">
									<div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs">
										<button
											type="button"
											onClick={() => setViewMode("visual")}
											className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
												viewMode === "visual"
													? "bg-background text-foreground shadow-xs font-semibold"
													: "text-muted-foreground hover:text-foreground"
											}`}
										>
											<LayoutList className="w-3.5 h-3.5" />
											Visuel
										</button>
										<button
											type="button"
											onClick={() => setViewMode("raw")}
											className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
												viewMode === "raw"
													? "bg-background text-foreground shadow-xs font-semibold"
													: "text-muted-foreground hover:text-foreground"
											}`}
										>
											<FileText className="w-3.5 h-3.5" />
											Texte brut
										</button>
									</div>

									<Button
										variant="outline"
										size="sm"
										className="h-7 gap-1.5 px-2.5 text-xs font-semibold shadow-xs hover:border-primary/50"
										onClick={handleCopy}
									>
										{copied ? (
											<>
												<Check className="h-3.5 w-3.5 text-green-500" />
												<span className="text-green-500 font-bold">
													Copié !
												</span>
											</>
										) : (
											<>
												<Copy className="h-3.5 w-3.5 text-primary" />
												<span>Copier le CR</span>
											</>
										)}
									</Button>
								</div>
							</div>

							{viewMode === "visual" ? (
								isAllHealthy ? (
									<div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
										<CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
										<div>
											<p className="font-semibold text-sm">
												Aucun projet vulnérable
											</p>
											<p className="text-xs text-muted-foreground">
												Tous les projets audités sont parfaitement sains.
											</p>
										</div>
									</div>
								) : (
									<div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto pr-1">
										{summaryItems.map((item) => (
											<div
												key={item.id}
												className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border bg-card/60 hover:bg-card transition-colors shadow-xs"
											>
												<div className="flex items-center gap-2.5 min-w-0">
													<span className="font-semibold text-sm text-foreground truncate">
														{item.name}
													</span>
													{getStatusBadge(item.etat)}
												</div>

												<div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
													{item.newCount > 0 ? (
														<span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
															+{item.newCount} nouvelle
															{item.newCount > 1 ? "s" : ""}
														</span>
													) : (
														<span className="text-xs text-muted-foreground/70 px-1">
															0 nouvelle
														</span>
													)}

													{item.fixedCount > 0 && (
														<span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
															+{item.fixedCount} corrigée
															{item.fixedCount > 1 ? "s" : ""}
														</span>
													)}

													<span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border font-mono">
														Total : {item.total}
													</span>
												</div>
											</div>
										))}
									</div>
								)
							) : (
								<div className="flex flex-col gap-1.5">
									<textarea
										readOnly
										className="w-full text-xs font-mono leading-relaxed p-4 rounded-xl border bg-card/60 shadow-inner resize-none outline-none focus:ring-1 focus:ring-primary max-h-[50vh] select-all cursor-text text-foreground"
										rows={Math.min(
											16,
											Math.max(6, summaryText.split("\n").length || 3),
										)}
										value={summaryText.trim()}
										onClick={(e) => e.currentTarget.select()}
									/>
									<p className="text-[11px] text-muted-foreground">
										💡 Cliquez dans la zone pour tout sélectionner, ou cliquez
										sur <strong>Copier le CR</strong>.
									</p>
								</div>
							)}
						</div>
					)}

					{auditErrors.length > 0 && (
						<div
							role="alert"
							className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4"
						>
							<p className="text-sm font-semibold">
								{auditErrors.length} projet
								{auditErrors.length > 1 ? "s" : ""} en échec — non compté
								{auditErrors.length > 1 ? "s" : ""} dans le résumé
							</p>
							<ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
								{auditErrors.map((e) => (
									<li key={e.projectId} className="font-mono break-all">
										{e.name} : {e.message}
									</li>
								))}
							</ul>
						</div>
					)}
				</div>

				<DialogFooter className="p-6 pt-4 border-t shrink-0 bg-muted/20">
					<Button
						onClick={() => {
							setReportModal(null);
							navigate("/reports");
						}}
						className="w-full font-bold rounded-xl"
						size="lg"
					>
						Voir tous les rapports
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
