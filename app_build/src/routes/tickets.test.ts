import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { getDb } from "@/db";
import { createProject, type Project } from "@/db/projects";
import { addRun } from "@/db/runs";
import { setSetting } from "@/db/settings";
import { getTickets } from "@/db/tickets";
import type { Vulnerability } from "@/lib/parsers/types";
import { jsonBody, startTestServer, type TestServer } from "@/test/server";

let srv: TestServer;
let projet: Project;
const natif = globalThis.fetch;

/** Requêtes sortantes captées par le faux Jira. */
const appelsJira: { url: string; init?: RequestInit }[] = [];

beforeAll(async () => {
	srv = await startTestServer("tickets");
});
afterAll(() => srv.stop());

beforeEach(() => {
	getDb().query("DELETE FROM projects").run();
	getDb().query("DELETE FROM settings").run();
	appelsJira.length = 0;
	projet = createProject({
		name: "api",
		path: "/srv/api",
		type: "node",
		tool: "npm",
	});
});

afterEach(() => {
	globalThis.fetch = natif;
});

/**
 * Remplace le `fetch` global, celui que le handler utilise pour joindre Jira.
 * Les requêtes du test passent par `__nativeFetch`, conservé avant toute
 * substitution : elles ne sont donc pas affectées.
 */
function stubJira(reponse: {
	status?: number;
	body?: unknown;
	text?: string;
	throws?: boolean;
}) {
	globalThis.fetch = ((entree: string | URL | Request, init?: RequestInit) => {
		appelsJira.push({ url: String(entree), init });
		if (reponse.throws) return Promise.reject(new Error("ENOTFOUND"));
		return Promise.resolve(
			new Response(reponse.text ?? JSON.stringify(reponse.body ?? {}), {
				status: reponse.status ?? 200,
				headers: { "content-type": "application/json" },
			}),
		);
	}) as unknown as typeof fetch;
}

function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
	return {
		package: "lodash",
		severity: "critical",
		title: "Prototype pollution",
		cve: "CVE-2020-8203",
		link: "https://github.com/advisories/GHSA-p6mc-m468-83gw",
		versionRange: "<4.17.21",
		fixedIn: "4.17.21",
		...over,
	};
}

function run(vulns: Vulnerability[], projectId = projet.id) {
	return addRun({
		project_id: projectId,
		status: "vulnerable",
		total: vulns.length,
		counts: {
			critical: vulns.length,
			high: 0,
			moderate: 0,
			low: 0,
			info: 0,
			unknown: 0,
		},
		vulnerabilities: vulns,
		command: "npm audit --json",
		commit_sha: null,
		error: null,
		duration_ms: 5,
	});
}

function configurerJira(over: Record<string, string> = {}) {
	const valeurs: Record<string, string> = {
		JIRA_BASE_URL: "https://jira.example.test",
		JIRA_USER: "bot@example.test",
		JIRA_API_KEY: "cle",
		JIRA_PROJECT: "SEC",
		...over,
	};
	for (const [k, v] of Object.entries(valeurs)) setSetting(k, v);
}

