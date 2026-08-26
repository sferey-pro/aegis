import { describe, expect, test } from "bun:test";

import {
	diagnostiqueConfiguration,
	estPasserelle,
	jiraEndpoint,
} from "./endpoint";

const CLOUD = "11111111-2222-3333-4444-555555555555";
const SITE = "https://mon-entreprise.atlassian.net";
const PASSERELLE = "https://api.atlassian.com";

describe("lib/jira/endpoint — site classique", () => {
	test("le chemin de l'API vit à la racine du domaine", () => {
		expect(jiraEndpoint(SITE, "/rest/api/3/myself")).toBe(
			`${SITE}/rest/api/3/myself`,
		);
	});

	test("une barre finale ne change rien", () => {
		// Le piège de la résolution relative, qu'on évite en gardant un chemin
		// absolu sur cette branche : oublier le `/` final casserait l'URL.
		expect(jiraEndpoint(`${SITE}/`, "/rest/api/3/myself")).toBe(
			`${SITE}/rest/api/3/myself`,
		);
	});

	test("le cloudId est ignoré hors passerelle", () => {
		// Le fournir ne doit pas altérer un appel qui n'en a pas besoin.
		expect(jiraEndpoint(SITE, "/rest/api/3/myself", CLOUD)).toBe(
			`${SITE}/rest/api/3/myself`,
		);
	});

	test("http est refusé", () => {
		// Cette valeur est appelée avec un en-tête `Authorization: Basic` : en clair,
		// elle exposerait les identifiants (§15).
		expect(
			jiraEndpoint("http://mon-entreprise.atlassian.net", "/x"),
		).toBeNull();
	});

	test("une URL illisible est refusée", () => {
		expect(jiraEndpoint("pas une url", "/x")).toBeNull();
		expect(jiraEndpoint("", "/x")).toBeNull();
	});
});

describe("lib/jira/endpoint — passerelle", () => {
	test("le préfixe /ex/jira/<cloudId> est construit", () => {
		expect(jiraEndpoint(PASSERELLE, "/rest/api/3/myself", CLOUD)).toBe(
			`${PASSERELLE}/ex/jira/${CLOUD}/rest/api/3/myself`,
		);
	});

	test("le préfixe déjà présent dans l'URL de base est conservé", () => {
		// C'est le défaut corrigé : la version précédente résolvait depuis la racine
		// et effaçait `/ex/jira/<cloudId>` sans rien signaler, produisant un appel
		// vers `https://api.atlassian.com/rest/api/3/myself`, qui n'existe pas.
		expect(
			jiraEndpoint(`${PASSERELLE}/ex/jira/${CLOUD}`, "/rest/api/3/myself"),
		).toBe(`${PASSERELLE}/ex/jira/${CLOUD}/rest/api/3/myself`);
	});

	test("le préfixe est conservé avec une barre finale", () => {
		expect(
			jiraEndpoint(`${PASSERELLE}/ex/jira/${CLOUD}/`, "/rest/api/3/myself"),
		).toBe(`${PASSERELLE}/ex/jira/${CLOUD}/rest/api/3/myself`);
	});

	test("le réglage l'emporte sur ce que porte l'URL", () => {
		// La source explicite gagne : sinon on ne pourrait plus changer de site sans
		// réécrire l'URL de base.
		const autre = "99999999-8888-7777-6666-555555555555";
		expect(
			jiraEndpoint(`${PASSERELLE}/ex/jira/${CLOUD}`, "/rest/api/3/x", autre),
		).toBe(`${PASSERELLE}/ex/jira/${autre}/rest/api/3/x`);
	});

	test("sans cloudId, la passerelle est refusée", () => {
		// Mieux vaut refuser que d'appeler une URL qui n'existe pas : la passerelle
		// sert tous les tenants, rien ne dit lequel viser.
		expect(jiraEndpoint(PASSERELLE, "/rest/api/3/myself")).toBeNull();
		expect(
			jiraEndpoint(`${PASSERELLE}/`, "/rest/api/3/myself", "  "),
		).toBeNull();
	});

	test("un chemin de base qui n'est pas /ex/jira ne fournit pas d'id", () => {
		expect(jiraEndpoint(`${PASSERELLE}/autre/chose`, "/x")).toBeNull();
	});

	test("estPasserelle ne regarde que le nom d'hôte", () => {
		expect(estPasserelle(PASSERELLE)).toBe(true);
		expect(estPasserelle(`${PASSERELLE}/ex/jira/${CLOUD}`)).toBe(true);
		expect(estPasserelle(SITE)).toBe(false);
		// Un hôte qui *contient* le nom ne doit pas passer pour la passerelle.
		expect(estPasserelle("https://api.atlassian.com.attaquant.test")).toBe(
			false,
		);
		expect(estPasserelle("pas une url")).toBe(false);
	});

	test("http est refusé sur la passerelle aussi", () => {
		expect(jiraEndpoint("http://api.atlassian.com", "/x", CLOUD)).toBeNull();
	});
});

describe("lib/jira/endpoint — diagnostic", () => {
	test("une configuration classique complète ne dit rien", () => {
		expect(diagnostiqueConfiguration(SITE, "")).toBeNull();
	});

	test("une URL absente est nommée comme telle", () => {
		expect(diagnostiqueConfiguration("", "")).toContain("absente");
	});

	test("http est signalé pour ce qu'il est", () => {
		expect(diagnostiqueConfiguration("http://x.atlassian.net", "")).toContain(
			"https",
		);
	});

	test("le cloudId manquant est nommé, avec où le trouver", () => {
		// « URL invalide » envoyait l'utilisateur corriger le mauvais champ.
		const message = diagnostiqueConfiguration(PASSERELLE, "");
		expect(message).toContain("Cloud ID");
		expect(message).toContain("_edge/tenant_info");
	});

	test("le cloudId porté par l'URL suffit au diagnostic", () => {
		expect(
			diagnostiqueConfiguration(`${PASSERELLE}/ex/jira/${CLOUD}`, ""),
		).toBeNull();
	});

	test("le réglage suffit au diagnostic", () => {
		expect(diagnostiqueConfiguration(PASSERELLE, CLOUD)).toBeNull();
	});
});
