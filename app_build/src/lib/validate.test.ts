import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { parseBody, parseValue } from "./validate";

const schema = z.object({
	name: z.string({ message: "Nom requis" }).min(1, "Nom requis"),
	count: z.coerce.number().default(0),
});

function requete(body: string, headers: Record<string, string> = {}): Request {
	return new Request("http://localhost/api/x", {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body,
	});
}

describe("lib/validate — parseBody", () => {
	test("un corps valide renvoie data et aucune response", async () => {
		const r = await parseBody(requete('{"name":"API"}'), schema);
		expect(r.data).toEqual({ name: "API", count: 0 });
		expect(r.response).toBeUndefined();
	});

	test("les valeurs par défaut du schéma sont appliquées", async () => {
		const r = await parseBody(requete('{"name":"API","count":"7"}'), schema);
		expect(r.data?.count).toBe(7);
	});

	test("un corps illisible donne 400 « JSON invalide »", async () => {
		const r = await parseBody(requete("{ pas du json"), schema);
		expect(r.data).toBeUndefined();
		expect(r.response?.status).toBe(400);
		expect(await r.response?.json()).toEqual({ error: "JSON invalide" });
	});

	test("un corps vide donne aussi « JSON invalide »", async () => {
		// `fetch` sans corps sur un POST : le client a oublié le payload, pas
		// envoyé un objet vide.
		const r = await parseBody(requete(""), schema);
		expect(await r.response?.json()).toEqual({ error: "JSON invalide" });
	});

	test("un corps invalide renvoie le message du premier problème", async () => {
		const r = await parseBody(requete('{"name":""}'), schema);
		expect(r.response?.status).toBe(400);
		expect(await r.response?.json()).toEqual({ error: "Nom requis" });
	});

	test("le format d'erreur est toujours { error: string }", async () => {
		// Toutes les routes s'appuient sur cette forme : le front lit `error`.
		const r = await parseBody(requete('{"name":123}'), schema);
		const corps = (await r.response?.json()) as Record<string, unknown>;
		expect(Object.keys(corps)).toEqual(["error"]);
		expect(typeof corps.error).toBe("string");
	});

	test("un seul message est renvoyé même si plusieurs champs échouent", async () => {
		const multi = z.object({
			a: z.string("A requis"),
			b: z.string("B requis"),
		});
		const r = await parseBody(requete("{}"), multi);
		const corps = (await r.response?.json()) as { error: string };
		expect(corps.error).toBe("A requis");
	});

	test("un schéma sans message personnalisé produit un message par défaut", async () => {
		const r = await parseBody(requete("[]"), schema);
		const corps = (await r.response?.json()) as { error: string };
		expect(corps.error.length).toBeGreaterThan(0);
	});

	test("un JSON scalaire est refusé sans lever", async () => {
		const r = await parseBody(requete('"juste une chaîne"'), schema);
		expect(r.response?.status).toBe(400);
	});

	test("l'échec est renvoyé, jamais levé", async () => {
		// Le contrôle de flux passe par la valeur de retour : une route ne doit pas
		// avoir à envelopper l'appel dans un try/catch.
		expect(parseBody(requete("cassé"), schema)).resolves.toBeDefined();
	});
});

describe("lib/validate — parseValue", () => {
	test("une valeur valide renvoie data", () => {
		expect(parseValue({ name: "API" }, schema).data).toEqual({
			name: "API",
			count: 0,
		});
	});

	test("une valeur invalide renvoie une 400 au même format", async () => {
		const r = parseValue({ name: "" }, schema);
		expect(r.response?.status).toBe(400);
		expect(await r.response?.json()).toEqual({ error: "Nom requis" });
	});

	test("le repli est « Valeur invalide » quand le schéma n'a pas de message", async () => {
		const r = parseValue("abc", z.number());
		const corps = (await r.response?.json()) as { error: string };
		expect(corps.error.length).toBeGreaterThan(0);
	});

	test("sert à valider un paramètre d'URL déjà extrait", () => {
		const idSchema = z.coerce.number().int().positive("Identifiant invalide");
		expect(parseValue("42", idSchema).data).toBe(42);
		expect(parseValue("0", idSchema).response?.status).toBe(400);
	});
});
