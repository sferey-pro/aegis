import { CheckCircle2, Copy, Loader2, Send } from "lucide-react";
import { Button } from "../ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";

/**
 * Le formulaire du ticket : type, notes, aperçu, actions.
 *
 * Le type se choisit dans la liste lue chez Jira — les noms sont localisés par
 * instance (§8) — et retombe sur une saisie libre si la liste manque. Le bouton
 * de création reste inactif tant qu'il manque quelque chose : le serveur
 * refuserait, autant le dire ici.
 */
export function TicketForm({
	types,
	typesUnavailable,
	issueType,
	onIssueTypeChange,
	notes,
	onNotesChange,
	markdown,
	copied,
	onCopy,
	creating,
	canCreate,
	onCreate,
	selectedCount,
}: {
	types: string[];
	typesUnavailable: string | null;
	issueType: string;
	onIssueTypeChange: (value: string) => void;
	notes: string;
	onNotesChange: (value: string) => void;
	markdown: string;
	copied: boolean;
	onCopy: () => void;
	creating: boolean;
	canCreate: boolean;
	onCreate: () => void;
	selectedCount: number;
}) {
	return (
		<div className="flex flex-col gap-4">
			<div>
				<label
					htmlFor="ticket-issue-type"
					className="block text-sm font-medium mb-2"
				>
					Type de ticket
				</label>
				{types.length > 0 ? (
					// L'atome Radix du dépôt, pas un `<select>` natif : c'est lui qui
					// porte les tokens de thème et le comportement clavier (défaut N27).
					<Select value={issueType} onValueChange={onIssueTypeChange}>
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
							value={issueType}
							onChange={(e) => onIssueTypeChange(e.target.value)}
							placeholder="Nom exact du type, ex. Tâche"
							className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
						/>
						{typesUnavailable !== null && (
							<p className="mt-1 text-xs text-muted-foreground">
								Liste non lue depuis Jira
								{typesUnavailable ? ` — ${typesUnavailable}` : ""}. Saisissez le
								nom exact tel que votre projet l'expose.
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
					onChange={(e) => onNotesChange(e.target.value)}
					placeholder="Ajoutez vos recommandations pour les développeurs..."
					className="min-h-[120px] font-sans text-sm"
				/>
			</div>

			<div>
				<span className="block text-sm font-medium mb-2">
					Aperçu du contenu (Markdown pour copie manuelle)
				</span>
				<div className="w-full overflow-auto bg-muted/50 rounded-xl border border-input p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-[300px]">
					{markdown || (
						<span className="not-italic">
							{selectedCount === 0
								? "Sélectionnez au moins une CVE."
								: "Génération de l'aperçu…"}
						</span>
					)}
				</div>
			</div>

			<div className="flex flex-row justify-end gap-2 pt-2 border-t">
				<Button
					variant="secondary"
					onClick={onCopy}
					disabled={!markdown}
					title="Copier le Markdown"
					className="flex items-center gap-2"
				>
					{copied ? (
						<CheckCircle2 className="w-4 h-4" />
					) : (
						<Copy className="w-4 h-4" />
					)}
					{copied ? "Copié" : "Copier"}
				</Button>
				<Button
					onClick={onCreate}
					// Le type est requis, et au moins une CVE : le bouton inactif dit
					// « il manque quelque chose ici », au lieu de laisser partir un appel
					// que le serveur refuserait.
					disabled={!canCreate}
					className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
				>
					{creating ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : (
						<Send className="w-4 h-4" />
					)}
					Créer dans Jira
				</Button>
			</div>
		</div>
	);
}
