import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { StatsResponse } from "@/routes/stats";
import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { mockEventSource, restoreEventSource } from "@/test/sse";
import { App } from "./App";

/**
 * `App` porte l'orchestration : chargement des statistiques, audit global,
 * raccourci clavier, et les deux modales de niveau application.
 *
 * Deux contraintes de test :
 *  - `fetchStats(true)` impose un `setTimeout(1000)` artificiel au premier
 *    chargement (le loader affiche des messages qui défilent). Les attentes
 *    portent donc un `timeout` explicite.
 *  - la page monte `MainLayout`, donc `Console` (EventSource) et `Overview`,
 *    donc `HistoryChart` (`/api/history-global`).
 *
 * ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`.
 */

let sse: ReturnType<typeof mockEventSource>;

function stats(over: Partial<StatsResponse> = {}): StatsResponse {
	return {
		monitoredProjects: 3,
		criticalVulnerabilities: 2,
		pendingCves: 5,
		lastSync: "2026-08-21 09:00:00",
		healthGrade: "C",
		topProjects: [],
		topCves: [],
		...over,
	};
}

const base = {
	"GET /api/stats": stats(),
	"GET /api/history-global?days=7": [],
};

function monte(route = "/") {
	return render(
		<MemoryRouter initialEntries={[route]}>
			<App />
		</MemoryRouter>,
	);
}

const post = () => fetchCalls().filter((c) => c.method === "POST");

/**
 * Attend la fin du chargement initial.
 *
 * « Failles Critiques » est le *libellé* de la tuile : il est présent dès le
 * premier rendu, pendant que la valeur affiche encore « ... ». Le seul signal
 * fiable est la disparition du loader global, qui porte le titre « AEGIS ».
 */
async function attendreChargement() {
	await waitFor(
		() => {
			expect(screen.queryAllByText("AEGIS")).toHaveLength(0);
		},
		{ timeout: 3000 },
	);
}

/**
 * Avertissements React captés pendant le test courant.
 *
 * React signale une clé dupliquée par `console.error` sans faire échouer le
 * rendu : sans cette capture, la collision reste invisible pour la suite.
 */
let avertissements: string[] = [];
const consoleErrorOriginal = console.error;

