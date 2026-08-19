import { upsertAnnotation } from "../db/annotations";

export const annotationsRoutes = {
	"/api/annotations": {
		async POST(req: Request) {
			const body = await req.json();
			const res = upsertAnnotation(body.cve, body.projectId, body);
			return Response.json(res);
		},
	},
};
