import {
	AlertCircle,
	Bot,
	Calendar,
	Check,
	CheckSquare,
	ChevronDown,
	Clock,
	Copy,
	Layers,
	RefreshCw,
	Search,
	Sparkles,
	Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CveGroup } from "@/lib/aggregator";
import { fetchJson } from "@/lib/api";
import {
	SEV_ORDER,
	SEVERITY_COLORS,
	SEVERITY_LABELS,
} from "@/lib/triage-constants";
import { cn, copyToClipboard, formatDateTime, relativeAge } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";

export interface PromptReportGeneratorProps {
	className?: string;
}

/**
 * Extrait la date d'apparition la plus ancienne (découverte nette ou publication avis)
 * parmi toutes les occurrences d'une vulnérabilité groupée.
 */
export function getCveFirstSeenDate(group: CveGroup): string | null {
	let earliest: string | null = null;
	let earliestTime = Number.POSITIVE_INFINITY;

	for (const occ of group.occurrences) {
		const candidate = occ.firstSeenAt || occ.publishedAt;
		if (!candidate) continue;
		const t = new Date(candidate).getTime();
		if (!Number.isNaN(t) && t < earliestTime) {
			earliestTime = t;
			earliest = candidate;
		}
	}
	return earliest;
}

/**
 * Extrait la date d'analyse la plus récente (dernier run d'audit)
 * parmi toutes les occurrences d'une vulnérabilité groupée.
 */
export function getCveAnalysisDate(group: CveGroup): string | null {
	let latest: string | null = null;
	let latestTime = Number.NEGATIVE_INFINITY;

	for (const occ of group.occurrences) {
		const candidate = occ.ranAt;
		if (!candidate) continue;
		const t = new Date(candidate).getTime();
		if (!Number.isNaN(t) && t > latestTime) {
			latestTime = t;
			latest = candidate;
		}
	}
	return latest;
}

/**
 * Génère le prompt textuel complet destiné à être copié/collé dans un LLM (IA).
 */
