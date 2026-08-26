import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import { SettingsSection } from "./SettingsSection";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function props(over: Partial<Parameters<typeof SettingsSection>[0]> = {}) {
	return {
		titre: "les paramètres d'audit",
		children: <input aria-label="un champ" />,
		modifie: false,
		enregistrement: false,
		succes: false,
		erreur: null,
		onSave: () => {},
		...over,
	};
}

describe("SettingsSection", () => {
	test("le bouton porte le nom de la section", () => {
		// Avec quatre boutons nommés « Enregistrer », ni un lecteur d'écran ni un
		// test ne peut désigner le bon.
		render(<SettingsSection {...props()} />);
		expect(
			screen.getByLabelText("Enregistrer les paramètres d'audit"),
		).toBeInTheDocument();
	});

	test("sans modification, le bouton est inactif", () => {
		render(<SettingsSection {...props({ modifie: false })} />);
		expect(
			screen.getByLabelText("Enregistrer les paramètres d'audit"),
		).toBeDisabled();
	});

	test("une modification active le bouton et se signale", () => {
		render(<SettingsSection {...props({ modifie: true })} />);
		expect(
			screen.getByLabelText("Enregistrer les paramètres d'audit"),
		).toBeEnabled();
		expect(
			screen.getByText("Modifications non enregistrées."),
		).toBeInTheDocument();
	});

	test("le clic déclenche l'enregistrement de cette section", () => {
		let appels = 0;
		render(
			<SettingsSection {...props({ modifie: true, onSave: () => appels++ })} />,
		);
		fireEvent.click(
			screen.getByLabelText("Enregistrer les paramètres d'audit"),
		);
		expect(appels).toBe(1);
	});

	test("pendant l'enregistrement, le bouton est inactif", () => {
		// Sans cela, deux clics rapides envoient deux fois la même charge.
		render(
			<SettingsSection {...props({ modifie: true, enregistrement: true })} />,
		);
		expect(
			screen.getByLabelText("Enregistrer les paramètres d'audit"),
		).toBeDisabled();
	});

	test("l'échec s'affiche dans la section, en alerte", () => {
		// Un message global ne disait pas quelle partie du formulaire avait échoué.
		render(
			<SettingsSection
				{...props({ modifie: true, erreur: "Durée invalide" })}
			/>,
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/Durée invalide/);
	});

	test("un échec masque le message de modification", () => {
		// Les deux ensemble se contrediraient : « non enregistré » et « échec » disent
		// la même chose, l'échec est plus précis.
		render(
			<SettingsSection
				{...props({ modifie: true, erreur: "Durée invalide" })}
			/>,
		);
		expect(
			screen.queryAllByText("Modifications non enregistrées."),
		).toHaveLength(0);
	});

	test("le succès s'affiche, et remplace le reste", () => {
		render(<SettingsSection {...props({ modifie: true, succes: true })} />);
		expect(screen.getByText("Enregistré.")).toBeInTheDocument();
		expect(
			screen.queryAllByText("Modifications non enregistrées."),
		).toHaveLength(0);
	});

	test("le contenu et le pied sont rendus", () => {
		render(
			<SettingsSection
				{...props({ pied: <button type="button">Tester</button> })}
			/>,
		);
		expect(screen.getByLabelText("un champ")).toBeInTheDocument();
		expect(screen.getByText("Tester")).toBeInTheDocument();
	});

	test("la description est optionnelle", () => {
		const { container } = render(<SettingsSection {...props()} />);
		expect(container.querySelectorAll("p")).toHaveLength(0);
	});
});
