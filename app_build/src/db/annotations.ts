import { getDb } from "./index";

export type AnnotationStatus =
	| "pending"
	| "confirmed"
	| "not_affected"
	| "ignored";

export interface Annotation {
	id: number;
	cve: string;
	project_id: number;
	status: AnnotationStatus;
	note: string;
	fixed_in: string | null;
	updated_at: string;
}

export function upsertAnnotation(
	cve: string,
	projectId: number,
	data: { status?: AnnotationStatus; note?: string; fixedIn?: string | null },
): Annotation {
	const db = getDb();

	const current = db
		.query(`SELECT * FROM annotations WHERE cve = ? AND project_id = ?`)
		.get(cve, projectId) as Annotation | null;

	let status = current ? current.status : "pending";
	let note = current ? current.note : "";
	let fixed_in = current ? current.fixed_in : null;

	if (data.status !== undefined) status = data.status;
	if (data.note !== undefined) note = data.note;
	if (data.fixedIn !== undefined) fixed_in = data.fixedIn;

	if (fixed_in && fixed_in.trim() === "") fixed_in = null;

	const query = db.query(`
    INSERT INTO annotations (cve, project_id, status, note, fixed_in)
    VALUES ($cve, $project_id, $status, $note, $fixed_in)
    ON CONFLICT(cve, project_id) DO UPDATE SET
      status = excluded.status,
      note = excluded.note,
      fixed_in = excluded.fixed_in,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `);

	return query.get({
		$cve: cve,
		$project_id: projectId,
		$status: status,
		$note: note,
		$fixed_in: fixed_in,
	}) as Annotation;
}

export function setAnnotationFix(
	cve: string,
	projectId: number,
	fixedIn: string | null,
): Annotation {
	return upsertAnnotation(cve, projectId, { fixedIn });
}

/**
 * Annotations d'un projet.
 *
 * La requête interrogeait aussi `project_id = -1`, une convention d'« annotation
 * globale » qui se superposait à tous les projets. Cette convention était
 * **inatteignable** : la colonne porte une clé étrangère vers `projects` et
 * `PRAGMA foreign_keys` est actif, donc l'insertion d'un `-1` levait. La branche
 * n'a donc jamais rien renvoyé (défaut N7).
 *
 * Elle est retirée plutôt que matérialisée par un projet fictif : `CONTEXT.md`
 * §7 fixe l'unité de triage au couple **(CVE, projet)** et ne mentionne aucune
 * portée globale. Garder la lecture aurait entretenu l'illusion d'une
 * fonctionnalité, et le `ORDER BY project_id DESC` qui servait à faire gagner le
 * projet sur le global n'a plus d'objet.
 */
export function getAnnotationsForProject(projectId: number): Annotation[] {
	const db = getDb();
	return db
		.query(`SELECT * FROM annotations WHERE project_id = ?`)
		.all(projectId) as Annotation[];
}

export function getAllAnnotations(): Annotation[] {
	const db = getDb();
	return db.query(`SELECT * FROM annotations`).all() as Annotation[];
}
