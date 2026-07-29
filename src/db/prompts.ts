import { getDb } from "./index";

export interface Prompt {
	id: number;
	title: string;
	body: string;
	tags: string[];
	created_at: string;
}

export function listPrompts(): Prompt[] {
	const db = getDb();
	const rows = db
		.query("SELECT * FROM prompts ORDER BY title ASC")
		.all() as any[];
	return rows.map((r) => ({
		...r,
		tags: JSON.parse(r.tags || "[]"),
	}));
}

export function createPrompt(
	title: string,
	body: string,
	tags: string[] = [],
): Prompt {
	const db = getDb();
	const result = db
		.query(
			"INSERT INTO prompts (title, body, tags) VALUES (?, ?, ?) RETURNING *",
		)
		.get(title, body, JSON.stringify(tags)) as any;
	return { ...result, tags: JSON.parse(result.tags) };
}

export function updatePrompt(
	id: number,
	title: string,
	body: string,
	tags: string[],
): Prompt {
	const db = getDb();
	const result = db
		.query(
			"UPDATE prompts SET title = ?, body = ?, tags = ? WHERE id = ? RETURNING *",
		)
		.get(title, body, JSON.stringify(tags), id) as any;
	if (!result) throw new Error("Prompt not found");
	return { ...result, tags: JSON.parse(result.tags) };
}

export function deletePrompt(id: number): void {
	const db = getDb();
	db.query("DELETE FROM prompts WHERE id = ?").run(id);
}
