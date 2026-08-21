import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createProject } from "@/db/projects";
import { getRunsForProject } from "@/db/runs";
import { useTempDb } from "@/test/db";
import { enqueueGlobalAudit, getAuditStatus, runSingleAudit } from "./queue";

/**
 * La file d'audit est un mutex unique de portée processus (CONTEXT.md §2) : un
 * seul audit à la fois, quel que soit le projet. Ces tests vérifient le verrou
 * lui-même, donc l'audit réel doit échouer vite — les projets pointent sur un
 * dossier inexistant, ce qui produit un run en erreur en quelques millisecondes
 * sans dépendre d'un outil installé.
 */

const aNettoyer: string[] = [];
const natif = globalThis.fetch;

beforeEach(() => {
	// Défaut fermé de `AEGIS_ALLOWED_ROOTS` (N3) : la route d'audit contrôle le
	// chemin avant de lancer l'outil, il faut donc déclarer un périmètre.
	process.env.AEGIS_ALLOWED_ROOTS = "/";
});

afterEach(() => {
	globalThis.fetch = natif;
	for (const d of aNettoyer.splice(0))
		rmSync(d, { recursive: true, force: true });
});

/** Coupe l'enrichissement GitHub : aucun appel sortant ne doit aboutir. */
function sansReseau() {
	globalThis.fetch = (() =>
		Promise.reject(new Error("hors ligne"))) as unknown as typeof fetch;
}

function projet(nom: string) {
	const racine = join(tmpdir(), `aegis-queue-${nom}-${randomUUID()}`);
	mkdirSync(racine, { recursive: true });
	aNettoyer.push(racine);
	return createProject({
		name: nom,
		path: racine,
		audit_path: "cible-absente",
		type: "node",
		tool: "npm",
	});
}

/** Attend que la file redevienne libre, avec une borne. */
async function attendreLaFin(limiteMs = 5000) {
	const debut = Date.now();
	while (getAuditStatus().isRunning) {
		if (Date.now() - debut > limiteMs) throw new Error("file toujours occupée");
		await new Promise((r) => setTimeout(r, 10));
	}
}

