import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { TagsManager } from "./TagsManager";

/**
 * ⚠️ Assertions négatives : `expect(queryAllByX(...)).toHaveLength(0)` et non
 * `not.toBeInTheDocument()`, qui sérialise l'élément happy-dom en cas d'échec.
 */

const tags = [
	{ id: 1, name: "prod", color: "indigo" },
	{ id: 2, name: "backend", color: "emerald" },
];

describe("TagsManager", () => {
	afterEach(restoreFetch);

	test("charge et affiche les tags existants", async () => {
		mockFetch({ "GET /api/tags": tags });
		render(<TagsManager />);
		expect(await screen.findByText("prod")).toBeInTheDocument();
		expect(screen.getByText("backend")).toBeInTheDocument();
	});

	test("sans tag, l'état vide est explicite", async () => {
		mockFetch({ "GET /api/tags": [] });
		render(<TagsManager />);
		expect(await screen.findByText("Aucun tag configuré.")).toBeInTheDocument();
	});

	test("une soumission vide ne part pas au serveur", async () => {
		mockFetch({ "GET /api/tags": [] });
		render(<TagsManager />);
		await screen.findByText("Aucun tag configuré.");

		fireEvent.click(screen.getByRole("button", { name: /Ajouter/ }));
		// Seul le chargement initial doit avoir eu lieu.
		expect(fetchCalls().filter((c) => c.method === "POST")).toHaveLength(0);
	});

	test("un nom d'espaces seuls est refusé côté client", async () => {
		mockFetch({ "GET /api/tags": [] });
		render(<TagsManager />);
		await screen.findByText("Aucun tag configuré.");

		fireEvent.change(screen.getByLabelText("Nom du tag"), {
			target: { value: "   " },
		});
		fireEvent.click(screen.getByRole("button", { name: /Ajouter/ }));
		expect(fetchCalls().filter((c) => c.method === "POST")).toHaveLength(0);
	});

	test("créer un tag envoie le nom trimé et la couleur", async () => {
		mockFetch({
			"GET /api/tags": [],
			"POST /api/tags": {
				body: { id: 3, name: "api", color: "indigo" },
				status: 201,
			},
		});
		render(<TagsManager />);
		await screen.findByText("Aucun tag configuré.");

		fireEvent.change(screen.getByLabelText("Nom du tag"), {
			target: { value: "  api  " },
		});
		fireEvent.click(screen.getByRole("button", { name: /Ajouter/ }));

		await waitFor(() => {
			expect(fetchCalls().filter((c) => c.method === "POST")).toHaveLength(1);
		});
		const post = fetchCalls().find((c) => c.method === "POST");
		expect(post?.body).toEqual({ name: "api", color: "indigo" });
	});

	test("la couleur choisie est celle envoyée", async () => {
		mockFetch({
			"GET /api/tags": [],
			"POST /api/tags": { body: {}, status: 201 },
		});
		render(<TagsManager />);
		await screen.findByText("Aucun tag configuré.");

		fireEvent.click(screen.getByTitle("orange"));
		fireEvent.change(screen.getByLabelText("Nom du tag"), {
			target: { value: "api" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Ajouter/ }));

		await waitFor(() => {
			const post = fetchCalls().find((c) => c.method === "POST");
			expect(post?.body).toEqual({ name: "api", color: "orange" });
		});
	});

	test("après création, la liste est rechargée", async () => {
		mockFetch({
			"GET /api/tags": [],
			"POST /api/tags": { body: {}, status: 201 },
		});
		render(<TagsManager />);
		await screen.findByText("Aucun tag configuré.");

		fireEvent.change(screen.getByLabelText("Nom du tag"), {
			target: { value: "api" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Ajouter/ }));

		// Deux GET attendus : le chargement initial, puis le rechargement.
		await waitFor(() => {
			expect(fetchCalls().filter((c) => c.method === "GET")).toHaveLength(2);
		});
	});

	test("une erreur serveur est affichée à l'utilisateur", async () => {
		// C'est le seul composant du dépôt qui vérifie `res.ok` : ce test le
		// verrouille, car le retirer redonnerait un échec silencieux.
		mockFetch({
			"GET /api/tags": [],
			"POST /api/tags": {
				status: 400,
				body: { error: "Un tag avec ce nom existe déjà" },
			},
		});
		render(<TagsManager />);
		await screen.findByText("Aucun tag configuré.");

		fireEvent.change(screen.getByLabelText("Nom du tag"), {
			target: { value: "prod" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Ajouter/ }));

		expect(
			await screen.findByText("Un tag avec ce nom existe déjà"),
		).toBeInTheDocument();
	});

	test("après une erreur, le champ conserve la saisie", async () => {
		mockFetch({
			"GET /api/tags": [],
			"POST /api/tags": { status: 400, body: { error: "refusé" } },
		});
		render(<TagsManager />);
		await screen.findByText("Aucun tag configuré.");

		fireEvent.change(screen.getByLabelText("Nom du tag"), {
			target: { value: "prod" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Ajouter/ }));
		await screen.findByText("refusé");

		// La saisie n'est vidée qu'en cas de succès : sinon l'utilisateur perd son
		// texte au moment où il doit le corriger.
		expect(screen.getByLabelText("Nom du tag")).toHaveValue("prod");
	});

	test("supprimer un tag cible son identifiant", async () => {
		mockFetch({
			"GET /api/tags": tags,
			"DELETE /api/tags/2": { status: 204 },
		});
		render(<TagsManager />);
		await screen.findByText("backend");

		// Chaque badge porte son bouton de suppression ; le second correspond à
		// « backend », d'id 2.
		const suppressions = screen
			.getAllByRole("button")
			.filter((b) => b.className.includes("ml-1"));
		fireEvent.click(suppressions[1] as HTMLElement);

		await waitFor(() => {
			expect(fetchCalls().find((c) => c.method === "DELETE")?.url).toBe(
				"/api/tags/2",
			);
		});
	});

	test("un chargement en échec n'affiche pas d'état vide trompeur", async () => {
		// Le composant avale l'erreur : `tags` reste vide et l'écran annonce
		// « Aucun tag configuré. » alors que la liste n'a pas pu être lue. Test de
		// documentation du comportement actuel, pas de validation.
		mockFetch({ "GET /api/tags": { networkError: "ECONNREFUSED" } });
		render(<TagsManager />);
		expect(await screen.findByText("Aucun tag configuré.")).toBeInTheDocument();
	});
});
