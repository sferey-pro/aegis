import type { ProjectTool } from "../../db/projects";
import { parseBun } from "./bun";
import { parseComposer } from "./composer";
import { parseNpm } from "./npm";
import type { ParseResult } from "./types";
import { parseYarn } from "./yarn";

export function parseAuditOutput(
	tool: ProjectTool,
	output: string,
): ParseResult {
	switch (tool) {
		case "npm":
			return parseNpm(output);
		case "yarn":
			return parseYarn(output);
		case "bun":
			return parseBun(output);
		case "composer":
			return parseComposer(output);
		default:
			throw new Error(`Parseur non implémenté pour l'outil: ${tool}`);
	}
}

export * from "./types";
