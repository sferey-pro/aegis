import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { StatsResponse } from "@/routes/stats";
import { mockFetch, restoreFetch } from "@/test/http";
import { Overview } from "./Overview";

/**
 * `Overview` monte `HistoryChart`, qui interroge `/api/history-global` dès son
 * montage : le mock de `fetch` est donc requis même si la page elle-même ne
 * fait aucune requête (ses données arrivent par props depuis `App`).
 *
 * ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`.
 */

function stats(over: Partial<StatsResponse> = {}): StatsResponse {
	return {
		monitoredProjects: 12,
		criticalVulnerabilities: 4,
		pendingCves: 9,
		lastSync: "2026-08-21 09:00:00",
		healthGrade: "C",
		topProjects: [],
		topCves: [],
		...over,
	};
}

function TemoinRoute() {
	const { pathname, search } = useLocation();
	return <span data-testid="route">{pathname + search}</span>;
}

function monte(over: Partial<Parameters<typeof Overview>[0]> = {}) {
	const props = {
		stats: stats(),
		loading: false,
		syncDisplay: "21/08/2026 09:00:00",
		...over,
	};
	return render(
		<MemoryRouter initialEntries={["/"]}>
			<Overview {...props} />
			<Routes>
				<Route path="*" element={<TemoinRoute />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("Overview", () => {
	beforeEach(() => {
		mockFetch({ "/api/history-global?days=7": [] });
	});
	afterEach(restoreFetch);

	test("affiche les compteurs et la dernière synchronisation", () => {
		monte();
		expect(screen.getByText("4")).toBeInTheDocument();
		expect(screen.getByText("12")).toBeInTheDocument();
		expect(screen.getByText("21/08/2026 09:00:00")).toBeInTheDocument();
	});

	test("en chargement, les chiffres sont remplacés par un indicateur", () => {
		monte({ loading: true });
		expect(screen.queryAllByText("4")).toHaveLength(0);
		expect(screen.queryAllByText("12")).toHaveLength(0);
		expect(screen.getByText("--")).toBeInTheDocument();
	});

	test("stats à null hors chargement affiche 0 — faux négatif documenté", () => {
		// Défaut N6 de l'audit : `fetchStats` avale l'erreur, `stats` reste null et
		// `loading` retombe à false. La tuile annonce alors « 0 failles critiques »
		// alors que la donnée n'a pas pu être lue.
		//
		// Ce test consigne le comportement actuel. Le jour où un état d'erreur
		// distinct est introduit (afficher « — » plutôt que « 0 »), il échouera et
		// signalera la correction.
		monte({ stats: null, loading: false });
		expect(screen.getAllByText("0").length).toBeGreaterThan(0);
	});

	test("la note de santé n'est affichée que si elle est fournie", () => {
		monte();
		expect(screen.getByText("Santé Globale")).toBeInTheDocument();
		expect(screen.getByText("C")).toBeInTheDocument();
	});

	test("sans note de santé, la tuile disparaît", () => {
		monte({ stats: stats({ healthGrade: "" }) });
		expect(screen.queryAllByText("Santé Globale")).toHaveLength(0);
	});

	test("sans top projets, la section est absente", () => {
		monte();
		expect(screen.queryAllByText("Top Projets à Risque")).toHaveLength(0);
	});

	test("les top projets sont classés et numérotés", () => {
		monte({
			stats: stats({
				topProjects: [
					{ id: 7, name: "Mon API", critical: 3, high: 1, risk: 70 },
					{ id: 8, name: "Front", critical: 1, high: 2, risk: 40 },
				],
			}),
		});
		expect(screen.getByText("Top Projets à Risque")).toBeInTheDocument();
		expect(screen.getByText("Mon API")).toBeInTheDocument();
		expect(screen.getByText("#1")).toBeInTheDocument();
		expect(screen.getByText("#2")).toBeInTheDocument();
	});

	test("un top projet est un lien vers son triage", () => {
		// Converti en <Link> pendant cette branche : le clic milieu et l'ouverture
		// dans un onglet fonctionnent, contrairement à un <div onClick>.
		monte({
			stats: stats({
				topProjects: [
					{ id: 7, name: "Mon API", critical: 3, high: 1, risk: 70 },
				],
			}),
		});
		expect(screen.getByRole("link", { name: /Mon API/ })).toHaveAttribute(
			"href",
			"/triage?project=7",
		);
	});

	test("une top CVE est un lien vers son triage", () => {
		monte({
			stats: stats({
				topCves: [
					{ cve: "CVE-2024-1", title: "Pollution", worst: "high", count: 3 },
				],
			}),
		});
		expect(
			screen.getByText("Vulnérabilités les plus fréquentes"),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /CVE-2024-1/ })).toHaveAttribute(
			"href",
			"/triage?cve=CVE-2024-1",
		);
	});

	test("un compteur à zéro s'affiche, il n'est pas masqué", () => {
		monte({
			stats: stats({ criticalVulnerabilities: 0, monitoredProjects: 0 }),
		});
		expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2);
	});
});
