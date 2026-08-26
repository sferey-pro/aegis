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
import {
	addConsoleClient,
	type ConsoleEvent,
	removeConsoleClient,
} from "@/lib/console";
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

	test("deux projets aux charges identiques ne se bloquent pas (N41)", async () => {
		// L'empreinte ne contenait pas le projet : deux projets partageant paquet et
		// CVE produisaient le **même** hash, et le second recevait un 409 citant le
		// ticket du premier — une référence sur laquelle son référent n'a aucune
		// prise. Le projet entre désormais dans l'empreinte.
		configurerJira();
		const autre = createProject({
			name: "jumeau",
			path: "/srv/jumeau",
			type: "node",
			tool: "npm",
		});
		run([vuln()]);
		run([vuln()], autre.id);

		stubJira({ body: { key: "SEC-42" } });
		expect((await creer()).status).toBe(200);

		stubJira({ body: { key: "SEC-43" } });
		const { status, data } = await creer({ projectId: autre.id });
		expect(status).toBe(200);
		expect(data.ticketRef).toBe("SEC-43");
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

describe("traçabilité dans la console (§11)", () => {
	/**
	 * Les appels sortants vers Jira n'émettaient **aucun** événement : la console
	 * montrait git, les audits et GitHub, mais pas le seul point où l'outil écrit
	 * chez un tiers. On ne pouvait donc pas relire ce qui partait.
	 */
	function ecouterConsole() {
		const vus: ConsoleEvent[] = [];
		// La console diffuse du SSE vers des `ReadableStreamDefaultController` : on
		// en simule un et on relit les charges `data: …`.
		const client = {
			enqueue(payload: string) {
				for (const ligne of payload.split("\n")) {
					if (ligne.startsWith("data: ")) vus.push(JSON.parse(ligne.slice(6)));
				}
			},
		} as unknown as ReadableStreamDefaultController<string>;
		addConsoleClient(client);
		return { vus, arret: () => removeConsoleClient(client) };
	}

	test("le test de connexion s'annonce et se conclut", async () => {
		configurerJira();
		stubJira({ body: { displayName: "Bot Aegis" } });
		const { vus, arret } = ecouterConsole();
		try {
			await srv.json("/api/tickets/test-connection", { method: "POST" });
		} finally {
			arret();
		}

		// L'événement de fin ne porte ni `cmd`, ni `cwd`, ni `label` : il se corrèle
		// au départ par son `id`. C'est le contrat de §11, et le filtrer par label
		// le ferait disparaître.
		const depart = vus.find((e) => e.label === "jira" && e.phase === "start");
		expect(depart?.cmd).toContain("/rest/api/3/myself");

		const fin = vus.find((e) => e.phase === "end" && e.id === depart?.id);
		// `ok` explicite : un 200 ne doit pas s'afficher avec une croix rouge.
		expect(fin?.ok).toBe(true);
		expect(fin?.exitCode).toBe(200);
	});

	test("la charge envoyée à Jira est visible avant l'appel", async () => {
		// C'est la raison d'être de cette trace : relire ce qui part.
		// La création exige une vulnérabilité réelle dans le dernier run : c'est ce
		// qu'elle décrit dans le ticket.
		run([vuln()]);
		configurerJira();
		stubJira({ body: { key: "SEC-7" } });
		const { vus, arret } = ecouterConsole();
		try {
			await srv.json(
				"/api/tickets/create",
				jsonBody({
					projectId: projet.id,
					packageName: "lodash",
					cves: ["CVE-2020-8203"],
				}),
			);
		} finally {
			arret();
		}

		const depart = vus.find((e) => e.label === "jira" && e.phase === "start");
		expect(depart?.cmd).toContain("/rest/api/3/issue");
		expect(depart?.outText).toContain("lodash");
	});

	test("le jeton ne figure jamais dans la console", async () => {
		// Le flux SSE est diffusé à tout abonné : un secret qui y passe est un
		// secret publié.
		run([vuln()]);
		configurerJira({ JIRA_API_KEY: "jeton-tres-secret" });
		stubJira({ body: { key: "SEC-8" } });
		const { vus, arret } = ecouterConsole();
		try {
			await srv.json(
				"/api/tickets/create",
				jsonBody({
					projectId: projet.id,
					packageName: "lodash",
					cves: ["CVE-2020-8203"],
				}),
			);
		} finally {
			arret();
		}

		const tout = JSON.stringify(vus);
		expect(tout).not.toContain("jeton-tres-secret");
		expect(tout).not.toContain("Basic ");
	});

	test("un échec Jira est marqué en échec, avec son statut", async () => {
		run([vuln()]);
		configurerJira();
		stubJira({ status: 403, text: "Forbidden" });
		const { vus, arret } = ecouterConsole();
		try {
			await srv.json(
				"/api/tickets/create",
				jsonBody({
					projectId: projet.id,
					packageName: "lodash",
					cves: ["CVE-2020-8203"],
				}),
			);
		} finally {
			arret();
		}

		const depart = vus.find((e) => e.label === "jira" && e.phase === "start");
		const fin = vus.find((e) => e.phase === "end" && e.id === depart?.id);
		expect(fin?.ok).toBe(false);
		expect(fin?.exitCode).toBe(403);
		expect(fin?.errorText).toContain("Forbidden");
	});

	test("une réponse Jira sans clé d'issue n'enregistre rien", async () => {
		// `key` est optionnel dans le schéma `CreatedIssue` — c'est le typage généré
		// depuis le swagger qui l'a révélé. La valeur partait telle quelle dans
		// `saveTicket`, donc en base sous la forme « undefined » : un lien de ticket
		// qui ne mène nulle part, indistinguable d'un vrai.
		run([vuln()]);
		configurerJira();
		stubJira({
			body: { id: "10042", self: "https://jira/rest/api/3/issue/10042" },
		});

		const { status, data } = await srv.json<{ error: string }>(
			"/api/tickets/create",
			jsonBody({
				projectId: projet.id,
				packageName: "lodash",
				cves: ["CVE-2020-8203"],
			}),
		);

		expect(status).toBe(502);
		expect(data.error).toContain("sans clé d'issue");
		// Rien en base : un ticket sans référence ne se retrouve pas.
		expect(getTickets()).toHaveLength(0);
	});

	test("une coupure réseau donne 502, et non 500", async () => {
		// Le `fetch` de la création n'était pas gardé : l'exception remontait au
		// gestionnaire global de Bun.serve, qui répond « Internal Server Error »
		// pour une panne qui n'est pas celle du serveur.
		run([vuln()]);
		configurerJira();
		stubJira({ throws: true });
		const { status } = await srv.json<{ error: string }>(
			"/api/tickets/create",
			jsonBody({
				projectId: projet.id,
				packageName: "lodash",
				cves: ["CVE-2020-8203"],
			}),
		);
		expect(status).toBe(502);
	});
});

describe("passerelle Atlassian (jeton à portées)", () => {
	const CLOUD = "11111111-2222-3333-4444-555555555555";

	test("l'appel part vers /ex/jira/<cloudId>, préfixe conservé", async () => {
		// Le défaut : la construction d'URL résolvait le chemin depuis la racine du
		// domaine et effaçait `/ex/jira/<cloudId>`. L'appel partait vers
		// `https://api.atlassian.com/rest/api/3/myself`, qui n'existe pas.
		configurerJira({ JIRA_TOKEN_KIND: "scoped", JIRA_CLOUD_ID: CLOUD });
		stubJira({ body: { displayName: "Bot Aegis" } });

		const { status } = await srv.json("/api/tickets/test-connection", {
			method: "POST",
		});

		expect(status).toBe(200);
		expect(appelsJira[0]?.url).toBe(
			`https://api.atlassian.com/ex/jira/${CLOUD}/rest/api/3/myself`,
		);
	});

	test("sans Cloud ID, le message dit quoi corriger et où le trouver", async () => {
		// « URL Jira invalide » envoyait l'utilisateur modifier le bon champ pour la
		// mauvaise raison.
		configurerJira({ JIRA_TOKEN_KIND: "scoped" });
		stubJira({ body: { displayName: "Bot" } });

		const { status, data } = await srv.json<{ error: string }>(
			"/api/tickets/test-connection",
			{ method: "POST" },
		);

		expect(status).toBe(400);
		expect(data.error).toContain("Cloud ID");
		expect(data.error).toContain("_edge/tenant_info");
		// Aucun appel sortant : on ne tente pas une URL qu'on sait fausse.
		expect(appelsJira).toHaveLength(0);
	});

	test("la création de ticket passe aussi par la passerelle", async () => {
		run([vuln()]);
		configurerJira({ JIRA_TOKEN_KIND: "scoped", JIRA_CLOUD_ID: CLOUD });
		stubJira({ body: { key: "SEC-9" } });

		await srv.json(
			"/api/tickets/create",
			jsonBody({
				projectId: projet.id,
				packageName: "lodash",
				cves: ["CVE-2020-8203"],
			}),
		);

		expect(appelsJira[0]?.url).toBe(
			`https://api.atlassian.com/ex/jira/${CLOUD}/rest/api/3/issue`,
		);
	});

	test("un jeton simple n'est pas affecté par le Cloud ID", async () => {
		// Le réglage peut rester renseigné après un changement de type : il ne doit
		// pas altérer un appel qui n'en a pas besoin.
		configurerJira({ JIRA_CLOUD_ID: CLOUD });
		stubJira({ body: { displayName: "Bot" } });

		await srv.json("/api/tickets/test-connection", { method: "POST" });

		expect(appelsJira[0]?.url).toBe(
			"https://jira.example.test/rest/api/3/myself",
		);
	});
});

describe("POST /api/tickets/test-connection", () => {
	/**
	 * La route ne lit plus le corps de la requête : elle vérifie la configuration
	 * **enregistrée** (N4). Le corps est donc envoyé vide, et l'un des tests
	 * vérifie qu'un corps hostile reste sans effet.
	 */
	function tester() {
		return srv.json<{ success?: boolean; user?: string; error?: string }>(
			"/api/tickets/test-connection",
			{ method: "POST" },
		);
	}

	test("une configuration incomplète renvoie 400 avec une consigne", async () => {
		const { status, data } = await tester();
		expect(status).toBe(400);
		expect(data.error).toContain("Configuration Jira incomplète");
	});

	test("une configuration valide renvoie le nom affiché", async () => {
		configurerJira();
		stubJira({ body: { displayName: "Aegis Bot" } });
		const { status, data } = await tester();
		expect(status).toBe(200);
		expect(data).toEqual({ success: true, user: "Aegis Bot" });
	});

	test("l'appel interroge le point d'entrée myself de l'hôte configuré", async () => {
		configurerJira();
		stubJira({ body: { displayName: "Aegis Bot" } });
		await tester();
		expect(appelsJira[0]?.url).toBe(
			"https://jira.example.test/rest/api/3/myself",
		);
	});

	test("le corps de la requête est ignoré (N4)", async () => {
		// C'était la SSRF : `baseUrl` venait du corps, et le serveur y envoyait un
		// en-tête `Authorization: Basic`. Un corps hostile ne doit plus rien
		// pouvoir détourner.
		configurerJira();
		stubJira({ body: { displayName: "Aegis Bot" } });
		await srv.json(
			"/api/tickets/test-connection",
			jsonBody({
				baseUrl: "http://169.254.169.254",
				user: "attaquant",
				apiKey: "peu-importe",
			}),
		);
		expect(appelsJira[0]?.url).toBe(
			"https://jira.example.test/rest/api/3/myself",
		);
		expect(appelsJira[0]?.url).not.toContain("169.254.169.254");
	});

	test("une URL http enregistrée est refusée sans appel sortant", async () => {
		// Garde-fou du point d'utilisation : une valeur entrée par un import de
		// configuration n'a pas traversé la validation d'écriture.
		configurerJira({ JIRA_BASE_URL: "http://jira.example.test" });
		stubJira({ body: { displayName: "Aegis Bot" } });
		const { status, data } = await tester();
		expect(status).toBe(400);
		expect(data.error).toBe("URL Jira invalide (https requis)");
		expect(appelsJira).toHaveLength(0);
	});

	test("un refus d'authentification renvoie 400 avec le statut", async () => {
		configurerJira();
		stubJira({ status: 401 });
		const { status, data } = await tester();
		expect(status).toBe(400);
		expect(data.success).toBe(false);
		expect(data.error).toBe("Statut HTTP 401");
	});

	test("une panne réseau renvoie 400, pas 500", async () => {
		// Le test de connexion sert à diagnostiquer : il doit toujours répondre.
		run([vuln()]);
		configurerJira();
		stubJira({ throws: true });
		const { status, data } = await tester();
		expect(status).toBe(400);
		expect(data.success).toBe(false);
		expect(data.error).toBe("ENOTFOUND");
	});
});
