import { Database } from "bun:sqlite";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { closeDb, dbPath, getDb } from "./index";

/**
 * Instantanés de la base — création, inventaire, restauration.
 *
 * ## Ce qui était cassé (N2)
 *
 * La version précédente écrivait dans `resolve(process.cwd(), "backup.sqlite")`
 * et restaurait par-dessus `resolve(process.cwd(), "aegis.db")`, alors que la
 * base réellement ouverte est `DB_PATH` (défaut `audit.sqlite`). La restauration
 * copiait donc un instantané sur un fichier **que personne n'ouvre jamais**,
 * répondait « Restauration effectuée, redémarrage du serveur… », redémarrait — et
 * la base était identique à avant. Le comportement le plus mensonger de
 * l'application : elle affirmait avoir fait ce qu'elle n'avait pas fait.
 *
 * Trois défauts aggravants tenaient dans les huit lignes suivantes :
 *
 *  - **Aucune purge du `-wal`.** Même en visant le bon fichier, l'ancien journal
 *    d'écriture restait à côté et se rejouait par-dessus la base restaurée. On
 *    n'obtenait ni l'ancien état, ni le nouveau, mais un mélange des deux.
 *  - **`process.exit(0)`** tuait le process sans attendre les réponses HTTP en
 *    vol, là où la connexion paresseuse suffit : la requête suivante rouvre la
 *    nouvelle base d'elle-même.
 *  - **Aucun filet.** Une restauration réussie était irréversible.
 *
 * Et le champ `file` exigé par le schéma de la route n'était jamais transmis :
 * il ne servait qu'à valider, on restaurait toujours le même fichier.
 *
 * ## Ce que fait cette version
 *
 * Elle suit `CONTEXT.md` §12 : un dossier d'instantanés datés sous
 * `BACKUP_DIR/db`, une rotation, un inventaire avec compteurs, et une
 * restauration nommée en sept étapes dont l'ordre est la garantie principale.
 */

/** Dossier des instantanés. Dérivé de `BACKUP_DIR`, jamais mémorisé. */
export function snapshotDir(): string {
	return resolve(process.env.BACKUP_DIR || "backups", "db");
}

/** Nombre d'instantanés conservés par la rotation. */
function nbConserves(): number {
	const brut = Number(process.env.BACKUP_DB_KEEP);
	// Un réglage illisible ne doit pas se traduire par « ne rien conserver ».
	return Number.isFinite(brut) && brut > 0 ? Math.floor(brut) : 14;
}

/**
 * Un nom de fichier d'instantané, et rien d'autre.
 *
 * La restauration reçoit ce nom depuis le réseau et le concatène à un dossier :
 * sans ce contrôle, `../../etc/quelque-chose` sortirait du dossier prévu.
 * Liste blanche de caractères **et** rejet explicite de `..`, parce qu'un point
 * est un caractère autorisé par ailleurs.
 */
const NOM_VALIDE = /^[\w.-]+\.sqlite$/;

export function assertNomSnapshot(nom: string): void {
	if (!NOM_VALIDE.test(nom) || nom.includes("..")) {
		throw new Error("Nom de snapshot invalide");
	}
}

