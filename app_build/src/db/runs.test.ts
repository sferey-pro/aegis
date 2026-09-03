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
	getPreviousNonErrorRun,
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
		expect(points.every((p) => p.counts.critical === 0 && p.total === 0)).toBe(
			true,
		);
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
		expect(dernier?.counts.critical).toBe(2);
		expect(dernier?.counts.high).toBe(1);
		expect(dernier?.total).toBe(3);
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
		expect(points[points.length - 1]?.counts.critical).toBe(3);
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
		expect(points[points.length - 1]?.counts.critical).toBe(0);
	});

	test("les six sévérités sont agrégées, et le total les somme (N13)", () => {
		// `info` et `unknown` n'étaient jamais additionnés : ils étaient
		// **définitivement absents** de la série, et il n'y avait pas de `total` —
		// alors que §4 le définit comme la somme des six.
		const p = projet();
		const r = addRun(
			run(p.id, {
				counts: {
					critical: 1,
					high: 2,
					moderate: 3,
					low: 4,
					info: 9,
					unknown: 7,
				},
			}),
		);
		daterRun(r.id, `${new Date().toISOString().slice(0, 10)} 10:00:00`);

		const dernier = getGlobalHistory(7).at(-1);
		expect(dernier?.counts).toEqual({
			critical: 1,
			high: 2,
			moderate: 3,
			low: 4,
			info: 9,
			unknown: 7,
		});
		expect(dernier?.total).toBe(26);
	});

	test("chaque point porte une date ISO et un libellé distincts (N13)", () => {
		// `date` portait un libellé d'affichage « JJ/MM » ; la donnée métier vivait
		// dans un champ additionnel `rawDate`. §4 demande `date: "YYYY-MM-DD"`.
		const points = getGlobalHistory(7);
		const dernier = points.at(-1);
		expect(dernier?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(dernier?.label).toMatch(/^\d{2}\/\d{2}$/);
		expect(dernier?.date).toBe(new Date().toISOString().slice(0, 10));
	});

	test("le bucket est lu dans la chaîne, sans conversion de fuseau (N13)", () => {
		// Les buckets étaient calculés en heure locale alors que `ran_at` est stocké
		// en UTC : en fin de journée dans un fuseau positif, un run était rangé dans
		// le bucket du lendemain. §4 dit `ran_at[0:10]` — la clé se découpe dans la
		// chaîne, ce qui rend le décalage impossible par construction.
		const p = projet();
		const jour = new Date().toISOString().slice(0, 10);
		const r = addRun(
			run(p.id, {
				counts: {
					critical: 4,
					high: 0,
					moderate: 0,
					low: 0,
					info: 0,
					unknown: 0,
				},
			}),
		);
		// 23 h 30 UTC : rangé la veille dans tout fuseau négatif, le lendemain dans
		// tout fuseau positif, si l'on convertit.
		daterRun(r.id, `${jour} 23:30:00`);

		const point = getGlobalHistory(7).find((x) => x.date === jour);
		expect(point?.counts.critical).toBe(4);
	});

	test("un projet audité avant la fenêtre reste compté (N13)", () => {
		// La requête est désormais bornée à la fenêtre : sans amorçage par le
		// dernier run non-erreur antérieur, un projet audité une seule fois il y a
		// six mois disparaîtrait de la série — ce qui se lirait comme une
		// remédiation.
		const p = projet();
		const r = addRun(
			run(p.id, {
				counts: {
					critical: 6,
					high: 0,
					moderate: 0,
					low: 0,
					info: 0,
					unknown: 0,
				},
			}),
		);
		daterRun(r.id, "2020-01-01 10:00:00");

		expect(getGlobalHistory(7).at(-1)?.counts.critical).toBe(6);
	});

	test("l'amorçage ignore un run en erreur antérieur à la fenêtre", () => {
		const p = projet();
		const bon = addRun(
			run(p.id, {
				counts: {
					critical: 6,
					high: 0,
					moderate: 0,
					low: 0,
					info: 0,
					unknown: 0,
				},
			}),
		);
		const casse = addRun(
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
		daterRun(bon.id, "2020-01-01 10:00:00");
		daterRun(casse.id, "2020-02-01 10:00:00");

		expect(getGlobalHistory(7).at(-1)?.counts.critical).toBe(6);
	});

	test("la vue horaire découpe sur vingt-quatre heures", () => {
		const points = getGlobalHistory(1);
		expect(points).toHaveLength(24);
		expect(points.at(-1)?.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}$/);
		expect(points.at(-1)?.label).toMatch(/^\d{2}h$/);
	});
});

