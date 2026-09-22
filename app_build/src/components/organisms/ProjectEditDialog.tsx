import { Check, CheckCircle2, Copy, Loader2, XCircle, HardDrive, Globe, UploadCloud } from "lucide-react";
import React, { useEffect, useState, useRef } from "react";
import type { ProjectTool } from "@/db/projects";
import type { Tag } from "@/db/tags";
import type { ProjectListItem } from "@/routes/projects";
import { apiErrorMessage, fetchJson, fetchVoid } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function ProjectEditDialog({
	project,
	isOpen,
	onOpenChange,
	onSaved,
	showIgnoreToggle = true,
}: {
	project: ProjectListItem;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
	showIgnoreToggle?: boolean;
}) {
	const formRef = useRef<HTMLFormElement>(null);
	const [formData, setFormData] = useState({
		name: "",
		path: "",
		audit_path: "",
		tool: "npm" as ProjectTool,
		type: "node",
		tags: [] as string[],
		ignored: false,
		is_remote: false,
		source_type: "local" as "local" | "ingest" | "remote",
		remote_url: "",
		remote_token: "",
	});
	const [availableTags, setAvailableTags] = useState<Tag[]>([]);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [detectStatus, setDetectStatus] = useState<"idle" | "detecting" | "success" | "error">("idle");
	const [detectedToolName, setDetectedToolName] = useState<string>("");
	const [copiedSlug, setCopiedSlug] = useState<number | null>(null);

	useEffect(() => {
		if (isOpen) {
			setFormData({
				name: project.name,
				path: project.path,
				audit_path: project.audit_path || "",
				tool: project.tool,
				type: project.type,
				tags: project.tags || [],
				ignored: !!project.ignored,
				is_remote: !!project.is_remote,
				source_type: (project.source_type ||
					(project.is_remote ? "ingest" : "local")) as "local" | "ingest" | "remote",
				remote_url: project.remote_url || "",
				remote_token: project.remote_token || "",
			});
			setSubmitError(null);
			setDetectStatus("idle");
			fetchJson<Tag[]>("/api/tags")
				.then(setAvailableTags)
				.catch(console.error);
		}
	}, [isOpen, project]);

	const handleDetectTool = async () => {
		if (!formData.path) return;
		setDetectStatus("detecting");
		try {
			const data = await fetchJson<{ tool: ProjectTool | null }>("/api/projects/detect", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					path: formData.path,
					audit_path: formData.audit_path,
				}),
			});
			const outil = data.tool;
			if (outil) {
				setFormData((prev) => ({
					...prev,
					tool: outil,
					type: outil === "composer" ? "composer" : "node",
				}));
				setDetectedToolName(outil);
				setDetectStatus("success");
			} else {
				setDetectStatus("error");
			}
		} catch (e) {
			setDetectStatus("error");
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitError(null);
		try {
			await fetchVoid(`/api/projects/${project.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(formData),
			});
			onSaved();
			onOpenChange(false);
		} catch (err) {
			setSubmitError(apiErrorMessage(err));
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
				<form ref={formRef} onSubmit={handleSubmit} className="flex flex-col h-full">
					<DialogHeader className="p-6 pb-4 border-b shrink-0">
						<DialogTitle className="text-xl font-bold text-primary">
							{showIgnoreToggle ? "Configuration du projet" : "Modifier la configuration"}
						</DialogTitle>
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
									onChange={(e) => setFormData({ ...formData, name: e.target.value })}
									placeholder="Ex: Mon API Node"
								/>
							</div>

							<div className="flex flex-col gap-1">
								<Label htmlFor="edit-source-type">Type de projet</Label>
								<div className="flex gap-2">
									<Button
										type="button"
										variant={formData.source_type === "local" ? "default" : "outline"}
										onClick={() => {
											setFormData({
												...formData,
												source_type: "local",
												is_remote: false,
											});
										}}
										title="Local"
										className="w-full flex justify-center items-center px-0"
									>
										<HardDrive className="w-5 h-5" />
									</Button>
									<Button
										type="button"
										variant={formData.source_type === "remote" ? "default" : "outline"}
										onClick={() => {
											setFormData({
												...formData,
												source_type: "remote",
												is_remote: true,
												path: "",
											});
										}}
										title="Distant (Direct)"
										className="w-full flex justify-center items-center px-0"
									>
										<Globe className="w-5 h-5" />
									</Button>
									<Button
										type="button"
										variant={formData.source_type === "ingest" ? "default" : "outline"}
										onClick={() => {
											setFormData({
												...formData,
												source_type: "ingest",
												is_remote: true,
												path: "",
											});
										}}
										title="Ingestion CI"
										className="w-full flex justify-center items-center px-0"
									>
										<UploadCloud className="w-5 h-5" />
									</Button>
								</div>
							</div>

							{formData.source_type === "ingest" && (
								<div className="flex flex-col gap-1 md:col-span-2 bg-muted/30 p-4 rounded-lg border border-border/50">
									<Label>URL d'ingestion (API)</Label>
									<p className="text-xs text-muted-foreground mb-2">
										Envoyez le résultat de votre scan npm audit, yarn audit ou trivy sur cette URL.
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
													copyToClipboard(`${window.location.origin}/api/ingest/${slug}`);
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

							{formData.source_type === "local" && (
								<div className="flex flex-col gap-1 md:col-span-2">
									<Label htmlFor="edit-path">Chemin absolu (Racine Git)</Label>
									<Input
										id="edit-path"
										required={!formData.is_remote}
										type="text"
										value={formData.path}
										onChange={(e) => setFormData({ ...formData, path: e.target.value })}
										onBlur={handleDetectTool}
										placeholder="Ex: /home/user/projects/api"
									/>
									{detectStatus === "detecting" && (
										<span className="text-xs mt-1 flex items-center gap-1">
											<Loader2 className="w-3 h-3" /> Détection automatique...
										</span>
									)}
									{detectStatus === "success" && (
										<span className="text-xs mt-1 flex items-center gap-1">
											<CheckCircle2 className="w-3 h-3" /> Outil détecté : {detectedToolName}
										</span>
									)}
									{detectStatus === "error" && (
										<span className="text-xs mt-1 flex items-center gap-1">
											<XCircle className="w-3 h-3" /> Impossible de détecter automatiquement (vérifiez le chemin)
										</span>
									)}
								</div>
							)}

							{formData.source_type === "local" && (
								<div className="flex flex-col gap-1">
									<Label htmlFor="edit-audit-path">Sous-dossier d'audit (Optionnel)</Label>
									<Input
										id="edit-audit-path"
										type="text"
										value={formData.audit_path}
										onChange={(e) => setFormData({ ...formData, audit_path: e.target.value })}
										onBlur={handleDetectTool}
										placeholder="Ex: backend/src (vide si racine)"
									/>
								</div>
							)}

							{formData.source_type === "remote" && (
								<div className="flex flex-col gap-1 md:col-span-2">
									<Label htmlFor="edit-remote-url">URL distante du fichier lock</Label>
									<Input
										id="edit-remote-url"
										required={formData.source_type === "remote"}
										type="text"
										value={formData.remote_url}
										onChange={(e) => setFormData({ ...formData, remote_url: e.target.value })}
										placeholder="Ex: https://raw.githubusercontent.com/.../package-lock.json"
									/>
								</div>
							)}

							<div className="flex flex-col gap-1">
								<Label htmlFor="edit-tool">Outil d'audit</Label>
								<Select
									value={formData.tool}
									onValueChange={(val) =>
										setFormData({
											...formData,
											tool: val as ProjectTool,
											type: val === "composer" ? "composer" : "node",
										})
									}
								>
									<SelectTrigger id="edit-tool" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="npm">NPM</SelectItem>
										<SelectItem value="yarn">Yarn</SelectItem>
										<SelectItem value="bun">Bun</SelectItem>
										<SelectItem value="composer">Composer</SelectItem>
									</SelectContent>
								</Select>
							</div>

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
															tags: formData.tags.filter((tag) => tag !== t.name),
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

						{showIgnoreToggle && (
							<div className="flex flex-col gap-2 mt-2 pt-4 border-t">
								<Label className="flex items-center gap-2 cursor-pointer text-red-600 dark:text-red-400">
									<Switch
										checked={formData.ignored}
										onCheckedChange={(c) => setFormData({ ...formData, ignored: c })}
									/>
									Ignorer lors des audits globaux
								</Label>
								<p className="text-sm text-muted-foreground ml-11">
									Si activé, ce projet ne sera pas audité lors de l'audit global ou programmé.
								</p>
							</div>
						)}
					</div>

					<DialogFooter className="p-6 pt-4 border-t shrink-0 flex-col items-stretch gap-2 bg-muted/20 sm:flex-row sm:items-center sm:justify-end">
						{submitError && (
							<p role="alert" className="mr-auto text-sm font-medium text-red-500">
								{submitError}
							</p>
						)}
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Annuler
						</Button>
						<Button type="submit">Enregistrer</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
