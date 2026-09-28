import {
	AlertTriangle,
	ArrowDownToLine,
	Check,
	CheckCircle2,
	CloudDownload,
	Copy,
	Folder,
	Globe,
	HardDrive,
	Info,
	LayoutGrid,
	List,
	Loader2,
	Plus,
	RefreshCw,
	UploadCloud,
	XCircle,
} from "lucide-react";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Project, ProjectTool } from "@/db/projects";
import type { Tag } from "@/db/tags";
import { apiErrorMessage, fetchJson, fetchVoid } from "@/lib/api";
import { useGlobalGitSync } from "@/lib/useGlobalGitSync";
import type { ProjectGitState, ProjectListItem } from "@/routes/projects";
import { AuditProgressBar } from "../components/molecules/AuditProgressBar";
import { ShieldLoader } from "../components/molecules/ShieldLoader";
import { ConfirmDialog } from "../components/organisms/ConfirmDialog";
import { ProjectEditDialog } from "../components/organisms/ProjectEditDialog";
import { ProjectCard } from "../components/organisms/project-cards";
import { ProjectRow } from "../components/organisms/project-rows";
import { Button } from "../components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table";

export const Projects = React.memo(function Projects() {
	const navigate = useNavigate();
	const [projects, setProjects] = useState<ProjectListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [hasGithubToken, setHasGithubToken] = useState(false);

	const [availableTags, setAvailableTags] = useState<Tag[]>([]);

	/**
	 * Couleur par nom de tag. Un projet ne stocke que les noms : sans cette table
	 * les badges rendus depuis un projet perdaient leur pastille.
	 */
	const tagColors = useMemo(
		() => Object.fromEntries(availableTags.map((t) => [t.name, t.color])),
		[availableTags],
	);
	const [searchParams, setSearchParams] = useSearchParams();

	/**
	 * Filtre par tag, porté par l'**URL** (`?tag=`).
	 *
	 * Il vivait dans l'état local de ce composant, auquel `App` n'a pas accès :
	 * filtrer sur « Prod » pour n'auditer que trois projets en auditait quand même
	 * quinze, alors que §2 fixe le périmètre de « Tout auditer » aux projets
	 * **visibles** (défaut N8). Le porter par l'URL le rend lisible par
	 * l'orchestrateur, partageable, et survivant à un rechargement — c'est aussi
	 * un premier pas sur N24.
	 *
	 * `replace` : filtrer n'est pas une navigation, et empiler une entrée
	 * d'historique par clic rendrait le bouton « retour » inutilisable.
	 */
	const filterTag = searchParams.get("tag");
	const setFilterTag = useCallback(
		(nom: string | null) => {
			const params = new URLSearchParams(searchParams);
			if (nom) params.set("tag", nom);
			else params.delete("tag");
			setSearchParams(params, { replace: true });
		},
		[searchParams, setSearchParams],
	);

	/**
	 * Ce que l'écran montre : les projets, filtrés par le tag courant.
	 *
	 * Une seule définition, lue par les deux vues **et** par la synchronisation
	 * groupée. Le filtre était recalculé en trois endroits, et le lot Git en avait
	 * un quatrième, différent — d'où un bouton qui agissait sur autre chose que ce
	 * qui était affiché.
	 */
	const visibleProjects = useMemo(
		() =>
			filterTag
				? projects.filter((p) => p.tags?.includes(filterTag))
				: projects,
		[projects, filterTag],
	);

	const [isAdding, setIsAdding] = useState(false);
	const [isFormVisible, setIsFormVisible] = useState(false);
	/**
	 * Erreur renvoyée par le serveur au dernier envoi du formulaire.
	 *
	 * La validation HTML5 ne remplace pas celle du serveur, et ne la recouvre même
	 * pas : un nom fait d'espaces satisfait `required` — il n'est pas vide — mais
	 * le schéma le trime et refuse en 400 « Nom requis ». Même chose pour le
	 * chemin. Le refus partait dans `console.error` : le formulaire ne se fermait
	 * pas, n'affichait rien, et paraissait simplement ne pas répondre.
	 */
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [detectStatus, setDetectStatus] = useState<
		"idle" | "detecting" | "success" | "error"
	>("idle");
	const [detectingId, setDetectingId] = useState<number | null>(null);
	const [projectToDelete, setProjectToDelete] = useState<number | null>(null);
	const [detectedToolName, setDetectedToolName] = useState<string | null>(null);
	const [projectToEdit, setProjectToEdit] = useState<ProjectListItem | null>(
		null,
	);
	const [copiedSlug, setCopiedSlug] = useState<number | null>(null);
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [auditState, setAuditState] = useState<Record<number, string>>({});
	const projectsRef = useRef<ProjectListItem[]>([]);

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
						msg = `Audit ${data.cmd?.split(" ")[0] || ""}...`;

					setAuditState((prev) => {
						const p = projectsRef.current.find(
							(proj) => proj.name === data.project,
						);
						if (p) return { ...prev, [p.id]: msg };
						return prev;
					});
				} else if (data.phase === "end" && data.project) {
					setAuditState((prev) => {
						const p = projectsRef.current.find(
							(proj) => proj.name === data.project,
						);
						if (p) {
							const next = { ...prev };
							delete next[p.id];
							return next;
						}
						return prev;
					});
				}
			} catch (_e) {}
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
		source_type: "local" as "local" | "ingest" | "remote",
		remote_url: "",
		remote_token: "",
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
		const parsed = new Date(`${dateStr.replace(" ", "T")}Z`);
		return Number.isNaN(parsed.getTime())
			? "Inconnu"
			: parsed.toLocaleString("fr-FR", {
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
	};

	const fetchTags = useCallback(async () => {
		try {
			setAvailableTags(await fetchJson<Tag[]>("/api/tags"));
		} catch (e) {
			console.error(e);
		}
	}, []);

	const fetchProjects = useCallback(async () => {
		try {
			const [data, settingsData] = await Promise.all([
				fetchJson<ProjectListItem[]>("/api/projects"),
				fetchJson<Record<string, string | boolean>>("/api/settings").catch(
					() => ({}) as Record<string, string | boolean>,
				),
			]);
			setProjects(data);
			if (
				settingsData.GITHUB_TOKEN_CONFIGURED === true ||
				settingsData.GITHUB_TOKEN_CONFIGURED === "true"
			) {
				setHasGithubToken(true);
			} else {
				setHasGithubToken(false);
			}
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchProjects();
		fetchTags();
	}, [fetchProjects, fetchTags]);

	const resetForm = () => {
		setIsAdding(false);
		setIsFormVisible(false);
		// Sans cela, l'erreur du précédent envoi réapparaîtrait à la réouverture du
		// formulaire, sur un contenu qui n'a plus rien à voir.
		setSubmitError(null);
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
			source_type: "local",
			remote_url: "",
			remote_token: "",
		});
	};

	const handleEdit = (p: ProjectListItem, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		setProjectToEdit(p);
	};

	const handleSubmit = async (
		e: React.FormEvent | React.MouseEvent,
		shouldAudit = false,
	) => {
		e.preventDefault();
		setSubmitError(null);
		try {
			const payload = { ...formData };

			const nouveau = await fetchJson<Project>("/api/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			const createdProjectId = nouveau.id;

			resetForm();
			await fetchProjects();

			if (createdProjectId && !payload.is_remote) {
				// Déclencher un git fetch en arrière-plan pour vérifier les mises à jour (behind/ahead)
				fetchVoid(`/api/projects/${createdProjectId}/git-fetch`, {
					method: "POST",
				})
					.then(() => fetchProjects())
					.catch(console.error);
			}

			if (shouldAudit && createdProjectId) {
				setAuditState((prev) => ({
					...prev,
					[createdProjectId]: "Démarrage...",
				}));
				fetchVoid(`/api/projects/${createdProjectId}/audit`, { method: "POST" })
					.then(() => fetchProjects())
					.catch(console.error)
					.finally(() => {
						setAuditState((prev) => {
							const newState = { ...prev };
							delete newState[createdProjectId];
							return newState;
						});
					});
			}
		} catch (err) {
			setSubmitError(apiErrorMessage(err));
		}
	};

	const handleDelete = async (id: number, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		setProjectToDelete(id);
	};

	const confirmDelete = async () => {
		if (projectToDelete === null) return;
		try {
			await fetchVoid(`/api/projects/${projectToDelete}`, { method: "DELETE" });
			setProjectToDelete(null);
			fetchProjects();
		} catch (err) {
			console.error(err);
		}
	};

	const toggleIgnore = async (
		project: ProjectListItem,
		e?: React.MouseEvent,
	) => {
		if (e) e.stopPropagation();
		try {
			await fetchVoid(`/api/projects/${project.id}/ignore`, {
				method: "PATCH",
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
			const rafraichi = await fetchJson<ProjectListItem>(`/api/projects/${id}`);
			setProjects((prev) => prev.map((p) => (p.id === id ? rafraichi : p)));
		} catch (err) {
			console.error(err);
		} finally {
			setDetectingId(null);
		}
	};

	/**
	 * Fusionne l'état git rendu par une action, sans recharger la liste.
	 *
	 * La liste ne porte plus l'état git (elle ne le calcule plus au chargement) :
	 * la recharger après un `fetch` effacerait donc ce que l'action vient
	 * d'apprendre. Or chaque action le renvoie déjà (§5).
	 */
	const mergeGit = useCallback((id: number, git: ProjectGitState) => {
		setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, git } : p)));
	}, []);

	const handleFetch = async (id: number, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		try {
			const res = await fetchJson<{ git: ProjectGitState }>(
				`/api/projects/${id}/git-fetch`,
				{ method: "POST" },
			);
			mergeGit(id, res.git);
		} catch (err) {
			console.error(err);
		}
	};

	const handlePull = async (id: number, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		try {
			const res = await fetchJson<{ git: ProjectGitState }>(
				`/api/projects/${id}/git-pull`,
				{ method: "POST" },
			);
			mergeGit(id, res.git);
		} catch (err) {
			console.error(err);
		}
	};

	/**
	 * Synchronisation Git groupée : même pool que « Tout auditer », mais **un
	 * dépôt à la fois** (§5), annulable, échecs rendus visibles.
	 */
	const {
		running: isFetchingAll,
		progress: fetchProgress,
		start: startGitSync,
		cancel: cancelGitSync,
	} = useGlobalGitSync();

	/**
	 * Dépôts que la dernière synchronisation n'a pas pu joindre.
	 *
	 * L'ancienne boucle envoyait ses échecs dans `console.error` : un dépôt sans
	 * amont, une authentification refusée ou un hôte injoignable passaient
	 * inaperçus, et l'écran affichait le même « à jour » que pour un succès.
	 */
	const [gitSyncFailures, setGitSyncFailures] = useState<
		{ name: string; message: string }[]
	>([]);

	const handleForceAudit = async (id: number, e: React.MouseEvent) => {
		e.stopPropagation();
		setAuditState((prev) => ({ ...prev, [id]: "Démarrage..." }));
		try {
			await fetchVoid(`/api/projects/${id}/audit?force=true`, {
				method: "POST",
			});
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
		// Périmètre = les projets **visibles** au sens de §2, comme pour l'audit :
		// non ignorés, filtrés par le tag porté par l'URL, et — propre à git — un
		// dépôt. Le handler ignorait le filtre par tag et synchronisait quinze
		// dépôts quand l'écran n'en montrait trois : la même erreur de périmètre
		// que N8 côté audit.
		// `git === null` = état non chargé, pas « pas un dépôt » : au premier
		// affichage on ne sait pas encore lesquels sont des dépôts, donc on tente.
		// La réponse porte l'état git, si bien qu'un dossier non-git est écarté des
		// lots suivants sans avoir rien coûté de plus.
		const cibles = visibleProjects.filter(
			(p) =>
				!p.ignored && p.source_type !== "ingest" && p.git?.isRepo !== false,
		);
		setGitSyncFailures([]);
		const resultats = await startGitSync(
			cibles.map((p) => ({ id: p.id, name: p.name })),
			// Chaque carte se met à jour dès que **sa** réponse arrive : l'état git
			// vient de la réponse, pas d'un rechargement de la liste — celle-ci ne le
			// calcule plus, et la recharger effacerait ce que le lot vient
			// d'apprendre. Attendre la fin du lot laissait l'écran figé une vingtaine
			// de secondes sur dix-sept dépôts, alors que la première réponse était
			// déjà connue au bout d'une seconde.
			(sortie) => {
				const git = sortie.value?.git;
				if (!git) return;
				setProjects((prev) =>
					prev.map((p) =>
						p.id === sortie.project.id
							? { ...p, git: { ...git, checkedAt: new Date().toISOString() } }
							: p,
					),
				);
			},
		);

		setGitSyncFailures(
			resultats
				.filter((r) => r.error)
				.map((r) => ({ name: r.project.name, message: r.error ?? "" })),
		);
	};

	const handleDetectTool = async () => {
		if (!formData.path) return;
		setDetectStatus("detecting");
		try {
			const data = await fetchJson<{ tool: ProjectTool | null }>(
				"/api/projects/detect",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						path: formData.path,
						audit_path: formData.audit_path,
					}),
				},
			);
			// Capturé avant la fermeture : le rétrécissement de `data.tool` ne
			// traverse pas la fonction passée à `setFormData`. C'était invisible
			// tant que `res.json()` renvoyait `any`.
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
		} catch (err) {
			console.error("Auto-detect failed", err);
			setDetectStatus("error");
		}
	};

	return (
		<div className="flex-1 w-full max-w-7xl px-4 md:px-8 mx-auto mt-8 z-10">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h2 className="text-3xl font-bold font-heading">Projets</h2>
					<p className="text-muted-foreground mt-1">
						Gérez les dépôts surveillés par Aegis.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<div className="flex gap-1 border rounded-lg p-1">
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
							<RefreshCw className="w-4 h-4 mr-2" />
						) : (
							<CloudDownload className="w-4 h-4 mr-2" />
						)}
						Synchroniser (Git / Distant)
					</Button>
					<Button
						onClick={() => {
							resetForm();
							setIsAdding(true);
						}}
						className="shadow-lg"
					>
						<Plus className="w-4 h-4 mr-2" />
						Ajouter un Projet
					</Button>
				</div>
			</div>

			<Dialog
				open={isAdding}
				onOpenChange={(open: boolean) => {
					if (!open) resetForm();
				}}
			>
				<DialogContent className="sm:max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
					<form
						ref={formRef}
						onSubmit={handleSubmit}
						className="flex flex-col h-full"
					>
						{!isFormVisible ? (
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
											setFormData({
												...formData,
												source_type: "local",
												is_remote: false,
											});
											setIsFormVisible(true);
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
										disabled={!hasGithubToken}
										title={
											!hasGithubToken
												? "Un jeton GitHub est requis dans les paramètres pour les projets distants"
												: ""
										}
										onClick={() => {
											setFormData({
												...formData,
												source_type: "remote",
												is_remote: false,
												path: "",
											});
											setIsFormVisible(true);
										}}
										className="w-40 h-40 flex flex-col gap-4 rounded-2xl hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
											setFormData({
												...formData,
												source_type: "ingest",
												is_remote: true,
												path: "",
											});
											setIsFormVisible(true);
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
										{true && (
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="h-8 w-8 rounded-full"
												onClick={() => setIsFormVisible(false)}
											>
												<ArrowDownToLine className="w-4 h-4 rotate-90" />
											</Button>
										)}
										<DialogTitle className="text-xl font-bold text-primary">
											{formData.source_type === "local"
												? "Nouveau Projet Local"
												: formData.source_type === "remote"
													? "Nouveau Projet Distant"
													: "Nouvelle Ingestion CI"}
										</DialogTitle>
									</div>
								</DialogHeader>

								<div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-6 hide-scrollbar">
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
										<div className="flex flex-col gap-1">
											<label
												htmlFor="project-name"
												className="text-sm font-medium"
											>
												Nom du projet
											</label>
											<Input
												id="project-name"
												required
												type="text"
												value={formData.name}
												onChange={(e) =>
													setFormData({ ...formData, name: e.target.value })
												}
												placeholder="Ex: Mon API Node"
											/>
										</div>

										{false && (
											<div className="flex flex-col gap-1">
												<label
													htmlFor="project-source-type"
													className="text-sm font-medium"
												>
													Type de projet
												</label>
												<Select
													value={formData.source_type}
													onValueChange={(val) => {
														const st = val as "local" | "ingest" | "remote";
														setFormData({
															...formData,
															source_type: st,
															is_remote: st !== "local",
															path:
																st === "remote" || st === "ingest"
																	? ""
																	: formData.path,
														});
													}}
												>
													<SelectTrigger
														id="project-source-type"
														className="w-full"
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="local">Local</SelectItem>
														<SelectItem
															value="remote"
															disabled={!hasGithubToken}
														>
															Distant (Direct){" "}
															{!hasGithubToken && "(Requis: Jeton GitHub)"}
														</SelectItem>
														<SelectItem value="ingest">Ingestion CI</SelectItem>
													</SelectContent>
												</Select>
											</div>
										)}

										{formData.source_type === "ingest" && (
											<div className="flex flex-col gap-1">
												<label
													htmlFor="project-ingest-url"
													className="text-sm font-medium flex items-center gap-1"
												>
													<Info className="w-3.5 h-3.5" /> URL d'Ingestion CI
												</label>
												<div className="relative">
													<input
														id="project-ingest-url"
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

										{formData.source_type === "local" && (
											<div className="flex flex-col gap-1 md:col-span-2">
												<label
													htmlFor="project-path"
													className="text-sm font-medium"
												>
													Chemin absolu (Racine Git)
												</label>
												<Input
													id="project-path"
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
										)}

										{formData.source_type === "local" && (
											<div className="flex flex-col gap-1">
												<label
													htmlFor="project-audit-path"
													className="text-sm font-medium"
												>
													Sous-dossier d'audit (Optionnel)
												</label>
												<Input
													id="project-audit-path"
													type="text"
													value={formData.audit_path}
													onChange={(e) =>
														setFormData({
															...formData,
															audit_path: e.target.value,
														})
													}
													onBlur={handleDetectTool}
													placeholder="Ex: backend/src (vide si racine)"
												/>
											</div>
										)}

										{formData.source_type === "remote" && (
											<div className="flex flex-col gap-1 md:col-span-2">
												<label
													htmlFor="project-remote-url"
													className="text-sm font-medium"
												>
													URL distante du fichier lock
												</label>
												<Input
													id="project-remote-url"
													required={formData.source_type === "remote"}
													type="text"
													value={formData.remote_url}
													onChange={(e) =>
														setFormData({
															...formData,
															remote_url: e.target.value,
														})
													}
													placeholder="Ex: https://raw.githubusercontent.com/.../package-lock.json"
												/>
											</div>
										)}

										<div className="flex flex-col gap-1">
											<label
												htmlFor="project-tool"
												className="text-sm font-medium"
											>
												Outil d'audit
											</label>
											<Select
												value={formData.tool}
												onValueChange={(val) =>
													setFormData({
														...formData,
														// Valeurs bornées par les <SelectItem> déclarés juste en dessous.
														tool: val as ProjectTool,
														type: val === "composer" ? "composer" : "node",
													})
												}
											>
												<SelectTrigger id="project-tool" className="w-full">
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
											<span className="text-sm font-medium">
												Tags (Configurations)
											</span>
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
									</div>
								</div>

								<DialogFooter className="p-6 pt-4 border-t shrink-0 flex-col items-stretch gap-2 bg-muted/20 sm:flex-row sm:items-center sm:justify-end">
									{submitError && (
										<p
											role="alert"
											className="mr-auto text-sm font-medium text-red-500"
										>
											{submitError}
										</p>
									)}
									<Button type="button" variant="secondary" onClick={resetForm}>
										Annuler
									</Button>
									{!formData.is_remote && (
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
									)}
									{formData.is_remote && (
										<Button type="submit" className="shadow-lg">
											Créer le projet CI
										</Button>
									)}
									{!formData.is_remote && (
										<Button
											type="submit"
											onClick={(e) => handleSubmit(e, false)}
											className="shadow-lg"
										>
											{"Créer sans auditer"}
										</Button>
									)}
								</DialogFooter>
							</>
						)}
					</form>
				</DialogContent>
			</Dialog>

			{availableTags.length > 0 && projects.length > 0 && (
				<div className="flex flex-wrap gap-2 mb-6">
					<span className="text-sm font-semibold text-muted-foreground mr-2 self-center">
						Filtre :
					</span>
					<Button
						variant={filterTag === null ? "default" : "outline"}
						onClick={() => setFilterTag(null)}
						className="rounded-full text-xs font-bold uppercase tracking-wider px-3 h-7"
					>
						Tous
					</Button>
					{availableTags.map((t) => (
						<Button
							key={t.id}
							variant={filterTag === t.name ? "default" : "outline"}
							onClick={() => setFilterTag(t.name)}
							className={`rounded-full text-xs font-bold uppercase tracking-wider px-3 h-7 flex items-center gap-1.5 ${filterTag === t.name ? "bg-primary/20 text-primary border-primary" : ""}`}
						>
							<span
								className="w-2 h-2 rounded-full"
								style={{
									backgroundColor: `var(--color-${t.color}-500, var(--primary))`,
								}}
							></span>
							{t.name}
						</Button>
					))}
				</div>
			)}

			{/* Échecs de la dernière synchronisation groupée. Ils partaient dans
			    `console.error` : un dépôt sans amont ou une authentification refusée
			    laissait la carte afficher le même « à jour » qu'un succès. */}
			{gitSyncFailures.length > 0 && (
				<div className="rounded-xl border border-red-500/50 bg-red-500/10 p-4 flex flex-col gap-2">
					<div className="flex items-center justify-between gap-4">
						<p className="text-sm font-semibold flex items-center gap-2">
							<AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
							{gitSyncFailures.length} dépôt(s) non synchronisé(s)
						</p>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setGitSyncFailures([])}
						>
							Masquer
						</Button>
					</div>
					<ul className="flex flex-col gap-1 text-xs text-muted-foreground font-mono">
						{gitSyncFailures.map((e) => (
							<li key={e.name} className="truncate">
								<span className="font-semibold text-foreground">{e.name}</span>{" "}
								— {e.message}
							</li>
						))}
					</ul>
				</div>
			)}

			{loading ? (
				<ShieldLoader
					className="p-12"
					message="Lecture du parc et de l'état git…"
				/>
			) : projects.length === 0 ? (
				<div className="bg-card border-border p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4">
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
					{visibleProjects.map((p, index) => (
						<ProjectCard
							key={p.id}
							p={p}
							index={index}
							auditState={auditState}
							onOpen={(id) => navigate(`/projects/${id}`)}
							copiedSlug={copiedSlug}
							setCopiedSlug={setCopiedSlug}
							copyToClipboard={copyToClipboard}
							tagColors={tagColors}
							detectingId={detectingId}
							handleDetectGit={handleDetectGit}
							handleFetch={handleFetch}
							handlePull={handlePull}
							toggleIgnore={toggleIgnore}
							handleForceAudit={handleForceAudit}
							handleEdit={handleEdit}
							handleDelete={handleDelete}
							formatDate={formatDate}
						/>
					))}
				</div>
			) : (
				<div className="rounded-md border bg-card text-card-foreground overflow-hidden">
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/50">
								<TableHead>Projet</TableHead>
								<TableHead>Tags & Santé</TableHead>
								<TableHead>Git Status</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{visibleProjects.map((p) => (
								<ProjectRow
									key={p.id}
									p={p}
									auditState={auditState}
									navigate={navigate}
									tagColors={tagColors}
									detectingId={detectingId}
									handleDetectGit={handleDetectGit}
									handleFetch={handleFetch}
									handlePull={handlePull}
									handleForceAudit={handleForceAudit}
									handleEdit={handleEdit}
									handleDelete={handleDelete}
								/>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Barre **non modale**, comme pour l'audit (N8) : le voile plein écran
			    masquait la console live, seul endroit où l'on voit `git fetch`
			    tourner et échouer. Décalée, pour ne pas se superposer à celle de
			    l'audit global si les deux lots tournent. */}
			<AuditProgressBar
				progression={
					fetchProgress
						? {
								faits: fetchProgress.done,
								total: fetchProgress.total,
								enCours: fetchProgress.running,
							}
						: null
				}
				onCancel={cancelGitSync}
				label="Mise à jour Git"
				offset
			/>

			{projectToEdit && (
				<ProjectEditDialog
					project={projectToEdit}
					isOpen={true}
					onOpenChange={(isOpen) => {
						if (!isOpen) setProjectToEdit(null);
					}}
					onSaved={fetchProjects}
					showIgnoreToggle={false}
				/>
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
});
