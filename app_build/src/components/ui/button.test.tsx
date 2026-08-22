import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
	test("rend son libellé et expose le rôle bouton", () => {
		render(<Button>Auditer</Button>);
		expect(screen.getByRole("button", { name: "Auditer" })).toBeInTheDocument();
	});

	test("porte data-slot=button", () => {
		render(<Button>x</Button>);
		expect(screen.getByRole("button")).toHaveAttribute("data-slot", "button");
	});

	test("déclenche onClick", () => {
		let clics = 0;
		render(<Button onClick={() => clics++}>x</Button>);
		fireEvent.click(screen.getByRole("button"));
		expect(clics).toBe(1);
	});

	test("désactivé, il ne déclenche pas onClick", () => {
		let clics = 0;
		render(
			<Button disabled onClick={() => clics++}>
				x
			</Button>,
		);
		const btn = screen.getByRole("button");
		expect(btn).toBeDisabled();
		fireEvent.click(btn);
		expect(clics).toBe(0);
	});

	test("les variantes et tailles produisent des classes distinctes", () => {
		const { container: a } = render(<Button>a</Button>);
		const { container: b } = render(<Button variant="destructive">b</Button>);
		const { container: c } = render(<Button size="sm">c</Button>);
		const cls = (n: Element | null) => n?.className ?? "";
		expect(cls(a.firstElementChild)).not.toBe(cls(b.firstElementChild));
		expect(cls(a.firstElementChild)).not.toBe(cls(c.firstElementChild));
	});

	test("fusionne la className fournie", () => {
		render(<Button className="ma-classe">x</Button>);
		expect(screen.getByRole("button")).toHaveClass("ma-classe");
	});

	test("asChild délègue le rendu à l'enfant", () => {
		render(
			<Button asChild>
				<a href="/projects">aller</a>
			</Button>,
		);
		expect(screen.getByRole("link", { name: "aller" })).toHaveAttribute(
			"href",
			"/projects",
		);
	});
});

/**
 * Contrat attendu — à activer au correctif.
 *
 * Voir le préambule des autres fichiers : `test.failing` attend l'échec, donc la
 * suite reste verte tant que le défaut existe, et bascule en rouge le jour du
 * correctif.
 */