export function buildAuditReportPrompt(
	selectedCves: CveGroup[],
	generationDate = new Date().toISOString(),
): string {
	if (selectedCves.length === 0) {
		return `/* ==========================================================================
   AUCUNE VULNÉRABILITÉ SÉLECTIONNÉE
   --------------------------------------------------------------------------
   Veuillez cocher au moins une vulnérabilité (CVE) dans le menu déroulant
   à droite pour générer automatiquement le prompt de compte-rendu pour votre IA.
   ========================================================================== */`;
	}

	const uniqueProjects = Array.from(
		new Set(
			selectedCves.flatMap((c) => c.occurrences.map((o) => o.projectName)),
		),
	).filter(Boolean);

	const highestSeverity =
		selectedCves.length > 0
			? ([...selectedCves].sort(
					(a, b) => (SEV_ORDER[b.worst] ?? -1) - (SEV_ORDER[a.worst] ?? -1),
				)[0]?.worst ?? "unknown")
			: "unknown";

	const cveDetails = selectedCves
		.map((cve, idx) => {
			const ref = cve.ref || cve.cve;
			const sevLabel = (SEVERITY_LABELS[cve.worst] ?? cve.worst).toUpperCase();
			const projects = Array.from(
				new Set(cve.occurrences.map((o) => o.projectName)),
			).join(", ");
			const packages = Array.from(
				new Set(
					cve.occurrences.map(
						(o) =>
							`${o.package}${o.versionRange ? ` (${o.versionRange})` : ""}`,
					),
				),
			).join(", ");
			const firstSeen = getCveFirstSeenDate(cve);
			const lastAudit = getCveAnalysisDate(cve);
			const title = cve.occurrences[0]?.title || "Sans description";
			const cvss =
				cve.cvssVector ||
				cve.occurrences.find((o) => o.cvssVector)?.cvssVector ||
				"Non renseigné";
			const notes = cve.occurrences
				.filter((o) => o.note)
				.map((o) => `${o.projectName}: ${o.note}`)
				.join(" | ");

			return `${idx + 1}. [${ref}] (${sevLabel}) - ${packages} (Projets: ${projects || "N/A"})
   - Titre : ${title}
   - CVSS : ${cvss} | Découverte : ${firstSeen ? formatDateTime(firstSeen) : "N/A"} | Audit : ${lastAudit ? formatDateTime(lastAudit) : "N/A"}${notes ? ` | Notes : ${notes}` : ""}`;
		})
		.join("\n");

	return `Tu es un expert en cybersécurité.
Rédige un compte-rendu (CR) d'audit de sécurité court, factuel et synthétique sur les vulnérabilités listées ci-dessous.

⚠️ DIRECTIVES STRICTES :
1. **Aucune supposition / Aucune hallucination** : Tu n'as PAS accès au code source de nos projets. Ne fais AUCUNE supposition sur la manière dont les bibliothèques sont appelées dans notre code. Base-toi exclusivement sur les faits techniques connus de chaque CVE (advisory officielle, vecteur CVSS, CWE).
2. **Pas de correctif** : Ne consacre pas d'effort à détailler des montées de version ou correctifs techniques (dans 80% des cas la remédiation consiste simplement en la mise à jour par le vendor).
3. **Format court et concis** : Ce rapport peut contenir jusqu'à 30 CVEs. Il faut impérativement un **récapitulatif court par CVE** (2 à 3 lignes maximum par vulnérabilité). Va droit au but, sans verbiage inutile.
4. **Livrable sous forme d'Artifact** : Produis l'intégralité du compte-rendu sous la forme d'un **artifact Markdown autonome**.

## Périmètre audité
- Nombre de vulnérabilités : ${selectedCves.length}
- Projet(s) : ${uniqueProjects.join(", ") || "Non spécifié"}
- Sévérité maximale : ${(SEVERITY_LABELS[highestSeverity] ?? highestSeverity).toUpperCase()}
- Date de l'audit : ${formatDateTime(generationDate)}

## Liste des vulnérabilités sélectionnées
${cveDetails}

## Structure attendue pour l'artifact Markdown :
1. **Synthèse Globale (3-4 lignes max)**
   - Bilan concis de l'exposition globale et répartition par sévérité.
   - Typologies de risques principales identifiées (ex: RCE, DoS, fuite d'informations, bypass d'authentification).

2. **Récapitulatif Court par CVE (2 à 3 lignes max par CVE)**
   Pour chaque vulnérabilité, sous forme de bloc court et percutant :
   - **[Identifiant CVE]** (\`Sévérité\`) — *Paquet / Projet*
   - **Vulnérabilité** : Nature technique exacte de la faille en 1 phrase factuelle.
   - **Risque réel & Impact** : Ce qu'un attaquant peut obtenir si la faille est exploitée (ex: arrêt de service, lecture arbitraire de fichiers, exécution de code distant), sans spéculer sur notre utilisation interne du code.

3. **Tableau Récapitulatif des Risques**
   - Un tableau Markdown synthétique ordonné par sévérité :
     | CVE | Sévérité | Composant | Risque / Impact principal |
     |---|---|---|---|`;
}

