// node test/planet/moons.test.ts: the Sling is gone (the user, 2026-11-14): no moon is thrown (nor a rival's), Fire is your rockets'
// alone, no moon has a role, no body carries `foe`; Command no longer starts a lasso (a tap orders an attack, a hold grinds
// your moon; capture is skill-based, see capture.test.ts). Source checks read moons.ts; the guard-moon block at the end runs it (Pixi headless).
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
// Command: a tap gives orders (orders.order), nothing lassoes; before LIFE a tap only says "No fleet yet" (the rules: civilization/orders.ts).
assert.ok(!moons.includes('lasso(') && moons.includes('orders?.order(') && moons.includes("'No fleet yet'"), 'a tap orders, nothing lassoes, "No fleet yet" before LIFE');
// Capture on any free ring (user 2026-11-15): no lowest-free-slot search; the candidate's ring comes from pickSlot.
assert.ok(!moons.includes('freeSlot') && moons.includes('pickSlot('), 'a moon is caught on any free ring');
// Moon size (2026-11-15): the catch gate, the growth trim and the too-big gauge all go through rules.ts moonCap (mass and MOON_R).
assert.ok(moons.includes('moonCap(') && !moons.includes('MOON_SHARE[1]'), 'moon size comes from moonCap');
// Theft on the circle (user 2026-11-15): a rival's rock is catchable while its world still holds it (the test field.ts uses
// for "a rival's rock"), the rival lets go of a rock you now own, and the rock turns against the world's orbit round you
// (capture.test.ts: a still player never matches it). No siege ring round the enemy world.
assert.ok(moons.includes('guard?.own?.(b) === false'), "a rival's rock on its circle is catchable");
// A ground moon's gas is air: planet/stage.ts runs moons.update inside rules.ts fedAir (rules.test.ts measures it).
assert.ok(read('evolution/planet/stage.ts').includes('fedAir(sky, me, () => moons.update('), 'moons.update runs inside fedAir');
const rivals = read('evolution/civilization/rivals.ts'), combat = read('evolution/civilization/combat.ts');
assert.ok(rivals.includes('|| ctx.moons.owns(rock)') && rivals.includes('-r.turn * ROCK_W'), 'the rival gives up a stolen rock; its rock turns against its orbit');
assert.ok(!combat.includes('sg.ring') && !combat.includes('.circle(sg.'), 'no siege ring');
console.log("moons: no Sling, no rival throw, Command orders and grinds, any free ring catches, size by moonCap, a rival's rock stolen on its circle, no siege ring");

