import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "./table";

function TableComplete() {
	return (
		<Table>
			<TableCaption>CVE par package</TableCaption>
			<TableHeader>
				<TableRow>
					<TableHead>Package</TableHead>
					<TableHead>Sévérité</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				<TableRow>
					<TableCell>lodash</TableCell>
					<TableCell>critique</TableCell>
				</TableRow>
			</TableBody>
			<TableFooter>
				<TableRow>
					<TableCell>1 ligne</TableCell>
				</TableRow>
			</TableFooter>
		</Table>
	);
}

describe("Table", () => {
	test("expose une structure de tableau accessible", () => {
		render(<TableComplete />);
		expect(screen.getByRole("table")).toBeInTheDocument();
		expect(
			screen.getByRole("columnheader", { name: "Package" }),
		).toBeInTheDocument();
		expect(screen.getByRole("cell", { name: "lodash" })).toBeInTheDocument();
	});

	test("la légende est rendue", () => {
		render(<TableComplete />);
		expect(screen.getByText("CVE par package")).toBeInTheDocument();
	});

	test("chaque sous-partie porte son data-slot", () => {
		const { container } = render(<TableComplete />);
		for (const slot of [
			"table",
			"table-header",
			"table-body",
			"table-footer",
			"table-row",
			"table-head",
			"table-cell",
			"table-caption",
		]) {
			expect(container.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
		}
	});

	test("le tableau est enveloppé dans un conteneur défilant", () => {
		// Le débordement horizontal est le comportement attendu sur écran étroit.
		const { container } = render(<TableComplete />);
		const wrapper = container.querySelector('[data-slot="table-container"]');
		expect(wrapper).not.toBeNull();
		expect(wrapper?.className).toContain("overflow-x-auto");
	});
});
