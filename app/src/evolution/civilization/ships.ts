import { K_PER_HEAT } from '../../core/water';
import { phys, shed, type Body, type Events } from '../asteroid/body';
import { AGE_GOAL, G_WORLD, stickSpeed, youPull } from '../asteroid/rules';
import type { Fx } from '../../render/fx';
import { VIOLET, YOU } from '../../render/tech';
import { homeContact, pebble, smolder, sparks } from './crash';
import {
  ACC, arrive, ATTACK_V, BRAKE, BURST, F_ACC, F_PATROL_V, F_TURN, GAP, GUN, GUN_ARC, inArc, leadAt, MAX_DT, pairUp, PATROL_V, RATE, RETURN_V, SHOT_S, SHOT_V, SPREAD, steps, TURN, want, type Craft,
  type Fighter,
} from './flight';
import { lineClear, nearest, pick, pull, trigger, type Cls, type Gun, type Shots, type Trigger } from './guns';
import { breakOff, breakStep, guard, homeStep, LOOK, PAD, reachOf, ringStep, runStep, scanRel, siegePost, type Disc, type Home } from './nav';
import { ARMS, deflect, FLEET, HIT_MIN, ROCKET, SIEGE, strikeK } from './rules';

// Defence ships round a world (yours, or a rival's: rivals.ts), flying relative to it (flight.ts, nav.ts): pairs on a circuit,
// attack runs that fire in gun range and break off before they get close, steering round bodies they can still crash on
// (crashes). Idle ships hunt enemy ships within FOE_REACH (guns.ts pick: rockets first, then frigates).
//   Rival patrols run at bodies on course to hurt their world past its shield: under BREAK they break, bigger ones are pushed aside.
//   Yours (`frag`) fire at rocks only for your priority (`frag.prio`, stage.ts): a hit breaks what the class can (FLEET.breaks,
//   stage.ts cut), else pushes it aside (rules.ts deflect). The frigate lances it (frigateStep).
// Battles (`siege`, stage.ts): the siege wing rings the enemy world in pairs (nav.ts ringStep), takes its ships, and every
// SIEGE.pass s a pair strafes it; the frigate lances it from its ring post (siegePost).

export const LOOK_S = 6; // s ahead a ship looks for threats (and a priority counts a body on course)
const BREAK = 0.005; // share of your mass: smaller threats are broken up (rival ships; yours by FLEET.breaks)
const PUSH = 1; // your diameters/s of sideways kick per ship on a body of PUSH_SHARE of you (less for heavier)...
const PUSH_SHARE = 0.05;
const COOL_S = 2.5; // s a rival ship needs after acting before it can go again (yours: FLEET.cool)
const FOE_REACH = 9; // radii of its world: idle ships hunt enemy ships this close
const PROBE = { kick: 0.4, slow: 0.7 }; // a probe's laser pushes this share of a fighter's kick; it patrols at this share of a fighter's pace

/** An enemy ship (or rocket) this frame, in world units (with its velocity, if known, to lead it); `kill` breaks it (`heavy`: a rocket's direct hit); `cls` for pick. */
export type Foe = { x: number; y: number; vx?: number; vy?: number; kill: (heavy?: boolean) => void; cls?: Cls };
/** Your fleet engaged on a rival `world` (stage.ts): `wing` fighters fly the ring of radius `ring` round it, `t` s in, the next strafing turn in `pass` s; `hit` hears a round or a lance bolt on it. */
export type Siege = { world: Body; wing: number; ring: number; t: number; pass: number; hit: (arm: 'round' | 'lance', k: number, x: number, y: number) => void };

/** Position and velocity relative to its world; `g`: its gun's trigger. */
export type Ship = Fighter & { kind: 'probe' | 'fighter'; lead?: Ship; target?: Body; foe?: Foe; cool: number; g: Trigger; lost?: boolean; shot?: number; ring?: boolean }; // shot: rounds since it last cooled (yours); ring: in the siege wing
/** What home ships steer round and hit: the bodies (world units), a ship's radius. */
export type Nav = { bodies: readonly Body[]; sr: number };

