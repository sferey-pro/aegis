import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createProject, type Project } from "@/db/projects";
import { syncRemoteProject } from "@/lib/remote-sync";
import { useTempDb } from "@/test/db";

describe("lib/remote-sync", () => {
	useTempDb("remote-sync");

	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("télécharge bun.lock et package.json pour un projet bun distant", async () => {
		const project = createProject({
			name: "Projet Bun Distant",
			path: "/tmp/dummy-path",
			type: "node",
			tool: "bun",
			source_type: "remote",
			remote_url: "https://raw.githubusercontent.com/org/repo/main/bun.lock",
		}) as Project;

		const baseDir = join(
			process.cwd(),
			process.cwd().endsWith("app_build") ? ".." : ".",
			".aegis_remote_projects",
			`project_${project.id}`,
		);

		// Simuler un ancien bun.lockb résiduel
		const { mkdir } = await import("node:fs/promises");
		await mkdir(baseDir, { recursive: true });
		writeFileSync(join(baseDir, "bun.lockb"), "ancien binaire");

		globalThis.fetch = (async (url: string | URL | Request) => {
			const urlStr = url.toString();
			if (urlStr.endsWith("bun.lock")) {
				return new Response('{"lockfileVersion": 1}', { status: 200 });
			}
			if (urlStr.endsWith("package.json")) {
				return new Response('{"name": "test-pkg"}', { status: 200 });
			}
			return new Response("Not found", { status: 404 });
		}) as typeof globalThis.fetch;

		const res = await syncRemoteProject(project);
		expect(res.success).toBe(true);

		// bun.lock doit être écrit
		expect(existsSync(join(baseDir, "bun.lock"))).toBe(true);
		expect(readFileSync(join(baseDir, "bun.lock"), "utf-8")).toBe(
			'{"lockfileVersion": 1}',
		);

		// L'ancien bun.lockb doit avoir été purgé pour éviter le conflit de lockfile
		expect(existsSync(join(baseDir, "bun.lockb"))).toBe(false);

		// package.json doit contenir le vrai manifeste et non le lockfile
		expect(existsSync(join(baseDir, "package.json"))).toBe(true);
		expect(readFileSync(join(baseDir, "package.json"), "utf-8")).toBe(
			'{"name": "test-pkg"}',
		);
	});

	test("télécharge bun.lockb et purge bun.lock pour un projet bun binaire", async () => {
		const project = createProject({
			name: "Projet Bun Binaire",
			path: "/tmp/dummy-path",
			type: "node",
			tool: "bun",
			source_type: "remote",
			remote_url: "https://raw.githubusercontent.com/org/repo/main/bun.lockb",
		}) as Project;

		const baseDir = join(
			process.cwd(),
			process.cwd().endsWith("app_build") ? ".." : ".",
			".aegis_remote_projects",
			`project_${project.id}`,
		);

		const { mkdir } = await import("node:fs/promises");
		await mkdir(baseDir, { recursive: true });
		writeFileSync(join(baseDir, "bun.lock"), "ancien texte");

		globalThis.fetch = (async (url: string | URL | Request) => {
			const urlStr = url.toString();
			if (urlStr.endsWith("bun.lockb")) {
				return new Response("binary-data", { status: 200 });
			}
			if (urlStr.endsWith("package.json")) {
				return new Response('{"name": "binary-pkg"}', { status: 200 });
			}
			return new Response("Not found", { status: 404 });
		}) as typeof globalThis.fetch;

		await syncRemoteProject(project);

		expect(existsSync(join(baseDir, "bun.lockb"))).toBe(true);
		expect(readFileSync(join(baseDir, "bun.lockb"), "utf-8")).toBe(
			"binary-data",
		);
		expect(existsSync(join(baseDir, "bun.lock"))).toBe(false);
	});

	test("repli sur un package.json vide ({}) si le manifeste distant est absent", async () => {
		const project = createProject({
			name: "Projet Sans Manifeste",
			path: "/tmp/dummy-path",
			type: "node",
			tool: "bun",
			source_type: "remote",
			remote_url: "https://raw.githubusercontent.com/org/repo/main/bun.lock",
		}) as Project;

		const baseDir = join(
			process.cwd(),
			process.cwd().endsWith("app_build") ? ".." : ".",
			".aegis_remote_projects",
			`project_${project.id}`,
		);

		globalThis.fetch = (async (url: string | URL | Request) => {
			const urlStr = url.toString();
			if (urlStr.endsWith("bun.lock")) {
				return new Response('{"lockfileVersion": 1}', { status: 200 });
			}
			// Manifeste 404
			return new Response("Not found", { status: 404 });
		}) as typeof globalThis.fetch;

		await syncRemoteProject(project);

		expect(existsSync(join(baseDir, "package.json"))).toBe(true);
		expect(readFileSync(join(baseDir, "package.json"), "utf-8")).toBe("{}");
	});

	test("télécharge tous les lockfiles et manifestes pour un projet multi-outils distant", async () => {
		const project = createProject({
			name: "Projet Multi-outils Distant",
			path: "/tmp/dummy-path",
			type: "composer",
			tool: "composer",
			tools: ["composer", "yarn"],
			source_type: "remote",
			remote_url:
				"https://raw.githubusercontent.com/org/repo/main/composer.lock",
		}) as Project;

		const baseDir = join(
			process.cwd(),
			process.cwd().endsWith("app_build") ? ".." : ".",
			".aegis_remote_projects",
			`project_${project.id}`,
		);

		globalThis.fetch = (async (url: string | URL | Request) => {
			const urlStr = url.toString();
			if (urlStr.endsWith("composer.lock")) {
				return new Response('{"packages": []}', { status: 200 });
			}
			if (urlStr.endsWith("composer.json")) {
				return new Response('{"name": "php-app"}', { status: 200 });
			}
			if (urlStr.endsWith("yarn.lock")) {
				return new Response("# yarn lockfile v1", { status: 200 });
			}
			if (urlStr.endsWith("package.json")) {
				return new Response('{"name": "js-app"}', { status: 200 });
			}
			return new Response("Not found", { status: 404 });
		}) as typeof globalThis.fetch;

		const res = await syncRemoteProject(project);
		expect(res.success).toBe(true);

		expect(existsSync(join(baseDir, "composer.lock"))).toBe(true);
		expect(existsSync(join(baseDir, "composer.json"))).toBe(true);
		expect(existsSync(join(baseDir, "yarn.lock"))).toBe(true);
		expect(existsSync(join(baseDir, "package.json"))).toBe(true);

		expect(readFileSync(join(baseDir, "composer.lock"), "utf-8")).toBe(
			'{"packages": []}',
		);
		expect(readFileSync(join(baseDir, "yarn.lock"), "utf-8")).toBe(
			"# yarn lockfile v1",
		);
	});

	test("télécharge les fichiers dans des dossiers distincts selon tool_paths", async () => {
		const project = createProject({
			name: "Projet Multi-dossiers Distant",
			path: "/tmp/dummy-path",
			type: "node",
			tool: "composer",
			tools: ["composer", "yarn"],
			tool_paths: {
				composer: "backend/composer.lock",
				yarn: "frontend/yarn.lock",
			},
			source_type: "remote",
			remote_url:
				"https://raw.githubusercontent.com/org/repo/main/backend/composer.lock",
		}) as Project;

		const baseDir = join(
			process.cwd(),
			process.cwd().endsWith("app_build") ? ".." : ".",
			".aegis_remote_projects",
			`project_${project.id}`,
		);

		const fetchedUrls: string[] = [];
		globalThis.fetch = (async (url: string | URL | Request) => {
			const urlStr = url.toString();
			fetchedUrls.push(urlStr);
			if (urlStr.includes("backend/composer.lock")) {
				return new Response('{"packages": []}', { status: 200 });
			}
			if (urlStr.includes("backend/composer.json")) {
				return new Response('{"name": "backend-php"}', { status: 200 });
			}
			if (urlStr.includes("frontend/yarn.lock")) {
				return new Response("# yarn lockfile v1", { status: 200 });
			}
			if (urlStr.includes("frontend/package.json")) {
				return new Response('{"name": "frontend-js"}', { status: 200 });
			}
			return new Response("Not found", { status: 404 });
		}) as typeof globalThis.fetch;

		const res = await syncRemoteProject(project);
		expect(res.success).toBe(true);

		// Les fichiers doivent être écrits dans les sous-dossiers appropriés
		expect(existsSync(join(baseDir, "backend", "composer.lock"))).toBe(true);
		expect(existsSync(join(baseDir, "backend", "composer.json"))).toBe(true);
		expect(existsSync(join(baseDir, "frontend", "yarn.lock"))).toBe(true);
		expect(existsSync(join(baseDir, "frontend", "package.json"))).toBe(true);

		// Les URLs interrogées doivent pointer vers backend/... et frontend/...
		expect(
			fetchedUrls.some((u) =>
				u.includes(
					"https://raw.githubusercontent.com/org/repo/main/frontend/yarn.lock",
				),
			),
		).toBe(true);
	});

	test("télécharge les fichiers lorsque le second outil a une URL raw complète", async () => {
		const project = createProject({
			name: "Projet Multi Distant Full URL",
			path: "/tmp/dummy-path",
			type: "node",
			tool: "composer",
			tools: ["composer", "yarn"],
			tool_paths: {
				yarn: "https://raw.githubusercontent.com/org/repo/refs/heads/main/frontend/yarn.lock",
			},
			source_type: "remote",
			remote_url:
				"https://raw.githubusercontent.com/org/repo/refs/heads/main/composer.lock",
		}) as Project;

		const baseDir = join(
			process.cwd(),
			process.cwd().endsWith("app_build") ? ".." : ".",
			".aegis_remote_projects",
			`project_${project.id}`,
		);

		const fetchedUrls: string[] = [];
		globalThis.fetch = (async (url: string | URL | Request) => {
			const urlStr = url.toString();
			fetchedUrls.push(urlStr);
			if (urlStr.includes("composer.lock")) {
				return new Response('{"packages": []}', { status: 200 });
			}
			if (urlStr.includes("composer.json")) {
				return new Response('{"name": "backend-php"}', { status: 200 });
			}
			if (urlStr.includes("frontend/yarn.lock")) {
				return new Response("# yarn lockfile v1", { status: 200 });
			}
			if (urlStr.includes("frontend/package.json")) {
				return new Response('{"name": "frontend-js"}', { status: 200 });
			}
			return new Response("Not found", { status: 404 });
		}) as typeof globalThis.fetch;

		const res = await syncRemoteProject(project);
		expect(res.success).toBe(true);

		expect(existsSync(join(baseDir, "composer.lock"))).toBe(true);
		expect(existsSync(join(baseDir, "frontend", "yarn.lock"))).toBe(true);
		expect(existsSync(join(baseDir, "frontend", "package.json"))).toBe(true);
	});
});
