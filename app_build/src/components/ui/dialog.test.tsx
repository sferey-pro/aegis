import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./dialog";

function Modale({ open }: { open?: boolean }) {
	return (
		<Dialog open={open}>
			<DialogTrigger>ouvrir</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Détails de la CVE</DialogTitle>
					<DialogDescription>Description</DialogDescription>
				</DialogHeader>
				corps
				<DialogFooter>pied</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

describe("Dialog", () => {
	test("fermée, le contenu n'est pas monté", () => {
		render(<Modale />);
		expect(screen.queryByText("Détails de la CVE")).not.toBeInTheDocument();
	});

	test("ouverte, elle expose le rôle dialog et son titre", () => {
		render(<Modale open />);
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Détails de la CVE" }),
		).toBeInTheDocument();
		expect(screen.getByText("corps")).toBeInTheDocument();
	});

	test("le déclencheur ouvre la modale", () => {
		render(<Modale />);
		fireEvent.click(screen.getByText("ouvrir"));
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	test("elle fournit un bouton de fermeture accessible", () => {
		render(<Modale open />);
		expect(
			screen.getByRole("button", { name: /close|fermer/i }),
		).toBeInTheDocument();
	});
});
