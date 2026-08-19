import { Database } from "bun:sqlite";

let db: Database | null = null;

/**
 * Retourne l'instance de la base de données.
 * Implémente la connexion paresseuse (lazy load) comme requis dans CONTEXT.md
 */
export function getDb(): Database {
	if (!db) {
		const dbPath = process.env.DB_PATH || "audit.sqlite";
		db = new Database(dbPath, { create: true });

		// Activation du mode WAL pour de meilleures performances (fortement recommandé avec SQLite)
		db.exec("PRAGMA journal_mode = WAL;");
		db.exec("PRAGMA synchronous = NORMAL;");
		db.exec("PRAGMA wal_autocheckpoint = 500;");
		db.exec("PRAGMA busy_timeout = 5000;");

		// Activer les clés étrangères
		db.exec("PRAGMA foreign_keys = ON;");

		initDb(db);
	}
	return db;
}

/**
 * Ferme la connexion courante, utile pour les tests ou la restauration de snapshots
 */
export function closeDb() {
	if (db) {
		db.close();
		db = null;
	}
}

/**
 * Crée les tables nécessaires si elles n'existent pas
 */
function initDb(database: Database) {
	database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      path TEXT NOT NULL,
      audit_path TEXT,
      type TEXT NOT NULL,
      tool TEXT NOT NULL,
      tags JSON DEFAULT '[]',
      ignored BOOLEAN DEFAULT 0,
      is_remote BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

	try {
		database.exec(`ALTER TABLE projects ADD COLUMN slug TEXT;`);
		database.exec(
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);`,
		);
	} catch (e) {}

	try {
		database.exec(
			`ALTER TABLE projects ADD COLUMN is_remote BOOLEAN DEFAULT 0;`,
		);
	} catch (e) {}

	try {
		database.exec(`ALTER TABLE advisory_cache ADD COLUMN html_url TEXT;`);
		database.exec(`ALTER TABLE advisory_cache ADD COLUMN cvss_vector TEXT;`);
	} catch (e) {}

	// Populate missing slugs
	try {
		database.exec(`
      UPDATE projects 
      SET slug = lower(replace(name, ' ', '-')) || '-' || id 
      WHERE slug IS NULL;
    `);
	} catch (e) {
		console.error("Error populating slugs:", e);
	}

	database.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      total INTEGER NOT NULL,
      counts JSON NOT NULL,
      vulnerabilities JSON NOT NULL,
      command TEXT,
      commit_sha TEXT,
      error TEXT,
      duration_ms INTEGER NOT NULL,
      ran_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_runs_project_ran_at ON runs(project_id, ran_at DESC);

    CREATE TABLE IF NOT EXISTS annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cve TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      note TEXT DEFAULT '',
      fixed_in TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cve, project_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      package TEXT NOT NULL,
      url TEXT NOT NULL,
      cves JSON NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, package),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cve_occurrences (
      project_id    INTEGER NOT NULL,
      package       TEXT NOT NULL,
      cve           TEXT NOT NULL,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_baseline   BOOLEAN DEFAULT 0,
      exposure_start DATETIME,
      resolved_at   DATETIME,
      PRIMARY KEY (project_id, package, cve),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT 'indigo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      tags JSON DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS advisory_cache (
      id TEXT PRIMARY KEY,
      severity TEXT,
      fixes JSON,
      html_url TEXT,
      cvss_vector TEXT,
      published_at DATETIME,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projects_audited INTEGER NOT NULL,
      total_vulnerabilities INTEGER NOT NULL,
      counts JSON NOT NULL,
      details JSON DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

	// Migration pour ajouter details
	try {
		db!.query("ALTER TABLE reports ADD COLUMN details JSON DEFAULT '[]'").run();
	} catch (e) {
		// La colonne existe probablement déjà
	}

	// Migration pour ajouter published_at, html_url, cvss_vector à advisory_cache
	try {
		db!
			.query("ALTER TABLE advisory_cache ADD COLUMN published_at DATETIME")
			.run();
	} catch (e) {
		// La colonne existe probablement déjà
	}
	try {
		db!.query("ALTER TABLE advisory_cache ADD COLUMN html_url TEXT").run();
	} catch (e) {}
	try {
		db!.query("ALTER TABLE advisory_cache ADD COLUMN cvss_vector TEXT").run();
	} catch (e) {}
	try {
		db!.query("ALTER TABLE tickets ADD COLUMN content_hash TEXT").run();
	} catch (e) {}
}
