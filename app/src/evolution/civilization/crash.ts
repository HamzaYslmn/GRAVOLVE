import { clamp } from '../../core/rng.ts';
import { keepOut, SPECK, type Craft } from './flight.ts';
import type { Disc } from './nav.ts';

// Collisions: `bump` finds the first body a ship touched over the frame (swept, so nothing tunnels at any frame rate),
// with the contact normal and closing speed; `crash` grades it. Pirates and rivals' ships away die on any touch.
/** Did a body that moved (dx, dy) relative to a ship this frame, ending at (px, py) from it, pass within `r` of it? */
export function swept(px: number, py: number, dx: number, dy: number, r: number) {
  const ax = px - dx, ay = py - dy, l2 = dx * dx + dy * dy, t = l2 > 0 ? clamp(-(ax * dx + ay * dy) / l2, 0, 1) : 1;
  const qx = ax + dx * t, qy = ay + dy * t;
  return qx * qx + qy * qy < r * r;
}
/** Did body `b` pass within `rr` of a point now at (x, y) moving at (vx, vy) over the last `dt` s? (a box test, then `swept`) */
export function touch(x: number, y: number, vx: number, vy: number, b: Disc, rr: number, dt: number) {
  const dx = b.motion.x - x, dy = b.motion.y - y, mx = (b.motion.vx - vx) * dt, my = (b.motion.vy - vy) * dt;
  return Math.abs(dx) < rr + Math.abs(mx) && Math.abs(dy) < rr + Math.abs(my) && swept(dx, dy, mx, my, rr);
}

/** A bump: the body, the normal off it toward the ship, the closing speed, the contact point; `miss`: only a near miss. */
type Bump<B extends Disc = Disc> = { b: B; nx: number; ny: number; vn: number; x: number; y: number; miss?: boolean };
const HULL = 0.5; // × a ship's radius: its hull touches a body this far off the body's surface
const MISS = 2.5; // ship radii off a surface: a pass faster than `missV` this close is a near miss
const PEBBLE = 2; // ship radii: smaller bodies only graze a ship (and break)
/** A pebble to a ship of radius `sr`: under PEBBLE ship radii, not a moon or a held world. */
export const pebble = (b: Disc, sr: number) => b.r < PEBBLE * sr && !b.moon && !b.held;
const WRECK_V = 1.5; // R/s closing: a body the ship's size or bigger wrecks it from here (slower: a graze)
const HURT_S = 6; // s a grazed ship flies hurt (HURT_ACC); another graze meanwhile wrecks it (one with hull points loses one a graze)
const KNOCK = [0.6, 0.3, 0.8, 0.9]; // a graze: out to the surface + this many ship radii; normal speed reflected × this, tangential × this; the nose kicked this many rad away

/**
 * The first body (bar crumbs and `skip`) a ship of radius `sr` now at (x, y) moving at (vx, vy) touched over the last
 * `dt` s, bodies `ahead` s on from where they are (0: they moved already). Else a near miss faster than `missV`, if any.
 */
export function bump<B extends Disc>(x: number, y: number, vx: number, vy: number, bodies: readonly B[], sr: number, dt: number, skip: (b: B) => boolean, missV = Infinity, ahead = 0): Bump<B> | undefined {
  let hit: Bump<B> | undefined, first = Infinity, miss: Bump<B> | undefined;
  for (const b of bodies) {
    if (!b.m || b.r < SPECK * sr || skip(b)) continue;
    const m = b.motion, rr = b.r + HULL * sr, px = m.x + m.vx * ahead - x, py = m.y + m.vy * ahead - y, mx = (m.vx - vx) * dt, my = (m.vy - vy) * dt;
    if (Math.abs(px) < rr + Math.abs(mx) && Math.abs(py) < rr + Math.abs(my) && swept(px, py, mx, my, rr)) {
      const ax = px - mx, ay = py - my, A = mx * mx + my * my, B = ax * mx + ay * my, C = ax * ax + ay * ay - rr * rr;
      const tau = C <= 0 || A <= 0 ? 0 : clamp((-B - Math.sqrt(Math.max(0, B * B - A * C))) / A, 0, 1); // first contact, share of the frame
      if (tau >= first) continue;
      first = tau;
      const cx = ax + mx * tau, cy = ay + my * tau, cl = Math.hypot(cx, cy), u = Math.hypot(mx, my); // the body off the ship at contact
      const [nx, ny] = cl > 1e-9 ? [-cx / cl, -cy / cl] : u > 1e-9 ? [mx / u, my / u] : [1, 0];
      hit = { b, nx, ny, vn: -((vx - m.vx) * nx + (vy - m.vy) * ny), x: x + px + nx * b.r, y: y + py + ny * b.r };
    } else if (!hit && !miss && b.r >= sr && Math.hypot(mx, my) > missV * dt && swept(px, py, mx, my, rr + MISS * sr)) {
      const d = Math.hypot(px, py) || 1e-9;
      miss = { b, nx: -px / d, ny: -py / d, vn: 0, x, y, miss: true };
    }
  }
  return hit ?? miss;
}

