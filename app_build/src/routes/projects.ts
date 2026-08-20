import { errorMessage } from "@/lib/utils";
import {
	createProject,
	deleteProject,
	listProjects,
	updateProject,
} from "../db/projects";
import { getLatestRun } from "../db/runs";
import { runSingleAudit } from "../lib/audit/queue";
import { getGitInfo, gitFetch, gitPull } from "../lib/git";

function isPathAllowed(targetPath: string) {
	const allowedRootsStr = process.env.AEGIS_ALLOWED_ROOTS;
	if (!allowedRootsStr) return true;
	const nodePath = require("node:path");
	const allowedRoots = allowedRootsStr
		.split(",")
		.map((r) => nodePath.resolve(r.trim()));
	const absolutePath = nodePath.resolve(targetPath);
	return allowedRoots.some(
		(root: string) =>
			absolutePath === root || absolutePath.startsWith(root + nodePath.sep),
	);
}

export const projectsRoutes = {
	"/api/projects/detect": {
		async POST(req: Request) {
			const { path, audit_path } = await req.json();
			const fs = await import("node:fs");
			const nodePath = await import("node:path");
			const { expandPath } = await import("../lib/git");

			let tool = null;
			try {
				const expanded = expandPath(path);
				const safeAuditPath = (audit_path || "").replace(/^\/+/, "");
				const fullPath = nodePath.resolve(expanded, safeAuditPath);

				if (!isPathAllowed(fullPath)) {
					return Response.json(
						{ error: "Chemin non autorisé par AEGIS_ALLOWED_ROOTS" },
						{ status: 403 },
					);
				}

				if (fs.existsSync(nodePath.join(fullPath, "composer.lock")))
					tool = "composer";
				else if (fs.existsSync(nodePath.join(fullPath, "bun.lockb")))
					tool = "bun";
				else if (fs.existsSync(nodePath.join(fullPath, "yarn.lock")))
					tool = "yarn";
				else if (fs.existsSync(nodePath.join(fullPath, "package-lock.json")))
					tool = "npm";
				else if (fs.existsSync(nodePath.join(fullPath, "composer.json")))
					tool = "composer";
				else if (fs.existsSync(nodePath.join(fullPath, "package.json")))
					tool = "npm";
			} catch (_e) {}

			return Response.json({ tool });
		},
	},

	"/api/projects": {
		async GET() {
			const projects = listProjects();
			const { getLatestRunsByProjectIds } = await import("../db/runs");
			const latestRuns = getLatestRunsByProjectIds(projects.map((p) => p.id));

			const enriched = new Array(projects.length);
			let i = 0;
			// 4 concurrent workers for getGitInfo
			const concurrencyLimit = 4;
			const exec = async () => {
				while (i < projects.length) {
					const index = i++;
					const p = projects[index];
					if (!p) continue;
					let git = { isRepo: false };
					try {
						git = await getGitInfo(p.path);
					} catch (e) {
						console.error(`Git error on ${p.path}:`, e);
					}
					enriched[index] = { ...p, git, lastRun: latestRuns[p.id] || null };
				}
			};
			await Promise.all(
				Array.from({ length: Math.min(concurrencyLimit, projects.length) }).map(
					() => exec(),
				),
			);
			return Response.json(enriched);
		},
		async POST(req: Request) {
			const body = await req.json();
			const nodePath = await import("node:path");
			const { expandPath } = await import("../lib/git");

			const expanded = expandPath(body.path);
			const safeAuditPath = (body.audit_path || "").replace(/^\/+/, "");
			const fullPath = nodePath.resolve(expanded, safeAuditPath);

			if (!isPathAllowed(fullPath)) {
				return Response.json(
					{ error: "Chemin non autorisé par AEGIS_ALLOWED_ROOTS" },
					{ status: 403 },
				);
			}

			const project = createProject(body);
			return Response.json(project);
		},
	},

	"/api/projects/:id": {
		async GET(req: any) {
			const id = parseInt(req.params.id, 10);
			const p = listProjects().find((p) => p.id === id);
			if (!p) return Response.json({ error: "Not found" }, { status: 404 });
			let git = { isRepo: false };
			try {
				git = await getGitInfo(p.path);
			} catch (e) {
				console.error(`Git error on ${p.path}:`, e);
			}
			const run = getLatestRun(p.id);
			return Response.json({ ...p, git, lastRun: run });
		},
		async PUT(req: any) {
			const id = parseInt(req.params.id, 10);
			const body = await req.json();
			const project = updateProject(id, body);
			return Response.json(project);
		},
		async DELETE(req: any) {
			const id = parseInt(req.params.id, 10);
			deleteProject(id);
			return Response.json({ success: true });
		},
	},

	"/api/projects/:id/git-fetch": {
		async POST(req: any) {
			const id = parseInt(req.params.id, 10);
			const project = listProjects().find((p) => p.id === id);
			if (!project)
				return Response.json({ error: "Not found" }, { status: 404 });

			const { projectContext } = await import("../lib/console");
			const res = await projectContext.run({ project: project.name }, () =>
				gitFetch(project.path),
			);

			return Response.json(res);
		},
	},

	"/api/projects/:id/git-pull": {
		async POST(req: any) {
			const id = parseInt(req.params.id, 10);
			const project = listProjects().find((p) => p.id === id);
			if (!project)
				return Response.json({ error: "Not found" }, { status: 404 });

			const { projectContext } = await import("../lib/console");
			const res = await projectContext.run({ project: project.name }, () =>
				gitPull(project.path),
			);

			return Response.json(res);
		},
	},

	"/api/projects/:id/audit": {
		async POST(req: any) {
			const id = parseInt(req.params.id, 10);
			const url = new URL(req.url);
			const force = url.searchParams.get("force") === "true";
			try {
				const { getProjectById } = await import("../db/projects");
				const project = getProjectById(id);
				if (!project)
					return Response.json(
						{ success: false, error: "Not found" },
						{ status: 404 },
					);

				const { projectContext } = await import("../lib/console");
				const res = await projectContext.run({ project: project.name }, () =>
					runSingleAudit(id, force),
				);
				return Response.json({ success: true, ...res });
			} catch (e: unknown) {
				return Response.json(
					{ success: false, error: errorMessage(e) },
					{ status: 500 },
				);
			}
		},
	},
};
