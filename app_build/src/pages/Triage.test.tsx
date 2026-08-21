import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { CveGroup, CveOccurrence } from "@/lib/aggregator";
import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { Triage } from "./Triage";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function occ(over: Partial<CveOccurrence> = {}): CveOccurrence {
	return {
		projectId: 7,
		projectName: "Mon API",
		tool: "npm",
		package: "lodash",
		severity: "high",
		versionRange: null,
		fixedIn: null,
		title: "Prototype pollution",
		link: null,
		status: "pending",
		note: "",
		cvssVector: null,
		ageInDays: 5,
		firstSeenAt: null,
		publishedAt: null,
		isBaseline: false,
		isGlobal: false,
		...over,
	};
}

function groupe(over: Partial<CveGroup> = {}): CveGroup {
	return {
		cve: "CVE-2024-1",
		ref: "CVE-2024-1",
		worst: "high",
		occurrences: [occ()],
		cvssVector: null,
		maxBaselineAgeInDays: 0,
		maxSlaAgeInDays: 5,
		hasBaseline: false,
		hasNetDiscovery: true,
		...over,
	};
}

/** N groupes sur N packages distincts, pour dépasser une page. */
function beaucoup(n: number): CveGroup[] {
	return Array.from({ length: n }, (_, i) =>
		groupe({
			cve: `CVE-2024-${i}`,
			ref: `CVE-2024-${i}`,
			occurrences: [occ({ package: `pkg-${i}` })],
		}),
	);
}

const base = {
	"GET /api/cves": [] as CveGroup[],
	"GET /api/tickets/list": [] as unknown[],
	"GET /api/settings": { JIRA_BASE_URL: "https://jira.example" },
};

function monte(route = "/triage") {
	return render(
		<MemoryRouter initialEntries={[route]}>
			<Triage />
		</MemoryRouter>,
	);
}

const gets = () => fetchCalls().filter((c) => c.url === "/api/cves");
const posts = () => fetchCalls().filter((c) => c.method === "POST");

