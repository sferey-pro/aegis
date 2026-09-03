import { describe, expect, test } from "bun:test";

import {
	annotationBodySchema,
	auditMaxAgeHoursSchema,
	detectBodySchema,
	projectBodySchema,
	promptBodySchema,
	reportBodySchema,
	restoreBodySchema,
	settingsBodySchema,
	TAG_COLORS,
	tagBodySchema,
	ticketCreateBodySchema,
	ticketLinkBodySchema,
	ticketTargetSchema,
} from "./schemas";

/** Message du premier problème, tel que `parseBody` le renverra au client. */
function messageDe(
	schema: { safeParse(v: unknown): unknown },
	valeur: unknown,
) {
	const r = schema.safeParse(valeur) as {
		success: boolean;
		error?: { issues: { message: string }[] };
	};
	expect(r.success).toBe(false);
	return r.error?.issues[0]?.message;
}

const projetValide = {
	name: "API",
	path: "/srv/api",
	type: "node",
	tool: "npm",
};

describe("schemas — projectBodySchema", () => {
	test("un corps minimal est accepté et complété par les défauts", () => {
		const r = projectBodySchema.parse(projetValide);
		expect(r.tags).toEqual([]);
		expect(r.ignored).toBe(false);
		expect(r.is_remote).toBe(false);
		expect(r.audit_path).toBeNull();
	});

	test("les messages sont ceux du contrat", () => {
		expect(messageDe(projectBodySchema, { ...projetValide, name: "" })).toBe(
			"Nom requis",
		);
		expect(messageDe(projectBodySchema, { ...projetValide, path: "   " })).toBe(
			"Chemin requis",
		);
		expect(messageDe(projectBodySchema, { ...projetValide, name: 42 })).toBe(
			"Nom requis",
		);
	});

	test("un nom absent est refusé, pas silencieusement vidé", () => {
		const { name: _, ...sansNom } = projetValide;
		expect(messageDe(projectBodySchema, sansNom)).toBe("Nom requis");
	});

	test("le nom et le chemin sont trimés", () => {
		const r = projectBodySchema.parse({
			...projetValide,
			name: "  API  ",
			path: "  /srv/api  ",
		});
		expect(r.name).toBe("API");
		expect(r.path).toBe("/srv/api");
	});

	test("type hors énumération est refusé avec le message du contrat", () => {
		expect(
			messageDe(projectBodySchema, { ...projetValide, type: "python" }),
		).toBe("Type invalide (node|composer)");
	});

	test("outil hors énumération est refusé avec le message du contrat", () => {
		expect(
			messageDe(projectBodySchema, { ...projetValide, tool: "pnpm" }),
		).toBe("Outil invalide (npm|yarn|composer)");
	});

	test("bun est un outil valide bien que le message ne le cite pas", () => {
		// Le message du contrat n'énumère pas `bun` ; le schéma reproduit l'écart
		// plutôt que de dévier de CONTEXT.md §1.
		expect(projectBodySchema.parse({ ...projetValide, tool: "bun" }).tool).toBe(
			"bun",
		);
	});

	test("un audit_path vide devient null", () => {
		for (const v of ["", "   ", null, undefined]) {
			expect(
				projectBodySchema.parse({ ...projetValide, audit_path: v }).audit_path,
			).toBeNull();
		}
	});

	test("un audit_path renseigné est trimé et conservé", () => {
		expect(
			projectBodySchema.parse({ ...projetValide, audit_path: " api/ " })
				.audit_path,
		).toBe("api/");
	});

	test("les tags sont trimés, dédupliqués, dans l'ordre d'apparition", () => {
		expect(
			projectBodySchema.parse({
				...projetValide,
				tags: [" back ", "back", "", "   ", "front"],
			}).tags,
		).toEqual(["back", "front"]);
	});

	test("des tags non textuels sont coercés", () => {
		expect(
			projectBodySchema.parse({ ...projetValide, tags: [1, 2] }).tags,
		).toEqual(["1", "2"]);
	});

	test("un tags non-tableau retombe sur une liste vide sans échouer", () => {
		// Le champ est cosmétique : le refuser bloquerait la création du projet.
		expect(
			projectBodySchema.parse({ ...projetValide, tags: "back" }).tags,
		).toEqual([]);
	});

	test("une valeur booléenne invalide est refusée, pas ramenée à false", () => {
		// Le contrat donne `false` comme défaut d'un champ **absent** ; il ne prévoit
		// aucun repli pour une valeur invalide. Inventer ce repli ferait absorber au
		// code une donnée non conforme et enregistrerait un état non demandé.
		expect(
			messageDe(projectBodySchema, { ...projetValide, ignored: "peut-être" }),
		).toBe("Valeur booléenne invalide");
		expect(
			messageDe(projectBodySchema, { ...projetValide, is_remote: 7 }),
		).toBe("Valeur booléenne invalide");
	});

	test("ignored et is_remote acceptent les formes véhiculées par JSON", () => {
		const r = projectBodySchema.parse({
			...projetValide,
			ignored: 1,
			is_remote: "true",
		});
		expect(r.ignored).toBe(true);
		expect(r.is_remote).toBe(true);
	});

	test("les champs inconnus sont écartés du résultat", () => {
		const r = projectBodySchema.parse({ ...projetValide, id: 99, evil: true });
		expect(r).not.toHaveProperty("id");
		expect(r).not.toHaveProperty("evil");
	});
});

