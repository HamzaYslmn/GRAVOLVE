// Run: node test/asteroid/body.test.ts. Rock pairs through the real resolve (body.ts) with the field's options (field.ts
// touch): two rocks alone, plain mutual gravity, tickBody, at 30/60/144 Hz. A skimming rock must rub to a stop (friction,
// relief) and merge in seconds, not on frame one and not never; heat comes from the energy the contact lost.
import assert from 'node:assert/strict';
import { tsResolve } from '../helpers.ts';

tsResolve();
const { Texture } = await import('pixi.js');
const { phys, resolve, rockBody, sweep, tickBody } = await import('../../src/evolution/asteroid/body.ts');
const { COMP, G_WORLD, rank, radiusOf, V_STICK } = await import('../../src/evolution/asteroid/rules.ts');
type Body = import('../../src/evolution/asteroid/body.ts').Body;
type Hit = import('../../src/evolution/asteroid/body.ts').Hit;
type Comp = import('../../src/evolution/asteroid/rules.ts').Comp;

const rock = (m: number, comp: Comp, x: number, y: number) => {
  const b = rockBody({ texture: Texture.EMPTY, comp }, radiusOf(m, comp), x, y);
  [b.m, b.spin] = [m, 0];
  return b;
};
const escape = (a: Body, b: Body) => Math.sqrt((2 * G_WORLD * (a.m + b.m)) / (a.r + b.r)) / (2 * a.r); // field.ts escape

/** B (stony) at rest, S (icy) touching it, moving along the tangent at k × the mutual escape speed (plus `inward` of it). */
function skim(mB: number, mS: number, k: number, hz: number, seconds = 30, inward = 0, cB: Comp = COMP.stony, cS: Comp = COMP.icy) {
  const dt = 1 / hz, B = rock(mB, cB, 0, 0), R = B.r + radiusOf(mS, cS), S = rock(mS, cS, R * 0.999, 0);
  const e = Math.sqrt((2 * G_WORLD * (mB + mS)) / R);
  [S.motion.vx, S.motion.vy] = [-inward * e, k * e];
  const hits: Hit[] = [];
  const ev = { hit: (h: Hit) => void hits.push(h), debris: () => {} };
  let t = 0, frames = 0, run = 0, longest = 0;
  for (; t < seconds && B.m && S.m; t += dt) {
    const dx = S.motion.x - B.motion.x, dy = S.motion.y - B.motion.y, d = Math.max(Math.hypot(dx, dy), B.r + S.r), f = (G_WORLD * dt) / d ** 3;
    [S.motion.vx, S.motion.vy, B.motion.vx, B.motion.vy] = [S.motion.vx - dx * f * B.m, S.motion.vy - dy * f * B.m, B.motion.vx + dx * f * S.m, B.motion.vy + dy * f * S.m];
    tickBody(B, dt, false);
    tickBody(S, dt, false);
    const touching = Math.hypot(S.motion.x - B.motion.x, S.motion.y - B.motion.y) < B.r + S.r;
    if (touching) {
      frames++;
      const ka = rank(phys(B)), kb = rank(phys(S)), [p, q] = ka >= kb ? [B, S] : [S, B], es = escape(p, q);
      resolve(p, q, ev, { stick: Math.min(V_STICK, es) / 2, graze: 1, lead: true, rub: dt });
    }
    run = touching ? run + dt : 0;
    longest = Math.max(longest, run);
  }
  const live = B.m ? B : S;
  return { end: B.m && S.m ? Infinity : t, frames, longest, hits, heat: live.heat, merged: !B.m || !S.m };
}

