import { afterEach, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { mockFetch, restoreFetch } from "@/test/http";
import { Debug } from "./Debug";

/**
 * La page /debug est la vitrine du design system. Son intérêt en test n'est pas
 * l'apparence, mais qu'elle **monte réellement chaque composant** : c'est la
 * seule page qui instancie les molécules, restées inutilisées ailleurs dans
 * l'application (défaut UX12). Si un composant casse, cette page le révèle.
 *
 * Elle exige un routeur : l'un de ses composants de vitrine appelle
 * `useNavigate`.
 *
 * ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`.
 */

function monte() {
	return render(
		<MemoryRouter initialEntries={["/debug"]}>
			<Debug />
		</MemoryRouter>,
	);
}

describe("Debug", () => {
	afterEach(restoreFetch);

	test("rend la page sans erreur", () => {
		mockFetch({});
		monte();
		expect(screen.getByText("Design System")).toBeInTheDocument();
	});

	test("expose toutes les sections du design system", () => {
		mockFetch({});
		monte();
		for (const titre of [
			"Typographie & Couleurs",
			"Boutons (Buttons)",
			"Formulaires (Inputs, Checkbox, Switch)",
			"Sélection (Select)",
			"Feedback & Tooltips",
			"Conteneurs (Tabs & Cards)",
			"Molécules (Composants Composites)",
			"Modales (Dialog)",
			"Tableau (Table)",
			"Badges",
		]) {
			expect(screen.getByText(titre)).toBeInTheDocument();
		}
	});

	test("monte les molécules, seule page à le faire", () => {
		// StatCard, ActionBadge, LabelInput et FilterDropdown ne sont instanciées
		// nulle part ailleurs : les pages réelles réimplémentent leur markup
		// (défaut UX12). Cette page est donc leur unique point de montage.
		mockFetch({});
		monte();
		// StatCard rend un titre ; LabelInput un champ étiqueté ; FilterDropdown
		// un combobox ; ActionBadge un libellé avec pastille.
		expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
		expect(screen.getAllByRole("button").length).toBeGreaterThan(5);
	});

	test("les atomes interactifs sont présents et accessibles", () => {
		mockFetch({});
		monte();
		expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
		expect(screen.getAllByRole("switch").length).toBeGreaterThan(0);
		expect(screen.getAllByRole("progressbar").length).toBeGreaterThan(0);
		expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
	});

	test("la fixture de CveCard utilise une sévérité valide", () => {
		// Régression visée : la vitrine passait `severity: "HIGH"` en majuscules,
		// alors que `normSeverity` ne produit que des minuscules. Elle documentait
		// donc un état que l'application ne produit jamais.
		mockFetch({});
		monte();
		expect(screen.queryAllByText("HIGH")).toHaveLength(0);
		expect(screen.getByText("CVE-2024-12345")).toBeInTheDocument();
	});

	test("la page ne déclenche aucune requête au montage", () => {
		// Toutes ses données sont des fixtures locales : une requête ici signifierait
		// qu'un composant de vitrine appelle le réseau sans y être invité.
		const mock = mockFetch({});
		monte();
		expect(mock).not.toHaveBeenCalled();
	});
});
