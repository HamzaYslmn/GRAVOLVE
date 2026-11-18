import { clamp } from '../../core/rng.ts';
import { bearing, MAX_DT, SPECK, steps, wrap, type Craft } from './flight.ts';
import { sweptAt, touch } from './crash.ts';
import type { Disc } from './nav.ts';
import { ROCKET } from './rules.ts';

// Guns: one pooled list of rounds for every faction (combat.ts creates it as ctx.shots). A round fires only while the
// lead point is within the gun's arc of the nose, aimed once (with the burst's aim error), then flies straight. Rounds
// are swept each frame after the field's collisions: an enemy ship in the way dies; any body stops a round; only the
// body it was aimed at (or one the gun also `takes`: a pirate wing's other rocks) gets the gun's effect.
export type Team = 'you' | 'rival' | 'pirate';
/**
 * One gun per owner: its side (rounds never hit their own ships), round speed `u` (world units/s on top of the shooter),
 * `life` s, `arc` rad either side of the nose, aim error `spread` rad a burst, look (`tint`; `look`: its BOLT row, none
 * a round), bodies it flies through (`own`), and its effect on the body a round was aimed at (`onBody`, at the impact
 * point; also on bodies it `takes`).
 */
export type Gun = { team: Team; u: number; life: number; arc: number; spread: number; tint: number; look?: 'probe' | 'pirate' | 'shell' | 'lance'; own?: (b: Disc) => boolean; takes?: (b: Disc) => boolean; onBody?: (b: any, x: number, y: number) => void };
/** A round in flight: aimed once at launch, then straight. */
type Shot = { x: number; y: number; vx: number; vy: number; life: number; gun: Gun; target?: unknown };
/** A ship rounds can hit (with its velocity, if known): `kill` breaks it (`heavy`: a rocket's direct hit, through any shield). */
export type Hull = { x: number; y: number; vx?: number; vy?: number; r: number; team: Team; kill: (heavy?: boolean) => void };
export const SHOTS = 96; // rounds in flight at most

// How bolts look (bolts.ts draws them on one additive layer with the tech page's `dot`): shape and motion say the weapon,
// hue the faction. A tinted glow quad, `long` × its width along the path (centred 0.3 of its length behind the head), a
// white core (`coreTint` if set); lances a round halo. Rockets are baked hulls with a flame (bolts.ts).
// Widths are least(k, px): k ship units (render/tech.ts shipUnit), never under px screen pixels, so a bolt stays easy to
// follow zoomed out. The dot lights DOT_LIT of its quad brightly and DOT_GLOW of it visibly.
export type Quad = { k: number; px: number; long?: number; a?: number };
export const BOLT: Record<'round' | NonNullable<Gun['look']>, { glow: Quad; core: Quad; coreTint?: number; halo?: Quad }> = {
  round: { glow: { k: 15, px: 10.5, long: 3.2, a: 0.85 }, core: { k: 7.5, px: 5.25, long: 2.4 } }, // fighters, rival patrols and waves
  probe: { glow: { k: 12, px: 8.5, long: 2.8, a: 0.8 }, core: { k: 6, px: 4.25, long: 2.4 } },
  pirate: { glow: { k: 15, px: 10.5, long: 3.2, a: 0.85 }, core: { k: 7.5, px: 5.25, long: 2.4 }, coreTint: 0xffd9a0 }, // raiders
  shell: { glow: { k: 21, px: 15, long: 1.6, a: 0.9 }, core: { k: 10, px: 6.75, long: 1.2 } }, // marauders
  lance: { glow: { k: 25.5, px: 18, long: 2.4, a: 0.9 }, core: { k: 13, px: 9, long: 3.2 }, halo: { k: 42, px: 30, a: 0.25 } },
};
export const JET = 0xfff0c0; // a rocket flame's white-yellow core, both sides
/** A flash at each round's launch point for `s` s: least(k, px) across (lances and shells least(heavyK, heavyPx)). */
export const MUZZLE = { s: 0.07, k: 26, px: 18, heavyK: 44, heavyPx: 30 };
export const DOT_LIT = 0.2, DOT_GLOW = 0.42;
export const MAX_GLOW = 400; // additive quads a frame at most (the worst case 327: guns.test.ts)
/** `k` ship units (`unit` world units each), but at least `px` screen pixels at `zoom`. */
export const least = (k: number, px: number, unit: number, zoom: number) => Math.max(k * unit, px / zoom);
const JITTER = 0.2; // × the spread: each round's own scatter round the burst's aim
const RELOAD = 1.5; // s without the gun bearing: the next run starts a fresh burst

