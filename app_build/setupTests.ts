import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost:3001" });

// ⚠️ Ces deux imports sont dynamiques, et ce n'est pas un détail de style.
//
// Les `import` statiques sont hoistés : ils sont évalués avant la première
// instruction du module, donc avant `register()` ci-dessus, quelle que soit leur
// position dans le fichier. Or `@testing-library/dom` construit son objet
// `screen` au moment de son évaluation, en capturant `document.body`. Évalué
// trop tôt, `screen` est peuplé de fonctions qui lèvent
// « For queries bound to document.body a global document has to be available »,
// et tout test utilisant `screen` échoue.
//
// C'est le défaut qu'avait ce fichier : `import "@testing-library/jest-dom"` y
// était statique, donc hoisté au-dessus de `register()`. Le rendre dynamique
// garantit que le DOM existe avant l'évaluation de la bibliothèque.
await import("@testing-library/jest-dom");
await import("@testing-library/react");
