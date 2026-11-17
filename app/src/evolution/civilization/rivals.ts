import { drawShip, shipUnit, VIOLET, type TechPage } from '../../render/tech';
import { between, logBetween } from '../../core/rng';
import { setSurface } from '../asteroid/sphere';
import { slotRadius } from '../../core/orbits';
import { markFreed } from '../planet/moons';
import { MOON_SHARE, moonSlots } from '../planet/rules';
import { drop, hitKelvin, shed, unmoon, type Body, type Hit } from '../asteroid/body';
import { burnShare, COMP, G_WORLD, pairPull, pieceShares, pullMass, SPREAD, youPull } from '../asteroid/rules';
import { thrustOf } from '../asteroid/player';
import { A_ENG, alarmStep, DEFEND_SHIELD, DODGE, evade, GATHER_U, newWave, next, pursueStep, restStep, SITE, stance, stationStep, STOCK_RATE, volley, WAVE_COST, waveStep, WORLD_FLAGS, type Entry, type Stance, type Wave } from '../rivals/ledger';
import { isWave, OUT_V, plan, settle, step, type Away, type Centre, type Frame, type Role } from './away';
import type { Ctx } from './combat';
import { bump, bumps, MISS_V, sparks } from './crash';
import { chase, inArc, leash, lowPass, MAX_DT, steps } from './flight';
import { lineClear, pick, pull, trigger, type Gun, type Rocket, type Trigger } from './guns';
import { fireReach } from './mining';
import {
  ARMS, BEATEN, CHASE_V, FRIGATE_S, FRIGATE_STOCK, HIT_KILL, HIT_MIN, LEASH, pace, raid, RIVAL_FIRST, RIVAL_GLOW, RIVAL_HIT_MAX, RIVAL_LEAD, RIVAL_LOADED, RIVAL_MASS, RIVAL_PACE, RIVAL_RIPPLE, RIVAL_ROCK, RIVAL_SALVO, SALVO_LEAD,
  RIVAL_TRAVEL, rivalFrigates, rivalLevel, rivalSalvo, rivalShips, shellR, SHIELD_K, shieldHolds, shieldMax, shieldMeet, shieldRegen, shieldShot, strength, T_SEE, waveFighters, weaponHit, type Arm, type Raid, type Shield,
} from './rules';
import { crashes, defend, dropLost, foeOf, lose, newShip, strike, type Foe, type Ship } from './ships';
import { shieldLook, type ShieldLook } from './view';

// Rival civilizations (numbers in rules.ts, stances and waves in rivals/ledger.ts): living worlds with people, a shield shell
// like yours (rules.ts shieldMeet), home patrols (ships.ts defend: they hunt pirates too) and a rocket pad (your rockets,
// guns.ts). Each spawns at the quietest spot ahead (field.fillAt) as the run roster's next named rival.
//   - Their rock circles their world, a guard: a match on its circle steals it (moons.ts); dropped, a match within 30 s does.
//   - Probes look you over, a miner strips free rocks; with stock and odds to suit its temper a war wave masses in view, then
//     its fighters strafe you in wings of three (guns.ts pick: your frigate, ships, miners, else your shield), its frigates
//     lance you from home and its pad keeps launching rockets. Home on losses, outrun, its shield low, or your people
//     at the raid's floor. Ships away die touching a body; home patrols graze or wreck as yours do (ships.ts crashes).
//   - Open once its fleet is gone for good (YARD fleets of rebuilds spent): its shield stops mending, miners take SITE × level.
//   - Weapon hits go through rules.ts weaponHit like yours (`struck`).
// Its world is a gravity body (ledger WORLD_FLAGS): engines (ledger stationStep) keep it KEEP of your radii off you, clear of
// other rivals, dodging your rockets (ledger DODGE); beaten, engines off, it stays your gravitating companion.

const AIR = 1; // atm on a rival world
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
const KEEP = [8, 12]; // your radii: on screen, so it sees you and fires
const APART = 6; // your radii: another rival world this close pushes it away...
const APART_V = 1; // ...at up to this many of your radii/s
// Ships away from home (war wave, probe, miner): their flight is away.ts.
const PROBE_AGAIN = 25; // s between probes
const GATHER_R = 8; // rival radii: a miner takes free rocks this close to its world...
const GATHER_M = [1e-4, 0.03]; // ...of this share of its mass
const STRIP_SHARE = 0.3; // of the rock per trip (a rock under 1e-4 of the world is taken whole)

