import { errorMessage } from "@/lib/utils";
import { getDb, runInTransaction } from "./index";

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

/**
 * Supprime un tag **et son nom dans tous les projets qui le référencent**.
 *
 * `CONTEXT.md` §9 spécifie une *cascade fonctionnelle* — « lit le nom, supprime
 * la ligne, réécrit chaque projet concerné ». Elle était absente : seule la ligne
 * du catalogue partait. Le nom restait dans le JSON `projects.tags`, continuait
 * de s'afficher sur les cartes, mais disparaissait de la liste des filtres, qui
 * vient de `/api/tags`. Des projets restaient donc étiquetés d'un tag inexistant
 * et sur lequel plus aucun filtre ne pouvait porter — un état irrécupérable sans
 * éditer chaque projet à la main (défaut N12).
 *
 * Pas de clé étrangère possible ici : les tags d'un projet sont un tableau JSON,
 * pas une table de jonction. La cascade est donc applicative, et à ce titre elle
 * doit être **transactionnelle** : une suppression appliquée sans les réécritures
 * recrée exactement le défaut.
 *
 * Le rapprochement se fait par **nom**, sensible à la casse, conformément à §9 —
 * voir N31 sur cet arbitrage, déjà tranché une fois dans le mauvais sens.
 *
 * Retourne `false` sur un identifiant inconnu, pour que la route réponde 404
 * (N37) : sans cela l'interface ne distinguait pas « supprimé » de « n'existait
 * pas », ce qui masquait une désynchronisation entre la liste affichée et l'état
 * réel.
 */
export function deleteTag(id: number): boolean {
	const db = getDb();

	const tag = db.query(`SELECT name FROM tags WHERE id = ?`).get(id) as {
		name: string;
	} | null;
	if (!tag) return false;

	let supprime = false;
	runInTransaction(() => {
		const info = db.query(`DELETE FROM tags WHERE id = ?`).run(id);
		supprime = info.changes > 0;
		if (!supprime) return;

		// Seuls les projets réellement concernés sont réécrits : `json_each` filtre
		// en SQL plutôt que de charger tout le parc pour le reposter.
		const concernes = db
			.query(
				`SELECT id, tags FROM projects
				  WHERE EXISTS (
				    SELECT 1 FROM json_each(projects.tags) WHERE value = ?
				  )`,
			)
			.all(tag.name) as { id: number; tags: string }[];

		const majTags = db.query(`UPDATE projects SET tags = ? WHERE id = ?`);
		for (const projet of concernes) {
			const restants = (JSON.parse(projet.tags) as string[]).filter(
				(nom) => nom !== tag.name,
			);
			majTags.run(JSON.stringify(restants), projet.id);
		}
	});

	return supprime;
}