/** A new ship on the surface at angle `a`; it climbs out onto its circuit (or a leader's wing: flight.ts pairUp). */
export function newShip(R: number, a: number, kind: Ship['kind'] = 'fighter'): Ship {
  return { kind, x: Math.cos(a) * R, y: Math.sin(a) * R, vx: 0, vy: 0, heading: a, burn: 0, wx: 0, wy: 0, k: Math.round(a * 977), sense: 0, mode: 'patrol', t: 0, bh: 0, cool: 0, g: trigger() };
}

/** A hit on a ship (a round, a rocket): a hull point if it has more than one (frigates), else it is lost; true when lost now. */
export const lose = (s: Ship) => !s.lost && !(s.hull !== undefined && --s.hull > 0) && (s.lost = true);
/** Ship `s` of world `b` as a Foe for the other side: one stable object per ship in `cache` (hunters keep their target); a hit calls `onKill`. */
export function foeOf(s: Ship, b: Body, cache: WeakMap<Ship, Foe>, onKill: (s: Ship) => unknown): Foe {
  let f = cache.get(s);
  if (!f) cache.set(s, (f = { x: 0, y: 0, kill: () => void onKill(s), cls: 'load' in s ? 'frigate' : s.kind }));
  const m = b.motion;
  [f.x, f.y, f.vx, f.vy] = [m.x + s.x, m.y + s.y, m.vx + s.vx, m.vy + s.vy];
  return f;
}
/** Drops the lost ships of world `b`, each in a burst of `n` sparks out to `reach` × its radius. */
export function dropLost(ships: Ship[], b: Body, fx: Fx, n: number, reach: number, tint: number, on?: (x: number, y: number) => void) {
  for (let i = ships.length - 1; i >= 0; i--) if (ships[i].lost) {
    fx.burst(b.motion.x + ships[i].x, b.motion.y + ships[i].y, n, b.r * 0.04, b.r * reach, tint);
    on?.(b.motion.x + ships[i].x, b.motion.y + ships[i].y); // where it broke (rivals.ts: salvage)
    ships.splice(i, 1);
  }
}
/** The bodies home ships of world `me` can meet this frame (once a frame, for their scans and bumps): their reach past the farthest. */
export function homeBodies(ships: readonly Craft[], me: Body, nav: Nav) {
  let far = 0;
  for (const s of ships) far = Math.max(far, Math.hypot(s.x, s.y));
  const pm = me.motion;
  return reachOf(nav.bodies, pm.x, pm.y, pm.vx, pm.vy, far + (LOOK + 1) * RETURN_V * me.r + PAD * nav.sr + me.r, LOOK + 1);
}

const SCAR_K = 40; // K a wreck leaves on a ship-sized body (× (ship radius / its radius)³: nothing on a moon)
/** A ship wrecked on body b at (x, y): a flash and sparks in its tint; heat, but never on `you` or a held world. */
export function scar(fx: Fx, b: Body, x: number, y: number, sr: number, you: Body) {
  fx.flash(x, y, sr * 3, 0, 0);
  fx.burst(x, y, 6, sr * 0.4, sr * 5, b.tint);
  if (b !== you && !b.held) b.heat += (SCAR_K / K_PER_HEAT) * Math.min(1, (sr / b.r) ** 3);
}

/** What a ship's contacts make: wrecks, grazes, sparked near misses (crash.ts bumps, by faction). */
export type Tally = { wreck: number; graze: number; miss: number };
/**
 * Contacts after the field moved (combat.ts contacts) for the ships of world `me` (bodies in world units; its world aside):
 * a graze knocks and hurts a ship (a pebble breaks to dust), a wreck loses it (dropLost bursts it) and scars the body.
 * Its world's surface (`slam`): a landing from SLAM[0] R/s grazes, from SLAM[1] wrecks. Near misses spark and hurt ships
 * smoulder where `seen`; `crack(volume, pitch)` sounds a graze or a wreck. `you`: the player's world (no scar heat).
 */
