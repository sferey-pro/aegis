import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { getDb } from "@/db";
import type { Annotation } from "@/db/annotations";
import { createProject, type Project } from "@/db/projects";
import { jsonBody, startTestServer, type TestServer } from "@/test/server";

let srv: TestServer;
let projet: Project;

beforeAll(async () => {
	srv = await startTestServer("annotations");
});
afterAll(() => srv.stop());
beforeEach(() => {
	getDb().query("DELETE FROM projects").run();
	projet = createProject({
		name: "api",
		path: "/srv/api",
		type: "node",
		tool: "npm",
	});
});

/** Le paramètre de type permet aux tests d'erreur d'attendre `{ error }`. */
function annoter<T = Annotation>(body: unknown) {
	return srv.json<T>("/api/annotations", jsonBody(body));
}

describe("POST /api/annotations", () => {
	test("crée l'annotation avec les valeurs par défaut", async () => {
		const { status, data } = await annoter({
			cve: "CVE-2024-1",
			projectId: projet.id,
		});
		expect(status).toBe(200);
		expect(data.status).toBe("pending");
		expect(data.note).toBe("");
		expect(data.fixed_in).toBeNull();
	});

	test("enregistre le statut et la note", async () => {
		const { data } = await annoter({
			cve: "CVE-2024-1",
			projectId: projet.id,
			status: "not_affected",
			note: "hors chemin d'exécution",
		});
		expect(data.status).toBe("not_affected");
		expect(data.note).toBe("hors chemin d'exécution");
	});

	test("un second appel met à jour la même ligne au lieu d'en créer une", async () => {
		await annoter({ cve: "CVE-2024-1", projectId: projet.id, note: "à voir" });
		await annoter({
			cve: "CVE-2024-1",
			projectId: projet.id,
			status: "confirmed",
		});
		const lignes = getDb()
			.query("SELECT * FROM annotations WHERE cve = ?")
			.all("CVE-2024-1");
		expect(lignes).toHaveLength(1);
	});

	test("un champ omis est effacé, pas conservé — écart documenté", async () => {
		// `upsertAnnotation` préserve les champs non fournis, mais le schéma de la
		// route applique ses valeurs par défaut avant d'y arriver : `note` devient
		// `""` et `fixedIn` devient `null`. Enregistrer un statut efface donc la
		// note et la version corrigée saisies à la main.
		await annoter({
			cve: "CVE-2024-2",
			projectId: projet.id,
			note: "à voir",
			fixedIn: "4.17.21",
		});
		const { data } = await annoter({
			cve: "CVE-2024-2",
			projectId: projet.id,
			status: "confirmed",
		});
		expect(data.status).toBe("confirmed");
		expect(data.note).toBe("");
		expect(data.fixed_in).toBeNull();
	});

	// ---- N32 : le contrat, tel qu'il devra être ------------------------------
	//
	// `test.failing` exécute le corps et attend son échec : la suite reste verte
	// tant que le défaut existe. Le jour où N32 est corrigé, ce test se met à
	// passer et Bun le signale en rouge — « this test is marked as failing but it
	// passed. Remove `.failing` if tested behavior now works ». Il est donc
	// impossible de corriger le code sans reprendre le test.
	//
	// Correctif attendu (docs/ISSUE.md#n32) : retirer `.default("")` de `note` et
	// rendre `fixedIn` réellement optionnel dans `annotationBodySchema`, pour que
	// l'absence traverse jusqu'à `upsertAnnotation` en tant qu'`undefined`.
	test.failing("un champ omis est conservé, pas réinitialisé (N32)", async () => {
		await annoter({
			cve: "CVE-2024-3",
			projectId: projet.id,
			note: "hors chemin d'exécution",
			fixedIn: "4.17.21",
		});
		const { data } = await annoter({
			cve: "CVE-2024-3",
			projectId: projet.id,
			status: "confirmed",
		});
		expect(data.status).toBe("confirmed");
		expect(data.note).toBe("hors chemin d'exécution");
		expect(data.fixed_in).toBe("4.17.21");
	});

	test("un projet inexistant renvoie 404, pas 500", async () => {
		// Sans ce garde-fou, la contrainte de clé étrangère remonterait en erreur
		// serveur (CONTEXT.md §7).
		const { status, data } = await annoter<{ error: string }>({
			cve: "CVE-2024-1",
			projectId: 999_999,
		});
		expect(status).toBe(404);
		expect(data).toEqual({ error: "Projet introuvable" });
	});

	test("une CVE vide renvoie 400", async () => {
		const { status, data } = await annoter<{ error: string }>({
			cve: "  ",
			projectId: projet.id,
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "CVE requise" });
	});

	test("un projectId non numérique renvoie 400", async () => {
		const { status, data } = await annoter<{ error: string }>({
			cve: "CVE-2024-1",
			projectId: "abc",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Projet introuvable" });
	});

	test("un statut inconnu retombe sur pending au lieu d'échouer", async () => {
		const { status, data } = await annoter({
			cve: "CVE-2024-1",
			projectId: projet.id,
			status: "peut-être",
		});
		expect(status).toBe(200);
		expect(data.status).toBe("pending");
	});

	test("une version corrigée blanche est enregistrée à null", async () => {
		const { data } = await annoter({
			cve: "CVE-2024-1",
			projectId: projet.id,
			fixedIn: "   ",
		});
		expect(data.fixed_in).toBeNull();
	});

	test("une version corrigée saisie à la main est conservée", async () => {
		// C'est l'override manuel : l'humain a vu le dépôt amont avant l'avis.
		const { data } = await annoter({
			cve: "CVE-2024-1",
			projectId: projet.id,
			fixedIn: "4.17.21",
		});
		expect(data.fixed_in).toBe("4.17.21");
	});

	test("une clé de repli « paquet: titre » est acceptée comme CVE", async () => {
		// Les failles sans CVE sont annotées par leur clé de groupe.
		const { status, data } = await annoter({
			cve: "lodash: Prototype pollution",
			projectId: projet.id,
			status: "ignored",
		});
		expect(status).toBe(200);
		expect(data.cve).toBe("lodash: Prototype pollution");
	});

	test("un JSON illisible renvoie 400 « JSON invalide »", async () => {
		const { status, data } = await srv.json("/api/annotations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "JSON invalide" });
	});

	test("l'annotation globale (projectId = -1) renvoie 404 — écart documenté", async () => {
		// L'agrégateur lit les annotations `project_id = -1` pour superposer des
		// décisions globales, mais la route exige un projet existant et la colonne
		// porte une clé étrangère : la fonctionnalité est inatteignable.
		const { status } = await annoter({ cve: "CVE-2024-1", projectId: -1 });
		expect(status).toBe(404);
	});
});
