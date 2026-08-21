import { expect, mock } from "bun:test";

/**
 * Simulation de `fetch` pour les tests de composants.
 *
 * Les composants appellent `fetch` directement : il n'existe aucune couche
 * client à intercepter, et en introduire une pour les besoins du test
 * reviendrait à modifier le code de production pour servir le harnais. On
 * remplace donc la globale.
 *
 * Bun isole les globales entre fichiers de test, donc rien ne fuit d'un fichier
 * à l'autre. À l'intérieur d'un fichier en revanche, il faut restaurer :
 * appelez `restoreFetch()` dans un `afterEach`.
 */

/** Réponse simulée. Un nombre seul est interprété comme un statut vide. */
export interface FakeResponse {
	/** Corps JSON renvoyé par `res.json()`. */
	body?: unknown;
	/** Statut HTTP. Défaut 200. `ok` en découle (< 400). */
	status?: number;
	/** Force l'échec de `res.json()`, pour simuler un corps illisible. */
	invalidJson?: boolean;
	/** Fait rejeter `fetch` lui-même, pour simuler une coupure réseau. */
	networkError?: string;
}

/** Table de routes, indexée par `"MÉTHODE /chemin"` ou `"/chemin"` (= GET). */
export type FetchRoutes = Record<string, FakeResponse | unknown>;

export interface FetchCall {
	method: string;
	url: string;
	/** Corps de requête déjà décodé, si c'était du JSON. */
	body?: unknown;
}

let original: typeof globalThis.fetch | undefined;
const calls: FetchCall[] = [];

function normalise(spec: FakeResponse | unknown): FakeResponse {
	// Un objet portant l'une des clés réservées est une spec ; sinon c'est
	// directement le corps, forme courte qui couvre la majorité des cas.
	if (
		spec &&
		typeof spec === "object" &&
		!Array.isArray(spec) &&
		("body" in spec ||
			"status" in spec ||
			"invalidJson" in spec ||
			"networkError" in spec)
	) {
		return spec as FakeResponse;
	}
	return { body: spec };
}

/**
 * Installe un `fetch` simulé.
 *
 * Toute requête ne correspondant à aucune route **fait échouer le test**. Un
 * endpoint oublié qui renverrait silencieusement `undefined` donnerait une
 * fausse confiance — c'est exactement le défaut que ces tests doivent détecter.
 */
export function mockFetch(routes: FetchRoutes) {
	original ??= globalThis.fetch;
	calls.length = 0;

	const table = new Map<string, FakeResponse>();
	for (const [cle, spec] of Object.entries(routes)) {
		const [maybeMethod, ...reste] = cle.split(" ");
		const avecMethode = reste.length > 0;
		const method = avecMethode ? (maybeMethod as string).toUpperCase() : "GET";
		const path = avecMethode ? reste.join(" ") : (maybeMethod as string);
		table.set(`${method} ${path}`, normalise(spec));
	}

	const impl = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : String(input);
		const method = (init?.method ?? "GET").toUpperCase();
		const path = url.replace(/^https?:\/\/[^/]+/, "");

		let body: unknown;
		if (typeof init?.body === "string") {
			try {
				body = JSON.parse(init.body);
			} catch {
				body = init.body;
			}
		}
		calls.push({ method, url: path, body });

		const spec = table.get(`${method} ${path}`);
		if (!spec) {
			const connues = [...table.keys()].join(", ") || "(aucune)";
			// Échec explicite, jamais un 404 silencieux.
			expect.unreachable(
				`Requête non simulée : ${method} ${path}. Routes déclarées : ${connues}`,
			);
		}

		const s = spec as FakeResponse;
		if (s.networkError) throw new TypeError(s.networkError);

		const status = s.status ?? 200;
		return {
			ok: status < 400,
			status,
			json: async () => {
				if (s.invalidJson) throw new SyntaxError("Unexpected token");
				return s.body;
			},
			text: async () => JSON.stringify(s.body ?? ""),
		} as unknown as Response;
	});

	globalThis.fetch = impl as unknown as typeof globalThis.fetch;
	return impl;
}

/** Restaure le `fetch` d'origine. À appeler dans un `afterEach`. */
export function restoreFetch() {
	if (original) globalThis.fetch = original;
	calls.length = 0;
}

/** Requêtes observées depuis le dernier `mockFetch`, dans l'ordre. */
export function fetchCalls(): readonly FetchCall[] {
	return calls;
}

/** Dernière requête observée, ou `undefined`. */
export function lastFetchCall(): FetchCall | undefined {
	return calls[calls.length - 1];
}
