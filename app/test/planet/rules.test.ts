// node test/planet/rules.test.ts: Age II tiers, climate (greenhouse, rain, boiling), habitability, life.
import assert from 'node:assert/strict';
import { boil, boilingK, heatOfK, kelvin, pressure, waterState } from '../../src/core/water.ts';
import { AGE_GOAL, blend, COOL, G_WORLD, GIANT_HIT, radiusOf, START_R, youPull, type Comp } from '../../src/evolution/asteroid/rules.ts';
import { slotRadius } from '../../src/core/orbits.ts';
import {
  AIR_LO, airLimits, FEED, fedAir, gripWindow, HOT_RAMP, nextMoonMass, LANE, matchWindow, moonCap, MOON_R, MOON_SHARE, beforeClimate, bombardment, climate, climateK, envelope, fieldParts, habitability, impact, lifeSpeed, lifeStep, LIFE_S, magnet, moonSlots, nextGoal, pickSlot, onGasLine, radioLife, SOFT_S, stageOf, tierIndex, tierName,
  type Life, type Sky, type World,
} from '../../src/evolution/planet/rules.ts';

const ROCKY: Comp = { rock: 0.6, metal: 0.15, ice: 0.2, gas: 0.05 };
const GASSY: Comp = { gas: 0.75, ice: 0.15, rock: 0.1 };

// Tiers: doc names and masses, by composition.
for (const [m, comp, heat, name] of [[10 ** 3.6, ROCKY, 0, 'Planetoid'], [2e4, ROCKY, 5, 'Protoplanet'], [2e4, ROCKY, 0, 'Dwarf planet'], [5e4, ROCKY, 0, 'Rocky planet'], [2e5, ROCKY, 0, 'Super-Earth'],
  [2e5, { gas: 0.3, rock: 0.7 }, 0, 'Mini-Neptune'], [4e5, { gas: 0.3, ice: 0.35, rock: 0.35 }, 0, 'Ice giant'], [2e6, GASSY, 0, 'Gas giant'], [5e6, GASSY, 0, 'Super-Jupiter']] as const) assert.equal(tierName(m, comp, heat), name);
assert.equal(nextGoal(5e5, ROCKY), undefined); // rocky past Super-Earth: the goal is life
assert.equal(nextGoal(5e6, GASSY)!.name, 'Brown dwarf');
assert.ok(tierIndex(1e5) === tierIndex(10 ** 4.6) + 1);
assert.ok(envelope(2e5, GASSY) && !envelope(5e4, GASSY)); // a gassy Planet still has a surface; a Mini-Neptune doesn't

// Pressure is core/water.ts's: held gas × 4, × (m / 10^4.5)^(2/3) above Planet mass.
assert.ok(Math.abs(pressure(10 ** 4.5, 0.25) - 1) < 1e-9);
assert.ok(Math.abs(pressure(1e5, 0.08) - 0.689) < 1e-3 && Math.abs(pressure(1e5, 0.2) / pressure(10 ** 4.5, 0.2) - 10 ** (1 / 3)) < 1e-9);
// Calm: bombardment B = 0.15 + 0.85·exp(−S/120): fresh 1, 2 min settled 0.46, 4 min 0.27, never below 0.15.
assert.ok(bombardment(0) === 1 && Math.abs(bombardment(120) - 0.4627) < 1e-3 && Math.abs(bombardment(240) - 0.265) < 1e-3 && bombardment(1e6) >= 0.15);
// Climate: liquid at rest 0.34–2.56 atm; 0.4 atm rests at 279 K, 0.6 at 296 K, 1 atm at 320 K.
assert.ok(climateK(0) < 273 && climateK(0.33) < 273 && climateK(0.35) > 273 && climateK(2.5) < 373 && climateK(2.6) > 373);
const rest = [0.3, 0.4, 0.6, 1, 2.5].map((p) => Math.round(climateK(p)));
assert.deepEqual(rest, [268, 279, 296, 320, 371]);
// The temperature score at rest, on a Planet-mass world whose gas gives that pressure (0 at 0.3 atm: frozen).
const restTemp = [0.3, 0.4, 0.6, 1, 2.5].map((p) => {
  const k = climateK(p);
  return habitability({ m: 10 ** 4.5, r: 1, comp: { rock: 0.5, metal: 0.1, ice: 0.3, gas: p / 4 }, heat: (k - 120) / 430, diff: 1 }).temp;
});
assert.ok(restTemp[0] === 0 && restTemp.slice(1, 4).every((t) => t > 0.7) && restTemp[4] > 0, restTemp.join(' ')); // 2.5 atm: liquid, close to boiling
console.log(`planet ok: climate at rest 0.3 / 0.4 / 0.6 / 1 / 2.5 atm -> ${rest.join(' / ')} K, temperature score ${restTemp.map((t) => t.toFixed(2)).join(' / ')}`);

