import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "bun";

import { getDb } from "@/db";
import type { Project } from "@/db/projects";
import { addRun } from "@/db/runs";
import { jsonBody, startTestServer, type TestServer } from "@/test/server";
import type { ProjectListItem } from "./projects";

/**
 * Tests fonctionnels : vrai serveur, vraie base, vraies requêtes HTTP.
 *
 * Ce qui est vérifié ici n'est pas la logique des modules — elle a ses propres
 * tests — mais le contrat exposé : codes de statut, forme des corps, messages
 * d'erreur, et les gardes qui n'existent qu'au niveau de la route (autorisation
 * de chemin, détection de doublon, 404 avant validation).
 */

let srv: TestServer;
const aNettoyer: string[] = [];

beforeAll(async () => {
	srv = await startTestServer("projects");
});

afterAll(() => {
	srv.stop();
});

beforeEach(() => {
	// La base vit pour tout le fichier : chaque test repart d'un parc vide.
	getDb().query("DELETE FROM projects").run();
});

afterEach(() => {
	delete process.env.AEGIS_ALLOWED_ROOTS;
	for (const d of aNettoyer.splice(0))
		rmSync(d, { recursive: true, force: true });
});

function dossier(label: string): string {
	const d = join(tmpdir(), `aegis-route-${label}-${randomUUID()}`);
	mkdirSync(d, { recursive: true });
	aNettoyer.push(d);
	return d;
}

function depot(label = "repo"): string {
	const d = dossier(label);
	for (const args of [
		["init", "-q", "-b", "main"],
		["config", "user.email", "test@aegis.local"],
		["config", "user.name", "Aegis Test"],
	]) {
		spawnSync(["git", ...args], { cwd: d, env: process.env });
	}
	writeFileSync(join(d, "README.md"), "x\n");
	spawnSync(["git", "add", "."], { cwd: d, env: process.env });
	spawnSync(["git", "commit", "-q", "-m", "init"], {
		cwd: d,
		env: process.env,
	});
	return d;
}

const corpsProjet = {
	name: "API",
	path: "/srv/api",
	type: "node",
	tool: "npm",
};

/** Le paramètre de type permet aux tests d'erreur d'attendre `{ error }`. */
function creer<T = Project>(over: Record<string, unknown> = {}) {
	return srv.json<T>("/api/projects", jsonBody({ ...corpsProjet, ...over }));
}

