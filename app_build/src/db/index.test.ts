import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

import { createTempDb, useTempDb } from "@/test/db";
import { closeDb, getDb } from "./index";
import { createProject } from "./projects";

describe("db/index — connexion", () => {
	test("importer un module db ne crée aucun fichier", () => {
		// Contrainte du contrat : connexion paresseuse. Un import ne doit jamais
		// matérialiser la base, sinon un simple `import` en test ou en outillage
		// créerait un fichier parasite.
		const db = createTempDb("paresse");
		expect(existsSync(db.path)).toBe(false);
		db.open();
		expect(existsSync(db.path)).toBe(true);
		db.destroy();
	});

	test("getDb renvoie la même instance entre deux appels", () => {
		const db = createTempDb("singleton");
		db.open();
		expect(getDb()).toBe(getDb());
		db.destroy();
	});

	test("closeDb libère l'instance, getDb en ouvre une neuve", () => {
		const db = createTempDb("reouverture");
		db.open();
		const avant = getDb();
		closeDb();
		process.env.DB_PATH = db.path;
		expect(getDb()).not.toBe(avant);
		db.destroy();
	});
});

describe("db/index — schéma", () => {
	useTempDb("schema");

	test("toutes les tables du contrat existent", () => {
		const noms = (
			getDb()
				.query("SELECT name FROM sqlite_master WHERE type = 'table'")
				.all() as { name: string }[]
		).map((r) => r.name);

		for (const table of [
			"projects",
			"runs",
			"annotations",
			"tickets",
			"cve_occurrences",
			"tags",
			"prompts",
			"settings",
			"reports",
		]) {
			expect(noms).toContain(table);
		}
	});

	test("le mode WAL est actif", () => {
		const { journal_mode } = getDb().query("PRAGMA journal_mode").get() as {
			journal_mode: string;
		};
		expect(journal_mode.toLowerCase()).toBe("wal");
	});

	test("les clés étrangères sont actives", () => {
		const row = getDb().query("PRAGMA foreign_keys").get() as {
			foreign_keys: number;
		};
		expect(row.foreign_keys).toBe(1);
	});

	test("le checkpoint automatique du WAL est configuré", () => {
		// Sans lui le fichier -wal croît sans limite : le défaut C7 avait produit
		// 4 Mo de WAL pour 4 Ko de base.
		const row = getDb().query("PRAGMA wal_autocheckpoint").get() as {
			wal_autocheckpoint: number;
		};
		expect(row.wal_autocheckpoint).toBeGreaterThan(0);
	});

	test("l'index sur (project_id, ran_at) des runs existe", () => {
		const index = (
			getDb()
				.query("SELECT name FROM sqlite_master WHERE type = 'index'")
				.all() as { name: string }[]
		).map((r) => r.name);
		expect(index).toContain("idx_runs_project_ran_at");
	});

	test("le slug des projets est unique", () => {
		const db = getDb();
		db.query(
			"INSERT INTO projects (name, slug, path, type, tool) VALUES ('A', 'x', '/a', 'node', 'npm')",
		).run();
		expect(() =>
			db
				.query(
					"INSERT INTO projects (name, slug, path, type, tool) VALUES ('B', 'x', '/b', 'node', 'npm')",
				)
				.run(),
		).toThrow(/UNIQUE/);
	});

	test("advisory_cache n'est plus dans la base principale", () => {
		// Le cache d'avis vit dans un fichier séparé depuis le 22/08/2026, pour que
		// la remise à zéro puisse être la suppression du fichier principal.
		const tables = (
			getDb()
				.query("SELECT name FROM sqlite_master WHERE type = 'table'")
				.all() as { name: string }[]
		).map((t) => t.name);
		expect(tables).not.toContain("advisory_cache");
	});

	test("les migrations ALTER TABLE tardives ont été appliquées", () => {
		// Elles n'avalent plus que « duplicate column name » : seule une
		// vérification du schéma prouve qu'elles ont bien eu lieu.
		const tickets = (
			getDb().query("PRAGMA table_info(tickets)").all() as { name: string }[]
		).map((c) => c.name);
		expect(tickets).toContain("content_hash");

		const reports = (
			getDb().query("PRAGMA table_info(reports)").all() as { name: string }[]
		).map((c) => c.name);
		expect(reports).toContain("details");
	});

	test("une annotation sur un projet inexistant est refusée par la clé étrangère", () => {
		// Corollaire : la convention `project_id = -1` des annotations globales est
		// impossible (défaut N7). L'agrégateur et l'import la manipulent pourtant.
		expect(() =>
			getDb()
				.query("INSERT INTO annotations (cve, project_id) VALUES ('CVE-1', -1)")
				.run(),
		).toThrow(/FOREIGN KEY/);
	});

	test("appliquer le schéma deux fois est sans effet", () => {
		// `CREATE TABLE IF NOT EXISTS` plus des ALTER en try/catch : un second
		// passage ne doit ni lever ni dupliquer.
		expect(() => getDb()).not.toThrow();
		const n = (
			getDb()
				.query("SELECT COUNT(*) as n FROM sqlite_master WHERE type = 'table'")
				.get() as { n: number }
		).n;
		expect(n).toBeGreaterThan(9);
	});
});

