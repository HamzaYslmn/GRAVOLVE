// node test/civilization/rules.test.ts: population, energy and dose (by tier), tier, mining (the weighted mix),
// shield, fleet caps, rockets, a sample run (tiers, builds and bare moons printed), slug damage and duels, planetary combat
// (ARMS: weapon fire on shields, the stun, landings, time-to-break table, a rival's rock), the shield as a shell (a before →
// after damage table), its burn-up rule, shield layers, the siege switch, rival level and mass by temper.
import assert from 'node:assert/strict';
import { burnShare, collide, COMP, impactHeat, pieceShares, radiusOf, shellPass, SPECK, V_STICK, type Phys } from '../../src/evolution/asteroid/rules.ts';
import { GAP, RATE } from '../../src/evolution/civilization/flight.ts';
import { pull, trigger } from '../../src/evolution/civilization/guns.ts';
import { EXTINCT, magnet, PLANET_M, SUPER_M } from '../../src/evolution/planet/rules.ts';
import { beamK, sunlight } from '../../src/evolution/star/rules.ts';
import {
  buildSpeed, capacity, cityLevel, dose, energy, fedCapacity, GEO, geo, killRate, RADIO_LIMIT, radioDose, radioLimit, lack, mineable, mineMix, MINE_RATE, NEED, P0, popHit, popStep,
  ASLEEP_FALL, FLEET, shellR, fleetCap, FRAG, ROCKET, rocketRange, rocketSpread, shieldFed, shieldMax, upkeep, units, type Ore,
  FUEL_E, FUEL_LOW, fuelBurn, reactor, REACTOR, refine, SOLAR, solar, solarWings, UNIT, WORK_E, SHIELD_FLOOR, SHIELD_K, shieldCost, shieldHolds, shieldMeet, shieldPunch, shieldRegen, SHIELD_STOP, START_SHIPS, tier, TIER_MAX,
  BEATEN, chargeRate, DRIVER_COOL, fireDir, fleetSize, HIT_MIN, intercept, RIVAL_LEAD, RIVAL_MASS, RIVAL_HIT_MAX, rivalLevel, SLUG_E, SLUG_ORE, SLUG_SHARE, SLUG_SPEED,
  BEAM_BITE, BEAM_COOL, beamLeft, beamPop, CUT, CUT_SPREAD, cutSpread, edible, KEEP, pieceSize, split, strikeK, type Shield,
  ARMS, buildOrder, BURN_WAVE, LANDING, raid, rivalFrigates, SHIELD_REGEN, SHIELD_STUN, shieldShot, weaponHit, shieldLayers, siegeWing, SIEGE, sortieStep, CALM_S,
  homeDig, HOME_RICH, HOME_VOL,
} from '../../src/evolution/civilization/rules.ts';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// Population: logistic toward K, linear decline from above, floor; capacity from habitability and size.
assert.ok(near(capacity(1, PLANET_M), 10) && near(capacity(0.25, PLANET_M), 5) && capacity(0, PLANET_M) === 0);
assert.ok(capacity(0.5, PLANET_M) < capacity(0.5, SUPER_M)); // bigger worlds hold more
{
  let P = P0;
  for (let t = 0; t < 600; t++) P = popStep(P, 5, 0, 1);
  assert.ok(P > 4.9 && P <= 5, `grows to K: ${P}`);
  for (let t = 0; t < 60; t++) P = popStep(P, 2, 0, 1);
  assert.ok(P > 4.2 && P < 4.4, `a minute over capacity costs ~1/4 of the excess: ${P}`);
  for (let t = 0; t < 1200; t++) P = popStep(P, 2, 0, 1);
  assert.ok(P > 1.99 && P < 2.05, `falls back to K: ${P}`);
  for (let t = 0; t < 1800; t++) P = popStep(P, 0, 0, 1);
  assert.ok(P >= 0.01 && P < 0.05, `a dead world keeps a few survivors: ${P}`);
}
// Energy caps people: inner heat alone feeds 5 bn at Planet mass, and grows with size like the capacity.
assert.ok(near(fedCapacity(10, energy(0, PLANET_M)), GEO / NEED) && near(GEO / NEED, 5));
assert.ok(near(geo(8 * PLANET_M), 2 * GEO) && near(energy(0, PLANET_M, 1), GEO + 1)); // 8× mass: 2× inner heat; Dyson adds on
// A metal core holds more heat: ×0.75 with none, ×1 at 10%, ×1.25 from 20% (capped); energy passes metal on.
assert.ok(near(geo(PLANET_M, 0), 0.75 * GEO) && near(geo(PLANET_M, 0.1), GEO) && near(geo(PLANET_M, 0.2), 1.25 * GEO) && near(geo(PLANET_M, 0.5), 1.25 * GEO) && near(energy(0, PLANET_M, 0, 0, 0), 0.75 * GEO));

// Radiation goes by share, not carried mass: 3% alone is the safe limit at any size; a trace stays a trace.
assert.ok(near(radioDose(RADIO_LIMIT), 1) && radioDose(0) === 0);
assert.ok(near(dose(radioDose(0.004), 0.6, 1), dose(radioDose(0.004), 0.6, 1)) && dose(radioDose(0.004), 0.8, 1.1) < 0.3,
  'the 1.1M-mass world with 0.4% radioactive rock is safe (it read "harmful" when the dose went by carried mass)');
