import { afterEach, beforeEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, getDb } from "../db";

/**
 * Base SQLite jetable pour les tests qui exercent le vrai code d'accès aux
 * données : `db/`, `lib/audit`, `lib/aggregator`, handlers de routes.
 *
 * Ces couches ne doivent pas être simulées — c'est justement le SQL réel, les
 * clés étrangères et les migrations qu'on veut vérifier. En revanche elles ne
 * doivent jamais toucher `audit.sqlite`, la base de travail.
 *
 * Deux défauts de la convention précédente sont corrigés ici :
 *
 *  - **Chemin relatif.** `process.env.DB_PATH = "test_projects.sqlite"` écrivait
 *    selon le répertoire d'invocation, d'où les `test_*.sqlite` encore présents
 *    à la racine du dépôt. Le chemin est maintenant absolu, dans le dossier
 *    temporaire du système, et unique par appel.
 *  - **Nettoyage incomplet.** Seul le `.sqlite` était supprimé, jamais ses
 *    fichiers compagnons `-wal` et `-shm` que le mode WAL crée toujours.
 */

export interface TempDb {
	/** Chemin absolu du fichier de base. */
	readonly path: string;
	/** Ouvre la connexion et applique le schéma. */
	open(): void;
	/** Ferme la connexion et supprime les trois fichiers. */
	destroy(): void;
}

/**
 * Crée une base jetable sans câbler de hook. À utiliser quand le test a besoin
 * de contrôler lui-même le moment de l'ouverture — par exemple pour vérifier
 * qu'un import de module ne crée pas le fichier.
 */
export function createTempDb(label = "test"): TempDb {
	const path = join(tmpdir(), `aegis-${label}-${randomUUID()}.sqlite`);

	return {
		path,
		open() {
			process.env.DB_PATH = path;
			getDb();
		},
		destroy() {
			closeDb();
			// Le mode WAL laisse toujours un `-wal` et un `-shm` à côté du fichier
			// principal : les oublier fait fuiter des dizaines de Ko par test.
			for (const suffixe of ["", "-wal", "-shm"]) {
				const f = `${path}${suffixe}`;
				if (existsSync(f)) rmSync(f, { force: true });
			}
		},
	};
}

/**
 * Câble une base jetable sur le cycle de vie du fichier de test : une base
 * neuve avant chaque test, supprimée après, y compris si le test échoue.
 *
 * Retourne un accesseur plutôt que le chemin, car celui-ci change à chaque test.
 */
export function useTempDb(label = "test"): () => TempDb {
	let courante: TempDb;

	beforeEach(() => {
		courante = createTempDb(label);
		courante.open();
	});

	afterEach(() => {
		courante?.destroy();
	});

	return () => courante;
}
