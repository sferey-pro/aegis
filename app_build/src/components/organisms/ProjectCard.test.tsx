import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Run } from "@/db/runs";
import type { ProjectListItem } from "@/routes/projects";
import { ProjectCard } from "./ProjectCard";

function run(over: Partial<Run> = {}): Run {
	return {
		id: 1,
		project_id: 7,
		status: "vulnerable",
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
		command: "npm audit --json",
		commit_sha: "abc",
		error: null,
		duration_ms: 10,
		ran_at: "2026-08-01 10:00:00",
		...over,
	};
}

function projet(over: Partial<ProjectListItem> = {}): ProjectListItem {
	return {
		id: 7,
		name: "Mon API",
		slug: "mon-api",
		path: "/srv/api",
		audit_path: null,
		type: "node",
		tool: "npm",
		tags: [],
		ignored: false,
		is_remote: false,
		created_at: "2026-07-01 09:00:00",
		git: { isRepo: false },
		lastRun: null,
		...over,
	};
}

function props(over: Partial<Parameters<typeof ProjectCard>[0]> = {}) {
	return {
		p: projet(),
		index: 0,
		auditState: {} as Record<number, string>,
		copiedSlug: null,
		setCopiedSlug: () => {},
		copyToClipboard: () => {},
		detectingId: null,
		handleDetectGit: () => {},
		handleFetch: () => {},
		handlePull: () => {},
		toggleIgnore: () => {},
		handleForceAudit: () => {},
		handleEdit: () => {},
		handleDelete: () => {},
		formatDate: (d: string) => d,
		...over,
	};
}

