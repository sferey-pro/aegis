import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { putCachedAdvisory } from "@/lib/github";
import { useTempDb } from "@/test/db";
import { upsertAnnotation } from "./annotations";
import { getDb } from "./index";
import { ensureOccurrences } from "./occurrences";
import { createProject } from "./projects";
import { createPrompt } from "./prompts";
import { createReport } from "./reports";
import {
	ghsaKeyIsPreserved,
	preservedSettingKeys,
	resetConfiguration,
} from "./reset";
import { addRun } from "./runs";
import { getAllSettings, getSetting, setSetting } from "./settings";
import { createTag } from "./tags";
import { saveTicket } from "./tickets";

/** Peuple la base de tout ce qu'une remise à zéro doit balayer. */
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
		counts: {
			critical: 1,
			high: 0,
			moderate: 0,
			low: 0,
			info: 0,
			unknown: 0,
		},
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
		counts: {
			critical: 1,
			high: 0,
			moderate: 0,
			low: 0,
			info: 0,
			unknown: 0,
		},
		details: [],
	});
	setSetting("GITHUB_TOKEN", "ghp_a_conserver");
	setSetting("JIRA_BASE_URL", "https://jira.example.test");
	setSetting("JIRA_API_KEY", "cle-jira");
	setSetting("AUDIT_MAX_AGE_HOURS", "48");
	setSetting("GITHUB_RL_REMAINING", "4998");
	return p;
}

function nombre(table: string): number {
	const row = getDb().query(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
		n: number;
	};
	return row.n;
}

describe("db/reset", () => {
	useTempDb("reset");

	test("supprime les projets et tout ce qui en dépend", () => {
		garnir();
		resetConfiguration();

		expect(nombre("projects")).toBe(0);
		// Par cascade de clé étrangère, pas par suppression explicite.
		expect(nombre("runs")).toBe(0);
		expect(nombre("annotations")).toBe(0);
		expect(nombre("tickets")).toBe(0);
		expect(nombre("cve_occurrences")).toBe(0);
	});

	test("supprime le catalogue, les prompts et les compte-rendus", () => {
		garnir();
		resetConfiguration();

		expect(nombre("tags")).toBe(0);
		expect(nombre("prompts")).toBe(0);
		expect(nombre("reports")).toBe(0);
	});

	test("conserve la clé GHSA et rien d'autre parmi les réglages", () => {
		garnir();
		resetConfiguration();

		expect(getSetting("GITHUB_TOKEN")).toBe("ghp_a_conserver");
		expect(Object.keys(getAllSettings())).toEqual(["GITHUB_TOKEN"]);
	});

	test("supprime les autres secrets, dont la clé Jira", () => {
		// « Sauf clé GHSA » : la clé Jira est de la configuration, elle part.
		garnir();
		resetConfiguration();
		expect(getSetting("JIRA_API_KEY")).toBe("");
	});

	test("conserve le cache d'avis", () => {
		// Ce n'est pas de la configuration mais un cache de données publiques,
		// coûteux à reconstruire en quota et sans effet sur un import de projets.
		garnir();
		putCachedAdvisory("CVE-2020-8203", "critical", {});
		resetConfiguration();
		expect(nombre("advisory_cache")).toBe(1);
	});

	test("ne touche pas les projets sur le disque", () => {
		// La garantie qui compte le plus : la fonction n'écrit que dans SQLite.
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

	test("retourne le décompte de ce qui a été supprimé", () => {
		garnir();
		const counts = resetConfiguration();

		expect(counts.projects).toBe(1);
		expect(counts.runs).toBe(1);
		expect(counts.annotations).toBe(1);
		expect(counts.tickets).toBe(1);
		expect(counts.occurrences).toBe(1);
		expect(counts.tags).toBe(1);
		expect(counts.prompts).toBe(1);
		expect(counts.reports).toBe(1);
		// Quatre réglages sur cinq : la clé GHSA est conservée.
		expect(counts.settings).toBe(4);
	});

	test("sur une base déjà vide, ne lève pas et compte zéro", () => {
		const counts = resetConfiguration();
		expect(counts.projects).toBe(0);
		expect(counts.settings).toBe(0);
	});

	test("deux remises à zéro d'affilée sont sans effet supplémentaire", () => {
		garnir();
		resetConfiguration();
		const second = resetConfiguration();
		expect(second.projects).toBe(0);
		expect(getSetting("GITHUB_TOKEN")).toBe("ghp_a_conserver");
	});

	test("la base reste utilisable après remise à zéro", () => {
		// C'est le but : repartir sur un import propre, pas sur une base cassée.
		garnir();
		resetConfiguration();

		const p = createProject({
			name: "nouveau",
			path: "/srv/nouveau",
			type: "node",
			tool: "npm",
		});
		expect(p.id).toBeGreaterThan(0);
		expect(nombre("projects")).toBe(1);
	});

	test("la clé conservée est bien déclarée comme secret", () => {
		// Garde-fou de cohérence : si la liste des secrets évoluait sans que celle
		// des clés conservées suive, on effacerait un secret en croyant le garder.
		expect(ghsaKeyIsPreserved()).toBe(true);
		expect(preservedSettingKeys()).toEqual(["GITHUB_TOKEN"]);
	});
});
