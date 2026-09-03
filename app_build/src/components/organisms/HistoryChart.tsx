import { Loader2, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { fetchJson } from "@/lib/api";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "../ui/chart";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

const chartConfig = {
	critical: {
		label: "Critique",
		color: "#ef4444",
	},
	high: {
		label: "Élevé",
		color: "#f97316",
	},
	moderate: {
		label: "Modéré",
		color: "#eab308",
	},
	low: {
		label: "Faible",
		color: "#3b82f6",
	},
} satisfies ChartConfig;

/**
 * Forme d'un point, importée de la route qui la produit : un changement de forme
 * casse la compilation au lieu de dériver en silence.
 */
type HistoryPoint = import("@/routes/stats").HistoryPoint;

/**
 * Aplatit un point pour recharts : `dataKey` doit désigner la clé du
 * `chartConfig` (« critical », « high »…) pour que le libellé et la couleur de
 * la légende soient résolus. La réponse d'API, elle, garde la forme du contrat —
 * `{date, label, counts, total}` (§4).
 */
function aplatir(p: HistoryPoint) {
	return { label: p.label, total: p.total, ...p.counts };
}

/**
 * Graphique d'évolution : tout le parc, ou **un seul projet** (§4).
 *
 * `projectId` ajoute `&project=` à la requête, et rien d'autre ne change : la
 * série a la même forme, l'algorithme est le même côté serveur. `refreshToken`
 * force une relecture — après un audit lancé depuis la page de détail, la
 * série du jour a bougé alors que ni la période ni le projet n'ont changé.
 */
export function HistoryChart({
	projectId,
	refreshToken = 0,
}: {
	projectId?: number;
	refreshToken?: number;
} = {}) {
	const [data, setData] = useState<HistoryPoint[]>([]);
	const [loading, setLoading] = useState(true);
	const [days, setDays] = useState(7);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `refreshToken` n'entre pas dans la requête, il la force — après un audit, la série du jour a bougé sans que période ni projet aient changé.
	useEffect(() => {
		setLoading(true);
		const url =
			projectId === undefined
				? `/api/history-global?days=${days}`
				: `/api/history-global?days=${days}&project=${projectId}`;
		// `fetchJson` lève sur un statut non-2xx : un 500 ne peut plus être passé
		// à `setData` comme s'il s'agissait d'une série vide.
		fetchJson<HistoryPoint[]>(url)
			.then((d) => {
				setData(d);
				setLoading(false);
			})
			.catch((e: unknown) => {
				console.error(e);
				setData([]);
				setLoading(false);
			});
	}, [days, projectId, refreshToken]);

	const pourLeGraphique = data.map(aplatir);

	if (loading) {
		return (
			<div className="bg-card border-border w-full h-[400px] rounded-2xl flex items-center justify-center">
				<Loader2 className="w-8 h-8 text-primary" />
			</div>
		);
	}

	if (data.length === 0) {
		return (
			<div className="bg-card border-border w-full h-[400px] rounded-2xl flex flex-col items-center justify-center text-muted-foreground gap-2">
				<TrendingDown className="w-8 h-8 opacity-50" />
				<p>Aucune donnée d'historique disponible.</p>
			</div>
		);
	}

	return (
		<div className="bg-card border-border w-full p-6 rounded-2xl">
			<div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div>
					<h3 className="text-xl font-bold font-heading">
						{projectId === undefined
							? "Évolution Globale"
							: "Évolution du projet"}
					</h3>
					<p className="text-sm text-muted-foreground">
						Volume de vulnérabilités sur les derniers {days} jours
						{projectId === undefined ? " (tous projets confondus)" : ""}.
					</p>
				</div>
				<Select
					value={days.toString()}
					onValueChange={(val: string) => setDays(Number.parseInt(val, 10))}
				>
					<SelectTrigger className="w-[140px] h-9 rounded-xl">
						<SelectValue placeholder="Période" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="1">1 jour</SelectItem>
						<SelectItem value="7">7 jours</SelectItem>
						<SelectItem value="14">14 jours</SelectItem>
						<SelectItem value="30">30 jours</SelectItem>
						<SelectItem value="60">60 jours</SelectItem>
						<SelectItem value="90">90 jours</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="h-[300px] w-full">
				<ChartContainer config={chartConfig} className="h-full w-full">
					<AreaChart
						data={pourLeGraphique}
						margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
					>
						<defs>
							<linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
								<stop
									offset="5%"
									stopColor="var(--color-critical)"
									stopOpacity={0.3}
								/>
								<stop
									offset="95%"
									stopColor="var(--color-critical)"
									stopOpacity={0}
								/>
							</linearGradient>
							<linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
								<stop
									offset="5%"
									stopColor="var(--color-high)"
									stopOpacity={0.3}
								/>
								<stop
									offset="95%"
									stopColor="var(--color-high)"
									stopOpacity={0}
								/>
							</linearGradient>
							<linearGradient id="colorMod" x1="0" y1="0" x2="0" y2="1">
								<stop
									offset="5%"
									stopColor="var(--color-moderate)"
									stopOpacity={0.3}
								/>
								<stop
									offset="95%"
									stopColor="var(--color-moderate)"
									stopOpacity={0}
								/>
							</linearGradient>
							<linearGradient id="colorLow" x1="0" y1="0" x2="0" y2="1">
								<stop
									offset="5%"
									stopColor="var(--color-low)"
									stopOpacity={0.3}
								/>
								<stop
									offset="95%"
									stopColor="var(--color-low)"
									stopOpacity={0}
								/>
							</linearGradient>
						</defs>
						<CartesianGrid strokeDasharray="3 3" vertical={false} />
						<XAxis
							dataKey="label"
							tickMargin={10}
							axisLine={false}
							tickLine={false}
						/>
						<YAxis axisLine={false} tickLine={false} />
						<ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
						<Area
							type="monotone"
							dataKey="critical"
							stackId="1"
							stroke="var(--color-critical)"
							fill="url(#colorCritical)"
							strokeWidth={2}
							isAnimationActive={false}
						/>
						<Area
							type="monotone"
							dataKey="high"
							stackId="1"
							stroke="var(--color-high)"
							fill="url(#colorHigh)"
							strokeWidth={2}
							isAnimationActive={false}
						/>
						<Area
							type="monotone"
							dataKey="moderate"
							stackId="1"
							stroke="var(--color-moderate)"
							fill="url(#colorMod)"
							strokeWidth={2}
							isAnimationActive={false}
						/>
						<Area
							type="monotone"
							dataKey="low"
							stackId="1"
							stroke="var(--color-low)"
							fill="url(#colorLow)"
							strokeWidth={2}
							isAnimationActive={false}
						/>
					</AreaChart>
				</ChartContainer>
			</div>
		</div>
	);
}
