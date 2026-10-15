import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Tag } from "@/db/tags";
import type { ProjectListItem } from "@/routes/projects";
import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { fireEvent, render, screen, waitFor } from "@/test/utils";
import { ProjectEditDialog } from "./ProjectEditDialog";

function mockProject(over: Partial<ProjectListItem> = {}): ProjectListItem {
	return {
		id: 42,
		name: "Projet Existant",
		slug: "projet-existant",
		path: "/srv/projets/existant",
		audit_path: "subfolder",
		type: "node",
		tool: "npm",
		tags: ["backend"],
		ignored: false,
		source_type: "local" as const,
		created_at: "2026-05-01 10:00:00",
		git: {
			isRepo: true,
			branch: "main",
			sha: "abc1234",
			upstream: "origin/main",
			ahead: 0,
			behind: 0,
			dirty: false,
		},
		lastRun: null,
		...over,
	} as unknown as ProjectListItem;
}

const mockTags: Tag[] = [
	{ id: 1, name: "backend", color: "indigo", created_at: "" },
	{ id: 2, name: "frontend", color: "emerald", created_at: "" },
];

describe("ProjectEditDialog", () => {
	beforeEach(() => {
		mockFetch({
			"GET /api/tags": mockTags,
		});
	});

	afterEach(() => {
		restoreFetch();
	});

	test("fermé, rien n'est affiché", () => {
		render(
			<ProjectEditDialog
				isOpen={false}
				onOpenChange={() => {}}
				onSaved={() => {}}
			/>,
		);
		expect(screen.queryByText("Type de projet")).not.toBeInTheDocument();
	});

	test("ouvert en mode création, propose la sélection du type de projet", () => {
		render(
			<ProjectEditDialog
				isOpen={true}
				onOpenChange={() => {}}
				onSaved={() => {}}
			/>,
		);
		expect(screen.getByText("Type de projet")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Projet Local/ }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Distant \(Direct\)/ }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Ingestion CI/ }),
		).toBeInTheDocument();
	});

	test("sélectionner Projet Local affiche le formulaire et permet de créer un projet", async () => {
		let savedProject: { id: number; name: string } | undefined;
		let closed = false;

		mockFetch({
			"GET /api/tags": mockTags,
			"POST /api/projects": {
				status: 201,
				body: { id: 99, name: "Mon Nouveau Projet" },
			},
		});

		render(
			<ProjectEditDialog
				isOpen={true}
				onOpenChange={(open) => {
					if (!open) closed = true;
				}}
				onSaved={(p) => {
					savedProject = p;
				}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Projet Local/ }));
		expect(screen.getByText("Nouveau Projet Local")).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText(/Nom du projet/), {
			target: { value: "Mon Nouveau Projet" },
		});
		fireEvent.change(screen.getByLabelText(/Chemin absolu/), {
			target: { value: "/home/user/app" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Créer sans auditer" }));

		await waitFor(() => {
			expect(savedProject).toEqual({ id: 99, name: "Mon Nouveau Projet" });
			expect(closed).toBe(true);
		});

		const postCall = fetchCalls().find(
			(c) => c.method === "POST" && c.url === "/api/projects",
		);
		expect(postCall).toBeDefined();
		expect(postCall?.body).toMatchObject({
			name: "Mon Nouveau Projet",
			path: "/home/user/app",
			source_type: "local",
		});
	});

	test("une erreur API lors de la création est affichée dans le formulaire", async () => {
		mockFetch({
			"GET /api/tags": mockTags,
			"POST /api/projects": {
				status: 400,
				body: { error: "Chemin absolu invalide" },
			},
		});

		render(
			<ProjectEditDialog
				isOpen={true}
				onOpenChange={() => {}}
				onSaved={() => {}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Projet Local/ }));
		fireEvent.change(screen.getByLabelText(/Nom du projet/), {
			target: { value: "Projet Invalide" },
		});
		fireEvent.change(screen.getByLabelText(/Chemin absolu/), {
			target: { value: "/invalid" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Créer sans auditer" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Chemin absolu invalide",
		);
	});

	test("ouvert en mode édition, préremplit les champs et soumet avec PUT", async () => {
		const projet = mockProject();
		let savedCalled = false;
		let closed = false;

		mockFetch({
			"GET /api/tags": mockTags,
			"PUT /api/projects/42": { status: 200, body: { ok: true } },
		});

		render(
			<ProjectEditDialog
				project={projet}
				isOpen={true}
				onOpenChange={(open) => {
					if (!open) closed = true;
				}}
				onSaved={() => {
					savedCalled = true;
				}}
			/>,
		);

		expect(screen.getByText("Configuration du projet")).toBeInTheDocument();
		expect(screen.getByLabelText(/Nom du projet/)).toHaveValue(
			"Projet Existant",
		);
		expect(screen.getByLabelText(/Chemin absolu/)).toHaveValue(
			"/srv/projets/existant",
		);

		fireEvent.change(screen.getByLabelText(/Nom du projet/), {
			target: { value: "Projet Modifié" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

		await waitFor(() => {
			expect(savedCalled).toBe(true);
			expect(closed).toBe(true);
		});

		const putCall = fetchCalls().find(
			(c) => c.method === "PUT" && c.url === "/api/projects/42",
		);
		expect(putCall).toBeDefined();
		expect(putCall?.body).toMatchObject({
			name: "Projet Modifié",
			path: "/srv/projets/existant",
		});
	});

	test("la flèche retour en mode création permet de revenir au choix du type", () => {
		render(
			<ProjectEditDialog
				isOpen={true}
				onOpenChange={() => {}}
				onSaved={() => {}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Projet Local/ }));
		expect(screen.getByText("Nouveau Projet Local")).toBeInTheDocument();

		// Flèche retour
		const backBtn = screen.getByRole("button", {
			name: "Retour au choix du type",
		});
		fireEvent.click(backBtn);

		expect(screen.getByText("Type de projet")).toBeInTheDocument();
	});

	test("permet de sélectionner plusieurs outils (multi-tool)", async () => {
		mockFetch({
			"GET /api/tags": mockTags,
			"POST /api/projects": {
				status: 201,
				body: { id: 100, name: "Projet Multi" },
			},
		});

		render(
			<ProjectEditDialog
				isOpen={true}
				onOpenChange={() => {}}
				onSaved={() => {}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Projet Local/ }));
		fireEvent.change(screen.getByLabelText(/Nom du projet/), {
			target: { value: "Projet Multi" },
		});
		fireEvent.change(screen.getByLabelText(/Chemin absolu/), {
			target: { value: "/home/user/multi" },
		});

		// Par défaut NPM est sélectionné. On clique sur Composer pour l'ajouter aussi.
		const composerBtn = screen.getByRole("button", { name: /Composer/ });
		fireEvent.click(composerBtn);

		fireEvent.click(screen.getByRole("button", { name: "Créer sans auditer" }));

		await waitFor(() => {
			const postCall = fetchCalls().find(
				(c) => c.method === "POST" && c.url === "/api/projects",
			);
			expect(postCall).toBeDefined();
			expect(postCall?.body).toMatchObject({
				name: "Projet Multi",
				path: "/home/user/multi",
				tools: ["npm", "composer"],
			});
		});
	});
});
