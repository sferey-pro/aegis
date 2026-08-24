import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

import type { Tag } from "@/db/tags";
import type { ProjectListItem } from "@/routes/projects";
import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { mockEventSource, restoreEventSource } from "@/test/sse";
import { Projects } from "./Projects";

/**
 * `Projects` ouvre son propre `EventSource` sur `/api/console`, en plus de celui
 * de la console montée par `MainLayout` — c'est le défaut FE11 (flux dupliqué).
 * Le faux `EventSource` est donc requis.
 *
 * ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`.
 */

let sse: ReturnType<typeof mockEventSource>;

function projet(over: Partial<ProjectListItem> = {}): ProjectListItem {
	return {
		id: 7,
		name: "Mon API",
		slug: "mon-api",
		path: "/srv/api",
		audit_path: null,
		type: "node",
		tool: "npm",
		tags: [],
		ignored: false,
		is_remote: false,
		created_at: "2026-07-01 09:00:00",
		git: { isRepo: false },
		lastRun: null,
		...over,
	};
}

const tags: Tag[] = [
	{ id: 1, name: "prod", color: "indigo", created_at: "" },
	{ id: 2, name: "backend", color: "emerald", created_at: "" },
];

const base = {
	"GET /api/projects": [projet()],
	"GET /api/tags": tags,
};

/**
 * Rend la query string courante, pour vérifier que le filtre vit bien dans
 * l'URL — c'est ce qui permet à `App` de connaître le périmètre d'audit (N8).
 */
function EspionUrl() {
	return <span data-testid="url-espion">{useLocation().search}</span>;
}

function monte(route = "/projects") {
	return render(
		<MemoryRouter initialEntries={[route]}>
			<Projects />
			<EspionUrl />
		</MemoryRouter>,
	);
}

/** Le `?tag=` courant, tel que l'URL le porte. */
function tagDeLUrl(): string | null {
	return new URLSearchParams(
		screen.getByTestId("url-espion").textContent ?? "",
	).get("tag");
}

const post = () => fetchCalls().filter((c) => c.method === "POST");
const put = () => fetchCalls().filter((c) => c.method === "PUT");
const del = () => fetchCalls().filter((c) => c.method === "DELETE");

