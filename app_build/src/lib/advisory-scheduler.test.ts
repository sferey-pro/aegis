import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { useTempDb } from "@/test/db";
import {
	intervalleMinutes,
	schedulerActif,
	startAdvisoryScheduler,
	stopAdvisoryScheduler,
} from "./advisory-scheduler";

/**
 * Le planificateur est un état de module, et `bun test` partage un process : un
 * minuteur laissé armé survivrait d'un fichier de test à l'autre. Chaque test le
 * coupe donc explicitement, et aucun ne laisse une passe réseau partir — la
 * première est différée d'une minute, largement au-delà de la durée d'un test.
 */

const natif = globalThis.fetch;

beforeEach(() => {
	globalThis.fetch = (() =>
		Promise.reject(new Error("hors ligne"))) as unknown as typeof fetch;
});

afterEach(() => {
	stopAdvisoryScheduler();
	globalThis.fetch = natif;
	delete process.env.ADVISORY_SYNC_INTERVAL_MIN;
});

describe("intervalleMinutes", () => {
	test("sans réglage, six heures", () => {
		expect(intervalleMinutes()).toBe(360);
	});

	test("une valeur explicite est respectée", () => {
		process.env.ADVISORY_SYNC_INTERVAL_MIN = "30";
		expect(intervalleMinutes()).toBe(30);
	});

	test("zéro désactive", () => {
		process.env.ADVISORY_SYNC_INTERVAL_MIN = "0";
		expect(intervalleMinutes()).toBe(0);
	});

	test("une valeur illisible retombe sur le défaut, pas sur zéro", () => {
		// Un réglage mal orthographié ne doit pas couper la surveillance en silence :
		// c'est le mode de défaillance le plus dangereux pour un outil de sécurité.
		process.env.ADVISORY_SYNC_INTERVAL_MIN = "toutes les six heures";
		expect(intervalleMinutes()).toBe(360);
	});

	test("une valeur fractionnaire est tronquée", () => {
		process.env.ADVISORY_SYNC_INTERVAL_MIN = "90.7";
		expect(intervalleMinutes()).toBe(90);
	});

	test("une valeur négative désactive", () => {
		process.env.ADVISORY_SYNC_INTERVAL_MIN = "-5";
		expect(intervalleMinutes()).toBe(-5);
	});
});

describe("startAdvisoryScheduler", () => {
	useTempDb("scheduler");

	test("il s'arme avec le réglage par défaut", () => {
		startAdvisoryScheduler();
		expect(schedulerActif()).toBe(true);
	});

	test("un intervalle nul ne l'arme pas", () => {
		process.env.ADVISORY_SYNC_INTERVAL_MIN = "0";
		startAdvisoryScheduler();
		expect(schedulerActif()).toBe(false);
	});

	test("un intervalle négatif ne l'arme pas", () => {
		process.env.ADVISORY_SYNC_INTERVAL_MIN = "-1";
		startAdvisoryScheduler();
		expect(schedulerActif()).toBe(false);
	});

	test("un second démarrage ne double pas le minuteur", () => {
		// C'est la parade au rechargement à chaud de `bun --hot` : chaque
		// ré-évaluation du module ajoutait sinon un minuteur aux précédents
		// (défaut N26). `start` commence par `stop`.
		startAdvisoryScheduler();
		startAdvisoryScheduler();
		startAdvisoryScheduler();

		stopAdvisoryScheduler();
		expect(schedulerActif()).toBe(false);
	});

	test("l'arrêt est idempotent", () => {
		stopAdvisoryScheduler();
		expect(() => stopAdvisoryScheduler()).not.toThrow();
		expect(schedulerActif()).toBe(false);
	});

	test("la première passe est différée, pas immédiate", async () => {
		// Lancer au démarrage ferait partir une passe réseau à chaque sauvegarde de
		// fichier en développement. Rien ne doit sortir dans la seconde qui suit.
		let appels = 0;
		globalThis.fetch = (() => {
			appels++;
			return Promise.reject(new Error("hors ligne"));
		}) as unknown as typeof fetch;

		startAdvisoryScheduler();
		await new Promise((r) => setTimeout(r, 60));
		expect(appels).toBe(0);
	});
});
