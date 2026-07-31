import {
	AlertOctagon,
	ChevronLeft,
	ChevronRight,
	FileText,
	RefreshCw,
	Shield,
} from "lucide-react";
import React from "react";
import { SEVERITY_COLORS, SEVERITY_ICONS } from "./constants";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	TableFooter,
} from "../ui/table";

export function TriageTable({
	paginatedGroups,
	setSelectedGroup,
	createTicket,
	tickets,
	jiraBaseUrl,
	page,
	setPage,
	totalPages,
	itemsPerPage,
	setItemsPerPage,
	totalItems,
}: {
	paginatedGroups: any[];
	setSelectedGroup: (group: any) => void;
	createTicket: (e: React.MouseEvent, group: any) => void;
	tickets: Record<string, any>;
	jiraBaseUrl: string;
	page: number;
	setPage: (p: number | ((prev: number) => number)) => void;
	totalPages: number;
	itemsPerPage: number;
	setItemsPerPage: (n: number) => void;
	totalItems: number;
}) {
	return (
		<div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow className="bg-muted/50 hover:bg-muted/50">
							<TableHead className="min-w-[300px]">
								Cible (Package & Projet)
							</TableHead>
							<TableHead className="text-center">
								Impact & SLA
							</TableHead>
							<TableHead className="text-center">
								Patch Recommandé
							</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{paginatedGroups.map((group) => {
							return (
								<React.Fragment key={group.key}>
									<TableRow
										className={`cursor-pointer ${group.hasConfirmed ? "bg-red-500/5 dark:bg-red-950/30 hover:bg-red-500/10 dark:hover:bg-red-950/40" : ""}`}
										onClick={() => setSelectedGroup(group)}
									>
										<TableCell className="whitespace-nowrap">
											<div className="flex items-center gap-3">
												<div
													className={`p-1.5 rounded-lg border ${group.hasConfirmed ? "bg-red-500/20 border-red-500 text-red-500" : SEVERITY_COLORS[group.worstSeverity]} shadow-sm`}
												>
													{group.hasConfirmed ? (
														<AlertOctagon className="w-5 h-5 text-red-500 animate-pulse" />
													) : (
														SEVERITY_ICONS[group.worstSeverity]
													)}
												</div>
												<div className="flex flex-col">
													<div className="flex items-center gap-2">
														<span
															className={`font-bold font-mono text-sm ${group.hasConfirmed ? "text-red-400" : "text-foreground"}`}
														>
															{group.package}
														</span>
														{!group.hasConfirmed && (
															<span
																className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${SEVERITY_COLORS[group.worstSeverity]}`}
															>
																{group.worstSeverity}
															</span>
														)}
														{group.hasConfirmed && (
															<span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-red-500/50 bg-red-500/20 text-red-400 animate-pulse">
																Urgent
															</span>
														)}
													</div>
													<div className="flex items-center gap-2 mt-1 opacity-80">
														<span className="font-medium text-xs text-muted-foreground">
															{group.projectName}
														</span>
														<span className="px-1.5 py-0.5 rounded bg-secondary text-[9px] uppercase font-mono text-muted-foreground border border-border dark:border-white/5">
															{group.tool}
														</span>
													</div>
												</div>
											</div>
										</TableCell>

										<TableCell className="text-center whitespace-nowrap">
											<div className="flex flex-col items-center gap-2">
												<div className="inline-flex items-center gap-2 px-2.5 py-1 bg-black/5 dark:bg-black/20 border border-border dark:border-white/5 rounded-md text-xs shadow-inner">
													<span className="font-bold flex items-center gap-1.5 text-foreground/90">
														<Shield className="w-3.5 h-3.5 text-muted-foreground" />{" "}
														{group.cves.length}
													</span>
													{group.pendingCount > 0 && (
														<>
															<span className="w-px h-3 bg-black/20 dark:bg-white/20"></span>
															<span className="text-primary font-medium flex items-center gap-1.5">
																<RefreshCw className="w-3.5 h-3.5" />{" "}
																{group.pendingCount}
															</span>
														</>
													)}
												</div>
												<div className="flex flex-col items-center gap-1">
													{group.hasBaseline && (
														<span className="px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/30">
															Dette: {group.maxBaselineAgeInDays > 0 ? `${group.maxBaselineAgeInDays}j` : "Nouveau"}
														</span>
													)}
													{group.hasNetDiscovery && (
														<span
															className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
																group.maxSlaAgeInDays > 30
																	? "bg-red-500/10 text-red-400 border border-red-500/30"
																	: group.maxSlaAgeInDays > 15
																		? "bg-orange-500/10 text-orange-400 border border-orange-500/30"
																		: "bg-green-500/10 text-green-400 border border-green-500/30"
															}`}
														>
															SLA: {group.maxSlaAgeInDays > 0 ? `${group.maxSlaAgeInDays}j` : "Nouveau"}
														</span>
													)}
												</div>
											</div>
										</TableCell>

										<TableCell className="text-center whitespace-nowrap">
											<div className="flex flex-col items-center justify-center h-full">
												{group.targetPatch ? (
													<span className="font-mono text-xs font-bold text-green-400 bg-green-500/10 px-2.5 py-1 rounded-md border border-green-500/20 shadow-sm flex items-center gap-1">
														↳ {group.targetPatch}
													</span>
												) : (
													<span className="text-muted-foreground/50 text-xs italic px-2 py-1 bg-black/5 dark:bg-white/5 rounded-md border border-border dark:border-white/5">
														Aucun patch
													</span>
												)}
											</div>
										</TableCell>
										<TableCell className="text-right whitespace-nowrap">
											<div className="flex flex-col items-end justify-center h-full">
											<button
												onClick={(e) => createTicket(e, group)}
												className="px-2.5 py-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors inline-flex items-center gap-2 text-xs font-semibold"
											>
												<FileText className="w-3.5 h-3.5" />
												Ticket
											</button>
											{tickets[group.key] && (
												<div className="mt-2 text-xs flex justify-end">
													<a
														href={`${jiraBaseUrl.replace(/\/$/, "")}/browse/${tickets[group.key].url}`}
														target="_blank"
														rel="noreferrer"
														className="text-blue-400 hover:underline"
														onClick={(e) => e.stopPropagation()}
													>
														{tickets[group.key].url}
													</a>
												</div>
											)}
											</div>
										</TableCell>
									</TableRow>
								</React.Fragment>
							);
						})}
					</TableBody>
					{(totalPages > 1 || totalItems > 10) && (
						<TableFooter className="bg-muted/50 border-t">
							<TableRow className="hover:bg-muted/50">
								<TableCell colSpan={4} className="py-3">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-4">
											<span className="text-sm text-muted-foreground">
												Affichage de{" "}
												{Math.min((page - 1) * itemsPerPage + 1, totalItems)} à{" "}
												{Math.min(page * itemsPerPage, totalItems)} sur{" "}
												{totalItems} packages
											</span>
											<select
												className="bg-background dark:bg-black/60 border border-border dark:border-white/10 rounded-md px-2 py-1 text-sm outline-none focus:border-primary font-mono text-foreground cursor-pointer"
												value={itemsPerPage}
												onChange={(e) => {
													setItemsPerPage(Number(e.target.value));
													setPage(1);
												}}
											>
												<option className="bg-background text-foreground" value={10}>
													10 par page
												</option>
												<option className="bg-background text-foreground" value={20}>
													20 par page
												</option>
												<option className="bg-background text-foreground" value={50}>
													50 par page
												</option>
												<option className="bg-background text-foreground" value={100}>
													100 par page
												</option>
											</select>
										</div>
										<div className="flex items-center gap-2">
											<button
												onClick={() => setPage((p) => Math.max(1, p - 1))}
												disabled={page === 1}
												className="p-1.5 rounded-lg border border-border dark:border-white/10 bg-black/5 dark:bg-black/40 text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground disabled:opacity-50 transition-colors"
											>
												<ChevronLeft className="w-5 h-5" />
											</button>
											<span className="text-sm font-medium px-2">
												Page {page} / {totalPages}
											</span>
											<button
												onClick={() =>
													setPage((p) => Math.min(totalPages, p + 1))
												}
												disabled={page === totalPages}
												className="p-1.5 rounded-lg border border-border dark:border-white/10 bg-black/5 dark:bg-black/40 text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground disabled:opacity-50 transition-colors"
											>
												<ChevronRight className="w-5 h-5" />
											</button>
										</div>
									</div>
								</TableCell>
							</TableRow>
						</TableFooter>
					)}
				</Table>
		</div>
	);
}