/** The player's frame: tickBody cooling + core/water.ts boiling (player.ts), then Age II's climate. */
function run(b: World, sky: Sky, seconds: number, dt = 0.05) {
  let leaked = 0;
  for (let t = 0; t < seconds; t += dt) {
    beforeClimate(sky, b);
    b.heat *= Math.exp((-COOL * START_R * dt) / b.r);
    const ice = b.comp.ice ?? 0, { boiled, kept, cool } = boil(b.m, b.heat, ice, b.comp.gas ?? 0, dt);
    if (boiled) {
      b.heat = Math.max(0, b.heat - cool);
      b.comp = blend(blend(b.comp, b.m, { ice: 1 }, -boiled), b.m - boiled, { gas: 1 }, kept);
      b.m -= boiled - kept;
    }
    leaked += climate(sky, b, dt);
    b.r = radiusOf(b.m, b.comp);
  }
  return leaked;
}
/** Seconds of play with extra heat per second (a feeding run: meals and hits keep a world warm). */
function feed(b: World, sky: Sky, seconds: number, perS: number) {
  let leaked = 0;
  for (let t = 0; t < seconds; t++) {
    b.heat += perS;
    leaked += run(b, sky, 1);
  }
  return leaked;
}
const world = (m: number, comp: Comp, heat: number): World => ({ m, r: radiusOf(m, comp), comp, heat, diff: 1 });
const fmt = (b: World) => `${kelvin(b.heat).toFixed(0)} K, ${pressure(b.m, b.comp.gas ?? 0).toFixed(2)} atm, water ${(b.comp.ice! * 100).toFixed(1)}%, gas ${(b.comp.gas! * 100).toFixed(1)}%`;

// A molten young Planet (5e4) with 20% water and 10% gas: its water boils into a steam sky, then rains back
// down as it cools; at 0.54 atm it rests with liquid seas.
const thin = world(5e4, { rock: 0.55, metal: 0.15, ice: 0.2, gas: 0.1 }, 5), skyA: Sky = { vapor: 0, gas0: 0 };
run(thin, skyA, 10);
const steamy = skyA.vapor / thin.m;
assert.ok(steamy > 0.03, `steam sky after 10 s: vapour ${steamy.toFixed(3)}`);
run(thin, skyA, 230);
assert.ok(skyA.vapor / thin.m < 0.005, `rained out: vapour ${(skyA.vapor / thin.m).toFixed(4)}`);
run(thin, skyA, 160);
assert.equal(waterState(thin.m, thin.heat, thin.comp.gas!), 'liquid', fmt(thin));
assert.ok(habitability(thin).temp > 0.9, fmt(thin));
// Parked 10 more minutes: the seas stay liquid (no "Frozen seas" at rest).
run(thin, skyA, 600);
assert.equal(waterState(thin.m, thin.heat, thin.comp.gas!), 'liquid', fmt(thin));
console.log(`planet ok: molten planet, 10% gas: steam sky ${(steamy * 100).toFixed(1)}% at 10 s, rained out by 240 s, after 1000 s ${fmt(thin)} (liquid at rest)`);
// With 4% gas (0.22 atm) the air is too thin to keep seas: a snowball.
const snow = world(5e4, { rock: 0.61, metal: 0.15, ice: 0.2, gas: 0.04 }, 5), skyS: Sky = { vapor: 0, gas0: 0 };
run(snow, skyS, 600);
assert.equal(waterState(snow.m, snow.heat, snow.comp.gas!), 'ice', fmt(snow));
console.log(`planet ok: 4% gas -> ${fmt(snow)} (snowball)`);

