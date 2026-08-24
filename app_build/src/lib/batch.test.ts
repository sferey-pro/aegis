import { describe, expect, test } from "bun:test";

import {
	BATCH_CONCURRENCY,
	type BatchProgress,
	type BatchTarget,
	runBatch,
} from "./batch";

/** Cibles `p1 … pN`, comme la page les fournirait. */
function targets(n: number): BatchTarget[] {
	return Array.from({ length: n }, (_, i) => ({
		id: i + 1,
		name: `p${i + 1}`,
	}));
}

function options<T>(
	over: Partial<Parameters<typeof runBatch<T>>[2]> = {},
): Parameters<typeof runBatch<T>>[2] {
	return {
		signal: new AbortController().signal,
		onProgress: () => {},
		describeError: (e) => (e instanceof Error ? e.message : String(e)),
		...over,
	};
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("lib/batch — parallélisme", () => {
	test("la borne du contrat est 4", () => {
		// CONTEXT.md §2. Les deux lots orchestrés côté client la partagent.
		expect(BATCH_CONCURRENCY).toBe(4);
	});

	test("quatre appels partent ensemble, pas l'un après l'autre", async () => {
		// Mesuré, et non compté : « au moins 4 appels » est vrai d'une boucle
		// séquentielle aussi. C'est le temps écoulé qui distingue les deux.
		let simultanes = 0;
		let maxSimultanes = 0;
		const promesse = runBatch(
			targets(8),
			async () => {
				simultanes++;
				maxSimultanes = Math.max(maxSimultanes, simultanes);
				await attendre(40);
				simultanes--;
				return "ok";
			},
			options(),
		);

		await attendre(20);
		expect(maxSimultanes).toBe(4);
		await promesse;
	});

	test("un projet lent n'immobilise pas un créneau pour les suivants", async () => {
		// File partagée et non découpage par avance : sinon le travailleur qui
		// hérite du projet lent bloque tout son lot.
		const ordre: string[] = [];
		await runBatch(
			targets(6),
			async (cible) => {
				await attendre(cible.name === "p1" ? 80 : 5);
				ordre.push(cible.name);
				return "ok";
			},
			options({ concurrency: 2 }),
		);

		// p1 est parti en premier et termine en dernier : les autres ont défilé.
		expect(ordre[ordre.length - 1]).toBe("p1");
		expect(ordre).toHaveLength(6);
	});

	test("un lot vide ne lance aucun travailleur", async () => {
		let appels = 0;
		const sorties = await runBatch(
			[],
			async () => {
				appels++;
				return "ok";
			},
			options(),
		);
		expect(sorties).toEqual([]);
		expect(appels).toBe(0);
	});
});

describe("lib/batch — compte-rendu", () => {
	test("un succès porte sa valeur, sans erreur", async () => {
		const sorties = await runBatch(targets(1), async () => 42, options());
		expect(sorties[0]).toMatchObject({
			value: 42,
			error: null,
			cancelled: false,
		});
	});

	test("un rejet devient une erreur décrite, pas une exception", async () => {
		// Le lot ne doit jamais s'arrêter sur un projet : l'ancienne boucle Git
		// avait un `try` autour de la boucle entière, donc le premier échec
		// abandonnait tous les suivants.
		const sorties = await runBatch(
			targets(3),
			async (cible) => {
				if (cible.name === "p2") throw new Error("boom");
				return "ok";
			},
			options(),
		);

		expect(sorties).toHaveLength(3);
		expect(sorties.find((s) => s.project.name === "p2")?.error).toBe("boom");
		expect(sorties.filter((s) => s.error === null)).toHaveLength(2);
	});

	test("`failureOf` classe en échec une réponse pourtant reçue", async () => {
		// Un 200 peut porter un échec : run persisté en erreur, `git fetch` sorti
		// non nul. Sans cela, l'écran affiche « à jour » sur un dépôt injoignable.
		const sorties = await runBatch(
			targets(2),
			async (cible) => ({ ok: cible.name === "p1", log: "pas d'amont" }),
			options<{ ok: boolean; log: string }>({
				failureOf: (v) => (v.ok ? null : v.log),
			}),
		);

		expect(sorties.find((s) => s.project.name === "p1")?.error).toBeNull();
		expect(sorties.find((s) => s.project.name === "p2")?.error).toBe(
			"pas d'amont",
		);
		// La valeur reste disponible : un échec renseigné vaut mieux qu'un `null`.
		expect(sorties.find((s) => s.project.name === "p2")?.value).toMatchObject({
			ok: false,
		});
	});
});

describe("lib/batch — annulation", () => {
	test("les projets non partis figurent au compte-rendu comme annulés", async () => {
		// Un projet absent du compte-rendu se lirait comme un projet sain.
		const ctrl = new AbortController();
		const sorties = await runBatch(
			targets(10),
			async (cible) => {
				if (cible.name === "p1") ctrl.abort();
				return "ok";
			},
			options({ signal: ctrl.signal, concurrency: 1 }),
		);

		expect(sorties).toHaveLength(10);
		expect(sorties.filter((s) => s.cancelled)).toHaveLength(9);
		// Annulé n'est pas en erreur : ce n'est pas un échec du projet.
		expect(sorties.filter((s) => s.error !== null)).toHaveLength(0);
	});

	test("une requête avortée est comptée annulée, pas en erreur", async () => {
		const ctrl = new AbortController();
		const sorties = await runBatch(
			targets(1),
			async () => {
				ctrl.abort();
				const err = new Error("aborted");
				err.name = "AbortError";
				throw err;
			},
			options({ signal: ctrl.signal }),
		);

		expect(sorties[0]).toMatchObject({ cancelled: true, error: null });
	});

	test("annuler ne perd pas les projets déjà terminés", async () => {
		const ctrl = new AbortController();
		const sorties = await runBatch(
			targets(4),
			async (cible) => {
				if (cible.name === "p2") ctrl.abort();
				return cible.name;
			},
			options({ signal: ctrl.signal, concurrency: 1 }),
		);

		expect(sorties.filter((s) => s.value !== null).map((s) => s.value)).toEqual(
			["p1", "p2"],
		);
	});
});

describe("lib/batch — progression", () => {
	test("le total est annoncé avant le premier appel", async () => {
		// Sinon la barre affiche « 0 / 0 » le temps du premier aller-retour.
		const vues: BatchProgress[] = [];
		await runBatch(targets(3), async () => "ok", {
			...options<string>(),
			onProgress: (p) => vues.push(p),
		});

		expect(vues[0]).toEqual({ done: 0, total: 3, running: [] });
	});

	test("la progression finit à total/total, plus rien en cours", async () => {
		const vues: BatchProgress[] = [];
		await runBatch(targets(3), async () => "ok", {
			...options<string>(),
			onProgress: (p) => vues.push(p),
		});

		const derniere = vues[vues.length - 1];
		expect(derniere).toEqual({ done: 3, total: 3, running: [] });
	});

	test("les projets en cours sont nommés, et au plus la borne", async () => {
		const vues: BatchProgress[] = [];
		await runBatch(
			targets(6),
			async () => {
				await attendre(10);
				return "ok";
			},
			{ ...options<string>(), onProgress: (p) => vues.push(p) },
		);

		expect(Math.max(...vues.map((v) => v.running.length))).toBe(4);
		expect(vues.some((v) => v.running.includes("p1"))).toBe(true);
	});

	test("`done` ne recule jamais", async () => {
		// La barre ne doit pas revenir en arrière : un compteur décrémenté à tort
		// se lirait comme un lot relancé.
		const done: number[] = [];
		await runBatch(
			targets(8),
			async () => {
				await attendre(5);
				return "ok";
			},
			{ ...options<string>(), onProgress: (p) => done.push(p.done) },
		);

		expect(done).toEqual([...done].sort((a, b) => a - b));
	});
});
