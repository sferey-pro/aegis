import { Loader2 } from "lucide-react";

import { ShieldLoader } from "../molecules/ShieldLoader";
import { FullScreenOverlay } from "./FullScreenOverlay";

/**
 * Voile de chargement initial.
 *
 * Il couvrait aussi « Tout auditer », ce qui immobilisait l'application pendant
 * plusieurs minutes — console live comprise, alors que c'est le seul endroit où
 * l'on voit les commandes d'audit tourner et échouer. Et il annonçait des étapes
 * imaginaires : un tableau de messages tournant toutes les 800 ms
 * (« Recherche GHSA », « Calcul de la criticité ») qui ne correspondaient à
 * aucun travail réel, §2 interdisant tout appel GitHub pendant un audit
 * (défaut N8).
 *
 * L'audit a désormais sa propre barre non modale (`AuditProgressBar`), qui
 * n'annonce que ce qui se passe. Ce composant ne gère plus que le démarrage,
 * où bloquer l'écran est légitime : il n'y a encore rien à afficher.
 */
export function GlobalLoader({
	loading,
	loadingMessage,
}: {
	loading: boolean;
	loadingMessage: string;
}) {
	if (!loading) return null;

	return (
		<FullScreenOverlay>
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] blur-[100px] rounded-full pointer-events-none"></div>

			<div className="z-10 flex flex-col items-center gap-2">
				<ShieldLoader size="lg" />
				<h1 className="text-3xl font-bold font-heading text-gradient">AEGIS</h1>
				<div className="flex items-center gap-3 text-muted-foreground text-sm font-medium">
					<Loader2 className="w-4 h-4 text-primary animate-spin" />
					{loadingMessage}
				</div>
			</div>
		</FullScreenOverlay>
	);
}
