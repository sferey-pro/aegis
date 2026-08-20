import {
	Code,
	Edit2,
	Plus,
	RefreshCw,
	Tag,
	Terminal,
	Trash2,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "../components/organisms/ConfirmDialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";

export function PromptsLibrary() {
	const [prompts, setPrompts] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isAdding, setIsAdding] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [formData, setFormData] = useState({ title: "", body: "", tags: "" });

	const [promptToDelete, setPromptToDelete] = useState<number | null>(null);

	const fetchPrompts = useCallback(async () => {
		try {
			const res = await fetch("/api/prompts");
			const data = await res.json();
			setPrompts(data);
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchPrompts();
	}, [fetchPrompts]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const payload = {
				title: formData.title,
				body: formData.body,
				tags: formData.tags
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean),
			};

			if (editingId) {
				await fetch(`/api/prompts/${editingId}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
			} else {
				await fetch("/api/prompts", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
			}

			resetForm();
			fetchPrompts();
		} catch (err) {
			console.error(err);
		}
	};

	const handleEdit = (prompt: any) => {
		setFormData({
			title: prompt.title,
			body: prompt.body,
			tags: (prompt.tags || []).join(", "),
		});
		setEditingId(prompt.id);
		setIsAdding(true);
	};

	const handleDelete = async (id: number) => {
		setPromptToDelete(id);
	};

	const confirmDelete = async () => {
		if (promptToDelete === null) return;
		try {
			await fetch(`/api/prompts/${promptToDelete}`, { method: "DELETE" });
			setPromptToDelete(null);
			fetchPrompts();
		} catch (err) {
			console.error(err);
		}
	};

	const resetForm = () => {
		setIsAdding(false);
		setEditingId(null);
		setFormData({ title: "", body: "", tags: "" });
	};

	const handleCopy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			// Optional: Add a toast notification here if you have one
		} catch (err) {
			console.error("Failed to copy", err);
		}
	};

	return (
		<div className="flex-1 w-full max-w-7xl px-4 md:px-8 mx-auto mt-8 z-10">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h2 className="text-3xl font-bold font-heading flex items-center gap-3">
						Bibliothèque de Prompts
					</h2>
					<p className="text-muted-foreground mt-1">
						Créez et stockez des prompts IA pour vous aider à analyser vos
						vulnérabilités. À copier/coller.
					</p>
				</div>
				<Button
					onClick={() => {
						resetForm();
						setIsAdding(true);
					}}
					className="shadow-lg"
				>
					<Plus className="w-4 h-4 mr-2" />
					Nouveau Prompt
				</Button>
			</div>

			<Dialog
				open={isAdding}
				onOpenChange={(open: boolean) => {
					if (!open) resetForm();
				}}
			>
				<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
					<form
						onSubmit={handleSubmit}
						className="flex flex-col h-full overflow-hidden"
					>
						<DialogHeader className="p-6 pb-4 border-b shrink-0 flex-row justify-between items-center">
							<DialogTitle className="text-xl font-bold text-primary">
								{editingId ? "Modifier le Prompt" : "Nouveau Prompt"}
							</DialogTitle>
						</DialogHeader>

						<div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-4">
							<div className="flex flex-col gap-1">
								<label htmlFor="prompt-title" className="text-sm font-medium">
									Titre
								</label>
								<Input
									id="prompt-title"
									required
									type="text"
									value={formData.title}
									onChange={(e) =>
										setFormData({ ...formData, title: e.target.value })
									}
									placeholder="Ex: Nettoyage du cache NPM"
								/>
							</div>

							<div className="flex flex-col gap-1">
								<label htmlFor="prompt-body" className="text-sm font-medium">
									Contenu du Prompt IA
								</label>
								<Textarea
									id="prompt-body"
									required
									value={formData.body}
									onChange={(e) =>
										setFormData({ ...formData, body: e.target.value })
									}
									className="min-h-[150px] font-mono text-sm"
									placeholder="Ex: Agis comme un expert en cybersécurité. Explique moi la faille {{cve}} sur le package {{package}}..."
								/>
							</div>

							<div className="flex flex-col gap-1">
								<label htmlFor="prompt-tags" className="text-sm font-medium">
									Tags (séparés par des virgules)
								</label>
								<Input
									id="prompt-tags"
									type="text"
									value={formData.tags}
									onChange={(e) =>
										setFormData({ ...formData, tags: e.target.value })
									}
									placeholder="Ex: utilitaire, npm, fix"
								/>
							</div>
						</div>

						<DialogFooter className="p-4 border-t shrink-0 flex justify-end gap-3 bg-muted/20">
							<Button type="button" variant="secondary" onClick={resetForm}>
								Annuler
							</Button>
							<Button type="submit">
								{editingId ? "Enregistrer" : "Créer le prompt"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{loading ? (
				<div className="flex justify-center p-12">
					<RefreshCw className="w-8 h-8 text-primary" />
				</div>
			) : prompts.length === 0 ? (
				<div className="bg-card border-border p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4">
					<Terminal className="w-16 h-16 text-muted-foreground opacity-50" />
					<div>
						<h3 className="text-xl font-bold">Aucun prompt</h3>
						<p className="text-muted-foreground">
							Créez votre première commande pour l'utiliser sur vos projets.
						</p>
					</div>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{prompts.map((p) => (
						<div
							key={p.id}
							className="bg-card border-border p-5 rounded-xl flex flex-col gap-3"
						>
							<div className="flex items-start justify-between">
								<div className="flex items-center gap-2">
									<Code className="w-5 h-5 text-primary" />
									<h3
										className="font-bold text-lg leading-tight truncate max-w-[200px]"
										title={p.title}
									>
										{p.title}
									</h3>
								</div>
							</div>

							<div className="text-sm mt-2 font-mono  p-2 rounded border text-muted-foreground h-[60px] overflow-hidden relative">
								{p.body}
								<div className="absolute bottom-0 left-0 right-0 h-8 from-[#111]"></div>
							</div>

							{p.tags && p.tags.length > 0 && (
								<div className="flex flex-wrap gap-1 mt-2">
									{p.tags.map((tag: string) => (
										<Badge
											key={tag}
											variant="secondary"
											className="flex items-center gap-1 text-[10px] uppercase tracking-wider"
										>
											<Tag className="w-3 h-3" />
											{tag}
										</Badge>
									))}
								</div>
							)}

							<div className="flex items-center justify-between mt-auto pt-4 border-t">
								<Button
									variant="secondary"
									size="sm"
									onClick={() => handleCopy(p.body)}
									className="text-primary"
								>
									<Code className="w-4 h-4 mr-1.5" />
									Copier
								</Button>
								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										onClick={() => handleEdit(p)}
										className="w-8 h-8 text-muted-foreground"
										title="Modifier"
									>
										<Edit2 className="w-4 h-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => handleDelete(p.id)}
										className="w-8 h-8 text-muted-foreground"
										title="Supprimer"
									>
										<Trash2 className="w-4 h-4" />
									</Button>
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			<ConfirmDialog
				isOpen={promptToDelete !== null}
				title="Supprimer le prompt"
				message="Êtes-vous sûr de vouloir supprimer ce prompt de la bibliothèque ?"
				confirmText="Supprimer"
				onConfirm={confirmDelete}
				onCancel={() => setPromptToDelete(null)}
			/>
		</div>
	);
}
