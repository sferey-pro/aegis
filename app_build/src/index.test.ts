import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { startTestServer, type TestServer } from "@/test/server";

/**
 * Contrat du point d'entrée : ce qui n'est pas une route d'API doit être servi
 * à l'application cliente, jamais renvoyé en 404. C'est ce qui permet au routage
 * côté navigateur de fonctionner sur un rechargement en profondeur.
 */

let srv: TestServer;

beforeAll(async () => {
	srv = await startTestServer("entree");
});
afterAll(() => srv.stop());

describe("point d'entrée du serveur", () => {
	test("écoute sur le port demandé, pas sur le port par défaut", () => {
		// `AEGIS_PORT=0` laisse le système choisir : deux instances ne peuvent pas
		// entrer en conflit.
		expect(srv.port).toBeGreaterThan(0);
		expect(srv.port).not.toBe(3001);
	});

	test("les routes d'API répondent en JSON", async () => {
		const res = await srv.request("/api/tags");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/json");
	});

	test("un chemin d'API inconnu n'est pas une erreur mais l'application", async () => {
		// Il tombe dans le fourre-tout `/*` : le client reçoit l'application, pas
		// un 404 JSON. C'est un écart à connaître pour le débogage d'un appel mal
		// orthographié.
		const res = await srv.request("/api/inexistant");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).not.toContain("application/json");
	});

	test("une route cliente en profondeur renvoie l'application", async () => {
		const res = await srv.request("/projects/42/history");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
	});

	test("la racine renvoie l'application", async () => {
		const res = await srv.request("/");
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("<html");
	});

	test("une méthode non déclarée renvoie l'application — écart documenté", async () => {
		// `/api/annotations` n'est déclarée qu'en POST. Un `GET` ne reçoit ni 404 ni
		// 405 : il tombe dans le fourre-tout `/*` et récupère du HTML. Un client qui
		// se trompe de verbe voit donc une page là où il attend du JSON, et échoue
		// au `res.json()` sans indice sur la cause.
		const res = await srv.request("/api/annotations");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
	});

	test("le logo est servi depuis le disque", async () => {
		const res = await srv.request("/aegis-logo.jpg");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("image");
	});
});

/**
 * Contrats attendus — à activer au correctif.
 *
 * Chaque test ci-dessous énonce le comportement que `CONTEXT.md` demande, sur un
 * point où le code s'en écarte aujourd'hui. Ils sont marqués `test.failing` :
 * Bun exécute le corps et **attend son échec**, donc la suite reste verte tant
 * que le défaut existe.
 *
 * Le jour où le défaut est corrigé, le test se met à passer et Bun le signale en
 * rouge — « this test is marked as failing but it passed. Remove `.failing` if
 * tested behavior now works ». Il est donc impossible de corriger le code sans
 * reprendre le test.
 *
 * Marche à suivre au correctif : retirer `.failing`, puis supprimer le test
 * « écart documenté » correspondant, qui épinglait l'ancien comportement.
 */

describe("contrats attendus — à activer au correctif", () => {
	// N36 — un chemin d'API inconnu doit répondre 404 en JSON, pas servir la SPA.
	test.failing("un chemin d'API inconnu renvoie 404 en JSON (N36)", async () => {
		const res = await srv.request("/api/inexistant");
		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toContain("application/json");
	});

	// N36 — une méthode non déclarée doit répondre 404 ou 405, jamais du HTML.
	test.failing("une méthode non déclarée ne renvoie pas l'application (N36)", async () => {
		const res = await srv.request("/api/annotations");
		expect([404, 405]).toContain(res.status);
		expect(res.headers.get("content-type")).not.toContain("text/html");
	});
});
