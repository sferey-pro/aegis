import {
	AlertOctagon,
	ChevronLeft,
	ChevronRight,
	FileText,
	RefreshCw,
	Shield,
} from "lucide-react";
import React from "react";
import type { Ticket } from "@/db/tickets";
import { SEVERITY_COLORS, SEVERITY_ICONS } from "../../lib/triage-constants";
import { CveTimeline } from "../molecules/CveTimeline";
import { Button } from "../ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "../ui/table";
import type { PackageGroup } from "./triage-types";

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
	paginatedGroups: PackageGroup[];
	setSelectedGroup: (group: PackageGroup) => void;
	createTicket: (e: React.MouseEvent, group: PackageGroup) => void;
	tickets: Record<string, Ticket>;
	jiraBaseUrl: string;
	page: number;
	setPage: (p: number | ((prev: number) => number)) => void;
	totalPages: number;
	itemsPerPage: number;
	setItemsPerPage: (n: number) => void;
	totalItems: number;
}) {
	return (
		<div className="rounded-md border bg-card text-card-foreground overflow-hidden">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/50">
						<TableHead className="min-w-[300px]">
							Cible (Package & Projet)
						</TableHead>
						<TableHead className="text-center">Impact & SLA</TableHead>
						<TableHead className="text-center">Patch Recommandé</TableHead>
						<TableHead className="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{paginatedGroups.map((group) => {
						// Une seule lecture de la map : l'entrée peut être absente.
						const ticket = tickets[group.key];
						return (
							<React.Fragment key={group.key}>
								<TableRow
									className={`cursor-pointer ${group.hasConfirmed ? "bg-red-500/5 dark:bg-red-950/40" : ""}`}
									onClick={() => setSelectedGroup(group)}
								>
									<TableCell className="whitespace-nowrap">
										<div className="flex items-center gap-3">
											<div
												className={`p-1.5 rounded-lg border ${group.hasConfirmed ? "bg-red-500/20 text-red-700 border-red-500 dark:bg-red-500/25 dark:text-red-200" : SEVERITY_COLORS[group.worstSeverity]}`}
											>
												{group.hasConfirmed ? (
													<AlertOctagon className="w-5 h-5" />
												) : (
													SEVERITY_ICONS[group.worstSeverity]
												)}
											</div>
											<div className="flex flex-col">
												<div className="flex items-center gap-2">
													<span
														className={`font-bold font-mono text-sm ${group.hasConfirmed ? "text-red-700 dark:text-red-300" : "text-foreground"}`}
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
														<span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border">
															Urgent
														</span>
													)}
												</div>
												<div className="flex items-center gap-2 mt-1 opacity-80">
													<span className="font-medium text-xs text-muted-foreground">
														{group.projectName}
													</span>
													<span className="px-1.5 py-0.5 rounded bg-secondary text-[9px] uppercase font-mono text-muted-foreground border border-border ">
														{group.tool}
													</span>
												</div>
											</div>
										</div>
									</TableCell>

									<TableCell className="text-center whitespace-nowrap">
										<div className="flex flex-col items-center gap-2">
											<div className="inline-flex items-center gap-2 px-2.5 py-1  border border-border  rounded-md text-xs">
												<span className="font-bold flex items-center gap-1.5 text-foreground/90">
													<Shield className="w-3.5 h-3.5 text-muted-foreground" />{" "}
													{group.cves.length}
												</span>
												{group.pendingCount > 0 && (
													<>
														<span className="w-px h-3 "></span>
														<span className="text-primary font-medium flex items-center gap-1.5">
															<RefreshCw className="w-3.5 h-3.5" />{" "}
															{group.pendingCount}
														</span>
													</>
												)}
											</div>
											<div className="flex flex-col items-center gap-1">
												{group.hasBaseline && (
													<span
														className="px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border"
														title="Existant à l'installation : l'âge est compté depuis la publication de l'avis, pas depuis notre première détection."
													>
														SLA hérité:{" "}
														{group.maxBaselineAgeInDays > 0
															? `${group.maxBaselineAgeInDays}j`
															: "Nouveau"}
													</span>
												)}
												{group.hasNetDiscovery && (
													<span
														className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${group.maxSlaAgeInDays > 30 ? "bg-red-500/10 border " : group.maxSlaAgeInDays > 15 ? "bg-orange-500/10 border " : "bg-green-500/10 border "}`}
														title="Découverte nette : l'âge est compté depuis notre première détection."
													>
														SLA:{" "}
														{group.maxSlaAgeInDays > 0
															? `${group.maxSlaAgeInDays}j`
															: "Nouveau"}
													</span>
												)}
											</div>
											{/* Les deux dates dont les SLA ci-dessus sont calculés :
											    le calcul devient vérifiable au lieu d'être à croire. */}
											<CveTimeline
												publishedAt={group.publishedAt}
												firstSeenAt={group.firstSeenAt}
												className="items-center"
											/>
										</div>
									</TableCell>

									<TableCell className="text-center whitespace-nowrap">
										<div className="flex flex-col items-center justify-center h-full">
											{group.targetPatch ? (
												<span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md border flex items-center gap-1">
													↳ {group.targetPatch}
												</span>
											) : (
												<span className="text-muted-foreground/50 text-xs italic px-2 py-1  rounded-md border border-border ">
													Aucun patch
												</span>
											)}
										</div>
									</TableCell>
									<TableCell className="text-right whitespace-nowrap">
										<div className="flex flex-col items-end justify-center h-full">
											<Button
												variant="outline"
												size="sm"
												onClick={(e) => createTicket(e, group)}
												className="inline-flex items-center gap-2 text-xs font-semibold"
											>
												<FileText className="w-3.5 h-3.5" />
												Ticket
											</Button>
											{ticket && (
												<div className="mt-2 text-xs flex justify-end">
													<a
														href={`${jiraBaseUrl.replace(/\/$/, "")}/browse/${ticket.url}`}
														target="_blank"
														rel="noreferrer"
														className="text-blue-600 dark:text-blue-400"
														onClick={(e) => e.stopPropagation()}
													>
														{ticket.url}
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
										<Select
											value={itemsPerPage.toString()}
											onValueChange={(val) => {
												setItemsPerPage(Number(val));
												setPage(1);
											}}
										>
											<SelectTrigger className="w-[140px] h-8 text-xs font-mono">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="10">10 par page</SelectItem>
												<SelectItem value="20">20 par page</SelectItem>
												<SelectItem value="50">50 par page</SelectItem>
												<SelectItem value="100">100 par page</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="flex items-center gap-2">
										{/* Nom accessible : ces deux boutons n'étaient que des
										    icônes, donc sans intitulé pour un lecteur d'écran — ni
										    pour un test qui veut les désigner. */}
										<Button
											variant="outline"
											size="icon"
											onClick={() => setPage((p) => Math.max(1, p - 1))}
											disabled={page === 1}
											className="h-8 w-8"
											aria-label="Page précédente"
										>
											<ChevronLeft className="w-4 h-4" />
										</Button>
										<span className="text-sm font-medium px-2">
											Page {page} / {totalPages}
										</span>
										<Button
											variant="outline"
											size="icon"
											onClick={() =>
												setPage((p) => Math.min(totalPages, p + 1))
											}
											disabled={page === totalPages}
											className="h-8 w-8"
											aria-label="Page suivante"
										>
											<ChevronRight className="w-4 h-4" />
										</Button>
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
