import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { mockEventSource, restoreEventSource } from "@/test/sse";
import { Console } from "./Console";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

let sse: ReturnType<typeof mockEventSource>;

/** Événement de début tel que le serveur l'émet (CONTEXT.md §11). */
function debut(over: Record<string, unknown> = {}) {
	return {
		id: 1,
		phase: "start",
		cmd: "npm audit --json",
		cwd: "/srv/api",
		label: "audit",
		...over,
	};
}

function fin(over: Record<string, unknown> = {}) {
	return { id: 1, phase: "end", exitCode: 0, ms: 120, ...over };
}

/**
 * Pousse un événement dans le composant.
 *
 * L'encadrement par `act()` est nécessaire : l'événement arrive depuis
 * l'extérieur de React, et sans lui la mise à jour d'état n'est pas appliquée
 * avant l'assertion — le DOM resterait vide alors que le composant a bien reçu
 * le message.
 */
function pousser(payload: unknown) {
	act(() => {
		sse.last().emitJson(payload);
	});
}

function pousserBrut(data: string) {
	act(() => {
		sse.last().emit(data);
	});
}

/** Ouvre le panneau : le premier bouton est le déclencheur. */
function ouvrir() {
	const boutons = screen.getAllByRole("button");
	fireEvent.click(boutons[0] as HTMLElement);
}

describe("Console", () => {
	beforeEach(() => {
		sse = mockEventSource();
	});
	afterEach(restoreEventSource);

	test("fermée, elle n'affiche qu'un déclencheur", () => {
		render(<Console />);
		expect(screen.queryAllByText("AEGIS LIVE CONSOLE")).toHaveLength(0);
		expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
	});

	test("elle souscrit au flux dès le montage", () => {
		render(<Console />);
		expect(sse.instances).toHaveLength(1);
		expect(sse.last().url).toBe("/api/console");
	});

	test("elle n'ouvre qu'un seul flux", () => {
		// Deux souscriptions signifieraient chaque commande reçue en double.
		render(<Console />);
		expect(sse.instances).toHaveLength(1);
	});

	test("le flux est fermé au démontage", () => {
		const { unmount } = render(<Console />);
		const flux = sse.last();
		expect(flux.closed).toBe(false);
		unmount();
		expect(flux.closed).toBe(true);
	});

	test("ouverte, elle affiche son en-tête", () => {
		render(<Console />);
		ouvrir();
		expect(screen.getByText("AEGIS LIVE CONSOLE")).toBeInTheDocument();
	});

	test("un événement start affiche la commande en cours", () => {
		render(<Console />);
		ouvrir();
		pousser(debut());
		expect(screen.getByText("$ npm audit --json")).toBeInTheDocument();
	});

	test("l'événement end complète la commande sans la dupliquer", () => {
		render(<Console />);
		ouvrir();
		pousser(debut());
		pousser(fin());
		// Corrélation par `id` : une seule ligne, désormais terminée.
		expect(screen.getAllByText("$ npm audit --json")).toHaveLength(1);
		expect(screen.getByText("(120ms)")).toBeInTheDocument();
	});

	test("les commentaires de keepalive sont ignorés", () => {
		render(<Console />);
		ouvrir();
		pousserBrut(": ping");
		pousserBrut(": connected");
		expect(screen.queryAllByText("$ ")).toHaveLength(0);
	});

	test("une charge non-JSON ne fait pas tomber le composant", () => {
		render(<Console />);
		ouvrir();
		pousserBrut("ceci n'est pas du json");
		expect(screen.getByText("AEGIS LIVE CONSOLE")).toBeInTheDocument();
	});

	test("un événement projet crée son onglet", () => {
		render(<Console />);
		ouvrir();
		pousser(debut({ project: "Mon API" }));
		// « Mon API » apparaît à deux endroits : l'onglet créé et le badge projet
		// de la ligne de log.
		expect(screen.getAllByText("Mon API").length).toBeGreaterThan(0);
		// Les onglets de la console sont des <button>, pas des rôles ARIA « tab ».
		expect(screen.getByText("Global")).toBeInTheDocument();
	});

	test("le bouton effacer vide les commandes affichées", () => {
		render(<Console />);
		ouvrir();
		pousser(debut());
		expect(screen.getByText("$ npm audit --json")).toBeInTheDocument();

		fireEvent.click(screen.getByTitle("Effacer la console"));
		expect(screen.queryAllByText("$ npm audit --json")).toHaveLength(0);
	});

	test("un appel HTTP réussi affiche une coche, pas une croix", () => {
		// `exitCode` porte un statut HTTP pour les appels GitHub. La convention
		// shell « zéro = succès » affichait une croix rouge et « code 200 » sur un
		// avis GHSA parfaitement trouvé.
		const { container } = render(<Console />);
		ouvrir();
		pousser(debut({ label: "github", cmd: "GET advisories GHSA-1234" }));
		pousser(fin({ exitCode: 200, ok: true }));

		expect(container.querySelector(".text-green-500")).not.toBeNull();
		expect(container.querySelector(".text-red-500")).toBeNull();
		expect(screen.queryAllByText(/code 200/)).toHaveLength(0);
	});

	test("un appel HTTP en échec affiche une croix et son statut", () => {
		const { container } = render(<Console />);
		ouvrir();
		pousser(debut({ label: "github", cmd: "GET advisories GHSA-1234" }));
		pousser(fin({ exitCode: 404, ok: false }));

		expect(container.querySelector(".text-red-500")).not.toBeNull();
		expect(screen.getByText(/code 404/)).toBeInTheDocument();
	});

	test("une coupure réseau n'est pas un succès", () => {
		// Le chemin d'erreur émettait `exitCode: 0`, donc une coche verte : la
		// panne la plus franche passait pour une réussite.
		const { container } = render(<Console />);
		ouvrir();
		pousser(debut({ label: "github" }));
		pousser(fin({ exitCode: undefined, ok: false, errorText: "ENOTFOUND" }));

		expect(container.querySelector(".text-red-500")).not.toBeNull();
		expect(screen.getByText("ENOTFOUND")).toBeInTheDocument();
	});

	test("sans `ok`, la convention du code de sortie reste appliquée", () => {
		// `git` et les outils d'audit ne déclarent pas `ok` : leur code de sortie
		// garde sa sémantique de processus.
		const { container } = render(<Console />);
		ouvrir();
		pousser(debut());
		pousser(fin({ exitCode: 1 }));

		expect(container.querySelector(".text-red-500")).not.toBeNull();
	});

	test("le message : disabled ferme le flux et l'annonce", () => {
		// Réglage DISABLE_CONSOLE côté serveur : inutile de garder la connexion.
		render(<Console />);
		ouvrir();
		const flux = sse.last();
		pousserBrut(": disabled");
		expect(flux.closed).toBe(true);
	});
});