// A grown civilization handles more radioactive rock: the safe share runs 3% at tier 1 to 20% at tier 6.
assert.ok(near(radioLimit(1), RADIO_LIMIT) && near(radioLimit(TIER_MAX), 0.2) && radioLimit(3) > radioLimit(2) && near(radioDose(0.1, radioLimit(6)), 0.5));
console.log(`safe radioactive share by tier: ${[1, 2, 3, 4, 5, 6].map((T) => `${(100 * radioLimit(T)).toFixed(1)}%`).join(' / ')}`);
// Reactors burn the fuel stock: REACTOR at Planet mass from FUEL_LOW u, throttled under it (no cliff), ∝ m^⅓ like the capacity.
assert.ok(reactor(0, PLANET_M) === 0 && near(reactor(FUEL_LOW, PLANET_M), REACTOR) && near(reactor(1e4, PLANET_M), REACTOR) && near(reactor(FUEL_LOW / 2, PLANET_M), REACTOR / 2));
assert.ok(near(reactor(FUEL_LOW, 8 * PLANET_M), 2 * REACTOR) && near(energy(FUEL_LOW, PLANET_M), GEO + REACTOR));
// Fuel burns only for what inner heat (+ solar + Dyson) does not cover, at most the reactors' power: a full reactor burns 1.5 u/min.
assert.ok(fuelBurn(GEO, GEO, 100, PLANET_M) === 0 && fuelBurn(0.3, GEO, 100, PLANET_M) === 0 && fuelBurn(2, GEO, 0, PLANET_M) === 0);
assert.ok(near(60 * fuelBurn(100, GEO, 100, PLANET_M), 1.5) && near(60 * REACTOR / FUEL_E, 1.5), 'a full reactor burns 1.5 u/min');
assert.ok(near(fuelBurn(100, GEO, 100, PLANET_M), fuelBurn(GEO + REACTOR, GEO, 100, PLANET_M)), 'never more than its power');
assert.ok(near(fuelBurn(2 * (GEO + 0.5), 2 * GEO, 100, 8 * PLANET_M), fuelBurn(GEO + 0.5, GEO, 100, PLANET_M)), 'the same u/s at 8× mass for a draw scaled like the world');
// Your people dig eaten radioactive rock out into fuel (e-folding 180 s): all of it in the end, nothing from nothing.
assert.ok(near(refine(0.02, 1e9), 0.02) && refine(0, 1) === 0 && refine(-1, 1) === 0 && near(refine(0.01, 180), 0.01 * (1 - Math.exp(-1))));
// Idle burn at Planet mass with a level-3 shield: tiers 1–3 burn nothing (inner heat feeds them), a full tier-6 world 0.8–1.3 u/min.
{
  const idle = (P: number) => 60 * fuelBurn(NEED * P + upkeep(3), GEO, 100, PLANET_M), works = (P: number, n: number) => 60 * fuelBurn(NEED * P + upkeep(3) + WORK_E * n, GEO, 100, PLANET_M);
  assert.ok(idle(P0) === 0 && idle(1.59) === 0 && tier(1.59) === 3, 'tiers 1–3 idle: no burn');
  assert.ok(idle(8) >= 0.8 && idle(10) <= 1.3 && tier(8) === TIER_MAX, `tier 6 idle: ${idle(8).toFixed(1)}–${idle(10).toFixed(1)} u/min`);
  console.log(`fuel burn at Planet mass, L3 (u/min): tier 4 (1.6 bn) idle ${idle(1.6).toFixed(2)}, 2 works ${works(1.6, 2).toFixed(2)} · tier 6 (6.4 / 8 / 10 bn) idle ${idle(6.4).toFixed(2)} / ${idle(8).toFixed(2)} / ${idle(10).toFixed(2)}, 2 works ${works(10, 2).toFixed(2)}`);
}
// Run dry: a full tier-6 world (10 bn, L3) with 25 u is fully fed for minutes, then its reactors throttle down; its people
// decline toward what inner heat feeds, never below it; 25 u more and it is fed again.
{
  const m = PLANET_M, sh = 3;
  let P = 10, fuel = 25, fedUntil = Infinity, under = Infinity;
  const step = (t: number, dt: number) => {
    const E = energy(fuel, m), K = fedCapacity(capacity(1, m), E - upkeep(sh));
    P = popStep(P, K, 0, dt);
    const need = NEED * P + upkeep(sh), fed = Math.min(1, E / need);
    fuel = Math.max(0, fuel - fuelBurn(need, geo(m), fuel, m) * dt);
    if (fed < 1 - 1e-9) fedUntil = Math.min(fedUntil, t);
    if (fed < 0.8) under = Math.min(under, t);
    return fed;
  };
  for (let t = 0; t < 5400; t += 0.1) step(t, 0.1);
  const floor = fedCapacity(capacity(1, m), GEO - upkeep(sh));
  assert.ok(fedUntil >= 12 * 60 && fedUntil <= 18 * 60 && under < 20 * 60, `25 u at tier 6: fed until ${clock(fedUntil)}, under 0.8 from ${clock(under)}`);
  assert.ok(P >= floor && P < floor + 0.1, `out of fuel the people settle at what inner heat feeds: ${P.toFixed(3)} bn (floor ${floor})`);
  fuel += 25;
  assert.ok(step(5400, 0.1) >= 1 - 1e-9, '25 u more: fed again at once');
  console.log(`run dry: 10 bn, L3, 25 u: fed until ${clock(fedUntil)}, under 0.8 from ${clock(under)}; after 90 min ${P.toFixed(2)} bn (inner heat feeds ${floor.toFixed(2)})`);
}
// Solar wings (user, 2026-11-15): free energy from starlight, counted like inner heat, more wings with the tier (none at
// tier 1); they keep an empty-fuel world going near a star, never as far as fuel takes it.
assert.deepEqual([1, 2, 3, 4, 5, 6].map(solarWings), [0, 2, 3, 4, 5, 6]);
assert.ok(near(solar(1, 6, PLANET_M), SOLAR) && near(solar(5, 6, PLANET_M), SOLAR) && solar(0, 6, PLANET_M) === 0 && solar(1, 1, PLANET_M) === 0, 'tier 6 in full light: SOLAR; capped above light 1; none in the dark or at tier 1');
assert.ok(near(solar(1, 6, 8 * PLANET_M), 2 * SOLAR) && SOLAR < REACTOR && near(energy(0, PLANET_M, 0, SOLAR), GEO + SOLAR), '8× mass: 2×; weaker than a reactor; adds to the energy');
assert.ok(fuelBurn(GEO + SOLAR, GEO + SOLAR, 100, PLANET_M) === 0 && fuelBurn(1.3, GEO + SOLAR, 100, PLANET_M) < fuelBurn(1.3, GEO, 100, PLANET_M), 'starlight saves fuel');
{
  // Where the people settle at Planet mass, L3, habitability 1, by the light (star/rules.ts sunlight of a glow-1 sun): out of fuel, from 10 bn and from P0; with fuel.
  const settle = (P: number, light: number, fuel: number) => {
    for (let t = 0; t < 3600; t += 0.5) P = popStep(P, fedCapacity(capacity(1, PLANET_M), energy(fuel, PLANET_M, 0, solar(light, tier(P), PLANET_M)) - upkeep(3)), 0, 0.5);
    return P;
  };
  assert.ok(near(settle(10, 0, 0), 2, 0.01) && settle(10, 1, 0) >= 6.9 && settle(P0, 1, 0) >= 6.0 && near(settle(10, 1, 100), 10, 0.01), 'dark: 2 bn; full light: 6–7 bn; with fuel: 10 bn');
  const rows = [Infinity, 30, 12, 6, 3].map((x) => [x, x === Infinity ? 0 : sunlight(1, 0, x)]);
  const row = ([x, l]: number[]) => `${x === Infinity ? 'no star' : `${x} R★`} ${settle(10, l, 0).toFixed(2)} / ${settle(P0, l, 0).toFixed(2)}`;
  console.log(`empty fuel, L3 (bn from 10 / from P0): ${rows.map(row).join(' · ')} · with fuel 10.00; idle 10 bn in full light burns ${(60 * fuelBurn(NEED * 10 + upkeep(3), GEO + SOLAR, 100, PLANET_M)).toFixed(2)} u/min`);
}
// A gorged world (5% radioactive at tier 1): its people dig it under the 3% safe share within 2 min, gaining ≥ 200 u of fuel.
{
  let s = 0.05, fuel = 0, t = 0;
  for (; s >= RADIO_LIMIT; t += 0.1) {
    const dug = refine(s, 0.1);
    [s, fuel] = [s - dug, fuel + dug / UNIT];
  }
  assert.ok(t <= 120 && fuel >= 200, `5% → under 3% in ${t.toFixed(0)} s, ${fuel.toFixed(0)} u of fuel`);
  console.log(`gorged 5% at tier 1: under the safe share in ${t.toFixed(0)} s with ${fuel.toFixed(0)} u of fuel (all of it: ${(0.05 / UNIT).toFixed(0)} u)`);
}
// Dose: cosmic rays alone stay safe with a field and air; an airless, fieldless world gets 0.4.
assert.ok(dose(0, 0.6, 1) < 0.2 && near(dose(0, 0, 0), 0.4) && dose(0, 1, 0) < dose(0, 0, 0) && dose(0, 0, 2) < dose(0, 0, 0));
assert.ok(killRate(1) === 0 && near(killRate(2), 0.2 / 60) && near(killRate(10), 0.4 / 60)); // 20%/min per unit over, capped at 40%/min

// Share sweep: population after 10 min with a steady radioactive share (tier 1): a dose only, no energy; safe to 1%, harm past 3%.
console.log('radioactive share sweep (hab 1 at Planet mass, magnet 0.6, 1 atm, tier 1, no fuel; share held steady):');
const sweep: number[] = [];
for (const s of [0, 0.005, 0.01, 0.02, 0.026, 0.035, 0.05, 0.07, 0.1]) {
  const d = dose(radioDose(s), 0.6, 1), K = fedCapacity(capacity(1, PLANET_M), energy(0, PLANET_M));
  let P = 1;
  for (let t = 0; t < 600; t++) P = popStep(P, K, d, 1);
  sweep.push(P);
  console.log(`  ${(s * 100).toFixed(1)}%: dose ${d.toFixed(2)} → ${P.toFixed(2)} bn`);
}
assert.ok(dose(radioDose(0.01), 0.6, 1) < 1 && sweep[2] === sweep[0], '1% is safe at tier 1');
assert.ok(sweep[5] < sweep[0] && sweep[8] < sweep[5], 'past 3% it harms, more harms more');

