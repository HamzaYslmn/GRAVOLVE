// Shared helpers for the civilization checks (flight, guns, nav, crowd, pirates, ledger): a world of radius R, seeded randomness,
// fake ships and bodies, the model's numbers. Node only (excluded from tsc).
import assert from 'node:assert/strict';
import { slotRadius } from '../../src/core/orbits.ts';
import { GUN_ARC, SHOT_S, SHOT_V, SPREAD, type Craft, type Fighter } from '../../src/evolution/civilization/flight.ts';
import { seeker, type Gun, type Launch } from '../../src/evolution/civilization/guns.ts';
import { type Disc } from '../../src/evolution/civilization/nav.ts';
import { type ARMS } from '../../src/evolution/civilization/rules.ts';

export const R = 40; // world radius (world units)
export const SR = 0.086 * R; // a ship's radius (combat.ts shipR at SHIP_SCALE)
export const fighter = (a: number): Fighter => ({ x: Math.cos(a) * R, y: Math.sin(a) * R, vx: 0, vy: 0, heading: a, burn: 0, wx: 0, wy: 0, k: Math.round(a * 977), sense: 0, mode: 'patrol', t: 0, bh: 0 });
export const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];

/** The model's numbers over sub-steps (pirate fleets: over frames), for patrols, rival war waves and pirates: slip off the nose, burn, speed along the nose, turn rate, total turning. */
export const book = () => ({ slip: [] as number[], burn: [] as number[], back: 0, rate: 0, turned: 0, time: 0 });
export function watch(model: ReturnType<typeof book>, c: Craft, h0: number, h: number, turn: number, fvx = 0, fvy = 0) {
  const nx = Math.cos(c.heading), ny = Math.sin(c.heading), rx = c.vx - fvx, ry = c.vy - fvy, f = rx * nx + ry * ny, l = ry * nx - rx * ny;
  if (Math.hypot(rx, ry) > 0.5 * R) model.slip.push((Math.atan2(Math.abs(l), f) * 180) / Math.PI);
  model.burn.push(c.burn);
  model.back = Math.min(model.back, f);
  model.rate = Math.max(model.rate, Math.abs(c.heading - h0) / h / turn);
  model.turned += Math.abs(c.heading - h0);
  model.time += h;
}
/** Prints and checks each model's numbers. */
export function report(models: Record<string, ReturnType<typeof book>>) {
  for (const [name, model] of Object.entries(models)) {
    const turns = model.turned / (2 * Math.PI) / (model.time / 60);
    console.log(`model, ${name}: slip median ${q(model.slip, 0.5).toFixed(1)}°, p90 ${q(model.slip, 0.9).toFixed(1)}°, max ${q(model.slip, 1).toFixed(1)}°; burn median ${q(model.burn, 0.5).toFixed(2)}, p90 ${q(model.burn, 0.9).toFixed(2)}; nose ${turns.toFixed(1)} full turns/min a ship; speed along the nose ≥ ${(model.back / R).toFixed(3)} R/s; turn rate ≤ ${model.rate.toFixed(3)} × the cap`);
    assert.ok(q(model.slip, 0.9) <= 12 && q(model.slip, 1) <= 25, `little slip off the nose: ${name}`);
    assert.ok(model.back >= -1e-9, `never flies backwards: ${name}`);
    assert.ok(model.rate <= 1 + 1e-9, `never turns faster than its cap: ${name}`);
  }
}

export { rng as seeded } from '../../src/core/rng.ts'; // seeded randomness (mulberry32)
/** A fighter's gun (ships.ts defend) on a world of radius R; `onBody` counts. */
export const fighterGun = (onBody?: Gun['onBody']): Gun => ({ team: 'you', u: SHOT_V * R, life: SHOT_S, arc: GUN_ARC, spread: SPREAD, tint: 0, onBody });

export const disc = (x: number, y: number, r: number, vx = 0, vy = 0, m = 1): Disc => ({ m, r, motion: { x, y, vx, vy } });
export const craft = (x: number, y: number, vx = 0, vy = 0, heading = Math.atan2(vy, vx)): Craft => ({ x, y, vx, vy, heading, burn: 0 });
export const move = (bodies: Disc[], dt: number) => bodies.forEach((b) => ([b.motion.x, b.motion.y] = [b.motion.x + b.motion.vx * dt, b.motion.y + b.motion.vy * dt]));
/** A seeded belt body: 0.001–0.05 of the world's mass, N(>m) ∝ m^-0.6; `beltR` its radius. */
export const beltM = (rnd: () => number) => Math.min(0.05, 0.001 * (1 - rnd()) ** (-1 / 0.6));
export const beltR = (rnd: () => number) => R * Math.cbrt(beltM(rnd));
/** A silo launch of arm `M` (rules.ts ARMS.missile) from a world of radius `R`, at rest at the origin; `o` overrides. */
export const silo = (M: typeof ARMS.missile, R: number, o: Partial<Launch>): Launch => ({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, tvx: 0, tvy: 0, u: M.u * R, life: M.life, k: M.k, blast: M.blast * R, seeker: seeker(M, R), ...o });
/** Your world's moons on slots `ks` (0.15 R), at angles `a0` + `da`·k, turning at the game's slot speeds; `at(t)` places them round (wx, wy) moving at (wvx, wvy). */
export const moonRing = (ks: number[], a0: number, da: number) => {
  const ms = ks.map((k) => ({ k, a: a0 + da * k, rad: slotRadius(R, k), w: ((1.1 + (0.5 * k) / 3) * R) / slotRadius(R, k), b: { ...disc(0, 0, 0.15 * R, 0, 0, 0.0017), moon: true } }));
  const at = (wx: number, wy: number, wvx: number, wvy: number) => ms.forEach((m) => Object.assign(m.b.motion, { x: wx + Math.cos(m.a) * m.rad, y: wy + Math.sin(m.a) * m.rad, vx: wvx - Math.sin(m.a) * m.rad * m.w, vy: wvy + Math.cos(m.a) * m.rad * m.w }));
  return { ms, at, turn: (dt: number) => ms.forEach((m) => (m.a += m.w * dt)) };
};
