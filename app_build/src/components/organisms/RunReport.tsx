import type { Vulnerability } from "@/lib/parsers/types";
import {
	SEV_ORDER,
	SEVERITY_COLORS,
	SEVERITY_LABELS,
} from "@/lib/triage-constants";
import { cn, formatDateTime } from "@/lib/utils";
import { vulnRef } from "@/lib/vuln-identity";
import type { ProjectHistoryItem } from "@/routes/projects";
import { Badge } from "../ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../ui/table";
import { statusLabel } from "./RunTimeline";

const SEVERITIES = [
	"critical",
	"high",
	"moderate",
	"low",
	"info",
	"unknown",
] as const;

/**
 * Rapport d'un audit : ce que le run a mesuré, ce qui est apparu depuis le run
 * précédent, et — s'il a échoué — pourquoi, tel que l'outil l'a dit.
 *
 * L'erreur est rendue **brute**, dans un bloc préformaté : le champ `error` est
 * multi-ligne par contrat (§2 : raison, `cwd:`, `exit:`, stderr, stdout), et
 * c'est en le lisant tel quel qu'on diagnostique. Jamais avalé, jamais résumé.
 */
export function RunReport({ run }: { run: ProjectHistoryItem }) {
	// Clé de §2 pour marquer les lignes nouvelles dans le tableau.
	const newKeys = new Set(run.newCves.map((c) => `${c.package}::${c.ref}`));
	const isNew = (v: Vulnerability) =>
		newKeys.has(`${v.package}::${vulnRef(v.cve) ?? v.package}`);

	const vulnerabilities = [...run.vulnerabilities].sort(
		(a, b) => (SEV_ORDER[b.severity] ?? -1) - (SEV_ORDER[a.severity] ?? -1),
	);

	return (
		<article className="flex flex-col gap-6" aria-label="Rapport d'audit">
			<header className="flex flex-col gap-2">
				<h2 className="text-xl font-bold font-heading">
					Rapport du {formatDateTime(run.ran_at)}
				</h2>
				<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<Badge variant={run.status === "error" ? "destructive" : "outline"}>
						{statusLabel(run)}
					</Badge>
					<span>{formatDuration(run.duration_ms)}</span>
					{run.commit_sha && (
						<span title={run.commit_sha}>
							commit <code>{run.commit_sha.slice(0, 7)}</code>
						</span>
					)}
					{run.command && <code className="text-xs">{run.command}</code>}
				</div>
			</header>

			{run.status === "error" && run.error && (
				<section aria-label="Erreur de l'audit">
					<pre className="whitespace-pre-wrap break-words rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-700 dark:text-red-300">
						{run.error}
					</pre>
				</section>
			)}

			{run.status !== "error" && (
				<section aria-label="Sévérités" className="flex flex-wrap gap-2">
					{SEVERITIES.map((sev) => (
						<span
							key={sev}
							className={cn(
								"rounded-md border px-2.5 py-1 text-xs font-semibold",
								SEVERITY_COLORS[sev],
							)}
						>
							{SEVERITY_LABELS[sev]} : {run.counts[sev] ?? 0}
						</span>
					))}
				</section>
			)}

			{run.status !== "error" && (
				<section aria-label="Nouvelles CVE" className="flex flex-col gap-2">
					<h3 className="font-semibold">
						Nouvelles CVE ({run.newCves.length})
					</h3>
					{run.newCves.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Aucune nouvelle CVE par rapport à l'audit précédent.
						</p>
					) : (
						<ul className="flex flex-wrap gap-2">
							{run.newCves.map((c) => (
								<li
									key={`${c.package}::${c.ref}`}
									className={cn(
										"rounded-md border px-2.5 py-1 text-xs",
										SEVERITY_COLORS[c.severity],
									)}
								>
									<span className="font-semibold">{c.ref}</span>{" "}
									<span className="opacity-80">({c.package})</span>
								</li>
							))}
						</ul>
					)}
				</section>
			)}

			{run.status !== "error" && (
				<section aria-label="Vulnérabilités" className="flex flex-col gap-2">
					<h3 className="font-semibold">
						Vulnérabilités ({vulnerabilities.length})
					</h3>
					{vulnerabilities.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Aucune vulnérabilité détectée.
						</p>
					) : (
						<div className="overflow-x-auto rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Sévérité</TableHead>
										<TableHead>Paquet</TableHead>
										<TableHead>Référence</TableHead>
										<TableHead className="w-full">Titre</TableHead>
										<TableHead>Versions affectées</TableHead>
										<TableHead>Correctif</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{vulnerabilities.map((v) => {
										const ref = vulnRef(v.cve);
										return (
											<TableRow key={`${v.package}|${v.title}|${v.cve ?? ""}`}>
												<TableCell>
													<span
														className={cn(
															"rounded-md border px-2 py-0.5 text-xs font-semibold",
															SEVERITY_COLORS[v.severity],
														)}
													>
														{SEVERITY_LABELS[v.severity] ?? v.severity}
													</span>
												</TableCell>
												<TableCell className="font-mono text-xs">
													{v.package}
													{isNew(v) && (
														<Badge
															variant="destructive"
															className="ml-2 text-[10px]"
														>
															Nouveau
														</Badge>
													)}
												</TableCell>
												<TableCell className="text-xs">
													{v.link ? (
														<a
															href={v.link}
															target="_blank"
															rel="noreferrer"
															className="underline underline-offset-2"
														>
															{ref ?? "avis"}
														</a>
													) : (
														(ref ?? "—")
													)}
												</TableCell>
												{/* L'atome pose `whitespace-nowrap` : un titre d'avis fait
													    souvent une phrase, il doit passer à la ligne au lieu
													    d'étirer le tableau hors de la carte. */}
												<TableCell className="text-sm whitespace-normal break-words min-w-[16rem]">
													{v.title}
												</TableCell>
												<TableCell className="font-mono text-xs">
													{v.versionRange ?? "—"}
												</TableCell>
												<TableCell className="font-mono text-xs">
													{v.fixedIn ?? "—"}
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					)}
				</section>
			)}
		</article>
	);
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms} ms`;
	return `${(ms / 1000).toFixed(1)} s`;
}
