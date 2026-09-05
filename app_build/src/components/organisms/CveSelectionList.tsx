import type { PackageGroupCve } from "@/lib/package-groups";
import { SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/triage-constants";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";

/** Libellé d'un statut de triage (§7). Inconnu → tel quel. */
const STATUS_LABELS: Record<string, string> = {
	pending: "À traiter",
	confirmed: "Confirmé",
	not_affected: "Non affecté",
	ignored: "Ignoré",
};

/**
 * Les CVE d'un paquet, à cocher pour le ticket.
 *
 * Toutes cochées au départ : le cas courant reste « tout le paquet », et
 * décocher est l'exception qu'on veut rendre possible, pas imposer.
 */
export function CveSelectionList({
	cves,
	selected,
	onToggle,
	onSelectAll,
	onSelectNone,
}: {
	cves: PackageGroupCve[];
	selected: Set<string>;
	onToggle: (cve: string) => void;
	onSelectAll: () => void;
	onSelectNone: () => void;
}) {
	const count = cves.filter((c) => selected.has(c.cve)).length;
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-2 text-sm">
				<span className="text-muted-foreground">
					{count} sur {cves.length} sélectionnée{cves.length > 1 ? "s" : ""}
				</span>
				<div className="flex gap-1">
					<Button variant="ghost" size="sm" onClick={onSelectAll}>
						Toutes
					</Button>
					<Button variant="ghost" size="sm" onClick={onSelectNone}>
						Aucune
					</Button>
				</div>
			</div>
			<ul aria-label="CVE du paquet" className="flex flex-col gap-2">
				{cves.map((c) => {
					const id = `cve-${c.cve.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
					const checked = selected.has(c.cve);
					return (
						<li
							key={c.cve}
							className={cn(
								"flex items-start gap-3 rounded-lg border p-3",
								checked ? "border-primary/50 bg-primary/5" : "border-border",
							)}
						>
							<Checkbox
								id={id}
								checked={checked}
								onCheckedChange={() => onToggle(c.cve)}
								aria-label={c.ref ?? c.title}
								className="mt-0.5"
							/>
							<label htmlFor={id} className="flex-1 min-w-0 cursor-pointer">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-mono text-sm font-semibold">
										{c.ref ?? c.title}
									</span>
									<span
										className={cn(
											"rounded-md border px-2 py-0.5 text-xs font-semibold",
											SEVERITY_COLORS[c.severity],
										)}
									>
										{SEVERITY_LABELS[c.severity] ?? c.severity}
									</span>
									{c.status !== "pending" && (
										<span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
											{STATUS_LABELS[c.status] ?? c.status}
										</span>
									)}
								</div>
								{c.ref && (
									<p className="text-sm text-muted-foreground mt-1">
										{c.title}
									</p>
								)}
								<p className="text-xs text-muted-foreground mt-1 font-mono">
									{c.versionRange ?? "—"}
									{c.fixedIn ? ` → ${c.fixedIn}` : ""}
								</p>
							</label>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
