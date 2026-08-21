import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

import type { LogEntry } from "../organisms/console-types";
import { ConsoleLogItem } from "./ConsoleLogItem";

function log(over: Partial<LogEntry> = {}): LogEntry {
	return {
		id: 1,
		cmd: "npm audit --json",
		cwd: "/srv/api",
		label: "audit",
		status: "success",
		startTime: 0,
		...over,
	};
}

describe("ConsoleLogItem", () => {
	test("affiche la commande, le label en majuscules et le dossier", () => {
		render(<ConsoleLogItem log={log()} debugMode={false} />);
		expect(screen.getByText("$ npm audit --json")).toBeInTheDocument();
		expect(screen.getByText("AUDIT")).toBeInTheDocument();
		expect(screen.getByText("/srv/api")).toBeInTheDocument();
	});

	test("en cours, l'indicateur tourne", () => {
		const { container } = render(
			<ConsoleLogItem log={log({ status: "running" })} debugMode={false} />,
		);
		expect(container.querySelector(".animate-spin")).not.toBeNull();
	});

	test("en cours, ni durée ni code de sortie ne sont affichés", () => {
		render(
			<ConsoleLogItem
				log={log({ status: "running", ms: 120, exitCode: 0 })}
				debugMode={false}
			/>,
		);
		expect(screen.queryByText("(120ms)")).not.toBeInTheDocument();
		expect(screen.queryByText(/code /)).not.toBeInTheDocument();
	});

	test("terminé, la durée est affichée", () => {
		render(<ConsoleLogItem log={log({ ms: 120 })} debugMode={false} />);
		expect(screen.getByText("(120ms)")).toBeInTheDocument();
	});

	test("une durée de 0 ms est affichée, pas masquée", () => {
		// `ms !== undefined` et non `ms &&` : un audit dédupliqué dure 0 ms.
		render(<ConsoleLogItem log={log({ ms: 0 })} debugMode={false} />);
		expect(screen.getByText("(0ms)")).toBeInTheDocument();
	});

	test("en erreur, le code de sortie et le message sont affichés", () => {
		render(
			<ConsoleLogItem
				log={log({ status: "error", exitCode: 1, errorText: "ENOENT" })}
				debugMode={false}
			/>,
		);
		expect(screen.getByText("code 1")).toBeInTheDocument();
		expect(screen.getByText("ENOENT")).toBeInTheDocument();
	});

	test("un code de sortie 0 sur une erreur reste affiché", () => {
		render(
			<ConsoleLogItem
				log={log({ status: "error", exitCode: 0 })}
				debugMode={false}
			/>,
		);
		expect(screen.getByText("code 0")).toBeInTheDocument();
	});

	test("le badge projet n'apparaît que si demandé", () => {
		const l = log({ project: "Mon API" });
		const { unmount } = render(<ConsoleLogItem log={l} debugMode={false} />);
		expect(screen.queryByText("Mon API")).not.toBeInTheDocument();
		unmount();

		render(<ConsoleLogItem log={l} debugMode={false} showProjectBadge />);
		expect(screen.getByText("Mon API")).toBeInTheDocument();
	});

	test("mode debug : stdout et stderr sont exposés", () => {
		render(
			<ConsoleLogItem
				log={log({ outText: "sortie", errorText: "erreur" })}
				debugMode
			/>,
		);
		expect(screen.getByText("STDOUT :")).toBeInTheDocument();
		expect(screen.getByText("sortie")).toBeInTheDocument();
		expect(screen.getByText("STDERR :")).toBeInTheDocument();
	});

	test("mode debug : rien n'est exposé tant que la commande tourne", () => {
		render(
			<ConsoleLogItem
				log={log({ status: "running", outText: "partiel" })}
				debugMode
			/>,
		);
		expect(screen.queryByText("STDOUT :")).not.toBeInTheDocument();
	});

	test("hors mode debug, le bloc d'erreur remplace stderr brut", () => {
		render(
			<ConsoleLogItem
				log={log({ status: "error", errorText: "boom" })}
				debugMode={false}
			/>,
		);
		expect(screen.getByText("boom")).toBeInTheDocument();
		expect(screen.queryByText("STDERR :")).not.toBeInTheDocument();
	});
});
