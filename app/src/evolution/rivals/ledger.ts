import { between, clamp, rng, smoothstep } from '../../core/rng.ts';
import { boil, kelvin } from '../../core/water.ts';
import { AGE_GOAL, blend, COOL, MOLTEN, radiusOf, START_R, type Comp } from '../asteroid/rules.ts';
import { beforeClimate, climate, FIELD_METAL, habitability, impact, lifeStep, type Life, type Sky, type World } from '../planet/rules.ts';
import { waveFighters } from '../civilization/rules.ts';

// The rival roster (docs/aliencivilizations.md): ROSTER named rivals per run, made from the run seed. Off screen each one keeps
// growing on this ledger (pure numbers, no bodies): its mass eases toward its temperament's share of yours, held within
// BAND of you, so the one you meet again later has grown with you and never runs away (fun first). On screen it is a real
// body (asteroid/field.ts spawns it from here and writes it back when it leaves or dies).
// From AGE_GOAL a rival forges a world under your rules (planet/rules.ts): it melts through once, cools, boils and rains,
// and grows life when its four conditions hold. It eats by plan (`want`): what its weakest condition needs, from the
// biome that has it, and nothing while it is too hot.

const ROSTER = 4;
export type Temper = 'hungry' | 'careful' | 'raider';
export type Entry = {
  name: string;
  temper: Temper;
  m: number;
  comp: Comp;
  heat: number;
  diff: number; // sunk metal 0..1 (Body.diff)
  sky: Sky;
  life: Life;
  aged: boolean; // melted through at AGE_GOAL (once)
  setbacks: number; // life stages lost to impacts so far (the HUD toasts each new one)
  alive: boolean;
  out: boolean; // on the map as a body right now (then the body, not the ledger, owns m, comp, heat and diff)
};

const NAMES = ['Vorr', 'Kael', 'Ithra', 'Sundo', 'Maru', 'Tesk', 'Orin', 'Zhal', 'Nyx', 'Bren', 'Quell', 'Avo'];
// Share of your mass each temperament grows toward off screen: a Hungry rival keeps a little ahead of you, a Careful one
// well behind; Raiders sit close (they win by fighting, docs/aliencivilizations.md).
const SHARE: Record<Temper, number> = { hungry: 1.15, careful: 0.6, raider: 0.9 };
export const BAND = [0.3, 1.5]; // × your mass, always
const EASE_S = 40; // s for an off-screen rival to close most of the gap to its share
const START = [0.4, 0.9]; // × your mass at the start of the run
// What a forging world eats, by its weakest condition: the kind mixes of the biome that has it (web.ts MIX).
const MEALS = {
  water: { rock: 0.12, metal: 0.03, ice: 0.75, gas: 0.1 }, // Frost Reach
  air: { rock: 0.12, ice: 0.3, gas: 0.58 }, // Veil Nebula
  field: { rock: 0.25, metal: 0.65, ice: 0.05, gas: 0.05 }, // Iron Graveyard
  rock: { rock: 0.78, metal: 0.08, ice: 0.11, gas: 0.03 }, // Stone Drift
};
type Want = keyof typeof MEALS | 'none';
const SEAS = 0.3; // water share it aims for (habitability's ideal from 30%)
const AIR_P = 0.7; // atm (habitability's full air score)
const GAS_CAP = 0.12; // it never eats gas past this share (the gas line is at 15–20%)
const HOT = 10; // K under boiling: hotter than this, it stops eating and lets the world cool

/** The run's roster: distinct names, one temperament each (all three appear in a roster of 3+), a start mass near yours. */
export function roster(seed: number, you: number, comp: Comp): Entry[] {
  const rnd = rng(seed + 71), names = [...NAMES], tempers: Temper[] = ['hungry', 'careful', 'raider'];
  return Array.from({ length: ROSTER }, (_, i) => {
    const name = names.splice(Math.floor(rnd() * names.length), 1)[0];
    const temper = i < tempers.length ? tempers[i] : tempers[Math.floor(rnd() * tempers.length)];
    return { name, temper, m: you * between(START, rnd), comp: { ...comp }, heat: 0, diff: 0, sky: { vapor: 0, gas0: 0 }, life: { progress: 0, calm: 0 }, aged: false, setbacks: 0, alive: true, out: false };
  });
}

