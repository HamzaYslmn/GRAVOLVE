// Age II (Worlds) rules from docs/gamedesign.html as plain numbers (no Pixi), checked by test/planet/rules.test.ts.
// Takes over at AGE_GOAL (Planetoid): tiers by mass and composition, climate (greenhouse, rain, boiling,
// vapour leaking away), habitability (the doc's four scores) and life (one step: LIFE, an intelligent species).
// Age II heat is inner heat, impacts, meals and radioactive rock; star light arrives in Age III.
import { boilingK, heatOfK, kelvin, LATENT, MELT_K, pressure, waterState, type WaterState } from '../../core/water.ts';
import { clamp01 } from '../../core/rng.ts';
import { matchQuality, matchStep, slotRadius } from '../../core/orbits.ts';
import { AGE_GOAL, blend, COOL, MOLTEN, START_R, tierAt, TIERS, uncapR, type Comp } from '../asteroid/rules.ts';

/** 0 at a, 1 at b (either order), clamped. */
const ramp = (a: number, b: number, x: number) => clamp01((x - a) / (b - a));

// ---- Tiers (doc: Çağ II tree and "Kütle eşikleri")
export const PROTO_M = 1e4; // Protoplanet while molten, Dwarf planet once solid
export const PLANET_M = 10 ** 4.5;
export const SUPER_M = 1e5; // Super-Earth (rocky) / Mini-Neptune (gas line)
const ICE_GIANT_M = 10 ** 5.5; // ice + gas ≥ 60%, on the gas line
const GAS_GIANT_M = 1e6; // gas ≥ 70%
const SUPER_JUPITER_M = 10 ** 6.5;
export const BROWN_DWARF_M = 1e7; // Age III starts
const AGE2_STEPS = [SUPER_M, ICE_GIANT_M, GAS_GIANT_M, SUPER_JUPITER_M, BROWN_DWARF_M];

const gasOf = (c: Comp) => c.gas ?? 0;
const iceOf = (c: Comp) => c.ice ?? 0;
const solidOf = (c: Comp) => (c.rock ?? 0) + (c.metal ?? 0) + (c.radio ?? 0);
/** Gas line: in at 20% gas (doc), out only below 15% so names don't flip back and forth. */
const GAS_LINE = [0.2, 0.15];
export const GAS_WARN = 0.15; // the HUD warns a rocky world from here
export const gasPath = (c: Comp) => gasOf(c) >= GAS_LINE[0];
/** The sticky gas line: `was` = on it last frame. */
export const onGasLine = (was: boolean, c: Comp) => gasOf(c) >= GAS_LINE[was ? 1 : 0];
/** A gas-line world past Super-Earth mass: a deep envelope, no surface for life (doc). */
export const envelope = (m: number, c: Comp, line = gasPath(c)) => m >= SUPER_M && line;
/** Share of the surface the seas cover: 30% water makes an ocean world (doc). */
export const seaCover = (water: number) => Math.min(1, (Math.max(0, water) / 0.3) ** 0.6);

/** Tier name for a world of mass m (`line`: on the sticky gas line). Below the planetoid it's Age I's ladder. */
export function tierName(m: number, comp: Comp, heat: number, line = gasPath(comp)): string {
  const gas = gasOf(comp);
  if (m >= BROWN_DWARF_M && line) return 'Brown dwarf';
  if (m >= SUPER_JUPITER_M && gas >= 0.7) return 'Super-Jupiter';
  if (m >= GAS_GIANT_M && gas >= 0.7) return 'Gas giant';
  if (m >= ICE_GIANT_M && line && gas + iceOf(comp) >= 0.6) return 'Ice giant'; // on the gas line, like envelope: a wet rocky world stays Super-Earth
  if (m >= SUPER_M) return line ? 'Mini-Neptune' : 'Super-Earth';
  if (m >= PLANET_M) return solidOf(comp) >= 0.6 ? 'Rocky planet' : 'Planet';
  if (m >= PROTO_M) return heat > MOLTEN ? 'Protoplanet' : 'Dwarf planet';
  return TIERS[tierAt(m)][1];
}

