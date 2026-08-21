import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "bun";

import { getDb } from "@/db";
import { upsertAnnotation } from "@/db/annotations";
import { createProject, type Project } from "@/db/projects";
import { addRun, getLatestRun, getRunsForProject } from "@/db/runs";
import { setSetting } from "@/db/settings";
import { useTempDb } from "@/test/db";
import {
	auditTargetKey,
	getAuditTarget,
	ingestAudit,
	resolveAuditTarget,
	runAudit,
} from "./index";

/**
 * `runAudit` lance un vrai `spawn`. Pour rester déterministe et hors réseau, la
 * cible d'audit de ces tests est un sous-dossier inexistant du dépôt : le
 * processus échoue toujours, quel que soit l'outil installé sur la machine. Ce
 * qu'on vérifie ici n'est pas la sortie de `npm audit` — les parseurs s'en
 * chargent — mais tout ce qui l'entoure : déduplication, run d'erreur, diff des
 * nouvelles CVE.
 */

const aNettoyer: string[] = [];
const natif = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = natif;
	for (const d of aNettoyer.splice(0))
		rmSync(d, { recursive: true, force: true });
});

/** Coupe l'enrichissement GitHub : aucun appel sortant ne doit aboutir. */
function sansReseau() {
	globalThis.fetch = (() =>
		Promise.reject(
			new Error("réseau interdit en test"),
		)) as unknown as typeof fetch;
}

function dossier(label: string): string {
	const d = join(tmpdir(), `aegis-audit-${label}-${randomUUID()}`);
	mkdirSync(d, { recursive: true });
	aNettoyer.push(d);
	return d;
}

