import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Input } from "./input";

describe("Input", () => {
	test("porte data-slot=input", () => {
		render(<Input aria-label="chemin" />);
		expect(screen.getByLabelText("chemin")).toHaveAttribute(
			"data-slot",
			"input",
		);
	});

	test("transmet le type", () => {
		render(<Input type="password" aria-label="jeton" />);
		expect(screen.getByLabelText("jeton")).toHaveAttribute("type", "password");
	});

	test("remonte la saisie via onChange", () => {
		const saisies: string[] = [];
		render(
			<Input aria-label="nom" onChange={(e) => saisies.push(e.target.value)} />,
		);
		fireEvent.change(screen.getByLabelText("nom"), {
			target: { value: "Mon API" },
		});
		expect(saisies).toEqual(["Mon API"]);
	});

	test("respecte disabled et readOnly", () => {
		render(<Input aria-label="a" disabled />);
		expect(screen.getByLabelText("a")).toBeDisabled();
		render(<Input aria-label="b" readOnly value="fixe" />);
		expect(screen.getByLabelText("b")).toHaveAttribute("readonly");
	});

	test("fusionne la className fournie", () => {
		render(<Input aria-label="c" className="ma-classe" />);
		expect(screen.getByLabelText("c")).toHaveClass("ma-classe");
	});
});
