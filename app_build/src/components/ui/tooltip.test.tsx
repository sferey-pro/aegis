import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip";

function Info({ open }: { open?: boolean }) {
	return (
		<TooltipProvider>
			<Tooltip open={open}>
				<TooltipTrigger>CVSS</TooltipTrigger>
				<TooltipContent>AV:N/AC:L/PR:N</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

describe("Tooltip", () => {
	test("le déclencheur est rendu", () => {
		render(<Info />);
		expect(screen.getByText("CVSS")).toBeInTheDocument();
	});

	test("fermé, le contenu n'est pas monté", () => {
		render(<Info />);
		expect(screen.queryByText("AV:N/AC:L/PR:N")).not.toBeInTheDocument();
	});

	test("ouvert, le contenu est exposé", () => {
		render(<Info open />);
		// Radix duplique le contenu dans un nœud accessible : au moins une
		// occurrence doit être présente.
		expect(screen.getAllByText("AV:N/AC:L/PR:N").length).toBeGreaterThan(0);
	});
});