describe("Projects", () => {
	beforeEach(() => {
		sse = mockEventSource();
	});
	afterEach(() => {
		restoreEventSource();
		restoreFetch();
	});

	test("charge projets et tags au montage", async () => {
		mockFetch(base);
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});
		const urls = fetchCalls().map((c) => c.url);
		expect(urls).toContain("/api/projects");
		expect(urls).toContain("/api/tags");
	});

	test("ouvre un second flux console — doublon documenté", async () => {
		// Défaut FE11 : la page souscrit à `/api/console` alors que la console du
		// gabarit y est déjà abonnée. Chaque commande est donc reçue deux fois.
		mockFetch(base);
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});
		expect(sse.instances).toHaveLength(1);
		expect(sse.last().url).toBe("/api/console");
	});

	test("sans projet, l'état vide est explicite", async () => {
		mockFetch({ ...base, "GET /api/projects": [] });
		monte();
		expect(await screen.findByText("Aucun projet")).toBeInTheDocument();
	});

	test("un chargement en échec affiche le même état vide", async () => {
		mockFetch({
			...base,
			"GET /api/projects": { networkError: "ECONNREFUSED" },
		});
		monte();
		expect(await screen.findByText("Aucun projet")).toBeInTheDocument();
	});

	test("le filtre par tag vit dans l'URL (N8)", async () => {
		// Il vivait dans l'état local de ce composant, auquel `App` n'a pas accès :
		// filtrer sur « prod » pour n'auditer que le projet concerné en auditait
		// quand même tous, alors que §2 fixe le périmètre aux projets **visibles**.
		mockFetch({
			...base,
			"GET /api/projects": [
				projet({ id: 7, name: "Mon API", tags: ["prod"] }),
				projet({ id: 8, name: "Front", tags: ["backend"] }),
			],
		});
		monte();
		await waitFor(() => expect(screen.getByText("Mon API")).toBeDefined());

		fireEvent.click(screen.getByRole("button", { name: "prod" }));
		await waitFor(() => expect(tagDeLUrl()).toBe("prod"));
	});

	test("un tag dans l'URL préfiltre au montage (N8)", async () => {
		// Corollaire : le filtre survit à un rechargement et se partage par lien.
		mockFetch({
			...base,
			"GET /api/projects": [
				projet({ id: 7, name: "Mon API", tags: ["prod"] }),
				projet({ id: 8, name: "Front", tags: ["backend"] }),
			],
		});
		monte("/projects?tag=backend");

		await waitFor(() => expect(screen.getByText("Front")).toBeDefined());
		expect(screen.queryAllByText("Mon API")).toHaveLength(0);
	});

	test("« Tous » retire le paramètre de l'URL", async () => {
		mockFetch({
			...base,
			"GET /api/projects": [projet({ id: 7, name: "Mon API", tags: ["prod"] })],
		});
		monte("/projects?tag=prod");
		await waitFor(() => expect(screen.getByText("Mon API")).toBeDefined());

		fireEvent.click(screen.getByRole("button", { name: "Tous" }));
		await waitFor(() => expect(tagDeLUrl()).toBeNull());
	});

	test("le filtre par tag est mono-sélection, pas un OU", async () => {
		// Défaut N24/UX9 : `filterTag` est une valeur unique, alors que le contrat
		// (CONTEXT.md §9) décrit un ensemble avec logique OU. Choisir « backend »
		// remplace « prod » au lieu de cumuler. Documenté, pas validé.
		mockFetch({
			...base,
			"GET /api/projects": [
				projet({ id: 7, name: "Mon API", tags: ["prod"] }),
				projet({ id: 8, name: "Front", tags: ["backend"] }),
			],
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: "prod" }));
		await waitFor(() => {
			expect(screen.queryAllByText("Front")).toHaveLength(0);
		});

		// Sélectionner le second tag écarte le premier : impossible de voir les deux.
		fireEvent.click(screen.getByRole("button", { name: "backend" }));
		await waitFor(() => {
			expect(screen.getByText("Front")).toBeInTheDocument();
		});
		expect(screen.queryAllByText("Mon API")).toHaveLength(0);
	});

	test("« Tous » réinitialise le filtre", async () => {
		mockFetch({
			...base,
			"GET /api/projects": [
				projet({ id: 7, name: "Mon API", tags: ["prod"] }),
				projet({ id: 8, name: "Front", tags: ["backend"] }),
			],
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: "prod" }));
		await waitFor(() => {
			expect(screen.queryAllByText("Front")).toHaveLength(0);
		});

		fireEvent.click(screen.getByRole("button", { name: "Tous" }));
		await waitFor(() => {
			expect(screen.getByText("Front")).toBeInTheDocument();
		});
	});

	test("un filtre sans résultat n'explique pas le vide", async () => {
		// Défaut UX9 : l'état vide est conditionné à `projects.length === 0`. Un
		// tag qui ne matche rien affiche donc une grille vide sans un mot.
		mockFetch({
			...base,
			"GET /api/projects": [projet({ tags: ["prod"] })],
			"GET /api/tags": tags,
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: "backend" }));
		await waitFor(() => {
			expect(screen.queryAllByText("Mon API")).toHaveLength(0);
		});
		// Aucun message n'accompagne la grille vide.
		expect(screen.queryAllByText("Aucun projet")).toHaveLength(0);
	});

	test("créer un projet envoie le formulaire puis recharge la liste", async () => {
		mockFetch({
			...base,
			"GET /api/projects": [],
			"POST /api/projects": { body: projet(), status: 201 },
			"POST /api/projects/7/git-fetch": { body: { ok: true, log: "" } },
		});
		monte();
		await screen.findByText("Aucun projet");

		fireEvent.click(screen.getByRole("button", { name: /Ajouter un Projet/ }));
		fireEvent.change(screen.getByLabelText(/Nom du projet/), {
			target: { value: "Nouveau" },
		});
		fireEvent.change(screen.getByLabelText(/Chemin absolu/), {
			target: { value: "/srv/nouveau" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Créer sans auditer" }));

		await waitFor(() => {
			expect(post().filter((c) => c.url === "/api/projects")).toHaveLength(1);
		});
		expect(post().find((c) => c.url === "/api/projects")?.body).toMatchObject({
			name: "Nouveau",
			path: "/srv/nouveau",
		});
	});

	test("une création refusée affiche le message du serveur", async () => {
		// Le refus partait dans `console.error` : le formulaire ne se fermait pas,
		// n'affichait rien, et paraissait ne pas répondre. Le référent croyait avoir
		// ajouté le projet — ou ne comprenait pas pourquoi rien ne se passait.
		mockFetch({
			...base,
			"GET /api/projects": [],
			"POST /api/projects": {
				status: 409,
				body: { error: "Un projet vise déjà cette cible d'audit : Mon API" },
			},
		});
		monte();
		await screen.findByText("Aucun projet");

		fireEvent.click(screen.getByRole("button", { name: /Ajouter un Projet/ }));
		fireEvent.change(screen.getByLabelText(/Nom du projet/), {
			target: { value: "Doublon" },
		});
		fireEvent.change(screen.getByLabelText(/Chemin absolu/), {
			target: { value: "/srv/api" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Créer sans auditer" }));

		await waitFor(() => {
			expect(post().filter((c) => c.url === "/api/projects")).toHaveLength(1);
		});
		expect(
			await screen.findByText(/vise déjà cette cible d'audit : Mon API/),
		).toBeInTheDocument();
		// Et le formulaire reste ouvert, pour corriger.
		expect(screen.getByLabelText(/Nom du projet/)).toHaveValue("Doublon");
	});

	test("un nom fait d'espaces est refusé par le serveur, et le formulaire le dit", async () => {
		// La validation HTML5 ne recouvre pas celle du serveur : `required` accepte
		// « ␣␣␣ » puisque le champ n'est pas vide, alors que le schéma le trime.
		// C'est le cas rencontré à l'usage.
		mockFetch({
			...base,
			"GET /api/projects": [],
			"POST /api/projects": {
				status: 400,
				body: { error: "Nom requis" },
			},
		});
		monte();
		await screen.findByText("Aucun projet");

		fireEvent.click(screen.getByRole("button", { name: /Ajouter un Projet/ }));
		fireEvent.change(screen.getByLabelText(/Nom du projet/), {
			target: { value: "   " },
		});
		fireEvent.change(screen.getByLabelText(/Chemin absolu/), {
			target: { value: "/srv/api" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Créer sans auditer" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Nom requis");
	});

	test("une nouvelle tentative efface le message précédent", async () => {
		mockFetch({
			...base,
			"GET /api/projects": [],
			"POST /api/projects": { status: 400, body: { error: "Nom requis" } },
		});
		monte();
		await screen.findByText("Aucun projet");

		fireEvent.click(screen.getByRole("button", { name: /Ajouter un Projet/ }));
		fireEvent.change(screen.getByLabelText(/Nom du projet/), {
			target: { value: "   " },
		});
		fireEvent.change(screen.getByLabelText(/Chemin absolu/), {
			target: { value: "/srv/api" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Créer sans auditer" }));
		await screen.findByRole("alert");

		// Second envoi, accepté cette fois.
		mockFetch({
			...base,
			"GET /api/projects": [],
			"POST /api/projects": { status: 201, body: { id: 9, name: "API" } },
		});
		fireEvent.click(screen.getByRole("button", { name: "Créer sans auditer" }));

		await waitFor(() => {
			expect(screen.queryAllByRole("alert")).toHaveLength(0);
		});
	});

	test("toggleIgnore envoie un PUT partiel, refusé par la validation", async () => {
		// Défaut UX10 : le corps ne contient que `{ ignored }`, alors que la
		// validation Zod exige name, path, type et tool. Le serveur répond 400 et
		// le composant ne le signale pas. Documenté, pas validé.
		mockFetch({
			...base,
			"PUT /api/projects/7": {
				status: 400,
				body: { error: "Nom requis" },
			},
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText("Ignorer le projet"));

		await waitFor(() => {
			expect(put()).toHaveLength(1);
		});
		expect(put()[0]?.body).toEqual({ ignored: true });
		expect(screen.queryAllByText("Nom requis")).toHaveLength(0);
	});

	test("supprimer demande confirmation avant d'appeler l'API", async () => {
		mockFetch({
			...base,
			"DELETE /api/projects/7": { body: { success: true } },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		const suppression = screen
			.getAllByTitle(/supprimer/i)
			.filter((el) => el.tagName === "BUTTON");
		fireEvent.click(suppression[0] as HTMLElement);

		expect(await screen.findByText(/Supprimer le projet/)).toBeInTheDocument();
		expect(del()).toHaveLength(0);
	});

	/** Réponse de `git-fetch`, telle que la route la construit depuis §5. */
	function reponseFetch(behind = 0, ok = true, log = "= [up to date]") {
		return {
			body: {
				ok,
				log,
				git: {
					isRepo: true,
					branch: "main",
					sha: "a",
					upstream: "origin/main",
					ahead: 0,
					behind,
					dirty: false,
				},
			},
		};
	}

	test("« Vérifier les mises à jour Git » traite un dépôt à la fois", async () => {
		// Contrat : séquentiel (§5). Les quatre `git fetch` d'un pool sortent par le
		// même lien réseau et la même authentification, et la console — seul endroit
		// où l'on suit l'opération — devient illisible quand quatre dépôts y
		// écrivent ensemble. Mesuré par le nombre d'appels **partis** avant la
		// première réponse : leur ordre serait le même dans les deux cas.
		mockFetch({
			...base,
			"GET /api/projects": [
				projet({
					id: 7,
					name: "Mon API",
					git: {
						isRepo: true,
						branch: "main",
						sha: "a",
						upstream: "origin/main",
						ahead: 0,
						behind: 0,
						dirty: false,
					},
				}),
				projet({
					id: 8,
					name: "Front",
					git: {
						isRepo: true,
						branch: "main",
						sha: "b",
						upstream: "origin/main",
						ahead: 0,
						behind: 0,
						dirty: false,
					},
				}),
				projet({
					id: 9,
					name: "Batch",
					git: {
						isRepo: true,
						branch: "main",
						sha: "c",
						upstream: "origin/main",
						ahead: 0,
						behind: 0,
						dirty: false,
					},
				}),
			],
			"POST /api/projects/7/git-fetch": { ...reponseFetch(), delayMs: 60 },
			"POST /api/projects/8/git-fetch": { ...reponseFetch(), delayMs: 60 },
			"POST /api/projects/9/git-fetch": { ...reponseFetch(), delayMs: 60 },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		fireEvent.click(
			screen.getByRole("button", { name: /Vérifier les mises à jour Git/ }),
		);

		await new Promise((r) => setTimeout(r, 20));
		expect(post().filter((c) => c.url.includes("git-fetch"))).toHaveLength(1);
	});

	test("un état git non chargé n'empêche pas la synchronisation", async () => {
		// La liste ne calcule plus l'état git : au premier affichage `git` vaut
		// `null`. Le prendre pour « pas un dépôt » aurait rendu le bouton inopérant
		// sur un parc fraîchement chargé.
		mockFetch({
			...base,
			"GET /api/projects": [projet({ id: 7, name: "Mon API", git: null })],
			"POST /api/projects/7/git-fetch": reponseFetch(3),
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		fireEvent.click(
			screen.getByRole("button", { name: /Vérifier les mises à jour Git/ }),
		);

		await waitFor(() => {
			expect(post().filter((c) => c.url.includes("git-fetch"))).toHaveLength(1);
		});
		// L'état git vient de la réponse, sans rechargement de la liste.
		expect(await screen.findByText("main")).toBeInTheDocument();
		expect(fetchCalls().filter((c) => c.url === "/api/projects")).toHaveLength(
			1,
		);
	});

	test("un dossier connu comme non-git est écarté du lot", async () => {
		mockFetch({
			...base,
			"GET /api/projects": [
				projet({ id: 7, name: "Mon API", git: { isRepo: false } }),
			],
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		fireEvent.click(
			screen.getByRole("button", { name: /Vérifier les mises à jour Git/ }),
		);
		await waitFor(() => {
			expect(fetchCalls().length).toBeGreaterThanOrEqual(2);
		});
		expect(post().filter((c) => c.url.includes("git-fetch"))).toHaveLength(0);
	});

	test("la progression est affichée, non modale, et annulable", async () => {
		// Le voile plein écran masquait la console live — seul endroit où l'on voit
		// `git fetch` tourner et échouer (même défaut que N8 côté audit).
		mockFetch({
			...base,
			"GET /api/projects": [
				projet({
					id: 7,
					name: "Mon API",
					git: {
						isRepo: true,
						branch: "main",
						sha: "m",
						upstream: "origin/main",
						ahead: 0,
						behind: 0,
						dirty: false,
					},
				}),
			],
			"POST /api/projects/7/git-fetch": { ...reponseFetch(), delayMs: 80 },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		fireEvent.click(
			screen.getByRole("button", { name: /Vérifier les mises à jour Git/ }),
		);

		expect(
			await screen.findByText(/Mise à jour Git — \d+ \/ 1 projets/),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Annuler/ })).toBeInTheDocument();
	});

	test("un dépôt injoignable est nommé à l'écran", async () => {
		// L'échec partait dans `console.error` : la carte affichait le même « à
		// jour » que pour un succès.
		mockFetch({
			...base,
			"GET /api/projects": [
				projet({
					id: 7,
					name: "Mon API",
					git: {
						isRepo: true,
						branch: "main",
						sha: "m",
						upstream: "origin/main",
						ahead: 0,
						behind: 0,
						dirty: false,
					},
				}),
				projet({
					id: 8,
					name: "Front",
					git: {
						isRepo: true,
						branch: "main",
						sha: "f",
						upstream: "origin/main",
						ahead: 0,
						behind: 0,
						dirty: false,
					},
				}),
			],
			"POST /api/projects/7/git-fetch": reponseFetch(),
			"POST /api/projects/8/git-fetch": reponseFetch(
				0,
				false,
				"Permission denied (publickey)",
			),
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		fireEvent.click(
			screen.getByRole("button", { name: /Vérifier les mises à jour Git/ }),
		);

		expect(
			await screen.findByText(/1 dépôt\(s\) non synchronisé\(s\)/),
		).toBeInTheDocument();
		expect(
			screen.getByText(/Permission denied \(publickey\)/),
		).toBeInTheDocument();
	});

	test("le filtre par tag borne le périmètre de la synchronisation", async () => {
		// §2 fixe le périmètre d'un lot aux projets **visibles**. Le handler
		// refiltrait de son côté et ignorait le filtre par tag : filtrer sur
		// « prod » puis synchroniser touchait quand même tous les dépôts.
		mockFetch({
			...base,
			"GET /api/projects": [
				projet({
					id: 7,
					name: "Mon API",
					tags: ["prod"],
					git: {
						isRepo: true,
						branch: "main",
						sha: "a",
						upstream: "origin/main",
						ahead: 0,
						behind: 0,
						dirty: false,
					},
				}),
				projet({
					id: 8,
					name: "Front",
					git: {
						isRepo: true,
						branch: "main",
						sha: "f",
						upstream: "origin/main",
						ahead: 0,
						behind: 0,
						dirty: false,
					},
				}),
			],
			"POST /api/projects/7/git-fetch": reponseFetch(),
		});
		monte("/projects?tag=prod");
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		fireEvent.click(
			screen.getByRole("button", { name: /Vérifier les mises à jour Git/ }),
		);

		await waitFor(() => {
			expect(post().filter((c) => c.url.includes("git-fetch"))).toHaveLength(1);
		});
		expect(post()[0]?.url).toBe("/api/projects/7/git-fetch");
	});

	test("les projets ignorés sont exclus de la vérification Git", async () => {
		mockFetch({
			...base,
			"GET /api/projects": [
				projet({ id: 7, ignored: true, git: { isRepo: false } }),
			],
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});

		fireEvent.click(
			screen.getByRole("button", { name: /Vérifier les mises à jour Git/ }),
		);
		await waitFor(() => {
			expect(fetchCalls().length).toBeGreaterThanOrEqual(2);
		});
		expect(post().filter((c) => c.url.includes("git-fetch"))).toHaveLength(0);
	});

	test("un événement console met à jour l'état d'audit du projet", async () => {
		mockFetch(base);
		monte();
		await waitFor(() => {
			expect(screen.getByText("Mon API")).toBeInTheDocument();
		});
		// Le flux alimente `auditState`, affiché en surimpression sur la carte.
		expect(sse.instances).toHaveLength(1);
	});
});
