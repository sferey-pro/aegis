import {
	ArrowDownToLine,
	Check,
	CheckCircle2,
	Copy,
	Globe,
	HardDrive,
	Info,
	Loader2,
	UploadCloud,
	XCircle,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProjectTool } from "@/db/projects";
import type { Tag } from "@/db/tags";
import { apiErrorMessage, fetchJson, fetchVoid } from "@/lib/api";
import { cn, copyToClipboard } from "@/lib/utils";
import type { ProjectListItem } from "@/routes/projects";

const TOOL_DEFAULT_LOCKS: Record<ProjectTool, string> = {
	composer: "composer.lock",
	yarn: "yarn.lock",
	bun: "bun.lock",
	npm: "package-lock.json",
};

export function ProjectEditDialog({
	project,
	isOpen,
	onOpenChange,
	onSaved,
	showIgnoreToggle = true,
}: {
	project?: ProjectListItem | null;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: (
		createdProject?: { id: number; name: string },
		shouldAudit?: boolean,
	) => void;
	showIgnoreToggle?: boolean;
}) {
	const formRef = useRef<HTMLFormElement>(null);
	const [isTypeChosen, setIsTypeChosen] = useState(false);
	const [formData, setFormData] = useState({
		name: "",
		path: "",
		audit_path: "",
		tool: "npm" as ProjectTool,
		tools: ["npm"] as ProjectTool[],
		tool_paths: {} as Record<string, string>,
		type: "node",
		tags: [] as string[],
		ignored: false,
		source_type: "local" as "local" | "ingest" | "remote",
		remote_url: "",
		remote_token: "",
	});
	const [availableTags, setAvailableTags] = useState<Tag[]>([]);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [detectStatus, setDetectStatus] = useState<
		"idle" | "detecting" | "success" | "error"
	>("idle");
	const [detectedToolName, setDetectedToolName] = useState<string>("");
	const [copiedSlug, setCopiedSlug] = useState<number | null>(null);

	useEffect(() => {
		if (isOpen) {
			if (project) {
				setIsTypeChosen(true);
				const projectTools =
					project.tools && project.tools.length > 0
						? project.tools
						: [project.tool];
				setFormData({
					name: project.name,
					path:
						project.source_type === "remote" ||
						project.path?.includes(".aegis_remote_projects")
							? ""
							: project.path,
					audit_path: project.audit_path || "",
					tool: project.tool,
					tools: projectTools,
					tool_paths: (project.tool_paths as Record<string, string>) || {},
					type: project.type,
					tags: project.tags || [],
					ignored: !!project.ignored,

					source_type: (project?.source_type ||
						(project as { source_type?: string })?.source_type ||
						"local") as "local" | "ingest" | "remote",
					remote_url: (project as { remote_url?: string }).remote_url || "",
					remote_token:
						(project as { remote_token?: string }).remote_token || "",
				});
			} else {
				setIsTypeChosen(false);
				setFormData({
					name: "",
					path: "",
					audit_path: "",
					tool: "npm",
					tools: ["npm"],
					tool_paths: {},
					type: "node",
					tags: [],
					ignored: false,
					source_type: "local",
					remote_url: "",
					remote_token: "",
				});
			}
			setSubmitError(null);
			setDetectStatus("idle");
			setDetectedToolName("");
			fetchJson<Tag[]>("/api/tags").then(setAvailableTags).catch(console.error);
		}
	}, [isOpen, project]);

	const handleDetectTool = async () => {
		if (!formData.path) return;
		setDetectStatus("detecting");
		try {
			const data = await fetchJson<{
				tool: ProjectTool | null;
				tools?: ProjectTool[];
				tool_paths?: Record<string, string>;
			}>("/api/projects/detect", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					path: formData.path,
					audit_path: formData.audit_path,
				}),
			});
			const detectedTools =
				data.tools && data.tools.length > 0
					? data.tools
					: data.tool
						? [data.tool]
						: [];
			if (detectedTools.length > 0) {
				const primary = detectedTools[0] || "npm";
				setFormData((prev) => ({
					...prev,
					tool: primary,
					tools: detectedTools,
					tool_paths: data.tool_paths || prev.tool_paths || {},
					type:
						detectedTools.includes("composer") && detectedTools.length === 1
							? "composer"
							: "node",
				}));
				setDetectedToolName(detectedTools.join(" + "));
				setDetectStatus("success");
			} else {
				setDetectStatus("error");
			}
		} catch (_e) {
			setDetectStatus("error");
		}
	};

	const handleSubmit = async (
		e: React.FormEvent | React.MouseEvent,
		shouldAudit = false,
	) => {
		e.preventDefault();
		setSubmitError(null);
		try {
			if (project) {
				await fetchVoid(`/api/projects/${project.id}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(formData),
				});
				onSaved();
			} else {
				const payload = {
					...formData,
					is_remote: formData.source_type === "remote",
				};
				const created = await fetchJson<{ id: number; name: string }>(
					"/api/projects",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
					},
				);
				onSaved(created, shouldAudit);
			}
			onOpenChange(false);
		} catch (err) {
			setSubmitError(apiErrorMessage(err));
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-5xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
				<form
					ref={formRef}
					onSubmit={(e) => handleSubmit(e, false)}
					className="flex flex-col h-full"
				>
					{!isTypeChosen && !project ? (
						<div className="flex flex-col h-full">
							<DialogHeader className="p-6 pb-4 border-b shrink-0 flex-row justify-between items-center">
								<DialogTitle className="text-xl font-bold text-primary">
									Type de projet
								</DialogTitle>
							</DialogHeader>
							<div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-6 p-10 bg-muted/20">
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										setFormData((prev) => ({
											...prev,
											source_type: "local",
											path: "",
										}));
										setIsTypeChosen(true);
									}}
									className="w-40 h-40 flex flex-col gap-4 rounded-2xl hover:border-primary hover:bg-primary/5 transition-all"
								>
									<HardDrive className="w-12 h-12 text-primary" />
									<span className="font-semibold text-base whitespace-normal text-center">
										Projet Local
									</span>
								</Button>

								<Button
									type="button"
									variant="outline"
									onClick={() => {
										setFormData((prev) => ({
											...prev,
											source_type: "remote",
											path: "",
										}));
										setIsTypeChosen(true);
									}}
									className="w-40 h-40 flex flex-col gap-4 rounded-2xl hover:border-primary hover:bg-primary/5 transition-all"
								>
									<Globe className="w-12 h-12 text-primary" />
									<span className="font-semibold text-base whitespace-normal text-center">
										Distant (Direct)
									</span>
								</Button>

								<Button
									type="button"
									variant="outline"
									onClick={() => {
										setFormData((prev) => ({
											...prev,
											source_type: "ingest",
											path: "",
										}));
										setIsTypeChosen(true);
									}}
									className="w-40 h-40 flex flex-col gap-4 rounded-2xl hover:border-primary hover:bg-primary/5 transition-all"
								>
									<UploadCloud className="w-12 h-12 text-primary" />
									<span className="font-semibold text-base whitespace-normal text-center">
										Ingestion CI
									</span>
								</Button>
							</div>
						</div>
					) : (
						<>
							<DialogHeader className="p-6 pb-4 border-b shrink-0 flex-row justify-between items-center">
								<div className="flex items-center gap-3">
									{!project && (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label="Retour au choix du type"
											className="h-8 w-8 rounded-full"
											onClick={() => setIsTypeChosen(false)}
										>
											<ArrowDownToLine className="w-4 h-4 rotate-90" />
										</Button>
									)}
									<DialogTitle className="text-xl font-bold text-primary">
										{!project
											? formData.source_type === "local"
												? "Nouveau Projet Local"
												: formData.source_type === "remote"
													? "Nouveau Projet Distant"
													: "Nouvelle Ingestion CI"
											: showIgnoreToggle
												? "Configuration du projet"
												: "Modifier la configuration"}
									</DialogTitle>
								</div>
							</DialogHeader>

							<div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-6 hide-scrollbar">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
									<div className="flex flex-col gap-1">
										<Label htmlFor="edit-name">Nom du projet</Label>
										<Input
											id="edit-name"
											required
											type="text"
											value={formData.name}
											onChange={(e) =>
												setFormData({ ...formData, name: e.target.value })
											}
											placeholder="Ex: Mon API Node"
										/>
									</div>

									<div className="flex flex-col gap-1">
										<Label htmlFor="edit-source-type">Type de projet</Label>
										<Tabs
											value={formData.source_type}
											onValueChange={(val) => {
												const st = val as "local" | "ingest" | "remote";
												setFormData({
													...formData,
													source_type: st,
													path:
														st === "remote" || st === "ingest"
															? ""
															: formData.path,
												});
											}}
											className="w-full"
										>
											<TabsList className="w-full h-10">
												<TabsTrigger
													value="remote"
													title="Distant (Direct)"
													className="flex-1"
												>
													<Globe className="w-5 h-5" />
												</TabsTrigger>
												<TabsTrigger
													value="local"
													title="Local"
													className="flex-1"
												>
													<HardDrive className="w-5 h-5" />
												</TabsTrigger>
												<TabsTrigger
													value="ingest"
													title="Ingestion CI"
													className="flex-1"
													disabled
												>
													<UploadCloud className="w-5 h-5 opacity-50" />
												</TabsTrigger>
											</TabsList>
										</Tabs>
									</div>

									{formData.source_type === "ingest" && (
										<div className="flex flex-col gap-1 md:col-span-2 bg-muted/30 p-4 rounded-lg border border-border/50">
											<Label>URL d'ingestion (API)</Label>
											<p className="text-xs text-muted-foreground mb-2">
												Envoyez le résultat de votre scan npm audit, yarn audit
												ou trivy sur cette URL.
											</p>
											<div className="relative flex items-center">
												<Input
													readOnly
													value={
														formData.name
															? `${window.location.origin}/api/ingest/${formData.name
																	.toLowerCase()
																	.replace(/[^a-z0-9]+/g, "-")
																	.replace(/(^-|-$)/g, "")}`
															: "URL auto-générée"
													}
													className="w-full border text-muted-foreground rounded-md px-3 py-2 outline-none cursor-not-allowed text-sm font-mono pr-10"
													title="Cette URL sera utilisée par votre CI/CD pour envoyer l'audit."
												/>
												<Button
													type="button"
													variant="ghost"
													title="Copier l'URL"
													onClick={(e) => {
														e.preventDefault();
														e.stopPropagation();
														const slug = formData.name
															? formData.name
																	.toLowerCase()
																	.replace(/[^a-z0-9]+/g, "-")
																	.replace(/(^-|-$)/g, "")
															: "";
														if (slug) {
															copyToClipboard(
																`${window.location.origin}/api/ingest/${slug}`,
															);
															setCopiedSlug(-1);
															setTimeout(() => setCopiedSlug(null), 2000);
														}
													}}
													className="absolute inset-y-0 right-0 flex items-center px-3 rounded-l-none"
												>
													{copiedSlug === -1 ? (
														<Check className="w-4 h-4" />
													) : (
														<Copy className="w-4 h-4 text-muted-foreground" />
													)}
												</Button>
											</div>
										</div>
									)}
									<div className="flex flex-col gap-1 md:col-span-2">
										<Label
											htmlFor="edit-tool"
											className="flex items-center gap-1.5"
										>
											Outil d'audit
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger type="button" className="cursor-help">
														<Info className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors" />
													</TooltipTrigger>
													<TooltipContent
														side="right"
														className="max-w-sm bg-popover text-popover-foreground border shadow-md text-sm p-4 font-normal space-y-3"
													>
														<p className="font-semibold text-primary/90 mb-1">
															Comportement des outils
														</p>
														<ul className="list-disc pl-4 space-y-2 text-xs text-muted-foreground">
															<li>
																<strong>NPM</strong> : Audit 100% strict. Aegis
																utilise <code>--package-lock-only</code> pour
																auditer exactement ce qui est dans le fichier
																lock, peu importe le dossier local.
															</li>
															<li>
																<strong>Yarn (v1)</strong> : Audit permissif. Si
																ton <code>yarn.lock</code> est désynchronisé
																(ex: git pull sans <code>yarn install</code>),
																Yarn résout dynamiquement les dépendances et
																trouve 0 faille. Assure-toi que ton lockfile est
																à jour !
															</li>
															<li>
																<strong>Bun & Yarn 2+</strong> : Audit
																intraitable. Si le lockfile est désynchronisé,
																l'audit plante immédiatement avec une erreur.
															</li>
															<li>
																<strong>Composer</strong> : Audit strict avec{" "}
																<code>--locked</code>.
															</li>
														</ul>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</Label>
										<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
											{(
												[
													{ id: "composer", label: "Composer", desc: "PHP" },
													{ id: "npm", label: "NPM", desc: "Node" },
													{ id: "yarn", label: "Yarn", desc: "Node" },
													{ id: "bun", label: "Bun", desc: "Node / Bun" },
												] as const
											).map(({ id, label, desc }) => {
												const isSelected = formData.tools.includes(id);
												return (
													<button
														key={id}
														type="button"
														onClick={() => {
															let newTools: ProjectTool[];
															const nextToolPaths = {
																...(formData.tool_paths || {}),
															};
															if (isSelected) {
																if (formData.tools.length <= 1) return;
																newTools = formData.tools.filter(
																	(t) => t !== id,
																);
																delete nextToolPaths[id];
															} else {
																newTools = [...formData.tools, id];
																if (!nextToolPaths[id]) {
																	if (formData.source_type === "remote") {
																		const defaultLock = TOOL_DEFAULT_LOCKS[id];
																		const remoteMatch =
																			formData.remote_url.match(
																				/https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.*)/,
																			);
																		if (remoteMatch?.[1]) {
																			const pathInRepo = remoteMatch[1];
																			const lastSlash =
																				pathInRepo.lastIndexOf("/");
																			const subFolder =
																				lastSlash >= 0
																					? pathInRepo.substring(0, lastSlash)
																					: "";
																			nextToolPaths[id] = subFolder
																				? `${subFolder}/${defaultLock}`
																				: defaultLock;
																		} else {
																			nextToolPaths[id] = defaultLock;
																		}
																	} else {
																		nextToolPaths[id] =
																			formData.audit_path || "";
																	}
																}
															}
															setFormData({
																...formData,
																tools: newTools,
																tool: newTools[0] || "npm",
																tool_paths: nextToolPaths,
																type:
																	newTools.includes("composer") &&
																	newTools.length === 1
																		? "composer"
																		: "node",
															});
														}}
														className={cn(
															"flex items-center justify-between p-2.5 rounded-lg border text-left transition-all",
															isSelected
																? "border-primary bg-primary/10 text-primary font-semibold shadow-sm"
																: "border-border hover:border-muted-foreground/30 hover:bg-muted/30 text-muted-foreground",
														)}
													>
														<div className="flex flex-col">
															<span className="text-sm leading-tight">
																{label}
															</span>
															<span className="text-[10px] text-muted-foreground font-normal">
																{desc}
															</span>
														</div>
														<div
															className={cn(
																"w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
																isSelected
																	? "border-primary bg-primary text-primary-foreground"
																	: "border-muted-foreground/40",
															)}
														>
															{isSelected && <Check className="w-2.5 h-2.5" />}
														</div>
													</button>
												);
											})}
										</div>
									</div>

									{formData.source_type === "local" && (
										<div className="flex flex-col gap-4 md:col-span-2">
											<div className="flex flex-col gap-1">
												<Label htmlFor="edit-path">
													Chemin absolu (Racine Git)
												</Label>
												<Input
													id="edit-path"
													required={formData.source_type === "local"}
													type="text"
													value={formData.path}
													onChange={(e) =>
														setFormData({ ...formData, path: e.target.value })
													}
													onBlur={handleDetectTool}
													placeholder="Ex: /home/user/projects/api"
												/>
												{detectStatus === "detecting" && (
													<span className="text-xs mt-1 flex items-center gap-1">
														<Loader2 className="w-3 h-3" /> Détection
														automatique...
													</span>
												)}
												{detectStatus === "success" && (
													<span className="text-xs mt-1 flex items-center gap-1">
														<CheckCircle2 className="w-3 h-3" /> Outil détecté :{" "}
														{detectedToolName}
													</span>
												)}
												{detectStatus === "error" && (
													<span className="text-xs mt-1 flex items-center gap-1">
														<XCircle className="w-3 h-3" /> Impossible de
														détecter automatiquement (vérifiez le chemin)
													</span>
												)}
											</div>

											{formData.tools.length <= 1 ? (
												<div className="flex flex-col gap-1">
													<Label htmlFor="edit-audit-path">
														Sous-dossier d'audit (Optionnel)
													</Label>
													<Input
														id="edit-audit-path"
														type="text"
														value={formData.audit_path}
														onChange={(e) => {
															const val = e.target.value;
															const primary = formData.tool;
															setFormData({
																...formData,
																audit_path: val,
																tool_paths: {
																	...formData.tool_paths,
																	[primary]: val,
																},
															});
														}}
														onBlur={handleDetectTool}
														placeholder="Ex: backend/src (vide si racine)"
													/>
												</div>
											) : (
												<div className="flex flex-col gap-2 p-3.5 bg-muted/30 rounded-lg border border-border/50">
													<Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														Sous-dossiers d'audit par outil (Optionnel)
													</Label>
													<p className="text-xs text-muted-foreground">
														Indiquez le sous-dossier de chaque outil s'ils sont
														situés dans des répertoires distincts.
													</p>
													<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
														{formData.tools.map((t) => {
															const toolLabel =
																t === "composer"
																	? "Composer"
																	: t === "yarn"
																		? "Yarn"
																		: t === "bun"
																			? "Bun"
																			: "NPM";
															const currentVal =
																formData.tool_paths?.[t] ??
																(t === formData.tool
																	? formData.audit_path
																	: "");
															return (
																<div key={t} className="flex flex-col gap-1">
																	<Label
																		htmlFor={`edit-path-${t}`}
																		className="text-xs flex items-center gap-1.5"
																	>
																		<span className="font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">
																			{toolLabel}
																		</span>
																		<span>
																			Sous-dossier ({TOOL_DEFAULT_LOCKS[t]})
																		</span>
																	</Label>
																	<Input
																		id={`edit-path-${t}`}
																		type="text"
																		value={currentVal}
																		onChange={(e) => {
																			const val = e.target.value;
																			setFormData((prev) => ({
																				...prev,
																				audit_path:
																					t === prev.tool
																						? val
																						: prev.audit_path,
																				tool_paths: {
																					...prev.tool_paths,
																					[t]: val,
																				},
																			}));
																		}}
																		placeholder={
																			t === "composer"
																				? "ex: backend ou symfony (vide si racine)"
																				: "ex: frontend ou assets (vide si racine)"
																		}
																	/>
																</div>
															);
														})}
													</div>
												</div>
											)}
										</div>
									)}

									{formData.source_type === "remote" && (
										<div className="flex flex-col gap-3 md:col-span-2">
											<div className="flex flex-col gap-1">
												<Label
													htmlFor="edit-remote-url"
													className="flex items-center gap-1.5"
												>
													{formData.tools.length > 1
														? `URL distante du lockfile principal (${formData.tool === "composer" ? "Composer" : formData.tool.toUpperCase()})`
														: "URL distante du fichier lock"}
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger
																type="button"
																className="cursor-help"
															>
																<Info className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors" />
															</TooltipTrigger>
															<TooltipContent
																side="right"
																className="max-w-sm bg-popover text-popover-foreground border shadow-md text-sm p-4 font-normal space-y-3"
															>
																<p>
																	Pour un suivi classique, indiquez la branche :
																	<br />
																	<code className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono text-xs mt-1 inline-block">
																		refs/heads/main
																	</code>
																</p>
																<div className="border-t pt-3">
																	<p className="font-semibold text-primary/90 mb-1">
																		Cibler la vraie Production
																	</p>
																	<p className="text-muted-foreground text-xs leading-relaxed mb-2">
																		Utilisez le préfixe{" "}
																		<code className="bg-primary/10 text-primary px-1 py-0.5 rounded font-mono font-bold">
																			env:
																		</code>{" "}
																		(ex:{" "}
																		<code className="bg-primary/10 text-primary px-1 py-0.5 rounded font-mono font-bold">
																			env:prod
																		</code>
																		).
																	</p>
																	<p className="text-muted-foreground text-xs leading-relaxed">
																		💡 Aegis interrogera l'API GitHub pour
																		trouver le commit exact actuellement déployé
																		avec succès (le badge{" "}
																		<strong>Active</strong> dans l'onglet
																		Deployments), garantissant un audit sur la
																		version réellement en ligne !
																	</p>
																</div>
																<div className="border-t pt-3 mt-3">
																	<p className="font-semibold text-primary/90 mb-1">
																		Téléchargement des fichiers
																	</p>
																	<p className="text-muted-foreground text-xs leading-relaxed">
																		Aegis déduit et télécharge automatiquement
																		le <strong>manifest</strong> (ex:{" "}
																		<code>package.json</code>) en plus du{" "}
																		<strong>fichier lock</strong> pour que
																		l'audit fonctionne dans les conditions
																		réelles du projet.
																	</p>
																</div>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												</Label>
												<div className="flex h-10 w-full rounded-md border border-input bg-background text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden">
													<span className="flex items-center px-3 bg-muted text-muted-foreground border-r shrink-0 whitespace-nowrap text-xs">
														https://raw.githubusercontent.com/
													</span>
													<input
														id="edit-remote-url"
														required={formData.source_type === "remote"}
														type="text"
														className="flex-1 bg-transparent px-3 py-2 placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 min-w-0"
														value={
															formData.remote_url.startsWith(
																"https://raw.githubusercontent.com/",
															)
																? formData.remote_url.replace(
																		"https://raw.githubusercontent.com/",
																		"",
																	)
																: formData.remote_url
														}
														onChange={(e) => {
															let val = e.target.value.trim();
															if (
																val.startsWith(
																	"https://raw.githubusercontent.com/",
																)
															) {
																val = val.replace(
																	"https://raw.githubusercontent.com/",
																	"",
																);
															}
															setFormData({
																...formData,
																remote_url: val
																	? `https://raw.githubusercontent.com/${val}`
																	: "",
															});
														}}
														placeholder="orga/repo/env:prod/composer.lock"
													/>
												</div>
											</div>

											{formData.tools.length > 1 && (
												<div className="flex flex-col gap-2 p-3.5 bg-muted/30 rounded-lg border border-border/50">
													<Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														Fichiers lock des outils secondaires
													</Label>
													<p className="text-xs text-muted-foreground">
														Indiquez le chemin du fichier lock dans le dépôt Git
														(ou une URL complète) pour chaque outil secondaire.
													</p>
													<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
														{formData.tools.slice(1).map((t) => {
															const toolLabel =
																t === "composer"
																	? "Composer"
																	: t === "yarn"
																		? "Yarn"
																		: t === "bun"
																			? "Bun"
																			: "NPM";
															const defaultFilename = TOOL_DEFAULT_LOCKS[t];
															const currentVal = formData.tool_paths?.[t] ?? "";
															return (
																<div key={t} className="flex flex-col gap-1">
																	<Label
																		htmlFor={`edit-remote-${t}`}
																		className="text-xs flex items-center gap-1.5"
																	>
																		<span className="font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">
																			{toolLabel}
																		</span>
																		<span>
																			Fichier lock ({defaultFilename})
																		</span>
																	</Label>
																	<Input
																		id={`edit-remote-${t}`}
																		type="text"
																		value={currentVal}
																		onChange={(e) => {
																			const val = e.target.value;
																			setFormData((prev) => ({
																				...prev,
																				tool_paths: {
																					...prev.tool_paths,
																					[t]: val,
																				},
																			}));
																		}}
																		placeholder={`ex: symfony/${defaultFilename} ou frontend/${defaultFilename}`}
																	/>
																</div>
															);
														})}
													</div>
												</div>
											)}
										</div>
									)}
									<div className="flex flex-col gap-2 md:col-span-2">
										<Label>Tags (Configurations)</Label>
										<div className="flex flex-wrap gap-2">
											{availableTags.map((t) => {
												const isSelected = formData.tags.includes(t.name);
												return (
													<button
														key={t.id}
														type="button"
														onClick={() => {
															if (isSelected) {
																setFormData({
																	...formData,
																	tags: formData.tags.filter(
																		(tag) => tag !== t.name,
																	),
																});
															} else {
																setFormData({
																	...formData,
																	tags: [...formData.tags, t.name],
																});
															}
														}}
														className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${isSelected ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
													>
														<span
															className="w-2 h-2 rounded-full inline-block mr-2"
															style={{
																backgroundColor: `var(--color-${t.color}-500, var(--primary))`,
															}}
														></span>
														{t.name}
													</button>
												);
											})}
											{availableTags.length === 0 && (
												<span className="text-xs text-muted-foreground italic mt-1">
													Aucun tag configuré dans les Paramètres.
												</span>
											)}
										</div>
									</div>
								</div>

								{project && showIgnoreToggle && (
									<div className="flex flex-col gap-2 mt-2 pt-4 border-t">
										<Label className="flex items-center gap-2 cursor-pointer text-destructive dark:text-destructive">
											<Switch
												checked={formData.ignored}
												onCheckedChange={(c) =>
													setFormData({ ...formData, ignored: c })
												}
											/>
											Ignorer lors des audits globaux
										</Label>
										<p className="text-sm text-muted-foreground ml-11">
											Si activé, ce projet ne sera pas audité lors de l'audit
											global ou programmé.
										</p>
									</div>
								)}
							</div>

							<DialogFooter className="p-6 pt-4 border-t shrink-0 flex-col items-stretch gap-2 bg-muted/20 sm:flex-row sm:items-center sm:justify-end">
								{submitError && (
									<p
										role="alert"
										className="mr-auto text-sm font-medium text-destructive"
									>
										{submitError}
									</p>
								)}
								<Button
									type="button"
									variant="secondary"
									onClick={() => onOpenChange(false)}
								>
									Annuler
								</Button>
								{project ? (
									<Button type="submit">Enregistrer</Button>
								) : formData.source_type === "ingest" ? (
									<Button type="submit" className="shadow-lg">
										Créer le projet CI
									</Button>
								) : (
									<>
										<Button
											type="button"
											variant="outline"
											onClick={(e) => {
												if (
													formRef.current &&
													!formRef.current.checkValidity()
												) {
													formRef.current.reportValidity();
													return;
												}
												handleSubmit(e, true);
											}}
											className="text-blue-500"
										>
											Créer et Auditer
										</Button>
										<Button
											type="submit"
											onClick={(e) => handleSubmit(e, false)}
											className="shadow-lg"
										>
											Créer sans auditer
										</Button>
									</>
								)}
							</DialogFooter>
						</>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}
