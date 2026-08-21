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
	} catch (_e) {}

	try {
		database.exec(
			`ALTER TABLE projects ADD COLUMN is_remote BOOLEAN DEFAULT 0;`,
		);
	} catch (_e) {}

	try {
		database.exec(`ALTER TABLE advisory_cache ADD COLUMN html_url TEXT;`);
		database.exec(`ALTER TABLE advisory_cache ADD COLUMN cvss_vector TEXT;`);
	} catch (_e) {}

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
		db?.query("ALTER TABLE reports ADD COLUMN details JSON DEFAULT '[]'").run();
	} catch (_e) {
		// La colonne existe probablement déjà
	}

	// Migration pour ajouter published_at, html_url, cvss_vector à advisory_cache
	try {
		db?.query(
			"ALTER TABLE advisory_cache ADD COLUMN published_at DATETIME",
		).run();
	} catch (_e) {
		// La colonne existe probablement déjà
	}
	try {
		db?.query("ALTER TABLE advisory_cache ADD COLUMN html_url TEXT").run();
	} catch (_e) {}
	try {
		db?.query("ALTER TABLE advisory_cache ADD COLUMN cvss_vector TEXT").run();
	} catch (_e) {}
	try {
		db?.query("ALTER TABLE tickets ADD COLUMN content_hash TEXT").run();
	} catch (_e) {}

	/**
	 * Purge des occurrences écrites sous l'ancienne clé d'identité (N10).
	 *
	 * Jusqu'au 21/08/2026, une vulnérabilité sans CVE était enregistrée avec
	 * `cve = package`. Le titre ne faisait donc pas partie de son identité, et
	 * deux avis distincts d'un même paquet partageaient une ligne — donc un
	 * `first_seen_at` et un `is_baseline`. Ces lignes sont **ambiguës par
	 * construction** : le titre qui les distinguait n'a jamais été stocké, on ne
	 * peut pas les réparer, seulement les retirer.
	 *
	 * Conséquence assumée : les vulnérabilités sans CVE repartent d'un
	 * `first_seen_at` à la date du prochain audit. C'est une perte réelle, mais
	 * la date conservée était fausse pour une partie d'entre elles, et c'est
	 * précisément la population que la baseline devait qualifier.
	 *
	 * Les lignes portant une vraie CVE ne sont pas touchées : leur identité était
	 * déjà correcte. Un `cve` égal au nom du paquet est le marqueur sans ambiguïté
	 * de l'ancienne convention — aucune référence CVE ou GHSA réelle ne peut
	 * coïncider avec un nom de paquet.
	 */
	try {
		db?.query("DELETE FROM cve_occurrences WHERE cve = package").run();
	} catch (_e) {
		// Table absente sur une base antérieure à `cve_occurrences`.
	}

	/**
	 * Unicité des noms de tags **insensible à la casse** (défaut N40).
	 *
	 * `UNIQUE` sur du TEXT sans `COLLATE NOCASE` laissait coexister « backend » et
	 * « Backend », produisant deux filtres visuellement identiques dans la page
	 * Projets, chacun ne correspondant qu'à une partie des projets. L'erreur est
	 * invisible à la lecture, et le message « Un tag avec ce nom existe déjà » ne
	 * se déclenchait pas.
	 *
	 * `CREATE TABLE IF NOT EXISTS` ne modifie pas une table existante : on ajoute
	 * donc un index unique `COLLATE NOCASE`, qui s'applique aussi aux bases déjà
	 * créées. L'ancienne contrainte `UNIQUE` reste — elle est un sous-ensemble plus
	 * strict, donc sans effet.
	 *
	 * Les collisions déjà en base sont fusionnées avant, sinon l'index refuse de se
	 * créer : on garde l'orthographe du plus petit `id` — la première saisie — et
	 * on **réécrit `projects.tags`** pour y remplacer les variantes supprimées. Ne
	 * pas le faire créerait exactement les tags fantômes de N12.
	 */
	try {
		const collisions = (db
			?.query(
				`SELECT LOWER(name) AS cle, MIN(id) AS garde, COUNT(*) AS n
				 FROM tags GROUP BY LOWER(name) HAVING n > 1`,
			)
			.all() ?? []) as { cle: string; garde: number; n: number }[];

		for (const c of collisions) {
			const survivant = db
				?.query(`SELECT name FROM tags WHERE id = ?`)
				.get(c.garde) as { name: string } | undefined;
			const doublons = (db
				?.query(`SELECT id, name FROM tags WHERE LOWER(name) = ? AND id <> ?`)
				.all(c.cle, c.garde) ?? []) as { id: number; name: string }[];
			if (!survivant) continue;

			for (const d of doublons) {
				// Réécrire les projets qui référencent l'orthographe supprimée.
				const projets = (db?.query(`SELECT id, tags FROM projects`).all() ??
					[]) as { id: number; tags: string | null }[];
				for (const proj of projets) {
					let noms: string[];
					try {
						noms = JSON.parse(proj.tags || "[]");
					} catch {
						continue;
					}
					if (!noms.includes(d.name)) continue;
					const remplaces = [
						...new Set(noms.map((n) => (n === d.name ? survivant.name : n))),
					];
					db?.query(`UPDATE projects SET tags = ? WHERE id = ?`).run(
						JSON.stringify(remplaces),
						proj.id,
					);
				}
				db?.query(`DELETE FROM tags WHERE id = ?`).run(d.id);
			}
		}

		db?.query(
			"CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_nocase ON tags(name COLLATE NOCASE)",
		).run();
	} catch (_e) {
		// Base antérieure à la table `tags`, ou index déjà présent.
	}
}
