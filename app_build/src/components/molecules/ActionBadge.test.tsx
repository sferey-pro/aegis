import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import { ActionBadge } from "./ActionBadge";

describe("ActionBadge", () => {
	test("affiche son libellé", () => {
		render(<ActionBadge label="prod" />);
		expect(screen.getByText("prod")).toBeInTheDocument();
	});

	test("sans onDelete, aucun bouton de suppression n'est rendu", () => {
		render(<ActionBadge label="prod" />);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	test("avec onDelete, le bouton appelle le callback", () => {
		let appels = 0;
		render(<ActionBadge label="prod" onDelete={() => appels++} />);
		fireEvent.click(screen.getByRole("button"));
		expect(appels).toBe(1);
	});

	test("le bouton de suppression est de type button", () => {
		// Sans type explicite, un bouton dans un formulaire vaut « submit » et
		// soumet le formulaire au lieu de retirer le tag.
		render(<ActionBadge label="prod" onDelete={() => {}} />);
		expect(screen.getByRole("button")).toHaveAttribute("type", "button");
	});

	test("rend une pastille de couleur à côté du libellé", () => {
		// La couleur est appliquée en style inline via un `var()` imbriqué
		// (`var(--color-emerald-500, var(--emerald))`). happy-dom rejette cette
		// syntaxe et retire l'attribut `style` : impossible d'asserter la valeur
		// ici, alors qu'elle est valide en navigateur. On vérifie donc la présence
		// de la pastille, seule chose que cet environnement peut observer.
		const { container } = render(<ActionBadge label="x" color="emerald" />);
		expect(container.querySelector(".rounded-full.w-2\\.5")).not.toBeNull();
	});
});
