import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "bun";

import { useTempDb } from "@/test/db";
import { expandPath, getGitInfo, gitFetch, gitPull } from "./index";

/**
 * Ces tests exercent le vrai binaire `git` sur de vrais dépôts jetables.
 *
 * Simuler `spawn` ne vérifierait que notre propre simulation : ce qu'on veut
 * savoir, c'est comment `git` répond réellement — un dépôt vide n'a pas de HEAD,
 * `rev-list --left-right` renvoie « behind<TAB>ahead » et non l'inverse, un
 * `pull --ff-only` divergent échoue en silence sur stdout.
 *
 * Aucun accès réseau : l'amont est un dépôt nu local, ce qui suffit à produire
 * un `upstream`, un décalage `ahead`/`behind`, un `fetch` et un `pull` réels.
 */

const aNettoyer: string[] = [];

function dossier(label: string): string {
	const d = join(tmpdir(), `aegis-git-${label}-${randomUUID()}`);
	mkdirSync(d, { recursive: true });
	aNettoyer.push(d);
	return d;
}

function git(cwd: string, ...args: string[]) {
	const r = spawnSync(["git", ...args], {
		cwd,
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
	});
	if (r.exitCode !== 0) {
		throw new Error(
			`git ${args.join(" ")} a échoué (${r.exitCode}) : ${r.stderr.toString()}`,
		);
	}
	return r.stdout.toString().trim();
}

/** Dépôt avec un commit initial et une identité locale. */
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

/** Dépôt nu servant d'amont local, et le clone qui le suit. */
function depotAvecAmont(label = "amont"): { local: string; amont: string } {
	const source = depot(`${label}-src`);
	const amont = dossier(`${label}-bare`);
	git(source, "clone", "-q", "--bare", source, amont);

	const local = dossier(`${label}-clone`);
	git(local, "clone", "-q", amont, ".");
	git(local, "config", "user.email", "test@aegis.local");
	git(local, "config", "user.name", "Aegis Test");
	return { local, amont };
}

afterEach(() => {
	for (const d of aNettoyer.splice(0))
		rmSync(d, { recursive: true, force: true });
});

describe("lib/git — expandPath", () => {
	test("étend ~ en répertoire personnel", () => {
		expect(expandPath("~")).toBe(homedir());
	});

	test("étend ~/ en chemin absolu sous le répertoire personnel", () => {
		expect(expandPath("~/projets/api")).toBe(resolve(homedir(), "projets/api"));
	});

	test("un chemin absolu est normalisé, pas modifié", () => {
		expect(expandPath("/srv/api")).toBe("/srv/api");
		expect(expandPath("/srv/./api/../api")).toBe("/srv/api");
	});

	test("un chemin relatif est résolu contre le répertoire courant", () => {
		// Le chemin est ensuite passé en `cwd` à `spawn` : le laisser relatif ferait
		// dépendre l'audit du répertoire d'invocation du serveur.
		expect(expandPath("api")).toBe(resolve(process.cwd(), "api"));
	});

	test("un tilde au milieu n'est pas étendu", () => {
		// Seul le préfixe est un raccourci shell ; `~` ailleurs est un nom valide.
		expect(expandPath("/srv/~backup")).toBe("/srv/~backup");
	});
});

