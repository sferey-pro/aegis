import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
	test("expose le rôle checkbox et son état", () => {
		render(<Checkbox aria-label="tout sélectionner" />);
		const box = screen.getByRole("checkbox", { name: "tout sélectionner" });
		expect(box).toBeInTheDocument();
		expect(box).not.toBeChecked();
	});

	test("l'état contrôlé est reflété", () => {
		render(<Checkbox aria-label="x" checked />);
		expect(screen.getByRole("checkbox")).toBeChecked();
	});

	test("notifie le changement au clic", () => {
		const etats: boolean[] = [];
		render(
			<Checkbox
				aria-label="x"
				onCheckedChange={(v) => etats.push(v === true)}
			/>,
		);
		fireEvent.click(screen.getByRole("checkbox"));
		expect(etats).toEqual([true]);
	});

	test("désactivée, elle ne notifie pas", () => {
		const etats: boolean[] = [];
		render(
			<Checkbox
				aria-label="x"
				disabled
				onCheckedChange={(v) => etats.push(v === true)}
			/>,
		);
		fireEvent.click(screen.getByRole("checkbox"));
		expect(etats).toEqual([]);
	});
});
