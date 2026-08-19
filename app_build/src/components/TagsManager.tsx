import { Plus, RefreshCw, Tag, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

export function TagsManager() {
	const [tags, setTags] = useState<
		{ id: number; name: string; color: string }[]
	>([]);
	const [loading, setLoading] = useState(true);
	const [newName, setNewName] = useState("");
	const [newColor, setNewColor] = useState("indigo");
	const [error, setError] = useState("");

	const fetchTags = async () => {
		try {
			const res = await fetch("/api/tags");
			setTags(await res.json());
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchTags();
	}, []);

	const handleAdd = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!newName.trim()) return;
		setError("");

		try {
			const res = await fetch("/api/tags", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: newName.trim(), color: newColor }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);

			setNewName("");
			fetchTags();
		} catch (err: any) {
			setError(err.message);
		}
	};

	const handleDelete = async (id: number) => {
		try {
			await fetch(`/api/tags/${id}`, { method: "DELETE" });
			fetchTags();
		} catch (err) {
			console.error(err);
		}
	};

	return (
		<div className="bg-card border-border p-8 rounded-2xl slide-in-from-bottom-6 delay-100 mt-8">
			<div className="flex items-start gap-4 mb-6">
				<div className="w-12 h-12 rounded-2xl flex items-center justify-center border">
					<Tag className="w-6 h-6" />
				</div>
				<div className="flex-1">
					<h2 className="text-2xl font-bold font-heading">Tags de Projets</h2>
					<p className="text-muted-foreground mt-1">
						Gérez les étiquettes prédéfinies que vous pouvez associer aux
						projets pour les classer (ex: Prod, Backend).
					</p>
				</div>
			</div>

			<form
				onSubmit={handleAdd}
				className="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-6 dark:bg-black/20 p-4 rounded-xl border"
			>
				<div className="flex flex-col flex-1 w-full gap-1">
					<label className="text-xs font-semibold uppercase text-muted-foreground">
						Nom du tag
					</label>
					<Input
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder="Ex: API"
						required
					/>
				</div>
				<div className="flex flex-col w-full sm:w-auto gap-1">
					<label className="text-xs font-semibold uppercase text-muted-foreground">
						Couleur
					</label>
					<div className="flex items-center gap-2 px-1 py-1 h-[42px]">
						{[
							"indigo",
							"red",
							"orange",
							"yellow",
							"green",
							"blue",
							"purple",
							"pink",
						].map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => setNewColor(c)}
								className={`w-6 h-6 rounded-full ${newColor === c ? "ring-2 scale-110" : "opacity-70 "}`}
								style={{
									backgroundColor: `var(--color-${c}-500, var(--primary))`,
								}}
								title={c}
							/>
						))}
					</div>
				</div>
				<Button type="submit" className="mt-5 w-full sm:w-auto">
					<Plus className="w-4 h-4 mr-2" /> Ajouter
				</Button>
			</form>

			{error && (
				<p className="text-red-400 text-sm mb-4 p-3 rounded-lg border">
					{error}
				</p>
			)}

			{loading ? (
				<div className="flex justify-center p-8">
					<RefreshCw className="w-6 h-6 text-primary" />
				</div>
			) : tags.length === 0 ? (
				<p className="text-center text-muted-foreground p-8 rounded-xl border">
					Aucun tag configuré.
				</p>
			) : (
				<div className="flex flex-wrap gap-2">
					{tags.map((t) => (
						<Badge
							key={t.id}
							variant="secondary"
							className="flex items-center gap-1.5 px-3 py-1 text-sm font-semibold"
						>
							<span
								className="w-2.5 h-2.5 rounded-full"
								style={{
									backgroundColor: `var(--color-${t.color}-500, var(--primary))`,
								}}
							></span>
							{t.name}
							<button
								type="button"
								onClick={() => handleDelete(t.id)}
								className="ml-1 text-muted-foreground"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</Badge>
					))}
				</div>
			)}
		</div>
	);
}
