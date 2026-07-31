import {
	Activity,
	ArrowDownRight,
	ArrowUpRight,
	Calendar,
	ChevronLeft,
	ChevronRight,
	Eye,
	FileText,
	Minus,
	RefreshCw,
	Shield,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { buildCvssTooltip } from "../lib/cvss";
import { ConfirmDialog } from "./ConfirmDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";

export function Reports() {
	const [reports, setReports] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isFetching, setIsFetching] = useState(false);
	const [reportToDelete, setReportToDelete] = useState<number | null>(null);
	const [selectedReports, setSelectedReports] = useState<number[]>([]);
	const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);

	// Pagination state
	const [currentPage, setCurrentPage] = useState(1);
	const itemsPerPage = 10;

	// Diff state
	const [selectedReportIndex, setSelectedReportIndex] = useState<number | null>(
		null,
	);
	const [diffData, setDiffData] = useState<{
		newVulns: any[];
		fixedVulns: any[];
		unchangedVulns: any[];
	} | null>(null);

	const handleViewDiff = (index: number) => {
		const currentReport = reports[index];
		const prevReport = index < reports.length - 1 ? reports[index + 1] : null;

		const currentVulns = new Map();
		if (currentReport.details) {
			currentReport.details.forEach((d: any) => {
				if (d.vulns) {
					d.vulns.forEach((v: any) => {
						const key = `${d.projectId}-${v.package}-${v.cve || v.title}`;
						currentVulns.set(key, { ...v, projectName: d.projectName });
					});
				}
			});
		}

		const prevVulns = new Map();
		if (prevReport && prevReport.details) {
			prevReport.details.forEach((d: any) => {
				if (d.vulns) {
					d.vulns.forEach((v: any) => {
						const key = `${d.projectId}-${v.package}-${v.cve || v.title}`;
						prevVulns.set(key, { ...v, projectName: d.projectName });
					});
				}
			});
		}

		const newVulns: any[] = [];
		const unchangedVulns: any[] = [];
		currentVulns.forEach((v, k) => {
			if (!prevVulns.has(k)) newVulns.push(v);
			else unchangedVulns.push(v);
		});

		const fixedVulns: any[] = [];
		prevVulns.forEach((v, k) => {
			if (!currentVulns.has(k)) fixedVulns.push(v);
		});

		setDiffData({ newVulns, fixedVulns, unchangedVulns });
		setSelectedReportIndex(index);
	};

	const fetchReports = async () => {
		setIsFetching(true);
		try {
			const res = await fetch("/api/reports");
			const data = await res.json();
			setReports(data);
			// Reset to page 1 if data changes and current page is out of bounds
			if (currentPage > Math.ceil(data.length / itemsPerPage)) {
				setCurrentPage(1);
			}
			// Remove deleted reports from selection
			const allIds = data.map((r: any) => r.id);
			setSelectedReports((prev) => prev.filter((id) => allIds.includes(id)));
		} catch (e) {
			console.error(e);
		} finally {
			setIsFetching(false);
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchReports();
	}, []);

	const handleDelete = async (id: number) => {
		setReportToDelete(id);
	};

	const confirmDelete = async () => {
		if (reportToDelete === null) return;
		try {
			await fetch(`/api/reports/${reportToDelete}`, { method: "DELETE" });
			setReportToDelete(null);
			fetchReports();
		} catch (e) {
			console.error(e);
		}
	};

	const totalPages = Math.max(1, Math.ceil(reports.length / itemsPerPage));
	const startIndex = (currentPage - 1) * itemsPerPage;
	const currentReports = reports.slice(startIndex, startIndex + itemsPerPage);

	return (
		<div className="flex-1 w-full max-w-7xl px-4 md:px-8 mx-auto mt-8 z-10 animate-in fade-in duration-500">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h2 className="text-3xl font-bold font-heading">Rapports d'Audit</h2>
					<p className="text-muted-foreground mt-1">
						Consultez l'historique des audits globaux de votre écosystème.
					</p>
				</div>
				<div className="flex items-center gap-4">
					{selectedReports.length > 0 && (
						<button
							onClick={() => setBulkDeleteModalOpen(true)}
							className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors rounded-lg flex items-center gap-2 text-sm font-semibold animate-in fade-in zoom-in"
						>
							<Trash2 className="w-4 h-4" />
							Supprimer ({selectedReports.length})
						</button>
					)}
					<button
						onClick={fetchReports}
						disabled={isFetching}
						className={`group flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all duration-300 ${isFetching ? "bg-primary/20 border-primary/30 text-primary" : "bg-secondary/50 border-white/5 text-muted-foreground hover:bg-white/10 hover:border-white/10 hover:text-foreground active:scale-95"}`}
					>
						<RefreshCw
							className={`w-4 h-4 transition-transform duration-500 ${isFetching ? "animate-spin text-primary" : "group-hover:rotate-180"}`}
						/>
						{isFetching ? "Actualisation..." : "Actualiser"}
					</button>
				</div>
			</div>

			{loading ? (
				<div className="glass-panel p-12 rounded-xl flex flex-col justify-center items-center gap-4 backdrop-blur-xl bg-white/5 border border-white/10">
					<RefreshCw className="w-8 h-8 text-primary animate-spin" />
					<p className="text-muted-foreground font-medium animate-pulse">
						Chargement de l'historique des rapports...
					</p>
				</div>
			) : reports.length === 0 ? (
				<div className="glass-panel p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4 backdrop-blur-xl bg-white/5 border border-white/10">
					<FileText className="w-16 h-16 text-muted-foreground opacity-50 animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
					<div>
						<h3 className="text-xl font-bold">Aucun rapport</h3>
						<p className="text-muted-foreground mt-2">
							Lancez un audit global (bouton en haut à droite) pour générer
							votre premier rapport.
						</p>
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-4">
					<div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow className="bg-muted/50 hover:bg-muted/50">
									<TableHead className="w-12">
										<input
											type="checkbox"
											className="rounded border-border accent-primary cursor-pointer w-4 h-4"
											checked={
												currentReports.length > 0 &&
												currentReports.every((r: any) =>
													selectedReports.includes(r.id),
												)
											}
											onChange={(e) => {
												if (e.target.checked) {
													const newIds = currentReports
														.map((r: any) => r.id)
														.filter(
															(id: number) => !selectedReports.includes(id),
														);
													setSelectedReports([...selectedReports, ...newIds]);
												} else {
													const pageIds = currentReports.map(
														(r: any) => r.id,
													);
													setSelectedReports(
														selectedReports.filter(
															(id) => !pageIds.includes(id),
														),
													);
												}
											}}
										/>
									</TableHead>
									<TableHead>Date</TableHead>
									<TableHead>Projets</TableHead>
									<TableHead>Vulnérabilités</TableHead>
									<TableHead>Répartition</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{currentReports.map((r: any) => (
									<TableRow
										key={r.id}
										className="group"
										data-state={selectedReports.includes(r.id) ? "selected" : undefined}
									>
										<TableCell>
											<input
												type="checkbox"
												className="rounded border-border accent-primary cursor-pointer w-4 h-4"
												checked={selectedReports.includes(r.id)}
												onChange={(e) => {
													if (e.target.checked) {
														setSelectedReports([...selectedReports, r.id]);
													} else {
														setSelectedReports(
															selectedReports.filter((id) => id !== r.id),
														);
													}
												}}
											/>
										</TableCell>
										<TableCell>
												<div className="flex items-center gap-3">
													<div className="p-2 bg-primary/10 rounded-lg text-primary">
														<Calendar className="w-4 h-4" />
													</div>
													<span className="font-bold">
														{new Date(r.created_at + "Z").toLocaleString(
															"fr-FR",
															{
																day: "2-digit",
																month: "short",
																year: "numeric",
																hour: "2-digit",
																minute: "2-digit",
															},
														)}
													</span>
												</div>
										</TableCell>
										<TableCell>
												<span className="text-muted-foreground font-medium">
													{r.projects_audited} analysés
												</span>
										</TableCell>
										<TableCell>
												<div className="flex items-center gap-4">
													<div className="flex items-center gap-1.5">
														<Shield className="w-4 h-4 text-primary" />
														<span className="text-xl font-light">
															{r.total_vulnerabilities}
														</span>
													</div>
													{r.counts.critical > 0 && (
														<div className="flex items-center gap-1.5 text-red-400">
															<Activity className="w-4 h-4" />
															<span className="font-bold">
																{r.counts.critical} Crit.
															</span>
														</div>
													)}
												</div>
										</TableCell>
										<TableCell>
												<div className="flex flex-wrap gap-2">
													{r.counts.high > 0 && (
														<span className="text-xs px-2.5 py-0.5 font-medium bg-orange-500/10 text-orange-500 rounded-full border border-orange-500/20">
															{r.counts.high} Haut
														</span>
													)}
													{r.counts.moderate > 0 && (
														<span className="text-xs px-2.5 py-0.5 font-medium bg-yellow-500/10 text-yellow-500 rounded-full border border-yellow-500/20">
															{r.counts.moderate} Modéré
														</span>
													)}
													{r.counts.low > 0 && (
														<span className="text-xs px-2.5 py-0.5 font-medium bg-green-500/10 text-green-500 rounded-full border border-green-500/20">
															{r.counts.low} Bas
														</span>
													)}
													{r.total_vulnerabilities === 0 && (
														<span className="text-xs text-muted-foreground">
															Aucune faille détectée
														</span>
													)}
												</div>
										</TableCell>
										<TableCell className="text-right">
											<div className="flex items-center justify-end gap-1">
												<button
													onClick={() => handleViewDiff(reports.indexOf(r))}
													className="p-2 text-muted-foreground hover:text-blue-400 transition-all rounded-md hover:bg-blue-400/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
													title="Voir les détails et le comparatif (Diff)"
												>
													<Eye className="w-4 h-4" />
												</button>
												<button
													onClick={() => handleDelete(r.id)}
													className="p-2 text-muted-foreground hover:text-destructive transition-all rounded-md hover:bg-destructive/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
													title="Supprimer le rapport"
												>
													<Trash2 className="w-4 h-4" />
												</button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>

					{/* Pagination Controls */}
					{totalPages > 1 && (
						<div className="flex items-center justify-between px-2 mt-2">
							<span className="text-sm text-muted-foreground">
								Affichage de {startIndex + 1} à{" "}
								{Math.min(startIndex + itemsPerPage, reports.length)} sur{" "}
								{reports.length} rapports
							</span>
							<div className="flex items-center gap-2">
								<button
									onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
									disabled={currentPage === 1}
									className="p-1.5 rounded-lg border border-border/50 bg-background/50 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-50 transition-colors"
								>
									<ChevronLeft className="w-5 h-5" />
								</button>
								<span className="text-sm font-medium px-2">
									Page {currentPage} / {totalPages}
								</span>
								<button
									onClick={() =>
										setCurrentPage((p) => Math.min(totalPages, p + 1))
									}
									disabled={currentPage === totalPages}
									className="p-1.5 rounded-lg border border-border/50 bg-background/50 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-50 transition-colors"
								>
									<ChevronRight className="w-5 h-5" />
								</button>
							</div>
						</div>
					)}
				</div>
			)}

			<ConfirmDialog
				isOpen={reportToDelete !== null}
				title="Supprimer le rapport"
				message="Êtes-vous sûr de vouloir supprimer ce rapport d'audit ? L'historique associé sera perdu."
				confirmText="Supprimer"
				onConfirm={confirmDelete}
				onCancel={() => setReportToDelete(null)}
			/>

			<ConfirmDialog
				isOpen={bulkDeleteModalOpen}
				title="Suppression groupée"
				message={`Êtes-vous sûr de vouloir supprimer ${selectedReports.length} rapport(s) d'audit ? Cette action est irréversible et supprimera l'historique associé.`}
				confirmText="Supprimer"
				onConfirm={async () => {
					try {
						setLoading(true);
						setBulkDeleteModalOpen(false);
						await Promise.all(
							selectedReports.map((id) =>
								fetch(`/api/reports/${id}`, { method: "DELETE" }),
							),
						);
						setSelectedReports([]);
						fetchReports();
					} catch (e) {
						console.error(e);
						setLoading(false);
					}
				}}
				onCancel={() => setBulkDeleteModalOpen(false)}
			/>

			{selectedReportIndex !== null && diffData && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
					onClick={() => setSelectedReportIndex(null)}
				>
					<div
						className="glass-panel w-full max-w-4xl p-6 rounded-2xl flex flex-col gap-6 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-hidden"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex justify-between items-center pb-4 border-b border-white/10">
							<div>
								<h2 className="text-2xl font-bold font-heading">
									Détails du Rapport
								</h2>
								<p className="text-muted-foreground text-sm mt-1">
									Comparaison avec le rapport précédent (N-1)
								</p>
							</div>
							<button
								onClick={() => setSelectedReportIndex(null)}
								className="p-2 rounded-full hover:bg-white/10 transition-colors"
							>
								<X className="w-5 h-5" />
							</button>
						</div>

						<div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col gap-6 pr-2">
							<div className="grid grid-cols-3 gap-4">
								<div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col gap-1">
									<span className="text-red-400 font-bold flex items-center gap-2">
										<ArrowUpRight className="w-4 h-4" /> Nouvelles failles
									</span>
									<span className="text-3xl font-light text-red-500">
										{diffData.newVulns.length}
									</span>
								</div>
								<div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex flex-col gap-1">
									<span className="text-green-400 font-bold flex items-center gap-2">
										<ArrowDownRight className="w-4 h-4" /> Failles corrigées
									</span>
									<span className="text-3xl font-light text-green-500">
										{diffData.fixedVulns.length}
									</span>
								</div>
								<div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-1">
									<span className="text-muted-foreground font-bold flex items-center gap-2">
										<Minus className="w-4 h-4" /> Inchangées
									</span>
									<span className="text-3xl font-light text-white">
										{diffData.unchangedVulns.length}
									</span>
								</div>
							</div>

							{diffData.fixedVulns.length > 0 && (
								<div>
									<h3 className="text-lg font-bold text-green-400 mb-3 flex items-center gap-2">
										<Shield className="w-5 h-5" /> Failles corrigées depuis le
										dernier rapport
									</h3>
									<div className="flex flex-col gap-2">
										{diffData.fixedVulns.map((v, i) => (
											<div
												key={i}
												className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/10"
											>
												<div className="flex items-center gap-3">
													<span className="text-xs font-mono px-2 py-1 bg-green-500/20 text-green-400 rounded">
														{v.projectName}
													</span>
													<span className="font-bold">{v.package}</span>
													<span className="text-muted-foreground text-sm truncate max-w-[300px]">
														{v.title}
														{v.cvssVector && (
															<Tooltip>
																<TooltipTrigger asChild>
																	<span className="ml-2 font-mono text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground cursor-help">
																		{v.cvssVector}
																	</span>
																</TooltipTrigger>
																<TooltipContent
																	side="right"
																	className="font-mono text-xs whitespace-pre bg-gray-900 border-gray-700 text-gray-300 shadow-xl max-w-[400px]"
																>
																	{buildCvssTooltip(v.cvssVector)}
																</TooltipContent>
															</Tooltip>
														)}
													</span>
												</div>
												{v.cve && (
													<span className="text-xs font-mono text-muted-foreground">
														{v.cve}
													</span>
												)}
											</div>
										))}
									</div>
								</div>
							)}

							{diffData.newVulns.length > 0 && (
								<div>
									<h3 className="text-lg font-bold text-red-400 mb-3 flex items-center gap-2">
										<Activity className="w-5 h-5" /> Nouvelles failles détectées
									</h3>
									<div className="flex flex-col gap-2">
										{diffData.newVulns.map((v, i) => (
											<div
												key={i}
												className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/10"
											>
												<div className="flex items-center gap-3">
													<span className="text-xs font-mono px-2 py-1 bg-red-500/20 text-red-400 rounded">
														{v.projectName}
													</span>
													<span className="font-bold">{v.package}</span>
													<span className="text-muted-foreground text-sm truncate max-w-[300px]">
														{v.title}
														{v.cvssVector && (
															<Tooltip>
																<TooltipTrigger asChild>
																	<span className="ml-2 font-mono text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground cursor-help">
																		{v.cvssVector}
																	</span>
																</TooltipTrigger>
																<TooltipContent
																	side="right"
																	className="font-mono text-xs whitespace-pre bg-gray-900 border-gray-700 text-gray-300 shadow-xl max-w-[400px]"
																>
																	{buildCvssTooltip(v.cvssVector)}
																</TooltipContent>
															</Tooltip>
														)}
													</span>
												</div>
												<div className="flex items-center gap-2 mt-2 md:mt-0">
													{v.severity === "critical" && (
														<span className="text-[10px] uppercase font-bold text-red-500 px-2 py-0.5 bg-red-500/10 rounded">
															Critique
														</span>
													)}
													{v.severity === "high" && (
														<span className="text-[10px] uppercase font-bold text-orange-500 px-2 py-0.5 bg-orange-500/10 rounded">
															Haut
														</span>
													)}
													{v.severity === "moderate" && (
														<span className="text-[10px] uppercase font-bold text-yellow-500 px-2 py-0.5 bg-yellow-500/10 rounded">
															Modéré
														</span>
													)}
													{v.cve && (
														<span className="text-xs font-mono text-muted-foreground">
															{v.cve}
														</span>
													)}
												</div>
											</div>
										))}
									</div>
								</div>
							)}

							{diffData.unchangedVulns.length > 0 && (
								<div>
									<h3 className="text-lg font-bold text-muted-foreground mb-3 flex items-center gap-2">
										<Minus className="w-5 h-5" /> Failles persistantes
									</h3>
									<div className="flex flex-col gap-2">
										{diffData.unchangedVulns.slice(0, 50).map((v, i) => (
											<div
												key={i}
												className="flex flex-col md:flex-row md:items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5"
											>
												<div className="flex items-center gap-3">
													<span className="text-[10px] font-mono px-1.5 py-0.5 bg-white/10 rounded text-muted-foreground">
														{v.projectName}
													</span>
													<span className="text-sm font-semibold">
														{v.package}
													</span>
												</div>
												{v.cve && (
													<span className="text-[10px] font-mono text-muted-foreground">
														{v.cve}
													</span>
												)}
											</div>
										))}
										{diffData.unchangedVulns.length > 50 && (
											<p className="text-xs text-center text-muted-foreground p-2">
												... et {diffData.unchangedVulns.length - 50} autres non
												affichées
											</p>
										)}
									</div>
								</div>
							)}

							{diffData.newVulns.length === 0 &&
								diffData.fixedVulns.length === 0 &&
								diffData.unchangedVulns.length === 0 && (
									<p className="text-center text-muted-foreground py-8">
										Aucune vulnérabilité trouvée dans ce rapport.
									</p>
								)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
