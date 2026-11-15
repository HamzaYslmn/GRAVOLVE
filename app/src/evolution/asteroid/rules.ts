// Asteroid collision rules from docs/gamedesign.html ("Çarpışma ve Dönüşüm"), as plain numbers: no Pixi, so they
// also run in Node checks (test/asteroid/rules.test.ts). The game simulates gravity itself, so the doc's analytic fall
// (√(v² + v_esc²)) is already in the measured speed; `fallSpeed` only predicts a hit.
// Departures from the doc: touching a heavier body slowly eats you (no 5 s capture window); durability is a
// weighted geometric mean of phases (weak phases cost more than their share); loose piles are weaker; radii are capped at
// R_CAP (stylised scale: no planet as big as a star), while the doc's sizes grow without limit.
import { clamp, rng, smoothstep } from '../../core/rng.ts';
import { K_PER_HEAT } from '../../core/water.ts';

// Elements: metal, rock (all stony kinds; the doc's carbon is folded in), ice (water), gas, and a trace of
// radioactive heavy elements (rare, heavy: a civilization's fuel).
export type Element = 'metal' | 'rock' | 'ice' | 'gas' | 'radio';
export type Comp = Partial<Record<Element, number>>; // fractions, summing to 1

// C: heat capacity per mass, rock = 1 (specific heats: rock 0.8, metal 0.45, ice 2.1, gas ~1, heavy elements 0.13 J/g·K).
const MAT: Record<Element, { rho: number; D: number; H: number; C: number }> = {
  metal: { rho: 7.8, D: 2.0, H: 0.8, C: 0.56 }, // density, durability, hardness, heat capacity
  rock: { rho: 3.0, D: 1.0, H: 0.5, C: 1 },
  ice: { rho: 0.9, D: 0.4, H: 0.2, C: 2.6 },
  gas: { rho: 0.2, D: 0.1, H: 0, C: 1.3 },
  radio: { rho: 9.0, D: 1.2, H: 0.6, C: 0.16 },
};

export const COMP = {
  dust: { rock: 0.8, metal: 0.1, ice: 0.08, gas: 0.02 }, // the player's start
  metallic: { metal: 0.7, rock: 0.3 },
  ironRich: { metal: 0.45, rock: 0.55 },
  stony: { rock: 0.85, metal: 0.15 },
  darkRock: { rock: 0.85, ice: 0.1, metal: 0.05 },
  enstatite: { rock: 0.8, metal: 0.2 },
  hydrated: { ice: 0.55, rock: 0.4, gas: 0.05 }, // dirty ice: ice-dominant
  icy: { ice: 0.7, rock: 0.15, gas: 0.15 },
  gasRich: { gas: 0.45, ice: 0.35, rock: 0.2 },
  radioactive: { rock: 0.6, metal: 0.15, radio: 0.25 }, // doc: heavy elements 10%+ (a quarter, so eating green rock shows)
} satisfies Record<string, Comp>;

// Shape: small bodies keep their shape by material strength; past a radius their own gravity pulls them round.
// 1 unit ≈ 4 km (Dwarf planet tier = Ceres); real bodies stay potato-shaped up to ~300 km for rock, ~200 km for ice.
const ROUND_R = 75, ICE_ROUND = 25;
export const roundR = (c: Comp) => ROUND_R - ICE_ROUND * (c.ice ?? 0);
/** How round a body is: 0 at half its round-off radius (an irregular "potato") .. 1 round; a molten past (diff) rounds anything. */
export function roundShape(r: number, c: Comp, diff = 0) {
  return Math.max(smoothstep(0.5, 1, r / roundR(c)), smoothstep(0.3, 0.6, diff));
}
/** The drawn roundness: roundShape, less a debris piece's jag (Body.jag: 1 a fresh break, flat-faced .. 0 relaxed). */
export const shapeOf = (r: number, c: Comp, diff = 0, jag = 0) => roundShape(r, c, diff) * (1 - jag);
export const ROUND_M = 10 ** 3.5; // Planetoid (AGE_GOAL): every asteroid tier, icy ones too, stays an irregular atlas rock
/**
 * Does a body bake into a sphere (sphere.ts)? From ROUND_M up, once past half its round-off radius or molten (diff ≥ 0.3);
 * a debris piece (`jag` set) at any radius. A `rough` body (its count of kept parts: a comet, a small fragment, a rock pile
 * you caught; body.ts keepShape) only once molten.
 */
