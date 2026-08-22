import { Loader2, Shield } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Indicateur de chargement de l'application : le bouclier dans son anneau.
 *
 * Extrait de `GlobalLoader`, qui portait ce visuel **et** le voile plein écran.
 * Les pages ne peuvent pas réutiliser le voile — il noircirait tout l'écran pour
 * un simple chargement de liste — et affichaient donc chacune une icône
 * générique. Deux indicateurs différents pour la même attente, alors que l'un est
 * l'identité visuelle du produit.
 *
 * Le voile reste dans `GlobalLoader` ; ce composant ne porte que le visuel, ce
 * qui le rend utilisable partout.
 */
export function ShieldLoader({
	/** Texte affiché sous le bouclier. Omis, seul le bouclier tourne. */
	message,
	/** `lg` pour le plein écran, `sm` pour un chargement dans la page. */
	size = "sm",
	className,
}: {
	message?: string;
	size?: "sm" | "lg";
	className?: string;
}) {
	const grand = size === "lg";

	return (
		<div
			role="status"
			aria-live="polite"
			className={cn(
				"flex flex-col items-center justify-center gap-4",
				className,
			)}
		>
			<div
				className={cn(
					"relative flex items-center justify-center rounded-full neon-glow",
					grand ? "w-24 h-24" : "w-14 h-14",
				)}
			>
				<div className="absolute inset-0 border-[3px] border-transparent border-t-primary rounded-full animate-spin"></div>
				<Shield
					className={grand ? "w-10 h-10 text-primary" : "w-6 h-6 text-primary"}
				/>
			</div>

			{message && (
				<div className="flex items-center gap-3 text-muted-foreground text-sm font-medium">
					<Loader2 className="w-4 h-4 text-primary animate-spin" />
					{message}
				</div>
			)}
		</div>
	);
}
