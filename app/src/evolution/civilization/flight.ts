import { wrap } from '../../core/orbits.ts';
import { clamp } from '../../core/rng.ts';
import { ARMS, CHASE_S, CHASE_V, intercept, LEASH_S } from './rules.ts';
import type { Near } from './nav.ts';

// Ship flight for every faction (pure numbers: test/civilization runs it in Node). Nose first, one main engine: steering
// writes the velocity it wants (`want`); `thrust` eases the nose toward it (≤ `turn` rad/s), burns along it, brakes with a
// weak retro, never backwards; slip bleeds off over GRIP s; pirates and rival ships away have a top speed in space and a
// thrust limit (`top`). Frames are cut into sub-steps ≤ STEP s (same paths at any fps).
// Steering round bodies and the home steppers: nav.ts; collisions: crash.ts; rounds and missiles: guns.ts.

/**
 * `near`: its scan this frame (home ships, colony ships); `hurt`: s left at HURT_ACC thrust after a graze; `bank`: −1…1,
 * its turn rate over its cap (drawn); `hull`: hits left (frigates); `slam`: the inward speed its world's surface took off it
 * this frame; `spark`: s until it may spark a near miss again.
 */
export type Craft = { x: number; y: number; vx: number; vy: number; heading: number; burn: number; near?: Near[]; hurt?: number; bank?: number; hull?: number; slam?: number; spark?: number };
/** A craft on a circuit: its waypoint (wx, wy) from the centre (0, 0: none yet), a pick counter, its sense round the centre (±1; 0 not set). */
export type Circler = Craft & { wx: number; wy: number; k: number; sense: number };
/** A home-patrol fighter: on its circuit or its leader's wing, on an attack run, or breaking off (`t` s left, heading `bh`). */
export type Fighter = Circler & { lead?: Fighter; mode: 'patrol' | 'run' | 'break'; t: number; bh: number };
/** A craft on strafing runs: `out` while it flies out after a pass. */
export type Strafer = Craft & { out: boolean };

const GRIP = 0.08; // s: sideways slip bleeds off over this long
const EASE = 4; // 1/s: the nose turns this share of its error a second (at most `turn`)
const TAUV = 0.25; // s: a speed error is thrust away over this long
const RETRO = 0.4; // share of the main thrust the retro has
export const BRAKE = 0.75 * RETRO; // share of the main thrust `arrive` plans its braking with
const STEP = 1 / 60; // s: longest sub-step
export const MAX_DT = 0.1; // s: longest frame flown
export const CLIMB = 3; // 1/s: outward speed per unit of depth inside a keep-out circle
export const SPECK = 0.25; // × a ship's radius: smaller crumbs neither hurt ships nor get steered round

// Fighters (yours and rivals' home patrols), in radii of their world.
export const ACC = 12; // R/s² main thrust
export const TURN = 3; // rad/s (colony fleets share it)
export const PATROL_V = 3; // R/s
export const RETURN_V = 6; // R/s flying home from far out (and a wingman catching up)
export const ATTACK_V = 5.5; // R/s on an attack run
export const INNER = [2, 2.6]; // R: circuit waypoints alternate between these bands
export const OUTER = [3.8, 4.6];
const STRIDE = [1.3, 1.9]; // rad on round the centre per waypoint
export const CLEAR = 1.25; // R: ships plan round their own world at this radius
export const WING = [0.45, 0.35]; // R behind and beside its leader: a wingman's slot
const TRIM = 3; // 1/s: a wingman's speed change per R it lags its slot
export const GUN = 9; // R off the target's surface: a fighter's gun range
export const GUN_ARC = 0.2; // rad either side of the nose the lead point must be in
export const SHOT_V = ARMS.round.u; // R/s a round flies on top of the shooter (the lead point)
export const SHOT_S = ARMS.round.life; // s a round flies
export const BURST = 6; // rounds a burst...
export const RATE = 10; // ...at this many a second...
export const GAP = 0.6; // ...then s before the next burst
export const SPREAD = 0.04; // rad: a burst's aim error at most
// The frigate.
export const F_ACC = 8; // R/s²
export const F_TURN = 2.2; // rad/s
export const F_PATROL_V = 2.4; // R/s
// Miner shuttles (civilization/view.ts), R.
export const S_ACC = 8; // R/s²
export const S_TURN = 3; // rad/s