const worldOf = (e: Entry): World => ({ m: e.m, r: radiusOf(e.m, e.comp), comp: e.comp, heat: e.heat, diff: e.diff });
/** A rival world's four life conditions now (planet/rules.ts habitability). */
export const habOf = (e: Entry) => habitability(worldOf(e));

/** What a rival eats next: below AGE_GOAL plain rock (the asteroid AI hunts by `need`); a world, its weakest condition's meal. */
export function want(e: Entry): Want {
  if (e.m < AGE_GOAL) return 'rock';
  const h = habOf(e), ice = e.comp.ice ?? 0, gas = e.comp.gas ?? 0;
  if (kelvin(e.heat) > h.bp - HOT) return 'none'; // molten or boiling: meals only keep it hot
  if (ice < SEAS) return 'water';
  if (h.p < AIR_P && gas < GAS_CAP) return 'air';
  if ((e.comp.metal ?? 0) < 1.5 * FIELD_METAL) return 'field';
  return 'rock';
}

/**
 * Climate and life for `dt` s, the player's frame on a world (test/planet/rules.test.ts `run`): `alone` adds the cooling and
 * water boiling the field does for bodies on the map (tickBody) and the player does for itself (player.ts).
 */
export function live(e: Entry, dt: number, alone: boolean) {
  if (e.m < AGE_GOAL) return;
  if (!e.aged) [e.aged, e.heat] = [true, Math.max(e.heat, MOLTEN + 2)]; // its own gravity melts it through, as yours does
  const w = worldOf(e);
  beforeClimate(e.sky, w);
  if (alone) {
    w.heat *= Math.exp((-COOL * START_R * dt) / w.r);
    e.diff = Math.min(1, e.diff + (dt / 20) * smoothstep(MOLTEN, 5, w.heat)); // metal sinks while molten (body.ts)
    const { boiled, kept, cool } = boil(w.m, w.heat, w.comp.ice ?? 0, w.comp.gas ?? 0, dt);
    if (boiled) {
      w.heat = Math.max(0, w.heat - cool);
      w.comp = blend(blend(w.comp, w.m, { ice: 1 }, -boiled), w.m - boiled, { gas: 1 }, kept);
      w.m -= boiled - kept;
    }
  }
  climate(e.sky, w, dt);
  [e.m, e.comp, e.heat] = [w.m, w.comp, w.heat];
  lifeStep(e.life, habitability(w), dt);
}

/** A hit that delivered `kelvin` of heat to a rival world: your mass-extinction rule (planet/rules.ts impact). True if life fell back. */
export function struck(e: Entry, kelvin: number) {
  const lost = impact(e.life, kelvin);
  if (lost) e.setbacks++;
  return !!lost;
}

/** Off-screen life for `dt` s while you weigh `you`: growth toward the temperament's share by plan, held in BAND; climate, life. */
export function tick(list: Entry[], dt: number, you: number) {
  const k = 1 - Math.exp(-dt / EASE_S);
  for (const e of list) {
    if (!e.alive || e.out) continue;
    live(e, dt, true); // climate first (boiling can shed mass), then growth inside the band
    const w = want(e), goal = SHARE[e.temper] * you;
    const dm = clamp(w === 'none' ? 0 : Math.max(0, goal - e.m) * k, BAND[0] * you - e.m, BAND[1] * you - e.m); // the band holds even while it waits to cool
    if (e.m >= AGE_GOAL && dm > 0) e.comp = blend(e.comp, e.m, MEALS[w === 'none' ? 'rock' : w], dm);
    e.m += dm;
  }
}

/** The next rival to come on the map: alive, not out, the one that has been away longest (round robin by list order). */
export function next(list: Entry[], last: Entry | undefined) {
  const from = last ? list.indexOf(last) + 1 : 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[(from + i) % list.length];
    if (e.alive && !e.out) return e;
  }
}

