import { drawShip, shipUnit, VIOLET, type TechPage } from '../../render/tech';
import { between, logBetween } from '../../core/rng';
import { setSurface } from '../asteroid/sphere';
import { slotRadius } from '../../core/orbits';
import { markFreed } from '../planet/moons';
import { MOON_SHARE, moonSlots } from '../planet/rules';
import { drop, hitKelvin, shed, type Body, type Hit } from '../asteroid/body';
import { burnShare, COMP, G_WORLD, pairPull, pieceShares, pullMass, SPREAD, youPull } from '../asteroid/rules';
import { A_ENG, alarmStep, DEFEND_SHIELD, DODGE, evade, GATHER_U, newWave, next, restStep, SITE, stance, stationStep, STOCK_RATE, volley, WAVE_COST, waveSize, waveStep, WORLD_FLAGS, type Entry, type Stance, type Wave } from '../rivals/ledger';
import type { Ctx } from './combat';
import { bump, bumps, MISS_V, sparks } from './crash';
import {
  approach, avoid, BRAKE, chase, circuit, formation, inArc, leadAt, leash, lowPass, MAX_DT, P_ACC, P_TURN, RF_TURN, RING_IN, RING_OUT, ROW, steps, strafe, thrust, want, type Circler, type Strafer,
} from './flight';
import { lineClear, pick, pull, seeker, trigger, type Gun, type Missile, type Trigger } from './guns';
import { clear, scan } from './nav';
import {
  ARMS, BEATEN, beamPop, CHASE_V, FRIGATE_S, FRIGATE_STOCK, HIT_KILL, HIT_MIN, intercept, LEASH, raid, RIVAL_AIM, RIVAL_FIRE, RIVAL_FIRST, RIVAL_HIT_MAX, RIVAL_LEAD, RIVAL_LOADED, RIVAL_MASS, RIVAL_ROCK,
  RIVAL_TRAVEL, rivalFrigates, rivalLevel, rivalSalvo, rivalShips, shellR, SHIELD_K, shieldHolds, shieldMax, shieldMeet, shieldRegen, shieldShot, SLUG_SPEED, strength, T_SEE, weaponHit, type Arm, type Raid, type Shield,
} from './rules';
import { crashes, defend, dropLost, foeOf, lose, newShip, strike, type Foe, type Ship } from './ships';
import { shieldLook, type ShieldLook } from './view';
import { slugBodies, type Mark, type Shielded, type Slug } from './weapon';

// Rival civilizations: other living worlds with their own people, shield, defence ships and a mass driver (numbers and
// arrival rules in rules.ts). They spawn in the quietest of a few spots ahead of you (field.fillAt), as the next named
// rival of the run's roster (rivals/ledger.ts) when one is free.
//   - Their patrols hunt pirate ships too, so pirate raids on them are fights.
//   - Their shield is a shell like yours (rules.ts shieldMeet); their air burns your slugs once it is down. What gets through kills people.
//   - Their rock rides a circle round their world, a passive guard; dropped (the world left behind or beaten), a match within 30 s steals it (planet/moons.ts).
//   - Strategy (stances and war waves: rivals/ledger.ts): probes look you over, a miner strips free rocks near their world,
//     and with stock enough and odds that suit its temper a war wave masses round their world in view (fighters in a V,
//     its frigates on their battery circuit, the silo glowing), then the fighters make strafing runs at you in wings of
//     three, a burst a run whenever a gun bears (your frigate first, then ships and miners, else your shield: guns.ts
//     pick); the frigates lance your world from home (rules.ts ARMS.lance) and the silo fires a salvo after each lance
//     salvo. Home on 40% losses, a frigate lost, WAVE_S, outrun, its own shield low, or your people at the raid's floor.
//     Every ship away dies touching a body; home patrols steer round bodies and graze or wreck on them as yours do
//     (ships.ts crashes).
//   - Open once its defence fleet is gone for good (YARD fleets' worth of rebuilds spent): no rebuilds, its shield stops mending, and it holds SITE × level for miners.
//   - Weapon hits on it go through rules.ts weaponHit like yours (`struck`): your rounds chip its shield and burn stock,
//     lance bolts and missiles land on its people.
// Its world is an ordinary gravity body all its life (ledger WORLD_FLAGS): engines (ledger stationStep) keep it KEEP of your
// radii off you on an orbit, clear of other rival worlds, and burn off the line of a missile of yours once it sees it (ledger DODGE);
// beaten, the engines are off and it stays your gravitating companion.

const AIR = 1; // atm on a rival world (burns small slugs)
const ROCK_ORBIT = 2.6; // rival radii (inside its ships' 2–4.6 R circuit: they steer round it)
const ROCK_W = 0.6; // rad/s
const ROCK_AGAIN = 30; // s until a new rock is caught after a loss
const SHIP_AGAIN = 20; // s per rebuilt ship...
const YARD = 2; // ...up to this many fleets' worth: then a fleet lost is lost for good, and the world opens
const LIGHTS = 26;
const FAR = 4; // camera half-diagonals: past this a rival is left behind (the field may store it)
const SPAWN = [1.25, 1.6]; // camera half-diagonals ahead of you
const COMP_WORLD = { rock: 0.55, metal: 0.15, ice: 0.25, gas: 0.05 };
const ENGAGE = 30; // your radii
const REACH = 1.7; // ...or within this many camera half-diagonals, so one spawned ahead of you comes in too
const KEEP = [8, 12]; // your radii: on screen, so it sees you and fires
const APART = 6; // your radii: another rival world this close pushes it away...
const APART_V = 1; // ...at up to this many of your radii/s
// Ships away from home (war wave, probe, miner), absolute world units; flight as pirates (flight.ts).
const OUT_V = 5; // your radii/s cruise (pirates 4–5.5)
const MASS_IN = [1.5, 1.7]; // rival radii: a massing wave's circuit round its world, waypoints in and out (inside its rock's circle)
const MASS_OUT = [1.9, 2.1];
const PROBE_S = 10; // s a probe circles you before it goes home
const PROBE_AGAIN = 25; // s between probes
const GATHER_R = 8; // rival radii: a miner takes free rocks this close to its world...
const GATHER_M = [1e-4, 0.03]; // ...of this share of its mass
const STRIP_SHARE = 0.3; // of the rock per trip (a rock under 1e-4 of the world is taken whole)
const DIG_S = 2;
const DOCK = 1.3; // rival radii: a ship flying home lands this close

type Role = 'probe' | 'miner' | 'frigate' | 'fighter';
/** A ship away from home: `rock` a miner's, `dig` s on it, `t` s out, `home` flying back, `load` a miner's haul; a frigate's nose `glow` (s charged), s since it `fired` a salvo. */
type Out = Foe & Circler & Strafer & { role: Role; hp: number; g: Trigger; rock?: Body; dig: number; da: number; t: number; home: boolean; load: boolean; dead: boolean; glow: number; fired: number };
type Centre = { x: number; y: number; vx: number; vy: number };

