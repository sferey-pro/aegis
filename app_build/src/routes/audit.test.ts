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
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getDb } from "@/db";
import { createProject, type Project } from "@/db/projects";
import { getRunsForProject } from "@/db/runs";
import { getAuditStatus } from "@/lib/audit/queue";
import { startTestServer, type TestServer } from "@/test/server";

let srv: TestServer;
const aNettoyer: string[] = [];
const natif = globalThis.fetch;

beforeAll(async () => {
	srv = await startTestServer("audit");
});
afterAll(() => srv.stop());

beforeEach(() => {
	getDb().query("DELETE FROM projects").run();
	// L'enrichissement GitHub ne doit jamais sortir du process.
	globalThis.fetch = (() =>
		Promise.reject(new Error("hors ligne"))) as unknown as typeof fetch;
});

afterEach(async () => {
	globalThis.fetch = natif;
	delete process.env.AEGIS_INGEST_TOKEN;
	await attendreLaFin();
	for (const d of aNettoyer.splice(0))
		rmSync(d, { recursive: true, force: true });
});

/** La file est un mutex de portée processus : un test ne doit rien laisser tourner. */
async function attendreLaFin(limiteMs = 5000) {
	const debut = Date.now();
	while (getAuditStatus().isRunning) {
		if (Date.now() - debut > limiteMs) throw new Error("file toujours occupée");
		await new Promise((r) => setTimeout(r, 10));
	}
}

/** Projet dont la cible d'audit n'existe pas : le spawn échoue vite. */
function projet(nom: string, over: Record<string, unknown> = {}): Project {
	const racine = join(tmpdir(), `aegis-route-audit-${nom}-${randomUUID()}`);
	mkdirSync(racine, { recursive: true });
	aNettoyer.push(racine);
	return createProject({
		name: nom,
		path: racine,
		audit_path: "cible-absente",
		type: "node",
		tool: "npm",
		...over,
	});
}

/** Sortie `npm audit --json` minimale portant une CVE. */
function sortieNpm(pkg = "lodash", cwe = "CWE-1321") {
	return JSON.stringify({
		vulnerabilities: {
			[pkg]: {
				name: pkg,
				severity: "high",
				range: ">=4.0.0",
				via: [{ title: "Prototype pollution", url: "https://x", cwe: [cwe] }],
			},
		},
	});
}

describe("GET /api/audit/status", () => {
	test("au repos, aucun audit n'est en cours", async () => {
		const { status, data } = await srv.json<{
			isRunning: boolean;
			currentProject: number | null;
			progress: number;
			total: number;
		}>("/api/audit/status");
		expect(status).toBe(200);
		expect(data.isRunning).toBe(false);
		expect(data.currentProject).toBeNull();
		expect(data.total).toBe(1);
	});
});

describe("POST /api/audit/run", () => {
	test("démarre le lot et renvoie le nombre de projets", async () => {
		projet("a");
		projet("b");
		const { status, data } = await srv.json<{
			status: string;
			count: number;
		}>("/api/audit/run", { method: "POST" });

		expect(status).toBe(200);
		expect(data).toEqual({ status: "started", count: 2 });
		await attendreLaFin();
	});

	test("les projets ignorés sont exclus du lot", async () => {
		projet("actif");
		const ignore = projet("ignore", { ignored: true });
		const { data } = await srv.json<{ count: number }>("/api/audit/run", {
			method: "POST",
		});
		expect(data.count).toBe(1);

		await attendreLaFin();
		expect(getRunsForProject(ignore.id)).toHaveLength(0);
	});

	test("un parc vide démarre un lot de zéro projet", async () => {
		const { status, data } = await srv.json<{ count: number }>(
			"/api/audit/run",
			{ method: "POST" },
		);
		expect(status).toBe(200);
		expect(data.count).toBe(0);
		await attendreLaFin();
	});

	test("chaque projet du lot reçoit un run", async () => {
		const a = projet("run-a");
		const b = projet("run-b");
		await srv.json("/api/audit/run", { method: "POST" });
		await attendreLaFin();

		expect(getRunsForProject(a.id)).toHaveLength(1);
		expect(getRunsForProject(b.id)).toHaveLength(1);
	});

	test("un second lancement pendant un audit renvoie 429", async () => {
		// Le mutex est global : la route traduit le refus de la file en « trop de
		// requêtes », pas en erreur serveur.
		for (let i = 0; i < 4; i++) projet(`charge-${i}`);
		await srv.json("/api/audit/run", { method: "POST" });

		const { status, data } = await srv.json<{ error: string }>(
			"/api/audit/run",
			{ method: "POST" },
		);
		expect(status).toBe(429);
		expect(data.error).toBe("Un audit est déjà en cours");
		await attendreLaFin();
	});

	test("le statut reflète l'audit en cours puis retombe au repos", async () => {
		for (let i = 0; i < 4; i++) projet(`statut-${i}`);
		await srv.json("/api/audit/run", { method: "POST" });

		const { data: pendant } = await srv.json<{ isRunning: boolean }>(
			"/api/audit/status",
		);
		expect(pendant.isRunning).toBe(true);

		await attendreLaFin();
		const { data: apres } = await srv.json<{ isRunning: boolean }>(
			"/api/audit/status",
		);
		expect(apres.isRunning).toBe(false);
	});
});

