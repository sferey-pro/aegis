import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { Report } from "@/db/reports";
import { ReportModal } from "./ReportModal";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function rapport(over: Partial<Report> = {}): Report {
	return {
		id: 1,
		projects_audited: 12,
		total_vulnerabilities: 37,
		counts: {
			critical: 2,
			high: 5,
			moderate: 10,
			low: 20,
			info: 0,
			unknown: 0,
		},
		details: [],
		created_at: "2026-08-21 09:00:00",
		...over,
	};
}

function TemoinRoute() {
	const { pathname } = useLocation();
	return <span data-testid="route">{pathname}</span>;
}

function monte(
	reportModal: Report | null,
	setReportModal: (v: Report | null) => void = () => {},
) {
	return render(
		<MemoryRouter initialEntries={["/"]}>
			<ReportModal reportModal={reportModal} setReportModal={setReportModal} />
			<Routes>
				<Route path="*" element={<TemoinRoute />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("ReportModal", () => {
	test("sans rapport, rien n'est monté", () => {
		monte(null);
		expect(screen.queryAllByText("Audit Terminé !")).toHaveLength(0);
	});

	test("avec un rapport, elle affiche les totaux", () => {
		monte(rapport());
		expect(screen.getByText("Audit Terminé !")).toBeInTheDocument();
		expect(screen.getByText("12")).toBeInTheDocument();
		expect(screen.getByText("37")).toBeInTheDocument();
	});

	test("un rapport à zéro vulnérabilité s'affiche quand même", () => {
		// `0` est une valeur légitime : la masquer laisserait la tuile vide.
		monte(rapport({ total_vulnerabilities: 0, projects_audited: 0 }));
		expect(screen.getAllByText("0")).toHaveLength(2);
	});

	test("« Voir tous les rapports » navigue vers /reports", () => {
		monte(rapport());
		fireEvent.click(
			screen.getByRole("button", { name: /Voir tous les rapports/ }),
		);
		expect(screen.getByTestId("route")).toHaveTextContent("/reports");
	});

	test("la navigation ferme aussi la modale", () => {
		const vus: (Report | null)[] = [];
		monte(rapport(), (v) => vus.push(v));
		fireEvent.click(
			screen.getByRole("button", { name: /Voir tous les rapports/ }),
		);
		expect(vus).toContain(null);
	});
});
