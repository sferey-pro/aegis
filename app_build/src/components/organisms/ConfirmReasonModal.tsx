import { AlertOctagon } from "lucide-react";
import type React from "react";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
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
			<DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col">
				<form onSubmit={submitConfirm} className="flex flex-col h-full">
					<DialogHeader className="p-6 pb-4 border-b shrink-0">
						<DialogTitle className="flex items-center gap-3 text-xl font-bold font-heading">
							<div className="w-10 h-10 rounded-full flex items-center justify-center">
								<AlertOctagon className="w-5 h-5" />
							</div>
							Confirmer la faille
						</DialogTitle>
						<DialogDescription>{confirmModal?.cve}</DialogDescription>
					</DialogHeader>

					<div className="flex-1 overflow-y-auto p-6 space-y-4">
						<p className="text-sm text-foreground/90 mt-2">
							Vous êtes sur le point de confirmer cette faille. Le composant
							sera marqué comme{" "}
							<strong className="text-red-400">Urgent à sécuriser</strong>.
						</p>

						<div className="flex flex-col gap-1.5 mt-2">
							<label htmlFor="confirm-reason" className="text-sm font-semibold">
								Raison / Justification (Obligatoire)
							</label>
							<Textarea
								id="confirm-reason"
								required
								value={confirmModal?.reason || ""}
								onChange={(e) =>
									setConfirmModal({ ...confirmModal, reason: e.target.value })
								}
								className="min-h-[100px] text-sm"
								placeholder="Ex: Le composant est exposé sur l'interface publique, risque réel d'exploitation..."
							/>
						</div>
					</div>

					<DialogFooter className="p-6 pt-4 border-t shrink-0 flex-row justify-end gap-2 bg-muted/20">
						<Button
							type="button"
							variant="secondary"
							onClick={() => setConfirmModal(null)}
						>
							Annuler
						</Button>
						<Button type="submit" variant="destructive">
							Confirmer la faille
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
