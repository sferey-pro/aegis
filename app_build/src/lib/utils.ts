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
