import { Sprite, type Texture } from 'pixi.js';
import type { Vec } from '../../core/entity';
import { between, clamp } from '../../core/rng';
import type { Body } from './body';
import { DRAG, thrustOf } from './player';
import { AGE_GOAL, G_WORLD, need, V_STICK } from './rules';
import { wrap } from '../../core/orbits';
import { want, type Entry } from '../rivals/ledger';

// Rival cores: asteroids that steer like you and play by your rules. They hunt rocks they can safely swallow, run from
// anything heavier, and hunt you once they outweigh you. Not missiles: they look around only every second or so and head
// for a rough guess of where prey will be (a sidestep makes them overshoot), they are weaker than you, and after a few
// seconds of chasing they tire and drift. A violet halo tells them apart from rocks.

const THINK = [0.6, 1.1]; // s between looks around; between looks they keep their plan
const SENSE = 30; // own radii they see (about half a screen at the start size)
const MEAL = 0.8; // they go for bodies up to this share of their mass
const CRUMBS = 0.02; // and ignore anything below this share
const HUNT_YOU = 3; // how much more they want you than a rock of your mass
const LEAD = [0, 0.6]; // s of the prey's motion they guess ahead (a rough guess, different each look)
const CHASE = 7; // own diameters/s when the prey is far
const CLOSE = 0.5 * V_STICK; // own diameters/s left when they arrive: slow enough to stick
const BRAKE = 1.5; // 1/s: how early they slow down (desired speed drops with the gap)
const CRUISE = 2.5; // own diameters/s wandering, or resting after a chase
const RUN = 10; // own diameters/s running away
const POWER = 0.55; // share of your thrust: easy to outrun if you see them coming
const EASE = 0.6; // share of their thrust at which a speed mismatch gets full thrust: lazier corrections
const STAMINA = [4, 7]; // s of chasing before they tire
const REST = [2, 3.5]; // s of drifting after that
const HALO = 0xb48cff; // rivals violet (render/tech.ts VIOLET)
// No fast hits: anything on course within DODGE_S s that would arrive faster than the stick speed is dodged sideways.
const DODGE_S = 2;
// A named rival past AGE_GOAL forges a world (rivals/ledger.ts): it never hunts you, makes slow feeding trips for what its
// weakest condition needs (rocks rich in that element count up to ×3), and eats nothing while it is too hot.
const TRIP = 1.5; // own diameters/s at most on a feeding trip
const WORLD_CRUISE = 1; // own diameters/s drifting
const WORLD_RUN = 3; // own diameters/s backing away from a threat (a world never races)
const WANT_EL = { water: 'ice', air: 'gas', field: 'metal', rock: 'rock' } as const;

export type Rival = {
  think: number; prey?: Body; aim: Vec; flee: Vec; steer: Vec; heading: number;
  tire: number; stamina: number; rest: number;
  chase: number; // own diameters/s at full chase (CHASE; slower for big ones that hunt you)
  entry?: Entry; // a named roster rival (rivals/ledger.ts); wild cores have none
  moon?: Body; moonA: number; moonD: number; // a living world's guard moon (tendMoon): the body, its angle and distance
};

/** The halo (the view's first child) at 3.2× the pile's radius: it grows as the rival eats. */
function sizeHalo(b: Body) {
  const halo = b.view.children[0] as Sprite;
  halo.scale.set(((b.r / b.k) * 3.2) / halo.texture.width);
}

/** Makes `b` a rival heading off at angle `heading`: its own steering and a violet halo behind its parts. */
export function makeRival(b: Body, glow: Texture, heading: number, chase = CHASE) {
  const rival: Rival = {
    think: 0, aim: { x: 0, y: 0 }, flee: { x: 0, y: 0 }, steer: { x: 0, y: 0 }, heading,
    tire: 0, stamina: between(STAMINA), rest: 0, chase, moonA: 0, moonD: 0,
  };
  b.rival = rival;
  b.control = () => rival.steer;
  b.motion.drag = DRAG;
  // Not a part: it leaves with the view when the rival is eaten.
  b.view.addChildAt(new Sprite({ texture: glow, anchor: 0.5, tint: HALO, alpha: 0.3, blendMode: 'add' }), 0);
  sizeHalo(b);
  return b;
}

