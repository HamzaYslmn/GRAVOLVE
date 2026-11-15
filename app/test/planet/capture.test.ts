// node test/planet/capture.test.ts: capture by match (planet/rules.ts catchStep), modelled the way the game runs a frame:
// moons.update (catchStep, the grip) then field.update (your pull on the body, both move: core/entity.ts step). Real
// constants, seeded rng, no wall clock. R = your radius, D = 2R.
import assert from 'node:assert/strict';
import { motion, step, type Motion } from '../../src/core/entity.ts';
import { slotRadius } from '../../src/core/orbits.ts';
import { rng } from '../../src/core/rng.ts';
import { COMP, density, G_WORLD, radiusOf, START_R, youPull, type Comp } from '../../src/evolution/asteroid/rules.ts';
import { catchStep, LANE, MATCH_DRAIN, MATCH_S, matchWindow, MOON_SHARE, moonSlots, pickSlot } from '../../src/evolution/planet/rules.ts';

const ROCKY: Comp = { rock: 0.6, metal: 0.15, ice: 0.2, gas: 0.05 };
/** player.ts thrustOf (that file needs Pixi, so it is restated here): 500 u/s² at the start size, ∝ r^0.4, lighter for dense rock. */
const thrustOf = (r: number, c: Comp) => 500 * (r / START_R) ** 0.4 * (density(COMP.dust) / density(c)) ** 0.3;
type World = { m: number; R: number; mu: number; a: number };
const world = (m: number): World => { const R = radiusOf(m, ROCKY); return { m, R, mu: G_WORLD * youPull(m, R), a: thrustOf(R, ROCKY) }; };
const MASSES = [10 ** 3.5, 10 ** 5.5, 10 ** 6.5];

/** One game frame for you `me` (thrust `t`) and a body of `share` on slot `slot`'s lane: returns the ring and whether it landed on you. */
function frame(w: World, me: Motion, b: Motion, share: number, p: number, slot: number, t: { x: number; y: number }, dt: number) {
  const rx = b.x - me.x, ry = b.y - me.y, d = Math.hypot(rx, ry) || 1, rb = radiusOf(share * w.m, ROCKY);
  const s = catchStep(p, w.R, w.mu, slotRadius(w.R, slot), rx, ry, b.vx - me.vx, b.vy - me.vy, share, dt, slot === 0); // every ring free: slot 0 is the lowest
  const pull = (w.mu / Math.max(d, w.R + rb) ** 2 - s.grip) * dt; // field.ts gravity (your pull on a small body: μ/d²) less the grip
  [b.vx, b.vy] = [b.vx - (rx / d) * pull, b.vy - (ry / d) * pull];
  step(me, t, dt);
  step(b, { x: 0, y: 0 }, dt);
  return { ...s, landed: Math.hypot(b.x - me.x, b.y - me.y) < w.R + rb };
}

// 1 A naive pilot from 30 D away: flies at the body, eases off to put it on the inner lane and matches its drift (belt
// flow 0.5 D/s plus scatter); the wanted closing speed is linear near the lane (0.5 s), √(a·gap / 2) further out (half the thrust kept for your pull on it), ≤ 20 D/s.
function pilot(m: number, fps: number, seed: number, slot = 0) {
  const w = world(m), D = 2 * w.R, rnd = rng(seed), dt = 1 / fps, sr = slotRadius(w.R, slot);
  const a0 = rnd() * 2 * Math.PI, f = rnd() * 2 * Math.PI, sc = rnd() * 2 * Math.PI, sv = (0.07 + 0.19 * rnd()) * D;
  const me = motion(0, 0, w.a, 0), b = motion(Math.cos(a0) * 30 * D, Math.sin(a0) * 30 * D, 0, 0);
  [b.vx, b.vy] = [Math.cos(f) * 0.5 * D + Math.cos(sc) * sv, Math.sin(f) * 0.5 * D + Math.sin(sc) * sv];
  let p = 0;
  for (let i = 1; i <= 30 * fps; i++) {
    const rx = b.x - me.x, ry = b.y - me.y, d = Math.hypot(rx, ry), gap = d - sr;
    const close = Math.sign(gap) * Math.min(20 * D, Math.sqrt(0.5 * w.a * Math.abs(gap)), Math.abs(gap) / 0.5);
    const wx = b.vx + (rx / d) * close, wy = b.vy + (ry / d) * close, k = w.a * 0.25;
    let tx = (wx - me.vx) / k, ty = (wy - me.vy) / k;
    const tl = Math.hypot(tx, ty);
    if (tl > 1) [tx, ty] = [tx / tl, ty / tl];
    const s = frame(w, me, b, 0.02, p, slot, { x: tx, y: ty }, dt);
    p = s.p;
    if (p >= 1) return i * dt;
    if (s.landed) return Infinity;
  }
  return Infinity;
}
const caught: string[] = [];
for (const m of MASSES) {
  for (const seed of [1, 2, 3]) {
    const t = [30, 60, 144].map((fps) => pilot(m, fps, seed));
    assert.ok(t.every((x) => x < 12), `pilot at 10^${Math.log10(m).toFixed(1)} seed ${seed}: ${t.join(' / ')} s`);
    assert.ok(Math.max(...t) - Math.min(...t) < 0.2, `frame rates disagree at 10^${Math.log10(m).toFixed(1)}: ${t.join(' / ')}`);
    if (seed === 1) caught.push(`10^${Math.log10(m).toFixed(1)} ${t.map((x) => x.toFixed(2)).join('/')} s`);
  }
}

