// node test/asteroid/persona.test.ts: rival personas (persona.ts). Every temper maps to a persona of each stage, unknown ones
// fall back to today's core and world; the wild draw covers all five cores; each persona reads as its table says.
import assert from 'node:assert/strict';
import { CORE, CORE_OF, contest, coreOf, huntYou, threat, WILD, WORLD, WORLD_OF, worldOf } from '../../src/evolution/asteroid/persona.ts';

for (const v of Object.values(CORE_OF)) assert.ok(v in CORE, `core ${v} is a key`);
for (const v of Object.values(WORLD_OF)) assert.ok(v in WORLD, `world ${v} is a key`);
assert.deepEqual(Object.keys(CORE_OF).sort(), Object.keys(WORLD_OF).sort(), 'both stages read the same tempers');
assert.equal(coreOf('nobody', 0.5), CORE.grazer, 'unknown temper: grazer');
assert.equal(worldOf('nobody'), WORLD.settler, 'unknown temper: settler');
assert.equal(worldOf(undefined), WORLD.settler, 'no temper: settler');
assert.ok(Math.abs(WILD.reduce((s, [, w]) => s + w, 0) - 1) < 1e-9, 'wild weights sum to 1');
const drawn = new Set(Array.from({ length: 100 }, (_, i) => coreOf(undefined, i / 100)));
assert.equal(drawn.size, Object.keys(CORE).length, 'the wild draw covers every core');
assert.equal(coreOf(undefined, 0.999999), CORE.grazer, 'the top of the draw is a grazer');

// Age I cores.
const { grazer, hunter, skittish, lunger, shadow } = CORE, m = 100, lighter = m / 1.15; // a body you'd be eaten by at 1.15×
assert.ok(lighter <= hunter.meal * m && !threat(hunter.nerve, lighter, m), "a hunter's meal reaches a body 1.15× lighter");
assert.ok(lighter > grazer.meal * m, 'a grazer waits until it is 1.25× you');
for (const s of [-1, 0, 1]) assert.equal(huntYou(skittish, s), 0, 'a skittish core never scores you as prey');
assert.ok(threat(skittish.nerve, 0.85 * m, m) && !threat(grazer.nerve, 0.85 * m, m), 'a skittish core bolts at 0.8×');
assert.ok(!threat(hunter.nerve, 1.2 * m, m) && threat(hunter.nerve, 1.4 * m, m), 'a hunter holds its ground to 1.3×');
assert.ok(lunger.stamina / grazer.stamina < 0.4, 'a lunger chases < 40% as long as a grazer');
assert.ok(shadow.stamina / grazer.stamina > 3 && shadow.chase < 1, 'a shadow chases > 3× as long, slower');
assert.ok(huntYou(grazer, 1) === 2 * huntYou(grazer) && huntYou(grazer, -1) === 0, 'spite scales hunting you');

// Age II worlds: never prey on you (no hunt column; rival.ts skips you as a world's prey).
for (const [k, w] of Object.entries(WORLD)) assert.ok(!('hunt' in w), `${k} has no hunt`);
const { settler, rustler, hermit, edger } = WORLD;
assert.ok(threat(hermit.nerve, 0.01 * m, m, hermit, true), 'a hermit counts you as a threat at any mass');
assert.ok(!threat(hermit.nerve, 0.01 * m, m, hermit, false), 'but not a small rock');
assert.ok(threat(edger.nerve, 0.5 * m, m, edger, true, 2.5) && !threat(edger.nerve, 0.5 * m, m, edger, true, 1), 'an edger flinches only as you close');
for (const w of [settler, rustler]) assert.ok(!threat(w.nerve, 0.5 * m, m, w, true, 10), 'settlers and rustlers mind only mass');
const range = 30;
assert.ok(contest(rustler, 0, range) >= 2 * contest(settler, 0, range), 'a rustler wants a rock at your side ≥ 2× a settler');
assert.equal(contest(rustler, range / 2, range), 1, 'no pull from half its sense range');
assert.equal(contest(edger, Infinity, range), 1, 'no pull with you gone');
console.log(`personas: ${Object.keys(CORE).length} cores, ${Object.keys(WORLD).length} worlds, ${Object.keys(CORE_OF).length} tempers mapped`);
