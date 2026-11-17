// node test/star/rules.test.ts (part of npm test): link timing, Roche limits, radiation and warmth, the
// climate-vs-coverage table (the liquid band moves inward as the Dyson sphere grows), Dyson energy and build time.
import assert from 'node:assert/strict';
import { blend, COMP, density, G_WORLD, R_CAP, radiusOf, START_R, youPull } from '../../src/evolution/asteroid/rules.ts';
import { climateK, envelope, habitability, moonSlots } from '../../src/evolution/planet/rules.ts';
import { kelvin, pressure } from '../../src/core/water.ts';
import { dose } from '../../src/evolution/civilization/rules.ts';
import {
  COLONY, COLONY_HAB, COLONY_LOST, colonyScore, dysonSpeed, heatAt, TERRA_ATM, TERRA_VOL, TERRA_WATER, terraMass, terraNeed, zoneSlot,
  BAND, capacity, DONE, GROW, layout, PLANET_R, dysonEnergy, engineAccel, flareK, flux, glare, LINK_S, linkStep, liquidBand, luminosity, orbitGoal, lapMu, LAP_MIN, PULL_X, starMu, starPull,
  roche, SEG_ORE, SEG_S, SEGMENTS, starColor, starKelvin, starMass, starName, starRadius, SUN, sunlight, tearRate, warmth,
} from '../../src/evolution/star/rules.ts';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '∞');

// Link: 60 s in the band at any frame rate; outside it decays twice as fast; the band's edges count.
for (const fps of [30, 60, 144]) {
  let p = 0, t = 0;
  while (p < 1) [p, t] = [linkStep(p, 3, 1 / fps), t + 1 / fps];
  assert.ok(Math.abs(t - LINK_S) <= 1.5 / fps, `${fps} fps: linked after ${t.toFixed(3)} s`);
}
{
  let p = 0;
  for (let i = 0; i < 30 * 60; i++) p = linkStep(p, 3.5, 1 / 60); // 30 s in the band
  assert.ok(near(p, 0.5, 1e-6));
  for (let i = 0; i < 10 * 60; i++) p = linkStep(p, 5, 1 / 60); // 10 s outside: −20 s worth
  assert.ok(near(p, 1 / 6, 1e-6), `decays 2×: ${p}`);
  for (let i = 0; i < 6 * 60; i++) p = linkStep(p, 1.5, 1 / 60); // too close counts as outside
  assert.ok(p === 0);
  assert.ok(linkStep(0, BAND[0], 1) > 0 && linkStep(0, BAND[1], 1) > 0 && linkStep(0.5, BAND[1] + 0.01, 1) < 0.5);
}

// Roche: ρ★ 1.4; rock 1.51 R★, iron-rich and pure iron clamped to 1.3, icy clamped to 1.6; tides grow toward the surface.
const rRock = roche(density({ rock: 1 })), rMetal = roche(5), rIce = roche(density({ ice: 1 })), rIron = roche(7.8);
assert.ok(near(rRock, 1.95 * Math.cbrt(1.4 / 3), 1e-9) && rRock > 1.45 && rRock < 1.55, `rock ${rRock}`);
assert.ok(rMetal === 1.3 && rIce === 1.6 && rIron === 1.3 && rRock < BAND[0], `metal ${rMetal} ice ${rIce} iron ${rIron}`);
assert.ok(tearRate(rRock, rRock) === 0 && tearRate(rRock + 1, rRock) === 0 && near(tearRate(1, rRock), 0.15) && tearRate(1.5, rRock) < 0.15);
// One gravity (stars in game mass): pull on a 1e5 habitable world as a share of its thrust (player.ts thrustOf), μ against
// yours, the placed orbit's lap and its LAP_MIN floor.
{
  const HAB = { rock: 0.55, metal: 0.12, ice: 0.3, gas: 0.03 }, r = radiusOf(1e5, HAB);
  const thrust = 500 * (r / START_R) ** 0.4 * (density(COMP.dust) / density(HAB)) ** 0.3; // player.ts thrustOf
  const share = (M: number, x: number) => starPull(starMu(M), x * starRadius(M), starRadius(M)) / thrust;
  assert.ok(share(1, 2.5) > 0.4 && share(1, 2.5) < 0.55, `sun at 2.5 R★: ${share(1, 2.5)}`);
  assert.ok(share(0.4, 2.5) < share(1, 2.5) && share(8, 2.5) > 1, 'red dwarfs pull less, a blue giant more than your thrust');
  assert.ok(starMu(0.4) >= 30 * G_WORLD * youPull(1e5, r), `red dwarf μ ${starMu(0.4) / (G_WORLD * youPull(1e5, r))}× yours`);
  for (let x = 1; x < PULL_X; x += 0.25) assert.ok(share(1, x + 0.25) < share(1, x), `pull falls with distance at ${x}`);
  const lap = (mu: number, d: number) => (2 * Math.PI) / Math.sqrt(mu / d ** 3);
  for (const M of [0.3, 0.4, 1, 8, 20]) for (let x = 1; x <= 12; x += 0.5) {
    const d = x * starRadius(M), mu = lapMu(starMu(M), d);
    assert.ok(lap(mu, d) >= LAP_MIN - 1e-9 && mu <= starMu(M), `lap floor ${M} suns at ${x} R★`);
    if (lap(starMu(M), d) > LAP_MIN) assert.ok(near(mu, starMu(M)), 'slow laps keep the true μ');
  }
  console.log('pull at 2.5 / 5 R★ (% of a 1e5 thrust):', [0.4, 1, 8].map((M) => `${M} suns ${f(share(M, 2.5) * 100, 0)} / ${f(share(M, 5) * 100, 0)}`).join(', '),
    '· μ★ / yours at 1e5:', [0.4, 1, 8].map((M) => f(starMu(M) / (G_WORLD * youPull(1e5, r)), 0)).join(' / '),
    '· true lap at 4 R★ s:', [0.4, 1, 8].map((M) => f(lap(starMu(M), 4 * starRadius(M)), 1)).join(' / '));
}

