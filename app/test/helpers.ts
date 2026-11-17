// Shared helpers for every test: the 16807 LCG some checks draw from, the src resolver. Node only (excluded from tsc).
import { registerHooks } from 'node:module';

/** A seeded uniform draw in (0, 1): the Park–Miller LCG (seed × 16807 mod 2³¹ − 1). */
export const lcg = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
/** src imports leave out '.ts' (Vite resolves them): call before the first src `await import` (Pixi-side checks). */
export const tsResolve = () => registerHooks({ resolve: (spec, ctx, next) => next(ctx.parentURL?.includes('/src/') && /^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec) ? `${spec}.ts` : spec, ctx) });
