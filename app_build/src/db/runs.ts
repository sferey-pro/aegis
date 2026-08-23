import type { Vulnerability } from "../lib/parsers/types";
import { getDb } from "./index";

export type RunStatus = "ok" | "vulnerable" | "error";

export interface RunCounts {
	critical: number;
	high: number;
	moderate: number;
	low: number;
	info: number;
	unknown: number;
}

export interface Run {
	id: number;
	project_id: number;
	status: RunStatus;
	total: number;
	counts: RunCounts;
	vulnerabilities: Vulnerability[];
	command: string | null;
	commit_sha: string | null;
	error: string | null;
	duration_ms: number;
	ran_at: string;
}

/**
 * Représentation d'une ligne `runs` telle que SQLite la renvoie : les colonnes
 * JSON arrivent en chaîne. `parseRun` les réhydrate ; le type tolère les deux
 * formes car certaines requêtes (RETURNING) peuvent déjà renvoyer l'objet.
 */
type RunRow = Omit<Run, "counts" | "vulnerabilities"> & {
	counts: string | RunCounts;
	vulnerabilities: string | Vulnerability[];
};

export interface CreateRunInput {
	project_id: number;
	status: RunStatus;
	total: number;
	counts: RunCounts;
	vulnerabilities: Vulnerability[];
	command?: string | null;
	commit_sha?: string | null;
	error?: string | null;
	duration_ms: number;
}

/**
 * Projection réduite utilisée par l'historique global : seules les colonnes
 * nécessaires au calcul de la série sont chargées.
 */
type HistoryRow = Pick<Run, "project_id" | "status"> & {
	ran_at: string;
	counts: string | RunCounts;
};

function parseRun(row: RunRow): Run {
	return {
		...row,
		counts:
			typeof row.counts === "string" ? JSON.parse(row.counts) : row.counts,
		vulnerabilities:
			typeof row.vulnerabilities === "string"
				? JSON.parse(row.vulnerabilities)
				: row.vulnerabilities,
	};
}

export function addRun(input: CreateRunInput): Run {
	const db = getDb();

	const query = db.query(`
    INSERT INTO runs (
      project_id, status, total, counts, vulnerabilities, 
      command, commit_sha, error, duration_ms
    ) VALUES (
      $project_id, $status, $total, $counts, $vulnerabilities, 
      $command, $commit_sha, $error, $duration_ms
    )
    RETURNING *
  `);

	const row = query.get({
		$project_id: input.project_id,
		$status: input.status,
		$total: input.total,
		$counts: JSON.stringify(input.counts),
		$vulnerabilities: JSON.stringify(input.vulnerabilities),
		$command: input.command || null,
		$commit_sha: input.commit_sha || null,
		$error: input.error || null,
		$duration_ms: input.duration_ms,
	});

	return parseRun(row as RunRow);
}

export function getRunsForProject(projectId: number, limit = 30): Run[] {
	const db = getDb();
	const rows = db
		.query(`
    SELECT * FROM runs 
    WHERE project_id = ? 
    ORDER BY ran_at DESC, id DESC 
    LIMIT ?
  `)
		.all(projectId, limit) as RunRow[];

	return rows.map(parseRun);
}

export function getLatestRun(projectId: number): Run | null {
	const db = getDb();
	const row = db
		.query(`
    SELECT * FROM runs 
    WHERE project_id = ? 
    ORDER BY ran_at DESC, id DESC 
    LIMIT 1
  `)
		.get(projectId) as RunRow | null;

	return row ? parseRun(row) : null;
}

/**
 * Dernier run de chaque projet, en une requête.
 *
 * **Même définition que `getLatestRun`** : `ran_at DESC, id DESC`, comme
 * `CONTEXT.md` §4 l'exige. Cette variante retenait `MAX(id)`. Les deux
 * coïncident tant que les identifiants sont monotones avec le temps, mais
 * divergent après une restauration de snapshot ou un import de runs hors ordre
 * chronologique — et la divergence est silencieuse : la carte projet affiche un
 * run, l'agrégation CVE et la déduplication d'audit en utilisent un autre
 * (défaut N29).
 *
 * `ROW_NUMBER()` plutôt qu'un `MAX()` joint : c'est le seul moyen de trier sur
 * deux colonnes dans l'agrégat, et SQLite le supporte depuis 3.25.
 *
 * Les identifiants passent en **bindings**, plus par concaténation. Ils viennent
 * aujourd'hui d'un `SELECT id FROM projects`, donc rien n'est exploitable en
 * l'état, mais un futur appelant passant un `parseInt` non gardé produisait un
 * `IN (NaN)` — soit un 500 « no such column: NaN ».
 */
