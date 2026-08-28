/**
 * Formes de l'API Jira Cloud **effectivement utilisées**, dérivées du swagger.
 *
 * Le swagger complet (`docs/references/swagger-v3.v3.json`) génère 64 369 lignes
 * et 2,9 Mo de types, et fait passer `tsc --noEmit` de 4,6 s à 5,6 s — mesuré —
 * pour **deux** endpoints sur 421. On garde donc la valeur (une rupture de forme
 * casse la compilation) sans le poids.
 *
 * Régénérer le fichier complet quand on élargit la surface :
 *
 * ```
 * bun run jira:types      # → src/lib/jira/schema.d.ts, ignoré par git
 * ```
 *
 * puis recopier ici les seules formes consommées, en gardant la trace de
 * l'`operationId` d'origine. C'est délibérément manuel : chaque champ ajouté est
 * un champ dont on a vérifié qu'on en avait besoin.
 *
 * ⚠️ Le swagger est un **instantané** (`1001.0.0-SNAPSHOT-672ec0d…`). Ces types
 * garantissent la cohérence avec cette capture, pas avec l'instance interrogée.
 */

/**
 * Réponse de `GET /rest/api/3/myself` — `getCurrentUser`.
 *
 * Tout est optionnel dans la spec : un compte sans `displayName` existe, et le
 * test de connexion doit alors dire « connecté » sans inventer de nom.
 */
export interface JiraCurrentUser {
	accountId?: string;
	displayName?: string;
	emailAddress?: string;
	active?: boolean;
}

/** Référence par clé, forme que Jira accepte partout (`project`, `parent`). */
export interface JiraKeyRef {
	key: string;
}

/** Référence par nom (`issuetype`). */
export interface JiraNameRef {
	name: string;
}

/**
 * Référence par identifiant numérique.
 *
 * Jira accepte `{id}` **ou** `{name}` pour un composant. Aegis envoie l'`id` :
 * c'est ce que l'écran Réglages demande (« ex: 10452 »), et un nom envoyé comme
 * identifiant se ferait refuser en 400.
 */
export interface JiraIdRef {
	id: string;
}

/**
 * Document ADF, tel qu'`@atlaskit/adf-schema` le définit.
 *
 * On prend le type **officiel** plutôt qu'une approximation maison : la première
 * version de ce fichier déclarait un `AdfNode` simplifié, que le document
 * réellement construit par `@atlaskit/adf-utils` ne satisfaisait pas — ses
 * attributs sont des unions typées, pas un `Record<string, unknown>`. Le compilateur
 * l'a refusé, à raison.
 */
import type { DocNode } from "@atlaskit/adf-schema";

export type { DocNode };

/**
 * Corps de `POST /rest/api/3/issue` — `createIssue`, schéma `IssueUpdateDetails`.
 *
 * `fields` est un dictionnaire libre côté Jira : les champs personnalisés
 * s'appellent `customfield_10011`. On énumère donc ceux qu'Aegis envoie, et on
 * laisse la porte ouverte au reste.
 */
export interface JiraIssueCreate {
	fields: {
		project: JiraKeyRef;
		summary: string;
		description?: DocNode;
		issuetype: JiraNameRef;
		components?: Array<JiraIdRef | JiraNameRef>;
		parent?: JiraKeyRef;
		labels?: string[];
	} & Record<string, unknown>;
}

/**
 * Réponse 201 de `createIssue` — schéma `CreatedIssue`.
 *
 * `key` est optionnel dans la spec, alors que c'est la seule valeur qu'Aegis
 * conserve. L'appelant doit donc gérer son absence plutôt que de la supposer.
 */
export interface JiraCreatedIssue {
	id?: string;
	key?: string;
	self?: string;
}

/**
 * Corps d'erreur de Jira — schéma `ErrorCollection`, rendu sur 400 et 422.
 *
 * `errors` porte les refus **par champ** : c'est là que se lit « projectKey must
 * start with an uppercase letter » ou « issuetype is required », les deux causes
 * les plus fréquentes d'un échec de création. Aegis n'en affiche aujourd'hui que
 * le texte brut.
 */
export interface JiraErrorCollection {
	errorMessages?: string[];
	errors?: Record<string, string>;
	status?: number;
}

/**
 * Un type de ticket, tel que `createmeta` le rend — schéma `IssueTypeIssueCreateMetadata`.
 *
 * `subtask` compte : une sous-tâche exige un parent qui soit une tâche, pas une
 * epic. Les tickets d'Aegis se rattachent à une epic, donc les sous-tâches sont
 * écartées de la liste proposée.
 */
export interface JiraIssueTypeMeta {
	id?: string;
	name?: string;
	subtask?: boolean;
	description?: string;
}

/** Réponse de `GET /rest/api/3/issue/createmeta` — schéma `IssueCreateMetadata`. */
export interface JiraCreateMeta {
	projects?: Array<{
		key?: string;
		name?: string;
		issuetypes?: JiraIssueTypeMeta[];
	}>;
}
