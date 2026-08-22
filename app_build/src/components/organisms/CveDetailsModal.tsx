import { Link as LinkIcon } from "lucide-react";
import type { AnnotationStatus } from "@/db/annotations";
import type { Ticket } from "@/db/tickets";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { CveCard } from "./CveCard";
import type { PackageGroup, Toast } from "./triage-types";

export function CveDetailsModal({
	selectedGroup,
	onClose,
	updateStatus,
	handleConfirmCve,
	setToast,
	tickets,
	jiraBaseUrl,
}: {
	selectedGroup: PackageGroup | null;
	/**
	 * Ferme la modale. Anciennement `setSelectedGroup`, jamais appelée qu'avec
	 * `null` : le nom promettait une sélection qu'elle ne savait pas faire.
	 */
	onClose: () => void;
	updateStatus: (
		cve: string,
		projectId: number,
		newStatus: AnnotationStatus,
		note?: string,
	) => Promise<void>;
	handleConfirmCve: (
		cve: string,
		projectId: number,
		initialReason?: string,
	) => void;
	setToast: (toast: Toast | null) => void;
	tickets: Record<string, Ticket>;
	jiraBaseUrl: string;
}) {
	// Une seule lecture de la map : l'entrée peut être absente.
	const ticket = selectedGroup ? tickets[selectedGroup.key] : undefined;

	return (
		<Dialog
			open={!!selectedGroup}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="sm:max-w-5xl w-[95vw] sm:w-[95vw] lg:w-[80vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
				{selectedGroup && (
					<>
						<DialogHeader className="p-6 pb-4 border-b shrink-0 flex-row items-center justify-between">
							<div className="flex flex-col gap-1 text-left">
								<div className="flex items-center gap-4">
									<DialogTitle className="text-xl font-bold font-mono text-foreground flex items-center gap-3">
										{selectedGroup?.package}
									</DialogTitle>
									{ticket && (
										<a
											href={`${jiraBaseUrl.replace(/\/$/, "")}/browse/${ticket.url}`}
											target="_blank"
											rel="noreferrer"
											className="px-2.5 py-1 rounded-md border text-xs font-bold flex items-center gap-1.5"
										>
											<LinkIcon className="w-3 h-3" />
											Ticket Jira : {ticket.url}
										</a>
									)}
								</div>
								<DialogDescription className="text-sm text-muted-foreground mt-1">
									Projet :{" "}
									<span className="font-semibold text-foreground">
										{selectedGroup?.projectName}
									</span>
								</DialogDescription>
							</div>
						</DialogHeader>
						<div className="flex-1 overflow-y-auto p-6">
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
								{selectedGroup?.cves?.map((cveObj) => (
									<CveCard
										key={cveObj.cve}
										cveObj={cveObj}
										packageName={selectedGroup.package}
										projectId={selectedGroup.projectId}
										setToast={setToast}
										updateStatus={updateStatus}
										handleConfirmCve={handleConfirmCve}
									/>
								))}
							</div>
						</div>
						<DialogFooter className="p-6 pt-4 border-t shrink-0 flex-row justify-end gap-2 bg-muted/20">
							<Button variant="secondary" onClick={onClose}>
								Fermer
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
