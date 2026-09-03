import { useCallback, useEffect, useState } from "react";
import { ApiError, apiErrorMessage, fetchJson } from "@/lib/api";
import type { AuditRunResponse } from "@/lib/useGlobalAudit";
import type { ProjectHistoryItem, ProjectListItem } from "@/routes/projects";

/** Retour d'un audit lancé depuis la page, affiché sous les actions. */
export interface AuditFeedback {
	type: "success" | "error";
	text: string;
}

/**
 * État serveur de la page de détail d'un projet : la fiche, les trente derniers
 * runs avec leurs nouveautés (§4), le run sélectionné, et l'audit à la demande.
 *
 * Tout l'état réseau vit ici, pas dans la page : c'est la règle posée après les
 * défauts N16, N19 et N24 sur les pages monolithiques.
 *
 * `projectId` à `null` signifie un identifiant d'URL illisible : on ne lance
 * aucun appel, et on le dit — un `/api/projects/NaN` produirait un 404 trompeur.
 */
export function useProjectDetail(projectId: number | null) {
	const [project, setProject] = useState<ProjectListItem | null>(null);
	const [history, setHistory] = useState<ProjectHistoryItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
	const [auditing, setAuditing] = useState(false);
	const [feedback, setFeedback] = useState<AuditFeedback | null>(null);
	/** Incrémenté après chaque audit : le graphique relit sa série. */
	const [refreshToken, setRefreshToken] = useState(0);

	const load = useCallback(async () => {
		if (projectId === null) {
			setError("Identifiant de projet invalide.");
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const [fiche, runs] = await Promise.all([
				fetchJson<ProjectListItem>(`/api/projects/${projectId}`),
				fetchJson<ProjectHistoryItem[]>(`/api/projects/${projectId}/history`),
			]);
			setProject(fiche);
			setHistory(runs);
			// Garder la sélection si le run existe encore, sinon le plus récent.
			setSelectedRunId((current) =>
				current !== null && runs.some((r) => r.id === current)
					? current
					: (runs[0]?.id ?? null),
			);
		} catch (e: unknown) {
			// La route de la fiche répond « Not found » : on le dit en français, et
			// on distingue ce cas d'une panne — un 404 se corrige en changeant d'URL.
			setError(
				e instanceof ApiError && e.status === 404
					? "Projet introuvable."
					: apiErrorMessage(e),
			);
		} finally {
			setLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		void load();
	}, [load]);

	/**
	 * Audit **forcé** : depuis cette page, l'utilisateur veut une mesure neuve,
	 * pas un rapport dédupliqué — même choix que le bouton de la carte projet.
	 */
	const runAudit = useCallback(async () => {
		if (projectId === null) return;
		setAuditing(true);
		setFeedback(null);
		try {
			const res = await fetchJson<AuditRunResponse>(
				`/api/projects/${projectId}/audit?force=1`,
				{ method: "POST" },
			);
			await load();
			if (res.run) setSelectedRunId(res.run.id);
			setRefreshToken((t) => t + 1);
			if (res.run?.status === "error") {
				setFeedback({
					type: "error",
					text: "L'audit a échoué : le détail est dans le rapport.",
				});
			} else {
				const n = res.newCves?.length ?? 0;
				setFeedback({
					type: "success",
					text:
						n === 0
							? "Audit terminé, aucune nouvelle CVE."
							: `Audit terminé : ${n} nouvelle${n > 1 ? "s" : ""} CVE.`,
				});
			}
		} catch (e: unknown) {
			setFeedback({ type: "error", text: apiErrorMessage(e) });
		} finally {
			setAuditing(false);
		}
	}, [projectId, load]);

	const selectedRun = history.find((r) => r.id === selectedRunId) ?? null;

	return {
		project,
		history,
		loading,
		error,
		selectedRun,
		selectRun: setSelectedRunId,
		auditing,
		feedback,
		runAudit,
		reload: load,
		refreshToken,
	};
}