// Same planet with 25% gas (1 atm): it cools into liquid oceans, temperate, and life can start.
const wet = world(5e4, { rock: 0.45, metal: 0.1, ice: 0.2, gas: 0.25 }, 5), skyB: Sky = { vapor: 0, gas0: 0 };
run(wet, skyB, 400);
const hab = habitability(wet);
assert.equal(hab.state, 'liquid', fmt(wet));
assert.ok(hab.temp > 0.5 && hab.air > 0.9 && hab.water > 0.4 && hab.rate > 0.2, JSON.stringify(hab));
console.log(`planet ok: 25% gas -> ${fmt(wet)}, habitability water ${hab.water.toFixed(2)} temp ${hab.temp.toFixed(2)} air ${hab.air.toFixed(2)} magnet ${hab.magnet.toFixed(2)} = life speed ${hab.rate.toFixed(2)}`);

// Keep feeding it (extra heat 0.012/s): the seas boil, no life, vapour leaks to space. Stop, and it rains back.
const hot = world(5e4, { ...wet.comp }, wet.heat), skyC: Sky = { vapor: 0, gas0: 0 };
const lost = feed(hot, skyC, 200, 0.012);
assert.ok(habitability(hot).rate === 0 && lost > 0, `${fmt(hot)}, leaked ${lost.toFixed(1)}`);
const hotNow = fmt(hot);
run(hot, skyC, 400);
assert.equal(habitability(hot).state, 'liquid', fmt(hot));
// Light feeding (0.004/s, ~1.7 K/s) keeps the seas liquid: the climate pulls heat back within RELAX_S.
const fed = world(5e4, { ...wet.comp }, wet.heat), skyF: Sky = { vapor: 0, gas0: 0 };
feed(fed, skyF, 300, 0.004);
assert.ok(habitability(fed).rate > 0, `light feeding: ${fmt(fed)}`);
console.log(`planet ok: feeding run -> ${hotNow}, ${lost.toFixed(0)} mass of vapour leaked; 400 s calm -> ${fmt(hot)}`);

// Grinding a 70%-gas moon for 6 s onto a 1e5 world at 290 K with 2% gas (planet/stage.ts wraps moons.update in fedAir):
// its gas stays air; counted as steam it would rain out as water within the minute after.
{
  const grind = (wrap: boolean) => {
    const b = world(1e5, { rock: 0.6, metal: 0.1, ice: 0.28, gas: 0.02 }, heatOfK(290)), sky: Sky = { vapor: 0, gas0: 0 }, dt = 0.05, g0 = b.m * b.comp.gas!;
    let fed = 0;
    for (let t = 0; t < 66; t += dt) { // 6 s of grinding, then a minute of weather
      beforeClimate(sky, b);
      const eat = () => { const dm = t < 6 ? FEED * b.m * dt : 0; [b.comp, b.m, fed] = [blend(b.comp, b.m, { gas: 0.7, rock: 0.3 }, dm), b.m + dm, fed + 0.7 * dm]; };
      if (wrap) fedAir(sky, b, eat); else eat();
      climate(sky, b, dt);
    }
    return { kept: b.m * b.comp.gas! - g0, fed, atm: pressure(b.m, b.comp.gas!) };
  };
  const air = grind(true), rain = grind(false);
  assert.ok(air.kept > 0.99 * air.fed && rain.kept < 0.5 * rain.fed, `kept ${air.kept.toFixed(0)} / ${rain.kept.toFixed(0)} of ${air.fed.toFixed(0)}`);
  console.log(`planet ok: a ground gas moon keeps ${air.kept.toFixed(0)} of ${air.fed.toFixed(0)} gas as air (${air.atm.toFixed(2)} atm); counted as steam only ${rain.kept.toFixed(0)} (${rain.atm.toFixed(2)} atm)`);
}

