// Water as ice, liquid or steam, shared by every evolution stage. Pure numbers: callers own the body.
// Surface temperature comes from the doc's heat units (0 = cold rock in space, 3 = molten). Water melts
// at 273 K; it boils at 373 K under a full atmosphere and at 273 K with none, so a body without air has
// no liquid water: warmed ice turns straight to steam (it sublimates, like a comet). Boiling carries heat
// away (latent heat), so a wet body that gets hot cools itself and sits near its boiling point until the
// water is spent. Gravity decides where the steam goes: a small body loses it to space, a big one keeps
// it as atmosphere (gas), which raises the pressure, so liquid water becomes possible on big bodies.
// ponytail: one well-mixed surface, no day/night or latitude.
import { clamp } from './rng.ts';

const SPACE_K = 120; // heat 0
export const K_PER_HEAT = 430; // heat 3 (molten) ≈ 1410 K, heat 1 (doc: heated) ≈ 550 K
export const MELT_K = 273;
const BOIL_K = 373; // at a full atmosphere (pressure 1)
const TRIPLE = 0.05; // pressure below which there is no liquid: ice turns straight to steam
const HOLD = [1e3, 10 ** 4.5]; // mass: below, gravity keeps no steam; above, all of it (log in between)
const AIR = 4; // pressure per share of held gas: a quarter gas on a body that holds it all = 1 atmosphere
const BOIL = 0.02; // share of the water per second, at full boil
const BOIL_SPAN = 200; // K above the boiling point for full boil
export const LATENT = 40; // heat used up per unit of mass share boiled (comets use it too)

const clamp01 = (x: number) => clamp(x, 0, 1);

/** Surface temperature in kelvin. */
export const kelvin = (heat: number) => SPACE_K + K_PER_HEAT * heat;
/** Heat units at a surface temperature in kelvin (inverse of kelvin). */
export const heatOfK = (k: number) => (k - SPACE_K) / K_PER_HEAT;

/** Share of its steam a body of mass m keeps as atmosphere (0..1). */
export const hold = (m: number) => clamp01(Math.log(m / HOLD[0]) / Math.log(HOLD[1] / HOLD[0]));

/**
 * Surface pressure in atmospheres, from the gas share the body holds. Above Planet mass (HOLD[1]) the same share
 * weighs more: a deeper column under stronger gravity, × (m / 10^4.5)^(2/3).
 */
export const pressure = (m: number, gas: number) => gas * hold(m) * AIR * Math.max(1, m / HOLD[1]) ** (2 / 3);

/** Where water boils at this pressure: 373 K at 1 atmosphere, down to 273 K at the triple point and below. */
export const boilingK = (p: number) => MELT_K + (BOIL_K - MELT_K) * clamp01(Math.log(p / TRIPLE) / Math.log(1 / TRIPLE));

export type WaterState = 'ice' | 'liquid' | 'steam';

/** What the water on a body is doing now. */
export function waterState(m: number, heat: number, gas: number): WaterState {
  const t = kelvin(heat), p = pressure(m, gas);
  return t < MELT_K ? 'ice' : p >= TRIPLE && t < boilingK(p) ? 'liquid' : 'steam';
}

/**
 * One step of boiling for a body of mass m with `water` and `gas` shares: the water mass that boils off,
 * how much of it gravity keeps (it becomes gas: atmosphere), and the heat it carries away.
 */
export function boil(m: number, heat: number, water: number, gas: number, dt: number) {
  const over = kelvin(heat) - boilingK(pressure(m, gas));
  if (water <= 0 || over <= 0) return { boiled: 0, kept: 0, cool: 0 };
  const boiled = m * water * BOIL * Math.min(2, over / BOIL_SPAN) * dt;
  return { boiled, kept: boiled * hold(m), cool: (LATENT * boiled) / m };
}
