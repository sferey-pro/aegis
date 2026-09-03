import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";

import type { Vulnerability } from "@/lib/parsers/types";
import type { ProjectHistoryItem } from "@/routes/projects";
import { RunReport } from "./RunReport";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
	return {
		package: "lodash",
		severity: "high",
		title: "Prototype pollution",
		cve: "CVE-2024-1",
		link: "https://github.com/advisories/GHSA-xxxx",
		versionRange: "<4.17.21",
		fixedIn: "4.17.21",
		...over,
	};
}

function run(over: Partial<ProjectHistoryItem> = {}): ProjectHistoryItem {
	return {
		id: 1,
		project_id: 7,
		status: "vulnerable",
		total: 2,
		counts: { critical: 1, high: 1, moderate: 0, low: 0, info: 0, unknown: 0 },
		vulnerabilities: [
			vuln(),
			vuln({
				package: "axios",
				severity: "critical",
				cve: "CVE-2024-2",
				title: "SSRF",
				link: null,
				fixedIn: null,
			}),
		],
		command: "npm audit --json",
		commit_sha: "abc1234def",
		error: null,
		duration_ms: 1200,
		ran_at: "2026-08-01 10:00:00",
		newCves: [{ ref: "CVE-2024-2", package: "axios", severity: "critical" }],
		...over,
	};
}

describe("RunReport", () => {
	test("l'en-tête porte l'état, la durée, le commit et la commande", () => {
		render(<RunReport run={run()} />);
		expect(screen.getByText("2 vulnérabilités")).toBeInTheDocument();
		expect(screen.getByText("1.2 s")).toBeInTheDocument();
		expect(screen.getByText("abc1234")).toBeInTheDocument();
		expect(screen.getByText("npm audit --json")).toBeInTheDocument();
	});

	test("les six sévérités sont comptées, même à zéro", () => {
		render(<RunReport run={run()} />);
		const section = screen.getByRole("region", { name: "Sévérités" });
		expect(within(section).getByText("Critique : 1")).toBeInTheDocument();
		expect(within(section).getByText("Haut : 1")).toBeInTheDocument();
		expect(within(section).getByText("Inconnu : 0")).toBeInTheDocument();
	});

	test("les nouvelles CVE sont listées et marquées dans le tableau", () => {
		render(<RunReport run={run()} />);
		const nouveautes = screen.getByRole("region", { name: "Nouvelles CVE" });
		expect(within(nouveautes).getByText("CVE-2024-2")).toBeInTheDocument();
		// Une seule ligne marquée « Nouveau » : axios, pas lodash.
		expect(screen.getAllByText("Nouveau")).toHaveLength(1);
		const table = screen.getByRole("table");
		const lignes = within(table).getAllByRole("row").slice(1);
		// Tri par sévérité décroissante : critical (axios) avant high (lodash).
		expect(lignes[0]).toHaveTextContent("axios");
		expect(lignes[0]).toHaveTextContent("Nouveau");
		expect(lignes[1]).toHaveTextContent("lodash");
	});

	test("le titre passe à la ligne au lieu d'étirer le tableau", () => {
		// `TableCell` pose `whitespace-nowrap` ; un titre d'avis fait une phrase.
		render(<RunReport run={run()} />);
		const cellule = screen.getByText("Prototype pollution").closest("td");
		expect(cellule?.className).toContain("whitespace-normal");
	});

	test("la référence est un lien quand l'avis en a un, un texte sinon", () => {
		render(<RunReport run={run()} />);
		const lien = screen.getByRole("link", { name: "CVE-2024-1" });
		expect(lien).toHaveAttribute(
			"href",
			"https://github.com/advisories/GHSA-xxxx",
		);
		expect(screen.queryAllByRole("link", { name: "CVE-2024-2" })).toHaveLength(
			0,
		);
		expect(screen.getByText("4.17.21")).toBeInTheDocument();
	});

	test("sans nouveauté, l'absence est dite", () => {
		render(<RunReport run={run({ newCves: [] })} />);
		expect(
			screen.getByText("Aucune nouvelle CVE par rapport à l'audit précédent."),
		).toBeInTheDocument();
		expect(screen.queryAllByText("Nouveau")).toHaveLength(0);
	});

	test("un run sain le dit, sans tableau", () => {
		render(
			<RunReport
				run={run({
					status: "ok",
					total: 0,
					vulnerabilities: [],
					newCves: [],
					counts: {
						critical: 0,
						high: 0,
						moderate: 0,
						low: 0,
						info: 0,
						unknown: 0,
					},
				})}
			/>,
		);
		expect(
			screen.getByText("Aucune vulnérabilité détectée."),
		).toBeInTheDocument();
		expect(screen.queryAllByRole("table")).toHaveLength(0);
	});

	test("un run en erreur rend l'erreur brute, et rien de mesuré", () => {
		// Le champ est multi-ligne par contrat (§2) : on le lit tel quel.
		const erreur = "Lockfile manquant: bun.lock\ncwd: /srv/api\nexit: 1";
		render(
			<RunReport
				run={run({
					status: "error",
					total: 0,
					vulnerabilities: [],
					newCves: [],
					error: erreur,
				})}
			/>,
		);
		const bloc = screen.getByRole("region", { name: "Erreur de l'audit" });
		expect(bloc.textContent).toBe(erreur);
		expect(screen.getByText("Erreur")).toBeInTheDocument();
		expect(screen.queryAllByRole("region", { name: "Sévérités" })).toHaveLength(
			0,
		);
		expect(screen.queryAllByRole("table")).toHaveLength(0);
	});
});