describe("POST /api/ingest/:slug", () => {
	test("sans jeton configuré, la route refuse de servir", async () => {
		// Ouvrir l'ingestion sans authentification laisserait n'importe qui
		// réécrire l'état de sécurité d'un projet.
		const p = projet("ingest");
		const { status, data } = await srv.json(`/api/ingest/${p.slug}`, {
			method: "POST",
			body: sortieNpm(),
		});
		expect(status).toBe(500);
		expect(data).toEqual({
			error: "Configuration manquante: AEGIS_INGEST_TOKEN",
		});
	});

	test("un jeton absent de la requête renvoie 401", async () => {
		process.env.AEGIS_INGEST_TOKEN = "secret-de-ci";
		const p = projet("ingest401");
		const { status, data } = await srv.json(`/api/ingest/${p.slug}`, {
			method: "POST",
			body: sortieNpm(),
		});
		expect(status).toBe(401);
		expect(data).toEqual({ error: "Non autorisé" });
	});

	test("un jeton erroné de même longueur renvoie 401", async () => {
		process.env.AEGIS_INGEST_TOKEN = "secret-de-ci";
		const p = projet("ingest-faux");
		const { status } = await srv.json(`/api/ingest/${p.slug}`, {
			method: "POST",
			headers: { "X-Aegis-Token": "secret-de-cj" },
			body: sortieNpm(),
		});
		expect(status).toBe(401);
	});

	test("un jeton de longueur différente renvoie 401 sans lever", async () => {
		// `timingSafeEqual` exige des tampons de même taille : sans le contrôle de
		// longueur préalable, il lèverait et la route répondrait 500.
		process.env.AEGIS_INGEST_TOKEN = "secret-de-ci";
		const p = projet("ingest-court");
		const { status } = await srv.json(`/api/ingest/${p.slug}`, {
			method: "POST",
			headers: { "X-Aegis-Token": "x" },
			body: sortieNpm(),
		});
		expect(status).toBe(401);
	});

	test("un slug inconnu renvoie 404, jeton valide compris", async () => {
		process.env.AEGIS_INGEST_TOKEN = "secret-de-ci";
		const { status, data } = await srv.json("/api/ingest/inconnu", {
			method: "POST",
			headers: { "X-Aegis-Token": "secret-de-ci" },
			body: sortieNpm(),
		});
		expect(status).toBe(404);
		expect(data).toEqual({ error: "Project introuvable" });
	});

	test("l'authentification précède la recherche du projet", async () => {
		// Répondre 404 sur un slug inconnu sans jeton révélerait quels projets
		// existent.
		process.env.AEGIS_INGEST_TOKEN = "secret-de-ci";
		const { status } = await srv.json("/api/ingest/inconnu", {
			method: "POST",
			body: sortieNpm(),
		});
		expect(status).toBe(401);
	});

	test("une charge valide crée un run et compte les nouvelles CVE", async () => {
		process.env.AEGIS_INGEST_TOKEN = "secret-de-ci";
		const p = projet("ingest-ok");
		const { status, data } = await srv.json<{
			success: boolean;
			run: { status: string; total: number; commit_sha: string | null };
			newCvesCount: number;
		}>(`/api/ingest/${p.slug}?sha=deadbeef`, {
			method: "POST",
			headers: { "X-Aegis-Token": "secret-de-ci" },
			body: sortieNpm(),
		});

		expect(status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.run.status).toBe("vulnerable");
		expect(data.run.total).toBe(1);
		expect(data.run.commit_sha).toBe("deadbeef");
		expect(data.newCvesCount).toBe(1);
	});

	test("une charge vide renvoie 400", async () => {
		process.env.AEGIS_INGEST_TOKEN = "secret-de-ci";
		const p = projet("ingest-vide");
		const { status, data } = await srv.json(`/api/ingest/${p.slug}`, {
			method: "POST",
			headers: { "X-Aegis-Token": "secret-de-ci" },
			body: "   ",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Payload vide" });
	});

	test("une sortie illisible renvoie 400 sans enregistrer de run", async () => {
		process.env.AEGIS_INGEST_TOKEN = "secret-de-ci";
		const p = projet("ingest-casse");
		const { status } = await srv.json(`/api/ingest/${p.slug}`, {
			method: "POST",
			headers: { "X-Aegis-Token": "secret-de-ci" },
			body: "pas du json",
		});
		expect(status).toBe(400);
		expect(getRunsForProject(p.id)).toHaveLength(0);
	});

	test("sans paramètre sha, aucun commit n'est mémorisé", async () => {
		process.env.AEGIS_INGEST_TOKEN = "secret-de-ci";
		const p = projet("ingest-sans-sha");
		const { data } = await srv.json<{ run: { commit_sha: string | null } }>(
			`/api/ingest/${p.slug}`,
			{
				method: "POST",
				headers: { "X-Aegis-Token": "secret-de-ci" },
				body: sortieNpm(),
			},
		);
		expect(data.run.commit_sha).toBeNull();
	});

	test("une CVE déjà triée n'est plus comptée comme nouvelle", async () => {
		// C'est ce qui rend la porte CI utilisable : seul le non-traité doit faire
		// échouer la construction.
		process.env.AEGIS_INGEST_TOKEN = "secret-de-ci";
		const p = projet("ingest-triage");
		const entete = {
			method: "POST",
			headers: { "X-Aegis-Token": "secret-de-ci" },
			body: sortieNpm(),
		};

		const premier = await srv.json<{ newCvesCount: number }>(
			`/api/ingest/${p.slug}`,
			entete,
		);
		expect(premier.data.newCvesCount).toBe(1);

		// La clé de triage est celle du groupe, telle que l'écran Triage la voit.
		const { data: groupes } = await srv.json<{ cve: string }[]>("/api/cves");
		const { upsertAnnotation } = await import("@/db/annotations");
		upsertAnnotation(groupes[0]?.cve as string, p.id, {
			status: "not_affected",
		});

		const second = await srv.json<{ newCvesCount: number }>(
			`/api/ingest/${p.slug}`,
			entete,
		);
		expect(second.data.newCvesCount).toBe(0);
	});

	test("l'ingestion n'occupe pas la file d'audit", async () => {
		// Elle ne lance aucun processus : elle doit rester possible pendant un
		// audit local, sinon une CI bloquerait l'interface.
		process.env.AEGIS_INGEST_TOKEN = "secret-de-ci";
		const p = projet("ingest-file");
		await srv.json(`/api/ingest/${p.slug}`, {
			method: "POST",
			headers: { "X-Aegis-Token": "secret-de-ci" },
			body: sortieNpm(),
		});
		expect(getAuditStatus().isRunning).toBe(false);
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
	// N8 — un audit refusé pour cause de concurrence est un conflit, pas une panne
	// serveur. `/api/audit/run` répond déjà 429 ; `/api/projects/:id/audit` avale
	// l'exception dans son try/catch générique et répond 500, ce qui rend le refus
	// indistinguable d'un plantage côté client.
	test.failing("un audit concurrent renvoie 409, pas 500 (N8)", async () => {
		for (let i = 0; i < 4; i++) projet(`conflit-${i}`);
		const p = projet("conflit-cible");
		await srv.json("/api/audit/run", { method: "POST" });

		const { status } = await srv.json(`/api/projects/${p.id}/audit`, {
			method: "POST",
		});
		expect(status).toBe(409);
		await attendreLaFin();
	});
});
