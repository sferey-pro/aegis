import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Ticket } from "@/db/tickets";
import { TriageTable } from "./TriageTable";
import type { PackageGroup } from "./triage-types";

function groupe(over: Partial<PackageGroup> = {}): PackageGroup {
	return {
		key: "7::lodash",
		projectId: 7,
		projectName: "Mon API",
		package: "lodash",
		tool: "npm",
		cves: [],
		worstSeverity: "high",
		pendingCount: 0,
		hasConfirmed: false,
		maxBaselineAgeInDays: 0,
		maxSlaAgeInDays: 0,
		hasBaseline: false,
		hasNetDiscovery: false,
		targetPatch: null,
		publishedAt: null,
		firstSeenAt: null,
		...over,
	};
}

function props(over: Partial<Parameters<typeof TriageTable>[0]> = {}) {
	return {
		paginatedGroups: [groupe()],
		setSelectedGroup: () => {},
		createTicket: () => {},
		tickets: {} as Record<string, Ticket>,
		jiraBaseUrl: "https://jira.example",
		page: 1,
		setPage: () => {},
		totalPages: 1,
		itemsPerPage: 10,
		setItemsPerPage: () => {},
		totalItems: 1,
		...over,
	};
}

describe("TriageTable", () => {
	test("affiche package, projet et outil", () => {
		render(<TriageTable {...props()} />);
		expect(screen.getByText("lodash")).toBeInTheDocument();
		expect(screen.getByText("Mon API")).toBeInTheDocument();
		expect(screen.getByText("npm")).toBeInTheDocument();
	});

	test("cliquer une ligne sélectionne son groupe", () => {
		const vus: PackageGroup[] = [];
		render(
			<TriageTable {...props({ setSelectedGroup: (g) => vus.push(g) })} />,
		);
		fireEvent.click(screen.getByText("lodash"));
		expect(vus).toHaveLength(1);
		expect(vus[0]?.package).toBe("lodash");
	});

	test("un groupe confirmé est marqué Urgent, sans badge de sévérité", () => {
		render(
			<TriageTable
				{...props({ paginatedGroups: [groupe({ hasConfirmed: true })] })}
			/>,
		);
		expect(screen.getByText("Urgent")).toBeInTheDocument();
		expect(screen.queryByText("high")).not.toBeInTheDocument();
	});

	test("un groupe non confirmé affiche sa pire sévérité", () => {
		render(<TriageTable {...props()} />);
		expect(screen.getByText("high")).toBeInTheDocument();
		expect(screen.queryByText("Urgent")).not.toBeInTheDocument();
	});

	test("sans patch, l'absence est explicite", () => {
		render(<TriageTable {...props()} />);
		expect(screen.getByText("Aucun patch")).toBeInTheDocument();
	});

	test("avec patch, la version cible est affichée", () => {
		render(
			<TriageTable
				{...props({ paginatedGroups: [groupe({ targetPatch: "4.17.21" })] })}
			/>,
		);
		expect(screen.getByText(/4\.17\.21/)).toBeInTheDocument();
		expect(screen.queryByText("Aucun patch")).not.toBeInTheDocument();
	});

	test("le bouton Ticket transmet le groupe", () => {
		const vus: PackageGroup[] = [];
		render(
			<TriageTable {...props({ createTicket: (_e, g) => vus.push(g) })} />,
		);
		fireEvent.click(screen.getByRole("button", { name: /Ticket/ }));
		expect(vus[0]?.key).toBe("7::lodash");
	});

	test("sans ticket enregistré, aucun lien Jira n'est rendu", () => {
		render(<TriageTable {...props()} />);
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	test("avec un ticket, le lien Jira pointe sur sa référence", () => {
		const tickets: Record<string, Ticket> = {
			"7::lodash": {
				id: 1,
				project_id: 7,
				package: "lodash",
				url: "SEC-1234",
				cves: [],
				updated_at: "2026-08-01 10:00:00",
			},
		};
		render(<TriageTable {...props({ tickets })} />);
		const lien = screen.getByRole("link", { name: "SEC-1234" });
		expect(lien).toHaveAttribute(
			"href",
			"https://jira.example/browse/SEC-1234",
		);
	});

	test("le slash final de l'URL Jira n'est pas dupliqué", () => {
		const tickets: Record<string, Ticket> = {
			"7::lodash": {
				id: 1,
				project_id: 7,
				package: "lodash",
				url: "SEC-1",
				cves: [],
				updated_at: "",
			},
		};
		render(
			<TriageTable
				{...props({ tickets, jiraBaseUrl: "https://jira.example/" })}
			/>,
		);
		expect(screen.getByRole("link", { name: "SEC-1" })).toHaveAttribute(
			"href",
			"https://jira.example/browse/SEC-1",
		);
	});

	test("un ticket d'un autre groupe n'est pas rattaché à cette ligne", () => {
		// Régression visée : la map était relue plusieurs fois par ligne ; une
		// clé erronée aurait affiché le lien d'un autre package.
		const tickets: Record<string, Ticket> = {
			"7::axios": {
				id: 1,
				project_id: 7,
				package: "axios",
				url: "SEC-9",
				cves: [],
				updated_at: "",
			},
		};
		render(<TriageTable {...props({ tickets })} />);
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	test("le compteur de CVE et les CVE en attente sont affichés", () => {
		render(
			<TriageTable
				{...props({
					paginatedGroups: [
						groupe({
							cves: [{}, {}, {}] as PackageGroup["cves"],
							pendingCount: 2,
						}),
					],
				})}
			/>,
		);
		expect(screen.getByText("3")).toBeInTheDocument();
		expect(screen.getByText("2")).toBeInTheDocument();
	});

	test("une dette sans ancienneté est libellée Nouveau", () => {
		render(
			<TriageTable
				{...props({
					paginatedGroups: [
						groupe({ hasBaseline: true, maxBaselineAgeInDays: 0 }),
					],
				})}
			/>,
		);
		expect(screen.getByText(/SLA hérité:/)).toHaveTextContent("Nouveau");
	});

	test("un SLA au-delà de 30 jours est signalé en rouge", () => {
		render(
			<TriageTable
				{...props({
					paginatedGroups: [
						groupe({ hasNetDiscovery: true, maxSlaAgeInDays: 45 }),
					],
				})}
			/>,
		);
		const badge = screen.getByText(/SLA:/);
		expect(badge).toHaveTextContent("45j");
		expect(badge.className).toContain("bg-red-500/10");
	});

	test("la pagination est masquée sur une seule page courte", () => {
		render(<TriageTable {...props({ totalPages: 1, totalItems: 1 })} />);
		expect(screen.queryByText(/Affichage de/)).not.toBeInTheDocument();
	});

	test("la pagination apparaît au-delà d'une page", () => {
		render(<TriageTable {...props({ totalPages: 3, totalItems: 25 })} />);
		expect(screen.getByText(/Affichage de/)).toBeInTheDocument();
	});

	test("une liste vide rend un tableau sans ligne de données", () => {
		render(<TriageTable {...props({ paginatedGroups: [], totalItems: 0 })} />);
		expect(screen.getByRole("table")).toBeInTheDocument();
		expect(screen.queryByText("lodash")).not.toBeInTheDocument();
	});

	test("la ligne affiche les deux dates du groupe", () => {
		// Les deux SLA se calculent depuis ces dates : les afficher rend le calcul
		// vérifiable au lieu d'être à croire.
		render(
			<TriageTable
				{...props({
					paginatedGroups: [
						groupe({
							publishedAt: "2020-07-15T00:00:00Z",
							firstSeenAt: "2026-08-01T09:00:00Z",
						}),
					],
				})}
			/>,
		);

		expect(screen.getByText("GHSA")).toBeInTheDocument();
		expect(screen.getByText("Aegis")).toBeInTheDocument();
		expect(
			screen.getByText(new Date("2020-07-15T00:00:00Z").toLocaleDateString()),
		).toBeInTheDocument();
	});

	test("un groupe sans avis connu affiche une date GHSA vide", () => {
		render(
			<TriageTable
				{...props({
					paginatedGroups: [groupe({ firstSeenAt: "2026-08-01T09:00:00Z" })],
				})}
			/>,
		);

		// Une seule des deux dates manque : l'autre reste lisible.
		expect(screen.getAllByText("—")).toHaveLength(1);
	});
});