/** The velocity a ship wants this sub-step. */
export const want = { x: 0, y: 0 };
const HURT_ACC = 0.6; // share of its thrust a hurt ship has
const BANK_S = 0.15; // s: the bank eases toward the turn rate over this long

export { wrap };

/** Sub-steps for a frame of `dt` s; each is min(dt, MAX_DT) / steps long. */
export const steps = (dt: number) => Math.max(1, Math.ceil(Math.min(dt, MAX_DT) / STEP - 1e-6));

/**
 * Flies one sub-step toward `want`. (fvx, fvy): the frame the nose reads its motion in, when velocities are absolute.
 * `top` (ships away): its top speed in space; `want` is cut to it, a frame faster than it is not flown in (the ship
 * flies in space), and the velocity changes by at most GEE × `acc` a second (above `top` it only slows).
 */
export function thrust(c: Craft, acc: number, turn: number, h: number, fvx = 0, fvy = 0, top = Infinity) {
  if (c.hurt) [c.hurt, acc] = [Math.max(0, c.hurt - h), acc * HURT_ACC];
  const x0 = c.vx, y0 = c.vy, w0 = Math.hypot(want.x, want.y), k = w0 > top ? top / w0 : 1;
  if (fvx * fvx + fvy * fvy > top * top) fvx = fvy = 0; // a frame faster than its top is not flown (no riding your velocity)
  const wx = want.x * k - fvx, wy = want.y * k - fvy, wsp = Math.hypot(wx, wy);
  let err = 0, dh = 0;
  if (wsp > 1e-6) {
    err = wrap(Math.atan2(wy, wx) - c.heading);
    const m = turn * h, d = err * (1 - Math.exp(-EASE * h));
    c.heading += dh = clamp(d, -m, m);
  }
  const nx = Math.cos(c.heading), ny = Math.sin(c.heading), rx = c.vx - fvx, ry = c.vy - fvy;
  let f = rx * nx + ry * ny;
  const l = (ry * nx - rx * ny) * Math.exp(-h / GRIP); // slip bleeds off
  let a = (wsp * (0.5 + 0.5 * Math.max(0, Math.cos(err))) - f) / TAUV; // throttle back into a turn
  a = clamp(a, -RETRO * acc, acc);
  f = Math.max(0, f + a * h); // never backwards
  c.vx = fvx + f * nx - l * ny;
  c.vy = fvy + f * ny + l * nx;
  if (top < Infinity) {
    const v = Math.hypot(c.vx, c.vy), lim = Math.max(top, Math.hypot(x0, y0) - RETRO * acc * h);
    if (v > lim) [c.vx, c.vy] = [(c.vx * lim) / v, (c.vy * lim) / v];
    const dx = c.vx - x0, dy = c.vy - y0, dv = Math.hypot(dx, dy), am = GEE * acc * h;
    if (dv > am) [c.vx, c.vy] = [x0 + (dx * am) / dv, y0 + (dy * am) / dv];
  }
  c.x += c.vx * h;
  c.y += c.vy * h;
  const b = Math.min(1, Math.max(0, a / acc) + (f * Math.abs(dh)) / h / acc); // forward burn plus the turn's share
  c.burn += (b - c.burn) * (1 - Math.exp(-h / 0.1));
  c.bank = (c.bank ?? 0) + (dh / h / turn - (c.bank ?? 0)) * (1 - Math.exp(-h / BANK_S));
}