// Impacts that get through: ~K/100 of the people; below 20 K nothing.
assert.ok(popHit(4, 19) === 4 && near(popHit(4, 39), 4 * 0.61) && popHit(4, 1000) >= 0.4 - 1e-9);

// Tier: +1 each time the people double from P0, capped.
assert.ok(tier(P0) === 1 && tier(0.39) === 1 && tier(0.4) === 2 && tier(1.6) === 4 && tier(100) === TIER_MAX && tier(0.01) === 1);
// What the world lacks: the weakest of water / air / field under 0.6, as the material that fixes it.
assert.ok(lack({ water: 0.3, air: 0.8, magnet: 0.5 }) === 'ice' && lack({ water: 0.9, air: 0.4, magnet: 0.5 }) === 'gas' && lack({ water: 0.9, air: 0.9, magnet: 0.2 }) === 'metal');
assert.equal(lack({ water: 0.7, air: 0.8, magnet: 0.6 }), undefined);
// Mining mix: 50 / 30 / 20 (radioactive / metal / water) over what a body has, renormalised, capped by what is there;
// never rock; gas only when asked for. The body's composition is what is left.
{
  const all: Ore[] = ['radio', 'metal', 'ice'], rich = { rock: 0.4, metal: 0.2, ice: 0.2, radio: 0.2 };
  const r = mineMix(rich, 100, 1, all), s = mineMix(COMP.stony, 100, 1, all), i = mineMix(COMP.icy, 100, 1, all), g = mineMix(COMP.icy, 100, 1, [...all, 'gas']);
  assert.ok(near(r.take.radio!, 0.5) && near(r.take.metal!, 0.3) && near(r.take.ice!, 0.2) && near(r.got, 1), 'all present: 50 / 30 / 20');
  assert.ok(near(s.take.metal!, 1) && s.take.radio === undefined && !('rock' in s.take), 'a stony moon gives only metal');
  assert.ok(near(i.got, 1) && i.take.gas === undefined && near(g.take.gas!, 0.5) && near(g.take.ice!, 0.5), 'gas only when the air is thin');
  assert.ok(near(Object.values(r.comp).reduce((a, b) => a + b!, 0), 1) && r.comp.rock! > rich.rock, 'what is left still sums to 1, richer in rock');
  const last = mineMix({ rock: 0.9, metal: 0.1 }, 100, 50, all);
  assert.ok(near(last.got, 10) && near(last.comp.rock!, 1) && !mineable(last.comp, all), 'capped by what is there; a bare rock is not worth a trip');
}

