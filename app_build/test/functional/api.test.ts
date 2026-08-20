import { describe, expect, it } from "bun:test";
import { cvesRoutes } from "../../src/routes/cves";
import { projectsRoutes } from "../../src/routes/projects";
import { settingsRoutes } from "../../src/routes/settings";
import { statsRoutes } from "../../src/routes/stats";

const routes: any = {
	...statsRoutes,
	...projectsRoutes,
	...cvesRoutes,
	...settingsRoutes,
};

/** Sentinelle : demande au faux `req.json()` de rejeter (corps illisible). */
const INVALID_JSON = Symbol("corps illisible");

async function request(
	path: string,
	options: RequestInit = {},
	body?: any,
): Promise<{ status: number; data: any }> {
	let routeKey = path;
	let params: any = {};

	// Simple dynamic route matching for /api/projects/:id
	const parts = path.split("/");
	if (path === "/api/projects/detect") {
		routeKey = path;
	} else if (
		parts.length === 4 &&
		parts[1] === "api" &&
		parts[2] === "projects"
	) {
		routeKey = "/api/projects/:id";
		params = { id: parts[3] };
	}

	const method = options.method || "GET";
	const handler = routes[routeKey]?.[method];

	if (!handler) {
		return { status: 404, data: null };
	}

	// Le marqueur INVALID_JSON simule un corps illisible : `req.json()` rejette,
	// comme le ferait Bun sur du JSON malformé.
	const req: any = {
		params,
		url: `http://localhost${path}`,
		json: async () => {
			if (body === INVALID_JSON) throw new SyntaxError("Unexpected token");
			return body;
		},
	};

	const res = await handler(req);
	let data = null;
	try {
		data = await res.json();
	} catch (_e) {}

	return { status: res.status || 200, data };
}

