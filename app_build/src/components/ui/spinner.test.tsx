import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { Spinner } from "./spinner";

describe("Spinner", () => {
	test("tourne : la classe d'animation est toujours présente", () => {
		// Régression visée : plusieurs indicateurs de chargement de l'app avaient
		// perdu `animate-spin`, donnant une icône figée.
		const { container } = render(<Spinner />);
		expect(container.querySelector("svg")).toHaveClass("animate-spin");
	});

	test("chaque taille produit ses classes de dimension", () => {
		const attendu = {
			sm: "w-4",
			default: "w-6",
			lg: "w-8",
			xl: "w-12",
		} as const;
		for (const [size, classe] of Object.entries(attendu)) {
			const { container } = render(
				<Spinner size={size as keyof typeof attendu} />,
			);
			expect(container.querySelector("svg")).toHaveClass(classe);
		}
	});

	test("la className fournie s'ajoute sans écraser l'animation", () => {
		const { container } = render(<Spinner className="text-primary" />);
		const svg = container.querySelector("svg");
		expect(svg).toHaveClass("text-primary");
		expect(svg).toHaveClass("animate-spin");
	});
});
