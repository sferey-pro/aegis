import { Globe, Radar } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Les deux dates d'une vulnérabilité, côte à côte.
 *
 * Elles répondent à deux questions différentes, et l'écran n'en montrait qu'une
 * à la fois — dans une infobulle, avec un repli de l'une sur l'autre, si bien
 * qu'on ne savait pas laquelle on lisait :
 *
 *  - **GHSA** : depuis quand l'avis existe publiquement. Vient de la base
 *    d'avis, donc absente tant que l'enrichissement n'a pas tourné.
 *  - **Aegis** : quand *ce parc* l'a vue pour la première fois. Vient de
 *    `cve_occurrences`, figée au premier run qui l'a rencontrée.
 *
 * L'écart entre les deux est l'information utile : une CVE publiée il y a deux
 * ans et découverte hier signale une dépendance qui vient d'être ajoutée — ou un
 * parc qui n'était pas audité. Les deux SLA se lisent à partir de ces dates
 * (l'hérité depuis la publication, le net depuis la découverte), et les afficher
 * ensemble rend le calcul vérifiable au lieu d'être à croire.
 */

/** Date courte et locale. `null` reste explicite : « — », jamais aujourd'hui. */
function jour(valeur?: string | null): string | null {
	if (!valeur) return null;
	const d = new Date(valeur);
	// Une date illisible ne doit pas s'afficher « Invalid Date ».
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleDateString();
}

function Ligne({
	icone,
	libelle,
	date,
	infobulle,
}: {
	icone: React.ReactNode;
	libelle: string;
	date: string | null;
	infobulle: string;
}) {
	return (
		<span
			className="flex items-center gap-1.5 text-[10px] font-mono whitespace-nowrap"
			title={infobulle}
		>
			<span className="text-muted-foreground">{icone}</span>
			<span className="text-muted-foreground uppercase tracking-wider">
				{libelle}
			</span>
			<span
				className={date ? "text-foreground/90" : "text-muted-foreground/50"}
			>
				{date ?? "—"}
			</span>
		</span>
	);
}

export function CveTimeline({
	publishedAt,
	firstSeenAt,
	className,
}: {
	/** Publication de l'avis chez GitHub. */
	publishedAt?: string | null;
	/** Première détection par Aegis dans ce parc. */
	firstSeenAt?: string | null;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col items-start gap-0.5", className)}>
			<Ligne
				icone={<Globe className="w-3 h-3" />}
				libelle="GHSA"
				date={jour(publishedAt)}
				infobulle={
					publishedAt
						? "Publication de l'avis chez GitHub — base du SLA hérité."
						: "Publication inconnue : lancez « Mettre à jour les avis GHSA »."
				}
			/>
			<Ligne
				icone={<Radar className="w-3 h-3" />}
				libelle="Aegis"
				date={jour(firstSeenAt)}
				infobulle={
					firstSeenAt
						? "Première détection dans ce parc — base du SLA de découverte nette."
						: "Aucune détection enregistrée : la vulnérabilité n'a pas encore été vue par un audit."
				}
			/>
		</div>
	);
}