describe("schemas — detectBodySchema", () => {
	test("seul le chemin est requis", () => {
		expect(detectBodySchema.parse({ path: "/srv/api" })).toEqual({
			path: "/srv/api",
			audit_path: null,
		});
	});

	test("un chemin vide est refusé", () => {
		expect(messageDe(detectBodySchema, { path: "  " })).toBe("Chemin requis");
	});
});

describe("schemas — annotationBodySchema", () => {
	test("un corps minimal ne porte que le statut par défaut", () => {
		// `status` a un défaut — l'état neutre du triage. `note` et `fixedIn` n'en
		// ont pas : leur absence doit rester `undefined` pour traverser jusqu'à
		// `upsertAnnotation`, qui préserve alors la valeur en base (N32). Leur
		// donner un défaut effaçait la note et la version corrigée saisies à la
		// main dès qu'on enregistrait un statut.
		const r = annotationBodySchema.parse({ cve: "CVE-2024-1", projectId: 1 });
		expect(r.status).toBe("pending");
		expect(r.note).toBeUndefined();
		expect(r.fixedIn).toBeUndefined();
	});

	test("une note vide explicite reste une chaîne vide", () => {
		// `""` est une intention — « vide ce champ » — distincte de l'absence.
		expect(
			annotationBodySchema.parse({ cve: "CVE-1", projectId: 1, note: "" }).note,
		).toBe("");
	});

	test("un fixedIn null explicite reste null", () => {
		expect(
			annotationBodySchema.parse({ cve: "CVE-1", projectId: 1, fixedIn: null })
				.fixedIn,
		).toBeNull();
	});

	test("une CVE vide est refusée", () => {
		expect(messageDe(annotationBodySchema, { cve: " ", projectId: 1 })).toBe(
			"CVE requise",
		);
	});

	test("un projectId non numérique est refusé", () => {
		expect(
			messageDe(annotationBodySchema, { cve: "CVE-1", projectId: "abc" }),
		).toBe("Projet introuvable");
	});

	test("un projectId textuel numérique est coercé", () => {
		expect(
			annotationBodySchema.parse({ cve: "CVE-1", projectId: "7" }).projectId,
		).toBe(7);
	});

	test("un statut hors énumération retombe sur pending", () => {
		// CONTEXT.md §7 : le triage ne doit pas échouer sur une valeur inconnue,
		// il repart de l'état neutre.
		expect(
			annotationBodySchema.parse({
				cve: "CVE-1",
				projectId: 1,
				status: "peut-être",
			}).status,
		).toBe("pending");
	});

	test("les quatre statuts valides traversent inchangés", () => {
		for (const status of [
			"pending",
			"confirmed",
			"not_affected",
			"ignored",
		] as const) {
			expect(
				annotationBodySchema.parse({ cve: "CVE-1", projectId: 1, status })
					.status,
			).toBe(status);
		}
	});

	test("un fixedIn blanc devient null", () => {
		expect(
			annotationBodySchema.parse({
				cve: "CVE-1",
				projectId: 1,
				fixedIn: "   ",
			}).fixedIn,
		).toBeNull();
	});
});

describe("schemas — tagBodySchema", () => {
	test("la couleur par défaut est indigo", () => {
		expect(tagBodySchema.parse({ name: "back" }).color).toBe("indigo");
	});

	test("les huit couleurs de la palette sont acceptées", () => {
		expect(TAG_COLORS).toHaveLength(8);
		for (const color of TAG_COLORS) {
			expect(tagBodySchema.parse({ name: "t", color }).color).toBe(color);
		}
	});

	test("une couleur hors palette retombe sur indigo", () => {
		// Le champ pilote une classe Tailwind : une valeur libre ne produirait
		// aucun style, donc un badge invisible.
		expect(tagBodySchema.parse({ name: "t", color: "#ff0000" }).color).toBe(
			"indigo",
		);
	});

	test("un nom vide est refusé", () => {
		expect(messageDe(tagBodySchema, { name: "  " })).toBe("Nom requis");
	});
});

