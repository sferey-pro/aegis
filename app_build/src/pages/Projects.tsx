import { useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	ArrowDownToLine,
	CloudDownload,
	Folder,
	Globe,
	HardDrive,
	HelpCircle,
	LayoutGrid,
	List,
	Plus,
	RefreshCw,
} from "lucide-react";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchJson, fetchVoid } from "@/lib/api";
import { queryKeys, useProjects, useTags } from "@/lib/api/queries";
import { consoleClient } from "@/lib/console-client";
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
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table";

export const Projects = React.memo(function Projects() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const {
		data: projects = [],
		isLoading: projectsLoading,
		refetch: refetchProjectsRaw,
	} = useProjects();
	const { data: availableTags = [] } = useTags();

	const loading = projectsLoading;

	const fetchProjects = async () => {
		await refetchProjectsRaw();
	};

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
	const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
	const [detectingId, setDetectingId] = useState<number | null>(null);
	const [projectToDelete, setProjectToDelete] = useState<number | null>(null);
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
		const unsubscribe = consoleClient.subscribe((data) => {
			if (data === ": disabled") return;
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
		});
		return unsubscribe;
	}, []);

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

	const handleEdit = (p: ProjectListItem, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		setProjectToEdit(p);
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
			queryClient.setQueryData(
				queryKeys.projects,
				(old: ProjectListItem[] | undefined) =>
					old ? old.map((p) => (p.id === id ? rafraichi : p)) : old,
			);
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
	const mergeGit = useCallback(
		(id: number, git: ProjectGitState) => {
			queryClient.setQueryData(
				queryKeys.projects,
				(old: ProjectListItem[] | undefined) =>
					old ? old.map((p) => (p.id === id ? { ...p, git } : p)) : old,
			);
		},
		[queryClient],
	);

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
				queryClient.setQueryData(
					queryKeys.projects,
					(old: ProjectListItem[] | undefined) =>
						old
							? old.map((p) =>
									p.id === sortie.project.id
										? {
												...p,
												git: { ...git, checkedAt: new Date().toISOString() },
											}
										: p,
								)
							: old,
				);
			},
		);

		setGitSyncFailures(
			resultats
				.filter((r) => r.error)
				.map((r) => ({ name: r.project.name, message: r.error ?? "" })),
		);
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
						variant="outline"
						size="icon"
						onClick={() => setIsHelpModalOpen(true)}
						title="Guide des types de projets"
						className="mr-2"
					>
						<HelpCircle className="w-4 h-4 text-muted-foreground" />
					</Button>
					<Button onClick={() => setIsAdding(true)} className="shadow-lg">
						<Plus className="w-4 h-4 mr-2" />
						Ajouter un Projet
					</Button>
				</div>
			</div>

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
				<div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex flex-col gap-2">
					<div className="flex items-center justify-between gap-4">
						<p className="text-sm font-semibold flex items-center gap-2">
							<AlertTriangle className="w-4 h-4 text-destructive dark:text-destructive" />
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

			<ProjectEditDialog
				project={projectToEdit}
				isOpen={isAdding || projectToEdit !== null}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						setIsAdding(false);
						setProjectToEdit(null);
					}
				}}
				onSaved={async (createdProject, shouldAudit) => {
					await fetchProjects();
					setIsAdding(false);
					setProjectToEdit(null);
					if (createdProject?.id) {
						if (shouldAudit) {
							setAuditState((prev) => ({
								...prev,
								[createdProject.id]: "Démarrage...",
							}));
							fetchVoid(`/api/projects/${createdProject.id}/audit`, {
								method: "POST",
							})
								.then(() => fetchProjects())
								.catch(console.error)
								.finally(() => {
									setAuditState((prev) => {
										const next = { ...prev };
										delete next[createdProject.id];
										return next;
									});
								});
						}
						// Déclencher un git fetch en arrière-plan pour vérifier les mises à jour
						fetchVoid(`/api/projects/${createdProject.id}/git-fetch`, {
							method: "POST",
						})
							.then(() => fetchProjects())
							.catch(console.error);
					}
				}}
				showIgnoreToggle={false}
			/>

			<ConfirmDialog
				isOpen={projectToDelete !== null}
				title="Supprimer le projet"
				message="Êtes-vous sûr de vouloir supprimer ce projet ? Cette action est irréversible et supprimera tout l'historique d'audit."
				confirmText="Supprimer"
				onConfirm={confirmDelete}
				onCancel={() => setProjectToDelete(null)}
			/>

			<Dialog open={isHelpModalOpen} onOpenChange={setIsHelpModalOpen}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-xl text-primary">
							<HelpCircle className="w-5 h-5" />
							Guide : Les types de projets Aegis
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-6 py-2">
						{/* Local */}
						<div>
							<h4 className="flex items-center gap-2 font-semibold text-lg">
								<HardDrive className="w-4 h-4 text-muted-foreground" /> Projets
								Locaux
							</h4>
							<p className="text-sm text-muted-foreground mt-1">
								Idéal pour les projets présents sur votre machine ou réseau
								local. Aegis analyse directement les fichiers du dossier et
								utilise Git localement pour déterminer la branche et le commit.
							</p>
						</div>

						{/* Distant */}
						<div>
							<h4 className="flex items-center gap-2 font-semibold text-lg">
								<Globe className="w-4 h-4 text-primary/70" /> Projets Distants
								(GitHub)
							</h4>
							<p className="text-sm text-muted-foreground mt-1">
								Plus besoin de cloner le dépôt complet ! Indiquez l'URL GitHub
								brute (Raw) du fichier{" "}
								<code className="bg-muted px-1 rounded">package-lock.json</code>{" "}
								ou <code className="bg-muted px-1 rounded">composer.lock</code>.
								Aegis le téléchargera de manière isolée pour l'auditer.
							</p>
							<div className="bg-primary/5 p-3 rounded-md mt-3 text-sm border border-primary/10">
								<strong className="text-primary">
									💡 Astuce : Ciblage dynamique d'un environnement
								</strong>
								<br />
								Remplacez le nom de la branche dans l'URL par{" "}
								<code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-bold">
									env:
								</code>{" "}
								suivi du nom de votre environnement (ex:{" "}
								<code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-bold">
									env:prod
								</code>{" "}
								ou{" "}
								<code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-bold">
									env:preprod
								</code>
								). Aegis interrogera l'API GitHub pour identifier
								automatiquement le SHA du dernier déploiement marqué comme{" "}
								<strong>Active</strong> sur cet environnement précis !
							</div>
						</div>

						{/* Ingest */}
						<div>
							<h4 className="flex items-center gap-2 font-semibold text-lg">
								<ArrowDownToLine className="w-4 h-4 text-emerald-500/70" />{" "}
								Ingestion CI/CD
							</h4>
							<p className="text-sm text-muted-foreground mt-1">
								Conçu pour l'automatisation. Ce n'est pas Aegis qui scanne le
								projet, mais votre propre pipeline d'intégration continue
								(GitHub Actions, GitLab CI...) qui exécute l'audit et pousse le
								rapport vers l'API d'Aegis pour centraliser les résultats.
							</p>
						</div>
					</div>
					<DialogFooter>
						<Button onClick={() => setIsHelpModalOpen(false)}>
							J'ai compris
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
});
