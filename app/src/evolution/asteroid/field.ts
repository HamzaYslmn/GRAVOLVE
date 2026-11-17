import { Sprite, type Container, type Texture } from 'pixi.js';
import type { Vec } from '../../core/entity';
import { chunkSet } from '../../core/chunks';
import { between, clamp, hashSeed, logBetween, poissonGap, rng } from '../../core/rng';
import type { Rock } from './atlas';
import { pressure } from '../../core/water';
import { bombardment, SETTLE_V } from '../planet/rules';
import { absorb, asDebris, cluster, drop, gap, heatGlow, hitKelvin, keepShape, mixRgb, phys, resolve, rockBody, shatter, shed, sweep, tickBody, type Body, type Events, type Hit } from './body';
import { makeRival, steerRival, tendMoon } from './rival';
import { live, next, roster, struck, tick, type Entry } from '../rivals/ledger';
import { beltFlow, density, groupDrift, KINDS, kindMix, nearStart, palette, place, rapidsFlow, tintBy, web, type Biome, type Place } from './web';
import type { Spheres } from './sphere';
import { AGE_GOAL, airR, contactTime, BURN_HEAT, BURN_MAX, burnShare, SPECK, EATEN_MARGIN, impactHeat, worldOpts, damage, COMP, G_WORLD, gravitates, pairPull, START_M, pullMass, rank, reachGround, stickSpeed, youPull, V_STICK, radiusOf, START_R, type Element, type Comp } from './rules';

// Asteroid field in world chunks, Minecraft-style: a chunk is generated once from the seed, stored as it is on unload
// (eaten rocks stay eaten) and restored on load. A rock belongs to the chunk it is in; only loaded chunks simulate.
// Touching pairs collide by rules.ts (the player always acts as "you", else the heavier rock); every body has gravity.
// ponytail: stored chunks keep their Pixi objects (~1 KB per rock); serialise to plain data if long runs need it.

const CHUNK = 1200; // world units (~1 screen at zoom 1)
const CANDIDATES = 40; // rock tries per chunk at the start size; density decides how many stay
// Spawn masses are absolute: a power law N(>m) ∝ m^-SLOPE up to M_MAX, from a floor of FLOOR × the start mass that rises
// with your mass^FLOOR_GROW when a chunk is first generated, so a big body still sees small rocks.
const SLOPE = 0.6;
const FLOOR = 0.02; // × the start mass: lighter bodies are specks, not spawned
const FLOOR_GROW = 0.45; // slower than you: the smallest rocks stay a few pixels on screen
const THIN = 0.25; // past M_MAX the belt thins as (you / M_MAX)^-THIN: half as many rocks at 150k, a third at 1M
const DISCOVERY = 0.12; // chance per screen of a swarm, moonlet system or stream (see discover)
const M_MAX = 10 ** 4; // Protoplanet tier: the biggest thing Age I grows on its own
const PROTO = 0.005; // share of spawns that are lone round protoplanets (deep gravity wells)
const PROTO_MASS = [2000, M_MAX];
// Rare encounters above the ceiling, so bigger things stay around at any size; they drift like the rest, never aimed.
const ENCOUNTER = 0.25; // chance per screen
const ENCOUNTER_MASS = [1.5, 6]; // × your mass when the chunk is first generated
// Neighbourhood tail past M_MAX, on top of the belt: N(>q) = TAIL · thin · q^-SLOPE bodies per screen for q = mass/you in
// [max(0.01, M_MAX/you), TAIL_TOP] (empty below you ≈ 8.7k); thin = min(1, (you/550)^-0.34) keeps late tiers from flying by.
const TAIL = 0.43;
const TAIL_TOP = 1.15; // EATEN_MARGIN: nothing in the tail can eat you
const SCREEN_CHUNKS = 0.615; // chunks in a 1280×720 screen at the start zoom (perScreen counts in these)
const SWEEP_SHARE = 0.3; // tier-up harvest: your pull on bodies ≤ this share of you...
const SWEEP_PULL = 5; // ...is this many times harder
const RADIO = 0.03; // share of single rocks that are radioactive (doc: 3%)
const BELT_FLOW = 30; // units/s at the start size: rocks in a belt share one drift along the band
const LOAD_MARGIN = 1; // natural view half sizes kept loaded beyond each screen edge (zoomed out, the margin stays this size)
const MIN_MARGIN = 2; // chunks, at least
const UNLOAD_EXTRA = 0.5; // a chunk unloads only this share of the margin further out
const LOAD_AHEAD = 2; // s of your motion loaded ahead...
const GEN_BUDGET = 16; // new chunks off screen per 1/60 s at most (scaled by the frame's dt): fast flight spreads them over frames
const AHEAD_MAX = 1.5; // ...but at most this many view half sizes
const CALM = 900; // world units around the start where nothing heavier than you spawns
// Meteors: Poisson arrivals (mean METEOR_MEAN s), one in ten (SHOWER) a shower of 2–4. NEAR_SHARE pass through the area around
// you, the rest through a disc WIDE × the view's half-diagonal.
const METEOR_MEAN = 10;
const NEAR_SHARE = 0.12;
const NEAR_AGE1 = 0.2; // Age I
const WIDE = 3;
const SHOWER = 0.1;
// The run's forced first shower in Age I, SHOWER_AT s in: 3–4 meteors of SHOWER_SHARE of you from one side, on lines that
// miss a still you by MISS radii or more, so a parked player is safe and a moving one has to dodge.
const SHOWER_AT = [20, 30];
const SHOWER_SHARE = [0.02, 0.1];
const MISS = 4;
// Meteors are sized from you (at most M_MAX: never planets; Age II METEOR_SHARE_AGE2) and cross the screen in METEOR_CROSS s.
const METEOR_SHARE = [0.01, 0.2];
const METEOR_SHARE_AGE2 = [0.001, 0.01]; // a world: fast things stay small (under BURN_MAX, shooting stars), never a moon-sized hit
const METEOR_CROSS = [0.8, 1.3]; // s to cross the screen width
const METEOR_PILE = 0.25;
const METEOR_BINARY = 0.1;
// World comets: Poisson (mean COMET_MEAN s) on random lines through a disc 1.5× the view, never aimed, at COMET_SPEED of
// your diameters/s, COMET_MASS × you (≥ 3 × the spawn floor). main.ts draws the tails. A comet also heads every stream.
const COMET_MEAN = 75;
const COMET_SPEED = [3, 7];
const COMET_MASS = [0.01, 0.12];
// Between PILE_MASS bodies are often old loose piles, and some of those contact binaries.
const PILE_MASS = [300, 1000];
const PILE = 0.5;
const BINARY = 0.15;
// Region maps are read at (x, y)/S, S = your scale^REGION_GROW when a chunk is generated, so a region spans about as many
// screens at every size. S moves in half-octave steps and only grows, and each chunk keeps its own (field.ts chunkS).
const REGION_GROW = 0.8;
const regionScale = (scale: number) => 2 ** (Math.round(2 * Math.log2(scale ** REGION_GROW)) / 2);
// Rivals (rival.ts): while fewer than RIVALS are loaded, one comes in from off screen every RIVAL_GAP s, none in the
// first RIVAL_CALM s.
const RIVALS = 3;
const RIVAL_GAP = 20;
const RIVAL_CALM = 15;
const RIVAL_MASS = [0.35, 2];
// The run's first rival in Age I hunts you: ≥ 1.25× you (rival.ts MEAL 0.8). It comes from the left or right, the wide
// side of the screen, so it is on screen ≥ 3 s before it can reach a still you.
const FIRST_HUNTER = [1.4, 1.8];
// Past M_MAX rivals are sized from you: most are food that flees (BIG_RIVAL_MASS), one in BIG_HUNTER hunts you, slowly
// (HUNTER_CHASE own diameters/s).
const BIG_RIVAL_MASS = [0.3, 0.9];
const BIG_HUNTER = 0.35;
const HUNTER_MASS = [1.2, 2];
const HUNTER_CHASE = 3;
const RIVAL_CHASE = 7; // a rival chases at most this many of YOUR diameters/s: you can outrun one you see
// Giant collision (Poisson, mean CLASH_MEAN s): two giants drift in from off screen for CLASH_S s (big things drift) and meet
// on screen near its edge, clear of a player holding still. The impact is staged: at contact they hit as hard as CLASH_D
// (rules.ts damage) to shatter both, ~50× the drift (mutual gravity tops out near 1 diameter/s; d ≥ 1 takes ~40).
const CLASH_MEAN = 300;
const CLASH_MASS = [3, 12]; // × your mass, each
const CLASH_D = [1.2, 3];
const CLASH_S = [20, 40];
const SOURCES = 24; // heaviest loaded bodies that pull (plus the player)
const MIN_ACCEL = 0.3; // units/s²: a source's reach ends where its pull drops below this
const SAFE = 160; // world units kept clear around the player's start, so a run can't begin inside a rock
const START_FILL = 1; // density in the start area (web.ts HOME; densest belt = 1)
const PLAIN_FILL = 0.5; // plain Stone Drift keeps this share of the rock; special places and the start keep all
// Biomes (web.ts place), each eased in by its soft strength:
//   - rapids: one strong shared flow along the band (RAPIDS_FLOW start diameters/s at the core, × √scale) and RAPIDS_SCATTER×
//     the usual individual scatter: ride it by matching it, cross it and the hits hurt
//   - meteor belt: denser (fill floored at METEOR_BASE, × METEOR_FILL), more small rocks (METEOR_SLOPE), meteors METEOR_RATE× as often
//   - Kuiper belt: KUIPER_SLOW of the usual motion, more big bodies (KUIPER_SLOPE), world comets KUIPER_COMETS× as often
//   - Frost Reach (ice): world comets ICE_COMETS× as often
const RAPIDS_FLOW = 9;
const RAPIDS_SCATTER = 2;
const METEOR_BASE = 0.4;
const METEOR_FILL = 1.6;
const METEOR_SLOPE = 1;
const METEOR_RATE = 4;
const KUIPER_SLOW = 0.35;
const KUIPER_SLOPE = 0.45;
const KUIPER_COMETS = 3;
const ICE_COMETS = 1.75; // Frost Reach
const KUIPER_RADIO = 0.12; // extra radioactive share of single rocks in a Kuiper belt: the dead star's remains
const GROUP_JITTER = 0.2; // a moving group's members keep this share of the usual individual scatter: they drift as one
const ACCEPT = 0.6; // a candidate rock stays with chance ACCEPT × fill

