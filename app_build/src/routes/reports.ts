import type { BunRequest } from "bun";
import {
	createReport,
	deleteReport,
	getReports,
	type ReportDetail,
} from "../db/reports";
import { reportBodySchema } from "../lib/schemas";
import { parseBody } from "../lib/validate";

export const reportsRoutes = {
	"/api/reports": {
		async GET() {
			return Response.json(getReports());
		},
		async POST(req: Request) {
			// N35 : `reportBodySchema` existait depuis l'introduction de Zod et
			// n'était branché nulle part. Un corps illisible remontait au gestionnaire
			// d'erreur global en 500, et un corps incomplet cassait au `JSON.stringify`
			// en base — là où toutes les routes validées répondent 400.
			const { data, response } = await parseBody(req, reportBodySchema);
			if (!data) return response;

			return Response.json(
				createReport({
					projects_audited: data.projects_audited,
					total_vulnerabilities: data.total_vulnerabilities,
					counts: data.counts,
					details: data.details as ReportDetail[],
				}),
			);
		},
	},

	"/api/reports/:id": {
		async DELETE(req: BunRequest<"/api/reports/:id">) {
			// N37 : 404 si rien n'a été supprimé.
			if (!deleteReport(parseInt(req.params.id, 10))) {
				return Response.json(
					{ error: "Compte-rendu introuvable" },
					{ status: 404 },
				);
			}
			return Response.json({ success: true });
		},
	},
};