describe("db/index — migration de la clé d'occurrence (N10)", () => {
	useTempDb("migration-n10");

	/**
	 * Les lignes écrites sous l'ancienne convention portaient `cve = package` pour
	 * les vulnérabilités sans CVE. Le titre qui les distinguait n'a jamais été
	 * stocké : elles sont ambiguës par construction, on ne peut pas les réparer,
	 * seulement les retirer. La migration les purge à l'ouverture de la base.
	 */
	test("une ligne de l'ancienne convention est purgée", () => {
		const p = createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		// Écriture directe, pour reproduire l'ancienne forme.
		getDb()
			.query(
				"INSERT INTO cve_occurrences (project_id, package, cve, is_baseline) VALUES (?, 'lodash', 'lodash', 1)",
			)
			.run(p.id);

		closeDb();
		getDb(); // réouverture : la migration s'exécute

		const restantes = getDb()
			.query("SELECT COUNT(*) as n FROM cve_occurrences")
			.get() as { n: number };
		expect(restantes.n).toBe(0);
	});

	test("une ligne portant une vraie CVE n'est pas touchée", () => {
		// Aucune référence CVE ou GHSA ne peut coïncider avec un nom de paquet :
		// le marqueur de l'ancienne convention est donc sans ambiguïté.
		const p = createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		getDb()
			.query(
				"INSERT INTO cve_occurrences (project_id, package, cve, is_baseline) VALUES (?, 'lodash', 'CVE-2020-8203', 1)",
			)
			.run(p.id);

		closeDb();
		getDb();

		const restantes = getDb()
			.query("SELECT cve FROM cve_occurrences")
			.all() as { cve: string }[];
		expect(restantes.map((r) => r.cve)).toEqual(["CVE-2020-8203"]);
	});

	test("une ligne de la nouvelle convention n'est pas touchée", () => {
		// `cve = titre` : différent du nom du paquet, donc conservée.
		const p = createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		getDb()
			.query(
				"INSERT INTO cve_occurrences (project_id, package, cve, is_baseline) VALUES (?, 'lodash', 'Prototype pollution', 1)",
			)
			.run(p.id);

		closeDb();
		getDb();

		const restantes = getDb()
			.query("SELECT cve FROM cve_occurrences")
			.all() as { cve: string }[];
		expect(restantes.map((r) => r.cve)).toEqual(["Prototype pollution"]);
	});

	test("la migration est idempotente", () => {
		// Elle s'exécute à chaque ouverture : deux passages ne doivent rien casser.
		closeDb();
		getDb();
		closeDb();
		expect(() => getDb()).not.toThrow();
	});
});
