import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Extrait un message lisible d'une valeur attrapée dans un `catch`.
 *
 * TypeScript type la variable d'un `catch` en `unknown` : on ne peut pas y lire
 * `.message` sans vérifier d'abord. Ce helper centralise la vérification pour
 * éviter de typer la variable en `any`, ce qui désactiverait aussi la détection
 * des vraies erreurs de type dans le bloc.
 */
export function errorMessage(
	error: unknown,
	fallback = "Erreur inconnue",
): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return fallback;
}

/**
 * Âge d'une mesure, en clair : « à l'instant », « il y a 3 h », « il y a 2 j ».
 *
 * Sert aux valeurs **persistées mais non live** — l'état git d'un projet (§5),
 * par exemple. Sans cette mention, une mesure vieille de trois jours se lit comme
 * la situation actuelle, alors que c'est précisément le doute qu'il faut donner à
 * l'utilisateur.
 *
 * Les horodatages de SQLite sont en UTC sans fuseau (`CURRENT_TIMESTAMP`) : le
 * `Z` est ajouté quand il manque, sinon le navigateur les interprète en heure
 * locale et une mesure fraîche s'affiche « il y a 2 h ».
 */
export function relativeAge(iso: string, maintenant = Date.now()): string {
	const normalise =
		iso.includes("T") || iso.endsWith("Z") ? iso : `${iso.replace(" ", "T")}Z`;
	const t = new Date(normalise).getTime();
	if (Number.isNaN(t)) return "date inconnue";

	const minutes = Math.floor((maintenant - t) / 60_000);
	// Une horloge décalée peut produire un futur proche : ne pas afficher
	// « il y a -3 min », qui ferait douter de la donnée plutôt que de l'horloge.
	if (minutes < 1) return "à l'instant";
	if (minutes < 60) return `il y a ${minutes} min`;
	const heures = Math.floor(minutes / 60);
	if (heures < 24) return `il y a ${heures} h`;
	const jours = Math.floor(heures / 24);
	return `il y a ${jours} j`;
}

/**
 * Date et heure lisibles d'un horodatage SQLite.
 *
 * Même normalisation que `relativeAge` : `CURRENT_TIMESTAMP` est en UTC sans
 * fuseau, le `Z` est ajouté quand il manque. Illisible → « Inconnu », jamais
 * « Invalid Date ».
 */
export function formatDateTime(sqlite: string | null | undefined): string {
	if (!sqlite) return "Inconnu";
	const normalized =
		sqlite.includes("T") || sqlite.endsWith("Z")
			? sqlite
			: `${sqlite.replace(" ", "T")}Z`;
	const date = new Date(normalized);
	if (Number.isNaN(date.getTime())) return "Inconnu";
	return date.toLocaleString("fr-FR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}
