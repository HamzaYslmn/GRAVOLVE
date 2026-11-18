import { between, clamp, rng, smoothstep } from '../../core/rng.ts';
import { kelvin } from '../../core/water.ts';
import { AGE_GOAL, blend, boilOff, COOL, MOLTEN, radiusOf, START_R, type Comp } from '../asteroid/rules.ts';
import { beforeClimate, climate, FIELD_METAL, habitability, impact, lifeStep, type Life, type Sky, type World } from '../planet/rules.ts';
import { waveFighters } from '../civilization/rules.ts';

// The rival roster (docs/aliencivilizations.md): ROSTER named rivals per run, made from the run seed. Off screen each one keeps
// growing on this ledger (pure numbers, no bodies): its mass eases toward its persona's share of yours, held within
// BAND of you, so the one you meet again later has grown with you and never runs away (fun first). On screen it is a real
// body (asteroid/field.ts spawns it from here and writes it back when it leaves or dies).
// From AGE_GOAL a rival forges a world under your rules (planet/rules.ts): it melts through once, cools, boils and rains,
// and grows life when its four conditions hold. It eats by plan (`want`): what its weakest condition needs, from the
// biome that has it, and nothing while it is too hot.

const ROSTER = 5;
// Personas (docs/aliencivilizations.md → Roster): one row per temper, never shown. group: how it takes a meeting
// (`remember`); share of your mass it grows toward off screen; mass × you on the map (under 1.15×: never eats you on a
// touch); lead / salvo: level and rockets a salvo adds; cost: stock a wave ship costs; odds: least strength ratio it attacks
// at, × hurt once you killed some of its people, × weak while your shield is under half; defend: its shield share it turtles
// under; explore / massS / waveS s; retreat: wave share lost to turn home; patience / rest s (pursueStep); eng R/s², close R/s (stationStep).
export type Group = 'bold' | 'mid' | 'cautious';
type Traits = { group: Group; share: number; mass: [number, number]; lead: number; salvo: number; cost: number; odds: number; hurt: number; weak: number; defend: number; explore: number; massS: number; waveS: number; retreat: number; patience: number; rest: number; eng: number; close: number };
const T = (group: Group, share: number, mass: [number, number], lead: number, salvo: number, cost: number, odds: number, hurt: number, weak: number, defend: number, explore: number, massS: number, waveS: number, retreat: number, patience: number, rest: number, eng: number, close: number): Traits =>
  ({ group, share, mass, lead, salvo, cost, odds, hurt, weak, defend, explore, massS, waveS, retreat, patience, rest, eng, close });