describe("POST /api/tickets — brouillon Markdown", () => {
	/** Le paramètre de type permet au test d'erreur d'attendre `{ error }`. */
	function brouillon<T = { markdown: string }>(body: unknown) {
		return srv.json<T>("/api/tickets", jsonBody(body));
	}

	test("sans occurrence correspondante, renvoie 404", async () => {
		const { status, data } = await brouillon<{ error: string }>({
			projectId: projet.id,
			packageName: "absent",
		});
		expect(status).toBe(404);
		expect(data).toEqual({ error: "Non trouvé" });
	});

	test("le brouillon porte le projet, l'outil et le paquet", async () => {
		run([vuln()]);
		const { status, data } = await brouillon({
			projectId: projet.id,
			packageName: "lodash",
		});
		expect(status).toBe(200);
		expect(data.markdown).toContain("[Aegis] Remédiation lodash - api");
		expect(data.markdown).toContain("**Projet:** api (npm)");
		expect(data.markdown).toContain("`lodash`");
	});

	test("chaque vulnérabilité est détaillée, sévérité en majuscules", async () => {
		run([vuln()]);
		const { data } = await brouillon({
			projectId: projet.id,
			packageName: "lodash",
		});
		expect(data.markdown).toContain("### CVE-2020-8203 - CRITICAL");
		expect(data.markdown).toContain("**Description:** Prototype pollution");
		expect(data.markdown).toContain("**Version affectée:** `<4.17.21`");
		expect(data.markdown).toContain("**Correction disponible:** `4.17.21`");
		expect(data.markdown).toContain(
			"**Lien:** https://github.com/advisories/GHSA-p6mc-m468-83gw",
		);
	});

	test("les champs absents ont un texte de repli explicite", async () => {
		// Un ticket ne doit jamais contenir « undefined » : le référent sécurité
		// doit voir qu'il n'y a pas de correctif, pas une donnée manquante.
		run([vuln({ title: "", versionRange: null, fixedIn: null, link: null })]);
		const { data } = await brouillon({
			projectId: projet.id,
			packageName: "lodash",
		});
		expect(data.markdown).toContain("**Description:** Aucune description");
		expect(data.markdown).toContain("**Version affectée:** `N/A`");
		expect(data.markdown).toContain(
			"**Correction disponible:** `Aucune (mise à jour majeure requise)`",
		);
		expect(data.markdown).not.toContain("undefined");
	});

	test("plusieurs failles du même paquet sont regroupées et comptées", async () => {
		// C'est l'unité de remédiation : on met à jour un paquet, pas une CVE.
		run([
			vuln({ cve: "CVE-2020-1111" }),
			vuln({ cve: "CVE-2020-2222", severity: "high" }),
		]);
		const { data } = await brouillon({
			projectId: projet.id,
			packageName: "lodash",
		});
		expect(data.markdown).toContain("## Vulnérabilités (2)");
		expect(data.markdown).toContain("CVE-2020-1111");
		expect(data.markdown).toContain("CVE-2020-2222");
	});

	test("les failles d'un autre paquet sont exclues", async () => {
		run([vuln(), vuln({ package: "axios", cve: "CVE-2020-3333" })]);
		const { data } = await brouillon({
			projectId: projet.id,
			packageName: "lodash",
		});
		expect(data.markdown).toContain("## Vulnérabilités (1)");
		expect(data.markdown).not.toContain("CVE-2020-3333");
	});

	test("les failles d'un autre projet sont exclues", async () => {
		const autre = createProject({
			name: "web",
			path: "/srv/web",
			type: "node",
			tool: "npm",
		});
		run([vuln()], autre.id);
		const { status } = await brouillon({
			projectId: projet.id,
			packageName: "lodash",
		});
		expect(status).toBe(404);
	});

	test("le brouillon réserve une place à la recommandation humaine", async () => {
		run([vuln()]);
		const { data } = await brouillon({
			projectId: projet.id,
			packageName: "lodash",
		});
		expect(data.markdown).toContain("## Recommandation / Raison du risque");
		expect(data.markdown).toContain("À compléter par le référent sécurité");
	});
});

describe("liaison manuelle de tickets", () => {
	test("la liste est vide au départ", async () => {
		const { status, data } = await srv.json("/api/tickets/list");
		expect(status).toBe(200);
		expect(data).toEqual([]);
	});

	test("lier enregistre la référence et les CVE", async () => {
		const { status, data } = await srv.json(
			"/api/tickets/link",
			jsonBody({
				projectId: projet.id,
				packageName: "lodash",
				ref: "SEC-1234",
				cves: ["CVE-2020-8203"],
			}),
		);
		expect(status).toBe(200);
		expect(data).toEqual({ success: true });

		const { data: liste } =
			await srv.json<{ package: string; url: string; cves: string[] }[]>(
				"/api/tickets/list",
			);
		expect(liste[0]?.package).toBe("lodash");
		expect(liste[0]?.url).toBe("SEC-1234");
		expect(liste[0]?.cves).toEqual(["CVE-2020-8203"]);
	});

	test("relier le même paquet met à jour au lieu de dupliquer", async () => {
		const corps = {
			projectId: projet.id,
			packageName: "lodash",
			ref: "SEC-1",
			cves: [],
		};
		await srv.json("/api/tickets/link", jsonBody(corps));
		await srv.json("/api/tickets/link", jsonBody({ ...corps, ref: "SEC-2" }));

		const { data } = await srv.json<{ url: string }[]>("/api/tickets/list");
		expect(data).toHaveLength(1);
		expect(data[0]?.url).toBe("SEC-2");
	});

	test("délier retire le ticket", async () => {
		await srv.json(
			"/api/tickets/link",
			jsonBody({
				projectId: projet.id,
				packageName: "lodash",
				ref: "SEC-1",
				cves: [],
			}),
		);
		const { status, data } = await srv.json(
			"/api/tickets/unlink",
			jsonBody({ projectId: projet.id, packageName: "lodash" }),
		);
		expect(status).toBe(200);
		expect(data).toEqual({ success: true });
		expect((await srv.json("/api/tickets/list")).data).toEqual([]);
	});

	test("délier un ticket inexistant réussit quand même", async () => {
		const { status } = await srv.json(
			"/api/tickets/unlink",
			jsonBody({ projectId: projet.id, packageName: "absent" }),
		);
		expect(status).toBe(200);
	});
});

