/** Seeded PRNG (mulberry32): same seed, same sequence. Returns floats in [0, 1). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes integer coordinates and a seed into one seed (e.g. per chunk). */
export const hashSeed = (x: number, y: number, seed: number) =>
  (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(seed, 83492791)) >>> 0;

/** Well-mixed hash of a lattice point to [0, 1) (murmur3 finalizer over hashSeed). */
function hash01(x: number, y: number, seed: number) {
  let h = hashSeed(x, y, seed);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [0, 1]. */
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash01(ix, iy, seed), b = hash01(ix + 1, iy, seed);
  const c = hash01(ix, iy + 1, seed), d = hash01(ix + 1, iy + 1, seed);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

/** Normalised fractal noise (median ~0.5, most values within 0.3..0.7). */
export function fbm(x: number, y: number, octaves: number, seed: number) {
  let s = 0, a = 0.5, n = 0;
  for (let k = 0; k < octaves; k++) {
    s += a * noise(x, y, seed + k);
    n += a;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 17.1;
    a *= 0.5;
  }
  return s / n;
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Uniform in [lo, hi). */
export const between = ([lo, hi]: readonly number[], rnd: () => number = Math.random) => lo + rnd() * (hi - lo);
/** Log-uniform in [lo, hi): every doubling equally likely. */
export const logBetween = ([lo, hi]: readonly number[], rnd: () => number) => lo * (hi / lo) ** rnd();
/** Time to the next event of a Poisson process (random arrivals, `mean` s apart on average). */
export const poissonGap = (mean: number, rnd: () => number) => -mean * Math.log(1 - rnd());
