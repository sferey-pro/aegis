import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { closeDb, getDb } from "./index";

describe("Database Initialization", () => {
	const TEST_DB = "test_audit.sqlite";

	beforeEach(() => {
		process.env.DB_PATH = TEST_DB;
	});

	afterEach(() => {
		closeDb();
		if (existsSync(TEST_DB)) {
			unlinkSync(TEST_DB);
		}
	});

	test("Initializes database with required tables", () => {
		const db = getDb();

		// Check if tables exist
		const query = db.query(
			`SELECT name FROM sqlite_master WHERE type='table';`,
		);
		const tables = query.all() as { name: string }[];
		const tableNames = tables.map((t) => t.name);

		expect(tableNames).toContain("projects");
		expect(tableNames).toContain("runs");
		expect(tableNames).toContain("annotations");
		expect(tableNames).toContain("tickets");
		expect(tableNames).toContain("tags");
		expect(tableNames).toContain("prompts");
		expect(tableNames).toContain("settings");
		expect(tableNames).toContain("advisory_cache");
	});

	test("Foreign keys are enabled", () => {
		const db = getDb();
		const query = db.query(`PRAGMA foreign_keys;`);
		const result = query.get() as { foreign_keys: number };
		expect(result.foreign_keys).toBe(1);
	});

	test("Lazy loading works (does not create file on import)", () => {
		// Before calling getDb, the file should not exist
		expect(existsSync(TEST_DB)).toBe(false);

		// After calling getDb, the file should exist
		getDb();
		expect(existsSync(TEST_DB)).toBe(true);
	});
});
