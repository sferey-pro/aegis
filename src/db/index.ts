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
      path TEXT NOT NULL,
      audit_path TEXT,
      type TEXT NOT NULL,
      tool TEXT NOT NULL,
      tags JSON DEFAULT '[]',
      ignored BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
