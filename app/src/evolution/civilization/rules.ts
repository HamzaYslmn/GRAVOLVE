// Civilization rules, plain numbers (no Pixi), checked by test/civilization/rules.test.ts. It starts with LIFE (planet/rules.ts) and runs
// by itself; the player's levers are physical: what you eat (green rocks: fuel, and dose until it is dug out), which moons you
// catch (miners use them up for fuel, for what your world lacks and for ships).
//   - Stock units: 1 u = 10⁻⁴ of your mass, so every cost scales with you.
//   - Population (billions): logistic toward a capacity from habitability and size, capped by energy.
//   - Energy (E/s, a flow): inner heat, reactors burning the fuel stock, solar farms by starlight (free, more by tier), Dyson later.
//   - Dose: the radioactive rock in your world plus outside radiation the magnetic field and air hold back. Above 1 people die.
//   - Stocks: fuel (mined radioactive ore), ore (mined metal) and volatiles (mined water), from moons, free bodies and beaten rival worlds, and slowly your own world.
//   - Tier: grows as the people double; miners work faster with it.
import { BURN_MAX, impactHeat, MOLTEN, reachGround, SPECK, worldHeat, type Comp } from '../asteroid/rules.ts';
import { clamp } from '../../core/rng.ts';
import { K_PER_HEAT } from '../../core/water.ts';
import { PLANET_M } from '../planet/rules.ts';

export const UNIT = 1e-4; // share of your mass in one unit of stock
/** Stock units in `mass` at your mass `you`. */
export const units = (mass: number, you: number) => mass / (UNIT * you);

// ---- Population
export const P0 = 0.2; // bn when the intelligent species appears
const P_MIN = 0.01; // bn: a few survivors always remain
const GROW = 1 / 60; // logistic rate per s
const POP_K = 10; // bn at habitability 1 and Planet mass
/** Capacity from habitability (planet/rules.ts life speed) and size: √rate, ∝ m^(1/3). */
export const capacity = (rate: number, m: number) => POP_K * Math.sqrt(clamp(rate, 0, 1)) * size(m);
/** Size term for capacity and power: (m / Planet)^⅓. */
const size = (m: number) => (m / PLANET_M) ** (1 / 3);
const DECLINE = 0.25 / 60; // per s, toward capacity from above
export const ASLEEP_FALL = 1 / 60; // per s while LIFE is lost
/** One population step: logistic toward K from below, linear from above (at `fall`). Dose over the limit stops growth (× (1 − harm)) and kills a share per second. */
export function popStep(P: number, K: number, dose: number, dt: number, fall = DECLINE) {
  const harm = clamp(dose - DOSE_SAFE, 0, 1);
  const grow = K >= P ? ((GROW * P * (K - P)) / Math.max(K, 1e-9)) * (1 - harm) : -fall * (P - K);
  return Math.max(P_MIN, P + (grow - killRate(dose) * P) * dt);
}

