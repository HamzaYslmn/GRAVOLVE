// Run: node test/asteroid/debris.test.ts. Debris (Body.jag): a heavy piece of a shattered body starts jagged and rounds
// over time (rules.ts relaxJag, mergeJag), drawn in steps with flat break faces (jagStage, breakFaces, faceFit).
import assert from 'node:assert/strict';
import { rng } from '../../src/core/rng.ts';
import { bakes, breakFaces, BURST_KEEP, BURST_PIECES, burstRing, COMP, pieceShares, SPREAD, faceFit, JAG_S, JAG_STEPS, jagStage, mergeJag, radiusOf, relaxJag, roundR, roundShape, shapeOf, surfaceSeed } from '../../src/evolution/asteroid/rules.ts';

const DT = 1 / 60;
/** Seconds until jag reaches 0 (Infinity past `max` s), and whether it stayed in [0, 1] and never rose. */
function relax(r: number, heat: number, max = 2000) {
  let jag = 1, t = 0, ok = true;
  while (jag > 0 && t < max) {
    const next = relaxJag(jag, r, COMP.stony, heat, DT);
    ok &&= next <= jag && next >= 0 && next <= 1;
    [jag, t] = [next, t + DT];
  }
  return { t: jag > 0 ? Infinity : t, ok, jag };
}

// Rounding: JAG_S at the round-off radius, faster bigger (capped 3×), never below half of it while cold; molten in ~5 s.
const R0 = roundR(COMP.stony), at = relax(R0, 0);
assert.ok(at.ok, 'jag is monotone and stays in [0, 1]');
assert.ok(Math.abs(at.t - JAG_S) <= 2 * DT, `round-off radius relaxes in ${JAG_S} s, got ${at.t}`);
const t2 = relax(2 * R0, 0).t, t1 = relax(R0, 0).t, tHalf = relax(0.5 * R0, 0).t, t3 = relax(3 * R0, 0).t, t6 = relax(6 * R0, 0).t;
assert.ok(t2 < t1 && t1 < tHalf, `bigger is faster: ${t2} < ${t1} < ${tHalf}`);
assert.ok(Math.abs(t3 - t6) <= 2 * DT, 'the speed-up stops at 3×');
const small = relax(30, 0, 1000);
assert.equal(small.jag, 1, 'a small cold piece never rounds by itself');
assert.ok(relax(30, 5, 10).t <= 5 + 2 * DT, 'a molten piece rounds in 5 s');

// Merges round by the meal's share.
assert.equal(mergeJag(0.7, 0), 0.7);
assert.equal(mergeJag(1, 0.5), 0.5);
let prev = 1;
for (const s of [0.01, 0.1, 0.3, 0.6, 1]) {
  const j = mergeJag(0.8, s);
  assert.ok(j < 0.8 && j <= prev, `merge share ${s} rounds`);
  prev = j;
}

// Drawn steps: k / JAG_STEPS, ceil (any jag left shows a step), monotone.
assert.equal(JAG_STEPS, 4);
assert.equal(jagStage(0), 0);
assert.equal(jagStage(undefined), 0);
assert.equal(jagStage(1e-6), 0.25);
assert.equal(jagStage(1), 1);
for (let j = 0, last = 0; j <= 1; j += 0.01) {
  const s = jagStage(j);
  assert.ok(s >= last && Number.isInteger(s * JAG_STEPS), `stage at ${j}`);
  last = s;
}

// Seeds: every n in one cycle gives a distinct seed in [1, 9973].
const seen = new Set<number>();
for (let n = 0; n < 9973; n++) {
  const s = surfaceSeed(n);
  assert.ok(s >= 1 && s <= 9973 && Number.isInteger(s));
  seen.add(s);
}
assert.equal(seen.size, 9973, 'surface seeds are distinct');