export const bakes = (m: number, r: number, c: Comp, diff = 0, rough = 0, jag?: number) =>
  m >= ROUND_M && (diff >= 0.3 || (!rough && (jag !== undefined || r >= 0.5 * roundR(c))));

// Debris (Body.jag): a heavy piece of a shattered body is jagged, flat break faces on its outline, and rounds over time:
// gravity relaxes it in JAG_S s at its round-off radius (faster bigger, × r/roundR up to 3×; never below half of it), a
// molten piece in JAG_MELT_S s, and a merge rounds it by the meal's share. Drawn in JAG_STEPS steps (sphere.ts).
export const JAG_S = 90, JAG_STEPS = 4;
const JAG_MELT_S = 5;
/** `jag` after `dt` s for a body of radius r, make-up c and heat. */
export function relaxJag(jag: number, r: number, c: Comp, heat: number, dt: number) {
  const k = r / roundR(c), rate = (k >= 0.5 ? Math.min(3, k) / JAG_S : 0) + (heat > MOLTEN ? 1 / JAG_MELT_S : 0);
  return Math.max(0, jag - rate * dt);
}
/** `jag` after the body swallowed a meal that is `share` of the merged mass. */
export const mergeJag = (jag: number, share: number) => jag * (1 - clamp(share, 0, 1));
/** The drawn step of a jag (ceil: any jag left still shows the first step; 0 = round). */
export const jagStage = (jag = 0) => Math.ceil(clamp(jag, 0, 1) * JAG_STEPS) / JAG_STEPS;
/** The n-th body's surface seed, 1..9973: consecutive bodies get far-apart seeds (the bake's noise and faces). */
export const surfaceSeed = (n: number) => 1 + ((n * 6151) % 9973);
/** A piece's break faces: 4–6 half-plane cuts [nx, ny, distance (edge radii)], deeper with more jag; none at jag 0. */
export function breakFaces(seed: number, jag: number): [number, number, number][] {
  if (jag <= 0) return [];
  const rnd = rng(seed), n = 4 + Math.floor(3 * rnd());
  return Array.from({ length: n }, (_, i) => {
    const a = ((i + 0.6 * rnd()) / n) * 2 * Math.PI;
    return [Math.cos(a), Math.sin(a), 1 - jag * (0.15 + 0.4 * rnd())] as [number, number, number];
  });
}
/** Scale that gives the cut outline (unit disc less its faces) the disc's area, so a piece looks as big as its collision circle. */
export function faceFit(faces: [number, number, number][]) {
  if (!faces.length) return 1;
  const N = 64;
  let area = 0;
  for (let j = 0; j < N; j++) {
    const t = ((j + 0.5) / N) * 2 * Math.PI;
    const r = faces.reduce((m, [x, y, d]) => Math.min(m, d / Math.max(Math.cos(t) * x + Math.sin(t) * y, 1e-3)), 1);
    area += (r * r * Math.PI) / N; // ½ r² dθ, dθ = 2π / N
  }
  return Math.sqrt(Math.PI / area);
}
export const START_R = 16; // the player's starting radius, world units: the yardstick for size-relative numbers
export const V_STICK = 8; // below this bodies stick; molten bodies (heat > MOLTEN) stick up to 1.5×
export const MOLTEN = 3;
// Gravity in player units (player diameter = 1, mass = 1); the doc says 0.12 too.
export const G = 0.12;
// Game gravity: a body pulls with its "pull mass" PULL · m · (m / you)^HEAVY, so heavier bodies are wells you feel
// and crumbs barely tug (belts of small rocks don't clump).
const PULL = 2;
const HEAVY = 0.5;
const HEAVY_CAP = 10; // the boost stops growing past 100× your mass: a tiny you must not turn every rock into a black hole
export const pullMass = (m: number, you: number) => PULL * m * Math.min(HEAVY_CAP, (m / you) ** HEAVY);
// Your own pull also grows with size: gravity in your own radii (what the screen shows) depends only on density,
// so a dwarf planet would tug like a pebble. Only your pull on others; big bodies' pull on you is unchanged.
const GROW = 0.5;
export const youPull = (m: number, r: number) => pullMass(m, m) * Math.max(1, r / START_R) ** GROW;
export const GRAZE = 0.4; // share of sliding (tangential) speed that counts toward an impact
export const DEATH_D = 5; // damage ratio at which a body is destroyed outright
export const BURST_KEEP = 0.4; // share of a destroyed body that flies on as fragments (the rest is dust)...
export const BURST_PIECES = 6; // ...in at most this many
/** Mass shares of n unequal pieces, largest first, summing to 1: w_i = (1 + s·(1 − 2i/(n − 1))) / n; largest / smallest = (1 + s) / (1 − s). */
export const pieceShares = (n: number, s: number) => (n <= 1 ? [1] : Array.from({ length: n }, (_, i) => (1 + s * (1 - (2 * i) / (n - 1))) / n));
export const SPREAD = 0.7; // pieceShares spread of impact fragments (largest:smallest 5.7 in mass)
const BURST_JITTER = 0.1; // of the spacing
/** Where a burst's pieces (shares `w`, largest first) start round a body of radius `r`: evenly round a ring at `d`, one random phase, each ±BURST_JITTER of the spacing; `d` clears the two largest neighbours by 5%. */
export function burstRing(w: readonly number[], r: number, rnd = Math.random) {
  const n = w.length, rho = (s: number) => capR(uncapR(r) * Math.cbrt(BURST_KEEP * s)), ph = rnd() * 2 * Math.PI;
  const d = n > 1 ? Math.max(r, (1.05 * (rho(w[0]) + rho(w[1]))) / (2 * Math.sin(((1 - 2 * BURST_JITTER) * Math.PI) / n))) : r;
  return { d, t: w.map((_, i) => ph + ((i + BURST_JITTER * (2 * rnd() - 1)) * 2 * Math.PI) / n) };
}
const Q0 = 40; // fragmentation strength scale
// Heat (doc units: > 1 heated, > 3 molten, > 5 molten metal, > 8 vaporizing; 1 unit = 430 K, core/water.ts).
// Δheat = HEAT_KIN · e + HEAT_FALL · s² · √(r / START_R), e = s · (v / v_m)², s = the other body's share of the pair's
// mass, v = hit speed in your own diameters/s, v_m = stick speed. Slow meals barely warm; the second term is a large
// merger's infall (giant mergers still melt a world).
const HEAT_KIN = 1.5;
const HEAT_FALL = 2;
export const impactHeat = (s: number, v: number, vm: number, r: number) => HEAT_KIN * s * (v / vm) ** 2 + HEAT_FALL * s * s * Math.sqrt(r / START_R);
// Atmosphere shield: a body arriving at ≥ the stick speed (Age II: any speed) lighter than burnShare(p) of you burns up
// in your air (its mass joins you as dust); between that and 4× only reachGround of it lands. Slow arrivals land
// untouched. Only small bodies: nothing from BURN_MAX of you up (a moon) is slowed by air at all.
const BURN = 0.004;
/** Share of a hit's heat that burnt-up mass still gives you: the air spreads it, so it warms you a little. */
export const BURN_HEAT = 0.25;
export const BURN_MAX = 0.01;
export const SPECK = 1e-3; // × your mass: lighter rocks are below a pixel once you are big; none spawn and loaded ones are dropped (field.ts)
export const burnShare = (p: number) => BURN * Math.sqrt(clamp(p, 0, 10));
/** Share of a fast arrival with `s` = its mass / yours that reaches the ground through air that burns up `sb`. */
export const reachGround = (s: number, sb: number) => (sb > 0 ? clamp((s - sb) / (3 * sb), 0, 1) : 1);
// Past vaporizing (doc: heat > 8) more impact energy only makes vapour; without a cap a crumb splashing at speed
// reached heat in the thousands and warmed whatever ate it.
export const MAX_HEAT = 10;
export const COOL = 0.08; // per second at the start radius; bigger bodies cool slower (∝ 1/r)
const PIECE = 0.1; // share of lost solid mass that stays collectable; the rest is dust
const METAL_PIECE = 0.15; // extra collectable share per unit of metal