// ---- Energy and radiation
// Two quantities: fuel (Stocks.fuel, u) is what the reactors burn; radiation (your world's radioactive share) is the dose.
// Miners' radioactive ore goes straight to the fuel stock; a green rock you eat raises the share, and your people dig it
// out into fuel (refine). Dose goes by concentration, never by carried mass: a big world full of plain rock is as safe as a
// small one. Inner heat and reactors grow with size like the population capacity (∝ m^⅓): inner heat alone feeds about
// half a habitable world's people, the reactors take you past that while their fuel lasts. A metal core holds more heat:
// inner heat ×0.75 with no metal, ×1 at GEO_METAL, ×1.25 from twice that.
export const NEED = 0.1; // E/s per bn
export const GEO = 0.5; // E/s from inner heat at Planet mass (feeds 5 bn)
export const GEO_METAL = 0.1; // metal share at which inner heat is GEO (the start dust's)
export const geo = (m: number, metal = GEO_METAL) => GEO * size(m) * clamp(0.75 + (0.25 * metal) / GEO_METAL, 0.75, 1.25);
export const RADIO_LIMIT = 0.03; // radioactive share that alone reaches the safe dose at tier 1 (single green rocks are 25%)
// A grown civilization handles its fuel: the safe share rises with the tier, RADIO_LIMIT at tier 1 to RADIO_TOP at TIER_MAX
// (3 / 4.4 / 6.4 / 9.4 / 13.7 / 20%).
const RADIO_TOP = 0.2;
export const radioLimit = (T: number) => RADIO_LIMIT * (RADIO_TOP / RADIO_LIMIT) ** ((clamp(T, 1, TIER_MAX) - 1) / (TIER_MAX - 1));
/** Dose from the radioactive matter in your world: share / the safe share (no field or air helps). */
export const radioDose = (share: number, limit = RADIO_LIMIT) => Math.max(0, share) / limit;
export const REACTOR = 1; // E/s the reactors add at Planet mass with fuel in stock (feeds 10 bn more)
export const FUEL_E = 40; // E·s a unit of fuel gives at Planet mass: a full reactor burns 1.5 u/min
export const FUEL_LOW = 10; // u: under this the reactors throttle down (no cliff)
export const FUEL_RESERVE = 30; // u: under this miners weigh radioactive ore double
export const WORK_E = 0.2; // E/s each working industry draws: a build, the rockets on a priority, the shield mending
const REFINE_S = 180; // s (e-folding): your people dig the radioactive rock in your world into fuel
export const reactor = (fuel: number, m: number) => REACTOR * size(m) * clamp(fuel / FUEL_LOW, 0, 1);
/** Fuel (u/s) burnt for what `need` exceeds the free energy `free` (inner heat + solar + Dyson), at most the reactors' power. */
export const fuelBurn = (need: number, free: number, fuel: number, m: number) => Math.min(Math.max(0, need - free), reactor(fuel, m)) / size(m) / FUEL_E;
/** Share of your mass dug from radioactive rock into fuel in dt (÷ UNIT = u); it leaves plain rock. */
export const refine = (share: number, dt: number) => Math.max(0, share) * (1 - Math.exp(-dt / REFINE_S));
export const SOLAR = 0.5; // E/s the solar farms give at Planet mass in full light (as inner heat; half a full reactor)
/** Solar farm fields (view.ts solarFarms) by tier: 0, 2, 3, 4, 5, 6 at tiers 1–6. */
export const solarWings = (T: number) => (T >= 2 ? Math.min(TIER_MAX, Math.floor(T)) : 0);
/** E/s the wings give in starlight `light` (star/rules.ts sunlight, 1 = full) at tier T, mass m: free, always on. */
export const solar = (light: number, T: number, m: number) => (SOLAR * size(m) * clamp(light, 0, 1) * solarWings(T)) / TIER_MAX;
const COSMIC = 0.4; // dose on an airless world without a magnetic field
export const DOSE_SAFE = 1;
const DOSE_KILL = 0.2 / 60; // share of the people per second per unit of dose over the limit
const KILL_MAX = 0.4 / 60; // the death rate stops growing here
export const killRate = (dose: number) => Math.min(KILL_MAX, DOSE_KILL * Math.max(0, dose - DOSE_SAFE));
/** Outside radiation (cosmic, star `flux`) after the field halves it and the air thins it. */
export const spaceDose = (magnet: number, p: number, flux = 0) => (COSMIC + flux) * (1 - 0.5 * magnet) * Math.exp(-p / 2);
/** Surface dose: `rad` (radioDose) plus outside radiation. */
export const dose = (rad: number, magnet: number, p: number, flux = 0) => rad + spaceDose(magnet, p, flux);
/** Energy flow: inner heat + reactors (on the fuel stock) + Dyson (star light) + `sun` (solar). */
export const energy = (fuel: number, m: number, dyson = 0, sun = 0, metal = GEO_METAL) => geo(m, metal) + reactor(fuel, m) + dyson + sun;
/** Capacity with energy (pass E − the shield's upkeep): people beyond what the energy feeds starve back down. */
export const fedCapacity = (K: number, E: number) => Math.max(0, Math.min(K, E / NEED));

// ---- Impacts that get through (no shield, or too big for it) kill ~K/100 of the people.
export const HIT_MIN = 20; // K: below this nobody notices (planet/rules.ts EXTINCT[0])
export const HIT_KILL = 0.01; // share per K delivered
export const popHit = (P: number, kelvin: number) => (kelvin < HIT_MIN ? P : Math.max(P_MIN, P * (1 - Math.min(0.9, kelvin * HIT_KILL))));

// ---- Start: LIFE brings industry, a level-1 shield and two patrols at once (no tech ladder).
export const START_SHIPS = 2;
export const START_ORE = 10; // u: a new civilization can launch a few rockets before its miners bring metal in

// ---- Tier: the civilization's size, +1 each time its people double from P0 (tier 1 at the start, TIER_MAX at 6.4 bn).
export const TIER_MAX = 6;
export const tier = (P: number) => clamp(1 + Math.floor(Math.log2(Math.max(1, P / P0))), 1, TIER_MAX);

export type Stocks = { ore: number; vol: number; fuel: number };

// ---- Fleet: each class its own cap. Probes, the weakest lasers, one per tier; fighters, fast and
// light, 2 + one per METAL_SHIP u of metal your miners bring in, up to 6; frigates, slow heavy lasers, one from tier 3
// and two from tier 5. A laser hit breaks a body up to `breaks` of you into at most `pieces` (Breaking below). A probe or
// fighter run fires at most `bursts` bursts of `rounds` at `rate` a second, then the ship breaks off and cools `cool` s.
// Each class its own feel (user, 2026-11-15): fighters fire fast and light, probes slow and weak; the frigate (ARMS.lance)
// and rockets (ROCKET) are slow but heavy. Builds are
// automatic, one at a time (stage.ts); miners have their own cap (mining.ts minerCap).
export const FRAG = 0.02;
export const FLEET = {
  probe: { ore: 2, t: 4, breaks: 0.005, pieces: 3, rounds: 3, bursts: 1, cool: 5, rate: 4 },
  fighter: { ore: 3, t: 8, breaks: FRAG, pieces: 6, rounds: 8, bursts: 2, cool: 1.5, rate: 16 },
  frigate: { ore: 25, t: 40, breaks: 0.25, pieces: 8 }, // rare and dear (8 fighters' ore): the heavy battery (ARMS.lance)
};
export type ShipClass = keyof typeof FLEET;
/** What the yards build first (stage.ts: the first wanted, waiting for its ore): fighters, your first frigate, shield levels, a second frigate, probes. */
export const buildOrder = (frigates: number): readonly (ShipClass | 'shield')[] => (frigates ? ['fighter', 'shield', 'frigate', 'probe'] : ['fighter', 'frigate', 'shield', 'probe']);
const METAL_SHIP = 20;
export const fleetCap = (k: ShipClass, T: number, metal: number) =>
  k === 'probe' ? T : k === 'fighter' ? Math.min(6, START_SHIPS + Math.floor(metal / METAL_SHIP)) : T >= 5 ? 2 : T >= 3 ? 1 : 0;

