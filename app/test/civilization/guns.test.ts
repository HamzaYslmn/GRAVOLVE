// node test/civilization/guns.test.ts: rounds are pooled, never tunnel, keep to the arc; missiles are guided (a timed dodge beats one),
// die to one round, stop on bodies and burst on enemy ships; `pick` and `nearest` choose targets; lances hit drifting
// rocks; bolts stay visible at every zoom.
import assert from 'node:assert/strict';
import { fighterGun, q, R, seeded, SR } from './fakes.ts';
import { BURST, F_PATROL_V, F_TURN, GAP, GUN, GUN_ARC, leadAt, RATE, SHOT_S, SHOT_V, SPREAD, wrap, type Craft } from '../../src/evolution/civilization/flight.ts';
import { BOLT, createMissiles, createShots, DOT_GLOW, DOT_LIT, least, MAX_GLOW, pick, nearest, pull, seeker, SHOTS, trigger, type Gun, type Hull, type Launch } from '../../src/evolution/civilization/guns.ts';
import { type Disc } from '../../src/evolution/civilization/nav.ts';
import { ARMS, FLEET, FRAG, PREY } from '../../src/evolution/civilization/rules.ts';

// Rounds (flight.ts createShots): the pool holds SHOTS at most; a SHOT_V (22 R/s) round cannot tunnel through a 0.09 R ship at 30
// fps; nothing fires at a lead point outside the arc; bursts at a ship crossing at 4 R/s from 5 R kill some of the time.
{
  const shots = createShots(), g = trigger(), gun = fighterGun(), far = { m: 1, r: R, motion: { x: 1e6, y: 0, vx: 0, vy: 0 } };
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
    const pool = createShots(SHOTS, rnd), c: Craft = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, burn: 0 }, tg = trigger();
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
// Missiles (guns.ts createMissiles): without a seeker one flies straight (aimed once: a target holding course is hit, one
// turning after launch is missed); one enemy round kills it; any body stops it; its burst kills enemy ships inside its blast;
// `pick` takes a missile, then a frigate, before a fighter at the same distance. Shooter at rest, target 10 R out crossing at
// 1 R/s (a world keeping station), 6 R/s, hit radius 0.6 R (a rival world's radius would be bigger: the strictest case).
{
  const u = 6 * R, life = 5, shot = (o: Partial<Launch>): Launch => ({ team: 'you', x: 0, y: 0, vx: 0, vy: 0, tx: 10 * R, ty: 0, tvx: 0, tvy: 0, u, life, k: 12, blast: 0.6 * R, ...o });
  for (const turn of [false, true]) {
    const pool = createMissiles(9), m = pool.launch(shot({ tvy: R }))!, v0 = [m.vx, m.vy];
    let tx = 10 * R, ty = 0, tvx = 0, tvy = R, best = Infinity;
    for (let t = 0; pool.live.length && t < life + 1; t += 1 / 60) {
      if (turn && t > 0.2) [tvx, tvy] = [0, -R]; // a sidestep after launch: back the other way
      [tx, ty] = [tx + (tvx / 60), ty + (tvy / 60)];
      const was = pool.live.length;
      pool.step(1 / 60, [], [], 0, () => {}, () => {});
      if (was && pool.live.length) assert.ok(m.vx === v0[0] && m.vy === v0[1], 'without a seeker a missile never changes velocity');
      best = Math.min(best, Math.hypot(m.x - tx, m.y - ty));
    }
    assert.ok(turn ? best > 0.6 * R : best < 0.3 * R, `${turn ? 'a sidestepping' : 'a steady'} target: closest ${(best / R).toFixed(2)} R`);
    console.log(`unguided missile vs a target 10 R out at 1 R/s, ${turn ? 'turning back 0.2 s after launch' : 'holding course'}: closest ${(best / R).toFixed(2)} R (${turn ? 'missed' : 'hit'})`);
  }
  // Intercepted: an enemy round in the shot pool, the missile listed as a hull (combat.ts).
  {
    const pool = createMissiles(9), shots = createShots(SHOTS, seeded(3)), m = pool.launch(shot({ team: 'rival', x: 10 * R, tx: 0 }))!;
    const gun: Gun = { team: 'you', u: 30 * R, life: 0.5, arc: Math.PI, spread: 0, tint: 0 };
    shots.fire(gun, trigger(), true, 4 * R, 0, 0, 0, 0, m.x, m.y, m.vx, m.vy);
    for (let f = 0; f < 30 && !m.dead; f++) {
      pool.step(1 / 60, [], [], 0, () => {}, () => {});
      shots.step(1 / 60, [], m.dead ? [] : [{ x: m.x, y: m.y, vx: m.vx, vy: m.vy, r: SR, team: m.team, kill: m.kill }], 0, () => {});
    }
    let ended = '';
    pool.step(1 / 60, [], [], 0, () => {}, (_, __, ___, burst) => (ended = burst ? 'burst' : 'shot down'));
    assert.ok(m.dead && ended === 'shot down' && !pool.live.length, 'one enemy round kills a missile');
  }
  // A body in the way stops it (and is told); enemy ships within its blast die, its own side's do not. A rocket (`hit` set)
  // gives its effect to its own target only.
  {
    const pool = createMissiles(9), rock: Disc = { m: 1, r: 0.5 * R, motion: { x: 5 * R, y: 0, vx: 0, vy: 0 } }, kills: string[] = [];
    pool.launch(shot({}));
    const hulls: Hull[] = [
      { x: 4.4 * R, y: 0.3 * R, r: SR, team: 'rival', kill: () => kills.push('rival near') },
      { x: 4.4 * R, y: 3 * R, r: SR, team: 'rival', kill: () => kills.push('rival far') },
      { x: 4.4 * R, y: -0.3 * R, r: SR, team: 'you', kill: () => kills.push('yours') },
    ];
    let hit: unknown, at = -1;
    for (let t = 0; pool.live.length && t < life; t += 1 / 60) pool.step(1 / 60, [rock], hulls, 0, (_, b) => (hit = b), () => (at = t));
    assert.ok(hit === rock && at > 0 && at < 1, `a body stops it (${at.toFixed(2)} s)`);
    assert.deepEqual(kills, ['rival near'], 'its burst kills the enemy ship inside its blast only');
    const other: Disc = { m: 1, r: 0.5 * R, motion: { x: 20 * R, y: 0, vx: 0, vy: 0 } }, got: unknown[] = [];
    pool.launch(shot({ target: other, hit: (b) => got.push(b) }));
    for (let t = 0; pool.live.length && t < life; t += 1 / 60) pool.step(1 / 60, [rock, other], [], 0, () => got.push('combat'), () => {});
    assert.deepEqual(got, [], 'a rocket stopped by a body that is not its target does nothing to it');
  }
  // Point defence: a silo missile (ARMS.missile, guided at the world) from 7–11 R at a world (the origin); a home fighter 2–4 R
  // out on its side fires one burst of BURST rounds (RATE/s, SPREAD aim error, its nose on the lead point) once the missile is
  // within GUN R. To rounds a missile is ARMS.missile.size × a ship's hit radius: one burst stops about half. 400 seeded tries.
  {
    const rnd = seeded(77), M = ARMS.missile, world: Disc = { m: 1, r: R, motion: { x: 0, y: 0, vx: 0, vy: 0 } };
    let killed = 0;
    for (let i = 0; i < 400; i++) {
      const a = rnd() * 2 * Math.PI, L = 7 + 4 * rnd(), pool = createMissiles(9), shots = createShots(SHOTS, seeded(i)), g = trigger();
      const m = pool.launch({ team: 'rival', x: Math.cos(a) * L * R, y: Math.sin(a) * L * R, vx: 0, vy: 0, tx: 0, ty: 0, tvx: 0, tvy: 0, u: M.u * R, life: M.life, k: M.k, blast: M.blast * R, seek: () => ({ x: 0, y: 0, vx: 0, vy: 0, r: R }), seeker: seeker(M, R) })!;
      const b = a + (rnd() - 0.5) * 1.5, d = (2 + 2 * rnd()) * R, sx = Math.cos(b) * d, sy = Math.sin(b) * d;
      const gun: Gun = { team: 'you', u: SHOT_V * R, life: SHOT_S, arc: GUN_ARC, spread: SPREAD, tint: 0 };
      let fired = 0;
      for (let f = 0; f < 180 && !m.dead && pool.live.length; f++) {
        const h = 1 / 60, c: Craft = { x: sx, y: sy, vx: 0, vy: 0, heading: 0, burn: 0 };
        c.heading = leadAt(c, m.x, m.y, m.vx, m.vy, gun.u);
        if (Math.hypot(m.x - sx, m.y - sy) < GUN * R && fired < BURST) {
          const p = pull(g, h, true, BURST, RATE, Infinity);
          if (p && shots.fire(gun, g, p === 1, sx, sy, 0, 0, c.heading, m.x, m.y, m.vx, m.vy)) fired++;
        }
        pool.step(h, [world], [], 0, () => {}, () => {});
        shots.step(h, [], m.dead ? [] : [{ x: m.x, y: m.y, vx: m.vx, vy: m.vy, r: SR * M.size, team: m.team, kill: m.kill }], 0, () => {});
      }
      if (m.dead) killed++;
    }
    console.log(`point defence: one fighter burst (${BURST} rounds) kills an inbound guided missile (${M.u} R/s, from 7–11 R) ${((100 * killed) / 400).toFixed(0)}% of the time`);
    assert.ok(killed >= 0.45 * 400 && killed <= 0.65 * 400, 'one burst stops about half the missiles');
  }
  const ship = { x: 4 * R, y: 0, kill() {}, cls: 'fighter' as const }, frig = { x: 0, y: 4 * R, kill() {}, cls: 'frigate' as const }, mis = { x: -4 * R, y: 0, kill() {}, cls: 'missile' as const };
  assert.equal(pick([ship, frig, mis], 0, 0, 9 * R), mis, 'a missile first');
  assert.equal(pick([ship, frig], 0, 0, 9 * R), frig, 'then a frigate');
  assert.equal(pick([ship, { ...frig, y: 6 * R }], 0, 0, 9 * R), ship, 'a fighter much nearer than a frigate');
  assert.equal(pick([{ ...mis, x: -10 * R }], 0, 0, 9 * R), undefined, 'none out of range');
  assert.equal(pick([ship, frig, mis], 0, 0, 9 * R, ship), ship, 'your priority ship before a missile or a frigate');
  assert.equal(pick([mis], 0, 0, 9 * R, undefined), mis, 'no priority: the usual pick');
  console.log('missiles ok: straight without a seeker, one round kills it, a body stops it, the blast takes enemy ships only, a rocket hits only its target; pick: your priority, then missile, frigate, fighter');
}
// Guidance (guns.ts steer, ARMS.missile): a silo missile at a world of radius R (the shooter's size) 16 R out crossing at
// 1 R/s. While locked it turns at most turn × dt a step; the lock never comes back; unlocked its heading holds. A steady
// target is hit, so is one that turns back 0.2 s after launch (an early sidestep is corrected); thrusting 6 R/s² sideways
// from the moment the seeker lets go (the flame dims) gets clear, the same dodge 0.3 s late does not; a target outside the
// cone at launch gets a straight shot. Then the land rate over seeded random dodges.
{
  const M = ARMS.missile, h = 1 / 60;
  /** One flight; `dodge(t, unlockedAt)` gives the target's sideways acceleration (R/s²). Closest approach (R) and whether it hit. */
  const fly = (dodge: (t: number, off: number) => number, fan = 0, turnAt = Infinity) => {
    const pool = createMissiles(9), w: Disc = { m: 1, r: R, motion: { x: 16 * R, y: 0, vx: 0, vy: R } };
    const m = pool.launch({ team: 'rival', x: 0, y: 0, vx: 0, vy: 0, tx: w.motion.x, ty: 0, tvx: 0, tvy: R, u: M.u * R, life: M.life, k: M.k, blast: M.blast * R, fan, target: w, seek: () => ({ ...w.motion, r: w.r }), seeker: seeker(M, R) })!;
    let hit = false, best = Infinity, off = Infinity, h0 = Math.atan2(m.vy, m.vx), was = true;
    for (let t = 0; pool.live.length && t < M.life + 0.5; t += h) {
      if (t >= turnAt) w.motion.vy = -R;
      const a = dodge(t, off) * R;
      w.motion.vy += a * h;
      [w.motion.x, w.motion.y] = [w.motion.x + w.motion.vx * h, w.motion.y + w.motion.vy * h];
      pool.step(h, [w], [], 0, (_, b) => void (hit ||= b === w), () => {});
      if (!pool.live.length) break;
      const hd = Math.atan2(m.vy, m.vx), turned = Math.abs(wrap(hd - h0));
      if (m.lock) assert.ok(was && turned <= M.turn * h + 1e-9, `locked: ${turned.toFixed(5)} rad in a step, at most ${(M.turn * h).toFixed(5)}`);
      else assert.ok(was || turned < 1e-9, 'unlocked: the heading holds');
      if (!m.lock && was) off = t;
      [h0, was] = [hd, m.lock];
      best = Math.min(best, Math.hypot(m.x - w.motion.x, m.y - w.motion.y) - w.r);
    }
    return { hit, best: best / R, off };
  };
  const steady = fly(() => 0), late = fly(() => 0, 0, 0.2), dodge = fly((t, off) => (t >= off ? 6 : 0)), slow = fly((t, off) => (t >= off + 0.3 ? 6 : 0)), wide = fly(() => 0, 1);
  console.log(`guided missile (${M.u} R/s, turn ${M.turn} rad/s, blind ${M.blind} s) at a world 16 R out: steady ${steady.hit ? 'hit' : 'missed'}, turning back at 0.2 s ${late.hit ? 'hit' : 'missed'}, 6 R/s² sideways from unlock (${dodge.off.toFixed(2)} s) ${dodge.hit ? 'hit' : `missed by ${dodge.best.toFixed(2)} R`}, 0.3 s late ${slow.hit ? 'hit' : 'missed'}, outside the cone ${wide.hit ? 'hit' : 'missed'}`);
  assert.ok(steady.hit && late.hit, 'a steady target and an early sidestep are hit');
  assert.ok(!dodge.hit && slow.hit, 'a dodge timed to the dimming flame gets clear, 0.3 s late it does not');
  assert.ok(wide.off < 2 * h && !wide.hit, 'outside the cone at launch: unlocked at once, a straight miss');
  // Land rate: the target sidesteps at a random moment of the flight with a random push of 0–8 R/s² (the dodges a player tries).
  const rnd = seeded(31);
  let land = 0;
  for (let i = 0; i < 200; i++) {
    const at = rnd() * 2, g = 8 * rnd(), s = rnd() < 0.5 ? -1 : 1;
    if (fly((t) => (t >= at ? s * g : 0)).hit) land++;
  }
  console.log(`guided missile land rate against random sidesteps (any moment, 0–8 R/s²): ${((100 * land) / 200).toFixed(0)}%`);
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
    const rock: Disc = { m: 1, r, motion: { x: Math.cos(a) * D, y: Math.sin(a) * D, vx: -Math.cos(a) * vin - Math.sin(a) * vt, vy: -Math.sin(a) * vin + Math.cos(a) * vt } };
    const shots = createShots(SHOTS, seeded(100 + i)), g = trigger(), w = F_PATROL_V / 3, gun: Gun = { team: 'you', u: L.u * R, life: L.life, arc: L.arc, spread: L.spread, tint: 0 };
    let th = rnd() * 2 * Math.PI, out = 0, t = 0, t0 = 0;
    const c: Craft = { x: 0, y: 0, vx: 0, vy: 0, heading: th + Math.PI / 2, burn: 0 };
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
  console.log(`bolts: bright middle ≥ ${f(low.round)} px round, ${f(low.probe)} probe, ${f(low.pirate)} pirate, ${f(low.shell)} shell, ${f(low.lance)} lance, ${f(low.missile)} missile head, ${f(low.rocket)} rocket head; glow ≥ ${f(low.glow)} px round, ${f(low.lanceGlow)} lance`);
  assert.ok(low.round >= 2.8 - e && low.pirate >= 2.8 - e && low.probe >= 2.2 - e && low.lance >= 4.8 - e && low.missile >= 5 - e, 'bright middles stay a few px wide at every zoom');
  assert.ok(low.glow >= 5.8 && low.lanceGlow >= 10 - e, 'glows stay ~6 px (rounds) and 10 px (lances) wide');
  for (const k of ['missile', 'rocket'] as const) for (const z of [3, 1, 0.024]) for (const Rw of [16, 500]) {
    const F = BOLT[k].flame!, w = least(F.k, F.px, unit(Rw, z), z) * z;
    assert.ok(w >= 12 - e && w * F.long! >= 48 - e, `a ${k} flame stays at least 12 × 48 px: ${f(w)} × ${f(w * F.long!)}`);
  }
  assert.ok(low.rocket >= 4 - e && low.missile > low.rocket, `a rocket's head ≥ 4 px, a missile's bigger: ${f(low.rocket)}, ${f(low.missile)}`);
  const lances = 12, worst = SHOTS * 2 + lances + 14 + ARMS.missile.max * 4 + 4 * 2 + 2 + 3; // rounds (+ lance halos), muzzles, missiles and rockets (head, core, flame, jet), slugs, beam ends, charging glows
  console.log(`glow layer worst frame: ${worst} of ${MAX_GLOW} quads`);
  assert.ok(worst <= MAX_GLOW, `the worst frame fits the glow layer: ${worst} of ${MAX_GLOW} quads`);
  assert.ok(SHOT_V === ARMS.round.u && SHOT_S === ARMS.round.life && SHOT_V * SHOT_S >= GUN + 5, `a round reaches ${f(SHOT_V * SHOT_S)} R, past the gun range + 5 R`);
  assert.ok(ARMS.lance.u * ARMS.lance.life >= 59, `a lance bolt reaches ${f(ARMS.lance.u * ARMS.lance.life)} R`);
}
