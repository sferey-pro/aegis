import { Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Report } from "@/db/reports";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";

export function ReportModal({
	reportModal,
	auditErrors = [],
	setReportModal,
}: {
	reportModal: Report | null;
	/**
	 * Projets dont l'audit a échoué pendant le lot (N6). Sans cette liste, la
	 * modale annonçait « 20 projets · 0 vulnérabilité » quand les vingt avaient
	 * échoué — la conclusion la plus rassurante possible sur l'échec le plus
	 * complet possible.
	 */
	auditErrors?: string[];
	setReportModal: (val: Report | null) => void;
}) {
	const navigate = useNavigate();
	return (
		<Dialog
			open={!!reportModal}
			onOpenChange={(open) => {
				if (!open) setReportModal(null);
			}}
		>
			<DialogContent className="max-w-xl sm:min-w-[450px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
				<div className="absolute top-0 right-0 p-32 blur-[80px] rounded-full pointer-events-none"></div>

				<DialogHeader className="text-center sm:text-center p-6 pb-4 border-b shrink-0">
					<div className="w-16 h-16 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4 border bg-background">
						<Shield className="w-8 h-8" />
					</div>
					<DialogTitle className="text-2xl font-bold font-heading">
						Audit Terminé !
					</DialogTitle>
					<DialogDescription>
						Voici le résumé de l'analyse globale.
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto hide-scrollbar p-6">
					<div className="grid grid-cols-2 gap-4">
						<div className="bg-background/50 border p-4 rounded-xl flex flex-col items-center justify-center text-center">
							<span className="text-3xl font-bold">
								{reportModal?.projects_audited}
							</span>
							<span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">
								Projets
							</span>
						</div>
						<div className="bg-background/50 border p-4 rounded-xl flex flex-col items-center justify-center text-center">
							<span className="text-3xl font-bold">
								{reportModal?.total_vulnerabilities}
							</span>
							<span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">
								Vulnérabilités
							</span>
						</div>
					</div>

					{auditErrors.length > 0 && (
						<div
							role="alert"
							className="mt-4 rounded-xl border border-red-500/50 bg-red-500/10 p-4"
						>
							<p className="text-sm font-semibold">
								{auditErrors.length} projet
								{auditErrors.length > 1 ? "s" : ""} en échec — non compté
								{auditErrors.length > 1 ? "s" : ""} dans le résumé
							</p>
							<ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
								{auditErrors.map((e) => (
									<li key={e} className="font-mono break-all">
										{e}
									</li>
								))}
							</ul>
						</div>
					)}
				</div>

				<DialogFooter className="p-6 pt-4 border-t shrink-0 bg-muted/20">
					<Button
						onClick={() => {
							setReportModal(null);
							navigate("/reports");
						}}
						className="w-full font-bold rounded-xl"
						size="lg"
					>
						Voir tous les rapports
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