// ---- Rockets: launched from your surface from tier 1, only at what you ordered an attack on (ships.ts rockets) inside the range,
// ROCKET.ore each, one every ROCKET.reload s (× the energy fed: slower when the reactors run dry). Guided (guns.ts steer:
// boost, acc R/s², turn rad/s, cone rad, burn s, blind s; arc rad: off the aim line, sides alternating; nav: the aim error
// is closed at nav / time-to-go, a lazy arc from afar), cruise `speed` R/s on top of you (slower than a round: a rocket is seen coming): a body of `share` breaks into `pieces`, a bigger one or a
// rival's rock loses `chip.bite` of your mass and warms `chip.k` K (ships.ts chip); a ship dies in the `blast` (R). The
// range grows and the launch aim error shrinks with the tier.
export const ROCKET = { ore: 2, reload: 8, speed: 12, share: [0.01, 0.25], pieces: 8, boost: 0.3, acc: 14, turn: 1.4, cone: 1.4, burn: 2.8, blind: 0.1, arc: 0.8, nav: 6, blast: 0.3, chip: { bite: 0.0025, k: 40 } }; // from 1%: a hit of ~90 K (asteroid/rules.ts worldHeat)
export const rocketRange = (T: number) => 8 + 2 * clamp(T, 1, TIER_MAX); // R off your surface
export const rocketSpread = (T: number) => (0.08 * (TIER_MAX - clamp(T, 1, TIER_MAX))) / (TIER_MAX - 1); // rad: ±0.6 R at 8 R off you at tier 1

// ---- Breaking (ships.ts, stage.ts): your guns break only the body you order them at,
// into pieces you can take: under `edible` a body burns up whole in your air or lands under HIT_MIN, so it feeds you. Pieces
// a piece cap left unsafe are kicked sideways to miss (deflect). No cascade to dust.
export const KEEP = 0.9; // share of a broken body that flies on as pieces; the rest is dust (it joins you when you have air)
export const CUT = 0.8; // pieces are cut to this share of the edible size (on average)...
export const CUT_SPREAD = 0.25; // ...unequal by this pieceShares spread (stage.ts cut): the largest 1.25 × the mean, still under it
/** The pieceShares spread for a cut of mean `piece` under edible size `e`: CUT_SPREAD, less when a piece cap made the mean bigger, so the largest stays under `e`. */
export const cutSpread = (piece: number, e: number) => clamp(e / piece - 1, 0, CUT_SPREAD);
const FLOOR = 1.5; // × SPECK: pieces start this far above the drop floor, so they outlast a little growth
/**
 * Kelvin a body of `q` of your mass delivers arriving at `v` of your diameters/s (stick speed `vs`, your radius `R`), after
 * your air (`sb`: asteroid/rules.ts burnShare) burns what it can; `world`: Age II (rules.ts worldHeat, any-speed burn-up);
 * `heat`: its own heat, which comes with it only if it is molten (a star-baked rock merges).
 */
export function strikeK(q: number, v: number, vs: number, R: number, sb: number, world: boolean, heat = 0) {
  const l = world && q < Math.min(4 * sb, BURN_MAX) ? q * reachGround(q, sb) : q; // what reaches the ground
  return K_PER_HEAT * (impactHeat(l / (1 + l), v, vs, R) + (world ? worldHeat(l, v / vs) : 0) + (heat > MOLTEN ? l * heat : 0));
}
/** Largest share of you a piece arriving like strikeK's can have and still be safe: it burns up whole (`sb`, never from BURN_MAX) or lands whole under HIT_MIN. */
export function edible(sb: number, v: number, vs: number, R: number) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const q = (lo + hi) / 2;
    [lo, hi] = strikeK(q, v, vs, R, 0, true) < HIT_MIN ? [q, hi] : [lo, q];
  }
  return Math.max(Math.min(sb, BURN_MAX), lo);
}
/** The size guns cut pieces under: what burns up whole in your air (all of it feeds you), else edible. Measured at 0.26 atm, pieces cut to edible fed you 68-71% of a 1.5-1.9% rock. */
export const pieceSize = (sb: number, v: number, vs: number, R: number) => (sb > 0 ? Math.min(sb, BURN_MAX) : edible(sb, v, vs, R));
/**
 * A body of `share` of you broken into at most `cap` pieces (KEEP of it, `piece` the mean) cut under the edible size `e`, the
 * mean at least FLOOR × SPECK (the field drops pieces under SPECK; CUT_SPREAD leaves the smallest above it). `n` 0: too
 * small to leave pieces, all dust.
 */
export function split(share: number, e: number, cap: number) {
  const keep = share * KEEP, n = Math.min(cap, Math.max(2, Math.ceil(keep / (CUT * e))), Math.floor(keep / (FLOOR * SPECK)));
  return n > 0 ? { n, piece: keep / n, dust: share - keep } : { n: 0, piece: 0, dust: share };
}
export const MISS = 1.5; // × contact distance: a kicked body passes at least this far from your centre
/**
 * The sideways kick (velocity change) that makes a body at (px, py) moving at (wx, wy) relative to you pass MISS × `contact`
 * from your centre, judged at its closest approach (at least 0.5 s out); zero for one that already misses.
 */
