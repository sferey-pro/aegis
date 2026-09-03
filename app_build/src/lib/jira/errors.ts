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
export function formatJiraError(status: number, corps: string): string {
	const parsee = analyse(corps);
	if (!parsee) {
		// Corps non-JSON — une page d'erreur d'un proxy, par exemple. On garde le
		// texte, tronqué : il vaut mieux que rien, mais pas une page entière.
		const brut = corps.trim().slice(0, 200);
		return brut
			? `Jira a refusé la demande (${status}) : ${brut}`
			: `Jira a refusé la demande (${status}).`;
	}

	const parChamp = Object.entries(parsee.errors ?? {}).map(
		([champ, message]) => `${champ} : ${message}`,
	);
	const generaux = parsee.errorMessages ?? [];
	const details = [...parChamp, ...generaux].filter(Boolean);

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
export function refusSurTypeDeTicket(corps: string): boolean {
	const parsee = analyse(corps);
	return Boolean(parsee?.errors && "issuetype" in parsee.errors);
}

/** Indication ajoutée au message quand le type est en cause. */
export const AIDE_TYPE_DE_TICKET =
	"Le nom du type est localisé : choisissez-le dans la liste de la modale, ou saisissez celui que votre projet expose (par exemple « Tâche » plutôt que « Task »).";

function analyse(corps: string): JiraErrorCollection | null {
	try {
		const valeur = JSON.parse(corps) as unknown;
		if (!valeur || typeof valeur !== "object") return null;
		return valeur as JiraErrorCollection;
	} catch {
		return null;
	}
}
