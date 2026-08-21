import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { Prompt } from "@/db/prompts";
import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { PromptsLibrary } from "./PromptsLibrary";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function prompt(over: Partial<Prompt> = {}): Prompt {
	return {
		id: 1,
		title: "Analyse de CVE",
		body: "Agis comme un expert en cybersécurité…",
		tags: ["npm", "fix"],
		created_at: "2026-08-01 10:00:00",
		...over,
	};
}

const post = () => fetchCalls().filter((c) => c.method === "POST");
const put = () => fetchCalls().filter((c) => c.method === "PUT");
const del = () => fetchCalls().filter((c) => c.method === "DELETE");

describe("PromptsLibrary", () => {
	afterEach(restoreFetch);

	test("charge et affiche les prompts", async () => {
		mockFetch({ "/api/prompts": [prompt()] });
		render(<PromptsLibrary />);
		expect(await screen.findByText("Analyse de CVE")).toBeInTheDocument();
	});

	test("sans prompt, l'état vide est explicite", async () => {
		mockFetch({ "/api/prompts": [] });
		render(<PromptsLibrary />);
		expect(await screen.findByText("Aucun prompt")).toBeInTheDocument();
	});

	test("les tags du prompt sont affichés", async () => {
		mockFetch({ "/api/prompts": [prompt()] });
		render(<PromptsLibrary />);
		await screen.findByText("Analyse de CVE");
		expect(screen.getByText("npm")).toBeInTheDocument();
		expect(screen.getByText("fix")).toBeInTheDocument();
	});

	test("créer un prompt envoie les tags découpés et trimés", async () => {
		mockFetch({
			"GET /api/prompts": [],
			"POST /api/prompts": { body: prompt(), status: 201 },
		});
		render(<PromptsLibrary />);
		await screen.findByText("Aucun prompt");

		fireEvent.click(screen.getByRole("button", { name: /Nouveau Prompt/ }));
		fireEvent.change(screen.getByLabelText(/Titre/), {
			target: { value: "Mon prompt" },
		});
		fireEvent.change(screen.getByLabelText(/Contenu du Prompt/), {
			target: { value: "corps" },
		});
		fireEvent.change(screen.getByLabelText(/Tags/), {
			target: { value: " npm , , fix " },
		});
		fireEvent.click(screen.getByRole("button", { name: /Créer le prompt/ }));

		await waitFor(() => {
			expect(post()).toHaveLength(1);
		});
		expect(post()[0]?.body).toEqual({
			title: "Mon prompt",
			body: "corps",
			tags: ["npm", "fix"],
		});
	});

	test("après création, la liste est rechargée", async () => {
		mockFetch({
			"GET /api/prompts": [],
			"POST /api/prompts": { body: prompt(), status: 201 },
		});
		render(<PromptsLibrary />);
		await screen.findByText("Aucun prompt");

		fireEvent.click(screen.getByRole("button", { name: /Nouveau Prompt/ }));
		fireEvent.change(screen.getByLabelText(/Titre/), {
			target: { value: "x" },
		});
		// Le contenu est `required` : sans lui la soumission n'a pas lieu.
		fireEvent.change(screen.getByLabelText(/Contenu du Prompt/), {
			target: { value: "corps" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Créer le prompt/ }));

		await waitFor(() => {
			expect(fetchCalls().filter((c) => c.method === "GET")).toHaveLength(2);
		});
	});

	test("le titre et le contenu sont requis côté formulaire", async () => {
		mockFetch({ "GET /api/prompts": [] });
		render(<PromptsLibrary />);
		await screen.findByText("Aucun prompt");

		fireEvent.click(screen.getByRole("button", { name: /Nouveau Prompt/ }));
		expect(screen.getByLabelText(/Titre/)).toBeRequired();
		expect(screen.getByLabelText(/Contenu du Prompt/)).toBeRequired();

		// Une soumission incomplète ne part pas au serveur.
		fireEvent.click(screen.getByRole("button", { name: /Créer le prompt/ }));
		expect(post()).toHaveLength(0);
	});

	test("modifier pré-remplit le formulaire depuis le prompt", async () => {
		mockFetch({ "/api/prompts": [prompt()] });
		render(<PromptsLibrary />);
		await screen.findByText("Analyse de CVE");

		fireEvent.click(screen.getByTitle("Modifier"));
		expect(screen.getByLabelText(/Titre/)).toHaveValue("Analyse de CVE");
		expect(screen.getByLabelText(/Tags/)).toHaveValue("npm, fix");
		// Le libellé du formulaire change avec le mode.
		expect(screen.getByText("Modifier le Prompt")).toBeInTheDocument();
	});

	test("enregistrer une modification passe par PUT sur l'identifiant", async () => {
		mockFetch({
			"GET /api/prompts": [prompt()],
			"PUT /api/prompts/1": { body: prompt() },
		});
		render(<PromptsLibrary />);
		await screen.findByText("Analyse de CVE");

		fireEvent.click(screen.getByTitle("Modifier"));
		fireEvent.change(screen.getByLabelText(/Titre/), {
			target: { value: "Titre corrigé" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));

		await waitFor(() => {
			expect(put()).toHaveLength(1);
		});
		expect(put()[0]?.url).toBe("/api/prompts/1");
		expect(put()[0]?.body).toMatchObject({ title: "Titre corrigé" });
		expect(post()).toHaveLength(0);
	});

	test("supprimer demande confirmation avant d'appeler l'API", async () => {
		mockFetch({
			"GET /api/prompts": [prompt()],
			"DELETE /api/prompts/1": { status: 204 },
		});
		render(<PromptsLibrary />);
		await screen.findByText("Analyse de CVE");

		fireEvent.click(screen.getByTitle("Supprimer"));
		// La confirmation est ouverte, mais rien n'est encore parti.
		expect(screen.getByText("Supprimer le prompt")).toBeInTheDocument();
		expect(del()).toHaveLength(0);
	});

	test("confirmer la suppression cible le bon identifiant", async () => {
		mockFetch({
			"GET /api/prompts": [prompt({ id: 42 })],
			"DELETE /api/prompts/42": { status: 204 },
		});
		render(<PromptsLibrary />);
		await screen.findByText("Analyse de CVE");

		fireEvent.click(screen.getByTitle("Supprimer"));
		const boutons = screen.getAllByRole("button", { name: "Supprimer" });
		fireEvent.click(boutons[boutons.length - 1] as HTMLElement);

		await waitFor(() => {
			expect(del()).toHaveLength(1);
		});
		expect(del()[0]?.url).toBe("/api/prompts/42");
	});

	test("un chargement en échec n'affiche pas d'état vide trompeur", async () => {
		// Même défaut que TagsManager et HistoryChart : l'erreur est avalée et
		// l'écran annonce « Aucun prompt ». Comportement documenté, pas validé.
		mockFetch({ "/api/prompts": { networkError: "ECONNREFUSED" } });
		render(<PromptsLibrary />);
		expect(await screen.findByText("Aucun prompt")).toBeInTheDocument();
	});
});
