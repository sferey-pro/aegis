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
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import { ConfirmDialog } from "../components/organisms/ConfirmDialog";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../components/ui/tooltip";
import { buildCvssTooltip } from "../lib/cvss";

export const Reports = memo(function Reports() {
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
		<div className="flex-1 w-full max-w-7xl px-4 md:px-8 mx-auto mt-8 z-10">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h2 className="text-3xl font-bold font-heading">Rapports d'Audit</h2>
					<p className="text-muted-foreground mt-1">
						Consultez l'historique des audits globaux de votre écosystème.
					</p>
				</div>
				<div className="flex items-center gap-4">
					{selectedReports.length > 0 && (
						<Button
							variant="outline"
							onClick={() => setBulkDeleteModalOpen(true)}
							className="flex items-center gap-2 text-sm font-semibold text-red-500 hover:text-red-600 hover:bg-red-50"
						>
							<Trash2 className="w-4 h-4" />
							Supprimer ({selectedReports.length})
						</Button>
					)}
					<Button
						variant="outline"
						onClick={fetchReports}
						disabled={isFetching}
						className={`group flex items-center gap-2 text-sm font-semibold ${isFetching ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
					>
						<RefreshCw
							className={`w-4 h-4 ${isFetching ? "animate-spin text-primary" : "group-hover:rotate-180"}`}
						/>
						{isFetching ? "Actualisation..." : "Actualiser"}
					</Button>
				</div>
			</div>

			{loading ? (
				<div className="bg-card border-border p-12 rounded-xl flex flex-col justify-center items-center gap-4 border">
					<RefreshCw className="w-8 h-8 text-primary" />
					<p className="text-muted-foreground font-medium">
						Chargement de l'historique des rapports...
					</p>
				</div>
			) : reports.length === 0 ? (
				<div className="bg-card border-border p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4 border">
					<FileText className="w-16 h-16 text-muted-foreground opacity-50 (255,255,255,0.1)]" />
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
					<div className="rounded-md border bg-card text-card-foreground overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow className="bg-muted/50">
									<TableHead className="w-12">
										<Checkbox
											checked={
												currentReports.length > 0 &&
												currentReports.every((r: any) =>
													selectedReports.includes(r.id),
												)
											}
											onCheckedChange={(checked) => {
												if (checked) {
													const newIds = currentReports
														.map((r: any) => r.id)
														.filter(
															(id: number) => !selectedReports.includes(id),
														);
													setSelectedReports([...selectedReports, ...newIds]);
												} else {
													const pageIds = currentReports.map((r: any) => r.id);
													setSelectedReports(
														selectedReports.filter(
															(id) => !pageIds.includes(id),
														),
													);
												}
											}}
											aria-label="Select all"
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
										data-state={
											selectedReports.includes(r.id) ? "selected" : undefined
										}
									>
										<TableCell>
											<Checkbox
												checked={selectedReports.includes(r.id)}
												onCheckedChange={(checked) => {
													if (checked) {
														setSelectedReports([...selectedReports, r.id]);
													} else {
														setSelectedReports(
															selectedReports.filter((id) => id !== r.id),
														);
													}
												}}
												aria-label="Select report"
											/>
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-3">
												<div className="p-2 rounded-lg text-primary">
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
													<div className="flex items-center gap-1.5">
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
													<span className="text-xs px-2.5 py-0.5 font-medium rounded-full border">
														{r.counts.high} Haut
													</span>
												)}
												{r.counts.moderate > 0 && (
													<span className="text-xs px-2.5 py-0.5 font-medium rounded-full border">
														{r.counts.moderate} Modéré
													</span>
												)}
												{r.counts.low > 0 && (
													<span className="text-xs px-2.5 py-0.5 font-medium rounded-full border">
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
												<Button
													variant="ghost"
													size="icon"
													onClick={() => handleViewDiff(reports.indexOf(r))}
													className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
													title="Voir les détails et le comparatif (Diff)"
												>
													<Eye className="w-4 h-4" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													onClick={() => handleDelete(r.id)}
													className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
													title="Supprimer le rapport"
												>
													<Trash2 className="w-4 h-4" />
												</Button>
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
								<Button
									variant="outline"
									size="icon"
									onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
									disabled={currentPage === 1}
									className="h-8 w-8"
								>
									<ChevronLeft className="w-4 h-4" />
								</Button>
								<span className="text-sm font-medium px-2">
									Page {currentPage} / {totalPages}
								</span>
								<Button
									variant="outline"
									size="icon"
									onClick={() =>
										setCurrentPage((p) => Math.min(totalPages, p + 1))
									}
									disabled={currentPage === totalPages}
									className="h-8 w-8"
								>
									<ChevronRight className="w-4 h-4" />
								</Button>
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
				title="Suppression ée"
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

			<Dialog
				open={selectedReportIndex !== null}
				onOpenChange={(open: boolean) => {
					if (!open) setSelectedReportIndex(null);
				}}
			>
				<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
					<DialogHeader className="p-6 pb-4 border-b shrink-0 flex-row justify-between items-center">
						<div>
							<DialogTitle className="text-2xl font-bold font-heading">
								Détails du Rapport
							</DialogTitle>
							<DialogDescription className="text-sm mt-1">
								Comparaison avec le rapport précédent (N-1)
							</DialogDescription>
						</div>
					</DialogHeader>

					<div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col gap-6 p-6">
						{diffData && (
							<>
								<div className="grid grid-cols-3 gap-4">
									<div className="bg-red-500/10 border rounded-xl p-4 flex flex-col gap-1">
										<span className="text-red-400 font-bold flex items-center gap-2">
											<ArrowUpRight className="w-4 h-4" /> Nouvelles failles
										</span>
										<span className="text-3xl font-light">
											{diffData.newVulns.length}
										</span>
									</div>
									<div className="bg-green-500/10 border rounded-xl p-4 flex flex-col gap-1">
										<span className="text-green-400 font-bold flex items-center gap-2">
											<ArrowDownRight className="w-4 h-4" /> Failles corrigées
										</span>
										<span className="text-3xl font-light">
											{diffData.fixedVulns.length}
										</span>
									</div>
									<div className="bg-white/5 border rounded-xl p-4 flex flex-col gap-1">
										<span className="text-muted-foreground font-bold flex items-center gap-2">
											<Minus className="w-4 h-4" /> Inchangées
										</span>
										<span className="text-3xl font-light">
											{diffData.unchangedVulns.length}
										</span>
									</div>
								</div>

								{diffData.fixedVulns.length > 0 && (
									<div>
										<h3 className="text-lg font-bold mb-3 flex items-center gap-2">
											<Shield className="w-5 h-5" /> Failles corrigées depuis le
											dernier rapport
										</h3>
										<div className="flex flex-col gap-2">
											{diffData.fixedVulns.map((v, i) => (
												<div
													key={i}
													className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg border"
												>
													<div className="flex items-center gap-3">
														<span className="text-xs font-mono px-2 py-1 rounded">
															{v.projectName}
														</span>
														<span className="font-bold">{v.package}</span>
														<span className="text-muted-foreground text-sm truncate max-w-[300px]">
															{v.title}
															{v.cvssVector && (
																<Tooltip>
																	<TooltipTrigger asChild>
																		<span className="ml-2 font-mono text-xs px-2 py-0.5 rounded border text-muted-foreground cursor-help">
																			{v.cvssVector}
																		</span>
																	</TooltipTrigger>
																	<TooltipContent
																		side="right"
																		className="font-mono text-xs whitespace-pre bg-gray-900 border-gray-700 max-w-[400px]"
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
										<h3 className="text-lg font-bold mb-3 flex items-center gap-2">
											<Activity className="w-5 h-5" /> Nouvelles failles
											détectées
										</h3>
										<div className="flex flex-col gap-2">
											{diffData.newVulns.map((v, i) => (
												<div
													key={i}
													className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg border"
												>
													<div className="flex items-center gap-3">
														<span className="text-xs font-mono px-2 py-1 rounded">
															{v.projectName}
														</span>
														<span className="font-bold">{v.package}</span>
														<span className="text-muted-foreground text-sm truncate max-w-[300px]">
															{v.title}
															{v.cvssVector && (
																<Tooltip>
																	<TooltipTrigger asChild>
																		<span className="ml-2 font-mono text-xs px-2 py-0.5 rounded border text-muted-foreground cursor-help">
																			{v.cvssVector}
																		</span>
																	</TooltipTrigger>
																	<TooltipContent
																		side="right"
																		className="font-mono text-xs whitespace-pre bg-gray-900 border-gray-700 max-w-[400px]"
																	>
																		{buildCvssTooltip(v.cvssVector)}
																	</TooltipContent>
																</Tooltip>
															)}
														</span>
													</div>
													<div className="flex items-center gap-2 mt-2 md:mt-0">
														{v.severity === "critical" && (
															<span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded">
																Critique
															</span>
														)}
														{v.severity === "high" && (
															<span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded">
																Haut
															</span>
														)}
														{v.severity === "moderate" && (
															<span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded">
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
													className="flex flex-col md:flex-row md:items-center justify-between p-2 rounded-lg border"
												>
													<div className="flex items-center gap-3">
														<span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-muted-foreground">
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
													... et {diffData.unchangedVulns.length - 50} autres
													non affichées
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
							</>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
});