describe("POST /api/tickets/create — Jira", () => {
	function creer(over: Record<string, unknown> = {}) {
		return srv.json<{ success?: boolean; ticketRef?: string; error?: string }>(
			"/api/tickets/create",
			jsonBody({
				projectId: projet.id,
				packageName: "lodash",
				cves: ["CVE-2020-8203"],
				...over,
			}),
		);
	}

	test("sans configuration Jira, renvoie 400 avec une consigne", async () => {
		const { status, data } = await creer();
		expect(status).toBe(400);
		expect(data.error).toContain("Paramètres");
	});

	test("une configuration partielle est refusée", async () => {
		configurerJira({ JIRA_PROJECT: "" });
		expect((await creer()).status).toBe(400);
	});

	test("la configuration est vérifiée avant tout appel sortant", async () => {
		// Inutile de joindre Jira sans identifiants, et le message doit rester une
		// consigne de configuration, pas une erreur HTTP.
		stubJira({ body: { key: "SEC-1" } });
		await creer();
		expect(appelsJira).toHaveLength(0);
	});

	test("sans occurrence correspondante, renvoie 404", async () => {
		configurerJira();
		stubJira({ body: { key: "SEC-1" } });
		const { status, data } = await creer({ cves: ["CVE-INCONNUE"] });
		expect(status).toBe(404);
		expect(data.error).toContain("Aucune vulnérabilité");
	});

	test("crée l'issue et mémorise la référence renvoyée", async () => {
		configurerJira();
		run([vuln()]);
		stubJira({ body: { key: "SEC-42" } });

		const { status, data } = await creer();
		expect(status).toBe(200);
		expect(data).toEqual({ success: true, ticketRef: "SEC-42" });

		const [ticket] = getTickets();
		expect(ticket?.url).toBe("SEC-42");
		expect(ticket?.package).toBe("lodash");
		expect(ticket?.content_hash).toBeTruthy();
	});

	test("l'appel part sur l'API v3 avec une authentification Basic", async () => {
		configurerJira();
		run([vuln()]);
		stubJira({ body: { key: "SEC-1" } });
		await creer();

		const [appel] = appelsJira;
		expect(appel?.url).toBe("https://jira.example.test/rest/api/3/issue");
		const entetes = appel?.init?.headers as Record<string, string>;
		expect(entetes.Authorization).toBe(
			`Basic ${Buffer.from("bot@example.test:cle").toString("base64")}`,
		);
	});

	test("la charge décrit l'issue et son tableau de vulnérabilités", async () => {
		configurerJira();
		run([vuln()]);
		stubJira({ body: { key: "SEC-1" } });
		await creer();

		const charge = JSON.parse(appelsJira[0]?.init?.body as string) as {
			fields: {
				project: { key: string };
				summary: string;
				issuetype: { name: string };
				description: { type: string; content: unknown[] };
			};
		};
		expect(charge.fields.project.key).toBe("SEC");
		expect(charge.fields.summary).toBe("[Aegis] Remédiation lodash");
		// Type d'issue par défaut quand le réglage est absent.
		expect(charge.fields.issuetype.name).toBe("Task");
		expect(charge.fields.description.type).toBe("doc");
		expect(JSON.stringify(charge.fields.description)).toContain(
			"CVE-2020-8203",
		);
	});

	test("l'épopée parente et le composant ne sont envoyés que si configurés", async () => {
		configurerJira();
		run([vuln()]);
		stubJira({ body: { key: "SEC-1" } });
		await creer();
		const sans = JSON.parse(appelsJira[0]?.init?.body as string) as {
			fields: Record<string, unknown>;
		};
		expect(sans.fields).not.toHaveProperty("parent");
		expect(sans.fields).not.toHaveProperty("components");

		appelsJira.length = 0;
		configurerJira({
			JIRA_PARENT_EPIC: "SEC-1",
			JIRA_COMPONENT: "10001",
			JIRA_ISSUE_TYPE: "Bug",
		});
		stubJira({ body: { key: "SEC-2" } });
		await creer({ packageName: "lodash" });
		const avec = JSON.parse(appelsJira[0]?.init?.body as string) as {
			fields: {
				parent: { key: string };
				components: { id: string }[];
				issuetype: { name: string };
			};
		};
		expect(avec.fields.parent.key).toBe("SEC-1");
		expect(avec.fields.components).toEqual([{ id: "10001" }]);
		expect(avec.fields.issuetype.name).toBe("Bug");
	});

	test("les notes sont ajoutées au document en fin de description", async () => {
		configurerJira();
		run([vuln()]);
		stubJira({ body: { key: "SEC-1" } });
		await creer({ notes: "Non exposé côté serveur" });

		const charge = appelsJira[0]?.init?.body as string;
		expect(charge).toContain("Notes additionnelles");
		expect(charge).toContain("Non exposé côté serveur");
		expect(charge).toContain("panel");
	});

	test("des notes blanches ne créent pas de bloc vide", async () => {
		configurerJira();
		run([vuln()]);
		stubJira({ body: { key: "SEC-1" } });
		await creer({ notes: "   " });
		expect(appelsJira[0]?.init?.body as string).not.toContain(
			"Notes additionnelles",
		);
	});

	test("un contenu identique déjà envoyé renvoie 409 sans rappeler Jira", async () => {
		// C'est le garde-fou anti-doublon : deux clics ne doivent pas créer deux
		// tickets pour la même remédiation.
		configurerJira();
		run([vuln()]);
		stubJira({ body: { key: "SEC-42" } });
		await creer();

		appelsJira.length = 0;
		const { status, data } = await creer();
		expect(status).toBe(409);
		expect(data.error).toContain("SEC-42");
		expect(appelsJira).toHaveLength(0);
	});

	test("un contenu différent n'est pas vu comme un doublon", async () => {
		configurerJira();
		run([vuln()]);
		stubJira({ body: { key: "SEC-42" } });
		await creer();

		stubJira({ body: { key: "SEC-43" } });
		const { status } = await creer({ notes: "précision ajoutée" });
		expect(status).toBe(200);
	});

	test("une erreur Jira est relayée avec son statut", async () => {
		configurerJira();
		run([vuln()]);
		stubJira({ status: 403, text: "Forbidden" });

		const { status, data } = await creer();
		expect(status).toBe(403);
		expect(data.error).toContain("Erreur Jira: 403");
		expect(data.error).toContain("Forbidden");
	});

	test("une erreur Jira n'enregistre aucun ticket", async () => {
		// Sinon l'interface afficherait un ticket qui n'existe pas côté Jira.
		configurerJira();
		run([vuln()]);
		stubJira({ status: 500, text: "boom" });
		await creer();
		expect(getTickets()).toEqual([]);
	});
});

