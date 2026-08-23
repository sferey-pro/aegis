import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { TicketModal } from "./TicketModal";
import type {
	PackageGroup,
	PackageGroupCve,
	TicketModalState,
	Toast,
} from "./triage-types";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function cve(ref: string): PackageGroupCve {
	return {
		cve: ref,
		ref,
		title: "t",
		severity: "high",
		versionRange: null,
		fixedIn: null,
		link: null,
		status: "pending",
		note: "",
		cvssVector: null,
		ageInDays: 1,
		firstSeenAt: null,
		publishedAt: null,
		isBaseline: false,
	};
}

function groupe(over: Partial<PackageGroup> = {}): PackageGroup {
	return {
		key: "7::lodash",
		projectId: 7,
		projectName: "Mon API",
		package: "lodash",
		tool: "npm",
		cves: [cve("CVE-1"), cve("CVE-2")],
		worstSeverity: "high",
		pendingCount: 2,
		hasConfirmed: false,
		maxBaselineAgeInDays: 0,
		maxSlaAgeInDays: 1,
		hasBaseline: false,
		hasNetDiscovery: true,
		targetPatch: null,
		publishedAt: null,
		firstSeenAt: null,
		...over,
	};
}

function etat(over: Partial<TicketModalState> = {}): TicketModalState {
	return {
		isOpen: true,
		md: "# [Mon API] lodash",
		copied: false,
		group: groupe(),
		...over,
	};
}

interface Appels {
	etats: TicketModalState[];
	toasts: (Toast | null)[];
	copies: number;
	rechargements: number;
}

function props(state = etat(), a?: Appels) {
	const appels: Appels = a ?? {
		etats: [],
		toasts: [],
		copies: 0,
		rechargements: 0,
	};
	return {
		props: {
			ticketModal: state,
			setTicketModal: (v: TicketModalState) => appels.etats.push(v),
			copyToClipboard: () => {
				appels.copies++;
			},
			setToast: (t: Toast | null) => appels.toasts.push(t),
			fetchTickets: () => {
				appels.rechargements++;
			},
		},
		appels,
	};
}

