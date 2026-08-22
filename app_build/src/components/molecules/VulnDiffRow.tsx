import { buildCvssTooltip } from "@/lib/cvss";
import { SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/triage-constants";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/**
 * Une ligne de vulnérabilité dans le diff entre deux rapports.
 *
 * Le markup était dupliqué entre « failles corrigées » et « nouvelles failles »,
 * avec trois défauts identiques des deux côtés :
 *
 *  - **Le titre était tronqué** (`truncate max-w-[300px]`). Or c'est la seule
 *    description de la faille sur cet écran : coupée à 300 px, elle se réduisait
 *    à « PHP code injection via `{% use %}` templat… ». Il passe en retour à la
 *    ligne — un rapport se lit, il ne se survole pas.
 *  - **La ligne débordait de la modale.** Un conteneur `flex` sans `min-w-0` ne
 *    peut pas rétrécir sous la largeur de son contenu : le bloc de gauche
 *    poussait le badge de sévérité hors du cadre, à moitié coupé.
 *  - **Le badge de sévérité n'avait aucune couleur**, et n'existait que pour
 *    trois niveaux sur six. Une faille basse s'affichait donc sans indicateur.
 */
export function VulnDiffRow({
	projectName,
	packageName,
	title,
	cve,
	severity,
	cvssVector,
}: {
	projectName: string;
	packageName: string;
	title: string;
	cve?: string | null;
	severity?: string | null;
	cvssVector?: string | null;
}) {
	const habillage = severity
		? (SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.unknown)
		: null;

	return (
		<div className="flex flex-col md:flex-row md:items-start justify-between gap-2 p-3 rounded-lg border">
			{/* `min-w-0` : sans lui, le bloc refuse de rétrécir et pousse la colonne
			    de droite hors du cadre. */}
			<div className="flex flex-col gap-1 min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs font-mono px-2 py-1 rounded bg-muted/60 text-muted-foreground shrink-0">
						{projectName}
					</span>
					<span className="font-bold break-all">{packageName}</span>
				</div>
				<p className="text-muted-foreground text-sm break-words">{title}</p>
				{cvssVector && (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="self-start font-mono text-xs px-2 py-0.5 rounded border text-muted-foreground cursor-help break-all">
								{cvssVector}
							</span>
						</TooltipTrigger>
						<TooltipContent
							side="right"
							className="font-mono text-xs whitespace-pre bg-gray-900 border-gray-700 max-w-[400px]"
						>
							{buildCvssTooltip(cvssVector)}
						</TooltipContent>
					</Tooltip>
				)}
			</div>

			<div className="flex flex-wrap items-center gap-2 shrink-0 md:justify-end">
				{habillage && severity && (
					<span
						className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${habillage}`}
					>
						{SEVERITY_LABELS[severity] ?? severity}
					</span>
				)}
				{cve && (
					<span className="text-xs font-mono text-muted-foreground break-all">
						{cve}
					</span>
				)}
			</div>
		</div>
	);
}
