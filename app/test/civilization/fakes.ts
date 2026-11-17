// Shared helpers for the civilization checks (flight, guns, nav, crowd, pirates, captains, ledger): a world of radius R, seeded randomness,
// fake ships and bodies, the model's numbers, a pirate world. Node only (excluded from tsc).
import assert from 'node:assert/strict';
import { slotRadius } from '../../src/core/orbits.ts';
import { GUN_ARC, SHOT_S, SHOT_V, SPECK, SPREAD, type Craft, type Fighter } from '../../src/evolution/civilization/flight.ts';
import { createShots, SHOTS, type Gun, type Hull, type RocketLaunch } from '../../src/evolution/civilization/guns.ts';
import { type Disc } from '../../src/evolution/civilization/nav.ts';
import { CAPTAINS, type Captain } from '../../src/evolution/civilization/escape.ts';
import { createPirates } from '../../src/evolution/civilization/pirates.ts';
import type { Foe } from '../../src/evolution/civilization/ships.ts';
import { rng as seeded } from '../../src/core/rng.ts';

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

export { seeded }; // seeded randomness (mulberry32)
/** A fighter's gun (ships.ts defend) on a world of radius R; `onBody` counts. */
export const fighterGun = (onBody?: Gun['onBody']): Gun => ({ team: 'you', u: SHOT_V * R, life: SHOT_S, arc: GUN_ARC, spread: SPREAD, tint: 0, onBody });

export const disc = (x: number, y: number, r: number, vx = 0, vy = 0, m = 1): Disc => ({ m, r, motion: { x, y, vx, vy } });
export const craft = (x: number, y: number, vx = 0, vy = 0, heading = Math.atan2(vy, vx)): Craft => ({ x, y, vx, vy, heading, burn: 0 });
export const move = (bodies: Disc[], dt: number) => bodies.forEach((b) => ([b.motion.x, b.motion.y] = [b.motion.x + b.motion.vx * dt, b.motion.y + b.motion.vy * dt]));
/** A seeded belt body: 0.001–0.05 of the world's mass, N(>m) ∝ m^-0.6; `beltR` its radius. */
export const beltM = (rnd: () => number) => Math.min(0.05, 0.001 * (1 - rnd()) ** (-1 / 0.6));
export const beltR = (rnd: () => number) => R * Math.cbrt(beltM(rnd));
/** A rocket launch (guns.ts createRockets) from a world of radius `W` at rest at the origin, `range` R of fuel (default 25.2: one moon slot); `o` overrides. */
export const rocketAt = (W: number, o: Partial<RocketLaunch>, range = 25.2): RocketLaunch => ({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, r: W, tx: 0, ty: 0, R: W, range: range * W, ...o });
/** Your world's moons on slots `ks` (0.15 R), at angles `a0` + `da`·k, turning at the game's slot speeds; `at(t)` places them round (wx, wy) moving at (wvx, wvy). */
export const moonRing = (ks: number[], a0: number, da: number) => {
  const ms = ks.map((k) => ({ k, a: a0 + da * k, rad: slotRadius(R, k), w: ((1.1 + (0.5 * k) / 3) * R) / slotRadius(R, k), b: { ...disc(0, 0, 0.15 * R, 0, 0, 0.0017), moon: true } }));
  const at = (wx: number, wy: number, wvx: number, wvy: number) => ms.forEach((m) => Object.assign(m.b.motion, { x: wx + Math.cos(m.a) * m.rad, y: wy + Math.sin(m.a) * m.rad, vx: wvx - Math.sin(m.a) * m.rad * m.w, vy: wvy + Math.cos(m.a) * m.rad * m.w }));
  return { ms, at, turn: (dt: number) => ms.forEach((m) => (m.a += m.w * dt)) };
};

