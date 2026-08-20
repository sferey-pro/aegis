import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { closeDb, getDb } from "../../db";
import { upsertAnnotation } from "../../db/annotations";
import { createProject } from "../../db/projects";
import { addRun } from "../../db/runs";
import { buildCveGroups } from "./index";

describe("Aggregator: CVE", () => {
	const TEST_DB = "test_aggregator.sqlite";

	beforeEach(() => {
		process.env.DB_PATH = TEST_DB;
		getDb();
	});

	afterEach(() => {
		closeDb();
		if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
	});

	test("buildCveGroups ignores projects without runs or with errors", () => {
		const p1 = createProject({
			name: "P1",
			path: "/1",
			type: "node",
			tool: "npm",
		});
		createProject({
			name: "P2",
			path: "/2",
			type: "node",
			tool: "npm",
		});

		// P1 run is error
		addRun({
			project_id: p1.id,
			status: "error",
			total: 0,
			counts: {
				critical: 0,
				high: 0,
				moderate: 0,
				low: 0,
				info: 0,
				unknown: 0,
			},
			vulnerabilities: [],
			duration_ms: 100,
		});
		// P2 has no runs

		const groups = buildCveGroups();
		expect(groups.length).toBe(0);
	});

	test("buildCveGroups correctly aggregates and overrides fixedIn", () => {
		const p = createProject({
			name: "MyProj",
			path: "/path",
			type: "node",
			tool: "npm",
		});

		// Ajoute un run avec 2 vulnérabilités (une avec CVE, une sans)
		addRun({
			project_id: p.id,
			status: "vulnerable",
			total: 2,
			counts: {
				critical: 1,
				high: 1,
				moderate: 0,
				low: 0,
				info: 0,
				unknown: 0,
			},
			duration_ms: 100,
			vulnerabilities: [
				{
					package: "lodash",
					title: "Pollution",
					severity: "high",
					cve: "CVE-123",
					link: null,
					versionRange: null,
					fixedIn: "1.0.0",
				},
				{
					package: "react",
					title: "XSS",
					severity: "critical",
					cve: null,
					link: null,
					versionRange: null,
				},
			],
		});

		// Ajoute une annotation qui surcharge le fixedIn et le statut
		upsertAnnotation("CVE-123", p.id, { status: "ignored", fixedIn: "2.0.0" });

		const groups = buildCveGroups();
		expect(groups.length).toBe(2);

		// Triés par pire sévérité (critical d'abord)
		expect(groups[0]?.worst).toBe("critical");
		expect(groups[0]?.cve).toBe("react: XSS");
		expect(groups[0]?.ref).toBeNull();
		expect(groups[0]?.occurrences[0]?.status).toBe("pending"); // Défaut

		expect(groups[1]?.worst).toBe("high");
		expect(groups[1]?.cve).toBe("CVE-123");
		expect(groups[1]?.ref).toBe("CVE-123");
		expect(groups[1]?.occurrences[0]?.status).toBe("ignored"); // Surchargé par l'annotation
		expect(groups[1]?.occurrences[0]?.fixedIn).toBe("2.0.0"); // Surchargé par l'annotation
	});

	test("intra-project deduplication keeps worst severity", () => {
		const p = createProject({
			name: "MyProj",
			path: "/path",
			type: "node",
			tool: "npm",
		});

		addRun({
			project_id: p.id,
			status: "vulnerable",
			total: 2,
			counts: {
				critical: 1,
				high: 1,
				moderate: 0,
				low: 0,
				info: 0,
				unknown: 0,
			},
			duration_ms: 100,
			vulnerabilities: [
				{
					package: "lodash",
					title: "Pollution",
					severity: "low",
					cve: "CVE-123",
					link: null,
					versionRange: null,
				},
				{
					package: "lodash",
					title: "Pollution",
					severity: "high",
					cve: "CVE-123",
					link: null,
					versionRange: null,
				},
			],
		});

		const groups = buildCveGroups();
		expect(groups.length).toBe(1); // Dédupliqué car même CVE sur même Projet
		expect(groups[0]?.worst).toBe("high");
		expect(groups[0]?.occurrences.length).toBe(1);
		expect(groups[0]?.occurrences[0]?.severity).toBe("high");
	});
});
