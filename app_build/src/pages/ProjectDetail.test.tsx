import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { ProjectHistoryItem, ProjectListItem } from "@/routes/projects";
import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { ProjectDetail } from "./ProjectDetail";

/**
 * La page monte `HistoryChart`, qui interroge `/api/history-global` avec le
 * filtre projet : la route doit être déclarée dans chaque `mockFetch`.
 *
 * ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`.
 */

function projet(over: Partial<ProjectListItem> = {}): ProjectListItem {
	return {
		id: 7,
		name: "Mon API",
		slug: "mon-api",
		path: "/srv/api",
		audit_path: null,
		type: "node",
		tool: "npm",
		tags: ["prod"],
		ignored: false,
		is_remote: false,
		source_type: "local",
		remote_url: null,
		created_at: "2026-07-01 09:00:00",
		git: { isRepo: false },
		lastRun: null,
		...over,
	};
}

function run(over: Partial<ProjectHistoryItem> = {}): ProjectHistoryItem {
	return {
		id: 2,
		project_id: 7,
		status: "vulnerable",
		total: 1,
		counts: { critical: 0, high: 1, moderate: 0, low: 0, info: 0, unknown: 0 },
		vulnerabilities: [
			{
				package: "lodash",
				severity: "high",
				title: "Prototype pollution",
				cve: "CVE-2024-1",
				link: null,
				versionRange: null,
			},
		],
		command: "npm audit --json",
		commit_sha: null,
		error: null,
		duration_ms: 50,
		ran_at: "2026-08-02 10:00:00",
		newCves: [],
		...over,
	};
}

const ancien = run({
	id: 1,
	ran_at: "2026-08-01 10:00:00",
	vulnerabilities: [
		{
			package: "axios",
			severity: "critical",
			title: "SSRF",
			cve: "CVE-2024-2",
			link: null,
			versionRange: null,
		},
	],
});

const base = {
	"GET /api/projects/7": projet(),
	"GET /api/projects/7/history": [run(), ancien],
	"GET /api/history-global?days=7&project=7": [],
};

function Espion() {
	const { pathname, search } = useLocation();
	return <span data-testid="route">{pathname + search}</span>;
}

function monte(route = "/projects/7") {
	return render(
		<MemoryRouter initialEntries={[route]}>
			<Routes>
				<Route path="/projects/:id" element={<ProjectDetail />} />
				<Route path="*" element={<span>ailleurs</span>} />
			</Routes>
			<Espion />
		</MemoryRouter>,
	);
}

const historiques = () =>
	fetchCalls().filter((c) => c.url === "/api/projects/7/history");

