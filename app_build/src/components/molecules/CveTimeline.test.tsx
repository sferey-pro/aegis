import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

import { CveTimeline } from "./CveTimeline";

/** Même conversion que le composant, pour ne pas coder en dur une locale. */
const jour = (iso: string) => new Date(iso).toLocaleDateString();

describe("CveTimeline", () => {
	test("les deux dates sont nommées et affichées", () => {
		render(
			<CveTimeline
				publishedAt="2020-07-15T00:00:00Z"
				firstSeenAt="2026-08-01T09:00:00Z"
			/>,
		);

		// Chacune porte son émetteur : l'écran précédent en montrait une seule, en
		// infobulle, sans dire laquelle.
		expect(screen.getByText("GHSA")).toBeInTheDocument();
		expect(screen.getByText("Aegis")).toBeInTheDocument();
		expect(screen.getByText(jour("2020-07-15T00:00:00Z"))).toBeInTheDocument();
		expect(screen.getByText(jour("2026-08-01T09:00:00Z"))).toBeInTheDocument();
	});

	test("une date absente est explicite, pas remplacée par aujourd'hui", () => {
		render(<CveTimeline publishedAt={null} firstSeenAt={null} />);
		expect(screen.getAllByText("—")).toHaveLength(2);
	});

	test("une publication inconnue oriente vers l'enrichissement GHSA", () => {
		const { container } = render(<CveTimeline firstSeenAt="2026-08-01" />);
		const lignes = container.querySelectorAll("[title]");
		expect(lignes[0]?.getAttribute("title")).toContain(
			"Mettre à jour les avis GHSA",
		);
	});

	test("une date illisible ne s'affiche pas « Invalid Date »", () => {
		render(<CveTimeline publishedAt="pas-une-date" firstSeenAt="" />);
		expect(screen.getAllByText("—")).toHaveLength(2);
		expect(screen.queryAllByText(/Invalid/)).toHaveLength(0);
	});

	test("chaque ligne dit à quel SLA elle sert", () => {
		const { container } = render(
			<CveTimeline publishedAt="2020-07-15" firstSeenAt="2026-08-01" />,
		);
		const titres = [...container.querySelectorAll("[title]")].map((n) =>
			n.getAttribute("title"),
		);
		expect(titres[0]).toContain("SLA hérité");
		expect(titres[1]).toContain("découverte nette");
	});
});
