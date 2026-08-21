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

export function getAnnotationsForProject(projectId: number): Annotation[] {
	const db = getDb();
	return db
		.query(
			`SELECT * FROM annotations WHERE project_id = ? OR project_id = -1 ORDER BY project_id DESC`,
		)
		.all(projectId) as Annotation[];
}

export function getAllAnnotations(): Annotation[] {
	const db = getDb();
	return db.query(`SELECT * FROM annotations`).all() as Annotation[];
}
