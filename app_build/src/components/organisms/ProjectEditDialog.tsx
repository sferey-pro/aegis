import React, { useEffect, useState } from "react";
import { apiErrorMessage, fetchJson, fetchVoid } from "@/lib/api";
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
import type { ProjectListItem } from "@/routes/projects";
import type { Tag } from "@/db/tags";

interface ProjectEditDialogProps {
	project: ProjectListItem;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}

export function ProjectEditDialog({
	project,
	isOpen,
	onOpenChange,
	onSaved,
}: ProjectEditDialogProps) {
	const [formData, setFormData] = useState({
		name: "",
		path: "",
		audit_path: "",
		tool: "npm",
		type: "node",
		tags: [] as string[],
		ignored: false,
		is_remote: false,
		source_type: "local" as "local" | "ingest" | "remote",
		remote_url: "",
	});
	const [availableTags, setAvailableTags] = useState<Tag[]>([]);
	const [submitError, setSubmitError] = useState<string | null>(null);

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
			});
			setSubmitError(null);
			fetchJson<Tag[]>("/api/tags")
				.then(setAvailableTags)
				.catch(console.error);
		}
	}, [isOpen, project]);

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
			<DialogContent className="sm:max-w-xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
				<form onSubmit={handleSubmit} className="flex flex-col h-full">
					<DialogHeader className="p-6 pb-4 border-b shrink-0">
						<DialogTitle className="text-xl font-bold text-primary">
							Configuration du projet
						</DialogTitle>
					</DialogHeader>

					<div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-6 hide-scrollbar">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="flex flex-col gap-1">
								<Label htmlFor="edit-name">Nom du projet</Label>
								<Input
									id="edit-name"
									required
									value={formData.name}
									onChange={(e) =>
										setFormData({ ...formData, name: e.target.value })
									}
								/>
							</div>

							<div className="flex flex-col gap-1">
								<Label htmlFor="edit-tags">Tags</Label>
								<div className="flex flex-wrap gap-2 pt-2">
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
												className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${isSelected ? "border-primary text-primary" : "border-border bg-background text-muted-foreground"}`}
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
										<span className="text-xs text-muted-foreground italic">
											Aucun tag configuré dans les Paramètres.
										</span>
									)}
								</div>
							</div>

							<div className="flex flex-col gap-1 md:col-span-2">
								<Label htmlFor="edit-source-type">Source du projet</Label>
								<Select
									value={formData.source_type}
									onValueChange={(val) =>
										setFormData({
											...formData,
											source_type: val as "local" | "ingest" | "remote",
											is_remote: val === "remote" || val === "ingest",
										})
									}
								>
									<SelectTrigger id="edit-source-type">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="local">Local (Dossier sur le serveur)</SelectItem>
										<SelectItem value="remote">Distant (Fichier distant brut)</SelectItem>
										<SelectItem value="ingest">Ingestion (Dépôt Git via pipeline)</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{formData.source_type === "local" && (
								<div className="flex flex-col gap-1 md:col-span-2">
									<Label htmlFor="edit-path">
										Chemin absolu (répertoire racine)
									</Label>
									<Input
										id="edit-path"
										required
										value={formData.path}
										onChange={(e) =>
											setFormData({ ...formData, path: e.target.value })
										}
									/>
								</div>
							)}

							{formData.source_type === "remote" && (
								<div className="flex flex-col gap-1 md:col-span-2">
									<Label htmlFor="edit-remote-url">
										URL distante du fichier lock
									</Label>
									<Input
										id="edit-remote-url"
										required
										value={formData.remote_url}
										onChange={(e) =>
											setFormData({ ...formData, remote_url: e.target.value })
										}
									/>
								</div>
							)}

							{(formData.source_type === "local" || formData.source_type === "remote") && (
								<div className="flex flex-col gap-1 md:col-span-2">
									<Label htmlFor="edit-audit-path">
										Sous-répertoire (Monorepo)
									</Label>
									<Input
										id="edit-audit-path"
										value={formData.audit_path}
										onChange={(e) =>
											setFormData({ ...formData, audit_path: e.target.value })
										}
										placeholder="Optionnel (ex: packages/frontend)"
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
											tool: val as "npm" | "yarn" | "bun" | "composer",
											type: val === "composer" ? "composer" : "node",
										})
									}
								>
									<SelectTrigger id="edit-tool">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="npm">npm</SelectItem>
										<SelectItem value="yarn">yarn</SelectItem>
										<SelectItem value="bun">bun</SelectItem>
										<SelectItem value="composer">composer</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>



						<div className="flex flex-col gap-2 mt-2 pt-4 border-t">
							<Label className="flex items-center gap-2 cursor-pointer text-red-600 dark:text-red-400">
								<Switch
									checked={formData.ignored}
									onCheckedChange={(c) =>
										setFormData({
											...formData,
											ignored: c,
										})
									}
								/>
								Ignorer lors des audits globaux
							</Label>
							<p className="text-sm text-muted-foreground ml-11">
								Si activé, ce projet ne sera pas audité lors de l'audit global ou programmé.
							</p>
						</div>
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
