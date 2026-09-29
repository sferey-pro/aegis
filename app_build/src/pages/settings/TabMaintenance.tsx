import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, Download, Upload } from "lucide-react";
import React, { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { Button } from "@/components/ui/button";
import type { SnapshotInfo } from "@/db/backup";
import type { ResetResult } from "@/db/reset";
import { apiErrorMessage, fetchJson, fetchVoid } from "@/lib/api";
import { queryKeys } from "@/lib/api/queries";

export function TabMaintenance() {
	const queryClient = useQueryClient();

	// Backup state
	const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
	const [snapshotChoisi, setSnapshotChoisi] = useState("");
	const [backupLoading, setBackupLoading] = useState(false);
	const [backupMessage, setBackupMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	// Import state
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [importLoading, setImportLoading] = useState(false);

	// Reset state
	const [resetOpen, setResetOpen] = useState(false);
	const [_resetLoading, setResetLoading] = useState(false);
	const [resetDone, setResetDone] = useState<ResetResult | null>(null);
	const [resetError, setResetError] = useState<string | null>(null);

	const chargerSnapshots = React.useCallback(async () => {
		try {
			const data = await fetchJson<{ snapshots: SnapshotInfo[] }>(
				"/api/settings/backup/snapshots",
			);
			setSnapshots(data.snapshots);
			if (data.snapshots.length > 0 && !snapshotChoisi) {
				setSnapshotChoisi(data.snapshots[0]?.file || "");
			}
		} catch (e) {
			console.error("Impossible de charger les snapshots", e);
		}
	}, [snapshotChoisi]);

	React.useEffect(() => {
		chargerSnapshots();
	}, [chargerSnapshots]);

	const handleCreateSnapshot = async () => {
		setBackupLoading(true);
		setBackupMessage(null);
		try {
			await fetchVoid("/api/settings/backup/snapshot", { method: "POST" });
			setBackupMessage({
				type: "success",
				text: "Instantané créé avec succès.",
			});
			await chargerSnapshots();
		} catch (e) {
			setBackupMessage({ type: "error", text: apiErrorMessage(e) });
		} finally {
			setBackupLoading(false);
		}
	};

	const handleRestoreSnapshot = async () => {
		if (!snapshotChoisi) return;
		setBackupLoading(true);
		setBackupMessage(null);
		try {
			await fetchVoid(
				`/api/settings/backup/snapshot/${encodeURIComponent(snapshotChoisi)}/restore`,
				{ method: "POST" },
			);
			setBackupMessage({
				type: "success",
				text: "Instantané restauré. La page va se recharger.",
			});
			setTimeout(() => window.location.reload(), 1500);
		} catch (e) {
			setBackupMessage({ type: "error", text: apiErrorMessage(e) });
			setBackupLoading(false);
		}
	};

	const handleExport = () => {
		window.location.href = "/api/settings/export";
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setImportLoading(true);
		try {
			const formData = new FormData();
			formData.append("file", file);
			await fetchVoid("/api/settings/import", {
				method: "POST",
				body: formData,
			});
			alert("Import réussi !");
			window.location.reload();
		} catch (err) {
			alert(`Erreur lors de l'import: ${apiErrorMessage(err)}`);
			if (fileInputRef.current) fileInputRef.current.value = "";
		} finally {
			setImportLoading(false);
		}
	};

	const handleReset = async () => {
		setResetLoading(true);
		setResetError(null);
		try {
			const res = await fetchJson<ResetResult>("/api/settings/reset", {
				method: "POST",
			});
			setResetDone(res);
			queryClient.invalidateQueries({ queryKey: queryKeys.projects });
			queryClient.invalidateQueries({ queryKey: queryKeys.stats });
		} catch (err) {
			setResetError(apiErrorMessage(err));
		} finally {
			setResetLoading(false);
			setResetOpen(false);
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="bg-card border-border p-8 rounded-2xl">
				<h3 className="text-xl font-bold font-heading mb-6 flex items-center gap-2">
					<Database className="w-5 h-5 text-primary" />
					Sauvegarde & Restauration
				</h3>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
					<div className="flex flex-col gap-4">
						<h4 className="font-semibold text-lg">
							Snapshots SQLite (Recommandé)
						</h4>
						<p className="text-sm text-muted-foreground">
							Crée une copie parfaite de la base de données. Un instantané de
							l'état courant est pris automatiquement avant toute restauration.
						</p>

						<label
							htmlFor="snapshot-a-restaurer"
							className="text-sm font-medium mt-2"
						>
							Instantané à restaurer
						</label>
						<select
							id="snapshot-a-restaurer"
							value={snapshotChoisi}
							onChange={(e) => setSnapshotChoisi(e.target.value)}
							disabled={backupLoading || snapshots.length === 0}
							className="h-9 rounded-md border border-border bg-background px-3 text-sm font-mono disabled:opacity-50"
						>
							{snapshots.length === 0 && (
								<option value="">Aucun instantané disponible</option>
							)}
							{snapshots.map((s) => (
								<option key={s.file} value={s.file}>
									{s.file} — {s.counts.projects} projets, {s.counts.runs} runs
								</option>
							))}
						</select>

						<div className="flex gap-3 mt-2">
							<Button
								type="button"
								variant="secondary"
								onClick={handleCreateSnapshot}
								disabled={backupLoading}
							>
								Créer Snapshot
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={handleRestoreSnapshot}
								disabled={backupLoading || !snapshotChoisi}
							>
								Restaurer Snapshot
							</Button>
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<h4 className="font-semibold text-lg">Export / Import JSON</h4>
						<p className="text-sm text-muted-foreground">
							Export partiel incluant les projets et les tags, sans l'historique
							d'audit. Idéal pour migrer sa configuration de base vers une autre
							instance.
						</p>

						<input
							type="file"
							ref={fileInputRef}
							className="hidden"
							accept=".json"
							onChange={handleFileChange}
						/>

						<div className="flex gap-3 mt-auto">
							<Button type="button" variant="secondary" onClick={handleExport}>
								<Download className="w-4 h-4 mr-2" />
								Exporter
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={handleImportClick}
								disabled={importLoading}
							>
								<Upload className="w-4 h-4 mr-2" />
								Importer
							</Button>
						</div>
					</div>
				</div>

				{backupMessage && (
					<div
						className={`mt-6 p-4 rounded-xl text-sm font-medium border ${backupMessage.type === "error" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-green-500/10 text-green-600 border-green-500/20"}`}
					>
						{backupMessage.text}
					</div>
				)}
			</div>

			<div className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
				<span className="text-lg font-bold">Zone de danger</span>
				<p className="text-sm text-muted-foreground">
					Remet la configuration à zéro pour repartir d'un import de projets
					propre.
				</p>
				<ul className="mt-2 text-sm text-muted-foreground list-disc pl-5">
					<li>
						<strong>Supprimé</strong> : projets déclarés, historiques d'audit,
						décisions de triage, tags, configuration.
					</li>
					<li>
						<strong>Jamais touché</strong> : vos projets sur le disque.
					</li>
				</ul>

				{resetDone ? (
					<div
						role="status"
						className="mt-4 rounded-xl border bg-background/50 p-4 text-sm"
					>
						<p className="font-semibold">Configuration remise à zéro.</p>
						<p className="text-muted-foreground mt-1">
							La base a été recréée vide. {resetDone.projects} projets retirés.
						</p>
					</div>
				) : (
					<div className="mt-2">
						<Button
							type="button"
							variant="destructive"
							onClick={() => setResetOpen(true)}
						>
							<AlertTriangle className="w-4 h-4 mr-2" />
							Réinitialiser la configuration
						</Button>
					</div>
				)}
				{resetError && (
					<p className="text-sm text-destructive mt-2">{resetError}</p>
				)}

				<ConfirmDialog
					isOpen={resetOpen}
					onCancel={() => setResetOpen(false)}
					title="Réinitialiser l'application ?"
					message="Tous les projets et historiques seront effacés de la base de données. Cette action est irréversible."
					confirmText="Oui, tout effacer"
					cancelText="Annuler"
					onConfirm={handleReset}
				/>
			</div>
		</div>
	);
}
