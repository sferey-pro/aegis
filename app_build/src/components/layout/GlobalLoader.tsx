import { Loader2 } from "lucide-react";

import { ShieldLoader } from "../molecules/ShieldLoader";
import { FullScreenOverlay } from "./FullScreenOverlay";

export function GlobalLoader({
	loading,
	auditing,
	loadingMessage,
	auditProgress,
	auditMessageIndex,
}: {
	loading: boolean;
	auditing: boolean;
	loadingMessage: string;
	auditProgress: { current: number; total: number; name: string } | null;
	auditMessageIndex: number;
}) {
	if (!loading && !auditing) return null;

	return (
		<FullScreenOverlay>
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] blur-[100px] rounded-full pointer-events-none"></div>

			<div className="z-10 flex flex-col items-center gap-2">
				<ShieldLoader size="lg" />
				<h1 className="text-3xl font-bold font-heading text-gradient">AEGIS</h1>
				<div className="flex items-center gap-3 text-muted-foreground text-sm font-medium">
					<Loader2 className="w-4 h-4 text-primary animate-spin" />
					{loading
						? loadingMessage
						: auditProgress
							? `${["Scan des dépendances", "Recherche GHSA", "Calcul de la criticité", "Génération des patchs"][auditMessageIndex]} de ${auditProgress.name} .... ${auditProgress.current}/${auditProgress.total}`
							: "Démarrage de l'audit global..."}
				</div>
			</div>
		</FullScreenOverlay>
	);
}
