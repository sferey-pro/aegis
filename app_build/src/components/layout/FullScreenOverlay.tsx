import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Voile plein écran, monté **hors de l'arbre de la page** via un portail.
 *
 * Le portail n'est pas cosmétique. Le conteneur d'application applique
 * `opacity`/`blur` pendant un chargement global, et les deux propriétés créent
 * un contexte d'empilement : tout ce qui est rendu à l'intérieur y est
 * prisonnier, `z-index` compris. Un voile rendu depuis une page se retrouvait
 * donc au même niveau que l'en-tête fixe, qui restait net et lisible au-dessus
 * du voile — d'où deux modales au comportement différent selon l'endroit d'où
 * elles étaient déclenchées. Monté sur `document.body`, le voile est au-dessus
 * de l'en-tête dans tous les cas.
 *
 * `z-[100]` passe devant l'en-tête (`z-50`) sans entrer en conflit avec les
 * portails Radix, qui posent leur propre couche.
 */
export function FullScreenOverlay({ children }: { children: ReactNode }) {
	// `document` peut manquer côté rendu serveur ; le voile n'a alors rien à
	// couvrir.
	if (typeof document === "undefined") return null;

	return createPortal(
		<div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center flex-col gap-6">
			{children}
		</div>,
		document.body,
	);
}
