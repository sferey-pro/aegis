import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function Onglets() {
	return (
		<Tabs defaultValue="tous">
			<TabsList>
				<TabsTrigger value="tous">Tous</TabsTrigger>
				<TabsTrigger value="erreurs">Erreurs</TabsTrigger>
			</TabsList>
			<TabsContent value="tous">contenu tous</TabsContent>
			<TabsContent value="erreurs">contenu erreurs</TabsContent>
		</Tabs>
	);
}

describe("Tabs", () => {
	test("expose les rôles tablist et tab", () => {
		render(<Onglets />);
		expect(screen.getByRole("tablist")).toBeInTheDocument();
		expect(screen.getAllByRole("tab")).toHaveLength(2);
	});

	test("affiche le panneau par défaut et masque l'autre", () => {
		render(<Onglets />);
		expect(screen.getByText("contenu tous")).toBeInTheDocument();
		expect(screen.queryByText("contenu erreurs")).not.toBeInTheDocument();
	});

	test("changer d'onglet change le panneau affiché", () => {
		render(<Onglets />);
		// Radix active l'onglet au `mouseDown`/`focus`, pas au `click` : son mode
		// d'activation par défaut est « automatique » (bascule dès le focus).
		// Un `fireEvent.click` seul ne change rien.
		fireEvent.mouseDown(screen.getByRole("tab", { name: "Erreurs" }));
		expect(screen.getByText("contenu erreurs")).toBeInTheDocument();
		expect(screen.queryByText("contenu tous")).not.toBeInTheDocument();
	});

	test("l'onglet actif est marqué comme sélectionné", () => {
		render(<Onglets />);
		expect(screen.getByRole("tab", { name: "Tous" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});
});