describe("POST /api/tickets/test-connection", () => {
	function tester(body: unknown) {
		return srv.json<{ success?: boolean; user?: string; error?: string }>(
			"/api/tickets/test-connection",
			jsonBody(body),
		);
	}

	test("des paramètres manquants renvoient 400", async () => {
		const { status, data } = await tester({ baseUrl: "https://jira.test" });
		expect(status).toBe(400);
		expect(data.error).toBe("Paramètres manquants.");
	});

	test("une connexion valide renvoie le nom affiché", async () => {
		stubJira({ body: { displayName: "Aegis Bot" } });
		const { status, data } = await tester({
			baseUrl: "https://jira.test",
			user: "u",
			apiKey: "k",
		});
		expect(status).toBe(200);
		expect(data).toEqual({ success: true, user: "Aegis Bot" });
	});

	test("l'appel interroge le point d'entrée myself", async () => {
		stubJira({ body: { displayName: "Aegis Bot" } });
		await tester({ baseUrl: "https://jira.test", user: "u", apiKey: "k" });
		expect(appelsJira[0]?.url).toBe("https://jira.test/rest/api/3/myself");
	});

	test("un refus d'authentification renvoie 400 avec le statut", async () => {
		stubJira({ status: 401 });
		const { status, data } = await tester({
			baseUrl: "https://jira.test",
			user: "u",
			apiKey: "mauvaise",
		});
		expect(status).toBe(400);
		expect(data.success).toBe(false);
		expect(data.error).toBe("Statut HTTP 401");
	});

	test("une panne réseau renvoie 400, pas 500", async () => {
		// Le test de connexion sert à diagnostiquer : il doit toujours répondre.
		stubJira({ throws: true });
		const { status, data } = await tester({
			baseUrl: "https://jira.test",
			user: "u",
			apiKey: "k",
		});
		expect(status).toBe(400);
		expect(data.success).toBe(false);
		expect(data.error).toBe("ENOTFOUND");
	});
});
