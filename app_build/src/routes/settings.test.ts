import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getDb } from "@/db";
import { getGithubConfig, setGithubConfig } from "@/db/advisories";
import { getAllAnnotations, upsertAnnotation } from "@/db/annotations";
import { createProject, listProjects, type Project } from "@/db/projects";
import { getSetting, setSetting } from "@/db/settings";
import { enqueueGlobalAudit, getAuditStatus } from "@/lib/audit/queue";
import { jsonBody, startTestServer, type TestServer } from "@/test/server";

let srv: TestServer;

/** La file est un mutex de portée processus : ne rien laisser tourner derrière. */
async function attendreFinAudit(limiteMs = 8000) {
	const debut = Date.now();
	while (getAuditStatus().isRunning) {
		if (Date.now() - debut > limiteMs) throw new Error("file toujours occupée");
		await new Promise((r) => setTimeout(r, 10));
	}
}

/**
 * Les instantanés vont dans un dossier temporaire propre à ce fichier.
 *
 * `BACKUP_DIR` est repositionné avant chaque test : sans cela les instantanés
 * s'écriraient dans `backups/` à la racine du dépôt, et un run complet laisserait
 * des fichiers derrière lui. La restauration réussie est désormais exerçable —
 * elle ne se termine plus par `process.exit(0)` (N2).
 */
let dossierSauvegardes: string;

beforeAll(async () => {
	srv = await startTestServer("settings");
});
afterAll(() => srv.stop());

beforeEach(() => {
	dossierSauvegardes = join(tmpdir(), `aegis-backups-${randomUUID()}`);
	process.env.BACKUP_DIR = dossierSauvegardes;
	getDb().query("DELETE FROM settings").run();
	getDb().query("DELETE FROM projects").run();
	// `AEGIS_ALLOWED_ROOTS` est en défaut **fermé** (N3) : sans la variable, aucun
	// chemin n'est autorisé. Les tests qui créent des projets doivent donc
	// déclarer leur périmètre, comme un déploiement réel.
	process.env.AEGIS_ALLOWED_ROOTS = "/";
});

afterEach(() => {
	rmSync(dossierSauvegardes, { recursive: true, force: true });
	delete process.env.BACKUP_DIR;
});

describe("GET /api/settings", () => {
	test("une base neuve ne renvoie que l'état des secrets", async () => {
		const { status, data } = await srv.json("/api/settings");
		expect(status).toBe(200);
		expect(data).toEqual({
			GITHUB_TOKEN_CONFIGURED: "false",
			JIRA_API_KEY_CONFIGURED: "false",
		});
	});

	test("renvoie les clés de la liste blanche, et l'état des secrets", async () => {
		setGithubConfig("GITHUB_TOKEN", "ghp_x");
		setSetting("AUDIT_MAX_AGE_HOURS", "24");
		const { data } = await srv.json("/api/settings");
		expect(data).toEqual({
			AUDIT_MAX_AGE_HOURS: "24",
			GITHUB_TOKEN_CONFIGURED: "true",
			JIRA_API_KEY_CONFIGURED: "false",
		});
	});

	test("une clé hors liste blanche n'est pas exposée", async () => {
		// C'est la propriété qui manquait au correctif C2 : une liste noire laisse
		// fuir par défaut tout secret ajouté après elle.
		setSetting("UN_FUTUR_SECRET", "valeur-sensible");
		const { data } = await srv.json<Record<string, string>>("/api/settings");
		expect(data.UN_FUTUR_SECRET).toBeUndefined();
	});
});