// Places, read at (x, y)/S and damped outside the web (web.ts):
//   - asteroid fields (FIELD per screen, filaments only): FIELD_BODIES within FIELD_SPAN views around 1–2 cores, one drift
//   - giant asteroids (GIANT per screen): drifting ≤ GIANT_DRIFT own diameters/s, never aimed, with moonlets
//   - great comets (Poisson, GREAT_MEAN s): passing beside you, shedding ice crumbs to follow and harvest
// The start keeps its field: HOME stays full (START_FILL) and the web is forced on around it (web.ts nearStart).
const FIELD = 0.06;
const FIELD_BODIES = [60, 150];
const FIELD_SPAN = [1.5, 3]; // views across
const FIELD_CORE = [0.5, 3]; // × your mass
const GIANT = 0.02;
const GIANT_MASS = [20, 200]; // × your mass
const GIANT_MAX = 0.9e7; // below a brown dwarf: never a star
const GIANT_DRIFT = 0.05;
const GREAT_MEAN = 240;
const GREAT_MASS = [0.5, 3]; // × your mass
const GREAT_SPEED = [1.5, 3]; // your diameters/s
const GREAT_CRUMBS = 40; // ice crumbs a great comet sheds while near you, one every SHED_S
const SHED_S = 0.4;
const VIEW_W = 1280 / 1.02; // world units across a 1280-px screen at the start zoom; the view grows with size^0.8 (player.ts)

// Mineral palettes (web.ts palette): full on rock, faint on metal/ice.
const METAL_GLOW = 0xd6e6ff;
const GAS_MIST = 0xeadfc4;
const RADIO_GREEN = 0x6dff4a;
const PAL_SHOW: Record<Element, number> = { rock: 1, metal: 0, ice: 0.3, gas: 0.6, radio: 0.5 }; // metal keeps its own shine

/** An index into KINDS drawn from `shares`. */
function pickKind(shares: number[], rnd: () => number) {
  let roll = rnd(), k = 0;
  while (k < KINDS.length - 1 && (roll -= shares[k]) >= 0) k++;
  return k;
}

/** Spawn floor for a body of mass m. */
const floorAt = (m: number) => Math.max(FLOOR * START_M * (m / START_M) ** FLOOR_GROW, SPECK * m);

/** A rock that burnt up in your air (or burnt partly: `whole` false): where it met your limb and its direction (unit), for the streak. */
export type Burn = (b: Body, x: number, y: number, ux: number, uy: number, whole: boolean) => void;

