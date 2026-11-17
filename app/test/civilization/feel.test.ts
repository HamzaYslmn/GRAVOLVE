// node test/civilization/feel.test.ts: combat feel (src/evolution/civilization/feel.ts): the near-miss detector and your rocket's pass on synthetic
// rocket paths (plain objects: no guns.ts) and the hit-stop budget.
import assert from 'node:assert/strict';
import { createDodge, NEAR, passed, STOP, stopFor, type Passing } from '../../src/evolution/civilization/feel.ts';
import { lcg } from '../helpers.ts';

type World = { x: number; y: number; vx: number; vy: number; r: number };
type M = Passing & { vx: number; vy: number; target: World; fuel: number; V: number; turn: number; done?: boolean };
type Cue = { t: number; kind: 'near' | 'clean'; m: M; d: number; gap: number };
const DT = 1 / 60;

/** A rocket at (x, y) moving (vx, vy), pulling towards its target at `turn` units/s², speed capped at V; fuel = range. */
const rocket = (target: World, from: unknown, x: number, y: number, vx: number, vy: number, turn = 0, fuel = 400): M =>
  ({ x, y, vx, vy, R: 1, from, target, fuel, V: Math.max(Math.hypot(vx, vy), 40), turn });

/** Flies the rockets at the world (moving straight) for T s the way combat.ts will: step, end what hit or ran dry, then track the rest. */
function fly(w: World, ms: M[], T = 12, dodge = createDodge()) {
  const cues: Cue[] = [], hits: M[] = [];
  for (let t = 0; t < T && ms.some((m) => !m.done); t += DT) {
    w.x += w.vx * DT;
    w.y += w.vy * DT;
    for (const m of ms) {
      if (m.done) continue;
      const dx = w.x - m.x, dy = w.y - m.y, l = Math.hypot(dx, dy) || 1;
      m.vx += (dx / l) * m.turn * DT;
      m.vy += (dy / l) * m.turn * DT;
      const v = Math.hypot(m.vx, m.vy), k = v > m.V ? m.V / v : 1;
      [m.vx, m.vy] = [m.vx * k, m.vy * k];
      m.x += m.vx * DT;
      m.y += m.vy * DT;
      m.fuel -= v * k * DT;
      const hit = Math.hypot(m.x - w.x, m.y - w.y) <= w.r;
      if (hit || m.fuel <= 0) {
        m.done = true;
        if (hit) hits.push(m);
        if (dodge.end(m, hit) === 2) cues.push({ t, kind: 'clean', m, d: 0, gap: 0 });
        continue;
      }
      if (dodge.track(m, w, w.r)) cues.push({ t, kind: 'near', m, d: Math.hypot(m.x - w.x, m.y - w.y) - w.r, gap: m.gap! });
    }
  }
  return { cues, hits, near: cues.filter((c) => c.kind === 'near'), clean: cues.filter((c) => c.kind === 'clean') };
}
const still = (): World => ({ x: 0, y: 0, vx: 0, vy: 0, r: 10 });

// A straight fly-by 1 R off your surface: one near cue, after the closest approach (x = 0 at t = 100/30 s), once the gap reopened.
{
  const r = fly(still(), [rocket(still(), 'a', -100, 11, 30, 0)]);
  assert.equal(r.near.length, 1, 'a pass within 1.5 R cues once');
  assert.ok(r.near[0].t > 100 / 30, `no cue before closest approach: ${r.near[0].t.toFixed(3)} s`);
  assert.ok(r.near[0].d - r.near[0].gap >= NEAR.open && r.near[0].gap <= NEAR.d, 'cued once it has passed and reopened');
  assert.equal(r.clean.length, 0, 'a salvo of 1: no clean cue');
  assert.equal(fly(still(), [rocket(still(), 'a', -100, 12, 30, 0)]).near.length, 0, '2 R off: no cue');
}

// A still world: every rocket flown straight in hits, 0 cues (straight-in: the gap never reopens).
{
  const w = still(), rnd = lcg(7);
  const ms = Array.from({ length: 6 }, (_, i) => {
    const a = rnd() * 2 * Math.PI, d = 40 + 60 * rnd(), V = 20 + 30 * rnd();
    return rocket(w, i % 2 ? 'a' : 'b', d * Math.cos(a), d * Math.sin(a), -V * Math.cos(a), -V * Math.sin(a), 30 * rnd());
  });
  const r = fly(w, ms);
  assert.equal(r.hits.length, 6, 'every rocket hits a still world');
  assert.equal(r.cues.length, 0, `straight-in hits: no cue (${r.cues.length})`);
}

