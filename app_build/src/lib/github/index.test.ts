import { afterEach, describe, expect, test } from "bun:test";

import { getGithubConfig } from "@/db/advisories";
import { useTempDb } from "@/test/db";
import {
	getCachedAdvisory,
	keyFrom,
	putCachedAdvisory,
	resolveFixedVersion,
	syncAdvisory,
} from "./index";

/**
 * L'API GitHub est simulée, jamais appelée : un test ne doit dépendre ni du
 * réseau ni d'un quota. Le cache d'avis, en revanche, est réel — c'est lui qui
 * décide s'il faut appeler l'API, donc c'est lui qu'on veut vérifier.
 */

interface Reponse {
	status?: number;
	body?: unknown;
	headers?: Record<string, string>;
	throws?: boolean;
}

const appels: string[] = [];
const natif = globalThis.fetch;

/** Installe une réponse unique pour tout appel sortant. */
function stubFetch(reponse: Reponse) {
	appels.length = 0;
	globalThis.fetch = ((entree: string | URL | Request) => {
		appels.push(String(entree instanceof Request ? entree.url : entree));
		if (reponse.throws) return Promise.reject(new Error("ENOTFOUND"));
		return Promise.resolve(
			new Response(JSON.stringify(reponse.body ?? {}), {
				status: reponse.status ?? 200,
				headers: { "content-type": "application/json", ...reponse.headers },
			}),
		);
	}) as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = natif;
	appels.length = 0;
});

/** Avis GitHub minimal, tel que l'API le renvoie. */
function avis(over: Record<string, unknown> = {}) {
	return {
		severity: "high",
		html_url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
		published_at: "2024-01-15T10:00:00Z",
		cvss: { vector_string: "CVSS:3.1/AV:N/AC:L" },
		vulnerabilities: [
			{
				package: { ecosystem: "npm", name: "lodash" },
				vulnerable_version_range: "< 4.17.21",
				first_patched_version: "4.17.21",
			},
		],
		...over,
	};
}

describe("lib/github — keyFrom", () => {
	test("extrait un GHSA du lien", () => {
		expect(
			keyFrom(null, "https://github.com/advisories/GHSA-jf85-cpcp-j695"),
		).toEqual({ kind: "ghsa", id: "GHSA-JF85-CPCP-J695" });
	});

	test("le lien prime sur le champ CVE", () => {
		// Le lien pointe l'avis précis ; la CVE peut couvrir plusieurs avis.
		expect(
			keyFrom(
				"CVE-2020-8203",
				"https://github.com/advisories/GHSA-p6mc-m468-83gw",
			),
		).toEqual({ kind: "ghsa", id: "GHSA-P6MC-M468-83GW" });
	});

	test("reconnaît un GHSA placé dans le champ CVE", () => {
		// Certains parseurs remontent le GHSA comme identifiant faute de CVE.
		expect(keyFrom("GHSA-jf85-cpcp-j695")).toEqual({
			kind: "ghsa",
			id: "GHSA-JF85-CPCP-J695",
		});
	});

	test("reconnaît une CVE et la met en majuscules", () => {
		expect(keyFrom("cve-2020-8203")).toEqual({
			kind: "cve",
			id: "CVE-2020-8203",
		});
	});

	test("accepte une CVE à plus de quatre chiffres", () => {
		expect(keyFrom("CVE-2024-123456")?.id).toBe("CVE-2024-123456");
	});

	test("extrait l'identifiant d'un texte qui l'entoure", () => {
		expect(keyFrom("Faille CVE-2020-8203 dans lodash")?.id).toBe(
			"CVE-2020-8203",
		);
	});

	test("renvoie null sans identifiant exploitable", () => {
		expect(keyFrom(null, null)).toBeNull();
		expect(keyFrom("", "")).toBeNull();
		expect(keyFrom("GHSA-trop-court")).toBeNull();
		expect(keyFrom("CVE-20-1")).toBeNull();
		expect(keyFrom(null, "https://exemple.test/avis/42")).toBeNull();
	});
});

