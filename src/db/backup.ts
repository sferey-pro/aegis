import { copyFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb, getDb } from "./index";

const BACKUP_FILE = resolve(process.cwd(), "backup.sqlite");
const MAIN_FILE = resolve(process.cwd(), "aegis.db");

export function createSnapshot() {
	const db = getDb();
	if (existsSync(BACKUP_FILE)) {
		rmSync(BACKUP_FILE);
	}
	db.query(`VACUUM INTO '${BACKUP_FILE}'`).run();
	return { success: true, path: BACKUP_FILE };
}

export function restoreSnapshot() {
	if (!existsSync(BACKUP_FILE)) {
		throw new Error("Aucun snapshot trouvé (backup.sqlite n'existe pas).");
	}

	// Fermer la DB actuelle
	closeDb();

	// Écraser la DB par le backup
	copyFileSync(BACKUP_FILE, MAIN_FILE);

	// Dans un environnement bun --hot, process.exit(0) va redémarrer l'application.
	// Sinon, c'est au gestionnaire de processus (PM2, systemd, Docker) de redémarrer.
	setTimeout(() => process.exit(0), 100);

	return {
		success: true,
		message: "Restauration effectuée, redémarrage du serveur...",
	};
}