// Off the far pad: lifted away first (range opens early, far off), then it turns and comes straight in: no cue.
{
  const w = still();
  const r = fly(w, [rocket(w, 'a', 60, 0, 25, 0, 60), rocket(w, 'a', -60, 5, -25, 3, 60)]);
  assert.equal(r.hits.length, 2, 'both come round and hit');
  assert.equal(r.cues.length, 0, 'early range-opening off the far pad: no cue');
}

// One pass and one hit in the same salvo: the near cue, no clean cue.
{
  const w = still();
  const r = fly(w, [rocket(w, 'a', -100, 11, 30, 0), rocket(w, 'a', -100, 0, 30, 0)]);
  assert.ok(r.hits.length === 1 && r.near.length === 1 && r.clean.length === 0, `a hit spoils the clean cue: ${r.hits.length} hit, ${r.near.length} near, ${r.clean.length} clean`);
}

// An untouched salvo of 2+: one near cue and one clean cue, when its last rocket ends; a later salvo of the same shooter starts fresh.
{
  const w = still(), dodge = createDodge();
  const r = fly(w, [rocket(w, 'a', -100, 11, 30, 0, 0, 200), rocket(w, 'a', -100, -11.2, 30, 0, 0, 260), rocket(w, 'a', 100, 30, -30, 0, 0, 300)], 12, dodge);
  assert.ok(r.near.length === 1 && r.clean.length === 1, `untouched salvo of 3: ${r.near.length} near, ${r.clean.length} clean`);
  assert.ok(r.clean[0].m.fuel <= 0 && r.clean[0].t > 290 / 30, 'the clean cue waits for the last rocket of the salvo');
  const again = fly(w, [rocket(w, 'a', -100, 11, 30, 0, 0, 200), rocket(w, 'a', -100, -11, 30, 0, 0, 200)], 12, dodge);
  assert.ok(again.near.length === 1 && again.clean.length === 1, 'the next salvo cues again');
}

// Two shooters at once keep their own salvos; a rocket ended untracked never counts, but its hit spoils its shooter's clean cue.
{
  const w = still(), dodge = createDodge();
  const a1 = rocket(w, 'a', -100, 11, 30, 0, 0, 200), a2 = rocket(w, 'a', -100, -11, 30, 0, 0, 200);
  const b1 = rocket(w, 'b', 100, 11, -30, 0, 0, 200), b2 = rocket(w, 'b', 100, -11, -30, 0, 0, 200);
  const r = fly(w, [a1, a2, b1, b2], 12, dodge);
  assert.ok(r.near.length === 2 && r.clean.length === 2, `two shooters: ${r.near.length} near, ${r.clean.length} clean`);
  const far = { x: 1e3, y: 0 }, at = (from: string) => rocket(w, from, 0, 0, 30, 0);
  const [c1, c2, c3, d1, d2, d3] = ['c', 'c', 'c', 'd', 'd', 'd'].map(at);
  for (const m of [c1, c3, d1, d3]) dodge.track(m, far, 10);
  assert.ok(dodge.end(c2, false) === 0 && dodge.end(c3, false) === 0, 'an untracked rocket ends at 0 and leaves the salvo live');
  assert.equal(dodge.end(c1, false), 2, 'the tracked pair still makes a clean salvo of 2');
  assert.ok(dodge.end(d2, true) === 0 && dodge.end(d3, false) === 0 && dodge.end(d1, false) === 0, 'an untracked hit spoils the clean cue');
  dodge.track(c1, w, w.r);
  dodge.clear();
  assert.ok(dodge.track(c1, { x: 1e3, y: 0 }, 10) === 0 && dodge.end(c1, false) === 0, 'after clear, a rocket still marked counts nowhere');
}

