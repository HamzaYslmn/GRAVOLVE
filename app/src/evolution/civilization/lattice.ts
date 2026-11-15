// The shield's hex lattice, plain numbers (no Pixi; view.ts draws it, test/civilization/lattice.test.ts checks it).
//   dome     seen from above: ring k of 6k cells at sphere angle φ = k·pitch, pitch = (π/2)/(n + 0.5); on screen at sin φ
//            of the shell radius, squashed radially by φ·cos φ / sin φ, brighter toward the limb (sin² φ). n by the shell's
//            size on screen (tier); under 12 px one rim ring of 10 cells (n = 0)
//   health   e = charge / full max (−0.15..1): a cell stands while its hold < share(e) (KEEP of them just above 0); the
//            next to go (the cracked band) draw dim and hotter; a hit re-deals the standing holds so the cells nearest it
//            go first (punch), and the mend closes the hole back toward it
//   colour   faction colour down to 60%, amber at 40%, red from 15% (energyTint)
//   shatter  at 0 every standing cell flies out as a shard over SHATTER_S; back above 0 the first cells ignite over FORM_S
import { clamp, rng } from '../../core/rng.ts';
import { SHIELD_FLOOR } from './rules.ts';

export const KEEP = 0.35; // share of the cells still standing just above 0
const CRACK = 0.35; // the cracked band's width at 0 (none at full)
export const SHATTER_S = 0.7;
export const FORM_S = 0.8;
export const AMBER = 0xffb46b, RED = 0xff4a3a;
const RIM = { phi: (70 * Math.PI) / 180, n: 10 };

/** A cell in shell radii: centre (x, y) in the unit disc, rot = its bearing, size across the ring, long = radial squash, w = limb weight. */
export type Cell = { x: number; y: number; rot: number; size: number; long: number; w: number };
export type Layout = { n: number; pitch: number; c: Cell[] };

const squash = (phi: number) => (phi < 1e-6 ? 1 : clamp((phi * Math.cos(phi)) / Math.sin(phi), 0.3, 1));
const cell = (phi: number, rot: number, size: number): Cell => ({ x: Math.sin(phi) * Math.cos(rot), y: Math.sin(phi) * Math.sin(rot), rot, size, long: squash(phi), w: 0.22 + 0.78 * Math.sin(phi) ** 2 });

const cache = new Map<number, Layout>();
/** The dome of 1 + 3n(n + 1) cells (n = 0: the 10-cell rim), cached per n. */
export function cells(n: number): Layout {
  let L = cache.get(n);
  if (L) return L;
  const c: Cell[] = [];
  if (n === 0) {
    const pitch = (2 * Math.PI * Math.sin(RIM.phi)) / RIM.n;
    for (let j = 0; j < RIM.n; j++) c.push(cell(RIM.phi, (2 * Math.PI * j) / RIM.n, pitch * 0.94));
    L = { n, pitch, c };
  } else {
    const pitch = Math.PI / 2 / (n + 0.5);
    c.push(cell(0, 0, pitch * 0.94));
    for (let k = 1; k <= n; k++) {
      const phi = k * pitch, m = 6 * k, off = k % 2 ? Math.PI / m : 0;
      for (let j = 0; j < m; j++) c.push(cell(phi, (2 * Math.PI * j) / m + off, ((pitch * Math.sin(phi)) / phi) * 0.94));
    }
    L = { n, pitch, c };
  }
  cache.set(n, L);
  return L;
}

const raw = (S: number) => (S < 12 ? 0 : clamp(Math.floor(S / 8), 2, 5));
/** Lattice tier for a shell `S` px across on screen (radius): 0 (rim) under 12, then 2–5; `prev` holds within ±10%. */
export function tier(S: number, prev = -1) {
  const n = raw(S);
  return n !== prev && prev >= 0 && (raw(S * 1.1) === prev || raw(S / 1.1) === prev) ? prev : n;
}

/** Each cell's hold: a seeded permutation of (i + 0.5)/N. */
export function holds(N: number, seed: number) {
  const h = Float32Array.from({ length: N }, (_, i) => (i + 0.5) / N), r = rng(seed);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [h[i], h[j]] = [h[j], h[i]];
  }
  return h;
}

/** Share of the cells standing at energy e: KEEP just above 0, all at full, none at or below 0. */
export const share = (e: number) => (e > 0 ? KEEP + (1 - KEEP) * Math.min(1, e) : 0);
/** A standing cell in the band that goes next (drawn cracked). */
export const cracked = (hold: number, e: number) => hold < share(e) && hold >= share(e) - CRACK * (1 - clamp(e, 0, 1));

const hash = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/**
 * A hit at bearing `a`: the holds of the cells standing at `sh` (share) are re-dealt so the nearest to the hit point on
 * the rim hold the highest (they break first; seeded jitter ±0.15 pitch). Missing cells keep theirs. Same input, same result.
 */
export function punch(hold: Float32Array, L: Layout, a: number, sh: number) {
  const hx = Math.cos(a), hy = Math.sin(a), idx: number[] = [], vals: number[] = [];
  for (let i = 0; i < hold.length; i++) if (hold[i] < sh) [idx.push(i), vals.push(hold[i])];
  const d = idx.map((i) => Math.hypot(L.c[i].x - hx, L.c[i].y - hy) + (hash(i, 1) - 0.5) * 0.3 * L.pitch);
  const order = idx.map((_, k) => k).sort((p, q) => d[p] - d[q]);
  vals.sort((p, q) => q - p);
  order.forEach((k, r) => (hold[idx[k]] = vals[r]));
}

const mix = (a: number, b: number, t: number) => {
  const m = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t) << s;
  return m(16) | m(8) | m(0);
};
/** The lattice's colour at energy e: `base` (the faction's) down to 60%, to AMBER at 40%, to RED at 15%, RED below. */
export function energyTint(base: number, e: number) {
  if (e >= 0.6) return base;
  if (e >= 0.4) return mix(base, AMBER, (0.6 - e) / 0.2);
  return mix(AMBER, RED, clamp((0.4 - e) / 0.25, 0, 1));
}
/** Hotter: `t` of the way to white. */
export const whiten = (c: number, t: number) => mix(c, 0xffffff, t);

/** Shard `i` at k (0..1 of SHATTER_S): out (world radii, ease-out), spin (rad), flip (radial squash, tumbling), alpha, tint (white → red over the first 20%). */
export function shard(i: number, k: number) {
  const h1 = hash(i, 2), h2 = hash(i, 3), h3 = hash(i, 4);
  return {
    out: (0.5 + 0.6 * h1) * (1 - (1 - k) ** 2),
    spin: (h2 < 0.5 ? -1 : 1) * (4 + 5 * hash(i, 5)) * k * SHATTER_S,
    flip: Math.max(0.15, Math.abs(Math.cos(k * (3 + 5 * h3) * Math.PI))),
    alpha: (1 - k) ** 1.5,
    tint: mix(0xffffff, RED, Math.min(1, k / 0.2)),
  };
}

/** Ghost cells while down: g = how far back from the floor (0 at SHIELD_FLOOR, 1 at 0); a cell shows while its hold < KEEP·g. */
export const ghost = (hold: number, e: number) => e <= 0 && hold < KEEP * clamp((e - SHIELD_FLOOR) / -SHIELD_FLOOR, 0, 1);
