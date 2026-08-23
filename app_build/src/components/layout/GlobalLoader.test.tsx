import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

import { GlobalLoader } from "./GlobalLoader";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function props(over: Partial<Parameters<typeof GlobalLoader>[0]> = {}) {
	return {
		loading: false,
		loadingMessage: "Connexion à la base de données...",
		...over,
	};
}

describe("GlobalLoader", () => {
	test("au repos, il ne rend rien", () => {
		const { container } = render(<GlobalLoader {...props()} />);
		expect(container.firstElementChild).toBeNull();
	});

	test("en chargement, il affiche le message fourni", () => {
		render(<GlobalLoader {...props({ loading: true })} />);
		expect(
			screen.getByText("Connexion à la base de données..."),
		).toBeInTheDocument();
	});

	test("il ne couvre plus l'écran pendant un audit (N8)", () => {
		// Le voile couvrait aussi « Tout auditer » : pendant plusieurs minutes,
		// l'application entière était floutée et non cliquable — console live
		// comprise, alors que c'est le seul endroit où l'on voit les commandes
		// d'audit tourner et échouer. L'audit a désormais sa barre non modale.
		const { container } = render(<GlobalLoader {...props()} />);
		expect(container.firstElementChild).toBeNull();
		expect(document.querySelector(".fixed.inset-0")).toBeNull();
	});

	test("il n'annonce plus d'étapes imaginaires (N8)", () => {
		// Un tableau de messages tournait toutes les 800 ms — « Recherche GHSA »,
		// « Calcul de la criticité » — alors que §2 interdit tout appel GitHub
		// pendant un audit : aucun de ces libellés ne décrivait un travail réel.
		render(<GlobalLoader {...props({ loading: true })} />);
		for (const imaginaire of [
			/Recherche GHSA/,
			/Calcul de la criticité/,
			/Génération des patchs/,
		]) {
			expect(screen.queryAllByText(imaginaire)).toHaveLength(0);
		}
	});

	test("il couvre l'écran, hors de l'arbre de la page", () => {
		const { container } = render(
			<GlobalLoader {...props({ loading: true })} />,
		);

		// Le voile passe par un portail : rien ne reste dans le conteneur de la
		// page. C'est ce qui le fait passer devant l'en-tête fixe, y compris quand
		// le conteneur d'application applique un `opacity`/`blur` qui l'aurait
		// enfermé dans un contexte d'empilement.
		expect(container.firstElementChild).toBeNull();

		const overlay = document.querySelector(".fixed.inset-0") as HTMLElement;
		expect(overlay).not.toBeNull();
		expect(overlay.className).toContain("z-[100]");
	});
});