/** A ship away from home (away.ts Away): `load` a miner's haul; a frigate's nose `glow` (s charged). */
type Out = Foe & Away & { hp: number; g: Trigger; rock?: Body; load: boolean; dead: boolean; glow: number };

export type Rival = {
  b: Body; level: number; sh: Shield; pop: number; seen: number; rockT: number; shipT: number;
  rock?: Body; rockA: number; ships: Ship[]; foes: WeakMap<Ship, Foe>; lights: { a: number; d: number }[];
  look: ShieldLook; flick: number; beaten: boolean; keep: number; turn: number; alarm: number; // a rocket alarm (ledger alarmStep)
  left?: boolean; // gone out of reach (the next spawn waits)
  entry?: Entry; temper: Entry['temper']; stance: Stance; stanceT: number; stock: number; out: Out[]; wave?: Wave; c: Centre; fv: { x: number; y: number }; lash: { far: number; slow: number }; probeT: number;
  rest: number; quit: { slow: number; rest: number }; inRange: boolean; // s until its next volley (ledger restStep); its will to follow you (ledger pursueStep); you are inside its fire range (mining.ts fireReach)
  gun: Gun; lance: Gun; // its war wave's guns: the fighters' rounds, the frigates' lance
  /** Its defence fleet is gone: your miners work `site` (civilization/stage.ts). */
  open: boolean; site: { ore: number; vol: number }; yard: number; // ships it can still rebuild
  frig: number; frigT: number; // frigates it has (rivalFrigates; built apart from wave ships), s to the next rebuilt one
  wound: { k: number }; raid?: Raid; // heavy fire on it not yet landed; its wave's caps on your people
  pad: { t: number; glow: number; left: number }; thrust: { x: number; y: number }; // its rocket pad (s to the next launch, s glowing, rockets left this salvo); its engines' last Δv/s (the plume)
  af?: Frame; // its ships away's frame (away.ts), reused
};

