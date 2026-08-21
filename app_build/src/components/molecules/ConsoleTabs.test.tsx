import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import type { LogEntry } from "../organisms/console-types";
import { ConsoleTabs } from "./ConsoleTabs";

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

describe("ConsoleTabs", () => {
	test("rend un onglet par entrée", () => {
		render(
			<ConsoleTabs
				tabs={["Global", "Mon API"]}
				activeTab="Global"
				setActiveTab={() => {}}
				logs={[]}
				globalRunningCount={0}
			/>,
		);
		expect(screen.getAllByRole("button")).toHaveLength(2);
		expect(screen.getByText("Mon API")).toBeInTheDocument();
	});

	test("cliquer un onglet remonte son nom", () => {
		const choisis: string[] = [];
		render(
			<ConsoleTabs
				tabs={["Global", "Mon API"]}
				activeTab="Global"
				setActiveTab={(t) => choisis.push(t)}
				logs={[]}
				globalRunningCount={0}
			/>,
		);
		fireEvent.click(screen.getByText("Mon API"));
		expect(choisis).toEqual(["Mon API"]);
	});

	test("l'onglet actif est mis en évidence", () => {
		render(
			<ConsoleTabs
				tabs={["Global", "Mon API"]}
				activeTab="Mon API"
				setActiveTab={() => {}}
				logs={[]}
				globalRunningCount={0}
			/>,
		);
		const actif = screen.getByText("Mon API").closest("button");
		const inactif = screen.getByText("Global").closest("button");
		expect(actif?.className).toContain("border-primary");
		expect(inactif?.className).not.toContain("border-primary");
	});

	test("l'onglet Global signale une commande en cours", () => {
		const { container } = render(
			<ConsoleTabs
				tabs={["Global"]}
				activeTab="Global"
				setActiveTab={() => {}}
				logs={[]}
				globalRunningCount={2}
			/>,
		);
		expect(container.querySelector(".animate-ping")).not.toBeNull();
	});

	test("un onglet projet compte ses propres commandes en cours", () => {
		const logs = [
			log({ id: 1, project: "Mon API", status: "running" }),
			log({ id: 2, project: "Autre", status: "running" }),
			log({ id: 3, project: "Mon API", status: "success" }),
		];
		const { container } = render(
			<ConsoleTabs
				tabs={["Mon API"]}
				activeTab="Mon API"
				setActiveTab={() => {}}
				logs={logs}
				globalRunningCount={0}
			/>,
		);
		// Un seul log « running » appartient à Mon API : l'indicateur est présent.
		expect(container.querySelector(".animate-ping")).not.toBeNull();
	});

	test("aucun indicateur si le projet n'a rien en cours", () => {
		const { container } = render(
			<ConsoleTabs
				tabs={["Mon API"]}
				activeTab="Mon API"
				setActiveTab={() => {}}
				logs={[log({ project: "Mon API", status: "success" })]}
				globalRunningCount={0}
			/>,
		);
		expect(container.querySelector(".animate-ping")).toBeNull();
	});

	test("les boutons sont de type button", () => {
		render(
			<ConsoleTabs
				tabs={["Global"]}
				activeTab="Global"
				setActiveTab={() => {}}
				logs={[]}
				globalRunningCount={0}
			/>,
		);
		expect(screen.getByRole("button")).toHaveAttribute("type", "button");
	});
});
