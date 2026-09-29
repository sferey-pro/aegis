import { Key, RefreshCw } from "lucide-react";
import React, { useState } from "react";
import { SettingsSection } from "@/components/organisms/SettingsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiErrorMessage, fetchVoid, jsonInit } from "@/lib/api";
import { useSettings } from "@/lib/api/queries";

export function TabConnections() {
	const { data: settingsData, refetch } = useSettings();
	const [settings, setSettings] = useState<Record<string, string>>({});
	const [enregistre, setEnregistre] = useState<Record<string, string>>({});
	const [sectionEnCours, setSectionEnCours] = useState<string | null>(null);
	const [sectionErreur, setSectionErreur] = useState<{
		section: string;
		message: string;
	} | null>(null);

	const [testJiraLoading, setTestJiraLoading] = useState(false);
	const [testJiraMessage, setTestJiraMessage] = useState<{
		text: string;
		type: "success" | "error";
	} | null>(null);

	const [clearCacheLoading, setClearCacheLoading] = useState(false);
	const [clearCacheMessage, setClearCacheMessage] = useState<{
		text: string;
		type: "success" | "error";
	} | null>(null);

	// Initialize local state when settingsData arrives
	React.useEffect(() => {
		if (settingsData && Object.keys(enregistre).length === 0) {
			setSettings(settingsData);
			setEnregistre(settingsData);
		}
	}, [settingsData, enregistre]);

	const sectionModifiee = (section: string) => {
		if (section === "github")
			return settings.GITHUB_TOKEN !== enregistre.GITHUB_TOKEN;
		if (section === "remote")
			return settings.REMOTE_TOKEN !== enregistre.REMOTE_TOKEN;
		if (section === "jira") {
			return (
				settings.JIRA_BASE_URL !== enregistre.JIRA_BASE_URL ||
				settings.JIRA_USER !== enregistre.JIRA_USER ||
				settings.JIRA_API_KEY !== enregistre.JIRA_API_KEY
			);
		}
		return false;
	};

	const handleSave = async (
		section: string,
		payload: Record<string, string>,
	) => {
		setSectionEnCours(section);
		setSectionErreur(null);
		try {
			await fetchVoid("/api/settings", jsonInit("PUT", payload));
			await refetch();
			setEnregistre((prev) => ({ ...prev, ...payload }));
		} catch (err) {
			setSectionErreur({ section, message: apiErrorMessage(err) });
		} finally {
			setSectionEnCours(null);
		}
	};

	const handleTestJira = async () => {
		setTestJiraLoading(true);
		setTestJiraMessage(null);
		try {
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
			setTestJiraMessage({ text: apiErrorMessage(err), type: "error" });
		} finally {
			setTestJiraLoading(false);
		}
	};

	const handleChange = (key: string, value: string) => {
		setSettings((prev) => ({ ...prev, [key]: value }));
	};

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection
				titre="Jeton GitHub"
				icone={<Key className="w-5 h-5 text-primary" />}
				description="Interrogation de la base GitHub Advisory, et quota associé."
				modifie={sectionModifiee("github")}
				enregistrement={sectionEnCours === "github"}
				succes={
					!sectionModifiee("github") && Object.keys(enregistre).length > 0
				}
				erreur={
					sectionErreur?.section === "github" ? sectionErreur.message : null
				}
				onSave={() =>
					handleSave("github", { GITHUB_TOKEN: settings.GITHUB_TOKEN || "" })
				}
			>
				<div className="flex flex-col gap-1">
					<label htmlFor="github-token" className="text-sm font-bold">
						Jeton d'accès personnel
					</label>
					<Input
						id="github-token"
						type="password"
						placeholder="ghp_..."
						value={settings.GITHUB_TOKEN || ""}
						onChange={(e) => handleChange("GITHUB_TOKEN", e.target.value)}
					/>
				</div>

				<div className="flex flex-col gap-2 mt-4 border-t pt-4">
					<div className="flex items-center justify-between">
						<div>
							<span className="font-semibold text-sm">Cache d'avis GitHub</span>
							<p className="text-xs text-muted-foreground">
								Les réponses de l'API GitHub Advisory sont mises en cache pour
								économiser le quota.
							</p>
						</div>
						<Button
							type="button"
							variant="secondary"
							onClick={async () => {
								setClearCacheLoading(true);
								setClearCacheMessage(null);
								try {
									await fetchVoid("/api/settings/cache", { method: "DELETE" });
									setClearCacheMessage({
										text: "Cache vidé avec succès.",
										type: "success",
									});
								} catch (err) {
									setClearCacheMessage({
										text: apiErrorMessage(err),
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
							className={`text-sm px-3 py-2 rounded-md ${clearCacheMessage.type === "success" ? "bg-green-500/10 text-green-600 border border-green-500/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}
						>
							{clearCacheMessage.text}
						</div>
					)}
				</div>

				<div className="flex items-center gap-4 mt-2">
					<Button
						type="button"
						variant="secondary"
						onClick={handleTestJira}
						disabled={
							testJiraLoading ||
							!enregistre.JIRA_BASE_URL ||
							!enregistre.JIRA_USER ||
							(!enregistre.JIRA_API_KEY &&
								enregistre.JIRA_API_KEY_CONFIGURED !== "true")
						}
					>
						<RefreshCw
							className={`w-4 h-4 mr-2 ${testJiraLoading ? "animate-spin" : ""}`}
						/>
						Tester la connexion Jira
					</Button>
					{testJiraMessage && (
						<span
							className={`text-sm font-medium ${testJiraMessage.type === "success" ? "text-green-500" : "text-destructive"}`}
						>
							{testJiraMessage.text}
						</span>
					)}
				</div>
			</SettingsSection>

			<SettingsSection
				titre="Projets Distants"
				icone={<Key className="w-5 h-5 text-primary" />}
				description="Authentification pour récupérer le code distant (Entreprise)."
				modifie={sectionModifiee("remote")}
				enregistrement={sectionEnCours === "remote"}
				succes={
					!sectionModifiee("remote") && Object.keys(enregistre).length > 0
				}
				erreur={
					sectionErreur?.section === "remote" ? sectionErreur.message : null
				}
				onSave={() =>
					handleSave("remote", { REMOTE_TOKEN: settings.REMOTE_TOKEN || "" })
				}
			>
				<div className="flex flex-col gap-1">
					<label htmlFor="remote-token" className="text-sm font-bold">
						Jeton (GitLab, GitHub Enterprise, etc.)
					</label>
					<Input
						id="remote-token"
						type="password"
						placeholder="glpat-... ou ghp_..."
						value={settings.REMOTE_TOKEN || ""}
						onChange={(e) => handleChange("REMOTE_TOKEN", e.target.value)}
					/>
				</div>
			</SettingsSection>

			<SettingsSection
				titre="Intégration Jira"
				icone={<Key className="w-5 h-5 text-primary" />}
				description="Identifiants et cible des tickets de remédiation."
				modifie={sectionModifiee("jira")}
				enregistrement={sectionEnCours === "jira"}
				succes={!sectionModifiee("jira") && Object.keys(enregistre).length > 0}
				erreur={
					sectionErreur?.section === "jira" ? sectionErreur.message : null
				}
				onSave={() =>
					handleSave("jira", {
						JIRA_BASE_URL: settings.JIRA_BASE_URL || "",
						JIRA_USER: settings.JIRA_USER || "",
						JIRA_API_KEY: settings.JIRA_API_KEY || "",
					})
				}
			>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<label htmlFor="jira-url" className="text-sm font-bold">
							URL de base
						</label>
						<Input
							id="jira-url"
							type="url"
							placeholder="https://votre-domaine.atlassian.net"
							value={settings.JIRA_BASE_URL || ""}
							onChange={(e) => handleChange("JIRA_BASE_URL", e.target.value)}
						/>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="flex flex-col gap-1">
							<label htmlFor="jira-user" className="text-sm font-bold">
								Email utilisateur
							</label>
							<Input
								id="jira-user"
								type="email"
								placeholder="utilisateur@domaine.com"
								value={settings.JIRA_USER || ""}
								onChange={(e) => handleChange("JIRA_USER", e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="jira-token" className="text-sm font-bold">
								Jeton d'API
							</label>
							<Input
								id="jira-token"
								type="password"
								placeholder="ATATT3..."
								value={settings.JIRA_API_KEY || ""}
								onChange={(e) => handleChange("JIRA_API_KEY", e.target.value)}
							/>
						</div>
					</div>
				</div>
			</SettingsSection>
		</div>
	);
}
