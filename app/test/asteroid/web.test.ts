// node test/asteroid/web.test.ts: voids cover ~40% of the map and are 8–40 start screens across (median
// chord along straight lines); a void holds ~1/100 of a filament's rock. Every biome exists; rapids, meteor and Kuiper
// belts are rarer than the plain belt; Kuiper belts lie only beside voids; the start area is plain belt; half the moving
// groups stand still.
import assert from 'node:assert/strict';
import { biomeAt, density, groupDrift, HOME, kindMix, nearStart, place, VOID_FLOOR, VOID_W, web, type Biome } from '../../src/evolution/asteroid/web.ts';

const SCREEN = 1280 / 1.02; // world units across a 1280-px screen at the start zoom
const seeds = [292, 292 + 7919, 292 + 2 * 7919]; // the first three runs' field seeds (main.ts)
const pct = (v: number) => `${(100 * v).toFixed(1)}%`;
for (const seed of seeds) {
  const chords: number[] = [];
  let voidN = 0, n = 0, inVoid = 0, inWeb = 0, nVoid = 0, nWeb = 0;
  const count: Partial<Record<Biome, number>> = {}, ice: Partial<Record<Biome, number>> = {}, rock: Partial<Record<Biome, number>> = {};
  const kuipers: [number, number][] = [];
  for (let line = 0; line < 40; line++) {
    const y = line * 37000 + 1234;
    let run = 0;
    for (let x = 0; x < 2e6; x += 250) {
      const w = web(x, y, seed);
      n++;
      if (w < 0.1) [run, voidN] = [run + 250, voidN + 1];
      else if (run) [chords[chords.length], run] = [run / SCREEN, 0];
      if (x % 5000 === 0) {
        const d = density(x, y, seed, w);
        if (w < 0.1) [inVoid, nVoid] = [inVoid + d, nVoid + 1];
        if (w > 0.9) [inWeb, nWeb] = [inWeb + d, nWeb + 1];
      }
      if (x % 500 === 0) {
        const p = place(x, y, seed, w), mix = kindMix(p), b = p.biome;
        count[b] = (count[b] ?? 0) + 1;
        ice[b] = (ice[b] ?? 0) + mix[2];
        rock[b] = (rock[b] ?? 0) + mix[0];
        if (b === 'kuiper' && x % 10000 === 0) kuipers.push([x, y]);
      }
    }
  }
  const wide = chords.filter((c) => c > 1).sort((a, b) => a - b), med = wide[wide.length >> 1], share = voidN / n;
  const ratio = inVoid / nVoid / (inWeb / nWeb);
  assert.ok(share > 0.3 && share < 0.5, `void share ${share}`);
  assert.ok(med >= 8 && med <= 40, `median void chord ${med} screens`);
  assert.ok(ratio < 0.02 && inVoid / nVoid < 2 * VOID_FLOOR + 0.005, `void/filament density ${ratio}`);
  console.log(`web ok (seed ${seed}): voids ${(100 * share).toFixed(0)}% of the map, chords median ${med.toFixed(1)} screens (quartiles ${wide[wide.length >> 2].toFixed(1)}–${wide[(3 * wide.length) >> 2].toFixed(1)}), void density ${(100 * ratio).toFixed(1)}% of a filament's`);

  // Biomes: all present; the special belts rarer than the plain one; materials distinct.
  const total = Object.values(count).reduce((s, v) => s + v, 0), at = (b: Biome) => (count[b] ?? 0) / total;
  const all: Biome[] = ['belt', 'ice', 'metal', 'gas', 'rapids', 'meteors', 'kuiper', 'void'];
  for (const b of all) assert.ok(at(b) > 0.02, `${b} share ${at(b)}`);
  for (const b of ['rapids', 'meteors', 'kuiper'] as Biome[]) assert.ok(at(b) < at('belt') / 2, `${b} ${at(b)} vs belt ${at('belt')}`);
  const avg = (m: typeof ice, b: Biome) => (m[b] ?? 0) / (count[b] ?? 1);
  assert.ok(avg(ice, 'kuiper') > 0.6 && avg(ice, 'ice') > 0.55 && avg(rock, 'belt') > 0.65, 'kind mixes');
  // Kuiper belts ring voids: a void within 8 start screens of every Kuiper spot.
  const reach = 8 * SCREEN, nearVoid = kuipers.filter(([x, y]) => {
    for (let k = 0; k < 24; k++)
      for (let d = 250; d <= reach; d += 250) if (web(x + Math.cos(k * 0.2618) * d, y + Math.sin(k * 0.2618) * d, seed) < VOID_W) return true;
    return false;
  }).length / kuipers.length;
  assert.ok(nearVoid > 0.98, `Kuiper spots beside a void ${nearVoid}`);
  // The start area (forced web, calm) is plain belt anywhere on the map.
  for (let k = 0; k < 400; k++) {
    const sx = k * 12345.6, sy = k * 7890.1, a = k * 2.4, d = HOME * Math.sqrt((k % 20) / 20), dx = Math.cos(a) * d, dy = Math.sin(a) * d;
    const [calm, floor] = nearStart(dx, dy), x = sx + dx, y = sy + dy;
    assert.equal(biomeAt(x, y, seed, Math.max(web(x, y, seed), floor), calm), 'belt', `start area at ${d.toFixed(0)}`);
  }
  console.log(`biomes ok (seed ${seed}): ${all.map((b) => `${b} ${pct(at(b))}`).join(', ')}; ice in Kuiper ${pct(avg(ice, 'kuiper'))}, ice field ${pct(avg(ice, 'ice'))}, rock in belt ${pct(avg(rock, 'belt'))}; Kuiper beside a void ${pct(nearVoid)}`);
}

// Moving groups: about half stand still, the rest drift at 10–25 start units/s.
let still = 0, cells = 0;
for (let i = 0; i < 4000; i++) {
  const [vx, vy] = groupDrift(i * 1733.3, i * 977.7, 292), v = Math.hypot(vx, vy);
  cells++;
  if (!v) still++;
  else assert.ok(v >= 10 && v <= 25, `group speed ${v}`);
}
assert.ok(Math.abs(still / cells - 0.5) < 0.08, `still groups ${still / cells}`);
console.log(`groups ok: ${pct(still / cells)} of spots in still groups`);

// Biome spacing: walking a straight line, plain belt between two different biomes
// (median ~5 screens); only a void and its Kuiper ring touch.
{
  const gaps: number[] = [];
  for (let line = 0; line < 30; line++) {
    let last: Biome | undefined, since = 0;
    for (let x = 0; x < 2e6; x += 250) {
      const b = biomeAt(x, line * 37000 + 1234, seeds[0]);
      if (b === 'belt') { since += 250; continue; }
      if (last && b !== last && [b, last].sort().join() !== 'kuiper,void') gaps.push(since / SCREEN);
      [last, since] = [b, 0];
    }
  }
  gaps.sort((a, b) => a - b);
  const med = gaps[gaps.length >> 1], touching = gaps.filter((g) => !g).length;
  assert.ok(med >= 4 && touching / gaps.length < 0.01, `biome gap median ${med} screens, touching ${touching}/${gaps.length}`);
  console.log(`biome gaps ok: median ${med.toFixed(1)} screens of plain belt between two biomes, ${touching} of ${gaps.length} touching`);
}