export function getLatestRunsByProjectIds(
	projectIds: number[],
): Record<number, Run> {
	if (projectIds.length === 0) return {};
	const db = getDb();
	const marques = projectIds.map(() => "?").join(",");

	const rows = db
		.query(`
		SELECT * FROM (
			SELECT r.*, ROW_NUMBER() OVER (
				PARTITION BY r.project_id ORDER BY r.ran_at DESC, r.id DESC
			) AS rang
			FROM runs r
			WHERE r.project_id IN (${marques})
		)
		WHERE rang = 1
	`)
		.all(...projectIds) as (RunRow & { rang: number })[];

	const res: Record<number, Run> = {};
	for (const row of rows) {
		res[row.project_id] = parseRun(row);
	}
	return res;
}

export function deleteRun(id: number): void {
	const db = getDb();
	db.query(`DELETE FROM runs WHERE id = ?`).run(id);
}

/** Un point de la série globale, tel que CONTEXT.md §4 le spécifie. */
export interface HistoryPoint {
	/** Jour du bucket, `YYYY-MM-DD` (ou `YYYY-MM-DD HH` en vue horaire). */
	date: string;
	/** Libellé d'affichage : « JJ/MM », ou « NNh » en vue horaire. */
	label: string;
	counts: RunCounts;
	/** Somme des **six** sévérités. */
	total: number;
}

const SEVERITES = [
	"critical",
	"high",
	"moderate",
	"low",
	"info",
	"unknown",
] as const;

function countsVides(): RunCounts {
	return { critical: 0, high: 0, moderate: 0, low: 0, info: 0, unknown: 0 };
}

/**
 * Bornes acceptées pour la fenêtre, appliquées par la route.
 *
 * `?days=100000` construisait cent mille buckets, chacun parcourant la map
 * d'état de tous les projets — sur un process unique, l'API entière se bloquait.
 * Un an couvre tous les usages réels de cet écran.
 */
export const HISTORY_DAYS_MIN = 1;
export const HISTORY_DAYS_MAX = 365;

/**
 * Série temporelle globale : total agrégé de tous les projets actifs, par jour.
 *
 * ## Ce qui était cassé (N13)
 *
 *  - **Deux sévérités perdues.** L'agrégation ne cumulait que `critical`,
 *    `high`, `moderate` et `low` : `info` et `unknown` étaient *définitivement
 *    absents* de la série, et il n'y avait pas de `total` — alors que §4 le
 *    définit comme la somme des **six**.
 *  - **Fuseau.** Les buckets étaient calculés en heure locale
 *    (`getFullYear`/`getMonth`) alors que `ran_at` est stocké en UTC : en fin de
 *    journée dans un fuseau positif, un run était rangé dans le bucket du
 *    lendemain. §4 dit `ran_at[0:10]` — la clé se lit **dans la chaîne**, sans
 *    conversion, ce qui rend le problème impossible par construction.
 *  - **Pas de date exploitable.** `date` portait un libellé d'affichage
 *    « JJ/MM » ; la donnée métier vivait dans un champ additionnel `rawDate`.
 *    Les deux sont désormais nommés pour ce qu'ils sont.
 *  - **Requête non bornée.** Le `SELECT` chargeait **tous** les runs de tous les
 *    projets actifs, quelle que soit la fenêtre demandée.
 *
 * ## Ce que garantit cette version
 *
 * Deux requêtes au lieu d'une : les runs **de la fenêtre**, et l'état d'entrée —
 * le dernier run non-erreur de chaque projet **avant** la fenêtre. Sans cet
 * amorçage, un projet audité une seule fois il y a six mois disparaîtrait de la
 * série, ce qui se lirait comme une remédiation.
 *
 * Conforme et conservé : un run `error` est ignoré sans écraser l'état connu
 * (une erreur ne doit pas faire disparaître les vulnérabilités précédentes),
 * l'état est porté dans le temps, la dernière écriture du jour gagne, et seuls
 * les projets non ignorés comptent.
 */