// Guard moon (docs/aliencivilizations.md): once life starts, a named rival world catches one small body near it and keeps it on
// a circle; the moon swings round to stand between its world and anything coming in fast (your moons.ts Guard, simpler).
// Held, it is not yours to catch (moons.ts catchable); you can break it.
const MOON_SHARE = [0.005, 0.05]; // × the world's mass
const CATCH = 10; // world radii: how far it reaches for a moon
const MOON_D = 3; // world radii: the moon's circle
const GUARD_TURN = 2.5; // rad/s at most while swinging to meet a threat
const GUARD_LOOK = 3; // s ahead it watches for bodies on course

/** Keeps a living rival world's guard moon: catch, circle, swing to meet what comes in fast; let go when stolen or gone. */
export function tendMoon(b: Body, around: Body[], dt: number) {
  const R = b.rival!, e = R.entry, bm = b.motion;
  let mo = R.moon;
  if (mo && (!mo.m || mo.moon || !b.m || !e || e.life.progress <= 0)) [mo.held, mo, R.moon] = [false, undefined, undefined]; // stolen (now your moon), broken, or no life to guard
  if (!e || !b.m || e.life.progress <= 0) return;
  if (!mo) {
    let best = CATCH * b.r;
    for (const o of around) {
      if (o === b || !o.m || o.rival || o.moon || o.held || o.meteor || o.m < MOON_SHARE[0] * b.m || o.m > MOON_SHARE[1] * b.m) continue;
      const d = Math.hypot(o.motion.x - bm.x, o.motion.y - bm.y);
      if (d < best) [best, mo] = [d, o];
    }
    if (!mo) return;
    [R.moon, mo.held, R.moonA, R.moonD] = [mo, true, Math.atan2(mo.motion.y - bm.y, mo.motion.x - bm.x), best];
  }
  // The most urgent body on course to the world (closing faster than the stick speed, ≤ 2× the moon: a guard's limit).
  let goal: number | undefined, soon = GUARD_LOOK;
  for (const o of around) {
    if (o === b || o === mo || !o.m || o.moon || o.m > 2 * mo.m) continue;
    const dx = o.motion.x - bm.x, dy = o.motion.y - bm.y, vx = o.motion.vx - bm.vx, vy = o.motion.vy - bm.vy, v2 = vx * vx + vy * vy, along = -(dx * vx + dy * vy);
    if (along <= 0 || v2 < (V_STICK * 2 * b.r) ** 2) continue;
    const t = along / v2;
    if (t < soon && Math.hypot(dx + vx * t, dy + vy * t) < 1.3 * (b.r + o.r)) [soon, goal] = [t, Math.atan2(dy, dx)];
  }
  R.moonD += (MOON_D * b.r - R.moonD) * (1 - Math.exp(-dt / 2)); // eases out (or in) to its circle
  const w = Math.sqrt((G_WORLD * b.m) / R.moonD ** 3); // circular rate
  const turn = goal === undefined ? w : clamp(wrap(goal - R.moonA) / Math.max(dt, 0.05), -GUARD_TURN, GUARD_TURN);
  R.moonA = wrap(R.moonA + turn * dt);
  const c = Math.cos(R.moonA), s = Math.sin(R.moonA), mm = mo.motion;
  [mm.x, mm.y, mm.vx, mm.vy] = [bm.x + c * R.moonD, bm.y + s * R.moonD, bm.vx - s * R.moonD * turn, bm.vy + c * R.moonD * turn];
}