/** Date du jour en `YYYY-MM-DD`, pour nommer l'instantané quotidien. */
function aujourdhui(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Copie cohérente de la base vers `cible`.
 *
 * `VACUUM INTO` produit une base complète et compactée, pas un journal — c'est
 * ce qui rend l'instantané utilisable tel quel. Deux contraintes de SQLite :
 * la cible doit être **absente**, et le chemin ne peut pas être passé en
 * paramètre lié. Il est donc injecté en littéral, avec les apostrophes doublées.
 */
export function snapshotTo(cible: string): void {
	mkdirSync(dirname(cible), { recursive: true });
	if (existsSync(cible)) rmSync(cible, { force: true });
	const litteral = cible.replace(/'/g, "''");
	// `exec` et non `query`.
	//
	// `db.query()` met l'instruction en cache **par texte SQL**, et ce texte
	// contient le chemin de la cible : chaque instantané laissait donc une
	// instruction vivante de plus sur la connexion. Une instruction vivante
	// empêche la fermeture de la base, si bien qu'après quelques instantanés la
	// restauration échouait en « database is locked » — sur son propre appel à
	// `closeDb()`. `exec` ne retient rien.
	getDb().exec(`VACUUM INTO '${litteral}'`);
}

export interface SnapshotInfo {
	/** Nom du fichier, seule forme acceptée par la restauration. */
	file: string;
	/** Taille en octets. */
	size: number;
	/** Date de dernière écriture, en ISO. */
	mtime: string;
	/** Contenu résumé. Tout à zéro si le fichier est illisible. */
	counts: {
		projects: number;
		runs: number;
		tags: number;
		annotations: number;
		prompts: number;
	};
}

const COMPTEURS_VIDES: SnapshotInfo["counts"] = {
	projects: 0,
	runs: 0,
	tags: 0,
	annotations: 0,
	prompts: 0,
};

/**
 * Compteurs d'un instantané, lus en **lecture seule**.
 *
 * Un fichier corrompu, tronqué ou écrit par une version antérieure ne doit pas
 * faire échouer l'inventaire entier : c'est précisément le moment où l'exploitant
 * a besoin de voir la liste. Les compteurs retombent à zéro, et la ligne reste
 * affichée.
 */
function compteurs(chemin: string): SnapshotInfo["counts"] {
	let base: Database | null = null;
	try {
		base = new Database(chemin, { readonly: true });
		const un = (table: string): number => {
			try {
				const ligne = base?.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as
					| { n: number }
					| undefined;
				return ligne?.n ?? 0;
			} catch {
				// Table absente : l'instantané vient d'un schéma plus ancien.
				return 0;
			}
		};
		return {
			projects: un("projects"),
			runs: un("runs"),
			tags: un("tags"),
			annotations: un("annotations"),
			prompts: un("prompts"),
		};
	} catch {
		return { ...COMPTEURS_VIDES };
	} finally {
		base?.close();
	}
}

/** Instantanés présents, du plus récent au plus ancien. */
export function listSnapshots(): SnapshotInfo[] {
	const dossier = snapshotDir();
	if (!existsSync(dossier)) return [];

	const infos: SnapshotInfo[] = [];
	for (const nom of readdirSync(dossier)) {
		if (!nom.endsWith(".sqlite")) continue;
		const chemin = join(dossier, nom);
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(chemin);
		} catch {
			continue;
		}
		if (!stat.isFile()) continue;
		infos.push({
			file: nom,
			size: stat.size,
			mtime: stat.mtime.toISOString(),
			counts: compteurs(chemin),
		});
	}
	return infos.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

/**
 * Retire les instantanés au-delà du quota, du plus ancien au plus récent.
 *
 * Les `pre-restore-*` sont **exclus de la rotation** : ce sont des filets, pas
 * des sauvegardes périodiques, et les faire tourner reviendrait à effacer le
 * recours juste au moment où une série de restaurations le rend nécessaire.
 */
function rotation(): void {
	const dossier = snapshotDir();
	if (!existsSync(dossier)) return;

	const candidats = listSnapshots().filter(
		(s) => !s.file.startsWith("pre-restore-"),
	);
	for (const trop of candidats.slice(nbConserves())) {
		rmSync(join(dossier, trop.file), { force: true });
	}
}

export interface CreateSnapshotResult {
	success: true;
	/** Chemin absolu du fichier écrit. */
	path: string;
	/** Nom du fichier, à repasser tel quel à la restauration. */
	file: string;
	/** Inventaire après création. */
	snapshots: SnapshotInfo[];
}

/**
 * Écrit l'instantané du jour. Un second appel le même jour remplace le premier —
 * `VACUUM INTO` refuse une cible existante, donc elle est retirée d'abord.
 */
export function createSnapshot(): CreateSnapshotResult {
	const file = `audit-${aujourdhui()}.sqlite`;
	const cible = join(snapshotDir(), file);
	snapshotTo(cible);
	rotation();
	return { success: true, path: cible, file, snapshots: listSnapshots() };
}

export interface RestoreSnapshotResult {
	ok: true;
	/** Nom du filet écrit avant remplacement, `null` si la base était illisible. */
	preRestore: string | null;
	/** Inventaire après restauration — le filet y figure. */
	snapshots: SnapshotInfo[];
}

/**
 * Remplace la base courante par un instantané nommé.
 *
 * **L'ordre des sept étapes est la garantie.** Valider avant de toucher au
 * disque, prendre le filet avant de fermer, fermer avant de copier, purger le
 * journal avant de laisser rouvrir. Inverser deux d'entre elles suffit à
 * produire une base incohérente, et l'ancienne implémentation en sautait quatre.
 *
 * Aucune réouverture ici : `getDb()` est paresseux, la requête suivante ouvrira
 * la base restaurée. C'est ce qui remplace le `process.exit(0)` — il n'y a rien
 * à redémarrer.
 */
export function restoreSnapshot(file: string): RestoreSnapshotResult {
	// 1. Le nom vient du réseau : il est validé avant d'être concaténé.
	assertNomSnapshot(file);

	// 2. Existence de la source, avant tout effet de bord.
	const source = join(snapshotDir(), basename(file));
	if (!existsSync(source)) {
		throw new Error(`Snapshot introuvable : ${file}`);
	}

	const cible = resolve(dbPath());

	// 3. Filet de sécurité, pendant que la base courante est encore ouverte et
	//    cohérente. Son échec est toléré : une base vide ou illisible ne doit pas
	//    empêcher de restaurer, c'est justement le cas où l'on en a besoin.
	let preRestore: string | null = null;
	const nomFilet = `pre-restore-${Date.now()}.sqlite`;
	try {
		snapshotTo(join(snapshotDir(), nomFilet));
		preRestore = nomFilet;
	} catch {
		preRestore = null;
	}

	// 4. Fermer la connexion : on ne remplace pas un fichier sous une base ouverte.
	closeDb();

	// 5. Remplacer la base réellement ouverte — `DB_PATH`, pas un fichier deviné.
	copyFileSync(source, cible);

	// 6. Purger le journal d'écriture. Sans cette étape, l'ancien `-wal` se
	//    rejoue par-dessus la base restaurée : ni l'ancien état, ni le nouveau.
	for (const suffixe of ["-wal", "-shm"]) {
		const compagnon = `${cible}${suffixe}`;
		if (existsSync(compagnon)) rmSync(compagnon, { force: true });
	}

	// 7. Reconnexion paresseuse : rien à faire, `getDb()` s'en charge.
	return { ok: true, preRestore, snapshots: listSnapshots() };
}
