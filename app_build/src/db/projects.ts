import { getDb } from "./index";

export type ProjectType = "node" | "composer";
export type ProjectTool = "npm" | "yarn" | "bun" | "composer";

export interface BaseProject {
	id: number;
	name: string;
	slug: string;
	type: ProjectType;
	tool: ProjectTool;
	tags: string[];
	ignored: boolean;
	created_at: string;
}

export interface LocalProject extends BaseProject {
	source_type: "local";
	path: string;
	audit_path: string | null;
}

export interface RemoteProject extends BaseProject {
	source_type: "remote";
	path: string; // The local cache path
	audit_path: string | null;
	remote_url: string;
	remote_token: string | null;
}

export interface IngestProject extends BaseProject {
	source_type: "ingest";
	path: string; // usually ""
	audit_path: string | null;
}

export type Project = LocalProject | RemoteProject | IngestProject;

export interface CreateProjectInput {
	name: string;
	slug?: string;
	type: ProjectType;
	tool: ProjectTool;
	tags?: string[];
	ignored?: boolean;
	source_type?: "local" | "ingest" | "remote";

	// Local & Remote
	path?: string;
	audit_path?: string | null;

	// Remote
	remote_url?: string | null;
	remote_token?: string | null;
}

/**
 * Ligne `projects` brute
 */
type ProjectRow = {
	id: number;
	name: string;
	slug: string;
	type: any;
	tool: any;
	created_at: string;
	source_type: any;
	tags: string | string[];
	ignored: number | boolean;
	is_remote?: number | boolean;
	path: string;
	audit_path: string | null;
	remote_url?: string | null;
	remote_token?: string | null;
};

function parseProject(row: ProjectRow): Project {
	let st = row.source_type;
	if (!st) {
		st = row.source_type === "ingest" ? "ingest" : "local";
	}

	const base = {
		id: row.id,
		name: row.name,
		slug: row.slug,
		type: row.type,
		tool: row.tool,
		tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags,
		ignored: Boolean(row.ignored),
		created_at: row.created_at,
	};

	if (st === "remote") {
		return {
			...base,
			source_type: "remote",
			path: row.path,
			audit_path: row.audit_path || null,
			remote_url: row.remote_url!,
			remote_token: row.remote_token || null,
		};
	}

	if (st === "ingest") {
		return {
			...base,
			source_type: "ingest",
			path: row.path,
			audit_path: row.audit_path || null,
		};
	}

	return {
		...base,
		source_type: "local",
		path: row.path,
		audit_path: row.audit_path || null,
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
	const source_type = input.source_type || "local";

	let slug =
		input.slug ||
		input.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");
	if (!slug) slug = "project";

	let finalSlug = slug;
	let counter = 1;
	while (db.query(`SELECT id FROM projects WHERE slug = ?`).get(finalSlug)) {
		finalSlug = `${slug}-${counter}`;
		counter++;
	}

	const query = db.query(`
    INSERT INTO projects (name, slug, path, audit_path, type, tool, tags, ignored, source_type, remote_url, remote_token)
    VALUES ($name, $slug, $path, $audit_path, $type, $tool, $tags, $ignored, $source_type, $remote_url, $remote_token)
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
		$source_type: source_type,
		$remote_url: input.remote_url || null,
		$remote_token: input.remote_token || null,
	});

	return parseProject(row as ProjectRow);
}

export function updateProject(
	id: number,
	input: Partial<CreateProjectInput>,
): Project {
	const db = getDb();
	const current = getProjectById(id);
	if (!current) throw new Error(`Project with id ${id} not found`);

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
	const source_type =
		input.source_type !== undefined ? input.source_type : current.source_type;

	const currentRemoteUrl =
		current.source_type === "remote" ? current.remote_url : null;
	const currentRemoteToken =
		current.source_type === "remote" ? current.remote_token : null;
	const remote_url =
		input.remote_url !== undefined ? input.remote_url : currentRemoteUrl;
	const remote_token =
		input.remote_token !== undefined ? input.remote_token : currentRemoteToken;

	const query = db.query(`
    UPDATE projects 
    SET name = $name, path = $path, audit_path = $audit_path, type = $type, tool = $tool, tags = $tags, ignored = $ignored, source_type = $source_type, remote_url = $remote_url, remote_token = $remote_token
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
		$source_type: source_type,
		$remote_url: remote_url ?? null,
		$remote_token: remote_token ?? null,
	});

	return parseProject(row as ProjectRow);
}

export function deleteProject(id: number): boolean {
	const db = getDb();
	const info = db.query(`DELETE FROM projects WHERE id = ?`).run(id);
	return info.changes > 0;
}

export function toggleIgnoreProject(id: number): Project {
	const current = getProjectById(id);
	if (!current) throw new Error(`Project with id ${id} not found`);
	return updateProject(id, { ignored: !current.ignored });
}