/** Tier count over the whole ladder (Age I tiers + Age II mass steps), for the tier-up reward. */
export const tierIndex = (m: number) => tierAt(m) + AGE2_STEPS.filter((t) => m >= t).length;

/** The next named goal by mass on your line; `need` = the composition the doc asks for. Undefined: a rocky world's goal is life. */
export function nextGoal(m: number, comp: Comp, line = gasPath(comp)): { name: string; mass: number; need?: string } | undefined {
  const gas = gasOf(comp), ice = iceOf(comp);
  if (m < TIERS[7][0]) return { name: 'Planetoid', mass: TIERS[7][0] };
  if (m < PROTO_M) return { name: 'Protoplanet', mass: PROTO_M };
  if (m < PLANET_M) return { name: 'Planet', mass: PLANET_M };
  if (m < SUPER_M) return { name: line ? 'Mini-Neptune' : 'Super-Earth', mass: SUPER_M };
  if (!line) return undefined;
  if (m < ICE_GIANT_M) return { name: 'Ice giant', mass: ICE_GIANT_M, need: gas + ice < 0.6 ? 'water + gas 60%' : undefined };
  if (m < GAS_GIANT_M) return { name: 'Gas giant', mass: GAS_GIANT_M, need: gas < 0.7 ? 'gas 70%' : undefined };
  if (m < SUPER_JUPITER_M) return { name: 'Super-Jupiter', mass: SUPER_JUPITER_M, need: gas < 0.7 ? 'gas 70%' : undefined };
  if (m < BROWN_DWARF_M) return { name: 'Brown dwarf', mass: BROWN_DWARF_M };
  return undefined;
}

// ---- Climate
// The surface settles toward 120 K + INNER_K × p^TRAP: what the air keeps of the inner heat. No air: 120 K;
// 0.34 atm: 273 K (melts); 2.56 atm: 373 K (boils), so seas stay liquid at rest between those. Game numbers:
// with no star yet, the greenhouse has only inner heat to trap.
const INNER_K = 200;
const TRAP = 0.25;
const RELAX_S = 10; // s: extra heat settles toward the climate in RELAX_S × (1 + the excess in heat units)
export const climateK = (p: number) => kelvin(0) + INNER_K * Math.max(0, p) ** TRAP;

/**
 * Heat after one step. tickBody (asteroid/body.ts) already cooled it toward 0 at rate c this frame; this puts
 * back the climate's share and relaxes the rest toward the climate heat H at max(c, 1 / (RELAX_S × (1 + excess))).
 */
function settle(heat: number, H: number, c: number, dt: number) {
  heat += H * (1 - Math.exp(-c * dt));
  return H + (heat - H) * Math.exp(-Math.max(0, 1 / (RELAX_S * (1 + Math.max(0, heat - H))) - c) * dt);
}

// Vapour: kept steam, part of the gas share. Below boiling − RAIN_GAP it rains out at RAIN of the vapour per
// second, giving back RAIN_LATENT of its latent heat (the rest radiates away, or a steam world would take ten
// minutes to rain out). Above boiling it leaks to space at LEAK per second: a runaway greenhouse costs water.
const RAIN = 0.08;
export const RAIN_GAP = 5; // K
const RAIN_SPAN = 30; // K below the gap for full rain
const RAIN_LATENT = 0.05;
const LEAK = 0.005;

/** The body as Age II sees it (the asteroid Body fits). */
export type World = { m: number; r: number; comp: Comp; heat: number; diff?: number };
/** Age II's own state: water vapour in the air (mass), and the gas mass seen before the player's update. */
export type Sky = { vapor: number; gas0: number };

