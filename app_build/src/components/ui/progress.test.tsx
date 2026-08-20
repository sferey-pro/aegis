import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Progress } from "./progress";

describe("Progress", () => {
	test("expose le rôle progressbar", () => {
		render(<Progress value={40} />);
		expect(screen.getByRole("progressbar")).toBeInTheDocument();
	});

	test("porte data-slot=progress", () => {
		render(<Progress value={40} />);
		expect(screen.getByRole("progressbar")).toHaveAttribute(
			"data-slot",
			"progress",
		);
	});

	test("l'indicateur se déplace avec la valeur", () => {
		const { container: a } = render(<Progress value={0} />);
		const { container: b } = render(<Progress value={100} />);
		const indicateur = (n: HTMLElement) =>
			n.querySelector('[data-slot="progress-indicator"]') as HTMLElement | null;
		expect(indicateur(a)?.style.transform).not.toBe(
			indicateur(b)?.style.transform,
		);
	});

	test("une valeur absente ne casse pas le rendu", () => {
		render(<Progress />);
		expect(screen.getByRole("progressbar")).toBeInTheDocument();
	});
});
