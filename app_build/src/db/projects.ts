import { getDb } from "./index";

export type ProjectType = "node" | "composer";
export type ProjectTool = "npm" | "yarn" | "bun" | "composer";

export interface Project {
	id: number;
	name: string;
	slug: string;
	path: string;
	audit_path: string | null;
	type: ProjectType;
	tool: ProjectTool;
	tags: string[];
	ignored: boolean;
	is_remote: boolean;
	created_at: string;
}

export interface CreateProjectInput {
	name: string;
	slug?: string;
	path: string;
	audit_path?: string | null;
	type: ProjectType;
	tool: ProjectTool;
	tags?: string[];
	ignored?: boolean;
	is_remote?: boolean;
}

/**
 * Ligne `projects` brute : `tags` est du JSON en chaîne et les booléens sont
 * stockés en 0/1 par SQLite.
 */
type ProjectRow = Omit<Project, "tags" | "ignored" | "is_remote"> & {
	tags: string | string[];
	ignored: number | boolean;
	is_remote: number | boolean;
};

function parseProject(row: ProjectRow): Project {
	return {
		...row,
		tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags,
		ignored: Boolean(row.ignored),
		is_remote: Boolean(row.is_remote),
	};
}

export function listProjects(): Project[] {
	const db = getDb();
	const rows = db
		.query(`SELECT * FROM projects ORDER BY created_at DESC, id DESC`)
		.all() as ProjectRow[];
	return rows.map(parseProject);
}

export function getProjectById(id: number): Project | null {
	const db = getDb();
	const row = db
		.query(`SELECT * FROM projects WHERE id = ?`)
		.get(id) as ProjectRow | null;
	return row ? parseProject(row) : null;
}

export function getProjectBySlug(slug: string): Project | null {
	const db = getDb();
	const row = db
		.query(`SELECT * FROM projects WHERE slug = ?`)
		.get(slug) as ProjectRow | null;
	return row ? parseProject(row) : null;
}

export function createProject(input: CreateProjectInput): Project {
	const db = getDb();

	const tagsStr = JSON.stringify(input.tags || []);
	const ignored = input.ignored ? 1 : 0;
	const is_remote = input.is_remote ? 1 : 0;
	let slug =
		input.slug ||
		input.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");
	if (!slug) slug = "project";

	// Assure slug uniqueness
	let finalSlug = slug;
	let counter = 1;
	while (db.query(`SELECT id FROM projects WHERE slug = ?`).get(finalSlug)) {
		finalSlug = `${slug}-${counter}`;
		counter++;
	}

	const query = db.query(`
    INSERT INTO projects (name, slug, path, audit_path, type, tool, tags, ignored, is_remote)
    VALUES ($name, $slug, $path, $audit_path, $type, $tool, $tags, $ignored, $is_remote)
    RETURNING *
  `);

	const row = query.get({
		$name: input.name,
		$slug: finalSlug,
		$path: input.path || "remote",
		$audit_path: input.audit_path || null,
		$type: input.type,
		$tool: input.tool,
		$tags: tagsStr,
		$ignored: ignored,
		$is_remote: is_remote,
	});

	return parseProject(row as ProjectRow);
}

export function updateProject(
	id: number,
	input: Partial<CreateProjectInput>,
): Project {
	const db = getDb();

	const current = getProjectById(id);
	if (!current) {
		throw new Error(`Project with id ${id} not found`);
	}

	const name = input.name !== undefined ? input.name.trim() : current.name;
	const path = input.path !== undefined ? input.path.trim() : current.path;
	const audit_path =
		input.audit_path !== undefined
			? input.audit_path
				? input.audit_path.trim()
				: null
			: current.audit_path;
	const type = input.type !== undefined ? input.type : current.type;
	const tool = input.tool !== undefined ? input.tool : current.tool;
	const tags =
		input.tags !== undefined
			? JSON.stringify(input.tags)
			: JSON.stringify(current.tags);
	const ignored =
		input.ignored !== undefined
			? input.ignored
				? 1
				: 0
			: current.ignored
				? 1
				: 0;

	const query = db.query(`
    UPDATE projects 
    SET name = $name, path = $path, audit_path = $audit_path, type = $type, tool = $tool, tags = $tags, ignored = $ignored
    WHERE id = $id
    RETURNING *
  `);

	const row = query.get({
		$id: id,
		$name: name,
		$path: path,
		$audit_path: audit_path,
		$type: type,
		$tool: tool,
		$tags: tags,
		$ignored: ignored,
	});

	return parseProject(row as ProjectRow);
}

export function deleteProject(id: number): void {
	const db = getDb();
	db.query(`DELETE FROM projects WHERE id = ?`).run(id);
}

export function toggleIgnoreProject(id: number): Project {
	const current = getProjectById(id);
	if (!current) throw new Error(`Project with id ${id} not found`);
	return updateProject(id, { ignored: !current.ignored });
}
