import { describe, expect, test } from "bun:test";

import { getDb } from "@/db";
import {
	forgetGitState,
	getGitState,
	getGitStates,
	saveGitState,
} from "@/db/git-state";
import { createProject } from "@/db/projects";
import { useTempDb } from "@/test/db";

const ETAT = {
	isRepo: true as const,
	branch: "main",
	sha: "a".repeat(40),
	upstream: "origin/main",
	ahead: 0,
	behind: 3,
	dirty: false,
};

function projet(nom = "api") {
	return createProject({
		name: nom,
		path: `/srv/${nom}`,
		type: "node" as const,
		tool: "npm" as const,
	});
}

describe("db/git-state", () => {
	useTempDb("git-state");

	test("un état jamais lu est absent, pas vide", () => {
		// « Jamais lu » et « pas un dépôt » sont deux choses différentes : les
		// confondre ferait afficher « Dépôt non-git » sur tout le parc.
		const p = projet();
		expect(getGitState(p.id)).toBeNull();
	});

	test("l'état enregistré est relu tel quel", () => {
		const p = projet();
		saveGitState(p.id, ETAT);
		expect(getGitState(p.id)?.git).toEqual(ETAT);
	});

	test("la date de la mesure est conservée", () => {
		// C'est elle qui rend la valeur honnête : sans date, un `dirty` de la
		// semaine dernière se lit comme la situation actuelle.
		const p = projet();
		saveGitState(p.id, ETAT);
		const checkedAt = getGitState(p.id)?.checkedAt;
		expect(checkedAt).toBeTruthy();
		expect(checkedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	});

	test("un second enregistrement remplace le premier", () => {
		const p = projet();
		saveGitState(p.id, ETAT);
		saveGitState(p.id, { ...ETAT, behind: 0, dirty: true });

		const relu = getGitState(p.id)?.git;
		expect(relu).toMatchObject({ behind: 0, dirty: true });
		// Une seule ligne par projet : la clé primaire l'impose.
		expect(
			getDb().query("SELECT COUNT(*) c FROM git_states").get() as { c: number },
		).toEqual({ c: 1 });
	});

	test("la date est rafraîchie à la réécriture", () => {
		const p = projet();
		saveGitState(p.id, ETAT);
		getDb()
			.query("UPDATE git_states SET checked_at = '2020-01-01 00:00:00'")
			.run();

		saveGitState(p.id, ETAT);
		expect(getGitState(p.id)?.checkedAt).not.toBe("2020-01-01 00:00:00");
	});

	test("un état « pas un dépôt » est une valeur, pas une absence", () => {
		const p = projet();
		saveGitState(p.id, { isRepo: false });
		expect(getGitState(p.id)?.git).toEqual({ isRepo: false });
	});

	test("la lecture groupée rend les états connus, indexés", () => {
		const a = projet("a");
		const b = projet("b");
		const c = projet("c");
		saveGitState(a.id, ETAT);
		saveGitState(c.id, { ...ETAT, behind: 9 });

		const etats = getGitStates([a.id, b.id, c.id]);
		expect(Object.keys(etats)).toHaveLength(2);
		expect(etats[a.id]?.git).toEqual(ETAT);
		expect(etats[c.id]?.git).toMatchObject({ behind: 9 });
		// Un projet sans état ne doit pas apparaître avec une valeur inventée.
		expect(etats[b.id]).toBeUndefined();
	});

	test("la lecture groupée d'une liste vide n'interroge pas la base", () => {
		// `IN ()` est une erreur de syntaxe SQL : le cas doit être court-circuité.
		expect(getGitStates([])).toEqual({});
	});

	test("supprimer le projet supprime son état", () => {
		// Cascade : sans elle, la table accumulerait des lignes orphelines qu'un
		// nouveau projet réutiliserait par collision d'identifiant.
		const p = projet();
		saveGitState(p.id, ETAT);
		getDb().query("DELETE FROM projects WHERE id = ?").run(p.id);
		expect(getGitState(p.id)).toBeNull();
	});

	test("forgetGitState oublie un seul projet", () => {
		const a = projet("a");
		const b = projet("b");
		saveGitState(a.id, ETAT);
		saveGitState(b.id, ETAT);

		forgetGitState(a.id);
		expect(getGitState(a.id)).toBeNull();
		expect(getGitState(b.id)).not.toBeNull();
	});
});
