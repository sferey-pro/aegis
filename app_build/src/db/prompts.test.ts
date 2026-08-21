import { describe, expect, test } from "bun:test";

import { useTempDb } from "@/test/db";
import { getDb } from "./index";
import {
	createPrompt,
	deletePrompt,
	listPrompts,
	updatePrompt,
} from "./prompts";

describe("db/prompts", () => {
	useTempDb("prompts");

	test("une base neuve n'a aucun prompt", () => {
		expect(listPrompts()).toEqual([]);
	});

	test("createPrompt retourne la ligne créée, tags désérialisés", () => {
		const p = createPrompt("Analyse CVE", "Explique {cve}", ["sécurité", "ia"]);
		expect(p.id).toBeGreaterThan(0);
		expect(p.title).toBe("Analyse CVE");
		expect(p.body).toBe("Explique {cve}");
		expect(p.tags).toEqual(["sécurité", "ia"]);
	});

	test("les tags sont stockés en JSON, pas en objet", () => {
		const p = createPrompt("t", "b", ["a"]);
		const brut = getDb()
			.query("SELECT tags FROM prompts WHERE id = ?")
			.get(p.id) as { tags: string };
		expect(brut.tags).toBe('["a"]');
	});

	test("un prompt sans tags a un tableau vide, jamais null", () => {
		expect(createPrompt("t", "b").tags).toEqual([]);
	});

	test("un corps multi-ligne est conservé à l'identique", () => {
		// Les prompts sont des gabarits collés dans un LLM : perdre les sauts de
		// ligne changerait la sortie.
		const corps = "Contexte :\n- {package}\n- {cve}\n\nQuestion : patcher ?";
		expect(createPrompt("t", corps).body).toBe(corps);
	});

	test("deux prompts peuvent porter le même titre", () => {
		// Pas de contrainte d'unicité : c'est un bloc-notes, pas un référentiel.
		createPrompt("Doublon", "a");
		createPrompt("Doublon", "b");
		expect(listPrompts()).toHaveLength(2);
	});

	test("listPrompts trie par titre croissant", () => {
		createPrompt("Zèbre", "z");
		createPrompt("Alpha", "a");
		createPrompt("Mid", "m");
		expect(listPrompts().map((p) => p.title)).toEqual([
			"Alpha",
			"Mid",
			"Zèbre",
		]);
	});

	test("updatePrompt remplace les trois champs", () => {
		const p = createPrompt("avant", "corps", ["vieux"]);
		const apres = updatePrompt(p.id, "après", "nouveau corps", ["neuf"]);
		expect(apres.id).toBe(p.id);
		expect(apres.title).toBe("après");
		expect(apres.body).toBe("nouveau corps");
		expect(apres.tags).toEqual(["neuf"]);
	});

	test("updatePrompt écrase les tags au lieu de les fusionner", () => {
		const p = createPrompt("t", "b", ["a", "b"]);
		expect(updatePrompt(p.id, "t", "b", []).tags).toEqual([]);
	});

	test("updatePrompt sur un id inconnu lève", () => {
		expect(() => updatePrompt(999_999, "t", "b", [])).toThrow(
			"Prompt not found",
		);
	});

	test("deletePrompt retire la ligne et n'affecte pas les autres", () => {
		const a = createPrompt("a", "a");
		const b = createPrompt("b", "b");
		deletePrompt(a.id);
		expect(listPrompts().map((p) => p.id)).toEqual([b.id]);
	});

	test("deletePrompt est idempotent sur un id inexistant", () => {
		expect(() => deletePrompt(999_999)).not.toThrow();
	});
});
