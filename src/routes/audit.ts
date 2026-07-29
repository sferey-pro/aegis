import { getProjectBySlug, listProjects } from "../db/projects";
import { ingestAudit, runAudit } from "../lib/audit";

export const auditRoutes = {
	"/api/audit/run": {
		async POST() {
			const projects = listProjects().filter((p) => !p.ignored);
			setTimeout(async () => {
				for (const p of projects) {
					try {
						await runAudit(p.id);
					} catch (e) {
						console.error(`Audit background fail for ${p.id}`, e);
					}
				}
			}, 0);
			return Response.json({ status: "started", count: projects.length });
		},
	},

	"/api/ingest/:slug": {
		async POST(req: any) {
			const slug = req.params.slug;
			const project = getProjectBySlug(slug);

			if (!project) {
				return Response.json({ error: "Project introuvable" }, { status: 404 });
			}

			const url = new URL(req.url);
			const commitSha = url.searchParams.get("sha") || "";
			const stdout = await req.text();

			try {
				const res = await ingestAudit(project.id, stdout, commitSha);
				return Response.json({
					success: true,
					run: res.run,
					newCvesCount: res.newCves.length,
				});
			} catch (e: any) {
				return Response.json({ error: e.message }, { status: 400 });
			}
		},
	},
};
