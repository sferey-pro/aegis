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
			} catch (e: any) {
				return Response.json({ error: e.message }, { status: 400 });
			}
		},
	},

	"/api/prompts/:id": {
		async PUT(req: any) {
			const id = parseInt(req.params.id);
			const body = await req.json();
			try {
				const prompt = updatePrompt(id, body.title, body.body, body.tags || []);
				return Response.json(prompt);
			} catch (e: any) {
				return Response.json({ error: e.message }, { status: 400 });
			}
		},
		async DELETE(req: any) {
			deletePrompt(parseInt(req.params.id));
			return Response.json({ success: true });
		},
	},
};
