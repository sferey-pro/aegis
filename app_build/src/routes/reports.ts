import type { BunRequest } from "bun";
import { createReport, deleteReport, getReports } from "../db/reports";

export const reportsRoutes = {
	"/api/reports": {
		async GET() {
			return Response.json(getReports());
		},
		async POST(req: Request) {
			const body = await req.json();
			return Response.json(createReport(body));
		},
	},

	"/api/reports/:id": {
		async DELETE(req: BunRequest<"/api/reports/:id">) {
			const id = parseInt(req.params.id, 10);
			deleteReport(id);
			return Response.json({ success: true });
		},
	},
};