export function crashes(ships: readonly Ship[], me: Body, nav: Nav, dt: number, fx: Fx, kill: (b: Body) => void, tally: Tally, tint: number, you: Body, seen: (x: number, y: number) => boolean, crack: (v: number, pitch: number) => void) {
  if (!ships.length || !me.m) return;
  const pm = me.motion, R = me.r, sr = nav.sr, list = homeBodies(ships, me, nav);
  for (const s of ships) {
    if (s.lost) continue;
    const { grade, hit, hard, a } = homeContact(s, pm, list, sr, R, dt, (b) => b === me);
    if (grade === 2) {
      [s.lost, tally.wreck] = [true, tally.wreck + 1];
      if (hard) scar(fx, hard.b, hard.x, hard.y, sr, you);
      crack(0.2, 1.4);
      continue;
    }
    if (grade === 1) {
      tally.graze++;
      const x = hard?.x ?? a.x, y = hard?.y ?? a.y;
      fx.burst(x, y, 6, sr * 0.3, sr * 4, 0xffd9a8);
      if (hard && pebble(hard.b, sr)) [kill(hard.b), fx.burst(hard.b.motion.x, hard.b.motion.y, 8, hard.b.r * 0.6, sr * 3, hard.b.tint)];
      crack(0.08, 2);
    } else if (sparks(fx, a, hit, dt, sr * 0.35, tint, seen)) tally.miss++;
    s.spark = a.spark;
    smolder(fx, a, dt, sr * 0.35, tint, seen);
  }
}

/** A gun of world `me` flies through it and its moons. */
const ownOf = (me: Body) => (b: Disc) => b === me || !!(b as Body).moon;

/**
 * Moves the ships and lets them act on threats. `stops(share, v)`: does the shield hold it (v in stick speeds)? `kill`: breaks a body up.
 * `frag` (yours): no body is a threat by itself; `prio` is your priority target (a body: idle fighters and, with `probes`, probes fly at it; an enemy ship or rocket: every idle home fighter takes it first). A hit that breaks hands it to `at` (stage.ts cut, at most the
 * class's FLEET.pieces). `shots`: the pool their rounds fly in. `siege`: your fleet engaged (Siege).
 */
