// Star takeover rules, plain numbers (no Pixi), checked by test/star/rules.test.ts. You don't become a star, you take one over:
// link to it, orbit it, enclose it in a Dyson sphere. Distances are in star radii (x = d / R★). "Fun first" marks
// deliberate departures from physics.
import { climateK, COLD_RAMP } from '../planet/rules.ts';
import { slotRadius } from '../../core/orbits.ts';
import { boilingK, heatOfK, MELT_K, pressure } from '../../core/water.ts';
import { G_WORLD, type Comp } from '../asteroid/rules.ts';
import { clamp } from '../../core/rng.ts';

// ---- What a star is. Mass in suns, skewed toward small stars: M = 0.4 · 20^(u²). Main sequence T ≈ 5,800 K · M^0.6.
const M_RANGE = [0.4, 8];
export const starMass = (u: number) => M_RANGE[0] * (M_RANGE[1] / M_RANGE[0]) ** (u * u);
export const starKelvin = (M: number) => 5800 * M ** 0.6;
/** Luminosity in suns: L ∝ M^3.5 (main sequence). */
export const luminosity = (M: number) => M ** 3.5;
/**
 * The light that reaches you (heat, dose) in game suns: M^0.6, the same curve as the colour. Fun first: with the
 * real L a blue giant would be 1,450× a sun; this way red dwarf 0.58, sun 1, blue giant 3.5, so danger reads from colour.
 */
export const glare = (M: number) => M ** 0.6;
// Stars in game units (stylised scale): one sun is SUN game mass, so a star's pull comes from its mass like any body's.
// Fun first: the radius barely grows with mass, so every system fits on screen, and the smallest still outsizes any planet.
export const SUN = 6e7;
export const starRadius = (M: number) => 800 * (M / M_RANGE[0]) ** 0.15;
/** A star's μ (u³/s²): G_WORLD · its game mass, no boost. */
export const starMu = (M: number) => G_WORLD * M * SUN;
const NAMES: [number, string][] = [[0, 'Red dwarf'], [4400, 'Orange star'], [5300, 'Yellow star'], [6500, 'White star'], [10000, 'Blue star'], [16000, 'Blue giant']];
export const starName = (K: number) => NAMES.filter(([k]) => K >= k).pop()![1];

