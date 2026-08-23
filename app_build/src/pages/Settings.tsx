import {
	AlertTriangle,
	CheckCircle2,
	Database,
	Download,
	Key,
	RefreshCw,
	Save,
	Settings as SettingsIcon,
	Upload,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SnapshotInfo } from "@/db/backup";
import type { ResetResult } from "@/db/reset";
import { apiErrorMessage, fetchJson, fetchVoid, jsonInit } from "@/lib/api";
import { errorMessage } from "@/lib/utils";
import { ConfirmDialog } from "../components/organisms/ConfirmDialog";
import { TagsManager } from "../components/organisms/TagsManager";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";

export function Settings() {
	const [settings, setSettings] = useState({
		GITHUB_TOKEN: "",
		AUDIT_MAX_AGE_HOURS: "24",
		CRITICAL_ONLY: "false",
		JIRA_BASE_URL: "https://mon-entreprise.atlassian.net",
		JIRA_USER: "",
		JIRA_API_KEY: "",
		JIRA_PROJECT: "",
		JIRA_COMPONENT: "",
		JIRA_ISSUE_TYPE: "Task",
		JIRA_PARENT_EPIC: "",
		GITHUB_RL_LIMIT: "",
		GITHUB_RL_REMAINING: "",
		GITHUB_RL_RESET: "",
		DISABLE_CONSOLE: "false",
	});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saveSuccess, setSaveSuccess] = useState(false);

	const [testJiraLoading, setTestJiraLoading] = useState(false);
	const [testJiraMessage, setTestJiraMessage] = useState<{
		text: string;
		type: "success" | "error";
	} | null>(null);

	// Backup states
	const [backupLoading, setBackupLoading] = useState(false);
	/**
	 * Inventaire des instantanés, et celui que la restauration visera.
	 *
	 * Le bouton « Restaurer » postait un corps **vide** : la route exige un nom de
	 * fichier, elle répondait donc 400 « Fichier requis ». Le bouton était mort
	 * depuis l'interface, et sans liste il n'y avait rien à choisir.
	 */
	const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
	const [snapshotChoisi, setSnapshotChoisi] = useState("");
	const [backupMessage, setBackupMessage] = useState<{
		text: string;
		type: "success" | "error";
	} | null>(null);

	const [clearCacheLoading, setClearCacheLoading] = useState(false);
	const [clearCacheMessage, setClearCacheMessage] = useState<{
		text: string;
		type: "success" | "error";
	} | null>(null);
	/** Échec du chargement des réglages : l'écran doit sortir du chargement. */
	const [loadError, setLoadError] = useState<string | null>(null);
	/** Échec du dernier enregistrement. */
	const [saveError, setSaveError] = useState<string | null>(null);
	/** Remise à zéro : confirmation, exécution, compte rendu. */
	const [resetOpen, setResetOpen] = useState(false);
	const [resetLoading, setResetLoading] = useState(false);
	const [resetDone, setResetDone] = useState<ResetResult | null>(null);
	const [resetError, setResetError] = useState<string | null>(null);
	/**
	 * Les secrets sont en écriture seule : l'API n'en renvoie que l'état. On garde
	 * donc « configuré / non configuré » à part, pour l'afficher sans jamais
	 * détenir la valeur côté client (N5).
	 */
	const [secretsConfigures, setSecretsConfigures] = useState({
		GITHUB_TOKEN: false,
		JIRA_API_KEY: false,
	});

	useEffect(() => {
		fetchJson<Record<string, string>>("/api/settings")
			.then((data) => {
				// Les secrets ne sont plus renvoyés par l'API (N5) : seuls des
				// booléens `<CLÉ>_CONFIGURED` indiquent s'ils sont renseignés. Les
				// champs restent donc vides, et leur placeholder dit l'état.
				setSecretsConfigures({
					GITHUB_TOKEN: data.GITHUB_TOKEN_CONFIGURED === "true",
					JIRA_API_KEY: data.JIRA_API_KEY_CONFIGURED === "true",
				});
				setSettings({
					GITHUB_TOKEN: "",
					AUDIT_MAX_AGE_HOURS: data.AUDIT_MAX_AGE_HOURS || "24",
					CRITICAL_ONLY: data.CRITICAL_ONLY || "false",
					JIRA_BASE_URL:
						data.JIRA_BASE_URL || "https://mon-entreprise.atlassian.net",
					JIRA_USER: data.JIRA_USER || "",
					JIRA_API_KEY: "",
					JIRA_PROJECT: data.JIRA_PROJECT || "",
					JIRA_COMPONENT: data.JIRA_COMPONENT || "",
					JIRA_ISSUE_TYPE: data.JIRA_ISSUE_TYPE || "Task",
					JIRA_PARENT_EPIC: data.JIRA_PARENT_EPIC || "",
					GITHUB_RL_LIMIT: data.GITHUB_RL_LIMIT || "",
					GITHUB_RL_REMAINING: data.GITHUB_RL_REMAINING || "",
					GITHUB_RL_RESET: data.GITHUB_RL_RESET || "",
					DISABLE_CONSOLE: data.DISABLE_CONSOLE || "false",
				});
				setLoading(false);
			})
			// N6 : la chaîne n'avait aucun `.catch`, et `setLoading(false)` était
			// **dans** le `then`. Un serveur indisponible produisait donc un rejet non
			// capturé et un écran bloqué sur son indicateur de chargement, sans
			// message ni recours. Ce chemin était même intestable : le rejet non
			// capturé faisait échouer le fichier de test entier.
			.catch((e: unknown) => {
				setLoadError(apiErrorMessage(e));
				setLoading(false);
			});
	}, []);

	const handleReset = async () => {
		setResetLoading(true);
		setResetError(null);
		try {
			const data = await fetchJson<{ reset: ResetResult }>(
				"/api/config/reset",
				{ method: "POST" },
			);
			setResetDone(data.reset);
			setResetOpen(false);
		} catch (e: unknown) {
			setResetError(apiErrorMessage(e));
			setResetOpen(false);
		} finally {
			setResetLoading(false);
		}
	};

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		setSaveSuccess(false);
		try {
			await fetchVoid("/api/settings", jsonInit("PUT", settings));
			setSaveSuccess(true);
			setSaveError(null);
			setTimeout(() => setSaveSuccess(false), 2000);
		} catch (err) {
			// Un enregistrement perdu en silence est pire qu'un échec visible :
			// l'utilisateur repart en croyant sa configuration appliquée.
			setSaveError(apiErrorMessage(err));
		} finally {
			setSaving(false);
		}
	};

	const chargerSnapshots = useCallback(async () => {
		try {
			const data = await fetchJson<{ snapshots: SnapshotInfo[] }>(
				"/api/snapshots",
			);
			setSnapshots(data.snapshots);
			// Présélectionner le plus récent : c'est le choix attendu dans la quasi-
			// totalité des cas, et cela évite un 400 sur un champ vide.
			setSnapshotChoisi((courant) =>
				data.snapshots.some((s) => s.file === courant)
					? courant
					: (data.snapshots[0]?.file ?? ""),
			);
		} catch {
			// Accessoire : l'absence d'inventaire n'empêche pas de régler le reste.
			setSnapshots([]);
		}
	}, []);

	useEffect(() => {
		chargerSnapshots();
	}, [chargerSnapshots]);

	const handleCreateSnapshot = async () => {
		setBackupLoading(true);
		setBackupMessage(null);
		try {
			const data = await fetchJson<{ file: string; snapshots: SnapshotInfo[] }>(
				"/api/snapshots/create",
				{ method: "POST" },
			);
			setSnapshots(data.snapshots);
			setSnapshotChoisi(data.file);
			setBackupMessage({
				text: `Snapshot créé : ${data.file}`,
				type: "success",
			});
		} catch (err: unknown) {
			setBackupMessage({ text: apiErrorMessage(err), type: "error" });
		} finally {
			setBackupLoading(false);
		}
	};

	const handleRestoreSnapshot = async () => {
		if (!snapshotChoisi) return;
		setBackupLoading(true);
		setBackupMessage(null);
		try {
			const data = await fetchJson<{
				preRestore: string | null;
				snapshots: SnapshotInfo[];
			}>("/api/snapshots/restore", jsonInit("POST", { file: snapshotChoisi }));
			setSnapshots(data.snapshots);
			setBackupMessage({
				// Le filet est nommé : c'est le seul moyen de revenir en arrière, et il
				// n'existait pas avant — une restauration était irréversible.
				text: data.preRestore
					? `Base restaurée depuis ${snapshotChoisi}. Retour arrière possible avec ${data.preRestore}.`
					: `Base restaurée depuis ${snapshotChoisi}.`,
				type: "success",
			});
		} catch (err: unknown) {
			setBackupMessage({ text: apiErrorMessage(err), type: "error" });
		} finally {
			setBackupLoading(false);
		}
	};

	const handleExportJSON = async () => {
		window.open("/api/config/export", "_blank");
	};

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [importLoading, setImportLoading] = useState(false);

	const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setImportLoading(true);
		setBackupMessage(null);
		try {
			const text = await file.text();
			const json = JSON.parse(text);

			const data = await fetchJson<{ success?: boolean }>(
				"/api/config/import",
				jsonInit("POST", json),
			);
			if (data.success) {
				setBackupMessage({
					text: "Configuration importée avec succès. Veuillez rafraîchir la page.",
					type: "success",
				});
			} else {
				throw new Error("Erreur lors de l'import");
			}
		} catch (err: unknown) {
			setBackupMessage({ text: apiErrorMessage(err), type: "error" });
		} finally {
			setImportLoading(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	};

	const handleTestJira = async () => {
		setTestJiraLoading(true);
		setTestJiraMessage(null);
		try {
			// N4 : la route lit la configuration **enregistrée**. Lui passer l'URL et
			// les identifiants dans le corps en faisait un proxy sortant
			// authentifié. Il faut donc enregistrer avant de tester.
			const res = await fetch("/api/tickets/test-connection", {
				method: "POST",
			});
			const data = await res.json();
			if (data.success) {
				setTestJiraMessage({
					text: `Connexion réussie ! (Bonjour ${data.user})`,
					type: "success",
				});
			} else {
				setTestJiraMessage({
					text: data.error || "Erreur de connexion",
					type: "error",
				});
			}
		} catch (err: unknown) {
			setTestJiraMessage({ text: errorMessage(err), type: "error" });
		} finally {
			setTestJiraLoading(false);
		}
	};

	return (
		<div className="flex-1 w-full max-w-4xl mx-auto mt-8 z-10">
			<div className="flex items-center gap-3 mb-8">
				<div className="w-10 h-10 rounded-xl flex items-center justify-center border">
					<SettingsIcon className="w-5 h-5 text-primary" />
				</div>
				<div>
					<h2 className="text-3xl font-bold font-heading">Paramètres</h2>
					<p className="text-muted-foreground mt-1">
						Configurez le comportement du moteur d'audit Aegis.
					</p>
				</div>
			</div>

			{loading ? (
				<div className="flex justify-center p-12">
					<RefreshCw className="w-8 h-8 text-primary animate-spin" />
				</div>
			) : loadError ? (
				/* N6 : cet écran restait bloqué sur son indicateur de chargement,
				   sans message ni recours, dès que le serveur était indisponible. */
				<div
					role="alert"
					className="border border-red-500/50 bg-red-500/10 p-8 rounded-2xl flex flex-col items-center gap-4 text-center"
				>
					<p className="font-semibold">
						Impossible de charger les réglages : {loadError}
					</p>
					<Button variant="outline" onClick={() => window.location.reload()}>
						Recharger
					</Button>
				</div>
			) : (
				<form onSubmit={handleSave} className="space-y-6">
					<div className="bg-card border-border p-6 rounded-2xl flex flex-col gap-6">
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-2">
								<Key className="w-5 h-5" />
								<label htmlFor="github-token" className="text-lg font-bold">
									Jeton GitHub (API)
								</label>
							</div>
							<p className="text-sm text-muted-foreground mb-2">
								Nécessaire pour interroger la base <i>GitHub Advisory</i>{" "}
								(contournement des limites de taux) et enrichir les CVEs avec
								les scores CVSS réels.
							</p>
							<Input
								id="github-token"
								type="password"
								value={settings.GITHUB_TOKEN}
								onChange={(e) =>
									setSettings({ ...settings, GITHUB_TOKEN: e.target.value })
								}
								className="font-mono"
								placeholder={
									secretsConfigures.GITHUB_TOKEN
										? "Jeton enregistré — saisir pour le remplacer"
										: "ghp_xxxxxxxxxxxxxxxxxxxx"
								}
							/>
							{settings.GITHUB_RL_LIMIT && (
								<div className="mt-2 text-xs flex gap-4 text-muted-foreground  p-2.5 rounded-lg border w-fit">
									<span>
										Quota API GitHub :{" "}
										<strong
											className={
												Number(settings.GITHUB_RL_REMAINING) === 0
													? "text-red-600 dark:text-red-400"
													: "text-green-600 dark:text-green-400"
											}
										>
											{settings.GITHUB_RL_REMAINING} /{" "}
											{settings.GITHUB_RL_LIMIT}
										</strong>
									</span>
									{settings.GITHUB_RL_RESET && (
										<span>
											Reset :{" "}
											{new Date(
												Number(settings.GITHUB_RL_RESET) * 1000,
											).toLocaleString("fr-FR")}
										</span>
									)}
								</div>
							)}

							<div className="mt-4 flex items-center justify-between  p-4 rounded-xl border">
								<div>
									<h4 className="font-bold text-sm">
										Cache GitHub Advisory (GHSA)
									</h4>
									<p className="text-xs text-muted-foreground mt-1">
										Vider le cache force l'application à re-télécharger les
										informations des CVEs depuis GitHub lors du prochain audit.
									</p>
								</div>
								<Button
									type="button"
									variant="destructive"
									onClick={async () => {
										setClearCacheLoading(true);
										setClearCacheMessage(null);
										try {
											const data = await fetchJson<{
												success?: boolean;
											}>("/api/advisories/cache", { method: "DELETE" });
											if (data.success) {
												setClearCacheMessage({
													text: "Cache GHSA vidé avec succès",
													type: "success",
												});
											} else {
												setClearCacheMessage({
													text: "Erreur lors du nettoyage du cache",
													type: "error",
												});
											}
										} catch (e: unknown) {
											setClearCacheMessage({
												text: apiErrorMessage(e),
												type: "error",
											});
										} finally {
											setClearCacheLoading(false);
											setTimeout(() => setClearCacheMessage(null), 5000);
										}
									}}
									disabled={clearCacheLoading}
								>
									{clearCacheLoading ? "Nettoyage..." : "Vider le cache"}
								</Button>
							</div>
							{clearCacheMessage && (
								<div
									className={`text-sm px-3 py-2 rounded-md ${clearCacheMessage.type === "success" ? "bg-green-500/20 border " : "bg-red-500/20 border "}`}
								>
									{clearCacheMessage.text}
								</div>
							)}
						</div>

						<hr className="border-border" />

						<div className="flex flex-col gap-2">
							<label htmlFor="audit-max-age" className="text-lg font-bold">
								Cache d'Audit (Heures)
							</label>
							<p className="text-sm text-muted-foreground mb-2">
								Durée pendant laquelle un projet dont l'état Git n'a pas changé
								ne sera pas ré-audité inutilement.
							</p>
							<Input
								id="audit-max-age"
								type="number"
								value={settings.AUDIT_MAX_AGE_HOURS}
								onChange={(e) =>
									setSettings({
										...settings,
										AUDIT_MAX_AGE_HOURS: e.target.value,
									})
								}
								className="w-32"
								min="0"
								step="1"
							/>
						</div>

						<div className="flex flex-col gap-2">
							<span className="text-lg font-bold">Options Globales</span>

							<label
								htmlFor="critical-only"
								className="flex items-center gap-3 cursor-pointer mt-2"
							>
								<Switch
									id="critical-only"
									checked={settings.CRITICAL_ONLY === "true"}
									onCheckedChange={(checked) =>
										setSettings({
											...settings,
											CRITICAL_ONLY: checked ? "true" : "false",
										})
									}
								/>
								<span className="text-sm font-medium text-muted-foreground">
									Mode Silencieux (N'afficher que les CVEs Critical/High)
								</span>
							</label>

							<label
								htmlFor="disable-console"
								className="flex items-center gap-3 cursor-pointer mt-2"
							>
								<Switch
									id="disable-console"
									checked={settings.DISABLE_CONSOLE === "true"}
									onCheckedChange={(checked) =>
										setSettings({
											...settings,
											DISABLE_CONSOLE: checked ? "true" : "false",
										})
									}
								/>
								<span className="text-sm font-medium text-muted-foreground">
									Désactiver la Console (Coupe le broadcast SSE et allège les
									performances frontend)
								</span>
							</label>
						</div>

						<div className="flex flex-col gap-2">
							<label htmlFor="jira-base-url" className="text-lg font-bold">
								Base URL Jira
							</label>
							<p className="text-sm text-muted-foreground mb-2">
								Adresse de votre instance Jira (sans le /browse/).
							</p>
							<Input
								id="jira-base-url"
								type="text"
								value={settings.JIRA_BASE_URL}
								onChange={(e) =>
									setSettings({ ...settings, JIRA_BASE_URL: e.target.value })
								}
								placeholder="https://votre-entreprise.atlassian.net"
							/>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div className="flex flex-col gap-2">
								<label htmlFor="jira-user" className="text-sm font-bold">
									Utilisateur Jira (Email)
								</label>
								<Input
									id="jira-user"
									type="email"
									value={settings.JIRA_USER}
									onChange={(e) =>
										setSettings({ ...settings, JIRA_USER: e.target.value })
									}
									placeholder="jean.dupont@entreprise.com"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label htmlFor="jira-api-key" className="text-sm font-bold">
									Clé d'API Jira (Token)
								</label>
								<Input
									id="jira-api-key"
									type="password"
									value={settings.JIRA_API_KEY}
									onChange={(e) =>
										setSettings({ ...settings, JIRA_API_KEY: e.target.value })
									}
									className="font-mono"
									placeholder={
										secretsConfigures.JIRA_API_KEY
											? "Clé enregistrée — saisir pour la remplacer"
											: "ATATT3xFfGF0..."
									}
								/>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div className="flex flex-col gap-2">
								<label htmlFor="jira-project" className="text-sm font-bold">
									Projet Jira (Clé ou ID)
								</label>
								<Input
									id="jira-project"
									type="text"
									value={settings.JIRA_PROJECT}
									onChange={(e) =>
										setSettings({ ...settings, JIRA_PROJECT: e.target.value })
									}
									className="uppercase"
									placeholder="SEC"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label htmlFor="jira-component" className="text-sm font-bold">
									Composant Jira (Optionnel)
								</label>
								<Input
									id="jira-component"
									type="text"
									value={settings.JIRA_COMPONENT}
									onChange={(e) =>
										setSettings({ ...settings, JIRA_COMPONENT: e.target.value })
									}
									placeholder="ex: 10452"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label htmlFor="jira-issue-type" className="text-sm font-bold">
									Type de ticket (Optionnel)
								</label>
								<Input
									id="jira-issue-type"
									type="text"
									value={settings.JIRA_ISSUE_TYPE}
									onChange={(e) =>
										setSettings({
											...settings,
											JIRA_ISSUE_TYPE: e.target.value,
										})
									}
									placeholder="Task ou Bug"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label htmlFor="jira-parent-epic" className="text-sm font-bold">
									Epic Parente (Clé)
								</label>
								<Input
									id="jira-parent-epic"
									type="text"
									value={settings.JIRA_PARENT_EPIC}
									onChange={(e) =>
										setSettings({
											...settings,
											JIRA_PARENT_EPIC: e.target.value,
										})
									}
									className="uppercase"
									placeholder="SEC-42"
								/>
								<p className="text-xs text-muted-foreground">
									Les tickets créés seront automatiquement rattachés à cette
									Epic.
								</p>
							</div>
						</div>

						<div className="flex items-center gap-4 mt-2">
							<Button
								type="button"
								variant="secondary"
								onClick={handleTestJira}
								disabled={
									testJiraLoading ||
									!settings.JIRA_BASE_URL ||
									!settings.JIRA_USER ||
									!secretsConfigures.JIRA_API_KEY
								}
							>
								{testJiraLoading ? (
									<RefreshCw className="w-4 h-4 mr-2" />
								) : (
									<RefreshCw className="w-4 h-4 mr-2" />
								)}
								Tester la connexion Jira
							</Button>
							{testJiraMessage && (
								<span
									className={`text-sm font-medium ${testJiraMessage.type === "success" ? "text-green-500" : "text-red-500"}`}
								>
									{testJiraMessage.text}
								</span>
							)}
						</div>
					</div>

					<hr className="border-border" />

					<div className="flex flex-col gap-2 rounded-2xl border border-red-500/50 bg-red-500/5 p-6">
						<span className="text-lg font-bold">Zone de danger</span>
						<p className="text-sm text-muted-foreground">
							Remet la configuration à zéro pour repartir d'un import de projets
							propre.
						</p>
						<ul className="mt-2 text-sm text-muted-foreground list-disc pl-5">
							<li>
								<strong>Supprimé</strong> : projets déclarés, historiques
								d'audit, décisions de triage, liens de tickets, catalogue de
								tags, bibliothèque de prompts, compte-rendus, et tous les
								réglages.
							</li>
							<li>
								<strong>Conservé</strong> : la clé GHSA, et le cache d'avis
								GitHub — vidable séparément ci-dessus.
							</li>
							<li>
								<strong>Jamais touché</strong> : vos projets sur le disque.
								Seule la base d'Aegis est vidée.
							</li>
						</ul>

						{resetDone ? (
							<div
								role="status"
								className="mt-4 rounded-xl border bg-background/50 p-4 text-sm"
							>
								<p className="font-semibold">Configuration remise à zéro.</p>
								<p className="text-muted-foreground mt-1">
									La base d'Aegis a été recréée vide.{" "}
									{resetDone.projects > 0
										? `${resetDone.projects} projet${resetDone.projects > 1 ? "s" : ""} déclaré${resetDone.projects > 1 ? "s" : ""} ${resetDone.projects > 1 ? "ont" : "a"} été retiré${resetDone.projects > 1 ? "s" : ""} du suivi — les dossiers sur le disque sont intacts.`
										: "Aucun projet n'était déclaré."}{" "}
									La clé GHSA et le cache d'avis sont conservés : ils vivent
									dans un fichier séparé.
								</p>
								<Button
									type="button"
									variant="outline"
									className="mt-3"
									onClick={() => window.location.reload()}
								>
									Recharger l'application
								</Button>
							</div>
						) : (
							<div className="mt-4 flex items-center gap-4">
								<Button
									type="button"
									variant="destructive"
									disabled={resetLoading}
									onClick={() => setResetOpen(true)}
								>
									{resetLoading
										? "Remise à zéro..."
										: "Remettre la configuration à zéro"}
								</Button>
								{resetError && (
									<span role="alert" className="text-sm text-red-500">
										{resetError}
									</span>
								)}
							</div>
						)}
					</div>

					<div className="flex justify-end items-center gap-4">
						{saveSuccess && (
							<span className="text-sm font-medium slide-in-from-right-4">
								Paramètres sauvegardés avec succès !
							</span>
						)}
						{saveError && (
							<span role="alert" className="text-sm font-medium text-red-500">
								Échec de l'enregistrement : {saveError}
							</span>
						)}
						<Button
							type="submit"
							size="lg"
							disabled={saving}
							className="shadow-lg"
						>
							{saving ? (
								<RefreshCw className="w-5 h-5 mr-2" />
							) : (
								<Save className="w-5 h-5 mr-2" />
							)}
							Enregistrer
						</Button>
					</div>
				</form>
			)}

			<TagsManager />

			<div className="bg-card border-border p-8 rounded-2xl slide-in-from-bottom-6 delay-300 mt-8">
				<h3 className="text-xl font-bold font-heading mb-6 flex items-center gap-2">
					<Database className="w-5 h-5 text-primary" />
					Sauvegarde & Restauration
				</h3>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
					<div className="flex flex-col gap-4">
						<h4 className="font-semibold text-lg">
							Snapshots SQLite (Recommandé)
						</h4>
						<p className="text-sm text-muted-foreground">
							Crée une copie parfaite (VACUUM INTO) de la base de données.
							Pratique avant une migration. Un instantané de l'état courant est
							pris automatiquement avant toute restauration.
						</p>

						<label
							htmlFor="snapshot-a-restaurer"
							className="text-sm font-medium mt-2"
						>
							Instantané à restaurer
						</label>
						<select
							id="snapshot-a-restaurer"
							value={snapshotChoisi}
							onChange={(e) => setSnapshotChoisi(e.target.value)}
							disabled={backupLoading || snapshots.length === 0}
							className="h-9 rounded-md border border-border bg-background px-3 text-sm font-mono disabled:opacity-50"
						>
							{snapshots.length === 0 && (
								<option value="">Aucun instantané disponible</option>
							)}
							{snapshots.map((s) => (
								<option key={s.file} value={s.file}>
									{s.file} — {s.counts.projects} projets, {s.counts.runs} runs
								</option>
							))}
						</select>

						<div className="flex gap-3 mt-2">
							<Button
								type="button"
								variant="secondary"
								onClick={handleCreateSnapshot}
								disabled={backupLoading}
							>
								Créer Snapshot
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={handleRestoreSnapshot}
								disabled={backupLoading || !snapshotChoisi}
								className="text-red-600 dark:text-red-400"
							>
								<AlertTriangle className="w-4 h-4 mr-2" /> Restaurer
							</Button>
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<h4 className="font-semibold text-lg">Export JSON</h4>
						<p className="text-sm text-muted-foreground">
							Exporte vos projets, annotations et réglages au format JSON
							lisible.
						</p>
						<div className="flex gap-3 mt-2">
							<input
								type="file"
								accept=".json"
								className="hidden"
								ref={fileInputRef}
								onChange={handleImportJSON}
							/>
							<Button
								type="button"
								variant="secondary"
								onClick={() => fileInputRef.current?.click()}
								disabled={importLoading}
							>
								{importLoading ? (
									<RefreshCw className="w-4 h-4 mr-2" />
								) : (
									<Upload className="w-4 h-4 mr-2" />
								)}{" "}
								Importer JSON
							</Button>
							<Button
								type="button"
								variant="secondary"
								onClick={handleExportJSON}
							>
								<Download className="w-4 h-4 mr-2" /> Exporter JSON
							</Button>
						</div>
					</div>
				</div>

				{backupMessage && (
					<div
						className={`mt-6 p-4 rounded-lg border ${backupMessage.type === "error" ? "bg-red-500/10 " : "bg-green-500/10 "} flex items-center gap-2`}
					>
						{backupMessage.type === "error" ? (
							<AlertTriangle className="w-5 h-5" />
						) : (
							<CheckCircle2 className="w-5 h-5" />
						)}
						{backupMessage.text}
					</div>
				)}
			</div>

			<ConfirmDialog
				isOpen={resetOpen}
				title="Remettre la configuration à zéro ?"
				message="Les projets déclarés, leurs historiques d'audit, vos décisions de triage, les tags, les prompts et les compte-rendus seront supprimés. La clé GHSA et le cache d'avis sont conservés. Vos projets sur le disque ne sont pas touchés. Cette action est irréversible."
				confirmText="Tout supprimer"
				cancelText="Annuler"
				onConfirm={handleReset}
				onCancel={() => setResetOpen(false)}
			/>
		</div>
	);
}
