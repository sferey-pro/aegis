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
import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";

export function PromptsLibrary() {
	const [prompts, setPrompts] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [isAdding, setIsAdding] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [formData, setFormData] = useState({ title: "", body: "", tags: "" });

	const [promptToDelete, setPromptToDelete] = useState<number | null>(null);

	useEffect(() => {
		fetchPrompts();
	}, []);

	const fetchPrompts = async () => {
		try {
			const res = await fetch("/api/prompts");
			const data = await res.json();
			setPrompts(data);
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

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
		<div className="flex-1 w-full max-w-7xl px-4 md:px-8 mx-auto mt-8 z-10 animate-in fade-in duration-500">
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
					className="shadow-lg shadow-primary/20"
				>
					<Plus className="w-4 h-4 mr-2" />
					Nouveau Prompt
				</Button>
			</div>

			{isAdding && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
					onClick={resetForm}
				>
					<form
						onSubmit={handleSubmit}
						onClick={(e) => e.stopPropagation()}
						className="glass-panel w-full max-w-2xl p-6 rounded-2xl flex flex-col gap-4 border-primary/30 animate-in zoom-in-95 duration-300"
					>
						<h3 className="text-xl font-bold mb-2 text-primary">
							{editingId ? "Modifier le Prompt" : "Nouveau Prompt"}
						</h3>

						<div className="flex flex-col gap-1">
							<label className="text-sm font-medium">Titre</label>
							<Input
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
							<label className="text-sm font-medium">
								Contenu du Prompt IA
							</label>
							<Textarea
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
							<label className="text-sm font-medium">
								Tags (séparés par des virgules)
							</label>
							<Input
								type="text"
								value={formData.tags}
								onChange={(e) =>
									setFormData({ ...formData, tags: e.target.value })
								}
								placeholder="Ex: utilitaire, npm, fix"
							/>
						</div>

						<div className="flex justify-end gap-3 mt-4">
							<Button type="button" variant="secondary" onClick={resetForm}>
								Annuler
							</Button>
							<Button type="submit">
								{editingId ? "Enregistrer" : "Créer le prompt"}
							</Button>
						</div>
					</form>
				</div>
			)}

			{loading ? (
				<div className="flex justify-center p-12">
					<RefreshCw className="w-8 h-8 text-primary animate-spin" />
				</div>
			) : prompts.length === 0 ? (
				<div className="glass-panel p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4">
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
							className="glass-panel p-5 rounded-xl flex flex-col gap-3 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5"
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

							<div className="text-sm mt-2 font-mono bg-black/5 dark:bg-black/20 p-2 rounded border border-border/50 text-muted-foreground h-[60px] overflow-hidden relative">
								{p.body}
								<div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#111] to-transparent"></div>
							</div>

							{p.tags && p.tags.length > 0 && (
								<div className="flex flex-wrap gap-1 mt-2">
									{p.tags.map((tag: string, i: number) => (
										<Badge
											key={i}
											variant="secondary"
											className="flex items-center gap-1 text-[10px] uppercase tracking-wider"
										>
											<Tag className="w-3 h-3" />
											{tag}
										</Badge>
									))}
								</div>
							)}

							<div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50">
								<Button
									variant="secondary"
									size="sm"
									onClick={() => handleCopy(p.body)}
									className="text-primary hover:text-primary bg-primary/10 hover:bg-primary/20"
								>
									<Code className="w-4 h-4 mr-1.5" />
									Copier
								</Button>
								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										onClick={() => handleEdit(p)}
										className="w-8 h-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
										title="Modifier"
									>
										<Edit2 className="w-4 h-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => handleDelete(p.id)}
										className="w-8 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
