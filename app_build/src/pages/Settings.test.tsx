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
		// `handleSnapshot` vérifie `res.ok` — l'un des rares endroits du dépôt.
		mockFetch({
			"GET /api/settings": reglages,
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
