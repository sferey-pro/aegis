import { describe, expect, test } from "bun:test";

import {
	diagnostiqueConfiguration,
	estPasserelle,
	type JiraAuthConfig,
	jiraEndpoint,
	normaliseTokenKind,
} from "./endpoint";

const CLOUD = "11111111-2222-3333-4444-555555555555";
const SITE = "https://mon-entreprise.atlassian.net";
const PASSERELLE = "https://api.atlassian.com";

const CLASSIQUE: JiraAuthConfig = { kind: "classic", cloudId: "" };
const PERIMETRE: JiraAuthConfig = { kind: "scoped", cloudId: CLOUD };

describe("lib/jira/endpoint — type de jeton", () => {
	test("le défaut est le jeton simple", () => {
		// C'était historiquement le seul géré : une base existante ne doit pas
		// changer de comportement à la mise à jour.
		expect(normaliseTokenKind(undefined)).toBe("classic");
		expect(normaliseTokenKind("")).toBe("classic");
	});

	test("seule la valeur `scoped` bascule sur la passerelle", () => {
		expect(normaliseTokenKind("scoped")).toBe("scoped");
		// Une valeur inattendue retombe au défaut plutôt que de router au hasard.
		expect(normaliseTokenKind("SCOPED")).toBe("classic");
		expect(normaliseTokenKind("oauth")).toBe("classic");
	});
});

describe("lib/jira/endpoint — jeton simple", () => {
	test("l'API vit à la racine du site", () => {
		expect(jiraEndpoint(SITE, "/rest/api/3/myself", CLASSIQUE)).toBe(
			`${SITE}/rest/api/3/myself`,
		);
	});

	test("une barre finale ne change rien", () => {
		expect(jiraEndpoint(`${SITE}/`, "/rest/api/3/myself", CLASSIQUE)).toBe(
			`${SITE}/rest/api/3/myself`,
		);
	});

	test("le cloudId renseigné est ignoré", () => {
		// Le réglage peut rester en base après un changement de type : il ne doit
		// pas altérer un appel qui n'en a pas besoin.
		expect(
			jiraEndpoint(SITE, "/rest/api/3/myself", {
				kind: "classic",
				cloudId: CLOUD,
			}),
		).toBe(`${SITE}/rest/api/3/myself`);
	});

	test("sans configuration, le défaut s'applique", () => {
		expect(jiraEndpoint(SITE, "/rest/api/3/myself")).toBe(
			`${SITE}/rest/api/3/myself`,
		);
	});

	test("http est refusé", () => {
		// Cette valeur est appelée avec un en-tête `Authorization: Basic` : en clair,
		// elle exposerait les identifiants (§15).
		expect(
			jiraEndpoint("http://mon-entreprise.atlassian.net", "/x", CLASSIQUE),
		).toBeNull();
	});

	test("une URL illisible est refusée", () => {
		expect(jiraEndpoint("pas une url", "/x", CLASSIQUE)).toBeNull();
		expect(jiraEndpoint("", "/x", CLASSIQUE)).toBeNull();
	});
});

describe("lib/jira/endpoint — jeton à périmètre", () => {
	test("l'API passe par /ex/jira/<cloudId>", () => {
		expect(jiraEndpoint(SITE, "/rest/api/3/myself", PERIMETRE)).toBe(
			`${PASSERELLE}/ex/jira/${CLOUD}/rest/api/3/myself`,
		);
	});

	test("l'URL du site ne sert **pas** à l'appel d'API", () => {
		// C'est tout l'intérêt du choix explicite : `JIRA_BASE_URL` reste l'adresse
		// du site, qui construit les liens /browse/<clé> de l'interface.
		const cible = jiraEndpoint(
			"https://autre-site.atlassian.net",
			"/rest/api/3/issue",
			PERIMETRE,
		);
		expect(cible).toBe(`${PASSERELLE}/ex/jira/${CLOUD}/rest/api/3/issue`);
	});

	test("sans cloudId, aucune URL n'est produite", () => {
		// Mieux vaut refuser que d'interroger une URL qu'on sait fausse : la
		// passerelle sert tous les tenants.
		expect(
			jiraEndpoint(SITE, "/rest/api/3/myself", { kind: "scoped", cloudId: "" }),
		).toBeNull();
		expect(
			jiraEndpoint(SITE, "/rest/api/3/myself", {
				kind: "scoped",
				cloudId: "   ",
			}),
		).toBeNull();
	});

	test("un site en http reste refusé", () => {
		// La validation https porte sur la valeur enregistrée, quel que soit le
		// point d'entrée retenu ensuite.
		expect(
			jiraEndpoint("http://mon-entreprise.atlassian.net", "/x", PERIMETRE),
		).toBeNull();
	});
});

describe("lib/jira/endpoint — estPasserelle", () => {
	test("ne regarde que le nom d'hôte", () => {
		expect(estPasserelle(PASSERELLE)).toBe(true);
		expect(estPasserelle(`${PASSERELLE}/ex/jira/${CLOUD}`)).toBe(true);
		expect(estPasserelle(SITE)).toBe(false);
	});

	test("un hôte qui contient le nom n'en est pas une", () => {
		expect(estPasserelle("https://api.atlassian.com.attaquant.test")).toBe(
			false,
		);
		expect(estPasserelle("pas une url")).toBe(false);
	});
});

describe("lib/jira/endpoint — diagnostic", () => {
	test("une configuration complète ne dit rien", () => {
		expect(diagnostiqueConfiguration(SITE, CLASSIQUE)).toBeNull();
		expect(diagnostiqueConfiguration(SITE, PERIMETRE)).toBeNull();
	});

	test("une URL absente est nommée comme telle", () => {
		expect(diagnostiqueConfiguration("", CLASSIQUE)).toContain("absente");
	});

	test("le message https est celui du contrat, mot pour mot", () => {
		expect(diagnostiqueConfiguration("http://x.atlassian.net", CLASSIQUE)).toBe(
			"URL Jira invalide (https requis)",
		);
	});

	test("l'URL de la passerelle en base est signalée", () => {
		// Elle sert aussi aux liens /browse/<clé> : `api.atlassian.com/browse/SEC-1`
		// ne mène nulle part. Le type de jeton suffit à choisir le point d'entrée.
		const message = diagnostiqueConfiguration(PASSERELLE, PERIMETRE);
		expect(message).toContain("adresse de votre site");
		expect(message).toContain("pas celle de la passerelle");
	});

	test("le cloudId manquant est nommé, avec où le trouver", () => {
		const message = diagnostiqueConfiguration(SITE, {
			kind: "scoped",
			cloudId: "",
		});
		expect(message).toContain("Cloud ID");
		expect(message).toContain("_edge/tenant_info");
	});

	test("un cloudId absent ne gêne pas un jeton simple", () => {
		expect(diagnostiqueConfiguration(SITE, CLASSIQUE)).toBeNull();
	});
});
