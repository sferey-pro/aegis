import { CheckCircle2, Copy, FileText, RefreshCw, Send } from "lucide-react";
import { useState } from "react";
import { apiErrorMessage, fetchJson, jsonInit } from "@/lib/api";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import type { TicketModalState, Toast } from "./triage-types";

export function TicketModal({
	ticketModal,
	setTicketModal,
	copyToClipboard,
	setToast,
	fetchTickets,
}: {
	ticketModal: TicketModalState;
	setTicketModal: (val: TicketModalState) => void;
	copyToClipboard: () => void;
	setToast: (toast: Toast | null) => void;
	fetchTickets: () => void;
}) {
	const [notes, setNotes] = useState("");
	const [creating, setCreating] = useState(false);

	return (
		<Dialog
			open={ticketModal.isOpen}
			onOpenChange={(open: boolean) =>
				setTicketModal({ ...ticketModal, isOpen: open })
			}
		>
			<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
				<DialogHeader className="p-6 pb-4 border-b shrink-0">
					<DialogTitle className="flex items-center gap-2">
						<FileText className="w-5 h-5" />
						Création Ticket Jira
					</DialogTitle>
					<DialogDescription>
						Un ticket Jira va être créé pour le package{" "}
						<span className="font-bold text-foreground">
							{ticketModal.group?.package}
						</span>{" "}
						({ticketModal.group?.cves?.length} vulnérabilités).
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-4">
					<div>
						<label
							htmlFor="ticket-notes"
							className="block text-sm font-medium mb-2"
						>
							Notes additionnelles / Recommandations
						</label>
						<Textarea
							id="ticket-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Ajoutez vos recommandations pour les développeurs..."
							className="min-h-[120px] font-sans text-sm"
						/>
					</div>

					<div>
						<span className="block text-sm font-medium mb-2">
							Aperçu du contenu (Markdown pour copie manuelle)
						</span>
						<div className="w-full overflow-auto bg-muted/50 rounded-xl border border-input p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-[150px]">
							{ticketModal.md}
						</div>
					</div>
				</div>

				<DialogFooter className="p-6 pt-4 border-t shrink-0 flex-row justify-end gap-2 bg-muted/20">
					<Button
						variant="secondary"
						onClick={() => setTicketModal({ ...ticketModal, isOpen: false })}
					>
						Annuler
					</Button>
					<Button
						variant="secondary"
						onClick={() => {
							setTimeout(copyToClipboard, 0);
						}}
						title="Copier le Markdown"
						className="flex items-center gap-2"
					>
						{ticketModal.copied ? (
							<CheckCircle2 className="w-4 h-4" />
						) : (
							<Copy className="w-4 h-4" />
						)}
					</Button>

					<Button
						onClick={async () => {
							if (!ticketModal.group) return;
							setCreating(true);
							try {
								// `fetchJson` lève sur 400/409/500 en reprenant le message du
								// serveur — dont « un ticket identique existe déjà (Réf: …) »,
								// qui est précisément ce que l'utilisateur doit lire.
								const data = await fetchJson<{
									success?: boolean;
									ticketRef?: string;
								}>(
									"/api/tickets/create",
									jsonInit("POST", {
										projectId: ticketModal.group.projectId,
										packageName: ticketModal.group.package,
										cves: ticketModal.group.cves.map((c) => c.cve),
										notes: notes,
									}),
								);
								if (data.success) {
									setToast({
										isOpen: true,
										type: "success",
										title: "Ticket Jira créé",
										message: `Le ticket ${data.ticketRef} a été créé avec succès.`,
									});
									fetchTickets();
									setTicketModal({ ...ticketModal, isOpen: false });
								} else {
									setToast({
										isOpen: true,
										type: "error",
										title: "Erreur",
										message: "Erreur lors de la création du ticket.",
									});
								}
							} catch (err: unknown) {
								setToast({
									isOpen: true,
									type: "error",
									title: "Erreur",
									message: apiErrorMessage(err),
								});
							} finally {
								setCreating(false);
							}
						}}
						disabled={creating}
						className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
					>
						{creating ? (
							<RefreshCw className="w-4 h-4 animate-spin" />
						) : (
							<Send className="w-4 h-4" />
						)}
						Créer dans Jira
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
