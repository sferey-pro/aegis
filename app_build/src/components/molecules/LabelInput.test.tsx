import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import { LabelInput } from "./LabelInput";

describe("LabelInput", () => {
	test("associe le libellé au champ via l'id", () => {
		// L'association est la raison d'être de cette molécule : getByLabelText ne
		// trouve le champ que si htmlFor/id se correspondent.
		render(<LabelInput id="project-name" label="Nom du projet" />);
		expect(screen.getByLabelText("Nom du projet")).toHaveAttribute(
			"id",
			"project-name",
		);
	});

	test("remonte la saisie", () => {
		const saisies: string[] = [];
		render(
			<LabelInput
				id="p"
				label="Chemin"
				onChange={(e) => saisies.push(e.target.value)}
			/>,
		);
		fireEvent.change(screen.getByLabelText("Chemin"), {
			target: { value: "/srv/api" },
		});
		expect(saisies).toEqual(["/srv/api"]);
	});

	test("sans erreur, aucun message n'est affiché", () => {
		render(<LabelInput id="p" label="Chemin" />);
		expect(screen.queryByText(/requis/i)).not.toBeInTheDocument();
	});

	test("avec erreur, le message est affiché et le champ est marqué", () => {
		render(<LabelInput id="p" label="Chemin" error="Chemin requis" />);
		expect(screen.getByText("Chemin requis")).toBeInTheDocument();
		expect(screen.getByLabelText("Chemin")).toHaveClass("border-destructive");
	});

	test("transmet les attributs natifs au champ", () => {
		render(
			<LabelInput
				id="p"
				label="Jeton"
				type="password"
				required
				placeholder="…"
			/>,
		);
		const champ = screen.getByLabelText("Jeton");
		expect(champ).toHaveAttribute("type", "password");
		expect(champ).toBeRequired();
		expect(champ).toHaveAttribute("placeholder", "…");
	});
});