// No metal core, no life (doc: magnetic field is one of the four); dry worlds have none either.
assert.equal(habitability({ ...wet, comp: { rock: 0.55, ice: 0.2, gas: 0.25 } }).rate, 0);
assert.equal(habitability({ ...wet, comp: { rock: 0.65, metal: 0.1, gas: 0.25 } }).rate, 0);
// Radioactive rock and life (radioLife): a little helps (best ×1.25 at 1%), ×1 again at 3%, slower past it, never below ×0.25.
{
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  assert.ok(radioLife(0) === 1 && near(radioLife(0.01), 1.25) && radioLife(0.005) > 1 && near(radioLife(0.03), 1) && near(radioLife(0.02), 1.125));
  for (const s of [0, 0.002, 0.005, 0.008, 0.012, 0.02, 0.03, 0.05, 0.08, 0.12, 0.3]) assert.ok(radioLife(s) <= 1.25 + 1e-12 && radioLife(s) >= 0.25, `radioLife(${s})`);
  assert.ok(radioLife(0.04) < 1 && radioLife(0.06) < radioLife(0.04) && radioLife(0.1) < radioLife(0.06), 'past 3% it slows life more and more');
  assert.ok(radioLife(0.12) === 0.25 && radioLife(0.5) === 0.25 && radioLife(1) === 0.25, 'never below 0.25');
  const base = habitability(wet).rate, as = (radio: number) => habitability({ ...wet, comp: { ...wet.comp, rock: (wet.comp.rock ?? 0) - radio, radio } }).rate;
  assert.ok(near(as(0.01), 1.25 * base) && as(0.2) > 0 && as(0.2) < base && near(as(0.2), 0.25 * base), `life speed ${base.toFixed(3)} clean, ${as(0.01).toFixed(3)} at 1%, ${as(0.2).toFixed(3)} at 20%`);
  console.log(`planet ok: radioactive share and life speed ×${[0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12].map((s) => `${radioLife(s).toFixed(2)} (${s * 100}%)`).join(' ')}`);
}

// Life: ideal conditions bring LIFE in ~LIFE_S s; a hard hit costs SOFT_S, a big one wipes it out.
const ideal = { ...hab, water: 1, temp: 1, air: 1, magnet: 1, rate: 1 };
const life: Life = { progress: 0, calm: 0 };
let t = 0;
while (lifeStep(life, ideal, 1) < 0 && t < 2000) t++;
assert.ok(t >= LIFE_S - 1 && t <= LIFE_S + 1, `life after ${t} s`);
assert.equal(impact(life, 10), 0); // a gentle meal: nothing
assert.equal(impact(life, 40), 'soft'); // a hard hit: SOFT_S of progress, and life falls back below LIFE
assert.equal(life.progress, LIFE_S - SOFT_S);
assert.equal(stageOf(life.progress), -1);
assert.equal(impact(life, 200), 1); // a big hit (≥ 150 K): wiped out
assert.equal(life.progress, 0);
assert.equal(impact(life, 400), 0); // nothing left to lose
// Moon slots: 1 / 2 / 3 / 4 / 5 at 10^3.5 / 10^4 / 10^4.5 / 10^5 / 10^5.5, none before the handover, never more than 5.
assert.deepEqual([3e3, 10 ** 3.5, 9999, 1e4, 10 ** 4.5, 1e5, 10 ** 5.5, 1e9].map(moonSlots), [0, 1, 1, 2, 3, 4, 5, 5]);
// Grinding a moon by hand: a full one in 5–12 s, the smallest in under a second.
assert.ok(MOON_SHARE[1] / FEED >= 5 && MOON_SHARE[1] / FEED <= 12 && MOON_SHARE[0] / FEED < 1, `moon grind ${(MOON_SHARE[1] / FEED).toFixed(1)} s`);
console.log(`planet ok: LIFE in ${t} s at ideal conditions; a gentle meal (10 K) costs nothing, 40 K ${SOFT_S} s, 200 K wipes it out`);

