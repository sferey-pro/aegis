import { CheckCircle2, Copy, FileText, RefreshCw, Send, X } from "lucide-react";
import { useState } from "react";

export function TicketModal({
	ticketModal,
	setTicketModal,
	copyToClipboard,
	setToast,
	fetchTickets,
}: {
	ticketModal: { isOpen: boolean; md: string; copied: boolean; ?: any };
	setTicketModal: (val: any) => void;
	copyToClipboard: () => void;
	setToast: (toast: any) => void;
	fetchTickets: () => void;
}) {
	const [notes, setNotes] = useState("");
	const [creating, setCreating] = useState(false);

	if (!ticketModal.isOpen) return null;

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
			<div className="bg-card border-border w-full max-w-2xl rounded-2xl p-6 flex flex-col max-h-[85vh]">
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-xl font-bold font-heading flex items-center gap-2">
						<FileText className="w-5 h-5" />
						Création Ticket Jira
					</h3>
					<button
						onClick={() => setTicketModal({ ...ticketModal, isOpen: false })}
						className="p-1.5 rounded-md text-muted-foreground dark:hover:bg-white/10"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				<div className="text-sm text-muted-foreground mb-4">
					Un ticket Jira va être créé pour le package{" "}
					<span className="font-bold text-foreground">
						{ticketModal.group?.package}
					</span>{" "}
					({ticketModal.group?.cves?.length} vulnérabilités).
				</div>

				<div className="flex-1 overflow-auto flex flex-col gap-4">
					<div>
						<label className="block text-sm font-medium mb-2">
							Notes additionnelles / Recommandations
						</label>
						<textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Ajoutez vos recommandations pour les développeurs..."
							className="w-full dark:bg-black/50 rounded-xl border dark:border-white/5 p-4 relative font-sans text-sm outline-none min-h-[120px]"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium mb-2">
							Aperçu du contenu (Markdown pour copie manuelle)
						</label>
						<div className="w-full overflow-auto dark:bg-black/50 rounded-xl border dark:border-white/5 p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-[150px]">
							{ticketModal.md}
						</div>
					</div>
				</div>

				<div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
					<button
						onClick={() => setTicketModal({ ...ticketModal, isOpen: false })}
						className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground"
					>
						Annuler
					</button>
					<button
						onClick={() => {
							setTimeout(copyToClipboard, 0);
						}}
						title="Copier le Markdown"
						className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground flex items-center gap-2"
					>
						{ticketModal.copied ? (
							<CheckCircle2 className="w-4 h-4" />
						) : (
							<Copy className="w-4 h-4" />
						)}
					</button>

					<button
						onClick={async () => {
							if (!ticketModal.group) return;
							setCreating(true);
							try {
								const res = await fetch("/api/tickets/create", {
									method: "POST",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify({
										projectId: ticketModal.group.projectId,
										packageName: ticketModal.group.package,
										cves: ticketModal.group.cves.map((c: any) => c.cve),
										notes: notes,
									}),
								});
								const data = await res.json();
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
										message:
											data.error || "Erreur lors de la création du ticket.",
									});
								}
							} catch (err: any) {
								setToast({
									isOpen: true,
									type: "error",
									title: "Erreur",
									message: err.message,
								});
							} finally {
								setCreating(false);
							}
						}}
						disabled={creating}
						className="px-5 py-2 rounded-md bg-blue-600 text-white flex items-center gap-2 font-medium disabled:opacity-50"
					>
						{creating ? (
							<RefreshCw className="w-4 h-4" />
						) : (
							<Send className="w-4 h-4" />
						)}
						Créer dans Jira
					</button>
				</div>
			</div>
		</div>
	);
}