describe("App", () => {
	beforeEach(() => {
		sse = mockEventSource();
		avertissements = [];
		console.error = (...args: unknown[]) => {
			avertissements.push(args.map(String).join(" "));
		};
	});
	afterEach(() => {
		console.error = consoleErrorOriginal;
		restoreEventSource();
		restoreFetch();
	});

	test("charge les statistiques au montage", async () => {
		mockFetch(base);
		monte();
		await waitFor(() => {
			expect(fetchCalls().map((c) => c.url)).toContain("/api/stats");
		});
	});

	test("affiche le loader global pendant le premier chargement", () => {
		// Le délai artificiel de 1 s garantit que le loader est visible.
		mockFetch(base);
		monte();
		expect(screen.getByText("AEGIS")).toBeInTheDocument();
	});

	test("après chargement, la vue d'ensemble est rendue", async () => {
		mockFetch(base);
		monte();
		await attendreChargement();
		expect(screen.getByText("Failles Critiques")).toBeInTheDocument();
		// La valeur réelle a remplacé l'indicateur de chargement.
		expect(screen.queryAllByText("...")).toHaveLength(0);
	});

	test("le compteur de CVE en attente atteint l'en-tête", async () => {
		mockFetch(base);
		monte();
		await attendreChargement();
		// Le badge de l'en-tête porte le nombre ; il peut apparaître ailleurs sur
		// la vue d'ensemble, donc on vérifie la présence, pas l'unicité.
		expect(screen.getAllByText("5").length).toBeGreaterThan(0);
	});

	test("un échec de /api/stats est signalé, pas affiché comme un parc sain (N6)", async () => {
		// C'était le pire mode de défaillance de l'outil : `fetchStats` avalait
		// l'erreur et l'écran sortait du chargement en annonçant « 0 faille
		// critique ». Rien ne distinguait « rien à traiter » de « je n'ai pas pu
		// lire les données ».
		mockFetch({
			...base,
			"GET /api/stats": { networkError: "ECONNREFUSED" },
		});
		monte();
		await attendreChargement();

		// Un bandeau annonce l'échec…
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		// …et les chiffres de sécurité ne sont pas inventés.
		expect(screen.getAllByText("—").length).toBeGreaterThan(0);
		expect(screen.queryAllByText("0")).toHaveLength(0);
	});

	test("le bandeau d'échec propose de réessayer, et le rechargement aboutit", async () => {
		mockFetch({
			...base,
			"GET /api/stats": { networkError: "ECONNREFUSED" },
		});
		monte();
		await attendreChargement();
		await screen.findByRole("alert");

		// Le second appel réussit : le bandeau doit disparaître.
		mockFetch({ ...base });
		fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));

		await waitFor(() => {
			expect(screen.queryAllByRole("alert")).toHaveLength(0);
		});
	});

	test("Ctrl+Shift+D bascule vers /debug puis revient", async () => {
		mockFetch(base);
		monte();
		await attendreChargement();

		fireEvent.keyDown(window, { key: "D", ctrlKey: true, shiftKey: true });
		expect(await screen.findByText("Design System")).toBeInTheDocument();

		fireEvent.keyDown(window, { key: "D", ctrlKey: true, shiftKey: true });
		await waitFor(() => {
			expect(screen.getByText("Failles Critiques")).toBeInTheDocument();
		});
	});

	test("la console n'est pas montée sur /debug", async () => {
		// `/debug` passe par `BlankLayout`, qui n'inclut pas la console — c'est ce
		// qui fait perdre la trace au passage (défaut FE11).
		mockFetch(base);
		monte("/debug");
		await screen.findByText("Design System");
		expect(sse.instances).toHaveLength(0);
	});

	test("l'audit global couvre les projets non ignorés", async () => {
		mockFetch({
			...base,
			"GET /api/projects": [
				{ id: 7, name: "Mon API", ignored: false },
				{ id: 8, name: "Front", ignored: false },
				{ id: 9, name: "EOL", ignored: true },
			],
			"POST /api/projects/7/audit": {
				body: { run: { total: 1, counts: { critical: 1 } } },
			},
			"POST /api/projects/8/audit": {
				body: { run: { total: 0, counts: {} } },
			},
			"POST /api/reports": { body: { id: 1, projects_audited: 2 } },
		});
		monte();
		await attendreChargement();

		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);

		await waitFor(
			() => {
				expect(post().filter((c) => c.url.includes("/audit"))).toHaveLength(2);
			},
			{ timeout: 3000 },
		);
		const audits = post().filter((c) => c.url.includes("/audit"));
		expect(audits.map((c) => c.url).sort()).toEqual([
			"/api/projects/7/audit",
			"/api/projects/8/audit",
		]);
	});

	test("le périmètre suit le filtre par tag de l'URL (N8)", async () => {
		// §2 fixe le périmètre aux projets **visibles**. Le filtre vivait dans
		// l'état local de la page Projets, auquel `App` n'a pas accès : filtrer sur
		// « prod » pour n'auditer que le projet concerné en auditait quand même
		// tous. Il est désormais porté par l'URL.
		mockFetch({
			...base,
			"GET /api/projects": [
				{ id: 7, name: "Mon API", ignored: false, tags: ["prod"] },
				{ id: 8, name: "Front", ignored: false, tags: ["staging"] },
			],
			"POST /api/projects/7/audit": {
				body: { run: { total: 0, counts: {} } },
			},
			"POST /api/reports": { body: { id: 1, projects_audited: 1 } },
		});
		monte("/?tag=prod");
		await attendreChargement();

		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);

		await waitFor(() =>
			expect(post().filter((c) => c.url.includes("/audit"))).toHaveLength(1),
		);
		expect(post().find((c) => c.url.includes("/audit"))?.url).toBe(
			"/api/projects/7/audit",
		);
	});

	test("l'audit global est parallèle, borné à quatre (N8)", async () => {
		// Séquentiel, quinze projets à ~8 s : deux minutes au lieu de trente
		// secondes. Le pool est vérifié en observant combien d'appels partent avant
		// qu'aucune réponse n'ait été rendue.
		const projets = Array.from({ length: 6 }, (_, i) => ({
			id: 10 + i,
			name: `p${i}`,
			ignored: false,
		}));
		const routes: Record<string, unknown> = { ...base };
		routes["GET /api/projects"] = projets;
		for (const p of projets) {
			routes[`POST /api/projects/${p.id}/audit`] = {
				body: { run: { total: 0, counts: {} } },
				delayMs: 120,
			};
		}
		routes["POST /api/reports"] = { body: { id: 1, projects_audited: 6 } };
		mockFetch(routes);
		monte();
		await attendreChargement();

		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);

		// Mesure prise **avant** qu'aucune réponse n'ait été rendue (30 ms contre
		// 120 ms de latence simulée) : quatre appels doivent déjà être partis. Une
		// exécution séquentielle n'en montrerait qu'un. Une attente sur « au moins
		// 4 » ne prouverait rien — le séquentiel finit par y passer aussi.
		await new Promise((r) => setTimeout(r, 30));
		expect(post().filter((c) => c.url.includes("/audit"))).toHaveLength(4);

		// Et le pool ne dépasse pas quatre : les deux derniers attendent un créneau.
		await waitFor(
			() =>
				expect(post().filter((c) => c.url.includes("/audit"))).toHaveLength(6),
			{ timeout: 3000 },
		);
	});

	test("la progression est affichée sans bloquer la page (N8)", async () => {
		// Le voile plein écran floutait l'application entière, console live
		// comprise. La barre est non modale.
		const projets = Array.from({ length: 4 }, (_, i) => ({
			id: 20 + i,
			name: `bar-${i}`,
			ignored: false,
		}));
		const routes: Record<string, unknown> = { ...base };
		routes["GET /api/projects"] = projets;
		for (const p of projets) {
			routes[`POST /api/projects/${p.id}/audit`] = {
				body: { run: { total: 0, counts: {} } },
				delayMs: 150,
			};
		}
		routes["POST /api/reports"] = { body: { id: 1, projects_audited: 4 } };
		mockFetch(routes);
		monte();
		await attendreChargement();

		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);

		expect(await screen.findByText(/Audit global — /)).toBeInTheDocument();
		// Aucun voile plein écran : la navigation et la console restent utilisables.
		expect(document.querySelector(".fixed.inset-0")).toBeNull();
	});

	test("l'audit global est annulable (N8)", async () => {
		// Aucun `AbortController` n'existait dans le frontend : un `npm audit` qui
		// pend bloquait l'application, et le seul recours était de recharger la page.
		const projets = Array.from({ length: 8 }, (_, i) => ({
			id: 30 + i,
			name: `annul-${i}`,
			ignored: false,
		}));
		const routes: Record<string, unknown> = { ...base };
		routes["GET /api/projects"] = projets;
		for (const p of projets) {
			routes[`POST /api/projects/${p.id}/audit`] = {
				body: { run: { total: 0, counts: {} } },
				delayMs: 200,
			};
		}
		routes["POST /api/reports"] = { body: { id: 1, projects_audited: 8 } };
		mockFetch(routes);
		monte();
		await attendreChargement();

		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);
		await screen.findByText(/Audit global — /);

		fireEvent.click(screen.getByRole("button", { name: /Annuler/ }));

		// La barre disparaît, et les projets non lancés ne partent jamais : le lot
		// s'arrête au lieu d'aller au bout.
		await waitFor(() =>
			expect(screen.queryAllByText(/Audit global — /)).toHaveLength(0),
		);
		expect(post().filter((c) => c.url.includes("/audit")).length).toBeLessThan(
			8,
		);
	});

	test("un audit en échec n'est pas compté comme un projet sain (N6)", async () => {
		// Un 500 renvoie `{success:false}` sans `run` : le projet était compté pour
		// zéro vulnérabilité, et ce total faux **persisté** via POST /api/reports.
		// Vingt projets en échec produisaient « 20 projets · 0 vulnérabilité ».
		mockFetch({
			...base,
			"GET /api/projects": [{ id: 7, name: "Mon API", ignored: false }],
			"POST /api/projects/7/audit": {
				status: 500,
				body: { success: false, error: "Un audit est déjà en cours" },
			},
			"POST /api/reports": { body: { id: 1, projects_audited: 0 } },
		});
		monte();
		await attendreChargement();

		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);

		await waitFor(
			() => {
				expect(post().filter((c) => c.url === "/api/reports")).toHaveLength(1);
			},
			{ timeout: 3000 },
		);
		const rapport = post().find((c) => c.url === "/api/reports");
		// Le projet en échec n'est pas compté parmi les projets audités.
		expect(rapport?.body).toMatchObject({
			projects_audited: 0,
			total_vulnerabilities: 0,
		});
	});

	test("deux projets de même nom en échec sont tous deux listés", async () => {
		// Le nom d'un projet n'est pas unique — seule la cible d'audit l'est. Deux
		// projets homonymes en échec produisaient le **même** message, donc la même
		// clé React : « Encountered two children with the same key ». React omettait
		// alors l'un des deux, et le référent croyait n'avoir qu'un échec.
		mockFetch({
			...base,
			"GET /api/projects": [
				{ id: 7, name: "myTemp", ignored: false },
				{ id: 8, name: "myTemp", ignored: false },
			],
			"POST /api/projects/7/audit": {
				status: 403,
				body: { error: "Chemin non autorisé par AEGIS_ALLOWED_ROOTS" },
			},
			"POST /api/projects/8/audit": {
				status: 403,
				body: { error: "Chemin non autorisé par AEGIS_ALLOWED_ROOTS" },
			},
			"POST /api/reports": { body: { id: 1, projects_audited: 0 } },
		});
		monte();
		await attendreChargement();

		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);

		expect(
			await screen.findByText(/2 projets en échec/, undefined, {
				timeout: 3000,
			}),
		).toBeInTheDocument();
		// Les deux lignes sont rendues…
		expect(
			screen.getAllByText(/Chemin non autorisé par AEGIS_ALLOWED_ROOTS/),
		).toHaveLength(2);
		// …et surtout, sans avertissement de clé dupliquée. React rend aujourd'hui
		// les deux enfants malgré la collision, mais s'en réserve le droit :
		// « the behavior is unsupported and could change in a future version ».
		// C'est donc l'avertissement qu'il faut épingler, pas le rendu.
		expect(avertissements.filter((m) => m.includes("same key"))).toHaveLength(
			0,
		);
	});

	test("les projets en échec sont énumérés dans la modale de rapport (N6)", async () => {
		mockFetch({
			...base,
			"GET /api/projects": [{ id: 7, name: "Mon API", ignored: false }],
			"POST /api/projects/7/audit": {
				status: 500,
				body: { success: false, error: "Un audit est déjà en cours" },
			},
			"POST /api/reports": { body: { id: 1, projects_audited: 0 } },
		});
		monte();
		await attendreChargement();

		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);

		// Le résumé doit nommer l'échec, pas le taire.
		expect(
			await screen.findByText(/1 projet en échec/, undefined, {
				timeout: 3000,
			}),
		).toBeInTheDocument();
		expect(screen.getByText(/Un audit est déjà en cours/)).toBeInTheDocument();
	});

	test("un run en erreur est traité comme un échec, pas comme un projet sain (N6)", async () => {
		// Un run `status:"error"` a des compteurs à zéro. Le compter comme un
		// succès faisait passer un outil d'audit introuvable pour un parc sain.
		mockFetch({
			...base,
			"GET /api/projects": [{ id: 7, name: "Mon API", ignored: false }],
			"POST /api/projects/7/audit": {
				body: {
					success: true,
					deduped: false,
					run: {
						status: "error",
						error: "npm: aucune sortie (exit 1)",
						total: 0,
						counts: {
							critical: 0,
							high: 0,
							moderate: 0,
							low: 0,
							info: 0,
							unknown: 0,
						},
						vulnerabilities: [],
					},
				},
			},
			"POST /api/reports": { body: { id: 1, projects_audited: 0 } },
		});
		monte();
		await attendreChargement();

		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);

		await waitFor(
			() => {
				expect(post().filter((c) => c.url === "/api/reports")).toHaveLength(1);
			},
			{ timeout: 3000 },
		);
		expect(post().find((c) => c.url === "/api/reports")?.body).toMatchObject({
			projects_audited: 0,
		});
	});

	test("le compte-rendu d'audit est affiché à la fin", async () => {
		mockFetch({
			...base,
			"GET /api/projects": [{ id: 7, name: "Mon API", ignored: false }],
			"POST /api/projects/7/audit": {
				body: { run: { total: 2, counts: { critical: 2 } } },
			},
			"POST /api/reports": {
				body: { id: 1, projects_audited: 1, total_vulnerabilities: 2 },
			},
		});
		monte();
		await attendreChargement();

		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);
		expect(
			await screen.findByText("Audit Terminé !", {}, { timeout: 3000 }),
		).toBeInTheDocument();
	});

	test("les statistiques sont rechargées après un audit global", async () => {
		mockFetch({
			...base,
			"GET /api/projects": [{ id: 7, name: "Mon API", ignored: false }],
			"POST /api/projects/7/audit": {
				body: { run: { total: 0, counts: {} } },
			},
			"POST /api/reports": { body: { id: 1 } },
		});
		monte();
		await attendreChargement();
		const avant = fetchCalls().filter((c) => c.url === "/api/stats").length;

		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);
		await waitFor(
			() => {
				expect(fetchCalls().filter((c) => c.url === "/api/stats").length).toBe(
					avant + 1,
				);
			},
			{ timeout: 3000 },
		);
	});
});