/** Grades a bump of craft c (radius `sr`; `R` the speed unit): 0 nothing, 1 a graze (knocked off the body and hurt; a pebble, under PEBBLE ship radii, breaks: the caller drops it), 2 a wreck. */
export function crash(c: Craft, hit: Bump, sr: number, R: number): 0 | 1 | 2 {
  const b = hit.b;
  if (hit.miss || b.r < SPECK * sr) return 0;
  const small = pebble(b, sr); // always a graze, and it breaks
  if (!small && (hit.vn >= WRECK_V * R || b.fast || scrape(c) === 2)) return 2;
  if (small) c.hurt = HURT_S;
  const m = b.motion, ux = c.vx - m.vx, uy = c.vy - m.vy, un = ux * hit.nx + uy * hit.ny, tx = ux - un * hit.nx, ty = uy - un * hit.ny, out = un < 0 ? -KNOCK[1] * un : un;
  [c.vx, c.vy] = [m.vx + hit.nx * out + KNOCK[2] * tx, m.vy + hit.ny * out + KNOCK[2] * ty];
  [c.x, c.y] = [hit.x + hit.nx * KNOCK[0] * sr, hit.y + hit.ny * KNOCK[0] * sr];
  c.heading += (Math.cos(c.heading) * hit.ny - Math.sin(c.heading) * hit.nx >= 0 ? 1 : -1) * KNOCK[3];
  return 1;
}
/** A graze's toll on craft c: a hull point (the last: a wreck), else HURT_S of reduced thrust (already hurt: a wreck). 1: it flies on, hurt. */
export function scrape(c: Craft): 1 | 2 {
  if (c.hull !== undefined ? --c.hull <= 0 : (c.hurt ?? 0) > 0) return 2;
  c.hurt = HURT_S;
  return 1;
}
export const SLAM = [0.9, 2]; // R/s onto its own world (keepOut's `slam`): a landing from here grazes, from here wrecks
/**
 * A home ship's contacts (craft s relative to its world at pm, radius R): its bump (bar `skip`), else its world's surface
 * (`slam`, then cleared). A graze writes the knock back to s. `a`: the craft in world units after it; `hard`: what it hit.
 */
export function homeContact<B extends Disc>(s: Craft, pm: { x: number; y: number; vx: number; vy: number }, bodies: readonly B[], sr: number, R: number, dt: number, skip: (b: B) => boolean) {
  const a: Craft = { x: pm.x + s.x, y: pm.y + s.y, vx: pm.vx + s.vx, vy: pm.vy + s.vy, heading: s.heading, burn: 0, hurt: s.hurt, hull: s.hull, spark: s.spark };
  const hit = bump(a.x, a.y, a.vx, a.vy, bodies, sr, dt, skip, MISS_V * R), land = s.slam ?? 0, hard = hit && !hit.miss ? hit : undefined;
  const grade = hard ? crash(a, hard, sr, R) : land >= SLAM[1] * R ? 2 : land >= SLAM[0] * R ? scrape(a) : 0;
  s.slam = 0;
  if (grade === 1) {
    [s.x, s.y, s.vx, s.vy, s.heading, s.hurt, s.hull] = [a.x - pm.x, a.y - pm.y, a.vx - pm.vx, a.vy - pm.vy, a.heading, a.hurt, a.hull];
    keepOut(s, R); // a knock off a body pushed the ship into its own world: no landing recorded
    s.slam = 0;
  }
  return { grade, hit, hard, a };
}

export const MISS_V = 2; // R/s: a near miss this fast sparks...
const SPARK_S = 0.5; // ...at most once this often a ship
const SMOLDER_S = 0.15; // s between a hurt ship's embers
/** What the sparks draw with (render/fx.ts Fx). */
type Embers = { ember(x: number, y: number, vx: number, vy: number, size: number, tint: number, life: number): void };
/** A near miss (a bump's `miss`, craft c in world units): 3 embers streaking back, at most once a SPARK_S (its timer runs on `dt`), if `seen`. True when it sparked. */
export function sparks(fx: Embers, c: Craft, hit: Bump | undefined, dt: number, size: number, tint: number, seen: (x: number, y: number) => boolean) {
  c.spark = Math.max(0, (c.spark ?? 0) - dt);
  if (!hit?.miss || c.spark > 0 || !seen(c.x, c.y)) return false;
  c.spark = SPARK_S;
  const m = hit.b.motion, ux = c.vx - m.vx, uy = c.vy - m.vy;
  for (let i = 0; i < 3; i++) fx.ember(c.x, c.y, -ux * (0.3 + 0.15 * i) - uy * (i - 1) * 0.12, -uy * (0.3 + 0.15 * i) + ux * (i - 1) * 0.12, size, tint, 0.35);
  return true;
}
/** A hurt craft (world units) trails an ember about every SMOLDER_S, if `seen`. */
export function smolder(fx: Embers, c: Craft, dt: number, size: number, tint: number, seen: (x: number, y: number) => boolean) {
  if ((c.hurt ?? 0) > 0 && Math.random() < dt / SMOLDER_S && seen(c.x, c.y)) fx.ember(c.x, c.y, c.vx * 0.6, c.vy * 0.6, size, tint, 0.5);
}

/** Wrecks and grazes so far by faction (a dev counter: window.__g().combat.bumps); `miss`: near misses that sparked. */
export const bumps = { you: { wreck: 0, graze: 0, miss: 0 }, rival: { wreck: 0, graze: 0, miss: 0 }, pirate: { wreck: 0, graze: 0, miss: 0 }, colony: { wreck: 0, graze: 0, miss: 0 } };