export function defend(ships: Ship[], me: Body, near: Body[], dt: number, stops: (share: number, v: number) => boolean, fx: Fx, kill: (b: Body) => void, foes: Foe[], shots: Shots, nav: Nav, frag?: { at: (b: Body, cap: number) => void; prio?: Body | Foe; probes?: boolean }, siege?: Siege) {
  if (!ships.length || !me.m) return;
  const R = me.r, pm = me.motion, fighters = ships.filter((s) => s.kind === 'fighter');
  // The siege wing: the last Siege.wing fighters, paired among themselves; joining or leaving it they start a new route.
  const wing = new Set(siege ? fighters.slice(fighters.length - siege.wing) : []);
  for (const s of ships) if (!!s.ring !== wing.has(s)) [s.ring, s.wx, s.wy, s.lead, s.target] = [wing.has(s), 0, 0, undefined, s.mode === 'run' ? s.target : undefined];
  pairUp(wing.size ? ships.filter((s) => !s.ring) : ships);
  if (wing.size) pairUp([...wing]);
  const idle = (s: Ship) => s.mode === 'patrol' && s.cool <= 0;
  // Threats (rival patrols only; yours act by priority), soonest first: what would hurt and get past the shield.
  const threats: { b: Body; t: number }[] = [];
  if (!frag) for (const b of near) {
    if (b === me || !b.m || b.moon) continue;
    const tc = closing(me, b, LOOK_S);
    if (tc === undefined) continue;
    const { share, kelvin, v, vs } = strike(me, b, 0);
    if ((kelvin >= HIT_MIN || share >= 0.5) && !stops(share, v / vs)) threats.push({ b, t: tc });
  }
  threats.sort((a, c) => a.t - c.t);
  const taken = new Set(ships.map((s) => s.target).filter(Boolean));
  for (const th of threats) {
    if (taken.has(th.b)) continue;
    const free = ships.filter((s) => idle(s) && !s.ring), x = th.b.motion.x - pm.x, y = th.b.motion.y - pm.y; // the siege wing stays on its ring
    const best = nearest(free, x, y, Infinity);
    if (!best) break;
    [best.mode, best.target, best.foe] = ['run', th.b, undefined];
    taken.add(th.b);
  }
  // Your priority body: every idle ship outside the siege wing flies at it (probes only while `probes`).
  const ord = frag?.prio && 'motion' in frag.prio ? frag.prio : undefined;
  if (ord?.m) for (const s of ships) if (idle(s) && !s.ring && (s.kind === 'fighter' || frag!.probes)) [s.mode, s.target, s.foe] = ['run', ord, undefined];
  // Enemy ships: each idle ship takes a free one within reach, rockets first, then frigates (pick): home ships round
  // your world, the siege wing round theirs. A free ring leader takes the strafing turn first when it is due (`target`
  // set while still on patrol: it swings SIEGE.out further out, then makes its run in). Your priority ship: every idle
  // home fighter takes it first, however many already hunt it.
  const fo = frag?.prio && !ord && foes.includes(frag.prio as Foe) ? (frag.prio as Foe) : undefined;
  const hunted = new Set(ships.map((s) => s.foe).filter(Boolean)), w = siege?.world.motion;
  if (siege) siege.pass -= dt;
  for (const s of ships) {
    if (!idle(s) || s.target) continue;
    if (s.ring && !s.lead && siege!.pass <= 0) {
      [s.target, siege!.pass] = [siege!.world, SIEGE.pass];
      continue;
    }
    const best = pick(foes.filter((f) => !hunted.has(f)), s.ring ? w!.x : pm.x, s.ring ? w!.y : pm.y, (s.ring ? SIEGE.foe : FOE_REACH) * R, s.kind === 'fighter' && !s.ring ? fo : undefined);
    if (best) [s.mode, s.foe, s.target] = ['run', best, undefined];
    if (best) hunted.add(best);
  }
  const leaders = ships.filter((s) => s.ring && !s.lead), spin = siege ? (siege.t * PATROL_V * R) / siege.ring : 0; // ring slots, spread evenly, turning at its pace

  // A hit on the body a round was aimed at: a small one breaks; a big one gets 1 / BURST of the kick that makes it miss
  // (rules.ts deflect, capped by its mass; a probe's light laser: PROBE.kick of it).
  const gunOf = (kind: Ship['kind']): Gun => ({
    team: frag ? 'you' : 'rival', u: SHOT_V * R, life: SHOT_S, arc: GUN_ARC, spread: SPREAD, tint: frag ? (kind === 'probe' ? 0x9fd8ff : YOU) : VIOLET, look: kind === 'probe' ? 'probe' : undefined,
    own: ownOf(me),
    onBody(b: Body, x: number, y: number) {
      if (b === siege?.world) return siege.hit('round', kind === 'probe' ? ARMS.probe.k : ARMS.round.k, x, y);
      const bx = b.motion.x, by = b.motion.y;
      if (frag ? b.m <= FLEET[kind].breaks * me.m && breakable(b) : b.m <= BREAK * me.m) {
        fx.flash(bx, by, b.r * 2.5, 8, b.r * 3);
        fx.burst(bx, by, 12, b.r * 0.4, b.r * 2.5, b.tint);
        return frag ? frag.at(b, FLEET[kind].pieces) : kill(b);
      }
      const k = deflect(bx - pm.x, by - pm.y, b.motion.vx - pm.vx, b.motion.vy - pm.vy, R + b.r), need = Math.hypot(k.x, k.y);
      if (!need) return;
      const dv = (Math.min(need, PUSH * 2 * R * Math.min(1, (PUSH_SHARE * me.m) / b.m)) / BURST) * (kind === 'probe' ? PROBE.kick : 1);
      b.motion.vx += (k.x / need) * dv;
      b.motion.vy += (k.y / need) * dv;
    },
  });
  const guns = { probe: gunOf('probe'), fighter: gunOf('fighter') };
  /** Where a ship's target is this sub-step (relative to the world), or undefined once it is gone (yours: no longer your priority). */
  const aimAt = (s: Ship, k: number, h: number) => {
    const f = s.foe, t = s.target;
    if (f ? !foes.includes(f) : !t || !t.m || (frag && t !== siege?.world && t !== frag.prio)) return undefined;
    const vx = (f ? f.vx ?? pm.vx : t!.motion.vx) - pm.vx, vy = (f ? f.vy ?? pm.vy : t!.motion.vy) - pm.vy;
    return { x: (f ? f.x : t!.motion.x) - pm.x + vx * k * h, y: (f ? f.y : t!.motion.y) - pm.y + vy * k * h, vx, vy, r: f ? 0 : t!.r, body: t };
  };
  /** A round from `s` at `a` while the trigger lets one go (`held`: its gun bears). Yours: FLEET bursts of rounds, then it cools. */
  const shoot = (s: Ship, a: { x: number; y: number; vx: number; vy: number; body?: Body }, held: boolean, h: number) => {
    const arms = frag ? FLEET[s.kind] : undefined;
    if (arms && s.cool > 0) return;
    const p = pull(s.g, h, held, arms ? arms.rounds : BURST, arms?.rate ?? RATE, GAP);
    if (p && shots.fire(guns[s.kind], s.g, p === 1, pm.x + s.x, pm.y + s.y, pm.vx + s.vx, pm.vy + s.vy, s.heading, pm.x + a.x, pm.y + a.y, pm.vx + a.vx, pm.vy + a.vy, a.body) && arms && (s.shot = (s.shot ?? 0) + 1) >= arms.rounds * arms.bursts) [s.shot, s.cool] = [0, arms.cool];
  };

  const dtc = Math.min(dt, MAX_DT), n = steps(dtc), h = dtc / n, list = homeBodies(ships, me, nav), o: Home = { x: pm.x, y: pm.y, vx: pm.vx, vy: pm.vy, t: 0 };
  for (const s of ships) {
    s.cool = Math.max(0, s.cool - dt);
    const pace = s.kind === 'probe' ? PROBE.slow : 1;
    scanRel(s, pm, list, (b) => b === me || b === s.target, nav.sr, ATTACK_V * R * pace, TURN * pace);
    for (let k = 0; k < n; k++) {
      o.t = k * h;
      if (s.mode === 'run') {
        // At a threat or an enemy ship: the run; bursts while the gun bears; it breaks off before it gets close (or once
        // the target is gone: someone else got it, it left, or a round broke it).
        const a = aimAt(s, k, h), r = a ? runStep(s, a.x, a.y, a.vx, a.vy, a.r, R, h, o) : 'break';
        if (a) shoot(s, a, r === 'fire', h);
        if (r === 'break' || s.cool > 0) { // yours also once the run's rounds are spent
          breakOff(s, a ? a.x : s.x + s.vx, a ? a.y : s.y + s.vy);
          [s.target, s.foe, s.cool, s.shot] = [undefined, undefined, frag ? FLEET[s.kind].cool : COOL_S, 0];
        }
      } else if (s.mode === 'break') breakStep(s, R, h, o);
      else if (siege && s.ring && !s.lead) {
        const e = siege.world.motion, ex = e.x - pm.x + (e.vx - pm.vx) * k * h, ey = e.y - pm.y + (e.vy - pm.vy) * k * h, out = s.target === siege.world;
        ringStep(s, ex, ey, e.vx - pm.vx, e.vy - pm.vy, siege.ring + (out ? SIEGE.out * R : 0), spin + (2 * Math.PI * leaders.indexOf(s)) / leaders.length, PATROL_V, R, h, o);
        if (out && Math.hypot(s.x - ex, s.y - ey) > siege.ring + (SIEGE.out - 0.5) * R) s.mode = 'run'; // far enough out: its run in
        else if (!out) s.target = undefined;
      } else {
        guard(s, R, h, ACC * R * pace, TURN * pace, PATROL_V * pace, o);
        // A wingman on its leader's run fires at the leader's target too.
        const a = s.lead?.mode === 'run' ? aimAt(s.lead, k, h) : undefined;
        if (a) shoot(s, a, Math.hypot(a.x - s.x, a.y - s.y) - a.r < GUN * R && inArc(s, a.x, a.y, a.vx, a.vy, SHOT_V * R, GUN_ARC), h);
      }
    }
  }
}

