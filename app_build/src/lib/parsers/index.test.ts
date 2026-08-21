import { describe, expect, test } from "bun:test";

import { parseAuditOutput } from "./index";

describe("parseAuditOutput", () => {
	test("dispatche vers le parseur de chaque outil", () => {
		expect(parseAuditOutput("npm", "{}").total).toBe(0);
		expect(parseAuditOutput("composer", "{}").total).toBe(0);
		expect(parseAuditOutput("bun", "{}").total).toBe(0);
		// yarn ne lève jamais : NDJSON tolérant au bruit.
		expect(parseAuditOutput("yarn", "").total).toBe(0);
	});

	test("un outil non implémenté lève explicitement", () => {
		expect(() => parseAuditOutput("pnpm" as never, "{}")).toThrow(
			/Parseur non implémenté/,
		);
	});

	test("le dispatch respecte les spécificités de chaque outil", () => {
		// composer force `abandoned` en info : c'est bien le parseur composer qui
		// a été appelé, pas un autre.
		const r = parseAuditOutput(
			"composer",
			JSON.stringify({ abandoned: { "old/pkg": "new/pkg" } }),
		);
		expect(r.vulnerabilities[0]?.abandoned).toBe(true);
	});
});