// Shield (rules.ts shieldMeet): a shell at shellR that pays shieldPunch for the share of a body it stops: held whole (k = 1)
// while it can pay, else down to its −15% floor, stopping k of it; regen 1%/s. Food, burn-up, a downed shield and bodies as
// heavy as you pass untouched.
{
  assert.ok(near(shellR(10, 1), 11.8) && near(shellR(10, 3), 12.8), 'the shell: 1.18 R at level 1, 1.28 R at level 3');
  assert.ok(near(shieldPunch(SHIELD_STOP, 0.5), SHIELD_K) && near(shieldPunch(SHIELD_STOP, 2), 2 * SHIELD_K), 'a level stops SHIELD_STOP at up to the stick speed');
  const sh: Shield = { level: 1, s: SHIELD_K };
  assert.ok(shieldMeet(sh, 3, 0.01, 1) === 0 && sh.s === SHIELD_K); // a gentle meal is not its business
  assert.ok(shieldMeet(sh, 270, 0.02, 1) === 1 && near(sh.s, 6)); // 2% slow: held, 24 K
  const k = shieldMeet(sh, 1000, 0.05, 1);
  assert.ok(near(k, (6 + 4.5) / 60) && near(sh.s, SHIELD_FLOOR * SHIELD_K), `overwhelmed, it still stops ${k.toFixed(3)} of the body, down to the floor −15%`);
  assert.ok(shieldMeet(sh, 1000, 0.05, 1) === 0 && near(sh.s, SHIELD_FLOOR * SHIELD_K)); // below 0: nothing
  for (let t = 0; t < 14; t++) shieldRegen(sh, 1);
  assert.ok(sh.s < 0 && (shieldRegen(sh, 1.5), sh.s > 0)); // 15 s back above 0
  const full: Shield = { level: 1, s: SHIELD_K };
  assert.ok(near(shieldMeet(full, 1000, 0.05, 1), 34.5 / 60) && near(full.s, SHIELD_FLOOR * SHIELD_K), 'a full L1 stops 57.5% of a slow 5% body');
  assert.ok(shieldMeet({ level: 3, s: 90 }, 1e5, 1, 1) === 0 && shieldMeet({ level: 0, s: 0 }, 1000, 0.01, 1) === 0, 'as heavy as you, or no shield: it passes');
  for (const [q, L] of [[0.02, 1], [0.05, 3]]) { // a stopped body never lands: it leaves the shell
    const s: Shield = { level: L, s: SHIELD_K * L }, kk = shieldMeet(s, 1000, q, 1);
    assert.ok(kk === 1 && shellPass(kk, 5)[1] < 0 && shellPass(kk, 5)[0] === 1, `${q * 100}% slow on L${L} bounces off`);
  }
  assert.deepEqual(shieldCost(2), { ore: 20, vol: 10, t: 25 });
}
// The residual (rules.ts strikeK on what the shell let through): never above the hit itself, nothing once held; shieldHolds
// agrees with shieldMeet. Before: the old all-or-nothing shield (a whole hit up to 1.15 × its maximum and ≤ 10% of you per
// level, else all of it, the shield gone). Your world PLANET_M stony, no air; v in stick speeds (the fall from the shell left out).
{
  const R = radiusOf(PLANET_M, COMP.stony), K = (q: number, v: number) => strikeK(q, v * V_STICK, V_STICK, R, 0, true);
  const dead = (k: number) => (k < HIT_MIN ? 0 : 1 - popHit(10, k) / 10), old = (k: number, q: number, L: number) => (k >= HIT_MIN && k <= SHIELD_K * L * (1 - SHIELD_FLOOR) && q <= 0.1 * L ? 0 : k);
  const cell = (k: number) => `${k.toFixed(0)} K ${Math.round(100 * dead(k))}%${k >= EXTINCT[1] ? ' wiped' : ''}`;
  const rows: string[] = [];
  for (const q of [0.001, 0.005, 0.01, 0.02, 0.05, 0.125, 0.25]) for (const v of [0.5, 1, 2, 4]) {
    const k0 = K(q, v), out: string[] = [];
    for (const L of [1, 2, 3]) {
      const sh: Shield = { level: L, s: SHIELD_K * L }, holds = shieldHolds(sh, q, v), k = shieldMeet(sh, k0, q, v);
      const [keep, vn] = shellPass(k, v), left = k >= 1 ? 0 : k > 0 ? K(q * keep, vn) : k0;
      if (k0 >= HIT_MIN) assert.equal(holds, k === 1, `shieldHolds agrees with shieldMeet: ${q * 100}% at ${v}× on L${L}`);
      if (k > 0) assert.ok(left < k0, `${q * 100}% at ${v}× on L${L}: ${left.toFixed(1)} K through < ${k0.toFixed(1)} K`);
      if (k0 < HIT_MIN) assert.ok(k === 0 && sh.s === SHIELD_K * L, 'under HIT_MIN: free');
      if (L !== 2) out.push(`L${L} old ${cell(old(k0, q, L))} → ${k >= 1 ? 'held' : k > 0 ? `k ${k.toFixed(2)}, ${(100 * q * keep).toFixed(2)}% lands ${cell(left)}` : 'free'}`);
    }
    rows.push(`  ${q * 100}% at ${v}×: hit ${cell(k0)} | ${out.join(' | ')}`);
  }
  console.log(`shield damage, before → after (K at your ground, % of the people dead):\n${rows.join('\n')}`);
}
// Burn-up: the shell takes a body only if what reaches your ground after your air delivers ≥ HIT_MIN (strikeK, as field.ts
// burns before the hit); anything gentler costs it nothing. Weapon fire (shieldShot) has no minimum.
{
  const R = radiusOf(PLANET_M, COMP.stony), rows: string[] = [];
  let free = 0, taken = 0;
  for (const p of [0, 0.26, 0.5, 1, 2]) {
    const sb = burnShare(p), cells: string[] = [];
    for (const q of [0.001, 0.0015, 0.003, 0.005, 0.01]) for (const v of [1, 4, 8, 12, 16]) {
      const k = strikeK(q, v, V_STICK, R, sb, true), sh: Shield = { level: 3, s: 3 * SHIELD_K };
      const took = shieldMeet(sh, k, q, v / V_STICK);
      if (k < HIT_MIN) assert.ok(!took && sh.s === 3 * SHIELD_K, `${p} atm, ${q * 100}% at ${v} D/s: ${k.toFixed(1)} K is not the shield's business`), free++;
      else assert.ok(took > 0 && sh.s < 3 * SHIELD_K, `${p} atm, ${q * 100}% at ${v} D/s: ${k.toFixed(1)} K meets the shell`), taken++;
      if (v === 4 || v === 12) cells.push(`${q * 100}%@${v} ${k.toFixed(0)} K ${k < HIT_MIN ? 'free' : 'taken'}`);
    }
    rows.push(`  ${p} atm: ${cells.join(', ')}`);
  }
  console.log(`shield burn-up (${free} free, ${taken} taken of the grid; D/s = your diameters/s):\n${rows.join('\n')}`);
  const shot: Shield = { level: 1, s: SHIELD_K };
  for (const k of [0.3, 3, 12]) {
    const s0 = shot.s;
    shieldShot(shot, k);
    assert.ok(shot.s < s0, `a ${k} K weapon hit still lowers the shield`);
  }
}
// Fleet caps, each class its own: probes one per tier, fighters 2 + ⌊metal / 20⌋ up to 6, frigates 1 from tier 3, 2 from 5.
assert.ok(START_SHIPS === 2 && fleetCap('fighter', 1, 0) === 2 && fleetCap('fighter', 1, 19.9) === 2 && fleetCap('fighter', 1, 20) === 3 && fleetCap('fighter', 6, 1e4) === 6);
assert.ok(fleetCap('probe', 1, 0) === 1 && fleetCap('probe', 6, 0) === 6 && [1, 2, 3, 4, 5, 6].map((T) => fleetCap('frigate', T, 1e4)).join() === '0,0,1,1,2,2');
assert.ok(FLEET.probe.breaks < FLEET.fighter.breaks && FLEET.fighter.breaks === FRAG && FLEET.frigate.breaks > FRAG && FLEET.probe.ore < FLEET.fighter.ore && FLEET.fighter.ore < FLEET.frigate.ore);
// Rockets: from tier 1, the range grows and the aim error shrinks with the tier (exact at tier 6); cheaper than a slug.
assert.ok(rocketRange(1) < rocketRange(6) && rocketSpread(1) > rocketSpread(3) && rocketSpread(6) === 0 && ROCKET.ore > 0 && ROCKET.ore < SLUG_ORE);
// Mined metal counts toward the fighter cap: a stony 2% moon (15% metal) gives 30 u of metal.
assert.ok(near(units(mineMix(COMP.stony, 0.02 * 1e5, 1e9, ['radio', 'metal', 'ice']).take.metal!, 1e5), 30));
// Breaking: a break keeps KEEP in pieces cut under pieceSize, none under the
// field's drop floor (cut unequal by CUT_SPREAD, the largest still under it); breaking again and again (every gun on
// every piece) ends in edible pieces, never in dust.
{
  const R = radiusOf(PLANET_M, COMP.dust), vs = V_STICK, gun = (s: number) => (s <= FRAG ? FLEET.fighter : FLEET.frigate);
  const lines: string[] = [];
  for (const p of [0, 0.1, 0.3, 1, 2, 4]) for (const speed of [1, 2]) {
    const sb = burnShare(p), v = speed * vs, e = edible(sb, v, vs, R), kOf = (s: number) => strikeK(s, v, vs, R, sb, true);
    // What a frigate still breaks: never what you can take safely, nor what would leave no two pieces (1.5: rules.ts FLOOR).
    const breaks = (s: number) => s >= sb && s * KEEP >= 2 * 1.5 * SPECK && kOf(s) >= HIT_MIN && s >= 0 && s <= FLEET.frigate.breaks;
    const out: string[] = [];
    for (const s0 of [0.004, 0.008, 0.015, FRAG, 0.03, 0.1, FLEET.frigate.breaks]) {
      let hits = 0, dust = 0, left = 0;
      const q = [s0];
      while (q.length) {
        const s = q.pop()!;
        if (!breaks(s)) {
          left += s;
          assert.ok(s >= (1 - CUT_SPREAD) * 1.5 * SPECK || s === s0, `a piece ${s} under the drop floor`);
          continue;
        }
        const c = split(s, pieceSize(sb, v, vs, R), gun(s).pieces);
        assert.ok(c.n >= 2 && near(c.n * c.piece + c.dust, s, 1e-12) && c.dust <= s * (1 - KEEP) + 1e-12, `split ${s}: mass`);
        [hits, dust] = [hits + 1, dust + c.dust];
        const e0 = pieceSize(sb, v, vs, R), w = pieceShares(c.n, cutSpread(c.piece, e0)).map((x) => x * c.n * c.piece); // stage.ts cut: unequal pieces
        assert.ok(near(w.reduce((a, x) => a + x, 0), c.n * c.piece, 1e-12) && (c.piece > e0 || w[0] <= e0 * (1 + 1e-9)) && (c.piece > CUT * e0 * (1 + 1e-9) || near(w[0], w.at(-1)! * (1 + CUT_SPREAD) / (1 - CUT_SPREAD), 1e-12)), `split ${s}: the largest piece ${w[0]} under ${e0} unless the cap holds`);
        q.push(...w);
      }
      assert.ok(near(left + dust, s0, 1e-12) && dust <= 0.3 * s0, `${s0} at ${p} atm ×${speed}: ${((100 * dust) / s0).toFixed(0)}% dust`);
      if (s0 <= FRAG && speed === 1) assert.ok(hits <= 1, `${s0} at ${p} atm: ${hits} hits (one break should do)`);
      out.push(`${(100 * s0).toFixed(1)}%: ${hits} hit${hits === 1 ? '' : 's'}, ${((100 * dust) / s0).toFixed(0)}% dust`);
    }
    if (speed === 1 && (p === 0 || p === 1)) lines.push(`${p} atm (edible ${(100 * e).toFixed(2)}%): ${out.join(' · ')}`);
  }
  console.log(`breaking:\n  ${lines.join('\n  ')}`);
}
// Fire discipline (ships.ts): a probe or fighter run fires at most `bursts` bursts of `rounds`, then breaks off and cools.
for (const k of ['probe', 'fighter'] as const) {
  const f = FLEET[k], g = trigger(), h = 1 / 60, cap = f.rounds * f.bursts;
  let fired = 0, run = 0, cool = 0, last = -Infinity, gapMin = Infinity;
  for (let t = 0; t < 60; t += h) {
    cool = Math.max(0, cool - h);
    if (cool > 0 || !pull(g, h, true, f.rounds, f.rate, GAP)) continue;
    if (run === 0 && last > -Infinity) gapMin = Math.min(gapMin, t - last);
    [fired, run, last] = [fired + 1, run + 1, t];
    if (run >= cap) [run, cool] = [0, f.cool];
  }
  assert.ok(gapMin >= f.cool && fired / 60 <= cap / f.cool, `${k}: ${fired} rounds a minute, ${gapMin.toFixed(2)} s between runs`);
  console.log(`${k} gun, held a minute: ${fired} rounds (${(fired / 60).toFixed(1)}/s), ≤ ${cap} a run, ${gapMin.toFixed(1)} s between runs`);
}
// Each class its own feel (user, 2026-11-15): fighters fire fast and light, probes slow; the frigate and missiles are slow and heavy.
assert.ok(FLEET.fighter.rate > FLEET.probe.rate && FLEET.fighter.cool < FLEET.probe.cool && ARMS.lance.reload >= 10 && ARMS.missile.reload >= 10 && ARMS.missile.k >= LANDING && ROCKET.reload > FLEET.fighter.cool, 'fighters fast, probes slow, frigate, missiles and rockets slow but heavy');
assert.ok(ROCKET.speed <= 0.6 * ARMS.round.u && ARMS.missile.u <= 0.5 * ARMS.round.u, 'rockets and missiles fly well under a round: seen coming');
// Lost habitability: a minute asleep leaves ≤ 40% of the people (1/min, was 0.25/min).
{
  let P = 4;
  for (let t = 0; t < 600; t++) P = popStep(P, 0, 0, 0.1, ASLEEP_FALL);
  assert.ok(P <= 0.4 * 4, `asleep a minute: ${P}`);
}
// Shield upkeep 0.1 E/s a level, paid first (user Q7: only a starving world loses its shield): the people live on the
// rest. A level-3 shield on inner heat alone stays fully fed while the people settle at the reduced cap (2 bn, not 5).
{
  const E = energy(0, PLANET_M), K = fedCapacity(capacity(1, PLANET_M), E - upkeep(3));
  assert.ok(near(K, 2) && shieldFed(E, 3) === 1, `L3 on inner heat: people cap ${K}`);
  let P = P0;
  const sh: Shield = { level: 3, s: 0 };
  for (let t = 0; t < 1800; t++) [P] = [popStep(P, K, 0, 1), shieldRegen(sh, 1, shieldFed(E, 3))];
  assert.ok(P <= K && near(sh.s, shieldMax(sh)), `people ${P} under the cap, shield full ${sh.s}`);
  // Starving (energy under the upkeep): strength and regeneration in proportion.
  assert.ok(near(shieldFed(0.15, 3), 0.5));
  const half: Shield = { level: 3, s: 0 };
  shieldRegen(half, 10, shieldFed(0.15, 3));
  assert.ok(near(half.s, 0.5 * 0.01 * 90 * 10), 'half fed: half the regen');
  for (let t = 0; t < 300; t++) shieldRegen(half, 1, shieldFed(0.15, 3));
  assert.ok(near(half.s, 45), `half fed: half the maximum ${half.s}`);
  // Short of energy (rate: the energy fed) it mends half as fast, to the same cap.
  const slow: Shield = { level: 3, s: 0 };
  shieldRegen(slow, 10, 1, 0.5);
  assert.ok(near(slow.s, 0.5 * 0.01 * 90 * 10), 'energy half fed: half the mending');
  for (let t = 0; t < 300; t++) shieldRegen(slow, 1, 1, 0.5);
  assert.ok(near(slow.s, 90), `energy half fed: the same cap ${slow.s}`);
}
// Stocks: a rocky 2% moon mined at tier 1 (1.5%/min of it) gives 3 u/min of metal until its 30 u are gone (10 min).
{
  const you = 1e5, moon = 0.02 * you, perMin = mineMix(COMP.stony, moon, moon * MINE_RATE * 60, ['radio', 'metal', 'ice']);
  assert.ok(near(units(perMin.take.metal!, you), 3));
  // Home extraction (homeDig): a 10% metal world gives a tenth of that moon's ore at the same tier, 0.3 u/min a tier.
  const home = { rock: 0.9, metal: 0.1 }, oreAt = (T: number, c: Record<string, number> = home) => homeDig(c, T, 60).ore / UNIT;
  for (const T of [1, 3, 6]) assert.ok(near(oreAt(T), 0.3 * T) && near(oreAt(T), 0.1 * T * units(perMin.take.metal!, you)),`home ore at tier ${T}: ${oreAt(T)}`);
  assert.ok(near(oreAt(1, { rock: 0.3, metal: 0.7 }), oreAt(1, { rock: 0.8, metal: HOME_RICH })), 'a share over HOME_RICH counts as HOME_RICH');
  const wet = { rock: 0.82, metal: 0.1, ice: 0.08 };
  assert.ok(homeDig(wet, 3, 60, 0, 'metal').ore === 0 && homeDig(wet, 3, 60, 0, 'metal').vol > 0, 'never the metal a world lacks');
  assert.ok(homeDig(wet, 3, 60, 0, 'ice').vol === 0 && homeDig(wet, 3, 60, HOME_VOL).vol === 0 && homeDig(wet, 3, 60, HOME_VOL - 1).vol > 0, 'no water lacking or at HOME_VOL');
  assert.ok(near(homeDig(wet, 1, 60).vol / UNIT, 0.24), 'water: 0.24 u/min a tier at 8%');
  assert.ok(!('ice' in homeDig(home, 3, 60).comp), 'a world without water gets no ice key');
  for (const [T, dt] of [[0, 60], [3, 0]]) {
    const z = homeDig(wet, T, dt);
    assert.ok(z.ore === 0 && z.vol === 0 && z.comp.rock === wet.rock && z.comp.metal === wet.metal, 'tier 0 or dt 0: nothing');
  }
  // An hour at tier 6: the sum stays 1, the dug metal and water are now rock, the field is untouched.
  let c: Record<string, number> = { ...home }, ore = 0, vol = 0;
  for (let t = 0; t < 3600; t++) {
    const h = homeDig(c, 6, 1);
    [c, ore, vol] = [h.comp as Record<string, number>, ore + h.ore, vol + h.vol];
  }
  const sum = Object.values(c).reduce((a, b) => a + b, 0);
  assert.ok(near(sum, 1, 1e-9) && near(home.metal - c.metal, ore, 1e-12) && near(c.rock - home.rock, ore + vol, 1e-12), `home dig keeps mass: sum ${sum}`);
  assert.ok(near(c.metal, 0.0898, 1e-4) && magnet(PLANET_M, c, 1) === 1, `an hour at tier 6: metal ${c.metal}`);
}
assert.ok(cityLevel(0.2) === 0.25 && cityLevel(2.4) === 0.5 && cityLevel(9) === 1);

