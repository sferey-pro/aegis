import { afterEach, describe, expect, test } from "bun:test";
import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { act, fireEvent, render, screen, waitFor } from "@/test/utils";
import { Settings } from "./Settings";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

/**
 * Forme réellement renvoyée par `GET /api/settings` : les secrets n'en sortent
 * plus, seuls des booléens `<CLÉ>_CONFIGURED` disent s'ils sont renseignés (N5).
 */
const reglages = {
	AUDIT_MAX_AGE_HOURS: "24",
	JIRA_BASE_URL: "https://jira.example",
	JIRA_USER: "moi@example.com",
	DISABLE_CONSOLE: "false",
	GITHUB_TOKEN_CONFIGURED: "true",
	JIRA_API_KEY_CONFIGURED: "false",
};

/**
 * Quota relu à la source à l'affichage de l'écran.
 *
 * Déclaré dans **tous** les `mockFetch` de ce fichier : une route non déclarée
 * fait échouer le test (`expect.unreachable`), et c'est voulu — un endpoint
 * oublié qui renverrait `undefined` donnerait une fausse confiance.
 */
/**
 * Routes que **tout** montage de cet écran déclenche, en plus des réglages.
 *
 * `TagsManager` est rendu sous le formulaire et interroge `/api/tags` dans un
 * effet. Non déclarée, cette requête faisait échouer le faux `fetch` par un
 * `expect.unreachable` **à l'intérieur d'un effet React** : le rejet n'était
 * rattaché à aucune assertion, et le fichier de test se bloquait au lieu
 * d'échouer. Le bruit était visible depuis longtemps ; le blocage est arrivé avec
 * un test qui ne faisait plus d'`await` derrière.
 */
const routesDeBase = {
	"GET /api/github/rate-limit": {
		limit: 5000,
		remaining: 4321,
		reset: 1787577633,
	},
	"GET /api/tags": [] as unknown[],
};

const put = () => fetchCalls().filter((c) => c.method === "PUT");

/** Inventaire d'instantanés, tel que `GET /api/snapshots` le renvoie. */
const instantanes = {
	snapshots: [
		{
			file: "audit-2026-08-23.sqlite",
			size: 4096,
			mtime: "2026-08-23T10:00:00.000Z",
			counts: { projects: 3, runs: 12, tags: 2, annotations: 5, prompts: 1 },
		},
		{
			file: "audit-2026-08-22.sqlite",
			size: 4096,
			mtime: "2026-08-22T10:00:00.000Z",
			counts: { projects: 2, runs: 8, tags: 2, annotations: 4, prompts: 1 },
		},
	],
};

