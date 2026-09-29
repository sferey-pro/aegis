import { Activity, Settings as SettingsIcon, Shield } from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SettingsSection } from "@/components/organisms/SettingsSection";
import { TagsManager } from "@/components/organisms/TagsManager";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiErrorMessage, fetchVoid, jsonInit } from "@/lib/api";
import { useAuditStatus, useProjects, useSettings } from "@/lib/api/queries";

export function TabAnalysis() {
	const { data: settingsData, refetch } = useSettings();
	const { data: auditStatus } = useAuditStatus();
	const { data: projects = [] } = useProjects();
	const [settings, setSettings] = useState<Record<string, string>>({});
	const [enregistre, setEnregistre] = useState<Record<string, string>>({});
	const [isInitialized, setIsInitialized] = useState(false);
	const [sectionEnCours, setSectionEnCours] = useState<string | null>(null);
	const [sectionErreur, setSectionErreur] = useState<{
		section: string;
		message: string;
	} | null>(null);

	React.useEffect(() => {
		if (settingsData && !isInitialized) {
			setIsInitialized(true);
			setSettings(settingsData);
			setEnregistre(settingsData);
		}
	}, [settingsData, isInitialized]);

	const sectionModifiee = (section: string) => {
		if (section === "audit") {
			return (
				settings.AUDIT_MAX_AGE_HOURS !== enregistre.AUDIT_MAX_AGE_HOURS ||
				settings.CRITICAL_ONLY !== enregistre.CRITICAL_ONLY ||
				settings.DISABLE_CONSOLE !== enregistre.DISABLE_CONSOLE
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

	const handleChange = (key: string, value: string) => {
		setSettings((prev) => ({ ...prev, [key]: value }));
	};

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection
				titre="Paramètres d'Audit"
				icone={<SettingsIcon className="w-5 h-5 text-primary" />}
				description="Fenêtre de fraîcheur et options globales du moteur."
				modifie={sectionModifiee("audit")}
				enregistrement={sectionEnCours === "audit"}
				succes={!sectionModifiee("audit") && Object.keys(enregistre).length > 0}
				erreur={
					sectionErreur?.section === "audit" ? sectionErreur.message : null
				}
				onSave={() =>
					handleSave("audit", {
						AUDIT_MAX_AGE_HOURS: settings.AUDIT_MAX_AGE_HOURS || "24",
						CRITICAL_ONLY: settings.CRITICAL_ONLY || "false",
						DISABLE_CONSOLE: settings.DISABLE_CONSOLE || "false",
					})
				}
			>
				<div className="flex flex-col gap-2">
					<label htmlFor="audit-max-age" className="text-sm font-bold">
						Cache d'Audit (Heures)
					</label>
					<p className="text-sm text-muted-foreground mb-2">
						Durée pendant laquelle un projet dont l'état Git n'a pas changé ne
						sera pas ré-audité inutilement.
					</p>
					<Input
						id="audit-max-age"
						type="number"
						min="0"
						step="1"
						value={settings.AUDIT_MAX_AGE_HOURS || "24"}
						onChange={(e) =>
							handleChange("AUDIT_MAX_AGE_HOURS", e.target.value)
						}
						className="w-32"
					/>
				</div>

				<div className="flex flex-col gap-2 mt-4">
					<span className="text-sm font-bold">Options Globales</span>

					<label
						htmlFor="critical-only"
						className="flex items-center gap-3 cursor-pointer mt-2"
					>
						<Switch
							id="critical-only"
							checked={settings.CRITICAL_ONLY === "true"}
							onCheckedChange={(c) =>
								handleChange("CRITICAL_ONLY", c ? "true" : "false")
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
							onCheckedChange={(c) =>
								handleChange("DISABLE_CONSOLE", c ? "true" : "false")
							}
						/>
						<span className="text-sm font-medium text-muted-foreground">
							Désactiver la Console (Coupe le broadcast SSE et allège les
							performances frontend)
						</span>
					</label>
				</div>
			</SettingsSection>

			<section className="bg-card border-border p-6 rounded-2xl flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h3 className="text-lg font-bold font-heading flex items-center gap-2">
						<Activity className="w-5 h-5 text-primary" />
						Audits en cours
					</h3>
					<p className="text-sm text-muted-foreground">
						État des audits de vulnérabilités tournant actuellement en
						arrière-plan.
					</p>
				</div>

				{auditStatus?.isRunning ? (
					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-2 text-sm font-medium">
							<div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
							Audit global en cours ({auditStatus.progress}/{auditStatus.total})
						</div>

						<div className="flex flex-col gap-2">
							{auditStatus.runningProjects.length > 0 ? (
								auditStatus.runningProjects.map((id) => {
									const proj = projects.find((p) => p.id === id);
									return (
										<Link
											key={id}
											to={`/projects/${id}`}
											className="flex items-center justify-between p-3 border rounded-xl hover:bg-muted/50 transition-colors"
										>
											<div className="flex items-center gap-3">
												<Shield className="w-4 h-4 text-primary animate-pulse" />
												<span className="font-semibold text-sm">
													{proj?.name || `Projet #${id}`}
												</span>
											</div>
											<span className="text-xs text-muted-foreground">
												Audit en cours...
											</span>
										</Link>
									);
								})
							) : (
								<div className="p-3 border border-dashed rounded-xl text-center text-sm text-muted-foreground">
									Préparation en cours...
								</div>
							)}
						</div>
					</div>
				) : (
					<div className="p-6 border border-dashed rounded-xl flex items-center justify-center text-sm text-muted-foreground text-center">
						Aucun audit en cours. Les audits peuvent être déclenchés
						manuellement depuis la liste des projets, ou via le pipeline
						d'intégration continue.
					</div>
				)}
			</section>

			<TagsManager />
		</div>
	);
}
