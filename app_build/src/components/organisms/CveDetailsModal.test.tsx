import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

import type { Ticket } from "@/db/tickets";
import { CveDetailsModal } from "./CveDetailsModal";
import type { PackageGroup, PackageGroupCve } from "./triage-types";

/**
 * ⚠️ Assertions négatives : préférer `expect(queryAllByText(x)).toHaveLength(0)`
 * à `expect(queryByText(x)).not.toBeInTheDocument()`.
 *
 * En cas d'échec, le second sérialise l'élément happy-dom trouvé — un objet aux
 * références circulaires et aux caches internes. Mesuré sur ce fichier :
 * 143 Mo de sortie et 121 s pour une seule assertion fausse. Comparer une
 * longueur produit un message d'une ligne.
 */

function cve(over: Partial<PackageGroupCve> = {}): PackageGroupCve {
	return {
		cve: "CVE-2024-12345",
		ref: "CVE-2024-12345",
		title: "Prototype pollution",
		severity: "high",
		versionRange: ">=4.0.0 <4.17.21",
		fixedIn: "4.17.21",
		link: "https://github.com/advisories/GHSA-x",
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

function groupe(over: Partial<PackageGroup> = {}): PackageGroup {
	return {
		key: "7::lodash",
		projectId: 7,
		projectName: "Mon API",
		package: "lodash",
		tool: "npm",
		cves: [cve()],
		worstSeverity: "high",
		pendingCount: 1,
		hasConfirmed: false,
		maxBaselineAgeInDays: 0,
		maxSlaAgeInDays: 12,
		hasBaseline: false,
		hasNetDiscovery: true,
		targetPatch: "4.17.21",
		publishedAt: null,
		firstSeenAt: null,
		...over,
	};
}

function props(over: Partial<Parameters<typeof CveDetailsModal>[0]> = {}) {
	return {
		selectedGroup: groupe(),
		onClose: () => {},
		updateStatus: async () => {},
		handleConfirmCve: () => {},
		setToast: () => {},
		tickets: {} as Record<string, Ticket>,
		jiraBaseUrl: "https://jira.example",
		...over,
	};
}

describe("CveDetailsModal", () => {
	test("sans groupe sélectionné, rien n'est monté", () => {
		render(<CveDetailsModal {...props({ selectedGroup: null })} />);
		expect(screen.queryByText("lodash")).not.toBeInTheDocument();
	});

	test("affiche le package et le projet du groupe", () => {
		render(<CveDetailsModal {...props()} />);
		expect(screen.getByText("lodash")).toBeInTheDocument();
		expect(screen.getByText("Mon API")).toBeInTheDocument();
	});

	test("rend une carte par CVE du groupe", () => {
		const g = groupe({
			cves: [
				cve({ cve: "CVE-1", ref: "CVE-1" }),
				cve({ cve: "CVE-2", ref: "CVE-2" }),
			],
		});
		render(<CveDetailsModal {...props({ selectedGroup: g })} />);
		expect(screen.getByText("CVE-1")).toBeInTheDocument();
		expect(screen.getByText("CVE-2")).toBeInTheDocument();
	});

	test("un groupe sans CVE ne casse pas le rendu", () => {
		render(
			<CveDetailsModal {...props({ selectedGroup: groupe({ cves: [] }) })} />,
		);
		expect(screen.getByText("lodash")).toBeInTheDocument();
	});

	test("sans ticket enregistré, aucun lien Jira", () => {
		render(<CveDetailsModal {...props()} />);
		expect(
			screen.queryByRole("link", { name: /Ticket Jira/ }),
		).not.toBeInTheDocument();
	});

	test("avec un ticket, le lien Jira est construit depuis sa référence", () => {
		const tickets: Record<string, Ticket> = {
			"7::lodash": {
				id: 1,
				project_id: 7,
				package: "lodash",
				url: "SEC-42",
				cves: [],
				updated_at: "",
			},
		};
		render(<CveDetailsModal {...props({ tickets })} />);
		expect(screen.getByRole("link", { name: /SEC-42/ })).toHaveAttribute(
			"href",
			"https://jira.example/browse/SEC-42",
		);
	});

	test("le ticket d'un autre groupe n'est pas rattaché", () => {
		const tickets: Record<string, Ticket> = {
			"7::axios": {
				id: 1,
				project_id: 7,
				package: "axios",
				url: "SEC-9",
				cves: [],
				updated_at: "",
			},
		};
		render(<CveDetailsModal {...props({ tickets })} />);
		expect(
			screen.queryByRole("link", { name: /SEC-9/ }),
		).not.toBeInTheDocument();
	});

	test("le slash final de l'URL Jira n'est pas dupliqué", () => {
		const tickets: Record<string, Ticket> = {
			"7::lodash": {
				id: 1,
				project_id: 7,
				package: "lodash",
				url: "SEC-7",
				cves: [],
				updated_at: "",
			},
		};
		render(
			<CveDetailsModal
				{...props({ tickets, jiraBaseUrl: "https://jira.example/" })}
			/>,
		);
		expect(screen.getByRole("link", { name: /SEC-7/ })).toHaveAttribute(
			"href",
			"https://jira.example/browse/SEC-7",
		);
	});

	test("la version corrigée de la CVE est affichée", () => {
		// `fixedIn` apparaît à plusieurs endroits de la carte (patch recommandé et
		// détail de la CVE) : on vérifie la présence, pas l'unicité.
		render(<CveDetailsModal {...props()} />);
		expect(screen.getAllByText(/4\.17\.21/).length).toBeGreaterThan(0);
	});

	test("la CVE sans version corrigée n'invente pas de patch", () => {
		const g = groupe({
			// `versionRange` contient aussi un numéro de version : le neutraliser,
			// sinon l'assertion le confondrait avec un patch.
			cves: [cve({ fixedIn: null, versionRange: null })],
			targetPatch: null,
		});
		render(<CveDetailsModal {...props({ selectedGroup: g })} />);
		// Assertion sur un nombre, pas sur un élément : cf. la note du fichier.
		expect(screen.queryAllByText(/4\.17\.21/)).toHaveLength(0);
	});
});
