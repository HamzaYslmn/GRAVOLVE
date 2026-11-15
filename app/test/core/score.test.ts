// Run: node test/core/score.test.ts (part of npm test). The run score: integer, bands rise by stage, caps hold, idling earns nothing.
import assert from 'node:assert/strict';
import { massScore, scoreOf, type ScoreInput } from '../../src/core/score.ts';

const S = 69.46; // START_M
const base: ScoreInput = { peak: S, start: S, seconds: 0, life: false, tier: 0, ships: 0, worlds: 0, linked: false, cover: 0 };
const run = (o: Partial<ScoreInput>) => scoreOf({ ...base, ...o });

// Idling at the start mass scores nothing, however long.
assert.equal(run({ seconds: 99999 }).total, 0);

// Integer, and the parts add up.
for (const r of [run({ peak: 400, seconds: 75 }), run({ peak: 40000, seconds: 1500, life: true, tier: 3, ships: 12, worlds: 1, cover: 0.37 })]) {
  assert.ok(Number.isInteger(r.total));
  assert.equal(r.total, r.parts.reduce((s, p) => s + p.points, 0));
}

// Bands rise by stage: Age I death < planetoid < civilization < star.
const bands = [
  run({ peak: 400, seconds: 75 }),
  run({ peak: 6000, seconds: 300 }),
  run({ peak: 40000, seconds: 1500, life: true, tier: 3, ships: 12, worlds: 1 }),
  run({ peak: 60000, seconds: 2400, life: true, tier: 5, ships: 40, worlds: 2, linked: true, cover: 0.5 }),
].map((r) => r.total);
for (let i = 1; i < bands.length; i++) assert.ok(bands[i] > bands[i - 1], `bands rise: ${bands}`);

// Caps: time, ships, worlds.
assert.equal(run({ peak: 1e5, seconds: 1200 }).total, run({ peak: 1e5, seconds: 1e6 }).total);
assert.equal(run({ ships: 100 }).total, run({ ships: 5000 }).total);
assert.equal(run({ worlds: 4 }).total, run({ worlds: 40 }).total);

// Never falls when any input rises.
const full: ScoreInput = { peak: 30000, start: S, seconds: 600, life: false, tier: 2, ships: 10, worlds: 1, linked: false, cover: 0.2 };
const t0 = scoreOf(full).total;
for (const up of [{ peak: 40000 }, { seconds: 700 }, { life: true }, { tier: 3 }, { ships: 11 }, { worlds: 2 }, { linked: true }, { cover: 0.3 }])
  assert.ok(scoreOf({ ...full, ...up }).total > t0, `rises with ${JSON.stringify(up)}`);

// Old saves: the mass part alone, never above the full score.
assert.equal(massScore(S, S), 0);
assert.equal(massScore(40000, S), run({ peak: 40000 }).parts[0].points);

console.log(`score: bands ${bands.join(' < ')}, caps, monotone ok`);