export function createRivals(ctx: Ctx) {
  const list: Rival[] = [];
  const deaths = { body: 0, shot: 0 }; // what broke their ships (test hook): touching a body, or rounds and rockets
  const shot = (s: Ship) => void (lose(s) && deaths.shot++);
  let raiders = (): Foe[] => []; // pirate ships: their patrols hunt them too (pirates.ts calls watch)
  let travelled = 0, paceNow = 1, nextAt = RIVAL_FIRST, clock = 0, since = -1, lastX = NaN, lastY = NaN, lastEntry: Entry | undefined;
  // Loaded: the field still holds the world (it stores it with its chunk once you leave; its view leaves the layer then).
  const near = (r: Rival) => r.b.m > 0 && !!r.b.view.parent && Math.hypot(r.b.motion.x - ctx.me.motion.x, r.b.motion.y - ctx.me.motion.y) < FAR * ctx.diag();
  const veil = (r: Rival, s0: number, x: number, y: number) => s0 > 0 && [r.look.ripple(Math.atan2(y - r.b.motion.y, x - r.b.motion.x)), r.sh.s <= 0 && ctx.fx.burst(r.b.motion.x, r.b.motion.y, 20, r.b.r * 0.08, r.b.r * 1.4, VIOLET)]; // a hit on its veil while up (s0): a ripple; a burst if it collapses

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
      b, level, sh: { level, s: SHIELD_K * level }, pop: 1, seen: 0, rockT: 0, shipT: SHIP_AGAIN,
      rockA: Math.random() * Math.PI * 2, ships: [], foes: new WeakMap(), flick: 0, beaten: false, keep: between(KEEP), turn: Math.random() < 0.5 ? -1 : 1,
      frig: rivalFrigates(level), frigT: FRIGATE_S, wound: { k: 0 }, pad: { t: 0, glow: 0, left: 0 }, thrust: { x: 0, y: 0 }, alarm: -between(DODGE.react),
      entry, temper, stance: 'explore', stanceT: 0, stock: 0, out: [], gun, lance, c: { x: 0, y: 0, vx: 0, vy: 0 }, fv: { x: 0, y: 0 }, lash: { far: 0, slow: 0 }, probeT: 0, rest: 0, quit: { slow: 0, rest: 0 }, inRange: false, open: false, site: { ore: 0, vol: 0 }, yard: YARD * rivalShips(level),
      lights: Array.from({ length: LIGHTS }, () => ({ a: Math.random() * Math.PI * 2, d: 0.25 + 0.65 * Math.sqrt(Math.random()) })),
      look: shieldLook(ctx.root, page, VIOLET, Math.floor(Math.random() * 1e9), 3),
    };
    for (let i = 0; i < rivalShips(level); i++) r.ships.push(newShip(b.r, (i / rivalShips(level)) * Math.PI * 2));
    b.guard = { r: 0, own, meet(q, v, x, y) { // its shell, as yours (its own rock passes; another world's moon meets it)
      const s0 = r.sh.s, st = strike(b, q, burnShare(AIR)), k = shieldMeet(r.sh, st.kelvin, st.share, v / st.vs);
      if (k) [veil(r, s0, x, y), ctx.fx.flash(x, y, q.r * 2, 8, q.r * 3)];
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
    unmoon(rock);
    markFreed(rock); // caught within 30 s it counts as stolen
  }
  function remove(r: Rival) {
    release(r);
    const e = r.entry;
    if (e) [e.m, e.alive, e.out] = [r.b.m || e.m, r.b.m > 0, false]; // back on the ledger; swallowed, it is gone for the run
    r.look.destroy();
    list.splice(list.indexOf(r), 1);
  }
  /** Weapon fire on the rival's shield (a pirate shot): taken while it is up (rules.ts shieldShot). */
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
    const s0 = r.sh.s, h = weaponHit(r.sh, r.wound, r.pop, arm, k, cap);
    veil(r, s0, x, y);
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

  /** A war wave: waveFighters bought from stock, and every frigate it has. */
  function sendWave(r: Rival) {
    const n = waveFighters(r.level), a0 = Math.random() * Math.PI * 2, all = n + r.frig;
    [r.stock, r.wave] = [r.stock - WAVE_COST[r.temper] * n, newWave(all, r.frig)];
    for (let i = 0; i < all; i++) launch(r, i < r.frig ? 'frigate' : 'fighter', a0 + (i / all) * Math.PI * 2);
  }

  /** Stance, launches, the war wave and every ship away from home (`far`: you are out of its reach). */
  function strategy(r: Rival, dt: number, on: boolean, far: boolean, bodies: Body[]) {
    const me = ctx.me, pm = me.motion, bm = r.b.motion, R = r.b.r, sr = ctx.shipR(), sp = OUT_V * me.r, temper = r.temper;
    r.stock += STOCK_RATE * r.level * dt;
    r.probeT -= dt;
    if ((r.stanceT -= dt) <= 0) {
      r.stanceT = 1;
      const civ = ctx.civ, n = waveFighters(r.level), yours = civ ? strength(civ.ships.filter((s) => s.kind === 'fighter').length, civ.frigates.length, civ.level) : 0;
      const odds = yours > 0 ? strength(r.ships.length + n, r.frig, r.sh.level) / yours : Infinity;
      r.stance = r.open ? 'defend' : stance({ temper, wave: !!r.wave, shield: r.sh.s / shieldMax(r.sh), fleetShort: !r.ships.length, far, seen: r.seen, stock: r.stock, level: r.level, odds, rest: r.quit.rest > 0 });
      if (r.stance === 'attack' && !r.wave) sendWave(r);
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
      ctx.wreck(r.out[i].x, r.out[i].y, VIOLET, 1.6, r.out[i].role, r.out[i].load ? GATHER_U : 0); // salvage: rules.ts SALVAGE, a miner's haul too
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

    const dtc = Math.min(dt, MAX_DT), n = steps(dtc), h = dtc / n, mR = me.r, L = ARMS.lance;
    [r.gun.u, r.lance.u] = [ARMS.round.u * mR, L.u * R];
    const outer = slotRadius(mR, Math.max(0, ...ctx.moons.list().map((m) => m.slot)));
    const page = ctx.page, unit = shipUnit(mR, ctx.cam.zoom), aims = [...ctx.miners, ...ctx.mine];
    lowPass(r.fv, r.c.vx, r.c.vy, dt);
    const phase = r.wave?.phase, f = (r.af ??= { you: me, world: r.b, phase, c: r.c, fv: r.fv, outer, sr, bodies, own: (b, s) => b === r.b || b === r.rock || b === s.rock, lance: { u: 0, reload: L.reload } });
    f.you = me, f.phase = phase, f.c = r.c, f.fv = r.fv, f.outer = outer, f.sr = sr, f.bodies = bodies, f.lance.u = r.lance.u;
    const st = plan(r.out, f, dt);
    for (let k = 0; k < n; k++) for (let i = 0; i < r.out.length; i++) step(r.out, i, st[i], f, h);
    for (let i = r.out.length - 1; i >= 0; i--) {
      const s = r.out[i], { wave, digging } = st[i], rock = s.rock, end = settle(s, st[i], f, dt);
      // A miner lands on its rock, digs, takes a share of it (the rest is yours to eat), and flies home loaded.
      if ((end === 'dig' || end === 'dug') && Math.random() < dt * 4) ctx.fx.puff(rock!.motion.x + Math.cos(s.da) * rock!.r, rock!.motion.y + Math.sin(s.da) * rock!.r, Math.cos(s.da), Math.sin(s.da), 1, 3 * unit, 0.1 * R, rock!.tint);
      if (end === 'dug') {
        const lost = rock!.m * STRIP_SHARE;
        if (rock!.m - lost < GATHER_M[0] * r.b.m) ctx.kill(rock!);
        else shed(rock!, lost);
        s.load = true;
      }
      if (end === 'docked') {
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
        const bears = r.inRange && s.fired >= L.reload && inArc(s, pm.x, pm.y, pm.vx, pm.vy, r.lance.u, L.arc) && lineClear(s.x, s.y, pm.x, pm.y, me.r, bodies, (q) => q === me || q === r.b || q === r.rock, sr);
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
   * Engines (ledger stationStep) after gravity: within ENGAGE R (both alive, and while it still follows you: ledger pursueStep) an orbit r.keep R off you, clear of rival worlds (APART), dodging
   * your rockets (ledger DODGE: building its own thrust over DODGE.ramp). Else (or beaten) engines off: it coasts. True: you are out of its reach.
   */
  function keepStation(r: Rival, dt: number) {
    const me = ctx.me, pm = me.motion, bm = r.b.motion, R = me.r, ox = bm.x - pm.x, oy = bm.y - pm.y, od = Math.hypot(ox, oy) || 1;
    const far = od > ENGAGE * R, was = { x: r.thrust.x, y: r.thrust.y }, keep = Math.max(r.keep, slotRadius(1, Math.max(0, moonSlots(me.m) - 1)) + 3); // R/s², last step; clear of your outermost moon
    [r.thrust.x, r.thrust.y] = [0, 0];
    if (r.beaten || !me.m || far || dt <= 0 || !pursueStep(r.quit, r.temper, od / R, keep, (ox * (bm.vx - pm.vx) + oy * (bm.vy - pm.vy)) / od / R, dt)) return far; // outrun: engines off, it coasts
    const a = (G_WORLD * pairPull(youPull(me.m, R), me.m, pullMass(r.b.m, me.m), r.b.m) * (me.m + r.b.m)) / Math.max(od, R + r.b.r) ** 2; // the pair's pull (field.ts gravity)
    let ax = 0, ay = 0;
    for (const q of list) {
      const dx = bm.x - q.b.motion.x, dy = bm.y - q.b.motion.y, d = Math.hypot(dx, dy);
      if (q !== r && q.b.m && d < APART * R && d > 0) [ax, ay] = [ax + (dx / d) * APART_V * R * (1 - d / (APART * R)), ay + (dy / d) * APART_V * R * (1 - d / (APART * R))];
    }
    const ev = evade(bm, ctx.rockets.live.filter((m) => m.team === 'you' && m.target === r.b && !m.dead)); // it sees the launch, as you see its pad's
    r.alarm = alarmStep(r.alarm, ev.n > 0, dt);
    if (r.alarm > 0) [ax, ay] = [ax + ev.x * R, ay + ev.y * R];
    const dv = stationStep(ox / R, oy / R, (bm.vx - pm.vx) / R, (bm.vy - pm.vy) / R, keep, a / R, r.turn, dt, false, ax / R, ay / R, r.alarm > 0 ? thrustOf(r.b) / R : A_ENG, was);
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
    if (rock && (!rock.m || !rock.moon || ctx.moons.owns(rock))) [r.rock, r.rockT] = [undefined, ROCK_AGAIN]; // lost (eaten, or stolen on its circle): not reborn every frame
    else if (rock) {
      const w = -r.turn * ROCK_W, a = (r.rockA += w * dt); // against its own orbit round you: a still player never matches it by luck
      const d = R * ROCK_ORBIT + rock.r, vx = bm.vx - Math.sin(a) * w * d, vy = bm.vy + Math.cos(a) * w * d;
      const x = bm.x + bm.vx * dt + Math.cos(r.rockA) * d, y = bm.y + bm.vy * dt + Math.sin(r.rockA) * d;
      [rock.motion.vx, rock.motion.vy, rock.motion.x, rock.motion.y] = [vx, vy, x - vx * dt, y - vy * dt];
    }
  }

  /** Patrols that break rocks heading for their world and hunt your ships near it; rebuilt one at a time while the yard lasts. */
  function homeFleet(r: Rival, dt: number, bodies: Body[]) {
    const b = r.b;
    const rockets = ctx.rockets.live.filter((m) => m.team === 'you' && !m.dead); // point defence: picked first
    defend(r.ships, b, ctx.near, dt, (share, v) => shieldHolds(r.sh, share, v), ctx.fx, ctx.kill, [...ctx.mine, ...raiders(), ...rockets], ctx.shots, { bodies, sr: ctx.shipR() });
    dropLost(r.ships, b, ctx.fx, 8, 0.5, VIOLET, (x, y) => ctx.salvage(x, y, 'fighter'));
    if (!r.open && !r.ships.length && r.yard <= 0) open(r);
    if (!r.open && r.yard > 0 && r.ships.length < rivalShips(r.level) && (r.shipT -= dt) <= 0) {
      [r.shipT, r.yard] = [SHIP_AGAIN, r.yard - 1];
      r.ships.push(newShip(b.r, Math.random() * Math.PI * 2));
    }
    for (const s of r.ships) foeOf(s, b, r.foes, shot);
  }

  /**
   * Its rocket pad (your rockets, rules.ts ROCKET): armed (in its fire range) with its wave out or on its volley rhythm, the pad
   * glows RIVAL_GLOW s on the surface facing you (seen, never told), then rivalSalvo(level, SALVO_LEAD) rockets ripple out
   * RIVAL_RIPPLE s apart; the next salvo RIVAL_SALVO s later. Your radius is their unit, so your size never changes a dodge.
   */
  function rockets(r: Rival, dt: number, armed: boolean) {
    const me = ctx.me, pm = me.motion, bm = r.b.motion, p = r.pad;
    p.t -= dt;
    if (!p.left) {
      p.glow = armed && p.t <= 0 && (r.wave?.phase === 'go' || volley(!!r.wave, r.rest)) ? p.glow + dt : 0;
      if (p.glow >= RIVAL_GLOW) [p.left, p.glow, p.t] = [rivalSalvo(r.level, SALVO_LEAD[r.temper]), 0, 0];
    } else if (p.t <= 0 && ctx.rockets.room()) {
      [p.left, p.t] = [p.left - 1, p.left > 1 ? RIVAL_RIPPLE : RIVAL_SALVO];
      ctx.rockets.launch({ team: 'rival', x: bm.x, y: bm.y, vx: bm.vx, vy: bm.vy, r: r.b.r, tx: pm.x, ty: pm.y, R: me.r, range: fireReach(r.b), target: me, from: r.b, own: (q) => q === r.b || q === r.rock, seek: () => (me.m ? { ...me.motion, r: me.r } : undefined) });
      ctx.sfx()?.play('rocket', 0.3, 0.85);
    }
  }

  /** Lights (by people, flickering after a hit), its shield (view.ts shieldLook: veils, lattice, ripples), ships, the pad's glow, the engine plume. */
  function look(r: Rival, dt: number, on: boolean, page: TechPage) {
    const b = r.b, bm = b.motion, R = b.r;
    r.flick = Math.max(0, r.flick - dt);
    r.look.step(bm.x, bm.y, R, clock, dt, r.sh, ctx.cam.zoom, on ? ctx.put : undefined);
    if (!on) return;
    const pm = ctx.me.motion, t = Math.hypot(r.thrust.x, r.thrust.y), at = Math.atan2(pm.y - bm.y, pm.x - bm.x);
    if (t > 0.02) ctx.put(page.dot, bm.x - (r.thrust.x / t) * R * 1.15, bm.y - (r.thrust.y / t) * R * 1.15, 0, R * (0.25 + 0.25 * Math.min(1, t / A_ENG)), VIOLET, 0.3 * Math.min(1, t / A_ENG)); // one plume opposite its thrust
    if (r.pad.glow > 0) {
      const k = Math.min(1, r.pad.glow / RIVAL_GLOW);
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
      // Distance travelled in view widths × the local pace, sampled once a second (a parked world gets no rivals; voids are lonely).
      if (Math.floor(clock) > Math.floor(clock - dt)) paceNow = pace(ctx.field()?.fillAt(pm.x, pm.y) ?? 1, RIVAL_PACE);
      if (civ?.state?.active && me.m && ctx.cam.halfW > 0 && Number.isFinite(lastX)) travelled += (paceNow * Math.hypot(pm.x - lastX, pm.y - lastY)) / (2 * ctx.cam.halfW);
      [lastX, lastY] = [pm.x, pm.y];
      if (travelled >= nextAt) {
        nextAt += RIVAL_TRAVEL;
        if (list.filter((r) => near(r) && !r.beaten).length < RIVAL_LOADED) spawn();
      }
      const page = ctx.page, yourShieldDown = !civ?.state || civ.state.shield <= 0, bodies = me.m ? [me, ...ctx.near] : ctx.near;
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
          // Mined down to moon size: a free body now, yours to catch (a spoil); gone from the roster.
          b.held = false;
          remove(r);
          if (r.entry) r.entry.alive = false;
          continue;
        }
        const L = rivalLevel(clock - since, civ?.level ?? 1, RIVAL_LEAD[r.temper]);
        if (L > r.level && !r.open) [r.level, r.sh.level, r.sh.s] = [L, L, r.sh.s + SHIELD_K * (L - r.level)];
        if (!r.open) shieldRegen(r.sh, dt);
        rockMoon(r, dt);
        // Rockets only within its fire range; outside a wave in volleys (none while your shield mends).
        r.rest = restStep(r.rest, yourShieldDown, dt);
        r.inRange = Math.hypot(b.motion.x - pm.x, b.motion.y - pm.y) - b.r - me.r <= fireReach(b);
        homeFleet(r, dt, bodies);
        strategy(r, dt, on, far, bodies);
        rockets(r, dt, r.seen >= T_SEE && on && me.m > 0 && r.inRange);
        if (r.pop <= BEATEN) beat(r);
        else look(r, dt, on, page);
      }
    },
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
    /** Shield ripple / people lost for hits on rival worlds (main.ts onHit through combat). */
    hit(h: Hit) {
      const r = list.find((q) => q.b === h.a || q.b === h.b);
      if (!r || r.beaten || !r.b.m || h.kind === 'eat') return; // a meal is not an attack
      const kelvin = hitKelvin(h, r.b); // what got past its shell (b.guard)
      if (kelvin >= HIT_MIN) [r.pop, r.flick] = [r.pop * (1 - Math.min(RIVAL_HIT_MAX, kelvin * HIT_KILL)), 1.5];
    },
    /** The rival world still fighting for your sortie (civilization/stage.ts Arms.foe): `prefer` (your order or target) if it is one, else the nearest; a weapon hit on it goes to `struck`. */
    foe(prefer?: Body) {
      const pm = ctx.me.motion, live = list.filter((r) => !r.beaten && r.b.m > 0 && near(r)), aimed = live.find((r) => r.b === prefer), r = aimed ?? live.sort((a, c) => Math.hypot(a.b.motion.x - pm.x, a.b.motion.y - pm.y) - Math.hypot(c.b.motion.x - pm.x, c.b.motion.y - pm.y))[0];
      return r && { body: r.b, hit: (arm: Arm, k: number, x: number, y: number, cap?: Raid) => struck(r, arm, k, x, y, cap) };
    },
    /** A rocket burst on world `b` (combat.ts): theirs on you (outside its wave it kills nobody: floor = your people), yours on a rival world; true when it was a world. */
    rocketHit(m: Pick<Rocket, 'team' | 'k' | 'from'>, b: Body, x: number, y: number) {
      const w = list.find((q) => q.b === m.from), r = m.team === 'you' ? list.find((q) => q.b === b) : undefined;
      if (m.team === 'rival' && b === ctx.me) return ctx.civ?.struck('rocket', m.k, x, y, w?.wave?.phase === 'go' ? w.raid : { floor: ctx.civ.state?.pop ?? 0, burnt: 0 }), true;
      if (r) struck(r, 'rocket', m.k, x, y);
      return !!r;
    },
    /** Dev hooks: beat a rival now; send its war wave now (massing first, as ever). */
    beat: (r: Rival) => void (r.pop = BEATEN),
    attack(r: Rival) {
      if (r.wave || r.beaten) return;
      [r.seen, r.stock, r.stanceT] = [Math.max(r.seen, 60), Math.max(r.stock, 1e3), 1];
      sendWave(r);
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
