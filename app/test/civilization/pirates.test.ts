// node test/civilization/pirates.test.ts: pirate fleets (pirates.ts, the real thing in a fake world) keep off
// bodies, crack and haul rocks, leave, evade, retreat and keep the raiding rules.
import assert from 'node:assert/strict';
import { slotRadius } from '../../src/core/orbits.ts';
import { book, fighterGun, q, R, report, seeded, SR, watch } from './fakes.ts';
import { ACC, BURST, GAP, GUN, GUN_ARC, H_TURN, inArc, jink, jinkStep, leadAt, M_TURN, P_ACC, P_TURN, RATE, SPECK, startJink, thrust, TURN, want, type Craft } from '../../src/evolution/civilization/flight.ts';
import { createShots, menace, pull, SHOTS, trigger, type Hull } from '../../src/evolution/civilization/guns.ts';
import { createPirates } from '../../src/evolution/civilization/pirates.ts';
import { fleetSize, HOLD, KEPT, SHIELD_K, shieldRegen, shieldShot, STEAL, type Shield } from '../../src/evolution/civilization/rules.ts';
import type { Foe } from '../../src/evolution/civilization/ships.ts';

const models = { pirates: book() };

// Pirate fleets (pirates.ts, the real thing in a fake world): you (radius R) at the origin, bodies that drift under
// gravity (everything pulls; your surface gravity 0.55 R/s², the game's), merge or bounce when they touch, moons
// on kinematic slots, field.spawn adding bodies (those under 0.001 of you dropped, as the field does), rounds in the real
// pool swept each frame, contacts as combat.ts runs them. View 30 × 17 R (half sizes), ship radius 0.086 R; seeded.
{
  type B = { m: number; r: number; motion: { x: number; y: number; vx: number; vy: number }; comp: Record<string, number>; view: { destroyed: boolean; parent: object | null }; tint: number; moon?: boolean };
  let peak = 0; // most rounds in flight at once over every run (guns.ts SHOTS)
  const world = (seed: number, o: { moons?: number; civ?: boolean; stock?: number; still?: boolean } = {}) => {
    const rnd = seeded(seed), bodies: B[] = [], noop = () => {};
    const mk = (x: number, y: number, vx: number, vy: number, m: number, comp: Record<string, number>): B => ({ m, r: R * Math.cbrt(m), motion: { x, y, vx, vy }, comp, view: { destroyed: false, parent: {} }, tint: 0 });
    const me = mk(0, 0, 0, 0, 1, { rock: 0.5, ice: 0.3, gas: 0.2 });
    const moons = Array.from({ length: o.moons ?? 0 }, (_, k) => {
      const b = { ...mk(0, 0, 0, 0, 0.0017, { rock: 1 }), r: 0.12 * R, moon: true }, rad = slotRadius(R, k);
      bodies.push(b);
      return { b, slot: k, a: k * 1.7, rad, w: ((1.1 + (0.5 * k) / 3) * R) / rad };
    });
    const place = () => moons.forEach((m) => Object.assign(m.b.motion, { x: Math.cos(m.a) * m.rad, y: Math.sin(m.a) * m.rad, vx: -Math.sin(m.a) * m.rad * m.w, vy: Math.cos(m.a) * m.rad * m.w }));
    place();
    const parts = new Map<B, { m0: number; got: number[] }>(); // a cracked rock (`from`): its mass then and its pieces
    const field = { spawn: (x: number, y: number, vx: number, vy: number, m: number, comp: Record<string, number>, from?: B) => { const b = mk(x, y, vx, vy, m, comp); if (from) parts.set(from, parts.get(from) ?? { m0: from.m, got: [] }).get(from)!.got.push(m); if (m >= 1e-3 * me.m) bodies.push(b); return b; } };
    const stock = { ore: o.stock ?? 50, vol: 0 }, lines = { moveTo: () => lines, lineTo: () => lines, stroke: () => lines };
    const civ = o.civ ? { state: { active: true }, shieldTake: () => false, gain: noop, stocks: stock, steal: (n: number) => { const ore = Math.min(stock.ore, n); stock.ore -= ore; return { ore, vol: 0 }; } } : undefined;
    const ctx = {
      me, fx: { flash: noop, burst: noop, popup: noop, ember: noop }, lines, field: () => field, sfx: () => undefined, news: noop, cam: { x: 0, y: 0, halfW: 30 * R, halfH: 17 * R, seenW: 30 * R, seenH: 17 * R, zoom: 1 }, near: bodies, civ,
      moons: { list: () => moons.map((m) => ({ body: m.b, slot: m.slot })) }, mine: [] as Foe[], miners: [] as Foe[], shots: createShots(SHOTS, seeded(seed + 99)), put: noop, draw: noop, wreck: noop,
      kill: (b: B) => void ((b.m = 0), (b.view.destroyed = true)), shed: (b: B, dm: number) => void (b.m -= dm),
      onScreen: (x: number, y: number, r = 0) => Math.abs(x - ctx.cam.x) < ctx.cam.seenW + r && Math.abs(y - ctx.cam.y) < ctx.cam.seenH + r,
      diag: () => Math.hypot(ctx.cam.halfW, ctx.cam.halfH), shipR: () => SR,
    };
    const rivals = { list: [], foes: () => [], watch: noop, shieldTake: () => false };
    const pirates = createPirates(ctx as unknown as Parameters<typeof createPirates>[0], rivals as unknown as Parameters<typeof createPirates>[1], rnd);
    const frame = (dt: number, more?: () => void) => {
      pirates.update(dt, civ as never);
      const loose = bodies.filter((b) => !b.moon && b.m > 0), G = 0.55 * R ** 3;
      if (!o.still) for (const b of loose) for (const q of [me, ...loose]) {
        const dx = q.motion.x - b.motion.x, dy = q.motion.y - b.motion.y, d2 = Math.max(dx * dx + dy * dy, (b.r + q.r) ** 2), a = q === b ? 0 : (G * q.m) / d2 / Math.sqrt(d2);
        [b.motion.vx, b.motion.vy] = [b.motion.vx + dx * a * dt, b.motion.vy + dy * a * dt];
      }
      for (const b of loose) [b.motion.x, b.motion.y] = [b.motion.x + b.motion.vx * dt, b.motion.y + b.motion.vy * dt];
      // Rock on rock (the field's rule, simplified): slower than half their mutual escape speed they merge, else they bounce;
      // a rock reaching your surface is gone (eaten).
      if (!o.still) for (let i = 0; i < loose.length; i++) {
        const a = loose[i];
        if (a.m && Math.hypot(a.motion.x - me.motion.x, a.motion.y - me.motion.y) < me.r + a.r) [a.m, a.view.destroyed] = [0, true];
        for (let j = i + 1; j < loose.length; j++) {
          const b = loose[j], dx = b.motion.x - a.motion.x, dy = b.motion.y - a.motion.y, d = Math.hypot(dx, dy) || 1e-9;
          if (!a.m || !b.m || d >= a.r + b.r) continue;
          const nx = dx / d, ny = dy / d, close = (a.motion.vx - b.motion.vx) * nx + (a.motion.vy - b.motion.vy) * ny;
          if (close <= 0) continue; // already parting
          if (close < 0.5 * Math.sqrt((2 * G * (a.m + b.m)) / (a.r + b.r))) {
            const [k, l] = a.m >= b.m ? [a, b] : [b, a], m = k.m + l.m;
            [k.motion.vx, k.motion.vy] = [(k.motion.vx * k.m + l.motion.vx * l.m) / m, (k.motion.vy * k.m + l.motion.vy * l.m) / m];
            [k.m, k.r, l.m, l.view.destroyed] = [m, R * Math.cbrt(m), 0, true];
          } else {
            const ja = (2 * b.m * close) / (a.m + b.m), jb = (2 * a.m * close) / (a.m + b.m); // an elastic bounce along the line of centres
            [a.motion.vx, a.motion.vy, b.motion.vx, b.motion.vy] = [a.motion.vx - ja * nx, a.motion.vy - ja * ny, b.motion.vx + jb * nx, b.motion.vy + jb * ny];
          }
        }
      }
      moons.forEach((m) => (m.a += m.w * dt));
      place();
      more?.();
      const all = [me, ...bodies.filter((b) => b.m > 0)];
      const hulls: Hull[] = [...pirates.foes().map((q) => ({ x: q.x, y: q.y, vx: q.vx, vy: q.vy, r: SR, team: 'pirate' as const, kill: q.kill })), ...ctx.mine.map((q) => ({ ...q, r: SR, team: 'you' as const }))];
      peak = Math.max(peak, ctx.shots.n);
      ctx.shots.step(dt, all, hulls, SPECK * SR, noop);
      pirates.contacts(all as never, dt);
      for (let i = bodies.length - 1; i >= 0; i--) if (!bodies[i].m) bodies.splice(i, 1);
    };
    return { ctx, me, bodies, mk, pirates, frame, stock, rnd, parts };
  };
  type W = ReturnType<typeof world>;
  const alive = (w: W) => (w.pirates.fleet?.ships ?? []).filter((s) => !s.dead);
  const rock = (w: W, a: number, d = 15) => w.bodies.push(w.mk(Math.cos(a) * d * R, Math.sin(a) * 0.8 * d * R, 0.1 * R, 0, 0.04, { rock: 0.4, metal: 0.4, ice: 0.2 }));
  const U = (n: number) => Math.sqrt((n - 1 + 0.5) / 14); // the fleetSize roll for n ships

  // 1. A hauler in every group: 1000 rolls launched for real: 1–14 ships, at least one hauler, a marauder only from 10.
  {
    const counts: number[] = [];
    let ok = true;
    for (let i = 0; i < 1000; i++) {
      const w = world(i + 1), u = i / 999;
      w.pirates.launch(Math.min(u, 0.9999));
      const s = w.pirates.fleet!.ships, n = s.length, k = (c: string) => s.filter((q) => q.kind === c).length;
      counts.push(n);
      ok &&= n >= 1 && n <= 14 && k('hauler') >= 1 && (k('marauder') === 0 || n >= 10) && k('marauder') <= 1 && n === fleetSize(Math.min(u, 0.9999)).n;
    }
    const share = (f: (n: number) => boolean) => ((100 * counts.filter(f).length) / counts.length).toFixed(0);
    console.log(`pirate groups: ${Math.min(...counts)}–${Math.max(...counts)} ships over 1000 rolls, each with a hauler (lone scavengers ${share((n) => n === 1)}%, 10+ with a marauder ${share((n) => n >= 10)}%)`);
    assert.ok(ok && Math.min(...counts) === 1 && Math.max(...counts) === 14, 'every group: 1–14 ships, a hauler, a marauder only from 10');
  }

  // 2. Keep-out: your world + 4 moons (slots 2.4–5.4 R, 0.12 R, 1.1–1.6 R/s) + five 1–5% rocks 12 R out; fleets of 8 for 120 s,
  // an attack on you due from 30 s: no body deaths, no ship within 2 sr of a body ≥ 0.3 R, no hauler inside your moon system's keep-out.
  for (const fps of [30, 120]) {
    let near = Infinity, haul = Infinity, deaths = 0, raids = 0, rounds = 0, hits = 0, raidT = 0;
    for (const seed of [1, 2, 3, 4]) {
      const w = world(seed, { moons: 4, civ: true }), keep = slotRadius(R, 3) + 1.5 * R, dt = 1 / fps;
      for (let i = 0; i < 5; i++) w.bodies.push(w.mk(Math.cos(i * 1.26 + seed) * 12 * R, Math.sin(i * 1.26 + seed) * 12 * R, 0, 0, 0.01 * (i + 1), { rock: 0.5, metal: 0.3, ice: 0.2 }));
      w.pirates.launch(U(8));
      let was = '';
      for (let t = 0; t < 120; t += dt) {
        if (t >= 30) w.pirates.attack();
        const h0 = new Map(alive(w).map((s) => [s, s.heading]));
        w.frame(dt);
        if (!w.pirates.fleet) w.pirates.launch(U(8));
        const f = w.pirates.fleet!;
        if (f.state === 'raid' && was !== 'raid') raids++;
        if (f.state === 'raid') raidT += dt;
        was = f.state;
        for (const s of alive(w)) {
          for (const b of [w.me, ...w.bodies]) if (b.m && b.r >= 0.3 * R) near = Math.min(near, (Math.hypot(s.x - b.motion.x, s.y - b.motion.y) - b.r) / SR);
          if (s.kind === 'hauler') haul = Math.min(haul, Math.hypot(s.x, s.y) / keep);
          if (h0.has(s)) watch(models.pirates, s, h0.get(s)!, dt, s.kind === 'hauler' ? H_TURN : s.kind === 'marauder' ? M_TURN : P_TURN);
        }
      }
      [deaths, rounds, hits] = [deaths + w.pirates.deaths.body, rounds + w.pirates.stats.rounds, hits + w.pirates.stats.hits];
    }
    console.log(`pirate keep-out ${fps} fps (4 runs × 120 s, world + 4 moons + 5 rocks, attacks from 30 s): ${deaths} body deaths, closest ${near.toFixed(1)} sr off a body ≥ 0.3 R, haulers ≥ ${haul.toFixed(2)} × the moon-system keep-out; ${raids} raids, ${hits} of ${rounds} rounds on target, ${(hits / raidT).toFixed(2)} hits/s a raid`);
    assert.ok(deaths === 0 && near > 2 && haul >= 1, `no ship flies into a body or a hauler into your moon system: ${deaths}, ${near}, ${haul}`);
  }

  // 4. Rocks broken and collected: a 5-ship group at a 4% rock (20 seeded runs, 30 and 120 fps): within 60 s it cracks
  // (into unequal pieces summing to KEPT of the rock) and cargo is aboard; ≥ 50% of the rounds hit a rock they work; a burst about every pass (the longest dry spell a run: median
  // ≤ 6 s, two passes or more in at most a quarter of the runs: the per-run maximum swings 8.5–13.4 s between equivalent setups).
  const cracks: Record<number, number[]> = { 30: [], 120: [] }, states: Record<number, string[]> = { 30: [], 120: [] };
  {
    let rounds = 0, hits = 0, cracked = 0, hauled = 0, deaths = 0, worst = 0, fails = 0, aim = 1, crackN = 0;
    const drys: number[] = [];
    for (const fps of [30, 120]) for (let seed = 1; seed <= 20; seed++) {
      const w = world(seed, { still: true }); // fire discipline in a still field; 4b flies the same work under gravity
      rock(w, seed * 0.7);
      w.pirates.launch(U(5));
      const fl = w.pirates.fleet!, dt = 1 / fps, seq: string[] = [];
      let dry = 0, first = -1;
      for (let t = 0; t < 60 && w.pirates.fleet; t += dt) {
        w.frame(dt);
        for (const s of alive(w)) if (s.job === 'gun') dry = Math.max(dry, s.dry);
        if (first < 0 && w.pirates.stats.cracked) first = t;
        if (seq[seq.length - 1] !== fl.state) seq.push(fl.state);
      }
      const st = w.pirates.stats, cargo = fl.ships.reduce((a, s) => a + s.units, 0);
      [rounds, hits, cracked, hauled, deaths] = [rounds + st.rounds, hits + st.hits, cracked + st.cracked, hauled + st.hauled, deaths + w.pirates.deaths.body];
      drys.push(dry);
      worst = Math.max(worst, dry);
      if (!st.cracked || cargo <= 0) [fails] = [fails + 1, console.log(`  failed: ${fps} fps seed ${seed}: ${JSON.stringify(st)}, cargo ${cargo.toFixed(0)} u`)];
      aim = Math.min(aim, st.hits / Math.max(1, st.rounds));
      if (seed <= 6) [cracks[fps][seed], states[fps][seed]] = [first, seq.join('>')];
      for (const { m0, got } of w.parts.values()) { // a crack: unequal pieces (asteroid/rules.ts pieceShares) summing to KEPT of the rock
        assert.ok(Math.abs(got.reduce((a, x) => a + x, 0) - KEPT * m0) < 1e-9 * m0 && (got.length < 2 || got[0] > 2 * got.at(-1)!), `crack pieces ${got.map((x) => x.toFixed(4))} of ${m0.toFixed(4)}`);
        crackN++;
      }
    }
    const q50 = q(drys, 0.5), over6 = drys.filter((d) => d > 6).length, over9 = drys.filter((d) => d > 9).length;
    console.log(`pirates at a 4% rock (40 runs): ${cracked} cracks, ${hauled} pieces hauled, ${hits} of ${rounds} rounds hit (${((100 * hits) / rounds).toFixed(0)}%, the worst run ${(100 * aim).toFixed(0)}%), ${deaths} body deaths; longest a gun ship went without a burst: median ${q50.toFixed(1)} s, max ${worst.toFixed(1)} s (${over6} runs over 6 s, ${over9} over 9 s)`);
    assert.ok(crackN > 0, `cracks checked: ${crackN}`);
    assert.ok(fails === 0 && deaths === 0 && hits >= 0.5 * rounds, `every run cracks the rock and hauls cargo, half the rounds hit: ${fails} failed, ${hits}/${rounds}`);
    assert.ok(q50 <= 6 && over9 <= drys.length / 4, `about a burst a pass: median ${q50} s, ${over9} runs with two passes (9 s) dry`);
  }

  // 4b. Their own pieces (the browser scenario): 10-ship fleets at five rocks of 1.5–6% of you, 14–17 R out, 60 s, under
  // gravity with merging: guards circle, gun ships run and haulers tractor among fresh, drifting pieces; no body death.
  {
    let deaths = 0, cracked = 0, hauled = 0, shoved = 0;
    for (const fps of [30, 120]) for (let seed = 1; seed <= 20; seed++) {
      const w = world(seed), dt = 1 / fps;
      for (let i = 0; i < 5; i++) {
        const a = seed + i * 1.25, d = (14 + 3 * w.rnd()) * R;
        w.bodies.push(w.mk(Math.cos(a) * d, Math.sin(a) * d * 0.9, 0, 0, 0.015 + 0.045 * w.rnd(), { rock: 0.4, metal: 0.4, ice: 0.2 }));
      }
      w.pirates.launch(U(10));
      for (let t = 0; t < 60 && w.pirates.fleet; t += dt) w.frame(dt);
      [deaths, cracked, hauled, shoved] = [deaths + w.pirates.deaths.body, cracked + w.pirates.stats.cracked, hauled + w.pirates.stats.hauled, shoved + w.pirates.stats.shoved];
    }
    console.log(`own pieces (40 runs: 10 ships, 5 rocks of 1.5–6% at 14–17 R, 60 s, gravity and merging): ${deaths} body deaths, ${cracked} cracks, ${hauled} pieces hauled, ${shoved} shoves (own pieces drifting onto a ship, nudged off)`);
    console.log(`rounds in flight: at most ${peak} of ${SHOTS} so far (keep-out raids, the 4% rock, own pieces)`);
    assert.equal(deaths, 0, 'no ship dies on a body while they crack and haul');
  }

  // 5. Leave when full: the holds fill in work: leave within 1 s, every job form, each hauler with a raider within 1.5 R once formed up, gone within 25 s, no deaths.
  for (const fps of [30, 120]) {
    const w = world(7);
    rock(w, 0.4);
    w.pirates.launch(U(8));
    const fl = w.pirates.fleet!, dt = 1 / fps;
    let t = 0;
    for (; t < 30 && fl.state !== 'work'; t += dt) w.frame(dt);
    for (let k = 0; k < 3 / dt; k++, t += dt) w.frame(dt);
    for (const s of fl.ships) if (s.kind === 'hauler') s.units = HOLD;
    let left = -1, forms = true, apart = 0, gone = -1;
    const t0 = t;
    for (; t < t0 + 30 && gone < 0; t += dt) {
      w.frame(dt);
      if (!w.pirates.fleet) gone = t - t0;
      else if (left < 0 && fl.state === 'leave') [left, forms] = [t - t0, alive(w).every((s) => s.job === 'form')];
      else if (left >= 0 && t - t0 > left + 6 && alive(w).some((s) => s.kind === 'raider')) for (const h of alive(w).filter((s) => s.kind === 'hauler')) apart = Math.max(apart, Math.min(...alive(w).filter((s) => s.kind === 'raider').map((s) => Math.hypot(s.x - h.x, s.y - h.y))) / R);
    }
    console.log(`full holds ${fps} fps: leaving after ${left.toFixed(2)} s, all in formation ${forms}, a hauler's nearest raider ≤ ${apart.toFixed(2)} R, gone after ${gone.toFixed(1)} s, ${w.pirates.deaths.body} deaths`);
    assert.ok(left >= 0 && left <= 1 && forms && apart <= 1.5 && gone >= 0 && gone <= 25 && !w.pirates.deaths.body, 'full holds: they leave together and are gone');
  }

  // 6. Evasion. (a) A fighter 3 R behind a raider, closing: it jinks within 0.3 s and has turned ≥ 0.6 rad within 1 s.
  for (const fps of [30, 120]) {
    const w = world(3);
    w.pirates.launch(U(2));
    const dt = 1 / fps;
    for (let t = 0; t < 3; t += dt) w.frame(dt);
    const s = alive(w).find((q) => q.kind === 'raider')!, sp = Math.hypot(s.vx, s.vy), ux = s.vx / sp, uy = s.vy / sp, h0 = Math.atan2(s.vy, s.vx);
    const f = { x: s.x - ux * 3 * R, y: s.y - uy * 3 * R, vx: s.vx + ux * 3 * R, vy: s.vy + uy * 3 * R, kill() {} };
    w.ctx.mine = [f];
    let at = -1, turned = 0;
    for (let t = 0; t < 1; t += dt) {
      w.frame(dt, () => void ((f.x += f.vx * dt), (f.y += f.vy * dt)));
      if (at < 0 && s.jk.t > 0) at = t + dt;
      turned = Math.max(turned, Math.abs(Math.atan2(Math.sin(Math.atan2(s.vy, s.vx) - h0), Math.cos(Math.atan2(s.vy, s.vx) - h0))));
    }
    console.log(`evasion ${fps} fps: a fighter closing 3 R behind: jink after ${at.toFixed(3)} s, turned ${turned.toFixed(2)} rad in 1 s`);
    assert.ok(at >= 0 && at <= 0.3 && turned >= 0.6, 'a raider jinks off a fighter on its tail');
  }
  // (b) 200 seeded bursts from a fighter on an attack run from 6 R behind (±0.3 rad), one burst once its gun bears: a jinking raider dies ≤ 0.7 × as often as a straight one, and ≥ 10%.
  {
    const run = (evade: boolean) => {
      const rnd = seeded(77);
      let kills = 0;
      for (let i = 0; i < 200; i++) {
        const shots = createShots(SHOTS, rnd), cruise = (4 + 1.5 * rnd()) * R, g = trigger(), jk = jink(), a0 = Math.PI + (rnd() - 0.5) * 0.6;
        const c: Craft = { x: 0, y: 0, vx: cruise, vy: 0, heading: 0, burn: 0 }, f: Craft = { x: Math.cos(a0) * 6 * R, y: Math.sin(a0) * 6 * R, vx: cruise + 3 * R, vy: 0, heading: 0, burn: 0 }, gun = fighterGun();
        let dead = false, n = 0;
        for (let t = 0, dt = 1 / 60; t < 2 && !dead; t += dt) {
          const la = leadAt(f, c.x, c.y, c.vx, c.vy, gun.u);
          [want.x, want.y] = [Math.cos(la) * (cruise + 3 * R), Math.sin(la) * (cruise + 3 * R)];
          thrust(f, ACC * R, TURN, dt);
          const p = pull(g, dt, n < BURST && (n > 0 || (inArc(f, c.x, c.y, c.vx, c.vy, gun.u, GUN_ARC) && Math.hypot(c.x - f.x, c.y - f.y) < GUN * R)), BURST, RATE, GAP);
          if (p) [n] = [n + 1, shots.fire(gun, g, p === 1, f.x, f.y, f.vx, f.vy, f.heading, c.x, c.y, c.vx, c.vy)];
          if (evade) {
            jk.cool = Math.max(0, jk.cool - dt);
            const m = menace(c, [f], shots, 'pirate', SR, R);
            if (m) startJink(c, jk, m.x, m.y, m.vx, m.vy);
          }
          if (!(evade && jinkStep(jk, cruise, dt))) [want.x, want.y] = [cruise, 0];
          thrust(c, P_ACC * cruise, P_TURN, dt);
          shots.step(dt, [], [{ x: c.x, y: c.y, vx: c.vx, vy: c.vy, r: SR, team: 'pirate', kill: () => void (dead = true) }], 0, () => {});
        }
        if (dead) kills++;
      }
      return kills / 200;
    };
    const straight = run(false), jinking = run(true);
    console.log(`evasion: one burst from a fighter run 6 R behind kills a straight raider ${(100 * straight).toFixed(0)}%, a jinking one ${(100 * jinking).toFixed(0)}% (× ${(jinking / straight).toFixed(2)})`);
    assert.ok(jinking <= 0.7 * straight && jinking >= 0.1, `jinking pays, but they still die: ${straight}, ${jinking}`);
  }
  // (c) A 1 R body on course for a fleet of 8: closing at 2 × cruise it kills nobody (scatter + steering); at 4 × it is not dodged.
  for (const k of [2, 4]) for (const fps of [30, 120]) {
    const w = world(5, { still: true }), dt = 1 / fps;
    w.pirates.launch(U(8));
    for (let t = 0; t < 2; t += dt) w.frame(dt);
    const fl = w.pirates.fleet!, a = alive(w), cx = a.reduce((s, q) => s + q.x, 0) / a.length, cy = a.reduce((s, q) => s + q.y, 0) / a.length;
    const v = Math.hypot(fl.flag.vx, fl.flag.vy), ux = fl.flag.vx / v, uy = fl.flag.vy / v, rel = k * fl.v * R;
    w.bodies.push({ ...w.mk(cx + ux * 2.2 * rel, cy + uy * 2.2 * rel, fl.flag.vx - ux * rel, fl.flag.vy - uy * rel, 1, { rock: 1 }), r: R });
    for (let t = 0; t < 5; t += dt) w.frame(dt);
    if (fps === 120) console.log(`scatter: a 1 R body closing at ${k} × cruise on a fleet of 8 kills ${w.pirates.deaths.body}`);
    assert.ok(k === 2 ? w.pirates.deaths.body === 0 : w.pirates.deaths.body >= 1, `a body at ${k} × cruise: ${w.pirates.deaths.body} deaths`);
  }

  // 7. Retreat: half the ships killed, or every hauler, and they leave.
  for (const what of ['half', 'haulers'] as const) {
    const w = world(9), dt = 1 / 60;
    rock(w, 1.1);
    w.pirates.launch(U(10));
    for (let t = 0; t < 8; t += dt) w.frame(dt);
    const doomed = what === 'half' ? alive(w).filter((s) => s.kind !== 'hauler').slice(0, Math.ceil(alive(w).length / 2)) : alive(w).filter((s) => s.kind === 'hauler');
    const marks = w.pirates.marks(), ships = alive(w);
    for (const s of doomed) marks[ships.indexOf(s)].kill();
    let t = 0;
    for (; t < 1 && w.pirates.fleet?.state !== 'leave'; t += dt) w.frame(dt);
    console.log(`retreat: ${what === 'half' ? 'half the ships' : 'every hauler'} lost → leaving after ${t.toFixed(2)} s`);
    assert.equal(w.pirates.fleet?.state, 'leave', `they leave when ${what} are lost`);
  }

  // 8. Rules kept: never at you unless an attack is due and your civilization is active; chips ≤ CHIP_MAX of your water and air a raid; stolen ≤ STEAL a hauler.
  {
    const run = (hunt: boolean, active: boolean, stock: number, T: number) => {
      const w = world(11, { moons: 4, civ: true, stock }), dt = 1 / 60;
      (w.ctx.civ as { state: { active: boolean } }).state.active = active;
      w.pirates.launch(U(6));
      let atYou = 0, chip = 0, stolen = 0, haulers = 0;
      for (let t = 0; t < T; t += dt) {
        if (hunt) w.pirates.attack();
        w.frame(dt);
        if (!w.pirates.fleet) w.pirates.launch(U(6));
        const fl = w.pirates.fleet!;
        if (fl.target?.kind === 'you') atYou += dt;
        if (fl.cap > 0) chip = Math.max(chip, fl.chip / fl.cap);
        for (const s of fl.ships) if (s.kind === 'hauler') [stolen, haulers] = [Math.max(stolen, s.stolen.ore + s.stolen.vol), fl.ships.filter((q) => q.kind === 'hauler').length];
      }
      return { atYou, chip, stolen, haulers };
    };
    const calm = run(false, true, 50, 50), idle = run(true, false, 50, 50), open = run(true, true, 0, 60), rich = run(true, true, 500, 60);
    console.log(`rules: at you ${calm.atYou.toFixed(1)} s with no attack due, ${idle.atYou.toFixed(1)} s with no active civilization; a raid on an empty store chipped at most ${(100 * open.chip).toFixed(0)}% of the raid's CHIP_MAX cap; on a rich one a hauler stole at most ${rich.stolen.toFixed(0)} u (cap ${STEAL}, ${rich.haulers} haulers; at you ${rich.atYou.toFixed(1)} s)`);
    assert.ok(calm.atYou === 0 && idle.atYou === 0 && open.atYou > 0 && rich.atYou > 0, 'they go for you only while an attack is due on an active civilization');
    assert.ok(open.chip > 0 && open.chip <= 1 + 1e-9, `chips stay under CHIP_MAX: ${open.chip}`);
    assert.ok(rich.stolen > 0 && rich.stolen <= STEAL + 1e-9, `stolen ≤ STEAL a hauler: ${rich.stolen}`);
  }

  // 8b. Raid harm with a real shield: pirate rounds (PIRATE_K) now drain it first (rules.ts shieldShot, its stun keeping it
  // from mending under fire); the old body rule ignored them (under its minimum), so they stole with the shield up.
  // A rich store (500 u), an attack due for 60 s, 3 seeds, shield levels 1 and 2, old rule against new.
  {
    const harm = (L: number, rule: 'old' | 'new', seed: number, store = 500) => {
      const sh: Shield = { level: L, s: SHIELD_K * L }, w = world(seed, { moons: 4, civ: true, stock: store }), dt = 1 / 60, civ = w.ctx.civ as unknown as { shieldTake: (k: number, share: number) => boolean; stocks: { ore: number } };
      civ.shieldTake = (k) => (rule === 'old' ? false : sh.s > 0 ? (shieldShot(sh, k), true) : (shieldShot(sh, k), false));
      w.pirates.launch(U(6));
      let down = 0, chip = 0, first = Infinity;
      for (let t = 0; t < 60; t += dt) {
        w.pirates.attack();
        shieldRegen(sh, dt);
        w.frame(dt);
        if (!w.pirates.fleet) w.pirates.launch(U(6));
        const fl = w.pirates.fleet!;
        chip = Math.max(chip, fl.chip / Math.max(1e-12, w.ctx.me.m));
        if (sh.s <= 0) down += dt;
        if (civ.stocks.ore < store && first === Infinity) first = t;
      }
      return { stolen: store - civ.stocks.ore, down, chip, first };
    };
    const rows: string[] = [];
    let stolenOld = 0, stolenNew = 0;
    for (const L of [1, 2]) for (const rule of ['old', 'new'] as const) {
      const rs = [11, 12, 13].map((s) => harm(L, rule, s)), m = (f: (r: (typeof rs)[number]) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
      if (rule === 'old') stolenOld += m((r) => r.stolen);
      else stolenNew += m((r) => r.stolen);
      const firsts = rs.map((r) => r.first).filter(Number.isFinite);
      rows.push(`L${L} ${rule}: stolen ${m((r) => r.stolen).toFixed(1)} u, first theft ${firsts.length ? `${(firsts.reduce((a, b) => a + b, 0) / firsts.length).toFixed(1)} s` : 'never'}, shield down ${m((r) => r.down).toFixed(1)} s, chipped ${(100 * m((r) => r.chip)).toFixed(3)}% of you`);
    }
    for (const rule of ['old', 'new'] as const) {
      const rs = [11, 12, 13].map((s) => harm(1, rule, s, 0));
      rows.push(`L1 ${rule}, empty store: chipped ${(100 * rs.reduce((a, r) => a + r.chip, 0) / rs.length).toFixed(3)}% of you (water and air), shield down ${(rs.reduce((a, r) => a + r.down, 0) / rs.length).toFixed(1)} s`);
    }
    console.log(`raid harm (60 s attack on a 500 u store, 3 seeds):\n  ${rows.join('\n  ')}`);
    assert.ok(stolenNew <= stolenOld + 1e-9, `a shield now protects the store first (${stolenNew} vs ${stolenOld})`);
  }

  // 9. Frame rate: the same seed at 30 and 120 fps goes through the same states; the first crack within 15%.
  {
    let worst = 0;
    for (let seed = 1; seed <= 6; seed++) {
      assert.equal(states[30][seed], states[120][seed], `same states at 30 and 120 fps (seed ${seed})`);
      worst = Math.max(worst, Math.abs(cracks[30][seed] - cracks[120][seed]) / cracks[120][seed]);
    }
    console.log(`frame rate: 6 seeds, same states at 30 and 120 fps (${states[30][1]}), first crack ${cracks[30][1].toFixed(2)} vs ${cracks[120][1].toFixed(2)} s, worst gap ${(100 * worst).toFixed(1)}%`);
    assert.ok(worst <= 0.15, `the first crack at about the same time: ${worst}`);
  }

  // Cost: pirates.update for 14 ships among 400 bodies (0.001–0.05 of you, belt-like), 60 fps, 10 s.
  {
    const w = world(21, { still: true }), rnd = seeded(5);
    for (let i = 0; i < 400; i++) w.bodies.push(w.mk((rnd() - 0.5) * 120 * R, (rnd() - 0.5) * 70 * R, (rnd() - 0.5) * 0.4 * R, (rnd() - 0.5) * 0.4 * R, Math.min(0.05, 0.001 * (1 - rnd()) ** (-1 / 0.6)), { rock: 1 }));
    w.pirates.launch(0.9999);
    const dt = 1 / 60, times: number[] = [], up = w.pirates.update;
    w.pirates.update = (d, civ) => {
      const t0 = performance.now();
      up(d, civ);
      times.push(performance.now() - t0);
    };
    for (let f = 0; f < 600 && w.pirates.fleet; f++) w.frame(dt);
    const warm = times.slice(60);
    console.log(`cost: pirates.update with ${w.pirates.fleet?.ships.length ?? 0} ships among 400 bodies: mean ${(warm.reduce((a, b) => a + b, 0) / warm.length).toFixed(3)} ms, p95 ${q(warm, 0.95).toFixed(3)} ms (Node, not the browser)`);
  }
  report(models);
}
