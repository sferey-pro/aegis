import { AlertTriangle, X } from "lucide-react";

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
	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
			<div
				className="glass-panel w-full max-w-md p-6 rounded-2xl flex flex-col gap-4 border-red-500/30 animate-in zoom-in-95 duration-300"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-start justify-between">
					<div className="flex items-center gap-3 text-red-500">
						<AlertTriangle className="w-6 h-6" />
						<h2 className="text-lg font-bold">{title}</h2>
					</div>
					<button
						onClick={onCancel}
						className="text-muted-foreground hover:text-white transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				<p className="text-sm text-foreground/90 mt-2">{message}</p>

				<div className="flex justify-end gap-3 mt-4 pt-4 border-t border-white/10">
					<button
						onClick={onCancel}
						className="px-4 py-2 text-sm font-medium rounded-md hover:bg-white/5 transition-colors text-muted-foreground"
					>
						{cancelText}
					</button>
					<button
						onClick={() => {
							onConfirm();
							onCancel();
						}}
						className="px-4 py-2 text-sm font-medium rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
					>
						{confirmText}
					</button>
				</div>
			</div>
		</div>
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
	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
			<div
				className="glass-panel w-full max-w-md p-6 rounded-2xl flex flex-col gap-4 border-blue-500/30 animate-in zoom-in-95 duration-300"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-start justify-between">
					<div className="flex items-center gap-3 text-blue-400">
						<h2 className="text-lg font-bold">{title}</h2>
					</div>
					<button
						onClick={onClose}
						className="text-muted-foreground hover:text-white transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				<p className="text-sm text-foreground/90 mt-2 whitespace-pre-wrap">
					{message}
				</p>

				<div className="flex justify-end gap-3 mt-4 pt-4 border-t border-white/10">
					<button
						onClick={onClose}
						className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
					>
						OK
					</button>
				</div>
			</div>
		</div>
	);
}
