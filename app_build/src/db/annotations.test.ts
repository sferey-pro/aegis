import { describe, expect, test } from "bun:test";

import { useTempDb } from "@/test/db";
import {
	getAllAnnotations,
	getAnnotationsForProject,
	setAnnotationFix,
	upsertAnnotation,
} from "./annotations";
import { getDb } from "./index";
import { createProject } from "./projects";

function projet(nom = "api") {
	return createProject({
		name: nom,
		path: `/srv/${nom}`,
		type: "node",
		tool: "npm",
	});
}

describe("db/annotations", () => {
	useTempDb("annotations");

	test("une annotation absente naît avec les valeurs par défaut du contrat", () => {
		const p = projet();
		const a = upsertAnnotation("CVE-2024-1", p.id, {});
		expect(a.status).toBe("pending");
		expect(a.note).toBe("");
		expect(a.fixed_in).toBeNull();
	});

	test("les quatre statuts de triage sont acceptés", () => {
		const p = projet();
		for (const status of [
			"pending",
			"confirmed",
			"not_affected",
			"ignored",
		] as const) {
			expect(upsertAnnotation("CVE-2024-2", p.id, { status }).status).toBe(
				status,
			);
		}
	});

	test("un second appel met à jour la même ligne au lieu d'en créer une", () => {
		const p = projet();
		upsertAnnotation("CVE-2024-3", p.id, { status: "confirmed" });
		upsertAnnotation("CVE-2024-3", p.id, { status: "ignored" });
		const lignes = getAnnotationsForProject(p.id);
		expect(lignes).toHaveLength(1);
		expect(lignes[0]?.status).toBe("ignored");
	});

	test("un champ non fourni est conservé, pas réinitialisé", () => {
		// C'est le cœur du contrat : le panneau de triage envoie un seul champ à la
		// fois. Écraser les deux autres perdrait la note ou le statut à chaque clic.
		const p = projet();
		upsertAnnotation("CVE-2024-4", p.id, {
			status: "confirmed",
			note: "Non exposé côté serveur",
			fixedIn: "4.17.21",
		});

		const apres = upsertAnnotation("CVE-2024-4", p.id, { status: "ignored" });
		expect(apres.status).toBe("ignored");
		expect(apres.note).toBe("Non exposé côté serveur");
		expect(apres.fixed_in).toBe("4.17.21");
	});

	test("une note vide explicite efface la note", () => {
		// `undefined` veut dire « ne touche pas », `""` veut dire « vide-la ».
		const p = projet();
		upsertAnnotation("CVE-2024-5", p.id, { note: "à revoir" });
		expect(upsertAnnotation("CVE-2024-5", p.id, { note: "" }).note).toBe("");
	});

	test("un fixed_in blanc est normalisé en null", () => {
		const p = projet();
		upsertAnnotation("CVE-2024-6", p.id, { fixedIn: "1.0.0" });
		expect(
			upsertAnnotation("CVE-2024-6", p.id, { fixedIn: "   " }).fixed_in,
		).toBeNull();
		expect(
			upsertAnnotation("CVE-2024-6", p.id, { fixedIn: null }).fixed_in,
		).toBeNull();
	});

	test("setAnnotationFix ne touche que fixed_in", () => {
		const p = projet();
		upsertAnnotation("CVE-2024-7", p.id, {
			status: "confirmed",
			note: "patch prévu",
		});
		const a = setAnnotationFix("CVE-2024-7", p.id, "5.0.0");
		expect(a.fixed_in).toBe("5.0.0");
		expect(a.status).toBe("confirmed");
		expect(a.note).toBe("patch prévu");
	});

	test("la même CVE est annotable indépendamment sur deux projets", () => {
		// Une CVE partagée peut être exploitable ici et hors chemin d'exécution là.
		const a = projet("a");
		const b = projet("b");
		upsertAnnotation("CVE-2024-8", a.id, { status: "confirmed" });
		upsertAnnotation("CVE-2024-8", b.id, { status: "not_affected" });

		expect(getAnnotationsForProject(a.id)[0]?.status).toBe("confirmed");
		expect(getAnnotationsForProject(b.id)[0]?.status).toBe("not_affected");
		expect(getAllAnnotations()).toHaveLength(2);
	});

	test("getAnnotationsForProject ne renvoie que le projet demandé", () => {
		const a = projet("a");
		const b = projet("b");
		upsertAnnotation("CVE-A", a.id, {});
		upsertAnnotation("CVE-B", b.id, {});
		expect(getAnnotationsForProject(a.id).map((x) => x.cve)).toEqual(["CVE-A"]);
	});

	test("annoter un projet inexistant lève sur la clé étrangère", () => {
		// La route filtre en amont avec un 404 « Projet introuvable » ; sans ce
		// garde-fou, l'erreur remonterait en 500.
		expect(() => upsertAnnotation("CVE-X", 999_999, {})).toThrow(
			/FOREIGN KEY/i,
		);
	});

	test("une annotation doit viser un projet existant (N7)", () => {
		// `annotations.project_id` porte une clé étrangère vers `projects(id)` et
		// `PRAGMA foreign_keys` est actif : aucun identifiant fantaisiste ne peut
		// être enregistré. C'est ce qui rendait inatteignable la convention
		// `project_id = -1` — l'« annotation globale ». Elle a été retirée du code
		// plutôt que matérialisée : CONTEXT.md §7 fixe l'unité de triage au couple
		// (CVE, projet) et ne prévoit aucune portée globale.
		expect(() =>
			upsertAnnotation("CVE-GLOBAL", -1, { status: "ignored" }),
		).toThrow(/FOREIGN KEY/i);
	});

	test("la lecture d'un projet ne remonte que ses propres annotations (N7)", () => {
		// La requête interrogeait aussi `project_id = -1`, une branche qui n'a
		// jamais rien pu renvoyer. Sa suppression ne doit rien changer au résultat
		// pour un projet réel — c'est le sens de « code mort ».
		const a = projet();
		const b = createProject({
			name: "autre",
			path: "/srv/autre",
			type: "node",
			tool: "npm",
		});
		upsertAnnotation("CVE-A", a.id, { status: "confirmed" });
		upsertAnnotation("CVE-B", b.id, { status: "ignored" });

		expect(getAnnotationsForProject(a.id).map((x) => x.cve)).toEqual(["CVE-A"]);
		expect(getAnnotationsForProject(b.id).map((x) => x.cve)).toEqual(["CVE-B"]);
	});

	test("supprimer le projet supprime ses annotations en cascade", () => {
		const p = projet();
		upsertAnnotation("CVE-2024-9", p.id, { status: "confirmed" });
		getDb().query("DELETE FROM projects WHERE id = ?").run(p.id);
		expect(getAllAnnotations()).toHaveLength(0);
	});

	test("updated_at avance à chaque mise à jour", () => {
		const p = projet();
		const a = upsertAnnotation("CVE-2024-10", p.id, { status: "pending" });
		// L'horodatage a une résolution d'une seconde : on l'antidate pour rendre
		// l'écriture observable sans faire attendre le test.
		getDb()
			.query(
				"UPDATE annotations SET updated_at = '2020-01-01 00:00:00' WHERE id = ?",
			)
			.run(a.id);

		const apres = upsertAnnotation("CVE-2024-10", p.id, {
			status: "confirmed",
		});
		expect(apres.updated_at).not.toBe("2020-01-01 00:00:00");
	});

	test("getAllAnnotations est vide sur une base neuve", () => {
		expect(getAllAnnotations()).toEqual([]);
	});
});
