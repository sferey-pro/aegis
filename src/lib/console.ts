import { AsyncLocalStorage } from "node:async_hooks";
import { getSetting } from "../db/settings";

export interface ConsoleEvent {
	id: number;
	phase: "start" | "end";
	cmd: string;
	cwd: string;
	label: "git" | "audit" | "github";
	project?: string;
	exitCode?: number;
	ms?: number;
	outText?: string;
	errorText?: string;
}

export const projectContext = new AsyncLocalStorage<{ project: string }>();

const clients = new Set<ReadableStreamDefaultController>();
let nextEventId = 1;

export function emitConsoleStart(
	event: Omit<ConsoleEvent, "id" | "project" | "phase">,
): number {
	const ctx = projectContext.getStore();
	const id = nextEventId++;
	const fullEvent: ConsoleEvent = {
		...event,
		phase: "start",
		id,
		project: ctx?.project,
	};
	broadcast(fullEvent);
	return id;
}

export function emitConsoleEnd(
	id: number,
	event: Omit<
		ConsoleEvent,
		"id" | "project" | "phase" | "cmd" | "cwd" | "label"
	> &
		Partial<ConsoleEvent>,
): void {
	const ctx = projectContext.getStore();
	const fullEvent = {
		...event,
		phase: "end" as const,
		id,
		project: ctx?.project,
	} as ConsoleEvent;

	// Truncate large outputs to prevent massive JSON stringify overhead and UI slowdowns
	if (fullEvent.outText && fullEvent.outText.length > 3000) {
		fullEvent.outText =
			fullEvent.outText.substring(0, 3000) + "\n... [TRUNCATED]";
	}
	if (fullEvent.errorText && fullEvent.errorText.length > 3000) {
		fullEvent.errorText =
			fullEvent.errorText.substring(0, 3000) + "\n... [TRUNCATED]";
	}

	broadcast(fullEvent);
}

function broadcast(event: ConsoleEvent) {
	if (getSetting("DISABLE_CONSOLE", "false") === "true") {
		return;
	}
	const payload = `data: ${JSON.stringify(event)}\n\n`;
	for (const client of clients) {
		try {
			client.enqueue(payload);
		} catch (e) {
			clients.delete(client);
		}
	}
}

export function addConsoleClient(controller: ReadableStreamDefaultController) {
	clients.add(controller);
	try {
		controller.enqueue(`: connected\n\n`);
	} catch (e) {}
}

export function removeConsoleClient(
	controller: ReadableStreamDefaultController,
) {
	clients.delete(controller);
}

setInterval(() => {
	for (const client of clients) {
		try {
			client.enqueue(`: ping\n\n`);
		} catch (e) {
			clients.delete(client);
		}
	}
}, 25000);