describe("db/runs — série d'un seul projet (CONTEXT.md §4)", () => {
	useTempDb("historique-projet");
	const aujourdhui = () => `${new Date().toISOString().slice(0, 10)} 10:00:00`;

	test("la série filtrée ne compte que le projet demandé", () => {
		const a = projet("a");
		const b = projet("b");
		const ra = addRun(
			run(a.id, {
				counts: {
					critical: 2,
					high: 0,
					moderate: 0,
					low: 0,
					info: 0,
					unknown: 0,
				},
			}),
		);
		const rb = addRun(
			run(b.id, {
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
		daterRun(ra.id, aujourdhui());
		daterRun(rb.id, aujourdhui());

		expect(getGlobalHistory(7).at(-1)?.counts.critical).toBe(7);
		expect(getGlobalHistory(7, a.id).at(-1)?.counts.critical).toBe(2);
		expect(getGlobalHistory(7, b.id).at(-1)?.counts.critical).toBe(5);
	});

	test("un projet ignoré garde son histoire quand on la demande nommément", () => {
		// Absent de la série globale (§4), mais la page de détail le montre parce
		// qu'on l'a demandé : mettre un projet de côté n'efface pas ce qu'on a mesuré.
		const p = createProject({
			name: "mis de côté",
			path: "/srv/ignore",
			type: "node",
			tool: "npm",
			ignored: true,
		});
		const r = addRun(
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
		daterRun(r.id, aujourdhui());

		expect(getGlobalHistory(7).at(-1)?.counts.critical).toBe(0);
		expect(getGlobalHistory(7, p.id).at(-1)?.counts.critical).toBe(3);
	});

	test("un projet inconnu donne une série à zéro, pas une erreur", () => {
		const points = getGlobalHistory(7, 999_999);
		expect(points.length).toBeGreaterThan(0);
		expect(points.every((x) => x.total === 0)).toBe(true);
	});
});

describe("db/runs — run précédent non-erreur", () => {
	useTempDb("precedent");

	test("saute les erreurs et respecte l'ordre ran_at puis id", () => {
		const p = projet();
		const ancien = addRun(run(p.id, { commit_sha: "ancien" }));
		const erreur = addRun(run(p.id, { status: "error", error: "ENOENT" }));
		const courant = addRun(run(p.id, { commit_sha: "courant" }));
		daterRun(ancien.id, "2026-01-01 10:00:00");
		daterRun(erreur.id, "2026-01-02 10:00:00");
		daterRun(courant.id, "2026-01-03 10:00:00");

		// `addRun` rend l'objet d'avant `daterRun` : on passe la date posée.
		const a = { id: courant.id, ran_at: "2026-01-03 10:00:00" };
		expect(getPreviousNonErrorRun(p.id, a)?.id).toBe(ancien.id);
		expect(
			getPreviousNonErrorRun(p.id, {
				id: ancien.id,
				ran_at: "2026-01-01 10:00:00",
			}),
		).toBeNull();
	});

	test("à date égale, c'est l'identifiant qui départage", () => {
		const p = projet();
		const premier = addRun(run(p.id));
		const second = addRun(run(p.id));
		daterRun(premier.id, "2026-01-01 10:00:00");
		daterRun(second.id, "2026-01-01 10:00:00");

		const meme = "2026-01-01 10:00:00";
		expect(
			getPreviousNonErrorRun(p.id, { id: second.id, ran_at: meme })?.id,
		).toBe(premier.id);
		expect(
			getPreviousNonErrorRun(p.id, { id: premier.id, ran_at: meme }),
		).toBeNull();
	});

	test("ne regarde jamais un autre projet", () => {
		const a = projet("a");
		const b = projet("b");
		const rb = addRun(run(b.id));
		const ra = addRun(run(a.id));
		daterRun(rb.id, "2026-01-01 10:00:00");
		daterRun(ra.id, "2026-01-02 10:00:00");

		expect(
			getPreviousNonErrorRun(a.id, {
				id: ra.id,
				ran_at: "2026-01-02 10:00:00",
			}),
		).toBeNull();
	});
});

describe("une seule définition du dernier run (N29)", () => {
	useTempDb("runs-n29");

	test("les deux lectures coïncident quand les id contredisent les dates", () => {
		// `getLatestRun` respectait §4 (`ran_at DESC, id DESC`) ; la variante batch
		// employée par `GET /api/projects` retenait `MAX(id)`. Les deux coïncident
		// tant que les id sont monotones avec le temps, mais divergent après une
		// restauration de snapshot ou un import de runs hors ordre chronologique —
		// et silencieusement : la carte projet affichait un run, l'agrégation CVE et
		// la déduplication d'audit en utilisaient un autre.
		const p = projet();
		const ancienEnApparence = addRun(run(p.id, { total: 1 }));
		const recentEnApparence = addRun(run(p.id, { total: 2 }));
		// Ordre chronologique inversé par rapport aux id — le cas d'un import.
		daterRun(ancienEnApparence.id, "2027-01-01 10:00:00");
		daterRun(recentEnApparence.id, "2020-01-01 10:00:00");

		const parDate = getLatestRun(p.id);
		const parLot = getLatestRunsByProjectIds([p.id])[p.id];
		expect(parLot?.id).toBe(parDate?.id);
		expect(parLot?.total).toBe(1);
	});

	test("à date égale, l'identifiant le plus grand gagne — des deux côtés", () => {
		// Deux audits dans la même seconde : c'est le `id DESC` de §4 qui tranche.
		const p = projet();
		const premier = addRun(run(p.id, { total: 1 }));
		const second = addRun(run(p.id, { total: 2 }));
		daterRun(premier.id, "2026-01-01 10:00:00");
		daterRun(second.id, "2026-01-01 10:00:00");

		expect(getLatestRun(p.id)?.id).toBe(second.id);
		expect(getLatestRunsByProjectIds([p.id])[p.id]?.id).toBe(second.id);
	});

	test("chaque projet reçoit son propre dernier run", () => {
		const a = projet("a");
		const b = projet("b");
		addRun(run(a.id, { total: 1 }));
		const dernierA = addRun(run(a.id, { total: 2 }));
		const dernierB = addRun(run(b.id, { total: 3 }));

		const lot = getLatestRunsByProjectIds([a.id, b.id]);
		expect(lot[a.id]?.id).toBe(dernierA.id);
		expect(lot[b.id]?.id).toBe(dernierB.id);
	});

	test("un projet sans run est simplement absent", () => {
		const a = projet("a");
		const b = projet("b");
		addRun(run(a.id, { total: 1 }));

		const lot = getLatestRunsByProjectIds([a.id, b.id]);
		expect(lot[b.id]).toBeUndefined();
	});

	test("les identifiants passent en bindings, pas en concaténation", () => {
		// `IN (${ids})` était construit par concaténation. Les valeurs viennent d'un
		// `SELECT id FROM projects`, donc rien n'était exploitable en l'état, mais un
		// appelant passant un `parseInt` non gardé produisait `IN (NaN)`, soit un
		// 500 « no such column: NaN ».
		expect(() => getLatestRunsByProjectIds([Number.NaN])).not.toThrow();
		expect(getLatestRunsByProjectIds([Number.NaN])).toEqual({});
	});

	test("une liste vide ne déclenche aucune requête", () => {
		expect(getLatestRunsByProjectIds([])).toEqual({});
	});
});