describe("Aegis Functional API Tests", () => {
	let createdProjectId: number;

	it("should fetch dashboard statistics", async () => {
		const res = await request("/api/stats");
		expect(res.status).toBe(200);
		expect(res.data).toHaveProperty("monitoredProjects");
		expect(res.data).toHaveProperty("criticalVulnerabilities");
	});

	it("should fetch projects list", async () => {
		const res = await request("/api/projects");
		expect(res.status).toBe(200);
		expect(Array.isArray(res.data)).toBe(true);
	});

	it("should create a new project", async () => {
		const payload = {
			name: "  Test Func Project  ",
			path: process.cwd(),
			tool: "npm",
			// `type` doit appartenir à l'énumération : "application" était accepté
			// avant l'ajout de la validation, et créait un projet inauditable.
			type: "node",
			audit_path: "   ",
			tags: [" web ", "web", "", "api"],
		};

		const res = await request(
			"/api/projects",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
			},
			payload,
		);

		if (res.status !== 201) {
			console.log("Project creation failed:", res.data);
		}
		expect(res.status).toBe(201);
		expect(res.data.id).toBeDefined();

		// Normalisation attendue (CONTEXT.md §1)
		expect(res.data.name).toBe("Test Func Project");
		expect(res.data.audit_path).toBeNull();
		expect(res.data.tags).toEqual(["web", "api"]);

		createdProjectId = res.data.id;
	});

	describe("validation du corps (CONTEXT.md §1)", () => {
		const valid = () => ({
			name: "Projet valide",
			path: process.cwd(),
			tool: "npm",
			type: "node",
		});

		const post = (body: unknown) =>
			request("/api/projects", { method: "POST" }, body);

		it("rejette un corps illisible avec « JSON invalide »", async () => {
			const res = await post(INVALID_JSON);
			expect(res.status).toBe(400);
			expect(res.data.error).toBe("JSON invalide");
		});

		it("rejette un nom vide avec « Nom requis »", async () => {
			const res = await post({ ...valid(), name: "   " });
			expect(res.status).toBe(400);
			expect(res.data.error).toBe("Nom requis");
		});

		it("rejette un chemin vide avec « Chemin requis »", async () => {
			const res = await post({ ...valid(), path: "" });
			expect(res.status).toBe(400);
			expect(res.data.error).toBe("Chemin requis");
		});

		it("rejette un type hors énumération", async () => {
			const res = await post({ ...valid(), type: "php" });
			expect(res.status).toBe(400);
			expect(res.data.error).toBe("Type invalide (node|composer)");
		});

		it("rejette un outil hors énumération", async () => {
			const res = await post({ ...valid(), tool: "pnpm" });
			expect(res.status).toBe(400);
			expect(res.data.error).toBe("Outil invalide (npm|yarn|composer)");
		});

		it("refuse en 409 un second projet sur la même cible d'audit", async () => {
			// Le projet créé plus haut vise déjà process.cwd(). Une écriture du même
			// chemin avec un `/` final doit résoudre vers la même clé.
			const res = await post({
				...valid(),
				name: "Doublon",
				path: `${process.cwd()}/`,
			});
			expect(res.status).toBe(409);
			expect(res.data.error).toContain("cible d'audit");
		});

		it("renvoie 404 sur la modification d'un id inexistant", async () => {
			const res = await request(
				"/api/projects/999999",
				{ method: "PUT" },
				valid(),
			);
			expect(res.status).toBe(404);
			expect(res.data.error).toBe("Projet introuvable");
		});
	});

	it("should fetch the newly created project by ID", async () => {
		expect(createdProjectId).toBeDefined();

		const res = await request(`/api/projects/${createdProjectId}`);
		expect(res.status).toBe(200);

		expect(res.data.id).toBe(createdProjectId);
		expect(res.data.name).toBe("Test Func Project");
		expect(res.data.tool).toBe("npm");
	});

	it("should fetch CVEs triage groups", async () => {
		const res = await request("/api/cves");
		expect(res.status).toBe(200);
		expect(Array.isArray(res.data)).toBe(true);
	});

	it("should delete the created project", async () => {
		expect(createdProjectId).toBeDefined();

		const res = await request(`/api/projects/${createdProjectId}`, {
			method: "DELETE",
		});

		expect(res.status).toBe(200);

		// Verify it's gone
		const fetchRes = await request(`/api/projects/${createdProjectId}`);
		expect(fetchRes.status).toBe(404);
	});

	it("should run detect route", async () => {
		const res = await request(
			"/api/projects/detect",
			{ method: "POST" },
			{ path: process.cwd() },
		);
		expect(res.status).toBe(200);
		expect(res.data).toHaveProperty("tool");
	});

	it("should update a project", async () => {
		// First create a temp project
		const createRes = await request(
			"/api/projects",
			{ method: "POST" },
			{
				name: "Temp update",
				path: process.cwd(),
				tool: "npm",
				type: "node",
			},
		);
		expect(createRes.status).toBe(201);
		const id = createRes.data.id;

		// `path` fait partie du corps validé : un PUT partiel est refusé en 400.
		const res = await request(
			`/api/projects/${id}`,
			{ method: "PUT" },
			{
				name: "Updated Name",
				path: process.cwd(),
				tool: "yarn",
				type: "node",
				audit_path: "",
				tags: [],
				ignored: true,
			},
		);
		expect(res.status).toBe(200);
		expect(res.data.name).toBe("Updated Name");
		expect(res.data.ignored).toBe(true);

		// Delete it
		await request(`/api/projects/${id}`, { method: "DELETE" });
	});

	it("should read and update settings", async () => {
		const res = await request("/api/settings");
		expect(res.status).toBe(200);
		expect(typeof res.data).toBe("object");

		const updateRes = await request(
			"/api/settings",
			{ method: "PUT" },
			{
				TEST_KEY: "test_value",
			},
		);
		expect(updateRes.status).toBe(200);
	});

	it("should export and import config", async () => {
		const exportRes = await request("/api/config/export");
		expect(exportRes.status).toBe(200);
		expect(exportRes.data).toHaveProperty("settings");
		expect(exportRes.data).toHaveProperty("projects");

		const importRes = await request(
			"/api/config/import",
			{ method: "POST" },
			{
				settings: { TEST_KEY: "new_value", SECRET: "***" },
			},
		);
		expect(importRes.status).toBe(200);
	});
});