// ---- Rival civilizations as strategic opponents (civilization/rivals.ts flies them; docs/aliencivilizations.md [J]).
// The rules a Node check can run. Stances, picked from the world's state and how near you are:
//   attack   a wave is out (it keeps its course), or stock for one is ready and the odds suit its temper (ODDS)
//   defend   a Careful one with its shield under DEFEND_SHIELD, or no home fleet is left
//   explore  you are far, or it has seen you for under EXPLORE_S s: a probe looks you over, harmless
//   gather   otherwise, or while it rests after you outran it (pursueStep): a miner strips free rocks near its world for stock
// A war wave masses round its world MASS_S s in view before it leaves (the danger is seen, never told), and turns home
// once it has lost RETREAT of its ships or a frigate, or after WAVE_S s (rivals.ts adds: outrun, its own shield under
// DEFEND_SHIELD, your people at the raid's floor). Every shot is a bolt aimed once that flies straight.
export type Stance = 'explore' | 'gather' | 'defend' | 'attack';
export const MASS_S = 20;
export const RETREAT = 0.4;
export const WAVE_S = 35;
const EXPLORE_S = 15;
export const DEFEND_SHIELD: Record<Temper, number> = { hungry: 0, careful: 0.8, raider: 0 }; // only a Careful one turtles
export const WAVE_COST: Record<Temper, number> = { hungry: 10, careful: 14, raider: 7 }; // stock a wave ship costs
export const SITE = { ore: 300, vol: 100 }; // per level: what an open world (its defence fleet gone) holds for miners
export const STOCK_RATE = 0.15; // u/s per level a rival world makes by itself
export const GATHER_U = 4; // u a miner brings home from a free rock
/** The least odds (its strength ÷ yours: civilization/rules.ts strength) each temper attacks at. */
export const ODDS: Record<Temper, number> = { careful: 1.2, hungry: 0.8, raider: 0.6 };

/** `rest`: it gave up following you (pursueStep) and minds its own rocks. */
export type Mood = { temper: Temper; wave: boolean; shield: number; fleetShort: boolean; far: boolean; seen: number; stock: number; level: number; odds?: number; rest?: boolean };
export function stance(w: Mood): Stance {
  if (w.wave) return 'attack';
  if (w.shield < DEFEND_SHIELD[w.temper] || w.fleetShort) return 'defend';
  if (w.rest) return 'gather';
  if (w.far || w.seen < EXPLORE_S) return 'explore';
  return w.stock >= WAVE_COST[w.temper] * waveFighters(w.level) && (w.odds ?? Infinity) >= ODDS[w.temper] ? 'attack' : 'gather';
}

/** A war wave: `n0` ships at launch, `alive` now; `f0` frigates at launch, `frig` now. */
export type Wave = { n0: number; alive: number; phase: 'mass' | 'go' | 'home'; massed: number; t: number; f0: number; frig: number };
export const newWave = (n: number, f = 0): Wave => ({ n0: n, alive: n, phase: 'mass', massed: 0, t: 0, f0: f, frig: f });
export const retreats = (w: Wave) => w.n0 - w.alive >= RETREAT * w.n0 - 1e-9 || w.frig < w.f0;
/** One step: massing counts only while its world is in view; out, it turns home at RETREAT losses or after WAVE_S. */
export function waveStep(w: Wave, dt: number, inView: boolean) {
  if (w.phase === 'mass') {
    if (inView) w.massed += dt;
    if (w.massed >= MASS_S) [w.phase, w.t] = ['go', 0];
  } else if (w.phase === 'go' && ((w.t += dt) >= WAVE_S || retreats(w))) w.phase = 'home';
}

// Rockets outside a war wave come in volleys: none while your shield is down and for REST_S after it is back up, so your shield mends between volleys.
export const REST_S = 30;
/** s until the next volley: held at REST_S while your shield is down, then counting down. */
export const restStep = (rest: number, down: boolean, dt: number) => (down ? REST_S : rest - dt);
export const volley = (wave: boolean, rest: number) => !wave && rest <= 0;