/** A gun's trigger on its owner: s to the next round, rounds into this burst, this burst's aim error, s since it last bore. */
export type Trigger = { t: number; n: number; err: number; idle: number };
export const trigger = (): Trigger => ({ t: 0, n: 0, err: 0, idle: 0 });
/**
 * The trigger held (the gun bears) or not for `h` s: bursts of `rounds` at `rate`/s, `gap` s apart (Infinity: one burst a
 * run; RELOAD s without bearing reloads it). 1: the first round of a burst is due; 2: a later one; 0: none.
 */
export function pull(g: Trigger, h: number, held: boolean, rounds: number, rate: number, gap: number) {
  g.idle = held ? 0 : g.idle + h;
  if (g.idle >= RELOAD) [g.n, g.t] = [0, Math.min(g.t, 0)];
  g.t -= h;
  if (!held || g.t > 0) {
    g.t = Math.max(0, g.t);
    return 0;
  }
  const first = g.n === 0;
  g.t += ++g.n >= rounds ? ((g.n = 0), gap) : 1 / rate;
  return first ? 1 : 2;
}

/** The pool of rounds: `fire` one, `step` them (sweep), `muzzles` the bursts started since the drawer last emptied it. */
export function createShots(cap = SHOTS, rnd = Math.random) {
  const pool: Shot[] = Array.from({ length: cap }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, gun: undefined as unknown as Gun }));
  let n = 0;
  const muzzles: { x: number; y: number; gun: Gun }[] = [];
  return {
    pool,
    muzzles,
    /** Rounds in flight: pool[0 … n). */
    get n() {
      return n;
    },
    /**
     * A round from a shooter at (x, y) moving at (vx, vy), nose `heading`, at a target at (tx, ty) moving at (tvx, tvy)
     * (`target`: the body that gets the gun's effect). False when the lead point is outside the arc or the pool is full.
     * `first`: the first round of a burst (a new aim error, a muzzle flash).
     */
    fire(gun: Gun, g: Trigger, first: boolean, x: number, y: number, vx: number, vy: number, heading: number, tx: number, ty: number, tvx: number, tvy: number, target?: unknown) {
      const lead = bearing(tx - x, ty - y, tvx - vx, tvy - vy, gun.u);
      if (n >= cap || Math.abs(wrap(lead - heading)) > gun.arc) return false;
      if (first) {
        g.err = (2 * rnd() - 1) * gun.spread;
        muzzles.push({ x, y, gun });
      }
      const a = lead + g.err + (2 * rnd() - 1) * gun.spread * JITTER, s = pool[n++];
      [s.x, s.y, s.vx, s.vy, s.life, s.gun, s.target] = [x, y, vx + Math.cos(a) * gun.u, vy + Math.sin(a) * gun.u, gun.life, gun, target];
      return true;
    },
    /**
     * Moves every round `dt` s and sweeps it against enemy `hulls` (killed) and `bodies` at least `minR` across (the one it
     * was aimed at gets the gun's effect); `hit` hears where each round stopped (a ship: true).
     */
    step(dt: number, bodies: readonly Disc[], hulls: readonly Hull[], minR: number, hit: (s: Shot, x: number, y: number, ship: boolean) => void) {
      for (let i = n - 1; i >= 0; i--) {
        const s = pool[i], x0 = s.x, y0 = s.y;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        let gone = s.life <= 0;
        if (!gone) {
          const [th, hull] = firstHull(hulls, s.gun.team, s.x, s.y, s.vx, s.vy, dt), body = firstBody(bodies, s.x, s.y, s.vx, s.vy, dt, minR, s.gun.own, th);
          if (body) {
            const { x, y } = struck(body, x0, y0);
            if (body === s.target || s.gun.takes?.(body)) s.gun.onBody?.(body, x, y);
            hit(s, x, y, false);
          } else if (hull) {
            hull.kill();
            hit(s, hull.x, hull.y, true);
          }
          gone = !!(body || hull);
        }
        if (!gone) continue;
        pool[i] = pool[--n]; // swap-remove: the last live round moves into its place
        pool[n] = s;
      }
    },
    clear: () => void ((n = 0), (muzzles.length = 0)),
  };
}
export type Shots = ReturnType<typeof createShots>;

