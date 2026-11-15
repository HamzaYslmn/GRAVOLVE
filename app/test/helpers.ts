// Shared helpers for every test: the 16807 LCG some checks draw from, a slug's raw heat on a shield. Node only (excluded from tsc).
import { K_PER_HEAT } from '../src/core/water.ts';
import { COMP, impactHeat, radiusOf } from '../src/evolution/asteroid/rules.ts';
import { SLUG_SHARE, SLUG_SPEED } from '../src/evolution/civilization/rules.ts';

/** A seeded uniform draw in (0, 1): the Park–Miller LCG (seed × 16807 mod 2³¹ − 1). */
export const lcg = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
/** Raw heat (K) of a slug on a shield round a stony world of mass `you` (what weapon.ts puts on it). */
export const slugK = (you: number) => K_PER_HEAT * impactHeat(SLUG_SHARE / (1 + SLUG_SHARE), SLUG_SPEED, 8, radiusOf(you, COMP.stony));