/** Call before the player's update (it boils water): the gas that appears until `climate` is kept steam. */
export const beforeClimate = (sky: Sky, b: World) => void (sky.gas0 = b.m * gasOf(b.comp));
/** Runs `feed` (moons ground onto you) between beforeClimate and climate: the gas it brings is air, not steam that rains out. */
export const fedAir = (sky: Sky, b: World, feed: () => void) => { const g = b.m * gasOf(b.comp); feed(); sky.gas0 += b.m * gasOf(b.comp) - g; };

/**
 * One climate step after the player's update. Changes heat, comp and mass; returns the mass leaked to space.
 * `warm`: kelvin a star's light adds to the climate's target (Age III).
 */
export function climate(sky: Sky, b: World, dt: number, warm = 0) {
  const gasM = b.m * gasOf(b.comp);
  sky.vapor = Math.min(gasM, sky.vapor + Math.max(0, gasM - sky.gas0));
  const p = pressure(b.m, gasOf(b.comp));
  b.heat = settle(b.heat, heatOfK(climateK(p) + warm), (COOL * START_R) / b.r, dt);
  const T = kelvin(b.heat), bp = boilingK(p);
  if (sky.vapor <= 0) return 0;
  if (T < bp - RAIN_GAP) {
    const rained = sky.vapor * RAIN * Math.min(1, (bp - RAIN_GAP - T) / RAIN_SPAN) * dt;
    b.comp = blend(blend(b.comp, b.m, { gas: 1 }, -rained), b.m - rained, { ice: 1 }, rained);
    b.heat += (RAIN_LATENT * LATENT * rained) / b.m;
    sky.vapor -= rained;
    return 0;
  }
  if (T < bp) return 0;
  const leaked = sky.vapor * LEAK * dt;
  b.comp = blend(b.comp, b.m, { gas: 1 }, -leaked);
  b.m -= leaked;
  sky.vapor -= leaked;
  return leaked;
}

// ---- Habitability (doc: "Yaşam uygunluğu", four scores 0..1)
/**
 * Magnetic field 0..1 (doc: metal core + inner heat). Core: sunk metal (Body.diff, grows only while molten) ×
 * the metal share, full at FIELD_METAL. Dynamo: small worlds freeze their core, so it grows from 0 at the planetoid
 * to 1 at a planet (log mass); radioactive rock keeps a core churning, and so does more sunk metal (up to FIELD_BOOST ×).
 */
export const FIELD_METAL = 0.06;
const FIELD_BOOST = 2; // sunk metal past FIELD_METAL multiplies a weak dynamo, up to 2× (12%)
/** The field's three levers, 0..1 each, for the HUD tip: metal share (as if all sunk), how far it sank, size. */
export const fieldParts = (m: number, comp: Comp, diff: number) => ({
  metal: clamp01((comp.metal ?? 0) / FIELD_METAL), sunk: clamp01(diff), size: clamp01(Math.log10(m / TIERS[7][0]) + 5 * (comp.radio ?? 0)),
});
export const magnet = (m: number, comp: Comp, diff: number) =>
  clamp01(Math.min(FIELD_BOOST, ((comp.metal ?? 0) * diff) / FIELD_METAL) * fieldParts(m, comp, diff).size);
/** Life speed: the weakest of water / temperature / air (scores 0..1) × (0.5 + 0.5 × field); no field, no life. */
export const lifeSpeed = (water: number, temp: number, air: number, field: number) =>
  field > 0 ? Math.min(water, temp, air) * (0.5 + 0.5 * field) : 0;
