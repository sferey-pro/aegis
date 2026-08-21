import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Filter } from "lucide-react";

import { FilterDropdown } from "./FilterDropdown";

const options = [
	{ label: "Critique", value: "critical" },
	{ label: "Élevé", value: "high" },
];

describe("FilterDropdown", () => {
	test("expose un combobox", () => {
		render(<FilterDropdown options={options} />);
		expect(screen.getByRole("combobox")).toBeInTheDocument();
	});

	test("sans valeur, le texte de substitution est affiché", () => {
		render(<FilterDropdown options={options} placeholder="Sévérité…" />);
		expect(screen.getByRole("combobox")).toHaveTextContent("Sévérité…");
	});

	test("avec une valeur, le libellé correspondant est affiché", () => {
		render(<FilterDropdown options={options} value="high" />);
		expect(screen.getByRole("combobox")).toHaveTextContent("Élevé");
	});

	test("l'icône est rendue seulement si fournie", () => {
		const { container, unmount } = render(<FilterDropdown options={options} />);
		// Le déclencheur Radix embarque son propre chevron : on compte les svg.
		const sansIcone = container.querySelectorAll("svg").length;
		unmount();

		const { container: avec } = render(
			<FilterDropdown options={options} icon={Filter} />,
		);
		expect(avec.querySelectorAll("svg").length).toBe(sansIcone + 1);
	});

	test("fermé, aucune option n'est montée", () => {
		render(<FilterDropdown options={options} />);
		expect(screen.queryByRole("option")).not.toBeInTheDocument();
	});

	test("une liste d'options vide ne casse pas le rendu", () => {
		render(<FilterDropdown options={[]} />);
		expect(screen.getByRole("combobox")).toBeInTheDocument();
	});
});
