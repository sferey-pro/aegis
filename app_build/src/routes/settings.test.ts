import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { getDb } from "@/db";
import { getAllAnnotations, upsertAnnotation } from "@/db/annotations";
import { createProject, listProjects, type Project } from "@/db/projects";
import { getSetting, setSetting } from "@/db/settings";
import { jsonBody, startTestServer, type TestServer } from "@/test/server";

let srv: TestServer;

/**
 * `createSnapshot`/`restoreSnapshot` travaillent sur des chemins figés dans le
 * répertoire de travail du process, sans tenir compte de `DB_PATH`. La
 * restauration appelle en plus `process.exit(0)` : elle n'est donc **pas**
 * exercée ici, seul son refus l'est. Le fichier de sauvegarde est retiré après
 * chaque test pour ne pas laisser un `backup.sqlite` dans le dépôt.
 */
const FICHIER_SAUVEGARDE = resolve(process.cwd(), "backup.sqlite");

beforeAll(async () => {
	srv = await startTestServer("settings");
});
afterAll(() => srv.stop());

beforeEach(() => {
	getDb().query("DELETE FROM settings").run();
	getDb().query("DELETE FROM projects").run();
});

afterEach(() => {
	if (existsSync(FICHIER_SAUVEGARDE))
		rmSync(FICHIER_SAUVEGARDE, { force: true });
});

describe("GET /api/settings", () => {
	test("une base neuve renvoie un objet vide", async () => {
		const { status, data } = await srv.json("/api/settings");
		expect(status).toBe(200);
		expect(data).toEqual({});
	});

	test("renvoie toutes les paires enregistrées", async () => {
		setSetting("GITHUB_TOKEN", "ghp_x");
		setSetting("AUDIT_MAX_AGE_HOURS", "24");
		const { data } = await srv.json("/api/settings");
		expect(data).toEqual({ GITHUB_TOKEN: "ghp_x", AUDIT_MAX_AGE_HOURS: "24" });
	});

	test("le jeton est renvoyé en clair — écart documenté", async () => {
		// `GET /api/settings` alimente le formulaire, qui doit réafficher la valeur
		// saisie. L'export, lui, masque le jeton. La conséquence est que le jeton
		// circule en clair dès que l'interface est jointe sans TLS.
		setSetting("GITHUB_TOKEN", "ghp_secret");
		const { data } = await srv.json<Record<string, string>>("/api/settings");
		expect(data.GITHUB_TOKEN).toBe("ghp_secret");
	});
});

