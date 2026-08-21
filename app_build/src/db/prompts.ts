import { getDb } from "./index";

/** Ligne `prompts` brute : `tags` est du JSON en chaîne. */
type PromptRow = Omit<Prompt, "tags"> & { tags: string | null };

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
		.all() as PromptRow[];
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
		.get(title, body, JSON.stringify(tags)) as PromptRow;
	return { ...result, tags: JSON.parse(result.tags || "[]") };
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
		.get(title, body, JSON.stringify(tags), id) as PromptRow;
	if (!result) throw new Error("Prompt not found");
	return { ...result, tags: JSON.parse(result.tags || "[]") };
}

export function deletePrompt(id: number): boolean {
	const db = getDb();
	// N37 : retourne s'il y a bien eu suppression, pour que la route réponde
	// 404 sur un identifiant inconnu. Sans cela, l'interface ne distinguait
	// pas « supprimé » de « n'existait pas », ce qui masquait une
	// désynchronisation entre la liste affichée et l'état réel.
	const info = db.query("DELETE FROM prompts WHERE id = ?").run(id);
	return info.changes > 0;
}
