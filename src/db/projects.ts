import { getDb } from "./index";

export type ProjectType = "node" | "composer";
export type ProjectTool = "npm" | "yarn" | "bun" | "composer";

export interface Project {
  id: number;
  name: string;
  path: string;
  audit_path: string | null;
  type: ProjectType;
  tool: ProjectTool;
  tags: string[];
  ignored: boolean;
  created_at: string;
}

export interface CreateProjectInput {
  name: string;
  path: string;
  audit_path?: string | null;
  type: ProjectType;
  tool: ProjectTool;
  tags?: string[];
  ignored?: boolean;
}

function parseProject(row: any): Project {
  return {
    ...row,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
    ignored: Boolean(row.ignored)
  };
}

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db.query(`SELECT * FROM projects ORDER BY created_at DESC, id DESC`).all();
  return rows.map(parseProject);
}

export function getProjectById(id: number): Project | null {
  const db = getDb();
  const row = db.query(`SELECT * FROM projects WHERE id = ?`).get(id);
  return row ? parseProject(row) : null;
}

export function createProject(input: CreateProjectInput): Project {
  const db = getDb();
  
  const query = db.query(`
    INSERT INTO projects (name, path, audit_path, type, tool, tags, ignored)
    VALUES ($name, $path, $audit_path, $type, $tool, $tags, $ignored)
    RETURNING *
  `);
  
  const row = query.get({
    $name: input.name.trim(),
    $path: input.path.trim(),
    $audit_path: input.audit_path ? input.audit_path.trim() : null,
    $type: input.type,
    $tool: input.tool,
    $tags: JSON.stringify(input.tags || []),
    $ignored: input.ignored ? 1 : 0
  });
  
  return parseProject(row);
}

export function updateProject(id: number, input: Partial<CreateProjectInput>): Project {
  const db = getDb();
  
  const current = getProjectById(id);
  if (!current) {
    throw new Error(`Project with id ${id} not found`);
  }

  const name = input.name !== undefined ? input.name.trim() : current.name;
  const path = input.path !== undefined ? input.path.trim() : current.path;
  const audit_path = input.audit_path !== undefined ? (input.audit_path ? input.audit_path.trim() : null) : current.audit_path;
  const type = input.type !== undefined ? input.type : current.type;
  const tool = input.tool !== undefined ? input.tool : current.tool;
  const tags = input.tags !== undefined ? JSON.stringify(input.tags) : JSON.stringify(current.tags);
  const ignored = input.ignored !== undefined ? (input.ignored ? 1 : 0) : (current.ignored ? 1 : 0);

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
    $ignored: ignored
  });

  return parseProject(row);
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
