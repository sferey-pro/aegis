import type { BunRequest } from "bun";
import { errorMessage } from "@/lib/utils";
import { createTag, deleteTag, listTags } from "../db/tags";
import { tagBodySchema } from "../lib/schemas";
import { parseBody } from "../lib/validate";

export const tagsRoutes = {
	"/api/tags": {
		async GET() {
			return Response.json(listTags());
		},
		async POST(req: Request) {
			const { data, response } = await parseBody(req, tagBodySchema);
			if (!data) return response;

			try {
				// Le schéma a déjà trimé le nom et ramené une couleur hors palette
				// sur `indigo` (CONTEXT.md §9).
				const tag = createTag(data.name, data.color);
				return Response.json(tag, { status: 201 });
			} catch (e: unknown) {
				return Response.json({ error: errorMessage(e) }, { status: 400 });
			}
		},
	},

	"/api/tags/:id": {
		async DELETE(req: BunRequest<"/api/tags/:id">) {
			deleteTag(parseInt(req.params.id, 10));
			return new Response(null, { status: 204 });
		},
	},
};
