import type { JiraErrorCollection } from "./types";

/**
 * Traduit un refus de Jira en une phrase lisible.
 *
 * Le corps d'erreur de l'API est un `ErrorCollection` : deux listes, dont une
 * indexée **par champ**. Aegis le recopiait brut dans l'interface, ce qui donnait
 * ceci à l'utilisateur :
 *
 * ```
 * Erreur Jira: 400 {"errorMessages":[],"errors":{"issuetype":"Spécifiez un type de ticket valide"}}
 * ```
 *
 * Le message utile est là, noyé dans du JSON. Or `errors` nomme **exactement** le
 * champ à corriger : c'est l'information la plus précieuse d'un échec de
 * création, et la seule qui dise où aller.
 */
export function formatJiraError(status: number, body: string): string {
	const parsed = parseErrorCollection(body);
	if (!parsed) {
		// Corps non-JSON — une page d'erreur d'un proxy, par exemple. On garde le
		// texte, tronqué : il vaut mieux que rien, mais pas une page entière.
		const raw = body.trim().slice(0, 200);
		return raw
			? `Jira a refusé la demande (${status}) : ${raw}`
			: `Jira a refusé la demande (${status}).`;
	}

	const byField = Object.entries(parsed.errors ?? {}).map(
		([field, message]) => `${field} : ${message}`,
	);
	const general = parsed.errorMessages ?? [];
	const details = [...byField, ...general].filter(Boolean);

	if (details.length === 0) {
		return `Jira a refusé la demande (${status}).`;
	}
	return `Jira a refusé la demande (${status}) — ${details.join(" ; ")}`;
}

/**
 * Le refus porte-t-il sur le **type de ticket** ?
 *
 * Cas assez fréquent pour mériter sa propre aide : les noms de types sont
 * localisés par instance, et « Task » n'existe pas sur un projet français, qui
 * expose « Tâche », « Dette Technique », « Bug »… L'utilisateur ne peut pas le
 * deviner depuis le message de Jira, qui dit seulement « Spécifiez un type de
 * ticket valide ».
 */
export function isIssueTypeRefusal(body: string): boolean {
	const parsed = parseErrorCollection(body);
	return Boolean(parsed?.errors && "issuetype" in parsed.errors);
}

/** Indication ajoutée au message quand le type est en cause. */
export const ISSUE_TYPE_HINT =
	"Le nom du type est localisé : choisissez-le dans la liste de la modale, ou saisissez celui que votre projet expose (par exemple « Tâche » plutôt que « Task »).";

function parseErrorCollection(body: string): JiraErrorCollection | null {
	try {
		const value = JSON.parse(body) as unknown;
		if (!value || typeof value !== "object") return null;
		return value as JiraErrorCollection;
	} catch {
		return null;
	}
}
