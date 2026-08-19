import { Shield } from "lucide-react";

export function ReportModal({
	reportModal,
	setReportModal,
	setCurrentTab,
}: {
	reportModal: any;
	setReportModal: (val: any) => void;
	setCurrentTab: (tab: any) => void;
}) {
	if (!reportModal) return null;

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
			<div className="glass-panel w-full max-w-xl rounded-2xl p-8 flex flex-col gap-6 animate-in zoom-in-95 duration-300 relative overflow-hidden">
				<div className="absolute top-0 right-0 p-32 bg-primary/10 blur-[80px] rounded-full pointer-events-none"></div>

				<div className="text-center">
					<div className="w-16 h-16 bg-primary/20 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/30">
						<Shield className="w-8 h-8" />
					</div>
					<h3 className="text-2xl font-bold font-heading">Audit Terminé !</h3>
					<p className="text-muted-foreground mt-2">
						Voici le résumé de l'analyse globale.
					</p>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div className="bg-background/50 border border-border/50 p-4 rounded-xl flex flex-col items-center justify-center text-center">
						<span className="text-3xl font-bold text-white">
							{reportModal.projects_audited}
						</span>
						<span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">
							Projets
						</span>
					</div>
					<div className="bg-background/50 border border-border/50 p-4 rounded-xl flex flex-col items-center justify-center text-center">
						<span className="text-3xl font-bold text-red-400">
							{reportModal.total_vulnerabilities}
						</span>
						<span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">
							Vulnérabilités
						</span>
					</div>
				</div>

				<button
					onClick={() => {
						setReportModal(null);
						setCurrentTab("reports");
					}}
					className="mt-2 w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
				>
					Voir tous les rapports
				</button>
			</div>
		</div>
	);
}