describe("schemas — promptBodySchema", () => {
	test("seul le titre est requis", () => {
		expect(promptBodySchema.parse({ title: "Analyse" })).toEqual({
			title: "Analyse",
			body: "",
			tags: [],
		});
	});

	test("un titre vide est refusé", () => {
		expect(messageDe(promptBodySchema, { title: "   " })).toBe("Titre requis");
	});

	test("le corps conserve ses sauts de ligne", () => {
		const body = "Ligne 1\n\nLigne 3";
		expect(promptBodySchema.parse({ title: "t", body }).body).toBe(body);
	});

	test("les tags suivent la même normalisation que les projets", () => {
		expect(
			promptBodySchema.parse({ title: "t", tags: [" a ", "a", ""] }).tags,
		).toEqual(["a"]);
	});
});

describe("schemas — auditMaxAgeHoursSchema (CONTEXT.md §12)", () => {
	test("une fenêtre positive est acceptée", () => {
		expect(auditMaxAgeHoursSchema.parse("24")).toBe(24);
	});

	test("0 signifie jamais périmé, -1 toujours réauditer", () => {
		expect(auditMaxAgeHoursSchema.parse(0)).toBe(0);
		expect(auditMaxAgeHoursSchema.parse(-1)).toBe(-1);
	});

	test("en dessous de -1 est refusé", () => {
		expect(messageDe(auditMaxAgeHoursSchema, -2)).toBe("Durée invalide");
	});

	test("Infinity et NaN sont refusés", () => {
		// Un `Infinity` passerait la borne min et rendrait tout audit périmé
		// ou aucun, selon le sens de la comparaison.
		expect(messageDe(auditMaxAgeHoursSchema, Number.POSITIVE_INFINITY)).toBe(
			"Durée invalide",
		);
		expect(messageDe(auditMaxAgeHoursSchema, "abc")).toBe("Durée invalide");
	});
});

describe("schemas — settingsBodySchema", () => {
	test("un lot de réglages est conservé en texte", () => {
		expect(
			settingsBodySchema.parse({
				GITHUB_TOKEN: "ghp_x",
				AUDIT_MAX_AGE_HOURS: 24,
			}),
		).toEqual({ GITHUB_TOKEN: "ghp_x", AUDIT_MAX_AGE_HOURS: "24" });
	});

	test("un lot vide est accepté", () => {
		expect(settingsBodySchema.parse({})).toEqual({});
	});

	test("AUDIT_MAX_AGE_HOURS invalide fait échouer tout le lot", () => {
		// Enregistrer les autres clés en ignorant celle-ci laisserait l'écran
		// afficher un succès pour une valeur non appliquée.
		expect(
			messageDe(settingsBodySchema, {
				GITHUB_TOKEN: "ghp_x",
				AUDIT_MAX_AGE_HOURS: "beaucoup",
			}),
		).toBe("Durée invalide");
	});

	test("une URL Jira en https est acceptée", () => {
		expect(
			settingsBodySchema.parse({ JIRA_BASE_URL: "https://x.atlassian.net" })
				.JIRA_BASE_URL,
		).toBe("https://x.atlassian.net");
	});

	test("une URL Jira en http est refusée", () => {
		// La valeur est appelée par le serveur avec un en-tête `Authorization:
		// Basic` : en http, les identifiants Jira partent en clair (N4).
		expect(
			messageDe(settingsBodySchema, { JIRA_BASE_URL: "http://x.test" }),
		).toBe("URL Jira invalide (https requis)");
	});

	test("une adresse de métadonnées interne est refusée", () => {
		// C'est la cible classique d'une SSRF sur un hôte cloud.
		expect(
			messageDe(settingsBodySchema, {
				JIRA_BASE_URL: "http://169.254.169.254",
			}),
		).toBe("URL Jira invalide (https requis)");
	});

	test("une valeur qui n'est pas une URL est refusée", () => {
		expect(
			messageDe(settingsBodySchema, { JIRA_BASE_URL: "pas-une-url" }),
		).toBe("URL Jira invalide (https requis)");
	});

	test("vider l'URL Jira reste permis", () => {
		// Effacer une configuration est une action légitime.
		expect(settingsBodySchema.parse({ JIRA_BASE_URL: "" }).JIRA_BASE_URL).toBe(
			"",
		);
	});

	test("les autres clés ne sont pas contraintes", () => {
		expect(
			settingsBodySchema.parse({ N_IMPORTE_QUOI: "valeur" }).N_IMPORTE_QUOI,
		).toBe("valeur");
	});
});

