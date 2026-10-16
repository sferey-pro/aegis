import { afterEach, describe, expect, test } from "bun:test";
import type { CveGroup, CveOccurrence } from "@/lib/aggregator";
import { mockFetch, restoreFetch } from "@/test/http";
import { fireEvent, render, screen, waitFor } from "@/test/utils";
import {
	buildAuditReportPrompt,
	getCveAnalysisDate,
	getCveFirstSeenDate,
	PromptReportGenerator,
} from "./PromptReportGenerator";

function occ(over: Partial<CveOccurrence> = {}): CveOccurrence {
	return {
		projectId: 1,
		projectName: "Mon Projet",
		tool: "npm",
		package: "lodash",
		severity: "high",
		versionRange: "<4.17.21",
		fixedIn: "4.17.21",
		title: "Prototype Pollution in lodash",
		link: "https://nvd.nist.gov/vuln/detail/CVE-2021-23337",
		status: "pending",
		note: "",
		cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
		firstSeenAt: "2026-01-10T10:00:00.000Z",
		publishedAt: "2021-02-15T00:00:00.000Z",
		ranAt: "2026-02-01T15:30:00.000Z",
		...over,
	};
}

function cveGroup(over: Partial<CveGroup> = {}): CveGroup {
	return {
		cve: "CVE-2021-23337",
		ref: "CVE-2021-23337",
		worst: "high",
		occurrences: [occ()],
		...over,
	};
}

describe("PromptReportGenerator helpers", () => {
	test("getCveFirstSeenDate retient la date la plus ancienne parmi firstSeenAt et publishedAt", () => {
		const group = cveGroup({
			occurrences: [
				occ({
					firstSeenAt: "2026-03-01T00:00:00Z",
					publishedAt: "2026-04-01T00:00:00Z",
				}),
				occ({ firstSeenAt: "2026-01-15T00:00:00Z", publishedAt: null }),
			],
		});
		expect(getCveFirstSeenDate(group)).toBe("2026-01-15T00:00:00Z");
	});

	test("getCveFirstSeenDate renvoie null sans dates valides", () => {
		const group = cveGroup({
			occurrences: [occ({ firstSeenAt: null, publishedAt: null })],
		});
		expect(getCveFirstSeenDate(group)).toBeNull();
	});

	test("getCveAnalysisDate retient la date d'audit la plus récente", () => {
		const group = cveGroup({
			occurrences: [
				occ({ ranAt: "2026-02-01T10:00:00Z" }),
				occ({ ranAt: "2026-02-15T10:00:00Z" }),
			],
		});
		expect(getCveAnalysisDate(group)).toBe("2026-02-15T10:00:00Z");
	});

	test("buildAuditReportPrompt avec tableau vide renvoie un message d'instruction", () => {
		const prompt = buildAuditReportPrompt([]);
		expect(prompt).toContain("AUCUNE VULNÉRABILITÉ SÉLECTIONNÉE");
	});

	test("buildAuditReportPrompt avec CVEs génère un prompt d'évaluation des risques et format artifact", () => {
		const cve1 = cveGroup();
		const prompt = buildAuditReportPrompt([cve1], "2026-02-20T12:00:00.000Z");
		expect(prompt).toContain("Tu es un expert en cybersécurité");
		expect(prompt).toContain("CVE-2021-23337");
		expect(prompt).toContain("Mon Projet");
		expect(prompt).toContain("lodash (<4.17.21)");
		expect(prompt).toContain("artifact Markdown");
		expect(prompt).toContain("Aucune supposition / Aucune hallucination");
		expect(prompt).toContain("Format court et concis");
		expect(prompt).toContain("Récapitulatif Court par CVE");
		expect(prompt).toContain("Tableau Récapitulatif des Risques");
		expect(prompt).not.toContain("Plan d'Action et Remédiation");
	});
});