// Stars: masses 0.4–8 suns, colours red → white → blue.
assert.ok(near(starMass(0), 0.4) && near(starMass(1), 8) && starMass(0.5) < 1);
const cool = starColor(starKelvin(0.4)), sun = starColor(starKelvin(1)), hot = starColor(starKelvin(8));
assert.ok((cool >> 16) === 255 && (cool & 255) < 160, `red dwarf ${cool.toString(16)}`);
assert.ok((sun >> 16) === 255 && (sun & 255) > 200, `sun ${sun.toString(16)}`);
assert.ok((hot & 255) === 255 && (hot >> 16) < 180, `blue ${hot.toString(16)}`);
assert.ok(starName(starKelvin(0.4)) === 'Red dwarf' && starName(5800) === 'Yellow star' && starName(starKelvin(8)) === 'Blue giant');
// Sizes in world units, the same at any mass of yours: red dwarf 800, sun 918, blue giant 1254; the smallest star (starMass(0))
// is 1.5× the biggest planet (R_CAP) and heavier than any spawn (0.9e7) or brown dwarf (1e7).
assert.ok(near(starRadius(0.4), 800) && Math.abs(starRadius(1) - 918) < 1 && Math.abs(starRadius(8) - 1254) < 1);
for (let M = 0.3; M < 20; M *= 1.05) assert.ok(starRadius(M * 1.05) > starRadius(M), `radius rises at ${M}`);
assert.ok(starRadius(starMass(0)) >= 1.5 * R_CAP && starMass(0) * SUN > 1e7, `smallest star ${starRadius(starMass(0))}`);

// Radiation and warmth (no Dyson), compressed with the system: a blue giant burns a civilization (field 0.6, 1 atm) at the
// link band's inner edge, a sun or a red dwarf nowhere in it.
const sunG = glare(1), blueG = glare(8), redG = glare(0.4);
const doseAt = (g: number, x: number, cover = 0) => dose(0, 0.6, 1, flux(g, cover, x));
assert.ok(near(flux(sunG, 0, 2), 2.3 / 4) && doseAt(sunG, BAND[0]) < 1 && doseAt(sunG, 1.2) < 1 && doseAt(sunG, 4) < doseAt(sunG, 2));
assert.ok(doseAt(blueG, BAND[0]) >= 1 && doseAt(blueG, 3) < 1 && doseAt(redG, 1.2) < 1, 'blue giants burn the inner band, red dwarfs are gentle');
assert.ok(near(warmth(sunG, 0, 2), 25) && near(flareK(sunG, 0, 2), 9 / 4) && flareK(sunG, 0, 6) === 0);
console.log('dose (field 0.6, 1 atm) at 2/3/4 R★  red', [2, 3, 4].map((x) => f(doseAt(redG, x))).join(' / '), ' sun', [2, 3, 4].map((x) => f(doseAt(sunG, x))).join(' / '), ' blue', [2, 3, 4].map((x) => f(doseAt(blueG, x))).join(' / '));
console.log('warmth K at 2/3/4 R★  red', [2, 3, 4].map((x) => f(warmth(redG, 0, x), 0)).join(' / '), ' sun', [2, 3, 4].map((x) => f(warmth(sunG, 0, x), 0)).join(' / '), ' blue', [2, 3, 4].map((x) => f(warmth(blueG, 0, x), 0)).join(' / '));
// The Dyson sphere dims the dose too (shade from its panels): a sun at 3 R★ under a half sphere is safe-ish.
assert.ok(doseAt(sunG, 3, 0.5) < doseAt(sunG, 3, 0));
// Sunlight on your solar wings (civilization/rules.ts solar): 1 at 3 R★ from a sun, 1/x with no floor, glow and Dyson shade scale it.
assert.ok(near(sunlight(1, 0, 3), 1) && near(sunlight(1, 0, 6), 0.5) && near(sunlight(1, 0, 30), 0.1) && Math.abs(sunlight(redG, 0, 3) - 0.58) < 0.01 && near(sunlight(1, 1, 3), 0.2));
for (let x = 1; x < 100; x *= 1.1) assert.ok(sunlight(1, 0, x * 1.1) < sunlight(1, 0, x), `sunlight falls at ${x}`);

