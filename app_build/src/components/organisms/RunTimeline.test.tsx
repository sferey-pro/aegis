import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import type { ProjectHistoryItem } from "@/routes/projects";
import { RunTimeline, statusLabel } from "./RunTimeline";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function run(over: Partial<ProjectHistoryItem> = {}): ProjectHistoryItem {
	return {
		id: 1,
		project_id: 7,
		status: "vulnerable",
		total: 2,
		counts: { critical: 1, high: 1, moderate: 0, low: 0, info: 0, unknown: 0 },
		vulnerabilities: [],
		command: "npm audit --json",
		commit_sha: "abc1234def",
		error: null,
		duration_ms: 1200,
		ran_at: "2026-08-01 10:00:00",
		newCves: [],
		...over,
	};
}

describe("RunTimeline", () => {
	test("sans run, l'absence est dite", () => {
		render(<RunTimeline runs={[]} selectedId={null} onSelect={() => {}} />);
		expect(
			screen.getByText("Aucun audit enregistré pour ce projet."),
		).toBeInTheDocument();
	});

	test("chaque run est un bouton, le sélectionné est pressé", () => {
		const runs = [
			run({ id: 2 }),
			run({ id: 1, ran_at: "2026-07-01 10:00:00" }),
		];
		render(<RunTimeline runs={runs} selectedId={2} onSelect={() => {}} />);
		const boutons = screen.getAllByRole("button");
		expect(boutons).toHaveLength(2);
		expect(boutons[0]).toHaveAttribute("aria-pressed", "true");
		expect(boutons[1]).toHaveAttribute("aria-pressed", "false");
	});

	test("le clic sélectionne le run", () => {
		const choisis: number[] = [];
		render(
			<RunTimeline
				runs={[run({ id: 2 }), run({ id: 1 })]}
				selectedId={2}
				onSelect={(id) => choisis.push(id)}
			/>,
		);
		const [, second] = screen.getAllByRole("button");
		if (!second) throw new Error("second bouton absent");
		fireEvent.click(second);
		expect(choisis).toEqual([1]);
	});

	test("les nouveautés et les erreurs sont annoncées", () => {
		render(
			<RunTimeline
				runs={[
					run({
						id: 3,
						newCves: [
							{ ref: "CVE-1", package: "a", severity: "high" },
							{ ref: "CVE-2", package: "b", severity: "low" },
						],
					}),
					run({ id: 2, status: "error", total: 0, error: "ENOENT" }),
					run({ id: 1, status: "ok", total: 0 }),
				]}
				selectedId={3}
				onSelect={() => {}}
			/>,
		);
		expect(screen.getByText("+2 nouvelles")).toBeInTheDocument();
		expect(screen.getByText("Erreur")).toBeInTheDocument();
		expect(screen.getByText("Sain")).toBeInTheDocument();
		expect(screen.getByText("2 vulnérabilités")).toBeInTheDocument();
	});

	test("statusLabel accorde le pluriel", () => {
		expect(statusLabel(run({ total: 1 }))).toBe("1 vulnérabilité");
		expect(statusLabel(run({ total: 0 }))).toBe("Sain");
		expect(statusLabel(run({ status: "error" }))).toBe("Erreur");
	});
});
