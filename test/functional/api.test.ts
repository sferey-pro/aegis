import { describe, expect, it } from "bun:test";
import { cvesRoutes } from "../../src/routes/cves";
import { projectsRoutes } from "../../src/routes/projects";
import { statsRoutes } from "../../src/routes/stats";

import { settingsRoutes } from "../../src/routes/settings";

const routes: any = {
	...statsRoutes,
	...projectsRoutes,
	...cvesRoutes,
	...settingsRoutes,
};

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
	} else if (parts.length === 4 && parts[1] === "api" && parts[2] === "projects") {
		routeKey = "/api/projects/:id";
		params = { id: parts[3] };
	}

	const method = options.method || "GET";
	const handler = routes[routeKey]?.[method];

	if (!handler) {
		return { status: 404, data: null };
	}

	const req: any = {
		params,
		url: "http://localhost" + path,
		json: async () => body,
	};

	const res = await handler(req);
	let data = null;
	try {
		data = await res.json();
	} catch (e) {}

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
			name: "Test Func Project",
			path: process.cwd(),
			tool: "npm",
			type: "application",
		};

		const res = await request(
			"/api/projects",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
			},
			payload,
		);

		if (res.status !== 200) {
			console.log("Project creation failed:", res.data);
		}
		expect(res.status).toBe(200);
		expect(res.data.id).toBeDefined();
		expect(res.data.name).toBe("Test Func Project");

		createdProjectId = res.data.id;
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
		const res = await request("/api/projects/detect", { method: "POST" }, { path: process.cwd() });
		expect(res.status).toBe(200);
		expect(res.data).toHaveProperty("tool");
	});

	it("should update a project", async () => {
		// First create a temp project
		const createRes = await request("/api/projects", { method: "POST" }, {
			name: "Temp update", path: process.cwd(), tool: "npm", type: "application"
		});
		const id = createRes.data.id;

		const res = await request(`/api/projects/${id}`, { method: "PUT" }, {
			name: "Updated Name",
			tool: "yarn",
			type: "application",
			audit_path: "",
			tags: [],
			ignored: true
		});
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

		const updateRes = await request("/api/settings", { method: "PUT" }, {
			TEST_KEY: "test_value"
		});
		expect(updateRes.status).toBe(200);
	});

	it("should export and import config", async () => {
		const exportRes = await request("/api/config/export");
		expect(exportRes.status).toBe(200);
		expect(exportRes.data).toHaveProperty("settings");
		expect(exportRes.data).toHaveProperty("projects");
		
		const importRes = await request("/api/config/import", { method: "POST" }, {
			settings: { TEST_KEY: "new_value", SECRET: "***" }
		});
		expect(importRes.status).toBe(200);
	});
});