function git(cwd: string, ...args: string[]) {
	const r = spawnSync(["git", ...args], { cwd, env: process.env });
	if (r.exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} : ${r.stderr.toString()}`);
	}
	return r.stdout.toString().trim();
}

function depot(label = "repo"): string {
	const d = dossier(label);
	git(d, "init", "-q", "-b", "main");
	git(d, "config", "user.email", "test@aegis.local");
	git(d, "config", "user.name", "Aegis Test");
	writeFileSync(join(d, "README.md"), "initial\n");
	git(d, "add", ".");
	git(d, "commit", "-q", "-m", "initial");
	return d;
}

/**
 * Projet dont la racine est un vrai dépôt git (pour l'état git) mais dont la
 * cible d'audit n'existe pas (pour un échec de spawn garanti).
 */
function projetSurDepot(label = "p"): { project: Project; repo: string } {
	const repo = depot(label);
	const project = createProject({
		name: label,
		path: repo,
		audit_path: "cible-absente",
		type: "node",
		tool: "npm",
	});
	return { project, repo };
}

function vide() {
	return {
		critical: 0,
		high: 0,
		moderate: 0,
		low: 0,
		info: 0,
		unknown: 0,
	};
}

describe("lib/audit — resolveAuditTarget", () => {
	test("sans sous-dossier, la cible est la racine", () => {
		expect(resolveAuditTarget("/srv/api")).toBe("/srv/api");
		expect(resolveAuditTarget("/srv/api", null)).toBe("/srv/api");
		expect(resolveAuditTarget("/srv/api", "")).toBe("/srv/api");
	});

	test("un sous-dossier relatif est résolu sous la racine", () => {
		expect(resolveAuditTarget("/srv/mono", "packages/api")).toBe(
			"/srv/mono/packages/api",
		);
	});

	test("un sous-dossier absolu remplace la racine", () => {
		// Un monorepo peut être audité ailleurs que sous sa racine git.
		expect(resolveAuditTarget("/srv/mono", "/opt/build/api")).toBe(
			"/opt/build/api",
		);
	});

	test("un sous-dossier en ~ est étendu, pas concaténé", () => {
		// C'est la divergence qui rendait un chemin absolu validé comme relatif
		// puis exécuté comme absolu : les deux calculs passent maintenant ici.
		expect(resolveAuditTarget("/srv/mono", "~/api")).toBe(
			resolve(homedir(), "api"),
		);
	});

	test("la racine en ~ est étendue avant résolution", () => {
		expect(resolveAuditTarget("~/mono", "packages/api")).toBe(
			resolve(homedir(), "mono/packages/api"),
		);
	});

	test("les remontées sont normalisées", () => {
		expect(resolveAuditTarget("/srv/mono", "packages/../api")).toBe(
			"/srv/mono/api",
		);
	});

	test("getAuditTarget délègue à la même fonction", () => {
		const p = {
			path: "/srv/mono",
			audit_path: "packages/api",
		} as unknown as Project;
		expect(getAuditTarget(p)).toBe("/srv/mono/packages/api");
	});
});

describe("lib/audit — auditTargetKey", () => {
	test("trois écritures du même dossier donnent la même clé", () => {
		// C'est la clé anti-doublon : sans normalisation, le même projet serait
		// ajoutable trois fois.
		const attendu = auditTargetKey("/srv/api");
		expect(auditTargetKey("/srv/api/")).toBe(attendu);
		expect(auditTargetKey("/srv/api///")).toBe(attendu);
		expect(auditTargetKey("/srv/./api")).toBe(attendu);
	});

	test("racine et sous-dossier convergent vers la même clé", () => {
		expect(auditTargetKey("/srv/mono", "packages/api")).toBe(
			auditTargetKey("/srv/mono/packages/api"),
		);
	});

	test("la racine du système reste « / »", () => {
		expect(auditTargetKey("/")).toBe("/");
	});

	test("deux projets distincts gardent des clés distinctes", () => {
		expect(auditTargetKey("/srv/api")).not.toBe(auditTargetKey("/srv/web"));
	});
});

describe("lib/audit — runAudit, déduplication (CONTEXT.md §12)", () => {
	useTempDb("audit-dedup");

	/** Enregistre un run réussi correspondant au commit courant. */
	function runPourHead(project: Project, repo: string) {
		return addRun({
			project_id: project.id,
			status: "ok",
			total: 0,
			counts: vide(),
			vulnerabilities: [],
			command: "npm audit --json",
			commit_sha: git(repo, "rev-parse", "HEAD"),
			error: null,
			duration_ms: 5,
		});
	}

	test("même commit, dépôt propre, run récent : l'audit est évité", () => {
		const { project, repo } = projetSurDepot("dedup");
		const precedent = runPourHead(project, repo);

		const r = runAudit(project.id);
		expect(r).resolves.toMatchObject({ deduped: true, newCves: [] });
		return r.then((res) => {
			expect(res.run?.id).toBe(precedent.id);
			expect(getRunsForProject(project.id)).toHaveLength(1);
		});
	});

	test("force ignore la déduplication et produit un nouveau run", async () => {
		sansReseau();
		const { project, repo } = projetSurDepot("force");
		runPourHead(project, repo);

		const r = await runAudit(project.id, true);
		expect(r.deduped).toBe(false);
		expect(getRunsForProject(project.id)).toHaveLength(2);
	});

	test("un dépôt sale n'est jamais dédupliqué", async () => {
		// Les dépendances ont pu changer sans commit : le SHA ne prouve plus rien.
		sansReseau();
		const { project, repo } = projetSurDepot("sale");
		runPourHead(project, repo);
		writeFileSync(join(repo, "README.md"), "modifié\n");

		expect((await runAudit(project.id)).deduped).toBe(false);
	});

	test("un commit différent n'est pas dédupliqué", async () => {
		sansReseau();
		const { project } = projetSurDepot("commit");
		addRun({
			project_id: project.id,
			status: "ok",
			total: 0,
			counts: vide(),
			vulnerabilities: [],
			command: "npm audit --json",
			commit_sha: "0".repeat(40),
			error: null,
			duration_ms: 5,
		});

		expect((await runAudit(project.id)).deduped).toBe(false);
	});

	test("un dernier run en erreur n'est pas dédupliqué", async () => {
		// Sinon une erreur transitoire gèlerait le projet jusqu'au prochain commit.
		sansReseau();
		const { project, repo } = projetSurDepot("apres-erreur");
		addRun({
			project_id: project.id,
			status: "error",
			total: 0,
			counts: vide(),
			vulnerabilities: [],
			command: "npm audit --json",
			commit_sha: git(repo, "rev-parse", "HEAD"),
			error: "npm introuvable",
			duration_ms: 5,
		});

		expect((await runAudit(project.id)).deduped).toBe(false);
	});

	test("un projet hors git n'est jamais dédupliqué", async () => {
		// Sans SHA, il n'existe aucune preuve que le code n'a pas changé.
		sansReseau();
		const hors = dossier("hors-git");
		const project = createProject({
			name: "hors-git",
			path: hors,
			audit_path: "cible-absente",
			type: "node",
			tool: "npm",
		});
		addRun({
			project_id: project.id,
			status: "ok",
			total: 0,
			counts: vide(),
			vulnerabilities: [],
			command: "npm audit --json",
			commit_sha: null,
			error: null,
			duration_ms: 5,
		});

		expect((await runAudit(project.id)).deduped).toBe(false);
	});

	test("AUDIT_MAX_AGE_HOURS = 0 : un run ancien reste frais", async () => {
		const { project, repo } = projetSurDepot("age-zero");
		const precedent = runPourHead(project, repo);
		setSetting("AUDIT_MAX_AGE_HOURS", "0");
		vieillir(precedent.id, 999);

		expect((await runAudit(project.id)).deduped).toBe(true);
	});

	test("AUDIT_MAX_AGE_HOURS = -1 : rien n'est jamais frais", async () => {
		sansReseau();
		const { project, repo } = projetSurDepot("age-moins-un");
		runPourHead(project, repo);
		setSetting("AUDIT_MAX_AGE_HOURS", "-1");

		expect((await runAudit(project.id)).deduped).toBe(false);
	});

	test("un run plus vieux que la fenêtre est réaudité", async () => {
		sansReseau();
		const { project, repo } = projetSurDepot("age-depasse");
		const precedent = runPourHead(project, repo);
		setSetting("AUDIT_MAX_AGE_HOURS", "1");
		vieillir(precedent.id, 3);

		expect((await runAudit(project.id)).deduped).toBe(false);
	});

	test("un run dans la fenêtre est conservé", async () => {
		const { project, repo } = projetSurDepot("age-dans");
		const precedent = runPourHead(project, repo);
		setSetting("AUDIT_MAX_AGE_HOURS", "6");
		vieillir(precedent.id, 3);

		expect((await runAudit(project.id)).deduped).toBe(true);
	});

	test("une valeur illisible retombe sur 24 heures", async () => {
		const { project, repo } = projetSurDepot("age-illisible");
		const precedent = runPourHead(project, repo);
		setSetting("AUDIT_MAX_AGE_HOURS", "beaucoup");
		vieillir(precedent.id, 3);

		expect((await runAudit(project.id)).deduped).toBe(true);
	});

	test("au-delà de 24 heures, le repli réaudite", async () => {
		sansReseau();
		const { project, repo } = projetSurDepot("age-defaut");
		const precedent = runPourHead(project, repo);
		vieillir(precedent.id, 30);

		expect((await runAudit(project.id)).deduped).toBe(false);
	});
});

/** Antidate un run de `heures` heures (UTC, comme SQLite). */
function vieillir(runId: number, heures: number) {
	const date = new Date(Date.now() - heures * 3_600_000)
		.toISOString()
		.replace("T", " ")
		.slice(0, 19);
	getDb().query("UPDATE runs SET ran_at = ? WHERE id = ?").run(date, runId);
}

describe("lib/audit — runAudit, échec de la commande", () => {
	useTempDb("audit-erreur");

	test("un projet inconnu lève", () => {
		expect(runAudit(999_999)).rejects.toThrow("Projet introuvable");
	});

	test("une cible d'audit inexistante produit un run en erreur", async () => {
		sansReseau();
		const { project } = projetSurDepot("cible");
		const r = await runAudit(project.id);

		expect(r.deduped).toBe(false);
		expect(r.newCves).toEqual([]);
		expect(r.run?.status).toBe("error");
		expect(r.run?.total).toBe(0);
		expect(r.run?.vulnerabilities).toEqual([]);
	});

	test("le message d'erreur porte la cible et le code de sortie", async () => {
		// C'est ce que l'écran Debug affiche : sans le `cwd`, une erreur de chemin
		// est indiscernable d'une erreur d'outil.
		sansReseau();
		const { project, repo } = projetSurDepot("message");
		const erreur = (await runAudit(project.id)).run?.error ?? "";

		expect(erreur).toContain("Erreur système:");
		expect(erreur).toContain(`cwd: ${join(repo, "cible-absente")}`);
		expect(erreur).toContain("exit:");
	});

	test("le run en erreur mémorise la commande et le commit", async () => {
		sansReseau();
		const { project, repo } = projetSurDepot("commande");
		const run = (await runAudit(project.id)).run;

		expect(run?.command).toBe("npm audit --json");
		expect(run?.commit_sha).toBe(git(repo, "rev-parse", "HEAD"));
	});

	test("la commande dépend de l'outil du projet", async () => {
		sansReseau();
		const attendu: Record<string, string> = {
			npm: "npm audit --json",
			yarn: "yarn audit --json",
			bun: "bun audit --json",
			composer: "composer audit --format=json --locked --no-interaction",
		};

		for (const [tool, cmd] of Object.entries(attendu)) {
			const repo = depot(`outil-${tool}`);
			const p = createProject({
				name: `outil-${tool}`,
				path: repo,
				audit_path: "cible-absente",
				type: tool === "composer" ? "composer" : "node",
				tool: tool as "npm",
			});
			expect((await runAudit(p.id)).run?.command).toBe(cmd);
		}
	});

	test("un run en erreur devient le dernier run du projet", async () => {
		sansReseau();
		const { project } = projetSurDepot("dernier");
		await runAudit(project.id);
		expect(getLatestRun(project.id)?.status).toBe("error");
	});
});

describe("lib/audit — ingestAudit (CI)", () => {
	useTempDb("audit-ingest");

	/** Sortie `npm audit --json` minimale portant une CVE. */
	function sortieNpm(pkg = "lodash", cwe = "CWE-1321") {
		return JSON.stringify({
			vulnerabilities: {
				[pkg]: {
					name: pkg,
					severity: "high",
					range: ">=4.0.0",
					via: [
						{
							title: "Prototype pollution",
							url: "https://github.com/advisories/GHSA-jf85-cpcp-j695",
							severity: "critical",
							range: ">=4.0.0 <4.17.21",
							cwe: [cwe],
						},
					],
				},
			},
		});
	}

	function projetSimple(nom = "ci") {
		return createProject({
			name: nom,
			path: `/srv/${nom}`,
			type: "node",
			tool: "npm",
		});
	}

	test("un projet inconnu lève", () => {
		expect(ingestAudit(999_999, sortieNpm())).rejects.toThrow(
			"Projet introuvable",
		);
	});

	test("une charge vide est refusée", () => {
		// Un pipeline mal configuré enverrait un corps vide ; l'accepter écraserait
		// l'état du projet par un « aucune faille ».
		const p = projetSimple();
		expect(ingestAudit(p.id, "   ")).rejects.toThrow("Payload vide");
	});

	test("une sortie illisible lève au lieu d'enregistrer un run", () => {
		const p = projetSimple();
		expect(ingestAudit(p.id, "pas du json")).rejects.toThrow(
			/Sortie JSON illisible/,
		);
	});

	test("une sortie valide crée un run vulnérable", async () => {
		sansReseau();
		const p = projetSimple();
		const { run } = await ingestAudit(p.id, sortieNpm(), "deadbeef");

		expect(run?.status).toBe("vulnerable");
		expect(run?.total).toBe(1);
		expect(run?.commit_sha).toBe("deadbeef");
		expect(run?.command).toBe("ci-ingest npm");
		expect(run?.counts.critical).toBe(1);
	});

	test("aucune faille donne un run ok", async () => {
		sansReseau();
		const p = projetSimple();
		const { run } = await ingestAudit(p.id, '{"vulnerabilities":{}}');
		expect(run?.status).toBe("ok");
		expect(run?.total).toBe(0);
	});

	test("sans commit fourni, le run n'en mémorise aucun", async () => {
		// `ingestAudit` passe `""` par défaut, que `addRun` normalise en null : un
		// run de CI hors dépôt n'invente pas de SHA.
		sansReseau();
		const p = projetSimple();
		expect((await ingestAudit(p.id, sortieNpm())).run?.commit_sha).toBeNull();
	});

	test("le premier run marque les failles comme existant de base", async () => {
		// Sans ce marquage, tout le passif d'un projet compterait comme découvert
		// aujourd'hui et fausserait le délai de traitement.
		sansReseau();
		const p = projetSimple();
		const { run } = await ingestAudit(p.id, sortieNpm());
		expect(run?.vulnerabilities[0]?.isBaseline).toBe(true);
		expect(run?.vulnerabilities[0]?.firstSeenAt).toBeTruthy();
	});

	test("une faille apparue après le premier run n'est pas de base", async () => {
		sansReseau();
		const p = projetSimple();
		await ingestAudit(p.id, sortieNpm("lodash"));
		const { run } = await ingestAudit(
			p.id,
			JSON.stringify({
				vulnerabilities: {
					lodash: {
						name: "lodash",
						severity: "high",
						via: [{ title: "T", url: "u", cwe: ["CWE-1321"] }],
					},
					axios: {
						name: "axios",
						severity: "moderate",
						via: [{ title: "SSRF", url: "u2", cwe: ["CWE-918"] }],
					},
				},
			}),
		);

		const axios = run?.vulnerabilities.find((v) => v.package === "axios");
		expect(axios?.isBaseline).toBe(false);
	});

	test("first_seen_at est gelé d'un run à l'autre", async () => {
		// C'est l'invariant C12 : réingérer la même faille ne remet pas son
		// chronomètre à zéro.
		sansReseau();
		const p = projetSimple();
		const premier = await ingestAudit(p.id, sortieNpm());
		const second = await ingestAudit(p.id, sortieNpm());

		expect(second.run?.vulnerabilities[0]?.firstSeenAt).toBe(
			premier.run?.vulnerabilities[0]?.firstSeenAt,
		);
	});

	test("les CVE non traitées sont remontées comme nouvelles", async () => {
		sansReseau();
		const p = projetSimple();
		const { newCves } = await ingestAudit(p.id, sortieNpm());

		expect(newCves).toHaveLength(1);
		expect(newCves[0]?.occurrences[0]?.package).toBe("lodash");
		expect(newCves[0]?.occurrences[0]?.status).toBe("pending");
	});

	test("une CVE déjà triée n'est plus remontée", async () => {
		// C'est ce qui rend l'étape CI utilisable en garde-fou : seul le non-traité
		// doit faire échouer la construction.
		sansReseau();
		const p = projetSimple();
		const premier = await ingestAudit(p.id, sortieNpm());
		const ref = premier.newCves[0]?.cve as string;
		upsertAnnotation(ref, p.id, { status: "not_affected" });

		expect((await ingestAudit(p.id, sortieNpm())).newCves).toEqual([]);
	});

	test("les failles d'un autre projet ne sont pas remontées", async () => {
		sansReseau();
		const a = projetSimple("a");
		const b = projetSimple("b");
		await ingestAudit(a.id, sortieNpm("lodash"));
		const { newCves } = await ingestAudit(b.id, sortieNpm("axios", "CWE-918"));

		expect(newCves).toHaveLength(1);
		expect(newCves[0]?.occurrences[0]?.package).toBe("axios");
	});

	test("un projet ignoré ne remonte aucune nouvelle CVE — écart documenté", async () => {
		// Le diff passe par `buildCveGroups`, qui exclut les projets ignorés : la
		// porte CI d'un projet ignoré est donc toujours verte, même s'il vient
		// d'ingérer une faille critique.
		sansReseau();
		const p = createProject({
			name: "ignore",
			path: "/srv/ignore",
			type: "node",
			tool: "npm",
			ignored: true,
		});
		const { run, newCves } = await ingestAudit(p.id, sortieNpm());

		expect(run?.total).toBe(1);
		expect(newCves).toEqual([]);
	});

	test("l'enrichissement GitHub hors ligne n'empêche pas l'ingestion", async () => {
		// L'audit doit aboutir sans réseau : l'enrichissement est un bonus.
		sansReseau();
		const p = projetSimple();
		const { run } = await ingestAudit(p.id, sortieNpm());
		expect(run?.status).toBe("vulnerable");
		expect(run?.vulnerabilities[0]?.publishedAt).toBeNull();
	});
});