/**
 * Bends `want` round a circle of radius `rk` whose centre is at −(px, py) from the ship: when the wanted course crosses
 * it within `reach`, the course becomes the tangent on the nearer side; inside the circle it slides along and climbs
 * out. True when it changed the course.
 */
export function avoid(px: number, py: number, rk: number, reach = Infinity) {
  const d = Math.hypot(px, py) || 1e-9, sp = Math.hypot(want.x, want.y);
  if (sp < 1e-9) return false;
  const cx = -px / d, cy = -py / d, dot = (cx * want.x + cy * want.y) / sp, cross = (cx * want.y - cy * want.x) / sp;
  const s = cross >= 0 ? 1 : -1; // which way the course turns off the centre line
  if (d <= rk) {
    if (dot <= 0) return false; // already on its way out
    const out = Math.min(1, (CLIMB * (rk - d)) / sp), t = Math.sqrt(1 - out * out);
    want.x = (-s * cy * t - cx * out) * sp;
    want.y = (s * cx * t - cy * out) * sp;
    return true;
  }
  const sin = rk / d;
  if (dot <= 0 || Math.abs(cross) >= sin || d * dot - rk > reach) return false;
  const cos = Math.sqrt(1 - sin * sin);
  want.x = (cx * cos - s * cy * sin) * sp;
  want.y = (s * cx * sin + cy * cos) * sp;
  return true;
}