describe("ProjectDetail", () => {
	afterEach(restoreFetch);

	test("affiche la fiche et le rapport du dernier audit", async () => {
		mockFetch(base);
		monte();
		expect(
			await screen.findByRole("heading", { level: 1, name: "Mon API" }),
		).toBeInTheDocument();
		expect(screen.getByText("prod")).toBeInTheDocument();
		// Le run le plus récent est sélectionné : lodash, pas axios.
		const rapport = screen.getByRole("article", { name: "Rapport d'audit" });
		expect(rapport).toHaveTextContent("lodash");
		expect(rapport).not.toHaveTextContent("axios");
		expect(screen.getByText("Audits (2)")).toBeInTheDocument();
	});

	test("le graphique interroge la série du projet", async () => {
		mockFetch(base);
		monte();
		await waitFor(() => {
			expect(
				fetchCalls().some(
					(c) => c.url === "/api/history-global?days=7&project=7",
				),
			).toBe(true);
		});
	});

	test("choisir un run plus ancien change le rapport", async () => {
		mockFetch(base);
		monte();
		await screen.findByRole("heading", { level: 1, name: "Mon API" });
		const liste = screen.getByRole("list", { name: "Historique des audits" });
		const [, bouton] = liste.querySelectorAll("button");
		if (!bouton) throw new Error("second run absent");
		fireEvent.click(bouton);
		const rapport = screen.getByRole("article", { name: "Rapport d'audit" });
		expect(rapport).toHaveTextContent("axios");
		expect(rapport).not.toHaveTextContent("lodash");
	});

	test("« Auditer maintenant » force l'audit, recharge et sélectionne le nouveau run", async () => {
		const neuf = run({
			id: 3,
			ran_at: "2026-08-03 10:00:00",
			vulnerabilities: [],
			total: 0,
			status: "ok",
			counts: {
				critical: 0,
				high: 0,
				moderate: 0,
				low: 0,
				info: 0,
				unknown: 0,
			},
		});
		mockFetch(base);
		monte();
		await screen.findByRole("heading", { level: 1, name: "Mon API" });

		// `mockFetch` fige sa table à l'appel : on la remplace pour que la relecture
		// après audit voie le nouveau run. Le compteur d'appels repart de zéro.
		mockFetch({
			...base,
			"GET /api/projects/7/history": [neuf, run(), ancien],
			"POST /api/projects/7/audit?force=1": {
				body: { success: true, run: neuf, newCves: [], deduped: false },
			},
		});
		fireEvent.click(screen.getByRole("button", { name: /Auditer maintenant/ }));

		await waitFor(() => {
			expect(historiques()).toHaveLength(1);
		});
		expect(
			fetchCalls().some(
				(c) => c.method === "POST" && c.url === "/api/projects/7/audit?force=1",
			),
		).toBe(true);
		expect(
			await screen.findByText("Audit terminé, aucune nouvelle CVE."),
		).toBeInTheDocument();
		expect(screen.getByText("Audits (3)")).toBeInTheDocument();
		const rapport = screen.getByRole("article", { name: "Rapport d'audit" });
		expect(rapport).toHaveTextContent("Aucune vulnérabilité détectée.");
		// Le graphique a relu sa série après l'audit : une lecture depuis la remise
		// à zéro du compteur, celle que `refreshToken` force.
		expect(
			fetchCalls().filter(
				(c) => c.url === "/api/history-global?days=7&project=7",
			),
		).toHaveLength(1);
	});

	test("un refus de l'audit remonte le message du serveur", async () => {
		mockFetch({
			...base,
			"POST /api/projects/7/audit?force=1": {
				status: 409,
				body: {
					error: "Un audit de ce projet est déjà en cours, veuillez patienter.",
				},
			},
		});
		monte();
		await screen.findByRole("heading", { level: 1, name: "Mon API" });
		fireEvent.click(screen.getByRole("button", { name: /Auditer maintenant/ }));
		expect(
			await screen.findByText(
				"Un audit de ce projet est déjà en cours, veuillez patienter.",
			),
		).toBeInTheDocument();
		// Pas de relecture sur un refus.
		expect(historiques()).toHaveLength(1);
	});

	test("un projet distant n'a pas de bouton d'audit", async () => {
		mockFetch({ ...base, "GET /api/projects/7": projet({ is_remote: true }) });
		monte();
		await screen.findByRole("heading", { level: 1, name: "Mon API" });
		expect(
			screen.queryAllByRole("button", { name: /Auditer maintenant/ }),
		).toHaveLength(0);
		expect(screen.getByText("Distant")).toBeInTheDocument();
	});

	test("un projet inconnu est dit introuvable, en français", async () => {
		mockFetch({
			"GET /api/projects/7": { status: 404, body: { error: "Not found" } },
			"GET /api/projects/7/history": {
				status: 404,
				body: { error: "Projet introuvable" },
			},
		});
		monte();
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Projet introuvable.",
		);
	});

	test("un identifiant illisible n'appelle pas le serveur", async () => {
		mockFetch({});
		monte("/projects/abc");
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Identifiant de projet invalide.",
		);
		expect(fetchCalls()).toHaveLength(0);
	});

	test("« Voir le triage » mène au triage filtré sur le projet", async () => {
		mockFetch(base);
		monte();
		await screen.findByRole("heading", { level: 1, name: "Mon API" });
		fireEvent.click(screen.getByRole("button", { name: /Voir le triage/ }));
		expect(screen.getByTestId("route")).toHaveTextContent("/triage?project=7");
	});

	test("le lien de retour ramène à la liste", async () => {
		mockFetch(base);
		monte();
		await screen.findByRole("heading", { level: 1, name: "Mon API" });
		expect(
			screen.getByRole("link", { name: /Retour aux projets/ }),
		).toHaveAttribute("href", "/projects");
	});
});
