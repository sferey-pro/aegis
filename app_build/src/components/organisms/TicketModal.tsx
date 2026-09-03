import { CheckCircle2, Copy, FileText, RefreshCw, Send } from "lucide-react";
import { useEffect, useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import type { TicketModalState, Toast } from "./triage-types";

/**
 * Saisie et envoi d'un ticket Jira.
 *
 * **L'état local vit ici, à l'intérieur du `DialogContent`, et c'est le correctif
 * du défaut N25.** `notes` était déclaré dans `TicketModal`, un composant rendu
 * *inconditionnellement* par la page Triage : seul le `DialogContent` de Radix est
 * démonté à la fermeture, jamais son parent. La note n'était donc réinitialisée
 * nulle part — ni à l'annulation, ni après une création réussie.
 *
 * Le référent rédigeait une recommandation pour `lodash`, annulait, ouvrait le
 * ticket d'`axios` : le champ contenait encore la recommandation de `lodash`, et
 * elle partait dans le ticket Jira si personne ne la repérait.
 *
 * Réinitialiser à l'ouverture aurait corrigé ce cas précis. Descendre l'état
 * **sous** le `DialogContent` supprime la catégorie : Radix démonte ce sous-arbre
 * à chaque fermeture, donc l'oubli n'est plus possible — aucun effet à écrire, et
 * tout état ajouté ici plus tard bénéficie de la même garantie. La `key` posée par
 * l'appelant couvre en plus le changement de paquet sans fermeture.
 *
 * Conséquence assumée : une note abandonnée est perdue, même en réouvrant le même
 * paquet. « Annuler » annule.
 */
function FormulaireTicket({
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

	/**
	 * Type de ticket, choisi **par ticket**.
	 *
	 * Il n'existe plus de réglage global : une dette technique et un bug ne se
	 * rangent pas au même endroit. Et surtout : les noms sont localisés par
	 * instance, donc les lire dans Jira supprime la saisie exacte — c'est elle qui
	 * produisait un « Spécifiez un type de ticket valide » après une tentative
	 * d'écriture.
	 */
	const [types, setTypes] = useState<string[]>([]);
	const [typeChoisi, setTypeChoisi] = useState("");
	const [typesIndisponibles, setTypesIndisponibles] = useState<string | null>(
		null,
	);

	useEffect(() => {
		let vivant = true;
		fetchJson<{ types: string[]; raison?: string }>("/api/tickets/issue-types")
			.then((data) => {
				if (!vivant) return;
				setTypes(data.types);
				setTypesIndisponibles(
					data.types.length === 0 ? (data.raison ?? "") : null,
				);
				// Le premier type proposé par Jira, sauf si l'utilisateur a déjà
				// choisi : jamais une valeur que Jira refuserait.
				setTypeChoisi((courant) => courant || data.types[0] || "");
			})
			// La liste est un confort : son absence ne doit pas empêcher de créer un
			// ticket, le nom se saisit alors à la main.
			.catch(() => {
				if (vivant) setTypesIndisponibles("liste indisponible");
			});
		return () => {
			vivant = false;
		};
	}, []);

	return (
		<>
			<div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-4">
				<div>
					<label
						htmlFor="ticket-issue-type"
						className="block text-sm font-medium mb-2"
					>
						Type de ticket
					</label>
					{types.length > 0 ? (
						// L'atome Radix du dépôt, pas un `<select>` natif : c'est lui qui
						// porte les tokens de thème et le comportement clavier (défaut N27,
						// « design system contourné »).
						<Select value={typeChoisi} onValueChange={setTypeChoisi}>
							<SelectTrigger id="ticket-issue-type" className="w-full">
								<SelectValue placeholder="Choisissez un type" />
							</SelectTrigger>
							<SelectContent>
								{types.map((t) => (
									<SelectItem key={t} value={t}>
										{t}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<>
							{/* Repli : la liste vient de Jira, et son absence ne doit pas
							    empêcher de créer un ticket — le nom se saisit à la main. */}
							<input
								id="ticket-issue-type"
								type="text"
								value={typeChoisi}
								onChange={(e) => setTypeChoisi(e.target.value)}
								placeholder="Nom exact du type, ex. Tâche"
								className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
							/>
							{typesIndisponibles && (
								<p className="mt-1 text-xs text-muted-foreground">
									Liste non lue depuis Jira
									{typesIndisponibles ? ` — ${typesIndisponibles}` : ""}.
									Saisissez le nom exact tel que votre projet l'expose.
								</p>
							)}
						</>
					)}
				</div>
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
									issueType: typeChoisi,
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
					// Le type est requis et n'a plus de repli côté serveur : le bouton
					// inactif dit « il manque quelque chose ici », au lieu de laisser
					// partir un appel que Jira refuserait.
					disabled={creating || typeChoisi.trim() === ""}
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
		</>
	);
}

/**
 * Coquille du dialogue : elle ne porte **aucun état de saisie**.
 *
 * C'est délibéré — ce composant n'est jamais démonté, puisque la page Triage le
 * rend inconditionnellement. Tout état placé ici survivrait à la fermeture. Voir
 * `FormulaireTicket` ci-dessus.
 */
export function TicketModal(props: {
	ticketModal: TicketModalState;
	setTicketModal: (val: TicketModalState) => void;
	copyToClipboard: () => void;
	setToast: (toast: Toast | null) => void;
	fetchTickets: () => void;
}) {
	const { ticketModal, setTicketModal } = props;

	return (
		<Dialog
			open={ticketModal.isOpen}
			onOpenChange={(open: boolean) =>
				setTicketModal({ ...ticketModal, isOpen: open })
			}
		>
			<DialogContent className="sm:max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
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

				{/*
				  `key` sur le paquet visé : le démontage par Radix couvre le cas
				  atteignable — fermer puis rouvrir — mais pas un changement de paquet
				  **sans** fermeture. Ce second cas n'est pas atteignable par
				  l'interface, le dialogue étant modal, mais il coûte un attribut à
				  fermer et le laisser ouvert reviendrait à parier sur l'absence d'un
				  futur appelant.
				*/}
				<FormulaireTicket key={ticketModal.group?.key} {...props} />
			</DialogContent>
		</Dialog>
	);
}
