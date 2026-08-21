import type { BunRequest } from "bun";
import { errorMessage } from "@/lib/utils";
import {
	createPrompt,
	deletePrompt,
	listPrompts,
	updatePrompt,
} from "../db/prompts";
import { promptBodySchema } from "../lib/schemas";
import { parseBody } from "../lib/validate";

export const promptsRoutes = {
	"/api/prompts": {
		async GET() {
			return Response.json(listPrompts());
		},
		async POST(req: Request) {
			const { data, response } = await parseBody(req, promptBodySchema);
			if (!data) return response;

			try {
				const prompt = createPrompt(data.title, data.body, data.tags);
				return Response.json(prompt, { status: 201 });
			} catch (e: unknown) {
				return Response.json({ error: errorMessage(e) }, { status: 400 });
			}
		},
	},

	"/api/prompts/:id": {
		async PUT(req: BunRequest<"/api/prompts/:id">) {
			const id = parseInt(req.params.id, 10);
			const { data, response } = await parseBody(req, promptBodySchema);
			if (!data) return response;

			try {
				const prompt = updatePrompt(id, data.title, data.body, data.tags);
				return Response.json(prompt);
			} catch {
				// `updatePrompt` lève sur un id inconnu : c'est un 404, pas un 400.
				return Response.json({ error: "Prompt introuvable" }, { status: 404 });
			}
		},
		async DELETE(req: BunRequest<"/api/prompts/:id">) {
			// N37 : 404 si rien n'a été supprimé.
			if (!deletePrompt(parseInt(req.params.id, 10))) {
				return Response.json({ error: "Prompt introuvable" }, { status: 404 });
			}
			return new Response(null, { status: 204 });
		},
	},
};
