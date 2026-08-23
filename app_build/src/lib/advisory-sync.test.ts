import { afterEach, describe, expect, test } from "bun:test";
import { getGithubConfig } from "@/db/advisories";
import { createProject } from "@/db/projects";
import { addRun, type CreateRunInput } from "@/db/runs";
import type { Vulnerability } from "@/lib/parsers/types";
import { useTempDb } from "@/test/db";
import {
	collectAdvisoryKeys,
	getDernierePasse,
	resetSyncHistory,
	SyncEnCoursError,
	syncAllAdvisories,
	syncEnCours,
} from "./advisory-sync";
import { getAllCachedAdvisories, putCachedAdvisory } from "./github";

/**
 * L'API GitHub est simulée : un test ne doit dépendre ni du réseau ni d'un
 * quota. Le cache d'avis, lui, est réel — c'est lui qui décide quelles clés
 * partent sur le réseau, donc c'est l'objet même du test.
 */

const appels: string[] = [];
const natif = globalThis.fetch;

/** Répond selon l'URL demandée. `null` en valeur = 404. */
function stubFetch(
	reponses: Record<string, unknown | null>,
	options: { rateLimitApres?: number; delaiMs?: number } = {},
) {
	appels.length = 0;
	globalThis.fetch = (async (entree: string | URL | Request) => {
		const url = String(entree instanceof Request ? entree.url : entree);
		appels.push(url);
		if (options.delaiMs) {
			await new Promise((r) => setTimeout(r, options.delaiMs));
		}

		if (
			options.rateLimitApres !== undefined &&
			appels.length > options.rateLimitApres
		) {
			return Promise.resolve(
				new Response("{}", {
					status: 429,
					headers: { "content-type": "application/json" },
				}),
			);
		}

		const cle = Object.keys(reponses).find((k) => url.includes(k));
		const corps = cle ? reponses[cle] : undefined;
		if (cle === undefined || corps === null) {
			return Promise.resolve(
				new Response("{}", {
					status: 404,
					headers: { "content-type": "application/json" },
				}),
			);
		}
		return Promise.resolve(
			new Response(JSON.stringify(corps), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
	}) as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = natif;
	appels.length = 0;
});

function avis(id: string, severity = "critical") {
	return {
		ghsa_id: id,
		severity,
		html_url: `https://github.com/advisories/${id}`,
		published_at: "2024-01-15T10:00:00Z",
		cvss: { vector_string: "CVSS:3.1/AV:N/AC:L" },
		vulnerabilities: [
			{
				package: { ecosystem: "npm", name: "lodash" },
				vulnerable_version_range: "< 4.17.21",
				first_patched_version: "4.17.21",
			},
		],
	};
}

function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
	return {
		package: "lodash",
		severity: "high",
		title: "Prototype pollution",
		cve: "CVE-2024-0001",
		link: null,
		versionRange: "<4.17.21",
		...over,
	};
}

function projet(nom: string) {
	return createProject({
		name: nom,
		path: `/srv/${nom}`,
		type: "node",
		tool: "npm",
	});
}

function run(
	projectId: number,
	vulns: Vulnerability[],
	over: Partial<CreateRunInput> = {},
) {
	return addRun({
		project_id: projectId,
		status: vulns.length ? "vulnerable" : "ok",
		total: vulns.length,
		counts: {
			critical: 0,
			high: vulns.length,
			moderate: 0,
			low: 0,
			info: 0,
			unknown: 0,
		},
		vulnerabilities: vulns,
		command: "npm audit --json",
		commit_sha: null,
		error: null,
		duration_ms: 10,
		...over,
	});
}

describe("collectAdvisoryKeys", () => {
	useTempDb("advisory-sync-keys");

	test("sans projet, aucune clé", () => {
		expect(collectAdvisoryKeys()).toEqual([]);
	});

	test("un projet sans run ne produit rien", () => {
		projet("vide");
		expect(collectAdvisoryKeys()).toEqual([]);
	});

	test("elle reconnaît les CVE et les GHSA", () => {
		const p = projet("app");
		run(p.id, [
			vuln({ cve: "CVE-2024-0001" }),
			vuln({ package: "axios", cve: null, link: "GHSA-aaaa-bbbb-cccc" }),
		]);

		expect(collectAdvisoryKeys()).toEqual([
			{ kind: "cve", id: "CVE-2024-0001" },
			{ kind: "ghsa", id: "GHSA-AAAA-BBBB-CCCC" },
		]);
	});

	test("une vulnérabilité sans CVE ni lien GHSA est ignorée", () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: null, link: "https://example.com/bulletin" })]);

		// Rien à interroger : un titre seul n'est pas une clé d'avis.
		expect(collectAdvisoryKeys()).toEqual([]);
	});

	test("la même CVE dans deux projets ne compte qu'une fois", () => {
		const a = projet("a");
		const b = projet("b");
		run(a.id, [vuln({ cve: "CVE-2024-0001" })]);
		run(b.id, [vuln({ package: "autre", cve: "CVE-2024-0001" })]);

		expect(collectAdvisoryKeys()).toHaveLength(1);
	});

	test("seul le dernier run d'un projet est lu", () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: "CVE-2024-0001" })]);
		run(p.id, [vuln({ cve: "CVE-2024-0002" })]);

		// L'écran de triage n'affiche que le dernier run : la passe doit couvrir
		// exactement ce qui est visible, sinon elle brûle du quota pour des CVE
		// disparues.
		expect(collectAdvisoryKeys()).toEqual([
			{ kind: "cve", id: "CVE-2024-0002" },
		]);
	});
});

