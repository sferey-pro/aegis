import { describe, expect, test } from "bun:test";

import { useTempDb } from "@/test/db";
import { getDb } from "./index";
import { ensureOccurrences } from "./occurrences";
import { createProject } from "./projects";

/**
 * Le gel de `first_seen_at` est le correctif C12 : la date de première détection
 * doit être **définitive**. Un run en erreur ou une CVE qui disparaît puis
 * réapparaît ne doivent jamais la réécrire, sinon tout SLA construit dessus
 * s'auto-valide — il affiche de la conformité précisément quand l'outil a perdu
 * l'information.
 *
 * La vague 1 exigeait ce test de non-régression ; il n'avait jamais été écrit,
 * alors que le défaut avait déjà été réintroduit une fois par la duplication C5.
 */

describe("ensureOccurrences", () => {
	useTempDb("occurrences");

	function projet() {
		return createProject({
			name: "Mon API",
			path: "/srv/api",
			type: "node",
			tool: "npm",
		});
	}

	test("insère une occurrence par (package, cve)", () => {
		const p = projet();
		const map = ensureOccurrences(
			p.id,
			[
				{ package: "lodash", cve: "CVE-1" },
				{ package: "axios", cve: "CVE-2" },
			],
			false,
		);
		expect(map.size).toBe(2);
		expect(map.get("lodash::CVE-1")).toBeDefined();
		expect(map.get("axios::CVE-2")).toBeDefined();
	});

	test("une CVE absente retombe sur le nom du package comme clé", () => {
		const p = projet();
		const map = ensureOccurrences(
			p.id,
			[{ package: "lodash", cve: null }],
			false,
		);
		expect(map.get("lodash::lodash")).toBeDefined();
	});

	test("la date est exposée en ISO, avec le Z que SQLite n'écrit pas", () => {
		const p = projet();
		const map = ensureOccurrences(
			p.id,
			[{ package: "lodash", cve: "CVE-1" }],
			false,
		);
		const iso = map.get("lodash::CVE-1")?.firstSeenAt ?? "";
		// SQLite stocke 'YYYY-MM-DD HH:MM:SS' en UTC, sans indicateur de fuseau.
		expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
		expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
	});

	test("le premier insert fait foi : un second appel ne réécrit pas la date", () => {
		const p = projet();
		const premier = ensureOccurrences(
			p.id,
			[{ package: "lodash", cve: "CVE-1" }],
			false,
		);
		const date = premier.get("lodash::CVE-1")?.firstSeenAt;

		// Forcer une date antérieure pour rendre toute réécriture visible.
		getDb()
			.query(
				`UPDATE cve_occurrences SET first_seen_at = '2020-01-01 00:00:00'
				 WHERE project_id = ? AND package = ? AND cve = ?`,
			)
			.run(p.id, "lodash", "CVE-1");

		const second = ensureOccurrences(
			p.id,
			[{ package: "lodash", cve: "CVE-1" }],
			false,
		);
		expect(second.get("lodash::CVE-1")?.firstSeenAt).toBe(
			"2020-01-01T00:00:00Z",
		);
		expect(second.get("lodash::CVE-1")?.firstSeenAt).not.toBe(date);
	});

	test("détection → disparition → redétection conserve la date d'origine", () => {
		// Le scénario exact demandé par la vague 1 : run 1 détecte, run 2 ne voit
		// rien (erreur, réseau coupé, lockfile absent), run 3 redétecte.
		const p = projet();
		ensureOccurrences(p.id, [{ package: "lodash", cve: "CVE-1" }], true);
		getDb()
			.query(
				`UPDATE cve_occurrences SET first_seen_at = '2020-01-01 00:00:00'
				 WHERE project_id = ?`,
			)
			.run(p.id);

		// Run 2 : aucune vulnérabilité remontée.
		ensureOccurrences(p.id, [], false);
		// Run 3 : la CVE réapparaît.
		const apres = ensureOccurrences(
			p.id,
			[{ package: "lodash", cve: "CVE-1" }],
			false,
		);

		expect(apres.get("lodash::CVE-1")?.firstSeenAt).toBe(
			"2020-01-01T00:00:00Z",
		);
	});

	test("is_baseline du premier insert est conservé, même si un run suivant dit le contraire", () => {
		// La dette héritée reste de la dette : le premier run réussi la qualifie
		// définitivement.
		const p = projet();
		ensureOccurrences(p.id, [{ package: "lodash", cve: "CVE-1" }], true);
		const apres = ensureOccurrences(
			p.id,
			[{ package: "lodash", cve: "CVE-1" }],
			false,
		);
		expect(apres.get("lodash::CVE-1")?.isBaseline).toBe(true);
	});

	test("une découverte nette n'est pas marquée baseline", () => {
		const p = projet();
		const map = ensureOccurrences(
			p.id,
			[{ package: "lodash", cve: "CVE-1" }],
			false,
		);
		expect(map.get("lodash::CVE-1")?.isBaseline).toBe(false);
	});

	test("la carte ne contient que les occurrences du projet demandé", () => {
		const a = projet();
		const b = createProject({
			name: "Front",
			path: "/srv/front",
			type: "node",
			tool: "npm",
		});
		ensureOccurrences(a.id, [{ package: "lodash", cve: "CVE-1" }], false);
		const mapB = ensureOccurrences(
			b.id,
			[{ package: "axios", cve: "CVE-2" }],
			false,
		);

		expect(mapB.size).toBe(1);
		expect(mapB.get("lodash::CVE-1")).toBeUndefined();
	});

	test("une liste vide renvoie les occurrences déjà connues", () => {
		const p = projet();
		ensureOccurrences(p.id, [{ package: "lodash", cve: "CVE-1" }], false);
		const map = ensureOccurrences(p.id, [], false);
		// Rien n'est inséré, mais l'état existant est renvoyé.
		expect(map.size).toBe(1);
	});

	test("supprimer le projet supprime ses occurrences en cascade", () => {
		const p = projet();
		ensureOccurrences(p.id, [{ package: "lodash", cve: "CVE-1" }], false);

		getDb().query("DELETE FROM projects WHERE id = ?").run(p.id);

		const restantes = getDb()
			.query("SELECT COUNT(*) as n FROM cve_occurrences WHERE project_id = ?")
			.get(p.id) as { n: number };
		expect(restantes.n).toBe(0);
	});

	test("deux avis sans CVE sur un même package partagent une occurrence", () => {
		// Défaut N10 : la clé de la table est (project, package, cve) avec
		// `cve || package` en repli. Deux avis distincts sans CVE — le cas de `bun
		// audit`, dont le parseur ne remplit `cve` que depuis les CWE — se fondent
		// donc en une seule ligne et héritent de la même date.
		//
		// Comportement documenté, pas validé : c'est le résiduel de C12.
		const p = projet();
		const map = ensureOccurrences(
			p.id,
			[
				{ package: "lodash", cve: null },
				{ package: "lodash", cve: null },
			],
			false,
		);
		expect(map.size).toBe(1);
	});
});
