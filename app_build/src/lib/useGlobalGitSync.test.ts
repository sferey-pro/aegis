import { describe, expect, test } from "bun:test";

import type { GitInfo } from "@/lib/git";
import {
	type GitSyncOutcome,
	type GitSyncResponse,
	sortGitOutcomes,
} from "./useGlobalGitSync";

function git(over: Partial<GitInfo> = {}): GitInfo {
	return {
		isRepo: true,
		branch: "main",
		sha: "a".repeat(40),
		upstream: "origin/main",
		ahead: 0,
		behind: 0,
		dirty: false,
		...over,
	};
}

function sortie(
	nom: string,
	over: Partial<GitSyncOutcome> = {},
): GitSyncOutcome {
	return {
		project: { id: 1, name: nom },
		value: null,
		error: null,
		cancelled: false,
		...over,
	};
}

/** Dépôt synchronisé, avec `n` commits de retard après le fetch. */
function enRetard(nom: string, n: number): GitSyncOutcome {
	const value: GitSyncResponse = {
		ok: true,
		log: "= [up to date]",
		git: git({ behind: n }),
	};
	return sortie(nom, { value });
}

describe("sortGitOutcomes", () => {
	test("les échecs passent devant", () => {
		// Même règle que le compte-rendu d'audit (§2) : ce qui a échoué se lit en
		// premier, sinon il se perd au milieu de quinze lignes vertes.
		const tries = sortGitOutcomes([
			enRetard("sain", 9),
			sortie("casse", { error: "Permission denied (publickey)" }),
		]);
		expect(tries.map((r) => r.project.name)).toEqual(["casse", "sain"]);
	});

	test("un échec passe devant même sans retard mesuré", () => {
		const tries = sortGitOutcomes([
			enRetard("beaucoup", 12),
			sortie("injoignable", { error: "host unreachable" }),
		]);
		expect(tries[0]?.project.name).toBe("injoignable");
	});

	test("à égalité d'état, le plus de commits de retard d'abord", () => {
		// `behind` est à la synchro ce que `newCves` est à l'audit : ce qui demande
		// une action.
		const tries = sortGitOutcomes([
			enRetard("peu", 1),
			enRetard("beaucoup", 30),
			enRetard("moyen", 4),
		]);
		expect(tries.map((r) => r.project.name)).toEqual([
			"beaucoup",
			"moyen",
			"peu",
		]);
	});

	test("un dépôt déjà à jour passe derrière", () => {
		const tries = sortGitOutcomes([
			enRetard("ajour", 0),
			enRetard("retard", 2),
		]);
		expect(tries.map((r) => r.project.name)).toEqual(["retard", "ajour"]);
	});

	test("à égalité complète, le nom départage", () => {
		// Départage stable : deux lots identiques doivent rendre le même ordre,
		// sinon la liste des échecs danse d'une exécution à l'autre.
		const tries = sortGitOutcomes([
			enRetard("zeta", 3),
			enRetard("alpha", 3),
			enRetard("mu", 3),
		]);
		expect(tries.map((r) => r.project.name)).toEqual(["alpha", "mu", "zeta"]);
	});

	test("les annulés ne remontent pas devant les échecs", () => {
		// Annulé n'est pas un échec du dépôt : c'est l'utilisateur qui a arrêté.
		const tries = sortGitOutcomes([
			sortie("annule", { cancelled: true }),
			sortie("casse", { error: "boom" }),
			enRetard("retard", 5),
		]);
		expect(tries.map((r) => r.project.name)).toEqual([
			"casse",
			"retard",
			"annule",
		]);
	});

	test("le tri ne modifie pas le tableau reçu", () => {
		const source = [enRetard("a", 1), enRetard("b", 9)];
		sortGitOutcomes(source);
		expect(source.map((r) => r.project.name)).toEqual(["a", "b"]);
	});
});