describe("syncAllAdvisories", () => {
	useTempDb("advisory-sync");

	test("sur un parc vide, aucun appel réseau", async () => {
		stubFetch({});
		const r = await syncAllAdvisories();

		expect(r).toEqual({
			total: 0,
			alreadyCached: 0,
			fetched: 0,
			notFound: 0,
			rateLimited: false,
			remaining: 0,
		});
		expect(appels).toHaveLength(0);
	});

	test("elle récupère et met en cache un avis manquant", async () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: null, link: "GHSA-aaaa-bbbb-cccc" })]);
		stubFetch({ "GHSA-AAAA-BBBB-CCCC": avis("GHSA-aaaa-bbbb-cccc") });

		const r = await syncAllAdvisories();

		expect(r.total).toBe(1);
		expect(r.fetched).toBe(1);
		expect(r.notFound).toBe(0);

		const cache = getAllCachedAdvisories();
		expect(cache.get("GHSA-AAAA-BBBB-CCCC")?.severity).toBe("critical");
	});

	test("une clé déjà en cache ne part pas sur le réseau", async () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: null, link: "GHSA-aaaa-bbbb-cccc" })]);
		putCachedAdvisory("GHSA-AAAA-BBBB-CCCC", "high", {}, null, null, null);
		stubFetch({ "GHSA-AAAA-BBBB-CCCC": avis("GHSA-aaaa-bbbb-cccc") });

		const r = await syncAllAdvisories();

		// Le quota GitHub est la ressource rare : ne pas redemander ce qu'on a.
		expect(appels).toHaveLength(0);
		expect(r.alreadyCached).toBe(1);
		expect(r.fetched).toBe(0);
	});

	test("`force` redemande même ce qui est en cache", async () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: null, link: "GHSA-aaaa-bbbb-cccc" })]);
		putCachedAdvisory("GHSA-AAAA-BBBB-CCCC", "low", {}, null, null, null);
		stubFetch({ "GHSA-AAAA-BBBB-CCCC": avis("GHSA-aaaa-bbbb-cccc") });

		const r = await syncAllAdvisories({ force: true });

		expect(appels).toHaveLength(1);
		expect(r.alreadyCached).toBe(0);
		expect(r.fetched).toBe(1);
		expect(getAllCachedAdvisories().get("GHSA-AAAA-BBBB-CCCC")?.severity).toBe(
			"critical",
		);
	});

	test("une clé inconnue de GitHub est comptée, pas mise en cache", async () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: null, link: "GHSA-aaaa-bbbb-cccc" })]);
		stubFetch({ "GHSA-AAAA-BBBB-CCCC": null });

		const r = await syncAllAdvisories();

		expect(r.notFound).toBe(1);
		expect(r.fetched).toBe(0);
		expect(getAllCachedAdvisories().size).toBe(0);
	});

	test("elle s'arrête au premier quota atteint et annonce le reste", async () => {
		const p = projet("app");
		run(p.id, [
			vuln({ cve: null, link: "GHSA-aaaa-aaaa-aaaa" }),
			vuln({ package: "b", cve: null, link: "GHSA-bbbb-bbbb-bbbb" }),
			vuln({ package: "c", cve: null, link: "GHSA-cccc-cccc-cccc" }),
		]);
		stubFetch(
			{
				"GHSA-AAAA-AAAA-AAAA": avis("GHSA-aaaa-aaaa-aaaa"),
				"GHSA-BBBB-BBBB-BBBB": avis("GHSA-bbbb-bbbb-bbbb"),
				"GHSA-CCCC-CCCC-CCCC": avis("GHSA-cccc-cccc-cccc"),
			},
			{ rateLimitApres: 1 },
		);

		const r = await syncAllAdvisories();

		// Une fois le quota épuisé, poursuivre ne remplirait rien et noierait la
		// cause sous une pile d'échecs.
		expect(r.rateLimited).toBe(true);
		expect(r.fetched).toBe(1);
		expect(r.remaining).toBe(2);
		expect(appels).toHaveLength(2);
	});

	test("ce qui a été récupéré avant le quota est conservé", async () => {
		const p = projet("app");
		run(p.id, [
			vuln({ cve: null, link: "GHSA-aaaa-aaaa-aaaa" }),
			vuln({ package: "b", cve: null, link: "GHSA-bbbb-bbbb-bbbb" }),
		]);
		stubFetch(
			{
				"GHSA-AAAA-AAAA-AAAA": avis("GHSA-aaaa-aaaa-aaaa"),
				"GHSA-BBBB-BBBB-BBBB": avis("GHSA-bbbb-bbbb-bbbb"),
			},
			{ rateLimitApres: 1 },
		);

		await syncAllAdvisories();

		// Un second clic doit reprendre là où le premier s'est arrêté : le travail
		// déjà payé ne doit pas être perdu.
		expect(getAllCachedAdvisories().has("GHSA-AAAA-AAAA-AAAA")).toBe(true);
		expect(getAllCachedAdvisories().has("GHSA-BBBB-BBBB-BBBB")).toBe(false);
	});

	test("la progression est rapportée pour chaque clé traitée", async () => {
		const p = projet("app");
		run(p.id, [
			vuln({ cve: null, link: "GHSA-aaaa-aaaa-aaaa" }),
			vuln({ package: "b", cve: null, link: "GHSA-bbbb-bbbb-bbbb" }),
		]);
		stubFetch({
			"GHSA-AAAA-AAAA-AAAA": avis("GHSA-aaaa-aaaa-aaaa"),
			"GHSA-BBBB-BBBB-BBBB": avis("GHSA-bbbb-bbbb-bbbb"),
		});

		const vus: Array<[number, number]> = [];
		await syncAllAdvisories({
			onProgress: (done, total) => vus.push([done, total]),
		});

		expect(vus).toEqual([
			[1, 2],
			[2, 2],
		]);
	});

	test("le bilan de la dernière passe est retenu et persisté", async () => {
		// Un exploitant doit pouvoir vérifier, après un redémarrage, que le
		// rafraîchissement automatique tourne réellement. Un état seulement en
		// mémoire ne le permettrait pas.
		const p = projet("app");
		run(p.id, [vuln({ cve: null, link: "GHSA-aaaa-bbbb-cccc" })]);
		stubFetch({ "GHSA-AAAA-BBBB-CCCC": avis("GHSA-aaaa-bbbb-cccc") });

		await syncAllAdvisories();

		expect(getDernierePasse()?.fetched).toBe(1);
		expect(Number.isNaN(Date.parse(getDernierePasse()?.finishedAt ?? ""))).toBe(
			false,
		);
		expect(getGithubConfig("ADVISORY_SYNC_LAST_FETCHED")).toBe("1");
		expect(getGithubConfig("ADVISORY_SYNC_LAST_AT")).not.toBe("");
	});

	test("une seule passe à la fois, quelle que soit la porte d'entrée", async () => {
		// Le verrou vivait dans la route ; le planificateur ne le voyait donc pas, et
		// un clic pendant une passe planifiée aurait doublé les appels réseau sur la
		// ressource la plus rare du connecteur — le quota.
		const p = projet("app");
		run(p.id, [vuln({ cve: null, link: "GHSA-aaaa-bbbb-cccc" })]);
		stubFetch(
			{ "GHSA-AAAA-BBBB-CCCC": avis("GHSA-aaaa-bbbb-cccc") },
			{ delaiMs: 60 },
		);

		const premiere = syncAllAdvisories();
		expect(syncEnCours()).toBe(true);
		await expect(syncAllAdvisories()).rejects.toBeInstanceOf(SyncEnCoursError);

		await premiere;
		expect(syncEnCours()).toBe(false);
	});

	test("le verrou est relâché même si la passe lève", async () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: null, link: "GHSA-aaaa-bbbb-cccc" })]);
		globalThis.fetch = (() => {
			throw new Error("panne franche");
		}) as unknown as typeof fetch;

		await syncAllAdvisories().catch(() => null);
		expect(syncEnCours()).toBe(false);
	});

	test("resetSyncHistory oublie le bilan", async () => {
		const p = projet("app");
		run(p.id, [vuln({ cve: null, link: "GHSA-aaaa-bbbb-cccc" })]);
		stubFetch({ "GHSA-AAAA-BBBB-CCCC": avis("GHSA-aaaa-bbbb-cccc") });
		await syncAllAdvisories();

		resetSyncHistory();
		expect(getDernierePasse()).toBeNull();
	});

	test("le total compte les clés distinctes, pas les occurrences", async () => {
		const a = projet("a");
		const b = projet("b");
		run(a.id, [vuln({ cve: null, link: "GHSA-aaaa-aaaa-aaaa" })]);
		run(b.id, [vuln({ package: "x", cve: null, link: "GHSA-aaaa-aaaa-aaaa" })]);
		stubFetch({ "GHSA-AAAA-AAAA-AAAA": avis("GHSA-aaaa-aaaa-aaaa") });

		const r = await syncAllAdvisories();

		expect(r.total).toBe(1);
		expect(appels).toHaveLength(1);
	});
});
