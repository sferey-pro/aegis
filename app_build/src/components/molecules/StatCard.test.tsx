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

	test("affiche le sous-titre quand il est fourni", () => {
		render(
			<StatCard
				title="CVE critiques"
				value={3}
				icon={Shield}
				subtitle="sur 4 projets"
			/>,
		);
		expect(screen.getByText("sur 4 projets")).toBeInTheDocument();
	});

	test("masque la valeur pendant le chargement", () => {
		render(<StatCard title="Projets" value={12} icon={Shield} loading />);
		expect(screen.queryByText("12")).not.toBeInTheDocument();
	});
});
