// node test/civilization/mining.test.ts: the mining AI picks the nearer of two equal sites, an icy site for a
// dry world up to ~2× as far (break-even printed), skips a danger-1 site unless it is the only one, prefers a defeated
// world to a moon, never picks past the reach (a link to a big body holds to 1.15×), never flip-flops under ±5% noise,
// debris clusters are found (≥ 4 small bodies close together), and the miner cap from metal holds.
import assert from 'node:assert/strict';
import { assign, BIG, clusters, DEBRIS_N, fireRange, inReach, LINK_HOLD, minerCap, PER_SITE, reach, scores, type Needs, type Site } from '../../src/evolution/civilization/mining.ts';
import { lcg } from '../helpers.ts';

const SLOTS = 5, R = reach(SLOTS), calm: Needs = { fleetShort: false, energyShort: false };
const rock = { rock: 1 }, icy = { ice: 0.8, rock: 0.2 };
const site = (id: number, d: number, o: Partial<Site> = {}): Site => ({ id, d, share: 0.02, comp: rock, kind: 'moon', danger: 0, ...o });
/** Sites the given miners (all idle) go to. */
const pick = (sites: Site[], n = calm, miners = 1) => assign(new Array(miners).fill(undefined), scores(sites, n, SLOTS));

assert.ok(Math.abs(R - 13.4) < 1e-9, `reach with 5 slots: outer slot 7.4 R + 6 R = ${R}`);
assert.ok(Math.abs(reach(1) - 8.4) < 1e-9 && reach(0) === reach(1)); // one slot: 2.4 + 6

// Of two equal sites, the nearer wins.
assert.deepEqual(pick([site(1, 8), site(2, 5)]), [2]);
// A defeated world beats a moon at equal distance (2.5× efficiency).
assert.deepEqual(pick([site(1, 6), site(2, 6, { kind: 'defeated' })]), [2]);
// Size counts: a 25% free body at the edge of the reach beats a 2% moon at 3 R; a 0.3% pebble at 3 R does not beat the moon at 6 R.
assert.deepEqual(pick([site(1, 3), site(2, R, { share: 0.25, kind: 'free' })]), [2]);
assert.deepEqual(pick([site(1, 6), site(2, 3, { share: 0.003, kind: 'free' })]), [1]);

// A dry world (lacks ice) picks an icy site at up to 2× the distance of a rocky one.
const dry: Needs = { lack: 'ice', fleetShort: false, energyShort: false };
for (const near of [3, 4, 6]) assert.deepEqual(pick([site(1, near), site(2, 2 * near, { comp: icy })], dry), [2], `icy at 2× ${near} R`);
assert.deepEqual(pick([site(1, 4), site(2, 8, { comp: icy })]), [1], 'a world lacking nothing takes the nearer rock');
{
  let d = 4;
  while (pick([site(1, 4), site(2, d, { comp: icy })], dry)[0] === 2) d += 0.01;
  console.log(`dry world, rocky moon at 4 R: an icy moon wins out to ${d.toFixed(2)} R (${(d / 4).toFixed(2)}×)`);
  assert.ok(d / 4 >= 2);
}
// Metal ×2 while the fleet is short, radioactive ×2 while energy is short.
assert.deepEqual(pick([site(1, 4), site(2, 6, { comp: { metal: 1 } })], { fleetShort: true, energyShort: false }), [2]);
assert.deepEqual(pick([site(1, 4), site(2, 6, { comp: { radio: 1 } })], { fleetShort: false, energyShort: true }), [2]);

// A danger-1 site is skipped (even with miners to spare) unless it is the only one.
assert.deepEqual(pick([site(1, 4, { danger: 1 }), site(2, 12)], calm, 4), [2, 2, undefined, undefined]);
assert.deepEqual(pick([site(1, 4, { danger: 1 }), site(2, R + 1)], calm, 1), [1], 'the only site in reach');
assert.deepEqual(pick([site(1, 4, { danger: 0.5 }), site(2, 5)]), [2]); // partial danger weighs in

// Nothing beyond the reach is picked; a linked big body holds to 1.15× reach, a moon-sized one does not.
assert.deepEqual(pick([site(1, R + 0.01, { kind: 'defeated' })], calm, 3), [undefined, undefined, undefined]);
assert.deepEqual(pick([site(1, R)]), [1]);
const big = site(1, 1.1 * R, { share: BIG, kind: 'defeated' });
assert.ok(!inReach(big, SLOTS) && inReach({ ...big, linked: true }, SLOTS) && !inReach({ ...big, linked: true, d: LINK_HOLD * R + 0.01 }, SLOTS));
assert.ok(!inReach({ ...big, share: 0.1, linked: true }, SLOTS), 'only a body too big to be a moon gets the link margin');
assert.deepEqual(pick([site(1, 5, { share: 0 })]), [undefined], 'a mined-out site');

