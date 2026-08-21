import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { mockEventSource, restoreEventSource } from "@/test/sse";
import { MainLayout } from "./MainLayout";

/**
 * `MainLayout` monte `Console`, qui souscrit à `/api/console` dès son montage :
 * il faut donc le faux `EventSource`, sinon happy-dom lèverait sur un
 * `EventSource` inexistant.
 *
 * ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`.
 */

let sse: ReturnType<typeof mockEventSource>;

function monte(over: Partial<Parameters<typeof MainLayout>[0]> = {}) {
	const props = {
		handleRunAudit: async () => {},
		auditing: false,
		...over,
	};
	return render(
		<MemoryRouter initialEntries={["/"]}>
			<Routes>
				<Route element={<MainLayout {...props} />}>
					<Route path="/" element={<p>contenu de la page</p>} />
				</Route>
			</Routes>
		</MemoryRouter>,
	);
}

describe("MainLayout", () => {
	beforeEach(() => {
		sse = mockEventSource();
	});
	afterEach(restoreEventSource);

	test("rend la route enfant via l'Outlet", () => {
		monte();
		expect(screen.getByText("contenu de la page")).toBeInTheDocument();
	});

	test("fournit l'en-tête de navigation", () => {
		monte();
		expect(screen.getByText("Projets")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		).toBeInTheDocument();
	});

	test("fournit le pied de page", () => {
		monte();
		expect(screen.getByText("Aegis Security")).toBeInTheDocument();
	});

	test("monte la console live", () => {
		// La console est dans le gabarit, donc présente sur toutes les pages sauf
		// /debug — c'est ce qui la fait disparaître au passage sur BlankLayout.
		monte();
		expect(sse.instances).toHaveLength(1);
	});

	test("transmet handleRunAudit à l'en-tête", () => {
		let appels = 0;
		monte({
			handleRunAudit: async () => {
				appels++;
			},
		});
		fireEvent.click(
			screen.getByRole("button", { name: /Lancer l'audit global/ }),
		);
		expect(appels).toBe(1);
	});

	test("transmet l'état d'audit à l'en-tête", () => {
		monte({ auditing: true });
		expect(
			screen.getByRole("button", { name: /Audit en cours/ }),
		).toBeDisabled();
	});

	test("transmet le compteur de CVE en attente", () => {
		monte({ pendingCves: 7 });
		expect(screen.getByText("7")).toBeInTheDocument();
	});

	test("ferme le flux de la console au démontage", () => {
		const { unmount } = monte();
		const flux = sse.last();
		unmount();
		expect(flux.closed).toBe(true);
	});
});
