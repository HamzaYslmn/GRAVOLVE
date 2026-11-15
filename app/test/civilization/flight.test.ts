// node test/civilization/flight.test.ts: ship flight at 30 and 120 fps. The model flies nose first (little slip,
// never backwards, turn rate capped, no strafing from rest); patrols run round their world in pairs (all sides, in and
// out, never parked, wingmen in their slot); an attack run fires bursts from well out, hits, never grazes the body and
// comes home; rival war waves cross your moon slots in wings, pursuit lets you escape; shuttles reach a moon and come home.
import assert from 'node:assert/strict';
import { slotRadius } from '../../src/core/orbits.ts';
import { book, disc, fighter, fighterGun, q, R, report, seeded, SR, watch } from './fakes.ts';
import {
  ACC, approach, avoid, BRAKE, BURST, chase, circuit, formation, GAP, GEE, GUN, H_TOP, H_TURN, inArc, jink, jinkStep, leash, lowPass, M_TOP, M_TURN, MAX_DT, OUTER, P_ACC, P_TOP, P_TURN, PATROL_V, pairUp, RATE, RF_TURN, RING_IN, RING_OUT, rivalTop, ROW,
  startJink, steps, strafe, thrust, TURN, want, wrap, type Craft, type Fighter, type Strafer,
} from '../../src/evolution/civilization/flight.ts';
import { createShots, pull, SHOTS, trigger } from '../../src/evolution/civilization/guns.ts';
import { breakOff, breakStep, clear, ferry, guard, runStep, scan } from '../../src/evolution/civilization/nav.ts';
import { DIG, SPEED } from '../../src/evolution/civilization/mining.ts';
import { CHASE_S, CHASE_V, LEASH, PIRATE_SPEED } from '../../src/evolution/civilization/rules.ts';

const dist = (c: Craft) => Math.hypot(c.x, c.y) / R;
const models = { patrol: book(), waves: book() };

// Patrol: 4 fighters lift off and patrol for `T` s in pairs (ships.ts defend: pairUp each frame, guard each sub-step).
function patrol(n: number, fps: number, T: number, each: (ships: Fighter[], t: number) => void, rec = false) {
  const ships = Array.from({ length: n }, (_, i) => fighter(i * 2.4)), dt = 1 / fps, k = steps(dt), h = Math.min(dt, MAX_DT) / k;
  for (let f = 0, t = 0; f < T * fps; f++) {
    pairUp(ships);
    for (const s of ships) for (let j = 0; j < k; j++) {
      const h0 = s.heading;
      guard(s, R, h, ACC * R, TURN, PATROL_V);
      if (rec && t > 4) watch(models.patrol, s, h0, h, TURN);
    }
    each(ships, (t += dt));
  }
  return ships;
}

const ends: Record<number, Fighter[]> = {};
for (const fps of [30, 120]) {
  let low = Infinity, high = 0, slow = Infinity, inSlot = 0, wingT = 0, tight = Infinity;
  const gaps: number[] = [], sectors = Array.from({ length: 4 }, () => new Set<number>()), lo = [Infinity, Infinity, Infinity, Infinity], hi = [0, 0, 0, 0];
  const model = models.patrol, t0 = model.time, turned0 = model.turned;
  const ships = patrol(4, fps, 60, (s, t) => {
    for (let i = 0; i < s.length; i++) {
      low = Math.min(low, dist(s[i]));
      if (t < 4) continue; // lift-off first
      high = Math.max(high, dist(s[i]));
      slow = Math.min(slow, Math.hypot(s[i].vx, s[i].vy) / R);
      sectors[i].add(Math.floor(((Math.atan2(s[i].y, s[i].x) + Math.PI) / (2 * Math.PI)) * 8) % 8);
      [lo[i], hi[i]] = [Math.min(lo[i], dist(s[i])), Math.max(hi[i], dist(s[i]))];
      const l = s[i].lead;
      if (!l || t < 8) continue; // wingmen form up first
      const g = Math.hypot(s[i].x - l.x, s[i].y - l.y) / R;
      gaps.push(g);
      [wingT, inSlot, tight] = [wingT + 1, inSlot + (g >= 0.3 && g <= 1.2 ? 1 : 0), Math.min(tight, g)];
    }
  }, true);
  ends[fps] = ships;
  const seen = Math.min(...sectors.map((x) => x.size)), swing = Math.min(...hi.map((h, i) => h - lo[i])), senses = ships.filter((s) => !s.lead).map((s) => s.sense);
  const turns = (model.turned - turned0) / (2 * Math.PI) / ((model.time - t0) / 60);
  console.log(`patrol ${fps} fps: ${low.toFixed(3)}–${high.toFixed(2)} R, slowest ${slow.toFixed(2)} R/s, each ship saw ≥ ${seen}/8 sides, in-out swing ≥ ${swing.toFixed(2)} R, nose ${turns.toFixed(1)} turns/min; wingman gap median ${q(gaps, 0.5).toFixed(2)} R, max ${Math.max(...gaps).toFixed(2)}, min ${tight.toFixed(2)}, in 0.3–1.2 R ${((inSlot / wingT) * 100).toFixed(1)}% of the time; flights' senses ${senses}`);
  assert.ok(low >= 1 - 1e-9, `never inside the world: ${low}`);
  assert.ok(high < OUTER[1] + 1.5, `patrols stay near their world: ${high}`);
  assert.ok(slow > 0.5 * PATROL_V, `never parked: ${slow}`);
  assert.ok(seen >= 6, `round the world, not one side: ${seen}`);
  assert.ok(swing > 1, `swings in and out, not a ring: ${swing}`);
  assert.ok(inSlot / wingT >= 0.9 && tight >= 0.15, `wingmen hold their slot: ${inSlot / wingT}, closest ${tight}`);
  assert.ok(senses.length === 2 && senses[0] === -senses[1], `the two flights go opposite ways: ${senses}`);
}
{
  let d = 0;
  for (let i = 0; i < 4; i++) d = Math.max(d, Math.hypot(ends[30][i].x - ends[120][i].x, ends[30][i].y - ends[120][i].y) / R);
  console.log(`patrol after 60 s, 30 vs 120 fps: ≤ ${d.toFixed(3)} R apart`);
  assert.ok(d < 1.5, `about the same patrol at any frame rate: ${d}`);
  // A leader lost: its wingman takes the route and flies on.
  const s = patrol(4, 60, 10, () => {}), w = s.find((x) => x.lead)!, l = w.lead!;
  s.splice(s.indexOf(l), 1);
  pairUp(s);
  assert.ok(!w.lead && w.sense === l.sense && w.wx === l.wx, 'a wingman whose leader is gone takes its route');
}