// Life speed: weakest of water / temperature / air × (0.5 + 0.5 · field); all four must be > 0.
assert.equal(lifeSpeed(0.7, 0.9, 0.8, 0), 0);
assert.ok(Math.abs(lifeSpeed(0.7, 0.9, 0.8, 1) - 0.7) < 1e-9 && Math.abs(lifeSpeed(0.7, 0.9, 0.8, 0.01) - 0.3535) < 1e-9);
// A Planet-mass world with 9% metal at diff 0.28: field 0.42; with the others at 0.7, speed 0.50.
const pw = { rock: 0.6, metal: 0.09, ice: 0.25, gas: 0.06 }, field = magnet(10 ** 4.5, pw, 0.28);
assert.ok(Math.abs(field - 0.42) < 1e-9, `field ${field}`);
const speed = lifeSpeed(0.7, 0.7, 0.7, field);
assert.ok(Math.abs(speed - 0.497) < 1e-3);
const parts = fieldParts(10 ** 4.5, pw, 0.28);
assert.ok(parts.sunk < parts.metal && parts.sunk < parts.size); // the HUD tip names melting, not size
// Extra sunk metal makes up for a small world's dynamo (up to 2×); a planet stays capped at 1.
const rich = { rock: 0.76, metal: 0.12, ice: 0.1, gas: 0.02 };
assert.ok(Math.abs(magnet(1e4, rich, 1) - 1) < 1e-9 && Math.abs(magnet(1e4, { ...rich, metal: 0.06 }, 1) - 0.5) < 1e-9 && magnet(10 ** 4.5, rich, 1) === 1);
console.log(`planet ok: sample world field ${field.toFixed(2)}, life speed ${speed.toFixed(2)}: LIFE in ${(LIFE_S / speed).toFixed(0)} s`);

// Gas line: in at 20% gas, out below 15%; Brown dwarf at 10^7 on the line.
let line = false;
for (const g of [0.18, 0.21, 0.17, 0.19, 0.16, 0.149]) {
  line = onGasLine(line, { gas: g, rock: 1 - g });
  if (g === 0.19) { // on the line at 19%: 3.5M stays Mini-Neptune, 13.8M is a Brown dwarf
    assert.equal(tierName(3.5e6, { gas: g, rock: 1 - g }, 0, line), 'Mini-Neptune');
    assert.equal(tierName(13.8e6, { gas: g, rock: 1 - g }, 0, line), 'Brown dwarf');
  }
}
assert.equal(line, false);
assert.equal(tierName(2.13e7, { gas: 0.19, ice: 0.3, rock: 0.51 }, 0, true), 'Brown dwarf');
assert.equal(tierName(2.13e7, { gas: 0.19, ice: 0.3, rock: 0.51 }, 0, false), 'Super-Earth');
// Ice giant needs the gas line, like envelope: a wet rocky world at 10^5.5 under it stays Super-Earth (user, 2026-11-17).
const WET: Comp = { ice: 0.5, gas: 0.12, rock: 0.3, metal: 0.08 }, WET_GAS: Comp = { ice: 0.45, gas: 0.22, rock: 0.25, metal: 0.08 };
assert.equal(tierName(10 ** 5.5, WET, 0), 'Super-Earth');
assert.equal(tierName(10 ** 5.5, WET, 0, false), 'Super-Earth');
assert.equal(tierName(10 ** 5.5, WET_GAS, 0), 'Ice giant');
assert.equal(tierName(10 ** 5.5, { ...WET, gas: 0.17, ice: 0.45 }, 0, true), 'Ice giant', 'sticky line: 17% gas still on it');
assert.equal(nextGoal(2e7, GASSY, true), undefined);
assert.ok(envelope(2e5, { gas: 0.17, rock: 0.83 }, true) && !envelope(2e5, { gas: 0.17, rock: 0.83 }, false));
console.log('planet ok: gas line sticky 20% in / 15% out (3.5M at 19% stays Mini-Neptune), 13.8M and 21.3M on the line = Brown dwarf');

