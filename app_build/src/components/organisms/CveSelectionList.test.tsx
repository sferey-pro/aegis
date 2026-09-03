import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import type { PackageGroupCve } from "@/lib/package-groups";
import { CveSelectionList } from "./CveSelectionList";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function cve(
	ref: string,
	over: Partial<PackageGroupCve> = {},
): PackageGroupCve {
	return {
		cve: ref,
		ref,
		title: `Titre ${ref}`,
		severity: "high",
		versionRange: "<2",
		fixedIn: "2.0.0",
		link: null,
		status: "pending",
		note: "",
		...over,
	};
}

const deux = [
	cve("CVE-1"),
	cve("CVE-2", { severity: "low", status: "ignored" }),
];

describe("CveSelectionList", () => {
	test("une case par CVE, cochée selon la sélection", () => {
		render(
			<CveSelectionList
				cves={deux}
				selected={new Set(["CVE-1"])}
				onToggle={() => {}}
				onSelectAll={() => {}}
				onSelectNone={() => {}}
			/>,
		);
		const cases = screen.getAllByRole("checkbox");
		expect(cases).toHaveLength(2);
		expect(cases[0]).toHaveAttribute("aria-checked", "true");
		expect(cases[1]).toHaveAttribute("aria-checked", "false");
		expect(screen.getByText("1 sur 2 sélectionnées")).toBeInTheDocument();
	});

	test("cocher ou décocher remonte la CVE visée", () => {
		const vues: string[] = [];
		render(
			<CveSelectionList
				cves={deux}
				selected={new Set(["CVE-1", "CVE-2"])}
				onToggle={(c) => vues.push(c)}
				onSelectAll={() => {}}
				onSelectNone={() => {}}
			/>,
		);
		fireEvent.click(screen.getByRole("checkbox", { name: "CVE-2" }));
		expect(vues).toEqual(["CVE-2"]);
	});

	test("Toutes et Aucune délèguent", () => {
		let toutes = 0;
		let aucune = 0;
		render(
			<CveSelectionList
				cves={deux}
				selected={new Set()}
				onToggle={() => {}}
				onSelectAll={() => toutes++}
				onSelectNone={() => aucune++}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Toutes" }));
		fireEvent.click(screen.getByRole("button", { name: "Aucune" }));
		expect(toutes).toBe(1);
		expect(aucune).toBe(1);
	});

	test("sévérité, statut hors « à traiter », versions et correctif sont lisibles", () => {
		render(
			<CveSelectionList
				cves={deux}
				selected={new Set()}
				onToggle={() => {}}
				onSelectAll={() => {}}
				onSelectNone={() => {}}
			/>,
		);
		expect(screen.getByText("Haut")).toBeInTheDocument();
		expect(screen.getByText("Bas")).toBeInTheDocument();
		expect(screen.getByText("Ignoré")).toBeInTheDocument();
		// Le statut « à traiter » est le défaut : il n'encombre pas la ligne.
		expect(screen.queryAllByText("À traiter")).toHaveLength(0);
		expect(screen.getAllByText("<2 → 2.0.0")).toHaveLength(2);
	});

	test("sans référence, le titre tient lieu de libellé", () => {
		render(
			<CveSelectionList
				cves={[
					cve("lodash: Prototype pollution", {
						ref: null,
						title: "Prototype pollution",
					}),
				]}
				selected={new Set()}
				onToggle={() => {}}
				onSelectAll={() => {}}
				onSelectNone={() => {}}
			/>,
		);
		expect(
			screen.getByRole("checkbox", { name: "Prototype pollution" }),
		).toBeInTheDocument();
	});
});
