import { describe, expect, test } from "bun:test";
import {
	annotationBodySchema,
	detectBodySchema,
	projectBodySchema,
	promptBodySchema,
	restoreBodySchema,
	settingsBodySchema,
	tagBodySchema,
} from "./schemas";

/** Message du premier problème, tel que `parseBody` le renvoie au client. */
function firstError(result: {
	success: boolean;
	error?: { issues: unknown[] };
}) {
	if (result.success) return null;
	const [issue] = result.error?.issues ?? [];
	return (issue as { message?: string } | undefined)?.message ?? null;
}

const validProject = {
	name: "Mon API",
	path: "/srv/apps/api",
	type: "node",
	tool: "npm",
};

describe("Schémas: projet (CONTEXT.md §1)", () => {
	test("messages d'erreur conformes au contrat", () => {
		expect(
			firstError(projectBodySchema.safeParse({ ...validProject, name: "   " })),
		).toBe("Nom requis");
		expect(
			firstError(projectBodySchema.safeParse({ ...validProject, path: "" })),
		).toBe("Chemin requis");
		expect(
			firstError(projectBodySchema.safeParse({ ...validProject, type: "php" })),
		).toBe("Type invalide (node|composer)");
		expect(
			firstError(projectBodySchema.safeParse({ ...validProject, tool: "pip" })),
		).toBe("Outil invalide (npm|yarn|composer)");
	});

	test("un corps vide échoue sans lever", () => {
		const res = projectBodySchema.safeParse({});
		expect(res.success).toBe(false);
	});

	test("name et path sont trimés", () => {
		const res = projectBodySchema.safeParse({
			...validProject,
			name: "  Mon API  ",
			path: "  /srv/apps/api  ",
		});
		if (!res.success) throw new Error("attendu valide");
		expect(res.data.name).toBe("Mon API");
		expect(res.data.path).toBe("/srv/apps/api");
	});

	test("audit_path vide ou absent devient null", () => {
		for (const audit_path of ["", "   ", undefined, null]) {
			const res = projectBodySchema.safeParse({ ...validProject, audit_path });
			if (!res.success) throw new Error(`attendu valide pour ${audit_path}`);
			expect(res.data.audit_path).toBeNull();
		}
	});

	test("tags: trim, retrait des vides, dédup, ordre préservé", () => {
		const res = projectBodySchema.safeParse({
			...validProject,
			tags: [" web ", "api", "web", "", "   ", "db"],
		});
		if (!res.success) throw new Error("attendu valide");
		expect(res.data.tags).toEqual(["web", "api", "db"]);
	});

	test("tags non-tableau retombe sur une liste vide plutôt que d'échouer", () => {
		const res = projectBodySchema.safeParse({
			...validProject,
			tags: "web,api",
		});
		if (!res.success) throw new Error("attendu valide");
		expect(res.data.tags).toEqual([]);
	});

	test("bun est un outil accepté malgré le message du contrat", () => {
		const res = projectBodySchema.safeParse({ ...validProject, tool: "bun" });
		expect(res.success).toBe(true);
	});

	test("detect n'exige que le chemin", () => {
		expect(detectBodySchema.safeParse({ path: "/srv" }).success).toBe(true);
		expect(firstError(detectBodySchema.safeParse({ path: " " }))).toBe(
			"Chemin requis",
		);
	});
});

describe("Schémas: annotation (CONTEXT.md §7)", () => {
	test("cve requise", () => {
		expect(
			firstError(annotationBodySchema.safeParse({ cve: "  ", projectId: 1 })),
		).toBe("CVE requise");
	});

	test("statut hors énumération retombe sur pending", () => {
		const res = annotationBodySchema.safeParse({
			cve: "CVE-2024-1",
			projectId: 1,
			status: "banana",
		});
		if (!res.success) throw new Error("attendu valide");
		expect(res.data.status).toBe("pending");
	});

	test("note par défaut vide, fixedIn vide devient null", () => {
		const res = annotationBodySchema.safeParse({
			cve: "CVE-2024-1",
			projectId: 1,
			fixedIn: "   ",
		});
		if (!res.success) throw new Error("attendu valide");
		expect(res.data.note).toBe("");
		expect(res.data.fixedIn).toBeNull();
	});
});

describe("Schémas: tag (CONTEXT.md §9)", () => {
	test("nom vide refusé", () => {
		expect(firstError(tagBodySchema.safeParse({ name: "  " }))).toBe(
			"Nom requis",
		);
	});

	test("couleur hors palette retombe sur indigo", () => {
		for (const color of ["fuchsia", "red", undefined, 42]) {
			const res = tagBodySchema.safeParse({ name: "web", color });
			if (!res.success) throw new Error(`attendu valide pour ${color}`);
			expect(res.data.color).toBe("indigo");
		}
	});

	test("couleur de la palette conservée", () => {
		const res = tagBodySchema.safeParse({ name: "web", color: "emerald" });
		if (!res.success) throw new Error("attendu valide");
		expect(res.data.color).toBe("emerald");
	});
});

describe("Schémas: prompt (CONTEXT.md §10)", () => {
	test("titre requis", () => {
		expect(firstError(promptBodySchema.safeParse({ title: " " }))).toBe(
			"Titre requis",
		);
	});

	test("body par défaut vide", () => {
		const res = promptBodySchema.safeParse({ title: "Remédiation" });
		if (!res.success) throw new Error("attendu valide");
		expect(res.data.body).toBe("");
		expect(res.data.tags).toEqual([]);
	});
});

describe("Schémas: réglages (CONTEXT.md §12)", () => {
	test("durée invalide refusée", () => {
		for (const value of ["abc", "-99", "NaN", "Infinity"]) {
			expect(
				firstError(
					settingsBodySchema.safeParse({ AUDIT_MAX_AGE_HOURS: value }),
				),
			).toBe("Durée invalide");
		}
	});

	test("les trois sémantiques valides sont acceptées", () => {
		for (const value of ["24", "0", "-1", "0.5"]) {
			const res = settingsBodySchema.safeParse({ AUDIT_MAX_AGE_HOURS: value });
			expect(res.success).toBe(true);
		}
	});

	test("les autres clés passent, converties en chaîne", () => {
		const res = settingsBodySchema.safeParse({
			JIRA_BASE_URL: "https://jira.example",
			DISABLE_CONSOLE: true,
		});
		if (!res.success) throw new Error("attendu valide");
		expect(res.data.JIRA_BASE_URL).toBe("https://jira.example");
		expect(res.data.DISABLE_CONSOLE).toBe("true");
	});
});

describe("Schémas: restauration de snapshot (CONTEXT.md §12)", () => {
	test("fichier requis", () => {
		expect(firstError(restoreBodySchema.safeParse({}))).toBe("Fichier requis");
		expect(firstError(restoreBodySchema.safeParse({ file: "  " }))).toBe(
			"Fichier requis",
		);
	});
});
