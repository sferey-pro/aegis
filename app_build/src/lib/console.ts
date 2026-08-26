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

/**
 * La console doit-elle aussi écrire sur la sortie standard du serveur ?
 *
 * Le flux SSE ne va qu'au navigateur : en développement, le terminal de
 * `make dev` ne montrait **rien** des appels sortants — ni Jira, ni GitHub, ni
 * les sous-processus. Or c'est là qu'on travaille, et c'est là qu'on relit une
 * charge avant de la croire.
 *
 * Actif par défaut hors production, jamais sous test — un test qui écrit sur
 * stdout noie sa propre sortie. `AEGIS_CONSOLE_STDOUT=0` coupe, `=1` force.
 */
/** Familles écrites sur stdout par défaut, hors production. */
const LABELS_STDOUT_DEFAUT = "jira";

/**
 * Quelles familles d'étapes écrire sur la sortie standard ?
 *
 * **Filtré, et pas « tout ».** Un seul `getGitInfo` produit 17 lignes, mesurées :
 * une lecture d'état sur dix-sept projets en produit 289, et une passe d'avis
 * autant. Tout journaliser noyait précisément ce qu'on venait chercher — l'appel
 * sortant vers Jira — et posait une écriture **synchrone** sur le chemin de tous
 * les sous-processus, y compris l'audit.
 *
 * | Valeur | Effet |
 * |---|---|
 * | absent | `jira` hors production, rien sous test |
 * | `jira,audit` | liste explicite |
 * | `all` ou `1` | toutes les familles |
 * | `0` | muet |
 */
export function labelsStdout(): Set<string> {
	const reglage = process.env.AEGIS_CONSOLE_STDOUT?.trim();
	if (reglage === "0") return new Set();
	if (reglage === "all" || reglage === "1") return new Set(["*"]);
	if (reglage) {
		return new Set(
			reglage
				.split(",")
				.map((l) => l.trim())
				.filter(Boolean),
		);
	}
	// Un test qui écrit sur stdout noie sa propre sortie.
	if (process.env.NODE_ENV === "test" || process.env.AEGIS_TEST_NO_DOM) {
		return new Set();
	}
	if (process.env.NODE_ENV === "production") return new Set();
	return new Set([LABELS_STDOUT_DEFAUT]);
}

function ecritSurStdout(label: string): boolean {
	const labels = labelsStdout();
	return labels.has("*") || labels.has(label);
}

/**
 * Une ligne par événement, lisible d'un coup d'œil.
 *
 * Le départ porte la commande et sa cible ; la fin porte l'issue, la durée et ce
 * que l'étape a produit. Le succès se lit dans `ok` quand il est fourni — pour un
 * appel HTTP, `exitCode` est un **statut**, et la convention shell « zéro vaut
 * succès » afficherait une croix sur un 200.
 */
function ligneStdout(e: ConsoleEvent, label: string): string {
	const projet = e.project ? ` (${e.project})` : "";
	if (e.phase === "start") {
		return `[${label}]${projet} → ${e.cmd}  ${e.cwd}`;
	}
	const reussi = e.ok ?? e.exitCode === 0;
	const duree = e.ms === undefined ? "" : ` ${e.ms}ms`;
	const code = e.exitCode === undefined ? "" : ` ${e.exitCode}`;
	return `[${label}]${projet} ${reussi ? "✓" : "✗"}${code}${duree}`;
}

/**
 * Label de chaque étape en cours, pour l'écrire aussi sur la ligne de fin.
 *
 * L'événement de fin ne porte ni `cmd`, ni `cwd`, ni `label` : il se corrèle au
 * départ par son `id` (c'est le contrat de §11, et le client le respecte). Sans
 * cette table, la sortie serveur affichait `[undefined]` une ligne sur deux.
 * L'entrée est retirée à la fin, la table ne retient donc que ce qui tourne.
 */
const labelsEnCours = new Map<number, string>();

/**
 * Plafond de la table de labels.
 *
 * L'entrée est retirée à l'événement de fin, mais un producteur qui lève entre
 * les deux n'en émet jamais : sans plafond, la table croît indéfiniment sur un
 * serveur qui tourne des semaines — le motif exact de N26. On oublie alors les
 * plus anciennes, qui ne servent plus à personne.
 */
const MAX_LABELS_EN_COURS = 512;

function memoriseLabel(id: number, label: string): void {
	if (labelsEnCours.size >= MAX_LABELS_EN_COURS) {
		const plusAncien = labelsEnCours.keys().next();
		if (!plusAncien.done) labelsEnCours.delete(plusAncien.value);
	}
	labelsEnCours.set(id, label);
}

function journaliseStdout(e: ConsoleEvent): void {
	const label = e.label ?? labelsEnCours.get(e.id) ?? "?";
	if (e.phase === "start") memoriseLabel(e.id, label);
	else labelsEnCours.delete(e.id);

	if (!ecritSurStdout(label)) return;

	// `console.log` et non `process.stdout.write` : la sortie reste groupée avec
	// celle du reste du serveur, et un rechargement `--hot` ne la tronque pas.
	console.log(ligneStdout(e, label));

	// Le détail intégral n'a de sens que pour ce qu'on vient relire — la charge
	// envoyée à un tiers — ou pour un échec. `lib/git` passe la sortie complète de
	// **chaque** commande dans `outText` : la réimprimer noyait le terminal.
	const details = label === "jira" ? e.outText || e.errorText : e.errorText;
	if (!details) return;
	for (const ligne of details.trimEnd().split("\n"))
		console.log(`    ${ligne}`);
}

function broadcast(brut: ConsoleEvent) {
	// La sortie serveur passe **avant** la garde : `DISABLE_CONSOLE` coupe la
	// diffusion SSE vers le navigateur — c'est son objet — et n'a pas de raison de
	// rendre le terminal muet là où l'on développe.
	journaliseStdout(brut);

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
