import {
	Check,
	Clock,
	Edit2,
	Link as LinkIcon,
	RefreshCw,
	X,
} from "lucide-react";
import type { AnnotationStatus } from "@/db/annotations";
import { fetchJson, jsonInit } from "@/lib/api";
import type { CachedAdvisory } from "@/lib/github";
import { errorMessage } from "@/lib/utils";
import { buildCvssTooltip } from "../../lib/cvss";
import { SEVERITY_COLORS } from "../../lib/triage-constants";
import { CveTimeline } from "../molecules/CveTimeline";
import { Button } from "../ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";
import type { PackageGroupCve, Toast } from "./triage-types";

export function CveCard({
	cveObj,
	packageName,
	projectId,
	setToast,
	updateStatus,
	handleConfirmCve,
}: {
	cveObj: PackageGroupCve;
	packageName: string;
	projectId: number;
	setToast: (toast: Toast | null) => void;
	updateStatus: (
		cve: string,
		projectId: number,
		newStatus: AnnotationStatus,
		note?: string,
	) => Promise<void>;
	handleConfirmCve: (
		cve: string,
		projectId: number,
		initialReason?: string,
	) => void;
}) {
	return (
		<div className="flex flex-col rounded-xl border relative overflow-hidden bg-card text-card-foreground">
			<div className="flex flex-col gap-4 p-5 flex-1">
				<div className="flex items-start justify-between gap-4">
					<div className="flex flex-col gap-1.5 flex-1">
						<h4 className="font-bold text-lg text-foreground flex items-center gap-2">
							{cveObj.ref || cveObj.cve}
							<span
								className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${SEVERITY_COLORS[cveObj.severity] || "bg-muted text-muted-foreground"}`}
							>
								{cveObj.severity}
							</span>
						</h4>
						<p className="text-sm text-muted-foreground leading-relaxed">
							{cveObj.title}{" "}
							{cveObj.versionRange && (
								<span className="font-mono px-1 rounded">
									({cveObj.versionRange})
								</span>
							)}
						</p>
					</div>
				</div>

				<div className="flex flex-wrap gap-2 text-xs items-center">
					{cveObj.cvssVector && (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="font-mono px-2 py-1 rounded border text-muted-foreground cursor-help break-all">
										CVSS: {cveObj.cvssVector}
									</span>
								</TooltipTrigger>
								<TooltipContent
									side="top"
									className="font-mono text-xs whitespace-pre bg-gray-900 border-gray-700 max-w-[400px]"
								>
									{buildCvssTooltip(cveObj.cvssVector)}
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}
					{cveObj.ageInDays !== undefined && (
						<span
							className={`font-mono px-2 py-1 rounded border flex items-center gap-1 ${cveObj.isBaseline ? "bg-purple-500/10 text-purple-700 border-purple-500/40 dark:text-purple-300" : cveObj.ageInDays > 30 ? "bg-red-500/10 text-red-700 border-red-500/40 dark:text-red-300" : cveObj.ageInDays > 15 ? "bg-orange-500/10 text-orange-700 border-orange-500/40 dark:text-orange-300" : "bg-muted/60 text-muted-foreground dark:bg-white/5"}`}
							title={
								cveObj.isBaseline
									? "Existant à l'installation : l'âge court depuis la publication de l'avis."
									: "Découverte nette : l'âge court depuis notre première détection."
							}
						>
							<Clock className="w-3 h-3" />{" "}
							{cveObj.isBaseline ? "SLA hérité" : "SLA"} {cveObj.ageInDays}j
						</span>
					)}
					{/* Les deux dates, chacune nommée. L'infobulle précédente affichait
					    l'une *ou* l'autre selon ce qui était disponible, sans dire
					    laquelle : impossible de savoir ce qu'on lisait. */}
					<CveTimeline
						publishedAt={cveObj.publishedAt}
						firstSeenAt={cveObj.firstSeenAt}
						className="px-2 py-1 rounded border"
					/>
					{cveObj.fixedIn && (
						<span className="font-mono px-2 py-1 rounded border">
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
							className="text-sm flex items-center gap-1.5 font-medium hover:underline"
						>
							<LinkIcon className="w-3.5 h-3.5" /> Avis de sécurité
						</a>
						<span className="w-1 h-1 rounded-full bg-muted-foreground/30"></span>
						<Button
							variant="ghost"
							size="sm"
							onClick={async () => {
								try {
									const data = await fetchJson<{
										success?: boolean;
										advisory?: CachedAdvisory | null;
									}>(
										"/api/advisories/sync",
										jsonInit("POST", {
											cve: cveObj.cve,
											link: cveObj.link,
										}),
									);

									if (data.success && data.advisory) {
										const fixes: CachedAdvisory["fixes"] =
											data.advisory.fixes || {};
										// Une entrée de `fixes` est soit une liste de plages
										// corrigées, soit une version unique, soit null.
										const patches = Object.entries(fixes)
											.filter(([k]) => k.includes(packageName))
											.flatMap(([, v]) => (Array.isArray(v) ? v : []))
											.map((v) => v.patched)
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
														<strong>Package :</strong> {packageName}
													</span>
													<span>
														<strong>Correctif(s) :</strong>{" "}
														<span className="font-mono">{patchStr}</span>
													</span>
													<span>
														<strong>Sévérité :</strong>{" "}
														<span className="uppercase">
															{data.advisory.severity}
														</span>
													</span>
													<span>
														<strong>Âge (SLA) :</strong>{" "}
														<span className="font-mono">{ageInDays}j</span>
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
											message: "Avis introuvable chez GitHub",
										});
										setTimeout(() => setToast(null), 5000);
									}
								} catch (err: unknown) {
									setToast({
										isOpen: true,
										type: "error",
										title: "Erreur",
										message: errorMessage(err),
									});
									setTimeout(() => setToast(null), 5000);
								}
							}}
							className="text-xs text-muted-foreground flex items-center gap-1.5 h-6 px-2"
						>
							<RefreshCw className="w-3.5 h-3.5" /> Forcer maj
						</Button>
					</div>
				)}

				{cveObj.note && (
					<div className="text-sm text-muted-foreground p-3 rounded-lg border relative mt-2">
						<span className="font-semibold block mb-1 text-foreground/80">
							Raison / Note :
						</span>
						<p className="pr-8 whitespace-pre-wrap leading-relaxed">
							{cveObj.note}
						</p>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => {
								handleConfirmCve(cveObj.cve, projectId, cveObj.note);
							}}
							className="absolute top-2 right-2 w-7 h-7 opacity-0 hover:opacity-100 text-muted-foreground transition-opacity group-hover:opacity-100"
							title="Modifier la note"
						>
							<Edit2 className="w-3.5 h-3.5" />
						</Button>
					</div>
				)}
			</div>

			<div className="flex flex-wrap items-center gap-2 p-4 bg-muted/20 border-t mt-auto">
				<Button
					variant={cveObj.status === "pending" ? "secondary" : "ghost"}
					size="sm"
					onClick={() => {
						updateStatus(cveObj.cve, projectId, "pending");
					}}
					className="text-xs font-medium"
				>
					À traiter
				</Button>
				<Button
					variant={cveObj.status === "confirmed" ? "destructive" : "ghost"}
					size="sm"
					onClick={() => {
						handleConfirmCve(cveObj.cve, projectId, cveObj.note || "");
					}}
					className="text-xs font-medium flex items-center gap-1.5"
				>
					<Check className="w-3.5 h-3.5" /> Confirmé
				</Button>
				<Button
					variant={
						cveObj.status === "ignored" && !cveObj.isGlobal
							? "outline"
							: "ghost"
					}
					size="sm"
					onClick={() => {
						updateStatus(cveObj.cve, projectId, "ignored");
					}}
					className={`text-xs font-medium flex items-center gap-1.5 ${cveObj.status === "ignored" && !cveObj.isGlobal ? "bg-orange-500/20 text-orange-500 border-orange-500/50" : ""}`}
					title="Faux positif pour ce projet"
				>
					<X className="w-3.5 h-3.5" /> Faux positif
				</Button>
			</div>
		</div>
	);
}