/** Seeded 0–1 noise: the same picks at any frame rate. */
const noise = (k: number) => {
  const s = Math.sin(k * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Sets `want` (relative to the centre) for one way round a centre: each waypoint STRIDE rad on in the craft's sense,
 * alternately in the `inner` and `outer` band, picked once the craft passes the last one or comes within a turn radius
 * of it. (px, py) = the craft from the centre; `sp` its speed, `turn` its turn rate.
 */
export function circuit(c: Circler, px: number, py: number, inner: readonly number[], outer: readonly number[], sp: number, turn: number) {
  c.sense ||= 1;
  const a = Math.atan2(py, px);
  if ((!c.wx && !c.wy) || wrap(a - Math.atan2(c.wy, c.wx)) * c.sense > 0 || Math.hypot(c.wx - px, c.wy - py) < sp / turn) {
    const band = ++c.k % 2 ? inner : outer, w = a + c.sense * (STRIDE[0] + noise(++c.k) * (STRIDE[1] - STRIDE[0])), r = band[0] + noise(++c.k) * (band[1] - band[0]);
    c.wx = Math.cos(w) * r;
    c.wy = Math.sin(w) * r;
  }
  const dx = c.wx - px, dy = c.wy - py, d = Math.hypot(dx, dy) || 1e-9;
  want.x = (dx / d) * sp;
  want.y = (dy / d) * sp;
}

/**
 * Sets `want` for a slot `back` behind and `side` left of the leader's nose, in a frame moving at (fvx, fvy): steer at a
 * point `ahead` past the slot at the leader's speed, faster while it lags (TRIM), at most `vmax`.
 */
export function follow(c: Craft, lead: Craft, back: number, side: number, ahead: number, vmax: number, fvx = 0, fvy = 0) {
  const nx = Math.cos(lead.heading), ny = Math.sin(lead.heading), sx = lead.x - nx * back - ny * side, sy = lead.y - ny * back + nx * side;
  const ax = sx + nx * ahead - c.x, ay = sy + ny * ahead - c.y, d = Math.hypot(ax, ay) || 1e-9;
  const lv = Math.max(0, (lead.vx - fvx) * nx + (lead.vy - fvy) * ny), lag = (sx - c.x) * nx + (sy - c.y) * ny;
  const v = clamp(lv + TRIM * lag, 0.3 * lv, vmax);
  want.x = fvx + (ax / d) * v;
  want.y = fvy + (ay / d) * v;
}

/** The leader of `i` among `n` ships in a V on ship 0 (`wings` 0) or in wings of `wings`: its index, and the follower's row and side (0: a leader). */
function slot(i: number, wings = 0) {
  const j = wings ? i % wings : i, row = Math.ceil(j / 2);
  return { lead: i - j, row, side: j % 2 ? 1 : -1 };
}

/** Pairs home fighters: a lone ship joins the first leader without a wing; a wingman whose leader is gone takes its route. Leaders' senses alternate. */
export function pairUp(all: readonly Fighter[]) {
  let last = -1;
  for (const s of all) {
    const l = s.lead;
    if (l && !all.includes(l)) [s.lead, s.wx, s.wy, s.k, s.sense] = [undefined, l.wx, l.wy, l.k, l.sense];
  }
  for (const s of all) {
    if (s.lead) continue;
    if (!all.some((o) => o.lead === s)) {
      const free = all.find((o) => o !== s && !o.lead && !all.some((p) => p.lead === o) && all.indexOf(o) < all.indexOf(s));
      if (free) {
        s.lead = free;
        continue;
      }
    }
    if (!s.sense) s.sense = -last;
    last = s.sense;
  }
}

/** The lead point's bearing (rad) for a round `u` faster than its shooter, at a target (px, py) off it moving at (wx, wy) relative to it. */
export function bearing(px: number, py: number, wx: number, wy: number, u: number) {
  const t = intercept(px, py, wx, wy, u) ?? Math.hypot(px, py) / u;
  return Math.atan2(py + wy * t, px + wx * t);
}
/** The lead point's bearing for a round `u` faster than the craft, at a target at (tx, ty) moving at (tvx, tvy). */
export const leadAt = (c: Craft, tx: number, ty: number, tvx: number, tvy: number, u: number) => bearing(tx - c.x, ty - c.y, tvx - c.vx, tvy - c.vy, u);
/** Is that lead point within ±`arc` of the craft's nose? */
export const inArc = (c: Craft, tx: number, ty: number, tvx: number, tvy: number, u: number, arc: number) => Math.abs(wrap(leadAt(c, tx, ty, tvx, tvy, u) - c.heading)) <= arc;

/** Brake onto a point at (dx, dy) from the ship that moves at (gvx, gvy): at most `vmax`, slowing at `brake`. */
export function arrive(dx: number, dy: number, gvx: number, gvy: number, vmax: number, brake: number) {
  const d = Math.hypot(dx, dy) || 1e-9, v = Math.min(vmax, 0.8 * Math.sqrt(2 * brake * d), 2 * d);
  want.x = gvx + (dx / d) * v;
  want.y = gvy + (dy / d) * v;
}

/** Never inside radius `r` of the origin: out to the surface, inward speed gone (returned, and the frame's hardest kept as `slam`). */
export function keepOut(c: Craft, r: number) {
  const d2 = c.x * c.x + c.y * c.y;
  if (d2 >= r * r) return 0;
  const d = Math.sqrt(d2) || 1e-9, nx = d2 ? c.x / d : 1, ny = d2 ? c.y / d : 0, vr = c.vx * nx + c.vy * ny;
  c.x = nx * r;
  c.y = ny * r;
  if (vr >= 0) return 0;
  c.vx -= vr * nx;
  c.vy -= vr * ny;
  c.slam = Math.max(c.slam ?? 0, -vr);
  return -vr;
}

// Pirates and rivals' ships away, scaled by their cruise speed (rules.ts PIRATE_SPEED; rivals.ts OUT_V).
export const P_TURN = 2.2; // rad/s: raiders, rivals' ships
export const H_TURN = 1.6; // rad/s: haulers
export const M_TURN = 1.2; // rad/s: a pirate marauder
export const P_TOP = 2, H_TOP = 1.3, M_TOP = 1.6; // × class speed: a pirate raider's, hauler's, marauder's top in space
export const GEE = 2; // × main thrust: the most a ship with a top changes its velocity a second (turns included)
/** A rival ship away's top in space at cruise `sp`: chasing you, P_TOP × (a probe CHASE_V ×); working a body moving at `body` (homing, massing, a battery, a miner's rock), P_TOP × on top of its speed. */
export const rivalTop = (sp: number, wave: boolean, body?: { x: number; y: number }) => (body ? Math.hypot(body.x, body.y) + P_TOP * sp : (wave ? P_TOP : CHASE_V) * sp);
export const RF_TURN = 1.8; // rad/s: a rival frigate
export const P_ACC = 4; // 1/s: main thrust = cruise × this
export const RING_IN = 2.5; // R: runs at you turn out inside this, back in past your outer filled moon slot + RING_OUT
export const RING_OUT = 3;
export const ROW = [5, 4]; // ship radii behind and beside per row of a formation
const ROW_AHEAD = 8; // ship radii: a follower steers at a point this far ahead of its slot
const JOIN = 8; // R: a follower farther than this from its leader flies the route on its own until it is near again
const FRAME_S = 1; // s: a fleet's frame velocity follows its centre's over this long
const CATCH = 1; // 1/s: a chasing centre closes this share of its gap a second

/**
 * Sets `want` (relative to the centre) for strafing runs: in at the centre, the course bent round radius `keep` of it
 * once within `r0`; within `r0` out straight on (along its velocity (vx, vy) relative to the centre; `swing` set: turning
 * away, `swing` rad off straight out from the centre on the side it flies) until past `r1`, then round and in again.
 * (px, py) = the craft from the centre.
 */
export function strafe(c: Strafer, px: number, py: number, vx: number, vy: number, r0: number, r1: number, keep: number, sp: number, swing?: number) {
  const dx = -px, dy = -py, d = Math.hypot(dx, dy) || 1e-9;
  if (c.out ? Math.hypot(px, py) > r1 : d < r0) c.out = !c.out;
  if (c.out) {
    const v = Math.hypot(vx, vy), r = Math.hypot(px, py) || 1e-9;
    if (swing !== undefined) {
      const a = Math.atan2(py, px) + (px * vy - py * vx >= 0 ? swing : -swing);
      [want.x, want.y] = [Math.cos(a) * sp, Math.sin(a) * sp];
    } else [want.x, want.y] = v > 1e-6 ? [(vx / v) * sp, (vy / v) * sp] : [(px / r) * sp, (py / r) * sp];
  } else [want.x, want.y] = [(dx / d) * sp, (dy / d) * sp];
  if (keep) avoid(px, py, keep, r0);
}

/**
 * Sets `want` for ship `i` of a formation round a centre (cx, cy) in a frame moving at `fv`: a leader (`slot`: wings of
 * `wings`, 0 a V on ship 0) flies `route` (which sets `want` relative to the centre); a follower holds its slot, ROW ship
 * radii (`sr`) a row (`spread` 0: in trail, one behind the other), at most `vmax`, clear of radius `keep` of the centre, or
 * flies `route` on its own while farther than JOIN (in `R`) from its leader.
 */
export function formation<C extends Craft>(ships: readonly C[], i: number, wings: number, cx: number, cy: number, fv: { x: number; y: number }, sr: number, R: number, vmax: number, keep: number, route: (s: C) => void, spread = 1) {
  const s = ships[i], w = slot(i, wings), l = ships[w.lead], near = Math.hypot(l.x - s.x, l.y - s.y) < JOIN * R;
  if (w.row && near) {
    follow(s, l, ROW[0] * (spread ? w.row : i - w.lead) * sr, spread * ROW[1] * w.side * sr, ROW_AHEAD * sr, vmax, fv.x, fv.y);
    want.x -= fv.x;
    want.y -= fv.y;
    if (keep) avoid(s.x - cx, s.y - cy, keep);
  } else route(s);
  want.x += fv.x;
  want.y += fv.y;
}

/** A fleet's frame velocity `fv` eased toward its centre's (vx, vy) over FRAME_S. */
export function lowPass(fv: { x: number; y: number }, vx: number, vy: number, dt: number) {
  const e = 1 - Math.exp(-dt / FRAME_S);
  fv.x += (vx - fv.x) * e;
  fv.y += (vy - fv.y) * e;
}

/** Moves a fleet centre after a target at (tx, ty) moving at (tvx, tvy), never faster than `vmax`. True while outpaced (capped). */
export function chase(c: { x: number; y: number; vx: number; vy: number }, tx: number, ty: number, tvx: number, tvy: number, vmax: number, dt: number) {
  let vx = tvx + (tx - c.x) * CATCH, vy = tvy + (ty - c.y) * CATCH;
  const v = Math.hypot(vx, vy), capped = v > vmax;
  if (capped) [vx, vy] = [(vx * vmax) / v, (vy * vmax) / v];
  [c.vx, c.vy] = [vx, vy];
  c.x += vx * dt;
  c.y += vy * dt;
  return capped;
}

/** The pursuit leash: true once the centre has been `d` > `reach` from you for LEASH_S s, or outpaced for CHASE_S s. */
export function leash(l: { far: number; slow: number }, d: number, reach: number, outpaced: boolean, dt: number) {
  l.far = d > reach ? l.far + dt : 0;
  if (outpaced) l.slow += dt;
  return l.far >= LEASH_S || l.slow >= CHASE_S;
}

// Evasion (pirates): a jink is two hard legs off the velocity, away from the threat's line first, faster than cruise.
/** A jink in progress: s left (0: none), the first leg's side (±1), the heading it started from, s of cooldown. */
export type Jink = { t: number; side: number; a: number; cool: number };
export const jink = (): Jink => ({ t: 0, side: 1, a: 0, cool: 0 });
const JINK_S = [0.6, 0.4]; // s on each leg...
const JINK_TURN = [1.2, 0.8]; // ...rad: the first turn off its heading, the second back the other way...
const JINK_V = 1.25; // ...at this × cruise...
const JINK_COOL = 1.5; // ...then s before the next
/** Starts a jink (unless one runs or it cools) away from the line of a threat at (tx, ty) moving at (lx, ly). */
export function startJink(c: Craft, j: Jink, tx: number, ty: number, lx: number, ly: number) {
  if (j.t > 0 || j.cool > 0) return false;
  const a = Math.atan2(c.vy, c.vx), on = lx * (c.y - ty) - ly * (c.x - tx) >= 0 ? 1 : -1;
  const nx = -ly * on, ny = lx * on; // off the threat's line, toward the craft's side
  [j.t, j.side, j.a] = [JINK_S[0] + JINK_S[1], Math.cos(a) * ny - Math.sin(a) * nx >= 0 ? 1 : -1, a];
  return true;
}

/** One jink sub-step at cruise `sp`: sets `want`; false once it is over. */
export function jinkStep(j: Jink, sp: number, h: number) {
  if (j.t <= 0) return false;
  const a = j.a + j.side * (j.t > JINK_S[1] ? JINK_TURN[0] : JINK_TURN[0] - JINK_TURN[1]); // 1.2 rad off, then 0.8 rad back
  want.x = Math.cos(a) * JINK_V * sp;
  want.y = Math.sin(a) * JINK_V * sp;
  if ((j.t -= h) <= 0) [j.t, j.cool] = [0, JINK_COOL];
  return true;
}

/** Brake onto a point (x, y) moving at (vx, vy), stopping `gap` short of it. */
export function approach(c: Craft, x: number, y: number, vx: number, vy: number, gap: number, vmax: number, brake: number) {
  const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy) || 1, go = Math.max(0, d - gap) / d;
  arrive(dx * go, dy * go, vx, vy, vmax, brake);
}