/** Chooses prey and threats among `around` (`you` included), then steers toward one and away from the other. */
export function steerRival(b: Body, around: Body[], you: Body, dt: number) {
  const R = b.rival!, m = b.motion, D = 2 * b.r;
  m.accel = POWER * thrustOf(b);
  sizeHalo(b);

  const world = !!R.entry && b.m >= AGE_GOAL, plan = world ? want(R.entry!) : 'rock';
  if ((R.think -= dt) <= 0) {
    R.think = between(THINK);
    R.prey = undefined;
    R.flee = { x: 0, y: 0 };
    let best = 0;
    const range = SENSE * b.r;
    for (const o of around) {
      if (o === b || o === R.moon || !o.m) continue; // never its own guard moon
      const dx = o.motion.x - m.x, dy = o.motion.y - m.y, d = Math.hypot(dx, dy) || 1, gap = d - b.r - o.r;
      if (gap > range) continue;
      // On course and too fast to touch safely (closing above the stick speed in their diameters): step aside.
      const vx = o.motion.vx - m.vx, vy = o.motion.vy - m.vy, v2 = vx * vx + vy * vy, along = -(dx * vx + dy * vy);
      if (o !== R.prey && along > 0 && v2 > (V_STICK * D) ** 2) {
        const t = along / v2, mx = dx + vx * t, my = dy + vy * t, miss = Math.hypot(mx, my); // its offset at closest approach
        if (t < DODGE_S && miss < 1.3 * (b.r + o.r)) {
          const w = 1.5 * (1 - t / DODGE_S), s = miss || 1, side = miss ? 1 : 0;
          R.flee.x += side ? (-mx / s) * w : (-vy / Math.sqrt(v2)) * w; // away from where it passes (head-on: sideways)
          R.flee.y += side ? (-my / s) * w : (vx / Math.sqrt(v2)) * w;
        }
      }
      if (o.m > b.m) {
        const w = Math.max(0, 1 - gap / (0.5 * range)); // only close threats count
        R.flee.x -= (dx / d) * w;
        R.flee.y -= (dy / d) * w;
      } else if (o.m <= MEAL * b.m && o.m >= CRUMBS * b.m && !(world && (o === you || plan === 'none'))) {
        const k = world ? 1 + 2 * (o.comp[WANT_EL[plan as keyof typeof WANT_EL]] ?? 0) : o === you ? HUNT_YOU : need(b.comp, o.comp);
        const score: number = (o.m * k) / (Math.max(0, gap) + b.r);
        if (score > best) [best, R.prey] = [score, o];
      }
    }
    if (R.prey) {
      const lead = between(LEAD); // where they think it will be; kept until the next look
      R.aim = { x: R.prey.motion.x + R.prey.motion.vx * lead, y: R.prey.motion.y + R.prey.motion.vy * lead };
    }
  }

  // Desired velocity: running wins over hunting as the threat gets closer.
  const fear = Math.min(1, Math.hypot(R.flee.x, R.flee.y));
  let wx = 0, wy = 0;
  const p = R.prey;
  if (R.rest > 0) R.rest -= dt;
  else if (p?.m) {
    if ((R.tire += dt) > R.stamina) [R.rest, R.tire, R.stamina] = [between(REST), 0, between(STAMINA)];
    const dx = R.aim.x - m.x, dy = R.aim.y - m.y, d = Math.hypot(dx, dy) || 1;
    const speed = Math.min((world ? Math.min(R.chase, TRIP) : R.chase) * D, CLOSE * D + BRAKE * Math.max(0, d - b.r - p.r));
    wx = (dx / d) * speed;
    wy = (dy / d) * speed;
  } else R.tire = Math.max(0, R.tire - dt);
  if (R.rest > 0 || !p?.m) {
    R.heading += (Math.random() - 0.5) * 3 * dt; // nothing to hunt, or tired: drift and look around
    wx = Math.cos(R.heading) * (world ? WORLD_CRUISE : CRUISE) * D;
    wy = Math.sin(R.heading) * (world ? WORLD_CRUISE : CRUISE) * D;
  }
  if (fear > 0) {
    const f = Math.hypot(R.flee.x, R.flee.y);
    wx = wx * (1 - fear) + (R.flee.x / f) * (world ? WORLD_RUN : RUN) * D * fear;
    wy = wy * (1 - fear) + (R.flee.y / f) * (world ? WORLD_RUN : RUN) * D * fear;
  }
  // Thrust toward the desired velocity, full only for a big mismatch, so they drift and overshoot.
  const ex = wx - m.vx, ey = wy - m.vy, e = Math.hypot(ex, ey), full = EASE * m.accel;
  const k = e > full ? 1 / e : 1 / full;
  R.steer.x = ex * k;
  R.steer.y = ey * k;
}
