import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import { ConsoleHeader } from "./ConsoleHeader";

function props(over: Partial<Parameters<typeof ConsoleHeader>[0]> = {}) {
	return {
		debugMode: false,
		setDebugMode: () => {},
		isMaximized: false,
		setIsMaximized: () => {},
		onClear: () => {},
		onClose: () => {},
		...over,
	};
}

describe("ConsoleHeader", () => {
	test("affiche le titre de la console", () => {
		render(<ConsoleHeader {...props()} />);
		expect(screen.getByText("AEGIS LIVE CONSOLE")).toBeInTheDocument();
	});

	test("le bouton debug bascule l'état courant", () => {
		const vus: boolean[] = [];
		render(<ConsoleHeader {...props({ setDebugMode: (v) => vus.push(v) })} />);
		fireEvent.click(screen.getByTitle(/Mode Debug/));
		expect(vus).toEqual([true]);
	});

	test("le bouton debug renvoie false quand le mode est déjà actif", () => {
		const vus: boolean[] = [];
		render(
			<ConsoleHeader
				{...props({ debugMode: true, setDebugMode: (v) => vus.push(v) })}
			/>,
		);
		fireEvent.click(screen.getByTitle(/Mode Debug/));
		expect(vus).toEqual([false]);
	});

	test("le bouton effacer appelle onClear", () => {
		let appels = 0;
		render(<ConsoleHeader {...props({ onClear: () => appels++ })} />);
		fireEvent.click(screen.getByTitle("Effacer la console"));
		expect(appels).toBe(1);
	});

	test("l'agrandissement bascule l'état", () => {
		const vus: boolean[] = [];
		render(
			<ConsoleHeader {...props({ setIsMaximized: (v) => vus.push(v) })} />,
		);
		// 4 boutons : debug, effacer, agrandir, fermer.
		const boutons = screen.getAllByRole("button");
		fireEvent.click(boutons[2] as HTMLElement);
		expect(vus).toEqual([true]);
	});

	test("le dernier bouton ferme la console", () => {
		let appels = 0;
		render(<ConsoleHeader {...props({ onClose: () => appels++ })} />);
		const boutons = screen.getAllByRole("button");
		fireEvent.click(boutons[boutons.length - 1] as HTMLElement);
		expect(appels).toBe(1);
	});
});
