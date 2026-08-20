import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

/**
 * Déclare les matchers de `@testing-library/jest-dom` sur l'`expect` de Bun.
 *
 * `bun test` est compatible Jest à l'exécution — les matchers fonctionnent dès
 * que `setupTests.ts` importe `@testing-library/jest-dom`. Mais leurs types ne
 * sont pas rattachés automatiquement : sans ce fichier, `tsc` rejette
 * `toBeInTheDocument`, `toHaveClass`, `toHaveAttribute` et les autres avec
 * « Property ... does not exist on type 'Matchers<HTMLElement>' », alors que les
 * tests passent.
 */
declare module "bun:test" {
	interface Matchers<T>
		extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
	interface AsymmetricMatchers
		extends TestingLibraryMatchers<unknown, unknown> {}
}