describe("ProjectCard", () => {
	test("affiche le nom du projet", () => {
		render(<ProjectCard {...props()} />);
		expect(screen.getByText("Mon API")).toBeInTheDocument();
	});

	test("sans run, aucune date d'audit n'est annoncée", () => {
		render(<ProjectCard {...props()} />);
		expect(screen.queryByText(/Dernier audit/)).not.toBeInTheDocument();
	});

	test("un projet sans run ne passe pas pour critique", () => {
		// Régression visée : `p.lastRun?.counts?.critical > 0` comparait
		// `undefined > 0`. Le `?? 0` rend l'intention explicite.
		const { container } = render(<ProjectCard {...props()} />);
		expect(container.firstElementChild?.className).not.toContain(
			"border-red-500/50",
		);
	});

	test("un run avec des critiques marque la carte", () => {
		const p = projet({
			lastRun: run({ counts: { ...run().counts, critical: 2 } }),
		});
		const { container } = render(<ProjectCard {...props({ p })} />);
		expect(container.firstElementChild?.className).toContain(
			"border-red-500/50",
		);
	});

	test("un run à zéro vulnérabilité est signalé comme sain", () => {
		const p = projet({ lastRun: run({ status: "ok" }) });
		render(<ProjectCard {...props({ p })} />);
		expect(screen.getByText(/Dernier audit/)).toBeInTheDocument();
	});

	test("un projet ignoré est grisé et propose Réactiver", () => {
		const p = projet({ ignored: true });
		const { container } = render(<ProjectCard {...props({ p })} />);
		expect(container.firstElementChild?.className).toContain("grayscale");
		expect(screen.getByText("Réactiver")).toBeInTheDocument();
	});

	test("un projet actif propose Ignorer le projet", () => {
		render(<ProjectCard {...props()} />);
		expect(screen.getByText("Ignorer le projet")).toBeInTheDocument();
	});

	test("un dépôt non-git est annoncé comme tel", () => {
		render(<ProjectCard {...props()} />);
		expect(screen.getByText("Dépôt Non-Git")).toBeInTheDocument();
	});

	test("un dépôt git en retard affiche le nombre de commits", () => {
		const p = projet({
			git: {
				isRepo: true,
				branch: "main",
				sha: "abc",
				upstream: "origin/main",
				ahead: 0,
				behind: 3,
				dirty: false,
			},
		});
		render(<ProjectCard {...props({ p })} />);
		expect(screen.getByText("3")).toBeInTheDocument();
		expect(screen.queryByText("Dépôt Non-Git")).not.toBeInTheDocument();
	});

	test("un audit en cours affiche son message par-dessus la carte", () => {
		render(
			<ProjectCard {...props({ auditState: { 7: "Analyse du lockfile…" } })} />,
		);
		expect(screen.getByText("Analyse du lockfile…")).toBeInTheDocument();
	});

	test("l'état d'un autre projet n'est pas affiché", () => {
		render(<ProjectCard {...props({ auditState: { 99: "Autre projet" } })} />);
		expect(screen.queryByText("Autre projet")).not.toBeInTheDocument();
	});

	test("la carte est activable au clavier", () => {
		// Régression visée : la carte n'était atteignable qu'à la souris.
		let vus = 0;
		const { container } = render(
			<ProjectCard {...props({ onViewTriage: () => vus++ })} />,
		);
		const carte = container.firstElementChild as HTMLElement;
		expect(carte).toHaveAttribute("role", "button");
		expect(carte).toHaveAttribute("tabindex", "0");

		fireEvent.keyDown(carte, { key: "Enter" });
		expect(vus).toBe(1);
		fireEvent.keyDown(carte, { key: " " });
		expect(vus).toBe(2);
	});

	test("une touche non activatrice ne déclenche rien", () => {
		let vus = 0;
		const { container } = render(
			<ProjectCard {...props({ onViewTriage: () => vus++ })} />,
		);
		fireEvent.keyDown(container.firstElementChild as HTMLElement, {
			key: "a",
		});
		expect(vus).toBe(0);
	});

	test("le clic sur la carte ouvre le triage du projet", () => {
		const vus: number[] = [];
		render(<ProjectCard {...props({ onViewTriage: (id) => vus.push(id) })} />);
		fireEvent.click(screen.getByText("Mon API"));
		expect(vus).toEqual([7]);
	});

	test("les tags du projet sont affichés", () => {
		const p = projet({ tags: ["prod", "api"] });
		render(<ProjectCard {...props({ p })} />);
		expect(screen.getByText("prod")).toBeInTheDocument();
		expect(screen.getByText("api")).toBeInTheDocument();
	});

	test("chaque tag affiché porte sa pastille de couleur", () => {
		// Un projet ne stocke que les noms de ses tags. Sans table de couleurs, la
		// carte rendait le nom nu, alors que le sélecteur du formulaire et les
		// filtres affichaient bien la pastille : deux rendus du même tag.
		const p = projet({ tags: ["prod", "api"] });
		const { container } = render(
			<ProjectCard
				{...props({ p, tagColors: { prod: "emerald", api: "sky" } })}
			/>,
		);
		expect(container.querySelectorAll(".rounded-full.w-2")).toHaveLength(2);
	});

	test("un tag sans couleur connue garde sa pastille", () => {
		const p = projet({ tags: ["orphelin"] });
		const { container } = render(<ProjectCard {...props({ p })} />);
		expect(container.querySelectorAll(".rounded-full.w-2")).toHaveLength(1);
	});

	test("Ignorer transmet le projet entier, pas seulement son id", () => {
		const vus: ProjectListItem[] = [];
		render(<ProjectCard {...props({ toggleIgnore: (p) => vus.push(p) })} />);
		fireEvent.click(screen.getByText("Ignorer le projet"));
		expect(vus[0]?.id).toBe(7);
		expect(vus[0]?.name).toBe("Mon API");
	});

	test("une carte occupée est voilée, et le dit", () => {
		// L'overlay n'avait aucun fond : le libellé se superposait au contenu et
		// rien ne distinguait une carte au travail d'une carte au repos —
		// précisément l'information utile pendant un lot.
		const { container } = render(
			<ProjectCard {...props({ auditState: { 7: "Opération Git..." } })} />,
		);
		expect(screen.getByText("Opération Git...")).toBeInTheDocument();

		const voile = container.querySelector(".absolute.inset-0");
		expect(voile?.className).toContain("bg-card/85");
	});

	test("une carte au repos n'a pas de voile", () => {
		const { container } = render(<ProjectCard {...props()} />);
		expect(container.querySelectorAll(".absolute.inset-0")).toHaveLength(0);
	});

	test("le libellé d'activité est annoncé aux lecteurs d'écran", () => {
		render(<ProjectCard {...props({ auditState: { 7: "Audit npm..." } })} />);
		expect(
			screen.getByText("Audit npm...").closest("[aria-live]"),
		).toBeTruthy();
	});
});