export function deflect(px: number, py: number, wx: number, wy: number, contact: number) {
  const ww = wx * wx + wy * wy || 1, tc = Math.max(0.5, -(px * wx + py * wy) / ww), mx = px + wx * tc, my = py + wy * tc, miss = Math.hypot(mx, my), aim = MISS * contact;
  if (miss >= aim) return { x: 0, y: 0 };
  const A = ww * tc * tc - aim * aim, B = 2 * ww * miss * tc, C = ww * (miss * miss - aim * aim); // the kicked line passes exactly at aim
  const [ux, uy] = miss > 1e-3 * contact ? [mx / miss, my / miss] : [-wy / Math.sqrt(ww), wx / Math.sqrt(ww)], dv = A > 0 ? (Math.sqrt(B * B - 4 * A * C) - B) / (2 * A) : (aim - miss) / tc;
  return { x: ux * dv, y: uy * dv };
}

// ---- Shield (capped by energy): a shell at shellR round your world (asteroid/body.ts guard) that a body meets before your
// ground. Its charge (SHIELD_K a level) pays shieldPunch for the share of the body it stops: SHIELD_STOP of your mass per
// level at up to the stick speed. A punch it can pay in full bounces the body off (asteroid/rules.ts shellPass); a bigger
// one takes it to its floor (SHIELD_FLOOR below 0: the shatter) and stops that share, vaporised on the shell; the rest goes
// on, lighter and slower, and lands by the usual rules. A body that would deliver under HIT_MIN after your air (food,
// burn-up) or is as heavy as you is not its business. It regenerates SHIELD_REGEN of its maximum per second. Weapon fire
// is different (shieldShot): every hit counts, and it stops the mending for SHIELD_STUN s.
export const SHIELD_K = 30; // K per level
const SHIELD_REGEN = 0.01;
export const SHIELD_FLOOR = -0.15;
export const SHIELD_STOP = 0.025; // share of your mass a full level stops at up to the stick speed
export const SHIELD_LEVELS = 3;
export const SHIELD_STUN = 3; // s without mending after a weapon hit
export type Shield = { level: number; s: number; stun?: number };
export const shieldMax = (sh: Shield) => SHIELD_K * sh.level;
/** Each level's layer as a share of its SHIELD_K, innermost first (view.ts shieldLook: each veil's brightness): the outer layers drain first. */
export const shieldLayers = (sh: Shield) => Array.from({ length: Math.max(0, sh.level) }, (_, i) => clamp((sh.s - SHIELD_K * i) / SHIELD_K, 0, 1));
/** The shell's radius round a world of radius R at shield `level` (physics and view.ts alike). */
export const shellR = (R: number, level: number) => R * (1.18 + 0.05 * Math.max(0, level - 1));
/** Charge (K) it costs to stop `share` of your mass closing at `v` stick speeds (normal to the shell; max(1, v) as worldHeat). */
export const shieldPunch = (share: number, v: number) => SHIELD_K * (share / SHIELD_STOP) * Math.max(1, v);
const room = (sh: Shield) => sh.s - SHIELD_FLOOR * shieldMax(sh);
const engages = (sh: Shield, kelvin: number, share: number) => sh.level > 0 && sh.s > 0 && kelvin >= HIT_MIN && share < 1;
/** A body of `share` closing at `v` stick speeds that would deliver `kelvin` at your ground meets the shell: pays for and returns the share stopped (1: held, it bounces; 0: it passes untouched). */
export function shieldMeet(sh: Shield, kelvin: number, share: number, v: number) {
  if (!engages(sh, kelvin, share)) return 0;
  const P = shieldPunch(share, v), take = Math.min(P, room(sh));
  sh.s -= take;
  return take >= P ? 1 : take / P;
}
/** Would the shell hold this body whole (shieldMeet 1)? The caller checks HIT_MIN (ships.ts defend). */
export const shieldHolds = (sh: Shield, share: number, v: number) => engages(sh, HIT_MIN, share) && shieldPunch(share, v) <= room(sh);
/** Weapon fire of `k` K: no minimum, no size or range gate. While up the shield takes it down to its floor; every hit, up or down, stops the mending for SHIELD_STUN s. Returns the K that gets through (all of it while down). */
export function shieldShot(sh: Shield, k: number) {
  if (sh.level <= 0) return k;
  sh.stun = SHIELD_STUN; // down too: under fire it stays down
  if (sh.s <= 0) return k;
  const take = Math.min(k, sh.s - SHIELD_FLOOR * shieldMax(sh));
  sh.s -= take;
  return k - take;
}
/** Regenerates `fed` (shieldFed) × `rate` (the energy fed) × the normal rate up to `fed` × its maximum; nothing while stunned. */
export function shieldRegen(sh: Shield, dt: number, fed = 1, rate = 1) {
  if (sh.stun) [dt, sh.stun] = [Math.max(0, dt - sh.stun), Math.max(0, sh.stun - dt)];
  sh.s = Math.min(fed * shieldMax(sh), sh.s + rate * fed * SHIELD_REGEN * shieldMax(sh) * dt);
}
// Upkeep (only a starving world loses its shield): SHIELD_E per level, paid first; the people live on the rest
// (fedCapacity(K, E − upkeep)). The shield goes short only when the energy is below the upkeep itself.
export const SHIELD_E = 0.1;
export const upkeep = (level: number) => SHIELD_E * level;
export const shieldFed = (E: number, level: number) => (level > 0 ? clamp(E / upkeep(level), 0, 1) : 1);
/** Cost of building shield level L (2, 3; level 1 comes with LIFE). */
export const shieldCost = (L: number) => ({ ore: 10 * L, vol: 10, t: 25 });

