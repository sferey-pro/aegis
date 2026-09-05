import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ticket } from "@/db/tickets";
import type { CveGroup } from "@/lib/aggregator";
import { apiErrorMessage, fetchJson, jsonInit } from "@/lib/api";
import { buildPackageGroups, type PackageGroup } from "@/lib/package-groups";

/** Ticket créé : sa référence, et le lien `/browse/` si l'URL Jira est connue. */
export interface CreatedTicket {
	ref: string;
	url: string | null;
}

/**
 * État de la page de création de ticket Jira (§8).
 *
 * Un ticket porte sur **un paquet dans un projet** — c'est l'unicité de la table
 * `tickets` — et sur les CVE qu'on **choisit** d'y mettre : une dette technique
 * et un bug ne se rangent pas au même endroit, et un paquet à huit CVE ne se
 * traite pas toujours d'un bloc. L'aperçu Markdown suit la sélection.
 *
 * Tout l'état réseau vit ici ; la page compose. `projectId` à `null` : aucun
 * appel, la page dit ce qui manque.
 */
export function useTicketDraft(
	projectId: number | null,
	packageName: string | null,
) {
	const [cves, setCves] = useState<CveGroup[]>([]);
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [jiraBaseUrl, setJiraBaseUrl] = useState("");
	const [types, setTypes] = useState<string[]>([]);
	const [typesUnavailable, setTypesUnavailable] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	/** Incrémenté pour relire les sources après un échec. */
	const [version, setVersion] = useState(0);

	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [notes, setNotes] = useState("");
	const [issueType, setIssueType] = useState("");
	const [markdown, setMarkdown] = useState("");
	const [copied, setCopied] = useState(false);
	const [creating, setCreating] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [created, setCreated] = useState<CreatedTicket | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `version` ne sert qu'à relancer la lecture après un échec.
	useEffect(() => {
		if (projectId === null) {
			setLoading(false);
			return;
		}
		let alive = true;
		setLoading(true);
		// Les CVE sont la donnée ; tickets existants et URL Jira sont accessoires
		// et ne doivent pas bloquer la page s'ils manquent.
		Promise.all([
			fetchJson<CveGroup[]>("/api/cves"),
			fetchJson<Ticket[]>("/api/tickets/list").catch(() => [] as Ticket[]),
			fetchJson<Record<string, string>>("/api/settings").catch(
				() => ({}) as Record<string, string>,
			),
		])
			.then(([groups, list, settings]) => {
				if (!alive) return;
				setCves(groups);
				setTickets(list);
				setJiraBaseUrl(settings.JIRA_BASE_URL ?? "");
				setError(null);
			})
			.catch((e: unknown) => {
				if (alive) setError(apiErrorMessage(e));
			})
			.finally(() => {
				if (alive) setLoading(false);
			});

		// La liste des types vient de Jira, jamais d'une liste codée en dur : les
		// noms sont localisés par instance (§8). Son absence ne bloque rien, on
		// retombe sur une saisie libre.
		fetchJson<{ types: string[]; reason?: string }>("/api/tickets/issue-types")
			.then((data) => {
				if (!alive) return;
				setTypes(data.types);
				setTypesUnavailable(
					data.types.length === 0 ? (data.reason ?? "") : null,
				);
				setIssueType((current) => current || data.types[0] || "");
			})
			.catch(() => {
				if (alive) setTypesUnavailable("liste indisponible");
			});
		return () => {
			alive = false;
		};
	}, [projectId, version]);

	/** Les paquets vulnérables du projet, par ordre alphabétique. */
	const groups: PackageGroup[] = useMemo(
		() =>
			projectId === null
				? []
				: buildPackageGroups(cves, { projectId }).sort((a, b) =>
						a.package.localeCompare(b.package),
					),
		[cves, projectId],
	);
	const group = groups.find((g) => g.package === packageName) ?? null;
	const existingTicket =
		tickets.find(
			(t) => t.project_id === projectId && t.package === packageName,
		) ?? null;

	// Changer de paquet, c'est repartir : toutes ses CVE cochées.
	useEffect(() => {
		setSelected(new Set(group?.cves.map((c) => c.cve) ?? []));
	}, [group]);

	/** Les CVE cochées, dans l'ordre du groupe. */
	const selectedCves = useMemo(
		() =>
			group ? group.cves.map((c) => c.cve).filter((c) => selected.has(c)) : [],
		[group, selected],
	);

	// L'aperçu suit la sélection : le serveur rend le Markdown des seules CVE
	// choisies (§8). Rien de coché, rien à prévisualiser.
	useEffect(() => {
		if (!group || projectId === null || selectedCves.length === 0) {
			setMarkdown("");
			return;
		}
		let alive = true;
		fetchJson<{ markdown: string }>(
			"/api/tickets",
			jsonInit("POST", {
				projectId,
				packageName: group.package,
				cves: selectedCves,
			}),
		)
			.then((data) => {
				if (alive) setMarkdown(data.markdown);
			})
			.catch((e: unknown) => {
				// Un brouillon `undefined` finissait copié tel quel dans Jira : on le
				// dit, et l'aperçu reste vide.
				if (!alive) return;
				setMarkdown("");
				setFeedback(`Brouillon non généré : ${apiErrorMessage(e)}`);
			});
		return () => {
			alive = false;
		};
	}, [group, projectId, selectedCves]);

	const toggle = useCallback((cve: string) => {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(cve)) next.delete(cve);
			else next.add(cve);
			return next;
		});
	}, []);
	const selectAll = useCallback(() => {
		setSelected(new Set(group?.cves.map((c) => c.cve) ?? []));
	}, [group]);
	const selectNone = useCallback(() => setSelected(new Set()), []);

	const copy = useCallback(() => {
		if (!markdown) return;
		navigator.clipboard?.writeText(markdown);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [markdown]);

	const canCreate =
		group !== null &&
		selectedCves.length > 0 &&
		issueType.trim() !== "" &&
		!creating;

	const create = useCallback(async () => {
		if (!group || projectId === null || selectedCves.length === 0) return;
		setCreating(true);
		setFeedback(null);
		try {
			// `fetchJson` lève sur 400/409/500 en reprenant le message du serveur —
			// dont « un ticket identique existe déjà (Réf: …) », qui est précisément
			// ce que l'utilisateur doit lire.
			const data = await fetchJson<{ success?: boolean; ticketRef?: string }>(
				"/api/tickets/create",
				jsonInit("POST", {
					projectId,
					packageName: group.package,
					cves: selectedCves,
					notes,
					issueType,
				}),
			);
			if (data.success && data.ticketRef) {
				setCreated({
					ref: data.ticketRef,
					url: jiraBaseUrl
						? `${jiraBaseUrl.replace(/\/$/, "")}/browse/${data.ticketRef}`
						: null,
				});
			} else {
				setFeedback("Erreur lors de la création du ticket.");
			}
		} catch (e: unknown) {
			setFeedback(apiErrorMessage(e));
		} finally {
			setCreating(false);
		}
	}, [group, projectId, selectedCves, notes, issueType, jiraBaseUrl]);

	return {
		loading,
		error,
		reload: () => setVersion((v) => v + 1),
		groups,
		group,
		existingTicket,
		jiraBaseUrl,
		selected,
		selectedCves,
		toggle,
		selectAll,
		selectNone,
		types,
		typesUnavailable,
		issueType,
		setIssueType,
		notes,
		setNotes,
		markdown,
		copied,
		copy,
		creating,
		canCreate,
		create,
		feedback,
		created,
	};
}