describe("lib/git — getGitInfo", () => {
	useTempDb("git-info");

	test("un dossier hors dépôt n'est pas un dépôt", () => {
		const info = getGitInfo(dossier("plain"));
		expect(info).resolves.toMatchObject({
			isRepo: false,
			branch: null,
			sha: null,
		});
	});

	test("un chemin inexistant ne lève pas et renvoie isRepo faux", async () => {
		// Un projet supprimé du disque doit dégrader l'affichage, pas casser la
		// liste des projets.
		const info = await getGitInfo(join(tmpdir(), `absent-${randomUUID()}`));
		expect(info.isRepo).toBe(false);
	});

	test("un dépôt propre expose sa branche et son SHA", async () => {
		const d = depot();
		const info = await getGitInfo(d);
		expect(info.isRepo).toBe(true);
		expect(info.branch).toBe("main");
		expect(info.sha).toMatch(/^[0-9a-f]{40}$/);
		expect(info.dirty).toBe(false);
	});

	test("le SHA correspond à celui de HEAD", async () => {
		const d = depot();
		expect((await getGitInfo(d)).sha).toBe(git(d, "rev-parse", "HEAD"));
	});

	test("un fichier modifié rend le dépôt sale", async () => {
		const d = depot();
		writeFileSync(join(d, "README.md"), "modifié\n");
		expect((await getGitInfo(d)).dirty).toBe(true);
	});

	test("un fichier non suivi rend aussi le dépôt sale", async () => {
		// `status --porcelain` liste les fichiers non suivis : c'est voulu, un
		// `package.json` non commité change le résultat de l'audit.
		const d = depot();
		writeFileSync(join(d, "brouillon.txt"), "x\n");
		expect((await getGitInfo(d)).dirty).toBe(true);
	});

	test("sans amont, upstream est null et les compteurs à zéro", async () => {
		const info = await getGitInfo(depot());
		expect(info.upstream).toBeNull();
		expect(info.ahead).toBe(0);
		expect(info.behind).toBe(0);
	});

	test("un clone expose sa branche de suivi", async () => {
		const { local } = depotAvecAmont();
		const info = await getGitInfo(local);
		expect(info.upstream).toBe("origin/main");
		expect(info.ahead).toBe(0);
		expect(info.behind).toBe(0);
	});

	test("un commit local non poussé compte en ahead", async () => {
		const { local } = depotAvecAmont("ahead");
		writeFileSync(join(local, "local.txt"), "x\n");
		git(local, "add", ".");
		git(local, "commit", "-q", "-m", "local");

		const info = await getGitInfo(local);
		expect(info.ahead).toBe(1);
		expect(info.behind).toBe(0);
	});

	test("un commit amont non récupéré compte en behind", async () => {
		// Le sens de `rev-list --left-right --count @{u}...HEAD` est « behind puis
		// ahead » : l'inverser afficherait « 1 commit d'avance » pour un retard.
		const { local, amont } = depotAvecAmont("behind");

		const autre = dossier("pousseur");
		git(autre, "clone", "-q", amont, ".");
		git(autre, "config", "user.email", "test@aegis.local");
		git(autre, "config", "user.name", "Aegis Test");
		writeFileSync(join(autre, "amont.txt"), "x\n");
		git(autre, "add", ".");
		git(autre, "commit", "-q", "-m", "amont");
		git(autre, "push", "-q", "origin", "main");

		git(local, "fetch", "-q");
		const info = await getGitInfo(local);
		expect(info.behind).toBe(1);
		expect(info.ahead).toBe(0);
	});

	test("les deux compteurs coexistent sur une divergence", async () => {
		const { local, amont } = depotAvecAmont("diverge");

		const autre = dossier("pousseur2");
		git(autre, "clone", "-q", amont, ".");
		git(autre, "config", "user.email", "test@aegis.local");
		git(autre, "config", "user.name", "Aegis Test");
		writeFileSync(join(autre, "amont.txt"), "x\n");
		git(autre, "add", ".");
		git(autre, "commit", "-q", "-m", "amont");
		git(autre, "push", "-q", "origin", "main");

		writeFileSync(join(local, "local.txt"), "y\n");
		git(local, "add", ".");
		git(local, "commit", "-q", "-m", "local");
		git(local, "fetch", "-q");

		const info = await getGitInfo(local);
		expect(info.ahead).toBe(1);
		expect(info.behind).toBe(1);
	});

	test("un dépôt sans commit expose « HEAD » comme SHA — écart documenté", async () => {
		// Sur une branche non née, `git rev-parse HEAD` écrit « fatal: ambiguous
		// argument » sur stderr mais renvoie tout de même « HEAD » sur stdout. Le
		// filtre ne cherchant `fatal:` que dans stdout, cette chaîne est acceptée :
		// `commit_sha` peut donc valoir « HEAD » au lieu de null.
		const d = dossier("vide");
		git(d, "init", "-q", "-b", "main");
		const info = await getGitInfo(d);
		expect(info.isRepo).toBe(true);
		expect(info.sha).toBe("HEAD");
		// Même cause pour la branche : `rev-parse --abbrev-ref HEAD` échoue et
		// renvoie « HEAD », alors que la branche courante est bien `main`.
		expect(info.branch).toBe("HEAD");
	});

	test("un sous-dossier du dépôt est reconnu comme dépôt", async () => {
		// C'est ce qui permet à `audit_path` de pointer un sous-projet.
		const d = depot();
		const sous = join(d, "packages", "api");
		mkdirSync(sous, { recursive: true });
		expect((await getGitInfo(sous)).isRepo).toBe(true);
	});
});

