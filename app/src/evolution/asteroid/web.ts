// The field's large-scale maps as plain numbers (no Pixi), so test/asteroid/web.test.ts can run them in Node.
// Cosmic web: matter lies along filaments with wide empty voids between them. Both maps are read at (x, y) / S like the
// other region maps (field.ts REGION_GROW), so a void spans about as many screens at every size.
import { clamp, fbm, hashSeed, rng, smoothstep } from '../../core/rng.ts';

const WEB = 40000; // world units per noise unit at the start size: one cell ≈ 32 start screens
const WEB_CUT = [0.72, 0.87]; // ridge values: void below the first, full filament above; voids cover ~40% of the map
export const VOID_FLOOR = 0.002; // density left in a void (the plain floor elsewhere is FLOOR)
const WEB_RICH = 1.3; // filaments are this much richer, so most of the rock the voids lost is still out there
const FLOOR = 0.015;
const RICH = 2500; // world units per noise unit of the richness map

/** 1 on a filament of the cosmic web .. 0 deep in a void (a ridge noise). */
export const web = (x: number, y: number, seed: number) =>
  smoothstep(WEB_CUT[0], WEB_CUT[1], 1 - Math.abs(2 * fbm(x / WEB, y / WEB, 3, seed + 41) - 1));

// Kuiper belts ring every void (lore: a star formed there long ago and swept it clean): the web's falloff zone
// VOID_W..KUIPER_W with a void within reach (KUIPER_NEAR: shallow dips of the web between filaments don't count), sparse but
// never empty (KUIPER_FILL), icy and slow.
export const VOID_W = 0.1; // web below this is void
export const KUIPER_W = 0.7;
const KUIPER_FILL = 0.1;
const KUIPER_NEAR = [2500, 5000]; // world units (region scale): rings of 8 web samples looking for the void
/** How much Kuiper belt there is at a point with web w, 0..1 (soft edges, for mixing). */
export function kuiperAt(x: number, y: number, seed: number, w = web(x, y, seed)) {
  const ring = smoothstep(VOID_W, VOID_W + 0.05, w) * (1 - smoothstep(KUIPER_W, KUIPER_W + 0.15, w));
  if (!ring) return 0;
  let low = w;
  for (let k = 0; k < 16 && low >= VOID_W; k++) {
    const a = k * 0.785 + (k >> 3) * 0.39, d = KUIPER_NEAR[k >> 3];
    low = Math.min(low, web(x + Math.cos(a) * d, y + Math.sin(a) * d, seed));
  }
  return ring * (1 - smoothstep(VOID_W, VOID_W + 0.1, low));
}

/**
 * Rock density at a point, 0..1: large belts, smaller clumps and a mid-scale richness map (crowded patches next to thin
 * ones), × the web, with a thin floor on the Kuiper ring. `w` = web there (field.ts passes it with the start area forced full),
 * `kuiper` = kuiperAt there.
 */
export function density(x: number, y: number, seed: number, w = web(x, y, seed), kuiper = kuiperAt(x, y, seed, w)) {
  const belts = smoothstep(0.4, 0.66, fbm(x / 6000, y / 6000, 3, seed + 11));
  const clumps = smoothstep(0.32, 0.66, fbm(x / 900, y / 900, 2, seed + 12));
  const rich = 0.2 + 1.6 * smoothstep(0.3, 0.7, fbm(x / RICH, y / RICH, 2, seed + 14));
  const d = Math.min(1, VOID_FLOOR + (FLOOR - VOID_FLOOR) * w + 0.985 * belts * (0.3 + 0.7 * clumps) * rich * w * WEB_RICH);
  return Math.max(d, KUIPER_FILL * kuiper * (0.3 + 0.7 * clumps));
}