// Climate vs coverage: the liquid band for a sun at 0 / 25 / 50 / 80 / 100% cover, by pressure.
// Every edge moves inward as the cover grows; thin-air worlds need the star, thick-air worlds only need distance.
console.log('liquid band [inner–outer] R★ around a sun by Dyson cover 0 / 25 / 50 / 80 / 100%:');
for (const p of [0.2, 0.3, 0.6, 1.4]) {
  const bands = [0, 0.25, 0.5, 0.8, 1].map((c) => liquidBand(p, sunG, c));
  console.log(`  ${p} atm: ${bands.map((b) => (b ? `${f(b[0], 1)}–${f(b[1], 1)}` : 'none')).join(' | ')}`);
  for (let i = 1; i < bands.length; i++) {
    const a = bands[i - 1]!, b = bands[i]!;
    assert.ok(b[0] < a[0] && (b[1] < a[1] || (b[1] === Infinity && a[1] === Infinity)), `${p} atm: band moves inward`);
  }
}
const thin = liquidBand(0.2, sunG, 0)!, thinHalf = liquidBand(0.2, sunG, DONE)!;
assert.ok(thin[1] < 3 && thinHalf[1] < thin[1], 'a 0.2 atm world needs the star: it must move inward as the sphere closes');
assert.ok(liquidBand(0.01, sunG, 0) === undefined, 'no air, no seas');

