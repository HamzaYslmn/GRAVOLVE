// node test/civilization/crowd.test.ts: home ships thread and skirt bodies in a crowded field.
import assert from 'node:assert/strict';
import { beltR, disc, fighter, move, moonRing, R, seeded, SR } from './fakes.ts';
import { homeContact } from '../../src/evolution/civilization/crash.ts';
import { ACC, ATTACK_V, PATROL_V, pairUp, RETURN_V, steps, TURN, type Fighter } from '../../src/evolution/civilization/flight.ts';
import { nearest } from '../../src/evolution/civilization/guns.ts';
import { breakOff, breakStep, guard, LOOK, PAD, reachOf, runStep, scanRel, type Disc } from '../../src/evolution/civilization/nav.ts';

type D = Disc;

{
  const FPS = [30, 120];
  // 3. A crowded field: your world + 3 moons on slots 0–2, a seeded belt (one body per 18 R²) kept round it, 4 fighters
  // (ships.ts defend's loop: pairs, runs, breaks, each scanning its own bodies), an attack run every 8 s at a 0.3 R body
  // falling in at 4 R/s, the world drifting at 0, 2 or 8 R/s; a wrecked fighter is rebuilt at once.
  const crowd = (seed: number, v: number, fps: number, T = 120) => {
    const rnd = seeded(seed), dt = 1 / fps, n = steps(dt), h = dt / n, HALF = 16 * R, pm = { x: 0, y: 0, vx: v * R, vy: 0 };
    const ring = moonRing([0, 1, 2], rnd() * 2 * Math.PI, 2.1), belt: D[] = [], threats: D[] = [];
    const clearOf = (x: number, y: number, r: number) => Math.hypot(x - pm.x, y - pm.y) > 2 * R + r && ring.ms.every((m) => Math.abs(Math.hypot(x - pm.x, y - pm.y) - m.rad) > m.b.r + r + 0.1 * R) && belt.every((b) => Math.hypot(b.motion.x - x, b.motion.y - y) > b.r + r + 0.3 * R);
    const add = (x: number, y: number) => {
      const r = beltR(rnd);
      if (clearOf(x, y, r)) belt.push(disc(x, y, r, (rnd() - 0.5) * 0.2 * R, (rnd() - 0.5) * 0.2 * R, (r / R) ** 3));
    };
    for (let i = 0; i < 500 && belt.length < (2 * HALF) ** 2 / (18 * R * R); i++) add(pm.x + (rnd() - 0.5) * 2 * HALF, pm.y + (rnd() - 0.5) * 2 * HALF);
    const ships = Array.from({ length: 4 }, (_, i) => fighter(i * 2.4)), out = { wreck: 0, graze: 0, miss: 0, low: Infinity, runs: 0, fired: 0, v: 0, vn: 0 }, shot = new Set<D>();
    const target = new Map<Fighter, D>(), cool = new Map<Fighter, number>(), o = { x: 0, y: 0, vx: 0, vy: 0, t: 0 };
    let nextRun = 8;
    for (let t = 0; t < T; t += dt) {
      ring.at(pm.x, pm.y, pm.vx, pm.vy);
      if (t >= nextRun) {
        nextRun += 8;
        const a = rnd() * 2 * Math.PI, th = disc(pm.x + Math.cos(a) * 20 * R, pm.y + Math.sin(a) * 20 * R, 0.3 * R, pm.vx - Math.cos(a) * 4 * R, pm.vy - Math.sin(a) * 4 * R, 0.027);
        threats.push(th);
        const idle = ships.filter((s) => s.mode === 'patrol' && (cool.get(s) ?? 0) <= 0);
        const s = nearest(idle, th.motion.x - pm.x, th.motion.y - pm.y, Infinity);
        if (s) [s.mode, out.runs] = ['run', out.runs + 1], target.set(s, th);
      }
      pairUp(ships);
      const all = [...belt, ...ring.ms.map((m) => m.b), ...threats];
      const list = reachOf(all, pm.x, pm.y, pm.vx, pm.vy, Math.max(...ships.map((s) => Math.hypot(s.x, s.y))) + (LOOK + 1) * RETURN_V * R + PAD * SR + R, LOOK + 1);
      Object.assign(o, pm);
      for (const s of ships) {
        cool.set(s, Math.max(0, (cool.get(s) ?? 0) - dt));
        const tg = target.get(s);
        scanRel(s, pm, list, (b) => b === tg, SR, ATTACK_V * R, TURN);
        for (let k = 0; k < n; k++) {
          o.t = k * h;
          if (s.mode === 'run') {
            const live = tg && threats.includes(tg), m = tg?.motion, tx = live ? m!.x - pm.x + (m!.vx - pm.vx) * k * h : 0, ty = live ? m!.y - pm.y + (m!.vy - pm.vy) * k * h : 0;
            const r = live ? runStep(s, tx, ty, m!.vx - pm.vx, m!.vy - pm.vy, tg!.r, R, h, o) : 'break';
            if (r === 'fire' && !shot.has(tg!)) [out.fired] = [out.fired + 1, shot.add(tg!)];
            if (r === 'break') [breakOff(s, live ? tx : s.x + s.vx, live ? ty : s.y + s.vy), target.delete(s), cool.set(s, 2.5)];
          } else if (s.mode === 'break') breakStep(s, R, h, o);
          else guard(s, R, h, ACC * R, TURN, PATROL_V, o);
        }
      }
      // The field moves: world, belt (kept round the world: off one side, back in on the other), moons; landed threats go.
      [pm.x, pm.y] = [pm.x + pm.vx * dt, pm.y + pm.vy * dt];
      move([...belt, ...threats], dt);
      ring.turn(dt);
      ring.at(pm.x, pm.y, pm.vx, pm.vy);
      for (let i = belt.length - 1; i >= 0; i--) {
        const b = belt[i], m = b.motion, dx = m.x - pm.x, dy = m.y - pm.y;
        if (Math.abs(dx) > HALF) m.x -= Math.sign(dx) * 2 * HALF;
        if (Math.abs(dy) > HALF) m.y -= Math.sign(dy) * 2 * HALF;
        const eaten = Math.hypot(m.x - pm.x, m.y - pm.y) < R + b.r || ring.ms.some((q) => Math.hypot(m.x - q.b.motion.x, m.y - q.b.motion.y) < q.b.r + b.r);
        if (!eaten) continue;
        belt.splice(i, 1); // eaten by the world or a moon: a new one at the box's edge (ahead of the drift)
        const e = v > 0 ? pm.x + HALF - 0.01 * R : pm.x + (rnd() < 0.5 ? -1 : 1) * (HALF - 0.01 * R);
        add(e, pm.y + (rnd() - 0.5) * 2 * HALF);
      }
      for (let i = threats.length - 1; i >= 0; i--) if (Math.hypot(threats[i].motion.x - pm.x, threats[i].motion.y - pm.y) < 1.5 * R) threats.splice(i, 1);
      const now = [...belt, ...ring.ms.map((m) => m.b), ...threats];
      for (let i = 0; i < ships.length; i++) {
        const s = ships[i], c = homeContact(s, pm, now, SR, R, dt, () => false);
        out.low = Math.min(out.low, Math.hypot(s.x, s.y) / R);
        if (s.mode === 'patrol' && !s.lead) [out.v, out.vn] = [out.v + Math.hypot(s.vx, s.vy) / R, out.vn + 1];
        if (c.hit?.miss) out.miss++;
        if (c.grade === 1) out.graze++;
        if (c.grade !== 2) continue;
        out.wreck++;
        target.delete(s);
        ships[i] = fighter(rnd() * 2 * Math.PI); // rebuilt (the game takes FLEET.fighter.t)
      }
    }
    return out;
  };
  {
    const rows: string[] = [];
    for (const v of [0, 2, 8]) {
      const pool = { wreck: 0, graze: 0 };
      for (const fps of FPS) {
        let wreck = 0, graze = 0, miss = 0, low = Infinity, runs = 0, fired = 0, vs = 0;
        for (let seed = 1; seed <= 6; seed++) {
          const r = crowd(seed * 31 + v, v, fps);
          [wreck, graze, miss, low, runs, fired, vs] = [wreck + r.wreck, graze + r.graze, miss + r.miss, Math.min(low, r.low), runs + r.runs, fired + r.fired, vs + r.v / r.vn / 6];
        }
        [pool.wreck, pool.graze] = [pool.wreck + wreck, pool.graze + graze];
        rows.push(`${v} R/s ${fps} fps: ${(wreck / 48).toFixed(3)} wrecks and ${(graze / 48).toFixed(3)} grazes a fighter-minute (${wreck} / ${graze} in 48 fighter-minutes; ${fired} of ${runs} runs fired on their body; patrol leaders ${vs.toFixed(2)} R/s mean; ${miss} near-miss frames), never under ${low.toFixed(3)} R`);
        assert.ok(low >= 1 - 1e-9, `never inside the world: ${low}`);
        assert.ok(fired >= 0.8 * runs, `runs still reach their body: ${fired} of ${runs}`);
      }
      const fm = 96; // fighter-minutes at both frame rates
      // Measured over 12–18 seeds (192–288 fighter-minutes): 0.10, 0.20 and 1.0 wrecks a fighter-minute; these bounds leave room for 6 seeds' noise.
      if (v <= 2) assert.ok(pool.wreck / fm <= (v ? 0.3 : 0.15) && pool.graze / fm <= 1, `${v} R/s: wrecks ${pool.wreck}, grazes ${pool.graze} in ${fm} fighter-minutes`);
      else assert.ok(pool.wreck / fm <= 1.3, `8 R/s: wrecks ${pool.wreck} in ${fm} fighter-minutes`);
    }
    console.log(`crowded field (world + 3 moons, belt 1 per 18 R², 4 fighters, 6 seeds × 120 s, a run every 8 s):\n  ${rows.join('\n  ')}`);
  }
}
