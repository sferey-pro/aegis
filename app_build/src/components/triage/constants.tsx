import {
	AlertCircle,
	AlertOctagon,
	AlertTriangle,
	HelpCircle,
	Info,
} from "lucide-react";
import type React from "react";

export const SEVERITY_COLORS: Record<string, string> = {
	critical: "bg-red-500/10 text-red-500 border-red-500/20",
	high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
	moderate: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
	low: "bg-green-500/10 text-green-500 border-green-500/20",
	info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
	unknown: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

export const SEVERITY_ICONS: Record<string, React.ReactNode> = {
	critical: <AlertOctagon className="w-5 h-5 text-red-500" />,
	high: <AlertTriangle className="w-5 h-5 text-orange-500" />,
	moderate: <AlertCircle className="w-5 h-5 text-yellow-500" />,
	low: <Info className="w-5 h-5 text-green-500" />,
	info: <Info className="w-5 h-5 text-blue-500" />,
	unknown: <HelpCircle className="w-5 h-5 text-gray-400" />,
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
