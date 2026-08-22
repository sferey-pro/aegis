import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

import { ShieldLoader } from "./ShieldLoader";

/** ⚠️ Assertions négatives : `toHaveLength(0)` sur un `queryAll`. */

describe("ShieldLoader", () => {
	test("s'annonce comme un état d'attente aux lecteurs d'écran", () => {
		// Une attente muette laisse croire à un écran figé.
		render(<ShieldLoader />);
		expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
	});

	test("sans message, seul le bouclier est rendu", () => {
		render(<ShieldLoader />);
		expect(screen.getByRole("status").textContent).toBe("");
	});

	test("le message est affiché quand il est fourni", () => {
		render(<ShieldLoader message="Lecture du parc…" />);
		expect(screen.getByText("Lecture du parc…")).toBeInTheDocument();
	});

	test("l'anneau tourne, dans les deux tailles", () => {
		// `animate-spin` avait disparu de plusieurs indicateurs du projet (N27) :
		// l'icône restait figée et l'écran paraissait planté.
		const { container, rerender } = render(<ShieldLoader />);
		expect(container.querySelector(".animate-spin")).not.toBeNull();
		rerender(<ShieldLoader size="lg" />);
		expect(container.querySelector(".animate-spin")).not.toBeNull();
	});

	test("la taille change le gabarit du bouclier", () => {
		const petit = render(<ShieldLoader />);
		expect(petit.container.querySelector(".w-14")).not.toBeNull();
		petit.unmount();

		const grand = render(<ShieldLoader size="lg" />);
		expect(grand.container.querySelector(".w-24")).not.toBeNull();
	});

	test("la classe fournie est fusionnée, pas remplacée", () => {
		render(<ShieldLoader className="p-12" />);
		const racine = screen.getByRole("status");
		expect(racine.className).toContain("p-12");
		expect(racine.className).toContain("flex-col");
	});
});