/**
 * The frigate: a slow patrol ship whose heavy laser (ARMS.lance) recharges; `aim`: the body it lines up on, for `aimT` s;
 * `salvo`: bolts out of this salvo; `glow`: s its nose has charged toward a salvo on a world; `side`: rad its standoff
 * point is shifted along its arc for a clear line.
 */
export type Frigate = Ship & { load: number; aim?: Body; aimT: number; salvo: number; glow: number; side: number };
export const newFrigate = (R: number, a: number): Frigate => ({ ...newShip(R, a), load: 0, aimT: 0, salvo: 0, hull: ARMS.lance.hull, glow: 0, side: 0 });
const AIM_S = 4; // s the frigate tries to line up before it gives up on a target
const HOLD = 5; // your radii from your centre: the frigate's hold at its last hull point, on the far side from the world it lances
const SHIFT = 0.5; // rad/s it moves along its arc while a body blocks the line

/** Seconds until `b` passes closest to `me`, if it comes on course to hit (miss ≤ 1.2 × contact) within `look` s. */
export function closing(me: Body, b: Body, look: number) {
  const pm = me.motion, px = b.motion.x - pm.x, py = b.motion.y - pm.y, wx = b.motion.vx - pm.vx, wy = b.motion.vy - pm.vy;
  const pw = px * wx + py * wy, ww = wx * wx + wy * wy;
  if (pw >= 0 || !ww) return undefined;
  const tc = -pw / ww;
  return tc <= look && Math.hypot(px + wx * tc, py + wy * tc) <= 1.2 * (me.r + b.r) ? tc : undefined;
}