// A living rival world's guard moon (rival.ts tendMoon, held) is stolen like any moon (the user, 2026-11-17): run, not read.
// Each frame as the game runs it: moons.update, then the field's tendMoon; you are placed kinematically with the moon on
// your inner ring at its velocity (a perfect pilot; capture.test.ts flies one). A great comet (held + comet) never is.
const { registerHooks } = await import('node:module');
registerHooks({ // src imports leave out '.ts' (Vite resolves them)
  resolve: (spec, ctx, next) => next(ctx.parentURL?.includes('/src/') && /^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec) ? `${spec}.ts` : spec, ctx),
});
const { Container, Texture } = await import('pixi.js');
const { createMoons } = await import('../../src/evolution/planet/moons.ts');
const { rockBody } = await import('../../src/evolution/asteroid/body.ts');
const { makeRival, tendMoon } = await import('../../src/evolution/asteroid/rival.ts');
const { roster } = await import('../../src/evolution/rivals/ledger.ts');
const { COMP, G_WORLD, radiusOf, V_STICK } = await import('../../src/evolution/asteroid/rules.ts');
const { slotRadius } = await import('../../src/core/orbits.ts');
type Body = import('../../src/evolution/asteroid/body.ts').Body;
const DT = 1 / 60, ME_M = 1e5;
const rock = (m: number, x: number, y: number, comp = COMP.stony) => rockBody({ texture: Texture.EMPTY, comp }, radiusOf(m, comp), x, y);
const input = { command: () => null, hold: () => null, kind: () => 'touch', aimWorld: () => null } as never;
const fx = { note() {}, ember() {}, popup() {}, puff() {} } as never;
const canvas = { clientWidth: 1280, clientHeight: 720 } as never;
const setup = () => { const me = rock(ME_M, 0, 0); return { me, moons: createMoons(new Container(), me, input, Texture.EMPTY, fx, canvas, () => {}) }; };
/** You beside `b`, it on your inner ring outward from `from`, at its velocity. */
const beside = (me: Body, b: Body, from: Body) => {
  const dx = b.motion.x - from.motion.x, dy = b.motion.y - from.motion.y, d = Math.hypot(dx, dy) || 1, sr = slotRadius(me.r, 0);
  Object.assign(me.motion, { x: b.motion.x + (dx / d) * sr, y: b.motion.y + (dy / d) * sr, vx: b.motion.vx, vy: b.motion.vy });
};
/** A named world of 2× you, alive, holding a guard moon of 6% of you (3% of it) on its circle. */
const living = () => {
  const world = makeRival(rock(2 * ME_M, 0, 0), Texture.EMPTY, 0), guard = rock(0.06 * ME_M, 3 * world.r, 0);
  world.rival!.entry = { ...roster(1, world.m, COMP.stony)[0], life: { progress: 1, calm: 0 } };
  tendMoon(world, [world, guard], world, DT);
  assert.ok(world.rival!.moon === guard && guard.held, 'the living world holds the rock as its guard moon');
  return { world, guard };
};
{
  const { me, moons } = setup(), { world, guard } = living(), near = [world, guard];
  let seen = false, t = 0;
  for (; t < 4 && !moons.owns(guard); t += DT) {
    beside(me, guard, world);
    moons.update(DT, near, 1, () => undefined);
    seen ||= moons.catching()?.body === guard;
    tendMoon(world, near, me, DT);
  }
  assert.ok(seen, 'a guard moon is a capture candidate');
  assert.ok(moons.owns(guard) && moons.stolen === 1, `caught in ${t.toFixed(2)} s and counted stolen (${moons.stolen})`);
  assert.ok(guard.moon && !guard.held && world.rival!.moon === undefined, 'yours, no longer held; the world let it go');
}
{ // Swung to meet a threat it stands still beside its world (no orbit to test): held, it still counts as hosted (moons.ts hostOf).
  const { me, moons } = setup(), { world, guard } = living(), v = 3 * V_STICK * 2 * world.r, threat = rock(0.01 * ME_M, 0, 0), near = [world, guard, threat];
  for (let t = 0; t < 4 && !moons.owns(guard); t += DT) {
    Object.assign(threat.motion, { x: 1.5 * v, y: 0, vx: -v, vy: 0 }); // on course to the world, 1.5 s out, from the moon's side
    tendMoon(world, near, me, DT); // the field's step first here, so the catch is judged on a swung moon
    const d = Math.hypot(guard.motion.x, guard.motion.y), circ = Math.sqrt((G_WORLD * world.m) / d); // the world at rest at 0
    if (!moons.owns(guard)) assert.ok(Math.hypot(guard.motion.vx, guard.motion.vy) < 0.5 * circ, 'the guard all but stands in the threat\'s path (under hostOf ORBIT_V)');
    beside(me, guard, world);
    moons.update(DT, near, 1, () => undefined);
  }
  assert.ok(moons.owns(guard) && moons.stolen === 1, 'a swung guard moon is stolen too');
}
{ // Let go when its world's life ends (rival.ts markFreed): caught within STOLEN_S it is still stolen.
  const { me, moons } = setup(), { world, guard } = living(), near = [world, guard];
  world.rival!.entry!.life.progress = 0;
  tendMoon(world, near, me, DT);
  assert.ok(!guard.held && world.rival!.moon === undefined, 'a lifeless world lets its guard moon go');
  Object.assign(guard.motion, { vx: 0, vy: 0 });
  for (let t = 0; t < 4 && !moons.owns(guard); t += DT) [beside(me, guard, world), moons.update(DT, near, 1, () => undefined)];
  assert.ok(moons.owns(guard) && moons.stolen === 1, 'a guard moon let go by a dying world counts as stolen');
}
{
  const { me, moons } = setup(), comet = rock(0.06 * ME_M, 500, 0, COMP.icy), anchor = rock(1, 0, 0);
  [comet.held, comet.comet, comet.meteor] = [true, true, true];
  for (let t = 0; t < 4; t += DT) {
    beside(me, comet, anchor);
    moons.update(DT, [comet], 1, () => undefined);
    assert.ok(moons.catching()?.body !== comet && !moons.owns(comet), 'a great comet is never a candidate');
  }
}
console.log('moons: a living rival world\'s guard moon is caught and stolen (swung at a threat too), one let go by a dying world too; a great comet never');