describe("TicketModal", () => {
	afterEach(restoreFetch);

	test("fermée, rien n'est monté", () => {
		const { props: p } = props(etat({ isOpen: false }));
		render(<TicketModal {...p} />);
		expect(screen.queryAllByText("Création Ticket Jira")).toHaveLength(0);
	});

	test("ouverte, elle annonce le package et le nombre de CVE", () => {
		const { props: p } = props();
		render(<TicketModal {...p} />);
		expect(screen.getByText("lodash")).toBeInTheDocument();
		expect(screen.getByText(/2 vulnérabilités/)).toBeInTheDocument();
	});

	test("l'aperçu markdown est affiché", () => {
		const { props: p } = props();
		render(<TicketModal {...p} />);
		expect(screen.getByText("# [Mon API] lodash")).toBeInTheDocument();
	});

	test("le champ de notes est associé à son libellé", () => {
		const { props: p } = props();
		render(<TicketModal {...p} />);
		expect(screen.getByLabelText(/Notes additionnelles/)).toBeInTheDocument();
	});

	test("les notes saisies partent dans la requête", async () => {
		mockFetch({
			"POST /api/tickets/create": {
				body: { success: true, ticketRef: "SEC-1" },
			},
		});
		const { props: p } = props();
		render(<TicketModal {...p} />);

		fireEvent.change(screen.getByLabelText(/Notes additionnelles/), {
			target: { value: "Exposé publiquement" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Créer dans Jira/ }));

		await waitFor(() => {
			expect(fetchCalls()).toHaveLength(1);
		});
		expect(fetchCalls()[0]?.body).toEqual({
			projectId: 7,
			packageName: "lodash",
			cves: ["CVE-1", "CVE-2"],
			notes: "Exposé publiquement",
		});
	});

	test("la création réussie recharge les tickets et ferme la modale", async () => {
		mockFetch({
			"POST /api/tickets/create": {
				body: { success: true, ticketRef: "SEC-1" },
			},
		});
		const { props: p, appels } = props();
		render(<TicketModal {...p} />);
		fireEvent.click(screen.getByRole("button", { name: /Créer dans Jira/ }));

		await waitFor(() => {
			expect(appels.rechargements).toBe(1);
		});
		expect(appels.toasts[0]?.type).toBe("success");
		expect(appels.etats.at(-1)?.isOpen).toBe(false);
	});

	test("un échec applicatif remonte un toast et laisse la modale ouverte", async () => {
		// Forme réelle de la route, vérifiée par `src/routes/tickets.test.ts` : un
		// statut d'erreur et `{ error }`. Elle ne renvoie jamais 200 avec
		// `success:false`, et `fetchJson` reprend ce message tel quel.
		mockFetch({
			"POST /api/tickets/create": {
				status: 400,
				body: { error: "Projet Jira non configuré" },
			},
		});
		const { props: p, appels } = props();
		render(<TicketModal {...p} />);
		fireEvent.click(screen.getByRole("button", { name: /Créer dans Jira/ }));

		await waitFor(() => {
			expect(appels.toasts.length).toBeGreaterThan(0);
		});
		expect(appels.toasts[0]?.type).toBe("error");
		expect(appels.toasts[0]?.message).toBe("Projet Jira non configuré");
		// La modale ne doit pas se fermer : l'utilisateur doit pouvoir corriger.
		expect(appels.etats.filter((e) => e.isOpen === false)).toHaveLength(0);
		expect(appels.rechargements).toBe(0);
	});

	test("une coupure réseau remonte aussi un toast d'erreur", async () => {
		mockFetch({
			"POST /api/tickets/create": { networkError: "ECONNREFUSED" },
		});
		const { props: p, appels } = props();
		render(<TicketModal {...p} />);
		fireEvent.click(screen.getByRole("button", { name: /Créer dans Jira/ }));

		await waitFor(() => {
			expect(appels.toasts.length).toBeGreaterThan(0);
		});
		expect(appels.toasts[0]?.type).toBe("error");
	});

	test("sans groupe, la création ne part pas", () => {
		const { props: p } = props(etat({ group: undefined }));
		render(<TicketModal {...p} />);
		fireEvent.click(screen.getByRole("button", { name: /Créer dans Jira/ }));
		expect(fetchCalls()).toHaveLength(0);
	});

	test("le bouton de copie délègue au parent", async () => {
		const { props: p, appels } = props();
		render(<TicketModal {...p} />);
		// Le bouton n'a pas de libellé, seulement une icône : on le cible par son
		// `title`. Et il diffère l'appel via `setTimeout(copyToClipboard, 0)`, d'où
		// l'attente — un `expect` synchrone verrait encore 0.
		fireEvent.click(screen.getByTitle("Copier le Markdown"));
		await waitFor(() => {
			expect(appels.copies).toBe(1);
		});
	});

	test("Annuler ferme la modale sans rien créer", () => {
		const { props: p, appels } = props();
		render(<TicketModal {...p} />);
		fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
		expect(appels.etats.at(-1)?.isOpen).toBe(false);
		expect(fetchCalls()).toHaveLength(0);
	});

	test("les notes ne fuient pas d'un ticket au suivant", () => {
		// Défaut FE12 relevé par l'audit : `notes` est un état local d'un composant
		// rendu inconditionnellement — seul le DialogContent est démonté à la
		// fermeture. Une recommandation rédigée pour lodash se retrouve donc dans
		// le ticket du package suivant.
		//
		// Ce test documente le comportement actuel. Le jour où la remise à zéro
		// est ajoutée (reset à l'ouverture, ou `key` dérivée de `group.key`), il
		// échouera et signalera la correction.
		const { props: p } = props();
		const { rerender } = render(<TicketModal {...p} />);

		fireEvent.change(screen.getByLabelText(/Notes additionnelles/), {
			target: { value: "note pour lodash" },
		});

		const suivant = props(
			etat({ group: groupe({ key: "7::axios", package: "axios" }) }),
		);
		rerender(<TicketModal {...suivant.props} />);

		expect(screen.getByLabelText(/Notes additionnelles/)).toHaveValue(
			"note pour lodash",
		);
	});
});