/** The earliest enemy of `team` among `hulls` a point now at (x, y) moving at (vx, vy) passed over `dt` s: [share, hull] (Infinity: none). */
function firstHull(hulls: readonly Hull[], team: Team, x: number, y: number, vx: number, vy: number, dt: number): [number, Hull | undefined] {
  let first = Infinity, hull: Hull | undefined;
  for (const f of hulls) {
    if (f.team === team) continue;
    const tau = sweptAt(x - f.x, y - f.y, (vx - (f.vx ?? 0)) * dt, (vy - (f.vy ?? 0)) * dt, f.r);
    if (tau >= 0 && tau < first) [first, hull] = [tau, f];
  }
  return [first, hull];
}
/** The earliest of `bodies` (≥ `minR` across, not `own`) it touched before share `first`. */
function firstBody<B extends Disc>(bodies: readonly B[], x: number, y: number, vx: number, vy: number, dt: number, minR: number, own: ((b: Disc) => boolean) | undefined, first: number) {
  let body: B | undefined;
  for (const b of bodies) {
    if (!b.m || b.r < minR || own?.(b)) continue;
    const tau = touch(x, y, vx, vy, b, b.r, dt);
    if (tau >= 0 && tau < first) [first, body] = [tau, b];
  }
  return body;
}
/** Where a projectile from (x0, y0) struck body `b`: its surface toward the start. */
function struck(b: Disc, x0: number, y0: number) {
  const m = b.motion, dx = x0 - m.x, dy = y0 - m.y, d = Math.hypot(dx, dy) || 1;
  return { x: m.x + (dx / d) * b.r, y: m.y + (dy / d) * b.r };
}

/** The nearest of `foes` within `range` of (x, y): what a gun is aimed at. */
export function nearest<F extends { x: number; y: number }>(foes: readonly F[], x: number, y: number, range: number) {
  let best: F | undefined, bd = range;
  for (const f of foes) {
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < bd) [best, bd] = [f, d];
  }
  return best;
}

/** What a foe is, for `pick`. */
export type Cls = 'rocket' | 'frigate' | 'fighter' | 'probe' | 'miner';
const CLASS_W: Record<Cls, number> = { rocket: 0.5, frigate: 0.7, fighter: 1, probe: 1.5, miner: 1.5 };
/** The foe within `range` of (x, y) with the least distance × its class weight (CLASS_W; none: a fighter's): rockets first, then frigates. `first`: your priority, taken whatever its class or distance (the caller checked its reach). */
export function pick<F extends { x: number; y: number; cls?: Cls }>(foes: readonly F[], x: number, y: number, range: number, first?: F) {
  if (first) return first;
  let best: F | undefined, bs = Infinity;
  for (const f of foes) {
    const d = Math.hypot(f.x - x, f.y - y), s = d * CLASS_W[f.cls ?? 'fighter'];
    if (d < range && s < bs) [best, bs] = [f, s];
  }
  return best;
}

/** Nothing ≥ SPECK of a ship (radius `sr`) but `skip` between (x, y) and a target at (tx, ty) of radius `tr`: a bolt would get there. */
export function lineClear(x: number, y: number, tx: number, ty: number, tr: number, bodies: readonly Disc[], skip: (b: Disc) => boolean, sr: number) {
  const dx = tx - x, dy = ty - y, L = Math.hypot(dx, dy) || 1e-9, ux = dx / L, uy = dy / L, end = L - tr;
  for (const b of bodies) {
    if (!b.m || b.r < SPECK * sr || skip(b)) continue;
    const qx = b.motion.x - x, qy = b.motion.y - y, along = qx * ux + qy * uy;
    if (along > 0 && along < end && Math.abs(qx * uy - qy * ux) < b.r + sr) return false;
  }
  return true;
}

