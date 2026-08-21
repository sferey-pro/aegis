import { afterEach, describe, expect, test } from "bun:test";

import { mockFetch, restoreFetch } from "@/test/http";
import {
	ApiError,
	apiErrorMessage,
	fetchJson,
	fetchVoid,
	jsonInit,
} from "./api";

describe("lib/api — fetchJson", () => {
	afterEach(restoreFetch);

	test("un corps JSON est renvoyé décodé", async () => {
		mockFetch({ "GET /api/cves": { body: [{ cve: "CVE-1" }] } });
		expect(await fetchJson<{ cve: string }[]>("/api/cves")).toEqual([
			{ cve: "CVE-1" },
		]);
	});

	test("un statut non-2xx lève avec le message du serveur", async () => {
		// C'est le contrat d'erreur de toutes les routes : `{ error: "<message>" }`.
		mockFetch({
			"POST /api/projects": { status: 400, body: { error: "Nom requis" } },
		});
		expect(fetchJson("/api/projects", jsonInit("POST", {}))).rejects.toThrow(
			"Nom requis",
		);
	});

	test("l'erreur porte le statut, pour distinguer 404 de 500", async () => {
		mockFetch({ "GET /api/projects/9": { status: 404, body: {} } });
		try {
			await fetchJson("/api/projects/9");
			expect.unreachable("aurait dû lever");
		} catch (e) {
			expect(e).toBeInstanceOf(ApiError);
			expect((e as ApiError).status).toBe(404);
		}
	});

	test("un corps d'erreur illisible retombe sur le statut", async () => {
		// Le statut reste l'information utile : le masquer par « erreur inconnue »
		// priverait l'appelant du seul indice dont il dispose.
		mockFetch({ "GET /api/stats": { status: 500, invalidJson: true } });
		expect(fetchJson("/api/stats")).rejects.toThrow("Erreur 500");
	});

	test("un corps d'erreur sans champ error retombe sur le statut", async () => {
		mockFetch({ "GET /api/stats": { status: 503, body: {} } });
		expect(fetchJson("/api/stats")).rejects.toThrow("Erreur 503");
	});

	test("un 204 ne tente pas de décoder un corps", async () => {
		mockFetch({ "DELETE /api/tags/1": { status: 204 } });
		expect(
			await fetchJson("/api/tags/1", { method: "DELETE" }),
		).toBeUndefined();
	});

	test("un 200 au corps illisible lève", async () => {
		// Renvoyer `undefined` trahirait le type promis : l'appelant l'écrirait dans
		// un état typé `T[]`, et le composant tomberait bien plus loin sur un
		// `data.length` incompréhensible. C'est arrivé sur `HistoryChart`.
		mockFetch({ "GET /api/history-global": { invalidJson: true } });
		expect(fetchJson("/api/history-global")).rejects.toThrow(
			"Réponse illisible du serveur",
		);
	});

	test("une mutation au corps illisible lève aussi", async () => {
		// `fetchVoid` ignore la valeur, mais pas la cohérence : une route qui
		// répond 200 avec un corps cassé est en panne.
		mockFetch({ "POST /api/x": { invalidJson: true } });
		expect(fetchVoid("/api/x", { method: "POST" })).rejects.toThrow();
	});

	test("une panne réseau se propage", async () => {
		mockFetch({ "GET /api/stats": { networkError: true } });
		expect(fetchJson("/api/stats")).rejects.toThrow();
	});

	test("fetchVoid ignore le corps mais lève sur échec", async () => {
		mockFetch({
			"DELETE /api/tags/1": { status: 403, body: { error: "Non" } },
		});
		expect(fetchVoid("/api/tags/1", { method: "DELETE" })).rejects.toThrow(
			"Non",
		);
	});

	test("jsonInit produit méthode, en-tête et corps sérialisé", () => {
		expect(jsonInit("PUT", { a: 1 })).toEqual({
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: '{"a":1}',
		});
	});
});

describe("lib/api — apiErrorMessage", () => {
	test("reprend le message d'une ApiError", () => {
		expect(apiErrorMessage(new ApiError("Nom requis", 400))).toBe("Nom requis");
	});

	test("reprend le message d'une Error ordinaire", () => {
		expect(apiErrorMessage(new Error("boom"))).toBe("boom");
	});

	test("une panne réseau a un libellé lisible", () => {
		// `fetch` rejette avec des messages très variables selon le moteur : le
		// repli doit rester compréhensible par un référent sécurité.
		expect(apiErrorMessage(undefined)).toBe("Serveur injoignable");
		expect(apiErrorMessage(null)).toBe("Serveur injoignable");
	});
});
