import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { CveCard } from "./CveCard";
import type { PackageGroupCve, Toast } from "./triage-types";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function cve(over: Partial<PackageGroupCve> = {}): PackageGroupCve {
	return {
		cve: "CVE-2024-12345",
		ref: "CVE-2024-12345",
		title: "Prototype pollution",
		severity: "high",
		versionRange: null,
		fixedIn: null,
		link: null,
		status: "pending",
		note: "",
		cvssVector: null,
		ageInDays: 12,
		firstSeenAt: null,
		publishedAt: null,
		isBaseline: false,
		isGlobal: false,
		...over,
	};
}

interface Appels {
	statuts: [string, number, string][];
	confirmations: [string, number, string | undefined][];
	fins: number;
	toasts: (Toast | null)[];
}

function props(cveObj = cve(), appels?: Appels) {
	const a: Appels = appels ?? {
		statuts: [],
		confirmations: [],
		fins: 0,
		toasts: [],
	};
	return {
		cveObj,
		packageName: "lodash",
		projectId: 7,
		setToast: (t: Toast | null) => a.toasts.push(t),
		updateStatus: async (c: string, p: number, s: string) => {
			a.statuts.push([c, p, s]);
		},
		handleConfirmCve: (c: string, p: number, r?: string) => {
			a.confirmations.push([c, p, r]);
		},
		onActionComplete: () => {
			a.fins++;
		},
		appels: a,
	};
}

