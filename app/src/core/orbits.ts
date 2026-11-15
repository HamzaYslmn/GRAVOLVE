import type { Vec } from './entity';

// Kinematic circular orbits, the old game's way: a held body sits on a circle around its host, wherever the host
// goes, at any speed. True gravity is far too weak against thrust to hold a moon, so the orbit is placed, not
// integrated: the radius springs to its slot (1 − e^(−dt/SPRING_S), frame-rate independent), the angle turns at
// the slot's circular rate √(μ/a³), or is steered (rate-limited, shortest way round). Catching is a skill: matchQuality
// and matchStep fill a ring while a body moves with you (planet/rules.ts catchStep). Pure: used by moons and by your
// orbit around a star. Checked by test/core/orbits.test.ts.

export const SPRING_S = 0.25; // s: the radius closes ~63% of the way to its slot in this time
// Slot k sits at R · (SLOT_IN + SLOT_STEP · k): the first moon 1.4 R off your surface (clear of your surface),
// 1.25 R apart (two moons of the widest size, planet/rules.ts MOON_R 0.45 R, pass 0.35 R clear); 5 slots end at 7.4 R.
const SLOT_IN = 2.4;
const SLOT_STEP = 1.25;
const BREAK = Math.SQRT2; // a hit that leaves the moon faster than this × circular speed (escape) frees it

/** angle (rad), dist = current radius, target = the slot radius it springs to, dir = +1 / −1 (sense of travel). */
export type Orbit = { angle: number; dist: number; target: number; dir: number };

/** Radius of slot `k` around a host of radius `R`. */
export const slotRadius = (R: number, k: number) => R * (SLOT_IN + SLOT_STEP * k);
/** Circular speed at distance `d` from a host of gravitational parameter `mu` (= G · pull mass). */
export const circular = (mu: number, d: number) => Math.sqrt(mu / d);
/** Angular rate on the slot (rad/s): the period comes from the host's pull at the slot, not the current radius. */
export const rate = (o: Orbit, mu: number) => Math.sqrt(mu / o.target ** 3);

/** A new orbit for a body at offset (rx, ry) from its host moving at (vx, vy) relative to it: kept where it is, turning its way. */
export function capture(rx: number, ry: number, vx: number, vy: number, target: number): Orbit {
  return { angle: Math.atan2(ry, rx), dist: Math.hypot(rx, ry), target, dir: rx * vy - ry * vx >= 0 ? 1 : -1 };
}

/** Bound to a host (½v² < μ/d) at offset (rx, ry) moving at (vx, vy) relative to it. */
export const bound = (mu: number, rx: number, ry: number, vx: number, vy: number) => 0.5 * (vx * vx + vy * vy) < mu / (Math.hypot(rx, ry) || 1e-9);

/** How well a relative speed `v` matches: 1 at rest, 0.75 at half the window `vmax`, 0 at and past it. */
export const matchQuality = (v: number, vmax: number) => Math.max(0, 1 - (v / vmax) ** 2);
/** A catch ring's progress after `dt`: fills by q · dt / `hold` while q > 0, else drains by dt / `drain`; stays in 0..1 (ends snap, so rounding never costs a frame). */
export function matchStep(p: number, q: number, dt: number, hold: number, drain: number) {
  const n = q > 0 ? p + (q * dt) / hold : p - dt / drain;
  return n >= 1 - 1e-9 ? 1 : n <= 1e-9 ? 0 : n;
}

/** Does a relative velocity (vx, vy) at distance `d` break the orbit (faster than BREAK × circular)? */
export const breaks = (mu: number, d: number, vx: number, vy: number) => Math.hypot(vx, vy) > BREAK * circular(mu, d);

/** Angle wrapped to [−π, π). */
export const wrap = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/**
 * Advances the orbit by `dt`. Without `steer` it turns at the slot rate in its own sense; with `steer` the angle moves toward
 * `steer.to` at up to `steer.rate` rad/s the short way round and stops there. Both are exact for any step size.
 */
export function stepOrbit(o: Orbit, mu: number, dt: number, steer?: { to: number; rate: number }) {
  o.dist += (o.target - o.dist) * (1 - Math.exp(-dt / SPRING_S));
  if (steer) {
    const d = wrap(steer.to - o.angle), m = steer.rate * dt;
    o.angle = wrap(o.angle + (Math.abs(d) <= m ? d : Math.sign(d) * m));
  } else o.angle = wrap(o.angle + o.dir * rate(o, mu) * dt);
}

/** Position on the orbit around a host at (hx, hy). */
export const place = (o: Orbit, hx: number, hy: number): Vec => ({ x: hx + Math.cos(o.angle) * o.dist, y: hy + Math.sin(o.angle) * o.dist });

/** Velocity relative to the host: the circular turn plus the spring's radial motion (`turn` overrides the angular rate, e.g. while steering). */
export function relVelocity(o: Orbit, mu: number, turn = o.dir * rate(o, mu)): Vec {
  const c = Math.cos(o.angle), s = Math.sin(o.angle), radial = (o.target - o.dist) / SPRING_S, t = turn * o.dist;
  return { x: c * radial - s * t, y: s * radial + c * t };
}