// A pirate world (pirates.ts, the real thing in a fake world): you (radius R) at the origin, bodies that drift under
// gravity (everything pulls; your surface gravity 0.55 R/s², the game's), merge or bounce when they touch, moons
// on kinematic slots, field.spawn adding bodies (those under 0.001 of you dropped, as the field does), rounds in the real
// pool swept each frame, contacts as combat.ts runs them. View 30 × 17 R (half sizes), ship radius 0.086 R; seeded.
type PB = { m: number; r: number; motion: { x: number; y: number; vx: number; vy: number }; comp: Record<string, number>; view: { destroyed: boolean; parent: object | null }; tint: number; moon?: boolean };
export const inFlight = { peak: 0 }; // most rounds in flight at once over every run (guns.ts SHOTS)
export const world = (seed: number, o: { moons?: number; civ?: boolean; stock?: number; still?: boolean; who?: Captain } = {}) => {
  const rnd = seeded(seed), bodies: PB[] = [], noop = () => {};
  const mk = (x: number, y: number, vx: number, vy: number, m: number, comp: Record<string, number>): PB => ({ m, r: R * Math.cbrt(m), motion: { x, y, vx, vy }, comp, view: { destroyed: false, parent: {} }, tint: 0 });
  const me = mk(0, 0, 0, 0, 1, { rock: 0.5, ice: 0.3, gas: 0.2 });
  const moons = Array.from({ length: o.moons ?? 0 }, (_, k) => {
    const b = { ...mk(0, 0, 0, 0, 0.0017, { rock: 1 }), r: 0.12 * R, moon: true }, rad = slotRadius(R, k);
    bodies.push(b);
    return { b, slot: k, a: k * 1.7, rad, w: ((1.1 + (0.5 * k) / 3) * R) / rad };
  });
  const place = () => moons.forEach((m) => Object.assign(m.b.motion, { x: Math.cos(m.a) * m.rad, y: Math.sin(m.a) * m.rad, vx: -Math.sin(m.a) * m.rad * m.w, vy: Math.cos(m.a) * m.rad * m.w }));
  place();
  const parts = new Map<PB, { m0: number; got: number[] }>(); // a cracked rock (`from`): its mass then and its pieces
  const field = { spawn: (x: number, y: number, vx: number, vy: number, m: number, comp: Record<string, number>, from?: PB) => { const b = mk(x, y, vx, vy, m, comp); if (from) parts.set(from, parts.get(from) ?? { m0: from.m, got: [] }).get(from)!.got.push(m); if (m >= 1e-3 * me.m) bodies.push(b); return b; } };
  const stock = { ore: o.stock ?? 50, vol: 0 }, lines = { moveTo: () => lines, lineTo: () => lines, stroke: () => lines };
  const civ = o.civ ? { state: { active: true }, shieldTake: () => false, gain: noop, stocks: stock, steal: (n: number) => { const ore = Math.min(stock.ore, n); stock.ore -= ore; return { ore, vol: 0 }; } } : undefined;
  const ctx = {
    me, fx: { flash: noop, burst: noop, popup: noop, ember: noop }, lines, field: () => field, sfx: () => undefined, news: noop, cam: { x: 0, y: 0, halfW: 30 * R, halfH: 17 * R, seenW: 30 * R, seenH: 17 * R, zoom: 1 }, near: bodies, civ,
    moons: { list: () => moons.map((m) => ({ body: m.b, slot: m.slot })) }, mine: [] as Foe[], miners: [] as Foe[], shots: createShots(SHOTS, seeded(seed + 99)), put: noop, draw: noop, wreck: noop,
    kill: (b: PB) => void ((b.m = 0), (b.view.destroyed = true)), shed: (b: PB, dm: number) => void (b.m -= dm),
    onScreen: (x: number, y: number, r = 0) => Math.abs(x - ctx.cam.x) < ctx.cam.seenW + r && Math.abs(y - ctx.cam.y) < ctx.cam.seenH + r,
    diag: () => Math.hypot(ctx.cam.halfW, ctx.cam.halfH), shipR: () => SR,
  };
  const rivals = { list: [], foes: () => [], watch: noop, shieldTake: () => false };
  const pirates = createPirates(ctx as unknown as Parameters<typeof createPirates>[0], rivals as unknown as Parameters<typeof createPirates>[1], rnd), launch = pirates.launch;
  pirates.launch = (u?: number, who: Captain = o.who ?? CAPTAINS.reaver) => launch(u, who); // the reaver unless a captain is named (no extra roll)
  const frame = (dt: number, more?: () => void) => {
    pirates.update(dt, civ as never);
    const loose = bodies.filter((b) => !b.moon && b.m > 0), G = 0.55 * R ** 3;
    if (!o.still) for (const b of loose) for (const q of [me, ...loose]) {
      const dx = q.motion.x - b.motion.x, dy = q.motion.y - b.motion.y, d2 = Math.max(dx * dx + dy * dy, (b.r + q.r) ** 2), a = q === b ? 0 : (G * q.m) / d2 / Math.sqrt(d2);
      [b.motion.vx, b.motion.vy] = [b.motion.vx + dx * a * dt, b.motion.vy + dy * a * dt];
    }
    for (const b of loose) [b.motion.x, b.motion.y] = [b.motion.x + b.motion.vx * dt, b.motion.y + b.motion.vy * dt];
    // Rock on rock (the field's rule, simplified): slower than half their mutual escape speed they merge, else they bounce;
    // a rock reaching your surface is gone (eaten).
    if (!o.still) for (let i = 0; i < loose.length; i++) {
      const a = loose[i];
      if (a.m && Math.hypot(a.motion.x - me.motion.x, a.motion.y - me.motion.y) < me.r + a.r) [a.m, a.view.destroyed] = [0, true];
      for (let j = i + 1; j < loose.length; j++) {
        const b = loose[j], dx = b.motion.x - a.motion.x, dy = b.motion.y - a.motion.y, d = Math.hypot(dx, dy) || 1e-9;
        if (!a.m || !b.m || d >= a.r + b.r) continue;
        const nx = dx / d, ny = dy / d, close = (a.motion.vx - b.motion.vx) * nx + (a.motion.vy - b.motion.vy) * ny;
        if (close <= 0) continue; // already parting
        if (close < 0.5 * Math.sqrt((2 * G * (a.m + b.m)) / (a.r + b.r))) {
          const [k, l] = a.m >= b.m ? [a, b] : [b, a], m = k.m + l.m;
          [k.motion.vx, k.motion.vy] = [(k.motion.vx * k.m + l.motion.vx * l.m) / m, (k.motion.vy * k.m + l.motion.vy * l.m) / m];
          [k.m, k.r, l.m, l.view.destroyed] = [m, R * Math.cbrt(m), 0, true];
        } else {
          const ja = (2 * b.m * close) / (a.m + b.m), jb = (2 * a.m * close) / (a.m + b.m); // an elastic bounce along the line of centres
          [a.motion.vx, a.motion.vy, b.motion.vx, b.motion.vy] = [a.motion.vx - ja * nx, a.motion.vy - ja * ny, b.motion.vx + jb * nx, b.motion.vy + jb * ny];
        }
      }
    }
    moons.forEach((m) => (m.a += m.w * dt));
    place();
    more?.();
    const all = [me, ...bodies.filter((b) => b.m > 0)];
    const hulls: Hull[] = [...pirates.foes().map((q) => ({ x: q.x, y: q.y, vx: q.vx, vy: q.vy, r: SR, team: 'pirate' as const, kill: q.kill })), ...ctx.mine.map((q) => ({ ...q, r: SR, team: 'you' as const }))];
    inFlight.peak = Math.max(inFlight.peak, ctx.shots.n);
    ctx.shots.step(dt, all, hulls, SPECK * SR, noop);
    pirates.contacts(all as never, dt);
    for (let i = bodies.length - 1; i >= 0; i--) if (!bodies[i].m) bodies.splice(i, 1);
  };
  return { ctx, me, bodies, mk, pirates, frame, stock, rnd, parts };
};
export type PirateWorld = ReturnType<typeof world>;
export const alive = (w: PirateWorld) => (w.pirates.fleet?.ships ?? []).filter((s) => !s.dead);
export const rock = (w: PirateWorld, a: number, d = 15) => w.bodies.push(w.mk(Math.cos(a) * d * R, Math.sin(a) * 0.8 * d * R, 0.1 * R, 0, 0.04, { rock: 0.4, metal: 0.4, ice: 0.2 }));
export const U = (n: number) => Math.sqrt((n - 1 + 0.5) / 14); // the fleetSize roll for n ships
/** A 10-ship fleet launched by the rock at 1.1 and flown 8 s; returns half of it, haulers spared (retreat, rout). */
export function raid10(w: PirateWorld, dt: number) {
  rock(w, 1.1);
  w.pirates.launch(U(10));
  for (let t = 0; t < 8; t += dt) w.frame(dt);
  return alive(w).filter((s) => s.kind !== 'hauler').slice(0, Math.ceil(alive(w).length / 2));
}
