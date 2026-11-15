// node test/civilization/nav.test.ts: ships away steer round bodies; sweeps catch fast moons; collisions have
// consequences (bump + crash); every stepper bumps before it is inside a body; home ships thread gaps; shuttles reach a
// moon through a belt, a rival patrol keeps off its rock, the siege ring holds round an enemy world, and 30 home ships
// cost little (asserted only with --bench).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { beltR, craft, disc, fighter, move, moonRing, q, R, seeded, SR } from './fakes.ts';
import { bump, crash, homeContact, swept, touch } from '../../src/evolution/civilization/crash.ts';
import {
  ACC, approach, arrive, ATTACK_V, BRAKE, F_ACC, F_PATROL_V, F_TURN, H_TURN, P_ACC, P_TURN, PATROL_V, pairUp, RETURN_V, S_TURN, steps, thrust, TURN, want, wrap, type Craft, type Fighter,
} from '../../src/evolution/civilization/flight.ts';
import { breakOff, breakStep, clear, ferry, free, guard, HOME_DODGE, LOOK, PAD, reachOf, ringStep, runStep, scan, scanRel, siegePost, siegeRing, type Disc } from '../../src/evolution/civilization/nav.ts';
import { SIEGE } from '../../src/evolution/civilization/rules.ts';
import { DIG, SPEED } from '../../src/evolution/civilization/mining.ts';

type D = Disc;

