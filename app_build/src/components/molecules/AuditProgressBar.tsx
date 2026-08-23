import { Loader2, X } from "lucide-react";

import type { ProgressionAudit } from "@/lib/useGlobalAudit";
import { Button } from "../ui/button";

/**
 * Progression de « Tout auditer », **non modale**.
 *
 * Elle remplace un voile plein écran qui posait
 * `opacity-50 pointer-events-none blur-sm` sur le conteneur englobant
 * `<Routes>`. Or `<Console />` est rendue **dans** `MainLayout`, donc dans ce
 * conteneur : pendant plusieurs minutes, la console live SSE — le seul endroit
 * où l'on voit `npm audit` tourner et échouer — était floutée et non cliquable.
 * L'utilisateur perdait précisément l'information dont il avait besoin, au
 * moment où il en avait besoin (défaut N8).
 *
 * Le voile affichait par ailleurs des messages tirés d'un tableau tournant
 * toutes les 800 ms — « Recherche GHSA », « Calcul de la criticité » — qui ne
 * correspondaient à **aucune étape réelle** : §2 interdit tout appel GitHub
 * pendant l'audit. Cette barre n'annonce que ce qui se passe : combien de
 * projets sont faits, lesquels tournent, et un bouton pour arrêter.
 *
 * `pointer-events-none` sur le conteneur, rétabli sur la carte : la barre est
 * ancrée en bas de l'écran sans intercepter les clics de la page.
 */
export function AuditProgressBar({
	progression,
	onCancel,
}: {
	progression: ProgressionAudit | null;
	onCancel: () => void;
}) {
	if (!progression) return null;

	const { faits, total, enCours } = progression;
	// Un lot vide ne doit pas produire une division par zéro.
	const pourcent = total > 0 ? Math.round((faits / total) * 100) : 0;

	return (
		<div
			className="fixed bottom-0 left-0 right-0 z-40 p-4 flex justify-center pointer-events-none"
			role="status"
			aria-live="polite"
		>
			<div className="pointer-events-auto w-full max-w-2xl bg-card border border-border rounded-2xl shadow-lg p-4 flex flex-col gap-3">
				<div className="flex items-center justify-between gap-4">
					<span className="flex items-center gap-2 font-semibold text-sm">
						<Loader2 className="w-4 h-4 text-primary animate-spin" />
						Audit global — {faits} / {total} projets
					</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onCancel}
						className="text-red-600 dark:text-red-400"
					>
						<X className="w-4 h-4 mr-1.5" /> Annuler
					</Button>
				</div>

				<div className="h-2 w-full rounded-full bg-muted overflow-hidden">
					<div
						className="h-full bg-primary transition-[width] duration-300"
						style={{ width: `${pourcent}%` }}
					/>
				</div>

				<p className="text-xs text-muted-foreground font-mono truncate">
					{enCours.length > 0
						? `En cours : ${enCours.join(", ")}`
						: "Finalisation…"}
				</p>
			</div>
		</div>
	);
}
