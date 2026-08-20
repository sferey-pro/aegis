import { GlobalRegistrator } from "@happy-dom/global-registrator";

// 1. Installer d'abord un DOM dans le process Bun. `bun test` fournit
//    l'exécuteur, pas l'environnement navigateur : sans ceci, `render()` n'a
//    aucun `document` où monter les composants.
GlobalRegistrator.register({ url: "http://localhost:3001" });

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
await import("@testing-library/react");

// 3. Brancher les matchers jest-dom sur l'`expect` de Bun.
//
//    On passe par le sous-chemin `/matchers` plutôt que par l'entrée principale
//    du paquet : cette dernière n'expose que des références triple-slash, donc
//    `tsc` la rejette avec « is not a module ». `/matchers` exporte les matchers
//    et porte de vrais types. Leur rattachement au typage de `expect` est
//    déclaré dans `src/matchers.d.ts`.
const { expect } = await import("bun:test");
const matchers = await import("@testing-library/jest-dom/matchers");
expect.extend(matchers.default ?? matchers);

// 4. Signaler à React qu'il tourne dans un environnement de test, afin que les
//    mises à jour d'état déclenchées par les composants Radix soient traitées
//    comme encadrées par `act()`. Sans ce drapeau, chaque interaction produit un
//    avertissement « An update was not wrapped in act(...) » qui noie la sortie.
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