export function createAsteroidField(layer: Container, atlas: Rock[], glow: Texture, spheres: Spheres, seed: number, player: Body, onHit: (h: Hit) => void, onBurn: Burn) {
  let rocks: Body[] = [];
  let fresh: Body[] = []; // bodies made this frame (fragments, meteors, rivals...)
  const stored = new Map<string, Body[]>(); // unloaded chunks' rocks
  const generated = new Set<string>();
  const start = { x: player.motion.x, y: player.motion.y };
  const byKind = Object.fromEntries(KINDS.map((k) => [k, atlas.filter((r) => r.kind === k)])) as Record<Element, Rock[]>;
  const keyAt = (x: number, y: number) => `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
  let S = 1; // region scale (REGION_GROW): set when a chunk is generated
  // Each chunk keeps the region scale it was generated at, and lookups there use it, so a biome's name and effects match its
  // rocks. The scale only grows within a run: shrinking back (boil-off, chips) would swap the whole map under you.
  const chunkS = new Map<string, number>();
  let topS = 1;
  /** The cosmic web at a world point read at region scale `s` (web.ts), forced full around the start. */
  const webAt = (x: number, y: number, s = S) => Math.max(web(x / s, y / s, seed), nearStart(x - start.x, y - start.y)[1]);
  /** Near the start (HOME): 1 .. 0. */
  const homeCalm = (x: number, y: number) => nearStart(x - start.x, y - start.y)[0];
  /** The biome at a world point read at region scale `s` (web.ts place); `w` = webAt there if known. */
  const placeAt = (x: number, y: number, s = S, w = webAt(x, y, s)) => place(x / s, y / s, seed, w, homeCalm(x, y));
  const mixAt = (x: number, y: number) => kindMix(placeAt(x, y, sAt(x, y)));
  /** Spawn fill from the density `d` at place `pl`: the start area full, plain belt thinned, a meteor belt crowded (up to 1 / ACCEPT). */
  const fillOf = (calm: number, d: number, pl: Place) => {
    const plain = 1 - Math.max(pl.a, pl.kuiper, pl.rapids, pl.meteors);
    const f = Math.max(START_FILL * calm, d * (1 - (1 - PLAIN_FILL) * plain));
    return f + (Math.min(1 / ACCEPT, Math.max(f, METEOR_BASE) * METEOR_FILL) - f) * pl.meteors;
  };
  const scaleNow = () => (topS = Math.max(topS, regionScale(Math.max(1, player.r / START_R))));
  /** The region scale a point was generated at (today's for a chunk not generated yet). */
  const sAt = (x: number, y: number) => chunkS.get(keyAt(x, y)) ?? scaleNow();
  const add = (b: Body) => {
    layer.addChild(b.view);
    rocks.push(b);
  };
  const store = (b: Body) => {
    layer.removeChild(b.view);
    const e = b.rival?.entry;
    if (b.rival?.moon) [b.rival.moon.held, b.rival.moon] = [false, undefined]; // its guard moon stays behind as a plain body
    if (e) return void ([e.m, e.comp, e.heat, e.diff, e.out] = [b.m, b.comp, b.heat, b.diff ?? e.diff, false], b.view.destroy({ children: true })); // back to the ledger: it lives on off the map
    if (b.meteor) return drop(b); // gone for good: m 0, so nothing (clash, great comets) keeps a ghost
    // A stored sphere frees its baked texture; it is re-baked from the same seed on its way back in.
    const core = b.parts.find((p) => p.core);
    if (core) [core.s.destroy(), (b.parts = b.parts.filter((p) => p !== core))];
    const list = stored.get(b.home!);
    if (list) list.push(b);
    else stored.set(b.home!, [b]);
  };

  /** A rock of mass m at (x, y): a kind from the region mix `shares`, then one of the baked rocks of that kind. */
  function rock(m: number, x: number, y: number, shares: number[], rnd: () => number, comp?: Comp) {
    m = Math.min(GIANT_MAX, m); // every spawn, relative ones too (tail, clash, hunters, giants): never a star
    const k = pickKind(shares, rnd);
    const list = byKind[KINDS[k]].length ? byKind[KINDS[k]] : atlas;
    const r = list[Math.floor(rnd() * list.length)];
    const b = rockBody(comp ? { texture: r.texture, comp } : r, radiusOf(m, comp ?? r.comp), x, y, rnd);
    const pal = palette(x / S, y / S, seed), show = PAL_SHOW[KINDS[k]], p = b.parts[0];
    p.s.tint = p.base = tintBy(p.base, pal, show);
    b.tint = tintBy(b.tint, pal, show);
    if (!comp && KINDS[k] === 'metal') glowBehind(b, METAL_GLOW, 0.7, 2.2); // a cold sheen: metal reads apart from rock even a few px wide
    if (!comp && KINDS[k] === 'gas') glowBehind(b, GAS_MIST, 0.32, 3.4); // a soft mist of escaping volatiles around gas-rich bodies
    return b;
  }
  /** An old merged pile: rocks of mass m split by `sizes` (the first is the core), glued together; `binary`: a contact binary; `comp`: all of that make-up. */
  function heap(m: number, x: number, y: number, shares: number[], sizes: number[], rnd: () => number, binary = false, comp?: Comp) {
    const sum = sizes.reduce((a, v) => a + v, 0), parts = sizes.map((v) => rock((m * v) / sum, x, y, shares, rnd, comp));
    parts[0].binary = binary;
    return cluster(parts[0], parts.slice(1), rnd);
  }

  /**
   * Something besides scattered rock in a chunk. 'any' rolls a swarm (one parent's fragments drifting together), a moonlet
   * system (a body bigger than you with small rocks orbiting it) or a stream (comet debris on one line, the comet at its
   * head); 'field' and 'giant' are places (see FIELD, GIANT). Sizes follow the spawn floor `lo` and you; spacing grows like
   * the view (scale^0.8).
   */
  function discover(cx: number, cy: number, key: string, rnd: () => number, lo: number, you: number, scale: number, place: 'any' | 'field' | 'giant' = 'any') {
    const x0 = (cx + 0.2 + 0.6 * rnd()) * CHUNK, y0 = (cy + 0.2 + 0.6 * rnd()) * CHUNK, spread = scale ** 0.8;
    const span = place === 'field' ? (VIEW_W * spread * between(FIELD_SPAN, rnd)) / 2 : 0; // a field's radius
    if (Math.hypot(x0 - start.x, y0 - start.y) < 2 * CALM + span) return;
    const [bx, by] = beltFlow(x0 / S, y0 / S, seed), a = rnd() * Math.PI * 2, sp = (4 + rnd() * 12) * Math.sqrt(scale), drift = BELT_FLOW * Math.sqrt(scale);
    const pl = placeAt(x0, y0), [rx, ry] = rapidsFlow(x0 / S, y0 / S, seed, pl.rapids), slow = 1 - (1 - KUIPER_SLOW) * pl.kuiper, rapids = RAPIDS_FLOW * 2 * START_R * Math.sqrt(scale);
    const vx = (bx * drift + Math.cos(a) * sp) * slow + rx * rapids, vy = (by * drift + Math.sin(a) * sp) * slow + ry * rapids; // rapids carry these too
    const mix = kindMix(pl);
    const k = pickKind(mix, rnd);
    const one = (kind: number) => KINDS.map((_, i) => (i === kind ? 1 : 0)); // every member of one kind
    const put = (b: Body, ux: number, uy: number) => {
      [b.motion.vx, b.motion.vy, b.home] = [ux, uy, key];
      if (pl.rapids > 0.5) flowing.add(b);
      add(b);
    };
    /** Small rocks on circular orbits around `core` (plain gravity), moving with it at (ux, uy). */
    const moonlets = (core: Body, ux: number, uy: number, n: number) => {
      const dir = rnd() < 0.5 ? 1 : -1;
      for (let i = n; i > 0; i--) {
        const t = rnd() * Math.PI * 2, d = core.r * (2.2 + rnd() * 4), v = Math.sqrt((G_WORLD * core.m) / d) * dir;
        put(rock(Math.max(lo * logBetween([1, 8], rnd), you * logBetween([0.005, 0.03], rnd)), core.motion.x + Math.cos(t) * d, core.motion.y + Math.sin(t) * d, mix, rnd), ux - Math.sin(t) * v, uy + Math.cos(t) * v);
      }
    };
    if (place === 'field') {
      // Mostly of one kind, on one drift, around the cores; the rest follow the power law from a little above the floor to
      // a quarter of you.
      const n = Math.round(between(FIELD_BODIES, rnd)), cores = rnd() < 0.4 ? 2 : 1;
      const shares = KINDS.map((_, i) => 0.6 * (i === k ? 1 : 0) + 0.4 * mix[i]);
      const lo2 = Math.max(2 * lo, 0.002 * you), hi = Math.max(4 * lo2, 0.25 * you), cut = (lo2 / hi) ** SLOPE, jit = 3 * Math.sqrt(scale);
      for (let i = 0; i < n; i++) {
        const core = i < cores, t = rnd() * Math.PI * 2, d = span * (core ? 0.3 * rnd() : rnd() ** 0.7); // denser toward the middle
        const m = core ? you * logBetween(FIELD_CORE, rnd) : lo2 * (1 - rnd() * (1 - cut)) ** (-1 / SLOPE);
        put(rock(m, x0 + Math.cos(t) * d, y0 + Math.sin(t) * d, shares, rnd), vx + (rnd() - 0.5) * jit, vy + (rnd() - 0.5) * jit);
      }
      return;
    }
    if (place === 'giant') {
      // Drifts on its own (no belt flow).
      const core = rock(you * logBetween(GIANT_MASS, rnd), x0, y0, mix, rnd);
      if (core.m < 2 * you || Math.hypot(x0 - start.x, y0 - start.y) < 2 * CALM + 8 * core.r) return void core.view.destroy({ children: true });
      const t = rnd() * Math.PI * 2, v = GIANT_DRIFT * 2 * core.r * rnd();
      put(core, Math.cos(t) * v, Math.sin(t) * v);
      moonlets(core, core.motion.vx, core.motion.vy, 8 + Math.floor(rnd() * 16));
      return;
    }
    const kind = rnd();
    if (kind < 0.45) {
      // Swarm: n fragments of one parent, within R, sharing its motion.
      const n = 12 + Math.floor(rnd() * 28), R = (160 + rnd() * 220) * spread, parent = Math.max(lo * logBetween([4, 60], rnd), you * logBetween([0.05, 0.5], rnd));
      for (let i = 0; i < n; i++) {
        const t = rnd() * Math.PI * 2, d = R * Math.sqrt(rnd());
        put(rock((parent / n) * (0.3 + 1.4 * rnd()), x0 + Math.cos(t) * d, y0 + Math.sin(t) * d, one(k), rnd), vx + (rnd() - 0.5) * 6, vy + (rnd() - 0.5) * 6);
      }
    } else if (kind < 0.75) {
      const M = you * logBetween([1.2, 4], rnd), core = rock(M, x0, y0, mix, rnd);
      put(core, vx, vy);
      moonlets(core, vx, vy, 6 + Math.floor(rnd() * 14));
    } else {
      // Stream: ice debris along one line, all moving along it.
      const n = 10 + Math.floor(rnd() * 20), gapW = (70 + rnd() * 90) * spread, ux = Math.cos(a), uy = Math.sin(a);
      for (let i = 0; i < n; i++) {
        const s = (i - n / 2) * gapW, off = (rnd() - 0.5) * gapW;
        put(rock(Math.max(lo * logBetween([1, 12], rnd), you * logBetween([0.002, 0.02], rnd)), x0 + ux * s - uy * off, y0 + uy * s + ux * off, one(2), rnd), vx + ux * sp, vy + uy * sp);
      }
      // At its head, the comet that shed it, flying on along the line at comet speed.
      const head = rock(Math.max(lo * logBetween([8, 30], rnd), you * logBetween([0.01, 0.05], rnd)), x0 + ux * (n / 2 + 1) * gapW, y0 + uy * (n / 2 + 1) * gapW, one(2), rnd, COMP.icy);
      head.comet = true;
      coma(head);
      const fly = between(COMET_SPEED, rnd) * 2 * START_R * scale;
      put(head, vx + ux * fly, vy + uy * fly);
    }
  }

  /** An additive glow behind a body's parts (not a part: it leaves with the view). */
  function glowBehind(b: Body, tint: number, alpha: number, size: number) {
    const s = new Sprite({ texture: glow, anchor: 0.5, tint, alpha, blendMode: 'add' });
    s.scale.set(((b.r / b.k) * size) / glow.width);
    b.view.addChildAt(s, 0);
  }
  /** A comet's cyan coma; a comet keeps its own look (never baked round: body.ts keepShape). */
  function coma(b: Body) {
    glowBehind(b, 0x9ff0ff, 0.32, 3.5);
    keepShape(b);
  }

  /** A chunk's bodies, from the seed and your size when it is first seen. */
  function generate(cx: number, cy: number, key: string) {
    const rnd = rng(hashSeed(cx, cy, seed + 1));
    const you = Math.max(player.m, START_M), scale = Math.max(1, player.r / START_R);
    S = scaleNow();
    chunkS.set(key, S);
    // Expected bodies in [lo, M_MAX] of the power law, relative to the start's range; the fraction is rounded at random.
    const lo = Math.min(floorAt(you), M_MAX / 2), cut = (lo / M_MAX) ** SLOPE;
    const expect = (CANDIDATES * ((lo / (FLOOR * START_M)) ** -SLOPE) * (1 - cut)) / (1 - ((FLOOR * START_M) / M_MAX) ** SLOPE);
    // Rare events come per screen, not per chunk (a grown view spans ~scale^1.6 chunks), damped outside the web.
    const w = webAt((cx + 0.5) * CHUNK, (cy + 0.5) * CHUNK), rare3 = Math.max(0.3, w);
    const perScreen = 1 / scale ** 1.6, encounter = rnd() < ENCOUNTER * perScreen * rare3;
    const thin = expect * Math.min(1, (you / M_MAX) ** -THIN);
    const belt = Math.max(encounter ? 1 : 0, Math.floor(thin) + (rnd() < thin % 1 ? 1 : 0));
    const qlo = Math.max(0.01, M_MAX / you), qcut = (qlo / TAIL_TOP) ** SLOPE;
    const tail = qlo < TAIL_TOP ? (TAIL * Math.min(1, (you / 550) ** -0.34) * (qlo ** -SLOPE - TAIL_TOP ** -SLOPE) * perScreen * Math.max(0.15, w)) / SCREEN_CHUNKS : 0;
    const tries = belt + Math.floor(tail) + (rnd() < tail % 1 ? 1 : 0);
    for (let i = 0; i < tries; i++) {
      const near = i >= belt; // a tail body: like encounters, it may sit in a void
      const x = (cx + rnd()) * CHUNK, y = (cy + rnd()) * CHUNK;
      const calm = homeCalm(x, y), wx = webAt(x, y), pl = placeAt(x, y, S, wx); // near the start: always a field, plain rock belt
      const fill = fillOf(calm, density(x / S, y / S, seed, wx, pl.kuiper), pl);
      if (!(i === 0 && encounter) && !near && rnd() > ACCEPT * fill) continue;
      const shares = kindMix(pl);
      const a = rnd() * Math.PI * 2, speed = (4 + rnd() * 22) * Math.sqrt(scale);
      const proto = !near && rnd() < PROTO, rare = i === 0 && encounter; // the chunk's encounter is its first try
      const slope = SLOPE + (METEOR_SLOPE - SLOPE) * pl.meteors + (KUIPER_SLOPE - SLOPE) * pl.kuiper, cutAt = (lo / M_MAX) ** slope;
      const m = near ? you * qlo * (1 - rnd() * (1 - qcut)) ** (-1 / SLOPE) : proto ? logBetween(PROTO_MASS, rnd) : rare ? you * logBetween(ENCOUNTER_MASS, rnd)
        : lo * (1 - rnd() * (1 - cutAt)) ** (-1 / slope); // inverse CDF of the power law
      let body: Body;
      const pile = m >= PILE_MASS[0] && m < PILE_MASS[1] ? PILE : clamp(0.2 + 0.15 * Math.log10(m / you), 0.12, 0.5); // the bigger, the likelier an old pile
      if (!proto && rnd() < pile) {
        // An old merged mass: one big core and 1–7 smaller rocks sharing m; or a contact binary, two lobes (radii 1 : 0.7–1).
        const binary = m >= PILE_MASS[0] && m < PILE_MASS[1] && rnd() < BINARY;
        body = heap(m, x, y, shares, binary ? [1, (0.7 + 0.3 * rnd()) ** 3] : Array.from({ length: 2 + Math.floor(rnd() ** 1.3 * 7) }, (_, k) => (k ? 0.2 + rnd() : 1.5 + rnd())), rnd, binary);
      } else if (rnd() < RADIO + KUIPER_RADIO * pl.kuiper) {
        body = rock(m, x, y, shares, rnd, COMP.radioactive);
        for (const p of body.parts) p.s.tint = p.base = mixRgb(p.base, RADIO_GREEN, 0.3, false); // a sickly green cast
        glowBehind(body, RADIO_GREEN, 0.75, 3.6); // a green glow: radioactive reads at a glance
      } else body = rock(m, x, y, shares, rnd);
      if (proto) body.diff = 0.5; // protoplanets melted once: round, with lava plains (sphere.ts)
      const fromStart = Math.hypot(x - start.x, y - start.y);
      if (fromStart < SAFE + body.r || (body.m > you && fromStart < CALM)) {
        body.view.destroy({ children: true });
        continue;
      }
      // Shared drifts (belt flow, rapids, the moving group this spot belongs to) plus the rock's own scatter.
      const [bx, by] = beltFlow(x / S, y / S, seed), [rx, ry] = rapidsFlow(x / S, y / S, seed, pl.rapids), [gx, gy] = groupDrift(x / S, y / S, seed);
      const slow = 1 - (1 - KUIPER_SLOW) * pl.kuiper, root = Math.sqrt(scale), rapids = RAPIDS_FLOW * 2 * START_R;
      const loose = (1 - 0.75 * Math.hypot(bx, by)) * (gx || gy ? GROUP_JITTER : 1) * (1 + (RAPIDS_SCATTER - 1) * pl.rapids) * slow;
      body.motion.vx = (bx * BELT_FLOW * slow + rx * rapids + gx * slow) * root + Math.cos(a) * speed * loose;
      body.motion.vy = (by * BELT_FLOW * slow + ry * rapids + gy * slow) * root + Math.sin(a) * speed * loose;
      body.home = key;
      if (pl.rapids > 0.5) flowing.add(body);
      add(body);
    }
    if (rnd() < DISCOVERY * perScreen * rare3) discover(cx, cy, key, rnd, lo, you, scale);
    if (w > 0.5 && rnd() < FIELD * perScreen) discover(cx, cy, key, rnd, lo, you, scale, 'field'); // fields live on filaments only
    if (rnd() < GIANT * perScreen * rare3) discover(cx, cy, key, rnd, lo, you, scale, 'giant');
  }

  /** A start `dist` from you at angle `from`, headed through a uniform random point of the disc of radius `disc` around you: [x, y, ux, uy]. */
  function enter(from: number, dist: number, disc: number, rnd: () => number) {
    const pm = player.motion, sx = pm.x + Math.cos(from) * dist, sy = pm.y + Math.sin(from) * dist;
    const a = rnd() * Math.PI * 2, through = disc * Math.sqrt(rnd());
    const tx = pm.x + Math.cos(a) * through - sx, ty = pm.y + Math.sin(a) * through - sy, d = Math.hypot(tx, ty) || 1;
    return [sx, sy, tx / d, ty / d];
  }

  const mrnd = rng(seed + 3);
  let nextMeteor = poissonGap(METEOR_MEAN, mrnd), clock = 0, showered = false;
  const showerAt = between(SHOWER_AT, mrnd);
  function meteors(dt: number, halfW: number, halfH: number) {
    // Fewer meteors where there is little to throw them, none aimed near you in a void. Rate × bombardment × local density:
    // Age II max(0.05, density), Age I max(0.05, min(1, 3 × density)) so belts keep the full pace; × METEOR_RATE in a meteor belt.
    const pm = player.motion, fill = fillAt(pm.x, pm.y), age2 = player.m >= AGE_GOAL;
    if (!showered && clock >= showerAt && player.m) {
      showered = true;
      if (!age2) shower(halfW, halfH);
    }
    const rate = (here.biome === 'meteors' ? METEOR_RATE : 1) * Math.max(0.05, age2 ? fill : Math.min(1, 3 * fill));
    if (!player.m || (nextMeteor -= dt * bomb * rate) > 0) return;
    nextMeteor = poissonGap(METEOR_MEAN, mrnd);
    const dist = Math.hypot(halfW, halfH) * 1.3, aimed = fill >= 0.1 ? (age2 ? NEAR_SHARE : NEAR_AGE1) * bomb : 0;
    const from = mrnd() * Math.PI * 2;
    for (let k = mrnd() < SHOWER ? 2 + Math.floor(mrnd() * 3) : 1; k > 0; k--) {
      const speed = (2 * halfW) / between(METEOR_CROSS, mrnd);
      const side = from + (mrnd() - 0.5) * 0.8; // a shower comes from roughly one side
      const [sx, sy, ux, uy] = enter(side, dist, mrnd() < aimed ? 0.6 * Math.min(halfW, halfH) : WIDE * Math.hypot(halfW, halfH), mrnd);
      meteor(sx, sy, ux * speed, uy * speed, Math.min(M_MAX, player.m * logBetween(age2 ? METEOR_SHARE_AGE2 : METEOR_SHARE, mrnd)));
    }
  }
  /** The forced first shower (SHOWER_AT): lines across the screen, each missing a still you by MISS radii up to 0.6 of the short half-view. */
  function shower(halfW: number, halfH: number) {
    const pm = player.motion, dist = Math.hypot(halfW, halfH) * 1.3, from = mrnd() * Math.PI * 2, wide = Math.max(MISS * player.r, 0.6 * Math.min(halfW, halfH));
    for (let k = 3 + Math.floor(mrnd() * 2); k > 0; k--) {
      const speed = (2 * halfW) / between(METEOR_CROSS, mrnd), dir = from + Math.PI + (mrnd() - 0.5) * 0.6, ux = Math.cos(dir), uy = Math.sin(dir);
      const o = (mrnd() < 0.5 ? -1 : 1) * between([MISS * player.r, wide], mrnd), back = dist + speed * k * between([0.15, 0.4], mrnd); // staggered: one after another
      meteor(pm.x - uy * o - ux * back, pm.y + ux * o - uy * back, ux * speed, uy * speed, Math.min(M_MAX, player.m * logBetween(SHOWER_SHARE, mrnd)));
    }
  }
  /** A meteor of mass m at (sx, sy) flying at (vx, vy): of the local region's material, a quarter of them old piles, tumbling. */
  function meteor(sx: number, sy: number, vx: number, vy: number, m: number) {
    const shares = mixAt(sx, sy), roll = mrnd();
    let b: Body;
    if (roll < METEOR_PILE) {
      // An old pile (or a contact binary): rock pieces sharing m.
      const binary = roll < METEOR_BINARY;
      b = heap(m, sx, sy, shares, binary ? [1, (0.7 + 0.3 * mrnd()) ** 3] : Array.from({ length: 2 + Math.floor(mrnd() * 4) }, (_, k) => (k ? 0.25 + mrnd() : 1.5)), mrnd, binary);
    } else b = rock(m, sx, sy, shares, mrnd);
    b.spin = (mrnd() - 0.5) * 2; // tumbling
    [b.motion.vx, b.motion.vy, b.meteor] = [vx, vy, true];
    fresh.push(b);
  }

  // World comets: see COMET_MEAN.
  const krnd = rng(seed + 6);
  let nextComet = poissonGap(COMET_MEAN, krnd);
  function comets(dt: number, halfW: number, halfH: number) {
    if (!player.m || (nextComet -= dt * bomb * (here.biome === 'kuiper' ? KUIPER_COMETS : here.biome === 'ice' ? ICE_COMETS : 1)) > 0) return; // a settled world's sky clears
    nextComet = poissonGap(COMET_MEAN, krnd);
    const reach = Math.hypot(halfW, halfH), [sx, sy, ux, uy] = enter(krnd() * Math.PI * 2, reach * 1.3, 1.5 * reach, krnd); // not aimed at you
    const lo = floorAt(player.m), m = Math.max(3 * lo, player.m * logBetween(COMET_MASS, krnd));
    const b = rock(m, sx, sy, [0, 0, 1, 0], krnd, COMP.icy), speed = between(COMET_SPEED, krnd) * 2 * player.r;
    [b.motion.vx, b.motion.vy] = [ux * speed, uy * speed];
    b.meteor = true; // a passer-by: not kept by chunks
    b.comet = true;
    coma(b);
    fresh.push(b);
  }

  // Great comets (see GREAT_MEAN): a straight pass from off screen whose nearest point to you is 0.5–0.8 view half-diagonals
  // away. The nucleus is a dark atlas rock (passers skip the sphere bake). While near, it sheds ice crumbs that chunks keep.
  const grnd = rng(seed + 8);
  let nextGreat = poissonGap(GREAT_MEAN, grnd);
  const greats: { b: Body; shed: number; left: number }[] = [];
  function greatComets(dt: number, halfW: number, halfH: number) {
    const reach = Math.hypot(halfW, halfH), pm = player.motion;
    for (let i = greats.length - 1; i >= 0; i--) {
      const g = greats[i], b = g.b, far = Math.hypot(b.motion.x - pm.x, b.motion.y - pm.y) > 2 * reach;
      if (!b.m || b.view.destroyed) {
        greats.splice(i, 1);
        continue;
      }
      if (far || g.left <= 0 || (g.shed -= dt) > 0) continue;
      g.shed = SHED_S * (0.6 + 0.8 * grnd());
      g.left--;
      const v = Math.hypot(b.motion.vx, b.motion.vy) || 1, ux = b.motion.vx / v, uy = b.motion.vy / v, j = () => (grnd() - 0.5) * b.r;
      const lo = floorAt(player.m), crumb = rock(Math.max(3 * lo, player.m * logBetween([0.002, 0.01], grnd)), b.motion.x - ux * b.r * 1.3 + j(), b.motion.y - uy * b.r * 1.3 + j(), [0, 0, 1, 0], grnd, COMP.icy);
      crumb.motion.vx = b.motion.vx * (0.75 + 0.15 * grnd()) + j() * 0.3;
      crumb.motion.vy = b.motion.vy * (0.75 + 0.15 * grnd()) + j() * 0.3;
      crumb.home = keyAt(crumb.motion.x, crumb.motion.y);
      fresh.push(crumb);
    }
    if (!player.m || (nextGreat -= dt) > 0) return;
    nextGreat = poissonGap(GREAT_MEAN, grnd);
    // Nearest point to your left or right (±26°), so the pass runs top to bottom across the wide screen.
    const m = player.m * logBetween(GREAT_MASS, grnd), n = (grnd() < 0.5 ? 0 : Math.PI) + (grnd() - 0.5) * 0.9, side = grnd() < 0.5 ? 1 : -1;
    const D = reach * (0.5 + 0.3 * grnd()), L = reach * 1.5; // nearest approach; it starts this far before it along its line
    const px = pm.x + Math.cos(n) * D, py = pm.y + Math.sin(n) * D, ux = -Math.sin(n) * side, uy = Math.cos(n) * side;
    const b = rock(m, px - ux * L, py - uy * L, [0, 0, 1, 0], grnd, COMP.icy);
    for (const p of b.parts) p.s.tint = p.base = mixRgb(p.base, 0x2a2a30, 0.55, false); // a dark crust over the ice
    const speed = between(GREAT_SPEED, grnd) * 2 * player.r;
    [b.motion.vx, b.motion.vy] = [ux * speed, uy * speed];
    b.spin = (grnd() - 0.5) * 0.3;
    // A passer-by (not kept by chunks), out of the field's gravity (held) so its line can't bend into you.
    [b.meteor, b.comet, b.held] = [true, true, true];
    coma(b);
    fresh.push(b);
    greats.push({ b, shed: SHED_S, left: GREAT_CRUMBS });
  }

  /** A body of mass m at (x, y), its kind from the local region (its make-up `comp` if given: a named rival); heavy ones are often old piles. */
  const spawn = (m: number, x: number, y: number, rnd: () => number, comp?: Comp) => heap(m, x, y, mixAt(x, y), Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => (k ? 0.3 + rnd() : 1.5)), rnd, false, comp);

  const rrnd = rng(seed + 4);
  let nextRival = RIVAL_CALM, hunted = false;
  // The run's named rivals (rivals/ledger.ts): each top-up brings the next one from the ledger, with its mass and make-up;
  // wild cores (today's sizes) fill in while all of them are out or gone, and the run's first hunter is always wild.
  const crew = roster(seed, Math.max(player.m, START_M), player.comp);
  let lastOut: Entry | undefined;
  function rivals(dt: number, halfW: number, halfH: number) {
    // The top-up timer runs by distance travelled: full speed from SETTLE_V own diameters/s, stopped while parked.
    const pv = Math.hypot(player.motion.vx, player.motion.vy) / (2 * player.r);
    const first = !hunted && player.m < AGE_GOAL; // the run's first rival (FIRST_HUNTER) comes RIVAL_CALM s in however you move
    if (!player.m || (nextRival -= dt * (first ? 1 : Math.min(1, pv / SETTLE_V))) > 0) return;
    nextRival = RIVAL_GAP;
    if (!first && (rocks.filter((b) => b.rival).length >= RIVALS || rrnd() > Math.max(0.15, webHere()))) return; // few hunters cross a void
    hunted = true;
    // The first hunter starts just past the left or right edge; the rest beyond the screen corner, drifting in toward you.
    const a = first ? (rrnd() < 0.5 ? 0 : Math.PI) + (rrnd() - 0.5) * 0.8 : rrnd() * Math.PI * 2, dist = first ? (1.08 * halfW) / Math.abs(Math.cos(a)) : Math.hypot(halfW, halfH) * 1.15;
    const x = player.motion.x + Math.cos(a) * dist, y = player.motion.y + Math.sin(a) * dist;
    const e = first ? undefined : next(crew, lastOut), big = player.m * RIVAL_MASS[0] > M_MAX;
    const hunter = big && (e ? e.m > EATEN_MARGIN * player.m : rrnd() < BIG_HUNTER);
    const m = e ? e.m : first ? player.m * logBetween(FIRST_HUNTER, rrnd) : big ? player.m * logBetween(hunter ? HUNTER_MASS : BIG_RIVAL_MASS, rrnd) : Math.min(M_MAX, player.m * logBetween(RIVAL_MASS, rrnd));
    const b = makeRival(spawn(m, x, y, rrnd, e && { ...e.comp }), glow, a + Math.PI + (rrnd() - 0.5), hunter ? HUNTER_CHASE : undefined);
    if (e) [b.heat, b.diff, b.rival!.entry, e.out, lastOut] = [e.heat, e.diff, e, true, e];
    b.home = keyAt(x, y);
    fresh.push(b);
  }

  // Giant collision: two giants drifting in on one line from off screen, timed to meet at a point on screen near its edge.
  const crnd = rng(seed + 5);
  let nextClash = poissonGap(CLASH_MEAN, crnd);
  let clash: [Body, Body] | undefined;
  function giants(dt: number, halfW: number, halfH: number) {
    if (!player.m || clash || (nextClash -= dt) > 0) return; // one show at a time: the next waits for this one to land
    nextClash = poissonGap(CLASH_MEAN, crnd);
    const pm = player.motion, side = crnd() * Math.PI * 2, off = 0.85 + 0.1 * crnd(); // share of the way to the screen's edge
    const px = pm.x + Math.cos(side) * off * halfW, py = pm.y + Math.sin(side) * off * halfH; // where they meet: on screen, near its edge
    const dir = side + Math.PI / 2 + (crnd() - 0.5) * 0.8; // across your line of sight, so they pass you by
    // The lighter one is at least half the heavier: it moves faster, and a bigger gap would start it beyond meteor reach.
    const big = player.m * logBetween(CLASH_MASS, crnd);
    if (big > M_MAX) return; // an Age I show: past the ceiling nothing around is big enough
    const a = spawn(big, px, py, crnd), b = spawn(big * (0.5 + 0.5 * crnd()), px, py, crnd);
    // The heavier starts 1.6 half-diagonals off; no net momentum: the wreck stays where they meet.
    const t = between(CLASH_S, crnd), ua = (1.6 * Math.hypot(halfW, halfH)) / t, ub = (ua * a.m) / b.m;
    const cx = Math.cos(dir), cy = Math.sin(dir);
    for (const [g, u, s] of [[a, ua, -1], [b, ub, 1]] as const) {
      g.motion.x = px + cx * s * (u * t + g.r);
      g.motion.y = py + cy * s * (u * t + g.r);
      g.motion.vx = -cx * s * u;
      g.motion.vy = -cy * s * u;
      g.meteor = true; // passers-by: not kept by chunks
      fresh.push(g);
    }
    clash = [a, b];
  }

  /** How full of rock the field is at a world point, 0..1 (the spawn fill at the scale it was generated at). */
  function fillAt(x: number, y: number) {
    const s = sAt(x, y), w = webAt(x, y, s), pl = placeAt(x, y, s, w);
    return Math.min(1, fillOf(homeCalm(x, y), density(x / s, y / s, seed, w, pl.kuiper), pl));
  }
  /** The web where you are now (the backdrop dims in voids: render/background.ts). */
  const webHere = () => webAt(player.motion.x, player.motion.y, sAt(player.motion.x, player.motion.y));
  let here: Place = placeAt(start.x, start.y, 1); // the biome you are in, once a frame

  // Calm: seconds settled (slower than SETTLE_V own diameters/s), reset once you are a full view from where you settled;
  // in Age II it sets the bombardment (planet/rules.ts) that scales meteors, their aim and comets.
  let settled = 0, bomb = 1;
  const anchor = { ...start };
  function calm(dt: number, halfW: number) {
    const pm = player.motion;
    if (Math.hypot(pm.x - anchor.x, pm.y - anchor.y) > 2 * halfW) [settled, anchor.x, anchor.y] = [0, pm.x, pm.y];
    if (Math.hypot(pm.vx, pm.vy) < SETTLE_V * 2 * player.r) settled += dt;
    bomb = player.m >= AGE_GOAL ? bombardment(settled) : 1;
  }

  /**
   * A body touching civilization world `w` (you; a rival world met by another world's moon) past its shell (body.ts sweep), by
   * rules.ts worldOpts: molten or Age I merge by the regimes; a solid Age II world bounces small bodies (they break), a giant impact melts it.
   */
  function hitWorld(w: Body, b: Body) {
    const o = worldOpts(phys(w), phys(b));
    resolve(w, b, events, o);
    if (o.repel && b.m && !b.rival) shatter(b, events);
  }

  /**
   * Atmosphere (rules.ts burnShare), the outermost layer: a body crossing your air's edge (airR, outside the shield shell;
   * Age I: at ≥ the stick speed) and under 4 × the burn-up share of you loses (1 − reachGround) of its mass there, which joins
   * you as dust (no hit) and warms you by BURN_HEAT of what that mass would have delivered. Each body burns once; one born
   * inside the air (debris) or shed by the shell lands unburnt, so nothing burns at the ground.
   */
  function burn(b: Body, dt: number) {
    if (b.burnt || !player.m || b.m >= BURN_MAX * player.m) return; // a moon is not slowed by air
    const pm = player.motion, rvx = b.motion.vx - pm.vx, rvy = b.motion.vy - pm.vy, qx = b.motion.x - pm.x, qy = b.motion.y - pm.y;
    const t = contactTime(qx, qy, rvx * dt, rvy * dt, airR(player.r) + b.r);
    if (t < 0) return; // not crossing the edge this frame
    const sb = burnShare(pressure(player.m, player.comp.gas ?? 0)), s = b.m / player.m, w = Math.hypot(rvx, rvy), vm = stickSpeed(phys(player), phys(b));
    if (s >= 4 * sb || (player.m < AGE_GOAL && w < vm * 2 * player.r)) return; // too big for this air, or slow in Age I: it lands untouched
    b.burnt = true;
    const f = reachGround(s, sb), x = qx - rvx * dt * (1 - t), y = qy - rvy * dt * (1 - t), d = Math.hypot(x, y) || 1, a = airR(player.r) / d;
    player.heat += BURN_HEAT * impactHeat(s * (1 - f), w / (2 * player.r), vm, player.r); // a little warmth, no hit
    absorb(player, b.m * (1 - f), b.comp);
    onBurn(b, pm.x + x * a, pm.y + y * a, rvx / w, rvy / w, f <= 0); // at the air's edge
    if (f <= 0) drop(b);
    else shed(b, b.m * (1 - f));
  }

  const chunks = chunkSet(
    (cx, cy) => {
      const key = `${cx},${cy}`;
      for (const b of stored.get(key) ?? []) if (b.m) add(b); // bodies dropped while stored stay gone
      stored.delete(key);
      if (!generated.has(key)) {
        generated.add(key);
        generate(cx, cy, key);
      }
      return key;
    },
    (key) => {
      stored.set(key, stored.get(key) ?? []); // an emptied chunk stays empty
      leaving.add(key); // their rocks are stored in one pass after the update (update)
    },
  );
  const leaving = new Set<string>();

  // Rapids rocks leaving the loaded area downstream come back in upstream, off screen (unloaded chunks don't move, so
  // the stream would drain): a player standing in the rapids sees it flow on.
  const flowing = new WeakSet<Body>();
  function recycle(b: Body, c: Vec, halfW: number, halfH: number) {
    const m = b.motion, v = Math.hypot(m.vx, m.vy) || 1, ux = m.vx / v, uy = m.vy / v;
    const along = (m.x - c.x) * ux + (m.y - c.y) * uy, side = (m.y - c.y) * ux - (m.x - c.x) * uy;
    if (along <= 0) return false;
    // Just inside the upstream edge, on the same line across the band or nearer the middle of the view.
    for (const inset of [0.2, 0.6]) for (const k of [1, 0.5, 0]) {
      const x = c.x - (along - inset * CHUNK) * ux - side * k * uy, y = c.y - (along - inset * CHUNK) * uy + side * k * ux, key = keyAt(x, y);
      if (Math.abs(x - c.x) < halfW + 2 * b.r && Math.abs(y - c.y) < halfH + 2 * b.r) continue; // never pop in on screen
      const s = sAt(x, y), pl = chunks.live.has(key) ? placeAt(x, y, s) : undefined;
      if (!pl || pl.rapids < 0.5) continue;
      const [fx, fy] = rapidsFlow(x / s, y / s, seed, pl.rapids), f = Math.hypot(fx, fy) || 1;
      [m.x, m.y, m.vx, m.vy, b.home] = [x, y, (fx / f) * v, (fy / f) * v, key]; // on along the band there
      return true;
    }
    return false;
  }

  const drnd = rng(seed + 2); // fragment looks
  /**
   * A new body of mass m joining the field this frame (fragments, rival worlds, loot, rocks): a rock of its main solid element
   * (pieces are solids: never the gas kind); a heavy piece of `from` is jagged debris, else kept rough (body.ts asDebris).
   */
  function addBody(x: number, y: number, vx: number, vy: number, m: number, comp: Comp, from?: Body) {
    const top = KINDS.filter((k) => k !== 'gas').reduce((a, k) => ((comp[k] ?? 0) > (comp[a] ?? 0) ? k : a)), list = byKind[top].length ? byKind[top] : atlas;
    const b = rockBody({ texture: list[Math.floor(drnd() * list.length)].texture, comp }, radiusOf(m, comp), x, y, drnd);
    [b.m, b.motion.vx, b.motion.vy, b.home] = [m, vx, vy, keyAt(x, y)];
    asDebris(b, from, drnd);
    fresh.push(b);
    return b;
  }
  /** A named rival world hit hard enough loses life like you do: the heat delivered to it (its own when it is the actor). */
  const rivalHit = (h: Hit) => {
    for (const w of [h.a, h.b]) {
      const e = w.rival?.entry;
      if (!e || e.life.progress <= 0 || h.kind === 'eat') continue; // a meal is not an attack
      struck(e, hitKelvin(h, w));
    }
  };
  const events: Events = { hit: (h) => void (rivalHit(h), onHit(h)), debris: (x, y, vx, vy, m, comp, from) => void (m >= SPECK * player.m && addBody(x, y, vx, vy, m, comp, from)) }; // specks are just dust

  /**
   * Mutual escape speed in diameters/s of `a` (T: the rules' unit). Rock pairs stick below half of it: they merge
   * only when gravity can hold them, else bounce and chip.
   */
  const escape = (a: Body, b: Body) => Math.sqrt((2 * G_WORLD * (a.m + b.m)) / (a.r + b.r)) / (2 * a.r);

  /**
   * Every body pulls every other: a = G_WORLD · pull mass / d². Only the SOURCES heaviest bodies (and the player) pull; each
   * pulls every body within its range and is pulled back. Two small rocks are skipped: their pull is below MIN_ACCEL anyway.
   */
  let sweepT = 0; // s left of a tier-up sweep
  let sweepOrder: Body[] = [], sweepFrame = 0; // broadphase: last frame's bodies by left edge
  // Scratch per loaded body (index in `all`): its pull mass and its rank among the sources (-1: not a source).
  let pullOf = new Float64Array(512), rankOf = new Int32Array(512);
  function gravity(all: Body[], dt: number) {
    sweepT = Math.max(0, sweepT - dt);
    // The game pull (rules.ts pullMass/youPull) applies to pairs with you, one factor per pair (the stronger one); rock on
    // rock is plain physics, so belts stay loose.
    const n = all.length, you = player.m || START_M;
    if (pullOf.length < n) [pullOf, rankOf] = [new Float64Array(2 * n), new Int32Array(2 * n)];
    let me = -1, rmax = 0, step = 0;
    const gs = sweepFrame + 0.5; // this frame's gravity stamp (the broadphase stamps whole numbers)
    for (let i = 0; i < n; i++) {
      const b = all[i];
      b.gi = i;
      b.gs = gs;
      rmax = Math.max(rmax, b.r);
      step = Math.max(step, Math.abs(b.motion.vx) + Math.abs(b.motion.vy));
      pullOf[i] = b === player && player.m ? ((me = i), youPull(player.m, player.r)) : pullMass(b.m, you); // your pull grows with your size
      rankOf[i] = -1;
    }
    // The SOURCES heaviest, heaviest first: one pass keeping a short sorted list.
    const sources: number[] = [];
    for (let i = 0; i < n; i++) {
      const m = all[i].m;
      if (sources.length === SOURCES && m <= all[sources[SOURCES - 1]].m) continue;
      let k = sources.length < SOURCES ? sources.push(i) - 1 : SOURCES - 1;
      for (; k > 0 && all[sources[k - 1]].m < m; k--) sources[k] = sources[k - 1];
      sources[k] = i;
    }
    if (me >= 0 && !sources.includes(me)) sources.push(me);
    for (let si = 0; si < sources.length; si++) rankOf[sources[si]] = si;
    for (let si = 0; si < sources.length; si++) {
      const i = sources[si], s = all[i], sm = s.motion, ps = pullOf[i], boost = i === me && sweepT > 0;
      const range2 = (G_WORLD * Math.max(ps * (boost ? SWEEP_PULL : 1), s.m)) / MIN_ACCEL; // the harvest boost extends reach too
      // Only bodies whose x is within reach: a window of last frame's broadphase order (sorted by left edge), padded by
      // the biggest radius and two frames of the fastest motion. A body new this frame is not in it yet: one frame late.
      const reach = Math.sqrt(range2), lo = sm.x - reach - rmax - 2 * step * dt, hi = sm.x + reach + 2 * step * dt;
      let a = 0, z = sweepOrder.length;
      while (a < z) { const mid = (a + z) >> 1; if (sweepOrder[mid].left! < lo) a = mid + 1; else z = mid; }
      for (let w = a; w < sweepOrder.length && sweepOrder[w].left! <= hi; w++) {
        const b = sweepOrder[w], j = b.gi!;
        if (b.gs !== gs || j === i || (rankOf[j] >= 0 && rankOf[j] < si)) continue; // gone, itself, or a pair already done
        const dx = b.motion.x - sm.x, dy = b.motion.y - sm.y, d2 = dx * dx + dy * dy;
        if (d2 > range2) continue;
        const d = Math.max(Math.sqrt(d2), s.r + b.r); // no spike inside a contact
        const f = (G_WORLD * dt) / (d * d * d); // × offset × pull mass = Δv toward the other body
        const k = i === me || j === me ? pairPull(ps, s.m, pullOf[j], b.m) : 1; // one factor per pair: momentum kept, the heavier body moves less
        const on = k * s.m * (boost && b.m <= SWEEP_SHARE * you ? SWEEP_PULL : 1), back = k * b.m;
        b.motion.vx -= dx * f * on;
        b.motion.vy -= dy * f * on;
        sm.vx += dx * f * back;
        sm.vy += dy * f * back;
      }
    }
  }


  /**
   * Keep chunks around the view loaded; move every body; resolve contacts. `contacts` runs after this frame's collisions,
   * before the field drops what died. `natural`: your natural view's long half size (world units); zoomed out, what you
   * see grows but the margin around it does not.
   */
  function update(center: Vec, halfW: number, halfH: number, dt: number, contacts: (dt: number) => void, natural: number) {
    const at = (v: number) => Math.floor(v / CHUNK);
    // Loaded area = the view plus a margin (Minecraft's simulation distance), stretched LOAD_AHEAD s along your motion;
    // chunks unload UNLOAD_EXTRA further out, so turning back doesn't make things pop. On-screen chunks always load at once,
    // the rest nearest a point ahead of you first, so fast flight never shows holes.
    // Zoomed out, the view itself is the look-around: the margin shrinks by what the view grew, to one chunk at least.
    const seen = Math.max(halfW, halfH), margin = Math.max(CHUNK, Math.max(MIN_MARGIN * CHUNK, LOAD_MARGIN * Math.min(natural, seen)) - Math.max(0, seen - natural));
    const keep = Math.ceil((UNLOAD_EXTRA * margin) / CHUNK);
    const pv = Math.hypot(player.motion.vx, player.motion.vy) || 1, ahead = Math.min(LOAD_AHEAD * pv, AHEAD_MAX * Math.min(natural, Math.max(halfW, halfH))) / pv;
    const ax = player.motion.vx * ahead, ay = player.motion.vy * ahead;
    chunks.update(at(center.x - halfW - margin + Math.min(0, ax)), at(center.x + halfW + margin + Math.max(0, ax)), at(center.y - halfH - margin + Math.min(0, ay)), at(center.y + halfH + margin + Math.max(0, ay)), keep, GEN_BUDGET * Math.max(1, dt * 60), {
      screen: [at(center.x - halfW), at(center.x + halfW), at(center.y - halfH), at(center.y + halfH)],
      x: (center.x + ax / 2) / CHUNK - 0.5, y: (center.y + ay / 2) / CHUNK - 0.5,
    });
    if (leaving.size) {
      rocks = rocks.filter((b) => !b.home || !leaving.has(b.home) || b.moon || !b.m || (store(b), false)); // the dead are dropped below
      leaving.clear();
    }
    clock += dt;
    here = placeAt(player.motion.x, player.motion.y, sAt(player.motion.x, player.motion.y));
    calm(dt, halfW);
    meteors(dt, halfW, halfH);
    comets(dt, halfW, halfH);
    greatComets(dt, halfW, halfH);
    tick(crew, dt, player.m || START_M);
    rivals(dt, halfW, halfH);
    giants(dt, halfW, halfH);
    const around = player.m ? [player, ...rocks] : rocks;
    gravity(rocks.some((b) => !gravitates(b)) ? around.filter(gravitates) : around, dt); // moons sit on kinematic orbits (planet/moons.ts); held bodies keep their course, bar rival worlds (rules.ts gravitates)
    const swept = rocks.filter((b) => b.moon || b.guard?.r); // moons and worlds with a shield up are swept against every body too (a guard must catch a meteor, a shell meet it)
    for (const b of rocks) {
      if (!b.m) continue; // broken or eaten since the last frame (its view may be gone): dropped below
      if (b.rival) {
        if (player.m) b.rival.chase = Math.min(b.rival.chase, (RIVAL_CHASE * player.r) / b.r);
        steerRival(b, around, player, dt);
        tendMoon(b, around, player, dt);
        const e = b.rival.entry;
        if (e) { // on the map the body owns its numbers; a rival world runs its climate and life here (cooling: tickBody)
          [e.m, e.comp, e.heat, e.diff] = [b.m, b.comp, b.heat, b.diff ?? e.diff];
          live(e, dt, false);
          [b.comp, b.heat] = [e.comp, e.heat];
        }
      }
      // Off screen: not drawn, and its parts are not settled or recoloured.
      const on = Math.abs(b.motion.x - center.x) < halfW + 3 * b.r && Math.abs(b.motion.y - center.y) < halfH + 3 * b.r; // 3r: halos and comas
      tickBody(b, dt, (b.view.visible = on));
      if (!b.meteor) spheres.update(b, dt); // a passer-by is gone in seconds: no sphere bake
      if (on) heatGlow(b);
      if (!b.moon || player.guard?.own?.(b) === false) { burn(b, dt); sweep(player, b, dt); if (b.metShell === player) b.moon = false; } // nothing tunnels through you; a rival's rock meets your shell and leaves its circle
    }
    for (const s of swept) { if (s.guard) sweep(s, player, dt); for (const b of rocks) if (s !== b && !(s.moon && b.moon)) sweep(s, b, dt); } // after every body moved; you meet a rival's shell
    // Broadphase: sort and sweep along x (by left edge; each body is tested only against those whose left edge lies before
    // its right edge), then a y check. Each pair once. The order is kept from the last frame (bodies barely move), so an
    // insertion sort is nearly linear.
    const stamp = ++sweepFrame;
    player.sweep = stamp;
    for (const b of rocks) b.sweep = stamp;
    sweepOrder = sweepOrder.filter((b) => b.sweep === stamp && ((b.sweep = -stamp), true)); // still here; -stamp: already in the order
    if (player.sweep === stamp) sweepOrder.push(player);
    for (const b of rocks) if (b.sweep === stamp) sweepOrder.push(b); // new this frame: inserted below
    for (const b of sweepOrder) b.left = b.motion.x - b.r;
    for (let k = 1; k < sweepOrder.length; k++) {
      const v = sweepOrder[k], lv = v.left!;
      let l = k - 1;
      for (; l >= 0 && sweepOrder[l].left! > lv; l--) sweepOrder[l + 1] = sweepOrder[l];
      sweepOrder[l + 1] = v;
    }
    const touch = (a: Body, b: Body) => { // you, then a shielded world met by a moon, are the actor
      if (b === player || (b.guard && (a.moon || a.metShell === b))) [a, b] = [b, a];
      if (!a.m || !b.m) return;
      const dx = b.motion.x - a.motion.x, dy = b.motion.y - a.motion.y, rr = a.r + b.r;
      if (dx * dx + dy * dy >= rr * rr) return;
      if (a === player) return b.moon && a.guard?.own?.(b) !== false ? undefined : ((b.moon = false), hitWorld(player, b)); // yours never touch you; a rival's rock lands like any body
      if (a.moon && b.moon) return; // moons keep their slots
      if (a.guard && ((b.moon && !a.guard.own?.(b)) || b.metShell === a)) return hitWorld(a, b); // another world's moon (shed loose by its shell too) lands as a body lands on you
      if (a.rival || b.rival || a.moon || b.moon) return a.m >= b.m ? resolve(a, b, events) : resolve(b, a, events); // a moon eats like you do: a guard swallows slow infall
      const ka = rank(phys(a)), kb = rank(phys(b)), [p, q] = ka > kb || (ka === kb && Math.random() < 0.5) ? [a, b] : [b, a], e = escape(p, q); // near-equal masses: the tougher leads (rules.ts rank), exact ties by chance
      resolve(p, q, events, { stick: Math.min(V_STICK, e) / 2, graze: 1, lead: true, rub: dt });
    };
    if (clash) {
      // Until they meet each keeps heading for the other (rocks on the way and gravity would knock it off line); once they
      // overlap, the staged impact (CLASH_D) replaces the drift and lands first, before any rock can touch them at that speed.
      const [a, b] = clash, [p, q] = a.m >= b.m ? clash : [b, a], dx = b.motion.x - a.motion.x, dy = b.motion.y - a.motion.y, d = Math.hypot(dx, dy) || 1;
      const hit = a.m && b.m && d < a.r + b.r ? Math.sqrt(between(CLASH_D, crnd) / damage(phys(p), phys(q), 1 / (2 * p.r))) : 0; // the heavier takes CLASH_D
      if (a.m && b.m) for (const [g, s, o] of [[a, 1, b], [b, -1, a]] as const) {
        const v = hit ? (hit * o.m) / (a.m + b.m) : Math.hypot(g.motion.vx, g.motion.vy); // no net momentum
        [g.motion.vx, g.motion.vy] = [(s * dx * v) / d, (s * dy * v) / d];
      }
      if (hit) touch(a, b);
      if (!a.m || !b.m || hit) clash = undefined;
    }
    for (let k = 0; k < sweepOrder.length; k++) {
      const a = sweepOrder[k], right = a.left! + 2 * a.r;
      for (let l = k + 1; l < sweepOrder.length && sweepOrder[l].left! <= right; l++) {
        const b = sweepOrder[l];
        if (Math.abs(b.motion.y - a.motion.y) <= a.r + b.r) touch(a, b);
      }
    }
    contacts(dt);
    // Rocks rehome to the chunk they're in; one that left the loaded area waits there. Meteors live within a few screens of you.
    const next: Body[] = [], reach2 = (4 * Math.hypot(halfW, halfH)) ** 2;
    for (const b of [...rocks, ...fresh]) {
      if (!b.m && b.rival?.entry) [b.rival.entry.alive, b.rival.entry.out] = [false, false]; // eaten or broken: gone for the run
      if (!b.m && b.rival?.moon) b.rival.moon.held = false; // its guard moon stays behind as a plain body
      if (!b.m) continue;
      // A speck below a pixel (you grew past it), or a body with NaN or infinite numbers (it would "touch" everything): dropped.
      if ((b.m < SPECK * player.m && !b.moon && !b.rival) || !Number.isFinite(b.motion.x + b.motion.y + b.motion.vx + b.motion.vy + b.r + b.m + b.heat)) {
        drop(b);
        continue;
      }
      const hx = Math.floor(b.motion.x / CHUNK), hy = Math.floor(b.motion.y / CHUNK);
      if (hx !== b.hx || hy !== b.hy) [b.hx, b.hy, b.home] = [hx, hy, `${hx},${hy}`]; // a new key only when it changes chunk
      const far = (b.motion.x - player.motion.x) ** 2 + (b.motion.y - player.motion.y) ** 2 > reach2;
      if (!b.moon && (b.meteor ? far : !chunks.live.has(b.home!) && !(flowing.has(b) && recycle(b, center, halfW, halfH)))) store(b); // moons go wherever you go: never stored with a chunk
      else {
        if (!b.view.parent) {
          // New this frame: it missed this frame's tick, so place its view now (else it draws a frame where it was built).
          b.view.position.set(b.motion.x, b.motion.y);
          layer.addChild(b.view);
        }
        next.push(b);
      }
    }
    rocks = next;
    fresh = [];
  }

  /** Every body whose surface is within `range` world units of the player's. */
  const around = (range: number) => rocks.filter((b) => gap(player, b) < range);

  /** Tier-up reward: for `seconds`, you pull small bodies (≤ SWEEP_SHARE of you) SWEEP_PULL× harder. */
  const harvest = (seconds: number) => (sweepT = seconds);

  /** A new body for the field to treat as you (respawn after Age I: the same field, a fresh body). */
  function follow(b: Body) {
    player = b;
    [settled, anchor.x, anchor.y] = [0, b.motion.x, b.motion.y];
  }

  return {
    update, around, harvest, follow, fillAt, webHere, events,
    /** The live bodies (read-only: the field owns the list). */
    get bodies(): readonly Body[] { return rocks; },
    /** The run's named rivals (rivals/ledger.ts), for the HUD. */
    roster: crew as readonly Entry[],
    /** The biome you are in (web.ts place), as of the last update. */
    biomeHere: (): Biome => here.biome,
    /** The biome at any world point, at the scale it was (or would now be) generated at (debug map: ui/minimap.ts). */
    biomeAt: (x: number, y: number): Biome => placeAt(x, y, sAt(x, y)).biome,
    /** A body of mass m joining the field (rival worlds, their rocks, loot, pieces; `from`: the body a piece broke off). */
    spawn: addBody,
    /** Brings the next giant clash now (dev checks; Age I only: past M_MAX nothing is big enough). */
    clash: () => void (nextClash = 0),
  };
}
