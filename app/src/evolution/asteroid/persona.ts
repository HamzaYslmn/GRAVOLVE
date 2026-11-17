// Rival personas by stage (docs/aliencivilizations.md): a named rival keeps one temper (rivals/ledger.ts); each stage reads
// it through its own table. Age I cores hunt, flee, tire and rest; Age II worlds never hunt you. Pure, Node-safe.
import { clamp01 } from '../../core/rng.ts';

/** hunt: how much more it wants you than a rock of your mass; meal: the largest share of its mass it eats; nerve: flees bodies
 *  heavier than nerve × its mass; stamina, rest, chase: × today's chase seconds, rest seconds and chase speed. */
export type Core = { hunt: number; meal: number; nerve: number; stamina: number; rest: number; chase: number };
/** trip: own diameters/s at most feeding; contest: prey score × (1 + contest × closeness to you); shy: you always count as a
 *  threat; flinch: you count as one while closing faster than this many of its diameters/s. */
export type World = { trip: number; nerve: number; contest: number; shy: boolean; flinch: number };

export const CORE = {
  grazer: { hunt: 3, meal: 0.8, nerve: 1, stamina: 1, rest: 1, chase: 1 }, // today's core
  hunter: { hunt: 6, meal: 0.87, nerve: 1.3, stamina: 2, rest: 0.5, chase: 1 }, // comes at you once it can eat you (1.15×)
  skittish: { hunt: 0, meal: 0.8, nerve: 0.8, stamina: 1, rest: 1, chase: 1 }, // never hunts you, bolts at 0.8×
  lunger: { hunt: 4, meal: 0.8, nerve: 1, stamina: 0.35, rest: 2, chase: 1 }, // short lunges, drifts off
  shadow: { hunt: 3, meal: 0.8, nerve: 1.1, stamina: 4, rest: 0.5, chase: 0.7 }, // slow, relentless, back soon
} satisfies Record<string, Core>;
export const WORLD = {
  settler: { trip: 1.5, nerve: 1, contest: 0, shy: false, flinch: Infinity }, // today's world
  rustler: { trip: 2.5, nerve: 1.3, contest: 2, shy: false, flinch: Infinity }, // rocks nearest you, doesn't make way
  hermit: { trip: 1.5, nerve: 0.8, contest: 0, shy: true, flinch: Infinity }, // backs away whatever your mass
  edger: { trip: 2, nerve: 1, contest: 2, shy: false, flinch: 2 }, // feeds beside you, backs off as you close
} satisfies Record<string, World>;
type CoreKey = keyof typeof CORE;
type WorldKey = keyof typeof WORLD;

export const CORE_OF: Record<string, CoreKey> = {
  brute: 'hunter', raider: 'hunter', stalker: 'shadow', prober: 'lunger', jackal: 'lunger', careful: 'skittish', hungry: 'grazer', grudger: 'grazer',
};
export const WORLD_OF: Record<string, WorldKey> = {
  brute: 'rustler', raider: 'rustler', hungry: 'rustler', prober: 'edger', jackal: 'edger', stalker: 'edger', careful: 'hermit', grudger: 'settler',
};
export const WILD: [CoreKey, number][] = [['hunter', 0.25], ['lunger', 0.2], ['shadow', 0.15], ['skittish', 0.15], ['grazer', 0.25]];

/** A core's persona: by temper (unknown: grazer), or drawn from WILD by `u` in [0, 1) for a wild core (no temper). */
export function coreOf(temper: string | undefined, u: number): Core {
  if (temper !== undefined) return CORE[CORE_OF[temper] ?? 'grazer'];
  for (const [k, w] of WILD) if ((u -= w) < 0) return CORE[k];
  return CORE.grazer;
}
export const worldOf = (temper: string | undefined): World => WORLD[(temper !== undefined && WORLD_OF[temper]) || 'settler'];

/** How much more a core wants you than a rock of your mass; a grudge (spite in [-1, 1]) sharpens it. 0 never wins prey. */
export const huntYou = (c: Core, spite = 0) => c.hunt * (1 + spite);
/** Whether a body of mass `om` is a threat to one of mass `m`; for a world, `you` closing at `closing` diameters/s count too. */
export const threat = (nerve: number, om: number, m: number, w?: World, you = false, closing = 0) =>
  om > nerve * m || (!!w && you && (w.shy || closing > w.flinch));
/** A world's prey score factor for a rock `gapYou` from your surface: 1 + contest at your side, 1 from half its `range`. */
export const contest = (w: World, gapYou: number, range: number) => 1 + w.contest * clamp01(1 - gapYou / (0.5 * range));