/** Build speed (× the energy fed in stage.ts): faster while the people are below their capacity. */
export const buildSpeed = (P: number, K: number) => 0.5 + Math.min(1, P / Math.max(K, 1e-9));

// ---- Mining: miners take MINE_RATE × tier of a moon's starting mass per second (1.5%/min at tier 1,
// 9%/min at tier 6) as a mix weighted by MINE_MIX over what the body still has: radioactive first (into the fuel stock),
// then metal (ore, and fleet metal), then water (volatiles); metal or water
// you lack lands on you instead. Gas only while the air is thin (stage.ts latch: on under AIR_LOW atm, off at AIR_HIGH),
// and it lands. Rock never: it joins you whenever you swallow anything. A beaten rival world goes whole, by its own mix.
export const MINE_RATE = 0.015 / 60;
export const MINE_MIX = { radio: 0.5, metal: 0.3, ice: 0.2, gas: 0.2 } as const;
export type Ore = keyof typeof MINE_MIX;
export const AIR_LOW = 0.5;
export const AIR_HIGH = 0.8;
const ORE_MIN = 1e-3; // an element under this share is not worth a trip
/** Can miners take anything from `c` with these elements allowed? */
export const mineable = (c: Comp, on: readonly Ore[]) => on.some((e) => (c[e] ?? 0) > ORE_MIN);
/**
 * Mass `dm` off a body of mass `m` and composition `c`, split over the allowed elements by MINE_MIX weight (renormalised
 * over the ones it has, each capped by what is there): `take` per element and the body's composition after.
 */
export function mineMix(c: Comp, m: number, dm: number, on: readonly Ore[]) {
  const has = on.filter((e) => (c[e] ?? 0) > ORE_MIN), W = has.reduce((a, e) => a + MINE_MIX[e], 0), take: Partial<Record<Ore, number>> = {};
  let got = 0;
  for (const e of has) got += take[e] = Math.min((dm * MINE_MIX[e]) / W, m * (c[e] ?? 0));
  const after: Comp = {};
  for (const [e, f] of Object.entries(c) as [keyof Comp, number][]) after[e] = (m * f - (take[e as Ore] ?? 0)) / Math.max(1e-12, m - got);
  return { take, got, comp: after };
}
const LACK = 0.6; // a life condition under this score is lacking
export type Lack = 'ice' | 'gas' | 'metal';
/** The material your world lacks most: ice for water, gas for air, metal for the field (undefined: nothing lacking). */
export function lack(s: { water: number; air: number; magnet: number }): Lack | undefined {
  const [score, el] = ([[s.water, 'ice'], [s.air, 'gas'], [s.magnet, 'metal']] as const).reduce((a, b) => (b[0] < a[0] ? b : a));
  return score < LACK ? el : undefined;
}
// ---- Home extraction (user, 2026-11-15): with nothing to mine, your people still dig their own world: HOME_RATE × tier of
// its metal share a second into ore (a share over HOME_RICH counts as that) and of its water into volatiles while under
// HOME_VOL u (all that shield levels cost); never the element your world lacks. The dug share stays as plain rock (as refine).
export const HOME_RATE = 5e-6, HOME_RICH = 0.2, HOME_VOL = 20;
/** One step at tier T: `ore`, `vol` as shares of your mass (÷ UNIT = u) and your composition after (sum unchanged). */
export function homeDig(c: Comp, T: number, dt: number, vol = 0, need?: Lack) {
  const k = HOME_RATE * T * dt, dig = (e: 'metal' | 'ice', on: boolean) => (on ? clamp(c[e] ?? 0, 0, HOME_RICH) * k : 0);
  const ore = dig('metal', need !== 'metal'), wat = dig('ice', need !== 'ice' && vol < HOME_VOL), comp: Comp = { ...c, rock: (c.rock ?? 0) + ore + wat };
  if (ore) comp.metal = (c.metal ?? 0) - ore;
  if (wat) comp.ice = (c.ice ?? 0) - wat;
  return { ore, vol: wat, comp };
}

// ---- City lights in quarters of coverage (sphere.ts bakes 4 levels), full at LIGHTS_FULL bn.
const LIGHTS_FULL = 5;
export const cityLevel = (P: number) => Math.max(0.25, Math.ceil(Math.min(1, P / LIGHTS_FULL) * 4 - 1e-9) / 4);

