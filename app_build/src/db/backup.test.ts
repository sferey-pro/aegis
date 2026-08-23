import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { useTempDb } from "@/test/db";
import {
	assertNomSnapshot,
	createSnapshot,
	listSnapshots,
	restoreSnapshot,
	snapshotDir,
} from "./backup";
import { getDb } from "./index";
import { createProject, listProjects } from "./projects";

/**
 * ⚠️ La restauration **réussie** est désormais exerçable, et c'est le principal
 * acquis du correctif N2.
 *
 * L'ancienne implémentation appelait `process.exit(0)` cent millisecondes après
 * son retour : une restauration réussie tuait l'exécuteur de tests, donc seul son
 * refus pouvait être vérifié — précisément le chemin qui ne prouve rien. Elle
 * s'appuie maintenant sur la connexion paresseuse : il n'y a rien à redémarrer,
 * donc rien qui empêche de tester.
 *
 * `BACKUP_DIR` est déplacé dans un dossier temporaire unique par test : sans
 * cela, les instantanés s'écriraient dans `backups/` à la racine du dépôt.
 */

let dossierSauvegardes: string;

beforeEach(() => {
	dossierSauvegardes = join(tmpdir(), `aegis-backups-${randomUUID()}`);
	process.env.BACKUP_DIR = dossierSauvegardes;
});

afterEach(() => {
	rmSync(dossierSauvegardes, { recursive: true, force: true });
	delete process.env.BACKUP_DIR;
	delete process.env.BACKUP_DB_KEEP;
});

function projet(nom: string) {
	return createProject({
		name: nom,
		path: `/srv/${nom}`,
		type: "node",
		tool: "npm",
	});
}

describe("assertNomSnapshot", () => {
	test("accepte un nom d'instantané", () => {
		expect(() => assertNomSnapshot("audit-2026-08-23.sqlite")).not.toThrow();
		expect(() =>
			assertNomSnapshot("pre-restore-1700000000.sqlite"),
		).not.toThrow();
	});

	test("refuse une traversée de chemin", () => {
		// Le nom vient du réseau et est concaténé à un dossier : sans ce contrôle,
		// la restauration pourrait lire n'importe quel fichier de la machine.
		for (const mauvais of [
			"../../etc/passwd.sqlite",
			"..\\autre.sqlite",
			"/absolu/base.sqlite",
			"sous/dossier.sqlite",
		]) {
			expect(() => assertNomSnapshot(mauvais)).toThrow(
				"Nom de snapshot invalide",
			);
		}
	});

	test("refuse une extension autre que .sqlite", () => {
		expect(() => assertNomSnapshot("base.db")).toThrow(
			"Nom de snapshot invalide",
		);
		expect(() => assertNomSnapshot("base.sqlite.exe")).toThrow(
			"Nom de snapshot invalide",
		);
	});

	test("refuse un nom vide", () => {
		expect(() => assertNomSnapshot("")).toThrow("Nom de snapshot invalide");
	});
});

describe("createSnapshot", () => {
	useTempDb("backup-create");

	test("écrit un fichier dans le dossier d'instantanés", () => {
		const r = createSnapshot();
		expect(r.success).toBe(true);
		expect(existsSync(r.path)).toBe(true);
		expect(r.path.startsWith(snapshotDir())).toBe(true);
	});

	test("la cible est dérivée de DB_PATH, pas du répertoire courant (N2)", () => {
		// Le défaut d'origine : `resolve(process.cwd(), "aegis.db")`, alors que la
		// base ouverte est `DB_PATH`. La sauvegarde et la restauration visaient un
		// fichier que personne n'ouvre jamais.
		const { path } = createSnapshot();
		const copie = new (
			require("bun:sqlite") as typeof import("bun:sqlite")
		).Database(path, { readonly: true });
		expect(() => copie.query("SELECT 1 FROM projects").all()).not.toThrow();
		copie.close();
	});

	test("l'instantané contient les données au moment de la copie", () => {
		// `VACUUM INTO` produit une base complète et cohérente, pas un journal.
		projet("api");
		const { path } = createSnapshot();

		const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
		const copie = new Database(path, { readonly: true });
		const lignes = copie.query("SELECT name FROM projects").all() as {
			name: string;
		}[];
		copie.close();
		expect(lignes.map((l) => l.name)).toEqual(["api"]);
	});

	test("un second appel le même jour remplace le précédent", () => {
		// `VACUUM INTO` refuse une cible existante : sans la suppression préalable,
		// la seconde sauvegarde de la journée échouerait.
		const premier = createSnapshot();
		projet("ajoute-apres");
		const second = createSnapshot();

		expect(second.file).toBe(premier.file);
		expect(listSnapshots()).toHaveLength(1);

		const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
		const copie = new Database(second.path, { readonly: true });
		const n = (
			copie.query("SELECT COUNT(*) AS n FROM projects").get() as { n: number }
		).n;
		copie.close();
		expect(n).toBe(1);
	});

	test("le nom retourné est directement restaurable", () => {
		const { file } = createSnapshot();
		expect(() => assertNomSnapshot(file)).not.toThrow();
	});
});

