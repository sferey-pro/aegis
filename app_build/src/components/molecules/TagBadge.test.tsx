import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

import { TagBadge } from "./TagBadge";

describe("TagBadge", () => {
	test("il affiche le nom du tag", () => {
		render(<TagBadge name="production" color="emerald" />);
		expect(screen.getByText("production")).toBeInTheDocument();
	});

	test("il rend une pastille à côté du libellé", () => {
		// La couleur est appliquée en style inline via un `var()` imbriqué, syntaxe
		// que happy-dom refuse en retirant l'attribut `style` : on ne peut donc
		// asserter que la présence de la pastille, pas sa teinte.
		const { container } = render(<TagBadge name="prod" color="emerald" />);
		expect(container.querySelector(".rounded-full.w-2")).not.toBeNull();
	});

	test("sans couleur connue, la pastille reste présente", () => {
		// Un tag supprimé de la table des tags, ou dont la couleur n'est plus dans
		// la palette, ne doit pas perdre sa pastille : le badge garderait alors une
		// forme différente des autres sur le même écran.
		const { container } = render(<TagBadge name="orphelin" />);
		expect(container.querySelector(".rounded-full.w-2")).not.toBeNull();
	});

	test("la pastille est décorative pour les lecteurs d'écran", () => {
		const { container } = render(<TagBadge name="prod" color="emerald" />);
		expect(container.querySelector(".rounded-full.w-2")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});
});
