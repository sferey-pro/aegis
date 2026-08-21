import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { Line, LineChart } from "recharts";
import { type ChartConfig, ChartContainer, ChartStyle } from "./chart";

const config: ChartConfig = {
	critical: { label: "Critique", color: "#ef4444" },
	high: { label: "Élevé", color: "#f97316" },
};

describe("ChartStyle", () => {
	test("émet les variables CSS de la configuration", () => {
		const { container } = render(<ChartStyle id="chart-x" config={config} />);
		const style = container.querySelector("style");
		expect(style).not.toBeNull();
		expect(style?.textContent).toContain("--color-critical: #ef4444");
		expect(style?.textContent).toContain("--color-high: #f97316");
	});

	test("cible le graphique par son data-chart", () => {
		const { container } = render(<ChartStyle id="chart-x" config={config} />);
		expect(container.querySelector("style")?.textContent).toContain(
			"[data-chart=chart-x]",
		);
	});

	test("n'émet rien si aucune couleur n'est configurée", () => {
		const { container } = render(
			<ChartStyle id="chart-y" config={{ a: { label: "A" } }} />,
		);
		expect(container.querySelector("style")).toBeNull();
	});

	test("le contenu est rendu en enfant texte, pas via innerHTML", () => {
		// Régression visée : l'implémentation utilisait dangerouslySetInnerHTML.
		const { container } = render(<ChartStyle id="chart-z" config={config} />);
		const style = container.querySelector("style");
		expect(style?.childNodes.length).toBeGreaterThan(0);
		expect(style?.firstChild?.nodeType).toBe(3); // Node.TEXT_NODE
	});
});

describe("ChartContainer", () => {
	test("applique un data-chart et injecte le style", () => {
		const { container } = render(
			<ChartContainer config={config}>
				<LineChart data={[{ x: 1, critical: 2 }]}>
					<Line dataKey="critical" />
				</LineChart>
			</ChartContainer>,
		);
		const root = container.querySelector('[data-slot="chart"]');
		expect(root).not.toBeNull();
		expect(root?.getAttribute("data-chart")).toMatch(/^chart-/);
		expect(container.querySelector("style")).not.toBeNull();
	});
});