// Sample run: Planet mass, habitability 0.5, magnet 0.6, 1 atm; a rocky 2% moon from the start, an icy 2% one caught at
// 3:00, a radioactive 2% one at 8:00; the world lacks water (ice) for its first 5 min. It starts with a level-1 shield and
// START_SHIPS fighters; builds a frigate, a fighter, a shield level, a probe: the first wanted, waiting for its ore (× the energy
// fed). Mining as stage.ts: radioactive goes to the fuel stock (reactors burn it past inner heat), metal and water are stock unless lacking.
{
  const m = PLANET_M, rate = 0.5, mag = 0.6, p = 1;
  let P = P0, T = 1, landed = 0, fuel = 0, work = 0, fedMin = 1;
  const stocks = { ore: 0, vol: 0, fuel: 0 }, sh: Shield = { level: 1, s: SHIELD_K };
  const moons = [{ m: 0.02 * m, c: { ...COMP.stony }, at: 0, m0: 0, bare: false }, { m: 0.02 * m, c: { ...COMP.icy }, at: 180, m0: 0, bare: false }, { m: 0.02 * m, c: { ...COMP.radioactive }, at: 480, m0: 0, bare: false }];
  const log: string[] = [], dt = 0.1, have = { probe: 0, fighter: START_SHIPS, frigate: 0 };
  let metal = 0, build: { kind: keyof typeof FLEET | 'shield'; t: number; prog: number } | undefined;
  for (let i = 0, t = 0; t < 1500; i++, t = i * dt) {
    const d = dose(0, mag, p), E = energy(stocks.fuel, m), K = fedCapacity(capacity(rate, m), Math.max(0, E - upkeep(sh.level)));
    P = popStep(P, K, d, dt);
    const need = NEED * P + upkeep(sh.level) + WORK_E * work, fed = Math.min(1, E / need);
    stocks.fuel = Math.max(0, stocks.fuel - fuelBurn(need, geo(m), stocks.fuel, m) * dt);
    fedMin = Math.min(fedMin, fed);
    if (tier(P) > T) log.push(`tier ${(T = tier(P))} ${clock(t)}`);
    const on: Ore[] = ['radio', 'metal', 'ice'];
    for (const mo of moons) if (t >= mo.at && !mo.bare) {
      mo.m0 ||= mo.m;
      const mx = mineMix(mo.c, mo.m, Math.min(0.5 * mo.m, mo.m0 * MINE_RATE * T * dt), on);
      if (mx.got <= 0) {
        mo.bare = true;
        log.push(`${mo.c.radio ? 'green' : mo.c.ice ? 'icy' : 'rocky'} moon bare ${clock(t)}`);
        continue;
      }
      [mo.m, mo.c] = [mo.m - mx.got, mx.comp];
      const lack = t < 300 ? 'ice' : undefined, u = (e: Ore) => units(mx.take[e] ?? 0, m);
      fuel += u('radio');
      if (lack) landed += mx.take.ice ?? 0;
      [stocks.ore, stocks.vol, stocks.fuel, metal] = [stocks.ore + u('metal'), stocks.vol + (lack ? 0 : u('ice')), stocks.fuel + u('radio'), metal + u('metal')];
    }
    shieldRegen(sh, dt, shieldFed(E, sh.level), fed);
    if (!build) {
      const cost = (k: keyof typeof FLEET | 'shield') => (k === 'shield' ? (sh.level < 3 ? shieldCost(sh.level + 1) : undefined) : have[k] < fleetCap(k, T, metal) ? { ...FLEET[k], vol: 0 } : undefined);
      const k = buildOrder(have.frigate).find((c) => { const q = cost(c); return !!q && stocks.vol >= q.vol; });
      if (k && stocks.ore >= cost(k)!.ore) {
        const q = cost(k)!;
        [stocks.ore, stocks.vol, build] = [stocks.ore - q.ore, stocks.vol - q.vol, { kind: k, t: q.t, prog: 0 }];
      }
    }
    if (build && (build.prog += ((buildSpeed(P, K) * fed) / build.t) * dt) >= 1) {
      if (build.kind === 'shield') [sh.level, sh.s] = [sh.level + 1, sh.s + SHIELD_K];
      else have[build.kind]++;
      log.push(`${build.kind === 'shield' ? `shield L${sh.level}` : `${build.kind} ${have[build.kind]}`} ${clock(t)}`);
      build = undefined;
    }
    work = +!!build + +(sh.s < shieldMax(sh));
  }
  const caps = (['probe', 'fighter', 'frigate'] as const).map((c) => `${c}s ${have[c]}/${fleetCap(c, T, metal)}`).join(', ');
  console.log('sample run:', log.join(' | '));
  console.log(`  end: ${P.toFixed(2)} bn, tier ${T}, ore ${stocks.ore.toFixed(0)} u, volatiles ${stocks.vol.toFixed(0)} u, ${caps} (metal ${metal.toFixed(0)} u), shield L${sh.level}, ice landed ${(landed / m * 100).toFixed(2)}%, fuel mined ${fuel.toFixed(0)} u, fuel left ${stocks.fuel.toFixed(0)} u, energy fed ≥ ${(100 * fedMin).toFixed(0)}%`);
  assert.ok(T >= 4, 'the people grow to tier 4+ in 25 min');
  assert.ok(have.fighter >= 3 && have.probe >= 1 && have.frigate >= 1 && sh.level >= 2, 'moons pay for fighters, probes, a frigate and a shield level');
  assert.ok(moons.every((mo) => mo.bare), 'all three moons are mined bare (rock left) in 25 min');
  assert.ok(landed > 0 && fuel > 0, 'a dry world gets ice from its icy moon, fuel from its green one');
}
// ---- Combat
assert.ok(SLUG_ORE === 5 && SLUG_SHARE === 5e-4 && DRIVER_COOL === 4);
// Charge: a fed civilization fires every 4 s; an energy-starved one every SLUG_E / CHARGE_MIN = 8 s.
assert.ok(SLUG_E / chargeRate(0.5, 0.5) === 8 && SLUG_E / chargeRate(1.5, 0.5) <= DRIVER_COOL);
// Aim: the slug's world velocity points at the cursor while you fly sideways; intercept meets a moving target.
{
  const v = { x: 0, y: 30 }, u = 100, d = fireDir(100, 0, v.x, v.y, u), wx = v.x + d.x * u, wy = v.y + d.y * u;
  assert.ok(near(Math.hypot(d.x, d.y), 1) && Math.abs(wy / wx) < 1e-9 && wx > 0, 'fires where you click');
  const t = intercept(100, 0, 0, 20, 50)!;
  assert.ok(t > 0 && near(Math.hypot(100, 20 * t), 50 * t, 1e-6), 'intercept time');
}
assert.ok(rivalLevel(0, 2) === 1 && rivalLevel(300, 2) === 2 && rivalLevel(3000, 2) === 3 && rivalLevel(0, 0) === 1); // yours − 1, +1 per 5 min, ≤ yours + 1
// By temper (RIVAL_LEAD): a Careful one starts at yours − 1, a Hungry one at yours, a Raider at yours + 1 (the cap); masses never 1.1× you.
assert.ok(rivalLevel(0, 2, RIVAL_LEAD.careful) === 1 && rivalLevel(0, 2, RIVAL_LEAD.hungry) === 2 && rivalLevel(0, 2, RIVAL_LEAD.raider) === 3 && rivalLevel(600, 2, RIVAL_LEAD.raider) === 3);
assert.ok(Object.values(RIVAL_MASS).every(([lo, hi]) => lo >= 0.5 && lo < hi && hi < 1.1) && RIVAL_MASS.careful[1] <= RIVAL_MASS.hungry[0]);

