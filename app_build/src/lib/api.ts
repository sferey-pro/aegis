import { errorMessage } from "@/lib/utils";

/**
 * Point de passage unique des appels à l'API depuis le client.
 *
 * Motif du défaut N6 : sur 43 appels `fetch`, trois seulement testaient
 * `res.ok`. Les autres passaient l'échec pour un succès, avec trois
 * conséquences de nature différente :
 *
 *  - **Faux négatif rassurant.** `/api/cves` en échec laissait la liste vide, et
 *    l'écran de triage annonçait « Aucune vulnérabilité — votre écosystème est
 *    sain ». Pour un outil de sécurité, c'est le pire mode de défaillance : rien
 *    ne distinguait « rien à traiter » de « je n'ai pas pu lire les données ».
 *  - **Rapport d'audit faux, et persisté.** Un projet dont l'audit répondait 500
 *    était compté zéro vulnérabilité, et le total faux archivé en base.
 *  - **Page bloquée.** Une chaîne `.then()` sans `.catch` laissait le drapeau de
 *    chargement à `true` pour toujours.
 *
 * `fetchJson` lève sur tout statut non-2xx, en reprenant le champ `error` du
 * corps quand il existe — c'est le format que toutes les routes respectent.
 * L'appelant n'a donc qu'un seul chemin d'échec à traiter.
 */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "ApiError";
	}
}

/** Message affichable pour un échec d'appel, réseau compris. */
export function apiErrorMessage(e: unknown): string {
	if (e instanceof ApiError) return e.message;
	return errorMessage(e, "Serveur injoignable");
}

export async function fetchJson<T>(
	path: string,
	init?: RequestInit,
): Promise<T> {
	const res = await fetch(path, init);

	if (!res.ok) {
		// Les routes répondent `{ error: "<message>" }`. Un corps illisible ne doit
		// pas masquer le statut, qui reste l'information utile.
		let message = `Erreur ${res.status}`;
		try {
			const corps = (await res.json()) as { error?: unknown };
			if (typeof corps?.error === "string" && corps.error)
				message = corps.error;
		} catch {
			// Corps vide ou non JSON : on garde le statut.
		}
		throw new ApiError(message, res.status);
	}

	// 204 : pas de corps par définition. L'appelant attend `void` et passe
	// normalement par `fetchVoid`.
	if (res.status === 204) return undefined as T;

	try {
		return (await res.json()) as T;
	} catch {
		// Un corps illisible en 2xx est une **erreur**, pas une valeur. Renvoyer
		// `undefined` trahirait le type promis : l'appelant écrirait cet
		// `undefined` dans un état typé, et le composant tomberait bien plus loin,
		// sur un `data.length` incompréhensible.
		throw new ApiError("Réponse illisible du serveur", res.status);
	}
}

/**
 * Variante sans valeur de retour, pour les mutations. Distincte de `fetchJson`
 * afin que l'appelant n'ait pas à inventer un type pour un corps qu'il ignore.
 */
export async function fetchVoid(
	path: string,
	init?: RequestInit,
): Promise<void> {
	await fetchJson<unknown>(path, init);
}

/** Raccourci pour un corps JSON, la forme de loin la plus fréquente ici. */
export function jsonInit(method: string, body: unknown): RequestInit {
	return {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	};
}