// The start area: always a plain field (HOME, calm), on a filament (START_WEB: web forced full, fading out).
export const HOME = 3000;
const START_WEB = [6000, 12000];
/** At offset (dx, dy) world units from the start: [calm 1..0 (plain belt there), web floor 1..0]. */
export const nearStart = (dx: number, dy: number) =>
  [Math.exp(-(dx * dx + dy * dy) / HOME ** 2), 1 - smoothstep(START_WEB[0], START_WEB[1], Math.hypot(dx, dy))];

// Biomes: one named kind of place everywhere. Material regions (metal, ice, gas) fade in over the rock belt on their own
// noise; rapids and meteor belts are long thin bands (ridges of their own noise) on filaments; Kuiper belts ring voids.
export type Biome = 'belt' | 'ice' | 'metal' | 'gas' | 'rapids' | 'meteors' | 'kuiper' | 'void';
export const KINDS = ['rock', 'metal', 'ice', 'gas'] as const;
const MIX = { // kind shares [rock, metal, ice, gas]
  belt: [0.78, 0.08, 0.11, 0.03], // rock-rich
  metal: [0.25, 0.65, 0.05, 0.05], // shattered old cores
  ice: [0.12, 0.03, 0.75, 0.1], // water-rich
  gas: [0.12, 0, 0.3, 0.58],
  kuiper: [0.12, 0.15, 0.67, 0.06], // icy, with old metal cores from the star that swept the void (user)
};
const REGION = 42000; // world units per noise unit of the material regions
const RAPIDS = 90000; // world units per noise unit of the rapids bands
const RAPIDS_CUT = [0.91, 0.93]; // ridge values: band edge .. core
const METEORS = 60000;
const METEORS_CUT = [0.91, 0.93];
const CLEAR = [0.01, 0.1]; // a second special place this strong fades the first out
const ridge = (x: number, y: number, scale: number, salt: number) => 1 - Math.abs(2 * fbm(x / scale, y / scale, 2, salt) - 1);

export interface Place {
  biome: Biome;
  kuiper: number; // 0..1 strengths (soft borders)
  rapids: number;
  meteors: number;
  region: 'metal' | 'ice' | 'gas'; // the strongest material region...
  a: number; // ...and how strong it is
}

/** The biome at a point read at region scale and its soft strengths. `w` = web there, `calm` (0..1) keeps a place plain belt. */
export function place(x: number, y: number, seed: number, w = web(x, y, seed), calm = 0): Place {
  const open = 1 - calm, fil = smoothstep(KUIPER_W, KUIPER_W + 0.2, w) * open; // the bands live on filaments only
  const shore = smoothstep(VOID_W, VOID_W + 0.3, w) * open; // material regions keep clear of voids
  let kuiper = kuiperAt(x, y, seed, w) * open;
  let rapids = smoothstep(RAPIDS_CUT[0], RAPIDS_CUT[1], ridge(x, y, RAPIDS, seed + 51)) * fil;
  let meteors = smoothstep(METEORS_CUT[0], METEORS_CUT[1], ridge(x, y, METEORS, seed + 52)) * fil;
  const pull = (salt: number, lo: number) => smoothstep(lo, lo + 0.1, fbm(x / REGION, y / REGION, 3, seed + salt)) * shore;
  const strength = { metal: pull(21, 0.6), ice: pull(22, 0.55), gas: pull(23, 0.6) };
  const regions = (Object.entries(strength) as [Place['region'], number][]).sort((p, q) => q[1] - p[1]);
  const region = regions[0][0];
  let a = regions[0][1];
  // Only one special place at a time: where two overlap, both fade into plain belt (CLEAR), so there is a gap between them.
  const s = [kuiper, rapids, meteors, a, regions[1][1]], top = s.indexOf(Math.max(...s));
  const keep = 1 - smoothstep(CLEAR[0], CLEAR[1], Math.max(...s.filter((_, i) => i !== top)));
  [kuiper, rapids, meteors, a] = s.slice(0, 4).map((v, i) => (i === top ? v * keep : 0));
  const biome: Biome = calm > 0.3 ? 'belt' : w < VOID_W ? 'void' : kuiper > 0.5 ? 'kuiper' : rapids > 0.5 ? 'rapids'
    : meteors > 0.5 ? 'meteors' : a > 0.5 ? region : 'belt';
  return { biome, kuiper, rapids, meteors, region, a };
}
export const biomeAt = (x: number, y: number, seed: number, w?: number, calm?: number) => place(x, y, seed, w, calm).biome;