describe("lib/github — cache d'avis", () => {
	useTempDb("github-cache");

	test("un identifiant absent du cache renvoie null", () => {
		expect(getCachedAdvisory("GHSA-AAAA-BBBB-CCCC")).toBeNull();
	});

	test("aller-retour complet dans le cache", () => {
		putCachedAdvisory(
			"GHSA-AAAA-BBBB-CCCC",
			"critical",
			{ "npm:lodash": [{ range: "< 4.17.21", patched: "4.17.21" }] },
			"https://github.com/advisories/x",
			"CVSS:3.1/AV:N",
			"2024-01-15T10:00:00Z",
		);

		const c = getCachedAdvisory("GHSA-AAAA-BBBB-CCCC");
		expect(c?.severity).toBe("critical");
		expect(c?.fixes["npm:lodash"]).toEqual([
			{ range: "< 4.17.21", patched: "4.17.21" },
		]);
		expect(c?.html_url).toBe("https://github.com/advisories/x");
		expect(c?.cvss_vector).toBe("CVSS:3.1/AV:N");
		expect(c?.published_at).toBe("2024-01-15T10:00:00Z");
	});

	test("réécrire le même identifiant met à jour au lieu d'insérer", () => {
		putCachedAdvisory("GHSA-AAAA-BBBB-CCCC", "low", {});
		putCachedAdvisory("GHSA-AAAA-BBBB-CCCC", "critical", {});
		expect(getCachedAdvisory("GHSA-AAAA-BBBB-CCCC")?.severity).toBe("critical");
	});

	test("les métadonnées absentes sont stockées en null", () => {
		putCachedAdvisory("GHSA-AAAA-BBBB-CCCC", "high", {});
		const c = getCachedAdvisory("GHSA-AAAA-BBBB-CCCC");
		expect(c?.html_url).toBeNull();
		expect(c?.cvss_vector).toBeNull();
		expect(c?.published_at).toBeNull();
	});

	test("une sévérité de cache inconnue est normalisée en unknown", () => {
		// Une ligne écrite par une version antérieure ne doit pas propager une
		// sévérité arbitraire dans l'agrégation.
		putCachedAdvisory("GHSA-AAAA-BBBB-CCCC", "catastrophique" as "high", {});
		expect(getCachedAdvisory("GHSA-AAAA-BBBB-CCCC")?.severity).toBe("unknown");
	});
});

