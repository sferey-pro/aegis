import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, getDb } from "../db";

/**
 * Serveur Aegis réel, pour les tests fonctionnels de bout en bout.
 *
 * Trois choix, chacun mesuré plutôt que supposé :
 *
 *  - **Le serveur est démarré dans le process de test**, pas orchestré depuis
 *    l'extérieur. Il démarre en ~90 ms, donc le patron
 *    « lancer le projet puis lancer les tests » n'apporterait ici qu'un
 *    processus à surveiller, un port à réserver et du scripting en CI.
 *  - **Port éphémère** (`AEGIS_PORT=0`, Bun en choisit un libre). `bun test`
 *    exécutant les fichiers séquentiellement, il n'y a de toute façon pas de
 *    conflit possible, mais on ne dépend d'aucun port réservé.
 *  - **`fetch` natif de Bun**, pas celui du DOM. Le `fetch` de happy-dom
 *    applique la politique de même origine : le document de test étant sur
 *    `localhost:3001` et le serveur sur un autre port, il refuse la requête avec
 *    « Cross-Origin Request Blocked ». `setupTests.ts` conserve le `fetch` natif
 *    avant l'installation du DOM, et c'est celui-ci qu'on utilise.
 *
 * ⚠️ `bun test` n'isole **pas** les modules par fichier : plusieurs fichiers de
 * test d'un même run partagent le cache de modules, donc `src/index` n'est
 * évalué — et `serve()` appelé — qu'une seule fois. Un second fichier ne peut
 * pas démarrer son propre serveur ; il réutilise celui déjà en écoute et le
 * rebranche sur une base neuve. C'est pourquoi `stop()` ne coupe pas le serveur :
 * le premier fichier terminé arrêterait celui des suivants.
 */

export interface TestServer {
	/** Base de l'URL, terminée par `/`. */
	readonly url: string;
	/** Port attribué par le système. */
	readonly port: number;
	/** Chemin de la base jetable utilisée par ce serveur. */
	readonly dbPath: string;
	/** Requête vers le serveur. `path` commence par `/`. */
	request(path: string, init?: RequestInit): Promise<Response>;
	/** Requête + décodage JSON, avec le statut. */
	json<T = unknown>(
		path: string,
		init?: RequestInit,
	): Promise<{ status: number; data: T }>;
	/** Arrête le serveur et supprime la base. */
	stop(): void;
}

function nativeFetch(): typeof fetch {
	const f = (globalThis as { __nativeFetch?: typeof fetch }).__nativeFetch;
	if (!f) {
		throw new Error(
			"__nativeFetch absent : setupTests.ts doit conserver le fetch natif " +
				"avant l'enregistrement de happy-dom.",
		);
	}
	return f;
}

/** Serveur déjà en écoute dans ce process, s'il y en a un. */
let partage: { url: string; port: number } | null = null;

/**
 * Démarre le serveur sur un port libre, adossé à une base jetable — ou, si un
 * autre fichier de test l'a déjà démarré dans ce process, réutilise celui-ci en
 * le rebranchant sur une base neuve.
 *
 * À appeler dans un `beforeAll`.
 */
export async function startTestServer(label = "fn"): Promise<TestServer> {
	const dbPath = join(tmpdir(), `aegis-${label}-${randomUUID()}.sqlite`);

	if (!partage) {
		// À poser avant l'import : `src/index.ts` appelle `serve()` et `getDb()` au
		// chargement du module.
		process.env.AEGIS_PORT = "0";
		process.env.DB_PATH = dbPath;

		const { server } = await import("../index");
		partage = { url: String(server.url), port: Number(server.port) };
	} else {
		// Le serveur écoute déjà : on ne peut pas en ouvrir un second, mais la
		// connexion SQLite, elle, se rouvre à la demande.
		closeDb();
		process.env.DB_PATH = dbPath;
		getDb();
	}

	const url = partage.url;
	const doFetch = nativeFetch();

	return {
		url,
		port: partage.port,
		dbPath,
		request(path, init) {
			return doFetch(new URL(path, url), init);
		},
		async json<T>(path: string, init?: RequestInit) {
			const res = await doFetch(new URL(path, url), init);
			let data: unknown = null;
			try {
				data = await res.json();
			} catch {
				// Réponse sans corps (204) ou corps illisible : `data` reste null.
			}
			return { status: res.status, data: data as T };
		},
		stop() {
			// Le serveur reste en écoute : il est partagé avec les fichiers de test
			// suivants du même run. Seule la base de ce fichier est libérée.
			closeDb();
			for (const suffixe of ["", "-wal", "-shm"]) {
				const f = `${dbPath}${suffixe}`;
				if (existsSync(f)) rmSync(f, { force: true });
			}
		},
	};
}

/** Raccourci pour un corps JSON. */
export function jsonBody(body: unknown): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	};
}
