import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Input } from "./input";
import { Label } from "./label";

describe("Label", () => {
	test("porte data-slot=label", () => {
		render(<Label>Nom du projet</Label>);
		expect(screen.getByText("Nom du projet")).toHaveAttribute(
			"data-slot",
			"label",
		);
	});

	test("htmlFor associe le label à son contrôle", () => {
		render(
			<>
				<Label htmlFor="project-name">Nom du projet</Label>
				<Input id="project-name" />
			</>,
		);
		// getByLabelText ne trouve le champ que si l'association est effective.
		expect(screen.getByLabelText("Nom du projet")).toHaveAttribute(
			"id",
			"project-name",
		);
	});

	test("fusionne la className fournie", () => {
		render(<Label className="ma-classe">x</Label>);
		expect(screen.getByText("x")).toHaveClass("ma-classe");
	});
});