describe("lib/github — resolveFixedVersion", () => {
	useTempDb("github-resolve");

	const base = { tool: "npm" as const, package: "lodash" };

	test("sans identifiant, rien n'est résoluble et l'appel réseau est évité", async () => {
		stubFetch({ body: avis() });
		const r = await resolveFixedVersion({
			...base,
			cve: null,
			originalFixedIn: "4.17.20",
		});
		expect(r.resolvable).toBe(false);
		expect(r.fixedIn).toBe("4.17.20");
		expect(r.severity).toBe("unknown");
		expect(appels).toHaveLength(0);
	});

	test("un avis en cache évite tout appel réseau", async () => {
		// C'est la raison d'être du cache : un parc de vingt projets partageant les
		// mêmes CVE ne doit pas consommer vingt fois le quota.
		putCachedAdvisory(
			"CVE-2020-8203",
			"high",
			{ "npm:lodash": [{ range: "< 4.17.21", patched: "4.17.21" }] },
			null,
			null,
			null,
		);
		stubFetch({ body: avis() });

		const r = await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });
		expect(r.fixedIn).toBe("4.17.21");
		expect(r.resolvable).toBe(true);
		expect(appels).toHaveLength(0);
	});

	test("un avis absent du cache est récupéré puis mémorisé", async () => {
		stubFetch({ body: avis() });
		const r = await resolveFixedVersion({
			...base,
			cve: "GHSA-jf85-cpcp-j695",
		});

		expect(r.fixedIn).toBe("4.17.21");
		expect(r.severity).toBe("high");
		expect(r.cvss_vector).toBe("CVSS:3.1/AV:N/AC:L");
		expect(r.published_at).toBe("2024-01-15T10:00:00Z");
		expect(appels).toHaveLength(1);
		expect(getCachedAdvisory("GHSA-JF85-CPCP-J695")).not.toBeNull();
	});

	test("une clé GHSA interroge l'avis directement", async () => {
		stubFetch({ body: avis() });
		await resolveFixedVersion({ ...base, cve: "GHSA-jf85-cpcp-j695" });
		expect(appels[0]).toBe(
			"https://api.github.com/advisories/GHSA-JF85-CPCP-J695",
		);
	});

	test("une clé CVE passe par la recherche, qui renvoie une liste", async () => {
		stubFetch({ body: [avis()] });
		const r = await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });
		expect(appels[0]).toBe(
			"https://api.github.com/advisories?cve_id=CVE-2020-8203",
		);
		expect(r.fixedIn).toBe("4.17.21");
	});

	test("une recherche CVE sans résultat n'est pas mise en cache", async () => {
		// Mémoriser un vide empêcherait de retrouver l'avis quand GitHub le publie.
		stubFetch({ body: [] });
		const r = await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });
		expect(r.fixedIn).toBeNull();
		expect(r.resolvable).toBe(true);
		expect(getCachedAdvisory("CVE-2020-8203")).toBeNull();
	});

	test("un 429 est signalé comme quota dépassé", async () => {
		stubFetch({ status: 429 });
		const r = await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });
		expect(r.rateLimited).toBe(true);
		expect(r.fixedIn).toBeNull();
	});

	test("un 403 avec quota à zéro est aussi un quota dépassé", async () => {
		// GitHub renvoie 403 et non 429 sur épuisement du quota non authentifié :
		// le confondre avec un refus d'accès ferait abandonner l'enrichissement.
		stubFetch({
			status: 403,
			headers: { "x-ratelimit-limit": "60", "x-ratelimit-remaining": "0" },
		});
		const r = await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });
		expect(r.rateLimited).toBe(true);
	});

	test("un 403 avec quota restant n'est pas un quota dépassé", async () => {
		stubFetch({
			status: 403,
			headers: { "x-ratelimit-limit": "60", "x-ratelimit-remaining": "42" },
		});
		const r = await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });
		expect(r.rateLimited).toBe(false);
		expect(r.resolvable).toBe(true);
	});

	test("l'état du quota est enregistré dans la base d'avis", async () => {
		// C'est ce que l'écran Réglages affiche ; sans persistance, l'information
		// disparaîtrait avec la requête. Elle vit avec le reste de ce qui concerne
		// GitHub, dans le second fichier — donc hors d'atteinte d'une remise à zéro.
		stubFetch({
			body: avis(),
			headers: {
				"x-ratelimit-limit": "5000",
				"x-ratelimit-remaining": "4998",
				"x-ratelimit-reset": "1735689600",
			},
		});
		await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });

		expect(getGithubConfig("GITHUB_RL_LIMIT")).toBe("5000");
		expect(getGithubConfig("GITHUB_RL_REMAINING")).toBe("4998");
		expect(getGithubConfig("GITHUB_RL_RESET")).toBe("1735689600");
	});

	test("un 404 reste résoluble mais sans version corrigée", async () => {
		stubFetch({ status: 404 });
		const r = await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });
		expect(r.resolvable).toBe(true);
		expect(r.rateLimited).toBe(false);
		expect(r.fixedIn).toBeNull();
	});

	test("une panne réseau est absorbée sans lever", async () => {
		// L'audit doit aboutir hors ligne : l'enrichissement est un bonus.
		stubFetch({ throws: true });
		const r = await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });
		expect(r.resolvable).toBe(true);
		expect(r.fixedIn).toBeNull();
		expect(r.severity).toBe("unknown");
	});

	test("un échec réseau préserve le originalFixedIn (N18)", async () => {
		// Le repli n'était appliqué que quand aucune clé n'était trouvée. Dès qu'un
		// identifiant existait mais que l'appel échouait, la version corrigée déjà
		// connue du parseur était remplacée par `null` : ne rien savoir n'est pas
		// savoir qu'il n'y a rien.
		stubFetch({ throws: true });
		const r = await resolveFixedVersion({
			...base,
			cve: "CVE-2020-8203",
			originalFixedIn: "4.17.21",
		});
		expect(r.fixedIn).toBe("4.17.21");
	});

	test("un quota dépassé préserve le originalFixedIn (N18)", async () => {
		// Un audit de 100 paquets sans jeton épuise le quota vers le 60ᵉ appel : les
		// 40 vulnérabilités suivantes étaient persistées avec `fixedIn = null`, et
		// l'écran Tickets proposait « Version cible : N/A ».
		stubFetch({ status: 429 });
		const r = await resolveFixedVersion({
			...base,
			cve: "CVE-2020-8203",
			originalFixedIn: "4.17.21",
		});
		expect(r.fixedIn).toBe("4.17.21");
		// Le drapeau reste levé : l'appelant doit pouvoir s'arrêter (§6).
		expect(r.rateLimited).toBe(true);
	});

	test("un avis introuvable préserve le originalFixedIn (N18)", async () => {
		stubFetch({ status: 404 });
		const r = await resolveFixedVersion({
			...base,
			cve: "CVE-2020-8203",
			originalFixedIn: "4.17.21",
		});
		expect(r.fixedIn).toBe("4.17.21");
	});

	test("sans version de l'outil, l'échec reste un null honnête", async () => {
		// Le repli ne doit rien inventer : si le parseur n'a rien fourni, il n'y a
		// pas de version corrigée à annoncer.
		stubFetch({ throws: true });
		const r = await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });
		expect(r.fixedIn).toBeNull();
	});

	test("composer est mappé sur son propre écosystème", async () => {
		stubFetch({
			body: avis({
				vulnerabilities: [
					{
						package: { ecosystem: "Packagist", name: "monolog/monolog" },
						vulnerable_version_range: "< 2.0.0",
						first_patched_version: "2.0.0",
					},
				],
			}),
		});
		const r = await resolveFixedVersion({
			tool: "composer",
			package: "monolog/monolog",
			cve: "CVE-2024-1000",
		});
		// « Packagist » côté GitHub, « composer » côté Aegis.
		expect(r.fixedIn).toBe("2.0.0");
	});

	test("yarn et bun partagent l'écosystème npm", async () => {
		for (const tool of ["yarn", "bun"] as const) {
			stubFetch({ body: avis() });
			const r = await resolveFixedVersion({
				tool,
				package: "lodash",
				cve: `GHSA-aaaa-bbbb-ccc${tool === "yarn" ? "1" : "2"}`,
			});
			expect(r.fixedIn).toBe("4.17.21");
		}
	});

	test("un paquet absent de l'avis retombe sur la version du parseur", async () => {
		stubFetch({ body: avis() });
		const r = await resolveFixedVersion({
			tool: "npm",
			package: "axios",
			cve: "CVE-2020-8203",
			originalFixedIn: "1.6.0",
		});
		expect(r.fixedIn).toBe("1.6.0");
	});

	test("la sévérité de l'avis prime sur celle du parseur", async () => {
		// GitHub est la source de vérité : c'est ce qui corrige les « unknown » de
		// `yarn audit` et les libellés propres à Composer.
		stubFetch({ body: avis({ severity: "critical" }) });
		const r = await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });
		expect(r.severity).toBe("critical");
	});

	test("une sévérité inconnue de l'avis est normalisée", async () => {
		stubFetch({ body: avis({ severity: "tres-grave" }) });
		const r = await resolveFixedVersion({ ...base, cve: "CVE-2020-8203" });
		expect(r.severity).toBe("unknown");
	});
});

