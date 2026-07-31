import {
	Check,
	Clock,
	Edit2,
	Link as LinkIcon,
	RefreshCw,
	X,
} from "lucide-react";
import { buildCvssTooltip } from "../../lib/cvss";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { SEVERITY_COLORS } from "./constants";

export function CveDetailsModal({
	selectedGroup,
	setSelectedGroup,
	updateStatus,
	handleConfirmCve,
	setToast,
	tickets,
	jiraBaseUrl,
}: {
	selectedGroup: any;
	setSelectedGroup: (group: any | null) => void;
	updateStatus: (
		cve: string,
		projectId: number,
		newStatus: string,
		note?: string,
	) => Promise<void>;
	handleConfirmCve: (
		cve: string,
		projectId: number,
		initialReason?: string,
	) => void;
	setToast: (toast: any) => void;
	tickets: Record<string, any>;
	jiraBaseUrl: string;
}) {
	if (!selectedGroup) return null;

	return (
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm"
			onClick={() => setSelectedGroup(null)}
		>
			<div
				className="w-full max-w-4xl max-h-[90vh] bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl flex flex-col shadow-2xl overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="p-6 border-b border-border/50 flex items-center justify-between bg-black/5 dark:bg-black/20">
					<div>
						<div className="flex items-center gap-4">
							<h3 className="text-xl font-bold font-mono text-foreground flex items-center gap-3">
								{selectedGroup.package}
							</h3>
							{tickets[selectedGroup.key] && (
								<a
									href={`${jiraBaseUrl.replace(/\/$/, "")}/browse/${tickets[selectedGroup.key].url}`}
									target="_blank"
									rel="noreferrer"
									className="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-xs font-bold flex items-center gap-1.5"
								>
									<LinkIcon className="w-3 h-3" />
									Ticket Jira : {tickets[selectedGroup.key].url}
								</a>
							)}
						</div>
						<p className="text-sm text-muted-foreground mt-1">
							Projet :{" "}
							<span className="font-semibold text-foreground">
								{selectedGroup.projectName}
							</span>
						</p>
					</div>
					<button
						onClick={() => setSelectedGroup(null)}
						className="p-2 rounded-full hover:bg-white/10 text-muted-foreground transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto p-6 bg-black/10">
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						{selectedGroup.cves.map((cveObj: any, i: number) => (
							<div
								key={i}
								className="flex flex-col gap-4 p-5 rounded-xl bg-card/40 border border-border/50 shadow-sm relative overflow-hidden hover:bg-card/60 transition-colors"
							>
								<div className="flex items-start justify-between gap-4">
									<div className="flex flex-col gap-1.5 flex-1">
										<h4 className="font-bold text-lg text-foreground flex items-center gap-2">
											{cveObj.ref}
											<span
												className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${SEVERITY_COLORS[cveObj.severity]}`}
											>
												{cveObj.severity}
											</span>
										</h4>
										<p className="text-sm text-muted-foreground leading-relaxed">
											{cveObj.title}{" "}
											{cveObj.versionRange && (
												<span className="font-mono bg-white/5 px-1 rounded">
													({cveObj.versionRange})
												</span>
											)}
										</p>
									</div>
								</div>

								<div className="flex flex-wrap gap-2 text-xs items-center">
									{cveObj.cvssVector && (
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="font-mono px-2 py-1 rounded bg-white/5 border border-white/10 text-muted-foreground cursor-help">
													CVSS: {cveObj.cvssVector}
												</span>
											</TooltipTrigger>
											<TooltipContent
												side="top"
												className="font-mono text-xs whitespace-pre bg-gray-900 border-gray-700 text-gray-300 shadow-xl max-w-[400px]"
											>
												{buildCvssTooltip(cveObj.cvssVector)}
											</TooltipContent>
										</Tooltip>
									)}
									{cveObj.ageInDays !== undefined && (
										<span
											className={`font-mono px-2 py-1 rounded border flex items-center gap-1 ${
												cveObj.isBaseline
													? "bg-purple-500/10 text-purple-400 border-purple-500/30"
													: cveObj.ageInDays > 30
														? "bg-red-500/10 text-red-400 border-red-500/20"
														: cveObj.ageInDays > 15
															? "bg-orange-500/10 text-orange-400 border-orange-500/20"
															: "bg-white/5 text-muted-foreground border-white/10"
											}`}
											title={
												cveObj.publishedAt
													? `Publiée le: ${new Date(cveObj.publishedAt).toLocaleString()}`
													: cveObj.firstSeenAt
														? `Première détection: ${new Date(cveObj.firstSeenAt).toLocaleString()}`
														: "Âge SLA"
											}
										>
											<Clock className="w-3 h-3" /> {cveObj.isBaseline ? "Dette" : "SLA"} {cveObj.ageInDays}j
										</span>
									)}
									{cveObj.fixedIn && (
										<span className="font-mono px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20">
											Patch : {cveObj.fixedIn}
										</span>
									)}
								</div>

								{cveObj.link && (
									<div className="flex items-center gap-3 mt-1">
										<a
											href={cveObj.link}
											target="_blank"
											rel="noreferrer"
											className="text-sm text-blue-400 hover:underline flex items-center gap-1.5 font-medium"
										>
											<LinkIcon className="w-3.5 h-3.5" /> Avis de sécurité
										</a>
										<span className="w-1 h-1 rounded-full bg-white/20"></span>
										<button
											onClick={async () => {
												try {
													const res = await fetch("/api/advisories/sync", {
														method: "POST",
														body: JSON.stringify({
															cve: cveObj.cve,
															link: cveObj.link,
														}),
													});
													const data = await res.json();

													if (data.success && data.advisory) {
														const fixes = data.advisory.fixes || {};
														const patches = Object.entries(fixes)
															.filter(([k]) =>
																k.includes(selectedGroup.package),
															)
															.flatMap(([_, v]: any) => v)
															.map((v: any) => v.patched)
															.filter(Boolean);

														const patchStr =
															patches.length > 0
																? Array.from(new Set(patches)).join(", ")
																: "Aucun";

														const publishedDate = data.advisory.published_at
															? new Date(data.advisory.published_at)
															: cveObj.firstSeenAt
																? new Date(cveObj.firstSeenAt)
																: new Date();
														const ageInDays = Math.floor(
															(Date.now() - publishedDate.getTime()) /
																(1000 * 3600 * 24),
														);

														setToast({
															isOpen: true,
															type: "success",
															title: `${cveObj.ref || cveObj.cve} mise à jour`,
															message: (
																<div className="flex flex-col gap-1 mt-1">
																	<span>
																		<strong>Package :</strong>{" "}
																		{selectedGroup.package}
																	</span>
																	<span>
																		<strong>Correctif(s) :</strong>{" "}
																		<span className="font-mono text-green-400">
																			{patchStr}
																		</span>
																	</span>
																	<span>
																		<strong>Sévérité :</strong>{" "}
																		<span className="uppercase">
																			{data.advisory.severity}
																		</span>
																	</span>
																	<span>
																		<strong>Âge (SLA) :</strong>{" "}
																		<span className="font-mono text-orange-400">
																			{ageInDays}j
																		</span>
																	</span>
																</div>
															),
														});
														setTimeout(() => setToast(null), 8000);
													} else {
														setToast({
															isOpen: true,
															type: "error",
															title: "Échec",
															message: data.error || "Erreur inconnue",
														});
														setTimeout(() => setToast(null), 5000);
													}
												} catch (err: any) {
													setToast({
														isOpen: true,
														type: "error",
														title: "Erreur",
														message: err.message,
													});
													setTimeout(() => setToast(null), 5000);
												}
											}}
											className="text-sm text-muted-foreground hover:text-white flex items-center gap-1.5 transition-colors"
										>
											<RefreshCw className="w-3.5 h-3.5" /> Forcer maj
										</button>
									</div>
								)}

								<hr className="border-border/50 my-2" />

								<div className="flex flex-wrap gap-2">
									<button
										onClick={() => {
											updateStatus(
												cveObj.cve,
												selectedGroup.projectId,
												"pending",
											);
											setSelectedGroup(null);
										}}
										className={`px-3 py-2 text-xs font-medium rounded-md transition-colors ${cveObj.status === "pending" ? "bg-secondary text-foreground" : "text-muted-foreground bg-white/5 hover:bg-secondary/80"}`}
									>
										À traiter
									</button>
									<button
										onClick={() => {
											handleConfirmCve(
												cveObj.cve,
												selectedGroup.projectId,
												cveObj.note || "",
											);
											setSelectedGroup(null);
										}}
										className={`px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${cveObj.status === "confirmed" ? "bg-red-500/20 text-red-500 border border-red-500/30" : "text-muted-foreground bg-white/5 hover:bg-red-500/10 hover:text-red-400"}`}
									>
										<Check className="w-3.5 h-3.5" /> Confirmé
									</button>
									<button
										onClick={() => {
											updateStatus(
												cveObj.cve,
												selectedGroup.projectId,
												"ignored",
											);
											setSelectedGroup(null);
										}}
										className={`px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${cveObj.status === "ignored" && !cveObj.isGlobal ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "text-muted-foreground bg-white/5 hover:bg-orange-500/10 hover:text-orange-400"}`}
										title="Faux positif pour ce projet"
									>
										<X className="w-3.5 h-3.5" /> Faux positif
									</button>
								</div>

								{cveObj.note && (
									<div className="text-sm text-muted-foreground bg-black/40 p-3 rounded-lg border border-white/5 relative group mt-2">
										<span className="font-semibold block mb-1 text-foreground/80">
											Raison / Note :
										</span>
										<p className="pr-8 whitespace-pre-wrap leading-relaxed">
											{cveObj.note}
										</p>
										<button
											onClick={() => {
												handleConfirmCve(
													cveObj.cve,
													selectedGroup.projectId,
													cveObj.note,
												);
												setSelectedGroup(null);
											}}
											className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-white"
											title="Modifier la note"
										>
											<Edit2 className="w-4 h-4" />
										</button>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