describe("listSnapshots", () => {
	useTempDb("backup-list");

	test("un dossier absent donne une liste vide", () => {
		// Première utilisation : rien n'a encore été sauvegardé.
		expect(listSnapshots()).toEqual([]);
	});

	test("chaque entrée porte sa taille, sa date et ses compteurs", () => {
		projet("a");
		projet("b");
		createSnapshot();

		const [info] = listSnapshots();
		expect(info?.size).toBeGreaterThan(0);
		expect(Number.isNaN(Date.parse(info?.mtime ?? ""))).toBe(false);
		expect(info?.counts.projects).toBe(2);
	});

	test("un fichier illisible garde des compteurs à zéro", () => {
		// C'est le moment où l'exploitant a le plus besoin de voir la liste : un
		// instantané corrompu ne doit pas faire échouer l'inventaire entier.
		mkdirSync(snapshotDir(), { recursive: true });
		writeFileSync(join(snapshotDir(), "corrompu.sqlite"), "pas une base");

		const trouve = listSnapshots().find((s) => s.file === "corrompu.sqlite");
		expect(trouve).toBeDefined();
		expect(trouve?.counts).toEqual({
			projects: 0,
			runs: 0,
			tags: 0,
			annotations: 0,
			prompts: 0,
		});
	});

	test("les fichiers qui ne sont pas des instantanés sont ignorés", () => {
		mkdirSync(snapshotDir(), { recursive: true });
		writeFileSync(join(snapshotDir(), "notes.txt"), "x");
		createSnapshot();

		expect(listSnapshots().map((s) => s.file)).not.toContain("notes.txt");
	});

	test("le plus récent vient en premier", () => {
		createSnapshot();
		mkdirSync(snapshotDir(), { recursive: true });
		// Un instantané antidaté, écrit à la main pour contrôler sa mtime.
		const ancien = join(snapshotDir(), "audit-2020-01-01.sqlite");
		writeFileSync(ancien, "x");
		const { utimesSync } = require("node:fs") as typeof import("node:fs");
		utimesSync(ancien, new Date("2020-01-01"), new Date("2020-01-01"));

		expect(listSnapshots()[0]?.file).not.toBe("audit-2020-01-01.sqlite");
	});
});

describe("rotation", () => {
	useTempDb("backup-rotation");

	test("les instantanés au-delà du quota sont retirés", () => {
		process.env.BACKUP_DB_KEEP = "2";
		mkdirSync(snapshotDir(), { recursive: true });
		const { utimesSync } = require("node:fs") as typeof import("node:fs");
		for (const [i, jour] of [
			"2020-01-01",
			"2020-01-02",
			"2020-01-03",
		].entries()) {
			const f = join(snapshotDir(), `audit-${jour}.sqlite`);
			writeFileSync(f, "x");
			const d = new Date(2020, 0, i + 1);
			utimesSync(f, d, d);
		}

		createSnapshot();
		expect(listSnapshots()).toHaveLength(2);
	});

	test("un quota illisible retombe sur la valeur par défaut", () => {
		// Un `BACKUP_DB_KEEP=abc` interprété comme zéro effacerait tout, y compris
		// l'instantané qu'on vient d'écrire.
		process.env.BACKUP_DB_KEEP = "abc";
		createSnapshot();
		expect(listSnapshots()).toHaveLength(1);
	});

	test("un filet pre-restore échappe à la rotation", () => {
		// Ce sont des recours, pas des sauvegardes périodiques : les faire tourner
		// effacerait le retour arrière au moment où une série de restaurations le
		// rend nécessaire.
		process.env.BACKUP_DB_KEEP = "1";
		mkdirSync(snapshotDir(), { recursive: true });
		writeFileSync(join(snapshotDir(), "pre-restore-1.sqlite"), "x");
		writeFileSync(join(snapshotDir(), "pre-restore-2.sqlite"), "x");

		createSnapshot();
		const noms = listSnapshots().map((s) => s.file);
		expect(noms).toContain("pre-restore-1.sqlite");
		expect(noms).toContain("pre-restore-2.sqlite");
	});
});