// 2 Fly-bys at 3 and 20 D/s along the inner lane: the ring never starts.
for (const m of MASSES) for (const v of [3, 20]) {
  const w = world(m), D = 2 * w.R, sr = slotRadius(w.R, 0), me = motion(0, 0, w.a, 0), b = motion(-10 * D, sr, 0, 0);
  b.vx = v * D;
  let p = 0, most = 0;
  for (let i = 0; i < (20 * D) / (v * D) * 60; i++) [p, most] = [frame(w, me, b, 0.02, p, 0, { x: 0, y: 0 }, 1 / 60).p, Math.max(most, p)];
  assert.equal(most, 0, `fly-by at ${v} D/s, 10^${Math.log10(m).toFixed(1)}: ring ${most}`);
}

// 3 Size: held matched (at rest in the lane, the grip holds it), 0.1% and 20% never fill; 0.2% and 12.5% close in MATCH_S ± a frame.
function held(m: number, share: number, secs: number, slot = 0, fps = 60) {
  const w = world(m), sr = slotRadius(w.R, slot), me = motion(0, 0, w.a, 0), b = motion(sr, 0, 0, 0);
  let p = 0;
  for (let i = 1; i <= secs * fps; i++) if ((p = frame(w, me, b, share, p, slot, { x: 0, y: 0 }, 1 / fps).p) >= 1) return { t: i / fps, drift: Math.hypot(b.x, b.y) - sr, R: w.R };
  return { t: Infinity, drift: Math.hypot(b.x, b.y) - sr, R: w.R };
}
for (const m of MASSES) {
  for (const s of [0.001, 0.2]) assert.equal(held(m, s, 10).t, Infinity, `share ${s} caught`);
  for (const s of [MOON_SHARE[0], MOON_SHARE[1]]) {
    const h = held(m, s, 10);
    assert.ok(Math.abs(h.t - MATCH_S) <= 1 / 60 + 1e-9, `share ${s} at 10^${Math.log10(m).toFixed(1)}: ${h.t} s`);
    // 6a The grip: a body at rest in the lane floats (your pull cancelled) and is caught where it was.
    assert.ok(Math.abs(h.drift) < 1e-6 * h.R, `it fell ${h.drift / h.R} R while held`);
  }
}

// 3b Any free ring (user 2026-11-15): a 2% body held on the outer slot closes just as fast, and floats there.
{
  const outer = moonSlots(10 ** 5.5) - 1, h = held(10 ** 5.5, 0.02, 10, outer);
  assert.ok(outer > 0 && Math.abs(h.t - MATCH_S) <= 1 / 60 + 1e-9, `outer slot ${outer}: ${h.t} s`);
  assert.ok(Math.abs(h.drift) < 1e-6 * h.R, `it fell ${h.drift / h.R} R on the outer slot`);
}
// 3c The pilot puts it on the outer ring instead (the grip there needs a match: GRIP_Q) and still catches it in time.
const outerCaught: string[] = [];
for (const m of MASSES) {
  const outer = moonSlots(m) - 1, t = [1, 2, 3].map((seed) => pilot(m, 60, seed, outer));
  assert.ok(t.every((x) => x < 12), `pilot on slot ${outer} at 10^${Math.log10(m).toFixed(1)}: ${t.join(' / ')} s`);
  outerCaught.push(`10^${Math.log10(m).toFixed(1)} slot ${outer} ${t.map((x) => x.toFixed(2)).join('/')} s`);
}

// 4 Half the window takes 2 s (q = 0.75).
const w5 = world(10 ** 5.5), sr5 = slotRadius(w5.R, 0), win5 = matchWindow(w5.R, Math.sqrt(w5.mu / sr5));
let p4 = 0, n4 = 0;
while (p4 < 1) [p4, n4] = [catchStep(p4, w5.R, w5.mu, sr5, sr5, 0, 0, 0.5 * win5, 0.02, 1 / 60).p, n4 + 1];
assert.ok(Math.abs(n4 / 60 - 2) <= 1 / 60 + 1e-9, `half window: ${n4 / 60} s`);

