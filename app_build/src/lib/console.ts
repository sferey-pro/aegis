import { AsyncLocalStorage } from "node:async_hooks";
import { getSetting } from "../db/settings";

export interface ConsoleEvent {
	id: number;
	phase: "start" | "end";
	cmd: string;
	cwd: string;
	/**
	 * Famille de l'étape. `jira` a été ajouté parce que les appels sortants vers
	 * Jira — test de connexion et création de ticket — n'apparaissaient **nulle
	 * part** : la console montrait git, les audits et GitHub, mais pas le seul
	 * point où l'outil écrit chez un tiers. On ne pouvait donc pas relire ce qui
	 * partait.
	 */
	label: "git" | "audit" | "github" | "jira";
	project?: string;
	exitCode?: number;
	/**
	 * Succès de l'étape, quand le code de sortie ne suffit pas à le dire.
	 *
	 * `exitCode` porte deux choses différentes selon le producteur : un vrai code
	 * de sortie de processus pour `git` et les outils d'audit, un **statut HTTP**
	 * pour les appels à l'API GitHub. La console appliquait la convention shell —
	 * zéro vaut succès — donc un appel GHSA réussi en 200 s'affichait avec une
	 * croix rouge et la mention « code 200 ». Le succès est désormais déclaré par
	 * celui qui le connaît.
	 */
	ok?: boolean;
	ms?: number;
	outText?: string;
	errorText?: string;
}

export const projectContext = new AsyncLocalStorage<{ project: string }>();

const clients = new Set<ReadableStreamDefaultController<string>>();
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

	broadcast(fullEvent);
}

/** Limite de §11 : au-delà, la sortie est coupée. */
const MAX_TEXTE = 3000;

function tronque(texte: string | undefined): string | undefined {
	if (!texte || texte.length <= MAX_TEXTE) return texte;
	return `${texte.substring(0, MAX_TEXTE)}\n... [TRUNCATED]`;
}

function broadcast(brut: ConsoleEvent) {
	if (getSetting("DISABLE_CONSOLE", "false") === "true") {
		return;
	}
	// Troncature ici, et non dans `emitConsoleEnd` : elle n'était appliquée qu'à
	// la phase de fin, si bien qu'un événement de départ portant une charge — la
	// charge JSON envoyée à Jira, par exemple — partait entière dans le flux SSE.
	// §11 parle de « toute sortie », pas de la sortie finale.
	const event: ConsoleEvent = {
		...brut,
		outText: tronque(brut.outText),
		errorText: tronque(brut.errorText),
	};
	const payload = `data: ${JSON.stringify(event)}\n\n`;
	for (const client of clients) {
		try {
			client.enqueue(payload);
		} catch (_e) {
			clients.delete(client);
		}
	}
}

export function addConsoleClient(
	controller: ReadableStreamDefaultController<string>,
) {
	clients.add(controller);
	try {
		controller.enqueue(`: connected\n\n`);
	} catch (_e) {}
}

export function removeConsoleClient(
	controller: ReadableStreamDefaultController<string>,
) {
	clients.delete(controller);
}

/**
 * Battement de cœur du flux : sans trafic, un intermédiaire peut fermer une
 * connexion inactive. Le handle est retenu pour pouvoir l'annuler à l'arrêt, et
 * `unref()` l'empêche de maintenir le process en vie à lui seul.
 */
const keepalive = setInterval(() => {
	for (const client of clients) {
		try {
			client.enqueue(`: ping\n\n`);
		} catch (_e) {
			clients.delete(client);
		}
	}
}, 25000);
keepalive.unref?.();

/**
 * Ferme proprement tous les flux console ouverts.
 *
 * Sans cela, l'arrêt du serveur tranchait chaque connexion **en plein milieu d'un
 * chunk** : le flux n'était jamais fermé côté serveur — le seul `close()` du
 * code concernait la branche `DISABLE_CONSOLE` — donc le navigateur voyait une
 * réponse `Transfer-Encoding: chunked` sans chunk terminal et journalisait
 * `net::ERR_INCOMPLETE_CHUNKED_ENCODING`. Fonctionnellement l'`EventSource` se
 * reconnecte, mais l'erreur restait affichée à chaque redémarrage et masquait les
 * vraies.
 *
 * À appeler sur `SIGINT` et `SIGTERM`, avant de quitter.
 */
export function closeConsoleClients(): void {
	clearInterval(keepalive);
	for (const client of clients) {
		try {
			client.close();
		} catch (_e) {
			// Flux déjà fermé par le pair : rien à faire.
		}
	}
	clients.clear();
}

/** Nombre de flux console ouverts. Pour les tests et le diagnostic. */
export function consoleClientCount(): number {
	return clients.size;
}
