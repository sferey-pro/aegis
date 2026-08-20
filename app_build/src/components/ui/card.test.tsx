import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "./card";

describe("Card", () => {
	test("compose ses sous-parties et rend leur contenu", () => {
		render(
			<Card>
				<CardHeader>
					<CardTitle>Mon API</CardTitle>
					<CardDescription>3 vulnérabilités</CardDescription>
					<CardAction>action</CardAction>
				</CardHeader>
				<CardContent>contenu</CardContent>
				<CardFooter>pied</CardFooter>
			</Card>,
		);
		for (const texte of [
			"Mon API",
			"3 vulnérabilités",
			"action",
			"contenu",
			"pied",
		]) {
			expect(screen.getByText(texte)).toBeInTheDocument();
		}
	});

	test("chaque sous-partie porte son data-slot", () => {
		const { container } = render(
			<Card>
				<CardHeader>
					<CardTitle>t</CardTitle>
					<CardDescription>d</CardDescription>
					<CardAction>a</CardAction>
				</CardHeader>
				<CardContent>c</CardContent>
				<CardFooter>f</CardFooter>
			</Card>,
		);
		for (const slot of [
			"card",
			"card-header",
			"card-title",
			"card-description",
			"card-action",
			"card-content",
			"card-footer",
		]) {
			expect(container.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
		}
	});

	test("fusionne la className fournie", () => {
		const { container } = render(<Card className="ma-classe">x</Card>);
		expect(container.querySelector('[data-slot="card"]')).toHaveClass(
			"ma-classe",
		);
	});
});
