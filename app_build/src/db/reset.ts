import { existsSync, rmSync } from "node:fs";
import { closeDb, getDb } from "./index";

/**
 * Remise à zéro de la configuration : **suppression du fichier principal**.
 *
 * La version précédente énumérait les tables à vider. C'était fragile pour une
 * raison qui n'a rien d'hypothétique : une table ajoutée plus tard y aurait
 * survécu en silence, sans que rien ne le signale — ni test, ni type, ni erreur.
 * La liste devait être tenue à jour par mémoire.
 *
 * Elle n'existe plus. Tout ce qui doit survivre à un reset vit dans un **second
 * fichier** (`src/db/advisories.ts`) : le cache d'avis GitHub et la clé GHSA.
 * Tout ce qui doit disparaître vit dans le fichier principal. La propriété est
 * donc **structurelle** : elle ne peut pas se désynchroniser d'une liste, parce
 * qu'il n'y a plus de liste.
 *
 * **Jamais touché** : les projets sur le disque. Cette fonction ne supprime que
 * le fichier SQLite d'Aegis et ses compagnons WAL ; aucun chemin de projet n'est
 * lu. Un test le vérifie.
 */
export interface ResetResult {
	/** Chemin du fichier supprimé. */
	path: string;
	/** Le fichier existait-il ? `false` sur une instance jamais démarrée. */
	existed: boolean;
	/** Nombre de projets déclarés avant la remise à zéro, pour le compte rendu. */
	projects: number;
}

export function resetConfiguration(): ResetResult {
	const path = process.env.DB_PATH || "audit.sqlite";

	// Compté avant fermeture : après, il n'y a plus de base à interroger. Sert
	// uniquement au compte rendu affiché à l'utilisateur.
	let projects = 0;
	try {
		projects = (
			getDb().query("SELECT COUNT(*) AS n FROM projects").get() as { n: number }
		).n;
	} catch {
		// Base absente ou illisible : le reset a d'autant plus de sens.
	}

	// La connexion doit être fermée avant de retirer le fichier, sinon SQLite
	// continue d'écrire dans un inode supprimé et la base « revient » au prochain
	// checkpoint.
	closeDb();

	const existed = existsSync(path);
	for (const suffixe of ["", "-wal", "-shm"]) {
		const f = `${path}${suffixe}`;
		if (existsSync(f)) rmSync(f, { force: true });
	}

	// Rouvrir immédiatement : `getDb()` recrée le fichier et applique le schéma,
	// donc l'application reste utilisable sans redémarrage. C'est ce qui distingue
	// cette remise à zéro de la restauration d'instantané, qui appelle
	// `process.exit(0)` (défaut N2).
	getDb();

	return { path, existed, projects };
}
