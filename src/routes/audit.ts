import { getProjectBySlug, listProjects } from "../db/projects";
import { ingestAudit } from "../lib/audit";
import { enqueueGlobalAudit, getAuditStatus } from "../lib/audit/queue";
import { timingSafeEqual } from "node:crypto";

export const auditRoutes = {
	"/api/audit/run": {
		async POST() {
			const projects = listProjects().filter((p) => !p.ignored);
			try {
				enqueueGlobalAudit(projects.map(p => p.id));
				return Response.json({ status: "started", count: projects.length });
			} catch (e: any) {
				return Response.json({ error: e.message }, { status: 429 });
			}
		},
	},

	"/api/audit/status": {
		async GET() {
			return Response.json(getAuditStatus());
		},
	},

	"/api/ingest/:slug": {
		async POST(req: any) {
			const expectedToken = process.env.AEGIS_INGEST_TOKEN;
			if (!expectedToken) {
				return Response.json({ error: "Configuration manquante: AEGIS_INGEST_TOKEN" }, { status: 500 });
			}
			const tokenHeader = req.headers.get("X-Aegis-Token") || "";
			if (tokenHeader.length !== expectedToken.length || !timingSafeEqual(Buffer.from(tokenHeader), Buffer.from(expectedToken))) {
				return Response.json({ error: "Non autorisé" }, { status: 401 });
			}

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
