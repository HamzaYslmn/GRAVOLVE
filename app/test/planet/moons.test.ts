// node test/planet/moons.test.ts: the Sling is gone (the user, 2026-11-14): no moon is thrown (nor a rival's), Fire is the mass driver's
// alone, no moon has a role, no body carries `foe`; Command no longer starts a lasso (a tap orders an attack, a hold grinds
// your moon; capture is skill-based, see capture.test.ts). Source checks: moons.ts needs Pixi, so it is read, not run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f: string) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
const files = ['evolution/planet/moons.ts', 'evolution/civilization/combat.ts', 'evolution/asteroid/field.ts', 'evolution/civilization/ships.ts', 'evolution/civilization/rivals.ts', 'evolution/asteroid/hud.ts', 'audio/sfx.ts'];
for (const f of files) assert.ok(!/sling/i.test(read(f)), `${f}: no Sling`);
for (const f of ['evolution/planet/moons.ts', 'evolution/asteroid/hud.ts', 'audio/sfx.ts']) assert.ok(!/\brole\b/.test(read(f)), `${f}: no moon roles`);
const moons = read('evolution/planet/moons.ts');
assert.ok(!moons.includes('input.fire('), 'moons.ts never reads Fire');
assert.ok(!/foe\?:/.test(read('evolution/asteroid/body.ts')), 'Body has no foe flag');
// Rivals never throw their rock moon either (2026-11-15): it only circles their world.
assert.ok(!/\bfast\?:/.test(read('evolution/asteroid/body.ts')), 'Body has no thrown flag');
assert.ok(!/throwRock|RIVAL_THROW|WIND_UP|\.wind\b|throwT/.test(read('evolution/civilization/rivals.ts')), 'rivals never throw their rock');
assert.ok(!/throwK|RIVAL_THROW|RIVAL_ROCK_SPEED|WIND_UP|'throw'/.test(read('evolution/civilization/rules.ts')), 'no throw rules');
// Command: the tap and hold code calls no lasso; it gives orders (orders.order) and grinds a moon.
const a = moons.indexOf('const cmd = input.command()'), b = moons.indexOf('// 4. Move every moon', a);
assert.ok(a > 0 && b > a, 'the Command block is there');
const cmd = moons.slice(a, b);
assert.ok(!cmd.includes('lasso(') && cmd.includes('orders?.order(') && cmd.includes('absorbing'), 'a tap orders, a hold grinds, nothing lassoes');
assert.ok(!moons.includes('NOCIV') && !moons.includes('orderable') && moons.includes("'No fleet yet'"), 'before LIFE a tap only says "No fleet yet"; the priority rules live in civilization/orders.ts');
// Capture on any free ring (user 2026-11-15): no lowest-free-slot search; the candidate's ring comes from pickSlot.
assert.ok(!moons.includes('freeSlot') && moons.includes('pickSlot('), 'a moon is caught on any free ring');
// Moon size (2026-11-15): the catch gate, the growth trim and the too-big gauge all go through rules.ts moonCap (mass and MOON_R).
assert.ok(moons.includes('moonCap(') && !moons.includes('MOON_SHARE[1]'), 'moon size comes from moonCap');
// Theft on the circle (user 2026-11-15): a rival's rock is catchable while its world still holds it (the test field.ts uses
// for "a rival's rock"), the rival lets go of a rock you now own, and the rock turns against the world's orbit round you
// (capture.test.ts: a still player never matches it). No siege ring round the enemy world.
assert.ok(moons.includes('guard?.own?.(b) === false'), "a rival's rock on its circle is catchable");
const rivals = read('evolution/civilization/rivals.ts'), combat = read('evolution/civilization/combat.ts');
assert.ok(rivals.includes('|| ctx.moons.owns(rock)') && rivals.includes('-r.turn * ROCK_W'), 'the rival gives up a stolen rock; its rock turns against its orbit');
assert.ok(!combat.includes('sg.ring') && !combat.includes('.circle(sg.'), 'no siege ring');
console.log("moons: no Sling, no rival throw, Command orders and grinds, any free ring catches, size by moonCap, a rival's rock stolen on its circle, no siege ring");
