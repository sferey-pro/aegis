import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import { ConfirmReasonModal } from "./ConfirmReasonModal";
import type { ConfirmModalState } from "./triage-types";

const etat: ConfirmModalState = {
	isOpen: true,
	cve: "CVE-2024-12345",
	projectId: 7,
	reason: "",
};

describe("ConfirmReasonModal", () => {
	test("fermée quand l'état est null", () => {
		render(
			<ConfirmReasonModal
				confirmModal={null}
				setConfirmModal={() => {}}
				submitConfirm={() => {}}
			/>,
		);
		expect(screen.queryByText("Confirmer la faille")).not.toBeInTheDocument();
	});

	test("fermée quand isOpen est faux, même avec un état présent", () => {
		render(
			<ConfirmReasonModal
				confirmModal={{ ...etat, isOpen: false }}
				setConfirmModal={() => {}}
				submitConfirm={() => {}}
			/>,
		);
		expect(screen.queryByText("Confirmer la faille")).not.toBeInTheDocument();
	});

	test("ouverte, elle affiche la CVE concernée", () => {
		render(
			<ConfirmReasonModal
				confirmModal={etat}
				setConfirmModal={() => {}}
				submitConfirm={() => {}}
			/>,
		);
		expect(screen.getByText("CVE-2024-12345")).toBeInTheDocument();
	});

	test("la justification est un champ obligatoire, associé à son libellé", () => {
		render(
			<ConfirmReasonModal
				confirmModal={etat}
				setConfirmModal={() => {}}
				submitConfirm={() => {}}
			/>,
		);
		const champ = screen.getByLabelText(/Raison \/ Justification/);
		expect(champ).toBeRequired();
	});

	test("la saisie préserve le reste de l'état", () => {
		// Régression visée : l'implémentation étalait `{...confirmModal}` sans
		// garde, ce qui aurait produit un objet sans cve ni projectId.
		const vus: (ConfirmModalState | null)[] = [];
		render(
			<ConfirmReasonModal
				confirmModal={etat}
				setConfirmModal={(v) => vus.push(v)}
				submitConfirm={() => {}}
			/>,
		);
		fireEvent.change(screen.getByLabelText(/Raison \/ Justification/), {
			target: { value: "Exposé publiquement" },
		});
		expect(vus).toHaveLength(1);
		expect(vus[0]).toEqual({
			isOpen: true,
			cve: "CVE-2024-12345",
			projectId: 7,
			reason: "Exposé publiquement",
		});
	});

	test("la valeur courante est affichée dans le champ", () => {
		render(
			<ConfirmReasonModal
				confirmModal={{ ...etat, reason: "déjà saisi" }}
				setConfirmModal={() => {}}
				submitConfirm={() => {}}
			/>,
		);
		expect(screen.getByLabelText(/Raison \/ Justification/)).toHaveValue(
			"déjà saisi",
		);
	});

	test("Annuler remet l'état à null", () => {
		const vus: (ConfirmModalState | null)[] = [];
		render(
			<ConfirmReasonModal
				confirmModal={etat}
				setConfirmModal={(v) => vus.push(v)}
				submitConfirm={() => {}}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
		expect(vus).toEqual([null]);
	});

	test("Annuler est de type button et ne soumet pas le formulaire", () => {
		let soumissions = 0;
		render(
			<ConfirmReasonModal
				confirmModal={etat}
				setConfirmModal={() => {}}
				submitConfirm={() => soumissions++}
			/>,
		);
		const annuler = screen.getByRole("button", { name: "Annuler" });
		expect(annuler).toHaveAttribute("type", "button");
		fireEvent.click(annuler);
		expect(soumissions).toBe(0);
	});

	test("le bouton de confirmation soumet le formulaire", () => {
		let soumissions = 0;
		render(
			<ConfirmReasonModal
				confirmModal={{ ...etat, reason: "motif" }}
				setConfirmModal={() => {}}
				submitConfirm={(e) => {
					e.preventDefault();
					soumissions++;
				}}
			/>,
		);
		const valider = screen.getByRole("button", {
			name: "Confirmer la faille",
		});
		expect(valider).toHaveAttribute("type", "submit");
		fireEvent.click(valider);
		expect(soumissions).toBe(1);
	});
});
