import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Switch } from "./switch";

describe("Switch", () => {
	test("expose le rôle switch", () => {
		render(<Switch aria-label="désactiver la console" />);
		expect(
			screen.getByRole("switch", { name: "désactiver la console" }),
		).toBeInTheDocument();
	});

	test("l'état contrôlé est reflété", () => {
		render(<Switch aria-label="x" checked />);
		expect(screen.getByRole("switch")).toBeChecked();
	});

	test("notifie le changement au clic", () => {
		const etats: boolean[] = [];
		render(<Switch aria-label="x" onCheckedChange={(v) => etats.push(v)} />);
		fireEvent.click(screen.getByRole("switch"));
		expect(etats).toEqual([true]);
	});

	test("accepte un id, ce qui permet l'association par htmlFor", () => {
		// Les réglages associent leurs libellés aux interrupteurs par id.
		render(<Switch id="disable-console" aria-label="x" />);
		expect(screen.getByRole("switch")).toHaveAttribute("id", "disable-console");
	});
});
