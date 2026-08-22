import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";

import { FullScreenOverlay } from "./FullScreenOverlay";

describe("FullScreenOverlay", () => {
	test("il monte son contenu sur le body, pas dans la page", () => {
		const { container } = render(
			<FullScreenOverlay>
				<p>Chargement</p>
			</FullScreenOverlay>,
		);

		expect(container.firstElementChild).toBeNull();
		expect(document.body.textContent).toContain("Chargement");
	});

	test("il passe devant l'en-tête fixe", () => {
		// L'en-tête est en `z-50`. Un voile au même niveau, rendu depuis une page,
		// laissait le menu net et lisible par-dessus : deux voiles identiques se
		// comportaient différemment selon l'endroit du déclenchement.
		render(
			<FullScreenOverlay>
				<span>x</span>
			</FullScreenOverlay>,
		);

		const overlay = document.querySelector(".fixed.inset-0") as HTMLElement;
		expect(overlay.className).toContain("z-[100]");
	});

	test("il assombrit et floute ce qu'il recouvre", () => {
		render(
			<FullScreenOverlay>
				<span>x</span>
			</FullScreenOverlay>,
		);

		const overlay = document.querySelector(".fixed.inset-0") as HTMLElement;
		expect(overlay.className).toContain("bg-black/80");
		expect(overlay.className).toContain("backdrop-blur-sm");
	});

	test("il se démonte sans laisser de nœud derrière lui", () => {
		const { unmount } = render(
			<FullScreenOverlay>
				<span>résiduel</span>
			</FullScreenOverlay>,
		);
		unmount();

		expect(document.querySelector(".fixed.inset-0")).toBeNull();
		expect(document.body.textContent).not.toContain("résiduel");
	});
});
