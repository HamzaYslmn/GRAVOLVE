// node test/civilization/slots.test.ts: one HUD slot per fleet class (src/evolution/civilization/slots.ts): count / cap,
// readiness from each class's own reload, and its look on the priority (orders.ts status `by`).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slots, SLOTS } from '../../src/evolution/civilization/slots.ts';
import { status, type Fleet } from '../../src/evolution/civilization/orders.ts';
import { ARMS, FLEET, ROCKET } from '../../src/evolution/civilization/rules.ts';

const fleet = { probe: [2, 3], fighter: [4, 6], frigate: [1, 1] } as const;
const f = (cool = 0, mode = 'patrol') => ({ kind: 'fighter' as const, mode, cool });
const ships = [f(), f(), f(), f(FLEET.fighter.cool), { kind: 'probe' as const, mode: 'run', cool: 0 }, { kind: 'probe' as const, mode: 'patrol', cool: 0 }];
const s = slots(fleet as never, ships, [{ load: 99 }], 0, 5);
assert.deepEqual(SLOTS, ['probe', 'fighter', 'frigate', 'rocket']);
assert.ok(s.fighter.ready === 0.75 && s.probe.ready === 0.5, `a cooling fighter or a probe on a run counts 0: ${s.fighter.ready}, ${s.probe.ready}`);
assert.ok(s.frigate.ready === 1 && s.rocket.ready === 0, 'frigate load clamps; an empty rack is 0');
assert.ok(s.rocket.n === Math.floor(5 / ROCKET.ore) && s.fighter.n === 4 && s.fighter.cap === 6, 'counts: ships n/cap, rockets what the ore buys');
assert.ok(SLOTS.every((k) => s[k].look === ''), 'no priority: no on/off');
const none = slots({ probe: [0, 0], fighter: [0, 2], frigate: [0, 0] }, [], [], ARMS.lance.reload, 0);
assert.ok(SLOTS.every((k) => none[k].look === 'none'), 'nothing yet: faint');

// Distinct classes on one priority: a free 1% body in range: fighters and rockets take it, probes (≤ 0.5%) and the frigate (≥ 2%) cannot.
const fl: Fleet = { awake: true, ring: 20, T: 3, ore: 50, shield: true, n: { fighters: 4, probes: 2, frigate: 1 }, eta: { fighters: 0, probes: 0, frigate: 0, rockets: 0 } };
const by = status({ kind: 'body', share: 0.01, free: true, course: false, d: 5 }, fl).by, on = slots(fleet as never, ships, [{ load: 0 }], 0, 50, by);
assert.ok(on.fighter.look === 'on' && on.rocket.look === 'on' && on.probe.look === 'off' && on.frigate.look === 'off', `1% body: ${SLOTS.map((k) => `${k} ${on[k].look}`).join(', ')}`);
const world = slots(fleet as never, ships, [{ load: 0 }], 0, 50, status({ kind: 'world', share: 0.8, free: false, course: false, d: 5 }, fl).by);
assert.ok(world.fighter.look === 'on' && world.frigate.look === 'on' && world.probe.look === 'off', 'a fighting world: the siege lights fighters and the frigate');

const hud = readFileSync(new URL('../../src/evolution/civilization/hud.ts', import.meta.url), 'utf8');
assert.ok(hud.includes('SLOTS.map(') && !hud.includes('Ships <b'), 'hud.ts draws one slot per class, no lumped Ships count');
console.log('slots: one per class, readiness by own reload, priority on/off per class');
