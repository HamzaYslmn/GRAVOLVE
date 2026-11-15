import { clamp } from '../../core/rng.ts';
import { bearing, SPECK, wrap, type Craft } from './flight.ts';
import { swept, touch } from './crash.ts';
import type { Disc } from './nav.ts';
import { intercept } from './rules.ts';

/** A round in flight: aimed once at launch, then straight (`fly` never steers). */
type Bolt = { x: number; y: number; vx: number; vy: number; life: number };
export function fly(b: Bolt, dt: number) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.life -= dt;
}

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
type Shot = Bolt & { gun: Gun; target?: unknown };
/** A ship rounds can hit (with its velocity, if known): `kill` breaks it. */
export type Hull = { x: number; y: number; vx?: number; vy?: number; r: number; team: Team; kill: () => void };
export const SHOTS = 96; // rounds in flight at most

// How bolts look (bolts.ts draws them on one additive layer with the tech page's `dot`): shape and motion say the weapon,
// hue the faction. A tinted glow quad, `long` × its width along the path (centred 0.3 of its length behind the head), a
// white core (`coreTint` if set); lances a round halo; missiles and rockets (one family, two sizes) a teardrop head and a
// flame behind it (tinted, round a white-yellow `jet`), long while the motor pushes, a dim stub once the seeker lets go.
// Widths are least(k, px): k ship units (render/tech.ts shipUnit), never under px screen pixels, so a bolt stays easy to
// follow zoomed out. The dot lights DOT_LIT of its quad brightly and DOT_GLOW of it visibly.
export type Quad = { k: number; px: number; long?: number; a?: number };
export const BOLT: Record<'round' | NonNullable<Gun['look']> | Missile['look'], { glow: Quad; core: Quad; coreTint?: number; halo?: Quad; flame?: Quad; jet?: Quad }> = {
  round: { glow: { k: 20, px: 14, long: 4, a: 0.85 }, core: { k: 10, px: 7, long: 3 } }, // fighters, rival patrols and waves
  probe: { glow: { k: 16, px: 11, long: 3.5, a: 0.8 }, core: { k: 8, px: 5.5, long: 3 } },
  pirate: { glow: { k: 20, px: 14, long: 4, a: 0.85 }, core: { k: 10, px: 7, long: 3 }, coreTint: 0xffd9a0 }, // raiders
  shell: { glow: { k: 28, px: 20, long: 2, a: 0.9 }, core: { k: 13, px: 9, long: 1.5 } }, // marauders
  lance: { glow: { k: 34, px: 24, long: 3, a: 0.9 }, core: { k: 17, px: 12, long: 4 }, halo: { k: 56, px: 40, a: 0.25 } },
  missile: { glow: { k: 36, px: 26, long: 1.5, a: 0.95 }, core: { k: 15, px: 11, long: 1.4 }, flame: { k: 24, px: 16, long: 5, a: 0.75 }, jet: { k: 11, px: 7, long: 4, a: 1 } }, // silos
  rocket: { glow: { k: 26, px: 20, long: 1.5, a: 0.95 }, core: { k: 11, px: 8, long: 1.4 }, flame: { k: 18, px: 12, long: 4.5, a: 0.75 }, jet: { k: 8, px: 6, long: 3.5, a: 1 } }, // your surface rack
};
export const JET = 0xfff0c0; // a flame's white-yellow core, both sides
/** Slugs (bodies, steel: render/tech.ts STEEL): [× the slug's radius (length: × D), screen px] for the streak's width and length and the head; hair-thin, very long, no halo. */
export const SLUG_LOOK = { w: [2.5, 7], len: [3, 170], head: [2.5, 8] };
/** A flash at each round's launch point for `s` s: least(k, px) across (lances and shells least(heavyK, heavyPx)). */
export const MUZZLE = { s: 0.07, k: 26, px: 18, heavyK: 44, heavyPx: 30 };
export const DOT_LIT = 0.2, DOT_GLOW = 0.42;
export const MAX_GLOW = 400; // additive quads a frame at most (the worst case ≈ 280: guns.test.ts)
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
        fly(s, dt);
        let gone = s.life <= 0;
        for (const f of hulls) {
          if (gone || f.team === s.gun.team || !swept(s.x - f.x, s.y - f.y, (s.vx - (f.vx ?? 0)) * dt, (s.vy - (f.vy ?? 0)) * dt, f.r)) continue;
          f.kill();
          hit(s, f.x, f.y, true);
          gone = true;
        }
        for (const b of bodies) {
          if (gone || !b.m || b.r < minR || s.gun.own?.(b) || !touch(s.x, s.y, s.vx, s.vy, b, b.r, dt)) continue;
          const m = b.motion, dx = x0 - m.x, dy = y0 - m.y, d = Math.hypot(dx, dy) || 1, x = m.x + (dx / d) * b.r, y = m.y + (dy / d) * b.r; // where it struck
          if (b === s.target || s.gun.takes?.(b)) s.gun.onBody?.(b, x, y);
          hit(s, x, y, false);
          gone = true;
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
export type Cls = 'missile' | 'frigate' | 'fighter' | 'probe' | 'miner';
const CLASS_W: Record<Cls, number> = { missile: 0.5, frigate: 0.7, fighter: 1, probe: 1.5, miner: 1.5 };
/** The foe within `range` of (x, y) with the least distance × its class weight (CLASS_W; none: a fighter's): missiles first, then frigates. `first`: your priority, taken whatever its class or distance (the caller checked its reach). */
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

// Missiles and rockets (silos, both sides: rules.ts ARMS.missile; your surface rack: rules.ts ROCKET; one pool, combat.ts):
// aimed at where the target will be, then guided by `steer` (Seeker): the motor runs it up from `boost` × its cruise speed
// `u` at `acc`; while locked it turns at most `turn` rad/s onto the lead point, and the lock is lost for good once it is
// `burn` s old, the lead point is more than `cone` rad off its nose, the target is gone, or it is within `blind` s of the
// target's surface: from there on it flies straight (the flame dims: the moment to sidestep). Any body stops one (bar its
// shooter's `own`); an enemy round, slug or beam kills it (combat.ts lists it as a Hull of ARMS.missile.size × a ship's radius, a Foe and a Mark); where it bursts
// (a body, or an enemy ship it touches), enemy ships within `blast` die.
/** A seeker's numbers (`acc` in world units/s²). */
export type Seeker = { boost: number; acc: number; turn: number; cone: number; burn: number; blind: number };
/** A rules.ts row's seeker for a shooter of radius R (its acc in R/s²). */
export const seeker = (q: Seeker, R: number): Seeker => ({ boost: q.boost, acc: q.acc * R, turn: q.turn, cone: q.cone, burn: q.burn, blind: q.blind });
/** Where a missile's target is now (`r`: its radius), or undefined once it is gone. */
export type Seek = () => { x: number; y: number; vx: number; vy: number; r?: number } | undefined;
/**
 * In flight: `age` s, cruise `u` on top of its shooter's velocity at launch (`v0x`, `v0y`), `lock` (its seeker still has the
 * target), `hit` its effect on its own target (none: combat's missile hit), `look` how it is drawn.
 */
export type Missile = Bolt & {
  team: Team; k: number; blast: number; d0: number; target?: unknown; from?: unknown; own?: (b: Disc) => boolean; dead: boolean; kill: () => void; cls: 'missile';
  seek?: Seek; s?: Seeker; lock: boolean; age: number; u: number; v0x: number; v0y: number; hit?: (b: any, x: number, y: number) => void; look: 'missile' | 'rocket';
};
/** A launch from (x, y) moving at (vx, vy) at a target at (tx, ty) moving at (tvx, tvy), turned `fan` rad off the aim; `d0` is the range it leaves from, `from` its shooter. */
export type Launch = {
  team: Team; x: number; y: number; vx: number; vy: number; tx: number; ty: number; tvx: number; tvy: number; u: number; life: number; k: number; blast: number;
  fan?: number; target?: unknown; own?: (b: Disc) => boolean; from?: unknown; seek?: Seek; seeker?: Seeker; hit?: Missile['hit']; look?: Missile['look'];
};
/** The motor and the seeker for `dt` s: speed up toward cruise along the nose; locked, turn toward the lead point or lose the lock for good. */
export function steer(m: Missile, dt: number) {
  const s = m.s;
  m.age += dt;
  if (!s) return;
  const wx = m.vx - m.v0x, wy = m.vy - m.v0y, sp = Math.min(m.u, Math.hypot(wx, wy) + s.acc * dt), t = m.lock ? m.seek?.() : undefined;
  let h = Math.atan2(wy, wx);
  if (m.lock && t && m.age <= s.burn) {
    const px = t.x - m.x, py = t.y - m.y, off = wrap(bearing(px, py, t.vx - m.v0x, t.vy - m.v0y, m.u) - h);
    if (Math.abs(off) > s.cone || Math.hypot(px, py) - (t.r ?? 0) < s.blind * sp) m.lock = false;
    else h += clamp(off, -s.turn * dt, s.turn * dt);
  } else m.lock = false;
  [m.vx, m.vy] = [m.v0x + Math.cos(h) * sp, m.v0y + Math.sin(h) * sp];
}
export function createMissiles(cap = 12) {
  const live: Missile[] = [];
  return {
    live,
    /** Room for one more? */
    room: () => live.length < cap,
    /** One launch (Launch); undefined when the pool is full. With a `seek` and a `seeker` it is guided, else it flies straight at `u`. */
    launch(o: Launch) {
      if (live.length >= cap) return undefined;
      const a = bearing(o.tx - o.x, o.ty - o.y, o.tvx - o.vx, o.tvy - o.vy, o.u) + (o.fan ?? 0), v = (o.seeker?.boost ?? 1) * o.u;
      const m: Missile = {
        x: o.x, y: o.y, vx: o.vx + Math.cos(a) * v, vy: o.vy + Math.sin(a) * v, life: o.life, team: o.team, k: o.k, blast: o.blast, d0: Math.hypot(o.tx - o.x, o.ty - o.y), target: o.target, from: o.from,
        own: o.own, dead: false, kill: () => void (m.dead = true), cls: 'missile', seek: o.seek, s: o.seeker, lock: !!(o.seek && o.seeker), age: 0, u: o.u, v0x: o.vx, v0y: o.vy, hit: o.hit, look: o.look ?? 'missile',
      };
      live.push(m);
      return m;
    },
    /**
     * Moves every missile `dt` s (steer, then swept): an enemy hull it touches or the first body (≥ `minR` across, not its own)
     * bursts it (its own target gets its `hit`, else `hit` hears a body, at the impact point), killing enemy hulls within its
     * blast. Then `gone(m, x, y, burst)` for each one that ends: burst, shot down (`dead`) or burnt out.
     */
    step<B extends Disc>(dt: number, bodies: readonly B[], hulls: readonly Hull[], minR: number, hit: (m: Missile, b: B, x: number, y: number) => void, gone: (m: Missile, x: number, y: number, burst: boolean) => void) {
      for (let i = live.length - 1; i >= 0; i--) {
        const m = live[i], x0 = m.x, y0 = m.y;
        let at: { x: number; y: number } | undefined;
        if (!m.dead) {
          steer(m, dt);
          fly(m, dt);
          for (const f of hulls) if (!at && f.team !== m.team && swept(m.x - f.x, m.y - f.y, (m.vx - (f.vx ?? 0)) * dt, (m.vy - (f.vy ?? 0)) * dt, f.r)) at = { x: f.x, y: f.y };
          for (const b of bodies) {
            if (at || !b.m || b.r < minR || m.own?.(b) || !touch(m.x, m.y, m.vx, m.vy, b, b.r, dt)) continue;
            const q = b.motion, dx = x0 - q.x, dy = y0 - q.y, d = Math.hypot(dx, dy) || 1;
            at = { x: q.x + (dx / d) * b.r, y: q.y + (dy / d) * b.r };
            if (!m.hit) hit(m, b, at.x, at.y);
            else if (b === m.target) m.hit(b, at.x, at.y);
          }
        }
        if (at) for (const f of hulls) if (f.team !== m.team && Math.hypot(f.x - at.x, f.y - at.y) < m.blast + f.r) f.kill();
        if (!at && !m.dead && m.life > 0) continue;
        gone(m, at?.x ?? m.x, at?.y ?? m.y, !!at);
        live.splice(i, 1);
      }
    },
    clear: () => void (live.length = 0),
  };
}
export type Missiles = ReturnType<typeof createMissiles>;
