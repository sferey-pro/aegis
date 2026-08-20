import {
	AlertTriangle,
	CheckCircle2,
	Info,
	RefreshCw,
	Shield,
	X,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ConfirmReasonModal } from "../components/organisms/ConfirmReasonModal";
import { CveDetailsModal } from "../components/organisms/CveDetailsModal";
import { TicketModal } from "../components/organisms/TicketModal";
import { TriageTable } from "../components/organisms/TriageTable";
import { Button } from "../components/ui/button";
import { compareVersions, SEV_ORDER } from "../lib/triage-constants";

export const Triage = React.memo(function Triage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const projectId = searchParams.get("project")
		? parseInt(searchParams.get("project") as string)
		: null;
	const cveFilter = searchParams.get("cve");

	const onClearProject = () => {
		const newParams = new URLSearchParams(searchParams);
		newParams.delete("project");
		setSearchParams(newParams);
	};
	const onClearCve = () => {
		const newParams = new URLSearchParams(searchParams);
		newParams.delete("cve");
		setSearchParams(newParams);
	};
	const [cves, setCves] = useState<any[]>([]);
	const [tickets, setTickets] = useState<Record<string, any>>({});
	const [jiraBaseUrl, setJiraBaseUrl] = useState("");
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState(1);
	const [itemsPerPage, setItemsPerPage] = useState(10);
	const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
	const [ticketModal, setTicketModal] = useState<{
		isOpen: boolean;
		md: string;
		copied: boolean;
		group?: any;
	}>({ isOpen: false, md: "", copied: false });
	const [confirmModal, setConfirmModal] = useState<{
		isOpen: boolean;
		cve: string;
		projectId: number;
		reason: string;
	} | null>(null);
	const [toast, setToast] = useState<{
		isOpen: boolean;
		title: string;
		message: React.ReactNode;
		type: "success" | "error" | "info";
	} | null>(null);
	const [hideProcessed, setHideProcessed] = useState(false);

	const fetchCves = useCallback(async () => {
		try {
			const res = await fetch("/api/cves");
			const data = await res.json();
			setCves(data);
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	}, []);

	const fetchTickets = useCallback(async () => {
		try {
			const res = await fetch("/api/tickets/list");
			const data = await res.json();
			const map: Record<string, any> = {};
			for (const t of data) {
				map[`${t.project_id}::${t.package}`] = t;
			}
			setTickets(map);
		} catch (e) {
			console.error(e);
		}
	}, []);

	const fetchSettings = useCallback(async () => {
		try {
			const res = await fetch("/api/settings");
			const data = await res.json();
			setJiraBaseUrl(data.JIRA_BASE_URL || "");
		} catch (e) {
			console.error(e);
		}
	}, []);

	useEffect(() => {
		fetchCves();
		fetchTickets();
		fetchSettings();
	}, [fetchCves, fetchTickets, fetchSettings]);

	const packageGroups = React.useMemo(() => {
		const map = new Map<string, any>();
		cves.forEach((cveGroup: any) => {
			if (cveFilter && cveGroup.cve !== cveFilter) return;

			cveGroup.occurrences.forEach((occ: any) => {
				if (projectId && occ.projectId !== projectId) return;
				if (hideProcessed && occ.status !== "pending") return;

				const key = `${occ.projectId}::${occ.package}`;
				if (!map.has(key)) {
					map.set(key, {
						key,
						projectId: occ.projectId,
						projectName: occ.projectName,
						package: occ.package,
						tool: occ.tool,
						cves: [],
						worstSeverity: occ.severity,
						pendingCount: 0,
						hasConfirmed: false,
						maxBaselineAgeInDays: 0,
						maxSlaAgeInDays: 0,
						hasBaseline: false,
						hasNetDiscovery: false,
						targetPatch: null as string | null,
					});
				}
				const g = map.get(key)!;
				if (
					occ.fixedIn &&
					(!g.targetPatch || compareVersions(occ.fixedIn, g.targetPatch) > 0)
				) {
					g.targetPatch = occ.fixedIn;
				}
				const occAge = occ.ageInDays || 0;
				if (occ.isBaseline) {
					g.hasBaseline = true;
					if (occAge > g.maxBaselineAgeInDays) {
						g.maxBaselineAgeInDays = occAge;
					}
				} else {
					g.hasNetDiscovery = true;
					if (occAge > g.maxSlaAgeInDays) {
						g.maxSlaAgeInDays = occAge;
					}
				}
				if (
					(SEV_ORDER[occ.severity] ?? -1) > (SEV_ORDER[g.worstSeverity] ?? -1)
				) {
					g.worstSeverity = occ.severity;
				}
				if (occ.status === "pending") g.pendingCount++;
				if (occ.status === "confirmed") g.hasConfirmed = true;

				g.cves.push({
					cve: cveGroup.cve,
					ref: cveGroup.ref,
					title: occ.title || cveGroup.title,
					severity: occ.severity,
					versionRange: occ.versionRange,
					fixedIn: occ.fixedIn,
					link: occ.link,
					status: occ.status,
					note: occ.note,
					cvssVector: occ.cvssVector,
					ageInDays: occ.ageInDays,
					firstSeenAt: occ.firstSeenAt,
					publishedAt: occ.publishedAt,
					isBaseline: occ.isBaseline,
				});
			});
		});
		return Array.from(map.values())
			.filter((g) => g.cves.length > 0)
			.sort((a, b) => b.projectName.localeCompare(a.projectName));
	}, [cves, projectId, cveFilter, hideProcessed]);

	// Dependances volontaires utilisees comme declencheurs : le corps ne les lit
	// pas, mais la pagination doit repartir a la premiere page quand le jeu de
	// donnees ou un filtre change.
	// biome-ignore lint/correctness/useExhaustiveDependencies: declencheurs volontaires
	useEffect(() => {
		setPage(1);
	}, [cves, projectId, cveFilter, hideProcessed]);

	const totalPages = Math.ceil(packageGroups.length / itemsPerPage);
	const paginatedGroups = packageGroups.slice(
		(page - 1) * itemsPerPage,
		page * itemsPerPage,
	);

	const updateStatus = async (
		cve: string,
		projectId: number,
		newStatus: string,
		note?: string,
	) => {
		try {
			const payload: any = { cve, projectId, status: newStatus };
			if (note !== undefined) {
				payload.note = note;
			} else if (newStatus !== "confirmed") {
				payload.note = "";
			}

			await fetch("/api/annotations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			fetchCves();
		} catch (err) {
			console.error(err);
		}
	};

	const handleConfirmCve = (
		cve: string,
		projectId: number,
		initialReason: string = "",
	) => {
		setConfirmModal({ isOpen: true, cve, projectId, reason: initialReason });
	};

	const submitConfirm = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!confirmModal) return;
		await updateStatus(
			confirmModal.cve,
			confirmModal.projectId,
			"confirmed",
			confirmModal.reason,
		);
		setConfirmModal(null);
	};

	const createTicket = async (e: React.MouseEvent, group: any) => {
		e.stopPropagation();
		try {
			const res = await fetch("/api/tickets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId: group.projectId,
					packageName: group.package,
				}),
			});
			const data = await res.json();
			setTicketModal({ isOpen: true, md: data.markdown, copied: false, group });
		} catch (err) {
			console.error(err);
		}
	};

	const copyToClipboard = () => {
		navigator.clipboard.writeText(ticketModal.md);
		setTicketModal((prev) => ({ ...prev, copied: true }));
		setTimeout(
			() => setTicketModal((prev) => ({ ...prev, copied: false })),
			2000,
		);
	};

	return (
		<div className="flex-1 w-full max-w-7xl px-4 md:px-8 mx-auto mt-8 z-10">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h2 className="text-3xl font-bold font-heading flex items-center gap-3">
						CVEs
						{projectId && (
							<span className="text-sm font-semibold px-3 py-1 text-primary rounded-full border flex items-center gap-2">
								Filtré par projet
								{onClearProject && (
									<button
										type="button"
										onClick={onClearProject}
										className="hover:text-red-400"
									>
										<X className="w-3.5 h-3.5" />
									</button>
								)}
							</span>
						)}
						{cveFilter && (
							<span className="text-sm font-semibold px-3 py-1 rounded-full border flex items-center gap-2">
								Filtré par CVE ({cveFilter})
								{onClearCve && (
									<button
										type="button"
										onClick={onClearCve}
										className="hover:text-red-400"
									>
										<X className="w-3.5 h-3.5" />
									</button>
								)}
							</span>
						)}
					</h2>
					<p className="text-muted-foreground mt-1">
						Regroupé par Package et par Projet. Créez facilement vos tickets
						Jira.
					</p>
				</div>
				<Button
					variant={hideProcessed ? "secondary" : "outline"}
					onClick={() => setHideProcessed(!hideProcessed)}
					className={`flex items-center gap-2 ${hideProcessed ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
				>
					<CheckCircle2 className="w-4 h-4" /> Zero-Inbox (Masquer traitées)
				</Button>
			</div>

			{loading ? (
				<div className="flex justify-center p-12">
					<RefreshCw className="w-8 h-8 text-primary" />
				</div>
			) : packageGroups.length === 0 ? (
				<div className="bg-card border-border p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4">
					<Shield className="w-16 h-16 opacity-80" />
					<div>
						<h3 className="text-xl font-bold">Aucune vulnérabilité</h3>
						<p className="text-muted-foreground">Votre écosystème est sain !</p>
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-4">
					<TriageTable
						paginatedGroups={paginatedGroups}
						setSelectedGroup={setSelectedGroup}
						createTicket={createTicket}
						tickets={tickets}
						jiraBaseUrl={jiraBaseUrl}
						page={page}
						setPage={setPage}
						totalPages={totalPages}
						itemsPerPage={itemsPerPage}
						setItemsPerPage={setItemsPerPage}
						totalItems={packageGroups.length}
					/>
				</div>
			)}

			<CveDetailsModal
				selectedGroup={selectedGroup}
				setSelectedGroup={setSelectedGroup}
				updateStatus={updateStatus}
				handleConfirmCve={handleConfirmCve}
				setToast={setToast}
				tickets={tickets}
				jiraBaseUrl={jiraBaseUrl}
			/>

			<TicketModal
				ticketModal={ticketModal}
				setTicketModal={setTicketModal}
				copyToClipboard={copyToClipboard}
				setToast={setToast}
				fetchTickets={fetchTickets}
			/>

			<ConfirmReasonModal
				confirmModal={confirmModal}
				setConfirmModal={setConfirmModal}
				submitConfirm={submitConfirm}
			/>

			{toast?.isOpen && (
				<div
					className={`fixed bottom-6 right-6 z-[200] max-w-sm w-full p-4 rounded-xl border flex flex-col gap-2 bg-card border-border ${toast.type === "success" ? "bg-green-500/10 " : toast.type === "error" ? "bg-red-500/10 " : "bg-blue-500/10 "}`}
				>
					<div className="flex justify-between items-start">
						<h4 className="font-bold flex items-center gap-2">
							{toast.type === "success" ? (
								<CheckCircle2 className="w-5 h-5" />
							) : toast.type === "error" ? (
								<AlertTriangle className="w-5 h-5" />
							) : (
								<Info className="w-5 h-5" />
							)}
							{toast.title}
						</h4>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setToast(null)}
							className="text-current opacity-70 w-6 h-6 hover:bg-transparent hover:opacity-100"
						>
							<X className="w-5 h-5" />
						</Button>
					</div>
					<div className="text-sm opacity-90 mt-1">{toast.message}</div>
				</div>
			)}
		</div>
	);
});