describe("lib/audit/queue", () => {
	useTempDb("queue");

	test("au repos, aucun audit n'est en cours", () => {
		const s = getAuditStatus();
		expect(s.isRunning).toBe(false);
		expect(s.currentProject).toBeNull();
		expect(s.progress).toBe(0);
	});

	test("total vaut 1 au repos, pour éviter une division par zéro", () => {
		// La barre de progression affiche `progress / total` : un total à 0
		// produirait NaN à l'écran.
		expect(getAuditStatus().total).toBe(1);
	});

	test("runSingleAudit exécute l'audit et libère le verrou", async () => {
		sansReseau();
		const p = projet("simple");
		const r = await runSingleAudit(p.id);

		expect(r.run?.status).toBe("error");
		expect(getAuditStatus().isRunning).toBe(false);
		expect(getAuditStatus().currentProject).toBeNull();
	});

	test("un second audit lancé pendant le premier est refusé", async () => {
		// C'est l'invariant : deux `npm audit` simultanés sur le même dépôt se
		// marcheraient dessus, et la console mélangerait leurs sorties.
		sansReseau();
		const p = projet("concurrent");
		const premier = runSingleAudit(p.id);

		expect(getAuditStatus().isRunning).toBe(true);
		await expect(runSingleAudit(p.id)).rejects.toThrow(
			"Un audit est déjà en cours, veuillez patienter.",
		);

		await premier;
		expect(getAuditStatus().isRunning).toBe(false);
	});

	test("le verrou est global, pas par projet", async () => {
		sansReseau();
		const a = projet("a");
		const b = projet("b");
		const premier = runSingleAudit(a.id);

		await expect(runSingleAudit(b.id)).rejects.toThrow(/déjà en cours/);
		await premier;
	});

	test("le projet en cours est exposé pendant l'audit", async () => {
		sansReseau();
		const p = projet("courant");
		const enCours = runSingleAudit(p.id);

		expect(getAuditStatus().currentProject).toBe(p.id);
		await enCours;
	});

	test("le verrou est libéré même si l'audit lève", async () => {
		// `runAudit` lève sur un projet inconnu : sans le `finally`, la file
		// resterait bloquée jusqu'au redémarrage du serveur.
		await expect(runSingleAudit(999_999)).rejects.toThrow("Projet introuvable");
		expect(getAuditStatus().isRunning).toBe(false);
		expect(getAuditStatus().currentProject).toBeNull();
	});

	test("un audit global traite tous les projets de son lot", async () => {
		sansReseau();
		const a = projet("lot-a");
		const b = projet("lot-b");

		enqueueGlobalAudit([a.id, b.id]);
		expect(getAuditStatus().isRunning).toBe(true);
		expect(getAuditStatus().total).toBe(2);

		await attendreLaFin();
		expect(getRunsForProject(a.id)).toHaveLength(1);
		expect(getRunsForProject(b.id)).toHaveLength(1);
	});

	test("l'audit global refuse de démarrer si un audit tourne", async () => {
		sansReseau();
		const p = projet("global-occupe");
		const premier = runSingleAudit(p.id);

		expect(() => enqueueGlobalAudit([p.id])).toThrow(
			"Un audit est déjà en cours",
		);
		await premier;
	});

	test("un audit unitaire est refusé pendant un audit global", async () => {
		sansReseau();
		const a = projet("global-a");
		const b = projet("global-b");
		enqueueGlobalAudit([a.id, b.id]);

		await expect(runSingleAudit(b.id)).rejects.toThrow(/déjà en cours/);
		await attendreLaFin();
	});

	test("l'échec d'un projet n'interrompt pas le lot", async () => {
		// Un projet supprimé du disque ne doit pas empêcher l'audit des suivants.
		sansReseau();
		const bon = projet("lot-survivant");
		enqueueGlobalAudit([999_999, bon.id]);

		await attendreLaFin();
		expect(getRunsForProject(bon.id)).toHaveLength(1);
	});

	test("l'état est remis à zéro à la fin du lot", async () => {
		sansReseau();
		const p = projet("remise-a-zero");
		enqueueGlobalAudit([p.id]);
		await attendreLaFin();

		const s = getAuditStatus();
		expect(s.isRunning).toBe(false);
		expect(s.currentProject).toBeNull();
		expect(s.progress).toBe(0);
		expect(s.total).toBe(1);
	});

	test("un lot vide libère immédiatement la file", async () => {
		enqueueGlobalAudit([]);
		await attendreLaFin();
		expect(getAuditStatus().isRunning).toBe(false);
	});

	test("la progression n'est pas observable après coup — écart documenté", async () => {
		// `progress` et `total` sont remis à zéro dès la fin du lot : le client qui
		// interroge l'état après le dernier projet ne voit jamais « 2 / 2 », mais
		// « 0 / 1 ». Un sondage trop lent conclut donc qu'aucun audit n'a eu lieu.
		sansReseau();
		const a = projet("progression");
		enqueueGlobalAudit([a.id]);
		await attendreLaFin();

		expect(getAuditStatus().progress).toBe(0);
		expect(getAuditStatus().total).toBe(1);
	});
});

/**
 * Contrats attendus — à activer au correctif.
 *
 * Chaque test ci-dessous énonce le comportement que `CONTEXT.md` demande, sur un
 * point où le code s'en écarte aujourd'hui. Ils sont marqués `test.failing` :
 * Bun exécute le corps et **attend son échec**, donc la suite reste verte tant
 * que le défaut existe.
 *
 * Le jour où le défaut est corrigé, le test se met à passer et Bun le signale en
 * rouge — « this test is marked as failing but it passed. Remove `.failing` if
 * tested behavior now works ». Il est donc impossible de corriger le code sans
 * reprendre le test.
 *
 * Marche à suivre au correctif : retirer `.failing`, puis supprimer le test
 * « écart documenté » correspondant, qui épinglait l'ancien comportement.
 */

describe("contrats attendus — à activer au correctif", () => {
	useTempDb("queue-contrats");

	// N39 — l'état est remis à zéro dès la fin du lot : un client qui sonde après
	// le dernier projet lit `0/1`, indistinguable d'un état au repos. Impossible de
	// savoir si un lot vient de se terminer ou n'a jamais eu lieu.
	test.failing("le dernier lot terminé reste observable (N39)", async () => {
		globalThis.fetch = (() =>
			Promise.reject(new Error("hors ligne"))) as unknown as typeof fetch;
		const a = projet("obs-a");
		const b = projet("obs-b");
		enqueueGlobalAudit([a.id, b.id]);
		await attendreLaFin();

		const s = getAuditStatus() as unknown as Record<string, unknown>;
		expect(s.lastTotal).toBe(2);
		expect(s.lastCompleted).toBe(2);
	});
});