export function PromptReportGenerator({
	className,
}: PromptReportGeneratorProps) {
	const [cves, setCves] = useState<CveGroup[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);

	// Filtres
	const [projectFilter, setProjectFilter] = useState("all");
	const [severityFilter, setSeverityFilter] = useState("all");
	const [firstSeenFilter, setFirstSeenFilter] = useState("all");
	const [analysisFilter, setAnalysisFilter] = useState("all");
	const [sortBy, setSortBy] = useState("severity_desc");
	const [searchQuery, setSearchQuery] = useState("");

	// Sélection des CVE par clé unique
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

	// État du menu déroulant
	const [isDropdownOpen, setIsDropdownOpen] = useState(true);

	// Retour visuel copie
	const [copied, setCopied] = useState(false);

	const fetchCves = useCallback(async () => {
		setLoading(true);
		try {
			const data = await fetchJson<CveGroup[]>("/api/cves");
			setCves(data);
			setLoadError(null);
		} catch (err) {
			console.error("Erreur chargement CVEs pour générateur de prompt:", err);
			setLoadError("Impossible de charger la liste des CVE.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchCves();
	}, [fetchCves]);

	// Liste unique des projets
	const projectOptions = useMemo(() => {
		const names = new Set<string>();
		for (const g of cves) {
			for (const o of g.occurrences) {
				if (o.projectName) names.add(o.projectName);
			}
		}
		return Array.from(names).sort((a, b) => a.localeCompare(b));
	}, [cves]);

	// Filtrage et tri
	const filteredCves = useMemo(() => {
		const now = Date.now();

		return cves
			.filter((group) => {
				// Filtre Projet
				if (
					projectFilter !== "all" &&
					!group.occurrences.some((o) => o.projectName === projectFilter)
				) {
					return false;
				}

				// Filtre Sévérité
				if (severityFilter !== "all" && group.worst !== severityFilter) {
					return false;
				}

				// Filtre Date d'apparition
				if (firstSeenFilter !== "all") {
					const firstSeen = getCveFirstSeenDate(group);
					if (!firstSeen) return false;
					const diffMs = now - new Date(firstSeen).getTime();
					if (firstSeenFilter === "24h" && diffMs > 24 * 3600 * 1000)
						return false;
					if (firstSeenFilter === "7d" && diffMs > 7 * 86400 * 1000)
						return false;
					if (firstSeenFilter === "30d" && diffMs > 30 * 86400 * 1000)
						return false;
					if (firstSeenFilter === "90d" && diffMs > 90 * 86400 * 1000)
						return false;
				}

				// Filtre Date d'analyse
				if (analysisFilter !== "all") {
					const lastAudit = getCveAnalysisDate(group);
					if (!lastAudit) return false;
					const diffMs = now - new Date(lastAudit).getTime();
					if (analysisFilter === "24h" && diffMs > 24 * 3600 * 1000)
						return false;
					if (analysisFilter === "7d" && diffMs > 7 * 86400 * 1000)
						return false;
					if (analysisFilter === "30d" && diffMs > 30 * 86400 * 1000)
						return false;
				}

				// Recherche textuelle
				if (searchQuery.trim()) {
					const q = searchQuery.toLowerCase().trim();
					const matchRef = (group.ref || group.cve).toLowerCase().includes(q);
					const matchOcc = group.occurrences.some(
						(o) =>
							o.package.toLowerCase().includes(q) ||
							o.title.toLowerCase().includes(q) ||
							o.projectName.toLowerCase().includes(q),
					);
					if (!matchRef && !matchOcc) return false;
				}

				return true;
			})
			.sort((a, b) => {
				if (sortBy === "severity_desc") {
					const diffSev =
						(SEV_ORDER[b.worst] ?? -1) - (SEV_ORDER[a.worst] ?? -1);
					if (diffSev !== 0) return diffSev;
					return b.occurrences.length - a.occurrences.length;
				}
				if (sortBy === "first_seen_desc") {
					const da = getCveFirstSeenDate(a);
					const db = getCveFirstSeenDate(b);
					if (!da && !db) return 0;
					if (!da) return 1;
					if (!db) return -1;
					return new Date(db).getTime() - new Date(da).getTime();
				}
				if (sortBy === "first_seen_asc") {
					const da = getCveFirstSeenDate(a);
					const db = getCveFirstSeenDate(b);
					if (!da && !db) return 0;
					if (!da) return 1;
					if (!db) return -1;
					return new Date(da).getTime() - new Date(db).getTime();
				}
				if (sortBy === "analysis_desc") {
					const da = getCveAnalysisDate(a);
					const db = getCveAnalysisDate(b);
					if (!da && !db) return 0;
					if (!da) return 1;
					if (!db) return -1;
					return new Date(db).getTime() - new Date(da).getTime();
				}
				if (sortBy === "analysis_asc") {
					const da = getCveAnalysisDate(a);
					const db = getCveAnalysisDate(b);
					if (!da && !db) return 0;
					if (!da) return 1;
					if (!db) return -1;
					return new Date(da).getTime() - new Date(db).getTime();
				}
				if (sortBy === "project_asc") {
					const pa = a.occurrences[0]?.projectName || "";
					const pb = b.occurrences[0]?.projectName || "";
					return pa.localeCompare(pb);
				}
				return 0;
			});
	}, [
		cves,
		projectFilter,
		severityFilter,
		firstSeenFilter,
		analysisFilter,
		searchQuery,
		sortBy,
	]);

	// Liste ordonnée des CVE sélectionnées
	const selectedCvesList = useMemo(() => {
		return cves.filter((c) => selectedKeys.has(c.cve));
	}, [cves, selectedKeys]);

	// Prompt généré
	const generatedPrompt = useMemo(() => {
		return buildAuditReportPrompt(selectedCvesList);
	}, [selectedCvesList]);

	const handleToggle = (cveKey: string) => {
		setSelectedKeys((prev) => {
			const next = new Set(prev);
			if (next.has(cveKey)) {
				next.delete(cveKey);
			} else {
				next.add(cveKey);
			}
			return next;
		});
	};

	const handleSelectAllFiltered = () => {
		setSelectedKeys((prev) => {
			const next = new Set(prev);
			for (const c of filteredCves) {
				next.add(c.cve);
			}
			return next;
		});
	};

	const handleDeselectAllFiltered = () => {
		setSelectedKeys((prev) => {
			const next = new Set(prev);
			for (const c of filteredCves) {
				next.delete(c.cve);
			}
			return next;
		});
	};

	const handleCopy = async () => {
		if (selectedKeys.size === 0) return;
		await copyToClipboard(generatedPrompt);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<Card
			className={cn(
				"border-primary/20 bg-card/95 shadow-xl backdrop-blur-sm overflow-hidden",
				className,
			)}
		>
			<CardHeader className="border-b bg-muted/20 pb-4">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<span className="p-1.5 rounded-lg bg-primary/10 text-primary">
								<Sparkles className="w-5 h-5" />
							</span>
							<CardTitle className="text-xl font-bold font-heading">
								Générateur de Compte-Rendu (CR) IA
							</CardTitle>
							<Badge
								variant="secondary"
								className="text-xs uppercase tracking-wider font-semibold"
							>
								Assistant IA
							</Badge>
						</div>
						<CardDescription className="text-sm">
							Sélectionnez les vulnérabilités pour composer un prompt
							d'évaluation des risques et générer un artifact de compte-rendu IA
							(ChatGPT, Claude, Gemini...).
						</CardDescription>
					</div>

					<div className="flex items-center gap-2 self-start sm:self-auto">
						<Button
							variant="outline"
							size="sm"
							onClick={fetchCves}
							disabled={loading}
							title="Rafraîchir les vulnérabilités"
							className="text-xs gap-1.5"
						>
							<RefreshCw
								className={cn("w-3.5 h-3.5", loading && "animate-spin")}
							/>
							Actualiser
						</Button>
					</div>
				</div>
			</CardHeader>

			<CardContent className="p-4 sm:p-6">
				{loading && cves.length === 0 ? (
					<div className="flex flex-col items-center justify-center p-12 gap-3 text-muted-foreground">
						<Spinner className="w-8 h-8 text-primary" />
						<p className="text-sm">
							Chargement des vulnérabilités disponibles...
						</p>
					</div>
				) : loadError ? (
					<div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm">
						<AlertCircle className="w-5 h-5 shrink-0" />
						<div className="flex-1">
							<p className="font-semibold">Erreur de chargement</p>
							<p className="text-xs opacity-90">{loadError}</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={fetchCves}
							className="shrink-0 text-xs"
						>
							Réessayer
						</Button>
					</div>
				) : (
					<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
						{/* COLONNE GAUCHE : Textarea non modifiable + Copier */}
						<div className="lg:col-span-7 flex flex-col gap-3">
							<div className="flex items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<Bot className="w-4 h-4 text-primary" />
									<span className="text-sm font-semibold">
										Prompt IA généré (non modifiable)
									</span>
									<Badge
										variant={selectedKeys.size > 0 ? "default" : "secondary"}
										className="text-xs"
									>
										{selectedKeys.size} CVE sélectionnée
										{selectedKeys.size > 1 ? "s" : ""}
									</Badge>
								</div>

								<Button
									type="button"
									variant={copied ? "default" : "secondary"}
									size="sm"
									onClick={handleCopy}
									disabled={selectedKeys.size === 0}
									className="gap-1.5 text-xs font-semibold shadow-xs transition-all"
								>
									{copied ? (
										<>
											<Check className="w-3.5 h-3.5 text-primary-foreground" />
											<span>Copié !</span>
										</>
									) : (
										<>
											<Copy className="w-3.5 h-3.5" />
											<span>Copier le prompt</span>
										</>
									)}
								</Button>
							</div>

							<div className="relative rounded-lg border border-border bg-muted/15 focus-within:ring-1 focus-within:ring-primary">
								<Textarea
									id="generated-audit-prompt"
									aria-label="Prompt de compte-rendu pour IA"
									readOnly
									value={generatedPrompt}
									className="font-mono text-xs sm:text-sm h-[480px] w-full resize-none bg-transparent border-0 focus-visible:ring-0 leading-relaxed p-4"
								/>
							</div>

							<div className="flex items-center justify-between text-xs text-muted-foreground px-1">
								<span>
									💡 Cliquez sur "Copier le prompt" puis collez le texte dans
									votre IA pour générer l'artifact.
								</span>
								{selectedKeys.size > 0 && (
									<button
										type="button"
										onClick={() => setSelectedKeys(new Set())}
										className="text-primary hover:underline"
									>
										Effacer la sélection
									</button>
								)}
							</div>
						</div>

						{/* COLONNE DROITE : Filtres + Menu Déroulant avec Checkboxes */}
						<div className="lg:col-span-5 flex flex-col gap-4">
							{/* Section Filtres et Tri */}
							<div className="rounded-lg border border-border/80 bg-muted/10 p-3.5 space-y-3">
								<div className="flex items-center gap-2 pb-1 border-b border-border/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									<Layers className="w-3.5 h-3.5 text-primary" />
									Filtres & Classement des CVE
								</div>

								{/* Grille filtres : Projet & Sévérité */}
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
									<div className="space-y-1">
										<label
											htmlFor="filter-project"
											className="text-xs font-medium text-muted-foreground block"
										>
											Projet
										</label>
										<Select
											value={projectFilter}
											onValueChange={setProjectFilter}
										>
											<SelectTrigger
												id="filter-project"
												className="w-full h-8 text-xs"
											>
												<SelectValue placeholder="Tous les projets" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">Tous les projets</SelectItem>
												{projectOptions.map((name) => (
													<SelectItem key={name} value={name}>
														{name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-1">
										<label
											htmlFor="filter-severity"
											className="text-xs font-medium text-muted-foreground block"
										>
											Sévérité
										</label>
										<Select
											value={severityFilter}
											onValueChange={setSeverityFilter}
										>
											<SelectTrigger
												id="filter-severity"
												className="w-full h-8 text-xs"
											>
												<SelectValue placeholder="Toutes" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">
													Toutes les sévérités
												</SelectItem>
												<SelectItem value="critical">Critique</SelectItem>
												<SelectItem value="high">Haut</SelectItem>
												<SelectItem value="moderate">Modéré</SelectItem>
												<SelectItem value="low">Bas</SelectItem>
												<SelectItem value="info">Info</SelectItem>
												<SelectItem value="unknown">Inconnu</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>

								{/* Grille filtres : Date apparition & Date analyse */}
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
									<div className="space-y-1">
										<label
											htmlFor="filter-first-seen"
											className="text-xs font-medium text-muted-foreground flex items-center gap-1"
										>
											<Calendar className="w-3 h-3" />
											Date d'apparition
										</label>
										<Select
											value={firstSeenFilter}
											onValueChange={setFirstSeenFilter}
										>
											<SelectTrigger
												id="filter-first-seen"
												className="w-full h-8 text-xs"
											>
												<SelectValue placeholder="Toutes dates" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">Toutes dates</SelectItem>
												<SelectItem value="24h">Moins de 24h</SelectItem>
												<SelectItem value="7d">Moins de 7 jours</SelectItem>
												<SelectItem value="30d">Moins de 30 jours</SelectItem>
												<SelectItem value="90d">Moins de 90 jours</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-1">
										<label
											htmlFor="filter-analysis"
											className="text-xs font-medium text-muted-foreground flex items-center gap-1"
										>
											<Clock className="w-3 h-3" />
											Date d'analyse
										</label>
										<Select
											value={analysisFilter}
											onValueChange={setAnalysisFilter}
										>
											<SelectTrigger
												id="filter-analysis"
												className="w-full h-8 text-xs"
											>
												<SelectValue placeholder="Tous audits" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">Tous audits</SelectItem>
												<SelectItem value="24h">
													Audité il y a &lt; 24h
												</SelectItem>
												<SelectItem value="7d">
													Audité il y a &lt; 7 jours
												</SelectItem>
												<SelectItem value="30d">
													Audité il y a &lt; 30 jours
												</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>

								{/* Tri & Recherche */}
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
									<div className="space-y-1">
										<label
											htmlFor="sort-by"
											className="text-xs font-medium text-muted-foreground block"
										>
											Classement (Tri)
										</label>
										<Select value={sortBy} onValueChange={setSortBy}>
											<SelectTrigger
												id="sort-by"
												className="w-full h-8 text-xs"
											>
												<SelectValue placeholder="Trier par" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="severity_desc">
													Sévérité (Critique d'abord)
												</SelectItem>
												<SelectItem value="first_seen_desc">
													Apparition (Plus récente)
												</SelectItem>
												<SelectItem value="first_seen_asc">
													Apparition (Plus ancienne)
												</SelectItem>
												<SelectItem value="analysis_desc">
													Analyse (Audit récent)
												</SelectItem>
												<SelectItem value="analysis_asc">
													Analyse (Audit ancien)
												</SelectItem>
												<SelectItem value="project_asc">
													Nom de projet (A-Z)
												</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-1">
										<label
											htmlFor="search-cve"
											className="text-xs font-medium text-muted-foreground block"
										>
											Recherche
										</label>
										<div className="relative">
											<Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
											<Input
												id="search-cve"
												type="text"
												value={searchQuery}
												onChange={(e) => setSearchQuery(e.target.value)}
												placeholder="CVE, paquet, titre..."
												className="h-8 pl-8 text-xs"
											/>
										</div>
									</div>
								</div>
							</div>

							{/* MENU DÉROULANT AVEC CHECKBOXES POUR LES CVE */}
							<div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
								<button
									type="button"
									onClick={() => setIsDropdownOpen(!isDropdownOpen)}
									className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
									aria-expanded={isDropdownOpen}
									aria-label="Menu déroulant pour sélectionner les CVE"
								>
									<div className="flex items-center gap-2 min-w-0">
										<CheckSquare className="w-4 h-4 text-primary shrink-0" />
										<span className="font-semibold text-sm truncate">
											Sélectionner les CVE
										</span>
										<Badge
											variant={selectedKeys.size > 0 ? "default" : "secondary"}
											className="text-xs px-2 py-0"
										>
											{selectedKeys.size} cochée
											{selectedKeys.size > 1 ? "s" : ""}
										</Badge>
									</div>

									<div className="flex items-center gap-2 shrink-0">
										<span className="text-xs text-muted-foreground">
											{filteredCves.length} disponible
											{filteredCves.length > 1 ? "s" : ""}
										</span>
										<ChevronDown
											className={cn(
												"w-4 h-4 text-muted-foreground transition-transform duration-200",
												isDropdownOpen && "rotate-180",
											)}
										/>
									</div>
								</button>

								{/* Contenu déroulant */}
								{isDropdownOpen && (
									<div className="p-3 border-t border-border flex flex-col gap-2.5 bg-background/50">
										{/* Actions rapides */}
										<div className="flex items-center justify-between text-xs pb-1 border-b border-border/40">
											<div className="flex items-center gap-2">
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={handleSelectAllFiltered}
													disabled={filteredCves.length === 0}
													className="h-7 px-2 text-xs font-medium text-primary hover:text-primary"
												>
													<CheckSquare className="w-3.5 h-3.5 mr-1" />
													Tout cocher ({filteredCves.length})
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={handleDeselectAllFiltered}
													disabled={selectedKeys.size === 0}
													className="h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
												>
													<Square className="w-3.5 h-3.5 mr-1" />
													Tout décocher
												</Button>
											</div>

											<span className="text-muted-foreground text-[11px]">
												{
													filteredCves.filter((c) => selectedKeys.has(c.cve))
														.length
												}{" "}
												/ {filteredCves.length} visible
												{filteredCves.length > 1 ? "s" : ""}
											</span>
										</div>

										{/* Liste avec ascenseur scrollable */}
										<div className="max-h-[360px] overflow-y-auto space-y-1.5 pr-1">
											{filteredCves.length === 0 ? (
												<div className="text-center py-8 px-4 text-muted-foreground">
													<p className="text-xs">
														Aucune vulnérabilité ne correspond à ces filtres.
													</p>
												</div>
											) : (
												filteredCves.map((cve) => {
													const isChecked = selectedKeys.has(cve.cve);
													const ref = cve.ref || cve.cve;
													const id = `cve-chk-${cve.cve.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
													const firstSeen = getCveFirstSeenDate(cve);
													const lastAudit = getCveAnalysisDate(cve);
													const projects = Array.from(
														new Set(cve.occurrences.map((o) => o.projectName)),
													);
													const pkgName = cve.occurrences[0]?.package;

													return (
														<div
															key={cve.cve}
															className={cn(
																"flex items-start gap-2.5 p-2 rounded-md border text-xs transition-colors select-none",
																isChecked
																	? "border-primary/50 bg-primary/5"
																	: "border-border/60 hover:bg-muted/30",
															)}
														>
															<Checkbox
																id={id}
																checked={isChecked}
																onCheckedChange={() => handleToggle(cve.cve)}
																className="mt-0.5 shrink-0"
																aria-label={ref}
															/>

															<label
																htmlFor={id}
																className="flex-1 min-w-0 space-y-1 cursor-pointer"
															>
																<div className="flex items-center justify-between gap-1.5 flex-wrap">
																	<span className="font-mono font-bold text-foreground truncate">
																		{ref}
																	</span>
																	<span
																		className={cn(
																			"rounded px-1.5 py-0.5 text-[10px] font-bold uppercase border shrink-0",
																			SEVERITY_COLORS[cve.worst],
																		)}
																	>
																		{SEVERITY_LABELS[cve.worst] ?? cve.worst}
																	</span>
																</div>

																<div className="flex items-center gap-1.5 text-muted-foreground truncate">
																	{pkgName && (
																		<span className="font-mono text-primary/80 font-medium">
																			{pkgName}
																		</span>
																	)}
																	{projects.length > 0 && (
																		<span className="truncate">
																			({projects.join(", ")})
																		</span>
																	)}
																</div>

																{/* Dates : Apparition & Analyse */}
																<div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-0.5">
																	{firstSeen && (
																		<span
																			title={`Apparue le ${formatDateTime(firstSeen)}`}
																		>
																			Apparue : {relativeAge(firstSeen)}
																		</span>
																	)}
																	{lastAudit && (
																		<span
																			title={`Audité le ${formatDateTime(lastAudit)}`}
																		>
																			Audit : {relativeAge(lastAudit)}
																		</span>
																	)}
																</div>
															</label>
														</div>
													);
												})
											)}
										</div>
									</div>
								)}
							</div>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