// ---- Mass driver: a slug of SLUG_SHARE of your mass (SLUG_ORE u of ore) at SLUG_SPEED of your diameters/s on top of your
// velocity, every DRIVER_COOL s at best. Each slug also needs SLUG_E of energy, charged from the energy your people do not
// need (at least CHARGE_MIN E/s). The slug is a real body resolved by the collision regimes (weapon.ts).
export const SLUG_SHARE = 5e-4;
export const SLUG_ORE = SLUG_SHARE / UNIT; // 5 u
export const SLUG_SPEED = 50;
export const SLUG_LIFE = 1.6; // s of flight (~80 of your diameters)
export const DRIVER_COOL = 4;
export const SLUG_E = 2;
const CHARGE_MIN = 0.25;
/** E/s the driver's charge fills at: the spare energy flow, never below CHARGE_MIN. */
export const chargeRate = (E: number, need: number) => Math.max(CHARGE_MIN, E - need);
// Energy beam (from Dyson star/rules.ts BEAM_COVER, instead of slugs): no ore or charge, every BEAM_COOL s, a gun. Each shot
// bites BEAM_BITE of your mass × the beam's power P (star/rules.ts beamPower) off the first body, 40% of it as three chunks;
// a body within BEAM_SHATTER bites shatters. A rival world loses nothing while its shield holds; once it is down, people
// BEAM_KILL × the share of the world removed. Every enemy ship on the line breaks. Heat and the star's cost: star/rules.ts.
export const BEAM_COOL = 3;
export const BEAM_BITE = 0.01;
export const BEAM_SHATTER = 2;
export const BEAM_KILL = 3;
/** A shot of `bite` mass on a body of mass `m`: the mass left, 0 when it shatters. */
export const beamLeft = (m: number, bite: number) => (m <= BEAM_SHATTER * bite * (1 + 1e-9) ? 0 : m - bite);
/** A rival's people after a shot that removed `share` of its world. */
export const beamPop = (P: number, share: number) => P * (1 - Math.min(RIVAL_HIT_MAX, BEAM_KILL * share));
/**
 * Unit direction to fire so that the slug's world velocity (shooter v + u · dir) points from the muzzle at the aim point.
 * Falls back to the plain direction when you move faster sideways than the slug can make up.
 */
export function fireDir(dx: number, dy: number, vx: number, vy: number, u: number) {
  const d = Math.hypot(dx, dy) || 1, ex = dx / d, ey = dy / d, ev = ex * vx + ey * vy, disc = ev * ev - (vx * vx + vy * vy) + u * u;
  if (disc < 0) return { x: ex, y: ey };
  const k = ev + Math.sqrt(disc), wx = ex * k - vx, wy = ey * k - vy, w = Math.hypot(wx, wy) || 1;
  return k > 0 ? { x: wx / w, y: wy / w } : { x: ex, y: ey };
}
/** Time for a projectile at speed u (from the origin) to meet a target at offset (px, py) moving at (wx, wy); undefined if never. */
export function intercept(px: number, py: number, wx: number, wy: number, u: number) {
  const a = wx * wx + wy * wy - u * u, b = 2 * (px * wx + py * wy), c = px * px + py * py;
  if (Math.abs(a) < 1e-9) return b < 0 ? -c / b : undefined;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return undefined;
  const t1 = (-b - Math.sqrt(disc)) / (2 * a), t2 = (-b + Math.sqrt(disc)) / (2 * a), t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  return t > 0 ? t : undefined;
}

// ---- Rival civilizations (rivals.ts): only once you host one; they arrive by distance travelled (RIVAL_FIRST view widths,
// then every RIVAL_TRAVEL), at most RIVAL_LOADED near you. Lighter than you and drifting; they hold fire until on screen
// T_SEE s. Level = yours − 1 + its temper's RIVAL_LEAD at first, +1 per LEVEL_UP s, never above yours + 1 (yours = your
// shield level, at least 1): a Raider starts stronger (its extra veil shows it). Mass by temper, never 1.1× you.
// A slug every RIVAL_FIRE s (RIVAL_AIM of them aimed true). Their rock moon (RIVAL_ROCK of their mass) only
// circles their world, a passive guard. Beaten when their people fall to BEATEN: their world lies open.
export const RIVAL_MASS = { careful: [0.5, 0.7], raider: [0.7, 1], hungry: [0.9, 1.08] }; // × your mass: no rival eats you on a touch (1.15×)
export const RIVAL_LEAD = { careful: 0, hungry: 1, raider: 2 };
export const SALVO_LEAD = { careful: 0, hungry: 2, raider: 1 }; // missiles a silo salvo adds by temper: a Careful rival rarely beats you, a Hungry or Raider one can
export const RIVAL_LOADED = 2;
export const RIVAL_FIRST = 3; // view widths travelled after your civilization starts
export const RIVAL_TRAVEL = 8;
export const T_SEE = 6; // s on screen before any enemy may shoot
const LEVEL_UP = 300;
export const RIVAL_FIRE = [4, 6];
export const RIVAL_AIM = 0.45;
export const RIVAL_ROCK = 0.03;
export const BEATEN = 0.2;
// One landed hit kills at most this share of a rival's people: three hits after its shield falls (1 → 0.55 → 0.30 → 0.17).
export const RIVAL_HIT_MAX = 0.45;
export const rivalLevel = (t: number, yours: number, lead = 0) => clamp(Math.max(1, yours) - 1 + lead + Math.floor(t / LEVEL_UP), 1, Math.max(1, yours) + 1);
export const rivalShips = (L: number) => Math.min(4, L + 1);
/** A rival's frigates (L1–4: 0/1/1/2); a lost one is rebuilt for FRIGATE_STOCK wave ships' worth of stock in FRIGATE_S s. */
export const rivalFrigates = (L: number) => [0, 1, 1, 2][clamp(Math.round(L), 1, 4) - 1];
export const FRIGATE_STOCK = 4;
export const FRIGATE_S = 60;
/** Fighters in a rival war wave (its frigates go too). */
export const waveFighters = (L: number) => clamp(Math.round(L), 1, 3);
/** Missiles a silo fires a salvo: yours by tier (1/2/3 from tiers 1/3/5), a rival's by level + its temper's SALVO_LEAD. */
export const salvo = (T: number) => (T >= 5 ? 3 : T >= 3 ? 2 : 1);
export const rivalSalvo = (L: number, lead = 0) => clamp(Math.round(L) + lead, 1, 4);