// What a jinking craft (flight.ts jink) reacts to.
const MENACE = 4; // your radii: an enemy ship this close, heading at the craft...
const MENACE_ARC = 0.35; // ...within this many rad, and closing, is a threat
const ROUND_S = 0.25; // s ahead: an enemy round that will pass...
const ROUND_PAD = 5; // ...within this many ship radii is a threat
/** A threat to a craft: an enemy ship closing on it nose-on within MENACE (in `R`), or an enemy round (not `team`'s) about to pass within ROUND_PAD ship radii. Its position and velocity (the threat's line). */
export function menace(c: Craft, ships: readonly { x: number; y: number; vx?: number; vy?: number }[], shots: { n: number; pool: readonly Shot[] }, team: Team, sr: number, R: number) {
  for (const f of ships) {
    const dx = c.x - f.x, dy = c.y - f.y, d = Math.hypot(dx, dy);
    if (d > MENACE * R || f.vx === undefined || f.vy === undefined) continue;
    const wx = f.vx - c.vx, wy = f.vy - c.vy, w = Math.hypot(wx, wy);
    if (w > 1e-9 && (dx * wx + dy * wy) / (d * w) >= Math.cos(MENACE_ARC)) return { x: f.x, y: f.y, vx: f.vx, vy: f.vy };
  }
  for (let i = 0; i < shots.n; i++) {
    const s = shots.pool[i];
    if (s.gun.team === team) continue;
    const px = s.x - c.x, py = s.y - c.y, wx = s.vx - c.vx, wy = s.vy - c.vy, w2 = wx * wx + wy * wy || 1e-9, t = clamp(-(px * wx + py * wy) / w2, 0, ROUND_S);
    if (Math.hypot(px + wx * t, py + wy * t) < ROUND_PAD * sr) return { x: s.x, y: s.y, vx: s.vx, vy: s.vy };
  }
  return undefined;
}

/** Where a rocket's target is now (`r`: its radius), or undefined once it is gone. */
export type Seek = () => { x: number; y: number; vx: number; vy: number; r?: number } | undefined;

// Rockets (rules.ts ROCKET; one pool for every side): off a pad on the shooter's surface ROCKET.pad rad off the aim (padShip
// at a ship; less from near; sides alternating), then real thrust in its target's frame (`fx, fy`: the target's velocity,
// read over ROCKET.lag s): the nose turns ≤ turn rad/s toward the push it wants, the motor pushes only along the nose
// (≤ acc), so the velocity lags the nose and it slips through turns. Its fuel is its range: the distance flown in the
// target's or the launch frame (the lesser), so turning costs range. A lock holds while its target lives (then it flies
// straight to the end of its fuel), but the seeker lets go ROCKET.blind s before the hit (guide). A point shot (`scan`) locks what its scan finds. Any body (bar `own`) stops it; an enemy
// hull it touches, or one near its locked ship when the fuze fires, takes the direct hit (`kill(true)`: through shields),
// others within `blast` the blast.
export type Rocket = Craft & {
  team: Team; R: number; v0x: number; v0y: number; fx: number; fy: number; V: number; age: number; fuel: number; lock: boolean; fuze: boolean; k: number; dead: boolean; kill: () => void; cls: 'rocket';
  seek?: Seek; aim?: { x: number; y: number; vx: number; vy: number }; scan?: (m: Rocket) => Lock | undefined; target?: unknown; from?: unknown; own?: (b: Disc) => boolean; hit?: (b: any, x: number, y: number) => void; lit?: boolean;
};
/** What a rocket locks: where its target is, the target, a ship (`fuze`). */
export type Lock = { seek: Seek; target?: unknown; fuze?: boolean };
/**
 * A launch from a shooter at (x, y) moving at (vx, vy), radius `r`, at a target at (tx, ty) moving at (tvx, tvy): `R` its
 * unit (world units a rules.ts R), `range` its fuel (world units, mining.ts fireReach); with `seek` it is guided (`fuze`:
 * the target is a ship), else it flies straight. `scan` (point shots): each frame, what it may lock now.
 */
export type RocketLaunch = {
  team: Team; x: number; y: number; vx: number; vy: number; r: number; tx: number; ty: number; R: number; range: number;
  k?: number; seek?: Seek; scan?: Rocket['scan']; fuze?: boolean; target?: unknown; from?: unknown; own?: (b: Disc) => boolean; hit?: Rocket['hit'];
};
const TAU = 0.2; // s: a velocity error is thrust away over this long
const TRIM = 0.2; // x acc: the pull of the nose back onto its velocity (cruise: nose along the path)
/**
 * One sub-step of `h` s of a rocket's motor and guidance (rules.ts ROCKET): real thrust, along the nose only. The seeker
 * lets go `blind` s before it would reach its target's surface: it keeps the target's place and velocity as they are then
 * (`aim`, coasting on) and flies there; once past that point it looks again. A steady target is where the aim says; one that
 * burns hard across in that time is not. The lock (fuze, hit) holds throughout; a point shot's ray never lets go.
 */