describe("restoreSnapshot", () => {
	useTempDb("backup-restore");

	test("un nom invalide est refusé avant tout effet de bord", () => {
		expect(() => restoreSnapshot("../evasion.sqlite")).toThrow(
			"Nom de snapshot invalide",
		);
		// La base est intacte : le contrôle passe avant la fermeture.
		expect(() => projet("toujours-la")).not.toThrow();
	});

	test("un instantané introuvable lève en nommant le fichier", () => {
		expect(() => restoreSnapshot("audit-1999-01-01.sqlite")).toThrow(
			"audit-1999-01-01.sqlite",
		);
	});

	test("le refus ne ferme pas la base", () => {
		expect(() => restoreSnapshot("absent.sqlite")).toThrow();
		expect(() => projet("encore-la")).not.toThrow();
	});

	test("la base est réellement remplacée par l'instantané", () => {
		// Le cœur de N2 : l'ancienne version répondait « Restauration effectuée »
		// et la base restait identique, parce que la copie visait un fichier que
		// personne n'ouvrait.
		projet("avant");
		const { file } = createSnapshot();

		projet("ajoute-apres-la-sauvegarde");
		expect(listProjects()).toHaveLength(2);

		restoreSnapshot(file);

		// `getDb()` est paresseux : la lecture suivante ouvre la base restaurée.
		expect(listProjects().map((p) => p.name)).toEqual(["avant"]);
	});

	test("un filet pre-restore est écrit avant le remplacement", () => {
		projet("etat-courant");
		const { file } = createSnapshot();
		projet("etat-a-perdre");

		const r = restoreSnapshot(file);
		expect(r.preRestore).toStartWith("pre-restore-");

		// Le filet doit contenir l'état d'avant la restauration, sinon il ne sert à
		// rien : une restauration réussie était irréversible.
		const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
		const filet = new Database(join(snapshotDir(), r.preRestore as string), {
			readonly: true,
		});
		const noms = (
			filet.query("SELECT name FROM projects").all() as { name: string }[]
		).map((l) => l.name);
		filet.close();
		expect(noms).toContain("etat-a-perdre");
	});

	test("le filet permet de revenir en arrière", () => {
		projet("origine");
		const { file } = createSnapshot();
		projet("travail-en-cours");

		const r = restoreSnapshot(file);
		expect(listProjects().map((p) => p.name)).toEqual(["origine"]);

		// Retour arrière complet grâce au filet. `listProjects` a son propre ordre :
		// on assert sur l'ensemble, pas sur la séquence.
		restoreSnapshot(r.preRestore as string);
		expect(
			listProjects()
				.map((p) => p.name)
				.sort(),
		).toEqual(["origine", "travail-en-cours"]);
	});

	test("le journal WAL est purgé", () => {
		// Sans cette purge, l'ancien `-wal` se rejoue par-dessus la base restaurée :
		// on n'obtient ni l'ancien état, ni le nouveau, mais un mélange des deux.
		projet("avant");
		const { file } = createSnapshot();
		projet("apres");

		const base = process.env.DB_PATH as string;
		// Forcer une écriture non encore fusionnée dans le fichier principal.
		getDb().query("SELECT COUNT(*) FROM projects").get();
		expect(existsSync(`${base}-wal`)).toBe(true);

		restoreSnapshot(file);
		expect(existsSync(`${base}-wal`)).toBe(false);
	});

	test("l'inventaire retourné contient le filet", () => {
		const { file } = createSnapshot();
		const r = restoreSnapshot(file);
		expect(r.preRestore).not.toBeNull();
		expect(r.snapshots.map((s) => s.file)).toContain(r.preRestore as string);
	});

	test("aucun process.exit : le test survit à une restauration", () => {
		// Assertion en apparence triviale, mais c'est elle qui prouve le correctif :
		// l'ancienne implémentation tuait l'exécuteur, donc ce fichier ne pouvait
		// pas contenir un seul test de restauration réussie.
		const { file } = createSnapshot();
		restoreSnapshot(file);
		expect(true).toBe(true);
	});
});
