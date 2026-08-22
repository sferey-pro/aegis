import { Badge } from "../ui/badge";

/**
 * Badge de tag, avec sa pastille de couleur.
 *
 * Un projet ne mémorise que les **noms** de ses tags ; la couleur vit dans la
 * table des tags. Les endroits qui affichaient un badge depuis un projet — carte
 * et tableau — n'avaient donc pas la couleur sous la main et rendaient le nom
 * seul, alors que le sélecteur du formulaire et les filtres, eux, affichaient
 * bien la pastille. D'où deux rendus du même tag selon l'écran.
 *
 * La couleur est passée en paramètre plutôt que résolue ici : ce composant ne
 * doit pas déclencher de requête, et l'appelant a déjà la liste des tags.
 */
export function TagBadge({ name, color }: { name: string; color?: string }) {
	return (
		<Badge
			variant="secondary"
			className="text-[10px] uppercase tracking-wider text-primary gap-1.5"
		>
			<span
				aria-hidden="true"
				className="w-2 h-2 rounded-full shrink-0"
				style={{
					// Repli sur la couleur d'accent : un tag dont la couleur n'est plus
					// dans la palette garde une pastille, plutôt que d'en perdre une.
					backgroundColor: `var(--color-${color ?? "slate"}-500, var(--primary))`,
				}}
			/>
			{name}
		</Badge>
	);
}
