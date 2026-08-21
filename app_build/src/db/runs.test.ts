import { describe, expect, test } from "bun:test";

import type { Vulnerability } from "@/lib/parsers/types";
import { useTempDb } from "@/test/db";
import { getDb } from "./index";
import { createProject } from "./projects";
import {
	addRun,
	type CreateRunInput,
	deleteRun,
	getGlobalHistory,
	getLatestRun,
	getLatestRunsByProjectIds,
	getRunsForProject,
} from "./runs";

function projet(nom = "Mon API") {
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
		cve: "CVE-2024-1",
		link: null,
		versionRange: null,
		...over,
	};
}

function run(
	projectId: number,
	over: Partial<CreateRunInput> = {},
): CreateRunInput {
	return {
		project_id: projectId,
		status: "vulnerable",
		total: 1,
		counts: { critical: 0, high: 1, moderate: 0, low: 0, info: 0, unknown: 0 },
		vulnerabilities: [vuln()],
		command: "npm audit --json",
		commit_sha: "abc123",
		error: null,
		duration_ms: 42,
		...over,
	};
}

/** Force `ran_at` pour maîtriser l'ordre chronologique dans les tests. */
function daterRun(id: number, ranAt: string) {
	getDb().query("UPDATE runs SET ran_at = ? WHERE id = ?").run(ranAt, id);
}

describe("db/runs", () => {
	useTempDb("runs");

	test("addRun persiste et réhydrate les colonnes JSON", () => {
		const p = projet();
		const r = addRun(run(p.id));
		expect(r.counts.high).toBe(1);
		expect(r.vulnerabilities).toHaveLength(1);
		expect(r.vulnerabilities[0]?.package).toBe("lodash");

		// La colonne contient du JSON, pas un objet.
		const brut = getDb()
			.query("SELECT counts FROM runs WHERE id = ?")
			.get(r.id) as { counts: string };
		expect(typeof brut.counts).toBe("string");
	});

	test("un run en erreur est persisté avec son message multi-ligne", () => {
		const p = projet();
		const erreur = "npm: aucune sortie (exit 1)\ncwd: /srv/api\nexit: 1";
		const r = addRun(
			run(p.id, {
				status: "error",
				total: 0,
				vulnerabilities: [],
				error: erreur,
			}),
		);
		expect(r.status).toBe("error");
		expect(r.error).toBe(erreur);
		expect(r.error).toContain("\n");
	});

	test("un projet hors git enregistre un commit_sha null", () => {
		const p = projet();
		expect(addRun(run(p.id, { commit_sha: null })).commit_sha).toBeNull();
	});

	test("getLatestRun retient le ran_at le plus récent", () => {
		const p = projet();
		const ancien = addRun(run(p.id, { total: 1 }));
		const recent = addRun(run(p.id, { total: 2 }));
		daterRun(ancien.id, "2026-08-20 10:00:00");
		daterRun(recent.id, "2026-08-21 10:00:00");
		expect(getLatestRun(p.id)?.id).toBe(recent.id);
	});

	test("à ran_at égal, l'id le plus grand départage", () => {
		const p = projet();
		const a = addRun(run(p.id));
		const b = addRun(run(p.id));
		daterRun(a.id, "2026-08-21 10:00:00");
		daterRun(b.id, "2026-08-21 10:00:00");
		expect(getLatestRun(p.id)?.id).toBe(b.id);
	});

	test("le dernier run est recalculé : supprimer le plus récent fait remonter le précédent", () => {
		const p = projet();
		const ancien = addRun(run(p.id));
		const recent = addRun(run(p.id));
		daterRun(ancien.id, "2026-08-20 10:00:00");
		daterRun(recent.id, "2026-08-21 10:00:00");

		deleteRun(recent.id);
		expect(getLatestRun(p.id)?.id).toBe(ancien.id);

		deleteRun(ancien.id);
		expect(getLatestRun(p.id)).toBeNull();
	});

	test("un run en erreur peut être le dernier run", () => {
		// C'est ce qui exclut le projet de l'agrégation CVE, et ce qui faisait
		// repartir le chronomètre C12 à zéro avant la table d'occurrences.
		const p = projet();
		addRun(run(p.id));
		const err = addRun(run(p.id, { status: "error" }));
		daterRun(err.id, "2027-01-01 10:00:00");
		expect(getLatestRun(p.id)?.status).toBe("error");
	});

	test("getRunsForProject trie du plus récent au plus ancien", () => {
		const p = projet();
		const a = addRun(run(p.id));
		const b = addRun(run(p.id));
		daterRun(a.id, "2026-08-20 10:00:00");
		daterRun(b.id, "2026-08-21 10:00:00");
		expect(getRunsForProject(p.id).map((r) => r.id)).toEqual([b.id, a.id]);
	});

	test("getRunsForProject est limité à 30 par défaut", () => {
		const p = projet();
		for (let i = 0; i < 35; i++) addRun(run(p.id));
		expect(getRunsForProject(p.id)).toHaveLength(30);
		expect(getRunsForProject(p.id, 5)).toHaveLength(5);
	});

	test("getRunsForProject inclut les runs en erreur", () => {
		const p = projet();
		addRun(run(p.id, { status: "error" }));
		expect(getRunsForProject(p.id)).toHaveLength(1);
	});

	test("getLatestRunsByProjectIds ne renvoie qu'un run par projet", () => {
		const a = projet("a");
		const b = projet("b");
		addRun(run(a.id));
		const dernierA = addRun(run(a.id));
		addRun(run(b.id));

		const map = getLatestRunsByProjectIds([a.id, b.id]);
		expect(Object.keys(map)).toHaveLength(2);
		expect(map[a.id]?.id).toBe(dernierA.id);
	});

	test("getLatestRunsByProjectIds sur une liste vide ne lève pas", () => {
		expect(getLatestRunsByProjectIds([])).toEqual({});
	});

	test("supprimer un projet supprime ses runs en cascade", () => {
		const p = projet();
		addRun(run(p.id));
		getDb().query("DELETE FROM projects WHERE id = ?").run(p.id);
		expect(getRunsForProject(p.id)).toHaveLength(0);
	});

	test("deleteRun est idempotent sur un id inexistant", () => {
		expect(() => deleteRun(999_999)).not.toThrow();
	});
});