const PAIRS = [[5000, 100], [3000, 300], [3000, 30], [1000, 1000]] as const;
const RATES = [30, 60, 144];
// Sub-orbital skims (0.55, 0.65 of escape): the contact presses, friction slows it, the pair merges in seconds at every rate.
for (const [mB, mS] of PAIRS) for (const k of [0.55, 0.65]) {
  const runs = RATES.map((hz) => skim(mB, mS, k, hz));
  for (const [i, r] of runs.entries()) {
    assert.ok(r.merged && r.end < 5, `${mB}/${mS} at ${k} e, ${RATES[i]} Hz: merged in ${r.end.toFixed(2)} s`);
    assert.ok(r.frames > 3, `${mB}/${mS} at ${k} e, ${RATES[i]} Hz: a rub, not a merge on touch (${r.frames} contact frames)`);
    for (const h of r.hits) if (h.kind === 'graze' || h.kind === 'bounce') assert.ok((h.heatB ?? 0) <= 0.05 && h.heat <= 0.05, `a rub frame heats a little: ${h.heat}, ${h.heatB}`);
  }
  const ends = runs.map((r) => r.end), heats = runs.map((r) => r.heat);
  assert.ok(Math.max(...ends) <= 1.3 * Math.min(...ends) + 0.05, `${mB}/${mS} at ${k} e: merge time by rate ${ends.map((v) => v.toFixed(2))}`);
  assert.ok(Math.max(...heats) - Math.min(...heats) <= 0.2 * Math.max(...heats) + 0.005, `${mB}/${mS} at ${k} e: heat by rate ${heats.map((v) => v.toFixed(3))}`);
  console.log(`skim ${mB}/${mS} at ${k} e: merged in ${ends.map((v) => v.toFixed(2)).join(' / ')} s (30/60/144 Hz), heat ${heats.map((v) => v.toFixed(3)).join(' / ')}`);
}
// Faster skims (about orbital to escape): no contact lasts long; the rock either merges or lifts off onto an orbit.
for (const [mB, mS] of PAIRS) for (const k of [0.75, 0.85, 0.95]) {
  const runs = RATES.map((hz) => skim(mB, mS, k, hz, 20));
  for (const [i, r] of runs.entries()) assert.ok(r.longest <= 2.5, `${mB}/${mS} at ${k} e, ${RATES[i]} Hz: longest contact ${r.longest.toFixed(2)} s`);
  console.log(`skim ${mB}/${mS} at ${k} e: longest contact ${runs.map((r) => r.longest.toFixed(2)).join(' / ')} s, ${runs.map((r) => (r.merged ? `merged ${r.end.toFixed(1)} s` : 'orbiting')).join(' / ')}`);
}
// The survivor of a rub is warmer than before: an equal pair merges hot, the meal's own heat mixed in.
const eq = skim(1000, 1000, 0.65, 60, 30, 0, COMP.stony, COMP.stony);
assert.ok(eq.merged && eq.heat > 0.5, `an equal pair merges hot: ${eq.heat}`);
// Near-equal masses: the tougher body (metal) survives, though a little lighter.
{
  const metal = rock(960, COMP.metallic, 0, 0), stone = rock(1000, COMP.stony, metal.r + radiusOf(1000, COMP.stony) * 0.999, 0);
  const ka = rank(phys(metal)), kb = rank(phys(stone)), [p, q] = ka >= kb ? [metal, stone] : [stone, metal];
  resolve(p, q, { hit: () => {}, debris: () => {} }, { stick: Math.min(V_STICK, escape(p, q)) / 2, graze: 1, lead: true, rub: 1 / 60 });
  assert.ok(metal.m > 0 && !stone.m, 'a slow touch: the metal body keeps the stony one');
}
console.log(`rub ok: equal pair merged at heat ${eq.heat.toFixed(2)}; metal 960 keeps stone 1000`);
// A fast head-on between equal stony rocks (16 diameters/s): one hit, a bounce, both hot (energy lost × HEAT_WORK), at any rate and phase.
for (const hz of RATES) for (const ph of [0, 0.25, 0.5, 0.75]) {
  const dt = 1 / hz, A = rock(1000, COMP.stony, 0, 0), B = rock(1000, COMP.stony, 0, 0), v = 16 * 2 * A.r;
  B.motion.x = A.r + B.r + v * dt * (1 + ph);
  B.motion.vx = -v;
  const hits: Hit[] = [];
  for (let t = 0; t < 0.5; t += dt) {
    tickBody(A, dt, false);
    tickBody(B, dt, false);
    if (A.m && B.m && Math.hypot(B.motion.x - A.motion.x, B.motion.y - A.motion.y) < A.r + B.r) resolve(A, B, { hit: (h: Hit) => void hits.push(h), debris: () => {} }, { stick: Math.min(V_STICK, escape(A, B)) / 2, graze: 1, lead: true, rub: dt });
  }
  assert.equal(hits.length, 1, `head-on ${hz} Hz phase ${ph}: one hit`);
  assert.equal(hits[0].kind, 'bounce');
  for (const q of [hits[0].heat, hits[0].heatB!]) assert.ok(Math.abs(q - 3.2) < 0.3, `head-on ${hz} Hz phase ${ph}: heat ${q}`);
}
console.log('head-on ok: equal rocks at 16 diameters/s bounce once, +3.2 heat each, at 30/60/144 Hz and any phase');
// Heat seen (heatGlow): one halo per part, under the pile (a rival's halo stays children[0]), from deep red to ember, never white; gone when cold.
{
  const { heatGlow } = await import('../../src/evolution/asteroid/body.ts');
  const { heatOfK } = await import('../../src/core/water.ts');
  const { rockGlow } = await import('../../src/evolution/asteroid/atlas.ts');
  const { Sprite } = await import('pixi.js');
  rockGlow.set(Texture.EMPTY, Texture.WHITE);
  const a = rock(500, COMP.stony, 0, 0), b = rock(100, COMP.stony, 30, 0);
  a.view.addChildAt(new Sprite(), 0); // a rival's halo
  const kids = a.view.children.length;
  heatGlow(a);
  assert.equal(a.view.children.length, kids, 'cold: no halo');
  a.heat = heatOfK(790);
  heatGlow(a);
  assert.equal(a.view.children.length, kids, 'below 800 K (real rock glows from there): no halo');
  a.heat = 2;
  heatGlow(a);
  const g = a.hot![0];
  assert.ok(a.hot!.length === 1 && a.view.getChildIndex(g) > 0 && a.view.getChildIndex(g) < a.view.getChildIndex(a.parts[0].s), 'hot: one halo under the rock, over the rival halo');
  assert.ok(g.rotation === a.parts[0].s.rotation && g.alpha > 0 && g.alpha <= 0.75);
  resolve(a, b, { hit: () => {}, debris: () => {} }, { lead: true, rub: 1 / 60 });
  heatGlow(a);
  assert.equal(a.hot!.length, a.parts.length, 'a meal brings its halo along');
  a.heat = 10;
  heatGlow(a);
  assert.ok(a.hot!.every((h) => h.alpha <= 0.75 && ((h.tint >> 8) & 0xff) < 0x80), 'never white');
  a.heat = 0.1;
  heatGlow(a);
  assert.ok(!a.hot!.length && a.view.children.length === 1 + a.parts.length, 'cool: halos gone');
  console.log('heat glow ok: a halo per part under the pile, ember at most, gone when cold');
}
// Three layers (user, 2026-11-17): a world closing on your shield breaks it at the shell, with a gap still to the ground, and
// comes on whole; a 5% rock it cannot pay for loses that share there and goes on slower. At 30/60/144 Hz.
for (const hz of [30, 60, 144]) {
  const dt = 1 / hz, mk = (m: number, x: number, vx: number) => Object.assign(rockBody({ texture: Texture.EMPTY, comp: COMP.stony }, radiusOf(m, COMP.stony), x, 0), { m });
  for (const [share, k] of [[1.1, 0.02], [0.05, 0.5]]) {
    const w = mk(1000, 0, 0), b = mk(1000 * share, 6 * w.r, 0), met: number[] = [];
    b.motion.vx = -0.5 * w.r;
    w.guard = { r: 1.18 * w.r, meet: (_q, _v, x, y) => (met.length ? 0 : (met.push(Math.hypot(x, y)), k)) }; // down after one meet, as a real shield below 0;
    let gapAtMeet = -1, v0 = 0, m0 = 0;
    for (let t = 0; t < 20 && Math.hypot(b.motion.x, b.motion.y) > w.r + b.r; t += dt) {
      tickBody(b, dt, false); // the shell alone, not the step, is judged
      [v0, m0] = [b.motion.vx, b.m];
      const before = met.length;
      sweep(w, b, dt);
      if (met.length > before) gapAtMeet = Math.hypot(b.motion.x, b.motion.y) - w.r - b.r;
      if (met.length > before && share > 1) assert.ok(b.m === m0 && Math.abs(b.motion.vx - v0) < 1e-9, `${hz} Hz: a world comes on whole through the shell`);
      if (met.length > before && share < 1) assert.ok(b.m < m0 && b.motion.vx > v0, `${hz} Hz: a 5% rock loses its share at the shell and slows`);
    }
    assert.equal(met.length, 1, `${hz} Hz: met the shell once`);
    assert.ok(Math.abs(met[0] - w.guard.r) < 1e-6 * w.r && gapAtMeet > 0.1 * w.r, `${hz} Hz: met at the shell, ${(gapAtMeet / w.r).toFixed(2)} R above the ground`);
  }
}
console.log('three layers ok: a world breaks the shield at the shell with a gap to the ground and comes on whole; a 5% rock is cut there');
