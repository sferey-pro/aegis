import { GlobalRegistrator } from "@happy-dom/global-registrator";

// 0. Conserver le `fetch` natif de Bun AVANT que happy-dom ne le remplace.
//
//    Le `fetch` du DOM applique la politique de même origine : le document de
//    test étant servi depuis `localhost:3001`, toute requête vers un serveur
//    lancé sur un autre port est refusée avec « Cross-Origin Request Blocked ».
//    Les tests fonctionnels, qui démarrent un vrai serveur sur port éphémère, ont
//    besoin de cette référence. Voir `src/test/server.ts`.
(globalThis as { __nativeFetch?: typeof fetch }).__nativeFetch =
	globalThis.fetch;

// 1. Installer un DOM dans le process Bun. `bun test` fournit l'exécuteur, pas
//    l'environnement navigateur : sans ceci, `render()` n'a aucun `document` où
//    monter les composants.
// Le DOM est installé sauf demande contraire. Les tests fonctionnels le
// désactivent via AEGIS_TEST_NO_DOM : happy-dom remplace la classe globale
// `Response`, or les handlers de `Bun.serve` construisent leurs réponses avec
// elle. Un serveur réel démarré sous DOM échoue donc avec « Expected a Response
// object, but received 'Response {…}' ».
const domActif = !process.env.AEGIS_TEST_NO_DOM;
if (domActif) {
	GlobalRegistrator.register({ url: "http://localhost:3001" });
}

// 2. Charger ensuite Testing Library, et seulement ensuite.
//
//    ⚠️ Ces imports sont dynamiques à dessein — ne pas les repasser en `import`
//    statique. Les imports statiques sont hoistés : ils s'évaluent avant la
//    première instruction du module, donc avant `register()` ci-dessus, quelle
//    que soit leur position dans le fichier.
//
//    Or `@testing-library/dom` construit son objet `screen` au moment de son
//    évaluation, en capturant `document.body`. Évalué trop tôt, `screen` est
//    peuplé de fonctions qui lèvent « For queries bound to document.body a
//    global document has to be available », et tout test l'utilisant échoue —
//    alors que `typeof document` vaut bien "object" dans le corps du test, ce
//    qui rend le symptôme très trompeur.
if (domActif) {
	await import("@testing-library/react");
}

// 3. Brancher les matchers jest-dom sur l'`expect` de Bun.
//
//    On passe par le sous-chemin `/matchers` plutôt que par l'entrée principale
//    du paquet : cette dernière n'expose que des références triple-slash, donc
//    `tsc` la rejette avec « is not a module ». `/matchers` exporte les matchers
//    et porte de vrais types. Leur rattachement au typage de `expect` est
//    déclaré dans `src/matchers.d.ts`.
if (domActif) {
	const { expect } = await import("bun:test");
	const matchers = await import("@testing-library/jest-dom/matchers");
	expect.extend(matchers.default ?? matchers);
}

// 4. Signaler à React qu'il tourne dans un environnement de test, afin que les
//    mises à jour d'état déclenchées par les composants Radix soient traitées
//    comme encadrées par `act()`. Sans ce drapeau, chaque interaction produit un
//    avertissement « An update was not wrapped in act(...) » qui noie la sortie.
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