/** Blackbody colour of a temperature (Tanner Helland's fit), 0xRRGGBB. */
export function starColor(K: number) {
  const t = K / 100;
  const r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332;
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * (t - 60) ** -0.0755;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  const c = (v: number) => Math.round(clamp(v, 0, 255));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

// ---- Approach: gated by physics, not a lock. A Dyson sphere blocks up to DIM of the light.
export const DIM = 0.8;
const dimmed = (glow: number, cover: number) => glow * (1 - DIM * clamp(cover, 0, 1));
// Radiation flux in civilization dose units (civilization/rules.ts dose): FLUX_K at x = 1. Light constants are compressed
// with the system (stylised scale): the liquid band sits at ~2–3.5 R★.
export const FLUX_K = 2.3;
export const flux = (glow: number, cover: number, x: number) => (FLUX_K * dimmed(glow, cover)) / (x * x);
// Kelvin the star adds to your climate target (planet/rules.ts climate `warm`). Fun first: 1/x sits between flux's 1/x²
// (liquid band a sliver) and equilibrium temperature's 1/√x (band the whole map). A sun adds 25 K at 2 R★.
const WARM_K = 50;
export const warmth = (glow: number, cover: number, x: number) => (WARM_K * Math.sqrt(dimmed(glow, cover))) / x;
const SUN_X = 3; // light on your collectors (civilization/rules.ts solar): 1 = a sun at 3 R★ (fun first: 1/x like warmth, no floor)
export const sunlight = (glow: number, cover: number, x: number) => (dimmed(glow, cover) * SUN_X) / x;
// One gravity: the star pulls you, loose bodies and other stars with starMu(M) / d² (floored at its surface); on you and on
// loose bodies only out to PULL_X R★. Rocks near a star fall in and burn (stars sweep their space clean).
export const PULL_X = 12;
export const starPull = (mu: number, d: number, R: number) => mu / Math.max(d, R) ** 2;
// Placed orbits (your world, system planets) never lap faster than LAP_MIN s (fun first: a blue giant's true lap is ~5 s).
export const LAP_MIN = 12;
export const lapMu = (mu: number, d: number) => Math.min(mu, ((2 * Math.PI) / LAP_MIN) ** 2 * d ** 3);
// Roche limit: d = 1.95 · R★ · (ρ★ / ρ)^(1/3), ρ★ = the Sun's mean density in game units (rock 3), clamped to ROCHE
// (compressed with the system: always inside the link band).
const RHO_STAR = 1.4;
const ROCHE = [1.3, 1.6];
export const roche = (rho: number) => clamp(1.95 * Math.cbrt(RHO_STAR / rho), ROCHE[0], ROCHE[1]);
// Inside it tides strip TEAR of your mass per second at the surface, 0 at the limit (fun first: a slow shredding you can
// escape; touching the star is the end).
const TEAR = 0.15;
export const tearRate = (x: number, limit: number) => (x >= limit ? 0 : (TEAR * (limit - x)) / Math.max(1e-6, limit - 1));
// Flares: random heat pulses (mean FLARE_MEAN s, no warning text; the star brightens first). FLARE_K kelvin at x = 1 for
// a sun; kept low enough that linking a good world doesn't boil its seas. For FLARE_S the dose is × FLARE_DOSE.
export const FLARE_MEAN = 20;
export const FLARE_RISE = 1.6; // s of visible brightening before the pulse
const FLARE_K = 9;
export const FLARE_S = 4;
export const FLARE_DOSE = 4;
export const FLARE_X = 6; // R★: farther out a flare is only a show
export const flareK = (glow: number, cover: number, x: number) => (x >= FLARE_X ? 0 : (FLARE_K * dimmed(glow, cover)) / (x * x));

// ---- Link (automatic): stay in the band for LINK_S; outside it progress decays DECAY× as fast.
export const BAND = [2, 4];
export const LINK_S = 60;
const DECAY = 2;
export const inBand = (x: number) => x >= BAND[0] && x <= BAND[1];
export const linkStep = (p: number, x: number, dt: number) => (inBand(x) ? Math.min(1, p + dt / LINK_S) : Math.max(0, p - (DECAY * dt) / LINK_S));

// ---- Compressed layout (stylised scale, so the system fits on screen), in R★ from the star's centre for a star of radius
// R and you of radius r with `slots` moon slots:
//   reach  your outer moon slot + half your radius (moons are at most 0.45 R);
//   orbit  your world's range: from max(BAND[0], 1.25 + reach) (your moons always clear the star) to 1.2 R★ beyond;
//   ring k a caught planet's ring outside your orbit `at`: at + reach + 0.4 + 0.35·k (rings always clear your moons;
//          planets are at most 0.15 R★, system.ts); the catch zone is ring 0 to ring 0 + 1.
export function layout(R: number, r: number, slots: number) {
  const reach = (slotRadius(r, Math.max(0, slots - 1)) + 0.5 * r) / R, lo = Math.max(BAND[0], 1.25 + reach);
  const ring = (k: number, at: number) => at + reach + 0.4 + 0.35 * k;
  return { reach, orbit: [lo, lo + 1.2] as [number, number], ring, catch: (at: number) => [ring(0, at), ring(0, at) + 1] };
}
// Your world's radius eases at ORBIT_RATE R★/s to orbitGoal: the middle of the liquid band's part inside the orbit range.
export const ORBIT_RATE = 0.8;
export const orbitGoal = (band: [number, number], [lo, hi]: [number, number]) => clamp((Math.max(band[0], lo) + Math.min(band[1], hi)) / 2, lo, hi);

// ---- System planets (concept 3): a round world (r ≤ PLANET_R R★) passing the catch zone slower than circular speed takes
// ring k (layout) and eases there at RING_RATE R★/s. Each one adds GROW to the star's mass. Fun first: a real star gains
// nothing visible from its planets; here growth is the reward.
export const PLANET_R = 0.15;
export const RING_RATE = 2;
export const GROW = 0.03;
/** Planets a star of M suns carries: 2 + ⌊2·log2(M / 0.4)⌋, at most 6 (red dwarf 2, sun 4, 1.6 suns 6). */
export const capacity = (M: number) => Math.min(6, 2 + Math.floor(2 * Math.log2(M / M_RANGE[0])));

/**
 * Where seas are liquid and comfortable (288 K .. boiling − 30 K) for a world of pressure p around a star of light `glow`
 * under Dyson cover `cover`: [inner, outer] in R★ (outer Infinity: its own greenhouse keeps it warm anywhere; undefined:
 * no such band). Cover dims the light, so the band moves inward.
 */
export function liquidBand(p: number, glow: number, cover: number): [number, number] | undefined {
  if (p < 0.05) return undefined; // no liquid without air (core/water.ts)
  const base = climateK(p), lo = MELT_K + COLD_RAMP, hi = boilingK(p) - 30, W = WARM_K * Math.sqrt(dimmed(glow, cover));
  if (hi <= base || hi <= lo) return undefined;
  return [W / (hi - base), lo > base ? W / (lo - base) : Infinity];
}

// ---- Dyson sphere: SEGMENTS of SEG_ORE ore, SEG_S each (build speed 1), each a band of PANELS / SEGMENTS panels delivered
// by ship, equator first. DONE coverage completes the stage.
export const SEGMENTS = 10;
export const SEG_ORE = 60;
export const SEG_S = 20;
export const PANELS = 400;
export const DONE = 0.5;
// Energy: DYSON_E · √L · cover E/s. Fun first: √L keeps the order of stars without a blue giant giving 3,600× a sun.
const DYSON_E = 20;
export const dysonEnergy = (M: number, cover: number) => DYSON_E * Math.sqrt(luminosity(M)) * clamp(cover, 0, 1);
// Fun first: once the star is yours your people lift LIFT ore/s off it, so a world with mined-out moons still finishes.
export const LIFT = 0.2;

// ---- Energy beam (concept 4): from BEAM_COVER of Dyson cover, Fire works like a gun (civilization/combat.ts). Its power
// P = √(cover / BEAM_COVER) × M^0.3 scales the bite (civilization/rules.ts BEAM_BITE) and the heat, BEAM_K × P kelvin.
// A shot costs BEAM_COST of the star's mass; none that would leave it under BEAM_MIN suns.
export const BEAM_COVER = 0.2;
const BEAM_K = 20;
export const BEAM_COST = 0.002;
export const BEAM_MIN = 0.3;
export const beamPower = (M: number, cover: number) => Math.sqrt(clamp(cover, 0, 1) / BEAM_COVER) * M ** 0.3;
export const beamK = (P: number) => BEAM_K * P;
export const beamFed = (M: number) => M * (1 - BEAM_COST) >= BEAM_MIN;

// ---- Star engine (from the link): your thrust steers the star. ENGINE × thrust × (ENGINE_BASE + √(Dyson E/s ÷ 10)),
// capped at 2×, with drag ENGINE_DRAG (coasts to a stop in a few seconds).
const ENGINE = 2;
const ENGINE_BASE = 0.6;
export const ENGINE_DRAG = 0.4;
export const engineAccel = (thrust: number, E: number) => ENGINE * thrust * clamp(ENGINE_BASE + Math.sqrt(Math.max(0, E) / 10), ENGINE_BASE, 2);

// ---- Where stars are (world units). One star per CELL × CELL cell (present with STAR_CHANCE, inside the cell's middle 60%),
// the first FIRST from you so the stage starts within a short flight.
export const CELL = 120000;
export const FIRST = 24000;
export const STAR_CHANCE = 0.6;
// Far light: a soft additive glow FAR_LIGHT in radius around every star (look.ts), a landmark you find by eye.
export const FAR_LIGHT = 60000;

// ---- Colonies (concept 4–6): a planet your star catches gets a carrier + colony ship for COLONY ore, volatiles and bn of
// people (it waits for stock). At COLONY_HAB it is a colony, else your miners terraform it: TERRA_VOL volatiles a delivery
// bring +TERRA_ATM atm or +TERRA_WATER water share. A colony under COLONY_LOST (hysteresis) or past the gas line is lost.
export const COLONY = { ore: 60, vol: 40, pop: 1 };
export const COLONY_HAB = 0.3;
export const COLONY_LOST = 0.15;
export const TERRA_VOL = 20;
export const TERRA_ATM = 0.1;
export const TERRA_WATER = 0.02;
type Scores = { water: number; temp: number; air: number; magnet: number };
/**
 * A planet's habitability from planet/rules.ts habitability's scores: the weakest of water / temperature / air × (0.5 +
 * 0.5 × field). Life speed without its "field above 0" gate: miners can bring air and water, not a core.
 */
export const colonyScore = (h: Scores) => Math.min(h.water, h.temp, h.air) * (0.5 + 0.5 * h.magnet);
/** What a delivery brings: the weaker of air ('gas') and water ('ice') while it holds the score under COLONY_HAB. */
export function terraNeed(h: Scores): 'gas' | 'ice' | undefined {
  const goal = COLONY_HAB / (0.5 + 0.5 * h.magnet);
  if (h.air < goal && h.air <= h.water) return 'gas';
  return h.water < goal ? 'ice' : undefined;
}
/** Mass one delivery adds to a world of mass m: +TERRA_ATM of pressure (gas) or +TERRA_WATER of water share (ice). */
export function terraMass(m: number, c: Comp, need: 'gas' | 'ice') {
  if (need === 'ice') return (TERRA_WATER * m) / Math.max(0.05, 1 - (c.ice ?? 0) - TERRA_WATER);
  return (TERRA_ATM * m) / Math.max(1e-6, pressure(m, 1) * (1 - (c.gas ?? 0)));
}
/** Dyson build speed with n colonies (concept 4: more living planets speed the sphere). */
export const dysonSpeed = (n: number) => 1 + 0.5 * n;
/** Body.heat of a planet with p atm of air warmed by `warm` kelvin of starlight (the climate's target, planet/rules.ts). */
export const heatAt = (p: number, warm: number) => heatOfK(climateK(p) + warm);
/**
 * The ring (R★) a living planet takes: in its liquid band clamped to `range`, nearest the band's middle, at least
 * `gap` from every taken radius (your world's orbit, other living planets), in 0.1 R★ steps; undefined: no room.
 */
export function zoneSlot(band: [number, number], taken: number[], gap: number, [a, b]: [number, number]) {
  const lo = clamp(band[0], a, b), hi = clamp(band[1], a, b), mid = (lo + hi) / 2;
  let best: number | undefined;
  for (let x = lo; x <= hi + 1e-9; x += 0.1) if (taken.every((t) => Math.abs(t - x) >= gap) && (best === undefined || Math.abs(x - mid) < Math.abs(best - mid))) best = x;
  return best;
}
