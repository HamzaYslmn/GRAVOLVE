// node test/civilization/slots.test.ts: one HUD slot per fleet class (src/evolution/civilization/slots.ts): count / cap,
// one pip per ship from each class's own reload, the silo's salvo, its look on the priority (orders.ts status `by`), the fuel line's flow.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flow, FLOW_S, fuelLeft, slots, SLOTS, type Flow } from '../../src/evolution/civilization/slots.ts';
import { status, type Fleet } from '../../src/evolution/civilization/orders.ts';
import { ARMS, FLEET, RESERVE, ROCKET, salvo } from '../../src/evolution/civilization/rules.ts';

const fleet = { probe: [2, 3], fighter: [4, 6], frigate: [1, 1] } as const;
const f = (cool = 0, mode = 'patrol') => ({ kind: 'fighter' as const, mode, cool });
const ships = [f(), f(), f(), f(FLEET.fighter.cool), { kind: 'probe' as const, mode: 'run', cool: 0 }, { kind: 'probe' as const, mode: 'patrol', cool: 0 }];
const s = slots(fleet as never, ships, [{ load: 99 }], 0, 5);
assert.deepEqual(SLOTS, ['probe', 'fighter', 'frigate', 'rocket', 'missile']);
assert.ok(s.fighter.ready === 0.75 && s.probe.ready === 0.5, `a cooling fighter or a probe on a run counts 0: ${s.fighter.ready}, ${s.probe.ready}`);
assert.ok(s.frigate.ready === 1 && s.rocket.ready === 0, 'frigate load clamps; an empty rack is 0');
assert.ok(s.rocket.n === Math.floor(5 / ROCKET.ore) && s.fighter.n === 4 && s.fighter.cap === 6, 'counts: ships n/cap, rockets what the ore buys');
assert.ok(SLOTS.every((k) => s[k].look === (k === 'missile' ? 'none' : '')), 'no priority: no on/off (no tier: no silo)');
const none = slots({ probe: [0, 0], fighter: [0, 2], frigate: [0, 0] }, [], [], ARMS.lance.reload, 0);
assert.ok(SLOTS.every((k) => none[k].look === 'none'), 'nothing yet: faint');

// Distinct classes on one priority: a free 1% body in range: fighters and rockets take it, probes (≤ 0.5%) and the frigate (≥ 2%) cannot.
const fl: Fleet = { awake: true, ring: 20, T: 3, ore: 50, shield: true, n: { fighters: 4, probes: 2, frigate: 1 }, eta: { fighters: 0, probes: 0, frigate: 0, rockets: 0 } };
const by = status({ kind: 'body', share: 0.01, free: true, course: false, d: 5 }, fl).by, on = slots(fleet as never, ships, [{ load: 0 }], 0, 50, by);
assert.ok(on.fighter.look === 'on' && on.rocket.look === 'on' && on.probe.look === 'off' && on.frigate.look === 'off', `1% body: ${SLOTS.map((k) => `${k} ${on[k].look}`).join(', ')}`);
const world = slots(fleet as never, ships, [{ load: 0 }], 0, 50, status({ kind: 'world', share: 0.8, free: false, course: false, d: 5 }, fl).by);
assert.ok(world.fighter.look === 'on' && world.frigate.look === 'on' && world.probe.look === 'off', 'a fighting world: the siege lights fighters and the frigate');

// Pips: one per ship, its own readiness, before the mean.
assert.deepEqual(s.fighter.pips, [1, 1, 1, 0], 'three ready fighters and one at full cool');
assert.ok(s.fighter.ready === 0.75 && s.probe.pips[0] === 0, 'ready stays the mean; a probe on a run is 0');
assert.deepEqual(slots(fleet as never, [], [{ load: ARMS.lance.reload / 2 }], 0, 0).frigate.pips, [0.5], 'a frigate at half load');

// The silo: salvo(T) pips at its load; armed only with the whole salvo's ore above RESERVE (ships.ts siloStep); T 0 hides it.
for (const T of [1, 3, 5]) {
  const need = RESERVE + salvo(T) * ARMS.missile.ore, m = slots(fleet as never, [], [], 0, need, undefined, ARMS.missile.reload / 2, T).missile;
  assert.ok(m.cap === salvo(T) && m.n === m.cap && m.pips.length === m.cap && m.pips.every((p) => p === 0.5), `tier ${T}: ${JSON.stringify(m)}`);
  assert.equal(slots(fleet as never, [], [], 0, need - 1, undefined, 0, T).missile.n, 0, `tier ${T}: one ore short fires nothing`);
}
const off = slots(fleet as never, [], [], 0, 999).missile;
assert.ok(off.cap === 0 && off.n === 0 && !off.pips.length && off.look === 'none', 'no tier passed: no silo slot');
assert.equal(slots(fleet as never, [], [], 0, 999, status({ kind: 'world', share: 0.8, free: false, course: false, d: 5 }, fl).by, 0, 3).missile.look, 'on', 'a siege lights the silo');

// Fuel flow: the first sample is raw; a steady burn holds; a step reaches ~63% at FLOW_S; inflow is what the stock gained plus the burn, never negative.
assert.deepEqual(flow(undefined, 40, 0.02, 0.5), { fuel: 40, use: 0.02, gain: 0 });
assert.deepEqual(flow({ fuel: 1, use: 9, gain: 9 }, 40, 0.02, 0), { fuel: 40, use: 0.02, gain: 0 }, 'dt 0 restarts');
let q: Flow = flow(undefined, 50, 0.03, 0);
for (let t = 0; t < 200; t += 0.5) q = flow(q, q.fuel - 0.03 * 0.5, 0.03, 0.5);
assert.ok(Math.abs(q.use - 0.03) < 1e-12 && q.gain < 1e-9 && q.gain >= 0, `a steady burn holds: ${JSON.stringify(q)}`);
q = flow(undefined, 50, 0, 0);
for (let t = 0; t < FLOW_S - 1e-9; t += 0.5) q = flow(q, 50, 0.1, 0.5);
assert.ok(Math.abs(q.use / 0.1 - (1 - Math.exp(-1))) < 0.01, `a step reaches ~63% at FLOW_S: ${q.use / 0.1}`);
q = flow(undefined, 10, 0, 0);
for (let t = 0; t < 60; t += 0.5) q = flow(q, q.fuel + 0.05 * 0.5, 0.01, 0.5);
assert.ok(q.gain > 0.04, `a rising stock shows inflow: ${q.gain}`);
q = flow(undefined, 10, 0, 0);
for (let t = 0; t < 60; t += 0.5) q = flow(q, q.fuel - 1, 0, 0.5);
assert.ok(q.gain === 0, 'a falling stock with no burn: inflow 0, never negative');
assert.ok(fuelLeft(30, 0.5) === 60 && fuelLeft(30, 0) === Infinity && fuelLeft(30, 1e-7) === Infinity, 'fuelLeft: s at the burn, Infinity idle');

const hud = readFileSync(new URL('../../src/evolution/civilization/hud.ts', import.meta.url), 'utf8');
assert.ok(hud.includes('SLOTS.map(') && hud.includes('q.pips.length') && hud.includes("setProperty('--p'") && !hud.includes('class="slots"'), 'hud.ts draws one pip group per class, one pip per ship from slots.ts pips');
console.log('slots: one per class, pips by own reload, silo salvo, priority on/off per class, fuel flow');