export function guide(m: Rocket, h: number, q = ROCKET) {
  m.age += h;
  const V = m.V, A = q.acc * m.R;
  let t = m.lock ? m.seek?.() : undefined, a = m.aim;
  if (m.lock && !t) m.lock = false;
  if (t && !m.scan) {
    if (a) { // let go: the aim coasts on; past it the seeker looks again
      [a.x, a.y] = [a.x + a.vx * h, a.y + a.vy * h];
      if ((a.x - m.x) * (m.vx - a.vx) + (a.y - m.y) * (m.vy - a.vy) <= 0) a = m.aim = undefined;
    }
    const dx = t.x - m.x, dy = t.y - m.y, d = Math.hypot(dx, dy);
    if (!a && (d - (t.r ?? 0)) * d < q.blind * ((m.vx - t.vx) * dx + (m.vy - t.vy) * dy)) a = m.aim = { x: t.x, y: t.y, vx: t.vx, vy: t.vy }; // time to go < blind
    if (a) t = a;
  }
  if (t) { const k = 1 - Math.exp(-h / q.lag); m.fx += (t.vx - m.fx) * k; m.fy += (t.vy - m.fy) * k; }
  const wx = m.vx - m.fx, wy = m.vy - m.fy, vb = Math.hypot(wx, wy) > 1e-6 ? Math.atan2(wy, wx) : m.heading; // in the target's frame
  const dir = t ? bearing(t.x - m.x, t.y - m.y, t.vx - m.fx, t.vy - m.fy, V) : vb;
  const cx = Math.cos(dir), cy = Math.sin(dir), s = Math.max(wx * cx + wy * cy, V * Math.max(q.slow, Math.cos(wrap(dir - vb))));
  let ax = (cx * s - wx) / TAU, ay = (cy * s - wy) / TAU; // the push it wants
  const p = Math.hypot(ax, ay);
  if (p > A) [ax, ay] = [(ax * A) / p, (ay * A) / p];
  const err = wrap(Math.atan2(ay + TRIM * A * Math.sin(vb), ax + TRIM * A * Math.cos(vb)) - m.heading);
  m.heading += clamp(err, -q.turn * h, q.turn * h);
  const nx = Math.cos(m.heading), ny = Math.sin(m.heading), thr = clamp(ax * nx + ay * ny, 0, A); // the motor gives its share along the nose
  [m.vx, m.vy] = [m.vx + nx * thr * h, m.vy + ny * thr * h];
  m.fuel -= Math.min(Math.hypot(m.vx - m.fx, m.vy - m.fy), Math.hypot(m.vx - m.v0x, m.vy - m.v0y)) * h;
  [m.x, m.y] = [m.x + m.vx * h, m.y + m.vy * h];
  m.burn += (thr / A - m.burn) * (1 - Math.exp(-h / 0.1));
}
/**
 * A point shot's scan (combat.ts): the nearest of `foes` the rocket `m` can still make (ROCKET.seek): within `cone` of its
 * velocity relative to the foe, within min(`range` R, `fuel` × its fuel left), and a turn it can fly (sin θ < `turn` × d / (2w² / acc)).
 */