// Slug damage through the real collide (with the slug's warhead): a slug of 0.05% of you at 50 of your diameters/s
// destroys a ship or a 0.3% satellite, chips a 1% moon, does nothing to a 3% moon or a planet.
console.log('slug damage (d on the target; destroyed ≥ 5, shatter ≥ 1, chip ≥ 0.3, first loss 0.1):');
for (const you of [10 ** 4.5, 1e5, 10 ** 5.5, 796e3]) {
  const D = 2 * radiusOf(you, COMP.stony), slug: Phys = { m: SLUG_SHARE * you, comp: { rock: 0.8, metal: 0.2 } };
  const hit = (share: number, comp: Phys['comp'] = COMP.stony) => collide(slug, { m: share * you, comp }, 50 * D, 0, { warhead: D });
  const ship = hit(1e-6, COMP.metallic), sat = hit(0.003), m1 = hit(0.01), m3 = hit(0.03), peer = hit(1);
  console.log(`  you ${you.toExponential(2)}: ship ${ship.b.d.toPrecision(2)}, 0.3% ${sat.b.d.toFixed(1)}, 1% moon ${m1.b.d.toFixed(2)} (−${(100 * (1 - m1.b.rest / (0.01 * you))).toFixed(0)}%), 3% moon ${m3.b.d.toFixed(3)}, peer ${peer.b.d.toExponential(1)}`);
  assert.ok(ship.b.d >= 5 && sat.b.d >= 5, 'a slug destroys a ship and a 0.3% satellite');
  assert.ok(m1.b.d >= 0.3 && m1.b.d < 1, 'a slug chips a 1% moon');
  assert.ok(m3.b.d < 0.1 && m3.b.rest === 0.03 * you, 'a 3% moon loses nothing');
  assert.ok(peer.b.d < 0.01 && peer.b.rest === you, 'a peer planet is unaffected');
}
// Raw heat on a shield (what weapon.ts puts on it): ~12.6 K a slug on a peer.
const slugK = (you: number) => 430 * impactHeat(SLUG_SHARE / (1 + SLUG_SHARE), SLUG_SPEED, 8, radiusOf(you, COMP.stony));
assert.ok(slugK(1e5) > 12 && slugK(1e5) < 13.5, `slug on a shield ${slugK(1e5)}`);

