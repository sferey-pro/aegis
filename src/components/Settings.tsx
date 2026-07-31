import {
	AlertTriangle,
	CheckCircle2,
	Database,
	Download,
	Key,
	RefreshCw,
	Save,
	Settings as SettingsIcon,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { TagsManager } from "./TagsManager";

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
	const [testJiraMessage, setTestJiraMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

	// Backup states
	const [backupLoading, setBackupLoading] = useState(false);
	const [backupMessage, setBackupMessage] = useState<{
		text: string;
		type: "success" | "error";
	} | null>(null);

	const [clearCacheLoading, setClearCacheLoading] = useState(false);
	const [clearCacheMessage, setClearCacheMessage] = useState<{
		text: string;
		type: "success" | "error";
	} | null>(null);

	useEffect(() => {
		fetch("/api/settings")
			.then((r) => r.json())
			.then((data) => {
				setSettings({
					GITHUB_TOKEN: data.GITHUB_TOKEN || "",
					AUDIT_MAX_AGE_HOURS: data.AUDIT_MAX_AGE_HOURS || "24",
					CRITICAL_ONLY: data.CRITICAL_ONLY || "false",
					JIRA_BASE_URL:
						data.JIRA_BASE_URL || "https://mon-entreprise.atlassian.net",
					JIRA_USER: data.JIRA_USER || "",
					JIRA_API_KEY: data.JIRA_API_KEY || "",
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
			});
	}, []);

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		setSaveSuccess(false);
		try {
			await fetch("/api/settings", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(settings),
			});
			setSaveSuccess(true);
			setTimeout(() => setSaveSuccess(false), 2000);
		} catch (err) {
			console.error(err);
		} finally {
			setSaving(false);
		}
	};

	const handleSnapshot = async (action: "create" | "restore") => {
		setBackupLoading(true);
		setBackupMessage(null);
		try {
			const res = await fetch(`/api/snapshots/${action}`, { method: "POST" });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Erreur serveur");
			setBackupMessage({
				text:
					action === "create" ? `Snapshot créé (${data.path})` : data.message,
				type: "success",
			});
		} catch (err: any) {
			setBackupMessage({ text: err.message, type: "error" });
		} finally {
			setBackupLoading(false);
		}
	};

	const handleExportJSON = async () => {
		window.open("/api/config/export", "_blank");
	};

	const handleTestJira = async () => {
		setTestJiraLoading(true);
		setTestJiraMessage(null);
		try {
			const res = await fetch("/api/tickets/test-connection", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					baseUrl: settings.JIRA_BASE_URL,
					user: settings.JIRA_USER,
					apiKey: settings.JIRA_API_KEY
				}),
			});
			const data = await res.json();
			if (data.success) {
				setTestJiraMessage({ text: `Connexion réussie ! (Bonjour ${data.user})`, type: "success" });
			} else {
				setTestJiraMessage({ text: data.error || "Erreur de connexion", type: "error" });
			}
		} catch (err: any) {
			setTestJiraMessage({ text: err.message, type: "error" });
		} finally {
			setTestJiraLoading(false);
		}
	};

	return (
		<div className="flex-1 w-full max-w-4xl mx-auto mt-8 z-10 animate-in fade-in duration-500">
			<div className="flex items-center gap-3 mb-8">
				<div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
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
			) : (
				<form onSubmit={handleSave} className="space-y-6">
					<div className="glass-panel p-6 rounded-2xl flex flex-col gap-6">
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-2">
								<Key className="w-5 h-5" />
								<label className="text-lg font-bold">Jeton GitHub (API)</label>
							</div>
							<p className="text-sm text-muted-foreground mb-2">
								Nécessaire pour interroger la base <i>GitHub Advisory</i>{" "}
								(contournement des limites de taux) et enrichir les CVEs avec
								les scores CVSS réels.
							</p>
							<input
								type="password"
								value={settings.GITHUB_TOKEN}
								onChange={(e) =>
									setSettings({ ...settings, GITHUB_TOKEN: e.target.value })
								}
								className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors font-mono"
								placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
							/>
							{settings.GITHUB_RL_LIMIT && (
								<div className="mt-2 text-xs flex gap-4 text-muted-foreground bg-black/5 dark:bg-black/20 p-2.5 rounded-lg border border-white/5 w-fit">
									<span>
										Quota API GitHub :{" "}
										<strong
											className={
												Number(settings.GITHUB_RL_REMAINING) === 0
													? "text-red-400"
													: "text-green-400"
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

							<div className="mt-4 flex items-center justify-between bg-black/5 dark:bg-black/20 p-4 rounded-xl border border-white/5">
								<div>
									<h4 className="font-bold text-sm">
										Cache GitHub Advisory (GHSA)
									</h4>
									<p className="text-xs text-muted-foreground mt-1">
										Vider le cache force l'application à re-télécharger les
										informations des CVEs depuis GitHub lors du prochain audit.
									</p>
								</div>
								<button
									type="button"
									onClick={async () => {
										setClearCacheLoading(true);
										setClearCacheMessage(null);
										try {
											const res = await fetch("/api/advisories/cache", {
												method: "DELETE",
											});
											const data = await res.json();
											if (data.success) {
												setClearCacheMessage({
													text: "Cache GHSA vidé avec succès",
													type: "success",
												});
											} else {
												setClearCacheMessage({
													text:
														data.error || "Erreur lors du nettoyage du cache",
													type: "error",
												});
											}
										} catch (e: any) {
											setClearCacheMessage({ text: e.message, type: "error" });
										} finally {
											setClearCacheLoading(false);
											setTimeout(() => setClearCacheMessage(null), 5000);
										}
									}}
									disabled={clearCacheLoading}
									className="px-4 py-2 text-sm font-medium rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50"
								>
									{clearCacheLoading ? "Nettoyage..." : "Vider le cache"}
								</button>
							</div>
							{clearCacheMessage && (
								<div
									className={`text-sm px-3 py-2 rounded-md ${clearCacheMessage.type === "success" ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}
								>
									{clearCacheMessage.text}
								</div>
							)}
						</div>

						<hr className="border-border" />

						<div className="flex flex-col gap-2">
							<label className="text-lg font-bold">
								Cache d'Audit (Heures)
							</label>
							<p className="text-sm text-muted-foreground mb-2">
								Durée pendant laquelle un projet dont l'état Git n'a pas changé
								ne sera pas ré-audité inutilement.
							</p>
							<input
								type="number"
								value={settings.AUDIT_MAX_AGE_HOURS}
								onChange={(e) =>
									setSettings({
										...settings,
										AUDIT_MAX_AGE_HOURS: e.target.value,
									})
								}
								className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors w-32"
								min="0"
								step="1"
							/>
						</div>

						<div className="flex flex-col gap-2">
							<label className="text-lg font-bold">Options Globales</label>

							<label className="flex items-center gap-3 cursor-pointer mt-2 group">
								<input
									type="checkbox"
									checked={settings.CRITICAL_ONLY === "true"}
									onChange={(e) =>
										setSettings({
											...settings,
											CRITICAL_ONLY: e.target.checked ? "true" : "false",
										})
									}
									className="w-5 h-5 rounded border-border bg-black/40 text-primary focus:ring-primary focus:ring-offset-background"
								/>
								<span className="text-sm font-medium group-hover:text-white transition-colors">
									Mode Silencieux (N'afficher que les CVEs Critical/High)
								</span>
							</label>

							<label className="flex items-center gap-3 cursor-pointer mt-2 group">
								<input
									type="checkbox"
									checked={settings.DISABLE_CONSOLE === "true"}
									onChange={(e) =>
										setSettings({
											...settings,
											DISABLE_CONSOLE: e.target.checked ? "true" : "false",
										})
									}
									className="w-5 h-5 rounded border-border bg-black/40 text-primary focus:ring-primary focus:ring-offset-background"
								/>
								<span className="text-sm font-medium group-hover:text-white transition-colors">
									Désactiver la Console (Coupe le broadcast SSE et allège les
									performances frontend)
								</span>
							</label>
						</div>

						<div className="flex flex-col gap-2">
							<label className="text-lg font-bold">Base URL Jira</label>
							<p className="text-sm text-muted-foreground mb-2">
								Adresse de votre instance Jira (sans le /browse/).
							</p>
							<input
								type="text"
								value={settings.JIRA_BASE_URL}
								onChange={(e) =>
									setSettings({ ...settings, JIRA_BASE_URL: e.target.value })
								}
								className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors"
								placeholder="https://votre-entreprise.atlassian.net"
							/>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div className="flex flex-col gap-2">
								<label className="text-sm font-bold">
									Utilisateur Jira (Email)
								</label>
								<input
									type="email"
									value={settings.JIRA_USER}
									onChange={(e) =>
										setSettings({ ...settings, JIRA_USER: e.target.value })
									}
									className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors"
									placeholder="jean.dupont@entreprise.com"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label className="text-sm font-bold">
									Clé d'API Jira (Token)
								</label>
								<input
									type="password"
									value={settings.JIRA_API_KEY}
									onChange={(e) =>
										setSettings({ ...settings, JIRA_API_KEY: e.target.value })
									}
									className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors font-mono"
									placeholder="ATATT3xFfGF0..."
								/>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div className="flex flex-col gap-2">
								<label className="text-sm font-bold">
									Projet Jira (Clé ou ID)
								</label>
								<input
									type="text"
									value={settings.JIRA_PROJECT}
									onChange={(e) =>
										setSettings({ ...settings, JIRA_PROJECT: e.target.value })
									}
									className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors uppercase"
									placeholder="SEC"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label className="text-sm font-bold">
									Composant Jira (Optionnel)
								</label>
								<input
									type="text"
									value={settings.JIRA_COMPONENT}
									onChange={(e) =>
										setSettings({ ...settings, JIRA_COMPONENT: e.target.value })
									}
									className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors"
									placeholder="ex: 10452"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label className="text-sm font-bold">
									Type de ticket (Optionnel)
								</label>
								<input
									type="text"
									value={settings.JIRA_ISSUE_TYPE}
									onChange={(e) =>
										setSettings({ ...settings, JIRA_ISSUE_TYPE: e.target.value })
									}
									className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors"
									placeholder="Task ou Bug"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label className="text-sm font-bold">
									Epic Parente (Clé)
								</label>
								<input
									type="text"
									value={settings.JIRA_PARENT_EPIC}
									onChange={(e) =>
										setSettings({ ...settings, JIRA_PARENT_EPIC: e.target.value })
									}
									className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors uppercase"
									placeholder="SEC-42"
								/>
								<p className="text-xs text-muted-foreground">
									Les tickets créés seront automatiquement rattachés à cette Epic.
								</p>
							</div>
						</div>
						
						<div className="flex items-center gap-4 mt-2">
							<button
								type="button"
								onClick={handleTestJira}
								disabled={testJiraLoading || !settings.JIRA_BASE_URL || !settings.JIRA_USER || !settings.JIRA_API_KEY}
								className="px-4 py-2 text-sm font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 flex items-center gap-2"
							>
								{testJiraLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
								Tester la connexion Jira
							</button>
							{testJiraMessage && (
								<span className={`text-sm font-medium ${testJiraMessage.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
									{testJiraMessage.text}
								</span>
							)}
						</div>
					</div>

					<div className="flex justify-end items-center gap-4">
						{saveSuccess && (
							<span className="text-sm text-green-500 font-medium animate-in fade-in slide-in-from-right-4">
								Paramètres sauvegardés avec succès !
							</span>
						)}
						<button
							type="submit"
							disabled={saving}
							className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
						>
							{saving ? (
								<RefreshCw className="w-5 h-5 animate-spin" />
							) : (
								<Save className="w-5 h-5" />
							)}
							Enregistrer
						</button>
					</div>
				</form>
			)}

			<TagsManager />

			<div className="glass-panel p-8 rounded-2xl animate-in slide-in-from-bottom-6 duration-700 delay-300 mt-8">
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
							Pratique avant une migration.
						</p>
						<div className="flex gap-3 mt-2">
							<button
								onClick={() => handleSnapshot("create")}
								disabled={backupLoading}
								className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
							>
								Créer Snapshot
							</button>
							<button
								onClick={() => handleSnapshot("restore")}
								disabled={backupLoading}
								className="flex items-center gap-2 px-4 py-2 rounded-md border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
							>
								<AlertTriangle className="w-4 h-4" /> Restaurer
							</button>
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<h4 className="font-semibold text-lg">Export JSON</h4>
						<p className="text-sm text-muted-foreground">
							Exporte vos projets, annotations et réglages au format JSON
							lisible.
						</p>
						<div className="flex gap-3 mt-2">
							<button
								onClick={handleExportJSON}
								className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
							>
								<Download className="w-4 h-4" /> Exporter JSON
							</button>
						</div>
					</div>
				</div>

				{backupMessage && (
					<div
						className={`mt-6 p-4 rounded-lg border ${backupMessage.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-green-500/10 border-green-500/20 text-green-400"} flex items-center gap-2`}
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
		</div>
	);
}
