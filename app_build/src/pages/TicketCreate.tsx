import { ArrowLeft, CheckCircle2, ExternalLink, FileText } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTicketDraft } from "@/lib/useTicketDraft";
import { CveSelectionList } from "../components/organisms/CveSelectionList";
import { TicketForm } from "../components/organisms/TicketForm";
import { Button } from "../components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";

/**
 * Création d'un ticket Jira (§8) : un projet, un paquet, les CVE qu'on choisit.
 *
 * Portée par l'URL — `?project=` et `?package=` — comme les filtres du triage :
 * partageable, et le bouton « retour » ramène au triage du projet. La page ne
 * porte ni état serveur ni appel réseau : tout vit dans `useTicketDraft`.
 */
export function TicketCreate() {
	const [searchParams, setSearchParams] = useSearchParams();
	const projectParam = searchParams.get("project");
	const projectId =
		projectParam !== null && /^\d+$/.test(projectParam)
			? Number(projectParam)
			: null;
	const packageName = searchParams.get("package");
	const draft = useTicketDraft(projectId, packageName);

	const choosePackage = (name: string) => {
		const params = new URLSearchParams(searchParams);
		params.set("package", name);
		setSearchParams(params);
	};

	// Sans paquet dans l'URL, le premier du projet : on arrive rarement ici sans
	// paquet, mais un lien tronqué ne doit pas donner une page vide.
	const firstPackage = draft.groups[0]?.package;
	useEffect(() => {
		if (packageName === null && firstPackage) {
			const params = new URLSearchParams(searchParams);
			params.set("package", firstPackage);
			setSearchParams(params, { replace: true });
		}
	}, [packageName, firstPackage, searchParams, setSearchParams]);

	const projectName =
		draft.group?.projectName ?? draft.groups[0]?.projectName ?? null;
	const backTo =
		projectId === null ? "/triage" : `/triage?project=${projectId}`;

	return (
		<main className="flex-1 w-full max-w-7xl px-4 md:px-8 mx-auto mt-4 z-10 flex flex-col gap-6">
			<Link
				to={backTo}
				className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit"
			>
				<ArrowLeft className="w-4 h-4" />
				Retour au triage
			</Link>

			<header className="flex flex-col gap-1">
				<h1 className="text-2xl font-bold font-heading flex items-center gap-2">
					<FileText className="w-6 h-6" />
					Création de ticket Jira
				</h1>
				{projectName && (
					<p className="text-sm text-muted-foreground">
						Projet{" "}
						<span className="font-semibold text-foreground">{projectName}</span>
					</p>
				)}
			</header>

			{projectId === null && (
				<div
					role="alert"
					className="rounded-2xl border border-red-500/50 bg-red-500/10 px-5 py-4 text-sm font-medium"
				>
					Projet manquant : ouvrez cette page depuis le triage, par le bouton «
					Ticket » d'un paquet.
				</div>
			)}

			{projectId !== null && draft.loading && (
				<p className="text-sm text-muted-foreground">Chargement…</p>
			)}

			{projectId !== null && !draft.loading && draft.error && (
				<div
					role="alert"
					className="flex items-center justify-between gap-4 rounded-2xl border border-red-500/50 bg-red-500/10 px-5 py-4"
				>
					<p className="text-sm font-medium">
						Impossible de charger les vulnérabilités : {draft.error}
					</p>
					<Button variant="outline" onClick={draft.reload}>
						Réessayer
					</Button>
				</div>
			)}

			{projectId !== null &&
				!draft.loading &&
				!draft.error &&
				draft.groups.length === 0 && (
					<p className="text-sm text-muted-foreground">
						Aucune vulnérabilité à traiter pour ce projet.
					</p>
				)}

			{draft.created && (
				<section
					role="status"
					className="rounded-2xl border border-green-500/50 bg-green-500/10 px-5 py-4 flex flex-col gap-3"
				>
					<p className="flex items-center gap-2 font-semibold">
						<CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
						Ticket {draft.created.ref} créé dans Jira.
					</p>
					<div className="flex flex-wrap gap-2">
						{draft.created.url && (
							<Button asChild variant="outline">
								<a href={draft.created.url} target="_blank" rel="noreferrer">
									<ExternalLink className="w-4 h-4" />
									Ouvrir {draft.created.ref}
								</a>
							</Button>
						)}
						<Button asChild>
							<Link to={backTo}>Retour au triage</Link>
						</Button>
					</div>
				</section>
			)}

			{projectId !== null &&
				!draft.loading &&
				!draft.error &&
				draft.groups.length > 0 &&
				!draft.created && (
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<section className="bg-card border-border rounded-2xl p-6 flex flex-col gap-4">
							<div>
								<label
									htmlFor="ticket-package"
									className="block text-sm font-medium mb-2"
								>
									Paquet
								</label>
								<Select
									value={draft.group?.package ?? ""}
									onValueChange={choosePackage}
								>
									<SelectTrigger id="ticket-package" className="w-full">
										<SelectValue placeholder="Choisissez un paquet" />
									</SelectTrigger>
									<SelectContent>
										{draft.groups.map((g) => (
											<SelectItem key={g.key} value={g.package}>
												{g.package} ({g.cves.length})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{draft.existingTicket && (
								<p
									role="note"
									className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-700 dark:text-orange-300"
								>
									Un ticket existe déjà pour ce paquet :{" "}
									{draft.jiraBaseUrl ? (
										<a
											href={`${draft.jiraBaseUrl.replace(/\/$/, "")}/browse/${draft.existingTicket.url}`}
											target="_blank"
											rel="noreferrer"
											className="underline underline-offset-2 font-semibold"
										>
											{draft.existingTicket.url}
										</a>
									) : (
										<span className="font-semibold">
											{draft.existingTicket.url}
										</span>
									)}
									. Une création identique sera refusée.
								</p>
							)}

							{draft.group ? (
								<CveSelectionList
									cves={draft.group.cves}
									selected={draft.selected}
									onToggle={draft.toggle}
									onSelectAll={draft.selectAll}
									onSelectNone={draft.selectNone}
								/>
							) : (
								<p className="text-sm text-muted-foreground">
									Ce paquet n'a aucune vulnérabilité dans ce projet.
								</p>
							)}
						</section>

						<section className="bg-card border-border rounded-2xl p-6 flex flex-col gap-4">
							{draft.feedback && (
								<p
									role="alert"
									className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
								>
									{draft.feedback}
								</p>
							)}
							<TicketForm
								types={draft.types}
								typesUnavailable={draft.typesUnavailable}
								issueType={draft.issueType}
								onIssueTypeChange={draft.setIssueType}
								notes={draft.notes}
								onNotesChange={draft.setNotes}
								markdown={draft.markdown}
								copied={draft.copied}
								onCopy={draft.copy}
								creating={draft.creating}
								canCreate={draft.canCreate}
								onCreate={() => void draft.create()}
								selectedCount={draft.selectedCves.length}
							/>
						</section>
					</div>
				)}
		</main>
	);
}