/** A material property of a composition: the mass-weighted average of its elements. */
const mix = (c: Comp, key: 'rho' | 'H' | 'C') =>
  Object.entries(c).reduce((s, [e, f]) => s + f * MAT[e as Element][key], 0);

/** Heat capacity per mass of a make-up (rock = 1): icy bodies take far more heat to warm, and give more cold. */
export const heatCap = (c: Comp) => mix(c, 'C');
/**
 * Heat after T swallows P, energy conserved: T's thermal energy (capacity × mass × heat, plus the impact's `q`, the heat
 * the hit gives T: impactHeat) and P's own, over the merged capacity. A cold meal cools you; a hot or fast one warms you.
 */
export function mergeHeat(T: Phys, P: Phys, q = 0) {
  const cT = heatCap(T.comp) * T.m, cP = heatCap(P.comp) * P.m;
  return (cT * ((T.heat ?? 0) + q) + cP * (P.heat ?? 0)) / (cT + cP || 1);
}

/** Tiers from the doc: each needs √10 ≈ 3.16× the mass of the one before. */
export const TIERS: [number, string][] = [
  [0, 'Cosmic dust'], [10 ** 0.5, 'Pebble'], [10, 'Meteoroid'], [10 ** 1.5, 'Small asteroid'], [100, 'Medium asteroid'],
  [10 ** 2.5, 'Large asteroid'], [1000, 'Giant asteroid'], [10 ** 3.5, 'Planetoid'], [10 ** 4, 'Protoplanet'],
  [10 ** 4.5, 'Planet'], // world types above it: planet/rules.ts tierName
];
export const tierAt = (m: number) => TIERS.filter(([t]) => m >= t).length - 1; // index into TIERS
export const AGE_GOAL = 10 ** 3.5; // Planetoid: the doc's Age I ends as a planetesimal ("Gezegenimsi cisim")
export const EATEN_MARGIN = 1.15; // a body must outweigh you by this much to swallow you
// Age II: a body ≥ GIANT_HIT of your world is a giant impact (merges and melts it); smaller ones bounce off a solid world.
// worldHeat: heat a hit adds to a world, ∝ q^1.5 × (v / v_stick)², +4000 K at GIANT_HIT for a slow touch.
export const GIANT_HIT = 0.125;
const WORLD_HEAT = 4000 / K_PER_HEAT / GIANT_HIT ** 1.5; // heat units at q = 1
/** Heat (units of 430 K) a hit of mass ratio q (impactor / world) at speed × the stick speed adds to a world. */
export const worldHeat = (q: number, speed: number) => WORLD_HEAT * Math.max(0, q) ** 1.5 * Math.max(1, speed * speed);
/** Collision options for a body touching you (field.ts hitWorld, player.ts predict), by the rules above; a rival world met by your moon uses them too. */
export function worldOpts(you: Phys, b: Phys): CollideOpts {
  if (you.m < AGE_GOAL || b.m >= EATEN_MARGIN * you.m) return { player: true };
  const giant = b.m >= GIANT_HIT * you.m, molten = Math.max(you.heat ?? 0, b.heat ?? 0) > MOLTEN;
  return { player: true, repel: !giant && !molten, world: true };
}

