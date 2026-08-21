import { afterEach, describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";

import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { HistoryChart } from "./HistoryChart";

/**
 * Recharts avertit « The width(0) and height(0) of chart should be greater
 * than 0 » : happy-dom n'a pas de moteur de mise en page, donc aucun conteneur
 * n'a de dimensions. Sans effet sur les assertions, qui portent sur le contenu.
 *
 * ⚠️ Assertions négatives : `toHaveLength(0)` sur un `queryAll`, pas
 * `not.toBeInTheDocument()`.
 */

const point = (over: Record<string, unknown> = {}) => ({
	date: "01/08",
	rawDate: "2026-08-01",
	critical: 2,
	high: 3,
	moderate: 1,
	low: 0,
	...over,
});

describe("HistoryChart", () => {
	afterEach(restoreFetch);

	test("interroge l'historique sur 7 jours par défaut", async () => {
		mockFetch({ "/api/history-global?days=7": [point()] });
		render(<HistoryChart />);
		await waitFor(() => {
			expect(fetchCalls()).toHaveLength(1);
		});
		expect(fetchCalls()[0]?.url).toBe("/api/history-global?days=7");
	});

	test("sans donnée, l'absence est annoncée explicitement", async () => {
		mockFetch({ "/api/history-global?days=7": [] });
		render(<HistoryChart />);
		expect(
			await screen.findByText("Aucune donnée d'historique disponible."),
		).toBeInTheDocument();
	});

	test("avec des données, le graphique et sa légende sont rendus", async () => {
		mockFetch({
			"/api/history-global?days=7": [point(), point({ date: "02/08" })],
		});
		const { container } = render(<HistoryChart />);
		await waitFor(() => {
			expect(container.querySelector('[data-slot="chart"]')).not.toBeNull();
		});
		expect(screen.getByText(/derniers 7 jours/)).toBeInTheDocument();
	});

	test("le sélecteur de période affiche la valeur courante", async () => {
		mockFetch({ "/api/history-global?days=7": [point()] });
		render(<HistoryChart />);
		await waitFor(() => {
			expect(screen.getByRole("combobox")).toHaveTextContent("7 jours");
		});
	});

	test("un échec réseau sort de l'état de chargement", async () => {
		// Le composant avale l'erreur : il affiche l'état vide, pas une erreur.
		// Test de documentation du comportement actuel.
		mockFetch({
			"/api/history-global?days=7": { networkError: "ECONNREFUSED" },
		});
		render(<HistoryChart />);
		expect(
			await screen.findByText("Aucune donnée d'historique disponible."),
		).toBeInTheDocument();
	});

	test("un corps illisible ne bloque pas le composant en chargement", async () => {
		mockFetch({ "/api/history-global?days=7": { invalidJson: true } });
		render(<HistoryChart />);
		expect(
			await screen.findByText("Aucune donnée d'historique disponible."),
		).toBeInTheDocument();
	});

	test("une réponse 500 sort de l'état de chargement (N6)", async () => {
		// Auparavant `res.ok` n'était pas vérifié : le corps d'erreur `{error}` était
		// passé à `setData`, et `data.length` valant `undefined`, le composant ne
		// tombait dans aucune de ses deux branches — ni graphique ni « aucune
		// donnée ». `fetchJson` lève désormais, et la série est vidée.
		mockFetch({
			"/api/history-global?days=7": { status: 500, body: { error: "boom" } },
		});
		render(<HistoryChart />);
		await waitFor(() => {
			expect(fetchCalls()).toHaveLength(1);
		});
		expect(
			await screen.findByText("Aucune donnée d'historique disponible."),
		).toBeInTheDocument();
	});
});
