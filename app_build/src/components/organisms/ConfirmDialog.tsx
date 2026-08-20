import { AlertTriangle } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";

interface ConfirmDialogProps {
	isOpen: boolean;
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDialog({
	isOpen,
	title,
	message,
	confirmText = "Confirmer",
	cancelText = "Annuler",
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	return (
		<Dialog open={isOpen} onOpenChange={(open: boolean) => { if (!open) onCancel(); }}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-3">
						<AlertTriangle className="w-6 h-6" />
						{title}
					</DialogTitle>
					<DialogDescription className="mt-2 text-foreground/90">
						{message}
					</DialogDescription>
				</DialogHeader>

				<DialogFooter className="gap-3 mt-4 pt-4 border-t">
					<Button
						variant="ghost"
						onClick={onCancel}
					>
						{cancelText}
					</Button>
					<Button
						variant="destructive"
						onClick={() => {
							onConfirm();
							onCancel();
						}}
					>
						{confirmText}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface AlertDialogProps {
	isOpen: boolean;
	title: string;
	message: string;
	onClose: () => void;
}

export function AlertDialog({
	isOpen,
	title,
	message,
	onClose,
}: AlertDialogProps) {
	return (
		<Dialog open={isOpen} onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription className="mt-2 text-foreground/90 whitespace-pre-wrap">
						{message}
					</DialogDescription>
				</DialogHeader>

				<DialogFooter className="gap-3 mt-4 pt-4 border-t">
					<Button
						onClick={onClose}
					>
						OK
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