export const COLD_RAMP = 8; // K above melting for a full temperature score
export const HOT_RAMP = 30; // K under boiling where seas start to suffer (the temperature score falls to 0 at boiling)
export const AIR_LO = 0.2; // atm where the air score starts (life needs air)
// Radioactive rock and life: a little warms the crust and stirs mutation (best at 1%), past the tier-1 safe share (3%) it slows life, never to a stop.
const RADIO_BEST = 0.01, RADIO_HARM = 0.03, RADIO_WORST = 0.12, RADIO_BONUS = 0.25, RADIO_FLOOR = 0.25;
/** Life speed factor from the radioactive share: 1 clean, 1.25 at 1%, 1 at 3%, RADIO_FLOOR from 12% on. */
export const radioLife = (s: number) => s <= RADIO_BEST ? 1 + (RADIO_BONUS * Math.max(0, s)) / RADIO_BEST
  : s <= RADIO_HARM ? 1 + (RADIO_BONUS * (RADIO_HARM - s)) / (RADIO_HARM - RADIO_BEST) : 1 - (1 - RADIO_FLOOR) * ramp(RADIO_HARM, RADIO_WORST, s);

type Hab = {
  water: number; temp: number; air: number; magnet: number; // scores 0..1
  rate: number; // life speed (lifeSpeed × radioLife)
  k: number; p: number; bp: number; state: WaterState; // surface kelvin, pressure (atm), boiling point, water
};

/** The doc's four life conditions for a world. */
export function habitability(b: World): Hab {
  const gas = gasOf(b.comp), w = iceOf(b.comp), p = pressure(b.m, gas), k = kelvin(b.heat), bp = boilingK(p);
  const state = waterState(b.m, b.heat, gas);
  const water = ramp(0.1, 0.3, w) * (1 - 0.5 * ramp(0.6, 0.9, w)); // doc: from 10%, 30–60% ideal; deeper buries all land
  const temp = state === 'liquid' ? ramp(MELT_K, MELT_K + COLD_RAMP, k) * ramp(bp, bp - HOT_RAMP, k) : 0;
  const air = ramp(AIR_LO, 0.7, p) * (1 - ramp(10, 30, p));
  const mag = magnet(b.m, b.comp, b.diff ?? 0);
  return { water, temp, air, magnet: mag, rate: lifeSpeed(water, temp, air, mag) * radioLife(b.comp.radio ?? 0), k, p, bp, state };
}

/**
 * Growing at today's `gas` share thickens the air and the resting climate (+ `warm` starlight) climbs toward boiling: the masses
 * where seas start to suffer (HOT_RAMP under boiling) and where they boil; `m` if already there, Infinity if never. Bisects from
 * `m` up, from AIR_LO only (no seas in thinner air): climate − boiling dips until ~0.199 atm, then only rises, so one crossing.
 */
export function airLimits(m: number, gas: number, warm = 0) {
  const at = (off: number) => {
    const over = (x: number) => { const p = pressure(x, gas); return p >= AIR_LO && climateK(p) + warm >= boilingK(p) - off; };
    let lo = Math.max(1, m), hi = 1e12;
    if (over(lo)) return m;
    if (!(gas > 0) || !over(hi)) return Infinity;
    while (hi / lo > 1 + 1e-6) { const mid = Math.sqrt(lo * hi); if (over(mid)) hi = mid; else lo = mid; }
    return hi;
  };
  return { suffer: at(HOT_RAMP), boil: at(0) };
}

// ---- Life
// While all four conditions hold, life fills for LIFE_S s at life speed 1, then LIFE appears: an intelligent
// species, which ends Age II and starts the civilization.
export const LIFE_S = 30; // progress (s at full speed) to life: an intelligent species
const LIFE_CAP = 1.5; // life keeps filling past LIFE to this × its threshold: a buffer, so a short spell of bad conditions or a hard hit does not end it
const DIE = 0.5; // progress lost per second while conditions fail (frozen worlds only pause: life under the ice)
// Setbacks read the heat a hit delivered, not the impactor's mass, so a gentle meal costs nothing.
// ≥ EXTINCT[0] K: SOFT_S of progress; ≥ EXTINCT[1] K: life wiped out (it fills again from zero).
export const EXTINCT = [20, 150]; // K delivered
export const SOFT_S = 10;
export type Life = { progress: number; calm: number }; // calm: s since the last mass extinction