/** Tags from the doc's recipes: an element share that earns a name, and the meal that gets you there. */
export const TAGS: { name: string; el: Element; min: number; feed: Comp }[] = [
  { name: 'Metallic', el: 'metal', min: 0.4, feed: COMP.metallic },
  { name: 'Water-rich', el: 'ice', min: 0.25, feed: COMP.icy },
  { name: 'Gas-rich', el: 'gas', min: 0.2, feed: COMP.gasRich },
];

/** Meals of ~10% your mass, all of `feed`, to lift element share from `b` to `h` (doc formula). */
export const mealsTo = (b: number, feed: number, h: number) => Math.ceil(Math.log((feed - b) / (feed - h)) / Math.log(1.1));

export const density = (c: Comp) => mix(c, 'rho');
// Size cap (stylised scale, docs/stargameplay.md): 1/r³ = 1/r_loose³ + 1/R_CAP³, so no rock, planet or brown dwarf ever
// passes R_CAP (the smallest star is 1.5× it). Small bodies are untouched (2% at 1e5).
export const R_CAP = 500;
export const capR = (r: number) => r / Math.cbrt(1 + (r / R_CAP) ** 3);
export const uncapR = (r: number) => r / Math.cbrt(Math.max(1e-9, 1 - (r / R_CAP) ** 3));
/** Mass of a body of radius r (world units): volume × density, rock = 1. */
export const massOf = (r: number, c: Comp) => ((uncapR(r) / 4) ** 3 * density(c)) / 3;
export const radiusOf = (m: number, c: Comp) => capR(4 * Math.cbrt((m * 3) / density(c)));
export const START_M = massOf(START_R, COMP.dust);
/** G in world units (rules G is in player units: start diameter = 1, start mass = 1). */
export const G_WORLD = (G * (2 * START_R) ** 3) / START_M;
/** In the field's gravity pass: not a moon (kinematic slots), and not held unless it `pulls` (a rival civilization world: its engines steer it, gravity still acts). */
export const gravitates = (b: { moon?: boolean; held?: boolean; pulls?: boolean }) => !b.moon && (!b.held || !!b.pulls);
/** One pull factor per pair with you (field.ts gravity): the stronger game pull per unit mass of the two (pullMass, youPull); rock on rock is 1. */
export const pairPull = (pa: number, ma: number, pb: number, mb: number) => Math.max(pa / (ma || 1), pb / (mb || 1));

