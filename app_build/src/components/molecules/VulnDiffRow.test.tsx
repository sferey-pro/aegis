import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "../ui/tooltip";
import { VulnDiffRow } from "./VulnDiffRow";

const LONG =
	"PHP code injection via `{% use %}` template inheritance when the loader resolves an attacker-controlled path";

function monte(over: Partial<Parameters<typeof VulnDiffRow>[0]> = {}) {
	return render(
		<TooltipProvider>
			<VulnDiffRow
				projectName="Demo"
				packageName="twig/twig"
				title={LONG}
				{...over}
			/>
		</TooltipProvider>,
	);
}

describe("VulnDiffRow", () => {
	test("la description est entière, jamais tronquée", () => {
		// `truncate max-w-[300px]` réduisait la seule description de la faille à
		// « PHP code injection via `{% use %}` templat… ». Un rapport se lit.
		monte();
		const texte = screen.getByText(LONG);
		expect(texte).toBeInTheDocument();
		expect(texte.className).not.toContain("truncate");
		expect(texte.className).toContain("break-words");
	});

	test("le bloc de gauche peut rétrécir", () => {
		// Sans `min-w-0`, un conteneur flex refuse de descendre sous la largeur de
		// son contenu : le bloc poussait le badge de sévérité hors de la modale.
		const { container } = monte();
		expect(container.querySelector(".min-w-0")).not.toBeNull();
	});

	test("la sévérité est affichée avec sa couleur", () => {
		monte({ severity: "critical" });
		const badge = screen.getByText("Critique");
		expect(badge.className).toMatch(/\btext-/);
		expect(badge.className).toMatch(/\bborder-/);
	});

	test("les six niveaux sont affichés, pas seulement trois", () => {
		// Les trois niveaux bas n'étaient rendus par aucune branche : une faille
		// basse apparaissait sans indicateur de gravité.
		for (const [severite, libelle] of [
			["critical", "Critique"],
			["high", "Haut"],
			["moderate", "Modéré"],
			["low", "Bas"],
			["info", "Info"],
			["unknown", "Inconnu"],
		]) {
			const { unmount } = monte({ severity: severite });
			expect(screen.getByText(libelle as string)).toBeInTheDocument();
			unmount();
		}
	});

	test("une sévérité inconnue du catalogue est affichée telle quelle", () => {
		monte({ severity: "bizarre" });
		expect(screen.getByText("bizarre")).toBeInTheDocument();
	});

	test("sans sévérité, aucun badge n'est rendu", () => {
		// La section « failles corrigées » n'en affiche pas.
		monte();
		expect(screen.queryAllByText("Inconnu")).toHaveLength(0);
	});

	test("la CVE et le projet sont affichés", () => {
		monte({ cve: "CVE-2024-0001" });
		expect(screen.getByText("CVE-2024-0001")).toBeInTheDocument();
		expect(screen.getByText("Demo")).toBeInTheDocument();
	});

	test("le vecteur CVSS n'apparaît que s'il existe", () => {
		monte();
		expect(screen.queryAllByText(/CVSS/)).toHaveLength(0);

		monte({ cvssVector: "CVSS:3.1/AV:N/AC:L" });
		expect(screen.getByText("CVSS:3.1/AV:N/AC:L")).toBeInTheDocument();
	});

	test("les identifiants longs se coupent au lieu de déborder", () => {
		monte({
			packageName: "un/paquet/au/nom/interminable",
			cve: "GHSA-".repeat(8),
		});
		expect(
			screen.getByText("un/paquet/au/nom/interminable").className,
		).toContain("break-all");
	});
});