// Greedy, at most PER_SITE a site: 5 miners, 2 sites → 2 + 2, one idle.
{
  const out = pick([site(1, 4), site(2, 6)], calm, 5);
  assert.deepEqual(out, [1, 1, 2, 2, undefined]);
  assert.equal(PER_SITE, 2);
}
// Switching: only for a site ≥ 1.25× better.
{
  const sites = [site(1, 6), site(2, 6)], sc = scores(sites, calm, SLOTS);
  assert.deepEqual(assign([1], new Map([[1, 1], [2, 1.2]])), [1]);
  assert.deepEqual(assign([1], new Map([[1, 1], [2, 1.25]])), [2]);
  assert.deepEqual(assign([1, 1], sc), [1, 1]);
  assert.deepEqual(assign([1, undefined], new Map([[1, 0], [2, 1]])), [2, 2], 'a site that left the reach frees its miner');
}

// No flip-flop: 6 miners, 5 sites of near-equal worth, ±5% noise on every score, re-scored 5000 times (every 2 s ≈ 2.8 h).
{
  const rnd = lcg(7), sites = [site(1, 5), site(2, 5.2), site(3, 5.5, { comp: { metal: 1 } }), site(4, 6), site(5, 6.3, { kind: 'debris' })];
  let miners: (number | undefined)[] = new Array(6).fill(undefined), switches = 0;
  for (let i = 0; i < 5000; i++) {
    const sc = scores(sites, calm, SLOTS);
    for (const [id, v] of sc) sc.set(id, v * (0.95 + 0.1 * rnd()));
    const next = assign(miners, sc);
    if (i > 0) switches += next.filter((s, k) => s !== miners[k]).length;
    for (const id of new Set(next)) if (id !== undefined) assert.ok(next.filter((s) => s === id).length <= PER_SITE);
    miners = next;
  }
  console.log(`no flip-flop: ${switches} switches in 5000 noisy re-scores (6 miners, 5 sites), sites ${miners.join(' ')}`);
  assert.equal(switches, 0);
}

// A link to a big body: holds while you drift out to 1.15× reach, snaps just past it.
{
  const linked = { ...big, linked: true };
  assert.ok(inReach({ ...linked, d: 1.149 * R }, SLOTS) && !inReach({ ...linked, d: 1.151 * R }, SLOTS), 'link breaks past 1.15× reach');
}

// Debris clusters: ≥ 4 small bodies within 1.5 R of the first; 3 are not; a spread line is not; two groups are two.
{
  const at = (x: number, y = 0) => ({ x, y });
  assert.deepEqual(clusters([at(0), at(0.5), at(1, 0.5), at(0, 1.4)]), [[0, 1, 2, 3]]);
  assert.deepEqual(clusters([at(0), at(0.5), at(1)]), [], 'three is not a cluster');
  assert.deepEqual(clusters([0, 2, 4, 6, 8].map((x) => at(x))), [], 'spread out');
  assert.equal(clusters([...[0, 0.3, 0.6, 0.9].map((x) => at(x)), ...[20, 20.3, 20.6, 20.9, 21.2].map((x) => at(x))]).length, 2);
  assert.equal(DEBRIS_N, 4);
}

// Miner cap from metal: clamp(2 + ⌊metal / 15⌋, 2, 12).
assert.deepEqual([0, 14, 15, 29, 30, 149, 150, 1e6, -5].map(minerCap), [2, 2, 3, 3, 4, 11, 12, 12, 2]);
console.log(`miner cap: ${[0, 15, 45, 90, 150].map((m) => `${m} metal → ${minerCap(m)}`).join(', ')}`);
// Fire range: 2 × the reach off the surface, and a rival's kept orbit (8–12 R, ≥ outer slot + 3) sits inside it.
assert.equal(fireRange(1), 2 * reach(1));
assert.ok(fireRange(1) > 12 + 2 && fireRange(5) > fireRange(1), 'the kept orbit is inside the fire range');
console.log(`fire range (R off the surface): 1 slot ${fireRange(1).toFixed(1)}, 3 slots ${fireRange(3).toFixed(1)}, 5 slots ${fireRange(5).toFixed(1)}`);
console.log('mining ok');
