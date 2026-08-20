import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Textarea } from "./textarea";

describe("Textarea", () => {
	test("porte data-slot=textarea", () => {
		render(<Textarea aria-label="note" />);
		expect(screen.getByLabelText("note")).toHaveAttribute(
			"data-slot",
			"textarea",
		);
	});

	test("remonte la saisie via onChange", () => {
		const saisies: string[] = [];
		render(
			<Textarea
				aria-label="raison"
				onChange={(e) => saisies.push(e.target.value)}
			/>,
		);
		fireEvent.change(screen.getByLabelText("raison"), {
			target: { value: "Composant exposé publiquement" },
		});
		expect(saisies).toEqual(["Composant exposé publiquement"]);
	});

	test("respecte disabled", () => {
		render(<Textarea aria-label="x" disabled />);
		expect(screen.getByLabelText("x")).toBeDisabled();
	});

	test("fusionne la className fournie", () => {
		render(<Textarea aria-label="y" className="ma-classe" />);
		expect(screen.getByLabelText("y")).toHaveClass("ma-classe");
	});
});
