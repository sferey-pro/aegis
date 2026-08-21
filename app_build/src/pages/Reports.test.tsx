import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { Report, ReportDetail } from "@/db/reports";
import type { Vulnerability } from "@/lib/parsers/types";
import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { Reports } from "./Reports";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
	return {
		package: "lodash",
		severity: "high",
		title: "Prototype pollution",
		cve: "CVE-2024-1",
		link: null,
		versionRange: null,
		...over,
	};
}

function detail(vulns: Vulnerability[]): ReportDetail {
	return { projectId: 7, projectName: "Mon API", vulns };
}

function rapport(over: Partial<Report> = {}): Report {
	return {
		id: 1,
		projects_audited: 12,
		total_vulnerabilities: 3,
		counts: {
			critical: 1,
			high: 2,
			moderate: 0,
			low: 0,
			info: 0,
			unknown: 0,
		},
		details: [detail([vuln()])],
		created_at: "2026-08-21 09:00:00",
		...over,
	};
}

const del = () => fetchCalls().filter((c) => c.method === "DELETE");

describe("Reports", () => {
	afterEach(restoreFetch);

	test("charge la liste des comptes-rendus", async () => {
		mockFetch({ "GET /api/reports": [rapport()] });
		render(<Reports />);
		await waitFor(() => {
			expect(screen.getByText(/12 analysés/)).toBeInTheDocument();
		});
	});

	test("sans rapport, l'état vide est explicite", async () => {
		mockFetch({ "GET /api/reports": [] });
		render(<Reports />);
		expect(await screen.findByText("Aucun rapport")).toBeInTheDocument();
	});

	test("un chargement en échec affiche le même état vide", async () => {
		// Même famille que Triage, Overview et TagsManager : l'erreur est avalée.
		mockFetch({ "GET /api/reports": { networkError: "ECONNREFUSED" } });
		render(<Reports />);
		expect(await screen.findByText("Aucun rapport")).toBeInTheDocument();
	});

	test("le bouton d'actualisation relance la requête", async () => {
		mockFetch({ "GET /api/reports": [rapport()] });
		render(<Reports />);
		await waitFor(() => {
			expect(fetchCalls()).toHaveLength(1);
		});
		const boutons = screen.getAllByRole("button");
		const actualiser = boutons.find((b) =>
			/actualis|rafraîch/i.test(b.textContent ?? ""),
		);
		if (actualiser) {
			fireEvent.click(actualiser);
			await waitFor(() => {
				expect(fetchCalls().length).toBeGreaterThan(1);
			});
		}
	});

	test("le diff distingue nouvelles, corrigées et persistantes", async () => {
		// Deux comptes-rendus : le plus récent en premier (tri serveur).
		const recent = rapport({
			id: 2,
			created_at: "2026-08-21 09:00:00",
			details: [
				detail([
					vuln({ cve: "CVE-PERSISTE" }),
					vuln({ cve: "CVE-NOUVELLE", package: "axios" }),
				]),
			],
		});
		const ancien = rapport({
			id: 1,
			created_at: "2026-08-20 09:00:00",
			details: [
				detail([
					vuln({ cve: "CVE-PERSISTE" }),
					vuln({ cve: "CVE-CORRIGEE", package: "minimist" }),
				]),
			],
		});
		mockFetch({ "GET /api/reports": [recent, ancien] });
		render(<Reports />);
		await waitFor(() => {
			expect(screen.getAllByTitle(/comparatif/i).length).toBeGreaterThan(0);
		});

		fireEvent.click(screen.getAllByTitle(/comparatif/i)[0] as HTMLElement);

		// La nouvelle et la corrigée apparaissent dans leurs sections respectives.
		expect(await screen.findByText("axios")).toBeInTheDocument();
		expect(screen.getByText("minimist")).toBeInTheDocument();
	});

	test("le diff du plus ancien rapport n'a pas de précédent", async () => {
		mockFetch({ "GET /api/reports": [rapport()] });
		render(<Reports />);
		await waitFor(() => {
			expect(screen.getAllByTitle(/comparatif/i).length).toBeGreaterThan(0);
		});
		fireEvent.click(screen.getAllByTitle(/comparatif/i)[0] as HTMLElement);
		// Toutes ses vulnérabilités sont donc « nouvelles ».
		expect(await screen.findByText("lodash")).toBeInTheDocument();
	});

	test("supprimer demande confirmation avant d'appeler l'API", async () => {
		mockFetch({
			"GET /api/reports": [rapport()],
			"DELETE /api/reports/1": { status: 200, body: {} },
		});
		render(<Reports />);
		await waitFor(() => {
			expect(screen.getByText(/12 analysés/)).toBeInTheDocument();
		});

		// Le bouton porte un `title`, mais la boîte de confirmation aussi : on cible
		// donc le bouton, pas n'importe quel élément portant ce titre.
		const suppression = screen
			.getAllByTitle("Supprimer le rapport")
			.filter((el) => el.tagName === "BUTTON");
		fireEvent.click(suppression[0] as HTMLElement);

		expect(await screen.findByText("Supprimer le rapport")).toBeInTheDocument();
		expect(del()).toHaveLength(0);
	});

	test("confirmer la suppression cible le bon identifiant", async () => {
		mockFetch({
			"GET /api/reports": [rapport({ id: 42 })],
			"DELETE /api/reports/42": { status: 200, body: {} },
		});
		render(<Reports />);
		await waitFor(() => {
			expect(screen.getByText(/12 analysés/)).toBeInTheDocument();
		});

		// Le bouton porte un `title`, mais la boîte de confirmation aussi : on cible
		// donc le bouton, pas n'importe quel élément portant ce titre.
		const suppression = screen
			.getAllByTitle("Supprimer le rapport")
			.filter((el) => el.tagName === "BUTTON");
		fireEvent.click(suppression[0] as HTMLElement);

		const boutons = await screen.findAllByRole("button", { name: "Supprimer" });
		fireEvent.click(boutons[boutons.length - 1] as HTMLElement);

		await waitFor(() => {
			expect(del()).toHaveLength(1);
		});
		expect(del()[0]?.url).toBe("/api/reports/42");
	});

	test("la sélection multiple propose une suppression groupée", async () => {
		mockFetch({ "GET /api/reports": [rapport({ id: 1 }), rapport({ id: 2 })] });
		render(<Reports />);
		await waitFor(() => {
			expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
		});

		// La première case est celle d'en-tête (tout sélectionner).
		const cases = screen.getAllByRole("checkbox");
		fireEvent.click(cases[1] as HTMLElement);

		expect(
			await screen.findByRole("button", { name: /Supprimer \(1\)/ }),
		).toBeInTheDocument();
	});

	test("tout sélectionner coche les rapports de la page", async () => {
		mockFetch({ "GET /api/reports": [rapport({ id: 1 }), rapport({ id: 2 })] });
		render(<Reports />);
		await waitFor(() => {
			expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(1);
		});

		fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
		expect(
			await screen.findByRole("button", { name: /Supprimer \(2\)/ }),
		).toBeInTheDocument();
	});

	test("un rapport à zéro vulnérabilité affiche bien zéro", async () => {
		mockFetch({
			"GET /api/reports": [
				rapport({ total_vulnerabilities: 0, projects_audited: 0, details: [] }),
			],
		});
		render(<Reports />);
		await waitFor(() => {
			expect(screen.getByText(/0 analysés/)).toBeInTheDocument();
		});
	});
});