export function spot<F extends { x: number; y: number; vx?: number; vy?: number }>(m: Rocket, foes: readonly F[], q = ROCKET) {
  const A = q.acc * m.R, S = q.seek;
  return nearest(foes.filter((f) => {
    const dx = f.x - m.x, dy = f.y - m.y, d = Math.hypot(dx, dy), wx = m.vx - (f.vx ?? 0), wy = m.vy - (f.vy ?? 0), w = Math.hypot(wx, wy);
    if (!(d * w > 0)) return false;
    const c = (dx * wx + dy * wy) / (d * w);
    return c >= Math.cos(S.cone) && Math.sqrt(Math.max(0, 1 - c * c)) < (S.turn * d * A) / (2 * w * w);
  }), m.x, m.y, Math.min(S.range * m.R, S.fuel * m.fuel));
}
export function createRockets(cap = ROCKET.max, rnd: () => number = Math.random) {
  const live: Rocket[] = [], q = ROCKET;
  let side = 1;
  return {
    live,
    room: () => live.length < cap,
    /** One launch (RocketLaunch); undefined when the pool is full. */
    launch(o: RocketLaunch) {
      if (live.length >= cap) return undefined;
      side = live.length ? -side : rnd() < 0.5 ? 1 : -1;
      const dx = o.tx - o.x, dy = o.ty - o.y, D = Math.hypot(dx, dy) || 1, d = Math.max(0, D - o.r), t0 = o.seek?.();
      const close = ((o.vx - (t0?.vx ?? o.vx)) * dx + (o.vy - (t0?.vy ?? o.vy)) * dy) / D; // the shooter's speed toward the aim, in the target's frame
      const a = Math.atan2(dy, dx) + side * (o.fuze ? q.padShip : q.pad) * Math.min(1, d / (q.near * o.R)) * ((q.speed * o.R) / Math.max(q.speed * o.R, close + q.lift * o.R)) ** 2;
      const c = Math.cos(a), s = Math.sin(a), m: Rocket = {
        x: o.x + c * (o.r + 0.5 * q.len * o.R), y: o.y + s * (o.r + 0.5 * q.len * o.R), vx: o.vx + c * q.lift * o.R, vy: o.vy + s * q.lift * o.R, heading: a, burn: 1, team: o.team, R: o.R, v0x: o.vx, v0y: o.vy, age: 0,
        fx: t0?.vx ?? o.vx, fy: t0?.vy ?? o.vy, V: q.speed * o.R + (o.scan ? Math.max(0, close) : 0), // a point shot keeps your forward speed toward the aim
        fuel: o.range - 0.5 * q.len * o.R, lock: !!o.seek, fuze: !!o.fuze, k: o.k ?? q.k, dead: false, kill: () => void (m.dead = true), cls: 'rocket', seek: o.seek, scan: o.scan, target: o.target, from: o.from, own: o.own, hit: o.hit,
      };
      live.push(m);
      return m;
    },
    /**
     * Flies every rocket `dt` s and sweeps it: the earliest enemy hull, locked ship's fuze, or body
     * (≥ `minR` across, not its own) bursts it (its target gets its own `hit`, else `hit` hears a body). Then `gone(m, x, y,
     * end)` for each that ends: 'burst', 'shot' (dead: a round got it) or 'out' (fuel spent).
     */
    step<B extends Disc>(dt: number, bodies: readonly B[], hulls: readonly Hull[], minR: number, hit: (m: Rocket, b: B, x: number, y: number) => void, gone: (m: Rocket, x: number, y: number, end: 'burst' | 'shot' | 'out') => void) {
      const n = steps(dt), h = Math.min(dt, MAX_DT) / n, T = n * h;
      for (let i = live.length - 1; i >= 0; i--) {
        const m = live[i], x0 = m.x, y0 = m.y;
        let at: { x: number; y: number } | undefined, direct: Hull | undefined;
        if (!m.dead) {
          const l = m.scan?.(m), p = l?.seek(); // a point shot's scan found something: lock it, at full speed in its frame
          if (l && p) [m.seek, m.target, m.fuze, m.lock, m.fx, m.fy, m.V, m.scan] = [l.seek, l.target, !!l.fuze, true, p.vx, p.vy, q.speed * m.R, undefined];
          for (let k = 0; k < n && m.fuel > 0; k++) guide(m, h, q);
          const [th, hull] = firstHull(hulls, m.team, m.x, m.y, m.vx, m.vy, T);
          const t = m.fuze && m.lock ? m.seek?.() : undefined, fz = q.fuze * m.R + (t?.r ?? 0);
          const tf = t ? sweptAt(m.x - t.x, m.y - t.y, (m.vx - t.vx) * T, (m.vy - t.vy) * T, fz) : -1, fuzed = tf >= 0 && tf < th;
          const body = firstBody(bodies, m.x, m.y, m.vx, m.vy, T, minR, m.own, fuzed ? tf : th);
          if (body) {
            at = struck(body, x0, y0);
            if (!m.hit) hit(m, body, at.x, at.y);
            else if (body === m.target) m.hit(body, at.x, at.y);
          } else if (fuzed && t) [at, direct] = [{ x: m.x, y: m.y }, nearest(hulls.filter((f) => f.team !== m.team), t.x, t.y, fz)];
          else if (hull) [at, direct] = [{ x: hull.x, y: hull.y }, hull];
        }
        if (at) {
          direct?.kill(true);
          for (const f of hulls) if (f !== direct && f.team !== m.team && Math.hypot(f.x - at.x, f.y - at.y) < q.blast * m.R + f.r) f.kill();
        }
        if (!at && !m.dead && m.fuel > 0) continue;
        gone(m, at?.x ?? m.x, at?.y ?? m.y, at ? 'burst' : m.dead ? 'shot' : 'out');
        live.splice(i, 1);
      }
    },
    clear: () => void (live.length = 0),
  };
}
export type Rockets = ReturnType<typeof createRockets>;
