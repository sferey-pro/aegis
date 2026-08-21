import { describe, expect, test } from "bun:test";

import { useTempDb } from "@/test/db";
import {
	getAllSettings,
	getSetting,
	setAllSettings,
	setSetting,
} from "./settings";

describe("db/settings", () => {
	useTempDb("settings");

	test("une clé absente renvoie la chaîne vide par défaut", () => {
		expect(getSetting("github_token")).toBe("");
	});

	test("une clé absente renvoie la valeur de repli fournie", () => {
		// Le code appelant s'appuie sur ce repli pour les durées de cache : un
		// `undefined` remonterait jusqu'à un `parseInt(undefined)`.
		expect(getSetting("cache_ttl", "3600")).toBe("3600");
	});

	test("setSetting puis getSetting fait l'aller-retour", () => {
		setSetting("jira_url", "https://jira.example.com");
		expect(getSetting("jira_url")).toBe("https://jira.example.com");
	});

	test("réécrire une clé met à jour au lieu d'insérer", () => {
		setSetting("theme", "dark");
		setSetting("theme", "light");
		expect(getSetting("theme")).toBe("light");
		expect(Object.keys(getAllSettings())).toHaveLength(1);
	});

	test("une valeur vide est stockée, pas traitée comme absente", () => {
		// Vider un token est une action volontaire : elle doit persister.
		setSetting("github_token", "ghp_x");
		setSetting("github_token", "");
		expect(getSetting("github_token", "repli")).toBe("");
	});

	test("getAllSettings renvoie un objet vide sur une base neuve", () => {
		expect(getAllSettings()).toEqual({});
	});

	test("getAllSettings renvoie toutes les paires", () => {
		setSetting("a", "1");
		setSetting("b", "2");
		expect(getAllSettings()).toEqual({ a: "1", b: "2" });
	});

	test("setAllSettings écrit tout le lot", () => {
		setAllSettings({ github_token: "t", jira_url: "u", audit_timeout: "120" });
		expect(getAllSettings()).toEqual({
			github_token: "t",
			jira_url: "u",
			audit_timeout: "120",
		});
	});

	test("setAllSettings fusionne : les clés absentes du lot survivent", () => {
		// L'écran Réglages n'envoie que la section modifiée ; un remplacement
		// intégral effacerait le token en enregistrant une autre section.
		setSetting("github_token", "conserve-moi");
		setAllSettings({ jira_url: "u" });
		expect(getSetting("github_token")).toBe("conserve-moi");
	});

	test("setAllSettings ignore null et undefined sans effacer l'existant", () => {
		setSetting("github_token", "ghp_x");
		setAllSettings({
			github_token: undefined as unknown as string,
			jira_url: null as unknown as string,
		});
		expect(getSetting("github_token")).toBe("ghp_x");
		expect(getSetting("jira_url")).toBe("");
	});

	test("setAllSettings coerce les valeurs non textuelles", () => {
		// Le corps JSON peut porter un nombre ou un booléen ; la colonne est TEXT.
		setAllSettings({
			audit_timeout: 120 as unknown as string,
			ai_enabled: true as unknown as string,
		});
		expect(getSetting("audit_timeout")).toBe("120");
		expect(getSetting("ai_enabled")).toBe("true");
	});

	test("setAllSettings sur un objet vide ne lève pas", () => {
		expect(() => setAllSettings({})).not.toThrow();
		expect(getAllSettings()).toEqual({});
	});

	test("setAllSettings est transactionnel : rien n'est écrit si un item échoue", () => {
		// La transaction protège l'écran Réglages d'un enregistrement à moitié
		// appliqué. `toString` sur un objet sans prototype lève dans la boucle.
		setSetting("existant", "1");
		const piege = Object.create(null) as string;
		expect(() => setAllSettings({ ok: "2", casse: piege })).toThrow();
		expect(getSetting("ok")).toBe("");
		expect(getSetting("existant")).toBe("1");
	});
});