describe("PUT /api/settings", () => {
	function enregistrer(body: unknown) {
		return srv.json(`/api/settings`, { ...jsonBody(body), method: "PUT" });
	}

	test("enregistre le lot et confirme", async () => {
		const { status, data } = await enregistrer({ AUDIT_MAX_AGE_HOURS: "36" });
		expect(status).toBe(200);
		expect(data).toEqual({ success: true });
		expect(getSetting("AUDIT_MAX_AGE_HOURS")).toBe("36");
	});

	test("la clé GHSA est écrite dans la base d'avis, pas dans les réglages", async () => {
		// Elle vit avec le cache d'avis pour survivre à une remise à zéro. L'écran
		// poste un seul objet ; le tri se fait côté serveur.
		await enregistrer({ GITHUB_TOKEN: "ghp_x" });
		expect(getGithubConfig("GITHUB_TOKEN")).toBe("ghp_x");
		expect(getSetting("GITHUB_TOKEN")).toBe("");
	});

	test("les valeurs non textuelles sont stockées en texte", async () => {
		await enregistrer({ AUDIT_MAX_AGE_HOURS: 48, AI_ENABLED: true });
		expect(getSetting("AUDIT_MAX_AGE_HOURS")).toBe("48");
		expect(getSetting("AI_ENABLED")).toBe("true");
	});

	test("un lot partiel ne détruit pas les autres clés", async () => {
		// L'écran Réglages enregistre section par section : un remplacement
		// intégral effacerait le jeton en sauvegardant les seuils.
		setSetting("GITHUB_TOKEN", "ghp_x");
		await enregistrer({ AUDIT_MAX_AGE_HOURS: "12" });
		expect(getSetting("GITHUB_TOKEN")).toBe("ghp_x");
	});

	test("AUDIT_MAX_AGE_HOURS accepte 0 et -1", async () => {
		// `0` = jamais périmé, `-1` = toujours réauditer (CONTEXT.md §12).
		expect((await enregistrer({ AUDIT_MAX_AGE_HOURS: "0" })).status).toBe(200);
		expect((await enregistrer({ AUDIT_MAX_AGE_HOURS: "-1" })).status).toBe(200);
	});

	test("une durée non numérique renvoie 400", async () => {
		const { status, data } = await enregistrer({
			AUDIT_MAX_AGE_HOURS: "beaucoup",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Durée invalide" });
	});

	test("une durée sous -1 renvoie 400", async () => {
		expect((await enregistrer({ AUDIT_MAX_AGE_HOURS: "-2" })).status).toBe(400);
	});

	test("une durée invalide fait échouer tout le lot", async () => {
		// Enregistrer les autres clés en ignorant celle-ci afficherait un succès
		// pour une valeur non appliquée.
		await enregistrer({
			GITHUB_TOKEN: "ghp_x",
			AUDIT_MAX_AGE_HOURS: "beaucoup",
		});
		expect(getSetting("GITHUB_TOKEN")).toBe("");
	});

	test("un lot vide est accepté", async () => {
		expect((await enregistrer({})).status).toBe(200);
	});

	test("un JSON illisible renvoie 400 « JSON invalide »", async () => {
		const { status, data } = await srv.json("/api/settings", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "JSON invalide" });
	});

	test("un secret vide n'écrase pas la valeur en place", async () => {
		// Le formulaire ne connaît pas la valeur du jeton — l'API ne la renvoie
		// plus — et poste donc une chaîne vide quand l'utilisateur n'y touche pas.
		// L'appliquer effacerait le jeton à chaque enregistrement (N5).
		setGithubConfig("GITHUB_TOKEN", "ghp_reel");
		await enregistrer({ GITHUB_TOKEN: "", AUDIT_MAX_AGE_HOURS: "12" });
		expect(getGithubConfig("GITHUB_TOKEN")).toBe("ghp_reel");
		expect(getSetting("AUDIT_MAX_AGE_HOURS")).toBe("12");
	});

	test("un secret non vide est bien enregistré", async () => {
		await enregistrer({ JIRA_API_KEY: "nouvelle-cle" });
		expect(getSetting("JIRA_API_KEY")).toBe("nouvelle-cle");
	});

	test("une clé non secrète peut toujours être vidée", async () => {
		// La règle d'écriture seule ne vaut que pour les secrets : vider une URL
		// Jira reste une action légitime et applicable.
		setSetting("JIRA_BASE_URL", "https://jira.example.test");
		await enregistrer({ JIRA_BASE_URL: "" });
		expect(getSetting("JIRA_BASE_URL")).toBe("");
	});
});

describe("GET /api/config/export", () => {
	test("exporte projets, réglages et annotations", async () => {
		const p = createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		upsertAnnotation("CVE-2024-1", p.id, { status: "confirmed" });
		setSetting("AUDIT_MAX_AGE_HOURS", "24");

		const { status, data } = await srv.json<{
			projects: Project[];
			settings: Record<string, string>;
			annotations: { cve: string }[];
		}>("/api/config/export");

		expect(status).toBe(200);
		expect(data.projects).toHaveLength(1);
		expect(data.settings.AUDIT_MAX_AGE_HOURS).toBe("24");
		expect(data.annotations[0]?.cve).toBe("CVE-2024-1");
	});

	test("le jeton GitHub est masqué", async () => {
		// L'export est destiné à être partagé ou versionné : il ne doit pas
		// contenir de secret.
		setSetting("GITHUB_TOKEN", "ghp_secret");
		const { data } = await srv.json<{ settings: Record<string, string> }>(
			"/api/config/export",
		);
		expect(data.settings.GITHUB_TOKEN).toBe("***");
	});

	test("la clé Jira est masquée", async () => {
		setSetting("JIRA_API_KEY", "jira_secret");
		const { data } = await srv.json<{ settings: Record<string, string> }>(
			"/api/config/export",
		);
		expect(data.settings.JIRA_API_KEY).toBe("***");
	});

	test("un export sur base vide reste exploitable", async () => {
		const { data } = await srv.json<{
			projects: unknown[];
			annotations: unknown[];
		}>("/api/config/export");
		expect(data.projects).toEqual([]);
		expect(data.annotations).toEqual([]);
	});
});

describe("POST /api/config/import", () => {
	function importer(body: unknown) {
		return srv.json<{ success: boolean }>("/api/config/import", jsonBody(body));
	}

	test("importe les réglages", async () => {
		const { status, data } = await importer({
			settings: { AUDIT_MAX_AGE_HOURS: "48" },
		});
		expect(status).toBe(200);
		expect(data.success).toBe(true);
		expect(getSetting("AUDIT_MAX_AGE_HOURS")).toBe("48");
	});

	test("une valeur masquée n'écrase pas le secret en place", async () => {
		// C'est ce qui rend un export réimportable : réappliquer « *** » aurait
		// détruit le jeton.
		setSetting("GITHUB_TOKEN", "ghp_reel");
		await importer({ settings: { GITHUB_TOKEN: "***" } });
		expect(getSetting("GITHUB_TOKEN")).toBe("ghp_reel");
	});

	test("crée les projets absents", async () => {
		await importer({
			projects: [
				{
					id: 7,
					slug: "api",
					name: "api",
					path: "/srv/api",
					type: "node",
					tool: "npm",
					tags: [],
				},
			],
		});
		expect(listProjects()).toHaveLength(1);
	});

	test("met à jour un projet existant repéré par son slug", async () => {
		// L'import doit être rejouable : deux passes ne doivent pas doubler le parc.
		const corps = {
			projects: [
				{
					id: 7,
					slug: "api",
					name: "api",
					path: "/srv/api",
					type: "node",
					tool: "npm",
					tags: [],
				},
			],
		};
		await importer(corps);
		await importer(corps);
		expect(listProjects()).toHaveLength(1);
	});

	test("les annotations sont rattachées au nouvel identifiant du projet", async () => {
		// Les identifiants changent d'une instance à l'autre : sans la table de
		// correspondance, les annotations viseraient des projets inexistants.
		await importer({
			projects: [
				{
					id: 7,
					slug: "api",
					name: "api",
					path: "/srv/api",
					type: "node",
					tool: "npm",
					tags: [],
				},
			],
			annotations: [
				{ cve: "CVE-2024-1", project_id: 7, status: "confirmed", note: "n" },
			],
		});

		const [p] = listProjects();
		const annotations = getAllAnnotations();
		expect(annotations).toHaveLength(1);
		expect(annotations[0]?.project_id).toBe(p?.id as number);
		expect(annotations[0]?.status).toBe("confirmed");
	});

	test("une annotation visant un projet non importé est ignorée", async () => {
		await importer({
			annotations: [
				{ cve: "CVE-2024-1", project_id: 999, status: "confirmed" },
			],
		});
		expect(getAllAnnotations()).toEqual([]);
	});

	test("une annotation non rattachable est ignorée, pas fatale (N7)", async () => {
		// L'ancienne convention `project_id = -1` — l'« annotation globale » —
		// n'a jamais pu exister : la colonne porte une clé étrangère vers
		// `projects`. L'import la réinjectait telle quelle, l'insertion levait, et
		// le handler générique répondait 500 **après** avoir créé les projets.
		// §12 impose d'ignorer les cibles non résolvables, pas d'échouer.
		const { status, data } = await srv.json<{
			success: boolean;
			annotationsSkipped: number;
		}>(
			"/api/config/import",
			jsonBody({
				annotations: [{ cve: "CVE-2024-1", project_id: -1, status: "ignored" }],
			}),
		);
		expect(status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.annotationsSkipped).toBe(1);
		expect(getAllAnnotations()).toEqual([]);
	});

	test("un projet hors périmètre est refusé en 403 (N3)", async () => {
		// L'import contournait entièrement la garde de chemin : c'était la voie la
		// plus simple pour enregistrer un projet hors périmètre, puis l'auditer.
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		const { status, data } = await srv.json(
			"/api/config/import",
			jsonBody({
				projects: [
					{
						id: 7,
						slug: "api",
						name: "api",
						path: "/srv/interdit",
						type: "node",
						tool: "npm",
						tags: [],
					},
				],
			}),
		);
		expect(status).toBe(403);
		expect(data).toEqual({
			error: "Chemin non autorisé par AEGIS_ALLOWED_ROOTS",
		});
		expect(listProjects()).toHaveLength(0);
	});

	test("l'annotation est rattachée par chemin de projet (N7, §12)", async () => {
		// Le relink par `path` est la forme spécifiée : les identifiants sont
		// attribués par auto-incrément, donc un export porteur du seul `project_id`
		// n'était rejouable que sur la base qui l'avait produit.
		const { status } = await importer({
			projects: [
				{
					name: "api",
					path: "/srv/api",
					type: "node",
					tool: "npm",
					tags: [],
				},
			],
			annotations: [
				{ path: "/srv/api", cve: "CVE-2024-1", status: "confirmed" },
			],
		});

		expect(status).toBe(200);
		const [annotation] = getAllAnnotations();
		const [projet] = listProjects();
		expect(annotation?.project_id).toBe(projet?.id as number);
		expect(annotation?.status).toBe("confirmed");
	});

	test("un chemin inconnu est ignoré sans faire échouer l'import (§12)", async () => {
		const { status, data } = await srv.json<{
			annotationsAdded: number;
			annotationsSkipped: number;
		}>(
			"/api/config/import",
			jsonBody({
				annotations: [{ path: "/srv/jamais-vu", cve: "CVE-2024-1" }],
			}),
		);
		expect(status).toBe(200);
		expect(data.annotationsAdded).toBe(0);
		expect(data.annotationsSkipped).toBe(1);
	});

	test("l'import rend compte de ce qu'il a fait (§12)", async () => {
		const { data } = await srv.json<{
			projectsAdded: number;
			annotationsAdded: number;
		}>(
			"/api/config/import",
			jsonBody({
				projects: [
					{ name: "a", path: "/srv/a", type: "node", tool: "npm", tags: [] },
					{ name: "b", path: "/srv/b", type: "node", tool: "npm", tags: [] },
				],
				annotations: [{ path: "/srv/a", cve: "CVE-2024-1" }],
			}),
		);
		// Sans ces compteurs, un import silencieux ne se distingue pas d'un import
		// qui n'a rien trouvé à faire.
		expect(data.projectsAdded).toBe(2);
		expect(data.annotationsAdded).toBe(1);
	});

	test("un refus de périmètre ne laisse aucun projet derrière lui (N7)", async () => {
		// La garde de chemin passe **avant** toute écriture, et l'ensemble est dans
		// une transaction : un import refusé à mi-parcours laissait auparavant les
		// projets déjà créés en base. L'utilisateur relançait, et faute de dédup par
		// cible d'audit, les projets étaient recréés en doublon.
		process.env.AEGIS_ALLOWED_ROOTS = "/srv/autorise";
		const { status } = await importer({
			projects: [
				{
					name: "ok",
					path: "/srv/autorise/ok",
					type: "node",
					tool: "npm",
					tags: [],
				},
				{
					name: "interdit",
					path: "/srv/interdit",
					type: "node",
					tool: "npm",
					tags: [],
				},
			],
		});

		expect(status).toBe(403);
		expect(listProjects()).toHaveLength(0);
	});

	test("un corps vide est accepté sans rien changer", async () => {
		const { status, data } = await importer({});
		expect(status).toBe(200);
		expect(data.success).toBe(true);
	});
});

describe("instantanés", () => {
	test("la création écrit un fichier de sauvegarde et renvoie son chemin", async () => {
		const { status, data } = await srv.json<{
			success: boolean;
			path: string;
		}>("/api/snapshots/create", { method: "POST" });

		expect(status).toBe(200);
		expect(data.success).toBe(true);
		expect(existsSync(data.path)).toBe(true);
	});

	test("la création écrit dans le dossier d'instantanés (N2)", async () => {
		// Le chemin dérive de `BACKUP_DIR`, et la base sauvegardée est celle que
		// `DB_PATH` désigne. La version précédente résolvait `aegis.db` depuis
		// `process.cwd()` : elle sauvegardait un fichier que personne n'ouvre.
		const { data } = await srv.json<{ path: string; file: string }>(
			"/api/snapshots/create",
			{ method: "POST" },
		);
		expect(data.path.startsWith(dossierSauvegardes)).toBe(true);
		expect(data.file).toMatch(/^audit-\d{4}-\d{2}-\d{2}\.sqlite$/);
	});

	test("la création renvoie l'inventaire à jour", async () => {
		const { data } = await srv.json<{
			file: string;
			snapshots: { file: string }[];
		}>("/api/snapshots/create", { method: "POST" });
		expect(data.snapshots.map((s) => s.file)).toContain(data.file);
	});

	test("GET /api/snapshots liste les instantanés", async () => {
		await srv.json("/api/snapshots/create", { method: "POST" });
		const { status, data } = await srv.json<{
			snapshots: { file: string; counts: { projects: number } }[];
		}>("/api/snapshots");

		expect(status).toBe(200);
		expect(data.snapshots).toHaveLength(1);
		expect(data.snapshots[0]?.counts.projects).toBe(0);
	});

	test("un instantané introuvable renvoie 400 en nommant le fichier (N2)", async () => {
		// Le champ `file` est enfin **transmis**. Il était exigé par le schéma puis
		// ignoré : on restaurait toujours le même fichier, quel que soit le nom.
		const { status, data } = await srv.json<{ error: string }>(
			"/api/snapshots/restore",
			jsonBody({ file: "un-autre-instantane.sqlite" }),
		);
		expect(status).toBe(400);
		expect(data.error).toContain("un-autre-instantane.sqlite");
	});

	test("une restauration sans nom de fichier renvoie 400", async () => {
		const { status, data } = await srv.json(
			"/api/snapshots/restore",
			jsonBody({ file: "  " }),
		);
		expect(status).toBe(400);
		expect(data).toEqual({ error: "Fichier requis" });
	});

	test("un nom hors du dossier est refusé", async () => {
		const { status, data } = await srv.json<{ error: string }>(
			"/api/snapshots/restore",
			jsonBody({ file: "../../etc/passwd.sqlite" }),
		);
		expect(status).toBe(400);
		expect(data.error).toBe("Nom de snapshot invalide");
	});

	test("la restauration remplace vraiment la base (N2)", async () => {
		// Le cœur du défaut : l'API répondait « Restauration effectuée » et la base
		// restait identique. Ce test n'était pas exerçable avant le correctif —
		// `process.exit(0)` aurait tué l'exécuteur.
		createProject({
			name: "avant",
			path: "/srv/avant",
			type: "node",
			tool: "npm",
		});
		const { data: cree } = await srv.json<{ file: string }>(
			"/api/snapshots/create",
			{ method: "POST" },
		);

		createProject({
			name: "apres",
			path: "/srv/apres",
			type: "node",
			tool: "npm",
		});

		const { status, data } = await srv.json<{
			ok: boolean;
			preRestore: string;
		}>("/api/snapshots/restore", jsonBody({ file: cree.file }));

		expect(status).toBe(200);
		expect(data.ok).toBe(true);
		expect(data.preRestore).toStartWith("pre-restore-");
		expect(listProjects().map((p) => p.name)).toEqual(["avant"]);
	});

	test("une restauration pendant un audit renvoie 409", async () => {
		// Remplacer le fichier sous un audit en cours laisserait le run à moitié
		// écrit dans une base disparue. Même garde que la remise à zéro, même raison.
		const { data: cree } = await srv.json<{ file: string }>(
			"/api/snapshots/create",
			{ method: "POST" },
		);

		// Même montage que la garde du reset : un dossier réel dont la cible
		// d'audit est absente. L'audit échoue vite, sans rien tenter sur le réseau,
		// mais occupe la file le temps de l'aller-retour HTTP. Quatre identifiants,
		// sinon le lot se termine avant que la requête n'arrive.
		const racine = join(tmpdir(), `aegis-restore-guard-${randomUUID()}`);
		mkdirSync(racine, { recursive: true });
		try {
			const p = createProject({
				name: "occupe",
				path: racine,
				audit_path: "cible-absente",
				type: "node",
				tool: "npm",
			});
			enqueueGlobalAudit([p.id, p.id, p.id, p.id]);
			expect(getAuditStatus().isRunning).toBe(true);

			const { status, data } = await srv.json<{ error: string }>(
				"/api/snapshots/restore",
				jsonBody({ file: cree.file }),
			);
			await attendreFinAudit();

			expect(status).toBe(409);
			expect(data.error).toContain("audit est en cours");
		} finally {
			rmSync(racine, { recursive: true, force: true });
		}
	});
});

/**
 * Contrats refermés, conservés en garde-fou.
 *
 * Ces tests énonçaient un comportement que le code n'avait pas ; ils étaient
 * marqués `test.failing`. Le défaut corrigé, `.failing` a été retiré et ils
 * gardent la porte fermée. Aucun `test.failing` ne subsiste dans ce fichier.
 */

describe("contrats refermés", () => {
	// N5 — CONTEXT.md §12 ne spécifie que trois clés en sortie. Un secret ne doit
	// jamais repartir en clair : l'export voisin prend déjà la peine de le masquer.
	test("GET /api/settings ne renvoie pas les secrets (N5)", async () => {
		setSetting("GITHUB_TOKEN", "ghp_secret");
		setSetting("JIRA_API_KEY", "jira_secret");
		const { data } = await srv.json<Record<string, string>>("/api/settings");
		expect(data.GITHUB_TOKEN).toBeUndefined();
		expect(data.JIRA_API_KEY).toBeUndefined();
	});

	// N35 — 400 « JSON invalide » comme les routes passant par parseBody.
	test("un corps illisible renvoie 400 « JSON invalide » (N35)", async () => {
		const { status, data } = await srv.json("/api/config/import", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		expect(status).toBe(400);
		expect(data).toEqual({ error: "JSON invalide" });
	});
});

describe("POST /api/config/reset", () => {
	test("vide la configuration et rend compte", async () => {
		createProject({
			name: "api",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
		setSetting("JIRA_BASE_URL", "https://jira.example.test");

		const { status, data } = await srv.json<{
			success: boolean;
			reset: { projects: number; existed: boolean };
			preserved: string[];
		}>("/api/config/reset", { method: "POST" });

		expect(status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.reset.projects).toBe(1);
		expect(data.reset.existed).toBe(true);
		expect(data.preserved).toContain("advisory_cache");
		expect(data.preserved).toContain("GITHUB_TOKEN");
		expect(listProjects()).toEqual([]);
		expect(getSetting("JIRA_BASE_URL")).toBe("");
	});

	test("la clé GHSA survit, la clé Jira non", async () => {
		setGithubConfig("GITHUB_TOKEN", "ghp_a_conserver");
		setSetting("JIRA_API_KEY", "cle-jira");
		await srv.json("/api/config/reset", { method: "POST" });

		expect(getGithubConfig("GITHUB_TOKEN")).toBe("ghp_a_conserver");
		expect(getSetting("JIRA_API_KEY")).toBe("");
	});

	test("l'état des secrets reste cohérent après remise à zéro", async () => {
		// L'écran Réglages lit `<CLÉ>_CONFIGURED` : la clé GHSA doit rester annoncée
		// comme configurée bien que la base principale ait été recréée.
		setGithubConfig("GITHUB_TOKEN", "ghp_a_conserver");
		setSetting("JIRA_API_KEY", "cle-jira");
		await srv.json("/api/config/reset", { method: "POST" });

		const { data } = await srv.json<Record<string, string>>("/api/settings");
		expect(data.GITHUB_TOKEN_CONFIGURED).toBe("true");
		expect(data.JIRA_API_KEY_CONFIGURED).toBe("false");
	});

	test("le serveur reste utilisable sans redémarrage", async () => {
		// La base est recréée et son schéma réappliqué par `getDb()` : c'est le même
		// chemin qu'un premier démarrage, pas un cas particulier.
		await srv.json("/api/config/reset", { method: "POST" });
		const { status } = await srv.json(
			"/api/projects",
			jsonBody({
				name: "après reset",
				path: "/srv/apres",
				type: "node",
				tool: "npm",
			}),
		);
		expect(status).toBe(201);
	});

	test("refuse en 409 pendant un audit", async () => {
		// Un audit en cours écrit dans la base : la supprimer sous ses pieds le
		// ferait échouer sur un fichier disparu, et le run resterait à moitié
		// enregistré.
		const racine = join(tmpdir(), `aegis-reset-guard-${randomUUID()}`);
		mkdirSync(racine, { recursive: true });
		try {
			const p = createProject({
				name: "occupe",
				path: racine,
				audit_path: "cible-absente",
				type: "node",
				tool: "npm",
			});
			// L'enrichissement ne doit rien tenter : l'audit échoue vite sur un
			// dossier inexistant, ce qui suffit à occuper la file.
			enqueueGlobalAudit([p.id, p.id, p.id, p.id]);
			expect(getAuditStatus().isRunning).toBe(true);

			const { status, data } = await srv.json<{ error: string }>(
				"/api/config/reset",
				{ method: "POST" },
			);
			expect(status).toBe(409);
			expect(data.error).toContain("Un audit est en cours");
			// Rien n'a été supprimé.
			expect(listProjects()).toHaveLength(1);

			await attendreFinAudit();
		} finally {
			rmSync(racine, { recursive: true, force: true });
		}
	});

	test("réussit une fois l'audit terminé", async () => {
		const racine = join(tmpdir(), `aegis-reset-apres-${randomUUID()}`);
		mkdirSync(racine, { recursive: true });
		try {
			const p = createProject({
				name: "termine",
				path: racine,
				audit_path: "cible-absente",
				type: "node",
				tool: "npm",
			});
			enqueueGlobalAudit([p.id]);
			await attendreFinAudit();

			const { status } = await srv.json("/api/config/reset", {
				method: "POST",
			});
			expect(status).toBe(200);
			expect(listProjects()).toEqual([]);
		} finally {
			rmSync(racine, { recursive: true, force: true });
		}
	});

	test("sur une configuration vide, réussit sans rien compter", async () => {
		const { status, data } = await srv.json<{
			reset: { projects: number };
		}>("/api/config/reset", { method: "POST" });
		expect(status).toBe(200);
		expect(data.reset.projects).toBe(0);
	});
});
