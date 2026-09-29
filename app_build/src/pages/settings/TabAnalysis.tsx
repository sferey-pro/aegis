
import React, { useState } from "react";
import { Settings as SettingsIcon, Activity, Shield } from "lucide-react";
import { useSettings, useAuditStatus, useProjects } from "@/lib/api/queries";
import { fetchVoid, jsonInit } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api";
import { SettingsSection } from "@/components/organisms/SettingsSection";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TagsManager } from "@/components/organisms/TagsManager";
import { Link } from "react-router-dom";

export function TabAnalysis() {
    const { data: settingsData, refetch } = useSettings();
    const { data: auditStatus } = useAuditStatus();
    const { data: projects = [] } = useProjects();
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [enregistre, setEnregistre] = useState<Record<string, string>>({});
    const [sectionEnCours, setSectionEnCours] = useState<string | null>(null);
    const [sectionErreur, setSectionErreur] = useState<{ section: string; message: string } | null>(null);

    React.useEffect(() => {
        if (settingsData && Object.keys(enregistre).length === 0) {
            setSettings(settingsData);
            setEnregistre(settingsData);
        }
    }, [settingsData, enregistre]);

    const sectionModifiee = (section: string) => {
        if (section === "audit") {
            return (
                settings.AUDIT_MAX_AGE_DAYS !== enregistre.AUDIT_MAX_AGE_DAYS ||
                settings.AUDIT_CRON_SCHEDULE !== enregistre.AUDIT_CRON_SCHEDULE ||
                settings.AUDIT_CRON_ENABLED !== enregistre.AUDIT_CRON_ENABLED
            );
        }
        return false;
    };

    const handleSave = async (section: string, payload: Record<string, string>) => {
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
                erreur={sectionErreur?.section === "audit" ? sectionErreur.message : null}
                onSave={() => handleSave("audit", {
                    AUDIT_MAX_AGE_DAYS: settings.AUDIT_MAX_AGE_DAYS || "7",
                    AUDIT_CRON_SCHEDULE: settings.AUDIT_CRON_SCHEDULE || "0 2 * * *",
                    AUDIT_CRON_ENABLED: settings.AUDIT_CRON_ENABLED || "false"
                })}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <label htmlFor="audit-max-age" className="text-sm font-bold">
                            Validité d'un audit (jours)
                        </label>
                        <Input
                            id="audit-max-age"
                            type="number"
                            min="1"
                            value={settings.AUDIT_MAX_AGE_DAYS || "7"}
                            onChange={(e) => handleChange("AUDIT_MAX_AGE_DAYS", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Passé ce délai, le projet est considéré comme obsolète.
                        </p>
                    </div>
                </div>

                <div className="flex items-center space-x-2 mt-4 p-4 border rounded-xl bg-muted/50">
                    <Switch
                        id="audit-cron-enabled"
                        checked={settings.AUDIT_CRON_ENABLED === "true"}
                        onCheckedChange={(c) => handleChange("AUDIT_CRON_ENABLED", c ? "true" : "false")}
                    />
                    <label
                        htmlFor="audit-cron-enabled"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        Activer l'audit périodique automatique
                    </label>
                </div>
                
                {settings.AUDIT_CRON_ENABLED === "true" && (
                    <div className="flex flex-col gap-1 mt-2">
                        <label htmlFor="audit-cron-schedule" className="text-sm font-bold">
                            Expression Cron
                        </label>
                        <Input
                            id="audit-cron-schedule"
                            type="text"
                            placeholder="0 2 * * *"
                            value={settings.AUDIT_CRON_SCHEDULE || "0 2 * * *"}
                            onChange={(e) => handleChange("AUDIT_CRON_SCHEDULE", e.target.value)}
                        />
                    </div>
                )}
            </SettingsSection>

            <section className="bg-card border-border p-6 rounded-2xl flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-bold font-heading flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        Audits en cours
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        État des audits de vulnérabilités tournant actuellement en arrière-plan.
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
                                auditStatus.runningProjects.map(id => {
                                    const proj = projects.find(p => p.id === id);
                                    return (
                                        <Link key={id} to={`/projects/${id}`} className="flex items-center justify-between p-3 border rounded-xl hover:bg-muted/50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <Shield className="w-4 h-4 text-primary animate-pulse" />
                                                <span className="font-semibold text-sm">{proj?.name || `Projet #${id}`}</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">Audit en cours...</span>
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
                        Aucun audit en cours. Les audits peuvent être déclenchés manuellement depuis la liste des projets, ou via le pipeline d'intégration continue.
                    </div>
                )}
            </section>

            <TagsManager />
        </div>
    );
}