/** Composition after merging mass `ma` of `a` with mass `mb` of `b`. */
export function blend(a: Comp, ma: number, b: Comp, mb: number): Comp {
  const out: Comp = {};
  for (const e of Object.keys(MAT) as Element[]) {
    const f = ((a[e] ?? 0) * ma + (b[e] ?? 0) * mb) / (ma + mb);
    if (f > 0) out[e] = f;
  }
  return out;
}

/** Speed (actor diameters/s) gained falling from far away into contact, for mass ratio q = mb/ma (a = you). */
export const fallSpeed = (q: number, contact: number) => Math.sqrt((2 * G * (pullMass(q, 1) + pullMass(1, 1))) / contact);

/** A body as the rules see it. Heat in doc units; rubble 0 (solid) .. 1 (loose pile); r = radius (world units, default from mass). */
export type Phys = { m: number; comp: Comp; heat?: number; rubble?: number; r?: number };

/** Hardness, softened by heat (doc: molten surface −0.2, molten metal −0.4). */
export const hardness = (p: Phys) => Math.max(0, mix(p.comp, 'H') - ((p.heat ?? 0) > 5 ? 0.4 : (p.heat ?? 0) > MOLTEN ? 0.2 : 0));

/** Durability: the weakest phases dominate (weighted geometric mean), then looseness takes its share. */
export function durability(p: Phys) {
  const phases = Math.exp(Object.entries(p.comp).reduce((s, [e, f]) => s + f * Math.log(MAT[e as Element].D), 0));
  return phases * (1 - 0.3 * (p.rubble ?? 0));
}

/**
 * Critical speed, own diameters/s: a head-on hit on a body like itself destroys it (side(): share ½, equal hardness,
 * d = v²/8 / (Q0·durability·m^0.2) = DEATH_D). Tougher and heavier bodies have more.
 */
export const critSpeed = (p: Phys) => Math.sqrt(8 * DEATH_D * Q0 * durability(p) * p.m ** 0.2);
/** Top speed: TOP × the critical speed, so any body can choose to fly at a speed that kills on impact, but not without end. */
export const TOP = 1.2;

/** Damage ratio body `p` takes from `o` at `v` of p's own diameters/s, before any regime (for checks and tuning). */
export const damage = (p: Phys, o: Phys, v: number) => side(p, o, v).d;

const lossFrac = (d: number) => (d < 0.1 ? 0 : d < 1 ? (0.5 * (d - 0.1)) / 0.9 : 1 - 0.5 / d);

/** One body's share of a hit: damage ratio, mass left, where the lost mass went, heat gained. */
export type Side = { d: number; rest: number; pieces: number; dust: number; heat: number };

/** `v`: impact speed in p's OWN diameters/s, so a crumb hitting a planet takes the hit at its own scale and splashes. */
function side(p: Phys, o: Phys, v: number, warhead = 0): Side {
  const { m, comp: c } = p, share = o.m / (m + o.m);
  // Each body takes its centre-of-mass share of the impact, scaled by relative hardness (plus a slug's linear warhead term).
  const q = (0.5 * v * v * share ** 2 + warhead * share) * ((0.5 + hardness(o)) / (0.5 + hardness(p)));
  const d = q / (Q0 * durability(p) * m ** 0.2);
  const loss = lossFrac(d), lost = m * loss;
  const solid = lost * (1 - (c.ice ?? 0) - (c.gas ?? 0)); // ice and gas boil off
  const pieces = solid * (PIECE + METAL_PIECE * (c.metal ?? 0));
  return { d, rest: m - lost, pieces, dust: solid - pieces, heat: impactHeat(share, v, stickSpeed(p, o), p.r ?? radiusOf(m, c)) };
}

