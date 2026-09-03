import { afterEach, describe, expect, test } from "bun:test";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { Ticket } from "@/db/tickets";
import type { CveGroup, CveOccurrence } from "@/lib/aggregator";
import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { TicketCreate } from "./TicketCreate";

/**
 * La page lit cinq routes au montage — CVE, tickets, réglages, types Jira, puis
 * le brouillon dès qu'une CVE est cochée. Toutes déclarées dans `base`.
 *
 * ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`.
 */

function occ(over: Partial<CveOccurrence> = {}): CveOccurrence {
	return {
		projectId: 7,
		projectName: "Mon API",
		tool: "npm",
		package: "lodash",
		severity: "high",
		versionRange: "<4",
		fixedIn: "4.17.21",
		title: "Prototype pollution",
		link: null,
		status: "pending",
		note: "",
		...over,
	};
}

const cves: CveGroup[] = [
	{ cve: "CVE-1", ref: "CVE-1", worst: "high", occurrences: [occ()] },
	{
		cve: "CVE-2",
		ref: "CVE-2",
		worst: "critical",
		occurrences: [occ({ severity: "critical", title: "RCE" })],
	},
	{
		cve: "CVE-3",
		ref: "CVE-3",
		worst: "low",
		occurrences: [occ({ package: "axios", severity: "low", title: "SSRF" })],
	},
	// Un autre projet : ne doit jamais apparaître ici.
	{
		cve: "CVE-4",
		ref: "CVE-4",
		worst: "high",
		occurrences: [occ({ projectId: 8, projectName: "Autre", package: "hono" })],
	},
];

const base = {
	"GET /api/cves": cves,
	"GET /api/tickets/list": [] as Ticket[],
	"GET /api/settings": { JIRA_BASE_URL: "https://jira.example" },
	"GET /api/tickets/issue-types": { types: ["Tâche", "Bug"] },
	"POST /api/tickets": { markdown: "# [Aegis] Remédiation lodash" },
};

function Espion() {
	const { pathname, search } = useLocation();
	return <span data-testid="route">{pathname + search}</span>;
}

function monte(route = "/tickets/new?project=7&package=lodash") {
	return render(
		<MemoryRouter initialEntries={[route]}>
			<Routes>
				<Route path="/tickets/new" element={<TicketCreate />} />
				<Route path="*" element={<span>ailleurs</span>} />
			</Routes>
			<Espion />
		</MemoryRouter>,
	);
}

const drafts = () =>
	fetchCalls().filter((c) => c.method === "POST" && c.url === "/api/tickets");
const creations = () =>
	fetchCalls().filter(
		(c) => c.method === "POST" && c.url === "/api/tickets/create",
	);

/** Attend l'aperçu : il n'arrive qu'après la lecture des CVE et le brouillon. */
async function attendreApercu() {
	await screen.findByText("# [Aegis] Remédiation lodash");
}