// Moon slots on screen: the at-rest view's half height (1280×720, main.ts BASE_ZOOM 1.02, player.ts view ∝ (r/16)^0.8) in your
// radii vs the outer slot + the widest moon (MOON_R); past 10^5.5 moons.ts fit() pulls the camera back (≤ 1.6×).
const halfH = (m: number) => { const r = radiusOf(m, ROCKY); return (360 / 1.02) * (r / START_R) ** 0.8 / r; };
const outer = (m: number) => slotRadius(1, moonSlots(m) - 1) + MOON_R;
for (const m of [10 ** 3.5, 1e4, 10 ** 4.5, 1e5, 10 ** 5.5]) assert.ok(outer(m) < halfH(m), `outer slot ${outer(m).toFixed(1)} R vs view ${halfH(m).toFixed(1)} R at ${m}`);
// "Moon-size" = the giant-impact line.
assert.equal(MOON_SHARE[1], GIANT_HIT);
// Catch lanes (R = 1): neighbouring lanes never overlap; the inner lane's inner edge clears contact with a 12.5% moon (radius 0.5 R).
for (let k = 0; k < 4; k++) assert.ok(slotRadius(1, k) + LANE <= slotRadius(1, k + 1) - LANE + 1e-9, `lanes ${k} and ${k + 1} overlap`);
assert.ok(slotRadius(1, 0) - LANE > 1 + Math.cbrt(MOON_SHARE[1]), 'the inner lane clears contact');
// Moon size: two of the widest moons on neighbouring rings never touch, even stretched 1/0.75 (body.ts asDebris); moonCap holds
// a moon to MOON_R whatever its make-up (a metallic 12.5% moon of a small world already fits: it keeps the full share).
for (let k = 0; k < 4; k++) assert.ok(slotRadius(1, k + 1) - slotRadius(1, k) >= (2 * MOON_R) / 0.75, `rings ${k} and ${k + 1} too close for MOON_R`);
const MOON_COMPS: Comp[] = [ROCKY, { ice: 0.7, rock: 0.15, gas: 0.15 }, { gas: 0.5, ice: 0.3, rock: 0.2 }, { metal: 0.7, rock: 0.3 }];
const widest = [1e4, 1e6, 1e7].map((M) => { const R = radiusOf(M, ROCKY); return MOON_COMPS.map((c) => { const m = MOON_SHARE[1] * M, cap = moonCap(m, radiusOf(m, c), M, R); assert.ok(radiusOf(cap, c) <= MOON_R * R * 1.001, `moon of ${M} too wide`); return cap / M; }); });
assert.equal(widest[0][3], MOON_SHARE[1]);
// Match window: 1 D/s (2 R/s) on small worlds, wider on giants (MATCH_ORBIT of the slot's circular speed); the grip covers escape speed.
const circAt = (m: number) => { const r = radiusOf(m, ROCKY); return { r, circ: Math.sqrt((G_WORLD * youPull(m, r)) / slotRadius(r, 0)) }; };
const small = circAt(10 ** 3.5), huge = circAt(1e7);
assert.equal(matchWindow(small.r, small.circ), 2 * small.r);
assert.ok(matchWindow(huge.r, huge.circ) > 2 * huge.r, `giant window ${(matchWindow(huge.r, huge.circ) / (2 * huge.r)).toFixed(2)} D/s`);
// pickSlot: the free ring a body sits nearest, any ring (user 2026-11-15); a held ring wins until another is STAY nearer.
const mid = slotRadius(1, 1) + 0.625;
for (const [args, k] of [[[slotRadius(1, 2), 1, 4, 0], 2], [[slotRadius(1, 2) + 0.1, 1, 4, 0b100], 3], [[slotRadius(1, 2) - 0.1, 1, 4, 0b100], 1], [[slotRadius(1, 1), 1, 4, 0b1111], -1], [[slotRadius(1, 0), 1, 0, 0], -1],
  [[20, 1, 2, 0], 1], [[mid + 0.05, 1, 4, 0, 1], 1], [[mid + 0.1, 1, 4, 0, 1], 2], [[mid + 0.05, 1, 4, 0], 2]] as const) assert.equal(pickSlot(...args), k, `pickSlot(${args})`);
for (const w of [small, huge]) assert.ok(gripWindow(w.r, w.circ) >= Math.SQRT2 * w.circ && gripWindow(w.r, w.circ) >= 2 * matchWindow(w.r, w.circ));