// ---- Calm: a world that stays in one place clears its neighbourhood. Bombardment multiplies the Age II meteor
// and comet rates and the share aimed near you (asteroid/field.ts); `settled` = seconds slower than SETTLE_V.
export const SETTLE_V = 2; // own diameters/s
const BOMB_FLOOR = 0.15;
const BOMB_S = 120;
export const bombardment = (settled: number) => BOMB_FLOOR + (1 - BOMB_FLOOR) * Math.exp(-Math.max(0, settled) / BOMB_S);
/** 0 once life holds, −1 before (WorldState.life). */
export const stageOf = (progress: number) => (progress >= LIFE_S ? 0 : -1);
export const lifeName = (progress: number) => (progress >= LIFE_S ? 'Life' : progress > 0 ? 'Life emerging' : 'No life');

/** One life step; returns the stage index. */
export function lifeStep(life: Life, hab: Hab, dt: number) {
  life.calm += dt;
  if (hab.rate > 0) life.progress = Math.min(LIFE_S * LIFE_CAP, life.progress + hab.rate * dt);
  else if (hab.k >= MELT_K) life.progress = Math.max(0, life.progress - DIE * dt); // boiled, dried out, airless: it dies back
  return stageOf(life.progress);
}

/** An impact that delivered `kelvin` of heat (doc: Kitlesel yok oluş). Returns 'soft', 1 if life was wiped out, or 0. */
export function impact(life: Life, kelvin: number): number | 'soft' {
  if (life.progress <= 0 || kelvin < EXTINCT[0]) return 0;
  life.calm = 0;
  if (kelvin < EXTINCT[1]) {
    life.progress = Math.max(0, life.progress - SOFT_S);
    return 'soft';
  }
  life.progress = 0;
  return 1;
}

// ---- Moons (planet/moons.ts holds them on core/orbits.ts slots)
// Slots: min(5, 1 + ⌊2·log10(m / 10^3.5)⌋) = 1 at Planetoid, 2 at 10^4, 3 at 10^4.5, 4 at 10^5, 5 at 10^5.5.
export const MOON_SHARE = [0.002, 0.125]; // by mass: a body 0.2–12.5% of you can be caught (= GIANT_HIT); by size see MOON_R
export const MOON = 0x9fdcff; // your moons' blue (moons, the target panel)
export const MOON_R = 0.45; // R: a moon is never wider than this (neighbouring rings, 1.25 R apart, never touch: stretched rocks included)
/** The most mass a moon (mass `m`, radius `r`) may hold round you (`M`, `R`): MOON_SHARE[1] of you and no wider than MOON_R · R (same shape: its loose radius goes with ∛m). */
export const moonCap = (m: number, r: number, M: number, R: number) => Math.min(MOON_SHARE[1] * M, m * (uncapR(MOON_R * R) / uncapR(r)) ** 3);
/** The size gate of a catch (planet/moons.ts, the target panel's moon-size light). */
export const moonSized = (m: number, r: number, M: number, R: number) => { const cap = moonCap(m, r, M, R); return m >= Math.min(MOON_SHARE[0] * M, 0.25 * cap) && m <= 1.01 * cap; };
/** Held and never caught: a great comet, a rival civilization's world. A living rival world's guard moon (rival.ts tendMoon) is held too, and can be stolen. */
export const handsOff = (b: { held?: boolean; comet?: boolean; pulls?: boolean }) => !!b.held && (!!b.comet || !!b.pulls);
// Holding Command on a moon grinds it down: FEED of your mass a second streams onto you as dust (no hit, no heat), so
// a full moon (MOON_SHARE[1]) takes about 8 s and letting go keeps what is left.
export const FEED = 0.015;
export const moonSlots = (m: number) => (m < AGE_GOAL ? 0 : Math.min(5, 1 + Math.floor(2 * Math.log10(m / AGE_GOAL) + 1e-9)));
/** Mass where the next moon ring opens (moonSlots); undefined at five. */
export const nextMoonMass = (m: number) => { const k = moonSlots(m); return k >= 5 ? undefined : AGE_GOAL * 10 ** (k / 2); };

