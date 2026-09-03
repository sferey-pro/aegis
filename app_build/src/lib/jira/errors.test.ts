import { describe, expect, test } from "bun:test";

import {
	AIDE_TYPE_DE_TICKET,
	formatJiraError,
	refusSurTypeDeTicket,
} from "./errors";

/** Corps réellement rendu par Jira sur un type de ticket inconnu. */
const REFUS_TYPE = JSON.stringify({
	errorMessages: [],
	errors: { issuetype: "Spécifiez un type de ticket valide" },
});

describe("lib/jira/errors — mise en forme", () => {
	test("le champ fautif est nommé, sans JSON", () => {
		// L'interface recevait le corps brut : le message utile y était noyé.
		const message = formatJiraError(400, REFUS_TYPE);
		expect(message).toContain("issuetype");
		expect(message).toContain("Spécifiez un type de ticket valide");
		expect(message).not.toContain("{");
		expect(message).not.toContain("errorMessages");
	});

	test("plusieurs champs sont tous rendus", () => {
		const corps = JSON.stringify({
			errors: { project: "Projet inconnu", summary: "Résumé requis" },
		});
		const message = formatJiraError(400, corps);
		expect(message).toContain("project : Projet inconnu");
		expect(message).toContain("summary : Résumé requis");
	});

	test("les messages généraux sont conservés", () => {
		const corps = JSON.stringify({
			errorMessages: ["Vous n'avez pas la permission de créer des tickets."],
		});
		expect(formatJiraError(403, corps)).toContain("permission");
	});

	test("un corps vide donne quand même le statut", () => {
		expect(formatJiraError(500, "")).toContain("500");
	});

	test("un corps non-JSON est gardé, mais tronqué", () => {
		// Une page d'erreur de proxy fait des kilo-octets : mieux vaut un extrait
		// qu'une page entière dans une notification.
		const html = `<html>${"x".repeat(5000)}</html>`;
		const message = formatJiraError(502, html);
		expect(message).toContain("502");
		expect(message.length).toBeLessThan(300);
	});

	test("un JSON sans les deux listes reste lisible", () => {
		expect(formatJiraError(400, JSON.stringify({ autre: 1 }))).toBe(
			"Jira a refusé la demande (400).",
		);
	});
});

describe("lib/jira/errors — refus sur le type de ticket", () => {
	test("il est reconnu", () => {
		expect(refusSurTypeDeTicket(REFUS_TYPE)).toBe(true);
	});

	test("un autre champ n'est pas confondu", () => {
		const corps = JSON.stringify({ errors: { project: "Projet inconnu" } });
		expect(refusSurTypeDeTicket(corps)).toBe(false);
	});

	test("un corps illisible ne déclenche pas l'aide", () => {
		expect(refusSurTypeDeTicket("pas du json")).toBe(false);
		expect(refusSurTypeDeTicket("")).toBe(false);
	});

	test("l'aide dit ce qu'il faut vérifier, et où", () => {
		// Jira dit seulement « Spécifiez un type valide » : rien qui indique que le
		// nom est traduit, ni où le changer.
		expect(AIDE_TYPE_DE_TICKET).toContain("localisé");
		expect(AIDE_TYPE_DE_TICKET).toContain("modale");
	});
});