describe("CveCard", () => {
	afterEach(restoreFetch);

	test("affiche la référence et le titre de l'avis", () => {
		const { appels: _, ...p } = props();
		render(<CveCard {...p} />);
		expect(screen.getByText("CVE-2024-12345")).toBeInTheDocument();
		expect(screen.getByText("Prototype pollution")).toBeInTheDocument();
	});

	test("sans lien, aucun avis de sécurité n'est proposé", () => {
		const { appels: _, ...p } = props();
		render(<CveCard {...p} />);
		expect(screen.queryAllByText("Avis de sécurité")).toHaveLength(0);
	});

	test("avec un lien, l'avis pointe sur l'URL fournie", () => {
		const { appels: _, ...p } = props(
			cve({ link: "https://github.com/advisories/GHSA-x" }),
		);
		render(<CveCard {...p} />);
		expect(
			screen.getByRole("link", { name: /Avis de sécurité/ }),
		).toHaveAttribute("href", "https://github.com/advisories/GHSA-x");
	});

	test("sans version corrigée, aucun patch n'est annoncé", () => {
		const { appels: _, ...p } = props();
		render(<CveCard {...p} />);
		expect(screen.queryAllByText(/Patch :/)).toHaveLength(0);
	});

	test("avec version corrigée, le patch est affiché", () => {
		const { appels: _, ...p } = props(cve({ fixedIn: "4.17.21" }));
		render(<CveCard {...p} />);
		expect(screen.getByText(/Patch : 4\.17\.21/)).toBeInTheDocument();
	});

	test("« À traiter » remet le statut à pending puis clôt l'action", () => {
		const a: Appels = { statuts: [], confirmations: [], fins: 0, toasts: [] };
		const { appels: _, ...p } = props(cve({ status: "confirmed" }), a);
		render(<CveCard {...p} />);
		fireEvent.click(screen.getByRole("button", { name: "À traiter" }));
		expect(a.statuts).toEqual([["CVE-2024-12345", 7, "pending"]]);
		expect(a.fins).toBe(1);
	});

	test("« Faux positif » passe le statut à ignored", () => {
		const a: Appels = { statuts: [], confirmations: [], fins: 0, toasts: [] };
		const { appels: _, ...p } = props(cve(), a);
		render(<CveCard {...p} />);
		fireEvent.click(screen.getByRole("button", { name: /Faux positif/ }));
		expect(a.statuts).toEqual([["CVE-2024-12345", 7, "ignored"]]);
	});

	test("« Confirmé » passe par la modale de justification, pas par updateStatus", () => {
		// Confirmer exige une raison : le composant délègue, il ne décide pas.
		const a: Appels = { statuts: [], confirmations: [], fins: 0, toasts: [] };
		const { appels: _, ...p } = props(cve({ note: "déjà noté" }), a);
		render(<CveCard {...p} />);
		fireEvent.click(screen.getByRole("button", { name: /Confirmé/ }));
		expect(a.confirmations).toEqual([["CVE-2024-12345", 7, "déjà noté"]]);
		expect(a.statuts).toEqual([]);
	});

	test("la synchronisation d'avis envoie la CVE au serveur", async () => {
		mockFetch({
			"POST /api/advisories/sync": {
				body: { success: true, advisory: { fixes: {} } },
			},
		});
		const { appels: _, ...p } = props(
			cve({ link: "https://github.com/advisories/GHSA-x" }),
		);
		render(<CveCard {...p} />);

		const boutons = screen.getAllByRole("button");
		const sync =
			boutons.find((b) => b.className.includes("ghost")) ?? boutons[0];
		fireEvent.click(sync as HTMLElement);

		await waitFor(() => {
			expect(fetchCalls().filter((c) => c.method === "POST")).toHaveLength(1);
		});
		const appel = fetchCalls().find((c) => c.method === "POST");
		expect(appel?.url).toBe("/api/advisories/sync");
		expect(appel?.body).toMatchObject({ cve: "CVE-2024-12345" });
	});

	test("un échec de synchronisation remonte un toast d'erreur", async () => {
		mockFetch({
			"POST /api/advisories/sync": {
				body: { success: false, error: "rate limit" },
			},
		});
		const a: Appels = { statuts: [], confirmations: [], fins: 0, toasts: [] };
		const { appels: _, ...p } = props(
			cve({ link: "https://github.com/advisories/GHSA-x" }),
			a,
		);
		render(<CveCard {...p} />);

		const boutons = screen.getAllByRole("button");
		const sync =
			boutons.find((b) => b.className.includes("ghost")) ?? boutons[0];
		fireEvent.click(sync as HTMLElement);

		await waitFor(() => {
			expect(a.toasts.length).toBeGreaterThan(0);
		});
		expect(a.toasts[0]?.type).toBe("error");
	});

	test("une coupure réseau remonte aussi un toast", async () => {
		mockFetch({
			"POST /api/advisories/sync": { networkError: "ECONNREFUSED" },
		});
		const a: Appels = { statuts: [], confirmations: [], fins: 0, toasts: [] };
		const { appels: _, ...p } = props(
			cve({ link: "https://github.com/advisories/GHSA-x" }),
			a,
		);
		render(<CveCard {...p} />);

		const boutons = screen.getAllByRole("button");
		const sync =
			boutons.find((b) => b.className.includes("ghost")) ?? boutons[0];
		fireEvent.click(sync as HTMLElement);

		await waitFor(() => {
			expect(a.toasts.length).toBeGreaterThan(0);
		});
		expect(a.toasts[0]?.type).toBe("error");
	});
});

describe("CveCard — libellé d'ancienneté", () => {
	/**
	 * Les deux âges ne mesurent pas la même chose : une faille présente à
	 * l'installation est datée depuis la **publication de l'avis**, une découverte
	 * nette depuis notre **première détection**. Le libellé doit donc les
	 * distinguer — et dire « SLA » dans les deux cas, l'ancien « Dette » étant
	 * jugé peu clair.
	 */
	test("une découverte nette est étiquetée SLA", () => {
		render(<CveCard {...props(cve({ isBaseline: false, ageInDays: 12 }))} />);
		expect(screen.getByText(/SLA 12j/)).toBeInTheDocument();
		expect(screen.queryAllByText(/Dette/)).toHaveLength(0);
	});

	test("un existant à l'installation est étiqueté SLA hérité", () => {
		render(<CveCard {...props(cve({ isBaseline: true, ageInDays: 300 }))} />);
		expect(screen.getByText(/SLA hérité 300j/)).toBeInTheDocument();
		expect(screen.queryAllByText(/Dette/)).toHaveLength(0);
	});
});
