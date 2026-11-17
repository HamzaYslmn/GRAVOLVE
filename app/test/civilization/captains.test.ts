// node test/civilization/captains.test.ts: pirate captains (escape.ts CAPTAINS) flown in the real pirates.ts in the
// fake world (fakes.ts world): chase patience, what they go for, when losses send them home, and the harm cap for each.
import assert from 'node:assert/strict';
import { alive, R, U, world, type PirateWorld } from './fakes.ts';
import { CAPTAINS } from '../../src/evolution/civilization/escape.ts';
import { CHASE_S, CHASE_V, CHIP_MAX } from '../../src/evolution/civilization/rules.ts';

const dt = 1 / 60, names = Object.keys(CAPTAINS) as (keyof typeof CAPTAINS)[];
/** Two rich rocks (half metal, half ice, three neighbours each) 12 R off you on either side, at an angle set by `seed`. */
const rich = (w: PirateWorld, seed: number) => {
  const at = (d: number, da: number, m: number, comp: Record<string, number>) => w.bodies.push(w.mk(Math.cos(seed * 1.3 + da) * d * R, Math.sin(seed * 1.3 + da) * d * R, 0, 0, m, comp));
  for (const s of [0, Math.PI]) {
    at(12, s, 0.04, { metal: 0.5, ice: 0.5 });
    for (const k of [-1, 0, 1]) at(14, s + k * 0.15, 0.01, { rock: 1 });
  }
};

// 1. Chase: a raid on you (fleet of 8), then you run, the camera on you, at 1.1 × their chase speed (outpaced, never far)
// and at 20 R/s (far within seconds). The raid's own length is pinned off so only the leash ends it: s until they leave.
{
  const chase = (who: keyof typeof CAPTAINS, seed: number, fast: boolean) => {
    const w = world(seed, { civ: true, who: CAPTAINS[who] });
    w.pirates.launch(U(8));
    for (let t = 0; t < 60 && w.pirates.fleet?.state !== 'raid'; t += dt) w.pirates.attack(), w.frame(dt);
    const fl = w.pirates.fleet!, v = fast ? 20 * R : 1.1 * CHASE_V * fl.v * R;
    assert.equal(fl.state, 'raid', `${who}: a raid starts (seed ${seed})`);
    fl.raidT = Infinity;
    let t = 0;
    for (; t < 90 && w.pirates.fleet === fl && fl.state === 'raid'; t += dt) {
      w.pirates.attack();
      w.frame(dt, () => {
        const m = w.me.motion;
        [m.x, m.vx, m.vy] = [m.x + v * dt, v, 0];
        [w.ctx.cam.x, w.ctx.cam.y] = [m.x, m.y];
      });
    }
    return t;
  };
  const rows: string[] = [], at: Record<string, number[]> = {};
  for (const who of names) for (const fast of [false, true]) {
    const ts = [1, 2, 3].map((seed) => chase(who, seed, fast));
    at[who + (fast ? '20' : '')] = ts;
    if (!fast) rows.push(`${who} ${ts.map((t) => t.toFixed(1)).join('/')} s`);
    else rows[rows.length - 1] += ` (20 R/s: ${ts.map((t) => t.toFixed(1)).join('/')})`;
  }
  console.log(`chase, you just outpacing them (3 seeds): ${rows.join(', ')}`);
  assert.ok([...at.feint, ...at.feint20].every((t) => t <= 8), `a feint lets you go within 8 s: ${at.feint}, ${at.feint20}`);
  assert.ok(at.hound.every((t) => t >= 30), `a hound still raids at 30 s while you just outpace it: ${at.hound}`);
  assert.ok(at.reaver.every((t) => t <= CHASE_S + 1) && at.reaver20.every((t) => t <= CHASE_S), `the reaver keeps the base leash: ${at.reaver}`);
}

