import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	AUDIT_TOOLS,
	auditCommand,
	isKnownTool,
	preflightAudit,
} from "./preflight";

const aNettoyer: string[] = [];

afterEach(() => {
	for (const d of aNettoyer.splice(0))
		rmSync(d, { recursive: true, force: true });
});

function dossier(label: string): string {
	const d = join(tmpdir(), `aegis-preflight-${label}-${randomUUID()}`);
	mkdirSync(d, { recursive: true });
	aNettoyer.push(d);
	return d;
}

/** Chemin dans un dossier jetable, sans le créer. */
function inexistant(label: string): string {
	return join(dossier(label), "absent");
}

describe("lib/audit/preflight — catalogue des outils", () => {
	test("les quatre commandes sont celles du contrat", () => {
		// CONTEXT.md §2 les énumère à la virgule près : un drapeau ajouté ici
		// change la sortie que les parseurs (§3) attendent.
		expect(auditCommand("npm")).toEqual(["npm", "audit", "--json"]);
		expect(auditCommand("yarn")).toEqual(["yarn", "audit", "--json"]);
		expect(auditCommand("bun")).toEqual(["bun", "audit", "--json"]);
		expect(auditCommand("composer")).toEqual([
			"composer",
			"audit",
			"--format=json",
			"--locked",
			"--no-interaction",
		]);
	});

	test("la commande est rendue en tableau, jamais en chaîne", () => {
		// Invariant §15 : pas de shell. Une chaîne se ferait interpréter.
		for (const tool of ["npm", "yarn", "bun", "composer"] as const) {
			expect(Array.isArray(auditCommand(tool))).toBe(true);
		}
	});

	test("chaque appel rend un tableau neuf", () => {
		// L'appelant le passe à `spawn` et l'affiche : s'il partageait la
		// référence du catalogue, une mutation accidentelle changerait la
		// commande de tous les audits suivants.
		const a = auditCommand("npm");
		a.push("--production");
		expect(auditCommand("npm")).toEqual(["npm", "audit", "--json"]);
	});

	test("bun accepte ses deux lockfiles", () => {
		expect(AUDIT_TOOLS.bun.lockfiles).toEqual(["bun.lock", "bun.lockb"]);
	});

	test("isKnownTool reconnaît les quatre outils, et rien d'autre", () => {
		for (const tool of ["npm", "yarn", "bun", "composer"]) {
			expect(isKnownTool(tool)).toBe(true);
		}
		for (const autre of ["pnpm", "", "NPM", "npm ", "constructor"]) {
			expect(isKnownTool(autre)).toBe(false);
		}
	});
});

describe("lib/audit/preflight — chemin introuvable", () => {
	test("un dossier absent est signalé, avec son chemin", () => {
		const cible = inexistant("absent");
		expect(preflightAudit("npm", cible)).toBe(`Chemin introuvable: ${cible}`);
	});

	test("un fichier n'est pas une cible d'audit", () => {
		// Le message « Lockfile manquant » sur un fichier égarerait : ce n'est pas
		// le lockfile qui manque, c'est le dossier qui n'existe pas.
		const d = dossier("fichier");
		const f = join(d, "package-lock.json");
		writeFileSync(f, "{}");
		expect(preflightAudit("npm", f)).toBe(`Chemin introuvable: ${f}`);
	});

	test("le chemin est contrôlé avant le lockfile", () => {
		// L'ordre compte : sur un dossier absent, aucun lockfile ne peut exister,
		// et annoncer le lockfile masquerait la vraie cause.
		const cible = inexistant("ordre");
		expect(preflightAudit("composer", cible)).toContain("Chemin introuvable");
	});
});

describe("lib/audit/preflight — lockfile manquant", () => {
	test("npm : le message nomme le lockfile et le dossier cherché", () => {
		const d = dossier("npm-vide");
		expect(preflightAudit("npm", d)).toBe(
			`Lockfile manquant: package-lock.json (cherché dans ${d})`,
		);
	});

	test("yarn et composer nomment le leur", () => {
		const d = dossier("autres-vide");
		expect(preflightAudit("yarn", d)).toBe(
			`Lockfile manquant: yarn.lock (cherché dans ${d})`,
		);
		expect(preflightAudit("composer", d)).toBe(
			`Lockfile manquant: composer.lock (cherché dans ${d})`,
		);
	});

	test("bun énumère ses deux formes", () => {
		const d = dossier("bun-vide");
		expect(preflightAudit("bun", d)).toBe(
			`Lockfile manquant: bun.lock ou bun.lockb (cherché dans ${d})`,
		);
	});

	test("un manifeste ne remplace pas un lockfile", () => {
		// La détection (§1) propose un outil sur le seul `package.json` ; l'audit,
		// lui, a besoin du lockfile. Sans ce contrôle, `npm audit` échouait sur un
		// message parlant de `package.json` — la mauvaise piste.
		const d = dossier("manifeste");
		writeFileSync(join(d, "package.json"), "{}");
		expect(preflightAudit("npm", d)).toContain("Lockfile manquant");
	});

	test("le lockfile d'un autre outil ne compte pas", () => {
		const d = dossier("autre-outil");
		writeFileSync(join(d, "yarn.lock"), "");
		expect(preflightAudit("npm", d)).toContain("package-lock.json");
	});

	test("un lockfile qui est un dossier ne compte pas", () => {
		const d = dossier("lock-dossier");
		mkdirSync(join(d, "package-lock.json"));
		expect(preflightAudit("npm", d)).toContain("Lockfile manquant");
	});

	test("le contrôle ne descend pas dans les sous-dossiers", () => {
		// Le lockfile d'un monorepo se déclare par `audit_path` (§1) ; le trouver
		// plus bas ferait auditer un dossier qui n'est pas la cible.
		const d = dossier("monorepo");
		mkdirSync(join(d, "packages", "api"), { recursive: true });
		writeFileSync(join(d, "packages", "api", "package-lock.json"), "{}");
		expect(preflightAudit("npm", d)).toContain("Lockfile manquant");
	});
});

describe("lib/audit/preflight — cible valide", () => {
	test("un lockfile présent laisse passer", () => {
		const d = dossier("ok-npm");
		writeFileSync(join(d, "package-lock.json"), "{}");
		expect(preflightAudit("npm", d)).toBeNull();
	});

	test("bun.lock seul suffit", () => {
		const d = dossier("ok-bun-texte");
		writeFileSync(join(d, "bun.lock"), "");
		expect(preflightAudit("bun", d)).toBeNull();
	});

	test("bun.lockb seul suffit", () => {
		const d = dossier("ok-bun-binaire");
		writeFileSync(join(d, "bun.lockb"), "");
		expect(preflightAudit("bun", d)).toBeNull();
	});

	test("composer.lock suffit, sans vendor/", () => {
		// `--locked` audite le lockfile directement : exiger `vendor/` refuserait
		// un dépôt fraîchement cloné, cas le plus courant sur la machine Aegis.
		const d = dossier("ok-composer");
		writeFileSync(join(d, "composer.lock"), "{}");
		expect(preflightAudit("composer", d)).toBeNull();
	});
});
