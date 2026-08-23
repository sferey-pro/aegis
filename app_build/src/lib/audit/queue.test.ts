import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createProject } from "@/db/projects";
import { getRunsForProject } from "@/db/runs";
import { useTempDb } from "@/test/db";
import {
	AuditEnCoursError,
	enqueueGlobalAudit,
	getAuditStatus,
	resetAuditHistory,
	runSingleAudit,
} from "./queue";

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

	test("deux audits du même projet ne coexistent pas", async () => {
		// C'est l'invariant : deux `npm audit` simultanés sur le même dépôt
		// écriraient deux runs pour un seul état du lockfile, et se
		// dédupliqueraient l'un contre l'autre de façon indéterminée.
		sansReseau();
		const p = projet("concurrent");
		const premier = runSingleAudit(p.id);

		expect(getAuditStatus().isRunning).toBe(true);
		await expect(runSingleAudit(p.id)).rejects.toThrow(
			"Un audit de ce projet est déjà en cours",
		);

		await premier;
		expect(getAuditStatus().isRunning).toBe(false);
	});

	test("le refus de concurrence est typé, pas un message à reconnaître", async () => {
		// Les routes doivent répondre 409 sans faire de correspondance sur le texte,
		// qui est destiné à l'utilisateur et peut être reformulé.
		sansReseau();
		const p = projet("typé");
		const premier = runSingleAudit(p.id);

		await expect(runSingleAudit(p.id)).rejects.toBeInstanceOf(
			AuditEnCoursError,
		);
		await premier;
	});

	test("le verrou est par projet, pas global (N8)", async () => {
		// Le verrou était global : un client conforme à §2, qui orchestre en
		// parallèle borné à 4, voyait trois audits sur quatre échouer
		// systématiquement. C'était le résiduel de C8 — un verrou posé pour un
		// endpoint batch que la spécification interdit, bloquant le mode
		// d'orchestration qu'elle prescrit.
		sansReseau();
		const a = projet("a");
		const b = projet("b");

		const deux = await Promise.all([
			runSingleAudit(a.id),
			runSingleAudit(b.id),
		]);
		expect(deux.map((r) => r.run?.project_id).sort()).toEqual(
			[a.id, b.id].sort(),
		);
	});

	test("quatre audits simultanés passent, le cinquième est refusé", async () => {
		// §2 borne la concurrence à 4. Le plafond est **appliqué** ici, pas
		// seulement demandé : un client qui l'ignore est refusé au lieu de saturer
		// la machine en `npm audit` concurrents.
		sansReseau();
		const projets = Array.from({ length: 5 }, (_, i) => projet(`pool-${i}`));
		const quatre = projets
			.slice(0, 4)
			.map((p) => runSingleAudit(p.id).catch(() => null));

		await expect(
			runSingleAudit((projets[4] as { id: number }).id),
		).rejects.toThrow(/Trop d'audits simultanés/);

		await Promise.all(quatre);
	});

	test("le plafond se libère à mesure que les audits finissent", async () => {
		sansReseau();
		const projets = Array.from({ length: 5 }, (_, i) => projet(`libere-${i}`));
		await Promise.all(
			projets.slice(0, 4).map((p) => runSingleAudit(p.id).catch(() => null)),
		);

		// Les quatre sont terminés : la cinquième place est disponible.
		await expect(
			runSingleAudit((projets[4] as { id: number }).id),
		).resolves.toBeDefined();
	});

	test("les projets en cours sont tous exposés", async () => {
		sansReseau();
		const a = projet("expose-a");
		const b = projet("expose-b");
		const enCours = Promise.all([runSingleAudit(a.id), runSingleAudit(b.id)]);

		expect(getAuditStatus().runningProjects.sort()).toEqual(
			[a.id, b.id].sort(),
		);
		await enCours;
		expect(getAuditStatus().runningProjects).toEqual([]);
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

	test("un second lot refuse de démarrer pendant le premier", async () => {
		// Un seul lot à la fois : deux lots se disputeraient le même pool et le
		// compte-rendu de progression n'aurait plus de sens.
		sansReseau();
		const p = projet("global-occupe");
		enqueueGlobalAudit([p.id]);

		expect(() => enqueueGlobalAudit([p.id])).toThrow(
			"Un audit est déjà en cours",
		);
		await attendreLaFin();
	});

	test("un lot n'empêche pas d'auditer un autre projet (N8)", async () => {
		// Le verrou global refusait tout audit unitaire pendant un lot. Un référent
		// qui voulait réauditer un projet précis devait attendre la fin du lot
		// entier.
		sansReseau();
		const a = projet("lot-x");
		const b = projet("lot-y");
		const horsLot = projet("hors-lot");
		enqueueGlobalAudit([a.id, b.id]);

		await expect(runSingleAudit(horsLot.id)).resolves.toBeDefined();
		await attendreLaFin();
	});

	test("un lot borne sa concurrence à quatre", async () => {
		// Sans borne, « Tout auditer » sur trente projets lancerait trente
		// `npm audit` d'un coup.
		sansReseau();
		const projets = Array.from({ length: 8 }, (_, i) => projet(`borne-${i}`));
		enqueueGlobalAudit(projets.map((p) => p.id));

		expect(getAuditStatus().runningProjects.length).toBeLessThanOrEqual(4);
		await attendreLaFin();
		expect(getAuditStatus().runningProjects).toEqual([]);
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

	test("le dernier lot terminé reste observable (N39)", async () => {
		// `progress` et `total` sont remis à zéro dès la fin du lot : un client qui
		// sonde après le dernier projet lit « 0 / 1 », indistinguable d'un état au
		// repos. `lastCompleted`/`lastTotal` conservent le bilan, et
		// `lastFinishedAt` distingue « terminé » de « jamais lancé ».
		sansReseau();
		const a = projet("progression-a");
		const b = projet("progression-b");
		enqueueGlobalAudit([a.id, b.id]);
		await attendreLaFin();

		const etat = getAuditStatus();
		expect(etat.lastCompleted).toBe(2);
		expect(etat.lastTotal).toBe(2);
		expect(Number.isNaN(Date.parse(etat.lastFinishedAt as string))).toBe(false);
	});

	test("avant tout lot, aucun bilan n'est annoncé", async () => {
		// Trois `null` plutôt que des zéros : un bilan à zéro se lirait comme « un
		// lot a tourné et n'a rien trouvé », ce qui est exactement la confusion que
		// le correctif lève.
		//
		// `resetAuditHistory` est nécessaire ici : la file est un état de module et
		// `bun test` partage un seul process, donc un lot d'un test précédent aurait
		// laissé son bilan derrière lui.
		resetAuditHistory();

		const etat = getAuditStatus();
		expect(etat.lastCompleted).toBeNull();
		expect(etat.lastTotal).toBeNull();
		expect(etat.lastFinishedAt).toBeNull();
	});

	test("la progression en vol reste remise à zéro après le lot", async () => {
		// `progress`/`total` gardent leur sémantique « en cours » : c'est
		// `lastCompleted`/`lastTotal` qui portent l'après-coup.
		sansReseau();
		const a = projet("progression-c");
		enqueueGlobalAudit([a.id]);
		await attendreLaFin();

		expect(getAuditStatus().progress).toBe(0);
		expect(getAuditStatus().total).toBe(1);
	});

	test("un lot vide est un lot terminé, pas un lot absent", async () => {
		enqueueGlobalAudit([]);
		await attendreLaFin();

		const etat = getAuditStatus();
		expect(etat.lastTotal).toBe(0);
		expect(etat.lastCompleted).toBe(0);
		expect(etat.lastFinishedAt).not.toBeNull();
	});

	test("un second lot remplace le bilan du premier", async () => {
		sansReseau();
		const a = projet("progression-d");
		const b = projet("progression-e");
		enqueueGlobalAudit([a.id, b.id]);
		await attendreLaFin();
		enqueueGlobalAudit([a.id]);
		await attendreLaFin();

		expect(getAuditStatus().lastTotal).toBe(1);
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
});