export type Rival = {
  b: Body; level: number; sh: Shield; pop: number; seen: number; fireT: number; rockT: number; shipT: number;
  rock?: Body; rockA: number; ships: Ship[]; foes: WeakMap<Ship, Foe>; lights: { a: number; d: number }[];
  look: ShieldLook; flick: number; beaten: boolean; keep: number; turn: number; alarm: number; // a missile alarm (ledger alarmStep)
  left?: boolean; // gone out of reach (the next spawn waits)
  entry?: Entry; stance: Stance; stanceT: number; stock: number; out: Out[]; wave?: Wave; c: Centre; fv: { x: number; y: number }; lash: { far: number; slow: number }; probeT: number;
  rest: number; // s until its next volley of slugs (rivals/ledger.ts restStep)
  gun: Gun; lance: Gun; // its war wave's guns: the fighters' rounds, the frigates' lance
  /** Its defence fleet is gone: your miners work `site` (civilization/stage.ts). */
  open: boolean; site: { ore: number; vol: number }; yard: number; // ships it can still rebuild
  frig: number; frigT: number; // frigates it has (rivalFrigates; built apart from wave ships), s to the next rebuilt one
  wound: { k: number }; raid?: Raid; // heavy fire on it not yet landed; its wave's caps on your people
  silo: { load: number; glow: number }; thrust: { x: number; y: number }; // its missile silo; its engines' last Δv/s (the plume)
};
const isWave = (s: Out) => s.role === 'frigate' || s.role === 'fighter';