describe("POST /api/projects", () => {
	test("crée le projet et renvoie 201", async () => {
		const { status, data } = await creer();
		expect(status).toBe(201);
		expect(data.id).toBeGreaterThan(0);
		expect(data.name).toBe("API");
		expect(data.path).toBe("/srv/api");
		expect(data.tags).toEqual([]);
		expect(data.ignored).toBe(false);
	});

	test("normalise les tags avant enregistrement", async () => {
		const { data } = await creer({ tags: [" back ", "back", "", "front"] });
		expect(data.tags).toEqual(["back", "front"]);
	});

	test("un corps invalide renvoie 400 et le message du contrat", async () => {
		const { status, data } = await creer<{ error: string }>({ name: "" });
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Nom requis" });
	});

	test("un JSON illisible renvoie 400 « JSON invalide »", async () => {
		const { status, data } = await srv.json("/api/projects", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{ cassé",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "JSON invalide" });
	});

	test("un type inconnu renvoie 400", async () => {
		const { status, data } = await creer<{ error: string }>({ type: "python" });
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Type invalide (node|composer)" });
	});

	test("une cible déjà visée renvoie 409 en nommant le projet existant", async () => {
		// C'est ce qui empêche deux projets d'auditer le même dossier et de faire
		// compter la même faille deux fois dans les statistiques.
		await creer({ name: "Premier" });
		const { status, data } = await creer<{ error: string }>({ name: "Second" });
		expect(status).toBe(409);
		expect(data.error).toContain("Premier");
	});

	test("un doublon écrit différemment est tout de même détecté", async () => {
		await creer({ name: "Premier", path: "/srv/api" });
		const { status } = await creer({ name: "Second", path: "/srv/api///" });
		expect(status).toBe(409);
	});

	test("racine et sous-dossier convergents sont un doublon", async () => {
		await creer({ name: "Racine", path: "/srv/mono/packages/api" });
		const { status } = await creer({
			name: "Sous",
			path: "/srv/mono",
			audit_path: "packages/api",
		});
		expect(status).toBe(409);
	});

	test("deux sous-dossiers d'un même dépôt ne sont pas des doublons", async () => {
		// Un monorepo doit rester auditables paquet par paquet.
		await creer({ name: "API", path: "/srv/mono", audit_path: "packages/api" });
		const { status } = await creer({
			name: "Web",
			path: "/srv/mono",
			audit_path: "packages/web",
		});
		expect(status).toBe(201);
	});
});

describe("POST /api/projects — AEGIS_ALLOWED_ROOTS", () => {
	test("un chemin hors des racines autorisées est refusé en 403", async () => {
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		const { status, data } = await creer<{ error: string }>({
			path: "/srv/interdit",
		});
		expect(status).toBe(403);
		expect(data).toEqual({
			error: "Chemin non autorisé par AEGIS_ALLOWED_ROOTS",
		});
	});

	test("un chemin sous une racine autorisée passe", async () => {
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		expect((await creer({ path: "/srv/autorise/api" })).status).toBe(201);
	});

	test("la racine elle-même est autorisée", async () => {
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		expect((await creer({ path: "/srv/autorise" })).status).toBe(201);
	});

	test("un préfixe partiel ne suffit pas", async () => {
		// `/srv/autorise-bis` commence par `/srv/autorise` sans être dessous : la
		// comparaison doit se faire au séparateur.
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		expect((await creer({ path: "/srv/autorise-bis" })).status).toBe(403);
	});

	test("plusieurs racines sont acceptées, séparées par des virgules", async () => {
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/a , /srv/b";
		expect((await creer({ path: "/srv/b/api" })).status).toBe(201);
	});

	test("sans la variable, tout chemin est accepté", async () => {
		expect((await creer({ path: "/n/importe/ou" })).status).toBe(201);
	});

	test("une cible d'audit hors racines est refusée même si la racine est autorisée", async () => {
		// C'est la faille corrigée : seule la racine était contrôlée, si bien qu'un
		// `audit_path` absolu faisait exécuter l'outil d'audit n'importe où.
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		const { status } = await creer({
			path: "/srv/autorise/mono",
			audit_path: "/etc",
		});
		expect(status).toBe(403);
	});

	test("une cible d'audit qui remonte hors racines est refusée", async () => {
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		const { status } = await creer({
			path: "/srv/autorise/mono",
			audit_path: "../../../etc",
		});
		expect(status).toBe(403);
	});

	test("le contrôle précède la détection de doublon", async () => {
		// Un 409 sur un chemin interdit révélerait l'existence du projet.
		await creer({ name: "Existant", path: "/srv/interdit" });
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		expect((await creer({ path: "/srv/interdit" })).status).toBe(403);
	});
});

describe("GET /api/projects", () => {
	test("un parc vide renvoie une liste vide", async () => {
		const { status, data } = await srv.json<ProjectListItem[]>("/api/projects");
		expect(status).toBe(200);
		expect(data).toEqual([]);
	});

	test("chaque projet est enrichi de son état git et de son dernier run", async () => {
		const repo = depot("liste");
		await creer({ path: repo });

		const { data } = await srv.json<ProjectListItem[]>("/api/projects");
		expect(data).toHaveLength(1);
		expect(data[0]?.git.isRepo).toBe(true);
		expect(data[0]?.lastRun).toBeNull();
	});

	test("un projet hors dépôt est renvoyé avec isRepo faux, sans erreur", async () => {
		await creer({ path: dossier("hors-git") });
		const { data } = await srv.json<ProjectListItem[]>("/api/projects");
		expect(data[0]?.git.isRepo).toBe(false);
	});

	test("un chemin inexistant n'empêche pas de lister le parc", async () => {
		// Un projet dont le dossier a été supprimé doit rester visible pour être
		// corrigé ou retiré.
		await creer({ path: "/chemin/absent/total" });
		const { status, data } = await srv.json<ProjectListItem[]>("/api/projects");
		expect(status).toBe(200);
		expect(data).toHaveLength(1);
	});

	test("plusieurs projets sont tous enrichis malgré la concurrence", async () => {
		// L'enrichissement git tourne sur quatre travailleurs : aucune entrée ne
		// doit rester vide.
		for (let i = 0; i < 9; i++)
			await creer({ name: `p${i}`, path: `/srv/p${i}` });
		const { data } = await srv.json<ProjectListItem[]>("/api/projects");
		expect(data).toHaveLength(9);
		expect(data.every((p) => p && typeof p.git === "object")).toBe(true);
	});
});

describe("GET /api/projects/:id", () => {
	test("renvoie le projet enrichi", async () => {
		const { data: cree } = await creer({ path: depot("un") });
		const { status, data } = await srv.json<ProjectListItem>(
			`/api/projects/${cree.id}`,
		);
		expect(status).toBe(200);
		expect(data.id).toBe(cree.id);
		expect(data.git.isRepo).toBe(true);
		expect(data.lastRun).toBeNull();
	});

	test("un identifiant inconnu renvoie 404", async () => {
		const { status, data } = await srv.json("/api/projects/999999");
		expect(status).toBe(404);
		expect(data).toEqual({ error: "Not found" });
	});

	test("un identifiant non numérique renvoie 404", async () => {
		const { status } = await srv.json("/api/projects/abc");
		expect(status).toBe(404);
	});
});

describe("PUT /api/projects/:id", () => {
	test("met à jour le projet", async () => {
		const { data: cree } = await creer();
		const { status, data } = await srv.json<Project>(
			`/api/projects/${cree.id}`,
			{
				...jsonBody({ ...corpsProjet, name: "API v2", tags: ["back"] }),
				method: "PUT",
			},
		);
		expect(status).toBe(200);
		expect(data.name).toBe("API v2");
		expect(data.tags).toEqual(["back"]);
	});

	test("un identifiant inconnu renvoie 404 avant toute validation", async () => {
		// Sans ce contrôle, un corps invalide sur un id inexistant répondrait 400,
		// ce qui laisserait croire que le projet existe.
		const { status, data } = await srv.json("/api/projects/999999", {
			...jsonBody({ name: "" }),
			method: "PUT",
		});
		expect(status).toBe(404);
		expect(data).toEqual({ error: "Projet introuvable" });
	});

	test("un corps invalide renvoie 400", async () => {
		const { data: cree } = await creer();
		const { status, data } = await srv.json(`/api/projects/${cree.id}`, {
			...jsonBody({ ...corpsProjet, path: "" }),
			method: "PUT",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Chemin requis" });
	});

	test("conserver son propre chemin n'est pas un doublon", async () => {
		const { data: cree } = await creer();
		const { status } = await srv.json(`/api/projects/${cree.id}`, {
			...jsonBody({ ...corpsProjet, name: "Renommé" }),
			method: "PUT",
		});
		expect(status).toBe(200);
	});

	test("viser la cible d'un autre projet renvoie 409", async () => {
		await creer({ name: "Autre", path: "/srv/autre" });
		const { data: cree } = await creer();
		const { status, data } = await srv.json(`/api/projects/${cree.id}`, {
			...jsonBody({ ...corpsProjet, path: "/srv/autre" }),
			method: "PUT",
		});
		expect(status).toBe(409);
		expect((data as { error: string }).error).toContain("Autre");
	});

	test("un chemin hors racines autorisées renvoie 403", async () => {
		const { data: cree } = await creer();
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		const { status } = await srv.json(`/api/projects/${cree.id}`, {
			...jsonBody({ ...corpsProjet, path: "/srv/interdit" }),
			method: "PUT",
		});
		expect(status).toBe(403);
	});
});

describe("DELETE /api/projects/:id", () => {
	test("supprime le projet", async () => {
		const { data: cree } = await creer();
		const { status, data } = await srv.json(`/api/projects/${cree.id}`, {
			method: "DELETE",
		});
		expect(status).toBe(200);
		expect(data).toEqual({ success: true });

		const { data: liste } = await srv.json<ProjectListItem[]>("/api/projects");
		expect(liste).toEqual([]);
	});

	test("un identifiant inconnu répond quand même succès — écart documenté", async () => {
		// La suppression est idempotente côté SQL et la route ne vérifie pas
		// l'existence : l'interface ne peut pas distinguer « supprimé » de
		// « n'existait pas ».
		const { status, data } = await srv.json("/api/projects/999999", {
			method: "DELETE",
		});
		expect(status).toBe(200);
		expect(data).toEqual({ success: true });
	});
});

describe("POST /api/projects/detect", () => {
	async function detecter(dir: string, auditPath?: string) {
		return srv.json<{ tool: string | null }>(
			"/api/projects/detect",
			jsonBody({ path: dir, audit_path: auditPath }),
		);
	}

	test("un chemin requis manquant renvoie 400", async () => {
		const { status, data } = await srv.json(
			"/api/projects/detect",
			jsonBody({ path: "  " }),
		);
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Chemin requis" });
	});

	test("un dossier sans manifeste renvoie null", async () => {
		expect((await detecter(dossier("nu"))).data.tool).toBeNull();
	});

	test("un dossier inexistant renvoie null sans erreur", async () => {
		const { status, data } = await detecter("/chemin/absent/total");
		expect(status).toBe(200);
		expect(data.tool).toBeNull();
	});

	test("composer.lock donne composer", async () => {
		const d = dossier("composer-lock");
		writeFileSync(join(d, "composer.lock"), "{}");
		expect((await detecter(d)).data.tool).toBe("composer");
	});

	test("bun.lockb donne bun", async () => {
		const d = dossier("bun-lock");
		writeFileSync(join(d, "bun.lockb"), "");
		expect((await detecter(d)).data.tool).toBe("bun");
	});

	test("yarn.lock donne yarn", async () => {
		const d = dossier("yarn-lock");
		writeFileSync(join(d, "yarn.lock"), "");
		expect((await detecter(d)).data.tool).toBe("yarn");
	});

	test("package-lock.json donne npm", async () => {
		const d = dossier("npm-lock");
		writeFileSync(join(d, "package-lock.json"), "{}");
		expect((await detecter(d)).data.tool).toBe("npm");
	});

	test("à défaut de verrou, composer.json donne composer", async () => {
		const d = dossier("composer-json");
		writeFileSync(join(d, "composer.json"), "{}");
		expect((await detecter(d)).data.tool).toBe("composer");
	});

	test("à défaut de verrou, package.json donne npm", async () => {
		const d = dossier("package-json");
		writeFileSync(join(d, "package.json"), "{}");
		expect((await detecter(d)).data.tool).toBe("npm");
	});

	test("le verrou l'emporte sur le manifeste", async () => {
		// Un projet Node avec un `yarn.lock` doit être audité par yarn, même si son
		// `package.json` suggère npm.
		const d = dossier("priorite");
		writeFileSync(join(d, "package.json"), "{}");
		writeFileSync(join(d, "yarn.lock"), "");
		expect((await detecter(d)).data.tool).toBe("yarn");
	});

	test("composer.lock l'emporte sur bun.lockb", async () => {
		const d = dossier("priorite2");
		writeFileSync(join(d, "bun.lockb"), "");
		writeFileSync(join(d, "composer.lock"), "{}");
		expect((await detecter(d)).data.tool).toBe("composer");
	});

	test("la détection porte sur la cible d'audit, pas sur la racine", async () => {
		const racine = dossier("mono");
		writeFileSync(join(racine, "package.json"), "{}");
		const sous = join(racine, "packages", "api");
		mkdirSync(sous, { recursive: true });
		writeFileSync(join(sous, "composer.lock"), "{}");

		expect((await detecter(racine, "packages/api")).data.tool).toBe("composer");
	});

	test("un chemin hors racines autorisées renvoie 403", async () => {
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		const { status } = await detecter("/srv/interdit");
		expect(status).toBe(403);
	});
});

describe("actions git et audit sur un projet", () => {
	test("git-fetch sur un projet inconnu renvoie 404", async () => {
		const { status } = await srv.json("/api/projects/999999/git-fetch", {
			method: "POST",
		});
		expect(status).toBe(404);
	});

	test("git-pull sur un projet inconnu renvoie 404", async () => {
		const { status } = await srv.json("/api/projects/999999/git-pull", {
			method: "POST",
		});
		expect(status).toBe(404);
	});

	test("git-fetch sur un dépôt sans amont renvoie ok avec un journal", async () => {
		const { data: cree } = await creer({ path: depot("fetch") });
		const { status, data } = await srv.json<{ ok: boolean; log: string }>(
			`/api/projects/${cree.id}/git-fetch`,
			{ method: "POST" },
		);
		expect(status).toBe(200);
		expect(data.ok).toBe(true);
		expect(data.log).toBe("Déjà à jour.");
	});

	test("git-pull sur un dépôt sans amont échoue proprement", async () => {
		const { data: cree } = await creer({ path: depot("pull") });
		const { status, data } = await srv.json<{ ok: boolean; log: string }>(
			`/api/projects/${cree.id}/git-pull`,
			{ method: "POST" },
		);
		expect(status).toBe(200);
		expect(data.ok).toBe(false);
		expect(data.log.length).toBeGreaterThan(0);
	});

	test("audit sur un projet inconnu renvoie 404", async () => {
		const { status, data } = await srv.json("/api/projects/999999/audit", {
			method: "POST",
		});
		expect(status).toBe(404);
		expect(data).toEqual({ success: false, error: "Not found" });
	});

	test("audit d'une cible inexistante renvoie un run en erreur, pas un 500", async () => {
		// L'échec d'un outil d'audit est une donnée métier, pas une panne serveur :
		// l'interface doit pouvoir l'afficher dans l'historique.
		const { data: cree } = await creer({
			path: depot("audit"),
			audit_path: "cible-absente",
		});
		const { status, data } = await srv.json<{
			success: boolean;
			deduped: boolean;
			run: { status: string; error: string };
		}>(`/api/projects/${cree.id}/audit`, { method: "POST" });

		expect(status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.deduped).toBe(false);
		expect(data.run.status).toBe("error");
		expect(data.run.error).toContain("cwd:");
	});

	test("force=true réaudite au lieu de dédupliquer", async () => {
		const { data: cree } = await creer({
			path: depot("audit-force"),
			audit_path: "cible-absente",
		});
		await srv.json(`/api/projects/${cree.id}/audit`, { method: "POST" });
		const { data } = await srv.json<{ deduped: boolean }>(
			`/api/projects/${cree.id}/audit?force=true`,
			{ method: "POST" },
		);
		expect(data.deduped).toBe(false);
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
	// N37 — 404 sur un identifiant inexistant, sinon l'interface ne distingue pas
	// « supprimé » de « n'existait pas ».
	test.failing("supprimer un identifiant inconnu renvoie 404 (N37)", async () => {
		const { status } = await srv.json("/api/projects/999999", {
			method: "DELETE",
		});
		expect(status).toBe(404);
	});

	// N3 — la garde de chemin doit couvrir les opérations git, qui exécutent les
	// hooks du dépôt visité. C'est le chemin d'exécution de code que C1 devait
	// fermer.
	test.failing("git-fetch respecte AEGIS_ALLOWED_ROOTS (N3)", async () => {
		const { data: cree } = await creer({ path: "/srv/interdit" });
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		const { status } = await srv.json(`/api/projects/${cree.id}/git-fetch`, {
			method: "POST",
		});
		expect(status).toBe(403);
	});

	// N3 — `AEGIS_ALLOWED_ROOTS` non défini doit être un défaut **fermé**, pas
	// ouvert : une instance déployée sans la variable ne doit pas accepter
	// n'importe quel chemin de l'hôte.
	test.failing("sans AEGIS_ALLOWED_ROOTS, aucun chemin n'est accepté (N3)", async () => {
		delete process.env.AEGIS_ALLOWED_ROOTS;
		const { status } = await creer({ path: "/n/importe/ou" });
		expect(status).toBe(403);
	});

	// N11 — CONTEXT.md §2 spécifie `?force=1`. Un forçage silencieusement ignoré
	// est plus dangereux qu'un forçage absent : l'appelant croit avoir réaudité.
	//
	// Le montage doit isoler le forçage : un run précédent **réussi** portant le
	// SHA courant, sinon la déduplication n'aurait pas lieu de toute façon (un run
	// en erreur n'est jamais dédupliqué) et le test passerait pour la mauvaise
	// raison — ce qui s'est produit à la première écriture.
	test.failing("?force=1 force le réaudit (N11)", async () => {
		const repo = depot("force-un");
		const { data: cree } = await creer({
			path: repo,
			audit_path: "cible-absente",
		});
		addRun({
			project_id: cree.id,
			status: "ok",
			total: 0,
			counts: {
				critical: 0,
				high: 0,
				moderate: 0,
				low: 0,
				info: 0,
				unknown: 0,
			},
			vulnerabilities: [],
			command: "npm audit --json",
			commit_sha: spawnSync(["git", "rev-parse", "HEAD"], {
				cwd: repo,
				env: process.env,
			})
				.stdout.toString()
				.trim(),
			error: null,
			duration_ms: 5,
		});

		// Sans forçage : dédupliqué. C'est la référence du test.
		const sansForcage = await srv.json<{ deduped: boolean }>(
			`/api/projects/${cree.id}/audit`,
			{ method: "POST" },
		);
		expect(sansForcage.data.deduped).toBe(true);

		const { data } = await srv.json<{ deduped: boolean }>(
			`/api/projects/${cree.id}/audit?force=1`,
			{ method: "POST" },
		);
		expect(data.deduped).toBe(false);
	});
});