// Dyson: energy per class at 50% and 100%; time and ore to the stage goal.
console.log('Dyson E/s at 50% / 100%:', [0.4, 1, 2, 8].map((M) => `${starName(starKelvin(M))} ${f(dysonEnergy(M, 0.5), 1)} / ${f(dysonEnergy(M, 1), 0)}`).join(', '));
assert.ok(near(dysonEnergy(1, 1), 20) && near(dysonEnergy(8, 1), 20 * Math.sqrt(luminosity(8))) && dysonEnergy(0.4, 1) < 5);
const segs = Math.ceil(DONE * SEGMENTS);
console.log(`Dyson ${DONE * 100}%: ${segs} segments, ${segs * SEG_ORE} ore, ≥ ${segs * SEG_S} s of building`);
// Engine from the link: 1.2× your thrust with no Dyson, grows with the cover, capped at 4×.
for (const M of [0.4, 1, 2, 8]) {
  let last = engineAccel(1, dysonEnergy(M, 0));
  assert.ok(near(last, 2 * 0.6), `${M} suns: base engine ${last}`);
  for (let c = 0.05; c <= 1 + 1e-9; c += 0.05) {
    const a = engineAccel(1, dysonEnergy(M, c));
    assert.ok(a >= last && a <= 4, `${M} suns: engine monotonic in cover`);
    last = a;
  }
}
console.log('engine × thrust at Dyson 0 / 50 / 100%:', [0.4, 1, 8].map((M) => `${M} suns ${[0, 0.5, 1].map((c) => f(engineAccel(1, dysonEnergy(M, c)))).join(' / ')}`).join(', '));
// Compressed layout (rules.ts layout) for a 1e5 and a 1e6 habitable world round each class: the orbit range starts at the
// link band's inner edge or farther, so your moons clear the star (≥ 0.25 R★ off its surface); rings clear your moons from
// anywhere in the range and each other; the catch zone starts at ring 0; with the orbit at its floor the full system fits the
// short half-view at the 2.5× zoom-out cap (1280×720, player view ∝ (r/16)^0.8 as in planet/rules.test.ts), except a blue
// giant's six rings at 1e5 (asserted at 4).
const HABW = { rock: 0.55, metal: 0.12, ice: 0.3, gas: 0.03 };
const ORB = layout(starRadius(1), radiusOf(1e5, HABW), moonSlots(1e5)).orbit; // a 1e5 world round a sun
const lays: string[] = [];
for (const m of [1e5, 1e6]) for (const M of [0.4, 1, 8]) {
  const R = starRadius(M), r = radiusOf(m, HABW), L = layout(R, r, moonSlots(m)), [lo, hi] = L.orbit, n = capacity(M), tag = `${m} round ${M} suns`;
  const half = (2.5 * (360 / 1.02) * (r / START_R) ** 0.8) / R; // R★
  assert.ok(lo >= BAND[0] && lo - L.reach >= 1.25 - 1e-9 && near(hi - lo, 1.2), `${tag}: moons clear the star`);
  for (const at of [lo, hi]) for (let k = 0; k < n; k++) {
    assert.ok(L.ring(k, at) - PLANET_R - (at + L.reach) >= 0.25 - 1e-9, `${tag}: ring ${k} clears your moons`);
    if (k) assert.ok(L.ring(k, at) - L.ring(k - 1, at) >= 2 * PLANET_R, `${tag}: rings ${k - 1}/${k} apart`);
  }
  assert.ok(near(L.catch(lo)[0], L.ring(0, lo)) && near(L.catch(lo)[1] - L.catch(lo)[0], 1));
  const edge = L.ring((M === 8 && m === 1e5 ? 4 : n) - 1, lo) + PLANET_R;
  assert.ok(edge <= half, `${tag}: edge ${f(edge)} R★ vs half-view ${f(half)} R★`);
  lays.push(`${m} ${M} suns: orbit ${f(lo * R, 0)} u, ring 0 ${f(L.ring(0, lo) * R, 0)}, edge ${f((L.ring(n - 1, lo) + PLANET_R) * R, 0)} / half-view ${f(half * R, 0)}`);
}
console.log('layout (orbit at its floor):', lays.join(' · '));
// Auto orbit (user, Q1): a living world settles inside its liquid band (every class, 0.3–2 atm, any Dyson cover) wherever
// the band reaches into its orbit range; a band past the range: the world waits at that edge.
const outside: string[] = [];
for (const M of [0.4, 0.7, 1, 2, 4, 8]) for (let p = 0.3; p <= 2 + 1e-9; p += 0.1) for (const c of [0, 0.5, 1]) {
  const b = liquidBand(p, glare(M), c);
  if (!b) continue; // too hot on its own: no liquid at any distance
  const g = orbitGoal(b, ORB), tag = `${M} suns ${f(p, 1)} atm cover ${c}: goal ${f(g)} in ${f(b[0])}–${f(b[1])}`;
  assert.ok(g >= ORB[0] && g <= ORB[1], tag);
  if (b[0] <= ORB[1] && b[1] >= ORB[0]) assert.ok(g >= b[0] && g <= b[1], tag);
  else {
    assert.ok(g === (b[0] > ORB[1] ? ORB[1] : ORB[0]), tag);
    if (!c) outside.push(`${M}@${f(p, 1)}`);
  }
}
console.log(`band past ${f(ORB[1])} R★ with no Dyson (suns@atm): ${outside.join(' ')}`);
console.log('orbit goal R★ (0 / 100% cover) at 0.3 / 1 / 1.4 atm:', [0.4, 1, 8].map((M) => `${M} suns ${[0.3, 1, 1.4].map((p) => [0, 1].map((c) => f(orbitGoal(liquidBand(p, glare(M), c)!, ORB), 1)).join('/')).join(', ')}`).join(' · '));
// System planets: capacity 2 / 4 / 6 for a red dwarf / sun / 8 suns, never past 6; capacity, size and light never fall as
// planets grow the star.
assert.ok(capacity(0.4) === 2 && capacity(1) === 4 && capacity(8) === 6 && capacity(100) === 6);
for (let M = 0.4, last = capacity(M); M < 20; M *= 1.01) {
  assert.ok(capacity(M) >= last && capacity(M) <= 6, `capacity monotonic at ${M}`);
  last = capacity(M);
}
for (const M0 of [0.4, 0.7, 1, 2, 4, 8]) {
  let M = M0, n = 0;
  while (n < capacity(M)) {
    const M1 = M * (1 + GROW);
    assert.ok(capacity(M1) >= capacity(M) && starRadius(M1) > starRadius(M) && glare(M1) > glare(M));
    [M, n] = [M1, n + 1];
  }
}
console.log(`star ok: link ${LINK_S} s (decay ×2), Roche rock ${f(rRock)} / metal ${f(rMetal)} / ice ${f(rIce)} R★`);
// Colonies: the fleet's cost; a delivery adds 0.1 atm or 2% water; the gas line at Super-Earth mass makes a gas world;
// Dyson speed 1 + 0.5 per colony; living planets get a ring in their band, clear of your orbit and each other.
assert.ok(COLONY.ore === 60 && COLONY.vol === 40 && COLONY.pop === 1 && TERRA_VOL === 20 && COLONY_LOST < COLONY_HAB);
for (const m of [10 ** 3.6, 1e4, 10 ** 4.6, 2e5]) for (const c of [{ rock: 0.7, metal: 0.27, gas: 0.03 }, { rock: 0.5, ice: 0.3, gas: 0.2 }]) {
  const p0 = pressure(m, c.gas), dg = terraMass(m, c, 'gas'), cg = blend(c, m, { gas: 1 }, dg), p1 = pressure(m + dg, cg.gas ?? 0);
  assert.ok(Math.abs(p1 - p0 - TERRA_ATM) < 0.2 * TERRA_ATM, `${m}: +${f(p1 - p0, 3)} atm`);
  const di = terraMass(m, c, 'ice'), ci = blend(c, m, { ice: 1 }, di);
  assert.ok(near((ci.ice ?? 0) - (c.ice ?? 0), TERRA_WATER, 1e-9), `${m}: +water`);
}
assert.ok(envelope(1e5, { rock: 0.8, gas: 0.2 }) && !envelope(1e5, { rock: 0.81, gas: 0.19 }) && !envelope(9e4, { rock: 0.5, gas: 0.5 }));
assert.ok(dysonSpeed(0) === 1 && dysonSpeed(1) === 1.5 && dysonSpeed(4) === 3);
assert.ok(near(kelvin(heatAt(0.5, 40)), climateK(0.5) + 40, 1e-9));
const sc = { water: 1, temp: 1, air: 1, magnet: 0 };
assert.ok(colonyScore(sc) === 0.5 && colonyScore({ ...sc, magnet: 1 }) === 1 && colonyScore({ ...sc, temp: 0 }) === 0);
assert.ok(terraNeed({ ...sc, air: 0.2, water: 0.5 }) === 'gas' && terraNeed({ ...sc, air: 0.9, water: 0.3 }) === 'ice' && terraNeed(sc) === undefined);
assert.ok(terraNeed({ ...sc, temp: 0 }) === undefined, 'a frozen world with air and seas needs warmth, not deliveries');
for (const band of [[5.2, 13.9], [2.3, 6.2], [9, Infinity], [13, 20]] as [number, number][]) for (const taken of [[8.6], [8.6, 6], [12]]) {
  const g = zoneSlot(band, taken, 2, [2.5, 12]);
  if (g === undefined) continue;
  assert.ok(g >= Math.min(Math.max(band[0], 2.5), 12) - 1e-9 && g <= Math.min(band[1], 12) + 1e-9 && taken.every((t) => Math.abs(t - g) >= 2), `slot ${g} in ${band} clear of ${taken}`);
}
assert.ok(zoneSlot([8, 9], [8.5], 2, [2.5, 12]) === undefined, 'no room: no slot');
// Terraforming an airless 10^4 rock (metal sunk) at a sun's band: deliveries to a colony, and what they cost.
{
  const m0 = 1e4;
  let m = m0, c = { rock: 0.65, metal: 0.25, ice: 0.08, gas: 0.02 } as Record<string, number>, trips = 0;
  for (; trips < 40; trips++) {
    const p = pressure(m, c.gas), band = liquidBand(Math.max(p, 0.7), glare(1), 0)!, x = (band[0] + Math.min(band[1], ORB[1])) / 2;
    const h = habitability({ m, r: 1, comp: c, heat: heatAt(p, warmth(glare(1), 0, x)), diff: 1 }), need = terraNeed(h);
    if (colonyScore(h) >= COLONY_HAB || !need) break;
    const dm = terraMass(m, c, need);
    [c, m] = [blend(c, m, { [need]: 1 }, dm) as Record<string, number>, m + dm];
  }
  assert.ok(trips > 0 && trips < 40, `terraformed in ${trips} trips`);
  console.log(`terraform 10^4 rock (2% gas, 8% water) at a sun: ${trips} trips, ${trips * TERRA_VOL} volatiles, mass +${f(((m - m0) / m0) * 100, 1)}% → ${f(pressure(m, c.gas))} atm, ${f(c.ice * 100, 0)}% water`);
}
