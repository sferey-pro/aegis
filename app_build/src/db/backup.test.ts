import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { useTempDb } from "@/test/db";
import { createSnapshot, restoreSnapshot } from "./backup";
import { createProject } from "./projects";

/**
 * ⚠️ `restoreSnapshot()` appelle `process.exit(0)` cent millisecondes après son
 * retour, pour laisser le gestionnaire de processus relancer le serveur. Une
 * restauration réussie tuerait donc l'exécuteur de tests : seul son refus est
 * exercé ici, et le fichier de sauvegarde est retiré avant chaque appel.
 */
const FICHIER_SAUVEGARDE = resolve(process.cwd(), "backup.sqlite");

function purgerSauvegarde() {
	for (const suffixe of ["", "-wal", "-shm"]) {
		const f = `${FICHIER_SAUVEGARDE}${suffixe}`;
		if (existsSync(f)) rmSync(f, { force: true });
	}
}

describe("db/backup", () => {
	useTempDb("backup");

	afterEach(purgerSauvegarde);

	test("createSnapshot écrit un fichier et renvoie son chemin", () => {
		const r = createSnapshot();
		expect(r.success).toBe(true);
		expect(existsSync(r.path)).toBe(true);
	});

	test("l'instantané contient les données au moment de la copie", () => {
		// `VACUUM INTO` produit une base complète et cohérente, pas un journal.
		createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		const { path } = createSnapshot();

		const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
		const copie = new Database(path, { readonly: true });
		const lignes = copie.query("SELECT name FROM projects").all() as {
			name: string;
		}[];
		copie.close();
		expect(lignes.map((l) => l.name)).toEqual(["api"]);
	});

	test("un second instantané remplace le précédent", () => {
		// Sans la suppression préalable, `VACUUM INTO` échouerait sur un fichier
		// existant.
		createSnapshot();
		expect(() => createSnapshot()).not.toThrow();
	});

	test("le chemin ignore DB_PATH — écart documenté", () => {
		// `backup.sqlite` et `aegis.db` sont résolus depuis le répertoire de travail
		// du process : une instance dont la base est ailleurs sauvegarde au mauvais
		// endroit, et restaurerait par-dessus un fichier sans rapport.
		const { path } = createSnapshot();
		expect(path).toBe(FICHIER_SAUVEGARDE);
		expect(path).not.toBe(process.env.DB_PATH);
	});

	test("restaurer sans instantané lève avec un message explicite", () => {
		purgerSauvegarde();
		expect(() => restoreSnapshot()).toThrow(
			"Aucun snapshot trouvé (backup.sqlite n'existe pas).",
		);
	});

	test("le refus de restauration ne ferme pas la base", () => {
		// L'échec doit être sans effet : `closeDb()` n'est atteint qu'après le
		// contrôle d'existence.
		purgerSauvegarde();
		expect(() => restoreSnapshot()).toThrow();
		expect(() =>
			createProject({
				name: "toujours-la",
				path: "/srv/x",
				type: "node",
				tool: "npm",
			}),
		).not.toThrow();
	});
});