describe("schemas — restoreBodySchema et reportBodySchema", () => {
	test("un fichier de restauration est requis", () => {
		expect(messageDe(restoreBodySchema, { file: "" })).toBe("Fichier requis");
		expect(restoreBodySchema.parse({ file: " snap.sqlite " }).file).toBe(
			"snap.sqlite",
		);
	});

	test("un compte-rendu complète les sévérités manquantes à zéro", () => {
		const r = reportBodySchema.parse({
			projects_audited: 2,
			total_vulnerabilities: 3,
			counts: { critical: 3 },
		});
		expect(r.counts).toEqual({
			critical: 3,
			high: 0,
			moderate: 0,
			low: 0,
			info: 0,
			unknown: 0,
		});
		expect(r.details).toEqual([]);
	});

	test("counts accepte des sévérités supplémentaires sans les perdre", () => {
		// `.loose()` : un futur parseur peut remonter une sévérité inconnue sans
		// faire échouer l'enregistrement du compte-rendu.
		const r = reportBodySchema.parse({
			projects_audited: 1,
			total_vulnerabilities: 1,
			counts: { critical: 1, exotique: 1 },
		});
		expect(r.counts).toHaveProperty("exotique", 1);
	});

	test("un compte négatif est refusé", () => {
		expect(
			reportBodySchema.safeParse({
				projects_audited: -1,
				total_vulnerabilities: 0,
				counts: {},
			}).success,
		).toBe(false);
	});

	test("les détails traversent sans être inspectés", () => {
		const details = [{ projectId: 1, projectName: "api", vulns: [] }];
		expect(
			reportBodySchema.parse({
				projects_audited: 1,
				total_vulnerabilities: 0,
				counts: {},
				details,
			}).details,
		).toEqual(details);
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

describe("schemas — tickets (CONTEXT.md §8)", () => {
	const cible = { projectId: 7, packageName: "lodash" };

	test("la cible exige un projet entier et un paquet non vide", () => {
		expect(ticketTargetSchema.parse(cible)).toEqual(cible);
		expect(ticketTargetSchema.parse({ ...cible, projectId: "7" })).toEqual(
			cible,
		);
		expect(messageDe(ticketTargetSchema, { packageName: "lodash" })).toBe(
			"Projet requis",
		);
		expect(
			messageDe(ticketTargetSchema, { projectId: 7.5, packageName: "x" }),
		).toBe("Projet requis");
		expect(messageDe(ticketTargetSchema, { projectId: 7 })).toBe(
			"Paquet requis",
		);
		expect(
			messageDe(ticketTargetSchema, { projectId: 7, packageName: "  " }),
		).toBe("Paquet requis");
	});

	test("la liaison exige une référence, et accepte l'absence de CVE", () => {
		expect(ticketLinkBodySchema.parse({ ...cible, ref: " SEC-1 " })).toEqual({
			...cible,
			ref: "SEC-1",
			cves: [],
		});
		expect(messageDe(ticketLinkBodySchema, cible)).toBe("Référence requise");
		expect(messageDe(ticketLinkBodySchema, { ...cible, ref: "" })).toBe(
			"Référence requise",
		);
	});

	test("la création remplit cves, notes et issueType par défaut", () => {
		// `issueType` vide n'est pas refusé ici : c'est la route qui le fait, après
		// le contrôle de configuration Jira, avec le message qui nomme la modale.
		expect(ticketCreateBodySchema.parse(cible)).toEqual({
			...cible,
			cves: [],
			notes: "",
			issueType: "",
		});
		expect(
			ticketCreateBodySchema.parse({ ...cible, issueType: " Tâche " })
				.issueType,
		).toBe("Tâche");
	});
});

describe("contrats attendus — à activer au correctif", () => {
	// N33 — `z.coerce.boolean` rend vraie toute chaîne non vide. Un client qui
	// sérialise ses booléens en texte active « ignoré » en croyant le désactiver,
	// et le projet disparaît de l'agrégation CVE sans message.
	test('la chaîne "false" vaut faux (N33)', () => {
		const r = projectBodySchema.parse({
			...projetValide,
			ignored: "false",
			is_remote: "false",
		});
		expect(r.ignored).toBe(false);
		expect(r.is_remote).toBe(false);
	});
});