// Break faces: 4–6 cuts, distinct outlines for consecutive pieces, depth from the jag; none when round.
const outlines = new Set<string>();
for (let n = 0; n < 8; n++) {
  const f = breakFaces(surfaceSeed(n), 1);
  assert.ok(f.length >= 4 && f.length <= 6, `${f.length} faces`);
  for (const [x, y, d] of f) {
    assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-9, 'unit normals');
    assert.ok(d >= 0.45 && d <= 0.85, `face distance ${d}`);
  }
  outlines.add(JSON.stringify(f));
  // Face fit: a cut outline is scaled up (to the disc's area), less as the piece rounds.
  let fit = faceFit(f);
  assert.ok(fit > 1 && fit < 1.6, `face fit ${fit}`);
  for (const j of [0.75, 0.5, 0.25, 0]) {
    const next = faceFit(breakFaces(surfaceSeed(n), j));
    assert.ok(next <= fit, `fit falls as the piece rounds (${j})`);
    fit = next;
  }
  assert.equal(fit, 1);
}
assert.equal(outlines.size, 8, 'consecutive pieces get different outlines');
assert.deepEqual(breakFaces(123, 0), []);
assert.equal(faceFit([]), 1);

// Drawn roundness: the jag takes it away; at 0 it is the old roundShape (existing spheres bake as before).
for (const r of [20, 40, 75, 150]) {
  assert.equal(shapeOf(r, COMP.stony, 0.1, 0), roundShape(r, COMP.stony, 0.1));
  assert.equal(shapeOf(r, COMP.stony, 0, 1), 0);
}

// Baking: a debris piece bakes from ROUND_M at any radius; the jag never overrides `rough` unless molten.
const r1200 = radiusOf(1200, COMP.metallic);
assert.ok(r1200 < 0.5 * roundR(COMP.metallic), 'the 1200 metallic piece is under half its round-off radius');
assert.ok(bakes(1200, r1200, COMP.metallic, 0, 0, 0), 'a debris piece bakes (jag 0)');
assert.ok(bakes(1200, r1200, COMP.metallic, 0, 0, 1), 'a debris piece bakes (jag 1)');
assert.ok(!bakes(1200, r1200, COMP.metallic), 'without a jag it stays a rock');
assert.ok(!bakes(900, radiusOf(900, COMP.metallic), COMP.metallic, 0, 0, 1), 'nothing under ROUND_M bakes');
assert.ok(!bakes(1200, r1200, COMP.metallic, 0, 1, 1), 'rough wins while solid');
assert.ok(bakes(1200, r1200, COMP.metallic, 0.3, 1, 1), 'molten bakes anything');

// Burst placement (body.ts burst, rules.ts burstRing): no two pieces of a shattered body touch at birth (siblings that
// overlap merge at once) nor in their first second flying out along their rays.
let gapMin = Infinity;
{
  const rnd = rng(11);
  for (const comp of [COMP.stony, COMP.metallic]) for (const m of [50, 1e3, 1e5, 1e7, 1e9]) for (let n = 1; n <= BURST_PIECES; n++) {
    const w = pieceShares(n, SPREAD), r = radiusOf(m, comp), rr = w.map((s) => radiusOf(m * BURST_KEEP * s, comp));
    for (let draw = 0; draw < 500; draw++) {
      const ring = burstRing(w, r, rnd), v = w.map(() => 60 * (0.6 + 0.8 * rnd()));
      for (const t of [0, 1]) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const [a, b] = [ring.d + v[i] * t, ring.d + v[j] * t]; // 60 steps of 1/60 s on straight rays = 1 s
        const d = Math.hypot(a * Math.cos(ring.t[i]) - b * Math.cos(ring.t[j]), a * Math.sin(ring.t[i]) - b * Math.sin(ring.t[j]));
        assert.ok(d >= rr[i] + rr[j], `n ${n}, m ${m}, pieces ${i}/${j} overlap at ${t} s: ${d} < ${rr[i] + rr[j]}`);
        if (!t) gapMin = Math.min(gapMin, d / (rr[i] + rr[j]));
      }
    }
  }
}

console.log(`debris ok: burst pieces clear at birth (min gap ${gapMin.toFixed(3)} × radii sum); relax ${t1.toFixed(1)} s at roundR, ${t2.toFixed(1)} s at 2×, ${t3.toFixed(1)} s at 3×, ${tHalf.toFixed(1)} s at ½; face fit at jag 1 ${[0, 1, 2, 3].map((n) => faceFit(breakFaces(surfaceSeed(n), 1)).toFixed(2)).join('/')}`);
