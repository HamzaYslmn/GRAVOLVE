// node test/civilization/lattice.test.ts: the shield's hex lattice (lattice.ts). Layouts have 1 + 3n(n + 1) cells inside
// the unit disc (the rim 10), squash in [0.3, 1], limb weight rising outward; tiers by size on screen hold within ±10%;
// holds are a seeded permutation; the standing counts match the plan's table; a hit breaks the cells nearest it first and
// the mend brings back the same set; the colour ramp runs faction → amber → red; shards fly out and fade. Prints the cost
// of one frame's lattice loop.
import assert from 'node:assert/strict';
import { AMBER, cells, cracked, energyTint, ghost, holds, KEEP, punch, RED, share, shard, tier, type Layout } from '../../src/evolution/civilization/lattice.ts';

const YOU = 0x7fe8ff, VIOLET = 0xb48cff;
const standing = (h: Float32Array, e: number) => h.reduce((a, x) => a + (x < share(e) ? 1 : 0), 0);
const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

// Layouts.
for (const n of [2, 3, 4, 5]) {
  const L = cells(n);
  assert.equal(L.c.length, 1 + 3 * n * (n + 1), `n ${n}`);
  assert.ok(L === cells(n), 'cached');
  let lastW = -1;
  for (let k = 0, i = 0; k <= n; k++) {
    const ring = L.c.slice(i, (i += k ? 6 * k : 1));
    for (const c of ring) {
      assert.ok(Math.hypot(c.x, c.y) <= 1 + 1e-9 && c.long >= 0.3 && c.long <= 1 && c.size > 0, `cell in ring ${k} of n ${n}`);
      assert.ok(c.w > lastW, `limb weight rises with the ring (n ${n}, ring ${k})`);
    }
    lastW = ring[0].w;
  }
}
assert.equal(cells(0).c.length, 10, 'the rim');
assert.ok(cells(0).c.every((c) => Math.abs(Math.hypot(c.x, c.y) - Math.sin((70 * Math.PI) / 180)) < 1e-9));

// Tiers: rim under 12 px, then floor(S/8) in 2..5; no change within ±10% of a boundary.
assert.deepEqual([5, 11.9, 12, 20, 24, 31, 32, 39, 40, 200].map((S) => tier(S)), [0, 0, 2, 2, 3, 3, 4, 4, 5, 5]);
assert.equal(tier(11, 2), 2, 'rim boundary: 2 holds just below 12');
assert.equal(tier(13, 0), 0, '...and the rim just above');
assert.equal(tier(22, 3), 3);
assert.equal(tier(26, 2), 2);
assert.equal(tier(20, 3), 2, 'past 10%: changes');
assert.equal(tier(45, 4), 5);

// Holds: a permutation of (i + 0.5)/N, the same for the same seed.
{
  const a = holds(37, 5), b = holds(37, 5), c = holds(37, 6);
  assert.deepEqual([...a], [...b]);
  assert.notDeepEqual([...a], [...c]);
  assert.deepEqual([...a].sort((p, q) => p - q), Array.from({ length: 37 }, (_, i) => Math.fround((i + 0.5) / 37)));
}

// Share and the standing counts: 19 / 37 / rim 10 at 100%, 60%, 25%, just above 0.
assert.equal(share(1), 1);
assert.equal(share(0), 0);
assert.equal(share(-0.15), 0);
assert.ok(Math.abs(share(1e-9) - KEEP) < 1e-6);
for (let e = 0.01; e < 1; e += 0.01) assert.ok(share(e + 0.01) > share(e), 'share monotone');
const table: [number, number[]][] = [[19, [19, 14, 10, 7]], [37, [37, 27, 19, 13]], [10, [10, 7, 5, 4]]];
for (const [N, want] of table) {
  const h = holds(N, 1);
  assert.deepEqual([1, 0.6, 0.25, 1e-3].map((e) => standing(h, e)), want, `standing, N ${N}`);
}
{
  const h = holds(19, 1), crack = (e: number) => [...h].filter((x) => cracked(x, e)).length;
  assert.deepEqual([crack(1), crack(0.6), crack(0.25), crack(1e-3)], [0, 3, 5, 7], 'cracked of 19 at 100/60/25/0+ %');
}
// Ghosts while down: none at the floor, KEEP of them at 0.
{
  const h = holds(37, 2), g = (e: number) => [...h].filter((x) => ghost(x, e)).length;
  assert.deepEqual([g(-0.15), g(-0.075), g(0)], [0, 6, 13]);
  assert.equal(g(0.5), 0, 'no ghosts while up');
}

