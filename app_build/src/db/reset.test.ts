import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getCachedAdvisory, putCachedAdvisory } from "@/lib/github";
import { useTempDb } from "@/test/db";
import {
	advisoryDbPath,
	closeAdvisoryDb,
	getGithubConfig,
	setGithubConfig,
} from "./advisories";
import { upsertAnnotation } from "./annotations";
import { getDb } from "./index";
import { ensureOccurrences } from "./occurrences";
import { createProject, listProjects } from "./projects";
import { createPrompt, listPrompts } from "./prompts";
import { createReport, getReports } from "./reports";
import { resetConfiguration } from "./reset";
import { addRun } from "./runs";
import { getAllSettings, setSetting } from "./settings";
import { createTag, listTags } from "./tags";
import { getTickets, saveTicket } from "./tickets";

/** Peuple la base principale de tout ce qu'une remise à zéro doit emporter. */
function garnir(cheminProjet = "/srv/api") {
	const p = createProject({
		name: "api",
		path: cheminProjet,
		type: "node",
		tool: "npm",
	});
	addRun({
		project_id: p.id,
		status: "vulnerable",
		total: 1,
		counts: { critical: 1, high: 0, moderate: 0, low: 0, info: 0, unknown: 0 },
		vulnerabilities: [],
		command: "npm audit --json",
		commit_sha: null,
		error: null,
		duration_ms: 5,
	});
	upsertAnnotation("CVE-2020-8203", p.id, { status: "confirmed" });
	saveTicket(p.id, "lodash", "SEC-1", ["CVE-2020-8203"]);
	ensureOccurrences(
		p.id,
		[{ package: "lodash", title: "Prototype pollution", cve: "CVE-2020-8203" }],
		true,
	);
	createTag("backend");
	createPrompt("Analyse", "corps");
	createReport({
		projects_audited: 1,
		total_vulnerabilities: 1,
		counts: { critical: 1, high: 0, moderate: 0, low: 0, info: 0, unknown: 0 },
		details: [],
	});
	setSetting("JIRA_BASE_URL", "https://jira.example.test");
	setSetting("JIRA_API_KEY", "cle-jira");
	setSetting("AUDIT_MAX_AGE_HOURS", "48");
	return p;
}

describe("db/reset", () => {
	useTempDb("reset");

	afterEach(() => {
		// La base d'avis vit dans un second fichier : la refermer et la retirer,
		// sinon elle fuiterait d'un test à l'autre.
		const chemin = advisoryDbPath();
		closeAdvisoryDb();
		for (const suffixe of ["", "-wal", "-shm"]) {
			const f = `${chemin}${suffixe}`;
			if (existsSync(f)) rmSync(f, { force: true });
		}
	});

	test("tout le contenu de la base principale disparaît", () => {
		garnir();
		resetConfiguration();

		expect(listProjects()).toEqual([]);
		expect(listTags()).toEqual([]);
		expect(listPrompts()).toEqual([]);
		expect(getReports()).toEqual([]);
		expect(getTickets()).toEqual([]);
		expect(getAllSettings()).toEqual({});
	});

	test("la propriété ne dépend d'aucune liste de tables", () => {
		// C'est l'intérêt de la séparation : le reset supprime le **fichier**. Une
		// table ajoutée demain disparaîtra sans que personne ait à y penser — ce que
		// la version énumérée ne garantissait pas.
		getDb().exec("CREATE TABLE une_table_future (x TEXT)");
		getDb().query("INSERT INTO une_table_future VALUES ('donnée')").run();

		resetConfiguration();

		const reste = getDb()
			.query(
				"SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='une_table_future'",
			)
			.get() as { n: number };
		expect(reste.n).toBe(0);
	});

	test("le cache d'avis survit, il vit dans l'autre fichier", () => {
		garnir();
		putCachedAdvisory("CVE-2020-8203", "critical", {});
		resetConfiguration();

		expect(getCachedAdvisory("CVE-2020-8203")?.severity).toBe("critical");
	});

	test("la clé GHSA survit, elle vit dans l'autre fichier", () => {
		setGithubConfig("GITHUB_TOKEN", "ghp_a_conserver");
		garnir();
		resetConfiguration();

		expect(getGithubConfig("GITHUB_TOKEN")).toBe("ghp_a_conserver");
	});

	test("la clé Jira ne survit pas : c'est de la configuration", () => {
		garnir();
		resetConfiguration();
		expect(getAllSettings().JIRA_API_KEY).toBeUndefined();
	});

	test("ne touche pas les projets sur le disque", () => {
		// La garantie qui compte le plus : seul le fichier SQLite d'Aegis est retiré.
		const dossier = join(tmpdir(), `aegis-reset-${randomUUID()}`);
		mkdirSync(dossier, { recursive: true });
		try {
			garnir(dossier);
			resetConfiguration();
			expect(existsSync(dossier)).toBe(true);
		} finally {
			rmSync(dossier, { recursive: true, force: true });
		}
	});

	test("le fichier WAL est retiré avec la base", () => {
		// Le laisser derrière ferait rejouer d'anciennes écritures par-dessus la
		// base neuve — le défaut exact que N2 décrit sur la restauration.
		garnir();
		const chemin = process.env.DB_PATH as string;
		resetConfiguration();
		// Après réouverture, le WAL est celui de la base neuve : elle est vide.
		expect(existsSync(chemin)).toBe(true);
		expect(listProjects()).toEqual([]);
	});

	test("la base est immédiatement réutilisable, sans redémarrage", () => {
		// Ce qui distingue cette remise à zéro de la restauration d'instantané, qui
		// appelle `process.exit(0)`.
		garnir();
		resetConfiguration();

		const p = createProject({
			name: "nouveau",
			path: "/srv/nouveau",
			type: "node",
			tool: "npm",
		});
		expect(p.id).toBeGreaterThan(0);
		expect(listProjects()).toHaveLength(1);
	});

	test("retourne le chemin supprimé et le nombre de projets", () => {
		garnir();
		const r = resetConfiguration();
		expect(r.existed).toBe(true);
		expect(r.projects).toBe(1);
		expect(r.path).toBe(process.env.DB_PATH as string);
	});

	test("deux remises à zéro d'affilée sont sans effet supplémentaire", () => {
		garnir();
		resetConfiguration();
		const second = resetConfiguration();
		expect(second.projects).toBe(0);
		expect(listProjects()).toEqual([]);
	});
});