describe("Triage", () => {
	afterEach(restoreFetch);

	test("interroge les trois sources au montage", async () => {
		mockFetch(base);
		monte();
		await waitFor(() => {
			expect(fetchCalls().length).toBeGreaterThanOrEqual(3);
		});
		const urls = fetchCalls().map((c) => c.url);
		expect(urls).toContain("/api/cves");
		expect(urls).toContain("/api/tickets/list");
		expect(urls).toContain("/api/settings");
	});

	test("sans CVE, l'écran annonce un écosystème sain", async () => {
		mockFetch(base);
		monte();
		expect(
			await screen.findByText("Votre écosystème est sain !"),
		).toBeInTheDocument();
	});

	test("un chargement en échec affiche le même message — faux négatif", async () => {
		// Défaut N6/UX1 de l'audit : `fetchCves` avale l'erreur, `cves` reste vide,
		// et l'écran annonce « Votre écosystème est sain ! » alors que l'API est
		// tombée. C'est le pire mode de défaillance pour un outil de sécurité.
		// Comportement documenté ici, pas validé.
		mockFetch({ ...base, "GET /api/cves": { networkError: "ECONNREFUSED" } });
		monte();
		expect(
			await screen.findByText("Votre écosystème est sain !"),
		).toBeInTheDocument();
	});

	test("les groupes sont réagrégés par projet et package", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [
				groupe({ cve: "CVE-1", ref: "CVE-1" }),
				// Même package, même projet : doit se fondre dans le même groupe.
				groupe({ cve: "CVE-2", ref: "CVE-2" }),
			],
		});
		monte();
		await waitFor(() => {
			expect(screen.getAllByText("lodash")).toHaveLength(1);
		});
	});

	test("le filtre projet de l'URL restreint la liste", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [
				groupe({ occurrences: [occ({ projectId: 7, package: "lodash" })] }),
				groupe({
					cve: "CVE-9",
					ref: "CVE-9",
					occurrences: [
						occ({ projectId: 8, projectName: "Front", package: "axios" }),
					],
				}),
			],
		});
		monte("/triage?project=7");
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});
		expect(screen.queryAllByText("axios")).toHaveLength(0);
		expect(screen.getByText("Filtré par projet")).toBeInTheDocument();
	});

	test("le filtre CVE de l'URL est annoncé et appliqué", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [
				groupe({ cve: "CVE-2024-1", ref: "CVE-2024-1" }),
				groupe({
					cve: "CVE-2024-9",
					ref: "CVE-2024-9",
					occurrences: [occ({ package: "axios" })],
				}),
			],
		});
		monte("/triage?cve=CVE-2024-1");
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});
		expect(screen.queryAllByText("axios")).toHaveLength(0);
		expect(screen.getByText(/Filtré par CVE/)).toBeInTheDocument();
	});

	test("Zero-Inbox masque les CVE déjà traitées", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [groupe({ occurrences: [occ({ status: "ignored" })] })],
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: /Zero-Inbox/ }));
		await waitFor(() => {
			expect(
				screen.getByText("Votre écosystème est sain !"),
			).toBeInTheDocument();
		});
	});

	test("annoter envoie le statut et la note au serveur", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [groupe()],
			"POST /api/annotations": { body: {} },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});

		// Ouvrir le détail puis marquer « Faux positif ».
		fireEvent.click(screen.getByText("lodash"));
		fireEvent.click(
			await screen.findByRole("button", { name: /Faux positif/ }),
		);

		await waitFor(() => {
			expect(posts()).toHaveLength(1);
		});
		expect(posts()[0]?.url).toBe("/api/annotations");
		// N32 : un changement de statut n'envoie que le statut. La note absente du
		// corps est préservée en base par `upsertAnnotation` ; l'envoyer à `""`
		// détruisait l'analyse du référent à chaque passage en « faux positif ».
		expect(posts()[0]?.body).toEqual({
			cve: "CVE-2024-1",
			projectId: 7,
			status: "ignored",
		});
	});

	test("après annotation, la liste des CVE est rechargée", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [groupe()],
			"POST /api/annotations": { body: {} },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});
		const avant = gets().length;

		fireEvent.click(screen.getByText("lodash"));
		fireEvent.click(
			await screen.findByRole("button", { name: /Faux positif/ }),
		);

		await waitFor(() => {
			expect(gets().length).toBe(avant + 1);
		});
	});

	test("la modale de détail se ferme après une seule décision", async () => {
		// Défaut N9/UX3 : chaque bouton de statut appelle `onActionComplete`, câblé
		// sur `setSelectedGroup(null)`. Un package à 8 CVE impose donc 8 cycles
		// ouvrir/statuer/rouvrir. Documenté, pas validé.
		mockFetch({
			...base,
			"GET /api/cves": [
				groupe({ cve: "CVE-1", ref: "CVE-1" }),
				groupe({ cve: "CVE-2", ref: "CVE-2" }),
			],
			"POST /api/annotations": { body: {} },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText("lodash"));
		expect(await screen.findByRole("dialog")).toBeInTheDocument();

		fireEvent.click(
			(
				await screen.findAllByRole("button", { name: /Faux positif/ })
			)[0] as HTMLElement,
		);
		await waitFor(() => {
			expect(screen.queryAllByRole("dialog")).toHaveLength(0);
		});
	});

	test("la pagination ne retombe pas page 1 après une annotation", async () => {
		// Défaut N9/UX3, seconde moitié : `useEffect(() => setPage(1), [cves, …])`
		// et `cves` est un tableau neuf à chaque refetch. Le référent qui
		// travaillait page 2 est renvoyé au début après *chaque* décision.
		// Documenté, pas validé.
		mockFetch({
			...base,
			"GET /api/cves": beaucoup(15),
			"POST /api/annotations": { body: {} },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText(/Affichage de/)).toBeInTheDocument();
		});
		// 15 groupes, 10 par page.
		expect(screen.getByText(/Affichage de/).textContent).toContain("1");

		// Aller page 2. Les boutons de pagination n'ont que des icônes ; le
		// « suivant » est le seul bouton sans texte encore actif en page 1.
		const suivant = screen
			.getAllByRole("button")
			.filter((b) => b.textContent === "" && !b.hasAttribute("disabled"));
		fireEvent.click(suivant[suivant.length - 1] as HTMLElement);

		await waitFor(() => {
			expect(screen.getByText(/Affichage de/).textContent).toContain("11");
		});

		// Annoter depuis la page 2.
		const paquets = screen.getAllByText(/^pkg-1[0-4]$/);
		fireEvent.click(paquets[0] as HTMLElement);
		fireEvent.click(
			(
				await screen.findAllByRole("button", { name: /Faux positif/ })
			)[0] as HTMLElement,
		);

		// Mesure du 21/08/2026 : la page **ne** revient pas à 1. Le refetch a bien
		// lieu (deux « GET /api/cves » enregistrés) et l'effet a bien `cves` en
		// dépendance, mais l'affichage reste sur la seconde page.
		//
		// L'assertion précédente — `toContain("Affichage de 1")` — passait sur un
		// préfixe : « Affichage de 11 à 15 » contient « Affichage de 1 ». Elle ne
		// pouvait donc pas distinguer les deux pages, et validait le défaut à tort.
		// Corrigée en exact, elle montre que cette moitié de N9 n'est pas
		// reproductible en l'état.
		await new Promise((r) => setTimeout(r, 300));
		expect(screen.getByText(/Affichage de/).textContent).toBe(
			"Affichage de 11 à 15 sur 15 packages",
		);
	});
});