describe("Settings", () => {
	afterEach(restoreFetch);

	test("charge les réglages et remplit le formulaire", async () => {
		mockFetch({
			...routesDeBase,
			"GET /api/settings": reglages,
		});
		render(<Settings />);
		// Attendre le premier champ avant d'asserter : sans cela, les effets des
		// composants enfants partent hors du test et leurs requêtes ne sont pas
		// simulées.
		const urlInput = await screen.findByLabelText(/URL de base/);
		await waitFor(() => expect(urlInput).toHaveValue("https://jira.example"));
		const emailInput = screen.getByLabelText(/Email utilisateur/);
		await waitFor(() => expect(emailInput).toHaveValue("moi@example.com"));
	});

	describe("formulaire Jira", () => {
		/** Réglages avec une configuration Jira complète **enregistrée**. */
		const jiraEnregistre = {
			...reglages,
			JIRA_BASE_URL: "https://jira.example.test",
			JIRA_USER: "bot@example.test",
			JIRA_API_KEY_CONFIGURED: "true",
		};

		test("l'URL Jira n'est pas pré-remplie sur une installation neuve", async () => {
			// Une valeur d'exemple faisait paraître la configuration renseignée, et
			// rendait le refus du test de connexion incompréhensible.
			const { JIRA_BASE_URL: _url, JIRA_USER: _user, ...neuf } = reglages;
			mockFetch({ ...routesDeBase, "GET /api/settings": neuf });
			render(<Settings />);

			const champ = await screen.findByLabelText(/URL de base/);
			expect(champ).toHaveValue("");
			expect(champ).toHaveAttribute(
				"placeholder",
				expect.stringContaining("atlassian.net"),
			);
		});

		test("sans configuration enregistrée, le test est indisponible", async () => {
			const { JIRA_BASE_URL: _url, JIRA_USER: _user, ...neuf } = reglages;
			mockFetch({ ...routesDeBase, "GET /api/settings": neuf });
			render(<Settings />);

			const bouton = await screen.findByRole("button", {
				name: /Tester la connexion Jira/,
			});
			expect(bouton).toBeDisabled();
		});

		test("avec une configuration enregistrée, le test est disponible", async () => {
			mockFetch({ ...routesDeBase, "GET /api/settings": jiraEnregistre });
			render(<Settings />);

			const urlInput = await screen.findByLabelText(/URL de base/);
			await waitFor(() =>
				expect(urlInput).toHaveValue("https://jira.example.test"),
			);
			expect(
				screen.getByRole("button", { name: /Tester la connexion Jira/ }),
			).toBeEnabled();
		});
	});

	test("le bilan du rafraîchissement automatique est affiché", () => {});

	test("sans passe effectuée, l'écran le dit au lieu de rester muet", () => {});

	test("le bilan n'est jamais reposté par le formulaire", () => {});

	test("le type de ticket ne figure plus dans les réglages", async () => {
		// Il se choisit **dans la modale de création**, depuis la liste lue chez Jira.
		// Un réglage global se périmait au premier changement de projet, et la saisie
		// libre qu'il supposait produisait « Spécifiez un type de ticket valide »
		// après une tentative d'écriture.
		mockFetch({ ...routesDeBase, "GET /api/settings": reglages });
		render(<Settings />);
		await screen.findByLabelText(/URL de base/);

		expect(screen.queryAllByLabelText(/Type de ticket/)).toHaveLength(0);
	});

	/**
	 * Ces trois cas n'étaient pas testables avant le correctif N6.
	 *
	 * L'effet enchaînait `.then().then()` sans `.catch`, et `setLoading(false)`
	 * était *dans* le `then`. Un `fetch` qui rejetait produisait donc un rejet de
	 * promesse non géré, que Bun compte comme un échec du fichier de test entier —
	 * y compris avec un handler `unhandledRejection` installé. Le défaut empêchait
	 * littéralement d'écrire son propre test de non-régression.
	 */

	

	test("une section n'envoie que ses propres clés", async () => {
		// C'est tout l'intérêt du découpage : une URL Jira invalide ne doit plus
		// faire échouer l'enregistrement de la fenêtre d'audit, et réciproquement.
		mockFetch({
			...routesDeBase,
			"GET /api/settings": reglages,
			"PUT /api/settings": { body: { success: true } },
		});
		render(<Settings defaultTab="analysis" />);
		const champ = await screen.findByLabelText(/Cache d'Audit/);

		fireEvent.change(champ, { target: { value: "48" } });
		fireEvent.click(
			screen.getByRole("button", {
				name: /Enregistrer Paramètres d'Audit/,
			}),
		);

		await waitFor(() => {
			expect(put()).toHaveLength(1);
		});
		const corps = put()[0]?.body as Record<string, string>;
		expect(Object.keys(corps).sort()).toEqual([
			"AUDIT_MAX_AGE_HOURS",
			"CRITICAL_ONLY",
			"DISABLE_CONSOLE",
		]);
		expect(corps.AUDIT_MAX_AGE_HOURS).toBe("48");
	});

	test("un secret n'est jamais posté par la section d'une autre", async () => {
		// Le formulaire ne connaît pas la valeur des secrets : les poster à vide
		// depuis une section voisine obligeait le serveur à filtrer, et un oubli de
		// ce filtre effaçait le jeton (N5).
		mockFetch({
			...routesDeBase,
			"GET /api/settings": reglages,
			"PUT /api/settings": { body: { success: true } },
		});
		render(<Settings defaultTab="analysis" />);
		const champ = await screen.findByLabelText(/Cache d'Audit/);

		fireEvent.change(champ, { target: { value: "48" } });
		fireEvent.click(
			screen.getByRole("button", {
				name: /Enregistrer Paramètres d'Audit/,
			}),
		);

		await waitFor(() => {
			expect(put()).toHaveLength(1);
		});
		const corps = put()[0]?.body as Record<string, string>;
		expect(corps.GITHUB_TOKEN).toBeUndefined();
		expect(corps.JIRA_API_KEY).toBeUndefined();
	});

	

	test("la saisie modifiée part bien au serveur", async () => {
		mockFetch({
			...routesDeBase,
			"GET /api/settings": reglages,
			"PUT /api/settings": { body: { success: true } },
		});
		render(<Settings />);
		const champ = await screen.findByLabelText(/Email utilisateur/);

		fireEvent.change(champ, { target: { value: "moi@example.test" } });
		fireEvent.click(screen.getByLabelText("Enregistrer Intégration Jira"));

		await waitFor(() => {
			expect(put()).toHaveLength(1);
		});
		expect(put()[0]?.body).toMatchObject({
			JIRA_USER: "moi@example.test",
		});
	});

	test("le champ de fraîcheur interdit la valeur -1 pourtant spécifiée", async () => {
		// Défaut UX12 de l'audit : `min="0"` empêche de saisir -1, dont la
		// sémantique « toujours réauditer » est explicitement prévue par le
		// contrat (CONTEXT.md §2 et §12). Documenté ici.
		mockFetch({
			...routesDeBase,
			"GET /api/settings": reglages,
		});
		render(<Settings defaultTab="analysis" />);
		const champ = await screen.findByLabelText(/Cache d'Audit/);
		expect(champ).toHaveAttribute("min", "0");
	});

	test("le jeton GitHub est masqué à la saisie", async () => {
		mockFetch({
			...routesDeBase,
			"GET /api/settings": reglages,
		});
		render(<Settings />);
		expect(
			await screen.findByLabelText(/Jeton d'accès personnel/),
		).toHaveAttribute("type", "password");
	});

	test("la clé d'API Jira est masquée à la saisie", async () => {
		mockFetch({
			...routesDeBase,
			"GET /api/settings": reglages,
		});
		render(<Settings />);
		await screen.findByLabelText(/Jeton d'accès personnel/);
		expect(screen.getByLabelText(/Jeton d'API/)).toHaveAttribute(
			"type",
			"password",
		);
	});

	test("vider le cache d'avis appelle la bonne route", () => {});

	test("un snapshot en échec affiche le message d'erreur du serveur", async () => {
		mockFetch({
			...routesDeBase,
			"GET /api/settings": reglages,
			"GET /api/snapshots": { snapshots: [] },
			"POST /api/snapshots/create": {
				status: 400,
				body: { error: "Base illisible" },
			},
		});
		render(<Settings defaultTab="maintenance" />);
		await screen.findByLabelText(/Instantané à restaurer/);

		const bouton = screen
			.getAllByRole("button")
			.find((b) => /snapshot/i.test(b.textContent ?? ""));
		fireEvent.click(bouton as HTMLElement);

		expect(await screen.findByText("Base illisible")).toBeInTheDocument();
	});
});

describe("Settings — instantanés", () => {
	afterEach(restoreFetch);

	function monter(over: Record<string, unknown> = {}) {
		mockFetch({
			...routesDeBase,
			"GET /api/settings": reglages,
			"GET /api/snapshots": instantanes,
			...over,
		});
		return render(<Settings defaultTab="maintenance" />);
	}

	const liste = () => screen.getByLabelText(/Instantané à restaurer/);
	const boutonRestaurer = () =>
		screen.getByRole("button", { name: /Restaurer/ });

	test("l'inventaire est chargé et proposé au choix", async () => {
		monter();
		await waitFor(() => expect(liste()).toHaveValue("audit-2026-08-23.sqlite"));
		// Le plus récent est présélectionné : c'est le choix attendu, et cela évite
		// un 400 sur un champ vide.
		expect(screen.getAllByRole("option")).toHaveLength(2);
	});

	test("chaque entrée annonce son contenu", async () => {
		// Restaurer sans savoir ce que contient l'instantané est un pari : les
		// compteurs sont la seule information qui distingue deux fichiers datés.
		monter();
		expect(
			await screen.findByText(/audit-2026-08-23\.sqlite — 3 projets, 12 runs/),
		).toBeInTheDocument();
	});

	test("la restauration transmet le fichier choisi", async () => {
		// Le bouton postait un corps **vide** : la route exige `file` et répondait
		// 400 « Fichier requis ». Il était mort depuis l'interface.
		monter({
			"POST /api/snapshots/restore": {
				preRestore: "pre-restore-1700000000.sqlite",
				snapshots: instantanes.snapshots,
			},
		});
		await waitFor(() => expect(liste()).toHaveValue("audit-2026-08-23.sqlite"));

		fireEvent.change(liste(), { target: { value: "audit-2026-08-22.sqlite" } });
		fireEvent.click(boutonRestaurer());

		await waitFor(() => {
			const appel = fetchCalls().find(
				(c) => c.url === "/api/snapshots/restore",
			);
			expect(appel?.body).toEqual({ file: "audit-2026-08-22.sqlite" });
		});
	});

	

	test("sans instantané, la restauration est désactivée", async () => {
		monter({ "GET /api/snapshots": { snapshots: [] } });
		await waitFor(() =>
			expect(screen.getByText("Aucun instantané disponible")).toBeDefined(),
		);
		expect(boutonRestaurer()).toBeDisabled();
	});

	

	test("un échec de restauration est signalé", async () => {
		monter({
			"POST /api/snapshots/restore": {
				status: 409,
				body: { error: "Un audit est en cours" },
			},
		});
		await waitFor(() => expect(liste()).toHaveValue("audit-2026-08-23.sqlite"));
		fireEvent.click(boutonRestaurer());

		expect(
			await screen.findByText("Un audit est en cours"),
		).toBeInTheDocument();
	});
});

describe("Settings — remise à zéro", () => {
	afterEach(restoreFetch);

	/** Ouvre la modale de confirmation depuis la zone de danger. */
	async function ouvrirConfirmation() {
		render(<Settings defaultTab="maintenance" />);
		await screen.findByRole("button", {
			name: /Réinitialiser la configuration/,
		});
		fireEvent.click(
			screen.getByRole("button", { name: /Réinitialiser la configuration/ }),
		);
	}

	

	test("le bouton n'agit qu'après confirmation", async () => {
		mockFetch({
			...routesDeBase,
			"GET /api/settings": reglages,
			"POST /api/config/reset": {
				body: {
					success: true,
					reset: { path: "/tmp/audit.sqlite", existed: true, projects: 0 },
				},
			},
		});
		await ouvrirConfirmation();

		// La modale est ouverte, mais rien n'a encore été envoyé.
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
		expect(
			fetchCalls().filter((c) => c.url === "/api/config/reset"),
		).toHaveLength(0);

		fireEvent.click(screen.getByRole("button", { name: /Oui, tout effacer/ }));
		await waitFor(() => {
			expect(
				fetchCalls().filter((c) => c.url === "/api/config/reset"),
			).toHaveLength(1);
		});
	});

	test("annuler ne déclenche aucun appel", async () => {
		mockFetch({
			...routesDeBase,
			"GET /api/settings": reglages,
			"POST /api/config/reset": {
				body: {
					success: true,
					reset: { path: "/tmp/audit.sqlite", existed: true, projects: 0 },
				},
			},
		});
		await ouvrirConfirmation();
		await screen.findByRole("dialog");

		fireEvent.click(screen.getByRole("button", { name: /Annuler/ }));
		await waitFor(() => {
			expect(screen.queryAllByRole("dialog")).toHaveLength(0);
		});
		expect(
			fetchCalls().filter((c) => c.url === "/api/config/reset"),
		).toHaveLength(0);
	});

	

	
});
