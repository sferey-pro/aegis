import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
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
		mockFetch({ "GET /api/settings": reglages });
		render(<Settings />);
		// Attendre le premier champ avant d'asserter : sans cela, les effets des
		// composants enfants partent hors du test et leurs requêtes ne sont pas
		// simulées.
		expect(await screen.findByLabelText(/Base URL Jira/)).toHaveValue(
			"https://jira.example",
		);
		expect(screen.getByLabelText(/Utilisateur Jira/)).toHaveValue(
			"moi@example.com",
		);
	});

	test("le bilan du rafraîchissement automatique est affiché", async () => {
		// Sans trace visible, une tâche de fond est indistinguable d'une tâche
		// absente — et pour un projet en fin de vie, c'est elle qui apporte la
		// nouvelle faille, pas un commit.
		mockFetch({
			"GET /api/settings": {
				...reglages,
				ADVISORY_SYNC_LAST_AT: "2026-08-23T14:02:00.000Z",
				ADVISORY_SYNC_LAST_FETCHED: "12",
			},
		});
		render(<Settings />);
		await screen.findByLabelText(/Jeton GitHub/);

		expect(screen.getByText(/12 avis récupérés/)).toBeInTheDocument();
	});

	test("sans passe effectuée, l'écran le dit au lieu de rester muet", async () => {
		mockFetch({ "GET /api/settings": reglages });
		render(<Settings />);
		await screen.findByLabelText(/Jeton GitHub/);

		expect(
			screen.getByText(/Aucun rafraîchissement automatique encore effectué/),
		).toBeInTheDocument();
	});

	test("le bilan n'est jamais reposté par le formulaire", async () => {
		// Le reposter réécrirait l'horodatage par la valeur affichée : le formulaire
		// mentirait sur la date à chaque enregistrement.
		mockFetch({
			"GET /api/settings": {
				...reglages,
				ADVISORY_SYNC_LAST_AT: "2026-08-23T14:02:00.000Z",
				ADVISORY_SYNC_LAST_FETCHED: "12",
			},
			"PUT /api/settings": { status: 204 },
		});
		render(<Settings />);
		await screen.findByLabelText(/Jeton GitHub/);

		fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));

		await waitFor(() => expect(put()).toHaveLength(1));
		const corps = put()[0]?.body as Record<string, unknown>;
		expect(corps).not.toHaveProperty("ADVISORY_SYNC_LAST_AT");
		expect(corps).not.toHaveProperty("ADVISORY_SYNC_LAST_FETCHED");
	});

	test("un secret configuré laisse le champ vide et le dit dans l'invite", async () => {
		// Le client ne détient jamais la valeur : il ne peut donc pas la réafficher.
		// L'invite porte l'information, ce qui évite de laisser croire que le champ
		// vide signifie « non configuré » (N5).
		mockFetch({ "GET /api/settings": reglages });
		render(<Settings />);
		const jeton = await screen.findByLabelText(/Jeton GitHub/);
		expect(jeton).toHaveValue("");
		expect(jeton).toHaveAttribute(
			"placeholder",
			"Jeton enregistré — saisir pour le remplacer",
		);
	});

	test("un secret absent garde l'invite d'exemple", async () => {
		mockFetch({ "GET /api/settings": reglages });
		render(<Settings />);
		const cle = await screen.findByLabelText(/Clé d'API Jira/);
		expect(cle).toHaveValue("");
		expect(cle).toHaveAttribute("placeholder", "ATATT3xFfGF0...");
	});

	test("les valeurs absentes reçoivent leurs défauts", async () => {
		mockFetch({ "GET /api/settings": {} });
		render(<Settings />);
		expect(await screen.findByLabelText(/Cache d'Audit/)).toHaveValue(24);
		expect(screen.getByLabelText(/Type de ticket/)).toHaveValue("Task");
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

	test("un 500 au chargement sort de l'état de chargement et le signale (N6)", async () => {
		// Auparavant : `res.ok` n'était pas vérifié, le corps d'erreur était passé à
		// `setSettings`, et le formulaire s'affichait avec ses valeurs par défaut
		// comme si tout allait bien.
		mockFetch({
			"GET /api/settings": { status: 500, body: { error: "boom" } },
		});
		render(<Settings />);

		expect(await screen.findByRole("alert")).toHaveTextContent(/boom/);
		// Le formulaire n'est pas affiché : il ne reflèterait rien de réel.
		expect(
			screen.queryAllByRole("button", { name: /Enregistrer/ }),
		).toHaveLength(0);
		expect(
			screen.getByRole("button", { name: /Recharger/ }),
		).toBeInTheDocument();
	});

	test("une coupure réseau au chargement est signalée (N6)", async () => {
		mockFetch({ "GET /api/settings": { networkError: "ECONNREFUSED" } });
		render(<Settings />);
		expect(await screen.findByRole("alert")).toBeInTheDocument();
	});

	test("un corps illisible au chargement est traité comme un échec (N6)", async () => {
		// `fetchJson` renvoie `undefined` sur un 200 au corps illisible. Afficher le
		// formulaire avec ses valeurs par défaut laisserait croire à une
		// configuration vide, et un enregistrement écraserait la vraie. L'écran
		// signale donc l'échec plutôt que d'inventer un état.
		mockFetch({ "GET /api/settings": { invalidJson: true } });
		render(<Settings />);
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		expect(
			screen.queryAllByRole("button", { name: /Enregistrer/ }),
		).toHaveLength(0);
	});

	test("un échec d'enregistrement est signalé, pas avalé (N6)", async () => {
		mockFetch({
			"GET /api/settings": reglages,
			"PUT /api/settings": { status: 400, body: { error: "Durée invalide" } },
		});
		render(<Settings />);
		await screen.findByLabelText(/Base URL Jira/);

		fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			/Durée invalide/,
		);
	});

	test("enregistrer envoie les réglages, secret vide compris", async () => {
		// Le champ secret part à vide puisque le client ne connaît pas la valeur.
		// C'est le serveur qui l'ignore alors, pour ne pas effacer le jeton en
		// place — cf. `src/routes/settings.test.ts` (N5).
		mockFetch({
			"GET /api/settings": reglages,
			"PUT /api/settings": { body: { success: true } },
		});
		render(<Settings />);
		await screen.findByLabelText(/Jeton GitHub/);

		fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));

		await waitFor(() => {
			expect(put()).toHaveLength(1);
		});
		expect(put()[0]?.body).toMatchObject({
			GITHUB_TOKEN: "",
			JIRA_BASE_URL: "https://jira.example",
		});
	});

	test("la saisie modifiée part bien au serveur", async () => {
		mockFetch({
			"GET /api/settings": reglages,
			"PUT /api/settings": { body: { success: true } },
		});
		render(<Settings />);
		await screen.findByLabelText(/Jeton GitHub/);

		fireEvent.change(screen.getByLabelText(/Jeton GitHub/), {
			target: { value: "ghp_nouveau" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));

		await waitFor(() => {
			expect(put()).toHaveLength(1);
		});
		expect(put()[0]?.body).toMatchObject({ GITHUB_TOKEN: "ghp_nouveau" });
	});

	test("le champ de fraîcheur interdit la valeur -1 pourtant spécifiée", async () => {
		// Défaut UX12 de l'audit : `min="0"` empêche de saisir -1, dont la
		// sémantique « toujours réauditer » est explicitement prévue par le
		// contrat (CONTEXT.md §2 et §12). Documenté ici.
		mockFetch({ "GET /api/settings": reglages });
		render(<Settings />);
		const champ = await screen.findByLabelText(/Cache d'Audit/);
		expect(champ).toHaveAttribute("min", "0");
	});

	test("le jeton GitHub est masqué à la saisie", async () => {
		mockFetch({ "GET /api/settings": reglages });
		render(<Settings />);
		expect(await screen.findByLabelText(/Jeton GitHub/)).toHaveAttribute(
			"type",
			"password",
		);
	});

	test("la clé d'API Jira est masquée à la saisie", async () => {
		mockFetch({ "GET /api/settings": reglages });
		render(<Settings />);
		await screen.findByLabelText(/Jeton GitHub/);
		expect(screen.getByLabelText(/Clé d'API Jira/)).toHaveAttribute(
			"type",
			"password",
		);
	});

	test("vider le cache d'avis appelle la bonne route", async () => {
		mockFetch({
			"GET /api/settings": reglages,
			"DELETE /api/advisories/cache": { body: { success: true, deleted: 12 } },
		});
		render(<Settings />);
		await screen.findByLabelText(/Jeton GitHub/);

		fireEvent.click(screen.getByRole("button", { name: /Vider le cache/ }));

		await waitFor(() => {
			expect(fetchCalls().filter((c) => c.method === "DELETE")).toHaveLength(1);
		});
		expect(fetchCalls().find((c) => c.method === "DELETE")?.url).toBe(
			"/api/advisories/cache",
		);
	});

	test("un snapshot en échec affiche le message d'erreur du serveur", async () => {
		mockFetch({
			"GET /api/settings": reglages,
			"GET /api/snapshots": { snapshots: [] },
			"POST /api/snapshots/create": {
				status: 400,
				body: { error: "Base illisible" },
			},
		});
		render(<Settings />);
		await screen.findByLabelText(/Jeton GitHub/);

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
			"GET /api/settings": reglages,
			"GET /api/snapshots": instantanes,
			...over,
		});
		return render(<Settings />);
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

	test("le filet de retour arrière est annoncé", async () => {
		// C'est la seule façon de revenir en arrière, et elle n'existait pas : une
		// restauration réussie était irréversible.
		monter({
			"POST /api/snapshots/restore": {
				preRestore: "pre-restore-1700000000.sqlite",
				snapshots: instantanes.snapshots,
			},
		});
		await waitFor(() => expect(liste()).toHaveValue("audit-2026-08-23.sqlite"));
		fireEvent.click(boutonRestaurer());

		expect(
			await screen.findByText(/pre-restore-1700000000\.sqlite/),
		).toBeInTheDocument();
	});

	test("sans instantané, la restauration est désactivée", async () => {
		monter({ "GET /api/snapshots": { snapshots: [] } });
		await waitFor(() =>
			expect(screen.getByText("Aucun instantané disponible")).toBeDefined(),
		);
		expect(boutonRestaurer()).toBeDisabled();
	});

	test("une création rafraîchit la liste et sélectionne le nouveau fichier", async () => {
		monter({
			"POST /api/snapshots/create": {
				file: "audit-2026-08-24.sqlite",
				snapshots: [
					{
						file: "audit-2026-08-24.sqlite",
						size: 4096,
						mtime: "2026-08-24T10:00:00.000Z",
						counts: {
							projects: 4,
							runs: 15,
							tags: 2,
							annotations: 5,
							prompts: 1,
						},
					},
					...instantanes.snapshots,
				],
			},
		});
		await waitFor(() => expect(liste()).toHaveValue("audit-2026-08-23.sqlite"));

		fireEvent.click(screen.getByRole("button", { name: /Créer Snapshot/ }));

		await waitFor(() => expect(liste()).toHaveValue("audit-2026-08-24.sqlite"));
		expect(screen.getAllByRole("option")).toHaveLength(3);
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
		render(<Settings />);
		await screen.findByLabelText(/Base URL Jira/);
		fireEvent.click(
			screen.getByRole("button", { name: /Remettre la configuration à zéro/ }),
		);
	}

	test("la zone de danger annonce ce qui part et ce qui reste", async () => {
		mockFetch({ "GET /api/settings": reglages });
		render(<Settings />);
		await screen.findByLabelText(/Base URL Jira/);

		expect(screen.getByText("Zone de danger")).toBeInTheDocument();
		// La clé GHSA et le cache sont annoncés comme conservés, et le disque comme
		// intact : c'est la question que se pose l'utilisateur avant de cliquer.
		expect(screen.getByText(/la clé GHSA/)).toBeInTheDocument();
		expect(screen.getByText(/vos projets sur le disque/i)).toBeInTheDocument();
	});

	test("le bouton n'agit qu'après confirmation", async () => {
		mockFetch({
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

		fireEvent.click(screen.getByRole("button", { name: /Tout supprimer/ }));
		await waitFor(() => {
			expect(
				fetchCalls().filter((c) => c.url === "/api/config/reset"),
			).toHaveLength(1);
		});
	});

	test("annuler ne déclenche aucun appel", async () => {
		mockFetch({
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

	test("le compte rendu détaille ce qui a été supprimé", async () => {
		// Le décompte est affiché **avant** tout rechargement : sans cela,
		// l'utilisateur ne saurait jamais ce que son clic a emporté.
		mockFetch({
			"GET /api/settings": reglages,
			"POST /api/config/reset": {
				body: {
					success: true,
					reset: { path: "/tmp/audit.sqlite", existed: true, projects: 3 },
					preserved: ["advisory_cache", "GITHUB_TOKEN"],
				},
			},
		});
		await ouvrirConfirmation();
		fireEvent.click(screen.getByRole("button", { name: /Tout supprimer/ }));

		expect(
			await screen.findByText("Configuration remise à zéro."),
		).toBeInTheDocument();
		expect(
			screen.getByText(/3 projets déclarés ont été retirés du suivi/),
		).toBeInTheDocument();
		// Le message rassure explicitement sur les deux points sensibles.
		expect(
			screen.getByText(/les dossiers sur le disque sont intacts/),
		).toBeInTheDocument();
		expect(
			screen.getByText(/La clé GHSA et le cache d'avis sont conservés/),
		).toBeInTheDocument();
		// Le bouton de remise à zéro a laissé place à celui de rechargement.
		expect(
			screen.queryAllByRole("button", {
				name: /Remettre la configuration à zéro/,
			}),
		).toHaveLength(0);
		expect(
			screen.getByRole("button", { name: /Recharger l'application/ }),
		).toBeInTheDocument();
	});

	test("un échec est signalé et laisse le bouton disponible", async () => {
		mockFetch({
			"GET /api/settings": reglages,
			"POST /api/config/reset": { status: 500, body: { error: "boom" } },
		});
		await ouvrirConfirmation();
		fireEvent.click(screen.getByRole("button", { name: /Tout supprimer/ }));

		expect(await screen.findByRole("alert")).toHaveTextContent(/boom/);
		expect(
			screen.getByRole("button", { name: /Remettre la configuration à zéro/ }),
		).toBeInTheDocument();
	});
});
