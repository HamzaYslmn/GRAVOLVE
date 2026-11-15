import type { Motion } from '../../core/entity';
import { capture, circular, place, relVelocity, stepOrbit, type Orbit } from '../../core/orbits';
import { clamp } from '../../core/rng';
import type { Body } from '../asteroid/body';
import { AGE_GOAL } from '../asteroid/rules';
import { capacity, lapMu, PLANET_R, RING_RATE } from './rules';

// System planets (concept 3): your star catches round worlds and carries them on kinematic rings (core/orbits.ts, like
// moons: no free gravity, never stored, never touch you or each other) outside your world's orbit. Only lifeless field
// worlds are caught (rival worlds keep their own course); a colony or a terraforming one moves into the liquid band
// (colony.ts), the rest keep their rings.

/** `ring` −1: a living planet on its own ring `goal` (R★); `life`: what your people made of it; `score`: its habitability (colony.ts). */
export type Planet = { b: Body; o: Orbit; ring: number; goal?: number; life?: 'fleet' | 'terra' | 'colony'; score?: number };
type Host = { m: Motion; R: number; M: number };

/** The first round world (r ≤ PLANET_R R★) in the catch `zone` (R★) moving slower than circular speed takes the lowest free ring; true if one did. */
export function catchPlanet(planets: Planet[], s: Host, mu: number, bodies: readonly Body[], dir: number, zone: number[]) {
  if (planets.length >= capacity(s.M)) return false;
  for (const b of bodies) {
    if (b.m < AGE_GOAL || b.moon || b.held || b.rival || b.meteor || b.r > PLANET_R * s.R) continue;
    const rx = b.motion.x - s.m.x, ry = b.motion.y - s.m.y, d = Math.hypot(rx, ry), vx = b.motion.vx - s.m.vx, vy = b.motion.vy - s.m.vy;
    if (d < zone[0] * s.R || d > zone[1] * s.R || Math.hypot(vx, vy) >= circular(mu, d)) continue;
    let ring = 0;
    while (planets.some((p) => p.ring === ring)) ring++;
    const o = capture(rx, ry, vx, vy, d);
    o.dir = dir; // one sense round the star, your world's
    [b.moon, b.motion.drag] = [true, 0];
    planets.push({ b, o, ring });
    return true;
  }
  return false;
}

/** Each planet eases to its ring (`ringX`, R★) and rides it round the star; eaten ones drop out. */
export function carry(planets: Planet[], s: Host, mu: number, dt: number, ringX: (k: number) => number) {
  for (let i = planets.length - 1; i >= 0; i--) {
    const { b, o, ring, goal } = planets[i];
    if (!b.m || !b.moon) {
      planets.splice(i, 1);
      continue;
    }
    ride(o, b.motion, s, mu, goal ?? ringX(ring), RING_RATE, dt);
  }
}

/** One step on a placed orbit round `s`: its radius eases toward `goal` (R★) at `rate` R★/s, then `m` is set on it. */
export function ride(o: Orbit, m: Motion, s: Host, mu: number, goal: number, rate: number, dt: number) {
  const step = rate * s.R * dt;
  o.target += clamp(goal * s.R - o.target, -step, step);
  const om = lapMu(mu, o.target);
  stepOrbit(o, om, dt);
  const p = place(o, s.m.x, s.m.y), v = relVelocity(o, om);
  [m.x, m.y, m.vx, m.vy] = [p.x, p.y, s.m.vx + v.x, s.m.vy + v.y];
}

/** The star is gone: its planets fly on as plain bodies. */
export function release(planets: Planet[]) {
  for (const { b } of planets.splice(0)) [b.moon, b.motion.drag] = [false, 1e-3];
}