// Cost: 30 home ships round one world among 400 bodies (belt-like, 120 × 70 R), 60 fps, 10 s (the quietest of three runs):
// per frame, the pre-filter, a scan a ship and the sub-steps with clearRel, against the same patrol with nothing to steer round.
// It runs first: the other scenarios' JIT history would move the number (measured 0.11 ms first, 0.27 ms last).
{
  const rnd = seeded(9), bodies: D[] = [];
  for (let i = 0; i < 400; i++) {
    const x = (rnd() - 0.5) * 120 * R, y = (rnd() - 0.5) * 70 * R, r = beltR(rnd);
    if (Math.hypot(x, y) > 1.5 * R + r) bodies.push(disc(x, y, r, (rnd() - 0.5) * 0.4 * R, (rnd() - 0.5) * 0.4 * R, (r / R) ** 3));
  }
  const run = (nav: boolean) => {
    const ships = Array.from({ length: 30 }, (_, i) => fighter(i * 0.21)), pm = { x: 0, y: 0, vx: 0, vy: 0 }, o = { ...pm, t: 0 }, dt = 1 / 60, times: number[] = [];
    for (let f = 0; f < 600; f++) {
      const t0 = performance.now();
      pairUp(ships);
      const list = nav ? reachOf(bodies, 0, 0, 0, 0, Math.max(...ships.map((s) => Math.hypot(s.x, s.y))) + (LOOK + 1) * RETURN_V * R + PAD * SR + R, LOOK + 1) : [];
      for (const s of ships) {
        if (nav) scanRel(s, pm, list, () => false, SR, ATTACK_V * R, TURN);
        guard(s, R, dt, ACC * R, TURN, PATROL_V, nav ? o : undefined);
      }
      times.push(performance.now() - t0);
    }
    return times.slice(60);
  };
  run(true), run(false); // warm up
  const mean = (x: number[]) => x.reduce((p, q) => p + q, 0) / x.length, best = (nav: boolean) => [run(nav), run(nav), run(nav)].sort((x, y) => q(x, 0.95) - q(y, 0.95))[0]; // the quietest of three (other processes share the machine)
  const a = best(true), b = best(false);
  console.log(`cost: 30 home ships among 400 bodies: ${mean(a).toFixed(3)} ms a frame (p95 ${q(a, 0.95).toFixed(3)}) with steering, ${mean(b).toFixed(3)} ms (p95 ${q(b, 0.95).toFixed(3)}) without: +${(mean(a) - mean(b)).toFixed(3)} ms, ${(((mean(a) - mean(b)) / 30) * 1000).toFixed(1)} µs a ship (Node, not the browser)`);
  if (process.argv.includes('--bench')) assert.ok(q(a, 0.95) <= 0.3, `30 home ships cost p95 ≤ 0.3 ms: ${q(a, 0.95)}`);
}
// A fast body (radius 0.3 R) passing a ship at 120 R/s, 30 fps: 4 R a frame, so no frame end is near the ship.
{
  const r = 0.3 * R + 0.05 * R, step = (120 * R) / 30, ends = Array.from({ length: 6 }, (_, i) => -10 * R + i * step);
  const point = ends.some((x) => Math.hypot(x, 0.2 * R) < r), hit = ends.some((x, i) => i > 0 && swept(x, 0.2 * R, step, 0, r));
  const wide = ends.some((x, i) => i > 0 && swept(x, 1 * R, step, 0, r));
  console.log(`sweep: a 120 R/s pass at 30 fps ${hit ? 'caught' : 'missed'} (a point test ${point ? 'catches' : 'misses'} it); 1 R off: ${wide ? 'caught' : 'clear'}`);
  assert.ok(!point && hit && !wide, 'the sweep catches what the point test tunnels through, and nothing wide of it');
}
// Ships away from home (pirates, rivals'): scan + clear steer round every body in reach and `free` moves goals out of
// bodies. Section-4 scenarios at 30/60/120 fps for raiders and haulers at 4 and 5.5 R/s cruise: head-on, a turn-in at a
// body beside the course, the goal inside a body, a second body where the first sends it, and a belt (one body per
// 18 R², 0.001–0.05 of you, N(>m) ∝ m^-0.6, slow drift): no hit. A body closing faster than DODGE × cruise is not dodged.
{
  const rnd0 = seeded(4242);
  const fly = (bodies: D[], goal: { x: number; y: number }, cruise: number, turn: number, fps: number, T: number, h0 = 0) => {
    const c: Craft = { x: 0, y: 0, vx: Math.cos(h0) * cruise, vy: Math.sin(h0) * cruise, heading: h0, burn: 0 }, g = free({ ...goal }, bodies, PAD * SR);
    const dt = 1 / fps, n = steps(dt), h = dt / n;
    let hit = false, low = Infinity;
    for (let t = 0; t < T && !hit; t += dt) {
      const near = scan(c, bodies, () => false, SR, cruise, turn);
      for (let k = 0; k < n; k++) {
        approach(c, g.x, g.y, 0, 0, 0, cruise, BRAKE * P_ACC * cruise);
        clear(c, near, cruise);
        thrust(c, P_ACC * cruise, turn, h);
        for (const b of bodies) [b.motion.x, b.motion.y] = [b.motion.x + b.motion.vx * h, b.motion.y + b.motion.vy * h];
      }
      for (const b of bodies) {
        hit ||= touch(c.x, c.y, c.vx, c.vy, b, b.r + 0.5 * SR, dt);
        low = Math.min(low, (Math.hypot(c.x - b.motion.x, c.y - b.motion.y) - b.r) / SR);
      }
    }
    return { hit, low };
  };
  const out: Record<string, { runs: number; hits: number; low: number }> = {};
  const rec = (k: string, r: { hit: boolean; low: number }) => {
    const o = (out[k] ??= { runs: 0, hits: 0, low: Infinity });
    [o.runs, o.hits, o.low] = [o.runs + 1, o.hits + (r.hit ? 1 : 0), Math.min(o.low, r.low)];
  };
  for (const fps of [30, 60, 120]) for (const [cruise, turn] of [[4 * R, P_TURN], [5.5 * R, P_TURN], [3.2 * R, H_TURN], [4.4 * R, H_TURN]]) {
    const rnd = () => rnd0();
    for (let i = 0; i < 7; i++) {
      const off = (rnd() - 0.5) * 0.6 * R, r = (0.3 + rnd()) * R, side = rnd() < 0.5 ? 1 : -1;
      rec('head-on', fly([disc(10 * R, off, r)], { x: 25 * R, y: 0 }, cruise, turn, fps, 10));
      rec('turn-in', fly([disc(4 * R + rnd() * 3 * R, side * (r + 0.6 * R + rnd() * 0.6 * R), r)], { x: 6 * R, y: side * (8 + rnd() * 6) * R }, cruise, turn, fps, 10));
      for (let j = 0; j < 4; j++) {
        const bx = (5 + rnd() * 8) * R, by = (rnd() - 0.5) * 8 * R;
        rec('goal inside a body', fly([disc(bx, by, r)], { x: bx + (rnd() - 0.5) * r, y: by + (rnd() - 0.5) * r }, cruise, turn, fps, 12, rnd() * 2 * Math.PI));
      }
      rec('second body', fly([disc(8 * R, off, r), disc(12 * R, (off > 0 ? -1 : 1) * (r + 1.2 * R + rnd() * R), (0.3 + rnd() * 0.7) * R)], { x: 25 * R, y: 0 }, cruise, turn, fps, 10));
      const belt: D[] = [];
      for (let k = 0; k < 36; k++) {
        const x = 4 * R + rnd() * 36 * R, y = (rnd() - 0.5) * 16 * R, br = R * Math.cbrt(Math.min(0.05, 0.001 * (1 - rnd()) ** (-1 / 0.6)));
        if (!belt.some((b) => Math.hypot(b.motion.x - x, b.motion.y - y) < b.r + br + 0.5 * R) && Math.hypot(x, y) > 3 * R) belt.push(disc(x, y, br, (rnd() - 0.5) * 0.4 * R, (rnd() - 0.5) * 0.4 * R));
      }
      rec('belt', fly(belt, { x: 44 * R, y: (rnd() - 0.5) * 4 * R }, cruise, turn, fps, 16));
    }
  }
  console.log(`steering (scan + clear): ${Object.entries(out).map(([k, o]) => `${k} ${o.hits}/${o.runs} hit, closest ${o.low.toFixed(1)} sr`).join('; ')}`);
  for (const [k, o] of Object.entries(out)) assert.equal(o.hits, 0, `no hit steering: ${k}`);
  const head: Craft = { x: 0, y: 0, vx: 5 * R, vy: 0, heading: 0, burn: 0 }, fast = disc(3 * R, 0, R, -20 * R, 0);
  assert.ok(!scan(head, [fast], () => false, SR, 5 * R, P_TURN).length && scan(head, [fast], () => false, SR, 10 * R, P_TURN).length, 'only bodies closing under DODGE × cruise are dodged');
}
// Navigation and collisions (flight.ts: threaded scan + clear, scanRel/clearRel, bump + crash), each at 30 and 120 fps.
// Bodies move once a frame after the ships (the field moves after combat), so clear carries them on by the time since the scan.
{
  const FPS = [30, 120];

  // 1. Consequences: straight on at speed v (no steering round anything) until the first bump; its grade and time.
  const ram = (c: Craft, bodies: D[], v: number, fps: number, T = 6) => {
    const dt = 1 / fps, n = steps(dt), h = dt / n;
    for (let t = 0; t < T; t += dt) {
      for (let k = 0; k < n; k++) [want.x, want.y] = [v, 0], thrust(c, ACC * R, TURN, h);
      move(bodies, dt);
      const hit = bump(c.x, c.y, c.vx, c.vy, bodies, SR, dt, () => false);
      if (hit && !hit.miss) return { grade: crash(c, hit, SR, R), t: t + dt, hit };
    }
    return { grade: -1, t: Infinity, hit: undefined };
  };
  /** Threaded steering at cruise toward `goal()` among bodies (absolute frame); every frame `each`. Counts bumps by grade. */
  const sail = (c: Craft, bodies: D[], goal: (t: number) => { x: number; y: number }, cruise: number, fps: number, T: number, each?: (c: Craft, t: number) => void) => {
    const dt = 1 / fps, n = steps(dt), h = dt / n, out = { graze: 0, wreck: 0, low: Infinity };
    for (let t = 0; t < T; t += dt) {
      c.near = scan(c, bodies, () => false, SR, cruise, TURN, { thread: true, dodge: HOME_DODGE });
      const g = goal(t);
      for (let k = 0; k < n; k++) {
        approach(c, g.x, g.y, 0, 0, 0, cruise, BRAKE * ACC * R);
        clear(c, c.near, cruise, k * h);
        thrust(c, ACC * R, TURN, h);
      }
      move(bodies, dt);
      const hit = bump(c.x, c.y, c.vx, c.vy, bodies, SR, dt, () => false), grade = hit && !hit.miss ? crash(c, hit, SR, R) : 0;
      if (grade === 1) out.graze++;
      if (grade === 2) out.wreck++;
      for (const b of bodies) out.low = Math.min(out.low, (Math.hypot(c.x - b.motion.x, c.y - b.motion.y) - b.r) / SR);
      each?.(c, t + dt);
    }
    return out;
  };
  const grades: Record<number, string> = {};
  for (const fps of FPS) {
    const head = ram(craft(-3 * R, 0, 3 * R), [disc(0, 0, 0.3 * R)], 3 * R, fps);
    const sc = craft(-3 * R, 0.3 * R, 0.5 * R), skim = ram(sc, [disc(0, 0, 0.3 * R)], 0.5 * R, fps), hurt = sc.hurt ?? 0;
    const away = sail(sc, [disc(0, 0, 0.3 * R)], () => ({ x: 6 * R, y: 0.3 * R }), 0.5 * R, fps, 4);
    const again = ram({ ...craft(-1.5 * R, 0.3 * R, 0.5 * R), hurt: 6 }, [disc(0, 0, 0.3 * R)], 0.5 * R, fps);
    const pebble = ram(craft(0, 0), [disc(2 * R, 0, 0.5 * SR, -5 * R, 0)], 0, fps);
    const crumb = ram(craft(0, 0), [disc(2 * R, 0, 0.2 * SR, -5 * R, 0)], 0, fps);
    const thrown = ram(craft(0, 0), [disc(10 * R, 0.1 * R, 0.3 * R, -120 * R, 0)], 0, fps, 1);
    grades[fps] = [head, skim, again, pebble, crumb, thrown].map((r) => r.grade).join(',');
    console.log(`consequence ${fps} fps: head-on 3 R/s → ${head.grade} (vn ${(head.hit!.vn / R).toFixed(2)} R/s); skim 0.5 R/s → ${skim.grade} at ${skim.t.toFixed(3)} s (vn ${(skim.hit!.vn / R).toFixed(2)}), hurt ${hurt} s, then ${away.graze + away.wreck} more bumps in 4 s steering, ${away.low.toFixed(1)} sr off at closest; hurt again → ${again.grade}; 0.5 sr pebble at 5 R/s → ${pebble.grade}; crumb → ${crumb.grade < 0 ? 'nothing' : crumb.grade}; 120 R/s body at ${fps} fps → ${thrown.grade}`);
    assert.ok(head.grade === 2 && skim.grade === 1 && hurt > 0 && away.graze + away.wreck === 0 && again.grade === 2 && pebble.grade === 1 && crumb.grade === -1 && thrown.grade === 2, `consequences: ${grades[fps]}, hurt ${hurt}, after ${away.graze + away.wreck}`);
    if (fps === 120) {
      const s30 = ram(craft(-3 * R, 0.3 * R, 0.5 * R), [disc(0, 0, 0.3 * R)], 0.5 * R, 30);
      assert.equal(grades[30], grades[120], 'same grades at 30 and 120 fps');
      assert.ok(Math.abs(s30.t - skim.t) <= 0.1, `first graze at the same time: ${s30.t} vs ${skim.t}`);
    }
  }

  // Every class's stepper, avoidance off, flown at a body set on its own path: a bump before its centre is inside.
  {
    const moon = { x: 4.4 * R, y: 0, r: 0.15 * R }, PADR = 0.08, ferryOut = (c: Craft, h: number) => {
      const dx = moon.x - c.x, dy = moon.y - c.y, d = Math.hypot(dx, dy) || 1, go = Math.max(0, d - moon.r - PADR * R) / d;
      ferry(c, dx * go, dy * go, 0, 0, SPEED * R, R, h, true);
    };
    const tgt = { x: 20 * R, vx: -4 * R };
    const steppers: [string, () => Craft, (c: Craft, h: number, t: number) => void][] = [
      ['guard', () => fighter(0.5), (c, h) => guard(c as Fighter, R, h, ACC * R, TURN, PATROL_V)],
      ['runStep + break', () => ({ ...fighter(0.5), mode: 'run' as const }), (c, h, t) => {
        const f = c as Fighter, tx = tgt.x + tgt.vx * t;
        if (f.mode === 'run') runStep(f, tx, 0, tgt.vx, 0, 0.4 * R, R, h) === 'break' && breakOff(f, tx, 0);
        else if (f.mode === 'break') breakStep(f, R, h);
        else guard(f, R, h, ACC * R, TURN, PATROL_V);
      }],
      ['frigate', () => fighter(2), (c, h) => guard(c as Fighter, R, h, F_ACC * R, F_TURN, F_PATROL_V)],
      ['ferry out', () => craft(R * (1 + PADR), 0, 0, 0, 0), ferryOut],
      ['ferry home', () => craft(4.2 * R, 0.3 * R, 0, 0, Math.PI), (c, h) => ferry(c, R * (1 + PADR) - c.x, -c.y, 0, 0, SPEED * R, R, h, false)],
      ['approach', () => craft(0, 0, 0, 0, 0), (c, h) => [approach(c, 20 * R, 0, 0, 0, 0, 4 * R, BRAKE * P_ACC * 4 * R), thrust(c, P_ACC * 4 * R, P_TURN, h)]],
      ['arrive', () => craft(0, 0, 0, 0, 0), (c, h) => [arrive(20 * R - c.x, -c.y, 0, 0, 2 * R, BRAKE * 2 * R), thrust(c, 2 * R, TURN, h)]],
    ];
    const res: string[] = [];
    for (const fps of FPS) for (const [name, mk, step] of steppers) {
      const dt = 1 / fps, n = steps(dt), h = dt / n, T0 = 1.5;
      const fly = (bodies: D[]) => {
        const c = mk();
        let inside = false;
        for (let t = 0; t < 4; t += dt) {
          for (let k = 0; k < n; k++) step(c, h, t + k * h);
          const hit = bodies.length ? bump(c.x, c.y, c.vx, c.vy, bodies, SR, dt, () => false) : undefined;
          if (hit && !hit.miss) return { c, hit, inside, t };
          if (bodies.some((b) => Math.hypot(c.x - b.motion.x, c.y - b.motion.y) < b.r)) inside = true;
          if (!bodies.length && t + dt >= T0) return { c, hit: undefined, inside, t };
        }
        return { c, hit: undefined, inside, t: Infinity };
      };
      const p = fly([]).c, r = fly([disc(p.x, p.y, 0.3 * R)]);
      if (fps === 120) res.push(`${name} ${r.hit ? `at ${r.t.toFixed(2)} s, ${(r.hit.vn / R).toFixed(1)} R/s` : 'MISSED'}`);
      assert.ok(r.hit && !r.inside, `${name} at ${fps} fps: a bump before its centre is inside the body (${!!r.hit}, ${r.inside})`);
    }
    console.log(`steppers into a body on their path, avoidance off (120 fps): ${res.join('; ')}`);
    for (const f of ['ships.ts', 'view.ts', 'rivals.ts', 'pirates.ts', '../star/colony.ts']) assert.ok(/\b(bump|homeContact)\(/.test(fs.readFileSync(new URL(`../../src/evolution/civilization/${f}`, import.meta.url), 'utf8')), `${f} calls bump( or homeContact(`);
  }

  // 2. The layer: an 8 sr gap flown through, a 4 sr gap flown round, a goal jittering across the centre line, a closing gap.
  {
    const r = 0.5 * R, cruise = 3 * R, at10: Record<string, { x: number; y: number }> = {};
    for (const fps of FPS) {
      const pair = (gap: number, vy = 0) => [disc(10 * R, r + gap / 2, r, 0, -vy), disc(10 * R, -r - gap / 2, r, 0, vy)];
      let thru = NaN, round = NaN;
      const g8 = sail(craft(0, 0.2 * R, cruise), pair(8 * SR), () => ({ x: 25 * R, y: 0 }), cruise, fps, 10, (c, t) => {
        if (Number.isNaN(thru) && c.x >= 10 * R) thru = c.y;
        if (t >= 10 - 1e-9) at10[fps] = { x: c.x, y: c.y };
      });
      const g4 = sail(craft(0, 0.2 * R, cruise), pair(4 * SR), () => ({ x: 25 * R, y: 0 }), cruise, fps, 10, (c) => void (Number.isNaN(round) && c.x >= 10 * R && (round = c.y)));
      let flips = 0, last = 0;
      const jit = sail(craft(0, 0, cruise), [disc(8 * R, 0, r)], (t) => ({ x: 25 * R, y: (Math.floor(t / 0.5) % 2 ? 1 : -1) * 0.3 * R }), cruise, fps, 8, (c) => {
        const s = Math.abs(c.x - 8 * R) < 3 * R ? Math.sign(c.y) : 0; // which side of the body it is on while it passes
        if (s && last && s !== last) flips++;
        if (s) last = s;
      });
      const shut = sail(craft(0, 0, cruise), pair(12 * SR, 0.2 * R), () => ({ x: 25 * R, y: 0 }), cruise, fps, 10);
      console.log(`layer ${fps} fps: 8 sr gap → through at ${(thru / SR).toFixed(1)} sr off the middle (closest ${g8.low.toFixed(1)} sr, ${g8.graze + g8.wreck} bumps); 4 sr gap → round at ${(Math.abs(round) / R).toFixed(2)} R out (${g4.graze + g4.wreck} bumps); jittering goal → ${flips} side changes (${jit.graze + jit.wreck} bumps); closing gap → ${shut.graze + shut.wreck} bumps, closest ${shut.low.toFixed(1)} sr`);
      assert.ok(Math.abs(thru) < r + 4 * SR - r && g8.graze + g8.wreck === 0 && g8.low >= 2, `an 8 sr gap is flown through: ${thru / SR} sr, closest ${g8.low}`);
      assert.ok(Math.abs(round) > r + 2 * SR + r && g4.graze + g4.wreck === 0, `a 4 sr gap is flown round: ${round / R} R`);
      assert.ok(flips <= 1 && jit.graze + jit.wreck === 0, `a jittering goal: ${flips} side changes`);
      assert.ok(shut.graze + shut.wreck === 0, `a closing gap: ${shut.graze + shut.wreck} bumps`);
    }
    const d = Math.hypot(at10[30].x - at10[120].x, at10[30].y - at10[120].y) / R;
    console.log(`layer: position after 10 s, 30 vs 120 fps: ${d.toFixed(3)} R apart`);
    assert.ok(d <= 0.5, `the same path at any frame rate: ${d} R`);
  }

  // 4. Shuttles: a moon on slot 2 behind moons on slots 0–1 and a 20-body belt 2–6 R out (closer in, rocks fall onto you): 40 trips out and home.
  {
    const LEG_S = 15, PADR = 0.08, LANDR = 0.25, rows: string[] = [];
    for (const fps of FPS) {
      let ok = 0, wreck = 0, graze = 0, outT = 0, homeT = 0;
      for (let trip = 0; trip < 40; trip++) {
        const rnd = seeded(500 + trip), dt = 1 / fps, n = steps(dt), h = dt / n, pm = { x: 0, y: 0, vx: 0, vy: 0 }, o = { ...pm, t: 0 };
        const a0 = rnd() * 2 * Math.PI, ring = moonRing([0, 1, 2], a0, 0.04), site = ring.ms[2].b, belt: D[] = [];
        while (belt.length < 20) {
          const d = (2 + 4 * rnd()) * R, a = a0 + (rnd() - 0.5) * 2.4, r = beltR(rnd), x = Math.cos(a) * d, y = Math.sin(a) * d;
          if (ring.ms.every((m) => Math.abs(d - m.rad) > m.b.r + r + 0.15 * R) && belt.every((b) => Math.hypot(b.motion.x - x, b.motion.y - y) > b.r + r + 0.3 * R)) belt.push(disc(x, y, r, 0, 0, (r / R) ** 3));
        }
        ring.at(0, 0, 0, 0);
        const a = Math.atan2(site.motion.y, site.motion.x) + (rnd() - 0.5) * 0.8, f: Craft = craft(Math.cos(a) * R * (1 + PADR), Math.sin(a) * R * (1 + PADR), 0, 0, a);
        let leg: 'out' | 'dig' | 'home' | 'dock' = 'out', lt = 0, pa = 0, failed = false;
        for (let t = 0; leg !== 'dock' && !failed; t += dt, lt += dt) {
          const all = [...belt, ...ring.ms.map((m) => m.b)];
          if (leg === 'out' || leg === 'home') scanRel(f, pm, all, (b) => b === site, SR, SPEED * R, S_TURN, -3 * SR);
          for (let k = 0; k < n; k++) {
            o.t = k * h;
            const sm = site.motion, sx = sm.x + sm.vx * k * h, sy = sm.y + sm.vy * k * h;
            if (leg === 'out') {
              const dx = sx - f.x, dy = sy - f.y, d = Math.hypot(dx, dy) || 1, go = Math.max(0, d - site.r - PADR * R) / d;
              ferry(f, dx * go, dy * go, sm.vx, sm.vy, SPEED * R, R, h, true, o);
            } else if (leg === 'home') ferry(f, Math.cos(pa) * R * (1 + PADR) - f.x, Math.sin(pa) * R * (1 + PADR) - f.y, 0, 0, SPEED * R, R, h, false, o);
          }
          ring.turn(dt);
          ring.at(0, 0, 0, 0);
          if (leg === 'out' || leg === 'home') {
            const c = homeContact(f, pm, all.filter((b) => b !== site), SR, R, dt, () => false);
            if (c.grade === 1) graze++;
            if (c.grade === 2) [wreck, failed] = [wreck + 1, true];
          }
          const sm = site.motion;
          if (leg === 'out' && Math.hypot(sm.x - f.x, sm.y - f.y) < site.r + LANDR * R) [leg, outT, lt] = ['dig', outT + lt, 0];
          else if (leg === 'dig') {
            const da = Math.atan2(f.y - sm.y, f.x - sm.x);
            [f.x, f.y, f.vx, f.vy] = [sm.x + Math.cos(da) * (site.r + PADR * R), sm.y + Math.sin(da) * (site.r + PADR * R), sm.vx, sm.vy];
            if (lt >= DIG) [leg, lt, pa] = ['home', 0, Math.atan2(f.y, f.x)];
          } else if (leg === 'home' && Math.hypot(Math.cos(pa) * R * (1 + PADR) - f.x, Math.sin(pa) * R * (1 + PADR) - f.y) < LANDR * R) [leg, homeT] = ['dock', homeT + lt];
          if ((leg === 'out' || leg === 'home') && lt > LEG_S) failed = true;
        }
        if (!failed) ok++;
      }
      rows.push(`${fps} fps: ${ok}/40 trips out and home within ${LEG_S} s (mean out ${(outT / 40).toFixed(2)} s, home ${(homeT / Math.max(1, ok)).toFixed(2)} s), ${wreck} wrecks, ${graze} grazes`);
      assert.ok(ok >= 38 && wreck <= 1, `shuttles: ${ok}/40 trips, ${wreck} wrecks`);
    }
    console.log(`shuttles to a slot-2 moon behind slots 0–1 and a 20-body belt: ${rows.join('; ')}`);
  }

  // 5. A rival home patrol: 4 fighters round a rival world (radius R) with its rock on its 2.6 R circle, you (a 1 R body,
  // 5.1 R out) and a free rock in the circuit band, 60 s: never within 2 sr of a body, no wreck. Control: with nothing
  // to steer round (an empty list) their circuit crosses the rock's circle.
  {
    const rows: string[] = [];
    for (const fps of FPS) for (const steer of [true, false]) {
      const dt = 1 / fps, n = steps(dt), h = dt / n, pm = { x: 0, y: 0, vx: 0, vy: 0 }, o = { ...pm, t: 0 }, rock = disc(2.6 * R, 0, 0.31 * R, 0, 0, 0.03);
      const you = disc(-5 * R, 1.2 * R, R), free = disc(1.5 * R, -4.2 * R, 0.25 * R, 0, 0, 0.015), ships = Array.from({ length: 4 }, (_, i) => fighter(i * 1.6));
      let ra = 0, low = Infinity, wreck = 0, graze = 0, onRock = 0;
      for (let t = 0; t < 60; t += dt) {
        Object.assign(rock.motion, { x: Math.cos(ra) * 2.6 * R, y: Math.sin(ra) * 2.6 * R, vx: -Math.sin(ra) * 2.6 * R * 0.6, vy: Math.cos(ra) * 2.6 * R * 0.6 });
        pairUp(ships);
        for (const s of ships) {
          scanRel(s, pm, steer ? [rock, you, free] : [], () => false, SR, ATTACK_V * R, TURN);
          for (let k = 0; k < n; k++) [o.t] = [k * h, guard(s, R, h, ACC * R, TURN, PATROL_V, o)];
        }
        ra += 0.6 * dt;
        Object.assign(rock.motion, { x: Math.cos(ra) * 2.6 * R, y: Math.sin(ra) * 2.6 * R });
        for (const s of ships) {
          const c = homeContact(s, pm, [rock, you, free], SR, R, dt, () => false);
          if (c.grade === 2) wreck++;
          if (c.grade === 1) graze++;
          if (c.hit && !c.hit.miss && c.hit.b === rock) onRock++;
          for (const b of [rock, you, free]) low = Math.min(low, (Math.hypot(s.x - b.motion.x, s.y - b.motion.y) - b.r) / SR);
        }
      }
      rows.push(`${fps} fps ${steer ? 'steering' : 'control (empty list)'}: closest ${low.toFixed(1)} sr off a body, ${wreck} wrecks, ${graze} grazes${steer ? '' : `, ${onRock} bumps on the rock`}`);
      if (steer) assert.ok(low >= 2 && wreck === 0, `a rival patrol keeps clear: ${low} sr, ${wreck} wrecks`);
      else assert.ok(onRock > 0, `control: an unsteered patrol crosses the rock (${onRock} bumps)`);
    }
    console.log(`rival home patrol (rock on 2.6 R, you and a rock in the band, 60 s): ${rows.join('; ')}`);
  }
}
// The siege ring (ringStep, siegePost): a fighter leaves your world for an enemy world (0.89 R) 10 R off your surface,
// drifting 0.5 R/s sideways, at 30/60/120 fps: inside SIEGE.ring within 12 s, stays in it 20 s, never within its radius
// + 1 R, at least a full turn round it in 30 s. The frigate's post: on the ring, on the bearing to you ± side, clear of you.
{
  const er = 0.89 * R, band = SIEGE.ring.map((x) => er + x * R), rows: string[] = [];
  for (const fps of [30, 60, 120]) {
    const s = fighter(0.3), e = { x: (11 + 0.89) * R, y: 0, vx: 0, vy: 0.5 * R }, dt = 1 / fps, n = steps(dt), h = dt / n, o = { x: 0, y: 0, vx: 0, vy: 0, t: 0 };
    let t = 0, inAt = -1, outAfter = 0, low = Infinity, turned = 0, last = Math.atan2(s.y - e.y, s.x - e.x);
    for (; t < 30; t += dt) {
      const rho = siegeRing(er, Math.hypot(e.x, e.y), R);
      for (let k = 0; k < n; k++) {
        o.t = k * h;
        ringStep(s, e.x + e.vx * k * h, e.y + e.vy * k * h, e.vx, e.vy, rho, 0.4 * t, PATROL_V, R, h, o);
      }
      [e.x, e.y] = [e.x + e.vx * dt, e.y + e.vy * dt];
      const d = Math.hypot(s.x - e.x, s.y - e.y), a = Math.atan2(s.y - e.y, s.x - e.x), inside = d >= band[0] && d <= band[1];
      [low, turned, last] = [Math.min(low, d - er), turned + Math.abs(wrap(a - last)), a];
      if (inside && inAt < 0) inAt = t;
      if (inAt >= 0 && t <= inAt + 20 && !inside) outAfter++;
    }
    rows.push(`${fps} fps in at ${inAt.toFixed(1)} s, ${outAfter} frames out after, closest ${(low / R).toFixed(2)} R off its surface, ${(turned / (2 * Math.PI)).toFixed(1)} turns`);
    assert.ok(inAt >= 0 && inAt <= 12 && outAfter === 0 && low >= R && turned >= 2 * Math.PI, `the ring: ${rows.at(-1)}`);
  }
  console.log(`siege ring (0.89 R world 10 R off, drifting 0.5 R/s): ${rows.join('; ')}`);
  const ex = 11.89 * R, rho = siegeRing(er, ex, R);
  for (const side of [-0.5, 0, 0.5]) {
    const p = siegePost(ex, 0, rho, side), a = Math.atan2(p.y, p.x - ex);
    assert.ok(Math.abs(Math.hypot(p.x - ex, p.y) - rho) < 1e-9 && Math.abs(wrap(a - Math.PI - side)) < 1e-9 && Math.hypot(p.x, p.y) >= SIEGE.clear * R, `the frigate's post (side ${side})`);
  }
  const tight = siegeRing(er, er + 4 * R, R);
  assert.ok(Math.abs(Math.hypot(siegePost(er + 4 * R, 0, tight, 0).x, 0) - SIEGE.clear * R) < 1e-6, 'a close enemy: the ring keeps SIEGE.clear off your centre');
}