describe("db/runs — historique global (CONTEXT.md §4)", () => {
	useTempDb("historique");

	test("aucun run donne une série vide de points sans données", () => {
		const points = getGlobalHistory(7);
		// La fenêtre est calendaire : les buckets existent, tous à zéro.
		expect(points.every((p) => p.critical === 0 && p.high === 0)).toBe(true);
	});

	test("un run non-erreur alimente son jour", () => {
		const p = projet();
		const r = addRun(
			run(p.id, {
				counts: {
					critical: 2,
					high: 1,
					moderate: 0,
					low: 0,
					info: 0,
					unknown: 0,
				},
			}),
		);
		daterRun(r.id, `${new Date().toISOString().slice(0, 10)} 10:00:00`);

		const points = getGlobalHistory(7);
		const dernier = points[points.length - 1];
		expect(dernier?.critical).toBe(2);
		expect(dernier?.high).toBe(1);
	});

	test("un run en erreur n'écrase pas l'état connu du projet", () => {
		// Une erreur ne doit pas faire disparaître les vulnérabilités précédentes.
		const p = projet();
		const ok = addRun(
			run(p.id, {
				counts: {
					critical: 3,
					high: 0,
					moderate: 0,
					low: 0,
					info: 0,
					unknown: 0,
				},
			}),
		);
		const err = addRun(
			run(p.id, {
				status: "error",
				counts: {
					critical: 0,
					high: 0,
					moderate: 0,
					low: 0,
					info: 0,
					unknown: 0,
				},
			}),
		);
		const jour = new Date().toISOString().slice(0, 10);
		daterRun(ok.id, `${jour} 09:00:00`);
		daterRun(err.id, `${jour} 11:00:00`);

		const points = getGlobalHistory(7);
		expect(points[points.length - 1]?.critical).toBe(3);
	});

	test("les projets ignorés sont exclus de la série", () => {
		const p = projet();
		const r = addRun(
			run(p.id, {
				counts: {
					critical: 5,
					high: 0,
					moderate: 0,
					low: 0,
					info: 0,
					unknown: 0,
				},
			}),
		);
		daterRun(r.id, `${new Date().toISOString().slice(0, 10)} 10:00:00`);
		getDb().query("UPDATE projects SET ignored = 1 WHERE id = ?").run(p.id);

		const points = getGlobalHistory(7);
		expect(points[points.length - 1]?.critical).toBe(0);
	});

	test("info et unknown ne sont pas agrégés — écart documenté", () => {
		// Défaut N13 : le contrat demande les six sévérités et un `total`.
		// L'implémentation n'additionne que critical, high, moderate et low.
		const p = projet();
		const r = addRun(
			run(p.id, {
				counts: {
					critical: 0,
					high: 0,
					moderate: 0,
					low: 0,
					info: 9,
					unknown: 7,
				},
			}),
		);
		daterRun(r.id, `${new Date().toISOString().slice(0, 10)} 10:00:00`);

		const dernier = getGlobalHistory(7).at(-1) as Record<string, unknown>;
		expect(dernier.info).toBeUndefined();
		expect(dernier.unknown).toBeUndefined();
		expect(dernier.total).toBeUndefined();
	});

	test("un days non numérique produit une série vide — écart documenté", () => {
		// Défaut N13 : `parseInt` non gardé côté route donne NaN, et la boucle de
		// construction des buckets ne s'exécute pas. Le graphique reste vide sans
		// erreur.
		expect(getGlobalHistory(Number.NaN)).toEqual([]);
	});
});
