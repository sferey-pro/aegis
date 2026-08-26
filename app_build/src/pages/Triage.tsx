import {
	AlertTriangle,
	CheckCircle2,
	CloudDownload,
	Info,
	RefreshCw,
	Search,
	Shield,
	X,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { AnnotationStatus } from "@/db/annotations";
import type { Ticket } from "@/db/tickets";
import type { BulkSyncResult } from "@/lib/advisory-sync";
import type { CveGroup } from "@/lib/aggregator";
import { apiErrorMessage, fetchJson, fetchVoid, jsonInit } from "@/lib/api";
import type { AnnotationInput } from "@/lib/schemas";
import { ConfirmReasonModal } from "../components/organisms/ConfirmReasonModal";
import { CveDetailsModal } from "../components/organisms/CveDetailsModal";
import { TicketModal } from "../components/organisms/TicketModal";
import { TriageTable } from "../components/organisms/TriageTable";
import type {
	ConfirmModalState,
	PackageGroup,
	TicketModalState,
	Toast,
} from "../components/organisms/triage-types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { compareVersions, SEV_ORDER } from "../lib/triage-constants";

/**
 * La plus ancienne de deux dates ISO, en ignorant les absentes et les illisibles.
 *
 * Une date illisible traitée comme valide remonterait comme minimum et
 * afficherait « Invalid Date » sur toute la ligne.
 */
function plusAncienne(
	a: string | null,
	b: string | null | undefined,
): string | null {
	if (!b || Number.isNaN(new Date(b).getTime())) return a;
	if (!a) return b;
	return new Date(b) < new Date(a) ? b : a;
}

/**
 * Applique une décision de triage à l'agrégat déjà chargé.
 *
 * Ne touche que les occurrences du projet visé au sein du groupe de la CVE : une
 * même CVE vit dans plusieurs projets, et une décision porte sur un seul.
 * `note` absente laisse la note en place — c'est le contrat du serveur (N32), et
 * la copie locale doit dire la même chose.
 */
function appliquerStatut(
	groupes: CveGroup[],
	cve: string,
	projectId: number,
	statut: AnnotationStatus,
	note?: string,
): CveGroup[] {
	return groupes.map((g) =>
		g.cve !== cve
			? g
			: {
					...g,
					occurrences: g.occurrences.map((o) =>
						o.projectId !== projectId
							? o
							: { ...o, status: statut, note: note ?? o.note },
					),
				},
	);
}

/** Réponse de `POST /api/advisories/sync-all` : le bilan, plus l'enveloppe. */
type BulkSyncResponse = BulkSyncResult & { success: boolean };

export const Triage = React.memo(function Triage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const projectId = searchParams.get("project")
		? parseInt(searchParams.get("project") as string, 10)
		: null;
	const cveFilter = searchParams.get("cve");

	/**
	 * Recherche libre, portée par l'**URL** (`?q=`) comme le filtre par tag de la
	 * page Projets. Un état local ne se partagerait pas par lien et ne survivrait
	 * pas à un rechargement — or on cherche une CVE précise pour la montrer à
	 * quelqu'un.
	 *
	 * À ne pas confondre avec `?cve=` : celui-ci est une **égalité** posée par la
	 * navigation depuis un graphique, celle-là une correspondance partielle saisie
	 * à la main. Les deux se cumulent.
	 */
	const query = searchParams.get("q") ?? "";
	const setQuery = useCallback(
		(valeur: string) => {
			const params = new URLSearchParams(searchParams);
			if (valeur) params.set("q", valeur);
			else params.delete("q");
			// `replace` : chercher n'est pas naviguer. Empiler une entrée
			// d'historique par frappe rendrait le bouton « retour » inutilisable.
			setSearchParams(params, { replace: true });
		},
		[searchParams, setSearchParams],
	);

	const onClearProject = () => {
		const newParams = new URLSearchParams(searchParams);
		newParams.delete("project");
		setSearchParams(newParams);
	};
	const onClearCve = () => {
		const newParams = new URLSearchParams(searchParams);
		newParams.delete("cve");
		setSearchParams(newParams);
	};
	const [cves, setCves] = useState<CveGroup[]>([]);
	const [tickets, setTickets] = useState<Record<string, Ticket>>({});
	const [jiraBaseUrl, setJiraBaseUrl] = useState("");
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState(1);
	const [itemsPerPage, setItemsPerPage] = useState(10);
	/**
	 * Groupe ouvert dans la modale — sa **clé**, pas l'objet.
	 *
	 * L'état retenait l'objet issu du `useMemo` : après un refetch le memo était
	 * recalculé, mais la modale continuait d'afficher l'ancien instantané, avec
	 * l'ancien statut. Fermer la modale après chaque décision masquait cette
	 * désynchronisation au lieu de la corriger — d'où un package à 8 CVE qui
	 * coûtait 8 cycles ouvrir/statuer/rouvrir. En gardant la clé et en dérivant le
	 * groupe, la modale reste ouverte **et** à jour.
	 */
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	const [ticketModal, setTicketModal] = useState<TicketModalState>({
		isOpen: false,
		md: "",
		copied: false,
	});
	const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(
		null,
	);
	const [toast, setToast] = useState<Toast | null>(null);
	const [hideProcessed, setHideProcessed] = useState(false);
	/** Échec du chargement des CVE, distinct d'un parc sans vulnérabilité (N6). */
	const [loadError, setLoadError] = useState<string | null>(null);
	const [enriching, setEnriching] = useState(false);

	const fetchCves = useCallback(async () => {
		try {
			setCves(await fetchJson<CveGroup[]>("/api/cves"));
			setLoadError(null);
		} catch (e) {
			// N6 : sans cet état, une liste vide par échec s'affichait « Aucune
			// vulnérabilité — votre écosystème est sain ». Pour un écran de triage,
			// c'est la conclusion la plus dangereuse qu'on puisse tirer d'une panne.
			setCves([]);
			setLoadError(apiErrorMessage(e));
		} finally {
			setLoading(false);
		}
	}, []);

	const fetchTickets = useCallback(async () => {
		try {
			const data = await fetchJson<Ticket[]>("/api/tickets/list");
			const map: Record<string, Ticket> = {};
			for (const t of data) {
				map[`${t.project_id}::${t.package}`] = t;
			}
			setTickets(map);
		} catch (e) {
			// Accessoire : l'absence de liens de tickets n'invalide pas le triage.
			console.error(e);
		}
	}, []);

	const fetchSettings = useCallback(async () => {
		try {
			const data = await fetchJson<Record<string, string>>("/api/settings");
			setJiraBaseUrl(data.JIRA_BASE_URL || "");
		} catch (e) {
			console.error(e);
		}
	}, []);

	useEffect(() => {
		fetchCves();
		fetchTickets();
		fetchSettings();
	}, [fetchCves, fetchTickets, fetchSettings]);

	const packageGroups = React.useMemo(() => {
		const map = new Map<string, PackageGroup>();
		// La recherche porte sur ce qu'on lit à l'écran — référence, paquet, titre —
		// et non sur les identifiants internes.
		const recherche = query.trim().toLowerCase();

		cves.forEach((cveGroup) => {
			if (cveFilter && cveGroup.cve !== cveFilter) return;

			cveGroup.occurrences.forEach((occ) => {
				if (projectId && occ.projectId !== projectId) return;
				if (hideProcessed && occ.status !== "pending") return;
				if (
					recherche &&
					![cveGroup.cve, cveGroup.ref, occ.package, occ.title].some((champ) =>
						champ?.toLowerCase().includes(recherche),
					)
				) {
					return;
				}

				const key = `${occ.projectId}::${occ.package}`;
				let g = map.get(key);
				if (!g) {
					g = {
						key,
						projectId: occ.projectId,
						projectName: occ.projectName,
						package: occ.package,
						tool: occ.tool,
						cves: [],
						worstSeverity: occ.severity,
						pendingCount: 0,
						hasConfirmed: false,
						maxBaselineAgeInDays: 0,
						maxSlaAgeInDays: 0,
						hasBaseline: false,
						hasNetDiscovery: false,
						targetPatch: null as string | null,
						publishedAt: null as string | null,
						firstSeenAt: null as string | null,
					};
					map.set(key, g);
				}
				// La plus ancienne des deux dates : c'est celle qui porte le SLA.
				g.publishedAt = plusAncienne(g.publishedAt, occ.publishedAt);
				g.firstSeenAt = plusAncienne(g.firstSeenAt, occ.firstSeenAt);
				if (
					occ.fixedIn &&
					(!g.targetPatch || compareVersions(occ.fixedIn, g.targetPatch) > 0)
				) {
					g.targetPatch = occ.fixedIn;
				}
				const occAge = occ.ageInDays || 0;
				if (occ.isBaseline) {
					g.hasBaseline = true;
					if (occAge > g.maxBaselineAgeInDays) {
						g.maxBaselineAgeInDays = occAge;
					}
				} else {
					g.hasNetDiscovery = true;
					if (occAge > g.maxSlaAgeInDays) {
						g.maxSlaAgeInDays = occAge;
					}
				}
				if (
					(SEV_ORDER[occ.severity] ?? -1) > (SEV_ORDER[g.worstSeverity] ?? -1)
				) {
					g.worstSeverity = occ.severity;
				}
				if (occ.status === "pending") g.pendingCount++;
				if (occ.status === "confirmed") g.hasConfirmed = true;

				g.cves.push({
					cve: cveGroup.cve,
					ref: cveGroup.ref,
					title: occ.title || cveGroup.cve,
					severity: occ.severity,
					versionRange: occ.versionRange,
					fixedIn: occ.fixedIn,
					link: occ.link,
					status: occ.status,
					note: occ.note,
					cvssVector: occ.cvssVector,
					ageInDays: occ.ageInDays,
					firstSeenAt: occ.firstSeenAt,
					publishedAt: occ.publishedAt,
					isBaseline: occ.isBaseline,
				});
			});
		});
		return Array.from(map.values())
			.filter((g) => g.cves.length > 0)
			.sort((a, b) => b.projectName.localeCompare(a.projectName));
	}, [cves, projectId, cveFilter, hideProcessed, query]);

	// Déclencheurs volontaires : le corps ne les lit pas, mais la pagination doit
	// repartir à la première page quand un **critère de filtrage** change.
	//
	// `cves` n'en fait plus partie : c'est un tableau neuf à chaque refetch, donc
	// après *toute* annotation. Un référent qui travaillait page 4 était renvoyé
	// au début de la liste après chaque décision.
	// biome-ignore lint/correctness/useExhaustiveDependencies: declencheurs volontaires
	useEffect(() => {
		setPage(1);
	}, [projectId, cveFilter, hideProcessed, query]);

	const totalPages = Math.ceil(packageGroups.length / itemsPerPage);

	// La liste peut rétrécir sous la page courante — en masquant les traitées, ou
	// quand la dernière CVE d'un package est annotée. Sans ce recadrage la page
	// s'affiche vide, ce qui se lit comme « plus rien à traiter ».
	useEffect(() => {
		setPage((courante) => Math.min(courante, Math.max(1, totalPages)));
	}, [totalPages]);

	/**
	 * Le groupe affiché, **dérivé** de l'agrégat courant.
	 *
	 * Il disparaît de lui-même si le filtre « masquer les traitées » le vide : en
	 * mode Zero-Inbox, un package entièrement traité n'a plus de raison de rester
	 * ouvert.
	 */
	const selectedGroup =
		(selectedKey && packageGroups.find((g) => g.key === selectedKey)) || null;
	const paginatedGroups = packageGroups.slice(
		(page - 1) * itemsPerPage,
		page * itemsPerPage,
	);

	const updateStatus = async (
		cve: string,
		projectId: number,
		newStatus: AnnotationStatus,
		note?: string,
	) => {
		try {
			// N32 : n'envoyer que ce que l'utilisateur a effectivement fourni. Un
			// changement de statut ne touche pas à la note — le serveur préserve les
			// champs absents. La clause précédente forçait `note: ""` pour tout
			// statut autre que « confirmé », ce qui détruisait la note du référent à
			// chaque passage en « en attente » ou « faux positif ».
			const payload: AnnotationInput = { cve, projectId, status: newStatus };
			if (note !== undefined) {
				payload.note = note;
			}

			// Décision appliquée localement d'abord. Le refetch suit, mais il coûte une
			// reconstruction complète de l'agrégat serveur : sans cette étape, le
			// badge de la CVE restait sur son ancien statut le temps de l'aller-retour,
			// et le référent ne savait pas si son clic avait porté.
			setCves((prec) => appliquerStatut(prec, cve, projectId, newStatus, note));

			await fetchVoid("/api/annotations", jsonInit("POST", payload));
			fetchCves();
		} catch (err) {
			// Une décision de triage perdue en silence est pire qu'une erreur : le
			// référent croit avoir traité la CVE.
			setToast({
				isOpen: true,
				title: "Échec",
				message: `Décision non enregistrée : ${apiErrorMessage(err)}`,
				type: "error",
			});
		}
	};

	/**
	 * Va chercher chez GitHub les avis manquants pour toutes les CVE affichées.
	 *
	 * Les métadonnées d'avis — sévérité GHSA, vecteur CVSS, date de publication,
	 * lien — ne se remplissaient qu'une CVE à la fois, par le bouton de
	 * rafraîchissement d'une ligne. Sur une base neuve la colonne restait vide.
	 * Le rechargement à la fin est indispensable : l'agrégateur superpose le cache
	 * aux runs à la lecture, donc le nouveau contenu n'apparaît qu'au prochain
	 * `GET /api/cves`.
	 */
	const handleEnrichAll = async () => {
		setEnriching(true);
		try {
			const r = await fetchJson<BulkSyncResponse>(
				"/api/advisories/sync-all",
				jsonInit("POST", {}),
			);

			// Le quota GitHub est une fin de passe légitime, pas une erreur : ce qui a
			// été récupéré est conservé, et un second clic reprend le reste.
			setToast({
				isOpen: true,
				title: r.rateLimited ? "Quota GitHub atteint" : "Avis GHSA à jour",
				message: r.rateLimited
					? `${r.fetched} avis récupérés, ${r.remaining} restants. Réessayez plus tard, ou renseignez un GITHUB_TOKEN dans les paramètres.`
					: `${r.total} CVE examinées : ${r.fetched} avis récupérés, ${r.alreadyCached} déjà connus, ${r.notFound} inconnus de GitHub.`,
				type: r.rateLimited ? "info" : "success",
			});

			await fetchCves();
		} catch (err) {
			setToast({
				isOpen: true,
				title: "Échec",
				message: `Enrichissement GHSA impossible : ${apiErrorMessage(err)}`,
				type: "error",
			});
		} finally {
			setEnriching(false);
		}
	};

	const handleConfirmCve = (
		cve: string,
		projectId: number,
		initialReason: string = "",
	) => {
		setConfirmModal({ isOpen: true, cve, projectId, reason: initialReason });
	};

	const submitConfirm = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!confirmModal) return;
		await updateStatus(
			confirmModal.cve,
			confirmModal.projectId,
			"confirmed",
			confirmModal.reason,
		);
		setConfirmModal(null);
	};

	const createTicket = async (e: React.MouseEvent, group: PackageGroup) => {
		e.stopPropagation();
		try {
			const data = await fetchJson<{ markdown: string }>(
				"/api/tickets",
				jsonInit("POST", {
					projectId: group.projectId,
					packageName: group.package,
				}),
			);
			setTicketModal({ isOpen: true, md: data.markdown, copied: false, group });
		} catch (err) {
			// La modale s'ouvrait avec un brouillon `undefined` : le référent
			// copiait une chaîne vide dans son ticket Jira.
			setToast({
				isOpen: true,
				title: "Échec",
				message: `Brouillon non généré : ${apiErrorMessage(err)}`,
				type: "error",
			});
		}
	};

	const copyToClipboard = () => {
		navigator.clipboard.writeText(ticketModal.md);
		setTicketModal((prev) => ({ ...prev, copied: true }));
		setTimeout(
			() => setTicketModal((prev) => ({ ...prev, copied: false })),
			2000,
		);
	};

	return (
		<div className="flex-1 w-full max-w-7xl px-4 md:px-8 mx-auto mt-8 z-10">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h2 className="text-3xl font-bold font-heading flex items-center gap-3">
						CVEs
						{projectId && (
							<span className="text-sm font-semibold px-3 py-1 text-primary rounded-full border flex items-center gap-2">
								Filtré par projet
								{onClearProject && (
									<button
										type="button"
										onClick={onClearProject}
										className="hover:text-red-600 dark:hover:text-red-400"
									>
										<X className="w-3.5 h-3.5" />
									</button>
								)}
							</span>
						)}
						{cveFilter && (
							<span className="text-sm font-semibold px-3 py-1 rounded-full border flex items-center gap-2">
								Filtré par CVE ({cveFilter})
								{onClearCve && (
									<button
										type="button"
										onClick={onClearCve}
										className="hover:text-red-600 dark:hover:text-red-400"
									>
										<X className="w-3.5 h-3.5" />
									</button>
								)}
							</span>
						)}
					</h2>
					<p className="text-muted-foreground mt-1">
						Regroupé par Package et par Projet. Créez facilement vos tickets
						Jira.
					</p>
				</div>
				<div className="flex items-center gap-2 flex-wrap">
					{/* Recherche libre. Purement locale : les CVE affichées sont déjà
					    toutes chargées, une requête serveur par frappe n'apporterait
					    rien et rendrait la saisie dépendante du réseau. */}
					<div className="relative">
						<Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
						<Input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Chercher une CVE, un paquet…"
							aria-label="Chercher une CVE, un paquet ou un titre"
							className="pl-9 w-full sm:w-72"
						/>
					</div>
					<Button
						variant="secondary"
						onClick={handleEnrichAll}
						disabled={enriching || cves.length === 0}
						title="Interroge GitHub pour les avis manquants de toutes les CVE affichées"
						className="flex items-center gap-2"
					>
						{enriching ? (
							<RefreshCw className="w-4 h-4 animate-spin" />
						) : (
							<CloudDownload className="w-4 h-4" />
						)}
						{enriching ? "Recherche GHSA…" : "Mettre à jour les avis GHSA"}
					</Button>
					<Button
						variant={hideProcessed ? "secondary" : "outline"}
						onClick={() => setHideProcessed(!hideProcessed)}
						className={`flex items-center gap-2 ${hideProcessed ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
					>
						<CheckCircle2 className="w-4 h-4" /> Zero-Inbox (Masquer traitées)
					</Button>
				</div>
			</div>

			{loading ? (
				<div className="flex justify-center p-12">
					<RefreshCw className="w-8 h-8 text-primary animate-spin" />
				</div>
			) : loadError ? (
				/* N6 : un échec de chargement a son propre état. Le confondre avec un
				   parc sain était le pire mode de défaillance de cet écran. */
				<div
					role="alert"
					className="bg-card border border-red-500/50 bg-red-500/10 p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4"
				>
					<Shield className="w-16 h-16 opacity-80" />
					<div>
						<h3 className="text-xl font-bold">
							Impossible de charger les vulnérabilités
						</h3>
						<p className="text-muted-foreground">{loadError}</p>
						<p className="text-muted-foreground mt-1 text-sm">
							Cet écran ne reflète pas l'état de votre parc.
						</p>
					</div>
					<Button variant="outline" onClick={fetchCves}>
						Réessayer
					</Button>
				</div>
			) : packageGroups.length === 0 ? (
				<div className="bg-card border-border p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4">
					<Shield className="w-16 h-16 opacity-80" />
					<div>
						<h3 className="text-xl font-bold">Aucune vulnérabilité</h3>
						<p className="text-muted-foreground">Votre écosystème est sain !</p>
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-4">
					<TriageTable
						paginatedGroups={paginatedGroups}
						setSelectedGroup={(g) => setSelectedKey(g.key)}
						createTicket={createTicket}
						tickets={tickets}
						jiraBaseUrl={jiraBaseUrl}
						page={page}
						setPage={setPage}
						totalPages={totalPages}
						itemsPerPage={itemsPerPage}
						setItemsPerPage={setItemsPerPage}
						totalItems={packageGroups.length}
					/>
				</div>
			)}

			<CveDetailsModal
				selectedGroup={selectedGroup}
				onClose={() => setSelectedKey(null)}
				updateStatus={updateStatus}
				handleConfirmCve={handleConfirmCve}
				setToast={setToast}
				tickets={tickets}
				jiraBaseUrl={jiraBaseUrl}
			/>

			<TicketModal
				ticketModal={ticketModal}
				setTicketModal={setTicketModal}
				copyToClipboard={copyToClipboard}
				setToast={setToast}
				fetchTickets={fetchTickets}
			/>

			<ConfirmReasonModal
				confirmModal={confirmModal}
				setConfirmModal={setConfirmModal}
				submitConfirm={submitConfirm}
			/>

			{toast?.isOpen && (
				<div
					className={`fixed bottom-6 right-6 z-[200] max-w-sm w-full p-4 rounded-xl border flex flex-col gap-2 bg-card border-border ${toast.type === "success" ? "bg-green-500/10 " : toast.type === "error" ? "bg-red-500/10 " : "bg-blue-500/10 "}`}
				>
					<div className="flex justify-between items-start">
						<h4 className="font-bold flex items-center gap-2">
							{toast.type === "success" ? (
								<CheckCircle2 className="w-5 h-5" />
							) : toast.type === "error" ? (
								<AlertTriangle className="w-5 h-5" />
							) : (
								<Info className="w-5 h-5" />
							)}
							{toast.title}
						</h4>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setToast(null)}
							className="text-current opacity-70 w-6 h-6 hover:bg-transparent hover:opacity-100"
						>
							<X className="w-5 h-5" />
						</Button>
					</div>
					<div className="text-sm opacity-90 mt-1">{toast.message}</div>
				</div>
			)}
		</div>
	);
});
