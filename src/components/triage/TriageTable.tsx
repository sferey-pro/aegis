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
		<div className="glass-panel rounded-xl overflow-hidden">
			<div className="w-full overflow-x-auto pb-2">
				<table className="w-full text-left border-collapse min-w-[900px]">
					<thead className="bg-black/5 dark:bg-black/40 border-b border-border dark:border-white/10 text-xs uppercase tracking-wider text-muted-foreground">
						<tr className="border-b border-border dark:border-white/10 hover:bg-transparent">
							<th className="px-6 py-3 sticky left-0 bg-black/5 dark:bg-black/40 backdrop-blur z-10 border-r border-border dark:border-white/10 min-w-[300px] font-semibold">
								Cible (Package & Projet)
							</th>
							<th className="px-6 py-3 text-center font-semibold">
								Impact & SLA
							</th>
							<th className="px-6 py-3 text-center font-semibold">
								Patch Recommandé
							</th>
							<th className="px-6 py-3 text-right font-semibold">Actions</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border dark:divide-white/5">
						{paginatedGroups.map((group) => {
							return (
								<React.Fragment key={group.key}>
									<tr
										className={`cursor-pointer transition-colors border-border dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/[0.02] ${group.hasConfirmed ? "bg-red-950/20" : ""}`}
										onClick={() => setSelectedGroup(group)}
									>
										<td className="px-4 md:px-6 py-2.5 sticky left-0 bg-white/50 dark:bg-white/5 backdrop-blur z-10 border-r border-border dark:border-white/10 whitespace-nowrap">
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
										</td>

										<td className="px-4 md:px-6 py-2.5 text-center whitespace-nowrap">
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
										</td>

										<td className="px-4 md:px-6 py-2.5 text-center whitespace-nowrap">
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
										</td>
										<td className="px-4 md:px-6 py-2.5 text-right whitespace-nowrap">
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
										</td>
									</tr>
								</React.Fragment>
							);
						})}
					</tbody>
					{(totalPages > 1 || totalItems > 10) && (
						<tfoot className="border-t border-border dark:border-white/10 bg-black/5 dark:bg-black/20">
							<tr>
								<td colSpan={4} className="px-6 py-3">
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
								</td>
							</tr>
						</tfoot>
					)}
				</table>
			</div>
		</div>
	);
}
