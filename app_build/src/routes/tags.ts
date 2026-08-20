import { errorMessage } from "@/lib/utils";
import { createTag, deleteTag, listTags } from "../db/tags";

export const tagsRoutes = {
	"/api/tags": {
		async GET() {
			return Response.json(listTags());
		},
		async POST(req: Request) {
			const body = await req.json();
			try {
				const tag = createTag(body.name, body.color);
				return Response.json(tag);
			} catch (e: unknown) {
				return Response.json({ error: errorMessage(e) }, { status: 400 });
			}
		},
	},

	"/api/tags/:id": {
		async DELETE(req: any) {
			deleteTag(parseInt(req.params.id, 10));
			return Response.json({ success: true });
		},
	},
};
