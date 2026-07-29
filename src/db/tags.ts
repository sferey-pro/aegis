import { getDb } from "./index";

export interface Tag {
	id: number;
	name: string;
	color: string;
	created_at: string;
}

export function listTags(): Tag[] {
	const db = getDb();
	return db.query(`SELECT * FROM tags ORDER BY name ASC`).all() as Tag[];
}

export function createTag(name: string, color: string = "indigo"): Tag {
	const db = getDb();
	try {
		const info = db
			.query(`INSERT INTO tags (name, color) VALUES (?, ?)`)
			.run(name, color);
		return db
			.query(`SELECT * FROM tags WHERE id = ?`)
			.get(info.lastInsertRowid) as Tag;
	} catch (e: any) {
		if (e.message.includes("UNIQUE"))
			throw new Error("Un tag avec ce nom existe déjà");
		throw e;
	}
}

export function deleteTag(id: number): void {
	const db = getDb();
	db.query(`DELETE FROM tags WHERE id = ?`).run(id);
}
