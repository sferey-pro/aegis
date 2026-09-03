import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { getDb } from "@/db";
import { createProject, type Project } from "@/db/projects";
import { addRun, getRunsForProject, type Run } from "@/db/runs";
import type { Vulnerability } from "@/lib/parsers/types";
import type { ProjectHistoryItem } from "@/routes/projects";
import { startTestServer, type TestServer } from "@/test/server";

let srv: TestServer;

beforeAll(async () => {
	srv = await startTestServer("runs");
});
afterAll(() => srv.stop());

beforeEach(() => {
	getDb().query("DELETE FROM projects").run();
});

function projet(nom = "api"): Project {
	return createProject({
		name: nom,
		path: `/srv/${nom}`,
		type: "node",
		tool: "npm",
	});
}

function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
	return {
		package: "lodash",
		severity: "high",
		title: "Prototype pollution",
		cve: "CVE-2020-8203",
		link: null,
		versionRange: "<4.17.21",
		...over,
	};
}

function run(projectId: number, over: Record<string, unknown> = {}): Run {
	return addRun({
		project_id: projectId,
		status: "vulnerable",
		total: 1,
		counts: {
			critical: 0,
			high: 1,
			moderate: 0,
			low: 0,
			info: 0,
			unknown: 0,
		},
		vulnerabilities: [vuln()],
		command: "npm audit --json",
		commit_sha: null,
		error: null,
		duration_ms: 5,
		...over,
	});
}

/** Force `ran_at`, que SQLite fixe à la seconde près. */
function daterRun(id: number, quand: string) {
	getDb().query("UPDATE runs SET ran_at = ? WHERE id = ?").run(quand, id);
}

describe("DELETE /api/runs/:id", () => {
	test("supprime le run et répond 204", async () => {
		// `deleteRun` existait, était testée, et aucune route ne l'exposait : un run
		// pollué restait l'état courant du projet jusqu'au prochain audit, comptant
		// dans l'agrégation CVE et les statistiques.
		const p = projet();
		const r = run(p.id);

		const { status } = await srv.json(`/api/runs/${r.id}`, {
			method: "DELETE",
		});

		expect(status).toBe(204);
		expect(getRunsForProject(p.id)).toHaveLength(0);
	});

	test("un identifiant inconnu répond 404, pas un succès", async () => {
		// L'interface doit distinguer « supprimé » de « n'existait pas », sinon elle
		// masque une désynchronisation entre la liste affichée et l'état réel (N37).
		const { status, data } = await srv.json<{ error: string }>(
			"/api/runs/999999",
			{ method: "DELETE" },
		);
		expect(status).toBe(404);
		expect(data.error).toBe("Run introuvable");
	});

	test("un identifiant non numérique répond 400", async () => {
		// Sans ce contrôle, `NaN` donnerait un 404 correct mais pour la mauvaise
		// raison — un appelant ne saurait pas que son URL est fautive.
		const { status, data } = await srv.json<{ error: string }>(
			"/api/runs/abc",
			{
				method: "DELETE",
			},
		);
		expect(status).toBe(400);
		expect(data.error).toBe("Identifiant de run invalide");
	});

	test("supprimer le plus récent fait du précédent l'état courant", async () => {
		// Le dernier run est **recalculé** à chaque lecture (§4) : c'est ce qui rend
		// l'opération sûre sans contrainte ni cascade.
		const p = projet();
		const ancien = run(p.id, { total: 1 });
		const recent = run(p.id, { total: 2 });
		daterRun(ancien.id, "2026-01-01 10:00:00");
		daterRun(recent.id, "2026-01-02 10:00:00");

		await srv.json(`/api/runs/${recent.id}`, { method: "DELETE" });

		const restants = getRunsForProject(p.id);
		expect(restants).toHaveLength(1);
		expect(restants[0]?.id).toBe(ancien.id);
	});

	test("supprimer le dernier restant laisse le projet sans état", async () => {
		// Issue normale de l'opération, pas une erreur : déjà gérée en aval, un
		// projet sans run est simplement absent des agrégations.
		const p = projet();
		const r = run(p.id);

		const { status } = await srv.json(`/api/runs/${r.id}`, {
			method: "DELETE",
		});

		expect(status).toBe(204);
		expect(getRunsForProject(p.id)).toEqual([]);
	});

	test("un second appel sur le même identifiant répond 404", async () => {
		const p = projet();
		const r = run(p.id);

		expect(
			(await srv.json(`/api/runs/${r.id}`, { method: "DELETE" })).status,
		).toBe(204);
		expect(
			(await srv.json(`/api/runs/${r.id}`, { method: "DELETE" })).status,
		).toBe(404);
	});

	test("les runs des autres projets ne sont pas touchés", async () => {
		const a = projet("a");
		const b = projet("b");
		const cible = run(a.id);
		run(b.id);

		await srv.json(`/api/runs/${cible.id}`, { method: "DELETE" });

		expect(getRunsForProject(a.id)).toHaveLength(0);
		expect(getRunsForProject(b.id)).toHaveLength(1);
	});
});

