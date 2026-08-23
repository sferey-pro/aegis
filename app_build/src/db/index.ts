import { Database } from "bun:sqlite";

let db: Database | null = null;

/**
 * Chemin du fichier de base — **source de vérité unique**.
 *
 * Lu à chaque appel, jamais mémorisé : `useTempDb` et la restauration
 * réaffectent `DB_PATH` en cours de vie du process, et une constante de module
 * évaluée à l'import pointerait sur la base du premier test.
 *
 * L'existence de cette fonction est un correctif à part entière (N2). La
 * sauvegarde résolvait sa cible depuis `process.cwd()` sur un `aegis.db` que
 * personne n'ouvre jamais, tandis que `getDb()` ouvrait `audit.sqlite` : une
 * restauration annonçait « effectuée » et ne changeait rien. Trois modules
 * recomposaient ce chemin de leur côté ; il n'y en a plus qu'un.
 */
export function dbPath(): string {
	return process.env.DB_PATH || "audit.sqlite";
}

/**
 * Retourne l'instance de la base de données.
 * Implémente la connexion paresseuse (lazy load) comme requis dans CONTEXT.md
 */
export function getDb(): Database {
	if (!db) {
		db = new Database(dbPath(), { create: true });

		// `busy_timeout` **en premier**, avant tout autre PRAGMA.
		//
		// Le passage en WAL demande un verrou exclusif sur le fichier. Sans délai de
		// grâce déjà posé, ce tout premier PRAGMA échoue immédiatement en
		// `SQLITE_BUSY` si quoi que ce soit tient encore le fichier — ce qui arrive
		// juste après une restauration, quand la connexion précédente vient d'être
		// fermée. L'ouverture de la base échouait donc alors qu'une attente de
		// quelques millisecondes suffisait. Ordre observé, pas supposé.
		db.exec("PRAGMA busy_timeout = 5000;");

		// Mode WAL, fortement recommandé avec SQLite pour les lectures concurrentes.
		db.exec("PRAGMA journal_mode = WAL;");
		db.exec("PRAGMA synchronous = NORMAL;");
		db.exec("PRAGMA wal_autocheckpoint = 500;");

		// Activer les clés étrangères
		db.exec("PRAGMA foreign_keys = ON;");

		initDb(db);
	}
	return db;
}

/**
 * Exécute `fn` dans **une seule** transaction.
 *
 * Pourquoi passer par ici plutôt que d'appeler `getDb().transaction(fn)` au point
 * d'usage : le wrapper de `bun:sqlite` compile son propre jeu d'instructions
 * (`BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`) **à chaque construction**, et ne
 * les finalise jamais. Construit à chaque requête, il fait donc fuiter un jeu par
 * appel. Les conséquences ne se voient pas tout de suite : la connexion refuse de
 * se fermer — `close()` diffère silencieusement tant qu'une instruction est
 * vivante — et la connexion suivante échoue en `SQLITE_BUSY` dès son `PRAGMA
 * journal_mode`. Symptôme observé sur le chemin de restauration, une dizaine
 * d'imports plus loin.
 *
 * Le wrapper est donc mémorisé **par instance de base**, et jeté quand l'instance
 * change — ce qui arrive à chaque restauration et à chaque remise à zéro.
 *
 * Ré-entrance : un appel imbriqué exécute simplement `fn`, sans ouvrir de second
 * niveau. La transaction extérieure porte déjà l'atomicité, et écraser le travail
 * en cours produirait une transaction vide.
 */
let transactionMemo: { base: Database; lancer: () => void } | null = null;
let travailCourant: () => void = () => {};
let profondeur = 0;

export function runInTransaction(fn: () => void): void {
	if (profondeur > 0) {
		fn();
		return;
	}

	const base = getDb();
	if (!transactionMemo || transactionMemo.base !== base) {
		transactionMemo = {
			base,
			lancer: base.transaction(() => {
				travailCourant();
			}),
		};
	}

	travailCourant = fn;
	profondeur++;
	try {
		transactionMemo.lancer();
	} finally {
		profondeur--;
		travailCourant = () => {};
	}
}

/**
 * Ferme la connexion courante, utile pour les tests ou la restauration de snapshots
 */
export function closeDb() {
	if (db) {
		// Le wrapper de transaction est lâché **avant** la fermeture : il détient un
		// jeu d'instructions préparées, et `bun:sqlite` diffère la fermeture tant
		// qu'une instruction reste vivante. Le garder maintiendrait le descripteur
		// ouvert, donc le fichier verrouillé — ce qui casse la restauration, dont
		// c'est justement l'étape suivante.
		transactionMemo = null;
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

	/**
	 * Même règle que plus bas : on n'avale que « duplicate column name », la seule
	 * erreur attendue d'un `ADD COLUMN` idempotent. Ces blocs avalaient tout, y
	 * compris une base corrompue ou un index impossible à créer — l'application
	 * tournait alors sur un schéma qu'elle croyait à jour.
	 */
	const ajout = (sql: string) => {
		try {
			database.exec(sql);
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : String(e);
			if (/duplicate column name/i.test(message)) return;
			throw e;
		}
	};

	ajout(`ALTER TABLE projects ADD COLUMN slug TEXT;`);
	database.exec(
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);`,
	);
	ajout(`ALTER TABLE projects ADD COLUMN is_remote BOOLEAN DEFAULT 0;`);

	// Les deux `ALTER TABLE advisory_cache` qui figuraient ici ont été retirées :
	// elles s'exécutaient **avant** la création de la table, plus bas dans cette
	// même fonction. Elles échouaient donc à chaque démarrage sur « no such
	// table », et le `catch` vide le masquait — du code mort depuis son écriture.
	// Les ajouts réels ont lieu après le `CREATE TABLE`, avec les autres.

	// Populate missing slugs. Pas de `catch` : un slug manquant rend le projet
	// inatteignable par `POST /api/ingest/:slug`, donc un échec ici doit remonter
	// plutôt que d'être journalisé et oublié.
	database.exec(`
    UPDATE projects
    SET slug = lower(replace(name, ' ', '-')) || '-' || id
    WHERE slug IS NULL;
  `);

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

	/**
	 * Ajout de colonne idempotent.
	 *
	 * SQLite n'a pas d'`ADD COLUMN IF NOT EXISTS` : la seule façon de savoir si la
	 * colonne existe déjà est de tenter l'ajout. On n'avale donc **que** cette
	 * erreur précise. Les `catch` vides précédents masquaient aussi une base
	 * corrompue, une table absente ou un disque plein — une migration qui échoue
	 * en silence laisse l'application tourner sur un schéma qu'elle croit à jour,
	 * et le défaut se manifeste bien plus loin, sous une forme incompréhensible.
	 */
	const ajouteColonne = (table: string, definition: string) => {
		try {
			// `database`, jamais la globale `db` (C9) : elles coïncident au démarrage
			// normal, mais pas quand `initDb` est appelée sur une autre instance —
			// tests, restauration. Et `db?.query` **n'échouait pas** dans ce cas : il
			// ne faisait rien du tout, donc la migration était silencieusement sautée.
			database.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : String(e);
			if (/duplicate column name/i.test(message)) return;
			throw e;
		}
	};

	ajouteColonne("reports", "details JSON DEFAULT '[]'");
	ajouteColonne("tickets", "content_hash TEXT");

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
	// Pas de `try/catch` : la table est créée juste au-dessus par le `CREATE TABLE
	// IF NOT EXISTS`, donc un échec ici est un vrai problème et doit remonter.
	database.query("DELETE FROM cve_occurrences WHERE cve = package").run();
}
