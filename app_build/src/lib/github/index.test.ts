import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { closeDb, getDb } from "../../db";
import {
	getCachedAdvisory,
	keyFrom,
	putCachedAdvisory,
	resolveFixedVersion,
} from "./index";

describe("Integration: GitHub Advisory", () => {
	const TEST_DB = "test_github.sqlite";

	beforeEach(() => {
		process.env.DB_PATH = TEST_DB;
		getDb();
	});

	afterEach(() => {
		closeDb();
		if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
	});

	test("keyFrom extraction priorities", () => {
		expect(
			keyFrom(
				"CVE-2023-1234",
				"https://github.com/advisories/ghsa-1234-abcd-5678",
			),
		).toEqual({ kind: "ghsa", id: "GHSA-1234-ABCD-5678" });
		expect(keyFrom("CVE-2023-1234", null)).toEqual({
			kind: "cve",
			id: "CVE-2023-1234",
		});
		expect(keyFrom(null, null)).toBeNull();
	});

	test("SQLite cache operations", () => {
		putCachedAdvisory("GHSA-TEST", "high", { "npm:lodash": "4.17.21" });
		const cached = getCachedAdvisory("GHSA-TEST");
		expect(cached?.severity).toBe("high");
		expect(cached?.fixes["npm:lodash"]).toBe("4.17.21");

		// Upsert
		putCachedAdvisory("GHSA-TEST", "critical", { "npm:lodash": "5.0.0" });
		const updated = getCachedAdvisory("GHSA-TEST");
		expect(updated?.severity).toBe("critical");
		expect(updated?.fixes["npm:lodash"]).toBe("5.0.0");
	});

	test("resolveFixedVersion returns unresolvable for empty keys", async () => {
		const res = await resolveFixedVersion({ tool: "npm", package: "abc" });
		expect(res.resolvable).toBe(false);
	});

	test("resolveFixedVersion uses cache if available", async () => {
		putCachedAdvisory("CVE-2024-12345", "critical", { "npm:axios": "1.6.0" });

		// We shouldn't hit the network here
		const res = await resolveFixedVersion({
			tool: "npm",
			package: "axios",
			cve: "CVE-2024-12345",
		});

		expect(res.resolvable).toBe(true);
		expect(res.rateLimited).toBe(false);
		expect(res.severity).toBe("critical");
		expect(res.fixedIn).toBe("1.6.0");
	});
});
