// node test/civilization/guns.test.ts: rounds are pooled, never tunnel, keep to the arc; `pick` and `nearest` choose targets;
// a fighter stops some rockets; lances hit drifting rocks; bolts stay visible at every zoom; rockets turn at most
// ROCKET.turn, fly exactly their range, alternate pads, hit ships often and fast ones rarely.
import assert from 'node:assert/strict';
import { craft, disc, fighterGun, q, R, rocketAt, seeded, SR } from './fakes.ts';
import { BURST, F_PATROL_V, F_TURN, GAP, GUN, GUN_ARC, leadAt, RATE, SHOT_S, SHOT_V, SPREAD, wrap } from '../../src/evolution/civilization/flight.ts';
import { BOLT, createRockets, createShots, DOT_GLOW, DOT_LIT, least, MAX_GLOW, pick, nearest, pull, SHOTS, trigger, type Gun, type Hull } from '../../src/evolution/civilization/guns.ts';
import { ARMS, FLEET, FRAG, PREY, ROCKET } from '../../src/evolution/civilization/rules.ts';
import { fireRange } from '../../src/evolution/civilization/mining.ts';

// Rounds (flight.ts createShots): the pool holds SHOTS at most; a SHOT_V (22 R/s) round cannot tunnel through a 0.09 R ship at 30
// fps; nothing fires at a lead point outside the arc; bursts at a ship crossing at 4 R/s from 5 R kill some of the time.
{
  const shots = createShots(), g = trigger(), gun = fighterGun(), far = disc(1e6, 0, R);
  let ok = 0;
  for (let i = 0; i < 200; i++) if (shots.fire(gun, g, i === 0, 0, 0, 0, 0, 0, 10 * R, 0, 0, 0)) ok++;
  assert.ok(ok === SHOTS && shots.n === SHOTS, `the pool holds ${SHOTS} rounds at most: ${ok}`);
  shots.step(1, [far], [], 0, () => {});
  assert.equal(shots.n, 0, 'spent rounds leave the pool');
  assert.ok(!shots.fire(gun, g, true, 0, 0, 0, 0, 0, 0, 5 * R, 0, 0), 'no round at a lead point outside the arc');
  let hit = false;
  const ship: Hull = { x: 5 * R, y: 0, r: 0.09 * R, team: 'pirate', kill: () => void (hit = true) };
  shots.fire({ ...gun, spread: 0 }, g, true, 0, 0, 0, 0, 0, ship.x, ship.y, 0, 0);
  for (let f = 0; f < 30 && shots.n; f++) shots.step(1 / 30, [], [ship], 0, () => {});
  assert.ok(hit, `a ${SHOT_V} R/s round at 30 fps does not tunnel through a 0.09 R ship`);
  // Bursts of BURST at RATE from a still fighter tracking a ship that crosses its nose 5 R out at 4 R/s.
  let kills = 0;
  const N = 400, rnd = seeded(11);
  for (let i = 0; i < N; i++) {
    const pool = createShots(SHOTS, rnd), c = craft(0, 0), tg = trigger();
    let dead = false;
    const foe: Hull = { x: 5 * R, y: -0.5 * R, vx: 0, vy: 4 * R, r: 0.09 * R, team: 'pirate', kill: () => void (dead = true) };
    for (let f = 0, dt = 1 / 60; f < 60 && !dead; f++) {
      c.heading = leadAt(c, foe.x, foe.y, foe.vx!, foe.vy!, gun.u);
      const p = pull(tg, dt, f < 36, BURST, RATE, GAP);
      if (p) pool.fire(gun, tg, p === 1, c.x, c.y, 0, 0, c.heading, foe.x, foe.y, foe.vx!, foe.vy!);
      foe.y += foe.vy! * dt;
      pool.step(dt, [], [foe], 0, () => {});
    }
    if (dead) kills++;
  }
  console.log(`rounds: pool capped at ${SHOTS}; a burst at a ship crossing at 4 R/s, 5 R out, kills it ${((kills / N) * 100).toFixed(0)}% of the time (${N} seeded bursts, aim error ±${SPREAD} rad a burst)`);
  assert.ok(kills / N >= 0.35 && kills / N <= 0.75, `a burst at a crossing ship kills 35–75%: ${kills / N}`);
}
// Rockets as targets (guns.ts pick): a rocket first, then a frigate, before a fighter at the same distance; your priority ship
// before either. Point defence: a rival rocket (rules.ts ROCKET, guided at the world, a seeded pad side) from 7–11 R at a world
// (the origin); a home fighter 2–4 R out on its side fires bursts of BURST rounds every GAP s (RATE/s, SPREAD aim error, its
// nose on the lead point) while the rocket is within GUN R. To rounds a rocket is ROCKET.size × a ship's hit radius. 400 seeded tries.
{
  const ship = { x: 4 * R, y: 0, kill() {}, cls: 'fighter' as const }, frig = { x: 0, y: 4 * R, kill() {}, cls: 'frigate' as const }, rk = { x: -4 * R, y: 0, kill() {}, cls: 'rocket' as const };
  assert.equal(pick([ship, frig, rk], 0, 0, 9 * R), rk, 'a rocket first');
  assert.equal(pick([ship, frig], 0, 0, 9 * R), frig, 'then a frigate');
  assert.equal(pick([ship, { ...frig, y: 6 * R }], 0, 0, 9 * R), ship, 'a fighter much nearer than a frigate');
  assert.equal(pick([{ ...rk, x: -10 * R }], 0, 0, 9 * R), undefined, 'none out of range');
  assert.equal(pick([ship, frig, rk], 0, 0, 9 * R, ship), ship, 'your priority ship before a rocket or a frigate');
  const rnd = seeded(77), world = disc(0, 0, R);
  let killed = 0;
  for (let i = 0; i < 400; i++) {
    const a = rnd() * 2 * Math.PI, L = 7 + 4 * rnd(), pool = createRockets(12, seeded(500 + i)), shots = createShots(SHOTS, seeded(i)), g = trigger();
    const m = pool.launch(rocketAt(R, { team: 'rival', x: Math.cos(a) * L * R, y: Math.sin(a) * L * R, tx: 0, ty: 0, seek: () => ({ x: 0, y: 0, vx: 0, vy: 0, r: R }) }))!;
    const b = a + (rnd() - 0.5) * 1.5, d = (2 + 2 * rnd()) * R, sx = Math.cos(b) * d, sy = Math.sin(b) * d;
    const gun: Gun = { team: 'you', u: SHOT_V * R, life: SHOT_S, arc: GUN_ARC, spread: SPREAD, tint: 0 };
    for (let f = 0; f < 6 * 60 && !m.dead && pool.live.length; f++) {
      const h = 1 / 60, c = craft(sx, sy);
      c.heading = leadAt(c, m.x, m.y, m.vx, m.vy, gun.u);
      const p = pull(g, h, Math.hypot(m.x - sx, m.y - sy) < GUN * R, BURST, RATE, GAP);
      if (p) shots.fire(gun, g, p === 1, sx, sy, 0, 0, c.heading, m.x, m.y, m.vx, m.vy);
      pool.step(h, [world], [], 0, () => {}, () => {});
      shots.step(h, [], m.dead ? [] : [{ x: m.x, y: m.y, vx: m.vx, vy: m.vy, r: SR * ROCKET.size, team: m.team, kill: m.kill }], 0, () => {});
    }
    if (m.dead) killed++;
  }
  console.log(`point defence: one fighter's bursts (${BURST} rounds every ${GAP} s) kill an inbound rocket (${ROCKET.speed} R/s, from 7–11 R, ${ROCKET.size} × a ship's radius) ${((100 * killed) / 400).toFixed(0)}% of the time`);
  assert.ok(killed >= 0.3 * 400 && killed <= 0.55 * 400, `one fighter stops a third to a half of the rockets (${killed / 400})`);
  // A rocket with its own `hit` gives its effect to its own target only; a body in the way just stops it.
  const pool = createRockets(12, seeded(4)), rock = disc(5 * R, 0, 0.5 * R), other = disc(20 * R, 0, 0.5 * R), got: unknown[] = [];
  pool.launch(rocketAt(R, { tx: 20 * R, target: other, hit: (q) => got.push(q) }, 30));
  for (let t = 0; pool.live.length && t < 5; t += 1 / 60) pool.step(1 / 60, [rock, other], [], 0, () => got.push('combat'), () => {});
  assert.deepEqual(got, [], 'a rocket stopped by a body that is not its target does nothing to it');
  console.log('rockets as targets ok: pick takes your priority, then a rocket, a frigate, a fighter; a rocket hits only its own target');
}
// Lance bolts (ARMS.lance) at drifting rocks: a frigate circling its world (the origin) 3 R out at F_PATROL_V turns its nose
// (F_TURN) onto the lead point and fires one salvo once it bears; the rock (FRAG–FLEET.frigate.breaks of the world, 5–25 R
// out, drifting 0.5–3 R/s inward and ±2 R/s sideways) falls in the world's gravity (1 R/s² at its surface), so a slow bolt
// meets it a little off its straight-line lead. The share of bolts that hit stays at least the TTK table's ARMS.lance.hit.
{
  const L = ARMS.lance, rnd = seeded(5), N = 300, h = 1 / 60;
  let fired = 0, hits = 0;
  const flights: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = rnd() * 2 * Math.PI, D = (5 + 20 * rnd()) * R, r = R * Math.cbrt(FRAG + (FLEET.frigate.breaks - FRAG) * rnd()), vin = (0.5 + 2.5 * rnd()) * R, vt = (2 * rnd() - 1) * 2 * R;
    const rock = disc(Math.cos(a) * D, Math.sin(a) * D, r, -Math.cos(a) * vin - Math.sin(a) * vt, -Math.sin(a) * vin + Math.cos(a) * vt);
    const shots = createShots(SHOTS, seeded(100 + i)), g = trigger(), w = F_PATROL_V / 3, gun: Gun = { team: 'you', u: L.u * R, life: L.life, arc: L.arc, spread: L.spread, tint: 0 };
    let th = rnd() * 2 * Math.PI, out = 0, t = 0, t0 = 0;
    const c = craft(0, 0, 0, 0, th + Math.PI / 2);
    for (; t < 8 && (out < L.salvo || shots.n); t += h) {
      th += w * h;
      [c.x, c.y, c.vx, c.vy] = [Math.cos(th) * 3 * R, Math.sin(th) * 3 * R, -Math.sin(th) * F_PATROL_V * R, Math.cos(th) * F_PATROL_V * R];
      const m = rock.motion, d = Math.hypot(m.x, m.y), ga = (R * R * R) / (d * d * d);
      [m.vx, m.vy] = [m.vx - m.x * ga * h, m.vy - m.y * ga * h];
      [m.x, m.y] = [m.x + m.vx * h, m.y + m.vy * h];
      if (out < L.salvo) {
        const lead = leadAt(c, m.x, m.y, m.vx, m.vy, gun.u), da = wrap(lead - c.heading);
        c.heading += Math.sign(da) * Math.min(Math.abs(da), F_TURN * h);
        const p = pull(g, h, Math.abs(wrap(lead - c.heading)) <= L.arc, L.salvo, 1 / L.gap, Infinity);
        if (p && shots.fire(gun, g, p === 1, c.x, c.y, c.vx, c.vy, c.heading, m.x, m.y, m.vx, m.vy, rock)) [out, fired, t0] = [out + 1, fired + 1, out ? t0 : t];
      }
      shots.step(h, [rock], [], 0, () => void (hits++, flights.push(t - t0)));
    }
  }
  console.log(`lance at drifting rocks (${N} salvos of ${L.salvo}, ${L.u} R/s, ${L.life} s): ${hits} of ${fired} bolts hit (${((100 * hits) / fired).toFixed(1)}%), median flight ${q(flights, 0.5).toFixed(2)} s`);
  assert.ok(hits / fired >= L.hit, `lance bolts hit drifting rocks at least ARMS.lance.hit: ${hits / fired}`);
}
// `nearest` (rival ships' aim): the closest ship within range and nothing beyond.
{
  const near = { x: 4 * R, y: 0, kill() {} }, nearer = { x: 0, y: 3 * R, kill() {} }, far = { x: 0, y: -(PREY + 0.5) * R, kill() {} };
  assert.equal(nearest([near, far, nearer], 0, 0, PREY * R), nearer, 'the nearest ship in range');
  assert.equal(nearest([far], 0, 0, PREY * R), undefined, 'none out of range');
}
// Bolt looks (guns.ts BOLT, drawn additively by combat.ts): from close in (zoom 3) to far out (0.024), round worlds of
// radius 16–500, each class's bright middle (DOT_LIT of its glow quad) and visible glow (DOT_GLOW) stay a few screen px
// wide; heavier guns look bigger; the worst frame fits MAX_GLOW. Slower rounds keep their reach; flight.ts reads ARMS.round.
{
  const unit = (Rw: number, z: number) => Math.max(0.4 * Rw, 8 / z) / 28; // render/tech.ts shipUnit
  const low: Record<string, number> = {};
  for (const z of [3, 1, 0.098, 0.039, 0.024]) for (const Rw of [16, 40, 300, 500]) {
    const px = (k: keyof typeof BOLT, q: 'glow' | 'core' = 'glow') => least(BOLT[k][q].k, BOLT[k][q].px, unit(Rw, z), z) * z;
    for (const k of Object.keys(BOLT) as (keyof typeof BOLT)[]) low[k] = Math.min(low[k] ?? Infinity, px(k) * DOT_LIT);
    low.glow = Math.min(low.glow ?? Infinity, px('round') * DOT_GLOW);
    low.lanceGlow = Math.min(low.lanceGlow ?? Infinity, px('lance') * DOT_GLOW);
    assert.ok(px('lance') > px('shell') && px('shell') > px('round') && px('round') > px('probe') && px('round') > px('round', 'core'), `heavier bolts are bigger (zoom ${z}, R ${Rw})`);
  }
  const e = 1e-9, f = (x: number) => x.toFixed(1);
  console.log(`bolts: bright middle ≥ ${f(low.round)} px round, ${f(low.probe)} probe, ${f(low.pirate)} pirate, ${f(low.shell)} shell, ${f(low.lance)} lance; glow ≥ ${f(low.glow)} px round, ${f(low.lanceGlow)} lance`);
  assert.ok(low.round >= 2.8 - e && low.pirate >= 2.8 - e && low.probe >= 2.2 - e && low.lance >= 4.8 - e, 'bright middles stay a few px wide at every zoom');
  assert.ok(low.glow >= 5.8 && low.lanceGlow >= 10 - e, 'glows stay ~6 px (rounds) and 10 px (lances) wide');
  // A rocket hull (bolts.ts): ROCKET.len of its unit, at least ROCKET.px on screen, never over 0.6 of its shooter's radius (zoomed far out).
  for (const z of [3, 1, 0.098, 0.024]) for (const Rw of [16, 40, 500]) {
    const len = Math.min(Math.max(ROCKET.len * Rw, ROCKET.px / z), 0.6 * Rw) * z;
    assert.ok(len <= 0.6 * Rw * z + e && len >= Math.min(ROCKET.px, 0.6 * Rw * z) - e, `a rocket is ${f(len)} px at zoom ${z}, R ${Rw} (its world ${f(Rw * z)} px)`);
  }
  const lances = 12, worst = SHOTS * 2 + lances + 14 + ROCKET.max * 3 + 14 * 5 + 3; // rounds (+ lance halos), muzzles, rockets (flame, jet, nozzle), pirate shields or jumps, charging glows
  console.log(`glow layer worst frame: ${worst} of ${MAX_GLOW} quads`);
  assert.ok(worst <= MAX_GLOW, `the worst frame fits the glow layer: ${worst} of ${MAX_GLOW} quads`);
  assert.ok(SHOT_V === ARMS.round.u && SHOT_S === ARMS.round.life && SHOT_V * SHOT_S >= GUN + 5, `a round reaches ${f(SHOT_V * SHOT_S)} R, past the gun range + 5 R`);
  assert.ok(ARMS.lance.u * ARMS.lance.life >= 59, `a lance bolt reaches ${f(ARMS.lance.u * ARMS.lance.life)} R`);
}
// Rockets (guns.ts createRockets, rules.ts ROCKET), flown by flight.ts `thrust` in their launch frame: the nose never turns
// faster than ROCKET.turn at 30, 60 or 240 fps and the velocity follows it; the fuel is the range (a straight shot ends at
// the fire range, mining.ts fireRange, for 1 and 5 moon slots); pads alternate sides, less off the aim from near; a direct
// hit is heavy (through shields), the blast is not; a round kills it; a body stops it; seeded hit rates on ships.
{
  const W = R, sr = SR;
  for (const dt of [1 / 30, 1 / 60, 1 / 240]) {
    const pool = createRockets(12, seeded(3)), t = { x: 6 * W, y: 3 * W, vx: 0, vy: 4 * W };
    const m = pool.launch({ team: 'you', x: 0, y: 0, vx: 3 * W, vy: -2 * W, r: W, tx: t.x, ty: t.y, R: W, range: fireRange(1) * W, seek: () => t })!;
    let rate = 0, slip = 0, h0 = m.heading;
    while (pool.live.length) {
      pool.step(dt, [], [], 0, () => {}, () => {});
      t.y += t.vy * dt;
      [rate, h0] = [Math.max(rate, Math.abs(wrap(m.heading - h0)) / dt), m.heading];
      slip = Math.max(slip, Math.abs(wrap(Math.atan2(m.vy - m.v0y, m.vx - m.v0x) - m.heading)));
    }
    assert.ok(rate <= ROCKET.turn + 1e-9 && slip <= 0.15, `at 1/${Math.round(1 / dt)} s the nose turns ≤ ${ROCKET.turn} rad/s (${rate.toFixed(3)}), slip ≤ 0.15 rad (${slip.toFixed(3)})`);
  }
  for (const slots of [1, 5]) {
    const pool = createRockets(12, seeded(5)), range = fireRange(slots);
    let end = 0;
    pool.launch({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, r: W, tx: 100 * W, ty: 0, R: W, range: range * W });
    for (let i = 0; i < 900 && pool.live.length; i++) pool.step(1 / 60, [], [], 0, () => {}, (m) => void (end = Math.hypot(m.x, m.y) / W - 1));
    assert.ok(Math.abs(end - range) <= 0.3, `a straight shot ends ${end.toFixed(2)} R off the surface, its fire range ${range.toFixed(1)} R (${slots} slots)`);
  }
  { // pads: alternating sides, the full ROCKET.pad from afar, less from near
    const pool = createRockets(12, seeded(7)), at = (tx: number) => wrap(pool.launch({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, r: W, tx, ty: 0, R: W, range: 10 * W })!.heading);
    const a = at(30 * W), b = at(30 * W), c = at(3 * W);
    assert.ok(Math.abs(Math.abs(a) - ROCKET.pad) < 1e-9 && Math.sign(a) === -Math.sign(b), `sides alternate, ±${ROCKET.pad} rad from afar (${a.toFixed(2)}, ${b.toFixed(2)})`);
    assert.ok(Math.abs(c) < ROCKET.pad * 0.25, `less from near (${c.toFixed(2)})`);
  }
  { // a direct hit is heavy, a ship in the blast takes a plain hit; a round kills a rocket; a body stops one
    const pool = createRockets(12, seeded(9)), kills: string[] = [];
    pool.launch({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, r: W, tx: 6 * W, ty: 0, R: W, range: 20 * W, seek: () => ({ x: 6 * W, y: 0, vx: 0, vy: 0 }), fuze: true });
    const ships: Hull[] = [{ x: 6 * W, y: 0, r: sr, team: 'pirate', kill: (h) => void kills.push(h ? 'direct' : 'blast') }, { x: 6 * W, y: 0.4 * W, r: sr, team: 'pirate', kill: (h) => void kills.push(h ? 'direct2' : 'blast2') }];
    let end = '';
    for (let i = 0; i < 300 && pool.live.length; i++) pool.step(1 / 60, [], ships, 0, () => {}, (m, x, y, e) => void (end = e));
    assert.ok(end === 'burst' && kills.includes('direct') && kills.includes('blast2') && kills.length === 2, `the locked ship takes the direct (heavy) hit, its neighbour the blast: ${kills}`);
    const p2 = createRockets(12, seeded(9)), rk = p2.launch({ team: 'rival', x: 10 * W, y: 0, vx: 0, vy: 0, r: W, tx: 0, ty: 0, R: W, range: 20 * W })!;
    p2.step(0.1, [], [], 0, () => {}, () => {});
    rk.kill(); // a round's hit (combat.ts lists a rocket as a hull of ROCKET.size × a ship's radius)
    p2.step(1 / 60, [], [], 0, () => {}, (m, x, y, e) => void (end = e));
    assert.ok(rk.dead && end === 'shot', `a killed rocket ends as shot down (${end})`);
    const p3 = createRockets(12, seeded(9)), rock = disc(6 * W, 0, 1.5 * W);
    let stopped = false;
    p3.launch({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, r: W, tx: 10 * W, ty: 0, R: W, range: 20 * W, seek: () => ({ x: 10 * W, y: 0, vx: 0, vy: 0 }) });
    for (let i = 0; i < 300 && p3.live.length; i++) p3.step(1 / 60, [rock], [], 0, () => void (stopped = true), () => {});
    assert.ok(stopped, 'a rock in its path stops it');
  }
  // Seeded hit rates on a ship (hit radius SR) from a still world, 300 launches each, fuel 16.8 R (1 slot).
  const rate = (mk: (rnd: () => number) => { s: { x: number; y: number; vx: number; vy: number }; move: (t: number, dt: number) => void }) => {
    const rnd = seeded(17);
    let hit = 0;
    for (let i = 0; i < 300; i++) {
      const pool = createRockets(12, rnd), { s, move } = mk(rnd);
      let dead = false;
      pool.launch({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, r: W, tx: s.x, ty: s.y, R: W, range: fireRange(1) * W, seek: () => s, fuze: true });
      for (let t = 0, dt = 1 / 60; t < 6 && pool.live.length; t += dt) {
        move(t, dt);
        pool.step(dt, [], [{ ...s, r: sr, team: 'pirate', kill: () => void (dead = true) }], 0, () => {}, () => {});
      }
      if (dead) hit++;
    }
    return hit / 300;
  };
  const line = (v: number, d: number, across: boolean) => (rnd: () => number) => {
    const a = rnd() * 2 * Math.PI, sg = rnd() < 0.5 ? 1 : -1, s = { x: Math.cos(a) * d * W, y: Math.sin(a) * d * W, vx: (across ? -Math.sin(a) * sg : -Math.cos(a)) * v * W, vy: (across ? Math.cos(a) * sg : -Math.sin(a)) * v * W };
    return { s, move: (t: number, dt: number) => void ([s.x, s.y] = [s.x + s.vx * dt, s.y + s.vy * dt]) };
  };
  const orbit = rate((rnd) => {
    const a = rnd() * 2 * Math.PI, p = rnd() * 2 * Math.PI, cx = Math.cos(a) * 8 * W, cy = Math.sin(a) * 8 * W, s = { x: cx + 2 * W * Math.cos(p), y: cy + 2 * W * Math.sin(p), vx: 0, vy: 0 };
    return { s, move: (t: number) => void ([s.x, s.y, s.vx, s.vy] = [cx + 2 * W * Math.cos(p + 1.5 * t), cy + 2 * W * Math.sin(p + 1.5 * t), -3 * W * Math.sin(p + 1.5 * t), 3 * W * Math.cos(p + 1.5 * t)]) };
  });
  const cross = rate(line(6, 8, true)), close = rate(line(6, 14, false)), fast = rate(line(10, 8, true));
  console.log(`rockets (${ROCKET.speed} R/s, ≤ ${ROCKET.turn} rad/s) on a ship: orbiting at 3 R/s ${(100 * orbit).toFixed(0)}%, crossing at 6 R/s ${(100 * cross).toFixed(0)}%, closing at 6 R/s ${(100 * close).toFixed(0)}%, crossing at 10 R/s ${(100 * fast).toFixed(0)}%`);
  assert.ok(orbit >= 0.6 && cross >= 0.3 && close >= 0.3, 'a rocket hits a patrolling, crossing or closing ship often');
  assert.ok(fast <= 0.2, 'a ship crossing at 10 R/s mostly slips it (no undefeatable rocket)');
}