// 5 A 0.1 s blip out of the lane costs 20%; out of the lane a nearly full ring drains to 0 within MATCH_DRAIN.
let p5 = 0.5;
for (let i = 0; i < 6; i++) p5 = catchStep(p5, w5.R, w5.mu, sr5, sr5 + 2 * LANE * w5.R, 0, 0, 0, 0.02, 1 / 60).p;
assert.ok(Math.abs(p5 - 0.3) < 1e-9, `blip left ${p5}`);
let p6 = 0.99, n6 = 0;
while (p6 > 0) [p6, n6] = [catchStep(p6, w5.R, w5.mu, sr5, sr5 + 2 * LANE * w5.R, 0, 0, 0, 0.02, 1 / 60).p, n6 + 1];
assert.ok(n6 / 60 <= MATCH_DRAIN + 1e-9, `drained in ${n6 / 60} s`);

// 6b A body dropped from rest 8 R out at 10^6.5 falls through the inner lane too fast to be caught, and lands.
{
  const w = world(10 ** 6.5), me = motion(0, 0, w.a, 0), b = motion(8 * w.R, 0, 0, 0);
  let p = 0, most = 0, landed = false;
  for (let i = 0; i < 60 * 30 && !landed; i++) {
    const s = frame(w, me, b, 0.02, p, 0, { x: 0, y: 0 }, 1 / 60);
    [p, most, landed] = [s.p, Math.max(most, s.p), s.landed];
  }
  assert.ok(landed && most < 1, `a faller from 8 R: ring ${most.toFixed(2)}, landed ${landed}`);
}

// 7 Parked, no input: belt bodies of moon size drift past (flow 0.5 D/s, scatter 0.07–0.26 D/s, aimed anywhere across the
// inner lane); the share of those entering a lane that close the ring stays low (the catch is a skill, not luck). `any`:
// every ring free, the body's slot from pickSlot (locked while its ring fills), entering any lane counts.
function parked(m: number, seed: number, any = false, N = 400) {
  const w = world(m), D = 2 * w.R, sr = slotRadius(w.R, 0), slots = any ? moonSlots(m) : 1, rnd = rng(seed), dt = 1 / 30;
  let entered = 0, got = 0, landed = 0;
  for (let n = 0; n < N; n++) {
    const dir = rnd() * 2 * Math.PI, sc = rnd() * 2 * Math.PI, sv = (0.07 + 0.19 * rnd()) * D, aim = (rnd() * 2 - 1) * (sr + LANE * w.R);
    const share = MOON_SHARE[0] * (MOON_SHARE[1] / MOON_SHARE[0]) ** rnd(), ux = Math.cos(dir), uy = Math.sin(dir);
    const me = motion(0, 0, w.a, 0), b = motion(-ux * 15 * w.R - uy * aim, -uy * 15 * w.R + ux * aim, 0, 0);
    [b.vx, b.vy] = [ux * 0.5 * D + Math.cos(sc) * sv, uy * 0.5 * D + Math.sin(sc) * sv];
    let p = 0, inLane = false, k = 0;
    for (let i = 0; i < 120 / dt; i++) {
      if (p === 0) k = pickSlot(Math.hypot(b.x, b.y), w.R, slots, 0, k);
      const s = frame(w, me, b, share, p, k, { x: 0, y: 0 }, dt), d = Math.hypot(b.x, b.y);
      p = s.p;
      inLane ||= Math.abs(d - slotRadius(w.R, k)) <= LANE * w.R;
      if (p >= 1) { got++; break; }
      if (s.landed) { landed++; break; }
      if (d > 16 * w.R && b.x * b.vx + b.y * b.vy > 0) break;
    }
    if (inLane) entered++;
  }
  return { share: got / entered, landed: landed / entered, entered, fell: landed, N };
}
// Natural infall: with every ring free as many land as with the inner one alone (the outer lanes grip only a match).
const parkedShares: string[] = [];
for (const m of MASSES) {
  const [inner, all] = [parked(m, 7), parked(m, 7, true)];
  for (const [any, r] of [[false, inner], [true, all]] as const) {
    assert.ok(r.share < 0.2, `parked catch share ${r.share} at 10^${Math.log10(m).toFixed(1)}${any ? ', all lanes free' : ''}`);
    parkedShares.push(`${any ? 'all lanes' : 'inner'} 10^${Math.log10(m).toFixed(1)} ${(100 * r.share).toFixed(1)}% caught, ${r.fell}/${r.N} landed`);
  }
  assert.ok(Math.abs(all.fell - inner.fell) <= 0.03 * inner.N, `landings at 10^${Math.log10(m).toFixed(1)}: all lanes ${all.fell}, inner ${inner.fell} of ${inner.N}`);
}
console.log(`capture ok: pilot caught at ${caught.join(', ')} (30/60/144 fps); fly-bys at 3 and 20 D/s never start; held matched ${MATCH_S} s (outer slot too), outer-ring pilot ${outerCaught.join(', ')}, half window ${(n4 / 60).toFixed(2)} s; blip −20%, drain ${(n6 / 60).toFixed(2)} s; parked ${parkedShares.join('; ')}`);
