import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { BlankLayout } from "./BlankLayout";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function monte(route = "/debug") {
	return render(
		<MemoryRouter initialEntries={[route]}>
			<Routes>
				<Route element={<BlankLayout />}>
					<Route path="/debug" element={<p>contenu debug</p>} />
					<Route path="/autre" element={<p>autre contenu</p>} />
				</Route>
			</Routes>
		</MemoryRouter>,
	);
}

describe("BlankLayout", () => {
	test("rend la route enfant via l'Outlet", () => {
		monte();
		expect(screen.getByText("contenu debug")).toBeInTheDocument();
	});

	test("n'ajoute aucun chrome autour du contenu", () => {
		// C'est sa raison d'être : la page /debug s'affiche sans en-tête ni
		// pied de page, contrairement à MainLayout.
		monte();
		expect(screen.queryAllByRole("banner")).toHaveLength(0);
		expect(screen.queryAllByRole("contentinfo")).toHaveLength(0);
		expect(screen.queryAllByText("AEGIS LIVE CONSOLE")).toHaveLength(0);
	});

	test("change de contenu avec la route", () => {
		monte("/autre");
		expect(screen.getByText("autre contenu")).toBeInTheDocument();
		expect(screen.queryAllByText("contenu debug")).toHaveLength(0);
	});
});