// Punch: the cells lost are the nearest to the hit (within the jitter); missing stay missing; the mend restores the set.
{
  const L: Layout = cells(3), N = L.c.length, a = 0.7, hx = Math.cos(a), hy = Math.sin(a);
  const h = holds(N, 9), e0 = 0.9, e1 = 0.6;
  const up0 = new Set(L.c.map((_, i) => i).filter((i) => h[i] < share(e0)));
  punch(h, L, a, share(e0));
  assert.deepEqual([...h].sort(), [...holds(N, 9)].sort(), 'still a permutation');
  const lost = [...up0].filter((i) => h[i] >= share(e1)), kept = [...up0].filter((i) => h[i] < share(e1));
  const d = (i: number) => Math.hypot(L.c[i].x - hx, L.c[i].y - hy), slack = 0.3 * L.pitch;
  assert.ok(lost.length > 0 && Math.max(...lost.map(d)) <= Math.min(...kept.map(d)) + slack, 'the nearest go first');
  for (let i = 0; i < N; i++) if (!up0.has(i)) assert.ok(h[i] >= share(e0), 'missing stay missing');
  const up = (e: number) => L.c.map((_, i) => i).filter((i) => h[i] < share(e));
  assert.deepEqual(up(e0), [...up0], 'mend to the old charge: the same cells');
  const before = [...h];
  punch(h, L, a, share(e1));
  punch(h, L, a, share(e1));
  const again = [...h];
  punch(h, L, a, share(e1));
  assert.deepEqual([...h], again, 'no change in charge, no change');
  assert.ok(before.length === N);
}

// Colour: faction at ≥ 60%, AMBER at 40%, RED from 15% down; red rises and blue falls as it drains.
for (const base of [YOU, VIOLET]) {
  assert.equal(energyTint(base, 1), base);
  assert.equal(energyTint(base, 0.6), base);
  assert.equal(energyTint(base, 0.4), AMBER);
  assert.equal(energyTint(base, 0.15), RED);
  assert.equal(energyTint(base, 0), RED);
  assert.equal(energyTint(base, -0.15), RED);
  let [r0, , b0] = rgb(energyTint(base, 1));
  for (let e = 1; e >= -0.15; e -= 0.01) {
    const [r, , b] = rgb(energyTint(base, e));
    assert.ok(r >= r0 && b <= b0, `ramp at ${e.toFixed(2)}`);
    [r0, b0] = [r, b];
  }
}

// Shards: start at the cell, fly out (monotone, ≤ 1.1 R), fade to 0, tumble no thinner than 0.15.
for (let i = 0; i < 91; i++) {
  assert.equal(shard(i, 0).out, 0);
  assert.equal(shard(i, 1).alpha, 0);
  let last = -1;
  for (let k = 0; k <= 1; k += 0.05) {
    const s = shard(i, k);
    assert.ok(s.out >= last && s.out <= 1.1 && s.flip >= 0.15 && s.flip <= 1);
    last = s.out;
  }
}

// Cost: the per-frame work of view.ts shieldLook's cell loop (share, cracked, ghost, ramp, ease) on the finest layout.
{
  const L = cells(5), N = L.c.length, h = holds(N, 3), vis = new Float32Array(N);
  let sink = 0;
  const t0 = performance.now();
  for (let f = 0; f < 1000; f++) {
    const e = 1 - (f % 200) / 150, S = share(e), tint = energyTint(YOU, e), hot = energyTint(YOU, e - 0.25);
    for (let i = 0; i < N; i++) {
      const up = h[i] < S, goal = up ? L.c[i].w * (cracked(h[i], e) ? 0.5 : 1) : ghost(h[i], e) ? 0.16 : 0;
      vis[i] += (goal - vis[i]) * 0.13;
      sink += up ? tint & 1 : hot & 1;
    }
  }
  const ms = (performance.now() - t0) / 1000;
  console.log(`cost: lattice ${N} cells, ${(ms * 1000).toFixed(1)} µs a frame (1,000 frames, Node; no puts)${sink < 0 ? '!' : ''}`);
}
console.log('lattice: ok');