describe("GET /api/projects/:id/history", () => {
	test("renvoie les runs du projet, complets", async () => {
		// `counts` et `vulnerabilities` désérialisés : c'est ce qui distingue cette
		// route du listing, qui ne porte que le dernier run.
		const p = projet();
		run(p.id);

		const { status, data } = await srv.json<Run[]>(
			`/api/projects/${p.id}/history`,
		);

		expect(status).toBe(200);
		expect(data).toHaveLength(1);
		expect(data[0]?.counts.high).toBe(1);
		expect(data[0]?.vulnerabilities[0]?.package).toBe("lodash");
	});

	test("l'ordre est ran_at puis id, du plus récent au plus ancien", async () => {
		const p = projet();
		const a = run(p.id);
		const b = run(p.id);
		const c = run(p.id);
		daterRun(a.id, "2026-01-01 10:00:00");
		daterRun(b.id, "2026-01-03 10:00:00");
		daterRun(c.id, "2026-01-02 10:00:00");

		const { data } = await srv.json<Run[]>(`/api/projects/${p.id}/history`);
		expect(data.map((r) => r.id)).toEqual([b.id, c.id, a.id]);
	});

	test("à date égale, l'identifiant le plus grand passe devant", async () => {
		// Deux audits dans la même seconde : c'est le `id DESC` de §4 qui tranche.
		const p = projet();
		const premier = run(p.id);
		const second = run(p.id);
		daterRun(premier.id, "2026-01-01 10:00:00");
		daterRun(second.id, "2026-01-01 10:00:00");

		const { data } = await srv.json<Run[]>(`/api/projects/${p.id}/history`);
		expect(data[0]?.id).toBe(second.id);
	});

	test("les runs en erreur sont inclus", async () => {
		// C'est le signal que la route apporte : un audit unitaire montre son
		// message d'erreur, mais rien ne dit que c'est le cinquième d'affilée.
		const p = projet();
		run(p.id, { status: "error", error: "ENOENT", total: 0 });

		const { data } = await srv.json<Run[]>(`/api/projects/${p.id}/history`);
		expect(data).toHaveLength(1);
		expect(data[0]?.status).toBe("error");
		expect(data[0]?.error).toBe("ENOENT");
	});

	test("chaque run porte ses nouvelles CVE, comparées au run non-erreur précédent (§2)", async () => {
		const p = projet();
		const premier = run(p.id, {
			vulnerabilities: [vuln({ cve: "CVE-2024-1" })],
		});
		const erreur = run(p.id, {
			status: "error",
			error: "ENOENT",
			total: 0,
			vulnerabilities: [],
		});
		const second = run(p.id, {
			vulnerabilities: [
				vuln({ cve: "CVE-2024-1" }),
				vuln({ cve: "CVE-2024-2", package: "axios" }),
			],
		});
		daterRun(premier.id, "2026-01-01 10:00:00");
		daterRun(erreur.id, "2026-01-02 10:00:00");
		daterRun(second.id, "2026-01-03 10:00:00");

		const { data } = await srv.json<ProjectHistoryItem[]>(
			`/api/projects/${p.id}/history`,
		);
		const parId = new Map(data.map((r) => [r.id, r]));
		// Premier run, rien avant lui : tout est nouveau (§2).
		expect(parId.get(premier.id)?.newCves.map((c) => c.ref)).toEqual([
			"CVE-2024-1",
		]);
		// Une erreur n'a rien mesuré, et ne sert pas de point de comparaison.
		expect(parId.get(erreur.id)?.newCves).toEqual([]);
		expect(parId.get(second.id)?.newCves).toEqual([
			{ ref: "CVE-2024-2", package: "axios", severity: "high" },
		]);
	});

	test("le plus ancien des trente se compare au run qui le précède en base", async () => {
		// Tronquer la liste ne doit pas faire passer un vieux stock pour une vague
		// de nouveautés : l'amorçage lit le run d'avant, hors fenêtre.
		const p = projet();
		const horsFenetre = run(p.id, {
			vulnerabilities: [vuln({ cve: "CVE-2024-1" })],
		});
		daterRun(horsFenetre.id, "2025-01-01 10:00:00");
		for (let i = 0; i < 30; i++) {
			const r = run(p.id, { vulnerabilities: [vuln({ cve: "CVE-2024-1" })] });
			daterRun(r.id, `2026-01-${String(i + 1).padStart(2, "0")} 10:00:00`);
		}

		const { data } = await srv.json<ProjectHistoryItem[]>(
			`/api/projects/${p.id}/history`,
		);
		expect(data).toHaveLength(30);
		expect(data.every((r) => r.newCves.length === 0)).toBe(true);
	});

	test("la limite est de trente runs", async () => {
		const p = projet();
		for (let i = 0; i < 35; i++) run(p.id);

		const { data } = await srv.json<Run[]>(`/api/projects/${p.id}/history`);
		expect(data).toHaveLength(30);
	});

	test("un projet sans run renvoie une liste vide", async () => {
		const p = projet();
		const { status, data } = await srv.json<Run[]>(
			`/api/projects/${p.id}/history`,
		);
		expect(status).toBe(200);
		expect(data).toEqual([]);
	});

	test("un projet inconnu répond 404, jamais une liste vide", async () => {
		// « Aucun historique » et « ce projet n'existe pas » ne se lisent pas de la
		// même façon : les confondre est le mode de défaillance que N6 a fermé
		// partout ailleurs.
		const { status, data } = await srv.json<{ error: string }>(
			"/api/projects/999999/history",
		);
		expect(status).toBe(404);
		expect(data.error).toBe("Projet introuvable");
	});

	test("un identifiant non numérique répond 404", async () => {
		const { status } = await srv.json("/api/projects/abc/history");
		expect(status).toBe(404);
	});

	test("les runs d'un autre projet ne remontent pas", async () => {
		const a = projet("a");
		const b = projet("b");
		run(a.id);
		run(b.id);
		run(b.id);

		const { data } = await srv.json<Run[]>(`/api/projects/${a.id}/history`);
		expect(data).toHaveLength(1);
		expect(data[0]?.project_id).toBe(a.id);
	});
});
