import type { BunRequest } from "bun";
import { errorMessage } from "@/lib/utils";
import {
	createPrompt,
	deletePrompt,
	listPrompts,
	updatePrompt,
} from "../db/prompts";

export const promptsRoutes = {
	"/api/prompts": {
		async GET() {
			return Response.json(listPrompts());
		},
		async POST(req: Request) {
			const body = await req.json();
			try {
				const prompt = createPrompt(body.title, body.body, body.tags || []);
				return Response.json(prompt);
			} catch (e: unknown) {
				return Response.json({ error: errorMessage(e) }, { status: 400 });
			}
		},
	},

	"/api/prompts/:id": {
		async PUT(req: BunRequest<"/api/prompts/:id">) {
			const id = parseInt(req.params.id, 10);
			const body = await req.json();
			try {
				const prompt = updatePrompt(id, body.title, body.body, body.tags || []);
				return Response.json(prompt);
			} catch (e: unknown) {
				return Response.json({ error: errorMessage(e) }, { status: 400 });
			}
		},
		async DELETE(req: BunRequest<"/api/prompts/:id">) {
			deletePrompt(parseInt(req.params.id, 10));
			return Response.json({ success: true });
		},
	},
};
