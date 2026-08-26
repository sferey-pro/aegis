import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import { AuditProgressBar } from "./AuditProgressBar";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

describe("AuditProgressBar", () => {
	test("sans progression, elle ne rend rien", () => {
		const { container } = render(
			<AuditProgressBar progression={null} onCancel={() => {}} />,
		);
		expect(container.firstElementChild).toBeNull();
	});

	test("elle annonce l'avancement en projets", () => {
		render(
			<AuditProgressBar
				progression={{ faits: 3, total: 12, enCours: ["Mon API"] }}
				onCancel={() => {}}
			/>,
		);
		expect(screen.getByText(/3 \/ 12 projets/)).toBeInTheDocument();
	});

	test("elle nomme les projets réellement en cours", () => {
		// Le voile précédent annonçait des étapes imaginaires — « Recherche GHSA »,
		// « Calcul de la criticité » — qui ne correspondaient à aucun travail réel.
		render(
			<AuditProgressBar
				progression={{ faits: 1, total: 6, enCours: ["Mon API", "Front"] }}
				onCancel={() => {}}
			/>,
		);
		expect(screen.getByText(/Mon API, Front/)).toBeInTheDocument();
	});

	test("elle n'est pas modale", () => {
		// C'est tout l'objet du correctif : la console live doit rester lisible et
		// cliquable pendant l'audit.
		const { container } = render(
			<AuditProgressBar
				progression={{ faits: 0, total: 1, enCours: [] }}
				onCancel={() => {}}
			/>,
		);
		expect(document.querySelector(".fixed.inset-0")).toBeNull();
		expect((container.firstElementChild as HTMLElement).className).toContain(
			"pointer-events-none",
		);
	});

	test("le bouton Annuler déclenche le rappel", () => {
		let annulations = 0;
		render(
			<AuditProgressBar
				progression={{ faits: 0, total: 4, enCours: ["a"] }}
				onCancel={() => {
					annulations++;
				}}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /Annuler/ }));
		expect(annulations).toBe(1);
	});

	test("un lot vide ne divise pas par zéro", () => {
		// `total` peut valoir 0 quand le filtre ne retient aucun projet.
		render(
			<AuditProgressBar
				progression={{ faits: 0, total: 0, enCours: [] }}
				onCancel={() => {}}
			/>,
		);
		expect(screen.getByText(/0 \/ 0 projets/)).toBeInTheDocument();
	});

	test("la fin du lot est annoncée sans nom de projet", () => {
		render(
			<AuditProgressBar
				progression={{ faits: 4, total: 4, enCours: [] }}
				onCancel={() => {}}
			/>,
		);
		expect(screen.getByText("Finalisation…")).toBeInTheDocument();
	});

	test("l'intitulé par défaut est celui de l'audit", () => {
		render(
			<AuditProgressBar
				progression={{ faits: 1, total: 4, enCours: ["a"] }}
				onCancel={() => {}}
			/>,
		);
		expect(
			screen.getByText(/Audit global — 1 \/ 4 projets/),
		).toBeInTheDocument();
	});

	test("l'intitulé est celui du lot qui tourne", () => {
		// La même barre sert les deux lots orchestrés côté client : audit (§2) et
		// synchronisation Git (§5). Sans intitulé, la synchro s'annonçait « Audit
		// global ».
		render(
			<AuditProgressBar
				progression={{ faits: 2, total: 3, enCours: ["a"] }}
				onCancel={() => {}}
				label="Mise à jour Git"
			/>,
		);
		expect(
			screen.getByText(/Mise à jour Git — 2 \/ 3 projets/),
		).toBeInTheDocument();
	});

	test("décalée, elle ne se superpose pas à l'autre barre", () => {
		// Les deux lots peuvent tourner en même temps — l'audit depuis l'en-tête, la
		// synchro depuis la page Projets — et deux barres ancrées en bas se
		// recouvriraient.
		const { container } = render(
			<AuditProgressBar
				progression={{ faits: 1, total: 2, enCours: ["a"] }}
				onCancel={() => {}}
				offset
			/>,
		);
		const ancre = container.firstElementChild;
		expect(ancre?.className).toContain("bottom-24");
		expect(ancre?.className).not.toContain("bottom-0");
	});

	test("elle est annoncée aux lecteurs d'écran", () => {
		render(
			<AuditProgressBar
				progression={{ faits: 1, total: 4, enCours: ["a"] }}
				onCancel={() => {}}
			/>,
		);
		expect(screen.getByRole("status")).toBeInTheDocument();
	});
});