describe("PUT /api/settings", () => {
	function enregistrer(body: unknown) {
		return srv.json(`/api/settings`, { ...jsonBody(body), method: "PUT" });
	}

	test("enregistre le lot et confirme", async () => {
		const { status, data } = await enregistrer({ GITHUB_TOKEN: "ghp_x" });
		expect(status).toBe(200);
		expect(data).toEqual({ success: true });
		expect(getSetting("GITHUB_TOKEN")).toBe("ghp_x");
	});

	test("les valeurs non textuelles sont stockées en texte", async () => {
		await enregistrer({ AUDIT_MAX_AGE_HOURS: 48, AI_ENABLED: true });
		expect(getSetting("AUDIT_MAX_AGE_HOURS")).toBe("48");
		expect(getSetting("AI_ENABLED")).toBe("true");
	});

	test("un lot partiel ne détruit pas les autres clés", async () => {
		// L'écran Réglages enregistre section par section : un remplacement
		// intégral effacerait le jeton en sauvegardant les seuils.
		setSetting("GITHUB_TOKEN", "ghp_x");
		await enregistrer({ AUDIT_MAX_AGE_HOURS: "12" });
		expect(getSetting("GITHUB_TOKEN")).toBe("ghp_x");
	});

	test("AUDIT_MAX_AGE_HOURS accepte 0 et -1", async () => {
		// `0` = jamais périmé, `-1` = toujours réauditer (CONTEXT.md §12).
		expect((await enregistrer({ AUDIT_MAX_AGE_HOURS: "0" })).status).toBe(200);
		expect((await enregistrer({ AUDIT_MAX_AGE_HOURS: "-1" })).status).toBe(200);
	});

	test("une durée non numérique renvoie 400", async () => {
		const { status, data } = await enregistrer({
			AUDIT_MAX_AGE_HOURS: "beaucoup",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Durée invalide" });
	});

	test("une durée sous -1 renvoie 400", async () => {
		expect((await enregistrer({ AUDIT_MAX_AGE_HOURS: "-2" })).status).toBe(400);
	});

	test("une durée invalide fait échouer tout le lot", async () => {
		// Enregistrer les autres clés en ignorant celle-ci afficherait un succès
		// pour une valeur non appliquée.
		await enregistrer({
			GITHUB_TOKEN: "ghp_x",
			AUDIT_MAX_AGE_HOURS: "beaucoup",
		});
		expect(getSetting("GITHUB_TOKEN")).toBe("");
	});

	test("un lot vide est accepté", async () => {
		expect((await enregistrer({})).status).toBe(200);
	});

	test("un JSON illisible renvoie 400 « JSON invalide »", async () => {
		const { status, data } = await srv.json("/api/settings", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "JSON invalide" });
	});
});

describe("GET /api/config/export", () => {
	test("exporte projets, réglages et annotations", async () => {
		const p = createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		upsertAnnotation("CVE-2024-1", p.id, { status: "confirmed" });
		setSetting("AUDIT_MAX_AGE_HOURS", "24");

		const { status, data } = await srv.json<{
			projects: Project[];
			settings: Record<string, string>;
			annotations: { cve: string }[];
		}>("/api/config/export");

		expect(status).toBe(200);
		expect(data.projects).toHaveLength(1);
		expect(data.settings.AUDIT_MAX_AGE_HOURS).toBe("24");
		expect(data.annotations[0]?.cve).toBe("CVE-2024-1");
	});

	test("le jeton GitHub est masqué", async () => {
		// L'export est destiné à être partagé ou versionné : il ne doit pas
		// contenir de secret.
		setSetting("GITHUB_TOKEN", "ghp_secret");
		const { data } = await srv.json<{ settings: Record<string, string> }>(
			"/api/config/export",
		);
		expect(data.settings.GITHUB_TOKEN).toBe("***");
	});

	test("la clé Jira est masquée", async () => {
		setSetting("JIRA_API_KEY", "jira_secret");
		const { data } = await srv.json<{ settings: Record<string, string> }>(
			"/api/config/export",
		);
		expect(data.settings.JIRA_API_KEY).toBe("***");
	});

	test("un export sur base vide reste exploitable", async () => {
		const { data } = await srv.json<{
			projects: unknown[];
			annotations: unknown[];
		}>("/api/config/export");
		expect(data.projects).toEqual([]);
		expect(data.annotations).toEqual([]);
	});
});

describe("POST /api/config/import", () => {
	function importer(body: unknown) {
		return srv.json<{ success: boolean }>("/api/config/import", jsonBody(body));
	}

	test("importe les réglages", async () => {
		const { status, data } = await importer({
			settings: { AUDIT_MAX_AGE_HOURS: "48" },
		});
		expect(status).toBe(200);
		expect(data.success).toBe(true);
		expect(getSetting("AUDIT_MAX_AGE_HOURS")).toBe("48");
	});

	test("une valeur masquée n'écrase pas le secret en place", async () => {
		// C'est ce qui rend un export réimportable : réappliquer « *** » aurait
		// détruit le jeton.
		setSetting("GITHUB_TOKEN", "ghp_reel");
		await importer({ settings: { GITHUB_TOKEN: "***" } });
		expect(getSetting("GITHUB_TOKEN")).toBe("ghp_reel");
	});

	test("crée les projets absents", async () => {
		await importer({
			projects: [
				{
					id: 7,
					slug: "api",
					name: "api",
					path: "/srv/api",
					type: "node",
					tool: "npm",
					tags: [],
				},
			],
		});
		expect(listProjects()).toHaveLength(1);
	});

	test("met à jour un projet existant repéré par son slug", async () => {
		// L'import doit être rejouable : deux passes ne doivent pas doubler le parc.
		const corps = {
			projects: [
				{
					id: 7,
					slug: "api",
					name: "api",
					path: "/srv/api",
					type: "node",
					tool: "npm",
					tags: [],
				},
			],
		};
		await importer(corps);
		await importer(corps);
		expect(listProjects()).toHaveLength(1);
	});

	test("les annotations sont rattachées au nouvel identifiant du projet", async () => {
		// Les identifiants changent d'une instance à l'autre : sans la table de
		// correspondance, les annotations viseraient des projets inexistants.
		await importer({
			projects: [
				{
					id: 7,
					slug: "api",
					name: "api",
					path: "/srv/api",
					type: "node",
					tool: "npm",
					tags: [],
				},
			],
			annotations: [
				{ cve: "CVE-2024-1", project_id: 7, status: "confirmed", note: "n" },
			],
		});

		const [p] = listProjects();
		const annotations = getAllAnnotations();
		expect(annotations).toHaveLength(1);
		expect(annotations[0]?.project_id).toBe(p?.id as number);
		expect(annotations[0]?.status).toBe("confirmed");
	});

	test("une annotation visant un projet non importé est ignorée", async () => {
		await importer({
			annotations: [
				{ cve: "CVE-2024-1", project_id: 999, status: "confirmed" },
			],
		});
		expect(getAllAnnotations()).toEqual([]);
	});

	test("une annotation globale fait échouer l'import en 500 — écart documenté", async () => {
		// L'import conserve `project_id = -1` tel quel, mais la colonne porte une
		// clé étrangère vers `projects` : l'insertion lève et le reste du corps
		// n'est pas appliqué.
		const { status } = await srv.json(
			"/api/config/import",
			jsonBody({
				annotations: [{ cve: "CVE-2024-1", project_id: -1, status: "ignored" }],
			}),
		);
		expect(status).toBe(500);
	});

	test("un corps vide est accepté sans rien changer", async () => {
		const { status, data } = await importer({});
		expect(status).toBe(200);
		expect(data.success).toBe(true);
	});

	test("un corps illisible renvoie 500 — écart documenté", async () => {
		// La route lit `req.json()` sans passer par `parseBody` : l'exception
		// remonte au gestionnaire global au lieu du 400 des autres routes.
		const { status } = await srv.json("/api/config/import", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		expect(status).toBe(500);
	});
});

describe("instantanés", () => {
	test("la création écrit un fichier de sauvegarde et renvoie son chemin", async () => {
		const { status, data } = await srv.json<{
			success: boolean;
			path: string;
		}>("/api/snapshots/create", { method: "POST" });

		expect(status).toBe(200);
		expect(data.success).toBe(true);
		expect(existsSync(data.path)).toBe(true);
	});

	test("le chemin de sauvegarde ignore DB_PATH — écart documenté", async () => {
		// `backup.sqlite` et `aegis.db` sont résolus depuis le répertoire de
		// travail du process, pas depuis la base réellement ouverte : une instance
		// configurée ailleurs sauvegarde et restaure le mauvais fichier.
		const { data } = await srv.json<{ path: string }>("/api/snapshots/create", {
			method: "POST",
		});
		expect(data.path).toBe(FICHIER_SAUVEGARDE);
		expect(data.path).not.toBe(srv.dbPath);
	});

	test("une restauration sans fichier renvoie 400", async () => {
		// La restauration réussie appelle `process.exit(0)` : seul son refus est
		// exerçable dans un test.
		if (existsSync(FICHIER_SAUVEGARDE))
			rmSync(FICHIER_SAUVEGARDE, { force: true });
		const { status, data } = await srv.json<{ error: string }>(
			"/api/snapshots/restore",
			jsonBody({ file: "backup.sqlite" }),
		);
		expect(status).toBe(400);
		expect(data.error).toContain("Aucun snapshot trouvé");
	});

	test("une restauration sans nom de fichier renvoie 400", async () => {
		const { status, data } = await srv.json(
			"/api/snapshots/restore",
			jsonBody({ file: "  " }),
		);
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Fichier requis" });
	});

	test("le nom de fichier demandé est ignoré — écart documenté", async () => {
		// Le schéma exige `file`, mais `restoreSnapshot()` ne le reçoit pas : elle
		// restaure toujours `backup.sqlite`. Le champ ne sert donc qu'à valider.
		if (existsSync(FICHIER_SAUVEGARDE))
			rmSync(FICHIER_SAUVEGARDE, { force: true });
		const { data } = await srv.json<{ error: string }>(
			"/api/snapshots/restore",
			jsonBody({ file: "un-autre-instantane.sqlite" }),
		);
		expect(data.error).toContain("backup.sqlite");
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
	// N5 — CONTEXT.md §12 ne spécifie que trois clés en sortie. Un secret ne doit
	// jamais repartir en clair : l'export voisin prend déjà la peine de le masquer.
	test.failing("GET /api/settings ne renvoie pas les secrets (N5)", async () => {
		setSetting("GITHUB_TOKEN", "ghp_secret");
		setSetting("JIRA_API_KEY", "jira_secret");
		const { data } = await srv.json<Record<string, string>>("/api/settings");
		expect(data.GITHUB_TOKEN).toBeUndefined();
		expect(data.JIRA_API_KEY).toBeUndefined();
	});

	// N35 — 400 « JSON invalide » comme les routes passant par parseBody.
	test.failing("un corps illisible renvoie 400 « JSON invalide » (N35)", async () => {
		const { status, data } = await srv.json("/api/config/import", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "JSON invalide" });
	});

	// N7 — l'import doit être atomique : une annotation en échec ne doit pas
	// laisser les projets déjà créés derrière elle. Ici, le projet ne doit pas
	// exister puisque l'annotation qui suit échoue.
	test.failing("un import qui échoue ne laisse rien derrière lui (N7)", async () => {
		const { status } = await srv.json(
			"/api/config/import",
			jsonBody({
				projects: [
					{
						id: 7,
						slug: "api",
						name: "api",
						path: "/srv/api",
						type: "node",
						tool: "npm",
						tags: [],
					},
				],
				annotations: [{ cve: "CVE-2024-1", project_id: -1, status: "ignored" }],
			}),
		);
		expect(status).not.toBe(500);
		expect(listProjects()).toHaveLength(0);
	});

	// N2 — la cible de sauvegarde doit être dérivée de DB_PATH, avec la même
	// résolution que getDb(), sinon on sauvegarde une base que personne n'ouvre.
	test.failing("l'instantané est dérivé de DB_PATH (N2)", async () => {
		const { data } = await srv.json<{ path: string }>("/api/snapshots/create", {
			method: "POST",
		});
		expect(data.path).toContain(srv.dbPath.replace(/\.sqlite$/, ""));
	});

	// N2 — le champ `file` est exigé par le schéma : il doit être utilisé.
	test.failing("le nom de fichier demandé est pris en compte (N2)", async () => {
		if (existsSync(FICHIER_SAUVEGARDE))
			rmSync(FICHIER_SAUVEGARDE, { force: true });
		const { data } = await srv.json<{ error: string }>(
			"/api/snapshots/restore",
			jsonBody({ file: "un-autre-instantane.sqlite" }),
		);
		expect(data.error).toContain("un-autre-instantane.sqlite");
	});
});
