// Shared helpers for every test: the 16807 LCG some checks draw from. Node only (excluded from tsc).

/** A seeded uniform draw in (0, 1): the Park–Miller LCG (seed × 16807 mod 2³¹ − 1). */
export const lcg = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