/** How body `b` would hit world `me`: its share, arrival speed `v` (your diameters/s, your pull added), stick speed `vs`, and the kelvin it delivers after air `sb` burns what it can (rules.ts strikeK). */
export function strike(me: Body, b: Body, sb: number) {
  const pm = me.motion, R = me.r, mu = G_WORLD * youPull(me.m, R), wx = b.motion.vx - pm.vx, wy = b.motion.vy - pm.vy, d = Math.hypot(b.motion.x - pm.x, b.motion.y - pm.y);
  const v = Math.sqrt(wx * wx + wy * wy + 2 * mu * Math.max(0, 1 / (R + b.r) - 1 / d)) / (2 * R), vs = stickSpeed(phys(me), phys(b)), share = b.m / me.m;
  return { share, v, vs, kelvin: strikeK(share, v, vs, R, sb, me.m >= AGE_GOAL, b.heat) };
}
/** Your guns break rocks, never a world (held: a rival's) or a rival body: those are only pushed. */
const breakable = (b: Body) => !b.held && !b.rival;

/**
 * The frigate flies its own slow circuit; every ARMS.lance.reload s (× `rate`: the energy fed) it takes your `order` (the priority rock:
 * stage.ts passes it only while orders.ts says the frigate takes it; it never picks rocks by itself), turns its nose onto the lead point and fires a salvo of ARMS.lance heavy laser bolts. The first that meets its target hands it to `hit` (stage.ts cut).
 * No priority to break and `siege`: it flies to its post on the siege ring (nav.ts siegePost: on the bearing from the world to
 * you, `spread` rad round, two frigates ±0.5), charges its nose ARMS.lance.glow s while the line is clear (else it shifts
 * round the ring) and lances it (Siege.hit). At its last hull point it holds HOLD off you on the far side instead.
 */
