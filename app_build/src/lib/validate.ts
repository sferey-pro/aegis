import type { z } from "zod";

/**
 * Lecture + validation du corps d'une requête.
 *
 * Renvoie soit `{ data }`, soit `{ response }` — une `Response` déjà formée que
 * la route n'a plus qu'à retourner. Ce découpage évite de lever des exceptions
 * pour du contrôle de flux, et garantit que toutes les routes répondent avec le
 * même format `{ error: "<message>" }` et le même code.
 *
 * Deux cas d'échec distincts, tous deux en 400 (CONTEXT.md §1) :
 *  - corps illisible          -> « JSON invalide »
 *  - corps invalide au schéma -> le message du premier problème rencontré
 */
export type ParseResult<T> =
	| { data: T; response?: undefined }
	| { data?: undefined; response: Response };

function badRequest(message: string): Response {
	return Response.json({ error: message }, { status: 400 });
}

export async function parseBody<S extends z.ZodType>(
	req: Request,
	schema: S,
): Promise<ParseResult<z.infer<S>>> {
	let raw: unknown;
	try {
		raw = await req.json();
	} catch {
		return { response: badRequest("JSON invalide") };
	}

	const result = schema.safeParse(raw);
	if (!result.success) {
		const [first] = result.error.issues;
		return {
			response: badRequest(first?.message ?? "Corps de requête invalide"),
		};
	}

	return { data: result.data };
}

/**
 * Variante synchrone pour valider une valeur déjà en mémoire (paramètre d'URL,
 * fragment d'un corps déjà lu).
 */
export function parseValue<S extends z.ZodType>(
	value: unknown,
	schema: S,
): ParseResult<z.infer<S>> {
	const result = schema.safeParse(value);
	if (!result.success) {
		const [first] = result.error.issues;
		return { response: badRequest(first?.message ?? "Valeur invalide") };
	}
	return { data: result.data };
}