export const PROFILE = {
  hungry: T('mid', 1.15, [0.9, 1.08], 1, 2, 10, 0.8, 1, 1, 0, 15, 20, 35, 0.4, 20, 90, 0.6, 3), // balanced
  careful: T('cautious', 0.6, [0.5, 0.7], 0, 0, 14, 1.2, 1, 1, 0.8, 15, 20, 35, 0.4, 5, 90, 0.6, 3), // turtles, lets you go
  raider: T('bold', 0.9, [0.7, 1], 2, 1, 7, 0.6, 1, 1, 0, 15, 20, 35, 0.4, 40, 90, 0.6, 3), // extra veil, cheap fast waves
  brute: T('bold', 1.3, [0.9, 1.08], 1, 2, 6, 0.3, 0.5, 1, 0, 8, 14, 45, 0.7, 25, 30, 1.5, 6), // closes fast, attacks outgunned, back soon
  stalker: T('bold', 1.25, [0.8, 1], 1, 1, 9, 0.7, 1, 0.7, 0, 12, 20, 35, 0.4, 120, 10, 1.2, 8), // follows long and fast
  jackal: T('mid', 0.8, [0.6, 0.85], 1, 1, 8, 1.6, 1, 0.3, 0.5, 20, 16, 30, 0.3, 30, 45, 0.9, 5), // waves the moment your shield is low
  prober: T('cautious', 0.75, [0.6, 0.9], 0, 1, 5, 0.5, 2.5, 1, 0.5, 8, 12, 15, 0.01, 4, 45, 0.6, 3), // small jabs, home at the first loss
  grudger: T('cautious', 0.7, [0.6, 0.9], 1, 2, 8, 9, 0, 1, 0, 25, 16, 45, 0.6, 60, 15, 1, 5), // never starts it; hurt, any odds
};
export type Temper = keyof typeof PROFILE;
export const TEMPERS = Object.keys(PROFILE) as Temper[];
export type Entry = {
  name: string;
  temper: Temper;
  spite: number; // −1..1, its memory of you this run (`remember`)
  met: number; // times it came on the map as a civilization
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

const DRAW: Group[][] = [['bold'], ['mid'], ['cautious'], ['bold'], ['bold', 'mid']]; // never a passive roster
/** The run's roster: distinct names, a persona each drawn by group (DRAW, no temper twice), a start mass near yours. */
export function roster(seed: number, you: number, comp: Comp): Entry[] {
  const rnd = rng(seed + 71), names = [...NAMES], used = new Set<Temper>();
  return DRAW.slice(0, ROSTER).map((groups) => {
    const name = names.splice(Math.floor(rnd() * names.length), 1)[0], pool = TEMPERS.filter((t) => groups.includes(PROFILE[t].group) && !used.has(t));
    const temper = pool[Math.floor(rnd() * pool.length)];
    used.add(temper);
    return { name, temper, spite: 0, met: 0, m: you * between(START, rnd), comp: { ...comp }, heat: 0, diff: 0, sky: { vapor: 0, gas0: 0 }, life: { progress: 0, calm: 0 }, aged: false, setbacks: 0, alive: true, out: false };
  });
}
/** Its memory of a meeting: you won (+0.5 all), you hurt it (bold and mid +0.5, cautious −0.5), you beat it (bold +1, else −1). */
export function remember(e: Entry, what: 'hurt' | 'beaten' | 'won') {
  const g = PROFILE[e.temper].group, d = what === 'won' ? 0.5 : what === 'hurt' ? (g === 'cautious' ? -0.5 : 0.5) : g === 'bold' ? 1 : -1;
  e.spite = clamp(e.spite + d, -1, 1);
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
 * Climate, water boiling and life for `dt` s, the player's frame on a world (test/planet/rules.test.ts `run`): `alone` adds the
 * cooling and metal sinking the field does for bodies on the map (tickBody). On the map the field sheds the mass lost.
 */
export function live(e: Entry, dt: number, alone: boolean) {
  if (e.m < AGE_GOAL) return;
  if (!e.aged) [e.aged, e.heat] = [true, Math.max(e.heat, MOLTEN + 2)]; // its own gravity melts it through, as yours does
  const w = worldOf(e);
  beforeClimate(e.sky, w);
  if (alone) {
    w.heat *= Math.exp((-COOL * START_R * dt) / w.r);
    e.diff = Math.min(1, e.diff + (dt / 20) * smoothstep(MOLTEN, 5, w.heat)); // metal sinks while molten (body.ts)
  }
  w.m -= boilOff(w, dt);
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

/** Off-screen life for `dt` s while you weigh `you`: growth toward its persona's share by plan, held in BAND; climate, life. */
export function tick(list: Entry[], dt: number, you: number) {
  const k = 1 - Math.exp(-dt / EASE_S);
  for (const e of list) {
    if (!e.alive || e.out) continue;
    live(e, dt, true); // climate first (boiling can shed mass), then growth inside the band
    const w = want(e), goal = PROFILE[e.temper].share * you;
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
//   attack   a wave is out (it keeps its course), or stock for one is ready and the odds suit its persona (odds × hurt, weak, spite)
//   defend   its shield under its persona's defend share, or no home fleet is left
//   explore  you are far, or it has seen you for under its explore s: a probe looks you over, harmless
//   gather   otherwise, or while it rests after you outran it (pursueStep): a miner strips free rocks near its world for stock
// A war wave masses round its world its massS s in view before it leaves (the danger is seen, never told), and turns home
// once it has lost its retreat share of ships or a frigate, or after its waveS s (rivals.ts adds: outrun, its own shield under
// its defend share, your people at the raid's floor). Every shot is a bolt aimed once that flies straight.
export type Stance = 'explore' | 'gather' | 'defend' | 'attack';
export const SITE = { ore: 300, vol: 100 }; // per level: what an open world (its defence fleet gone) holds for miners
export const STOCK_RATE = 0.15; // u/s per level a rival world makes by itself
export const GATHER_U = 4; // u a miner brings home from a free rock

/** `rest`: it gave up following you (pursueStep) and minds its own rocks; `hurt`: you killed some of its people; `weak`: your shield is under half; `spite`: Entry.spite. */
export type Mood = { temper: Temper; wave: boolean; shield: number; fleetShort: boolean; far: boolean; seen: number; stock: number; level: number; odds?: number; rest?: boolean; hurt?: boolean; weak?: boolean; spite?: number };
export function stance(w: Mood): Stance {
  const P = PROFILE[w.temper];
  if (w.wave) return 'attack';
  if (w.shield < P.defend || w.fleetShort) return 'defend';
  if (w.rest) return 'gather';
  if (w.far || w.seen < P.explore) return 'explore';
  const least = P.odds * (w.hurt ? P.hurt : 1) * (w.weak ? P.weak : 1) * (1 - 0.5 * (w.spite ?? 0));
  return w.stock >= P.cost * waveFighters(w.level) && (w.odds ?? Infinity) >= least ? 'attack' : 'gather';
}

/** A war wave: `n0` ships at launch, `alive` now; `f0` frigates at launch, `frig` now; `p` its persona's timing. */
type Timing = Pick<Traits, 'massS' | 'waveS' | 'retreat'>;
export type Wave = { n0: number; alive: number; phase: 'mass' | 'go' | 'home'; massed: number; t: number; f0: number; frig: number; p: Timing };
export const newWave = (n: number, f: number, p: Timing): Wave => ({ n0: n, alive: n, phase: 'mass', massed: 0, t: 0, f0: f, frig: f, p });
const retreats = (w: Wave) => w.n0 - w.alive >= w.p.retreat * w.n0 - 1e-9 || w.frig < w.f0;
/** One step: massing counts only while its world is in view; out, it turns home at its retreat share lost or after its wave s. */
export function waveStep(w: Wave, dt: number, inView: boolean) {
  if (w.phase === 'mass') {
    if (inView) w.massed += dt;
    if (w.massed >= w.p.massS) [w.phase, w.t] = ['go', 0];
  } else if (w.phase === 'go' && ((w.t += dt) >= w.p.waveS || retreats(w))) w.phase = 'home';
}

// Rockets outside a war wave come in volleys: none while your shield is down and for REST_S after it is back up, so your shield mends between volleys.
export const REST_S = 30;
/** s until the next volley: held at REST_S while your shield is down, then counting down. */
export const restStep = (rest: number, down: boolean, dt: number) => (down ? REST_S : rest - dt);
export const volley = (wave: boolean, rest: number) => !wave && rest <= 0;
// The pad's tell before each salvo (rivals.ts), by persona: `s` s lit, brightness u^pow (u: share of s gone) × `hot`;
// `blink` flickers, then a steady build over the last COMMIT share; × `dim` unless your shield is under half. Seen, never told.
export const TELL_MIN = 1, COMMIT = 0.4; // s: no tell is shorter; the last share of a blinking tell is a steady build
export const TELL: Record<Temper, { s: number; pow: number; hot: number; blink: number; dim: number }> = {
  hungry: { s: 1.5, pow: 1, hot: 1, blink: 0, dim: 1 }, // an even build
  careful: { s: 2.0, pow: 1, hot: 0.8, blink: 0, dim: 1 }, // long, small, even
  raider: { s: 1.2, pow: 0.5, hot: 1.1, blink: 0, dim: 1 }, // snaps bright early, holds
  brute: { s: 1.0, pow: 0.5, hot: 1.5, blink: 0, dim: 1 }, // hottest, shortest
  stalker: { s: 2.6, pow: 2.5, hot: 1, blink: 0, dim: 1 }, // long slow build
  jackal: { s: 1.5, pow: 1, hot: 1, blink: 0, dim: 0.4 }, // dim unless your shield is under half
  prober: { s: 1.8, pow: 1, hot: 1, blink: 4, dim: 1 }, // four flickers, then commits (0.72 s)
  grudger: { s: 1.6, pow: 1, hot: 1.2, blink: 2, dim: 1 }, // two slow throbs, then commits (0.64 s)
};
/** The pad's brightness `t` s into its tell (0..hot; pure): `weak` your shield is under half. */
export function tell(temper: Temper, t: number, weak = false) {
  const T = TELL[temper], u = clamp(t / T.s, 0, 1), c = 1 - COMMIT;
  const k = !T.blink ? u ** T.pow : u < c ? 0.5 * Math.sin((Math.PI * T.blink * u) / c) ** 2 : 0.5 + (0.5 * (u - c)) / COMMIT;
  return k * T.hot * (weak ? 1 : T.dim);
}

// ---- A rival world's engines (civilization/rivals.ts). It is an ordinary gravity body all its life (asteroid/rules.ts
// gravitates: WORLD_FLAGS); its engines thrust at most its persona's eng (A_ENG by default) R/s² toward a goal velocity relative to you:
// easing to its kept distance (≤ its close), sideways at the pair's circular speed √(a·d) so gravity supplies the turn (the
// two worlds waltz), plus `away` (from another rival world, a sidestep across a rocket's line of sight). Beaten: engines off, a free companion.
export const WORLD_FLAGS = { held: true, pulls: true } as const;
export const A_ENG = 0.6; // your radii/s²
/** Its emergency burn at a rocket of yours: `a` R/s² (your own thrust near 1e5; the game passes its own, asteroid/player.ts thrustOf) built up over `ramp` s, across the line up to `v` R/s, once a rocket is within `t` s of it (it waits, then burns through the seeker's blind time, as a good player does), `react` s after that, `brake` s after the last one is gone. */
export const DODGE = { a: 7, v: 5, t: 1.2, react: [0, 0.4], brake: 1.2, ramp: 0.15 };
/** The goal velocity (your radii/s) across the line of sight to a rocket, the world (px, py) off it, the rocket moving at (wx, wy) relative to it: the way the world already crosses that line (`lat`, any units), else the side its miss is on. */
export function sidestep(px: number, py: number, wx: number, wy: number, lat = 0) {
  const p = Math.hypot(px, py) || 1, s = (lat || wx * py - wy * px) >= 0 ? 1 : -1;
  return { x: (-py / p) * s * DODGE.v, y: (px / p) * s * DODGE.v };
}
type Moving = { x: number; y: number; vx: number; vy: number };
/** Its sidesteps off the rockets `ms` closing on a world moving as `w` within DODGE.t s (one that passed or is still far is no threat), summed and held to DODGE.v; `n` how many close. */
export function evade(w: Moving, ms: readonly (Moving & { v0x?: number; v0y?: number })[]) {
  let x = 0, y = 0, n = 0;
  for (const m of ms) {
    const px = w.x - m.x, py = w.y - m.y, wx = m.vx - w.vx, wy = m.vy - w.vy, s = sidestep(px, py, wx, wy, px * (w.vy - (m.v0y ?? 0)) - py * (w.vx - (m.v0x ?? 0)));
    const c = px * wx + py * wy;
    if (c > 0 && px * px + py * py < DODGE.t * c) [x, y, n] = [x + s.x, y + s.y, n + 1]; // closing, and within DODGE.t s
  }
  const k = Math.min(1, DODGE.v / (Math.hypot(x, y) || 1));
  return { x: x * k, y: y * k, n };
}
/** The alarm clock: counts up from −reaction while a rocket is seen (> 0: burning), then brakes DODGE.brake s, then a new reaction time. */
export const alarmStep = (t: number, seen: boolean, dt: number, rnd = Math.random) => (seen ? t + dt : t > dt ? Math.min(t, DODGE.brake) - dt : -between(DODGE.react, rnd));
// A world follows you only while it can: time outside its kept distance (+ PURSUIT.slack R) with the gap not shrinking
// builds `slow` (closing on you drains it); past its persona's patience (× 1 + spite, at least half) it lets you go and
// minds its own business for its rest s.
export const PURSUIT = { slack: 2 };
/** One step of a world's will to follow you: `d` its distance, `keep` the distance it keeps (your R), `dd` how fast d grows (R/s). True: it follows. */
export function pursueStep(p: { slow: number; rest: number }, temper: Temper, d: number, keep: number, dd: number, dt: number, spite = 0) {
  if (p.rest > 0) return (p.rest -= dt), (p.slow = 0), false;
  p.slow = Math.max(0, p.slow + (d > keep + PURSUIT.slack && dd >= 0 ? dt : -dt));
  if (p.slow >= PROFILE[temper].patience * Math.max(0.5, 1 + spite)) p.rest = PROFILE[temper].rest;
  return p.rest <= 0;
}
const CLOSE_V = 3; // your radii/s relative to you at most (a persona's close)
const EASE_K = 0.25; // 1/s: speed toward the kept distance per unit of distance still to go
/**
 * The engines' Δv this step, in your radii and seconds: (ox, oy) the world off you, (vx, vy) its velocity relative to
 * you, `keep` the distance it keeps, `a` the pair's relative pull at d, `turn` ±1 its sense, (ax, ay) extra goal velocity,
 * `cap` its thrust (R/s²: its persona's eng cruising, its own in a dodge and the brake after it), `close` its persona's
 * closing speed (R/s), `was` its thrust last step (R/s²):
 * given, thrust along the goal builds by at most cap / DODGE.ramp a second (from zero on a reversal); cutting is instant.
 */
export function stationStep(ox: number, oy: number, vx: number, vy: number, keep: number, a: number, turn: number, dt: number, beaten: boolean, ax = 0, ay = 0, cap = A_ENG, was?: { x: number; y: number }, close = CLOSE_V) {
  if (beaten) return { x: 0, y: 0 };
  const d = Math.hypot(ox, oy) || 1e-9, ux = ox / d, uy = oy / d, u = clamp(EASE_K * (d - keep), -close, close), c = Math.sqrt(Math.max(0, a) * d) * turn;
  const gx = -ux * u - uy * c + ax - vx, gy = -uy * u + ux * c + ay - vy, g = Math.hypot(gx, gy);
  const m = Math.min(cap * dt, was ? (clamp((was.x * gx + was.y * gy) / (g || 1), 0, cap) + (cap / DODGE.ramp) * dt) * dt : Infinity);
  return g > m ? { x: (gx / g) * m, y: (gy / g) * m } : { x: gx, y: gy };
}