export function frigateStep(f: Frigate, me: Body, order: Body | undefined, dt: number, rate: number, hit: (b: Body) => void, shots: Shots, nav: Nav, siege?: Siege, spread = 0) {
  const L = ARMS.lance, R = me.r, pm = me.motion, dtc = Math.min(dt, MAX_DT), n = steps(dtc), h = dtc / n, u = L.u * R, o: Home = { x: pm.x, y: pm.y, vx: pm.vx, vy: pm.vy, t: 0 };
  const gun: Gun = { team: 'you', u, life: L.life, arc: L.arc, spread: L.spread, tint: YOU, look: 'lance', own: ownOf(me), onBody: (b: Body, x: number, y: number) => (b === siege?.world ? siege.hit('lance', L.k, x, y) : hit(b)) };
  f.load += dt * rate;
  const world = siege?.world;
  if (f.aim && (!f.aim.m || (f.aim !== world && (f.aim !== order || (f.aimT += dt) > AIM_S)))) [f.aim, f.salvo, f.g, f.glow] = [undefined, 0, trigger(), 0];
  if ((!f.aim || f.aim === world) && f.load >= L.reload) { // your priority rock comes before the world
    if (order?.m) [f.aim, f.aimT] = [order, 0];
    else if (!f.aim && world) [f.aim, f.aimT] = [world, 0];
    if (f.aim !== world) f.glow = 0;
  }
  scanRel(f, pm, homeBodies([f], me, nav), (b) => b === me || b === f.aim, nav.sr, F_PATROL_V * R, F_TURN);
  const clear = f.aim === world && !!world && lineClear(pm.x + f.x, pm.y + f.y, world.motion.x, world.motion.y, world.r, nav.bodies, (b) => b === me || b === world || !!(b as Body).moon, nav.sr);
  if (f.aim === world && !clear) f.side = ((f.side + SHIFT * dt + 1.2) % 2.4) - 1.2; // round its arc, ±1.2 rad off the bearing
  for (let k = 0; k < n; k++) {
    const b = f.aim;
    o.t = k * h;
    if (!b) {
      guard(f, R, h, F_ACC * R, F_TURN, F_PATROL_V, o);
      continue;
    }
    const bm = b.motion, tx = bm.x - pm.x + (bm.vx - pm.vx) * k * h, ty = bm.y - pm.y + (bm.vy - pm.vy) * k * h, tvx = bm.vx - pm.vx, tvy = bm.vy - pm.vy;
    if (b === world) {
      // A world: out to its post first (at its last hull point the far side of you), nose charging only while it is there.
      const last = (f.hull ?? 2) <= 1, a0 = Math.atan2(ty, tx) + f.side + Math.PI, p = last ? { x: Math.cos(a0) * HOLD * R, y: Math.sin(a0) * HOLD * R } : siegePost(tx, ty, siege!.ring, f.side + spread);
      const hx = p.x - f.x, hy = p.y - f.y;
      if (Math.hypot(hx, hy) > R) {
        f.glow = 0;
        arrive(hx, hy, 0, 0, F_PATROL_V * R, BRAKE * F_ACC * R);
        homeStep(f, R, 2 * R, F_ACC * R, F_TURN, h, o);
        continue;
      }
    }
    // Lining up: the nose onto where a bolt meets the body; the salvo goes while it stays in the arc (a world: once charged).
    const a = leadAt(f, tx, ty, tvx, tvy, u), bears = inArc(f, tx, ty, tvx, tvy, u, L.arc);
    [want.x, want.y] = [Math.cos(a) * F_PATROL_V * R * (b === world ? 0.2 : 1), Math.sin(a) * F_PATROL_V * R * (b === world ? 0.2 : 1)];
    homeStep(f, R, 2 * R, F_ACC * R, F_TURN, h, o);
    if (b === world) f.glow = bears && clear ? f.glow + h : Math.max(0, f.glow - h);
    const p = pull(f.g, h, bears && (b !== world || f.glow >= L.glow), L.salvo, 1 / L.gap, Infinity);
    if (p && shots.fire(gun, f.g, p === 1, pm.x + f.x, pm.y + f.y, pm.vx + f.vx, pm.vy + f.vy, f.heading, pm.x + tx, pm.y + ty, bm.vx, bm.vy, b) && ++f.salvo >= L.salvo) {
      [f.aim, f.salvo, f.load, f.g, f.wx, f.wy, f.glow] = [undefined, 0, 0, trigger(), 0, 0, 0]; // back on its circuit, recharging
    }
    if (p && f.g.n === 0 && f.aim === b) f.g = trigger(); // the burst ended with a bolt refused: the salvo goes on
  }
}

/**
 * A rocket on a body it cannot break (over ROCKET.share of your mass `M`, or not free): ROCKET.chip.bite of `M` (at most half
 * of it) comes off where it struck at (x, y), CHUNK of it each as two chunks thrown out sideways (the rest dust), and it warms
 * ROCKET.chip.k K (less on a body past ROCKET.share).
 */
export function chip(b: Body, M: number, x: number, y: number, ev: Events | undefined, fx: Fx) {
  const bite = Math.min(ROCKET.chip.bite * M, 0.5 * b.m), bm = b.motion, a0 = Math.atan2(y - bm.y, x - bm.x), v = Math.sqrt((2 * G_WORLD * b.m) / (1.6 * b.r));
  for (let i = 0; i < 2 && ev; i++) {
    const a = a0 + (i ? -1 : 1) * (0.9 + 0.3 * Math.random()), s = v * (1.2 + 0.4 * Math.random());
    ev.debris(bm.x + Math.cos(a) * b.r * 1.6, bm.y + Math.sin(a) * b.r * 1.6, bm.vx + Math.cos(a) * s, bm.vy + Math.sin(a) * s, CHUNK * bite, b.comp, b);
  }
  fx.burst(x, y, 12, b.r * 0.04, b.r * 0.5, b.tint);
  shed(b, bite);
  b.heat += (ROCKET.chip.k / K_PER_HEAT) * Math.min(1, (ROCKET.share * M) / b.m);
}
const CHUNK = 0.45; // of a chip, each of its two chunks (with ROCKET.chip.bite 0.25%: just over the field's SPECK, so they show)
