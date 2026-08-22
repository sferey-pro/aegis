import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { Header } from "./Header";

/**
 * `Header` utilise `Link`, `useLocation` et `useNavigate` : il doit être monté
 * dans un routeur. `MemoryRouter` évite toute dépendance à l'URL réelle.
 *
 * ⚠️ Assertions négatives : préférer `toHaveLength(0)` sur un `queryAll` plutôt
 * que `not.toBeInTheDocument()`, qui sérialise l'élément happy-dom en cas
 * d'échec (mesuré ailleurs : 143 Mo de sortie).
 */
function monte(over: Partial<Parameters<typeof Header>[0]> = {}, route = "/") {
	const props = {
		handleRunAudit: () => {},
		auditing: false,
		...over,
	};
	return render(
		<MemoryRouter initialEntries={[route]}>
			<Routes>
				<Route path="*" element={<Header {...props} />} />
			</Routes>
			<Routes>
				<Route path="*" element={<TemoinRoute />} />
			</Routes>
		</MemoryRouter>,
	);
}

/** Expose la route courante, pour vérifier les navigations. */
function TemoinRoute() {
	const { pathname } = useLocation();
	return <span data-testid="route">{pathname}</span>;
}

describe("Header", () => {
	test("le logo renvoie à l'accueil via un lien", () => {
		monte();
		const lien = screen.getByRole("link", {
			name: /Retour au tableau de bord/,
		});
		expect(lien).toHaveAttribute("href", "/");
	});

	test("expose les entrées de navigation principales", () => {
		monte();
		for (const libelle of ["Projets", "Rapports", "Prompts"]) {
			expect(screen.getByText(libelle)).toBeInTheDocument();
		}
	});

	test("chaque entrée navigue vers sa route", () => {
		const cibles: [string, string][] = [
			["Projets", "/projects"],
			["Rapports", "/reports"],
			["Prompts", "/prompts"],
		];
		for (const [libelle, chemin] of cibles) {
			const { unmount } = monte();
			fireEvent.click(screen.getByText(libelle));
			expect(screen.getByTestId("route")).toHaveTextContent(chemin);
			unmount();
		}
	});

	test("le bouton d'audit global déclenche le callback", () => {
		let appels = 0;
		monte({ handleRunAudit: () => appels++ });
		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);
		expect(appels).toBe(1);
	});

	test("pendant un audit, le libellé change et le bouton est désactivé", () => {
		monte({ auditing: true });
		const bouton = screen.getByRole("button", { name: /Audit en cours/ });
		expect(bouton).toBeDisabled();
		expect(screen.queryAllByText(/Lancer l'audit global/)).toHaveLength(0);
	});

	test("pendant un audit, le callback n'est pas déclenché", () => {
		let appels = 0;
		monte({ auditing: true, handleRunAudit: () => appels++ });
		fireEvent.click(screen.getByRole("button", { name: /Audit en cours/ }));
		expect(appels).toBe(0);
	});

	test("sans CVE en attente, aucun badge n'est affiché", () => {
		monte({ pendingCves: 0 });
		expect(screen.queryAllByText("0")).toHaveLength(0);
	});

	test("pendingCves absent n'affiche pas de badge", () => {
		monte();
		// Le badge n'existe que si la valeur est définie ET strictement positive.
		expect(screen.queryAllByText("undefined")).toHaveLength(0);
	});

	test("des CVE en attente affichent leur nombre", () => {
		monte({ pendingCves: 12 });
		expect(screen.getByText("12")).toBeInTheDocument();
	});

	test("la barre a un fond opaque", () => {
		// L'en-tête est `fixed` : sans fond, le contenu de la page défile en
		// transparence derrière le menu et le rend illisible. Un fond semi-opaque
		// ne suffit pas non plus — c'est ce que l'on voyait.
		const { container } = monte();
		const barre = container.querySelector("header") as HTMLElement;
		expect(barre.className).toContain("bg-background");
		expect(barre.className).not.toMatch(/bg-background\//);
	});
});
