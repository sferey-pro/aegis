import { useCallback, useEffect, useState } from "react";
import { ApiError, apiErrorMessage, fetchJson } from "@/lib/api";
import { useProject, useProjectHistory } from "@/lib/api/queries";
import type { AuditRunResponse } from "@/lib/useGlobalAudit";

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
	const {
		data: project = null,
		isLoading: projectLoading,
		error: projectErrorRaw,
		refetch: refetchProject,
	} = useProject(projectId ?? 0);
	const {
		data: history = [],
		isLoading: historyLoading,
		refetch: refetchHistory,
	} = useProjectHistory(projectId ?? 0);

	const loading = projectLoading || historyLoading;
	const error = projectErrorRaw
		? projectErrorRaw instanceof ApiError && projectErrorRaw.status === 404
			? "Projet introuvable."
			: apiErrorMessage(projectErrorRaw)
		: null;

	const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
	const [auditing, setAuditing] = useState(false);
	const [feedback, setFeedback] = useState<AuditFeedback | null>(null);
	const [refreshToken, setRefreshToken] = useState(0);

	const load = useCallback(async () => {
		if (projectId !== null) {
			await Promise.all([refetchProject(), refetchHistory()]);
		}
	}, [projectId, refetchProject, refetchHistory]);

	useEffect(() => {
		if (history.length > 0 && selectedRunId === null) {
			setSelectedRunId(history[0]?.id || null);
		} else if (
			history.length > 0 &&
			selectedRunId !== null &&
			!history.some((r) => r.id === selectedRunId)
		) {
			setSelectedRunId(history[0]?.id || null);
		}
	}, [history, selectedRunId]);

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

	const deleteRun = useCallback(
		async (runId: number) => {
			try {
				await fetchJson(`/api/runs/${runId}`, { method: "DELETE" });
				await load();
				setRefreshToken((t) => t + 1);
			} catch (e: unknown) {
				setFeedback({ type: "error", text: apiErrorMessage(e) });
			}
		},
		[load],
	);

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
		deleteRun,
	};
}
