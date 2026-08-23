import { describe, expect, test } from "bun:test";

import { type ResultatAudit, trierResultats } from "./useGlobalAudit";

function resultat(
	nom: string,
	over: Partial<ResultatAudit> = {},
): ResultatAudit {
	return {
		project: { id: 1, name: nom },
		reponse: null,
		erreur: null,
		annule: false,
		...over,
	};
}

/** Résultat sain portant `n` nouvelles CVE. */
function avecNouvelles(nom: string, n: number): ResultatAudit {
	return resultat(nom, {
		reponse: {
			success: true,
			newCves: Array.from({ length: n }, (_, i) => ({
				ref: `CVE-2024-${i}`,
				package: "lodash",
				severity: "high" as const,
			})),
		},
	});
}

describe("trierResultats", () => {
	test("les erreurs passent devant", () => {
		// §2 : « triés erreurs d'abord puis projets avec le plus de nouvelles CVE ».
		// Le tri était simplement absent, et `newCves` — calculé par le serveur —
		// n'était jamais lu.
		const tries = trierResultats([
			avecNouvelles("sain", 5),
			resultat("casse", { erreur: "ENOENT" }),
		]);
		expect(tries.map((r) => r.project.name)).toEqual(["casse", "sain"]);
	});

	test("une erreur passe devant même sans nouvelles CVE", () => {
		const tries = trierResultats([
			avecNouvelles("beaucoup", 12),
			resultat("vide", { erreur: "boom" }),
		]);
		expect(tries[0]?.project.name).toBe("vide");
	});

	test("à égalité d'état, le plus de nouvelles CVE d'abord", () => {
		const tries = trierResultats([
			avecNouvelles("peu", 1),
			avecNouvelles("beaucoup", 9),
			avecNouvelles("moyen", 4),
		]);
		expect(tries.map((r) => r.project.name)).toEqual([
			"beaucoup",
			"moyen",
			"peu",
		]);
	});

	test("les erreurs entre elles gardent l'ordre des nouvelles CVE", () => {
		const tries = trierResultats([
			resultat("err-a", { erreur: "x" }),
			resultat("err-b", {
				erreur: "y",
				reponse: {
					success: false,
					newCves: [{ ref: "CVE-1", package: "p", severity: "high" }],
				},
			}),
		]);
		expect(tries[0]?.project.name).toBe("err-b");
	});

	test("un projet sans newCves compte pour zéro", () => {
		// Un serveur plus ancien peut ne pas renvoyer le champ : l'absence ne doit
		// pas faire remonter le projet artificiellement.
		const tries = trierResultats([
			resultat("sans-champ", { reponse: { success: true } }),
			avecNouvelles("avec", 1),
		]);
		expect(tries[0]?.project.name).toBe("avec");
	});

	test("le tri est stable et déterministe", () => {
		// Deux lots identiques doivent rendre le même ordre, sinon le compte-rendu
		// change d'aspect sans raison.
		const entree = [
			avecNouvelles("bravo", 2),
			avecNouvelles("alpha", 2),
			avecNouvelles("charlie", 2),
		];
		expect(trierResultats(entree).map((r) => r.project.name)).toEqual([
			"alpha",
			"bravo",
			"charlie",
		]);
	});

	test("l'entrée n'est pas modifiée", () => {
		const entree = [avecNouvelles("a", 1), resultat("b", { erreur: "x" })];
		trierResultats(entree);
		expect(entree.map((r) => r.project.name)).toEqual(["a", "b"]);
	});

	test("une liste vide reste vide", () => {
		expect(trierResultats([])).toEqual([]);
	});
});
