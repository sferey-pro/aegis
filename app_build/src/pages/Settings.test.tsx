import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { Settings } from "./Settings";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

const reglages = {
	GITHUB_TOKEN: "ghp_secret",
	AUDIT_MAX_AGE_HOURS: "24",
	JIRA_BASE_URL: "https://jira.example",
	JIRA_USER: "moi@example.com",
	DISABLE_CONSOLE: "false",
};

const put = () => fetchCalls().filter((c) => c.method === "PUT");

describe("Settings", () => {
	afterEach(restoreFetch);

	test("charge les réglages et remplit le formulaire", async () => {
		mockFetch({ "GET /api/settings": reglages });
		render(<Settings />);
		expect(await screen.findByLabelText(/Jeton GitHub/)).toHaveValue(
			"ghp_secret",
		);
		expect(screen.getByLabelText(/Base URL Jira/)).toHaveValue(
			"https://jira.example",
		);
	});

	test("les valeurs absentes reçoivent leurs défauts", async () => {
		mockFetch({ "GET /api/settings": {} });
		render(<Settings />);
		expect(await screen.findByLabelText(/Cache d'Audit/)).toHaveValue(24);
		expect(screen.getByLabelText(/Type de ticket/)).toHaveValue("Task");
	});

	/**
	 * ⚠️ Le chemin « chargement en échec » n'est pas testable en l'état.
	 *
	 * L'effet de `Settings.tsx:61` enchaîne `.then().then()` sans `.catch`, et
	 * `setLoading(false)` est *dans* le `then`. Un `fetch` qui rejette produit
	 * donc un **rejet de promesse non géré**, que Bun compte comme un échec du
	 * test lui-même — y compris avec un handler `unhandledRejection` installé.
	 *
	 * Autrement dit, le défaut FE2c empêche d'écrire son propre test de
	 * non-régression. Il est plus grave que « spinner infini » : c'est un rejet
	 * non géré, et le formulaire n'apparaît jamais sans le moindre message.
	 *
	 * Dès qu'un `.catch` sera ajouté au composant, ces deux cas deviendront
	 * testables : coupure réseau et corps illisible doivent tous deux sortir de
	 * l'état de chargement et afficher une erreur.
	 */

	test("une réponse 500 est traitée comme des réglages valides", async () => {
		// Testable, celui-là : la réponse résout, donc aucun rejet. Mais `res.ok`
		// n'est pas vérifié — le corps d'erreur est passé à `setSettings`, et le
		// formulaire s'affiche avec les valeurs par défaut comme si tout allait
		// bien. Même famille que le défaut N6.
		mockFetch({
			"GET /api/settings": { status: 500, body: { error: "boom" } },
		});
		render(<Settings />);

		// Le formulaire apparaît malgré le 500.
		expect(
			await screen.findByRole("button", { name: /Enregistrer/ }),
		).toBeInTheDocument();
		// Et les champs prennent leurs défauts, sans signaler l'échec.
		expect(screen.getByLabelText(/Cache d'Audit/)).toHaveValue(24);
	});

	test("enregistrer envoie l'intégralité des réglages", async () => {
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
			GITHUB_TOKEN: "ghp_secret",
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