// Pirate fleets: 1–14 ships over 10⁴ rolls, mostly few, sometimes many; a hauler per 5 (at least one), a marauder from 10.
{
  const n = Array.from({ length: 1e4 }, () => fleetSize(Math.random()));
  const lo = Math.min(...n.map((f) => f.n)), hi = Math.max(...n.map((f) => f.n)), small = n.filter((f) => f.n <= 4).length / n.length, big = n.filter((f) => f.n >= 10).length / n.length;
  console.log(`pirate fleets: ${lo}–${hi} ships, ${(100 * small).toFixed(0)}% of 1–4, ${(100 * big).toFixed(0)}% of 10+`);
  assert.ok(lo >= 1 && hi <= 14 && small > 0.4 && big > 0.05, 'fleet sizes 1–14, mostly small, sometimes huge');
  assert.ok(n.every((f) => f.haulers === Math.max(1, Math.round(f.n / 5)) && f.marauder === +(f.n >= 10) && f.raiders === f.n - f.haulers - f.marauder) && fleetSize(0.9999).n === 14);
}
// ---- Planetary combat (ARMS). Weapon fire always counts on a shield (shieldShot: the 0.3 K round and the 2–3 K rounds the
// old body rule ignored), stops its mending SHIELD_STUN s, and lands through an open one: rounds burn stock, never people;
// heavy fire lands every LANDING K (people × 0.8).
{
  const sh: Shield = { level: 1, s: SHIELD_K };
  for (const k of [0.3, 2, 3]) assert.ok(shieldShot(sh, k) === 0, `a ${k} K round is taken`);
  assert.ok(near(sh.s, SHIELD_K - 5.3) && sh.stun === SHIELD_STUN, `0.3 + 2 + 3 K off the shield (${sh.s}), stunned`);
  const s0 = sh.s;
  shieldRegen(sh, SHIELD_STUN - 0.01);
  assert.ok(sh.s === s0, 'no mending inside the stun');
  shieldRegen(sh, 1.01);
  assert.ok(near(sh.s, s0 + 0.01 * SHIELD_K, 1e-9), `then 1%/s again (${sh.s})`);
  // Through an open shield: 1000 fighter rounds take no people and burn ≤ BURN_WAVE a raid; 8 landings (160 K) take 1 → ≤ 0.2.
  const open: Shield = { level: 1, s: -1 }, w = { k: 0 }, cap = raid(1);
  let P = 1, burnt = 0;
  for (let i = 0; i < 1000; i++) {
    const h = weaponHit(open, w, P, 'round', ARMS.round.k, cap);
    [P, burnt] = [h.P, burnt + h.burn];
  }
  assert.ok(P === 1 && w.k === 0 && near(burnt, BURN_WAVE), `fighter fire takes no people (${P}), burns ${burnt} u`);
  let Q = 1, landed = 0;
  const heavy = (K: number) => { for (let k = 0; k < K; k += ARMS.lance.k) { const h = weaponHit(open, w, Q, 'lance', Math.min(ARMS.lance.k, K - k)); [Q, landed] = [h.P, landed + h.landed]; } };
  heavy(144);
  const at144 = Q;
  heavy(16);
  assert.ok(landed === 8 && Q <= BEATEN && at144 > BEATEN, `160 K of heavy fire: ${landed} landings, people ${Q.toFixed(3)} (144 K: ${at144.toFixed(3)})`);
  const capped = weaponHit({ level: 1, s: -1 }, { k: 0 }, 1, 'missile', 500, raid(1));
  assert.ok(near(capped.P, 1 - RIVAL_HIT_MAX), `one raid kills at most ${RIVAL_HIT_MAX} (${capped.P})`);
  // Sustained K/s and the classes: a fighter 0.3–0.5, a frigate 4–6 fighters, a full strike wing (3) less than one frigate.
  const kps = (k: number, n: number, hit: number, cycle: number) => (k * n * hit) / cycle; // n hits of k K, a share `hit` landing, every `cycle` s
  const fighter = kps(ARMS.round.k, FLEET.fighter.rounds * FLEET.fighter.bursts, ARMS.round.hit, ARMS.round.run), frigate = kps(ARMS.lance.k, ARMS.lance.salvo, ARMS.lance.hit, ARMS.lance.reload);
  assert.ok(fighter >= 0.3 && fighter <= 0.5 && frigate / fighter >= 4 && frigate / fighter <= 6 && 3 * fighter < frigate, `K/s: fighter ${fighter.toFixed(2)}, frigate ${frigate.toFixed(2)} (× ${(frigate / fighter).toFixed(1)})`);
  assert.deepEqual([1, 2, 3, 4].map(rivalFrigates), [0, 1, 1, 2]);
  assert.ok(FLEET.frigate.ore === 25 && FLEET.frigate.t === 40, 'a frigate costs 25 ore and 40 s');
  // Time to break a full shield (L1–3): the planned table (docs/civilizationgameplay.md) against ttk (mean rates, regen while
  // idle past the stun) and a measured volley-by-volley run (real shieldShot and shieldRegen, averaged over 20 start phases).
  // Volleys land whole, so measured may differ from the mean by up to one firing cycle (the plan's "~170" row: 15%).
  type U = { k: number; at: number[]; every: number; t0: number };
  const F = FLEET.fighter, burst = Array.from({ length: F.rounds * F.bursts }, (_, i) => (i % F.rounds) / F.rate + Math.floor(i / F.rounds) * ((F.rounds - 1) / F.rate + GAP)); // a run: bursts of rounds at rate, GAP between
  const fu = (t0: number): U => ({ k: ARMS.round.k * ARMS.round.hit, at: burst, every: ARMS.round.run, t0 });
  const fr: U = { k: ARMS.lance.k * ARMS.lance.hit, at: [0, ARMS.lance.gap, 2 * ARMS.lance.gap], every: ARMS.lance.reload, t0: 0 };
  const mi = (n: number, hit: number): U => ({ k: ARMS.missile.k * hit, at: Array(n).fill(0), every: ARMS.missile.reload, t0: 0 });
  const dr: U = { k: slugK(1e5), at: [0], every: DRIVER_COOL, t0: 0 };
  const measure = (L: number, us: U[]) => {
    let sum = 0;
    for (let p = 0; p < 20; p++) {
      const s: Shield = { level: L, s: SHIELD_K * L }, ev = us.flatMap((u) => Array.from({ length: 400 }, (_, j) => u.at.map((a) => ({ t: u.t0 + (j + (p + 0.5) / 20) * u.every + a, k: u.k }))).flat()).sort((a, b) => a.t - b.t);
      let i = 0, t = 0;
      for (; t < 1500 && s.s > 0; t += 0.01) {
        shieldRegen(s, 0.01);
        while (ev[i].t <= t) shieldShot(s, ev[i++].k);
      }
      sum += t;
    }
    return sum / 20;
  };
  const rate = (u: U, n = 1) => ({ kps: (n * u.k * u.at.length) / u.every, idle: Math.max(0, u.every - SHIELD_STUN - u.at[u.at.length - 1]) / u.every });
  const fire = (n: number) => ({ kps: n * fighter, idle: 0 }); // a wing staggers its runs: never a pause past the stun
  const ttk = (level: number, f: { kps: number; idle: number }[]) => { // the share of its cycle each leaves past the stun (idle) lets the shield mend
    const C = SHIELD_K * level, net = f.reduce((a, q) => a + q.kps, 0) - SHIELD_REGEN * C * Math.min(...f.map((q) => q.idle));
    return net > 0 ? C / net : Infinity;
  };
  const table: [string, (L: number) => U[], (L: number) => { kps: number; idle: number }[], number[]][] = [
    ['2 strike fighters', () => [fu(0), fu(ARMS.round.run / 2)], () => [fire(2)], [31, 62, 94]],
    ['3 fighters', () => [fu(0), fu(ARMS.round.run / 3), fu((2 * ARMS.round.run) / 3)], () => [fire(3)], [21, 42, 62]],
    ['frigate alone', () => [fr], () => [rate(fr)], [16, 37, 63]],
    ['frigate + 2 fighters', () => [fr, fu(0), fu(ARMS.round.run / 2)], () => [rate(fr), fire(2)], [10, 20, 30]],
    ['missiles, all land (salvo = level)', (L) => [mi(L, 1)], (L) => [rate(mi(L, 1))], [40, 40, 40]],
    ['missiles, half land (salvo = level)', (L) => [mi(L, 0.5)], (L) => [rate(mi(L, 0.5))], [122, 122, 122]],
    ['your driver', () => [dr], () => [rate(dr)], [10, 19, 29]],
  ];
  console.log('time to break an equal shield L1 / L2 / L3 (s): planned | ttk | measured');
  for (const [name, us, f, plan] of table) {
    const t = [1, 2, 3].map((L) => ttk(L, f(L))), m = [1, 2, 3].map((L) => measure(L, us(L))), cycle = Math.max(...us(1).map((u) => u.every));
    console.log(`  ${name}: ${plan.join(' / ')} | ${t.map((x) => x.toFixed(0)).join(' / ')} | ${m.map((x) => x.toFixed(0)).join(' / ')}`);
    plan.forEach((p, i) => {
      assert.ok(Math.abs(t[i] - p) <= 0.1 * p, `${name} L${i + 1}: ttk ${t[i].toFixed(1)} vs planned ${p}`);
      assert.ok(Math.abs(m[i] - p) <= Math.max((name.includes('~') ? 0.15 : 0.1) * p, cycle), `${name} L${i + 1}: measured ${m[i].toFixed(1)} vs planned ${p}`);
    });
  }
  // Ground phase: from an open shield, 8 landings (160 K) of heavy fire beat a world; a frigate's 3 × 6.75 K per 10 s does it in
  // ~79 s, with missiles (salvo 2, half land) ~53 s; fighters alone never (rounds take no people).
  const ground = (k: number) => (8 * LANDING) / k;
  const missK = kps(ARMS.missile.k, 2, 0.5, ARMS.missile.reload);
  console.log(`ground phase (people 1 → ${BEATEN}): frigate alone ${ground(frigate).toFixed(0)} s, frigate + missiles ${ground(frigate + missK).toFixed(0)} s, fighters never`);
}
console.log('civilization rules: ok');
// Energy beam on a rival world (P = 1: a sun at 20% cover; 2.24: full cover): its shield takes beamK(P) a shot (shieldShot) and, stunned SHIELD_STUN = BEAM_COOL s, never mends
// between shots; while it holds nothing is removed. Then each shot bites BEAM_BITE × P of you off the world and kills
// BEAM_KILL × the share removed, until the rival is beaten.
{
  const duel = (L: number, P: number, m = 1) => {
    const sh: Shield = { level: L, s: SHIELD_K * L };
    let pop = 1, held = 0, bit = 0, down = 0;
    while (pop > BEATEN && m > 0) {
      const up = sh.s > 0; // weapon fire (rivals.ts shieldTake): taken while up, and every shot stuns it (BEAM_COOL = SHIELD_STUN: it never mends)
      shieldShot(sh, beamK(P));
      if (up) held++;
      else {
        down ||= held;
        const left = beamLeft(m, BEAM_BITE * P);
        [pop, m, bit] = [beamPop(pop, (m - left) / m), left, bit + 1];
      }
      shieldRegen(sh, BEAM_COOL);
    }
    return { down, held, bit, m };
  };
  const [l1, l3, sun, full] = [duel(1, 1), duel(3, 1), duel(1, 1), duel(1, Math.sqrt(5))];
  assert.ok(l1.down === 2 && l3.down === 5, `shield breaks after ${l1.down} (L1) / ${l3.down} (L3) shots`);
  assert.ok(full.bit + full.held >= 15 && full.m > 0.5 && sun.m > 0.5, `equal-mass rival beaten in ${full.bit + full.held} shots at full sun cover`);
  console.log(`beam vs rival: shield down after ${l1.down} (L1) / ${l3.down} (L3) shots at P 1 · equal-mass L1 rival beaten after ${sun.held} + ${sun.bit} shots (P 1), ${full.held} + ${full.bit} (full sun), ${(100 * full.m).toFixed(0)}% of its world left`);
}
console.log('civilization beam: ok');
// Shield layers (view.ts shieldLook veils): one per level, innermost first, the outer drains first; down: all empty.
{
  const L = (level: number, s: number) => shieldLayers({ level, s });
  assert.deepEqual(L(3, 75), [1, 1, 0.5]);
  assert.deepEqual(L(3, 0), [0, 0, 0]);
  assert.deepEqual(L(2, -4.5), [0, 0]);
  for (const [level, s] of [[1, 12], [2, 45], [3, 90], [3, -10], [3, 31]]) assert.ok(near(L(level, s).reduce((a, f) => a + f, 0) * SHIELD_K, Math.max(0, s)), `layers sum to the shield (L${level}, ${s} K)`);
}
// The siege (rules.ts SIEGE, sortieStep): the wing is every fighter but one (at most SIEGE.wing); losses never recall the
// sortie; it ends past RECALL, on another target, with your shield down (then CALM_S), or when the order that alone
// brought it on is cancelled outside STRIKE; it starts within STRIKE by itself, or RECALL at the world you order it at; a strafing turn every SIEGE.pass s keeps fighter fire within the wing-3 rate the TTK table assumes.
{
  assert.deepEqual([0, 1, 2, 6, 9].map(siegeWing), [0, 0, 1, 5, 5]);
  assert.ok(SIEGE.pass >= ARMS.round.run / 3, `a strafing turn every ${SIEGE.pass} s`);
  const st: { on: boolean; calm: number; by?: boolean } = { on: false, calm: 0 }, run = (gap: number, ordered = false, s = 60, moved = false, n = 60) => {
    let say: string | undefined;
    for (let i = 0; i < n; i++) say = sortieStep(st, gap, ordered, s, moved, 1 / 60) ?? say;
    return say;
  };
  assert.ok(run(16) === undefined && !st.on, 'not from 16 R without an order');
  assert.ok(run(16, true) === 'engage' && st.on, 'from 16 R at the world you order it at');
  assert.ok(run(16) === 'recall' && !st.on && st.calm === 0, 'that order cancelled at 16 R: recalled');
  assert.ok(run(12, true) === 'engage' && run(12) === undefined && st.on, 'cancelled within STRIKE: it stays (it would engage by itself)');
  assert.ok(run(10, false, 60, false, 1200) === undefined && st.on, 'stays on at 10 R for 20 s (fighters lost or not)');
  assert.ok(run(18.5) === 'recall' && !st.on && st.calm === 0, 'off past RECALL, no calm');
  assert.ok(run(13) === 'engage' && st.on, 'back on within STRIKE');
  assert.ok(run(10, false, 0, false, 1) === 'recall' && !st.on && near(st.calm, CALM_S), 'your shield down: off, then CALM_S');
  assert.ok(run(10, false, 60, false, 60 * 19) === undefined && !st.on, 'calm blocks a start');
  assert.ok(run(10, false, 60, false, 70) === 'engage' && st.on, 'on again after the calm');
  assert.ok(sortieStep(st, Infinity, false, 60, true, 1 / 60) === 'recall' && !st.on, 'target gone: off');
}
console.log('civilization shield layers and siege: ok');