/** Kind shares [rock, metal, ice, gas] at a place. */
export function kindMix(p: Place) {
  return MIX.belt.map((v, k) => {
    const m = v * (1 - p.a) + MIX[p.region][k] * p.a;
    return m * (1 - p.kuiper) + MIX.kuiper[k] * p.kuiper;
  });
}

/** Rapids flow at a point: a unit vector along the band (the noise's contour, so it runs on unbroken) × 0..1. */
export function rapidsFlow(x: number, y: number, seed: number, strength: number) {
  if (strength <= 0) return [0, 0];
  const f = (px: number, py: number) => fbm(px / RAPIDS, py / RAPIDS, 2, seed + 51), e = 300;
  const tx = -(f(x, y + e) - f(x, y - e)), ty = f(x + e, y) - f(x - e, y), k = Math.min(1, 1.5 * strength) / (Math.hypot(tx, ty) || 1);
  return [tx * k, ty * k];
}

// Mineral palettes (basalt, rust, carbon, pale, slate) and brightness on their own noise (field.ts tints rocks by them).
const PALETTES = [[1, 0.93, 0.84], [1, 0.8, 0.68], [0.74, 0.73, 0.76], [1, 0.98, 0.9], [0.84, 0.9, 1]];
const PAL_SCALE = 5000;
/** The mineral palette at a point read at region scale: an RGB factor. */
export function palette(x: number, y: number, seed: number) {
  const t = clamp((fbm(x / PAL_SCALE, y / PAL_SCALE, 2, seed + 31) - 0.25) / 0.5, 0, 0.999) * (PALETTES.length - 1);
  const i = Math.floor(t), f = smoothstep(0.3, 0.7, t - i), lum = 0.85 + 0.3 * fbm(x / 3000, y / 3000, 2, seed + 32);
  return PALETTES[i].map((v, c) => lum * (v + (PALETTES[i + 1][c] - v) * f));
}
/** 0xRRGGBB times an RGB factor, at `amount` strength. */
export const tintBy = (c: number, k: number[], amount: number) =>
  [16, 8, 0].reduce((out, sh, i) => out | (Math.round(clamp(((c >> sh) & 255) * (1 + (k[i] - 1) * amount), 0, 255)) << sh), 0);

// Moving clusters: the map is split into irregular groups (nearest of jittered points, GROUP region units apart); STILL of
// them stay put, the rest drift as one at GROUP_SPEED start units/s (field.ts scales it by √scale).
const GROUP = 1600;
const STILL = 0.5;
const GROUP_SPEED = [10, 25];
/** The shared drift of the group a point belongs to, start units/s ([0, 0] for a still group). */
export function groupDrift(x: number, y: number, seed: number) {
  const gx = Math.floor(x / GROUP), gy = Math.floor(y / GROUP);
  let best = Infinity, bi = 0, bj = 0;
  for (let i = gx - 1; i <= gx + 1; i++)
    for (let j = gy - 1; j <= gy + 1; j++) {
      const r = rng(hashSeed(i, j, seed + 61)), dx = (i + r()) * GROUP - x, dy = (j + r()) * GROUP - y, d2 = dx * dx + dy * dy;
      if (d2 < best) [best, bi, bj] = [d2, i, j];
    }
  const r = rng(hashSeed(bi, bj, seed + 62));
  if (r() < STILL) return [0, 0];
  const a = r() * Math.PI * 2, v = GROUP_SPEED[0] + r() * (GROUP_SPEED[1] - GROUP_SPEED[0]);
  return [Math.cos(a) * v, Math.sin(a) * v];
}
