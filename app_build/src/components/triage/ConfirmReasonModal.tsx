import { AlertOctagon } from "lucide-react";
import type React from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

export function ConfirmReasonModal({
	confirmModal,
	setConfirmModal,
	submitConfirm,
}: {
	confirmModal: {
		isOpen: boolean;
		cve: string;
		projectId: number;
		reason: string;
	} | null;
	setConfirmModal: (val: any) => void;
	submitConfirm: (e: React.FormEvent) => void;
}) {
	return (
		<Dialog 
			open={!!confirmModal?.isOpen} 
			onOpenChange={(open) => {
				if (!open) setConfirmModal(null);
			}}
		>
			<DialogContent className="max-w-lg">
				<form onSubmit={submitConfirm} className="flex flex-col gap-4">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-3 text-xl font-bold font-heading">
							<div className="w-10 h-10 rounded-full flex items-center justify-center">
								<AlertOctagon className="w-5 h-5" />
							</div>
							Confirmer la faille
						</DialogTitle>
						<DialogDescription>
							{confirmModal?.cve}
						</DialogDescription>
					</DialogHeader>

					<p className="text-sm text-foreground/90 mt-2">
						Vous êtes sur le point de confirmer cette faille. Le composant sera
						marqué comme{" "}
						<strong className="text-red-400">Urgent à sécuriser</strong>.
					</p>

					<div className="flex flex-col gap-1.5 mt-2">
						<label className="text-sm font-semibold">
							Raison / Justification (Obligatoire)
						</label>
						<Textarea
							required
							value={confirmModal?.reason || ""}
							onChange={(e) =>
								setConfirmModal({ ...confirmModal, reason: e.target.value })
							}
							className="min-h-[100px] text-sm"
							placeholder="Ex: Le composant est exposé sur l'interface publique, risque réel d'exploitation..."
						/>
					</div>

					<DialogFooter className="gap-3 mt-4">
						<Button
							type="button"
							variant="secondary"
							onClick={() => setConfirmModal(null)}
						>
							Annuler
						</Button>
						<Button
							type="submit"
							variant="destructive"
						>
							Confirmer la faille
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
