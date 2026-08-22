import {
	AlertCircle,
	AlertOctagon,
	AlertTriangle,
	HelpCircle,
	Info,
	ShieldAlert,
} from "lucide-react";
import type React from "react";

/**
 * Habillage d'une sévérité : fond, **couleur de texte** et **bordure**.
 *
 * La palette ne portait qu'un fond à 10 % d'opacité, sans couleur de texte ni
 * bordure — les doubles espaces résiduels marquaient l'endroit où les deux
 * avaient disparu. Sur une carte blanche, `critical` et `moderate` ne se
 * distinguaient que par une nuance très pâle, alors que repérer les criticals
 * d'un coup d'œil est la fonction première de cet écran.
 *
 * Le texte est en teinte 700 en clair et 300 en sombre : les deux tiennent le
 * ratio de contraste 4,5:1 exigé par WCAG 1.4.3 sur leur fond respectif, ce que
 * la teinte 500 ne fait sur aucun des deux. La bordure porte l'information une
 * seconde fois, en non-textuel (WCAG 1.4.11).
 *
 * Et la couleur n'est jamais **seule** porteuse du sens (WCAG 1.4.1) : le badge
 * affiche le libellé de la sévérité, et chaque niveau a sa propre icône.
 */
export const SEVERITY_COLORS: Record<string, string> = {
	critical:
		"bg-red-500/10 text-red-700 border-red-500/40 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/50",
	high: "bg-orange-500/10 text-orange-700 border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/50",
	moderate:
		"bg-yellow-500/10 text-yellow-700 border-yellow-500/40 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/50",
	low: "bg-green-500/10 text-green-700 border-green-500/40 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/50",
	info: "bg-blue-500/10 text-blue-700 border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/50",
	unknown:
		"bg-gray-500/10 text-gray-700 border-gray-500/40 dark:bg-gray-500/15 dark:text-gray-300 dark:border-gray-500/50",
};

/**
 * Icône par sévérité. Six niveaux, **six formes distinctes**.
 *
 * `low` et `info` partageaient `Info` : deux niveaux différents rendus par le
 * même pictogramme, ce qui annulait le doublage de l'information par la forme.
 * Les icônes héritent de la couleur du texte de leur conteneur (`currentColor`),
 * donc elles suivent la palette ci-dessus au lieu d'être monochromes.
 */
export const SEVERITY_ICONS: Record<string, React.ReactNode> = {
	critical: <AlertOctagon className="w-5 h-5" />,
	high: <AlertTriangle className="w-5 h-5" />,
	moderate: <AlertCircle className="w-5 h-5" />,
	low: <ShieldAlert className="w-5 h-5" />,
	info: <Info className="w-5 h-5" />,
	unknown: <HelpCircle className="w-5 h-5" />,
};

/**
 * Libellé français d'une sévérité.
 *
 * Les écrans les écrivaient en dur, un `&&` par niveau — donc `low`, `info` et
 * `unknown` n'affichaient **rien du tout** dans la modale de rapport : une faille
 * basse y apparaissait sans aucun indicateur de gravité, indiscernable d'une
 * ligne dont la sévérité n'aurait pas été calculée.
 */
export const SEVERITY_LABELS: Record<string, string> = {
	critical: "Critique",
	high: "Haut",
	moderate: "Modéré",
	low: "Bas",
	info: "Info",
	unknown: "Inconnu",
};

export const SEV_ORDER: Record<string, number> = {
	critical: 4,
	high: 3,
	moderate: 2,
	low: 1,
	info: 0,
	unknown: -1,
};

export function compareVersions(v1: string, v2: string): number {
	if (!v1) return -1;
	if (!v2) return 1;
	const p1 = v1
		.replace(/^[^\d]+/, "")
		.split(".")
		.map(Number);
	const p2 = v2
		.replace(/^[^\d]+/, "")
		.split(".")
		.map(Number);
	const len = Math.max(p1.length, p2.length);
	for (let i = 0; i < len; i++) {
		const num1 = p1[i] || 0;
		const num2 = p2[i] || 0;
		if (num1 > num2) return 1;
		if (num1 < num2) return -1;
	}
	return 0;
}
