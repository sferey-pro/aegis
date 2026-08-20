import { upsertAnnotation } from "../db/annotations";
import { getProjectById } from "../db/projects";
import { annotationBodySchema } from "../lib/schemas";
import { parseBody } from "../lib/validate";

export const annotationsRoutes = {
	"/api/annotations": {
		async POST(req: Request) {
			const { data, response } = await parseBody(req, annotationBodySchema);
			if (!data) return response;

			// L'unité de triage est le couple (CVE, projet) : le projet doit exister,
			// sinon la contrainte de clé étrangère ferait remonter un 500 (CONTEXT.md §7).
			if (!getProjectById(data.projectId)) {
				return Response.json({ error: "Projet introuvable" }, { status: 404 });
			}

			const res = upsertAnnotation(data.cve, data.projectId, {
				status: data.status,
				note: data.note,
				fixedIn: data.fixedIn,
			});
			return Response.json(res);
		},
	},
};