// nextMoonMass: where moonSlots steps up; undefined at five.
assert.equal(nextMoonMass(1e3), AGE_GOAL);
for (let m = AGE_GOAL; m !== undefined && moonSlots(m) < 5; m = nextMoonMass(m)) {
  const n = nextMoonMass(m)!;
  assert.ok(n > m && moonSlots(n) === moonSlots(m) + 1 && moonSlots(n * (1 - 1e-6)) === moonSlots(m), `next ring at ${n} from ${m}`);
}
assert.equal(nextMoonMass(10 ** 5.5), undefined);
// airLimits: at today's gas share, the masses where the resting climate reaches boiling − HOT_RAMP (suffer) and boiling.
const edge = (m: number, gas: number, warm: number, off: number) => { const p = pressure(m, gas); return climateK(p) + warm - (boilingK(p) - off); };
const shotLim = airLimits(125e3, 0.077);
for (const [mass, off] of [[shotLim.suffer, HOT_RAMP], [shotLim.boil, 0]]) assert.ok(Math.abs(edge(mass, 0.077, 0, off)) < 1e-3, `on the line: ${edge(mass, 0.077, 0, off)}`);
assert.ok(Math.abs(shotLim.suffer / 125e3 - 2.85) < 0.05 && Math.abs(shotLim.boil / 125e3 - 6.06) < 0.05, `screenshot Super-Earth 7.7% gas: ×${(shotLim.suffer / 125e3).toFixed(2)} / ×${(shotLim.boil / 125e3).toFixed(2)}`);
for (const [m, gas, warm] of [[125e3, 0.077, 30], [125e3, 0.077, 60], [1.5e4, 0.08, 0], [2e4, 0.04, 40], [5e4, 0.2, 0], [5e3, 0.2, 30], [2e3, 0.05, 32]] as const) {
  const l = airLimits(m, gas, warm);
  assert.ok(l.suffer <= l.boil, `suffer no later than boil: ${JSON.stringify(l)}`);
  for (const [mass, off] of [[l.suffer, HOT_RAMP], [l.boil, 0]]) {
    if (mass === m) assert.ok(edge(m, gas, warm, off) >= 0 && pressure(m, gas) >= AIR_LO, 'returns m only when already over in livable air');
    else assert.ok(mass > m && edge(mass, gas, warm, off) > -1e-3 && (Math.abs(edge(mass, gas, warm, off)) < 1e-3 || Math.abs(pressure(mass, gas) / AIR_LO - 1) < 1e-5) && !(edge(mass * (1 - 1e-5), gas, warm, off) >= 0 && pressure(mass * (1 - 1e-5), gas) >= AIR_LO), `${m} ${gas} ${warm}: first over at ${mass}`);
  }
}
const sub = airLimits(5e3, 0.2, 30); // below Planet mass pressure grows with hold(m): the crossing can sit there too
assert.ok(sub.suffer > 5e3 && sub.suffer < 10 ** 4.5, `sub-Planet crossing: ${sub.suffer}`);
const airless = airLimits(2e3, 0.05, 32); // airless and hot: a sub-triple-point "crossing" has no seas; the line starts at AIR_LO
assert.ok(pressure(airless.suffer, 0.05) >= AIR_LO * (1 - 1e-5) && pressure(airless.boil, 0.05) >= AIR_LO * (1 - 1e-5), `thin air: ${JSON.stringify(airless)}`);
const more = airLimits(125e3, 0.1), warmer = airLimits(125e3, 0.077, 20);
assert.ok(more.boil < shotLim.boil && more.suffer < shotLim.suffer && warmer.boil < shotLim.boil && warmer.suffer < shotLim.suffer, 'more gas or warmth lowers both');
assert.ok(airLimits(125e3, 0.5).boil === 125e3 && airLimits(125e3, 0).boil === Infinity, 'already boiling: m; no gas: never');
console.log(`planet ok: outer slot vs view half height ${[10 ** 3.5, 1e4, 10 ** 4.5, 1e5, 10 ** 5.5, 1e6].map((m) => `${outer(m).toFixed(1)}/${halfH(m).toFixed(1)}`).join(' ')} R; match window ${[10 ** 3.5, 10 ** 5.5, 10 ** 6.5, 1e7].map((m) => { const w = circAt(m); return (matchWindow(w.r, w.circ) / (2 * w.r)).toFixed(2); }).join(' / ')} D/s at 10^3.5 / 10^5.5 / 10^6.5 / 10^7; widest moon (stony/icy/gas-rich/metallic) ${widest.map((w) => w.map((s) => `${(100 * s).toFixed(1)}%`).join('/')).join(' · ')} of 10^4 · 10^6 · 10^7`);