describe("TicketCreate", () => {
	afterEach(restoreFetch);

	test("affiche le paquet de l'URL, toutes ses CVE cochées, et l'aperçu", async () => {
		mockFetch(base);
		monte();
		await attendreApercu();
		expect(screen.getByText("Mon API")).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Paquet" })).toHaveTextContent(
			"lodash (2)",
		);
		const cases = screen.getAllByRole("checkbox");
		expect(cases).toHaveLength(2);
		expect(cases.every((c) => c.getAttribute("aria-checked") === "true")).toBe(
			true,
		);
		// Le brouillon décrit la sélection courante, pas « tout le paquet » implicite.
		expect(drafts().at(-1)?.body).toEqual({
			projectId: 7,
			packageName: "lodash",
			cves: ["CVE-1", "CVE-2"],
		});
		// Le projet 8 n'a rien à faire ici.
		expect(screen.queryAllByText("CVE-4")).toHaveLength(0);
	});

	test("décocher une CVE régénère l'aperçu et restreint le ticket créé", async () => {
		mockFetch({
			...base,
			"POST /api/tickets/create": {
				body: { success: true, ticketRef: "SEC-1" },
			},
		});
		monte();
		await attendreApercu();
		fireEvent.click(screen.getByRole("checkbox", { name: "CVE-2" }));
		await waitFor(() => {
			expect(drafts().at(-1)?.body).toEqual({
				projectId: 7,
				packageName: "lodash",
				cves: ["CVE-1"],
			});
		});
		expect(screen.getByText("1 sur 2 sélectionnées")).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText(/Notes additionnelles/), {
			target: { value: "Exposé publiquement" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Créer dans Jira/ }));
		await waitFor(() => {
			expect(creations()).toHaveLength(1);
		});
		expect(creations()[0]?.body).toEqual({
			projectId: 7,
			packageName: "lodash",
			cves: ["CVE-1"],
			notes: "Exposé publiquement",
			// Premier type proposé par Jira, faute de choix explicite.
			issueType: "Tâche",
		});
	});

	test("la création réussie affiche la référence et le lien Jira", async () => {
		mockFetch({
			...base,
			"POST /api/tickets/create": {
				body: { success: true, ticketRef: "SEC-1" },
			},
		});
		monte();
		await attendreApercu();
		fireEvent.click(screen.getByRole("button", { name: /Créer dans Jira/ }));
		const statut = await screen.findByRole("status");
		expect(statut).toHaveTextContent("Ticket SEC-1 créé dans Jira.");
		expect(screen.getByRole("link", { name: /Ouvrir SEC-1/ })).toHaveAttribute(
			"href",
			"https://jira.example/browse/SEC-1",
		);
		expect(
			within(statut).getByRole("link", { name: "Retour au triage" }),
		).toHaveAttribute("href", "/triage?project=7");
		// Le formulaire a laissé place au compte-rendu.
		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
	});

	test("un refus du serveur s'affiche, et la page reste", async () => {
		mockFetch({
			...base,
			"POST /api/tickets/create": {
				status: 409,
				body: {
					error:
						"Un ticket identique existe déjà pour cette vulnérabilité (Réf: SEC-42).",
				},
			},
		});
		monte();
		await attendreApercu();
		fireEvent.click(screen.getByRole("button", { name: /Créer dans Jira/ }));
		expect(await screen.findByRole("alert")).toHaveTextContent("SEC-42");
		expect(screen.getAllByRole("checkbox")).toHaveLength(2);
	});

	test("une coupure réseau remonte aussi une erreur", async () => {
		mockFetch({
			...base,
			"POST /api/tickets/create": { networkError: "Failed to fetch" },
		});
		monte();
		await attendreApercu();
		fireEvent.click(screen.getByRole("button", { name: /Créer dans Jira/ }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Failed to fetch",
		);
	});

	test("sans CVE cochée, ni aperçu ni création", async () => {
		mockFetch(base);
		monte();
		await attendreApercu();
		fireEvent.click(screen.getByRole("button", { name: "Aucune" }));
		expect(
			await screen.findByText("Sélectionnez au moins une CVE."),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Créer dans Jira/ }),
		).toBeDisabled();
	});

	test("sans type de ticket, la création attend la saisie", async () => {
		mockFetch({
			...base,
			"GET /api/tickets/issue-types": {
				types: [],
				reason: "Configuration Jira incomplète.",
			},
		});
		monte();
		await attendreApercu();
		const bouton = screen.getByRole("button", { name: /Créer dans Jira/ });
		expect(bouton).toBeDisabled();
		fireEvent.change(screen.getByLabelText("Type de ticket"), {
			target: { value: "Tâche" },
		});
		expect(bouton).toBeEnabled();
	});

	test("un ticket existant sur le paquet est signalé", async () => {
		const ticket: Ticket = {
			id: 1,
			project_id: 7,
			package: "lodash",
			url: "SEC-9",
			cves: ["CVE-1"],
			updated_at: "2026-08-01 10:00:00",
		};
		mockFetch({ ...base, "GET /api/tickets/list": [ticket] });
		monte();
		await attendreApercu();
		const note = screen.getByRole("note");
		expect(note).toHaveTextContent(
			"Un ticket existe déjà pour ce paquet : SEC-9",
		);
		expect(screen.getByRole("link", { name: "SEC-9" })).toHaveAttribute(
			"href",
			"https://jira.example/browse/SEC-9",
		);
	});

	test("changer de paquet met l'URL à jour et recoche tout", async () => {
		mockFetch(base);
		monte();
		await attendreApercu();
		// Radix : `pointerDown` ouvre la liste, l'option se clique par son rôle.
		fireEvent.pointerDown(screen.getByRole("combobox", { name: "Paquet" }), {
			button: 0,
			ctrlKey: false,
			pointerType: "mouse",
		});
		fireEvent.click(await screen.findByRole("option", { name: "axios (1)" }));
		await waitFor(() => {
			expect(screen.getByTestId("route")).toHaveTextContent(
				"/tickets/new?project=7&package=axios",
			);
		});
		const cases = await screen.findAllByRole("checkbox");
		expect(cases).toHaveLength(1);
		expect(cases[0]).toHaveAttribute("aria-checked", "true");
		expect(screen.getByRole("checkbox", { name: "CVE-3" })).toBeInTheDocument();
	});

	test("sans paquet dans l'URL, le premier du projet est pris", async () => {
		mockFetch(base);
		monte("/tickets/new?project=7");
		await waitFor(() => {
			expect(screen.getByTestId("route")).toHaveTextContent("package=axios");
		});
	});

	test("copier écrit l'aperçu dans le presse-papiers", async () => {
		const ecrits: string[] = [];
		const original = navigator.clipboard;
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: (t: string) => ecrits.push(t) },
		});
		try {
			mockFetch(base);
			monte();
			await attendreApercu();
			fireEvent.click(screen.getByRole("button", { name: /Copier/ }));
			expect(ecrits).toEqual(["# [Aegis] Remédiation lodash"]);
			expect(
				await screen.findByRole("button", { name: /Copié/ }),
			).toBeInTheDocument();
		} finally {
			Object.defineProperty(navigator, "clipboard", {
				configurable: true,
				value: original,
			});
		}
	});

	test("sans projet dans l'URL, rien n'est appelé et la consigne est donnée", async () => {
		mockFetch({});
		monte("/tickets/new");
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Projet manquant",
		);
		expect(fetchCalls()).toHaveLength(0);
	});

	test("un projet sans vulnérabilité le dit", async () => {
		mockFetch({ ...base, "GET /api/cves": [] });
		monte("/tickets/new?project=7");
		expect(
			await screen.findByText("Aucune vulnérabilité à traiter pour ce projet."),
		).toBeInTheDocument();
	});

	test("l'échec de lecture des CVE est dit, avec un nouvel essai", async () => {
		mockFetch({
			...base,
			"GET /api/cves": { status: 500, body: { error: "boom" } },
		});
		monte();
		expect(await screen.findByRole("alert")).toHaveTextContent("boom");
		expect(
			screen.getByRole("button", { name: "Réessayer" }),
		).toBeInTheDocument();
	});
});
