import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
	test("rend son contenu", () => {
		render(<Badge>critique</Badge>);
		expect(screen.getByText("critique")).toBeInTheDocument();
	});

	test("porte data-slot=badge", () => {
		render(<Badge>x</Badge>);
		expect(screen.getByText("x")).toHaveAttribute("data-slot", "badge");
	});

	test("fusionne la className fournie sans perdre les classes de base", () => {
		render(<Badge className="ma-classe">x</Badge>);
		const el = screen.getByText("x");
		expect(el).toHaveClass("ma-classe");
		expect(el.className.length).toBeGreaterThan("ma-classe".length);
	});

	test("les variantes produisent des classes distinctes", () => {
		const { container: base } = render(<Badge>a</Badge>);
		const { container: destructive } = render(
			<Badge variant="destructive">b</Badge>,
		);
		expect(base.firstElementChild?.className).not.toBe(
			destructive.firstElementChild?.className,
		);
	});

	test("asChild délègue le rendu à l'enfant", () => {
		render(
			<Badge asChild>
				<a href="/triage">voir</a>
			</Badge>,
		);
		const link = screen.getByRole("link", { name: "voir" });
		expect(link).toHaveAttribute("href", "/triage");
		expect(link).toHaveAttribute("data-slot", "badge");
	});
});
