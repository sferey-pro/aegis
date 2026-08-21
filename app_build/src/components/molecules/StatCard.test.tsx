import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Shield } from "lucide-react";

import { StatCard } from "./StatCard";

describe("StatCard", () => {
	test("affiche le titre et la valeur", () => {
		render(<StatCard title="Projets surveillés" value={12} icon={Shield} />);
		expect(screen.getByText("Projets surveillés")).toBeInTheDocument();
		expect(screen.getByText("12")).toBeInTheDocument();
	});

	test("accepte un nœud React comme valeur", () => {
		render(<StatCard title="Note" value={<em>A+</em>} icon={Shield} />);
		expect(screen.getByText("A+").tagName).toBe("EM");
	});

	test("affiche le sous-titre seulement s'il est fourni", () => {
		const { unmount } = render(
			<StatCard title="CVE" value={3} icon={Shield} subtitle="sur 4 projets" />,
		);
		expect(screen.getByText("sur 4 projets")).toBeInTheDocument();
		unmount();

		render(<StatCard title="CVE" value={3} icon={Shield} />);
		expect(screen.queryByText("sur 4 projets")).not.toBeInTheDocument();
	});

	test("en chargement, la valeur est remplacée par un indicateur", () => {
		// La tuile ne doit jamais afficher un chiffre issu d'un chargement en cours :
		// un « 0 » trompeur est le pire rendu pour un outil de sécurité.
		render(<StatCard title="Projets" value={12} icon={Shield} loading />);
		expect(screen.queryByText("12")).not.toBeInTheDocument();
		expect(screen.getByText("...")).toBeInTheDocument();
	});

	test("l'icône fournie est rendue", () => {
		const { container } = render(
			<StatCard title="x" value={1} icon={Shield} />,
		);
		expect(container.querySelector("svg")).not.toBeNull();
	});
});
