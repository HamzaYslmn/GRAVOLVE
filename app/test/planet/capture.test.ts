// node test/planet/capture.test.ts: capture by match (planet/rules.ts catchStep), modelled the way the game runs a frame:
// moons.update (catchStep, the grip) then field.update (your pull on the body, both move: core/entity.ts step). Real
// constants, seeded rng, no wall clock. R = your radius, D = 2R.
import assert from 'node:assert/strict';
import { motion, step, type Motion } from '../../src/core/entity.ts';
import { slotRadius } from '../../src/core/orbits.ts';
import { rng } from '../../src/core/rng.ts';
import { COMP, density, G_WORLD, pairPull, pullMass, radiusOf, START_R, youPull, type Comp } from '../../src/evolution/asteroid/rules.ts';
import { catchStep, LANE, MATCH_DRAIN, MATCH_S, matchWindow, moonCap, MOON_SHARE, moonSlots, pickSlot } from '../../src/evolution/planet/rules.ts';
import { RIVAL_MASS, RIVAL_ROCK } from '../../src/evolution/civilization/rules.ts';

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
// Natural infall: with every ring free about as many land as with the inner one alone (the outer lanes grip only a match;
// on 1.25 R rings the outer lanes sit farther out, where drifters are slower: up to ~4% fewer land at 10^5–10^5.5).
const parkedShares: string[] = [];
for (const m of MASSES) {
  const [inner, all] = [parked(m, 7), parked(m, 7, true)];
  for (const [any, r] of [[false, inner], [true, all]] as const) {
    assert.ok(r.share < 0.2, `parked catch share ${r.share} at 10^${Math.log10(m).toFixed(1)}${any ? ', all lanes free' : ''}`);
    parkedShares.push(`${any ? 'all lanes' : 'inner'} 10^${Math.log10(m).toFixed(1)} ${(100 * r.share).toFixed(1)}% caught, ${r.fell}/${r.N} landed`);
  }
  assert.ok(Math.abs(all.fell - inner.fell) <= 0.05 * inner.N, `landings at 10^${Math.log10(m).toFixed(1)}: all lanes ${all.fell}, inner ${inner.fell} of ${inner.N}`);
}
// 8 A rival's rock (user 2026-11-15): stolen on its circle by a match, never by sitting still. rivals.ts needs Pixi, so its
// rock is restated: ROCK_ORBIT rival radii + its own radius off the world, ROCK_W rad/s, turning against the world's orbit
// round you (−turn); RIVAL_ROCK of the rival, a stony body; the world COMP_WORLD. The rival re-places it every frame (no grip).
const ROCK_ORBIT = 2.6, ROCK_W = 0.6, COMP_WORLD: Comp = { rock: 0.55, metal: 0.15, ice: 0.25, gas: 0.05 };
const RATIOS = [RIVAL_MASS.careful[0], 0.8, RIVAL_MASS.hungry[1]], ROCK_MASSES = [10 ** 4.6, 10 ** 5.5, 10 ** 6.5];
const rival = (w: World, ratio: number) => {
  const m = ratio * w.m, R = radiusOf(m, COMP_WORLD), rm = RIVAL_ROCK * m, rr = radiusOf(rm, COMP.stony);
  return { m, R, rm, rr, d: R * ROCK_ORBIT + rr, k: pairPull(youPull(w.m, w.R), w.m, pullMass(m, w.m), m) }; // k: field.ts pair factor
};
// 8c Size: the rock passes moons.ts sizeOk (moonCap: an eighth of you, no wider than MOON_R) for every rival up to 10^6.5.
for (const m of ROCK_MASSES) for (const ratio of RATIOS) {
  const w = world(m), rv = rival(w, ratio), cap = moonCap(rv.rm, rv.rr, w.m, w.R);
  assert.ok(rv.rm >= Math.min(MOON_SHARE[0] * w.m, 0.25 * cap) && rv.rm <= 1.01 * cap, `rock of a ×${ratio} rival at 10^${Math.log10(m).toFixed(1)}: ${(rv.rr / w.R).toFixed(2)} R`);
}
// 8a Matched: the rival at rest (its engines hold station), you start beside its rock with the rock on a ring (beyond it,
// or ahead of it on its path; from behind, a fixed offset swings you into the world) at its velocity, and keep it there
// with your thrust against the rival's pull on you (coasting does not do: the rock curves out of the lane within a
// second). Every ring, both rock senses: the ring closes, and you never touch the world.
const stole: string[] = [];
for (const m of ROCK_MASSES) for (const ratio of RATIOS) {
  const w = world(m), rv = rival(w, ratio), dt = 1 / 60;
  let worst = 0, closest = Infinity;
  for (let k = 0; k < moonSlots(m); k++) for (const spin of [1, -1]) for (const side of [0, spin]) {
    const sr = slotRadius(w.R, k), om = spin * ROCK_W;
    let a = 0.3, p = 0, t = 0;
    const rock = () => ({ x: Math.cos(a) * rv.d, y: Math.sin(a) * rv.d, vx: -Math.sin(a) * om * rv.d, vy: Math.cos(a) * om * rv.d });
    const u = side ? { x: -Math.sin(a) * side, y: Math.cos(a) * side } : { x: Math.cos(a), y: Math.sin(a) }; // you from the rock (the rival at 0)
    const r0 = rock(), me = motion(r0.x + u.x * sr, r0.y + u.y * sr, w.a, 0);
    [me.vx, me.vy] = [r0.vx, r0.vy];
    for (; t < 6 && p < 1; t += dt) {
      a += om * dt;
      const b = rock(), d = Math.hypot(me.x, me.y), g = (G_WORLD * rv.k * rv.m) / Math.max(d, w.R + rv.R) ** 2;
      [me.vx, me.vy, closest] = [me.vx - (me.x / d) * g * dt, me.vy - (me.y / d) * g * dt, Math.min(closest, d - w.R - rv.R)];
      const ex = b.x + u.x * sr - me.x, ey = b.y + u.y * sr - me.y, f = 0.25 * w.a, tx = (b.vx + ex / 0.5 - me.vx) / f, ty = (b.vy + ey / 0.5 - me.vy) / f, tl = Math.max(1, Math.hypot(tx, ty));
      step(me, { x: tx / tl, y: ty / tl }, dt);
      p = catchStep(p, w.R, w.mu, sr, b.x - me.x, b.y - me.y, b.vx - me.vx, b.vy - me.vy, MOON_SHARE[0], dt, k === 0).p;
    }
    assert.ok(p >= 1, `matched beside a ×${ratio} rival's rock at 10^${Math.log10(m).toFixed(1)}, slot ${k}, side ${side}, spin ${spin}: ring ${p.toFixed(2)}`);
    worst = Math.max(worst, t);
  }
  assert.ok(closest > 0, `you touched the rival in the match runs (×${ratio}, 10^${Math.log10(m).toFixed(1)})`);
  stole.push(`×${ratio} 10^${Math.log10(m).toFixed(1)} ≤${worst.toFixed(2)} s`);
}
// 8b Passive: the rival on station r.keep R off you (rivals.ts keepStation: KEEP 8–12, clear of your outer ring by 3 R),
// circling at the circular speed of the pair's pull, its rock turning −turn: you never fill a ring sitting still. With the
// rock turning with the world (the old sense) a still player did catch it.
const passive = (sense: number) => {
  let most = 0, got = 0, n = 0;
  for (const m of ROCK_MASSES) for (const ratio of RATIOS) for (const keep0 of [8, 10, 12]) for (const turn of [-1, 1]) for (const a0 of [0, 1.3, 2.6, 3.9, 5.2]) {
    const w = world(m), rv = rival(w, ratio), slots = moonSlots(m), keep = Math.max(keep0, slotRadius(1, slots - 1) + 3) * w.R, dt = 1 / 30;
    const W = turn * Math.sqrt((G_WORLD * rv.k * (w.m + rv.m)) / keep ** 3), om = sense * turn * ROCK_W;
    let th = 0, a = a0, p = 0, best = 0, k = -1;
    for (let i = 0; i < 60 / dt && p < 1; i++) {
      [th, a] = [th + W * dt, a + om * dt];
      const x = Math.cos(th) * keep + Math.cos(a) * rv.d, y = Math.sin(th) * keep + Math.sin(a) * rv.d;
      const vx = -Math.sin(th) * W * keep - Math.sin(a) * om * rv.d, vy = Math.cos(th) * W * keep + Math.cos(a) * om * rv.d;
      if (p === 0) k = pickSlot(Math.hypot(x, y), w.R, slots, 0, k);
      best = Math.max(best, (p = catchStep(p, w.R, w.mu, slotRadius(w.R, k), x, y, vx, vy, MOON_SHARE[0], dt, k === 0).p));
    }
    [most, got, n] = [Math.max(most, best), got + (p >= 1 ? 1 : 0), n + 1];
  }
  return { most, got, n };
};
const still = passive(-1), old = passive(1);
assert.ok(still.most < 0.3, `a still player against a −turn rock: ring ${still.most.toFixed(2)}`);
assert.ok(old.got > 0, 'the old sense (rock turning with the world) was caught by sitting still: the test tells them apart');
// 9 A living rival world's guard moon (user 2026-11-17): stolen by a match as 8a. asteroid/rival.ts tendMoon (Pixi) restated:
// MOON_D 3 world radii, circular rate √(G·m/d³), turning with the world's sense (+); the world at rest, re-placing it each
// frame. Worlds 1–2.5× you (stony), guard moons 0.5–5% of them (all it holds): the ring closes beside each that passes sizeOk, any ring
// (≤ 1% always passes; too wide for MOON_R: 5% of a ×2.5 world, 5% at 10^6.5, 3% of a ×2.5 world at 10^6.5, 0.47–0.61 R).
const GUARD_D = 3, guarded: string[] = [], tooWide: string[] = [];
for (const m of ROCK_MASSES) for (const ratio of [1, 1.5, 2.5]) for (const share of [0.005, 0.01, 0.03, 0.05]) {
  const w = world(m), wm = ratio * m, wR = radiusOf(wm, COMP.stony), gm = share * wm, gr = radiusOf(gm, COMP.stony), dt = 1 / 60;
  const cap = moonCap(gm, gr, w.m, w.R), d = GUARD_D * wR, om = Math.sqrt((G_WORLD * wm) / d ** 3), k = pairPull(youPull(w.m, w.R), w.m, pullMass(wm, w.m), wm);
  const label = `${100 * share}% of ×${ratio} 10^${Math.log10(m).toFixed(1)}`;
  if (!(gm >= Math.min(MOON_SHARE[0] * w.m, 0.25 * cap) && gm <= 1.01 * cap)) {
    assert.ok(share > 0.01, `guard moon ${label}: ${(gr / w.R).toFixed(2)} R fails sizeOk`);
    tooWide.push(`${label} ${(gr / w.R).toFixed(2)} R`);
    continue;
  }
  let worst = 0, closest = Infinity;
  for (let s = 0; s < moonSlots(m); s++) for (const side of [0, 1]) { // beyond it or ahead (8a: from behind a fixed offset swings you in)
    const sr = slotRadius(w.R, s);
    let a = 0.3, p = 0, t = 0;
    const moon = () => ({ x: Math.cos(a) * d, y: Math.sin(a) * d, vx: -Math.sin(a) * om * d, vy: Math.cos(a) * om * d });
    const u = side ? { x: -Math.sin(a) * side, y: Math.cos(a) * side } : { x: Math.cos(a), y: Math.sin(a) };
    const g0 = moon(), me = motion(g0.x + u.x * sr, g0.y + u.y * sr, w.a, 0);
    [me.vx, me.vy] = [g0.vx, g0.vy];
    for (; t < 6 && p < 1; t += dt) {
      a += om * dt;
      const b = moon(), r = Math.hypot(me.x, me.y), g = (G_WORLD * k * wm) / Math.max(r, w.R + wR) ** 2;
      [me.vx, me.vy, closest] = [me.vx - (me.x / r) * g * dt, me.vy - (me.y / r) * g * dt, Math.min(closest, r - w.R - wR)];
      const ex = b.x + u.x * sr - me.x, ey = b.y + u.y * sr - me.y, f = 0.25 * w.a, tx = (b.vx + ex / 0.5 - me.vx) / f, ty = (b.vy + ey / 0.5 - me.vy) / f, tl = Math.max(1, Math.hypot(tx, ty));
      step(me, { x: tx / tl, y: ty / tl }, dt);
      p = catchStep(p, w.R, w.mu, sr, b.x - me.x, b.y - me.y, b.vx - me.vx, b.vy - me.vy, MOON_SHARE[0], dt, s === 0).p;
    }
    assert.ok(p >= 1, `matched beside a ×${ratio} world's ${(100 * share).toFixed(0)}% guard moon at 10^${Math.log10(m).toFixed(1)}, slot ${s}, side ${side}: ring ${p.toFixed(2)}`);
    worst = Math.max(worst, t);
  }
  assert.ok(closest > 0, `you touched the world in the guard-moon runs (×${ratio}, ${share}, 10^${Math.log10(m).toFixed(1)})`);
  guarded.push(`${label} ≤${worst.toFixed(2)} s`);
}
console.log(`capture ok: pilot caught at ${caught.join(', ')} (30/60/144 fps); fly-bys at 3 and 20 D/s never start; held matched ${MATCH_S} s (outer slot too), outer-ring pilot ${outerCaught.join(', ')}, half window ${(n4 / 60).toFixed(2)} s; blip −20%, drain ${(n6 / 60).toFixed(2)} s; parked ${parkedShares.join('; ')}; a rival's rock: matched ${stole.join(', ')}; sitting still ring ≤ ${still.most.toFixed(2)} (${still.n} runs; the old sense: ${old.got}/${old.n} caught); a guard moon: matched ${guarded.join(', ')}, too wide ${tooWide.join(', ') || 'none'}`);