describe("lib/github — choix du correctif parmi plusieurs branches", () => {
	useTempDb("github-fix");

	const troisBranches = [
		{ range: ">= 2.0.0 < 2.9.9", patched: "2.9.9" },
		{ range: ">= 3.0.0 < 3.5.1", patched: "3.5.1" },
		{ range: ">= 4.0.0 < 4.17.21", patched: "4.17.21" },
	];

	async function resoudre(versionRange?: string | null) {
		putCachedAdvisory("CVE-2020-8203", "high", {
			"npm:lodash": troisBranches,
		});
		return resolveFixedVersion({
			tool: "npm",
			package: "lodash",
			cve: "CVE-2020-8203",
			versionRange,
		});
	}

	test("une plage identique désigne exactement son correctif", async () => {
		expect((await resoudre(">= 3.0.0 < 3.5.1")).fixedIn).toBe("3.5.1");
	});

	test("à défaut, le correctif de la même majeure est retenu", async () => {
		// Proposer 4.17.21 à un projet en 2.x enverrait sur une montée de version
		// majeure alors qu'un correctif existe sur sa branche.
		expect((await resoudre("<2.9.9")).fixedIn).toBe("2.9.9");
	});

	test("sans plage exploitable, le premier correctif sert de repli", async () => {
		expect((await resoudre(null)).fixedIn).toBe("2.9.9");
	});

	test("une majeure absente de l'avis retombe sur le premier correctif", async () => {
		expect((await resoudre("<9.0.0")).fixedIn).toBe("2.9.9");
	});

	test("une seule branche est retenue sans examen de la plage", async () => {
		putCachedAdvisory("CVE-2024-2000", "high", {
			"npm:lodash": [{ range: "< 5.0.0", patched: "5.0.0" }],
		});
		const r = await resolveFixedVersion({
			tool: "npm",
			package: "lodash",
			cve: "CVE-2024-2000",
			versionRange: "aucun rapport",
		});
		expect(r.fixedIn).toBe("5.0.0");
	});

	test("une branche sans correctif publié retombe sur le parseur", async () => {
		putCachedAdvisory("CVE-2024-3000", "high", {
			"npm:lodash": [{ range: "< 5.0.0", patched: null }],
		});
		const r = await resolveFixedVersion({
			tool: "npm",
			package: "lodash",
			cve: "CVE-2024-3000",
			originalFixedIn: "4.17.21",
		});
		expect(r.fixedIn).toBe("4.17.21");
	});
});