// A grid of dodges (your world drifting, salvos of 1–4 from 1–2 shooters, homing from none to hard): per salvo ≤ 1 near cue,
// ≤ 1 clean cue, no clean cue in a salvo with a hit or of 1, every near cue after its rocket's closest approach.
{
  const rnd = lcg(42);
  let salvos = 0, nears = 0, cleans = 0;
  for (const speed of [0, 3, 8, 15, 25]) for (const turn of [0, 15, 40, 90]) for (let k = 0; k < 6; k++) {
    const a = rnd() * 2 * Math.PI, w: World = { x: 0, y: 0, vx: speed * Math.cos(a), vy: speed * Math.sin(a), r: 8 + 6 * rnd() };
    const shooters = 1 + Math.floor(2 * rnd()), ms: M[] = [];
    for (let s = 0; s < shooters; s++) {
      const n = 1 + Math.floor(4 * rnd()), b = rnd() * 2 * Math.PI, d = 50 + 50 * rnd();
      for (let i = 0; i < n; i++) {
        const aim = Math.atan2(-Math.sin(b), -Math.cos(b)) + (rnd() - 0.5) * 0.5, V = 20 + 25 * rnd();
        ms.push(rocket(w, s, d * Math.cos(b) + 3 * i, d * Math.sin(b), V * Math.cos(aim), V * Math.sin(aim), turn * (0.5 + rnd()), 150 + 200 * rnd()));
      }
    }
    const r = fly(w, ms, 20);
    for (let s = 0; s < shooters; s++) {
      const mine = ms.filter((m) => m.from === s), near = r.near.filter((c) => c.m.from === s), clean = r.clean.filter((c) => c.m.from === s);
      const hit = r.hits.some((m) => m.from === s);
      salvos++;
      nears += near.length;
      cleans += clean.length;
      assert.ok(near.length <= 1 && clean.length <= 1, `≤ 1 near and ≤ 1 clean cue per salvo: ${near.length}, ${clean.length}`);
      if (hit || mine.length < NEAR.salvo) assert.equal(clean.length, 0, 'no clean cue after a hit or for a salvo of 1');
      else if (mine.every((m) => m.done)) assert.equal(clean.length, 1, 'an untouched salvo of 2+ that ended cues clean');
    }
    for (const c of r.near) assert.ok(c.d - c.gap >= NEAR.open * c.m.R && c.gap <= NEAR.d * c.m.R, `a near cue after the pass: d ${c.d.toFixed(2)}, gap ${c.gap.toFixed(2)}`);
  }
  assert.ok(nears > 0 && cleans > 0, `the grid exercises both cues: ${salvos} salvos, ${nears} near, ${cleans} clean`);
  console.log(`dodge grid: ${salvos} salvos, ${nears} near cues, ${cleans} clean cues`);
}

// Your locked rocket's pass (the shooter's "almost"): once a rocket, after its closest approach, only within NEAR.d R and once
// the gap reopened; a straight-in hit or a wide pass never cues; a second pass of the same rocket stays quiet.
{
  const run = (y: number, loops = 1) => {
    const m: { x: number; y: number; R: number; pass?: number } = { x: -100, y, R: 1 }, cues: number[] = [];
    for (let k = 0; k < loops; k++) for (let t = 0, x0 = m.x = -100; t < 200 / 30; t += DT) {
      m.x = x0 + 30 * t;
      if (Math.hypot(m.x, m.y) <= 10) break; // touched: a hit ends it
      if (passed(m, 0, 0, 10)) cues.push(m.x);
    }
    return cues;
  };
  const by = run(11), wide = run(12), hit = run(0), twice = run(11, 2);
  assert.ok(by.length === 1 && by[0] > 0, `a pass 1 R off cues once, after its closest approach (${by})`);
  assert.ok(wide.length === 0 && hit.length === 0 && twice.length === 1, `2 R off or straight in: none; a second pass: none (${wide.length}, ${hit.length}, ${twice.length})`);
  // Fired from close at a target opening the range (one that just passed you): no cue at launch; a later real pass still cues.
  const m: { x: number; y: number; R: number; pass?: number } = { x: 11, y: 0, R: 1 };
  let early = 0;
  for (let x = 11; x <= 20; x += 0.5) early += +passed(Object.assign(m, { x }), 0, 0, 10);
  assert.ok(early === 0 && m.pass !== undefined && !Number.isNaN(m.pass), `from within ${NEAR.d} R opening: no cue, armed once past it (${early})`);
}

// Hit-stop: random requests over 60 s of sim time, granted the way combat.ts will (last moves only on a grant).
{
  const rnd = lcg(3), grants: [number, number][] = [];
  let last = -Infinity;
  for (let t = 0; t < 60; t += 0.02 + 0.2 * rnd()) {
    const s = stopFor(last, t, Math.floor(4 * rnd()));
    if (s) [last, grants[grants.length]] = [t, [t, s]];
  }
  assert.ok(grants.length > 20 && grants.every(([, s]) => s > 0 && s <= 0.06), `every grant ≤ 0.06 s (${grants.length})`);
  assert.ok(grants.every(([t], i) => !i || t - grants[i - 1][0] >= STOP.gap), 'grants ≥ 0.5 s apart');
  for (const [t0] of grants) {
    const sum = grants.filter(([t]) => t >= t0 && t < t0 + 1).reduce((a, [, s]) => a + s, 0);
    assert.ok(sum <= 0.12 + 1e-9, `≤ 0.12 s of stop in any 1 s: ${sum}`);
  }
  assert.ok(stopFor(-Infinity, 10, 3) === 0.06 && stopFor(10, 10.25, 3) === 0, 'two requests 0.25 s apart give one grant');
  assert.ok(stopFor(-Infinity, 0, 0) === 0 && STOP.s[1] < STOP.s[2] && STOP.s[2] < STOP.s[3], 'tier 0 earns nothing; bigger tiers stop longer');
}
console.log('feel ok: near cue once a salvo after the pass, clean cue only for untouched salvos of 2+, hit-stop ≤ 0.06 s ≥ 0.5 s apart');
