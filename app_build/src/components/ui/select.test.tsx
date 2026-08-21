import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./select";

function Outil({ open }: { open?: boolean }) {
	return (
		<Select defaultValue="npm" open={open}>
			<SelectTrigger id="project-tool" aria-label="Outil d'audit">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="npm">NPM</SelectItem>
				<SelectItem value="composer">Composer</SelectItem>
			</SelectContent>
		</Select>
	);
}

describe("Select", () => {
	test("le déclencheur est accessible et porte son id", () => {
		// L'id est ce qui permet au <label htmlFor> du formulaire projet de
		// s'associer au sélecteur.
		render(<Outil />);
		const trigger = screen.getByRole("combobox", { name: "Outil d'audit" });
		expect(trigger).toBeInTheDocument();
		expect(trigger).toHaveAttribute("id", "project-tool");
	});

	test("la valeur par défaut est affichée dans le déclencheur", () => {
		render(<Outil />);
		expect(screen.getByRole("combobox")).toHaveTextContent("NPM");
	});

	test("fermé, les options ne sont pas montées", () => {
		render(<Outil />);
		expect(screen.queryByRole("option")).not.toBeInTheDocument();
	});

	test("ouvert, les options sont exposées", () => {
		render(<Outil open />);
		expect(
			screen.getByRole("option", { name: "Composer" }),
		).toBeInTheDocument();
	});
});
