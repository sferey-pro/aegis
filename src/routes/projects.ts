import {
	createProject,
	deleteProject,
	listProjects,
	updateProject,
} from "../db/projects";
import { getLatestRun } from "../db/runs";
import { runAudit } from "../lib/audit";
import { getGitInfo, gitFetch, gitPull } from "../lib/git";

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
			} catch (e) {}

			return Response.json({ tool });
		},
	},

	"/api/projects": {
		async GET() {
			const projects = listProjects();
			const limit = 4;
			const enriched = new Array(projects.length);
			let i = 0;
			const exec = async () => {
				while (i < projects.length) {
					const index = i++;
					const p = projects[index]!;
					let git = { isRepo: false };
					try {
						git = await getGitInfo(p.path);
					} catch (e) {
						console.error(`Git error on ${p.path}:`, e);
					}
					const run = getLatestRun(p.id);
					enriched[index] = { ...p, git, lastRun: run };
				}
			};
			await Promise.all(
				Array.from({ length: Math.min(limit, projects.length) }).map(() =>
					exec(),
				),
			);
			return Response.json(enriched);
		},
		async POST(req: Request) {
			const body = await req.json();
			const project = createProject(body);
			return Response.json(project);
		},
	},

	"/api/projects/:id": {
		async GET(req: any) {
			const id = parseInt(req.params.id);
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
			const id = parseInt(req.params.id);
			const body = await req.json();
			const project = updateProject(id, body);
			return Response.json(project);
		},
		async DELETE(req: any) {
			const id = parseInt(req.params.id);
			deleteProject(id);
			return Response.json({ success: true });
		},
	},

	"/api/projects/:id/git-fetch": {
		async POST(req: any) {
			const id = parseInt(req.params.id);
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
			const id = parseInt(req.params.id);
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
			const id = parseInt(req.params.id);
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
					runAudit(id, force),
				);
				return Response.json({ success: true, ...res });
			} catch (e: any) {
				return Response.json(
					{ success: false, error: e.message },
					{ status: 500 },
				);
			}
		},
	},
};