describe("lib/github — syncAdvisory", () => {
	useTempDb("github-sync");

	test("sans identifiant, rien n'est fait", async () => {
		stubFetch({ body: avis() });
		expect(await syncAdvisory(null, null)).toBeNull();
		expect(appels).toHaveLength(0);
	});

	test("le cache est ignoré : l'avis est toujours redemandé", async () => {
		// C'est l'action « rafraîchir » : elle existe justement pour contourner le
		// cache quand GitHub a corrigé une sévérité.
		putCachedAdvisory("CVE-2020-8203", "low", {});
		stubFetch({ body: [avis({ severity: "critical" })] });

		const a = await syncAdvisory("CVE-2020-8203");
		expect(appels).toHaveLength(1);
		expect(a?.severity).toBe("critical");
		expect(getCachedAdvisory("CVE-2020-8203")?.severity).toBe("critical");
	});

	test("un échec réseau conserve l'avis déjà connu (N44)", async () => {
		// La suppression précédait l'appel : hors ligne ou sur un 5xx, l'avis connu
		// était définitivement perdu. « Rafraîchir » dégradait l'état quand il
		// échouait — précisément le moment où il ne faut rien casser.
		putCachedAdvisory("CVE-2020-8203", "critical", {
			"npm:lodash": [{ range: "<4.17.21", patched: "4.17.21" }],
		});
		stubFetch({ throws: true });

		expect(await syncAdvisory("CVE-2020-8203")).toBeNull();
		expect(getCachedAdvisory("CVE-2020-8203")?.severity).toBe("critical");
	});

	test("un quota dépassé conserve l'avis déjà connu (N44)", async () => {
		putCachedAdvisory("CVE-2020-8203", "critical", {});
		stubFetch({ status: 429 });

		await syncAdvisory("CVE-2020-8203");
		expect(getCachedAdvisory("CVE-2020-8203")?.severity).toBe("critical");
	});

	test("un avis introuvable conserve l'avis déjà connu (N44)", async () => {
		// Un 404 peut venir d'une référence mal saisie côté outil d'audit : ce n'est
		// pas une raison d'effacer ce que GitHub avait déjà donné.
		putCachedAdvisory("CVE-2020-8203", "high", {});
		stubFetch({ status: 404 });

		await syncAdvisory("CVE-2020-8203");
		expect(getCachedAdvisory("CVE-2020-8203")?.severity).toBe("high");
	});
});
