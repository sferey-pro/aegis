import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import { AlertDialog, ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
	function base(over: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
		return {
			isOpen: true,
			title: "Supprimer le projet",
			message: "Cette action supprimera aussi ses runs.",
			onConfirm: () => {},
			onCancel: () => {},
			...over,
		};
	}

	test("fermé, rien n'est monté", () => {
		render(<ConfirmDialog {...base({ isOpen: false })} />);
		expect(screen.queryByText("Supprimer le projet")).not.toBeInTheDocument();
	});

	test("ouvert, titre et message sont affichés", () => {
		render(<ConfirmDialog {...base()} />);
		expect(screen.getByText("Supprimer le projet")).toBeInTheDocument();
		expect(
			screen.getByText("Cette action supprimera aussi ses runs."),
		).toBeInTheDocument();
	});

	test("les libellés par défaut sont Confirmer et Annuler", () => {
		render(<ConfirmDialog {...base()} />);
		expect(
			screen.getByRole("button", { name: "Confirmer" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Annuler" })).toBeInTheDocument();
	});

	test("les libellés sont personnalisables", () => {
		render(
			<ConfirmDialog
				{...base({ confirmText: "Supprimer", cancelText: "Garder" })}
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Supprimer" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Garder" })).toBeInTheDocument();
	});

	test("Annuler appelle onCancel sans confirmer", () => {
		let confirme = 0;
		let annule = 0;
		render(
			<ConfirmDialog
				{...base({ onConfirm: () => confirme++, onCancel: () => annule++ })}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
		expect(annule).toBe(1);
		expect(confirme).toBe(0);
	});

	test("Confirmer appelle onConfirm PUIS ferme via onCancel", () => {
		// La fermeture fait partie du contrat : sans elle, la modale resterait
		// ouverte après une suppression réussie.
		const ordre: string[] = [];
		render(
			<ConfirmDialog
				{...base({
					onConfirm: () => ordre.push("confirm"),
					onCancel: () => ordre.push("cancel"),
				})}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
		expect(ordre).toEqual(["confirm", "cancel"]);
	});

	test("le bouton de confirmation est en variante destructive", () => {
		render(<ConfirmDialog {...base()} />);
		expect(
			screen.getByRole("button", { name: "Confirmer" }).className,
		).toContain("destructive");
	});
});

describe("AlertDialog", () => {
	function base(over: Partial<Parameters<typeof AlertDialog>[0]> = {}) {
		return {
			isOpen: true,
			title: "Audit échoué",
			message: "ligne 1\nligne 2",
			onClose: () => {},
			...over,
		};
	}

	test("fermé, rien n'est monté", () => {
		render(<AlertDialog {...base({ isOpen: false })} />);
		expect(screen.queryByText("Audit échoué")).not.toBeInTheDocument();
	});

	test("ouvert, il n'offre qu'un bouton OK", () => {
		render(<AlertDialog {...base()} />);
		expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
	});

	test("OK appelle onClose", () => {
		let ferme = 0;
		render(<AlertDialog {...base({ onClose: () => ferme++ })} />);
		fireEvent.click(screen.getByRole("button", { name: "OK" }));
		expect(ferme).toBe(1);
	});

	test("le message multi-ligne conserve ses retours à la ligne", () => {
		// Les erreurs d'audit sont multi-lignes par contrat (raison, cwd, exit,
		// stderr, stdout) : les aplatir rendrait le diagnostic illisible.
		render(<AlertDialog {...base()} />);
		const el = screen.getByText(/ligne 1/);
		expect(el.className).toContain("whitespace-pre-wrap");
		expect(el.textContent).toContain("\n");
	});
});