describe("lib/git — gitFetch", () => {
	useTempDb("git-fetch");

	test("un fetch sans nouveauté renvoie le journal verbeux de git", async () => {
		// `--verbose` fait dire à git « = [up to date] » même quand rien ne change,
		// donc le journal n'est jamais vide dès qu'un amont existe.
		const { local } = depotAvecAmont("fetch-ok");
		const r = await gitFetch(local);
		expect(r.ok).toBe(true);
		expect(r.log).toContain("up to date");
	});

	test("un fetch qui récupère un commit renvoie le journal de git", async () => {
		const { local, amont } = depotAvecAmont("fetch-new");

		const autre = dossier("pousseur3");
		git(autre, "clone", "-q", amont, ".");
		git(autre, "config", "user.email", "test@aegis.local");
		git(autre, "config", "user.name", "Aegis Test");
		writeFileSync(join(autre, "amont.txt"), "x\n");
		git(autre, "add", ".");
		git(autre, "commit", "-q", "-m", "amont");
		git(autre, "push", "-q", "origin", "main");

		const r = await gitFetch(local);
		expect(r.ok).toBe(true);
		expect(r.log).not.toBe("Déjà à jour.");
		expect(r.log.length).toBeGreaterThan(0);
	});

	test("un dépôt sans amont réussit sans rien faire, d'où « Déjà à jour. »", async () => {
		// C'est le seul cas où le repli s'applique : sans remote configuré, git
		// sort en 0 et n'écrit rien. Sans ce repli, l'interface afficherait un
		// journal vide et laisserait croire à un échec.
		const r = await gitFetch(depot("sans-amont"));
		expect(r.ok).toBe(true);
		expect(r.log).toBe("Déjà à jour.");
	});

	test("un chemin inexistant renvoie un message dédié, sans lever", async () => {
		const r = await gitFetch(join(tmpdir(), `absent-${randomUUID()}`));
		expect(r.ok).toBe(false);
		expect(r.log).toBe("chemin introuvable ou erreur système");
	});
});

describe("lib/git — gitPull", () => {
	useTempDb("git-pull");

	test("un pull en avance rapide réussit", async () => {
		const { local, amont } = depotAvecAmont("pull-ff");

		const autre = dossier("pousseur4");
		git(autre, "clone", "-q", amont, ".");
		git(autre, "config", "user.email", "test@aegis.local");
		git(autre, "config", "user.name", "Aegis Test");
		writeFileSync(join(autre, "amont.txt"), "x\n");
		git(autre, "add", ".");
		git(autre, "commit", "-q", "-m", "amont");
		git(autre, "push", "-q", "origin", "main");

		const r = await gitPull(local);
		expect(r.ok).toBe(true);
		expect(git(local, "log", "--oneline")).toContain("amont");
	});

	test("un pull sans nouveauté réussit et le dit", async () => {
		const { local } = depotAvecAmont("pull-noop");
		const r = await gitPull(local);
		expect(r.ok).toBe(true);
		expect(r.log.length).toBeGreaterThan(0);
	});

	test("une divergence est refusée : --ff-only ne fusionne jamais", async () => {
		// C'est l'invariant de sûreté : le serveur ne doit pas créer de commit de
		// fusion dans le dépôt d'un utilisateur.
		const { local, amont } = depotAvecAmont("pull-diverge");

		const autre = dossier("pousseur5");
		git(autre, "clone", "-q", amont, ".");
		git(autre, "config", "user.email", "test@aegis.local");
		git(autre, "config", "user.name", "Aegis Test");
		writeFileSync(join(autre, "amont.txt"), "x\n");
		git(autre, "add", ".");
		git(autre, "commit", "-q", "-m", "amont");
		git(autre, "push", "-q", "origin", "main");

		writeFileSync(join(local, "local.txt"), "y\n");
		git(local, "add", ".");
		git(local, "commit", "-q", "-m", "local");

		const r = await gitPull(local);
		expect(r.ok).toBe(false);
		expect(r.log.length).toBeGreaterThan(0);
		// Aucun commit de fusion n'a été créé.
		expect(git(local, "rev-list", "--count", "--merges", "HEAD")).toBe("0");
	});

	test("un chemin inexistant renvoie un message dédié, sans lever", async () => {
		const r = await gitPull(join(tmpdir(), `absent-${randomUUID()}`));
		expect(r.ok).toBe(false);
		expect(r.log).toBe("chemin introuvable ou erreur système");
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
	useTempDb("git-contrats");

	// N42 — sur une branche non née, `git rev-parse` écrit « fatal: » sur stderr
	// mais « HEAD » sur stdout. Un `commit_sha` valant « HEAD » satisfait la
	// condition de déduplication : deux audits se dédupliquent l'un contre l'autre.
	test.failing("un dépôt sans commit n'expose aucun SHA (N42)", async () => {
		const d = dossier("vide-contrat");
		git(d, "init", "-q", "-b", "main");
		const info = await getGitInfo(d);
		expect(info.isRepo).toBe(true);
		expect(info.sha).toBeNull();
	});

	// N43 — le repli « Déjà à jour. » ne doit pas se déclencher sur un dépôt sans
	// remote, où rien n'a été tenté : c'est le message le plus trompeur possible.
	test.failing("un dépôt sans amont le dit explicitement (N43)", async () => {
		const r = await gitFetch(depot("sans-amont-contrat"));
		expect(r.log).not.toBe("Déjà à jour.");
	});
});
