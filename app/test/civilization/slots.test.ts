// node test/civilization/slots.test.ts: one HUD slot per fleet class (src/evolution/civilization/slots.ts): count / cap,
// one pip per ship from each class's own reload, your rocket magazine, its look on the priority (orders.ts status `by`), fuelLeft, any counter's track, the energy balance.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { balance, fuelLeft, MAKE, slots, SLOTS, track, USE, type Power, type Track } from '../../src/evolution/civilization/slots.ts';
import { status, type Fleet } from '../../src/evolution/civilization/orders.ts';
import { ARMS, FLEET, ROCKET, salvo } from '../../src/evolution/civilization/rules.ts';

const fleet = { probe: [2, 3], fighter: [4, 6], frigate: [1, 1] } as const;
const f = (cool = 0, mode = 'patrol') => ({ kind: 'fighter' as const, mode, cool });
const ships = [f(), f(), f(), f(FLEET.fighter.cool), { kind: 'probe' as const, mode: 'run', cool: 0 }, { kind: 'probe' as const, mode: 'patrol', cool: 0 }];
const mag = (n: number, cap: number, load = 0) => ({ n, cap, load });
const s = slots(fleet as never, ships, [{ load: 99 }], mag(0, 1));
assert.deepEqual(SLOTS, ['probe', 'fighter', 'frigate', 'rocket']);
assert.ok(s.fighter.ready === 0.75 && s.probe.ready === 0.5, `a cooling fighter or a probe on a run counts 0: ${s.fighter.ready}, ${s.probe.ready}`);
assert.ok(s.frigate.ready === 1 && s.rocket.ready === 0, 'frigate load clamps; an empty magazine is 0');
assert.ok(s.rocket.n === 0 && s.rocket.cap === 1 && s.fighter.n === 4 && s.fighter.cap === 6, 'counts: ships n/cap, rockets loaded / magazine');
assert.ok(SLOTS.every((k) => s[k].look === (k === 'rocket' ? 'none' : '')), 'no priority: no on/off (an empty magazine: faint)');
const none = slots({ probe: [0, 0], fighter: [0, 2], frigate: [0, 0] }, [], [], mag(0, 1, ARMS.lance.reload));
assert.ok(SLOTS.every((k) => none[k].look === 'none'), 'nothing yet: faint');

// Distinct classes on one priority: a free 1% body in range: fighters take it, probes (≤ 0.5%) and the frigate (≥ 2%) cannot; rockets are yours to fire (never on/off).
const fl: Fleet = { awake: true, ring: 20, shield: true, n: { fighters: 4, probes: 2, frigate: 1 }, eta: { fighters: 0, probes: 0, frigate: 0 } };
const by = status({ kind: 'body', share: 0.01, free: true, course: false, d: 5 }, fl).by, on = slots(fleet as never, ships, [{ load: 0 }], mag(2, 2), by);
assert.ok(on.fighter.look === 'on' && on.rocket.look === '' && on.probe.look === 'off' && on.frigate.look === 'off', `1% body: ${SLOTS.map((k) => `${k} ${on[k].look}`).join(', ')}`);
const world = slots(fleet as never, ships, [{ load: 0 }], mag(1, 1), status({ kind: 'world', share: 0.8, free: false, course: false, d: 5 }, fl).by);
assert.ok(world.fighter.look === 'on' && world.frigate.look === 'on' && world.probe.look === 'off', 'a fighting world: the siege lights fighters and the frigate');

// Pips: one per ship, its own readiness, before the mean.
assert.deepEqual(s.fighter.pips, [1, 1, 1, 0], 'three ready fighters and one at full cool');
assert.ok(s.fighter.ready === 0.75 && s.probe.pips[0] === 0, 'ready stays the mean; a probe on a run is 0');
assert.deepEqual(slots(fleet as never, [], [{ load: ARMS.lance.reload / 2 }], mag(0, 1)).frigate.pips, [0.5], 'a frigate at half load');

// The magazine: salvo(T) pips, the loaded ones full, the one refilling at its load, the rest empty.
for (const T of [1, 3, 5]) {
  const cap = salvo(T), m = slots(fleet as never, [], [], mag(cap - 1, cap, ROCKET.reload / 2)).rocket;
  assert.ok(m.cap === cap && m.n === cap - 1 && m.pips.length === cap && m.pips[cap - 1] === 0.5 && m.pips.slice(0, cap - 1).every((p) => p === 1), `tier ${T}: ${JSON.stringify(m)}`);
}
assert.deepEqual(slots(fleet as never, [], [], mag(0, 3, ROCKET.reload / 4)).rocket.pips, [0.25, 0, 0], 'an empty magazine of 3: the first refilling');