export function createRivals(ctx: Ctx) {
  const list: Rival[] = [];
  const deaths = { body: 0, shot: 0 }; // what broke their ships (test hook): touching a body, or slugs and rounds
  const shot = (s: Ship) => void (lose(s) && deaths.shot++);
  let raiders = (): Foe[] => []; // pirate ships: their patrols hunt them too (pirates.ts calls watch)
  let travelled = 0, nextAt = RIVAL_FIRST, clock = 0, since = -1, lastX = NaN, lastY = NaN, lastEntry: Entry | undefined;
  // Loaded: the field still holds the world (it stores it with its chunk once you leave; its view leaves the layer then).
  const near = (r: Rival) => r.b.m > 0 && !!r.b.view.parent && Math.hypot(r.b.motion.x - ctx.me.motion.x, r.b.motion.y - ctx.me.motion.y) < FAR * ctx.diag();

  /** A rival world at the quietest of six spots ahead of you (or at `at`: test hook). */
  function spawn(at?: { x: number; y: number }) {
    const f = ctx.field(), me = ctx.me;
    if (!f || !me.m) return;
    let x = at?.x ?? 0, y = at?.y ?? 0;
    if (!at) {
      const pm = me.motion, sp = Math.hypot(pm.vx, pm.vy), head = sp > 1e-3 ? Math.atan2(pm.vy, pm.vx) : Math.random() * Math.PI * 2;
      let best = Infinity;
      for (let i = 0; i < 6; i++) {
        const a = head + (Math.random() - 0.5) * 2.1, d = Math.max(between(SPAWN) * ctx.diag(), KEEP[1] * me.r), cx = pm.x + Math.cos(a) * d, cy = pm.y + Math.sin(a) * d, fill = f.fillAt(cx, cy);
        if (fill < best) [best, x, y] = [fill, cx, cy];
      }
    }
    const page = ctx.page, entry = next([...f.roster], lastEntry), temper = entry?.temper ?? 'hungry'; // the next named rival, round robin (none free: unnamed)
    const m = logBetween(RIVAL_MASS[temper], Math.random) * me.m, drift = Math.random() * Math.PI * 2; // its mass and level by temper
    const b = f.spawn(x, y, 0, 0, m, COMP_WORLD);
    const dv = (0.1 + 0.15 * Math.random()) * 2 * b.r; // drifts 0.1–0.25 of its diameters/s at first: a place to fight at, not a passer-by
    [b.motion.vx, b.motion.vy, b.diff] = [Math.cos(drift) * dv, Math.sin(drift) * dv, 0.6];
    Object.assign(b, WORLD_FLAGS); // hands-off, but in the field's gravity
    setSurface(b, { sea: 0.45, frozen: false, frost: 0, lava: 0, life: 6 }); // seas and green lowlands (sphere.ts)
    const level = rivalLevel(since < 0 ? 0 : clock - since, ctx.civ?.level ?? 1, RIVAL_LEAD[temper]);
    if (since < 0) since = clock;
    if (entry) [entry.out, lastEntry] = [true, entry];
    const own = (q: unknown) => q === b || q === r.rock, L = ARMS.lance;
    const gun: Gun = {
      team: 'rival', u: ARMS.round.u * me.r, life: ARMS.round.life, arc: ARMS.wave.arc, spread: ARMS.wave.spread, tint: VIOLET, own,
      onBody: (q: Body, x: number, y: number) => q === ctx.me && ctx.civ?.struck('round', ARMS.round.k, x, y, r.raid), // your shield, then a little ore
    };
    const lance: Gun = {
      team: 'rival', u: L.u * b.r, life: L.life, arc: L.arc, spread: L.spread, tint: VIOLET, look: 'lance', own,
      onBody: (q: Body, x: number, y: number) => q === ctx.me && ctx.civ?.struck('lance', L.k, x, y, r.raid),
    };
    const r: Rival = {
      b, level, sh: { level, s: SHIELD_K * level }, pop: 1, seen: 0, fireT: between(RIVAL_FIRE), rockT: 0, shipT: SHIP_AGAIN,
      rockA: Math.random() * Math.PI * 2, ships: [], foes: new WeakMap(), flick: 0, beaten: false, keep: between(KEEP), turn: Math.random() < 0.5 ? -1 : 1,
      frig: rivalFrigates(level), frigT: FRIGATE_S, wound: { k: 0 }, silo: { load: 0, glow: 0 }, thrust: { x: 0, y: 0 }, alarm: -between(DODGE.react),
      entry, stance: 'explore', stanceT: 0, stock: 0, out: [], gun, lance, c: { x: 0, y: 0, vx: 0, vy: 0 }, fv: { x: 0, y: 0 }, lash: { far: 0, slow: 0 }, probeT: 0, rest: 0, open: false, site: { ore: 0, vol: 0 }, yard: YARD * rivalShips(level),
      lights: Array.from({ length: LIGHTS }, () => ({ a: Math.random() * Math.PI * 2, d: 0.25 + 0.65 * Math.sqrt(Math.random()) })),
      look: shieldLook(ctx.root, page, VIOLET, Math.floor(Math.random() * 1e9), 3),
    };
    for (let i = 0; i < rivalShips(level); i++) r.ships.push(newShip(b.r, (i / rivalShips(level)) * Math.PI * 2));
    b.guard = { r: 0, own, meet(q, v, x, y) { // its shell, as yours (its own rock passes; another world's moon meets it)
      const s0 = r.sh.s, st = strike(b, q, burnShare(AIR)), k = shieldMeet(r.sh, st.kelvin, st.share, v / st.vs);
      if (k) [r.look.ripple(Math.atan2(y - b.motion.y, x - b.motion.x)), ctx.fx.flash(x, y, q.r * 2, 8, q.r * 3)];
      if (s0 > 0 && r.sh.s <= 0) ctx.fx.burst(b.motion.x, b.motion.y, 20, b.r * 0.08, b.r * 1.4, VIOLET); // its veil collapses
      return k;
    } };
    list.push(r);
    ctx.news(entry ? `rival-${entry.name}` : 'rival', entry ? `${entry.name}'s civilization` : 'Another civilization', 'Violet lights on a world nearby · they will shoot once they see you');
    return r;
  }

  function release(r: Rival) {
    const rock = r.rock;
    r.rock = undefined;
    if (!rock || ctx.moons.owns(rock)) return;
    [rock.moon, rock.motion.drag] = [false, 1e-3];
    markFreed(rock); // caught within 30 s it counts as stolen
  }
  function remove(r: Rival) {
    release(r);
    const e = r.entry;
    if (e) [e.m, e.alive, e.out] = [r.b.m || e.m, r.b.m > 0, false]; // back on the ledger; swallowed, it is gone for the run
    r.look.destroy();
    list.splice(list.indexOf(r), 1);
  }
  /** Weapon fire on the rival's shield (a slug, a pirate shot, the beam): taken while it is up (rules.ts shieldShot). */
  function shieldTake(r: Rival, kelvin: number, _share: number, x: number, y: number) {
    if (r.beaten) return false;
    const up = r.sh.s > 0;
    shieldShot(r.sh, kelvin); // down too: the stun keeps it down
    if (up) r.look.ripple(Math.atan2(y - r.b.motion.y, x - r.b.motion.x));
    return up;
  }
  /** A weapon hit of `k` K on rival `r` (rules.ts weaponHit): its shield first; rounds through it burn stock, heavy fire lands on its people. */
  function struck(r: Rival, arm: Arm, k: number, x: number, y: number, cap?: Raid) {
    if (r.beaten || !r.b.m) return;
    const s0 = r.sh.s, h = weaponHit(r.sh, r.wound, r.pop, arm, k, cap), bm = r.b.motion;
    if (s0 > 0) r.look.ripple(Math.atan2(y - bm.y, x - bm.x));
    if (s0 > 0 && r.sh.s <= 0) ctx.fx.burst(bm.x, bm.y, 20, r.b.r * 0.08, r.b.r * 1.4, VIOLET); // its veil collapses
    r.stock = Math.max(0, r.stock - h.burn);
    if (!h.landed) return;
    [r.pop, r.flick] = [h.P, 1.5];
    ctx.fx.flash(x, y, r.b.r * 0.35, 10, r.b.r * 0.8);
    ctx.fx.burst(x, y, 12, r.b.r * 0.05, r.b.r * 0.5, 0xd8c8a8);
  }
  /** Its defence fleet is gone: no more rebuilds, the shield stops mending, a wave out turns home, its reserves are open. */
  function open(r: Rival) {
    r.open = true;
    r.site = { ore: SITE.ore * r.level, vol: SITE.vol * r.level };
    if (r.wave) r.wave.phase = 'home';
    const who = r.entry ? `${r.entry.name}'s world` : 'Their world';
    ctx.news(`open-${r.entry?.name ?? 'wild'}`, 'Their fleet is gone', `${who} lies open · its shield no longer mends, its ore is there for your miners`);
  }
  function beat(r: Rival) {
    r.beaten = true;
    const b = r.b, f = ctx.field();
    ctx.news('beaten', 'Rival beaten', 'Their lights go out · their world lies open to your miners');
    for (const s of r.ships) ctx.fx.burst(b.motion.x + s.x, b.motion.y + s.y, 8, b.r * 0.04, b.r * 0.5, VIOLET);
    for (const s of r.out) ctx.fx.burst(s.x, s.y, 8, b.r * 0.04, b.r * 0.5, VIOLET);
    [r.ships.length, r.out.length, r.wave] = [0, 0, undefined];
    if (!r.open) open(r);
    // Wreckage: their stations and yards, metal-rich, unequal (asteroid/rules.ts pieceShares), sprayed out slowly (food and ore for you).
    for (let i = 0, w = pieceShares(6, SPREAD); i < 6 && f; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random(), v = (0.6 + Math.random()) * 2 * b.r * 0.5;
      f.spawn(b.motion.x + Math.cos(a) * b.r * 1.5, b.motion.y + Math.sin(a) * b.r * 1.5, b.motion.vx + Math.cos(a) * v, b.motion.vy + Math.sin(a) * v, 0.015 * b.m * w[i], COMP.metallic, b);
    }
    ctx.fx.burst(b.motion.x, b.motion.y, 30, b.r * 0.1, b.r * 1.2, VIOLET);
    release(r); // the dead world stays listed, engines off, a gravitating companion until you leave it behind
  }

  /** A ship leaves its world at angle `a`. */
  function launch(r: Rival, role: Role, a: number): Out {
    const bm = r.b.motion, d = r.b.r * 1.1;
    const s: Out = {
      role, x: bm.x + Math.cos(a) * d, y: bm.y + Math.sin(a) * d, vx: bm.vx, vy: bm.vy, heading: a, burn: 0, wx: 0, wy: 0, k: Math.floor(Math.random() * 1e6), sense: r.turn, out: false,
      hp: role === 'frigate' ? ARMS.lance.rivalHull : 1, g: trigger(), dig: 0, da: 0, t: 0, home: false, load: false, dead: false, glow: 0, fired: Infinity, cls: role === 'frigate' ? 'frigate' : role === 'fighter' ? 'fighter' : 'probe',
      kill: () => {
        if (--s.hp > 0) return void ctx.fx.flash(s.x, s.y, ctx.shipR() * 2, 4, ctx.shipR() * 4);
        if (!s.dead) deaths.shot++;
        if (!s.dead && role === 'frigate') r.frig = Math.max(0, r.frig - 1); // rebuilt slowly (FRIGATE_S, FRIGATE_STOCK)
        s.dead = true;
      },
    };
    r.out.push(s);
    return s;
  }

  /** A free rock near its world for its miner: not a moon, not held, not taken by another miner; the nearest. */
  function freeRock(r: Rival) {
    const bm = r.b.motion, taken = new Set(list.flatMap((q) => q.out.map((s) => s.rock)));
    let best: Body | undefined, bd = GATHER_R * r.b.r;
    for (const b of ctx.near) {
      if (!b.m || b === ctx.me || b === r.rock || b.moon || b.held || b.meteor || taken.has(b) || b.m < GATHER_M[0] * r.b.m || b.m > GATHER_M[1] * r.b.m) continue;
      const d = Math.hypot(b.motion.x - bm.x, b.motion.y - bm.y);
      if (d < bd) [best, bd] = [b, d];
    }
    return best;
  }

  /** A war wave: waveSize fighters bought from stock, and every frigate it has. */
  function sendWave(r: Rival, temper: keyof typeof WAVE_COST) {
    const n = waveSize(r.level), a0 = Math.random() * Math.PI * 2, all = n + r.frig;
    [r.stock, r.wave] = [r.stock - WAVE_COST[temper] * n, newWave(all, r.frig)];
    for (let i = 0; i < all; i++) launch(r, i < r.frig ? 'frigate' : 'fighter', a0 + (i / all) * Math.PI * 2);
  }

  /** Stance, launches, the war wave and every ship away from home (`far`: you are out of its reach). */
  function strategy(r: Rival, dt: number, on: boolean, far: boolean) {
    const me = ctx.me, pm = me.motion, bm = r.b.motion, R = r.b.r, sr = ctx.shipR(), sp = OUT_V * me.r, temper = r.entry?.temper ?? 'hungry';
    r.stock += STOCK_RATE * r.level * dt;
    r.probeT -= dt;
    if ((r.stanceT -= dt) <= 0) {
      r.stanceT = 1;
      const civ = ctx.civ, n = waveSize(r.level), yours = civ ? strength(civ.ships.filter((s) => s.kind === 'fighter').length, civ.frigates.length, civ.level) : 0;
      const odds = yours > 0 ? strength(r.ships.length + n, r.frig, r.sh.level) / yours : Infinity;
      r.stance = r.open ? 'defend' : stance({ temper, wave: !!r.wave, shield: r.sh.s / shieldMax(r.sh), fleetShort: !r.ships.length, far, seen: r.seen, stock: r.stock, level: r.level, odds });
      if (r.stance === 'attack' && !r.wave) sendWave(r, temper);
      else if (r.stance === 'gather' && !r.out.some((s) => s.role === 'miner')) {
        const rock = freeRock(r);
        if (rock) launch(r, 'miner', Math.atan2(rock.motion.y - bm.y, rock.motion.x - bm.x)).rock = rock;
      } else if (r.stance === 'explore' && on && r.probeT <= 0) {
        r.probeT = PROBE_AGAIN;
        launch(r, 'probe', Math.atan2(pm.y - bm.y, pm.x - bm.x));
      }
    }
    // Losses: a burst where each ship broke; the wave counts what is left.
    for (let i = r.out.length - 1; i >= 0; i--) if (r.out[i].dead) {
      ctx.wreck(r.out[i].x, r.out[i].y, VIOLET, 1.6);
      r.out.splice(i, 1);
    }
    const w = r.wave;
    if (w) {
      const was = w.phase;
      [w.alive, w.frig] = [r.out.filter(isWave).length, r.out.filter((s) => s.role === 'frigate').length];
      waveStep(w, dt, on);
      if (w.phase === 'go') {
        if (was === 'mass') [r.c, r.fv, r.lash, r.raid] = [{ x: bm.x, y: bm.y, vx: bm.vx, vy: bm.vy }, { x: bm.vx, y: bm.vy }, { far: 0, slow: 0 }, raid(ctx.civ?.state?.pop ?? 1)];
        const outpaced = chase(r.c, pm.x, pm.y, pm.vx, pm.vy, CHASE_V * sp, dt); // you can outrun a wave
        const capped = !!r.raid && (ctx.civ?.state?.pop ?? 1) <= r.raid.floor * 1.001, low = r.sh.s < DEFEND_SHIELD[temper] * shieldMax(r.sh);
        if (!me.m || capped || low || leash(r.lash, Math.hypot(r.c.x - pm.x, r.c.y - pm.y), LEASH * ctx.diag(), outpaced, dt)) w.phase = 'home';
      }
      if (!w.alive) r.wave = undefined;
    }
    // A lost frigate is rebuilt slowly, for FRIGATE_STOCK wave ships' worth of stock.
    if (!r.open && r.frig < rivalFrigates(r.level) && r.stock >= FRIGATE_STOCK * WAVE_COST[temper] && (r.frigT -= dt) <= 0) [r.frig, r.stock, r.frigT] = [r.frig + 1, r.stock - FRIGATE_STOCK * WAVE_COST[temper], FRIGATE_S];

    const dtc = Math.min(dt, MAX_DT), n = steps(dtc), h = dtc / n, acc = sp * P_ACC, brake = BRAKE * acc, mR = me.r, L = ARMS.lance;
    [r.gun.u, r.lance.u] = [ARMS.round.u * mR, L.u * R];
    const outer = slotRadius(mR, Math.max(0, ...ctx.moons.list().map((m) => m.slot)));
    const page = ctx.page, unit = shipUnit(mR, ctx.cam.zoom), aims = [...ctx.miners, ...ctx.mine], bodies = me.m ? [me, ...ctx.near] : ctx.near;
    lowPass(r.fv, r.c.vx, r.c.vy, dt);
    // The war wave: massing, its fighters in a V on the first round their world; out, wings of three in trail on strafing
    // runs at you (round the chasing centre, frame velocity low-passed). Its frigates keep their battery circuit at home.
    const phase = r.wave?.phase, massing = phase === 'mass', up = phase === 'mass' || phase === 'go', flying = up ? r.out.filter((s) => s.role === 'fighter') : [];
    const wc = massing ? bm : r.c, wfv = massing ? { x: bm.vx, y: bm.vy } : r.fv, keep = massing ? R + (2 + ROW[1]) * sr : 1.25 * mR + (2 + ROW[1]) * sr;
    const route = (s: Out) => {
      const x = s.x - wc.x, y = s.y - wc.y;
      if (!massing) return strafe(s, x, y, s.vx - wfv.x, s.vy - wfv.y, RING_IN * mR, outer + RING_OUT * mR, keep, sp);
      circuit(s, x, y, MASS_IN.map((q) => q * R), MASS_OUT.map((q) => q * R), sp, RF_TURN);
      avoid(x, y, keep, 2 * R);
    };
    const st = r.out.map((s) => {
      s.t += dt;
      if ((s.role === 'probe' && s.t > PROBE_S) || (s.role === 'miner' && (!s.rock || !s.rock.m))) s.home = true;
      const battery = s.role === 'frigate', wave = isWave(s) && !battery, home = battery ? !up : wave ? !flying.length : s.home, digging = !home && !!s.rock && s.dig > 0;
      // The frame it flies in: home (a frigate on its battery circuit too), the wave's, you (a probe), or its rock.
      const fc = home || battery ? { x: bm.vx, y: bm.vy } : wave ? wfv : s.rock ? { x: s.rock.motion.vx, y: s.rock.motion.vy } : { x: pm.vx, y: pm.vy };
      return { wave, home, digging, fc, near: digging ? [] : scan(s, bodies, (b) => b === r.b || b === r.rock || b === s.rock, sr, sp, s.role === 'frigate' ? RF_TURN : P_TURN) };
    });
    for (let k = 0; k < n; k++) r.out.forEach((s, i) => {
      const { wave, home, digging, fc, near } = st[i], rock = s.rock;
      if (digging) return;
      if (home) approach(s, bm.x, bm.y, bm.vx, bm.vy, R, sp, brake);
      else if (s.role === 'frigate') {
        // The battery: its circuit round its world; charging or firing, nearly still with its nose on the lead point.
        const x = s.x - bm.x, y = s.y - bm.y;
        if (phase === 'go' && s.fired >= L.reload && me.m) {
          const a = leadAt(s, pm.x, pm.y, pm.vx, pm.vy, r.lance.u);
          [want.x, want.y] = [Math.cos(a) * 0.15 * sp, Math.sin(a) * 0.15 * sp];
        } else circuit(s, x, y, MASS_OUT.map((q) => q * R), MASS_OUT.map((q) => q * R), 0.5 * sp, RF_TURN);
        avoid(x, y, R + (2 + ROW[1]) * sr, 2 * R);
        [want.x, want.y] = [want.x + bm.vx, want.y + bm.vy];
      } else if (wave) formation(flying, flying.indexOf(s), massing ? 0 : 3, wc.x, wc.y, wfv, sr, mR, 1.3 * sp, keep, route, massing ? 1 : 0);
      else if (s.role === 'probe') {
        strafe(s, s.x - pm.x, s.y - pm.y, s.vx - pm.vx, s.vy - pm.vy, outer + 1.5 * mR, outer + 4 * mR, outer + mR, sp);
        [want.x, want.y] = [want.x + pm.vx, want.y + pm.vy];
      } else approach(s, rock!.motion.x, rock!.motion.y, rock!.motion.vx, rock!.motion.vy, rock!.r + 2 * sr, sp, brake);
      clear(s, near, sp);
      thrust(s, acc, s.role === 'frigate' ? RF_TURN : P_TURN, h, fc.x, fc.y);
    });
    for (let i = r.out.length - 1; i >= 0; i--) {
      const s = r.out[i], { wave, home, digging } = st[i], rock = s.rock;
      // A miner lands on its rock, digs, takes a share of it (the rest is yours to eat), and flies home loaded.
      if (s.role === 'miner' && !home && rock && (s.dig > 0 || Math.hypot(rock.motion.x - s.x, rock.motion.y - s.y) < rock.r + 3 * sr)) {
        if (!s.dig) s.da = Math.atan2(s.y - rock.motion.y, s.x - rock.motion.x);
        s.dig += dt;
        [s.x, s.y, s.vx, s.vy] = [rock.motion.x + Math.cos(s.da) * (rock.r + sr), rock.motion.y + Math.sin(s.da) * (rock.r + sr), rock.motion.vx, rock.motion.vy];
        if (Math.random() < dt * 4) ctx.fx.puff(rock.motion.x + Math.cos(s.da) * rock.r, rock.motion.y + Math.sin(s.da) * rock.r, Math.cos(s.da), Math.sin(s.da), 1, 3 * unit, 0.1 * R, rock.tint);
        if (s.dig >= DIG_S) {
          const lost = rock.m * STRIP_SHARE;
          if (rock.m - lost < GATHER_M[0] * r.b.m) ctx.kill(rock);
          else shed(rock, lost);
          [s.home, s.load, s.rock] = [true, true, undefined];
        }
      }
      if (home && Math.hypot(bm.x - s.x, bm.y - s.y) < DOCK * R) {
        if (s.load) r.stock += GATHER_U;
        r.out.splice(i, 1);
        continue;
      }
      // Fighters out fire a burst a run while the gun bears: your frigate first, then ships and miners in range (pick), else your world.
      const G = ARMS.wave;
      if (wave && phase === 'go' && me.m) {
        const f = pick(aims, s.x, s.y, G.range * mR), t = f ? { x: f.x, y: f.y, vx: f.vx ?? pm.vx, vy: f.vy ?? pm.vy } : pm;
        const bears = (!!f || Math.hypot(pm.x - s.x, pm.y - s.y) < G.range * mR + mR) && inArc(s, t.x, t.y, t.vx, t.vy, r.gun.u, G.arc);
        const p = pull(s.g, dt, bears, G.rounds, G.rate, Infinity);
        if (p) ctx.shots.fire(r.gun, s.g, p === 1, s.x, s.y, s.vx, s.vy, s.heading, t.x, t.y, t.vx, t.vy, f ? undefined : me);
      }
      // Frigates lance your world from home: reloaded, the nose charges ARMS.lance.glow s while it bears and the line is
      // clear (any body but you takes a bolt: it waits as its circuit carries it round), then a salvo.
      if (s.role === 'frigate' && phase === 'go' && me.m) {
        s.fired += dt;
        const bears = s.fired >= L.reload && inArc(s, pm.x, pm.y, pm.vx, pm.vy, r.lance.u, L.arc) && lineClear(s.x, s.y, pm.x, pm.y, me.r, bodies, (q) => q === me || q === r.b || q === r.rock, sr);
        s.glow = bears ? s.glow + dt : Math.max(0, s.glow - dt);
        const p = pull(s.g, dt, bears && s.glow >= L.glow, L.salvo, 1 / L.gap, Infinity);
        if (p) ctx.shots.fire(r.lance, s.g, p === 1, s.x, s.y, s.vx, s.vy, s.heading, pm.x, pm.y, pm.vx, pm.vy, me);
        if (p && s.g.n === 0) [s.fired, s.glow, s.g] = [0, 0, trigger()]; // the salvo's last bolt: reloading
      }
      if (ctx.onScreen(s.x, s.y, sr * 4)) {
        drawShip(ctx.put, page, 'rival', s.role, s.x, s.y, s.heading, unit, digging ? -1 : s.burn, 1, s.bank);
        if (s.glow > 0) ctx.put(page.dot, s.x + Math.cos(s.heading) * sr * 1.5, s.y + Math.sin(s.heading) * sr * 1.5, 0, sr * (1 + 3 * Math.min(1, s.glow / L.glow)), VIOLET, 0.5 + 0.4 * Math.min(1, s.glow / L.glow));
      }
    }
  }

  /**
   * Its engines (ledger stationStep), after the field's gravity: within ENGAGE of your radii (or REACH; it and you alive) an
   * orbit r.keep of your radii off you, clear of other rival worlds (APART), burning off the line of a missile of yours
   * a moment after it sees the launch (ledger DODGE). Otherwise (or beaten) engines off: it coasts. True: you are out of its reach.
   */
  function keepStation(r: Rival, dt: number) {
    const me = ctx.me, pm = me.motion, bm = r.b.motion, R = me.r, ox = bm.x - pm.x, oy = bm.y - pm.y, od = Math.hypot(ox, oy) || 1;
    const far = od > Math.max(ENGAGE * R, REACH * ctx.diag());
    [r.thrust.x, r.thrust.y] = [0, 0];
    if (r.beaten || !me.m || far || dt <= 0) return far;
    const keep = Math.max(r.keep, slotRadius(1, Math.max(0, moonSlots(me.m) - 1)) + 3); // clear of your outermost moon
    const a = (G_WORLD * pairPull(youPull(me.m, R), me.m, pullMass(r.b.m, me.m), r.b.m) * (me.m + r.b.m)) / Math.max(od, R + r.b.r) ** 2; // the pair's pull (field.ts gravity)
    let ax = 0, ay = 0;
    for (const q of list) {
      const dx = bm.x - q.b.motion.x, dy = bm.y - q.b.motion.y, d = Math.hypot(dx, dy);
      if (q !== r && q.b.m && d < APART * R && d > 0) [ax, ay] = [ax + (dx / d) * APART_V * R * (1 - d / (APART * R)), ay + (dy / d) * APART_V * R * (1 - d / (APART * R))];
    }
    const ev = evade(bm, ctx.missiles.live.filter((m) => m.team === 'you' && m.target === r.b && !m.dead)); // it sees the launch, as you see its silo's
    r.alarm = alarmStep(r.alarm, ev.n > 0, dt);
    if (r.alarm > 0) [ax, ay] = [ax + ev.x * R, ay + ev.y * R];
    const dv = stationStep(ox / R, oy / R, (bm.vx - pm.vx) / R, (bm.vy - pm.vy) / R, keep, a / R, r.turn, dt, false, ax / R, ay / R, r.alarm > 0 ? DODGE.a : A_ENG);
    [bm.vx, bm.vy, r.thrust.x, r.thrust.y] = [bm.vx + dv.x * R, bm.vy + dv.y * R, dv.x / dt, dv.y / dt];
    return far;
  }

  /**
   * Their rock moon: a new one after a loss, held on a circle.
   */
  function rockMoon(r: Rival, dt: number) {
    const b = r.b, bm = b.motion, R = b.r;
    if (!r.rock && (r.rockT -= dt) <= 0) {
      const f = ctx.field(), a = r.rockA, d = R * ROCK_ORBIT;
      r.rock = f?.spawn(bm.x + Math.cos(a) * d, bm.y + Math.sin(a) * d, bm.vx, bm.vy, RIVAL_ROCK * b.m, COMP.stony);
      if (r.rock) [r.rock.moon, r.rock.motion.drag] = [true, 0];
    }
    const rock = r.rock;
    if (rock && (!rock.m || !rock.moon)) [r.rock, r.rockT] = [undefined, ROCK_AGAIN]; // lost (eaten on its circle): not reborn every frame
    else if (rock) {
      r.rockA += ROCK_W * dt;
      const d = R * ROCK_ORBIT + rock.r, vx = bm.vx - Math.sin(r.rockA) * ROCK_W * d, vy = bm.vy + Math.cos(r.rockA) * ROCK_W * d;
      const x = bm.x + bm.vx * dt + Math.cos(r.rockA) * d, y = bm.y + bm.vy * dt + Math.sin(r.rockA) * d;
      [rock.motion.vx, rock.motion.vy, rock.motion.x, rock.motion.y] = [vx, vy, x - vx * dt, y - vy * dt];
    }
  }

  /** A slug when due: aimed at where you will be, RIVAL_AIM of them true, the rest wide by 1.5–3 of your radii. */
  function fireSlug(r: Rival, dt: number) {
    if ((r.fireT -= dt) > 0) return;
    r.fireT = between(RIVAL_FIRE);
    const me = ctx.me, pm = me.motion, bm = r.b.motion, u = SLUG_SPEED * 2 * r.b.r, ox = pm.x - bm.x, oy = pm.y - bm.y, t = intercept(ox, oy, pm.vx - bm.vx, pm.vy - bm.vy, u) ?? Math.hypot(ox, oy) / u;
    let ax = ox + (pm.vx - bm.vx) * t, ay = oy + (pm.vy - bm.vy) * t;
    if (Math.random() > RIVAL_AIM) {
      const al = Math.hypot(ax, ay) || 1, side = (Math.random() < 0.5 ? -1 : 1) * between([1.5, 3]) * me.r;
      [ax, ay] = [ax - (ay / al) * side, ay + (ax / al) * side];
    }
    const al = Math.hypot(ax, ay) || 1;
    ctx.slugs.fire(r.b, { x: ax / al, y: ay / al }, { rock: 0.8, metal: 0.2 }, VIOLET, true);
  }

  /** Patrols that break rocks heading for their world and hunt your ships near it; rebuilt one at a time while the yard lasts. */
  function homeFleet(r: Rival, dt: number) {
    const b = r.b;
    const missiles = ctx.missiles.live.filter((m) => m.team === 'you' && !m.dead); // point defence: picked first
    defend(r.ships, b, ctx.near, dt, (share, v) => shieldHolds(r.sh, share, v), ctx.fx, ctx.kill, [...ctx.mine, ...raiders(), ...missiles], ctx.shots, { bodies: ctx.me.m ? [ctx.me, ...ctx.near] : ctx.near, sr: ctx.shipR() });
    dropLost(r.ships, b, ctx.fx, 8, 0.5, VIOLET);
    if (!r.open && !r.ships.length && r.yard <= 0) open(r);
    if (!r.open && r.yard > 0 && r.ships.length < rivalShips(r.level) && (r.shipT -= dt) <= 0) {
      [r.shipT, r.yard] = [SHIP_AGAIN, r.yard - 1];
      r.ships.push(newShip(b.r, Math.random() * Math.PI * 2));
    }
    for (const s of r.ships) foeOf(s, b, r.foes, shot);
  }

  /**
   * Its silo (ARMS.missile): while its wave is out it loads, glows ARMS.missile.glow s on the surface facing you, then fires
   * rivalSalvo(level) missiles at you, fanned, ARMS.missile.after s after a frigate's lance salvo (freely with none out, or
   * once it has waited a lance reload).
   */
  function silo(r: Rival, dt: number, armed: boolean) {
    const M = ARMS.missile, me = ctx.me, pm = me.motion, bm = r.b.motion, sl = r.silo, frigs = r.out.filter((s) => s.role === 'frigate');
    const ready = armed && r.wave?.phase === 'go' && (sl.load = Math.min(M.reload, sl.load + dt)) >= M.reload;
    sl.glow = ready ? sl.glow + dt : 0;
    if (!ready || sl.glow < M.glow || (frigs.length && sl.glow < M.glow + ARMS.lance.reload && !frigs.some((s) => s.fired >= M.after && s.fired < M.after + 3))) return;
    const a = Math.atan2(pm.y - bm.y, pm.x - bm.x), x = bm.x + Math.cos(a) * r.b.r * 1.05, y = bm.y + Math.sin(a) * r.b.r * 1.05, n = rivalSalvo(r.level);
    for (let i = 0; i < n; i++) ctx.missiles.launch({ team: 'rival', x, y, vx: bm.vx, vy: bm.vy, tx: pm.x, ty: pm.y, tvx: pm.vx, tvy: pm.vy, u: M.u * r.b.r, life: M.life, k: M.k, blast: M.blast * me.r, fan: n > 1 ? M.fan * ((2 * i) / (n - 1) - 1) : 0, target: me, own: (q) => q === r.b || q === r.rock, from: r.b, seek: () => (me.m ? { ...me.motion, r: me.r } : undefined), seeker: seeker(M, r.b.r) });
    [sl.load, sl.glow] = [0, 0];
    ctx.fx.flash(x, y, r.b.r * 0.3, 8, r.b.r * 0.6);
  }

  /** Lights (by people, flickering after a hit), its shield (view.ts shieldLook: veils, lattice, ripples), ships, the silo's glow, the engine plume. */
  function look(r: Rival, dt: number, on: boolean, page: TechPage) {
    const b = r.b, bm = b.motion, R = b.r;
    r.flick = Math.max(0, r.flick - dt);
    r.look.step(bm.x, bm.y, R, clock, dt, r.sh, ctx.cam.zoom, on ? ctx.put : undefined);
    if (!on) return;
    const pm = ctx.me.motion, t = Math.hypot(r.thrust.x, r.thrust.y), at = Math.atan2(pm.y - bm.y, pm.x - bm.x);
    if (t > 0.02) ctx.put(page.dot, bm.x - (r.thrust.x / t) * R * 1.15, bm.y - (r.thrust.y / t) * R * 1.15, 0, R * (0.25 + 0.25 * Math.min(1, t / A_ENG)), VIOLET, 0.3 * Math.min(1, t / A_ENG)); // one plume opposite its thrust
    if (r.silo.glow > 0) {
      const k = Math.min(1, r.silo.glow / ARMS.missile.glow);
      ctx.put(page.dot, bm.x + Math.cos(at) * R, bm.y + Math.sin(at) * R, 0, R * (0.1 + 0.15 * k), VIOLET, 0.4 + 0.5 * k);
    }
    const lit = Math.round(LIGHTS * Math.min(1, r.pop)), rot = b.view.rotation, unit = shipUnit(ctx.me.r, ctx.cam.zoom);
    for (let i = 0; i < lit; i++) {
      const l = r.lights[i], a = l.a + rot, lx = Math.cos(a) * l.d, ly = Math.sin(a) * l.d;
      if (lx + ly < -0.15) continue; // the day side (light from the top left): lights show at night only
      ctx.put(page.dot, bm.x + lx * R, bm.y + ly * R, 0, 4.5 / ctx.cam.zoom, VIOLET, (r.flick > 0 && Math.random() < 0.5 ? 0.3 : 0.9) * Math.min(1, (lx + ly + 0.15) * 3));
    }
    for (const s of r.ships) drawShip(ctx.put, page, 'rival', 'fighter', bm.x + s.x, bm.y + s.y, s.heading, unit, s.burn, 1, s.bank);
  }

  return {
    list,
    /** Test hook: a rival world now (at a point, or the quietest spot ahead). */
    spawn,
    update(dt: number, civ: Ctx['civ']) {
      clock += dt;
      const me = ctx.me, pm = me.motion;
      // Distance travelled in view widths (a parked world gets no rivals).
      if (civ?.state?.active && me.m && ctx.cam.halfW > 0 && Number.isFinite(lastX)) travelled += Math.hypot(pm.x - lastX, pm.y - lastY) / (2 * ctx.cam.halfW);
      [lastX, lastY] = [pm.x, pm.y];
      if (travelled >= nextAt) {
        nextAt += RIVAL_TRAVEL;
        if (list.filter((r) => near(r) && !r.beaten).length < RIVAL_LOADED) spawn();
      }
      const page = ctx.page, yourShieldDown = !civ?.state || civ.state.shield <= 0;
      for (const r of [...list]) {
        const b = r.b;
        if (!b.m) {
          if (r.pop > BEATEN) ctx.news('swallowed', 'A world swallowed', 'Its people are gone with it');
          remove(r);
          continue;
        }
        if (!near(r)) {
          release(r); // left behind: its rock drifts free, the field may store the world with its chunk
          [r.out.length, r.wave] = [0, undefined]; // its ships away have gone home
          // Dropped from the list: it lives on the ledger only; its stored body must not come back as an unmanaged world. Fleeing never summons the next one at once.
          if (!r.left) [r.left, nextAt] = [true, Math.max(nextAt, travelled + RIVAL_TRAVEL)];
          if (list.length > 4 || r.beaten) [remove(r), drop(b)];
          continue;
        }
        const on = ctx.onScreen(b.motion.x, b.motion.y, b.r), far = keepStation(r, dt);
        r.left = false;
        b.guard!.r = !r.beaten && r.sh.s > 0 ? shellR(b.r, r.sh.level) : 0; // none once beaten
        if (on) r.seen += dt;
        if (r.beaten) {
          for (const v of r.look.veils) v.alpha *= Math.exp(-dt * 2);
          if (b.m > MOON_SHARE[1] * me.m) continue;
          // Beamed down to moon size: a free body now, yours to catch (a spoil); gone from the roster.
          b.held = false;
          remove(r);
          if (r.entry) r.entry.alive = false;
          continue;
        }
        const L = rivalLevel(clock - since, civ?.level ?? 1, RIVAL_LEAD[r.entry?.temper ?? 'hungry']);
        if (L > r.level && !r.open) [r.level, r.sh.level, r.sh.s] = [L, L, r.sh.s + SHIELD_K * (L - r.level)];
        if (!r.open) shieldRegen(r.sh, dt);
        rockMoon(r, dt);
        // Slugs in volleys (none while its wave is out or your shield mends).
        r.rest = restStep(r.rest, yourShieldDown, dt);
        const armed = r.seen >= T_SEE && on && me.m > 0;
        if (armed && volley(!!r.wave, r.rest)) fireSlug(r, dt);
        homeFleet(r, dt);
        strategy(r, dt, on, far);
        silo(r, dt, armed);
        if (r.pop <= BEATEN) beat(r);
        else look(r, dt, on, page);
      }
    },
    /** Shielded rival worlds for slugs (weapon.ts). */
    worlds: (): Shielded[] => list.filter((r) => !r.beaten && r.b.m > 0).map((r) => ({ body: r.b, shield: (k, share, x, y) => shieldTake(r, k, share, x, y), p: AIR })),
    /** Rival ships as your slugs see them. */
    marks: (): Mark[] => list.flatMap((r) => [
      ...r.ships.map((s) => ({ x: r.b.motion.x + s.x, y: r.b.motion.y + s.y, r: ctx.shipR(), kill: () => shot(s) })),
      ...r.out.filter((s) => !s.dead).map((s) => ({ x: s.x, y: s.y, r: ctx.shipR(), kill: s.kill })),
    ]),
    /** Rival ships as foes for your defence ships (stable objects). */
    foes: (): Foe[] => list.flatMap((r) => [...r.ships.map((s) => r.foes.get(s)!).filter(Boolean), ...r.out.filter((s) => !s.dead)]),
    /** Open worlds (defence fleet gone) and what they still hold for your miners. */
    sites: () => list.filter((r) => r.open && r.b.m > 0).map((r) => ({ body: r.b, site: r.site, beaten: r.beaten })),
    deaths,
    /**
     * After the field's collisions (combat.contacts): home patrols graze or wreck on any body but their world, as yours
     * (ships.ts crashes); a ship away dies touching any body bar its world, rock and the rock it mines (swept along this
     * frame's relative motion, as pirates).
     */
    contacts(bodies: Body[], dt: number) {
      const me = ctx.me, sr = ctx.shipR(), crack = (v: number, p: number) => ctx.sfx()?.play('crack', v, p);
      for (const r of list) {
        if (r.beaten) continue;
        const lost = r.ships.filter((s) => s.lost).length;
        crashes(r.ships, r.b, { bodies, sr }, dt, ctx.fx, ctx.kill, bumps.rival, VIOLET, me, ctx.onScreen, crack);
        deaths.body += r.ships.filter((s) => s.lost).length - lost;
        for (const s of r.out) {
          if (s.dead) continue;
          const hit = bump(s.x, s.y, s.vx, s.vy, bodies, sr, dt, (b) => b === r.b || b === r.rock || b === s.rock, MISS_V * me.r);
          if (hit && !hit.miss) [s.dead, deaths.body, bumps.rival.wreck] = [true, deaths.body + 1, bumps.rival.wreck + 1];
          else if (sparks(ctx.fx, s, hit, dt, sr * 0.35, VIOLET, ctx.onScreen)) bumps.rival.miss++;
        }
      }
    },
    /** A rival's own slug never hits its world or its rock. */
    own: (s: Slug, b: Body) => list.some((r) => r.b === s.from && b === r.rock),
    /** Shield ripple / people lost for hits on rival worlds (main.ts onHit through combat). */
    hit(h: Hit) {
      const r = list.find((q) => q.b === h.a || q.b === h.b);
      if (!r || r.beaten || !r.b.m || slugBodies.has(h.a) || h.kind === 'eat') return; // a meal is not an attack
      const kelvin = hitKelvin(h, r.b); // what got past its shell (b.guard)
      if (kelvin >= HIT_MIN) [r.pop, r.flick] = [r.pop * (1 - Math.min(RIVAL_HIT_MAX, kelvin * HIT_KILL)), 1.5];
    },
    /** The rival world still fighting for your sortie (civilization/stage.ts Arms.foe): `prefer` (your order or target) if it is one, else the nearest; a weapon hit on it goes to `struck`. */
    foe(prefer?: Body) {
      const pm = ctx.me.motion, live = list.filter((r) => !r.beaten && r.b.m > 0 && near(r)), aimed = live.find((r) => r.b === prefer), r = aimed ?? live.sort((a, c) => Math.hypot(a.b.motion.x - pm.x, a.b.motion.y - pm.y) - Math.hypot(c.b.motion.x - pm.x, c.b.motion.y - pm.y))[0];
      return r && { body: r.b, hit: (arm: Arm, k: number, x: number, y: number, cap?: Raid) => struck(r, arm, k, x, y, cap) };
    },
    /** A missile burst on body `b` (combat.ts): theirs on you, yours on a rival world; weapon fire either way. */
    missileHit(m: Missile, b: Body, x: number, y: number) {
      if (m.team === 'rival' && b === ctx.me) return void ctx.civ?.struck('missile', m.k, x, y, list.find((r) => r.b === m.from)?.raid);
      const r = m.team === 'you' ? list.find((q) => q.b === b) : undefined;
      if (r) struck(r, 'missile', m.k, x, y);
    },
    /** Dev hooks: beat a rival now; send its war wave now (massing first, as ever). */
    beat: (r: Rival) => void (r.pop = BEATEN),
    attack(r: Rival) {
      if (r.wave || r.beaten) return;
      [r.seen, r.stock, r.stanceT] = [Math.max(r.seen, 60), Math.max(r.stock, 1e3), 1];
      sendWave(r, r.entry?.temper ?? 'hungry');
    },
    /** Your beam on `b` (combat.ts): false while a rival's shield takes its `kelvin` (nothing removed); else its people fall by BEAM_KILL × `share`. */
    beam(b: Body, kelvin: number, share: number, x: number, y: number) {
      const r = list.find((q) => q.b === b);
      if (!r || r.beaten) return true;
      if (shieldTake(r, kelvin, 0, x, y)) return false;
      [r.pop, r.flick] = [beamPop(r.pop, share), 1.5];
      return true;
    },
    /** Shield take from outside (pirate shots). */
    shieldTake,
    /** Pirate ships for their patrols to hunt (pirates.ts). */
    watch: (f: () => Foe[]) => void (raiders = f),
    destroy() {
      for (const r of [...list]) [remove(r), drop(r.b)]; // respawn keeps the field: a world left in it would be unmanaged
    },
  };
}

export type Rivals = ReturnType<typeof createRivals>;