// ---- Planetary combat (docs/civilizationgameplay.md "Battles"), the same rules both sides. Every weapon hit lands on the
// shield first (shieldShot: no minimum; it takes what it holds down to its floor, then stops mending SHIELD_STUN s). Through
// an open shield, rounds burn BURN_U of stock a hit (≤ BURN_WAVE a raid), never people; heavy fire (lance bolts, missiles)
// fills a wound, and every LANDING K of it lands as one hit (people × 0.8). One raid (a wave, a sortie) kills at most
// RIVAL_HIT_MAX of the people. Weapon fire never sets life back or heats a crust.
// Speeds `u` in the shooter's world radii/s on top of it, `life` s, `k` K a hit; `run`/`cycle`: s per firing cycle (balance).
export const ARMS = {
  round: { k: 0.2, u: 22, life: 0.68, run: 5, hit: 0.75 }, // a fighter's (flight.ts SHOT_V, SHOT_S; FLEET rounds × bursts a run): 15 R reach, slow enough to follow
  probe: { k: 0.15 },
  wave: { range: 8, arc: 0.25, rounds: 3, rate: 6, spread: 0.06 }, // a rival wave fighter's strafing gun (round speed and life)
  lance: { k: 7.5, u: 22, life: 2.7, salvo: 3, reload: 10, glow: 1.5, gap: 0.15, arc: 0.1, spread: 0.01, hull: 3, rivalHull: 2, hit: 0.9 },
  missile: { k: 20, u: 11, life: 3, blast: 0.6, reload: 20, ore: 4, glow: 1.5, fan: 0.08, after: 1, max: 12, boost: 0.22, acc: 8, turn: 0.9, cone: 1.4, burn: 3, blind: 0.15, arc: 0.9, nav: 4, size: 0.12 }, // guided like ROCKET; max: missiles and rockets in flight; size: × a ship's hit radius, for rounds
};
export const BURN_U = 0.2;
export const BURN_WAVE = 20;
export const LANDING = HIT_MIN;
export const STRIKE = 14; // your radii off your surface to a rival's: your fleet engages (from RECALL at the world you order it at)...
export const RECALL = 18; // ...and is recalled past this, on another target, with your shield down (then CALM_S s) or that order cancelled; never for losses
export const CALM_S = 20;
export const RESERVE = 20; // u of ore your silo leaves for slugs
// The siege (ships.ts defend, nav.ts ringStep / siegePost), your radii: the wing flies a ring `ring` past the enemy world's
// surface, never nearer than `clear` to your centre; at most `wing` fighters go, `home` stay to screen missiles with the
// probes; every `pass` s one ring leader (and its wingman) swings `out` further out and strafes the world on its way back in
// (straight from the ring its nose would not come round before it breaks off); ring ships take enemy ships within `foe` of it.
export const SIEGE = { ring: [3, 3.8], clear: 2.5, wing: 5, home: 1, pass: 4, out: 3, foe: 6 };
/** Fighters in the siege wing: all but SIEGE.home, at most SIEGE.wing (recounted every frame). */
export const siegeWing = (fighters: number) => clamp(fighters - SIEGE.home, 0, SIEGE.wing);
/** Your sortie's switch, its calm (s before it may start again), and `by`: only your order brought it on (outside STRIKE). */
export type Sortie = { on: boolean; calm: number; by?: boolean };
/**
 * One frame of your sortie (stage.ts engage) on the hostile world whose surface is `gap` of your radii off yours (Infinity:
 * none): on by itself within STRIKE, from RECALL when you ordered it at that world (`ordered`), with your shield `s` up and no
 * calm; off past RECALL, on another target (`moved`), with your shield down (then CALM_S), or when the order that alone
 * brought it on is cancelled outside STRIKE. Losses never recall it. Says when it changed.
 */
export function sortieStep(st: Sortie, gap: number, ordered: boolean, s: number, moved: boolean, dt: number) {
  st.calm = Math.max(0, st.calm - dt);
  let say: 'engage' | 'recall' | undefined;
  if (st.on && (moved || gap > RECALL || s <= 0 || (st.by && !ordered && gap > STRIKE))) [st.on, st.calm, say] = [false, s <= 0 ? CALM_S : st.calm, 'recall'];
  if (!st.on && !st.calm && s > 0 && gap <= (ordered ? RECALL : STRIKE)) [st.on, st.by, say] = [true, gap > STRIKE, 'engage'];
  return say;
}
export type Arm = 'round' | 'lance' | 'missile';
/** One raid's caps: people never below `floor`; `burnt` u of stock so far. */
export type Raid = { floor: number; burnt: number };
export const raid = (P: number): Raid => ({ floor: P * (1 - RIVAL_HIT_MAX), burnt: 0 });
/**
 * A weapon hit of `k` K on a world: its shield (shieldShot) takes what it holds; what gets through burns stock (rounds:
 * `burn` u) or fills the wound `w` (heavy fire), each LANDING of it one hit on people `P` (`landed`), within `cap`.
 */