describe("PromptReportGenerator Component", () => {
	afterEach(restoreFetch);

	const mockCves: CveGroup[] = [
		cveGroup({
			cve: "CVE-2021-23337",
			ref: "CVE-2021-23337",
			worst: "high",
			occurrences: [
				occ({
					projectId: 1,
					projectName: "Projet Alpha",
					package: "lodash",
					ranAt: "2026-02-01T10:00:00Z",
				}),
			],
		}),
		cveGroup({
			cve: "CVE-2023-45853",
			ref: "CVE-2023-45853",
			worst: "critical",
			occurrences: [
				occ({
					projectId: 2,
					projectName: "Projet Beta",
					package: "zlib",
					severity: "critical",
					ranAt: "2026-02-05T10:00:00Z",
				}),
			],
		}),
	];

	test("affiche le titre et charge les vulnérabilités depuis l'API", async () => {
		mockFetch({ "GET /api/cves": mockCves });
		render(<PromptReportGenerator />);

		expect(
			await screen.findByText("Générateur de Compte-Rendu (CR) IA"),
		).toBeInTheDocument();
		expect(await screen.findByText("CVE-2021-23337")).toBeInTheDocument();
		expect(screen.getByText("CVE-2023-45853")).toBeInTheDocument();
	});

	test("le textarea est en lecture seule (non modifiable)", async () => {
		mockFetch({ "GET /api/cves": mockCves });
		render(<PromptReportGenerator />);

		const textarea = (await screen.findByLabelText(
			"Prompt de compte-rendu pour IA",
		)) as HTMLTextAreaElement;
		expect(textarea).toBeInTheDocument();
		expect(textarea.readOnly).toBe(true);
		expect(textarea.value).toContain("AUCUNE VULNÉRABILITÉ SÉLECTIONNÉE");
	});

	test("cocher une CVE met à jour dynamiquement le contenu du prompt", async () => {
		mockFetch({ "GET /api/cves": mockCves });
		render(<PromptReportGenerator />);

		await screen.findByText("CVE-2021-23337");

		const chk1 = screen.getByRole("checkbox", { name: "CVE-2021-23337" });
		fireEvent.click(chk1);

		const textarea = screen.getByLabelText(
			"Prompt de compte-rendu pour IA",
		) as HTMLTextAreaElement;
		await waitFor(() => {
			expect(textarea.value).toContain("CVE-2021-23337");
			expect(textarea.value).toContain("Projet Alpha");
		});

		expect(screen.getByText("1 CVE sélectionnée")).toBeInTheDocument();
	});

	test("bouton Tout cocher et Tout décocher", async () => {
		mockFetch({ "GET /api/cves": mockCves });
		render(<PromptReportGenerator />);

		await screen.findByText("CVE-2021-23337");

		const selectAllBtn = screen.getByRole("button", { name: /Tout cocher/ });
		fireEvent.click(selectAllBtn);

		const textarea = screen.getByLabelText(
			"Prompt de compte-rendu pour IA",
		) as HTMLTextAreaElement;
		await waitFor(() => {
			expect(textarea.value).toContain("CVE-2021-23337");
			expect(textarea.value).toContain("CVE-2023-45853");
		});

		const deselectAllBtn = screen.getByRole("button", {
			name: /Tout décocher/,
		});
		fireEvent.click(deselectAllBtn);

		await waitFor(() => {
			expect(textarea.value).toContain("AUCUNE VULNÉRABILITÉ SÉLECTIONNÉE");
		});
	});

	test("recherche textuelle filtre la liste des CVE disponibles", async () => {
		mockFetch({ "GET /api/cves": mockCves });
		render(<PromptReportGenerator />);

		await screen.findByText("CVE-2021-23337");

		const searchInput = screen.getByPlaceholderText("CVE, paquet, titre...");
		fireEvent.change(searchInput, { target: { value: "zlib" } });

		expect(screen.queryByText("CVE-2021-23337")).toBeNull();
		expect(screen.getByText("CVE-2023-45853")).toBeInTheDocument();
	});

	test("le menu déroulant peut être replié et déplié", async () => {
		mockFetch({ "GET /api/cves": mockCves });
		render(<PromptReportGenerator />);

		await screen.findByText("CVE-2021-23337");

		const dropdownToggle = screen.getByLabelText(
			"Menu déroulant pour sélectionner les CVE",
		);
		fireEvent.click(dropdownToggle);

		// Replié : la liste n'est plus visible
		expect(screen.queryByText("CVE-2021-23337")).toBeNull();

		// Clic pour redéplier
		fireEvent.click(dropdownToggle);
		expect(screen.getByText("CVE-2021-23337")).toBeInTheDocument();
	});

	test("bouton de copie appelle le presse-papiers et change d'état", async () => {
		let copiedText = "";
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: async (t: string) => {
					copiedText = t;
				},
			},
			configurable: true,
		});
		Object.defineProperty(window, "isSecureContext", {
			value: true,
			configurable: true,
		});

		mockFetch({ "GET /api/cves": mockCves });
		render(<PromptReportGenerator />);

		await screen.findByText("CVE-2021-23337");
		fireEvent.click(screen.getByRole("checkbox", { name: "CVE-2021-23337" }));

		const copyBtn = screen.getByRole("button", { name: /Copier le prompt/ });
		fireEvent.click(copyBtn);

		await waitFor(() => {
			expect(screen.getByText("Copié !")).toBeInTheDocument();
		});
		expect(copiedText).toContain("CVE-2021-23337");
	});

	test("en cas d'erreur de chargement, affiche un état d'erreur explicite", async () => {
		mockFetch({ "GET /api/cves": { networkError: "ECONNREFUSED" } });
		render(<PromptReportGenerator />);

		expect(await screen.findByText("Erreur de chargement")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Réessayer" }),
		).toBeInTheDocument();
	});
});
