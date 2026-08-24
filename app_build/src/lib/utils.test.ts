import { describe, expect, test } from "bun:test";

import { cn, errorMessage, relativeAge } from "./utils";

describe("lib/utils — cn", () => {
	test("concatène les classes", () => {
		expect(cn("px-2", "py-1")).toBe("px-2 py-1");
	});

	test("ignore les valeurs falsy", () => {
		// C'est le cas d'usage principal : `cn("base", actif && "ring-2")`.
		expect(cn("base", false, null, undefined, "")).toBe("base");
	});

	test("la dernière classe Tailwind conflictuelle gagne", () => {
		// Sans tailwind-merge, les deux classes coexisteraient et l'ordre du CSS
		// généré, pas celui de l'appel, déciderait — d'où des surcharges de props
		// silencieusement inopérantes.
		expect(cn("px-2", "px-4")).toBe("px-4");
		expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
	});

	test("les classes non conflictuelles sont toutes conservées", () => {
		expect(cn("px-2", "text-sm", "font-bold")).toBe("px-2 text-sm font-bold");
	});

	test("accepte tableaux et objets conditionnels", () => {
		expect(cn(["p-2", "gap-2"], { hidden: false, "text-sm": true })).toBe(
			"p-2 gap-2 text-sm",
		);
	});

	test("flex et block sont vus comme conflictuels : le dernier gagne", () => {
		// Les deux sont des utilitaires `display`. Un composant qui passe `block`
		// en surcharge écrase donc bien le `flex` de base, sans classe orpheline.
		expect(cn("flex", "block")).toBe("block");
	});

	test("sans argument renvoie une chaîne vide", () => {
		expect(cn()).toBe("");
	});

	test("les variantes d'état sont distinctes de la classe de base", () => {
		expect(cn("bg-white", "hover:bg-slate-100")).toBe(
			"bg-white hover:bg-slate-100",
		);
	});
});

describe("lib/utils — errorMessage", () => {
	test("extrait le message d'une Error", () => {
		expect(errorMessage(new Error("échec du parseur"))).toBe(
			"échec du parseur",
		);
	});

	test("gère les sous-classes d'Error", () => {
		expect(errorMessage(new TypeError("mauvais type"))).toBe("mauvais type");
	});

	test("laisse passer une chaîne telle quelle", () => {
		// `Bun.spawn` et les rejets de promesses remontent parfois une chaîne nue.
		expect(errorMessage("commande introuvable")).toBe("commande introuvable");
	});

	test("renvoie le repli par défaut pour une valeur non exploitable", () => {
		expect(errorMessage(undefined)).toBe("Erreur inconnue");
		expect(errorMessage(null)).toBe("Erreur inconnue");
		expect(errorMessage(42)).toBe("Erreur inconnue");
		expect(errorMessage({ code: "ENOENT" })).toBe("Erreur inconnue");
	});

	test("le repli est paramétrable par l'appelant", () => {
		expect(errorMessage(null, "Audit échoué")).toBe("Audit échoué");
	});

	test("une Error au message vide renvoie la chaîne vide, pas le repli", () => {
		// Une Error est reconnue comme telle : son message, même vide, est la
		// vérité. Retomber sur le repli masquerait une erreur mal construite.
		expect(errorMessage(new Error(""))).toBe("");
	});
});

describe("relativeAge", () => {
	const T = Date.parse("2026-08-24T12:00:00Z");

	test("une mesure de la minute est « à l'instant »", () => {
		expect(relativeAge("2026-08-24 11:59:30", T)).toBe("à l'instant");
	});

	test("les minutes, puis les heures, puis les jours", () => {
		expect(relativeAge("2026-08-24 11:20:00", T)).toBe("il y a 40 min");
		expect(relativeAge("2026-08-24 09:00:00", T)).toBe("il y a 3 h");
		expect(relativeAge("2026-08-22 12:00:00", T)).toBe("il y a 2 j");
	});

	test("un horodatage SQLite est lu en UTC, pas en heure locale", () => {
		// `CURRENT_TIMESTAMP` n'a pas de fuseau : sans le `Z` ajouté, le navigateur
		// l'interprète en local et une mesure fraîche s'affiche « il y a 2 h ».
		expect(relativeAge("2026-08-24 12:00:00", T)).toBe("à l'instant");
	});

	test("une date ISO complète est acceptée telle quelle", () => {
		expect(relativeAge("2026-08-24T09:00:00Z", T)).toBe("il y a 3 h");
	});

	test("un futur proche ne produit pas d'âge négatif", () => {
		// Une horloge décalée ferait douter de la donnée plutôt que de l'horloge.
		expect(relativeAge("2026-08-24 12:05:00", T)).toBe("à l'instant");
	});

	test("une date illisible le dit", () => {
		expect(relativeAge("pas une date", T)).toBe("date inconnue");
	});
});