// 2. Targets: an attack due, you and two rich rocks (`rich`), so one is about as near the fleet as you; a fleet of 8,
// 6 seeds: what it is on 15 s in (rock or piece: work).
{
  const pick = (who: keyof typeof CAPTAINS) => {
    const on = { you: 0, work: 0 };
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = world(seed, { civ: true, still: true, who: CAPTAINS[who] });
      rich(w, seed);
      w.pirates.launch(U(8));
      for (let t = 0; t < 15 && w.pirates.fleet; t += dt) w.pirates.attack(), w.frame(dt);
      const k = w.pirates.fleet?.target?.kind;
      if (k === 'you') on.you++;
      else if (k === 'rock' || k === 'piece') on.work++;
    }
    return on;
  };
  const got = Object.fromEntries(names.map((n) => [n, pick(n)]));
  console.log(`targets 15 s in, an attack due with rich rocks in sight (6 seeds, at you / at work): ${names.map((n) => `${n} ${got[n].you}/${got[n].work}`).join(', ')}`);
  assert.equal(got.butcher.you, 6, 'a butcher goes for you over a rich rock');
  assert.equal(got.scavenger.work, 6, 'a scavenger goes for the rich rock');
}

// 3. Losses: a fleet of 10 working a rock; gun ships killed one by one (a rocket's direct hit): how many it loses before it leaves.
{
  const rows: string[] = [];
  for (const who of names) {
    const w = world(9, { who: CAPTAINS[who] });
    w.bodies.push(w.mk(16.5 * R, 13 * R, 0.1 * R, 0, 0.04, { rock: 0.4, metal: 0.4, ice: 0.2 }));
    w.pirates.launch(U(10));
    for (let t = 0; t < 8; t += dt) w.frame(dt);
    const fl = w.pirates.fleet!;
    assert.notEqual(fl.state, 'leave', `${who}: still about at 8 s`);
    let lost = 0;
    while (fl.state !== 'leave') {
      const s = alive(w).find((q) => q.kind !== 'hauler');
      if (!s) break;
      s.kill(true);
      lost++;
      for (let t = 0; t < 1 && fl.state !== 'leave'; t += dt) w.frame(dt);
    }
    rows.push(`${who} ${lost} of ${fl.n0}`);
    assert.equal(fl.state, 'leave', `${who} leaves`);
    assert.equal(lost, Math.ceil(fl.who.retreat * fl.n0 - 1e-9), `${who} leaves once it has lost its retreat share: ${lost} of ${fl.n0}`);
  }
  console.log(`losses before leaving (fleet of 10, gun ships killed one a second): ${rows.join(', ')}`);
}

// 4. Harm cap for every captain: an attack due, your shield ignored, an empty store, one fleet's whole visit (≤ 150 s),
// fleets of 6 and 12; your world with 4 moons (seeds 11–13), and with no moons by the rich rocks of 2 (seeds 1–6),
// where a fleet may raid you, work a rock and raid you again. Each raid takes ≤ CHIP_MAX of your water and air.
{
  const rows: string[] = [];
  for (const who of names) {
    let raid = 0, visit = 0, twice = 0;
    for (const rocks of [false, true]) for (const n of [6, 12]) for (const seed of rocks ? [1, 2, 3, 4, 5, 6] : [11, 12, 13]) {
      const w = world(seed, { moons: rocks ? 0 : 4, civ: true, stock: 0, who: CAPTAINS[who] }), wet = () => w.me.m * ((w.me.comp.ice ?? 0) + (w.me.comp.gas ?? 0)), w0 = wet();
      if (rocks) rich(w, seed);
      w.pirates.launch(U(n));
      const fl = w.pirates.fleet!;
      let raids = 0, at = w0;
      for (let t = 0; t < 150 && w.pirates.fleet === fl; t += dt) {
        const was = fl.state;
        w.pirates.attack();
        w.frame(dt);
        if (fl.state === 'raid' && was !== 'raid') [raids, at] = [raids + 1, wet()];
        raid = Math.max(raid, (at - wet()) / at);
      }
      [visit, twice] = [Math.max(visit, (w0 - wet()) / w0), twice + (raids > 1 ? 1 : 0)];
    }
    rows.push(`${who} ${(100 * raid).toFixed(3)} / ${(100 * visit).toFixed(3)}% (${twice} raided twice)`);
    assert.ok(raid <= CHIP_MAX + 1e-9, `${who}: water and air lost in a raid ≤ CHIP_MAX: ${raid}`);
  }
  console.log(`harm, open raids on an empty store (18 visits each; worst share of your water and air a raid / a visit): ${rows.join(', ')}`);
}
