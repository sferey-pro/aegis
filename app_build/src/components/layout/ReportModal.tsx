import { Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";

export function ReportModal({
	reportModal,
	setReportModal,
}: {
	reportModal: any;
	setReportModal: (val: any) => void;
}) {
	const navigate = useNavigate();
	return (
		<Dialog open={!!reportModal} onOpenChange={(open) => { if (!open) setReportModal(null) }}>
			<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
				<div className="absolute top-0 right-0 p-32 blur-[80px] rounded-full pointer-events-none"></div>

				<DialogHeader className="text-center sm:text-center p-6 pb-2">
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

				<div className="grid grid-cols-2 gap-4 mt-2">
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

				<div className="p-6 pt-0">
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
				</div>
			</DialogContent>
		</Dialog>
	);
}
