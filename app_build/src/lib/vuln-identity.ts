/**
 * Identités d'une vulnérabilité — fonctions partagées (défaut N10).
 *
 * `CONTEXT.md` définit **trois** clés distinctes, et c'est délibéré : elles ne
 * servent pas la même chose.
 *
 * | Usage | Clé spécifiée | Granularité |
 * |---|---|---|
 * | dédoublonnage du parsing (§3) | `` `${package}\|${title}\|${cve ?? ""}` `` | la plus fine |
 * | diff `newCves` d'un run (§2) | `package::cve`, repli `package::title` | par projet |
 * | regroupement du triage (§7) | `cve`, repli `` `${package}: ${title}` `` | entre projets |
 *
 * Le défaut n'était donc pas d'avoir trois clés, mais d'en avoir une **quatrième,
 * non spécifiée** : la table `cve_occurrences` employait `cve || package`, seule
 * forme à laisser tomber le titre. Or `firstSeenAt`, `isBaseline`, `ageInDays` et
 * tous les indicateurs de SLA sont relus depuis cette table.
 *
 * Conséquence mesurée : `bun audit` remonte deux avis distincts sans CVE sur le
 * même paquet — son parseur ne remplit `cve` que depuis les CWE — et une seule
 * ligne d'occurrence était créée. Les deux failles héritaient du même
 * `first_seen_at` et du même `is_baseline` : un avis découvert ce matin
 * s'affichait avec l'âge d'une faille vue il y a six mois, marqué dette héritée
 * alors qu'il s'agissait d'une découverte nette. Un SLA construit là-dessus
 * s'auto-valide.
 *
 * La table s'aligne désormais sur la clé de `newCves` (§2), qui est celle de sa
 * granularité : une vulnérabilité, dans un projet.
 */

/** Référence affichable : la CVE trimée, ou `null` s'il n'y en a pas. */
export function vulnRef(cve?: string | null): string | null {
	const trimee = cve?.trim();
	return trimee && trimee.length > 0 ? trimee : null;
}

/**
 * Clé de regroupement entre projets (CONTEXT.md §7) : la CVE quand elle existe,
 * sinon `« paquet: titre »`. C'est la clé que l'écran de triage affiche et sur
 * laquelle le client annote.
 */
export function vulnKey(v: {
	package: string;
	title: string;
	cve?: string | null;
}): string {
	return vulnRef(v.cve) ?? `${v.package}: ${v.title}`;
}

/**
 * Référence d'une occurrence au sein d'un projet : la CVE, **repli sur le
 * titre** (CONTEXT.md §2). C'est ce qui est stocké dans la colonne `cve` de
 * `cve_occurrences`, et ce qui manquait : le repli était le nom du paquet, donc
 * identique pour tous les avis sans CVE de ce paquet.
 */
export function occurrenceRef(v: {
	title: string;
	cve?: string | null;
}): string {
	return vulnRef(v.cve) ?? v.title;
}

/** Clé d'occurrence complète : `package::cve`, repli `package::title` (§2). */
export function occurrenceKey(v: {
	package: string;
	title: string;
	cve?: string | null;
}): string {
	return `${v.package}::${occurrenceRef(v)}`;
}
