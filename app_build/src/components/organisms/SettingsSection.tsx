import { RefreshCw, Save } from "lucide-react";
import type React from "react";

import { Button } from "../ui/button";

/**
 * Une section de réglages, avec **son propre bouton d'enregistrement**.
 *
 * L'écran Réglages était une carte unique — jeton GitHub, fenêtre d'audit,
 * options globales, Jira, zone de danger — suivie d'un seul « Enregistrer »
 * placé après quatre cent soixante lignes de formulaire, **sous la zone de
 * danger**. Conséquence observée : l'utilisateur remplit Jira, ne voit pas le
 * bouton, clique « Tester la connexion » et lit un refus qui lui reproche de ne
 * pas avoir renseigné ce qu'il vient de saisir.
 *
 * Chaque section enregistre donc **ses clés et rien d'autre** : `PUT
 * /api/settings` accepte un objet partiel, et `setAllSettings` n'écrit que ce
 * qu'on lui donne. Un réglage Jira raté ne fait plus échouer l'enregistrement de
 * la fenêtre d'audit, et réciproquement.
 *
 * Le bouton porte un **nom accessible propre à la section** (« Enregistrer les
 * paramètres Jira ») : avec quatre boutons nommés « Enregistrer », ni un lecteur
 * d'écran ni un test ne peut désigner le bon.
 */
export function SettingsSection({
	titre,
	icone,
	description,
	children,
	modifie,
	enregistrement,
	succes,
	erreur,
	onSave,
	pied,
}: {
	titre: string;
	icone?: React.ReactNode;
	description?: string;
	children: React.ReactNode;
	/** Le formulaire de cette section diverge-t-il de ce qui est enregistré ? */
	modifie: boolean;
	enregistrement: boolean;
	succes: boolean;
	erreur: string | null;
	onSave: () => void;
	/** Contenu additionnel dans le pied, à gauche du bouton (un test, un bilan). */
	pied?: React.ReactNode;
}) {
	return (
		<section className="bg-card border-border p-6 rounded-2xl flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h3 className="text-lg font-bold font-heading flex items-center gap-2">
					{icone}
					{titre}
				</h3>
				{description && (
					<p className="text-sm text-muted-foreground">{description}</p>
				)}
			</div>

			{children}

			<div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
				<div className="flex flex-wrap items-center gap-4 min-w-0">
					{pied}
					{/* L'état de l'enregistrement se lit **dans la section**, à côté du
					    bouton qui l'a déclenché. Un message global ne disait pas quelle
					    partie du formulaire avait échoué. */}
					{erreur && (
						<span role="alert" className="text-sm font-medium text-red-500">
							Échec de l'enregistrement : {erreur}
						</span>
					)}
					{succes && !erreur && (
						<span className="text-sm font-medium text-green-600 dark:text-green-400">
							Enregistré.
						</span>
					)}
					{modifie && !succes && !erreur && (
						<span className="text-sm text-amber-600 dark:text-amber-400">
							Modifications non enregistrées.
						</span>
					)}
				</div>

				<Button
					type="button"
					onClick={onSave}
					disabled={enregistrement || !modifie}
					aria-label={`Enregistrer ${titre}`}
				>
					{enregistrement ? (
						<RefreshCw className="w-4 h-4 mr-2 animate-spin" />
					) : (
						<Save className="w-4 h-4 mr-2" />
					)}
					Enregistrer
				</Button>
			</div>
		</section>
	);
}
