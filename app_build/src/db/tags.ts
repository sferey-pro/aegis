import { errorMessage } from "@/lib/utils";
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
	} catch (e: unknown) {
		if (errorMessage(e).includes("UNIQUE"))
			throw new Error("Un tag avec ce nom existe déjà");
		throw e;
	}
}

export function deleteTag(id: number): boolean {
	const db = getDb();
	// N37 : retourne s'il y a bien eu suppression, pour que la route réponde
	// 404 sur un identifiant inconnu. Sans cela, l'interface ne distinguait
	// pas « supprimé » de « n'existait pas », ce qui masquait une
	// désynchronisation entre la liste affichée et l'état réel.
	const info = db.query(`DELETE FROM tags WHERE id = ?`).run(id);
	return info.changes > 0;
}