// Capture by match (the old game's capture made a skill, no click): a free body of MOON_SHARE on the catch lane round
// any free slot (the ring it sits nearest: pickSlot), moving with you within the match window, fills a ring (q = 1 − (v / window)², MATCH_S at a
// perfect match); out of the lane or the window it drains in MATCH_DRAIN. Full: it is your moon. R = your radius,
// D = 2R; speeds in world units.
export const LANE = 0.5; // R: half-width of the lane (lanes sit 0.25 R apart)
export const MATCH_V = 1; // D/s: the match window (V_STICK / 8, the old game's ~0.9)...
export const MATCH_ORBIT = 0.6; // ...or this share of the slot's circular speed if larger (giants)
export const MATCH_S = 1.5; // s to close the ring at a perfect match
export const MATCH_DRAIN = 0.5; // s a full ring takes to drain once the match is lost
export const GRIP = 2; // × the window: slower than this in the lane, your pull on it is cancelled (or below escape speed if larger)
export const GRIP_Q = 0.5; // on any ring but the lowest free one the grip needs this match quality (slow drifters through the outer lanes still fall on you)
export const APPROACH = 2; // R outside the lane where the feedback shows (filling only inside)
export const STOLEN_S = 30; // s: a body let go by another host and caught by you within this is stolen (old game rule)
export const THIEF = 10; // stolen moons in a run: Master thief
/** The match window (world units/s) at a slot whose circular speed is `circ`. */
export const matchWindow = (R: number, circ: number) => Math.max(MATCH_V * 2 * R, MATCH_ORBIT * circ);
/** Below this speed in the lane the grip holds a candidate against your pull. */
export const gripWindow = (R: number, circ: number) => Math.max(GRIP * matchWindow(R, circ), Math.SQRT2 * circ);
/**
 * One catch step for a body at (rx, ry) from you moving at (vx, vy) relative to you, `share` = its mass / yours, `slotR`
 * its slot's radius, `mu` your pull: the ring's progress `p` (1: caught), the match quality `q`, and `grip`,
 * the outward acceleration that cancels your pull on it this step (0: none). `wide`: the slot is your lowest free ring,
 * where the grip holds anything under gripWindow; elsewhere only a match of GRIP_Q or better.
 */
export function catchStep(p: number, R: number, mu: number, slotR: number, rx: number, ry: number, vx: number, vy: number, share: number, dt: number, wide = true) {
  const d = Math.hypot(rx, ry), v = Math.hypot(vx, vy), circ = Math.sqrt(mu / slotR);
  const ok = Math.abs(d - slotR) <= LANE * R && share >= MOON_SHARE[0] && share <= MOON_SHARE[1];
  const q = ok ? matchQuality(v, matchWindow(R, circ)) : 0;
  return { p: matchStep(p, q, dt, MATCH_S, MATCH_DRAIN), q, grip: ok && (wide ? v < gripWindow(R, circ) : q >= GRIP_Q) ? mu / (d * d) : 0 };
}
export const STAY = 0.15; // R: a candidate keeps its ring until another free ring is this much nearer (no flicker between two)
/** The free slot (k < slots, bit k of `used` clear) whose ring a body `d` from you sits nearest (`stay`: the ring it holds, favoured by STAY); −1: none free. */
export function pickSlot(d: number, R: number, slots: number, used: number, stay = -1) {
  let best = -1, bo = Infinity;
  for (let k = 0; k < slots; k++) {
    const o = Math.abs(d - slotRadius(R, k)) - (k === stay ? STAY * R : 0);
    if (!((used >> k) & 1) && o < bo) [best, bo] = [k, o];
  }
  return best;
}