// An attack run (ships.ts defend): a body of radius 0.4 R, 20 R out, falls at the world at 4 R/s from several sides; the ship
// starts on patrol on the far side, so it has to round its own world. It fires bursts while its gun bears, from well out,
// hits the body more than once, breaks off clear of it, then flies home.
const fired: Record<string, { t: number; x: number; y: number }> = {};
for (const fps of [30, 120]) for (const side of [0, 1.3, 2.6, 3.9, 5.2]) {
  const s = patrol(1, 120, 8, () => {})[0], tr = 0.4 * R, v = 4 * R, dt = 1 / fps, k = steps(dt), h = dt / k;
  const a = Math.atan2(s.y, s.x) + Math.PI + side * 0.2, ux = Math.cos(a), uy = Math.sin(a), body = { m: 1, r: tr, motion: { x: 20 * R * ux, y: 20 * R * uy, vx: -ux * v, vy: -uy * v } };
  let t = 0, low = Infinity, near = Infinity, first: { t: number; gap: number; out: number } | undefined, hit: { t: number; out: number } | undefined, hits = 0, rounds = 0, broke = -1;
  const shots = createShots(SHOTS, seeded(7 + side * 10)), g = trigger(), gun = fighterGun(() => (hits++, (hit ??= { t, out: Math.hypot(body.motion.x, body.motion.y) / R })));
  s.mode = 'run';
  for (; t < 12; t += dt) {
    for (let j = 0; j < k; j++) {
      const tt = t + j * h, far = 20 * R - v * tt, bx = ux * far, by = uy * far;
      [body.motion.x, body.motion.y] = [bx, by];
      if (s.mode === 'run') {
        const r = runStep(s, bx, by, -ux * v, -uy * v, tr, R, h), p = pull(g, h, r === 'fire', BURST, RATE, GAP);
        if (p && shots.fire(gun, g, p === 1, s.x, s.y, s.vx, s.vy, s.heading, bx, by, -ux * v, -uy * v, body)) {
          rounds++;
          first ??= { t: tt, gap: (Math.hypot(bx - s.x, by - s.y) - tr) / R, out: far / R };
        }
        if (r === 'break') [broke] = [tt, breakOff(s, bx, by)];
      } else if (s.mode === 'break') breakStep(s, R, h);
      else guard(s, R, h, ACC * R, TURN, PATROL_V);
      low = Math.min(low, dist(s));
      if (far > 1.5 * R) near = Math.min(near, (Math.hypot(bx - s.x, by - s.y) - tr) / R); // until the body lands
    }
    if (body.motion.x * ux + body.motion.y * uy > 1.5 * R) shots.step(dt, [body], [], 0, () => {});
  }
  assert.ok(first && hit, `the run fires and hits from ${side}: ${JSON.stringify(first)}, ${hits} hits`);
  if (fps === 30) fired[side] = { t: first.t, x: s.x, y: s.y };
  else console.log(`run from ${side}: first round after ${first.t.toFixed(2)} s, ${first.gap.toFixed(1)} R off the surface, body ${first.out.toFixed(1)} R out (30 fps ${fired[side].t.toFixed(2)} s); ${hits} of ${rounds} rounds hit, the first at ${hit.t.toFixed(2)} s with the body ${hit.out.toFixed(1)} R out; breaks at ${broke.toFixed(2)} s, closest ${near.toFixed(2)} R off; home at ${dist(s).toFixed(2)} R after 12 s`);
  assert.ok(first.gap >= 4 && first.gap <= GUN + 0.1 && first.out >= 8, `opens fire well out: ${JSON.stringify(first)}`);
  assert.ok(hits >= 2 && hit.t < 3.5 && hit.out >= 8, `hits early and more than once: ${hits}, ${JSON.stringify(hit)}`);
  if (fps === 120) assert.ok(Math.abs(fired[side].t - first.t) < 0.15, `the same run at any frame rate: ${fired[side].t} vs ${first.t}`);
  assert.ok(near >= 0.3, `never grazes the body: ${near} R off its surface`);
  assert.ok(low >= 1 - 1e-9 && dist(s) >= 1.5 && dist(s) < OUTER[1] + 1.5 && s.mode === 'patrol', `home in the patrol band in 12 s: ${dist(s)}, ${s.mode}`);
}

