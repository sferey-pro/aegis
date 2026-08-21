import { addConsoleClient, removeConsoleClient } from "../lib/console";

export const consoleRoutes = {
	"/api/console": {
		async GET() {
			const { getSetting } = await import("../db/settings");
			if (getSetting("DISABLE_CONSOLE", "false") === "true") {
				return new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(`data: : disabled\n\n`);
							controller.close();
						},
					}),
					{
						headers: {
							"Content-Type": "text/event-stream",
							"Cache-Control": "no-cache",
							Connection: "keep-alive",
						},
					},
				);
			}
			let streamController: ReadableStreamDefaultController<string> | undefined;
			return new Response(
				new ReadableStream<string>({
					// `cancel` reçoit la raison de l'annulation, pas le contrôleur : il faut
					// donc retenir ce dernier depuis `start`, sinon le client n'est jamais
					// retiré du Set à la fermeture du flux.
					start(controller) {
						streamController = controller;
						addConsoleClient(controller);
					},
					cancel() {
						if (streamController) removeConsoleClient(streamController);
					},
				}),
				{
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						Connection: "keep-alive",
					},
				},
			);
		},
	},
};
