import { AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";

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
		<Dialog
			open={isOpen}
			onOpenChange={(open: boolean) => {
				if (!open) onCancel();
			}}
		>
			<DialogContent className="sm:max-w-md p-0 overflow-hidden flex flex-col">
				<DialogHeader className="p-6 pb-4 border-b shrink-0">
					<DialogTitle className="flex items-center gap-3">
						<AlertTriangle className="w-6 h-6" />
						{title}
					</DialogTitle>
				</DialogHeader>

				<div className="p-6 overflow-y-auto">
					<DialogDescription className="text-foreground/90">
						{message}
					</DialogDescription>
				</div>

				<DialogFooter className="p-6 pt-4 border-t shrink-0 flex-row justify-end gap-2 bg-muted/20">
					<Button variant="ghost" onClick={onCancel}>
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
		<Dialog
			open={isOpen}
			onOpenChange={(open: boolean) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="sm:max-w-md p-0 overflow-hidden flex flex-col">
				<DialogHeader className="p-6 pb-4 border-b shrink-0">
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>

				<div className="p-6 overflow-y-auto">
					<DialogDescription className="text-foreground/90 whitespace-pre-wrap">
						{message}
					</DialogDescription>
				</div>

				<DialogFooter className="p-6 pt-4 border-t shrink-0 flex-row justify-end gap-2 bg-muted/20">
					<Button onClick={onClose}>OK</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