// ---- A rival world's engines (civilization/rivals.ts). It is an ordinary gravity body all its life (asteroid/rules.ts
// gravitates: WORLD_FLAGS); its engines thrust at most A_ENG of your radii/s² toward a goal velocity relative to you:
// easing to its kept distance (≤ CLOSE_V), sideways at the pair's circular speed √(a·d) so gravity supplies the turn (the
// two worlds waltz), plus `away` (from another rival world, a sidestep across a rocket's line of sight). Beaten: engines off, a free companion.
export const WORLD_FLAGS = { held: true, pulls: true } as const;
export const A_ENG = 0.6; // your radii/s²
/** Its emergency burn at a rocket of yours: `a` R/s² (your own thrust near 1e5; the game passes its own, asteroid/player.ts thrustOf) built up over `ramp` s, across the line up to `v` R/s, `react` s after it sees the launch, `brake` s after the last one is gone. */
export const DODGE = { a: 7, v: 5, react: [0, 0.4], brake: 1.2, ramp: 0.3 };
/** The goal velocity (your radii/s) across the line of sight to a rocket, the world (px, py) off it, the rocket moving at (wx, wy) relative to it: the way the world already crosses that line (`lat`, any units), else the side its miss is on. */
export function sidestep(px: number, py: number, wx: number, wy: number, lat = 0) {
  const p = Math.hypot(px, py) || 1, s = (lat || wx * py - wy * px) >= 0 ? 1 : -1;
  return { x: (-py / p) * s * DODGE.v, y: (px / p) * s * DODGE.v };
}
type Moving = { x: number; y: number; vx: number; vy: number };
/** Its sidesteps off the rockets `ms` still closing on a world moving as `w` (one that passed is no threat), summed and held to DODGE.v; `n` how many close. */
export function evade(w: Moving, ms: readonly (Moving & { v0x?: number; v0y?: number })[]) {
  let x = 0, y = 0, n = 0;
  for (const m of ms) {
    const px = w.x - m.x, py = w.y - m.y, wx = m.vx - w.vx, wy = m.vy - w.vy, s = sidestep(px, py, wx, wy, px * (w.vy - (m.v0y ?? 0)) - py * (w.vx - (m.v0x ?? 0)));
    if (px * wx + py * wy > 0) [x, y, n] = [x + s.x, y + s.y, n + 1];
  }
  const k = Math.min(1, DODGE.v / (Math.hypot(x, y) || 1));
  return { x: x * k, y: y * k, n };
}
/** The alarm clock: counts up from −reaction while a rocket is seen (> 0: burning), then brakes DODGE.brake s, then a new reaction time. */
export const alarmStep = (t: number, seen: boolean, dt: number, rnd = Math.random) => (seen ? t + dt : t > dt ? Math.min(t, DODGE.brake) - dt : -between(DODGE.react, rnd));
// A world follows you only while it can: time outside its kept distance (+ PURSUIT.slack R) with the gap not shrinking
// builds `slow` (closing on you drains it); past its temper's patience it lets you go and minds its own business PURSUIT.rest s.
export const PURSUIT = { slack: 2, rest: 90, s: { careful: 5, hungry: 20, raider: 40 } as Record<Temper, number> };
/** One step of a world's will to follow you: `d` its distance, `keep` the distance it keeps (your R), `dd` how fast d grows (R/s). True: it follows. */
export function pursueStep(p: { slow: number; rest: number }, temper: Temper, d: number, keep: number, dd: number, dt: number) {
  if (p.rest > 0) return (p.rest -= dt), (p.slow = 0), false;
  p.slow = Math.max(0, p.slow + (d > keep + PURSUIT.slack && dd >= 0 ? dt : -dt));
  if (p.slow >= PURSUIT.s[temper]) p.rest = PURSUIT.rest;
  return p.rest <= 0;
}
const CLOSE_V = 3; // your radii/s relative to you at most
const EASE_K = 0.25; // 1/s: speed toward the kept distance per unit of distance still to go
/**
 * The engines' Δv this step, in your radii and seconds: (ox, oy) the world off you, (vx, vy) its velocity relative to
 * you, `keep` the distance it keeps, `a` the pair's relative pull at d, `turn` ±1 its sense, (ax, ay) extra goal velocity,
 * `cap` its thrust (R/s²: A_ENG cruising, its own in a dodge and the brake after it), `was` its thrust last step (R/s²):
 * given, thrust along the goal builds by at most cap / DODGE.ramp a second (from zero on a reversal); cutting is instant.
 */
export function stationStep(ox: number, oy: number, vx: number, vy: number, keep: number, a: number, turn: number, dt: number, beaten: boolean, ax = 0, ay = 0, cap = A_ENG, was?: { x: number; y: number }) {
  if (beaten) return { x: 0, y: 0 };
  const d = Math.hypot(ox, oy) || 1e-9, ux = ox / d, uy = oy / d, u = clamp(EASE_K * (d - keep), -CLOSE_V, CLOSE_V), c = Math.sqrt(Math.max(0, a) * d) * turn;
  const gx = -ux * u - uy * c + ax - vx, gy = -uy * u + ux * c + ay - vy, g = Math.hypot(gx, gy);
  const m = Math.min(cap * dt, was ? (clamp((was.x * gx + was.y * gy) / (g || 1), 0, cap) + (cap / DODGE.ramp) * dt) * dt : Infinity);
  return g > m ? { x: (gx / g) * m, y: (gy / g) * m } : { x: gx, y: gy };
}