assert.ok(fuelLeft(30, 0.5) === 60 && fuelLeft(30, 0) === Infinity && fuelLeft(30, 1e-7) === Infinity, 'fuelLeft: s at the burn, Infinity idle');

// Track: any cumulative counter's rise; a steady slope converges, lumpy spend (got − stock) never reads negative, the first sample is 0.
assert.deepEqual(track(undefined, 7, 0.5), { x: 7, v: 0 });
assert.deepEqual(track({ x: 1, v: 9 }, 7, 0), { x: 7, v: 0 }, 'dt 0 restarts');
let tr: Track | undefined, got = 0;
for (let t = 0; t < 600; t += 0.5) tr = track(tr, (got += 0.02 * 0.5), 0.5);
assert.ok(Math.abs(tr!.v - 0.02) < 1e-6, `a steady income converges: ${tr!.v}`);
let sp: Track | undefined, stock = 50, income = 0, low = Infinity;
for (let i = 0; i < 400; i++) {
  income += 0.01; stock += 0.01; // a trickle in
  if (i % 40 === 39) stock -= 4; // a build pays 4 u at once
  sp = track(sp, income - stock, 0.5);
  low = Math.min(low, sp.v);
}
assert.ok(low >= 0 && Math.abs(sp!.v - 0.2) < 0.08, `lumpy spend: never negative, near 4 u / 20 s: ${sp!.v}`);
assert.equal(track({ x: 10, v: 0 }, 0, 0.5).v, 0, 'a counter that fell reads 0, never negative');

// Balance: "using U of C". The screenshot world: inner heat 0.8 + reactors 1.0 of a 2.5 capacity, 1.8 used.
const pw = (o: Partial<Power>): Power => ({ geo: 0, solar: 0, dyson: 0, fuel: 0, people: 0, shield: 0, yard: 0, mend: 0, rockets: 0, ...o });
const sum = (xs: { e: number }[]) => xs.reduce((a, s) => a + s.e, 0);
const shot = balance(pw({ geo: 0.8, fuel: 1, people: 1.3, shield: 0.3, yard: 0.2 }), 2.5);
assert.ok(Math.abs(shot.used - 1.8) < 1e-12 && shot.capacity === 2.5 && Math.abs(shot.idle - 0.7) < 1e-12 && shot.short === 0, `screenshot: ${JSON.stringify(shot)}`);
assert.ok(Math.abs(sum(shot.sources) - Math.min(shot.used, shot.capacity)) < 1e-12, 'free sources under the use: the sources sum to the use');
assert.deepEqual(shot.sources.map((s) => s.k), [...MAKE]);
assert.deepEqual(shot.uses.map((s) => s.k), [...USE]);
const shortB = balance(pw({ geo: 0.5, fuel: 0.4, people: 1.2, mend: 0.2 }), 0.9);
assert.ok(Math.abs(shortB.short - 0.5) < 1e-12 && shortB.idle === 0 && Math.abs(sum(shortB.sources) - shortB.capacity) < 1e-12, `short: ${JSON.stringify(shortB)}`);
const dys = balance(pw({ geo: 0.8, dyson: 4, people: 1.5 }), 5.8); // free energy past the use: spare, not idle reactor
assert.ok(Math.abs(dys.idle - 1) < 1e-12 && sum(dys.sources) > dys.used && dys.short === 0, `Dyson surplus: ${JSON.stringify(dys)}`);
for (const b of [shot, shortB, dys]) assert.ok(Math.abs(sum(b.sources) + b.idle - b.capacity) < 1e-12, 'sources + idle reactor = capacity');
assert.equal(balance(pw({ geo: 1, people: 2 })).capacity, 1, 'no capacity passed: what the sources give');

const hud = readFileSync(new URL('../../src/evolution/civilization/hud.ts', import.meta.url), 'utf8');
assert.ok(hud.includes('SLOTS.map(') && hud.includes('q.pips.length') && hud.includes("setProperty('--p'") && !hud.includes('class="slots"'), 'hud.ts draws one pip group per class, one pip per ship from slots.ts pips');
console.log('slots: one per class, pips by own reload, the rocket magazine, priority on/off per class, fuelLeft, track, balance');