// Rival war waves: a wave of 6 enters from 12 R out and makes strafing runs round a centre that chases you (at the origin,
// leaving along +x at `v` R/s), as rivals.ts flies them: wings of three in trail, frame velocity low-passed. No moons: runs
// turn out inside RING_IN R, back in past the first slot + RING_OUT (at pirate cruise speeds, near the waves' own).
const HALF_DIAG = 35; // R: the camera's half-diagonal at Planetoid mass, 1280×720 (player.ts view, computed)
/** `n` ships bunched 12 R out, flying in at `cruise`. */
const fleet = (n: number, cruise: number) => Array.from({ length: n }, (_, i): Strafer => ({ x: 12 * R + (((i * 7) % 5) - 2) * 2 * SR, y: (((i * 3) % 5) - 2) * 2 * SR, vx: -cruise, vy: 0, heading: Math.PI + 0.3, burn: 0, out: false }));
/** One sub-step of a war wave on strafing runs round a centre at (cx, cy); `fv` the frame velocity. */
function runs(ships: Strafer[], cx: number, cy: number, fv: { x: number; y: number }, cruise: number, h: number, r1: number) {
  const keep = 1.25 * R + (2 + ROW[1]) * SR, route = (s: Strafer) => strafe(s, s.x - cx, s.y - cy, s.vx - fv.x, s.vy - fv.y, RING_IN * R, r1, keep, cruise);
  ships.forEach((s, i) => {
    formation(ships, i, 3, cx, cy, fv, SR, R, 1.3 * cruise, keep, route, 0);
    const h0 = s.heading;
    thrust(s, P_ACC * cruise, P_TURN, h, fv.x, fv.y, P_TOP * cruise);
    watch(models.waves, s, h0, h, P_TURN, fv.x, fv.y);
  });
}
function raid(v: number, fps: number, T: number, cruise: number) {
  const dt = 1 / fps, k = steps(dt), h = Math.min(dt, MAX_DT) / k, r1 = slotRadius(R, 0) + RING_OUT * R, n = 6;
  const c = { x: 0, y: 0, vx: 0, vy: 0 }, fv = { x: 0, y: 0 }, l = { far: 0, slow: 0 }, out = { dropped: Infinity, cross: Array(n).fill(0), far: 0, low: Infinity, windows: Array(n).fill(0) };
  const ships = fleet(n, cruise), bear = Array(n).fill(false);
  const side = ships.map((s) => Math.sign(Math.hypot(s.x, s.y) - slotRadius(R, 0)));
  for (let f = 1, t = dt; f <= T * fps; f++, t += dt) {
    const yx = v * t, capped = chase(c, yx, 0, v, 0, CHASE_V * cruise, dt);
    lowPass(fv, c.vx, c.vy, dt);
    if (leash(l, Math.hypot(c.x - yx, c.y), LEASH * HALF_DIAG * R, capped, dt) && out.dropped === Infinity) out.dropped = t;
    for (let j = 0; j < k; j++) runs(ships, c.x, c.y, fv, cruise, h, r1);
    ships.forEach((s, i) => {
      const d = Math.hypot(s.x - yx, s.y), now = Math.sign(d - slotRadius(R, 0));
      if (now !== side[i]) [out.cross[i], side[i]] = [out.cross[i] + 1, now];
      if (t > 5) [out.far, out.low] = [Math.max(out.far, d / R), Math.min(out.low, d / R)];
      const b = d - R < 6 * R && inArc(s, yx, 0, v, 0, 25 * R, 0.25); // a gun window on you (6 R, ±0.25 rad)
      if (b && !bear[i] && t > 5) out.windows[i]++;
      bear[i] = b;
    });
  }
  return out;
}
const crossings: number[] = [];
for (const fps of [30, 120]) {
  const slow = PIRATE_SPEED[0] * R, fast = PIRATE_SPEED[1] * R;
  const still = raid(0, fps, 30, slow), quick = raid(0, fps, 30, fast), off = raid(20 * R, fps, 15, fast), walk = raid(5 * R, fps, 30, slow);
  crossings.push(...still.cross, ...quick.cross);
  console.log(`war wave ${fps} fps: a raid round you crosses 3.2 R ${Math.min(...still.cross)}–${Math.max(...still.cross)} times in 30 s (${still.low.toFixed(1)}–${still.far.toFixed(1)} R out), gun windows ${still.windows} in 25 s; you leaving at 20 R/s dropped after ${off.dropped.toFixed(1)} s; at 5 R/s kept ${walk.dropped === Infinity ? 'all 30 s' : 'NOT'}, farthest ship ${walk.far.toFixed(1)} R`);
  console.log(`  at ${PIRATE_SPEED[1]} R/s cruise: crosses ${Math.min(...quick.cross)}–${Math.max(...quick.cross)} times (${quick.low.toFixed(1)}–${quick.far.toFixed(1)} R out), gun windows ${quick.windows}`);
  for (const r of [still, quick]) {
    assert.ok(Math.min(...r.cross) >= 6 && r.low > 1.05, `raid runs cross your first moon slot, clear of you: ${r.cross}, ${r.low} R`);
    assert.ok(Math.min(...r.windows) >= 25 / 8, `every ship gets a gun window at least every 8 s: ${r.windows}`);
  }
  assert.ok(off.dropped <= 10, `a target leaving at 20 R/s escapes within 10 s: ${off.dropped}`);
  assert.ok(walk.dropped === Infinity && walk.far <= 8, `a target at 5 R/s is kept within 8 R: ${walk.far}`);
}
// Rival ships away round a moving you (a hand copy of rivals.ts's ships-away loop: fighters going or massing, frigates on
// their battery circuit, a probe, a miner, homing), tops from the shared rivalTop. You (R), their world (radius R) and a
// rock move each frame; a ship touching you dies. Every ship every sub-step: speed ≤ max(top, last), |Δv| ≤ GEE × thrust.
{
  type Away = Strafer & { wx: number; wy: number; k: number; sense: number; role: 'fighter' | 'frigate' | 'probe' | 'miner'; t: number; home: boolean; rock?: ReturnType<typeof disc>; dig: number; da: number; dead: boolean; docked: number; landed: number };
  const OUT_V = 5, MASS_IN = [1.5, 1.7], MASS_OUT = [1.9, 2.1], PROBE_S = 10, DIG_S = 2, DOCK = 1.3; // rivals.ts
  const sp = OUT_V * R, acc = sp * P_ACC, brake = BRAKE * acc, outer = slotRadius(R, 0);
  type Opts = { fps: number; T: number; phase: 'go' | 'mass' | 'home'; ships: Away['role'][]; at?: (a: number) => [number, number]; rock?: [number, number, number, number]; you: (me: ReturnType<typeof disc>, ships: Away[], dt: number, t: number) => void; world?: (w: ReturnType<typeof disc>, me: ReturnType<typeof disc>, dt: number, t: number) => void };
  const stats = { over: 0, jolt: 0 };
  function away(o: Opts) {
    const dt = 1 / o.fps, n = steps(dt), h = Math.min(dt, MAX_DT) / n, me = disc(0, 0, R), world = disc(10 * R, 0, R), rock = o.rock ? disc(o.rock[0], o.rock[1], 0.3 * R, o.rock[2], o.rock[3]) : undefined;
    const bodies = rock ? [me, world, rock] : [me, world], bm = world.motion, pm = me.motion;
    const ships: Away[] = o.ships.map((role, i) => {
      const a = Math.PI + (i - o.ships.length / 2) * 0.4, [x, y] = o.at ? o.at(a) : [bm.x + Math.cos(a) * 1.1 * R, bm.y + Math.sin(a) * 1.1 * R];
      return { role, x, y, vx: bm.vx, vy: bm.vy, heading: a, burn: 0, out: false, wx: 0, wy: 0, k: i * 977, sense: 1, t: 0, home: o.phase === 'home', rock: role === 'miner' ? rock : undefined, dig: 0, da: 0, dead: false, docked: -1, landed: -1 };
    });
    let phase = o.phase, homeAt = -1, fastest = 0, probeV = 0, near8 = 0;
    const c = { x: bm.x, y: bm.y, vx: bm.vx, vy: bm.vy }, fv = { x: bm.vx, y: bm.vy }, lash = { far: 0, slow: 0 };
    for (let f = 1, t = dt; f <= o.T * o.fps; f++, t += dt) {
      o.you(me, ships.filter((s) => !s.dead && s.docked < 0), dt, t);
      o.world?.(world, me, dt, t);
      for (const b of bodies) [b.motion.x, b.motion.y] = [b.motion.x + b.motion.vx * dt, b.motion.y + b.motion.vy * dt];
      if (phase === 'go') {
        const outpaced = chase(c, pm.x, pm.y, pm.vx, pm.vy, CHASE_V * sp, dt);
        if (leash(lash, Math.hypot(c.x - pm.x, c.y - pm.y), LEASH * HALF_DIAG * R, outpaced, dt)) [phase, homeAt] = ['home', t];
      }
      lowPass(fv, c.vx, c.vy, dt);
      const live = ships.filter((s) => !s.dead && s.docked < 0), massing = phase === 'mass', up = massing || phase === 'go', flying = up ? live.filter((s) => s.role === 'fighter') : [];
      const wc = massing ? bm : c, wfv = massing ? { x: bm.vx, y: bm.vy } : fv, keep = massing ? R + (2 + ROW[1]) * SR : 1.25 * R + (2 + ROW[1]) * SR;
      const route = (s: Away) => {
        const x = s.x - wc.x, y = s.y - wc.y;
        if (!massing) return strafe(s, x, y, s.vx - wfv.x, s.vy - wfv.y, RING_IN * R, outer + RING_OUT * R, keep, sp);
        circuit(s, x, y, MASS_IN.map((q) => q * R), MASS_OUT.map((q) => q * R), sp, RF_TURN);
        avoid(x, y, keep, 2 * R);
      };
      const st = live.map((s) => {
        s.t += dt;
        if ((s.role === 'probe' && s.t > PROBE_S) || (s.role === 'miner' && !s.rock)) s.home = true;
        const battery = s.role === 'frigate', wave = s.role === 'fighter', home = battery ? !up : wave ? !flying.length : s.home, digging = !home && !!s.rock && s.dig > 0;
        const fc = home || battery ? { x: bm.vx, y: bm.vy } : wave ? wfv : s.rock ? { x: s.rock.motion.vx, y: s.rock.motion.vy } : { x: pm.vx, y: pm.vy };
        return { wave, home, digging, fc, top: rivalTop(sp, wave, home || battery || (wave && massing) || s.rock ? fc : undefined), near: digging ? [] : scan(s, bodies, (b) => b === world || b === s.rock, SR, sp, battery ? RF_TURN : P_TURN) };
      });
      for (let k = 0; k < n; k++) live.forEach((s, i) => {
        const { wave, home, digging, fc, top, near } = st[i], rk = s.rock;
        if (digging) return;
        if (home) approach(s, bm.x, bm.y, bm.vx, bm.vy, R, sp, brake);
        else if (s.role === 'frigate') {
          const x = s.x - bm.x, y = s.y - bm.y;
          circuit(s, x, y, MASS_OUT.map((q) => q * R), MASS_OUT.map((q) => q * R), 0.5 * sp, RF_TURN);
          avoid(x, y, R + (2 + ROW[1]) * SR, 2 * R);
          [want.x, want.y] = [want.x + bm.vx, want.y + bm.vy];
        } else if (wave) formation(flying, flying.indexOf(s), massing ? 0 : 3, wc.x, wc.y, wfv, SR, R, 1.3 * sp, keep, route, massing ? 1 : 0);
        else if (s.role === 'probe') {
          strafe(s, s.x - pm.x, s.y - pm.y, s.vx - pm.vx, s.vy - pm.vy, outer + 1.5 * R, outer + 4 * R, outer + R, sp);
          [want.x, want.y] = [want.x + pm.vx, want.y + pm.vy];
        } else approach(s, rk!.motion.x, rk!.motion.y, rk!.motion.vx, rk!.motion.vy, rk!.r + 2 * SR, sp, brake);
        clear(s, near, sp, 0, top);
        const v0 = Math.hypot(s.vx, s.vy), x0 = s.vx, y0 = s.vy;
        thrust(s, acc, s.role === 'frigate' ? RF_TURN : P_TURN, h, fc.x, fc.y, top);
        const v = Math.hypot(s.vx, s.vy);
        stats.over = Math.max(stats.over, v / Math.max(top, v0));
        stats.jolt = Math.max(stats.jolt, Math.hypot(s.vx - x0, s.vy - y0) / (GEE * acc * h));
        if (s.role === 'fighter' && phase === 'go') fastest = Math.max(fastest, v / R);
        if (s.role === 'probe' && !home) probeV = Math.max(probeV, v / R);
      });
      for (const s of live) {
        const home = st[live.indexOf(s)].home, rk = s.rock;
        if (s.role === 'miner' && !home && rk && (s.dig > 0 || Math.hypot(rk.motion.x - s.x, rk.motion.y - s.y) < rk.r + 3 * SR)) {
          if (!s.dig) [s.da, s.landed] = [Math.atan2(s.y - rk.motion.y, s.x - rk.motion.x), t];
          s.dig += dt;
          [s.x, s.y, s.vx, s.vy] = [rk.motion.x + Math.cos(s.da) * (rk.r + SR), rk.motion.y + Math.sin(s.da) * (rk.r + SR), rk.motion.vx, rk.motion.vy];
          if (s.dig >= DIG_S) [s.home, s.rock] = [true, undefined];
        }
        if (home && Math.hypot(bm.x - s.x, bm.y - s.y) < DOCK * R) s.docked = t;
        else if (Math.hypot(pm.x - s.x, pm.y - s.y) < R + SR) s.dead = true;
        if (s.role === 'probe' && !home && Math.hypot(pm.x - s.x, pm.y - s.y) < 8 * R) near8 += dt;
      }
    }
    return { ships, homeAt, fastest, probeV, near8, rammed: ships.filter((s) => s.dead).length };
  }
  /** You at `v` R/s along (ux, uy), reached at `a` R/s². */
  const fly = (v: number, ux: number, uy: number, a = 7) => (me: ReturnType<typeof disc>, _s: Away[], dt: number) => {
    const m = me.motion, dx = ux * v * R - m.vx, dy = uy * v * R - m.vy, d = Math.hypot(dx, dy), k = d > a * R * dt ? (a * R * dt) / d : 1;
    [m.vx, m.vy] = [m.vx + dx * k, m.vy + dy * k];
  };
  /** You charging the nearest ship at 7 R/s² up to `v` R/s. */
  const charge = (v: number) => (me: ReturnType<typeof disc>, s: Away[], dt: number, t: number) => {
    const m = me.motion, n = s.reduce<Away | undefined>((b, x) => (!b || Math.hypot(x.x - m.x, x.y - m.y) < Math.hypot(b.x - m.x, b.y - m.y) ? x : b), undefined);
    if (n) { const d = Math.hypot(n.x - m.x, n.y - m.y) || 1; fly(v, (n.x - m.x) / d, (n.y - m.y) / d)(me, s, dt, t); }
  };
  const six = Array(6).fill('fighter') as Away['role'][], rows: string[] = [];
  for (const fps of [30, 120]) {
    const still = away({ fps, T: 25, phase: 'go', ships: six, you: () => {} }), drift = away({ fps, T: 25, phase: 'go', ships: six, you: fly(3, 0, 1) });
    const ch = away({ fps, T: 25, phase: 'go', ships: six, you: charge(12) }), flee = away({ fps, T: 30, phase: 'go', ships: six, you: fly(12, -1, 0) });
    const probe = away({ fps, T: 40, phase: 'go', ships: ['probe'], you: fly(5, 0, 1) }), probeCh = away({ fps, T: 20, phase: 'go', ships: ['probe'], you: charge(12) });
    const miner = away({ fps, T: 30, phase: 'go', ships: ['miner'], rock: [10 * R, 5 * R, 0, 6 * R], you: (me) => void ([me.motion.x, me.motion.y] = [-100 * R, 0]) });
    let next = 5, leg = 0;
    const dodge = (w: ReturnType<typeof disc>, _me: unknown, dt: number, t: number) => {
      if (t >= next) [next, leg] = [next + 5, t];
      const u = Math.floor(next / 5) % 2 ? 1 : -1, e = t - leg, ac = leg && e < 0.72 ? 7 : leg && e < 1.92 ? -7 * 0.72 / 1.2 : 0;
      w.motion.vy += u * ac * R * dt;
    };
    const mass = away({ fps, T: 30, phase: 'mass', ships: [...six, 'frigate', 'frigate', 'probe'], you: fly(9, 0, 1), world: dodge });
    const homing = away({ fps, T: 40, phase: 'home', ships: six, at: (a) => [10 * R - Math.cos(a) * 40 * R, -Math.sin(a) * 40 * R], you: fly(8, -1, 0, 20), world: (w, me, dt) => fly(Math.hypot(me.motion.vx, me.motion.vy) / R, -1, 0, 0.6)(w, [], dt, 0) });
    const minerS = miner.ships[0], probeS = probe.ships[0], dockLast = Math.max(...homing.ships.map((s) => (s.docked < 0 ? Infinity : s.docked)));
    rows.push(`${fps} fps: wave top ${Math.max(still.fastest, drift.fastest).toFixed(2)} R/s you still / drifting 3, ${ch.fastest.toFixed(2)} you charging 12 (rammed ${ch.rammed} of 6), fleeing 12 home after ${flee.homeAt.toFixed(1)} s; probe ${probe.probeV.toFixed(2)} R/s, ${probe.near8.toFixed(1)} s within 8 R of you at 5 R/s, docked ${probeS.docked.toFixed(1)} s; charged at 12 ${probeCh.probeV.toFixed(2)} R/s, ${probeCh.near8.toFixed(1)} s within 8 R; probe out while massing, you at 9: ${mass.probeV.toFixed(2)} R/s; miner at a 6 R/s rock lands ${minerS.landed.toFixed(2)} s, docks ${minerS.docked.toFixed(2)} s; homing from 40 R to a world following you at 8, all docked by ${dockLast.toFixed(1)} s (${homing.rammed} hit you)`);
    assert.ok(still.fastest <= 0.8 * P_TOP * OUT_V, `you still: no wave ship near its top: ${still.fastest}`);
    assert.ok(Math.max(ch.fastest, flee.fastest, drift.fastest) <= P_TOP * OUT_V * (1 + 1e-6), `a wave ship going never passes P_TOP × cruise: ${ch.fastest}`);
    assert.ok(flee.homeAt > 0 && flee.homeAt <= CHASE_S + 0.1, `fleeing at 12 R/s, the wave turns home within CHASE_S: ${flee.homeAt}`);
    assert.ok(probe.near8 >= 8 && probeS.docked > 0, `a probe circles you drifting at 5 R/s ≥ 8 s, then docks: ${probe.near8}, ${probeS.docked}`);
    assert.ok(Math.max(probe.probeV, probeCh.probeV, mass.probeV) <= CHASE_V * OUT_V * (1 + 1e-6), `a probe never passes CHASE_V × cruise: ${probe.probeV}, ${probeCh.probeV}, ${mass.probeV}`);
    assert.ok(minerS.landed > 0 && minerS.landed <= 3 && minerS.docked > 0 && minerS.docked <= 14, `a miner lands on a 6 R/s rock ≤ 3 s, docks ≤ 14 s: ${minerS.landed}, ${minerS.docked}`);
    assert.ok(dockLast <= 40, `homing to a world following you, all dock within 40 s: ${dockLast}`);
  }
  const low = away({ fps: 10, T: 25, phase: 'go', ships: six, you: charge(12) });
  rows.push(`10 fps (dt 0.1), you charging 12: wave top ${low.fastest.toFixed(2)} R/s, rammed ${low.rammed} of 6`);
  console.log(`rival ships away: speed ≤ ${stats.over.toFixed(6)} × max(top, last), |Δv|/dt ≤ ${stats.jolt.toFixed(3)} × GEE × thrust;\n  ${rows.join('\n  ')}`);
  assert.ok(stats.over <= 1 + 1e-6 && stats.jolt <= 1 + 1e-6, `rival ships away: never over max(top, last), |Δv| ≤ GEE × thrust: ${stats.over}, ${stats.jolt}`);
}
{
  report(models);
  console.log(`war wave crossings of 3.2 R a ship in 30 s: median ${q(crossings, 0.5)}`);
  // From rest, asked 90° off its nose: it turns first; no sideways motion off the nose meanwhile.
  const c: Craft = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, burn: 0 }, h = 1 / 60;
  let side = 0, toward = 0;
  while (Math.abs(Math.PI / 2 - c.heading) > Math.PI / 6) {
    [want.x, want.y] = [0, PATROL_V * R];
    thrust(c, ACC * R, TURN, h);
    side += (Math.abs(c.vy * Math.cos(c.heading) - c.vx * Math.sin(c.heading)) * h) / R;
    toward = c.y / R;
  }
  console.log(`from rest 90° off the nose: ${side.toFixed(4)} R sideways off the nose (${toward.toFixed(3)} R toward the wanted course) before the nose is within 30°`);
  assert.ok(side < 0.05, `turns before it goes: ${side}`);
}
// A miner shuttle (view.ts): out to a moon on a 3.2 R slot, dig, home to the pad under it, each leg within LEG_S.
{
  const LEG_S = 15, PAD = 0.08, mr = 0.2 * R, w = 0.5; // view.ts LEG_S, PAD; moon radius, its angular speed (rad/s)
  for (const fps of [30, 120]) {
    const dt = 1 / fps, k = steps(dt), h = dt / k, a0 = 0.3, f: Craft = { x: Math.cos(a0) * R * (1 + PAD), y: Math.sin(a0) * R * (1 + PAD), vx: 0, vy: 0, heading: a0, burn: 0 };
    let t = 0, out = 0, home = 0, low = Infinity, leg: 'out' | 'dig' | 'home' | 'dock' = 'out', a = 0;
    const moon = (s: number) => ({ x: Math.cos(2 + w * s) * 3.2 * R, y: Math.sin(2 + w * s) * 3.2 * R, vx: -Math.sin(2 + w * s) * 3.2 * R * w, vy: Math.cos(2 + w * s) * 3.2 * R * w });
    for (let lt = 0; leg !== 'dock' && t < 40; t += dt, lt += dt) {
      for (let j = 0; j < k; j++) {
        const m = moon(t + j * h);
        if (leg === 'out') {
          const dx = m.x - f.x, dy = m.y - f.y, d = Math.hypot(dx, dy) || 1, go = Math.max(0, d - mr - PAD * R) / d;
          ferry(f, dx * go, dy * go, m.vx, m.vy, SPEED * R, R, h, true);
        } else if (leg === 'home') ferry(f, Math.cos(a) * R * (1 + PAD) - f.x, Math.sin(a) * R * (1 + PAD) - f.y, 0, 0, SPEED * R, R, h, false);
        low = Math.min(low, dist(f));
      }
      const m = moon(t);
      if (leg === 'out' && Math.hypot(m.x - f.x, m.y - f.y) < mr + 0.25 * R) [leg, out, lt] = ['dig', lt, 0];
      else if (leg === 'dig' && lt >= DIG) [leg, lt, a] = ['home', 0, Math.atan2(m.y, m.x)];
      else if (leg === 'home' && Math.hypot(Math.cos(a) * R * (1 + PAD) - f.x, Math.sin(a) * R * (1 + PAD) - f.y) < 0.25 * R) [leg, home] = ['dock', lt];
    }
    console.log(`shuttle ${fps} fps: out to a 3.2 R moon in ${out.toFixed(2)} s, home in ${home.toFixed(2)} s, never under ${low.toFixed(3)} R`);
    assert.ok(leg === 'dock' && out > 0 && out < LEG_S && home < LEG_S && low >= 1 - 1e-9, `a shuttle reaches its moon and comes home: ${leg}, ${out}, ${home}`);
  }
}
// A top speed in space (pirates: `thrust` with `top`). Top omitted: the same path as before (a fixed-seed trace, numbers
// recorded before `top` existed). With a top, over random courses (≤ 50 × top), random frames (0–40 × top) and jinks, hurt
// or not, for each class: the speed never rises above max(top, the last), the velocity changes ≤ GEE × thrust a second
// (turns included), a ship above its top only slows; 0 → 95% of its top within 0.85 s, a raider's 85° turn within 1.15 s.
{
  const rnd = seeded(13), c: Craft = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, burn: 0 };
  let fx = 0, fy = 0;
  for (let i = 0; i < 2000; i++) {
    if (i % 50 === 0) [want.x, want.y, fx, fy] = [(rnd() - 0.5) * 20, (rnd() - 0.5) * 20, (rnd() - 0.5) * 10, (rnd() - 0.5) * 10];
    if (i === 500) c.hurt = 1;
    thrust(c, 6, 2.2, i % 2 ? 1 / 60 : 1 / 120, fx, fy);
  }
  assert.deepEqual([c.x, c.y, c.vx, c.vy, c.heading, c.burn, c.bank], [9.498348877690466, 7.128088593462245, 5.23133153113207, 4.247342962855251, 12.889599594021236, 0.999999998255165, 0.897487693696807], 'top omitted: the same path as before');
  const classes = { raider: [1, P_TURN, P_TOP], hauler: [0.8, H_TURN, H_TOP], marauder: [0.8, M_TURN, M_TOP] } as const, cruise = PIRATE_SPEED[1] * R;
  const rows: string[] = [];
  for (const [kind, [k, turn, tk]] of Object.entries(classes)) {
    const ss = k * cruise, top = tk * ss, acc = P_ACC * ss, rr = seeded(kind.length);
    let over = 0, dvMax = 0, rise = 0;
    for (const fps of [30, 120]) {
      const h = Math.min(1 / fps, MAX_DT) / steps(1 / fps), c: Craft = { x: 0, y: 0, vx: (rr() - 0.5) * 6 * top, vy: (rr() - 0.5) * 6 * top, heading: rr() * 7, burn: 0 }, jk = jink();
      for (let i = 0; i < 20000; i++) {
        if (i % 40 === 0) {
          [fx, fy] = rr() < 0.3 ? [0, 0] : [(rr() - 0.5) * 80 * top, (rr() - 0.5) * 80 * top].map((x) => x * rr() ** 2) as [number, number];
          if (rr() < 0.2) c.hurt = rr();
          if (rr() < 0.3) startJink(c, jk, c.x + rr() - 0.5, c.y + rr() - 0.5, rr() - 0.5, rr() - 0.5);
          else [want.x, want.y] = [(rr() - 0.5) * 100 * top * rr() ** 2, (rr() - 0.5) * 100 * top * rr() ** 2];
        }
        jinkStep(jk, ss, h);
        const v0 = Math.hypot(c.vx, c.vy), x0 = c.vx, y0 = c.vy;
        thrust(c, acc, turn, h, fx, fy, top);
        const v = Math.hypot(c.vx, c.vy);
        over = Math.max(over, v - Math.max(top, v0));
        if (v0 > top) rise = Math.max(rise, v - v0);
        dvMax = Math.max(dvMax, Math.hypot(c.vx - x0, c.vy - y0) / (GEE * acc * h));
        if (i % 3000 === 0) [c.vx, c.vy] = [(rr() - 0.5) * 8 * top, (rr() - 0.5) * 8 * top]; // knocked above its top now and then
      }
    }
    // From rest along the nose: time to cruise and to 95% of its top; a raider at its top asked 85° off: time until its course is within 0.05 rad.
    const to = (target: number) => {
      const c: Craft = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, burn: 0 };
      let t = 0;
      for (; Math.hypot(c.vx, c.vy) < target && t < 5; t += 1 / 120) [want.x, want.y] = [top, 0], thrust(c, acc, turn, 1 / 120, 0, 0, top);
      return t;
    };
    const a = 85 * (Math.PI / 180), c = { x: 0, y: 0, vx: top, vy: 0, heading: 0, burn: 0 };
    let turnT = 0;
    for (; Math.abs(wrap(Math.atan2(c.vy, c.vx) - a)) > 0.05 && turnT < 5; turnT += 1 / 120) [want.x, want.y] = [Math.cos(a) * top, Math.sin(a) * top], thrust(c, acc, turn, 1 / 120, 0, 0, top);
    const cr = to(ss), t95 = to(0.95 * top);
    rows.push(`${kind} (top ${tk} × its speed): over its top ≤ ${(over / R).toExponential(1)} R/s, |Δv| ≤ ${dvMax.toFixed(3)} × GEE × thrust, above its top it rose ≤ ${(rise / R).toExponential(1)}; 0 → its speed ${cr.toFixed(2)} s, 0 → 95% top ${t95.toFixed(2)} s, an 85° turn at its top ${turnT.toFixed(2)} s`);
    assert.ok(over <= 1e-9 * top && rise <= 1e-9 * top && dvMax <= 1 + 1e-9, `${kind}: never over its top, never faster above it, |Δv| ≤ GEE × thrust: ${over}, ${rise}, ${dvMax}`);
    assert.ok(t95 <= 0.85, `${kind}: 0 → 95% top within 0.85 s: ${t95}`);
    if (kind === 'raider') assert.ok(turnT <= 1.15, `a raider turns 85° at its top within 1.15 s: ${turnT}`);
  }
  console.log(`top speed (${PIRATE_SPEED[1]} R/s cruise):\n  ${rows.join('\n  ')}`);
}
// A hit-stop frame (dt 0, main.ts) flies nothing: thrust at h 0 leaves the craft as it was (burn and bank never 0/0 NaN).
for (const top of [Infinity, 5 * R]) {
  const c: Craft = { x: R, y: 2 * R, vx: 3 * R, vy: R, heading: 0.3, burn: 0.5, bank: 0.2, hurt: 1 }, was = { ...c };
  [want.x, want.y] = [0, 4 * R];
  thrust(c, ACC * R, TURN, 0, 0, 0, top);
  assert.deepEqual(c, was, `thrust at h 0 (top ${top}) leaves the craft unchanged`);
}
console.log('flight ok');