/** Speed below which two bodies stick: higher if either is molten (molten is sticky). */
export const stickSpeed = (a: Phys, b: Phys) => ((a.heat ?? 0) > MOLTEN || (b.heat ?? 0) > MOLTEN ? V_STICK * 1.5 : V_STICK);

/**
 * Collision regimes (the doc's "Çarpışma ve Dönüşüm" table). T = the heavier body, P = the lighter.
 * V = full impact speed, v_m = the stick speed in T's diameters, b = sliding / V (sine of the impact angle),
 * b_crit = R_T / (R_T + R_P) (past it the bodies only overlap at the edge):
 *   eat / eaten - V < v_m: T keeps all of P. 'eat' when the actor `a` is T.
 *                 The player is only swallowed by a body ≥ EATEN_MARGIN × its mass and counts as T below that, so a peer always merges into you.
 *   graze       - b > b_crit and V ≥ v_m: hit-and-run, nothing changes hands, both take the graze damage
 *   accrete     - V < 3·v_m and T stays whole (d < 1): T keeps ξ = (3·v_m − V) / (2·v_m) of what is left of P;
 *                 the rest flies off as pieces. The player is never partly accreted.
 *   bounce      - everything else (erosion): both chip; d ≥ 1 shatters, d ≥ DEATH_D destroys. Either side.
 * Each side's damage uses the impact speed in its own diameters (sliding counted at `graze`).
 */
export type Regime = 'eat' | 'eaten' | 'accrete' | 'graze' | 'bounce';
export type CollideOpts = {
  stick?: number; // v_m in T's diameters/s (default stickSpeed); rock pairs pass their escape-based value (field.ts)
  graze?: number; // share of sliding speed that counts toward damage (default GRAZE; rock pairs 1)
  player?: boolean; // `a` is the player: swallowed only past EATEN_MARGIN, never partly accreted
  warhead?: number; // `a` is a mass-driver slug fired by a body of this diameter (world units): see WARHEAD
  repel?: boolean; // nothing changes hands: a would-be merge or accretion is a bounce (a solid world bouncing a small body)
  world?: boolean; // the heavier is your world (Age II): the hit adds worldHeat to it
};
// Mass-driver slugs: the centre-of-mass share² leaves a small fast projectile nearly harmless, so a slug adds a linear
// "warhead" term on its target: q += WARHEAD · s · ½ (u / D)², s = the slug's share of the pair, u = its damage speed,
// D = the shooter's diameter. Tuned so a 1% moon chips at every size (table in test/civilization/rules.test.ts).
const WARHEAD = 0.5;
/** `a` is the actor ("you" in the doc). `closing` / `sliding`: head-on and tangential speed at contact, world units/s. */
export function collide(pa: Phys, pb: Phys, closing: number, sliding = 0, o: CollideOpts = {}) {
  const ra = pa.r ?? radiusOf(pa.m, pa.comp), rb = pb.r ?? radiusOf(pb.m, pb.comp);
  const aT = o.player ? pb.m < EATEN_MARGIN * pa.m : pa.m >= pb.m, rT = aT ? ra : rb, rP = aT ? rb : ra; // the player's margin works both ways
  const V = Math.hypot(closing, sliding), u = Math.hypot(closing, (o.graze ?? GRAZE) * sliding);
  const a = side(pa, pb, u / (2 * ra)), b = side(pb, pa, u / (2 * rb), o.warhead ? WARHEAD * 0.5 * (u / o.warhead) ** 2 : 0);
  const vm = (o.stick ?? stickSpeed(pa, pb)) * 2 * rT; // world units/s
  const sT = aT ? a : b, sP = aT ? b : a;
  let kind: Regime, xi = 0;
  if (V < vm) kind = aT ? 'eat' : 'eaten';
  else if ((V ? sliding / V : 0) > rT / (rT + rP)) kind = 'graze';
  else if (V < 3 * vm && sT.d < 1 && !(o.player && !aT)) kind = 'accrete';
  else kind = 'bounce';
  if (o.repel && kind !== 'graze') kind = 'bounce';
  const mT = aT ? pa.m : pb.m, mP = aT ? pb.m : pa.m;
  if (o.world) sT.heat += worldHeat(mP / mT, V / vm);
  if (kind === 'eat' || kind === 'eaten') {
    for (const s of [a, b]) Object.assign(s, { d: 0, rest: s === a ? pa.m : pb.m, pieces: 0, dust: 0 });
  } else if (kind === 'accrete') {
    xi = (3 * vm - V) / (2 * vm);
    const kept = xi * sP.rest;
    sP.pieces += sP.rest - kept; // what T doesn't keep leaves as whole chunks
    sP.rest = kept;
  }
  return { kind, a, b, xi, t: aT ? ('a' as const) : ('b' as const), v: V / (2 * rT) };
}