export function weaponHit(sh: Shield, w: { k: number }, P: number, arm: Arm, k: number, cap?: Raid) {
  const through = shieldShot(sh, k);
  let burn = 0, landed = 0;
  if (through > 0 && arm === 'round') {
    burn = Math.max(0, Math.min(BURN_U, BURN_WAVE - (cap?.burnt ?? 0)));
    if (cap) cap.burnt += burn;
  } else if (through > 0) {
    w.k += through;
    for (; w.k >= LANDING; w.k -= LANDING, landed++) P = Math.max(cap?.floor ?? 0, popHit(P, LANDING));
  }
  return { P, burn, landed, through };
}
/** Sustained K/s on a shield: `n` hits of `k` K, a share `hit` landing, every `cycle` s. */
export const kps = (k: number, n: number, hit: number, cycle: number) => (k * n * hit) / cycle;
/** Seconds to break a full shield of `level` under fire `f` (K/s each, and the share of its cycle it leaves past the stun, when the shield mends: 0 if never). */
export function ttk(level: number, f: { kps: number; idle: number }[]) {
  const C = SHIELD_K * level, net = f.reduce((a, q) => a + q.kps, 0) - SHIELD_REGEN * C * Math.min(...f.map((q) => q.idle));
  return net > 0 ? C / net : Infinity;
}
/** A rival war wave or your sortie, weighed: fighters + 5 × frigates + 2 × shield level. */
export const strength = (fighters: number, frigates: number, level: number) => fighters + 5 * frigates + 2 * level;

// ---- Pirate fleets: the design is in pirates.ts's header (and docs/gameevents.md); the numbers are here.
export const PIRATE_FIRST = [30, 60]; // s into the run before the first fleet
export const PIRATE_GAP = 40; // mean s between fleets (Poisson)
export const PIRATE_CALM = 60; // s with no attack on you after LIFE or the last attack...
export const PIRATE_MEAN = 180; // ...plus a Poisson gap of this mean
/** 1–14 ships, mostly few (u uniform in [0, 1)): a hauler per 5 (at least one), a marauder from 10, the rest raiders. */
export const fleetSize = (u: number) => {
  const n = 1 + Math.floor(14 * u * u), haulers = Math.max(1, Math.round(n / 5)), marauder = n >= 10 ? 1 : 0;
  return { n, haulers, marauder, raiders: n - haulers - marauder };
};
/** Pirate ship classes: speed × cruise, rounds a hull takes (slugs, the beam and bodies kill outright), gun: range (your radii off the target's surface), arc (rad either side of the nose), bursts of `rounds` at `rate`/s `gap` s apart, aim error (rad), rock hits a round. */
export const PIRATE_CLASS = {
  raider: { speed: 1, hull: 1, gun: { range: 6, arc: 0.25, rounds: 3, rate: 6, gap: 0.9, spread: 0.06, hits: 1 } },
  hauler: { speed: 0.8, hull: 2, gun: undefined },
  marauder: { speed: 0.8, hull: 4, gun: { range: 9, arc: 0.2, rounds: 5, rate: 5, gap: 1.5, spread: 0.04, hits: 3 } },
};
export const PIRATE_SPEED = [4, 5.5]; // cruise, your radii/s
export const FORM_V = 0.8; // × cruise: a formation with a hauler or marauder (raiders catch up at 1.3 ×)
export const FLAG_TURN = 0.8; // rad/s: the formation's lead point (the flag) turns this fast
export const SIGHT = 0.75;
export const THINK = 0.5; // s between decisions...
export const COMMIT = 4; // ...a target kept at least this long
export const STAY = [60, 90]; // s about before they leave anyway
export const BREAK = [0.005, 0.25]; // × your mass: rocks they crack
export const GRAB = [0.001, 0.005]; // × your mass: pieces a hauler takes whole
export const PIECE = 0.0025; // × your mass: a cracked rock's pieces are about this size...
export const KEPT = 0.8; // ...and keep this share of it (the rest is dust)
/** Rounds a rock of `share` of your mass takes before it cracks. */
export const rockHits = (share: number) => clamp(Math.round(3 + 40 * share), 3, 12);
/** Pieces a rock of mass m cracks into (you: your mass). */
export const crackPieces = (m: number, you: number) => clamp(Math.floor((KEPT * m) / (PIECE * you)), 2, 5);
export const HOLD = 100; // u a hauler carries...
export const STEAL = 20; // ...of which stolen stock at most
export const STAND = 3.5; // R past the target's radius: the stand-off point, on the fleet's side
export const GUARD_IN = [0.8, 1.2]; // R round the stand-off point: a guard's circuit...
export const GUARD_OUT = [1.6, 2.2];
export const GUARD_V = 0.6; // ...at this × cruise
export const THREAT = [6, 4, 9]; // R: an enemy ship this close to a hauler, or to the fleet centre, draws 2 raiders until it is this far
export const RETREAT = 0.5; // share of the ships lost: they leave
export const JUMP_S = 14; // s leaving before ships still on screen jump out
export const GONE = 1.3; // camera half-diagonals: a leaving fleet past this is gone
export const CHASE_V = 1.5;
export const LEASH = 1.8;
export const LEASH_S = 3;
export const CHASE_S = 20;
export const RAID_S = [20, 40];
export const LOOT_BACK = 1.5;
export const PIRATE_K = 3; // K a pirate shot takes off a shield: a quarter of a slug's
export const CHIP = 2e-4;
export const CHIP_MAX = 0.02;
// Raiders shoot ships before the target: the nearest within PREY of your radii (your miner shuttles and fighters while an
// attack on you is due, any rival ship); a round that hits one breaks it.
export const PREY = 6;
