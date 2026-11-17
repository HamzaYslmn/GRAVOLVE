// node test/civilization/guns.test.ts: rounds are pooled, never tunnel, keep to the arc; `pick` and `nearest` choose targets;
// a fighter stops some rockets; lances hit drifting rocks; bolts stay visible at every zoom; rockets fly by real thrust
// (nose ≤ ROCKET.turn, push ≤ ROCKET.acc), fly exactly their range, alternate pads, keep to a clicked point's ray and scan
// past your mining reach, hit a clicked rock from a moving world, and come round onto fast or late-breaking ships.
import assert from 'node:assert/strict';
import { craft, disc, fighterGun, q, R, rocketAt, seeded, SR } from './fakes.ts';
import { BURST, F_PATROL_V, F_TURN, GAP, GUN, GUN_ARC, leadAt, RATE, SHOT_S, SHOT_V, SPREAD, wrap } from '../../src/evolution/civilization/flight.ts';
import { BOLT, createRockets, createShots, DOT_GLOW, DOT_LIT, least, MAX_GLOW, pick, nearest, pull, SHOTS, spot, trigger, type Gun, type Hull, type Lock, type Rocket } from '../../src/evolution/civilization/guns.ts';
import { ARMS, FLEET, FRAG, PREY, ROCKET } from '../../src/evolution/civilization/rules.ts';
import { fireRange, reach } from '../../src/evolution/civilization/mining.ts';

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
  assert.ok(low.round >= 2.1 - e && low.pirate >= 2.1 - e && low.probe >= 1.7 - e && low.lance >= 3.6 - e, 'bright middles stay a few px wide at every zoom');
  assert.ok(low.glow >= 4.4 && low.lanceGlow >= 7.5, 'glows stay ~4.4 px (rounds) and 7.5 px (lances) wide');
  // A rocket hull (bolts.ts) is drawn in the ships' unit: ≤ 0.95 × the rival probe, the smallest ship (0.4 = tech.ts
  // SHIP_SCALE, a Pixi module; 40 / 160 the probe's share of a cell).
  assert.ok(ROCKET.len / 0.4 <= 0.95 * 40 / 160 + e, `a rocket is ${f((ROCKET.len / 0.4) * 100)}% of a ship cell`);
  const lances = 12, worst = SHOTS * 2 + lances + 14 + ROCKET.max * 3 + 14 * 5 + 3; // rounds (+ lance halos), muzzles, rockets (flame, jet, nozzle), pirate shields or jumps, charging glows
  console.log(`glow layer worst frame: ${worst} of ${MAX_GLOW} quads`);
  assert.ok(worst <= MAX_GLOW, `the worst frame fits the glow layer: ${worst} of ${MAX_GLOW} quads`);
  assert.ok(SHOT_V === ARMS.round.u && SHOT_S === ARMS.round.life && SHOT_V * SHOT_S >= GUN + 5, `a round reaches ${f(SHOT_V * SHOT_S)} R, past the gun range + 5 R`);
  assert.ok(ARMS.lance.u * ARMS.lance.life >= 59, `a lance bolt reaches ${f(ARMS.lance.u * ARMS.lance.life)} R`);
}
// Rockets (guns.ts createRockets, rules.ts ROCKET), real thrust in their target's frame: at 30, 60 or 240 fps the nose never
// turns faster than ROCKET.turn, the push never tops ROCKET.acc, the path lags the nose through a turn (slip) and a straight
// shot does not slip; the fuel is the range (a straight shot ends at the fire range, mining.ts fireRange, for 1 and 5 moon
// slots); pads alternate sides, less off the aim from near; a point shot (combat.ts: the world-fixed ray through the click)
// keeps to its ray and locks an enemy ship its scan finds; a direct hit is heavy (through shields), the blast is not; a
// round kills it; a body stops it; seeded hit rates on ships.
{
  const W = R, sr = SR;
  // A moving shooter (3, −2 R/s) at a ship crossing at 4 R/s, to the hit: slip and top speed in the frame the player sees
  // (against the shooter's launch velocity), top ≤ speed + |v0 − the target's velocity| + 0.5 R/s.
  for (const dt of [1 / 30, 1 / 60, 1 / 240]) {
    const pool = createRockets(12, seeded(3)), t = { x: 6 * W, y: 3 * W, vx: 0, vy: 4 * W };
    const m = pool.launch({ team: 'you', x: 0, y: 0, vx: 3 * W, vy: -2 * W, r: W, tx: t.x, ty: t.y, R: W, range: fireRange(1) * W, seek: () => t, fuze: true })!;
    let rate = 0, slip = 0, push = 0, top = 0, hit = false, h0 = m.heading, [vx, vy] = [m.vx, m.vy];
    while (pool.live.length) {
      pool.step(dt, [], [{ ...t, r: sr, team: 'pirate', kill: () => void (hit = true) }], 0, () => {}, () => {});
      t.y += t.vy * dt;
      [rate, h0] = [Math.max(rate, Math.abs(wrap(m.heading - h0)) / dt), m.heading];
      [push, top, vx, vy] = [Math.max(push, Math.hypot(m.vx - vx, m.vy - vy) / dt / W), Math.max(top, Math.hypot(m.vx - m.v0x, m.vy - m.v0y) / W), m.vx, m.vy];
      slip = Math.max(slip, Math.abs(wrap(Math.atan2(m.vy - m.v0y, m.vx - m.v0x) - m.heading)));
    }
    const at = `at 1/${Math.round(1 / dt)} s`, cap = ROCKET.speed + Math.hypot(3 - 0, -2 - 4) + 0.5;
    if (dt === 1 / 60) console.log(`rocket turn ${at}: nose ≤ ${rate.toFixed(2)} rad/s, push ≤ ${push.toFixed(1)} R/s², slip up to ${slip.toFixed(2)} rad, top ${top.toFixed(1)} R/s against the shooter (≤ ${cap.toFixed(1)})`);
    assert.ok(hit, `${at} it hits the crossing ship`);
    assert.ok(rate <= ROCKET.turn + 1e-9, `${at} the nose turns ≤ ${ROCKET.turn} rad/s (${rate.toFixed(3)})`);
    assert.ok(push <= ROCKET.acc + 1e-9, `${at} the push is ≤ ${ROCKET.acc} R/s² (${push.toFixed(2)})`);
    assert.ok(slip >= 0.5 && slip <= Math.PI / 2, `${at} the path lags the nose in the turn: slip 0.5–π/2 rad (${slip.toFixed(3)})`);
    assert.ok(top <= cap, `${at} top speed ${top.toFixed(2)} R/s against the shooter ≤ ${cap.toFixed(2)}`);
  }
  { // still shooter and ship, 3–25 R out, to the hit: the motor never brakes, so each correction adds a little speed (measured ≤ 1.07 ×)
    let top = 0;
    for (const [sx, sy] of [[2, 3], [4, 9], [-10, -15], [0, 25], [17, 17], [24, 3]]) {
      const pool = createRockets(12, seeded(3)), s = { x: sx * W, y: sy * W, vx: 0, vy: 0 }, m = pool.launch({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, r: W, tx: s.x, ty: s.y, R: W, range: fireRange(1) * W, seek: () => s, fuze: true })!;
      while (pool.live.length) {
        pool.step(1 / 60, [], [{ ...s, r: sr, team: 'pirate', kill() {} }], 0, () => {}, () => {});
        top = Math.max(top, Math.hypot(m.vx, m.vy) / W);
      }
    }
    console.log(`rocket top speed, still shooter and ship: ${top.toFixed(2)} R/s (${(top / ROCKET.speed).toFixed(3)} × speed)`);
    assert.ok(top <= 1.1 * ROCKET.speed && top <= 0.6 * ARMS.round.u, `top speed ${top.toFixed(2)} R/s ≤ 1.1 × ${ROCKET.speed} and ≤ 0.6 × a round's (${0.6 * ARMS.round.u})`);
  }
  for (const slots of [1, 5]) {
    const pool = createRockets(12, seeded(5)), range = fireRange(slots);
    let end = 0, slip = 0;
    const m = pool.launch({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, r: W, tx: 100 * W, ty: 0, R: W, range: range * W })!;
    for (let i = 0; i < 900 && pool.live.length; i++) {
      pool.step(1 / 60, [], [], 0, () => {}, (m) => void (end = Math.hypot(m.x, m.y) / W - 1));
      slip = Math.max(slip, Math.abs(wrap(Math.atan2(m.vy - m.v0y, m.vx - m.v0x) - m.heading)));
    }
    assert.ok(Math.abs(end - range) <= 0.3, `a straight shot ends ${end.toFixed(2)} R off the surface, its fire range ${range.toFixed(1)} R (${slots} slots)`);
    assert.ok(slip < 0.01, `a straight shot does not slip (${slip.toFixed(4)} rad)`);
  }
  { // pads: alternating sides, the full ROCKET.pad from afar, less from near
    const pool = createRockets(12, seeded(7)), at = (tx: number) => wrap(pool.launch({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, r: W, tx, ty: 0, R: W, range: 10 * W })!.heading);
    const a = at(30 * W), b = at(30 * W), c = at(3 * W);
    assert.ok(Math.abs(Math.abs(a) - ROCKET.pad) < 1e-9 && Math.sign(a) === -Math.sign(b), `sides alternate, ±${ROCKET.pad} rad from afar (${a.toFixed(2)}, ${b.toFixed(2)})`);
    assert.ok(Math.abs(c) < ROCKET.pad * 0.25, `less from near (${c.toFixed(2)})`);
  }
  /** A point shot as combat.ts launches it: the world-fixed ray from the launch point through the click (a point ROCKET.ahead R on), with a `scan`. */
  const rayShot = (pool: ReturnType<typeof createRockets>, vx: number, vy: number, px: number, py: number, scan: (m: Rocket) => Lock | undefined = () => undefined) => {
    const D = Math.hypot(px, py), ux = px / D, uy = py / D;
    let m: Rocket | undefined;
    const seek = () => { const k = Math.max(0, (m?.x ?? 0) * ux + (m?.y ?? 0) * uy) + ROCKET.ahead * W; return { x: ux * k, y: uy * k, vx: 0, vy: 0 }; };
    return (m = pool.launch({ team: 'you', x: 0, y: 0, vx, vy, r: W, tx: px, ty: py, R: W, range: fireRange(1) * W, seek, scan })!);
  };
  // Point shots, clicks 2–15 R off the surface from either pad, a still shooter and one moving up to 5 R/s: past your mining
  // reach (where the scan starts) they keep to the ray through the click and fly on to the end of their fuel. From rest a shot
  // passes over the click; a sideways-moving world's near click is passed wide (its sideways speed must be thrust away: printed,
  // not pinned). The motor never brakes, so top speed creeps over the nominal one (measured: 1.18 × from rest); against the
  // shooter it stays ≤ 1.2 × (speed + the forward boost) + |v0|.
  {
    const ring = (reach(1) + 1) * W, miss: Record<number, number> = {};
    let still = 0, off = 0, offStill = 0, bend = 0, over = -Infinity, ends = '';
    for (const [svx, svy] of [[0, 0], [0, 4], [-4, 0], [5, 0], [0, -5]]) for (const D of [2, 5, 10, 15]) for (const side of [0.1, 0.9]) {
      const pool = createRockets(12, () => side), px = (D + 1) * W, py = 0.5 * W, m = rayShot(pool, svx * W, svy * W, px, py), L = Math.hypot(px, py), ux = px / L, uy = py / L;
      const cap = 1.2 * (ROCKET.speed + Math.max(0, (svx * px + svy * py) / L)) + Math.hypot(svx, svy);
      let best = Infinity, d0 = NaN, o = 0, end = '';
      for (let i = 0; i < 600 && pool.live.length; i++) {
        pool.step(1 / 60, [], [], 0, () => {}, (_m, _x, _y, e) => void (end = e));
        const dir = Math.atan2(m.vy, m.vx);
        best = Math.min(best, Math.hypot(m.x - px, m.y - py) / W);
        if (Math.hypot(m.x, m.y) > ring) [o, d0] = [Math.max(o, Math.abs(m.x * uy - m.y * ux) / W), isNaN(d0) ? dir : d0];
        if (!isNaN(d0)) bend = Math.max(bend, Math.abs(wrap(dir - d0)));
        over = Math.max(over, Math.hypot(m.vx - m.v0x, m.vy - m.v0y) / W - cap);
      }
      if (svx || svy) miss[D] = Math.max(miss[D] ?? 0, best);
      else [still, offStill] = [Math.max(still, best), Math.max(offStill, o)];
      [off, ends] = [Math.max(off, o), ends + (end === 'out' ? '' : end)];
    }
    console.log(`point shots: from rest pass within ${still.toFixed(2)} R of the click and ${offStill.toFixed(2)} R of the ray past your mining reach; from a world moving ≤ 5 R/s within ${off.toFixed(2)} R of the ray, bending ≤ ${bend.toFixed(2)} rad, passing the click wide by ≤ ${Object.entries(miss).map(([D, v]) => `${v.toFixed(2)} R at ${D} R`).join(', ')}; top speed against the shooter ${(-over).toFixed(2)} R/s under its cap`);
    assert.ok(still <= 0.4 && offStill <= 0.4, `from rest a point shot passes over the click and keeps to its ray (${still.toFixed(2)}, ${offStill.toFixed(2)} R)`);
    assert.ok(off <= 1.6 && bend <= 0.6 && ends === '', `past your mining reach a point shot keeps near its ray, then flies on until its fuel is spent (${off.toFixed(2)} R, ${bend.toFixed(2)} rad, ${ends || 'out'})`);
    assert.ok(over <= 0, `top speed against the shooter ≤ 1.2 × (speed + forward boost) + |v0| (${over.toFixed(2)} R/s over)`);
  }
  { // moving fire: from 5 R/s, a click on a still rock (0.5 R) in 16 directions at 2–20 R off your surface hits it
    let hits = 0, n = 0;
    for (let k = 0; k < 16; k++) for (const D of [2, 5, 8, 11, 14, 17, 20]) for (const side of [0.1, 0.9]) {
      const a = (k / 16) * 2 * Math.PI, rock = disc(Math.cos(a) * (1 + D + 0.5) * W, Math.sin(a) * (1 + D + 0.5) * W, 0.5 * W), pool = createRockets(12, () => side);
      let got = false;
      pool.launch({ team: 'you', x: 0, y: 0, vx: 5 * W, vy: 0, r: W, tx: rock.motion.x, ty: rock.motion.y, R: W, range: fireRange(1) * W, seek: () => ({ ...rock.motion, r: rock.r }), target: rock });
      for (let i = 0; i < 600 && pool.live.length; i++) pool.step(1 / 60, [rock], [], 0, (_m, b) => void (got ||= b === rock), () => {});
      [hits, n] = [hits + +got, n + 1];
    }
    console.log(`moving fire: from 5 R/s, ${hits} of ${n} rockets hit a still 0.5 R rock clicked in 16 directions at 2–20 R`);
    assert.ok(hits >= 0.99 * n, `from 5 R/s a clicked still rock is hit ≥ 99% (${hits} / ${n})`);
  }
  { // a point shot's scan (combat.ts): past your mining reach it locks an enemy ship ahead (guns.ts spot); a rock is no candidate, so it flies the ray past it
    const ring = (reach(1) + 1) * W, ship = { x: 20 * W, y: 1.5 * W, vx: 0, vy: -0.5 * W }, rock = disc(16 * W, -2 * W, 0.3 * W);
    let lockedAt = 0, hit = false, end = '';
    const scan = (foes: (typeof ship)[]) => (m: Rocket): Lock | undefined => {
      if (Math.hypot(m.x, m.y) <= ring) return undefined;
      const f = spot(m, foes);
      if (f) lockedAt = Math.hypot(m.x, m.y) / W;
      return f && { seek: () => f, target: f, fuze: true };
    };
    const p1 = createRockets(12, () => 0.1);
    rayShot(p1, 0, 0, 30 * W, 0, scan([ship]));
    for (let i = 0; i < 600 && p1.live.length; i++) {
      p1.step(1 / 60, [], [{ ...ship, r: sr, team: 'pirate', kill: () => void (hit = true) }], 0, () => {}, () => {});
      [ship.x, ship.y] = [ship.x + ship.vx / 60, ship.y + ship.vy / 60];
    }
    const p2 = createRockets(12, () => 0.1), m2 = rayShot(p2, 0, 0, 30 * W, 0, scan([]));
    let touched = false;
    for (let i = 0; i < 600 && p2.live.length; i++) p2.step(1 / 60, [rock], [], 0, () => void (touched = true), (_m, _x, _y, e) => void (end = e));
    console.log(`point-shot scan: locks an enemy ship ahead ${lockedAt.toFixed(1)} R out (ring ${(ring / W).toFixed(1)} R) and ${hit ? 'hits it' : 'misses'}; with only a rock off the ray it ${touched ? 'hits the rock' : `flies on (${end})`}`);
    assert.ok(hit && lockedAt > ring / W, 'past the ring the scan locks the enemy ship ahead and hits it');
    assert.ok(!touched && end === 'out' && m2.target === undefined, 'a plain rock is never locked: the ray flies on to the end of its fuel');
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
  // Seeded hit rates on a ship (hit radius SR) from a still world, 300 launches each, fuel 25.2 R (1 slot).
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
  /** A ship `d` R out at `v` R/s, across the line of sight or closing; `tb`: it breaks 90° (either way) that many s after the launch. */
  const line = (v: number, d: number, across: boolean, tb = Infinity) => (rnd: () => number) => {
    const a = rnd() * 2 * Math.PI, sg = rnd() < 0.5 ? 1 : -1, s = { x: Math.cos(a) * d * W, y: Math.sin(a) * d * W, vx: (across ? -Math.sin(a) * sg : -Math.cos(a)) * v * W, vy: (across ? Math.cos(a) * sg : -Math.sin(a)) * v * W };
    let at = tb;
    return {
      s,
      move: (t: number, dt: number) => {
        if (t >= at) [at, s.vx, s.vy] = [Infinity, ...((k) => [-s.vy * k, s.vx * k])(rnd() < 0.5 ? 1 : -1)];
        [s.x, s.y] = [s.x + s.vx * dt, s.y + s.vy * dt];
      },
    };
  };
  const orbit = rate((rnd) => {
    const a = rnd() * 2 * Math.PI, p = rnd() * 2 * Math.PI, cx = Math.cos(a) * 8 * W, cy = Math.sin(a) * 8 * W, s = { x: cx + 2 * W * Math.cos(p), y: cy + 2 * W * Math.sin(p), vx: 0, vy: 0 };
    return { s, move: (t: number) => void ([s.x, s.y, s.vx, s.vy] = [cx + 2 * W * Math.cos(p + 1.5 * t), cy + 2 * W * Math.sin(p + 1.5 * t), -3 * W * Math.sin(p + 1.5 * t), 3 * W * Math.cos(p + 1.5 * t)]) };
  });
  const cross = rate(line(6, 8, true)), close = rate(line(6, 14, false)), fast = rate(line(10, 8, true)), brk = rate(line(6, 8, true, 0.6));
  // The path's swing at speed: cruising 1.5 s at a far point, which then jumps 1.5 rad off its path; s until it has swung 45°.
  const pool = createRockets(12, () => 0.1), far = { x: 1e4 * W, y: 0, vx: 0, vy: 0 }, m = pool.launch({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, r: W, tx: far.x, ty: 0, R: W, range: 60 * W, seek: () => far })!;
  let t = 0, p0 = NaN, swing = 0;
  for (const dt = 1 / 240; pool.live.length && !swing; t += dt) {
    pool.step(dt, [], [], 0, () => {}, () => {});
    const p = Math.atan2(m.vy, m.vx);
    if (t >= 1.5 && isNaN(p0)) [p0, far.x, far.y] = [p, m.x + Math.cos(p + 1.5) * 1e4 * W, m.y + Math.sin(p + 1.5) * 1e4 * W];
    else if (Math.abs(wrap(p - p0)) >= Math.PI / 4) swing = t - 1.5;
  }
  console.log(`rockets (${ROCKET.speed} R/s, ≤ ${ROCKET.turn} rad/s, ≤ ${ROCKET.acc} R/s²) on a ship: orbiting at 3 R/s ${(100 * orbit).toFixed(0)}%, crossing at 6 R/s ${(100 * cross).toFixed(0)}%, closing at 6 R/s ${(100 * close).toFixed(0)}%, crossing at 10 R/s ${(100 * fast).toFixed(0)}%, crossing at 6 R/s and breaking 90° at 0.6 s ${(100 * brk).toFixed(0)}%; its path swings 45° at speed in ${swing.toFixed(2)} s`);
  assert.ok(orbit >= 0.6 && cross >= 0.9 && close >= 0.3, 'a rocket hits a patrolling, crossing or closing ship');
  // A locked rocket now comes round (its lock holds while the target lives): the counterplay is a burn or point defence.
  assert.ok(fast >= 0.9, 'a ship crossing at 10 R/s is still hit: the rocket comes round');
  assert.ok(brk >= 0.9, 'a ship that breaks hard late is still hit: the rocket comes round');
  assert.ok(swing >= 1.1, `a 45° swing of the path at speed takes ≥ 1.1 s (${swing.toFixed(2)} s)`);
}

// The seeker lets go (guns.ts guide, ROCKET.blind s before the hit): a rocket from a world 8–12 R off (centres) at a world of
// radius 1 R that can burn (R/s²) across the first line of sight or away, from `at` s after the launch or `before` s before
// the hit the same seed takes unburnt; 200 seeded launches each. A steady world is always hit, as is one that burns away, at
// half thrust or too late; a full burn across by a light world (7.5 R/s²) slips some, by a heavy one (5 R/s²) none.
{
  const W = R, N = 200;
  const land = (a: number, dir: 'across' | 'away' = 'across', when: { at?: number; before?: number } = { at: 0.3 }, v0 = 0) => {
    let got = 0, n = 0;
    for (let i = 0; i < N; i++) {
      const fly = (t0: number) => {
        const rnd = seeded(5000 + i), b = rnd() * 2 * Math.PI, d = (8 + 4 * rnd()) * W, c = rnd() * 2 * Math.PI, sg = rnd() < 0.5 ? 1 : -1;
        const me = { x: 0, y: 0, vx: Math.cos(c) * v0 * W, vy: Math.sin(c) * v0 * W }, body = disc(0, 0, W), pool = createRockets(12, rnd), lx = -Math.cos(b), ly = -Math.sin(b);
        body.motion = me;
        pool.launch({ team: 'rival', x: Math.cos(b) * d, y: Math.sin(b) * d, vx: 0, vy: 0, r: 0.88 * W, tx: 0, ty: 0, R: W, range: fireRange(1) * W, target: body, seek: () => ({ ...me, r: W }) });
        for (let t = 0, dt = 1 / 60; t < 14 && pool.live.length; t += dt) {
          if (a && t >= t0) [me.vx, me.vy] = dir === 'across' ? [me.vx - ly * sg * a * W * dt, me.vy + lx * sg * a * W * dt] : [me.vx + lx * a * W * dt, me.vy + ly * a * W * dt];
          [me.x, me.y] = [me.x + me.vx * dt, me.y + me.vy * dt];
          let hit = false;
          pool.step(dt, [body], [], 0, () => void (hit = true), () => {});
          if (hit) return t;
        }
        return NaN;
      };
      const t0 = when.before === undefined ? when.at! : fly(Infinity) - when.before;
      if (isNaN(t0)) continue;
      [got, n] = [got + +!isNaN(fly(t0)), n + 1];
    }
    return got / n;
  };
  const coast = land(0, 'across', { at: 0 }, 5), away = land(7.5, 'away'), lazy = land(3.75), late = land(7.5, 'across', { before: 0.3 }), heavy = land(5);
  const early = land(7.5), timed = land(7.5, 'across', { before: 0.6 }), mid = land(6);
  const pc = (x: number) => `${(100 * x).toFixed(0)}%`;
  console.log(`the seeker lets go ${ROCKET.blind} s before the hit: a world coasting at 5 R/s is hit ${pc(coast)}; burning 7.5 R/s² away ${pc(away)}, across at half thrust ${pc(lazy)}, across from 0.3 s before the hit ${pc(late)}; a 5 R/s² world burning across ${pc(heavy)}, 6 R/s² ${pc(mid)}; 7.5 R/s² across from 0.3 s after the launch ${pc(early)}, from 0.6 s before the hit ${pc(timed)}`);
  assert.ok(coast === 1, `a steady world is where the aim says: always hit (${coast})`);
  assert.ok(away >= 0.95 && lazy >= 0.95 && late >= 0.95 && heavy >= 0.95, `burning away, at half thrust, too late or too heavy does not slip a rocket (${away}, ${lazy}, ${late}, ${heavy})`);
  assert.ok(early >= 0.3 && early <= 0.8 && timed >= 0.1 && timed <= 0.6, `a full burn across by a light world slips some, never all (7.5 R/s²: ${early}, timed ${timed})`); // 6 R/s² is on the edge (0.97 R in `blind` s): printed, not pinned
  assert.ok(0.5 * 7.5 * ROCKET.blind ** 2 > 1 && 0.5 * 5 * ROCKET.blind ** 2 < 1 && ROCKET.lag <= 0.5, `in ${ROCKET.blind} s a 7.5 R/s² world moves its own radius, a 5 R/s² one does not; the frame follows a burn (lag ${ROCKET.lag} s): no outrunning`);
}