/**
 * Contrats attendus — à activer au correctif.
 *
 * Chaque test ci-dessous énonce le comportement que `CONTEXT.md` demande, sur un
 * point où le code s'en écarte aujourd'hui. Ils sont marqués `test.failing` :
 * Bun exécute le corps et **attend son échec**, donc la suite reste verte tant
 * que le défaut existe.
 *
 * Le jour où le défaut est corrigé, le test se met à passer et Bun le signale en
 * rouge — « this test is marked as failing but it passed. Remove `.failing` if
 * tested behavior now works ». Il est donc impossible de corriger le code sans
 * reprendre le test.
 *
 * Marche à suivre au correctif : retirer `.failing`, puis supprimer le test
 * « écart documenté » correspondant, qui épinglait l'ancien comportement.
 */

describe("contrats attendus — à activer au correctif", () => {
	// N9 — la modale doit rester ouverte et refléter le nouveau statut. La cause
	// profonde est que `selectedGroup` est un instantané figé issu du `useMemo` :
	// après refetch, le memo est recalculé mais l'objet retenu reste l'ancien.
	// Fermer la modale masque cette désynchronisation au lieu de la corriger.
	//
	// Correctif attendu (docs/ISSUE.md#n9) : conserver la **clé** du groupe et
	// dériver le groupe affiché depuis `packageGroups`.
	test.failing("la modale reste ouverte après une décision (N9)", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [
				groupe({ cve: "CVE-1", ref: "CVE-1" }),
				groupe({ cve: "CVE-2", ref: "CVE-2" }),
			],
			"POST /api/annotations": { body: {} },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText("lodash"));
		expect(await screen.findByRole("dialog")).toBeInTheDocument();

		fireEvent.click(
			(
				await screen.findAllByRole("button", { name: /Faux positif/ })
			)[0] as HTMLElement,
		);

		// La modale doit toujours être là, pour enchaîner la CVE suivante.
		await new Promise((r) => setTimeout(r, 200));
		expect(screen.queryAllByRole("dialog")).toHaveLength(1);
	});
});
