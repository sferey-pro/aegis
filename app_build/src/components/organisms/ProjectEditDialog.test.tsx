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

	test("permet de renseigner des sous-dossiers distincts par outil en local", async () => {
		mockFetch({
			"GET /api/tags": mockTags,
			"POST /api/projects": {
				status: 201,
				body: { id: 101, name: "Mon Monorepo" },
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
			target: { value: "Mon Monorepo" },
		});
		fireEvent.change(screen.getByLabelText(/Chemin absolu/), {
			target: { value: "/home/user/monorepo" },
		});

		// Ajouter Composer (NPM + Composer)
		fireEvent.click(screen.getByRole("button", { name: /Composer/ }));

		// Deux champs de sous-dossier doivent maintenant être visibles
		const npmFolderInput = screen.getByLabelText(/NPM/);
		const composerFolderInput = screen.getByLabelText(/Composer/);
		expect(npmFolderInput).toBeDefined();
		expect(composerFolderInput).toBeDefined();

		fireEvent.change(npmFolderInput, { target: { value: "frontend" } });
		fireEvent.change(composerFolderInput, { target: { value: "backend" } });

		fireEvent.click(screen.getByRole("button", { name: "Créer sans auditer" }));

		await waitFor(() => {
			const postCall = fetchCalls().find(
				(c) => c.method === "POST" && c.url === "/api/projects",
			);
			expect(postCall).toBeDefined();
			expect(postCall?.body).toMatchObject({
				name: "Mon Monorepo",
				path: "/home/user/monorepo",
				tools: ["npm", "composer"],
				tool_paths: {
					npm: "frontend",
					composer: "backend",
				},
			});
		});
	});

	test("permet de renseigner des lockfiles distincts pour un projet distant multi-outils", async () => {
		mockFetch({
			"GET /api/tags": mockTags,
			"POST /api/projects": {
				status: 201,
				body: { id: 102, name: "Remote Multi" },
			},
		});

		render(
			<ProjectEditDialog
				isOpen={true}
				onOpenChange={() => {}}
				onSaved={() => {}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Distant/ }));
		fireEvent.change(screen.getByLabelText(/Nom du projet/), {
			target: { value: "Remote Multi" },
		});

		// Basculer Composer en premier outil, puis ajouter Yarn
		fireEvent.click(screen.getByRole("button", { name: /^Composer/ }));
		fireEvent.click(screen.getByRole("button", { name: /^NPM/ })); // retirer NPM
		fireEvent.click(screen.getByRole("button", { name: /^Yarn/ })); // ajouter Yarn

		// Renseigner l'URL principale de Composer
		const mainUrlInput = screen.getByPlaceholderText(
			"orga/repo/env:prod/composer.lock",
		);
		fireEvent.change(mainUrlInput, {
			target: { value: "org/repo/env:prod/symfony/composer.lock" },
		});

		// Le champ lockfile Yarn secondaire doit être présent
		const yarnLockInput = screen.getByLabelText(/Yarn/);
		expect(yarnLockInput).toBeDefined();

		fireEvent.change(yarnLockInput, {
			target: { value: "frontend/yarn.lock" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Créer sans auditer" }));

		await waitFor(() => {
			const postCall = fetchCalls().find(
				(c) => c.method === "POST" && c.url === "/api/projects",
			);
			expect(postCall).toBeDefined();
			expect(postCall?.body).toMatchObject({
				name: "Remote Multi",
				source_type: "remote",
				tools: ["composer", "yarn"],
				remote_url:
					"https://raw.githubusercontent.com/org/repo/env:prod/symfony/composer.lock",
				tool_paths: {
					yarn: "frontend/yarn.lock",
				},
			});
		});
	});
});