export function getGlobalHistory(days = 30): HistoryPoint[] {
	const db = getDb();
	const projets = db
		.query(`SELECT id FROM projects WHERE ignored = 0`)
		.all() as { id: number }[];

	const isHourly = days === 1;
	/** Longueur de la clé de bucket dans `ran_at` : « YYYY-MM-DD » ou « … HH ». */
	const tailleCle = isHourly ? 13 : 10;

	/** Libellé d'affichage d'une clé de bucket. */
	const libelle = (cle: string) =>
		isHourly
			? `${cle.slice(11, 13)}h`
			: `${cle.slice(8, 10)}/${cle.slice(5, 7)}`;

	// Buckets construits **en UTC**, dans le même format que `ran_at`, pour que la
	// comparaison reste une comparaison de chaînes.
	const maintenant = Date.now();
	const pas = isHourly ? 3_600_000 : 86_400_000;
	const nb = isHourly ? 24 : days;
	const buckets: string[] = [];
	for (let i = nb - 1; i >= 0; i--) {
		const iso = new Date(maintenant - i * pas).toISOString();
		buckets.push(
			isHourly ? `${iso.slice(0, 10)} ${iso.slice(11, 13)}` : iso.slice(0, 10),
		);
	}

	const vide = (): HistoryPoint[] =>
		buckets.map((b) => ({
			date: b,
			label: libelle(b),
			counts: countsVides(),
			total: 0,
		}));

	if (projets.length === 0) return vide();

	const premier = buckets[0];
	if (!premier) return vide();
	// Début de fenêtre au format de `ran_at`, pour comparer en SQL sans conversion.
	const debut = isHourly ? `${premier}:00:00` : `${premier} 00:00:00`;
	const marques = projets.map(() => "?").join(",");
	const ids = projets.map((p) => p.id);

	// 1. Les runs de la fenêtre, et eux seuls.
	const rows = db
		.query(`
    SELECT project_id, ran_at, counts, status
    FROM runs
    WHERE project_id IN (${marques}) AND ran_at >= ?
    ORDER BY ran_at ASC
  `)
		.all(...ids, debut) as HistoryRow[];

	// 2. L'état d'entrée : dernier run **non-erreur** de chaque projet avant la
	//    fenêtre. `ROW_NUMBER` plutôt qu'un `MAX()` joint, pour trier sur
	//    `ran_at` puis `id` — la même définition du « dernier run » que partout
	//    ailleurs (§4, défaut N29).
	const amorces = db
		.query(`
		SELECT * FROM (
			SELECT r.project_id, r.counts, ROW_NUMBER() OVER (
				PARTITION BY r.project_id ORDER BY r.ran_at DESC, r.id DESC
			) AS rang
			FROM runs r
			WHERE r.project_id IN (${marques})
			  AND r.ran_at < ?
			  AND r.status != 'error'
		)
		WHERE rang = 1
	`)
		.all(...ids, debut) as { project_id: number; counts: string | RunCounts }[];

	const etat = new Map<number, RunCounts>();
	const lireCounts = (brut: string | RunCounts): RunCounts =>
		typeof brut === "string" ? JSON.parse(brut) : brut;

	for (const a of amorces) etat.set(a.project_id, lireCounts(a.counts));

	// Runs de la fenêtre, rangés par bucket. La clé est **découpée dans la
	// chaîne** : aucune conversion de date, donc aucun décalage de fuseau.
	const parBucket = new Map<string, HistoryRow[]>();
	for (const r of rows) {
		const cle = r.ran_at.slice(0, tailleCle);
		const liste = parBucket.get(cle);
		if (liste) liste.push(r);
		else parBucket.set(cle, [r]);
	}

	const resultat: HistoryPoint[] = [];
	for (const b of buckets) {
		for (const r of parBucket.get(b) ?? []) {
			// Un run en erreur est ignoré **sans écraser** l'état connu : une erreur
			// ne doit pas faire disparaître les vulnérabilités déjà mesurées.
			if (r.status === "error") continue;
			etat.set(r.project_id, lireCounts(r.counts));
		}

		const counts = countsVides();
		for (const c of etat.values()) {
			for (const sev of SEVERITES) counts[sev] += c[sev] || 0;
		}
		const total = SEVERITES.reduce((n, sev) => n + counts[sev], 0);

		resultat.push({ date: b, label: libelle(b), counts, total });
	}

	return resultat;
}
