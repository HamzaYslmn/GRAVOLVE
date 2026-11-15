// node test/core/water.test.ts: water states, steam kept by gravity, and boiling as a thermostat.
import assert from 'node:assert/strict';
import { boil, boilingK, hold, kelvin, pressure, waterState } from '../../src/core/water.ts';

const DWARF = 10 ** 4.5, PEBBLE = 50;
const heatAt = (k: number) => (k - kelvin(0)) / (kelvin(1) - kelvin(0));

// No air: warmed ice goes straight to steam. A quarter gas on a dwarf: 1 atmosphere, so liquid between 273 and 373 K.
assert.equal(waterState(PEBBLE, heatAt(300), 0.25), 'steam');
assert.equal(waterState(DWARF, heatAt(300), 0.25), 'liquid');
assert.equal(waterState(DWARF, heatAt(250), 0.25), 'ice');
assert.equal(waterState(DWARF, heatAt(400), 0.25), 'steam');
assert.ok(Math.abs(pressure(DWARF, 0.25) - 1) < 1e-9 && Math.abs(boilingK(1) - 373) < 1e-9);

// A pebble loses its steam; a dwarf keeps it all as gas.
assert.equal(boil(PEBBLE, 3, 0.3, 0, 0.1).kept, 0);
const d = boil(DWARF, 3, 0.3, 0, 0.1);
assert.ok(d.boiled > 0 && d.kept === d.boiled && d.cool > 0);
assert.ok(hold(1e3) === 0 && hold(DWARF) === 1);

// A molten dwarf with 32% water: boiling cools it to near the boiling point within
// seconds, spends only a little water, and the kept steam becomes gas (atmosphere).
let m = DWARF, heat = 3, water = 0.32, gas = 0;
for (let t = 0; t < 30; t += 0.05) {
  const b = boil(m, heat, water, gas, 0.05);
  heat -= b.cool;
  const after = m - b.boiled + b.kept;
  [water, gas, m] = [(water * m - b.boiled) / after, (gas * m + b.kept) / after, after];
}
const k = kelvin(heat), bp = boilingK(pressure(m, gas));
assert.ok(k < bp + 15, `cooled to ${k.toFixed(0)} K (boils at ${bp.toFixed(0)} K)`);
assert.ok(water > 0.25 && gas > 0.03, `water ${water.toFixed(3)}, gas ${gas.toFixed(3)}`);
console.log(`water ok: molten dwarf with 32% water cools 1410 -> ${k.toFixed(0)} K in 30 s (boils at ${bp.toFixed(0)} K), water 0.32 -> ${water.toFixed(3)}, gas 0 -> ${gas.toFixed(3)}`);
