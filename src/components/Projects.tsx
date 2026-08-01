import React, { useState, useEffect, useRef } from "react";
import {
	Plus,
	Trash2,
	Shield,
	Folder,
	RefreshCw,
	GitBranch,
	CloudDownload,
	ArrowDownToLine,
	AlertTriangle,
	CheckCircle2,
	Loader2,
	XCircle,
	Copy,
	Check,
	Info,
	MoreHorizontal,
	Edit2,
	Clock,
	Play,
	LayoutGrid,
	List,
} from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";

export function Projects({
	onViewTriage,
}: {
	onViewTriage?: (id: number) => void;
}) {
	const [projects, setProjects] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);

	const [availableTags, setAvailableTags] = useState<any[]>([]);
	const [filterTag, setFilterTag] = useState<string | null>(null);

	const [isAdding, setIsAdding] = useState(false);
	const [detectStatus, setDetectStatus] = useState<
		"idle" | "detecting" | "success" | "error"
	>("idle");
	const [detectingId, setDetectingId] = useState<number | null>(null);
	const [projectToDelete, setProjectToDelete] = useState<number | null>(null);
	const [detectedToolName, setDetectedToolName] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [copiedSlug, setCopiedSlug] = useState<number | null>(null);
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [auditState, setAuditState] = useState<Record<number, string>>({});
	const projectsRef = useRef<any[]>([]);

	useEffect(() => {
		projectsRef.current = projects;
	}, [projects]);

	useEffect(() => {
		const evtSource = new EventSource("/api/console");
		evtSource.addEventListener("message", (event) => {
			if (event.data === ": disabled") {
				evtSource.close();
				return;
			}
			try {
				const data = JSON.parse(event.data);
				if (data.phase === "start" && data.project) {
					let msg = "Analyse en cours...";
					if (data.label === "git") msg = "Opération Git...";
					if (data.label === "github") msg = "Recherche correctifs GitHub...";
					if (data.label === "audit")
						msg = `Audit ${data.cmd.split(" ")[0]}...`;

					setAuditState((prev) => {
						const p = projectsRef.current.find(
							(proj: any) => proj.name === data.project,
						);
						if (p) return { ...prev, [p.id]: msg };
						return prev;
					});
				}
			} catch (e) {}
		});
		return () => evtSource.close();
	}, []);

	const formRef = useRef<HTMLFormElement>(null);
	const [formData, setFormData] = useState({
		name: "",
		path: "",
		audit_path: "",
		tool: "npm" as "npm" | "yarn" | "bun" | "composer",
		type: "node" as "node" | "composer",
		tags: [] as string[],
		is_remote: false,
	});

	const copyToClipboard = (text: string) => {
		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard.writeText(text);
		} else {
			const textArea = document.createElement("textarea");
			textArea.value = text;
			textArea.style.position = "fixed";
			textArea.style.left = "-999999px";
			textArea.style.top = "-999999px";
			document.body.appendChild(textArea);
			textArea.focus();
			textArea.select();
			try {
				document.execCommand("copy");
			} catch (error) {
				console.error("Failed to copy", error);
			}
			document.body.removeChild(textArea);
		}
	};

	const formatDate = (dateStr: string) => {
		if (!dateStr) return "Inconnu";
		const parsed = new Date(dateStr.replace(" ", "T") + "Z");
		return isNaN(parsed.getTime())
			? "Inconnu"
			: parsed.toLocaleString("fr-FR", {
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
	};

	const fetchTags = async () => {
		try {
			const res = await fetch("/api/tags");
			setAvailableTags(await res.json());
		} catch (e) {
			console.error(e);
		}
	};

	const fetchProjects = async () => {
		try {
			const res = await fetch("/api/projects");
			const data = await res.json();
			setProjects(data);
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchProjects();
		fetchTags();
	}, []);

	const resetForm = () => {
		setIsAdding(false);
		setEditingId(null);
		setDetectStatus("idle");
		setDetectedToolName(null);
		setFormData({
			name: "",
			path: "",
			audit_path: "",
			type: "node",
			tool: "npm",
			tags: [],
			is_remote: false,
		});
	};

	const handleEdit = (p: any, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		setFormData({
			name: p.name,
			path: p.path,
			audit_path: p.audit_path || "",
			type: p.type,
			tool: p.tool,
			tags: p.tags || [],
			is_remote: !!p.is_remote,
		});
		setEditingId(p.id);
		setIsAdding(true);
	};

	const handleSubmit = async (
		e: React.FormEvent | React.MouseEvent,
		shouldAudit = false,
	) => {
		e.preventDefault();
		try {
			const payload = { ...formData };
			let createdProjectId = null;

			if (editingId) {
				await fetch(`/api/projects/${editingId}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
			} else {
				const res = await fetch("/api/projects", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
				const newProject = await res.json();
				createdProjectId = newProject.id;
			}

			resetForm();
			await fetchProjects();

			if (createdProjectId && !payload.is_remote) {
				// Déclencher un git fetch en arrière-plan pour vérifier les mises à jour (behind/ahead)
				fetch(`/api/projects/${createdProjectId}/git-fetch`, { method: "POST" })
					.then(() => fetchProjects())
					.catch(console.error);
			}

			if (shouldAudit && createdProjectId) {
				setAuditState((prev) => ({
					...prev,
					[createdProjectId]: "Démarrage...",
				}));
				fetch(`/api/projects/${createdProjectId}/audit`, { method: "POST" })
					.then(() => fetchProjects())
					.catch(console.error)
					.finally(() => {
						setAuditState((prev) => {
							const n = { ...prev };
							delete n[createdProjectId];
							return n;
						});
					});
			}
		} catch (err) {
			console.error(err);
		}
	};

	const handleDelete = async (id: number, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		setProjectToDelete(id);
	};

	const confirmDelete = async () => {
		if (projectToDelete === null) return;
		try {
			await fetch(`/api/projects/${projectToDelete}`, { method: "DELETE" });
			setProjectToDelete(null);
			fetchProjects();
		} catch (err) {
			console.error(err);
		}
	};

	const toggleIgnore = async (project: any, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		try {
			await fetch(`/api/projects/${project.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ignored: !project.ignored }),
			});
			fetchProjects();
		} catch (err) {
			console.error(err);
		}
	};

	const handleDetectGit = async (id: number, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		setDetectingId(id);
		try {
			const res = await fetch(`/api/projects/${id}`);
			if (res.ok) {
				const updatedProject = await res.json();
				setProjects((prev) =>
					prev.map((p) => (p.id === id ? updatedProject : p)),
				);
			}
		} catch (err) {
			console.error(err);
		} finally {
			setDetectingId(null);
		}
	};

	const handleFetch = async (id: number, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		try {
			await fetch(`/api/projects/${id}/git-fetch`, { method: "POST" });
			fetchProjects();
		} catch (err) {
			console.error(err);
		}
	};

	const handlePull = async (id: number, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		try {
			await fetch(`/api/projects/${id}/git-pull`, { method: "POST" });
			fetchProjects();
		} catch (err) {
			console.error(err);
		}
	};

	const [isFetchingAll, setIsFetchingAll] = useState(false);
	const [fetchProgress, setFetchProgress] = useState<{
		name: string;
		current: number;
		total: number;
	} | null>(null);

	const handleForceAudit = async (id: number, e: React.MouseEvent) => {
		e.stopPropagation();
		setAuditState((prev) => ({ ...prev, [id]: "Démarrage..." }));
		try {
			await fetch(`/api/projects/${id}/audit?force=true`, { method: "POST" });
			await fetchProjects();
		} catch (err) {
			console.error("Failed to force audit", err);
		} finally {
			setAuditState((prev) => {
				const n = { ...prev };
				delete n[id];
				return n;
			});
		}
	};

	const handleFetchAll = async () => {
		setIsFetchingAll(true);
		try {
			const activeProjects = projects.filter(
				(p) => !p.ignored && p.git?.isRepo,
			);
			let current = 1;
			for (const p of activeProjects) {
				setFetchProgress({
					name: p.name,
					current,
					total: activeProjects.length,
				});
				await fetch(`/api/projects/${p.id}/git-fetch`, { method: "POST" });
				current++;
			}
			await fetchProjects();
		} catch (err) {
			console.error(err);
		} finally {
			setIsFetchingAll(false);
			setFetchProgress(null);
		}
	};

	const handleDetectTool = async () => {
		if (!formData.path) return;
		setDetectStatus("detecting");
		try {
			const res = await fetch("/api/projects/detect", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					path: formData.path,
					audit_path: formData.audit_path,
				}),
			});
			const data = await res.json();
			if (data.tool) {
				setFormData((prev) => ({
					...prev,
					tool: data.tool,
					type: data.tool === "composer" ? "composer" : "node",
				}));
				setDetectedToolName(data.tool);
				setDetectStatus("success");
			} else {
				setDetectStatus("error");
			}
		} catch (err) {
			console.error("Auto-detect failed", err);
			setDetectStatus("error");
		}
	};

	return (
		<div className="flex-1 w-full max-w-7xl px-4 md:px-8 mx-auto mt-8 z-10 animate-in fade-in duration-500">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h2 className="text-3xl font-bold font-heading">Projets</h2>
					<p className="text-muted-foreground mt-1">
						Gérez les dépôts surveillés par Aegis.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<div className="flex gap-1 border border-border/50 rounded-lg p-1 bg-background/50">
						<Button
							variant={viewMode === "grid" ? "default" : "ghost"}
							size="icon"
							className="w-8 h-8 rounded-sm"
							onClick={() => setViewMode("grid")}
							title="Vue Grille"
						>
							<LayoutGrid className="w-4 h-4" />
						</Button>
						<Button
							variant={viewMode === "list" ? "default" : "ghost"}
							size="icon"
							className="w-8 h-8 rounded-sm"
							onClick={() => setViewMode("list")}
							title="Vue Tableau"
						>
							<List className="w-4 h-4" />
						</Button>
					</div>
					<Button
						variant="secondary"
						onClick={handleFetchAll}
						disabled={isFetchingAll || projects.length === 0}
					>
						{isFetchingAll ? (
							<RefreshCw className="w-4 h-4 animate-spin mr-2" />
						) : (
							<CloudDownload className="w-4 h-4 mr-2" />
						)}
						Vérifier les mises à jour Git
					</Button>
					<Button
						onClick={() => {
							if (isAdding) resetForm();
							else {
								resetForm();
								setIsAdding(true);
							}
						}}
						className="shadow-lg shadow-primary/20"
					>
						<Plus className="w-4 h-4 mr-2" />
						{isAdding ? "Annuler" : "Ajouter un Projet"}
					</Button>
				</div>
			</div>

			{isAdding && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
					onClick={resetForm}
				>
					<form
						ref={formRef}
						onSubmit={handleSubmit}
						onClick={(e) => e.stopPropagation()}
						className="glass-panel w-full max-w-2xl p-6 rounded-2xl flex flex-col gap-4 border-primary/30 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto hide-scrollbar"
					>
						<h3 className="text-xl font-bold mb-2 text-primary">
							{editingId ? "Modifier le Projet" : "Nouveau Projet"}
						</h3>

						<div className="flex bg-black/5 dark:bg-black/20 p-1 rounded-lg border border-border/50 mb-2">
							<button
								type="button"
								onClick={() => setFormData({ ...formData, is_remote: false })}
								className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${!formData.is_remote ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-white/5"}`}
							>
								Projet Local
							</button>
							<button
								type="button"
								onClick={() =>
									setFormData({ ...formData, is_remote: true, path: "" })
								}
								className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${formData.is_remote ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-white/5"}`}
							>
								Projet Distant (CI)
							</button>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="flex flex-col gap-1">
								<label className="text-sm font-medium">Nom du projet</label>
								<Input
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
								<label className="text-sm font-medium text-blue-400 flex items-center gap-1">
									<Info className="w-3.5 h-3.5" /> URL d'Ingestion CI
								</label>
								<div className="relative">
									<input
										readOnly
										type="text"
										value={
											formData.name
												? `${window.location.origin}/api/ingest/${formData.name
														.toLowerCase()
														.replace(/[^a-z0-9]+/g, "-")
														.replace(/(^-|-$)/g, "")}`
												: "URL auto-générée"
										}
										className="w-full bg-black/30 border border-border/50 text-muted-foreground rounded-md px-3 py-2 outline-none cursor-not-allowed text-sm font-mono pr-10"
										title="Cette URL sera utilisée par votre CI/CD pour envoyer l'audit."
									/>
									<button
										type="button"
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
										className="absolute inset-y-0 right-0 flex items-center px-3 hover:bg-white/10 rounded-r-md transition-colors"
									>
										{copiedSlug === -1 ? (
											<Check className="w-4 h-4 text-green-400" />
										) : (
											<Copy className="w-4 h-4 text-muted-foreground hover:text-white" />
										)}
									</button>
								</div>
							</div>

							{!formData.is_remote && (
								<div className="flex flex-col gap-1 md:col-span-2">
									<label className="text-sm font-medium">
										Chemin absolu (Racine Git)
									</label>
									<Input
										required={!formData.is_remote}
										type="text"
										value={formData.path}
										onChange={(e) =>
											setFormData({ ...formData, path: e.target.value })
										}
										onBlur={handleDetectTool}
										placeholder="Ex: /home/user/projects/api"
									/>
									{detectStatus === "detecting" && (
										<span className="text-xs text-blue-400 mt-1 flex items-center gap-1">
											<Loader2 className="w-3 h-3 animate-spin" /> Détection
											automatique...
										</span>
									)}
									{detectStatus === "success" && (
										<span className="text-xs text-green-400 mt-1 flex items-center gap-1">
											<CheckCircle2 className="w-3 h-3" /> Outil détecté :{" "}
											{detectedToolName}
										</span>
									)}
									{detectStatus === "error" && (
										<span className="text-xs text-orange-400 mt-1 flex items-center gap-1">
											<XCircle className="w-3 h-3" /> Impossible de détecter
											automatiquement (vérifiez le chemin)
										</span>
									)}
								</div>
							)}

							{!formData.is_remote && (
								<div className="flex flex-col gap-1">
									<label className="text-sm font-medium">
										Sous-dossier d'audit (Optionnel)
									</label>
									<Input
										type="text"
										value={formData.audit_path}
										onChange={(e) =>
											setFormData({ ...formData, audit_path: e.target.value })
										}
										onBlur={handleDetectTool}
										placeholder="Ex: backend/src (vide si racine)"
									/>
								</div>
							)}

							<div className="flex flex-col gap-1">
								<label className="text-sm font-medium">Outil d'audit</label>
								<select
									value={formData.tool}
									onChange={(e) =>
										setFormData({
											...formData,
											tool: e.target.value as any,
											type: e.target.value === "composer" ? "composer" : "node",
										})
									}
									className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors"
								>
									<option value="npm">NPM</option>
									<option value="yarn">Yarn</option>
									<option value="bun">Bun</option>
									<option value="composer">Composer</option>
								</select>
							</div>

							<div className="flex flex-col gap-2 md:col-span-2">
								<label className="text-sm font-medium">
									Tags (Configurations)
								</label>
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
												className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${
													isSelected
														? "border-primary bg-primary/20 text-primary"
														: "border-border bg-background hover:bg-secondary text-muted-foreground"
												}`}
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
						</div>

						<div className="flex justify-end gap-3 mt-4">
							<Button type="button" variant="secondary" onClick={resetForm}>
								Annuler
							</Button>
							{!editingId && !formData.is_remote && (
								<Button
									type="button"
									variant="outline"
									onClick={(e) => {
										if (formRef.current && !formRef.current.checkValidity()) {
											formRef.current.reportValidity();
											return;
										}
										handleSubmit(e, true);
									}}
									className="text-blue-500 border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-500"
								>
									Créer et Auditer
								</Button>
							)}
							{formData.is_remote && !editingId && (
								<Button type="submit" className="shadow-lg shadow-primary/20">
									Créer le projet CI
								</Button>
							)}
							{(!formData.is_remote || editingId) && (
								<Button
									type="submit"
									onClick={(e) => handleSubmit(e, false)}
									className="shadow-lg shadow-primary/20"
								>
									{editingId ? "Enregistrer" : "Créer sans auditer"}
								</Button>
							)}
						</div>
					</form>
				</div>
			)}

			{availableTags.length > 0 && projects.length > 0 && (
				<div className="flex flex-wrap gap-2 mb-6 animate-in fade-in">
					<span className="text-sm font-semibold text-muted-foreground mr-2 self-center">
						Filtre :
					</span>
					<button
						onClick={() => setFilterTag(null)}
						className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border transition-all ${filterTag === null ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-secondary"}`}
					>
						Tous
					</button>
					{availableTags.map((t) => (
						<button
							key={t.id}
							onClick={() => setFilterTag(t.name)}
							className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border transition-all flex items-center gap-1.5 ${filterTag === t.name ? "bg-primary/20 text-primary border-primary" : "bg-background text-muted-foreground border-border hover:bg-secondary"}`}
						>
							<span
								className="w-2 h-2 rounded-full"
								style={{
									backgroundColor: `var(--color-${t.color}-500, var(--primary))`,
								}}
							></span>
							{t.name}
						</button>
					))}
				</div>
			)}

			{loading ? (
				<div className="flex items-center justify-center p-12">
					<RefreshCw className="w-8 h-8 text-primary animate-spin" />
				</div>
			) : projects.length === 0 ? (
				<div className="glass-panel p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4">
					<Folder className="w-12 h-12 text-muted-foreground opacity-50" />
					<div>
						<h3 className="text-xl font-bold">Aucun projet</h3>
						<p className="text-muted-foreground">
							Ajoutez votre premier projet pour commencer l'audit.
						</p>
					</div>
				</div>
			) : viewMode === "grid" ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{(filterTag
						? projects.filter((p) => p.tags && p.tags.includes(filterTag))
						: projects
					).map((p, index) => {
						const hasCritical = p.lastRun?.counts?.critical > 0;
						const hasNoCves =
							p.lastRun &&
							Object.values(p.lastRun.counts).reduce(
								(a: any, b: any) => a + b,
								0,
							) === 0;
						return (
							<div
								key={p.id}
								className={`group glass-panel p-5 rounded-xl flex flex-col gap-3 transition-all duration-500 animate-in slide-in-from-bottom-4 fade-in relative overflow-hidden ${
									p.ignored
										? "opacity-50 grayscale"
										: hasCritical
											? "border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)] bg-red-500/5 cursor-pointer hover:-translate-y-1"
											: "hover:-translate-y-1 hover:border-white/20 hover:shadow-xl hover:shadow-primary/5 cursor-pointer bg-background/40 backdrop-blur-md"
								}`}
								style={{
									animationDelay: `${(index % 20) * 50}ms`,
									animationFillMode: "backwards",
								}}
								onClick={() => {
									if (onViewTriage) onViewTriage(p.id);
								}}
							>
								{auditState[p.id] && (
									<div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-[2px] flex items-center justify-center flex-col gap-2 rounded-xl">
										<Loader2 className="w-6 h-6 animate-spin text-primary" />
										<span className="text-xs font-semibold text-white animate-pulse">
											{auditState[p.id]}
										</span>
									</div>
								)}

								<div className="flex items-start justify-between">
									<div className="flex items-center gap-2 flex-wrap">
										<Shield
											className={`w-5 h-5 ${p.ignored ? "text-muted-foreground" : hasNoCves ? "text-green-500" : hasCritical ? "text-red-500" : "text-primary"}`}
										/>
										<h3
											className="font-bold text-lg leading-tight truncate max-w-[140px]"
											title={p.name}
										>
											{p.name}
										</h3>
										{hasNoCves && (
											<Badge
												variant="outline"
												className="text-[10px] bg-green-500/10 text-green-500 border-green-500/30 flex items-center gap-1"
											>
												<CheckCircle2 className="w-3 h-3" />
												Sain
											</Badge>
										)}
										{hasCritical && (
											<Badge
												variant="outline"
												className="text-[10px] bg-red-500/10 text-red-500 border-red-500/30 flex items-center gap-1"
											>
												<AlertTriangle className="w-3 h-3" />
												Critique
											</Badge>
										)}
									</div>

									<div className="relative group/menu">
										<button
											className="p-1.5 rounded-full hover:bg-white/10 text-muted-foreground transition-colors"
											onClick={(e) => e.stopPropagation()}
										>
											<MoreHorizontal className="w-4 h-4" />
										</button>
										<div className="absolute right-0 top-full mt-1 w-48 bg-background/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-50 flex flex-col p-1">
											<div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border/50 mb-1 flex items-center justify-between">
												<span>Outil d'audit</span>
												<span className="font-bold text-foreground uppercase">
													{p.tool}
												</span>
											</div>
											<button
												title="Copier l'URL d'ingestion CI"
												onClick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													const slugToCopy =
														p.slug ||
														`${p.name
															.toLowerCase()
															.replace(/[^a-z0-9]+/g, "-")
															.replace(/(^-|-$)/g, "")}-${p.id}`;
													copyToClipboard(
														`${window.location.origin}/api/ingest/${slugToCopy}`,
													);
													setCopiedSlug(p.id);
													setTimeout(() => setCopiedSlug(null), 2000);
												}}
												className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-white/10 transition-colors text-left"
											>
												{copiedSlug === p.id ? (
													<Check className="w-3.5 h-3.5 text-green-400" />
												) : (
													<Copy className="w-3.5 h-3.5 text-blue-400" />
												)}
												{copiedSlug === p.id
													? "Copié !"
													: "Copier URL Ingestion"}
											</button>
										</div>
									</div>
								</div>

								{!p.is_remote && (
									<div className="flex items-center gap-1 mt-0">
										<span className="text-xs text-muted-foreground">Local</span>
										<span
											title={`Racine Git : ${p.path}\nSous-dossier : ${p.audit_path || "Racine"}`}
											className="cursor-help inline-flex"
										>
											<Info className="w-3 h-3 text-muted-foreground/50" />
										</span>
									</div>
								)}

								{p.tags && p.tags.length > 0 && (
									<div className="flex flex-wrap gap-1 mt-2">
										{p.tags.map((tag: string, i: number) => (
											<Badge
												key={i}
												variant="secondary"
												className="text-[10px] uppercase tracking-wider text-primary bg-primary/10 border-primary/20"
											>
												{tag}
											</Badge>
										))}
									</div>
								)}

								<div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/70">
									<Clock className="w-3 h-3" />
									{p.lastRun ? (
										<span>Dernier audit : {formatDate(p.lastRun.ran_at)}</span>
									) : (
										<span>Ajouté le {formatDate(p.created_at)}</span>
									)}
								</div>

								{p.git?.isRepo ? (
									<div className="grid grid-cols-2 gap-2 mt-2 p-2 bg-black/5 dark:bg-black/20 rounded-lg border border-border/50 text-xs">
										<div className="flex flex-col gap-1">
											<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
												Branche
											</span>
											<div className="flex items-center gap-1 font-mono text-orange-400">
												<GitBranch className="w-3 h-3" />
												<span
													className="truncate max-w-[80px]"
													title={p.git.branch || "detached"}
												>
													{p.git.branch || "detached"}
												</span>
											</div>
										</div>

										<div className="flex flex-col gap-1 items-end">
											<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
												Actions
											</span>
											<div className="flex items-center gap-1.5">
												{p.git.dirty && (
													<span
														title="Arbre de travail sale (modifications non commitées)"
														className="inline-flex"
													>
														<AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
													</span>
												)}
												{p.git.behind > 0 && (
													<span
														className="text-red-400 font-bold flex items-center gap-0.5"
														title={`${p.git.behind} commits de retard`}
													>
														<ArrowDownToLine className="w-3 h-3" />{" "}
														{p.git.behind}
													</span>
												)}
												<button
													onClick={(e) => handleFetch(p.id, e)}
													className="p-1 hover:bg-white/10 text-muted-foreground hover:text-white rounded transition-colors"
													title="Git Fetch"
												>
													<CloudDownload className="w-3.5 h-3.5" />
												</button>
												{p.git.behind > 0 && (
													<button
														onClick={(e) => handlePull(p.id, e)}
														className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 transition-colors font-bold text-[10px] uppercase"
														title="Git Pull (Fast-Forward uniquement)"
													>
														Pull
													</button>
												)}
											</div>
										</div>
									</div>
								) : (
									<div className="flex items-center justify-between mt-2 p-2 bg-black/5 dark:bg-black/20 rounded-lg border border-border/50 text-xs">
										<span className="text-muted-foreground italic">
											Dépôt Non-Git
										</span>
										<button
											onClick={(e) => handleDetectGit(p.id, e)}
											disabled={detectingId === p.id}
											className="p-1 hover:bg-white/10 text-muted-foreground hover:text-white rounded transition-colors flex items-center gap-1 disabled:opacity-50"
											title="Re-détecter le dépôt Git"
										>
											<RefreshCw
												className={`w-3 h-3 ${detectingId === p.id ? "animate-spin text-primary" : ""}`}
											/>
											{detectingId === p.id ? "Détection..." : "Détecter"}
										</button>
									</div>
								)}

								<div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
									<button
										onClick={(e) => toggleIgnore(p, e)}
										className="text-xs text-muted-foreground hover:text-foreground transition-colors"
									>
										{p.ignored ? "Réactiver" : "Ignorer le projet"}
									</button>
									<div className="flex items-center gap-1">
										{!p.is_remote && (
											<Button
												variant="ghost"
												size="icon"
												onClick={(e) => handleForceAudit(p.id, e)}
												className="w-7 h-7 text-muted-foreground hover:text-green-400 hover:bg-green-400/10"
												title="Forcer un audit (sans déduplication)"
											>
												<Play className="w-3.5 h-3.5" />
											</Button>
										)}
										<Button
											variant="ghost"
											size="icon"
											onClick={(e) => handleEdit(p, e)}
											className="w-7 h-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
											title="Modifier"
										>
											<Edit2 className="w-3.5 h-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onClick={(e) => handleDelete(p.id, e)}
											className="w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
											title="Supprimer"
										>
											<Trash2 className="w-3.5 h-3.5" />
										</Button>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/50 hover:bg-muted/50">
								<TableHead>Projet</TableHead>
								<TableHead>Tags & Santé</TableHead>
								<TableHead>Git Status</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(filterTag
								? projects.filter((p) => p.tags && p.tags.includes(filterTag))
								: projects
							).map((p) => {
								const hasCritical = p.lastRun?.counts?.critical > 0;
								const hasNoCves =
									p.lastRun &&
									Object.values(p.lastRun.counts).reduce(
										(a: any, b: any) => a + b,
										0,
									) === 0;
								return (
									<TableRow
										key={p.id}
										className={`group cursor-pointer ${p.ignored ? "opacity-50 grayscale" : ""}`}
										onClick={() => onViewTriage && onViewTriage(p.id)}
									>
										<TableCell>
											<div className="flex items-center gap-3">
												<Shield
													className={`w-5 h-5 ${p.ignored ? "text-muted-foreground" : hasNoCves ? "text-green-500" : hasCritical ? "text-red-500" : "text-primary"}`}
												/>
												<div className="flex flex-col">
													<span className="font-bold">{p.name}</span>
													<span className="text-[10px] text-muted-foreground uppercase">
														{p.tool} • {p.is_remote ? "Remote (CI)" : "Local"}
													</span>
												</div>
											</div>
										</TableCell>
										<TableCell>
											<div className="flex flex-col gap-2 items-start">
												<div className="flex flex-wrap gap-1">
													{p.tags?.map((tag: string, i: number) => (
														<Badge
															key={i}
															variant="secondary"
															className="text-[10px] uppercase tracking-wider text-primary bg-primary/10 border-primary/20"
														>
															{tag}
														</Badge>
													))}
												</div>
												<div className="flex items-center gap-2">
													{hasNoCves && (
														<Badge
															variant="outline"
															className="text-[10px] bg-green-500/10 text-green-500 border-green-500/30"
														>
															Sain
														</Badge>
													)}
													{hasCritical && (
														<Badge
															variant="outline"
															className="text-[10px] bg-red-500/10 text-red-500 border-red-500/30"
														>
															Critique
														</Badge>
													)}
												</div>
											</div>
										</TableCell>
										<TableCell>
											{p.git?.isRepo ? (
												<div className="flex items-center gap-3 text-xs">
													<div className="flex items-center gap-1 font-mono text-orange-400">
														<GitBranch className="w-3 h-3" />
														<span
															className="truncate max-w-[80px]"
															title={p.git.branch || "detached"}
														>
															{p.git.branch || "detached"}
														</span>
													</div>
													{p.git.dirty && (
														<span
															title="Arbre de travail sale"
															className="inline-flex"
														>
															<AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
														</span>
													)}
													{p.git.behind > 0 && (
														<span
															className="text-red-400 font-bold flex items-center gap-0.5"
															title={`${p.git.behind} commits de retard`}
														>
															<ArrowDownToLine className="w-3 h-3" />{" "}
															{p.git.behind}
														</span>
													)}
												</div>
											) : (
												<div className="flex items-center gap-2">
													<span className="text-xs text-muted-foreground italic">
														Non-Git
													</span>
													<button
														onClick={(e) => handleDetectGit(p.id, e)}
														disabled={detectingId === p.id}
														className="p-1 text-muted-foreground hover:text-white transition-colors rounded hover:bg-white/10 disabled:opacity-50"
														title="Re-détecter le dépôt Git"
													>
														<RefreshCw
															className={`w-3 h-3 ${detectingId === p.id ? "animate-spin text-primary" : ""}`}
														/>
													</button>
												</div>
											)}
										</TableCell>
										<TableCell
											className="text-right"
											onClick={(e) => e.stopPropagation()}
										>
											<div className="flex items-center justify-end gap-1">
												{p.git?.isRepo && (
													<>
														<Button
															variant="ghost"
															size="icon"
															onClick={(e) => handleFetch(p.id, e)}
															className="w-7 h-7 text-muted-foreground hover:text-foreground"
															title="Git Fetch"
														>
															<CloudDownload className="w-3.5 h-3.5" />
														</Button>
														{p.git.behind > 0 && (
															<Button
																variant="outline"
																size="sm"
																onClick={(e) => handlePull(p.id, e)}
																className="h-6 px-2 text-[10px] uppercase text-blue-400 border-blue-500/30 hover:bg-blue-500/10 mx-1"
															>
																Pull
															</Button>
														)}
													</>
												)}
												{!p.is_remote && (
													<Button
														variant="ghost"
														size="icon"
														onClick={(e) => handleForceAudit(p.id, e)}
														className="w-7 h-7 text-muted-foreground hover:text-green-400 hover:bg-green-400/10"
														title="Forcer un audit"
													>
														<Play className="w-3.5 h-3.5" />
													</Button>
												)}
												<Button
													variant="ghost"
													size="icon"
													onClick={(e) => handleEdit(p, e)}
													className="w-7 h-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
												>
													<Edit2 className="w-3.5 h-3.5" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													onClick={(e) => handleDelete(p.id, e)}
													className="w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
												>
													<Trash2 className="w-3.5 h-3.5" />
												</Button>
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}

			{isFetchingAll && (
				<div className="fixed inset-0 z-[100] flex items-center justify-center flex-col gap-6 bg-background/60 backdrop-blur-md animate-in fade-in duration-300">
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-cyan-500/20 blur-[100px] rounded-full pointer-events-none"></div>

					<div className="relative flex items-center justify-center w-28 h-28 rounded-full bg-cyan-500/10 neon-glow shadow-2xl shadow-cyan-500/20 z-10">
						<div className="absolute inset-0 border-[4px] border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
						<CloudDownload className="w-12 h-12 text-cyan-400" />
					</div>

					<div className="z-10 flex flex-col items-center gap-2">
						<h1 className="text-3xl font-bold font-heading text-gradient">
							Mise à jour Git
						</h1>
						<div className="flex items-center gap-3 text-muted-foreground text-sm font-medium">
							<Loader2 className="w-4 h-4 animate-spin text-secondary" />
							{fetchProgress
								? `Synchronisation du projet ${fetchProgress.name} .... ${fetchProgress.current}/${fetchProgress.total}`
								: "Démarrage de la vérification globale..."}
						</div>
					</div>
				</div>
			)}

			<ConfirmDialog
				isOpen={projectToDelete !== null}
				title="Supprimer le projet"
				message="Êtes-vous sûr de vouloir supprimer ce projet ? Cette action est irréversible et supprimera tout l'historique d'audit."
				confirmText="Supprimer"
				onConfirm={confirmDelete}
				onCancel={() => setProjectToDelete(null)}
			/>
		</div>
	);
}
