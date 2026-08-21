import { describe, expect, test } from "bun:test";

import { useTempDb } from "@/test/db";
import { getDb } from "./index";
import { createProject } from "./projects";
import {
	deleteTicket,
	getTicketByHash,
	getTickets,
	saveTicket,
} from "./tickets";

function projet(nom = "api") {
	return createProject({
		name: nom,
		path: `/srv/${nom}`,
		type: "node",
		tool: "npm",
	});
}

describe("db/tickets", () => {
	useTempDb("tickets");

	test("une base neuve n'a aucun ticket", () => {
		expect(getTickets()).toEqual([]);
	});

	test("saveTicket persiste la référence et les CVE désérialisées", () => {
		const p = projet();
		saveTicket(p.id, "lodash", "SEC-1234", ["CVE-2024-1", "CVE-2024-2"]);
		const [t] = getTickets();
		expect(t?.package).toBe("lodash");
		expect(t?.url).toBe("SEC-1234");
		expect(t?.cves).toEqual(["CVE-2024-1", "CVE-2024-2"]);
	});

	test("les CVE sont stockées en JSON", () => {
		const p = projet();
		saveTicket(p.id, "lodash", "SEC-1", ["CVE-2024-1"]);
		const brut = getDb().query("SELECT cves FROM tickets").get() as {
			cves: string;
		};
		expect(brut.cves).toBe('["CVE-2024-1"]');
	});

	test("un ticket sans CVE donne un tableau vide", () => {
		const p = projet();
		saveTicket(p.id, "lodash", "SEC-1", []);
		expect(getTickets()[0]?.cves).toEqual([]);
	});

	test("le content_hash est optionnel et vaut null par défaut", () => {
		const p = projet();
		saveTicket(p.id, "lodash", "SEC-1", []);
		expect(getTickets()[0]?.content_hash).toBeNull();
	});

	test("un hash vide est normalisé en null", () => {
		// `contentHash || null` : une chaîne vide ne doit pas devenir un hash
		// consultable, sinon deux tickets sans hash se retrouveraient identiques.
		const p = projet();
		saveTicket(p.id, "lodash", "SEC-1", [], "");
		expect(getTickets()[0]?.content_hash).toBeNull();
	});

	test("re-sauver le même (projet, paquet) met à jour au lieu d'insérer", () => {
		// L'unité est le paquet, pas la CVE : un second audit qui ajoute une CVE
		// au même paquet doit enrichir le ticket existant.
		const p = projet();
		saveTicket(p.id, "lodash", "SEC-1", ["CVE-2024-1"]);
		saveTicket(p.id, "lodash", "SEC-1", ["CVE-2024-1", "CVE-2024-2"]);

		const tickets = getTickets();
		expect(tickets).toHaveLength(1);
		expect(tickets[0]?.cves).toHaveLength(2);
	});

	test("le même paquet sur deux projets fait deux tickets", () => {
		const a = projet("a");
		const b = projet("b");
		saveTicket(a.id, "lodash", "SEC-1", []);
		saveTicket(b.id, "lodash", "SEC-2", []);
		expect(getTickets()).toHaveLength(2);
	});

	test("getTicketByHash retrouve le ticket déjà créé", () => {
		// C'est le garde-fou anti-doublon : avant d'ouvrir un ticket, l'appelant
		// vérifie qu'un ticket au contenu identique n'existe pas déjà.
		const p = projet();
		saveTicket(p.id, "lodash", "SEC-1", ["CVE-2024-1"], "h4sh");
		expect(getTicketByHash("h4sh")?.url).toBe("SEC-1");
	});

	test("getTicketByHash renvoie undefined sur un hash inconnu", () => {
		expect(getTicketByHash("inexistant")).toBeUndefined();
	});

	test("mettre à jour un ticket remplace son hash", () => {
		// Le contenu change (nouvelle CVE) donc l'ancien hash ne doit plus répondre.
		const p = projet();
		saveTicket(p.id, "lodash", "SEC-1", ["CVE-2024-1"], "hash-v1");
		saveTicket(
			p.id,
			"lodash",
			"SEC-1",
			["CVE-2024-1", "CVE-2024-2"],
			"hash-v2",
		);

		expect(getTicketByHash("hash-v1")).toBeUndefined();
		expect(getTicketByHash("hash-v2")?.cves).toHaveLength(2);
	});

	test("le hash n'est pas unique en base — écart documenté", () => {
		// Aucune contrainte UNIQUE sur `content_hash` : deux projets peuvent porter
		// le même hash, et `getTicketByHash` en renvoie un arbitrairement.
		const a = projet("a");
		const b = projet("b");
		saveTicket(a.id, "lodash", "SEC-1", ["CVE-2024-1"], "collision");
		saveTicket(b.id, "lodash", "SEC-2", ["CVE-2024-1"], "collision");

		expect(getTickets()).toHaveLength(2);
		expect(getTicketByHash("collision")).toBeDefined();
	});

	test("deleteTicket ne retire que le couple visé", () => {
		const p = projet();
		saveTicket(p.id, "lodash", "SEC-1", []);
		saveTicket(p.id, "axios", "SEC-2", []);
		deleteTicket(p.id, "lodash");
		expect(getTickets().map((t) => t.package)).toEqual(["axios"]);
	});

	test("deleteTicket est idempotent sur un couple inexistant", () => {
		const p = projet();
		expect(() => deleteTicket(p.id, "absent")).not.toThrow();
	});

	test("un ticket sur un projet inexistant lève sur la clé étrangère", () => {
		expect(() => saveTicket(999_999, "lodash", "SEC-1", [])).toThrow(
			/FOREIGN KEY/i,
		);
	});

	test("supprimer le projet supprime ses tickets en cascade", () => {
		const p = projet();
		saveTicket(p.id, "lodash", "SEC-1", []);
		getDb().query("DELETE FROM projects WHERE id = ?").run(p.id);
		expect(getTickets()).toEqual([]);
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

describe("contrats attendus — à activer au correctif", () => {
	useTempDb("tickets-contrats");

	// N41 — `content_hash` est le garde-fou anti-doublon de la création Jira. Deux
	// projets ne doivent pas pouvoir porter la même empreinte, sinon le message de
	// refus cite la référence d'un ticket appartenant à un autre projet.
	test.failing("le hash distingue deux projets (N41)", () => {
		const a = projet("a");
		const b = projet("b");
		saveTicket(a.id, "lodash", "SEC-1", ["CVE-2020-8203"], "collision");
		expect(() =>
			saveTicket(b.id, "lodash", "SEC-2", ["CVE-2020-8203"], "collision"),
		).toThrow(/UNIQUE/i);
	});
});
