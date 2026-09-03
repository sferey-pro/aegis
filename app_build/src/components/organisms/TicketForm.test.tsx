import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import { TicketForm } from "./TicketForm";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function props(over: Partial<Parameters<typeof TicketForm>[0]> = {}) {
	return {
		types: ["Tâche", "Bug"],
		typesUnavailable: null,
		issueType: "Tâche",
		onIssueTypeChange: () => {},
		notes: "",
		onNotesChange: () => {},
		markdown: "# Brouillon",
		copied: false,
		onCopy: () => {},
		creating: false,
		canCreate: true,
		onCreate: () => {},
		selectedCount: 2,
		...over,
	};
}

describe("TicketForm", () => {
	test("la liste des types vient de Jira et affiche le type courant", () => {
		render(<TicketForm {...props()} />);
		expect(
			screen.getByRole("combobox", { name: "Type de ticket" }),
		).toHaveTextContent("Tâche");
		expect(screen.queryAllByPlaceholderText(/Nom exact du type/)).toHaveLength(
			0,
		);
	});

	test("liste indisponible : saisie libre, avec le motif", () => {
		const saisis: string[] = [];
		render(
			<TicketForm
				{...props({
					types: [],
					typesUnavailable: "Configuration Jira incomplète.",
					issueType: "",
					onIssueTypeChange: (v) => saisis.push(v),
				})}
			/>,
		);
		const champ = screen.getByLabelText("Type de ticket");
		expect(champ).toHaveAttribute(
			"placeholder",
			"Nom exact du type, ex. Tâche",
		);
		expect(
			screen.getByText(
				/Liste non lue depuis Jira — Configuration Jira incomplète\./,
			),
		).toBeInTheDocument();
		fireEvent.change(champ, { target: { value: "Tâche" } });
		expect(saisis).toEqual(["Tâche"]);
	});

	test("les notes remontent au parent", () => {
		const notes: string[] = [];
		render(<TicketForm {...props({ onNotesChange: (v) => notes.push(v) })} />);
		fireEvent.change(screen.getByLabelText(/Notes additionnelles/), {
			target: { value: "Exposé publiquement" },
		});
		expect(notes).toEqual(["Exposé publiquement"]);
	});

	test("l'aperçu affiche le Markdown, ou dit pourquoi il manque", () => {
		const { rerender } = render(<TicketForm {...props()} />);
		expect(screen.getByText("# Brouillon")).toBeInTheDocument();
		rerender(<TicketForm {...props({ markdown: "", selectedCount: 0 })} />);
		expect(
			screen.getByText("Sélectionnez au moins une CVE."),
		).toBeInTheDocument();
		rerender(<TicketForm {...props({ markdown: "", selectedCount: 1 })} />);
		expect(screen.getByText("Génération de l'aperçu…")).toBeInTheDocument();
	});

	test("créer est inactif quand le parent le dit, et actif sinon", () => {
		let crees = 0;
		const { rerender } = render(
			<TicketForm {...props({ canCreate: false, onCreate: () => crees++ })} />,
		);
		const bouton = screen.getByRole("button", { name: /Créer dans Jira/ });
		expect(bouton).toBeDisabled();
		fireEvent.click(bouton);
		expect(crees).toBe(0);
		rerender(
			<TicketForm {...props({ canCreate: true, onCreate: () => crees++ })} />,
		);
		fireEvent.click(screen.getByRole("button", { name: /Créer dans Jira/ }));
		expect(crees).toBe(1);
	});

	test("copier est inactif sans aperçu, et confirme la copie", () => {
		let copies = 0;
		const { rerender } = render(
			<TicketForm {...props({ markdown: "", onCopy: () => copies++ })} />,
		);
		expect(screen.getByRole("button", { name: /Copier/ })).toBeDisabled();
		rerender(<TicketForm {...props({ onCopy: () => copies++ })} />);
		fireEvent.click(screen.getByRole("button", { name: /Copier/ }));
		expect(copies).toBe(1);
		rerender(<TicketForm {...props({ copied: true })} />);
		expect(screen.getByRole("button", { name: /Copié/ })).toBeInTheDocument();
	});
});
