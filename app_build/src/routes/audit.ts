import { timingSafeEqual } from "node:crypto";
import type { BunRequest } from "bun";
import { errorMessage } from "@/lib/utils";
import { getProjectBySlug, listProjects } from "../db/projects";
import { ingestAudit } from "../lib/audit";
import { enqueueGlobalAudit, getAuditStatus } from "../lib/audit/queue";

export const auditRoutes = {
	"/api/audit/run": {
		async POST() {
			// `AEGIS_ALLOWED_ROOTS` s'applique **aussi ici**. Cette route était le
			// huitième point d'entrée touchant un chemin, et le seul à ne pas appeler
			// la garde : elle lançait l'outil d'audit dans chaque projet — et des
			// commandes git à sa racine, donc les hooks du dépôt — sans vérifier le
			// périmètre. Un projet enregistré avant que la variable ne soit posée
			// restait ainsi exécutable par ce chemin (invariant de N3).
			//
			// Les projets hors périmètre sont **écartés du lot**, pas refusés en bloc :
			// un seul projet mal placé ne doit pas empêcher d'auditer les autres. Le
			// compte des écartés est rendu, sans quoi le lot mentirait sur sa
			// couverture.
			const { isProjectPathAllowed } = await import("./projects");
			const candidats = listProjects().filter((p) => !p.ignored);
			const projects = candidats.filter((p) =>
				isProjectPathAllowed(p.path, p.audit_path),
			);
			const skipped = candidats.length - projects.length;

			try {
				enqueueGlobalAudit(projects.map((p) => p.id));
				return Response.json({
					status: "started",
					count: projects.length,
					/** Projets écartés faute d'être dans `AEGIS_ALLOWED_ROOTS`. */
					skipped,
				});
			} catch (e: unknown) {
				// **409**, comme la route unitaire. Le refus était en 429 ici et en 500
				// là : deux codes pour la même cause, dont l'un annonce une limite de
				// débit qui n'existe pas. Une ressource occupée est un conflit (N8).
				return Response.json({ error: errorMessage(e) }, { status: 409 });
			}
		},
	},

	"/api/audit/status": {
		async GET() {
			return Response.json(getAuditStatus());
		},
	},

	"/api/ingest/:slug": {
		async POST(req: BunRequest<"/api/ingest/:slug">) {
			const expectedToken = process.env.AEGIS_INGEST_TOKEN;
			if (!expectedToken) {
				return Response.json(
					{ error: "Configuration manquante: AEGIS_INGEST_TOKEN" },
					{ status: 500 },
				);
			}
			const tokenHeader = req.headers.get("X-Aegis-Token") || "";
			if (
				tokenHeader.length !== expectedToken.length ||
				!timingSafeEqual(Buffer.from(tokenHeader), Buffer.from(expectedToken))
			) {
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
			} catch (e: unknown) {
				return Response.json({ error: errorMessage(e) }, { status: 400 });
			}
		},
	},
};