/**
 * Swept contact (frame-rate independence): `q` = the other body's offset at the end of the frame, `s` = its step
 * relative to you this frame, `rr` = contact distance. Returns the share of the step (0..1) at which the two first
 * touched, or −1 if they never did, or already touched at the start (the broadphase sees those).
 */
export function contactTime(qx: number, qy: number, sx: number, sy: number, rr: number) {
  const px = qx - sx, py = qy - sy; // offset at the start of the frame
  const c = px * px + py * py - rr * rr, a = sx * sx + sy * sy, h = px * sx + py * sy;
  if (c <= 0 || h >= 0 || !a) return -1; // touching at the start, or not closing
  const disc = h * h - a * c;
  if (disc < 0) return -1;
  const t = (-h - Math.sqrt(disc)) / a;
  return t <= 1 ? t : -1;
}
// A shield shell (civilization/rules.ts shellR): a body crossing it this frame meets it before the ground.
const REBOUND = 1; // a held body's closing speed comes back whole (elastic)
/** Where a body (offset `q`, step `s` this frame of `dt` s, as contactTime) first met a shell at contact distance `rr`: the offset, the outward normal, the closing speed (units/s, > 0). Undefined: no crossing this frame. */
export function shellContact(qx: number, qy: number, sx: number, sy: number, rr: number, dt: number) {
  const t = contactTime(qx, qy, sx, sy, rr);
  if (t < 0 || dt <= 0) return undefined;
  const x = qx - sx * (1 - t), y = qy - sy * (1 - t), nx = x / rr, ny = y / rr;
  return { x, y, nx, ny, vn: -(sx * nx + sy * ny) / dt };
}
/** After the shell stopped share `k` of a body closing at `vn`: [share of its mass kept, new closing speed]. Held (k ≥ 1): all of it, thrown back; else what is left goes on as slow as it is light. */
export const shellPass = (k: number, vn: number): [number, number] => (k >= 1 ? [1, -REBOUND * vn] : [1 - k, (1 - k) * vn]);
/** Does a world's shell meet body `b`? Not rival bodies or worlds; a moon only when the guard names its `own` and this is not one. */
export const shellSees = (b: { moon?: boolean; rival?: unknown; pulls?: boolean }, own?: (b: unknown) => boolean) => !(own ? own(b) : b.moon) && !b.rival && !b.pulls;

// Rival recipe hunger (rival.ts, docs/aliencivilizations.md): a rival wants what a habitable world lacks, on the thresholds
// yours use (planet/rules.ts: water from 10%, a magnetic field from 10% metal, the gas line at 15–20%).
const WATER_NEED = 0.1; // under this water share, icy prey counts up to ×3
const METAL_NEED = 0.1; // under this metal share, metal prey up to ×2
const GAS_AVOID = 0.15; // over this gas share, gas-rich prey down to ×0.2
/** How much a rival made of `c` wants a meal made of `q`, × its mass (1 = only mass counts). */
export function need(c: Comp, q: Comp) {
  let k = 1;
  if ((c.ice ?? 0) < WATER_NEED) k *= 1 + 2 * Math.min(1, (q.ice ?? 0) / 0.5);
  if ((c.metal ?? 0) < METAL_NEED) k *= 1 + Math.min(1, (q.metal ?? 0) / 0.5);
  if ((c.gas ?? 0) > GAS_AVOID) k *= 1 - 0.8 * Math.min(1, (q.gas ?? 0) / 0.3);
  return k;
}
