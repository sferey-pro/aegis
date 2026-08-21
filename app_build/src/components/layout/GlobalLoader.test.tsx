import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

import { GlobalLoader } from "./GlobalLoader";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function props(over: Partial<Parameters<typeof GlobalLoader>[0]> = {}) {
	return {
		loading: false,
		auditing: false,
		loadingMessage: "Connexion à la base de données...",
		auditProgress: null,
		auditMessageIndex: 0,
		...over,
	};
}

describe("GlobalLoader", () => {
	test("au repos, il ne rend rien", () => {
		const { container } = render(<GlobalLoader {...props()} />);
		expect(container.firstElementChild).toBeNull();
	});

	test("en chargement, il affiche le message fourni", () => {
		render(<GlobalLoader {...props({ loading: true })} />);
		expect(
			screen.getByText("Connexion à la base de données..."),
		).toBeInTheDocument();
	});

	test("en audit sans progression, il annonce le démarrage", () => {
		render(<GlobalLoader {...props({ auditing: true })} />);
		expect(
			screen.getByText("Démarrage de l'audit global..."),
		).toBeInTheDocument();
	});

	test("en audit avec progression, il affiche le projet et l'avancement", () => {
		render(
			<GlobalLoader
				{...props({
					auditing: true,
					auditProgress: { current: 3, total: 12, name: "Mon API" },
				})}
			/>,
		);
		expect(screen.getByText(/Mon API/)).toBeInTheDocument();
		expect(screen.getByText(/3\/12/)).toBeInTheDocument();
	});

	test("le message d'audit tourne selon l'index", () => {
		const messages = [
			"Scan des dépendances",
			"Recherche GHSA",
			"Calcul de la criticité",
			"Génération des patchs",
		];
		for (const [i, attendu] of messages.entries()) {
			const { unmount } = render(
				<GlobalLoader
					{...props({
						auditing: true,
						auditMessageIndex: i,
						auditProgress: { current: 1, total: 1, name: "P" },
					})}
				/>,
			);
			expect(screen.getByText(new RegExp(attendu))).toBeInTheDocument();
			unmount();
		}
	});

	test("le chargement a priorité sur l'audit", () => {
		// Les deux drapeaux peuvent être vrais au premier rendu : le message de
		// chargement doit gagner, sinon l'écran annoncerait un audit inexistant.
		render(
			<GlobalLoader
				{...props({
					loading: true,
					auditing: true,
					auditProgress: { current: 1, total: 5, name: "Mon API" },
				})}
			/>,
		);
		expect(
			screen.getByText("Connexion à la base de données..."),
		).toBeInTheDocument();
		expect(screen.queryAllByText(/Mon API/)).toHaveLength(0);
	});

	test("il couvre l'écran et bloque les interactions dessous", () => {
		const { container } = render(
			<GlobalLoader {...props({ loading: true })} />,
		);
		const overlay = container.firstElementChild as HTMLElement;
		expect(overlay.className).toContain("fixed");
		expect(overlay.className).toContain("inset-0");
	});
});
