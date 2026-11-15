import type { Field } from '../../kit';
import type { News } from '../../ui/toast';
import { sfx } from '../../audio/sfx';
import { K_PER_HEAT } from '../../core/water';
import type { Container, Renderer } from 'pixi.js';
import type { Fx } from '../../render/fx';
import { absorb, compTint, drop, shed, type Body, type Hit } from '../asteroid/body';
import { burnShare, pieceShares } from '../asteroid/rules';
import { EXTINCT, GAS_WARN, MOON_SHARE } from '../planet/rules';
import type { Moons } from '../planet/moons';
import { createCivHud } from './hud';
import { assign, BIG, EFFICIENCY, inReach, minerCap, PER_SITE, reach, RESCORE, scores, survey, type Spot } from './mining';
import { clamp } from '../../core/rng';
import {
  AIR_HIGH, AIR_LOW, ASLEEP_FALL, buildOrder, buildSpeed, capacity, cityLevel, cutSpread, deflect, dose, DOSE_SAFE, energy, fedCapacity, FLEET, pieceSize, split, fleetCap, mineMix, MINE_RATE, NEED, P0, popHit, popStep,
  FUEL_LOW, FUEL_RESERVE, fuelBurn, geo, homeDig, reactor, radioDose, radioLimit, refine, ROCKET, solar, solarWings, WORK_E, shellR, SHIELD_K, SHIELD_LEVELS, shieldCost, shieldFed, shieldHolds, shieldMax, shieldMeet, shieldRegen, shieldShot, START_ORE, START_SHIPS, tier, UNIT, units, upkeep,
  ARMS, SIEGE, siegeWing, sortieStep, weaponHit, type Arm, type Raid,
  type Lack, type Ore, type Shield, type ShipClass, type Sortie, type Stocks,
} from './rules';
import { shipR, YOU } from '../../render/tech';
import { bumps } from './crash';
import { siegeRing } from './nav';
import { nearest, type Missiles, type Shots } from './guns';
import { chip, closing, crashes, defend, dropLost, frigateStep, LOOK_S, newFrigate, newRack, newShip, rockets, siloStep, strike, type Foe, type Frigate, type Ship, type Siege } from './ships';
import { slots as fleetSlots, type Power, type Slot, type SlotKey, type Yard } from './slots';
import { createCivView } from './view';
import { chips, CLEARED, status, type Fleet, type Target } from './orders';

// Civilization: made by the planet stage at LIFE, on top of Age II (frame order, planet/stage.ts: moons → climate → life →
// this; hits come through hit() first). It grows and builds by itself (no tech ladder).
//   - Starts with city lights, a level-1 shield and START_SHIPS patrols.
//   - Mining (rules.ts mineMix; mining.ts picks sites every RESCORE s): every held moon, then roaming sites inside the reach
//     (free bodies, open rival worlds; a beaten one comes down whole). Rad ore feeds the fuel stock; metal and water are stock
//     unless your world lacks them; gas only while the air is thin. Nothing to mine: home mines (rules.ts homeDig).
//   - Builds one at a time (rules.ts buildOrder, each class to its fleetCap, then shield levels); reactors burn fuel for what
//     inner heat, solar and Dyson leave; the energy fed scales yards, reloads and mending (rules.ts fuelBurn).
//   - Priority target (`order`): one at a time, the same target clears it; it fires nothing. Each weapon takes it first as it
//     comes free if orders.ts status says it can (`on`): it breaks and cuts (`cut`) or chips (orders.ts chips); a fighting
//     world is the siege. A note says how it stands (`tell`). Nothing fires at rocks without it.
//   - Battles (rules.ts ARMS): within STRIKE of a rival world (RECALL for your priority) the fleet engages (`sortie`, rules.ts
//     sortieStep): the wing rings and strafes, the frigate lances, the silo follows each lance salvo while ore ≥ RESERVE.
//     Recalled past RECALL, on another target, shield down or priority cleared; never for losses. Hits on you: rules.ts weaponHit.
//   - Hits that get through kill people instead of setting life back, except ≥ EXTINCT[1]; the shield ignores what lands under HIT_MIN.
//   - While LIFE is lost: people fall ASLEEP_FALL, nothing is mined or built, the shield goes out.
//   - Star contact (Age III) once the people need CONTACT_NEED of the energy made, or CONTACT_S in.

export type CivState = {
  active: boolean; // LIFE holds (a wipe-out puts the civilization to sleep, people dwindle)
  pop: number; trend: number; cap: number; tier: number; // bn; +1 / −1 / 0; capacity with energy; rules.ts tier
  energy: number; need: number; dose: number; rad: number; harm: number; // E/s, E/s (people + shield upkeep), dose (safe ≤ 1), its part from your radioactive rock, 0..1 over the limit
  level: number; shield: number; shieldMax: number; slots: Record<SlotKey, Slot>; miners: number; ore: number; vol: number; // slots: one per fleet class (slots.ts), miners: shuttle cap
  fuel: number; burn: number; spare: number; // u in stock, u/s burnt, u above what keeps the reactors covering the need
  power: Power; yard?: Yard; // E/s by source and use (hud.ts bars); what the yards build, or the first job waiting
  contact: boolean; city: number; // star contact made (the people need a sun), city-light coverage (sphere.ts)
  light: number; sunA: number; wings: number; // starlight on the solar farms (0..1), bearing to the star, farm fields by tier
};
/** What the planet stage tells the civilization each frame. */
export type CivInput = {
  life: number; rate: number; magnet: number; pressure: number; lack?: Lack; flux?: number; dyson?: number; sun?: number; sunA?: number; foes: Foe[]; // lack: planet/stage.ts; flux, dyson, sun (sunlight), sunA (its bearing): star/stage.ts
  shots: Shots; // the rounds your ships fire (combat.ts ctx.shots)
  sites: { body: Body; site: { ore: number; vol: number }; beaten: boolean }[]; // open rival worlds (combat.rivals.sites())
};
/** What combat lends the civilization for battles (combat.ts): the missile pool and the hostile rival world (`prefer` if it is one, else your HUD target, else the nearest), with how a weapon lands on it. */
export type Arms = { missiles: Missiles; foe: (prefer?: Body) => { body: Body; hit: (arm: Arm, k: number, x: number, y: number, cap?: Raid) => void } | undefined };

const TREND_S = 2; // s over which the population trend is judged
const BUILD_GAP = 0.6; // s between builds (so a ship does not appear the frame the last one launched)
const CONTACT_NEED = 0.8; // share of the energy made that the people need when they look for a sun
const CONTACT_S = 300; // s into the civilization: contact at the latest
const SCATTER = 0.5; // radii of a broken body a second: its pieces spread apart but stay on its course
const LAND_NEWS: Record<Ore, [string, string]> = {
  radio: ['Miners bring fuel', 'Rad ore feeds your reactors'],
  ice: ['Miners bring water', 'Ice from your moons fills the seas'],
  gas: ['Miners bring air', 'Gas from your moons thickens the sky'],
  metal: ['Miners bring iron', 'Metal from your moons strengthens the field'],
};

export function createCivilization(layer: Container, me: Body, renderer: Renderer, fx: Fx, moons: Moons, panel: HTMLElement, news: News, field: () => Field) {
  const view = createCivView(layer, me, renderer, fx);
  const hud = createCivHud(panel);
  const stocks: Stocks = { ore: START_ORE, vol: 0, fuel: 0 };
  const shield: Shield = { level: 1, s: SHIELD_K };
  const ships: Ship[] = Array.from({ length: START_SHIPS }, (_, i) => newShip(me.r, (i * 2 * Math.PI) / START_SHIPS)); // probes and fighters
  const frigates: Frigate[] = [], rack = newRack();
  const mined = new WeakMap<Body, number>(); // a site's mass when its mining began
  const whole = new WeakMap<Body, number>(); // a beaten world's mass when it began to come down
  let spots = new Map<number, Spot>(), crew: (number | undefined)[] = [], scoreT = 0, roam = false, prio: Body | Foe | undefined; // crew: each miner's site id; roam: a body to link with is near (the ring shows); prio: your priority target
  let pop = P0, past = P0, trendT = TREND_S, trend = 1, build: { kind: ShipClass | 'shield'; t: number; prog: number; ore: number; vol: number } | undefined, gap = 0;
  let state: CivState | undefined, active = true, contact = false, age = 0, metal = 0, pressure = 0, gasOn = false, work = [0, 0, 0]; // metal: u your miners brought in (fighter cap); gasOn: miners bring gas (rules.ts AIR_LOW); work: industries drawing WORK_E (yard, mending, rockets)
  let room = 0; // bn of room your colonies add (star/colony.ts)
  // Battles: what combat lends (arm), your fleet's sortie (engage).
  let arms: Arms | undefined, sortie: Siege | undefined;
  const fleetOn: Sortie = { on: false, calm: 0 }; // rules.ts sortieStep
  const wound = { k: 0 }, silo = { load: 0, glow: 0 };
  let seen = { foes: [] as Foe[], sites: [] as CivInput['sites'], sr: 0, zoom: 1, rate: 1 }, told = '', wait = false; // last frame's foes, open worlds, ship radius, zoom, reload rate (energy fed); the last note it waited with; the priority waits (orders.ts)

  /**
   * Your guns break `b` (ships.ts) into at most `cap` pieces you can take (rules.ts split under pieceSize, at its speed;
   * unequal by rules.ts cutSpread, each still under it): they fly on its course, spread SCATTER of its radius a second, and burn up
   * in your air; pieces a cap left unsafe are kicked aside to miss you (rules.ts deflect). The dust joins you if you have air.
   */
  const cut = (b: Body, cap: number) => {
    const sb = burnShare(pressure), st = strike(me, b, sb), e = pieceSize(sb, st.v, st.vs, me.r), c = split(st.share, e, cap), bm = b.motion, f = field(), w = pieceShares(c.n, cutSpread(c.piece, e));
    for (let i = 0; i < c.n; i++) {
      const t = (i / c.n) * 2 * Math.PI + Math.random(), v = SCATTER * b.r * (0.6 + 0.8 * Math.random()), cx = Math.cos(t), cy = Math.sin(t), q = c.n * c.piece * w[i], pm = me.motion;
      const x = bm.x + cx * b.r * 1.5, y = bm.y + cy * b.r * 1.5, vx = bm.vx + cx * v, vy = bm.vy + cy * v, k = q > e ? deflect(x - pm.x, y - pm.y, vx - pm.vx, vy - pm.vy, me.r + b.r) : { x: 0, y: 0 };
      f?.events.debris(x, y, vx + k.x, vy + k.y, q * me.m, b.comp, b); // 1.5 r out: the pieces never touch (they would merge)
    }
    if (sb > 0) absorb(me, c.dust * me.m, b.comp);
    drop(b);
  };
  /** Rockets and frigate lasers: a flash, then the same cut. */
  const blast = (title: string, cap: number) => (b: Body) => {
    fx.flash(b.motion.x, b.motion.y, b.r * 2, 10, b.r * 3);
    fx.burst(b.motion.x, b.motion.y, 16, b.r * 0.3, b.r * 2, b.tint);
    cut(b, cap);
    news(title, title, 'A big rock broke into pieces your air can take');
  };
  const rocketHit = blast('Rocket hit', ROCKET.pieces), frigateHit = blast('Frigate strike', FLEET.frigate.pieces);
  const gain = (ore: number, vol = 0, fuel = 0) => void ([stocks.ore, stocks.vol, stocks.fuel] = [stocks.ore + ore, stocks.vol + vol, stocks.fuel + fuel]);
  const spend = (ore: number, vol = 0) => {
    if (stocks.ore < ore || stocks.vol < vol) return false;
    [stocks.ore, stocks.vol] = [stocks.ore - ore, stocks.vol - vol];
    return true;
  };
  /** Mined elements: radioactive goes to the fuel stock; gas lands on you, so does metal or water your world lacks (no hit, no heat); the rest is stock. */
  const haul = (take: Partial<Record<Ore, number>>, need?: Lack) => {
    for (const e of Object.keys(take) as Ore[]) {
      const dm = take[e]!, u = units(dm, me.m);
      if (dm <= 0) continue;
      if (e === 'radio') stocks.fuel += u;
      else if (e === 'gas' || e === need) absorb(me, dm, { [e]: 1 });
      else if (e === 'metal') [stocks.ore, metal] = [stocks.ore + u, metal + u];
      else stocks.vol += u;
      if (e === 'radio' || e === 'gas' || e === need) news(`land-${e}`, ...LAND_NEWS[e]);
    }
  };
  /** Mines dm (at most half) off a body by rules.ts mineMix over the elements `on`; false when nothing is left to take. */
  const shave = (b: Body, dm: number, on: readonly Ore[], need?: Lack) => {
    const mx = mineMix(b.comp, b.m, Math.min(0.5 * b.m, dm), on);
    if (mx.got <= 0) return false;
    [b.comp, b.tint] = [mx.comp, compTint(mx.comp)];
    shed(b, mx.got);
    haul(mx.take, need);
    return true;
  };
  /** A weapon hit of `k` K (rules.ts weaponHit) at (x, y): shield first; rounds through it burn ore, heavy fire lands on the people, within the raid's `cap`. */
  function struck(arm: Arm, k: number, x: number, y: number, cap?: Raid) {
    if (!active || !me.m) return;
    const s0 = shield.s, r = weaponHit(shield, wound, pop, arm, k, cap);
    if (s0 > 0) view.ripple(x, y);
    if (s0 > 0 && shield.s <= 0) view.breakShield();
    if (r.burn) stocks.ore = Math.max(0, stocks.ore - r.burn);
    if (!r.landed) return;
    pop = r.P;
    view.landing(x, y);
    sfx()?.play('crack', 0.5, 0.6);
    news(`land${Math.floor(newsWindow())}`, 'Under fire', 'Heavy fire lands through the veil · your people die · close in or fly off');
  }
  /** The shell (asteroid/body.ts guard): a body meets it before your ground (rules.ts shieldMeet); `r` set each update, 0 while down. */
  me.guard = { r: 0, meet(b, v, x, y) {
    const s0 = shield.s, st = strike(me, b, burnShare(pressure)), k = active ? shieldMeet(shield, st.kelvin, st.share, v / st.vs) : 0, held = k >= 1;
    if (!k) return 0;
    [view.ripple(x, y), fx.flash(x, y, b.r * 2, 8, b.r * 3), sfx()?.play('shield', held ? 0.8 : 1, held ? 1 : 0.5)];
    if (!held) fx.burst(x, y, 14, b.r * 0.3, b.r * 3, 0xffd9a8); // the stopped share vaporises on the shell
    if (held) news('absorbed', 'Shield holds', 'The veil threw it back');
    else news('overwhelmed', 'Shield broken', `The veil stopped ${Math.round(k * 100)}% of it · the rest lands lighter and slower`);
    if (s0 > 0 && shield.s <= 0) view.breakShield();
    return k;
  } };
  /** Your fleet's sortie on the hostile rival world Arms.foe gives (rules.ts sortieStep), with its siege wing and ring recounted every frame. */
  function engage(dt: number): Siege | undefined {
    const foe = active ? arms?.foe(prio && isBody(prio) && prio.held ? prio : undefined) : undefined, w = foe?.body, d = w ? Math.hypot(w.motion.x - me.motion.x, w.motion.y - me.motion.y) : Infinity;
    const say = sortieStep(fleetOn, (d - me.r - (w?.r ?? 0)) / me.r, !!w && w === prio, shield.s, !!sortie && w !== sortie.world, dt);
    if (say === 'recall') news(`recall${Math.floor(newsWindow())}`, 'Fleet recalled', 'Your ships fall back to guard your world');
    if (say === 'engage') news('engage', 'Your fleet engages', 'Fighters ring their world and strafe it, your frigate lances it, missiles follow · fly off to recall them');
    if (!fleetOn.on || !foe || !w) return (sortie = undefined);
    const cap = { floor: 0, burnt: 0 }; // no people floor: a rival is beaten through its landings
    if (sortie?.world !== w) sortie = { world: w, wing: 0, ring: 0, t: 0, pass: SIEGE.pass, hit: (arm, k, x, y) => foe.hit(arm, k, x, y, cap) };
    [sortie.wing, sortie.ring, sortie.t] = [siegeWing(ships.filter((s) => s.kind === 'fighter').length), siegeRing(w.r, d, me.r), sortie.t + dt];
    return sortie;
  }
  /** Priority `t` for orders.ts status: what it is (a body, a fighting or beaten rival world, an enemy ship or missile) and your fleet: home ships, how soon each weapon can act. */
  const look = (t: Body | Foe): [Target, Fleet] => {
    const pm = me.motion, body = isBody(t), x = body ? t.motion.x : t.x, y = body ? t.motion.y : t.y, d = Math.hypot(x - pm.x, y - pm.y) / me.r;
    const kind = !body ? 'foe' : seen.sites.some((s) => s.body === t && s.beaten) ? 'beaten' : t.held && arms?.foe(t)?.body === t ? 'world' : 'body';
    const home = (k: Ship['kind']) => ships.filter((s) => s.kind === k && !s.ring), eta = (k: Ship['kind']) => Math.min(...home(k).map((s) => (s.target === t || s.foe === t ? 0 : s.mode === 'run' ? Infinity : s.cool)));
    return [{ kind, share: body ? t.m / me.m : 0, free: body && free(t), course: body && closing(me, t, LOOK_S) !== undefined, d: body ? d - t.r / me.r - (kind === 'world' ? 1 : 0) : d },
      { awake: active && me.m > 0, ring: reach(moons.slots), T: tier(pop), ore: stocks.ore, shield: shield.s > 0 && !fleetOn.calm, n: { fighters: home('fighter').length, probes: home('probe').length, frigate: frigates.length },
        eta: { fighters: eta('fighter'), probes: eta('probe'), frigate: Math.min(...frigates.map((f) => (f.aim === t ? 0 : Math.max(0, ARMS.lance.reload - f.load) / seen.rate))), rockets: Math.max(0, ROCKET.reload - rack.load) / seen.rate } }];
  };
  /** A note over `t` (fx.note, at last frame's zoom). */
  const tell = (t: Body | Foe, text: string) => (isBody(t) ? fx.note(t.motion.x, t.motion.y - t.r - 14 / seen.zoom, text, 1 / seen.zoom) : fx.note(t.x, t.y - 14 / seen.zoom, text, 1 / seen.zoom));
  /** Where the silo glows this frame (combat.ts draws it): the surface point and 0–1 of its charge, or undefined. */
  const siloGlow = () => (sortie && silo.glow > 0 ? { a: Math.atan2(sortie.world.motion.y - me.motion.y, sortie.world.motion.x - me.motion.x), k: Math.min(1, silo.glow / ARMS.missile.glow) } : undefined);
  news('civ', 'Civilization', 'A shield and two patrols guard your world · catch moons: miners bring what it lacks');

  return {
    get state() {
      return state;
    },
    stocks,
    ships,
    frigates,
    /** Spends stock if there is enough. */
    spend,
    /** Your shield level (rivals scale with it). */
    get level() {
      return shield.level;
    },
    /** Weapon fire on the shield from outside (slugs, pirate shots): taken while it is up (rules.ts shieldShot; ripple at x, y). `share` unused: weapon fire has no size gate. */
    shieldTake(kelvin: number, _share: number, x: number, y: number) {
      if (!active) return false;
      const s0 = shield.s;
      shieldShot(shield, kelvin);
      if (s0 <= 0) return false;
      view.ripple(x, y);
      if (shield.s <= 0) view.breakShield();
      return true;
    },
    struck,
    /** Combat lends its missiles and the nearest hostile rival world (combat.ts, each frame). */
    arm: (a: Arms) => void (arms = a),
    /** Command on `t` (planet/moons.ts, dev hook civ.order(b)): sets it as your priority target (not ok: a beaten world, a fizzle), the same target again clears it; a note over it says how it stands (orders.ts status). */
    order(t: Body | Foe) {
      const st = t === prio ? { ok: true, note: CLEARED } : status(...look(t));
      if (!st.ok) sfx()?.play('snap', 0.6, 1);
      else if ((prio = t === prio ? undefined : t)) news('ordered', 'Priority target', 'Your ships take it first, each as it comes ready · the same click again clears it');
      tell(t, (told = st.note));
      return st;
    },
    /** The enemy ship or missile nearest world point `p` within max(3 ship radii, `pad`), from last frame (Command picks ships first). */
    foeAt: (p: { x: number; y: number }, pad: number) => nearest(seen.foes, p.x, p.y, Math.max(3 * seen.sr, pad)),
    /** Your priority target, if any (combat.ts draws its mark), and whether it waits with no weapon ready or reloading (a dim mark). */
    get priority() {
      return prio && { t: prio, wait };
    },
    /** Your sortie on a rival world, if your fleet is engaged (test hook). */
    get sortie() {
      return sortie;
    },
    siloGlow,
    /** Dev hook: the silo loaded now. */
    loadSilo() {
      silo.load = ARMS.missile.reload;
    },
    /** Takes up to n u of stock (pirates; ore first): what was taken. */
    steal(n: number) {
      const ore = Math.min(stocks.ore, n), vol = Math.min(stocks.vol, n - ore);
      [stocks.ore, stocks.vol] = [stocks.ore - ore, stocks.vol - vol];
      return { ore, vol };
    },
    /** Adds stock (spoils, loot brought back). */
    gain,
    /** Colonies (star/colony.ts): `add` bn of room for people; `left` bn leave (a colony ship) or die (a lost colony). */
    colonies(add: number, left = 0) {
      room = add;
      pop = Math.max(0, pop - left);
    },
    /** Dev hook: star contact now (debug "Star contact"). */
    contact: () => void (contact = true),
    /** Miner shuttles in flight as foes (combat.ts: enemy rounds can hit them). */
    miners: () => view.shuttles(),
    /**
     * After the field moved (combat.ts contacts): your ships, frigates and shuttles bump into `bodies` (world units; ship
     * radius `sr`): grazes hurt, wrecks lose them (ships.ts crashes, view.ts crashes); `seen` for sparks, `crack` sounds.
     */
    crashes(bodies: Body[], sr: number, dt: number, seen: (x: number, y: number) => boolean, crack: (v: number, pitch: number) => void) {
      const nav = { bodies, sr };
      crashes(ships, me, nav, dt, fx, drop, bumps.you, YOU, me, seen, crack);
      crashes(frigates, me, nav, dt, fx, drop, bumps.you, YOU, me, seen, crack);
      view.crashes(nav, dt, bumps.you, seen, crack);
    },
    /** Each miner's site and the sites of the last re-score (test hook). */
    get mining() {
      return { crew: crew.map((id) => (id === undefined ? undefined : spots.get(id))), spots };
    },
    update(dt: number, real: number, near: Body[], zoom: number, w: CivInput) {
      if (!me.m) return;
      const wasActive = active;
      // Awake while LIFE holds here or on a colony; a wipe-out pauses mining and building until life fills again. People still dwindle to capacity.
      active = w.life >= 0 || room > 0;
      if (active && !wasActive) news('civ-back', 'Civilization recovers', 'The survivors rebuild what they knew');

      // People, energy and dose.
      const share = me.comp.radio ?? 0, rad = radioDose(share, radioLimit(tier(pop))), sol = active ? solar(w.sun ?? 0, tier(pop), me.m) : 0, inner = geo(me.m, me.comp.metal ?? 0) + sol + (w.dyson ?? 0); // inner: energy that burns no fuel
      const E = energy(active ? stocks.fuel : 0, me.m, w.dyson ?? 0, sol, me.comp.metal ?? 0), d = dose(rad, w.magnet, w.pressure, w.flux ?? 0);
      const K = active ? fedCapacity(capacity(w.rate, me.m) + room, Math.max(0, E - upkeep(shield.level))) : 0; // the shield is paid first
      pop = popStep(pop, K, d, dt, active ? undefined : ASLEEP_FALL);
      const need = NEED * pop + upkeep(shield.level) + WORK_E * (work[0] + work[1] + work[2]), fed = clamp(E / Math.max(need, 1e-9), 0, 1), burn = active ? fuelBurn(need, inner, stocks.fuel, me.m) : 0, dug = active ? refine(share, dt) : 0;
      const spare = Math.max(0, stocks.fuel - Math.max(0, FUEL_LOW * (need - inner)) / reactor(FUEL_LOW, me.m)), left = burn > 0 ? spare / burn : Infinity; // fed: yards, reloads, mending; spare: u above what keeps the reactors covering the need; left: s of it at this burn
      stocks.fuel = Math.max(0, stocks.fuel + dug / UNIT - burn * dt);
      if (dug > 0) me.comp = { ...me.comp, radio: share - dug, rock: (me.comp.rock ?? 0) + dug }; // dug-out fuel leaves plain rock
      pressure = w.pressure;
      if ((trendT -= dt) <= 0) [trend, past, trendT] = [pop > past * 1.002 ? 1 : pop < past * 0.998 ? -1 : 0, pop, TREND_S];
      if (d > DOSE_SAFE && (w.flux ?? 0) > rad) news('starrad', 'Rad sickness', 'Starlight burns your people · keep farther from the star');
      else if (d > DOSE_SAFE) news('rad', 'Rad sickness', 'Too much rad rock in your world: people are dying · stop eating the green, your people dig it out');
      if (sol > 0.05 * need) news('solar', 'Solar farms', 'Your people spread collectors over the ground · starlight carries part of the load, strongest near a star');
      if (left < 120) news('fuel-low', 'Fuel runs low', 'Your reactors dim: yards, rockets and the shield slow down · green rocks and moons refuel them');
      // Gas only while the air is thin (rules.ts AIR_LOW / AIR_HIGH), never past the gas line.
      gasOn = (me.comp.gas ?? 0) < GAS_WARN && (w.pressure < AIR_LOW || (gasOn && w.pressure < AIR_HIGH));
      const on: Ore[] = gasOn ? ['radio', 'metal', 'ice', 'gas'] : ['radio', 'metal', 'ice'];
      const T = tier(pop), list = moons.list();
      // The people outgrow their world's energy: they need a sun (the first star's far light shows where).
      if ((age += dt) >= CONTACT_S || need >= CONTACT_NEED * E) contact = true;
      if (contact) news('needsun', 'Your people need a sun', 'Their world no longer feeds them · its far light shows on the horizon');

      // The shield runs on what the people leave; asleep, it goes out.
      shieldRegen(shield, dt, active ? shieldFed(E, shield.level) : 0, fed);
      me.guard!.r = active && shield.s > 0 ? shellR(me.r, shield.level) : 0;
      // Builds, the first one wanted (each class to its cap; a shield level once its volatiles are in), waiting for its ore:
      // a frigate, a fighter, a shield level, a probe.
      const fleet = {} as Record<ShipClass, [number, number]>;
      for (const k of ['frigate', 'fighter', 'probe'] as const) fleet[k] = [k === 'frigate' ? frigates.length : ships.filter((s) => s.kind === k).length, fleetCap(k, T, metal)];
      gap = Math.max(0, gap - dt);
      let queued: Yard | undefined; // the first wanted job, for the HUD
      if (!build && active) {
        const cost = (k: ShipClass | 'shield') => (k === 'shield' ? (shield.level < SHIELD_LEVELS ? shieldCost(shield.level + 1) : undefined) : fleet[k][0] < fleet[k][1] ? { ...FLEET[k], vol: 0 } : undefined);
        const k = buildOrder(frigates.length).find((c) => { const q = cost(c); return !!q && stocks.vol >= q.vol; }), q = k && cost(k); // it waits for ore
        if (q && !gap && stocks.ore >= q.ore) [stocks.ore, stocks.vol, build] = [stocks.ore - q.ore, stocks.vol - q.vol, { kind: k!, t: q.t, prog: 0, ore: q.ore, vol: q.vol }];
        else if (q) queued = { kind: k!, prog: 0, ore: q.ore, vol: q.vol, wait: stocks.ore < q.ore };
      }
      if (build && active && (build.prog += ((buildSpeed(pop, Math.max(K, 1e-6)) * fed) / build.t) * dt) >= 1) {
        const a = Math.random() * Math.PI * 2;
        sfx()?.play(build.kind === 'shield' ? 'shield' : 'launch', 0.6, 1);
        if (build.kind === 'frigate') {
          frigates.push(newFrigate(me.r, a));
          news('frigate', 'Frigate', 'Its heavy lasers break big rocks into pieces you can catch');
        } else if (build.kind !== 'shield') {
          ships.push(newShip(me.r, a, build.kind));
          news(build.kind, build.kind === 'probe' ? 'New probe' : 'New fighter', build.kind === 'probe' ? 'A light laser ship on patrol' : 'Fast, light lasers · built from your moons\' metal');
        } else {
          shield.level++;
          shield.s += SHIELD_K;
          news(`shield${shield.level}`, `Shield level ${shield.level}`, 'Another layer in the veil');
        }
        [build, gap] = [undefined, BUILD_GAP];
      }

      // Mining: every moon, MINE_RATE × tier of its starting mass a second, whatever the shuttles do; a bare moon stays. Then home mines (rules.ts homeDig).
      if (active && dt > 0) for (const m of list) { // a hit-stop frame mines nothing: no false "mined out"
        const b = m.body;
        if (!b.m) continue;
        if (!mined.has(b)) mined.set(b, b.m);
        if (!shave(b, mined.get(b)! * MINE_RATE * T * dt, on, w.lack)) news('minedout', 'Moon mined out', 'Only rock is left · it still guards you, or hold right-click to grind it down');
      }
      if (active) { const h = homeDig(me.comp, T, dt, stocks.vol, w.lack); me.comp = h.comp; gain(h.ore / UNIT, h.vol / UNIT); if (h.ore > 0 && !list.length) news('home', 'Home mines', 'Your people dig their own world for ore · slow: moons and rocks give far more'); }

      // Roaming miners: sites re-scored every RESCORE s; a site that is gone, lost as a moon or out of reach (a link to a
      // big body holds to LINK_HOLD ×) frees its miners at once.
      const slots = moons.slots, rch = reach(slots);
      if ((scoreT -= dt) <= 0) {
        const sv = survey(me, near, list, w.foes, w.sites, rch, on, mined, crew), fleetShort = Object.values(fleet).some(([n, c]) => n < c);
        [spots, scoreT, roam] = [sv.out, RESCORE, sv.sites.some((s) => s.kind !== 'moon' && s.share >= BIG)];
        if (!prio && near.some((b) => !b.held && closing(me, b, LOOK_S) !== undefined)) news('order-tip', 'Priority target', 'Right-click a rock inside the gold ring (E, or a long press): your ships take it first and break it');
        // Other sites first (a moon is mined whatever its shuttles do); idle miners then go to the moons.
        const sc = scores(sv.sites, { lack: w.lack, fleetShort, energyShort: stocks.fuel < FUEL_RESERVE }, slots), prev = Array.from({ length: minerCap(metal) }, (_, k) => crew[k]);
        const only = (moon: boolean) => new Map([...sc].map(([id, v]) => [id, (spots.get(id)!.kind === 'moon') === moon ? v : 0]));
        crew = assign(prev, only(false));
        const idle = crew.flatMap((id, k) => (id === undefined ? [k] : []));
        assign(idle.map((k) => prev[k]), only(true)).forEach((id, j) => (crew[idle[j]] = id));
      }
      for (let k = 0; k < crew.length; k++) {
        const sp = crew[k] === undefined ? undefined : spots.get(crew[k]!), b = sp?.b;
        if (!sp || !b?.m || (sp.kind === 'moon') !== !!b.moon) {
          crew[k] = undefined;
          continue;
        }
        const d = (Math.hypot(b.motion.x - me.motion.x, b.motion.y - me.motion.y) - b.r) / me.r;
        if (!inReach({ id: 0, d, share: b.m / me.m, comp: b.comp, kind: sp.kind, danger: 0, linked: true }, slots)) crew[k] = undefined;
        else if (b.m >= BIG * me.m) news('link', 'Mining link', 'Your miners work a world too big to hold · stay inside the gold ring or they leave it');
      }
      // Any other site gives EFFICIENCY × a moon's rate for each shuttle that has reached it (PER_SITE make a full crew).
      if (active) for (const id of new Set(crew)) {
        const sp = id === undefined ? undefined : spots.get(id), n = sp && sp.kind !== 'moon' ? view.working(sp.b) : 0;
        if (!sp || !n || !sp.b.m) continue;
        const dm = (EFFICIENCY[sp.kind] * MINE_RATE * T * sp.m0 * n * dt) / PER_SITE, st = sp.site;
        news('roam', 'Miners roam', 'They work rocks and worlds inside your ring, nearest and richest first');
        if (!st) {
          shave(sp.b, dm, on, w.lack);
          continue;
        }
        // An open world: its reserves pay out as stock; once beaten its mass comes down onto you too, in its own mix
        // (rock and all), at the same rate of its whole mass; under the smallest moon's mass it is gone.
        const all = st.ore + st.vol, u = Math.min(all, dm / (UNIT * me.m));
        if (u > 0) {
          gain((u * st.ore) / all, (u * st.vol) / all);
          [st.ore, st.vol] = [st.ore - (u * st.ore) / all, st.vol - (u * st.vol) / all];
        }
        if (!sp.beaten) continue;
        if (!whole.has(sp.b)) whole.set(sp.b, sp.b.m);
        const b = sp.b, take = Math.min(b.m, (EFFICIENCY.defeated * MINE_RATE * T * whole.get(b)! * n * dt) / PER_SITE);
        absorb(me, take, b.comp);
        news('consume', 'Consuming a beaten world', 'Your miners bring it down piece by piece · stay near it');
        if (b.m - take < MOON_SHARE[0] * me.m) drop(b);
        else shed(b, take);
      }

      // Defence ships: your priority ends once its target is gone or beaten; each weapon takes it first while orders.ts `on` says so.
      const nav = { bodies: near, sr: shipR(me.r, zoom) };
      seen = { foes: w.foes, sites: w.sites, sr: nav.sr, zoom, rate: fed };
      if (prio && (isBody(prio) ? !prio.m || !near.includes(prio) : !w.foes.includes(prio))) prio = undefined;
      const st = prio && status(...look(prio)), use = st?.on, siege = engage(dt);
      if (st && !st.ok) prio = undefined;
      else if ((wait = !!st?.wait) && st!.note !== told) tell(prio!, (told = st!.note)); // a new reason it waits: the note once more
      defend(ships, me, near, dt, (share, v) => shieldHolds(shield, share, v), fx, drop, w.foes, w.shots, nav, { at: cut, prio: use?.fighters || use?.probes ? prio : undefined, probes: use?.probes }, siege);
      dropLost(ships, me, fx, 10, 0.6, YOU);
      // The frigates' heavy lasers, the silo and your surface rockets reload × the energy fed; each working industry draws WORK_E next frame.
      dropLost(frigates, me, fx, 14, 0.7, YOU);
      if (active) frigates.forEach((f, i) => frigateStep(f, me, use?.frigate ? (prio as Body) : undefined, dt, fed, frigateHit, w.shots, nav, siege, frigates.length > 1 ? (i ? 0.5 : -0.5) : 0));
      if (active) siloStep(silo, me, siege, arms?.missiles, stocks, frigates, dt, fed, T, (b) => b === me || moons.list().some((m) => m.body === b), fx);
      if (active) rockets(rack, me, use?.rockets ? prio : undefined, dt, T, fed, () => spend(ROCKET.ore), (b, x, y) => (chips(b.m / me.m, free(b)) ? chip(b, me.m, x, y, field()?.events, fx) : rocketHit(b)), arms?.missiles, () => seen.foes, fx);
      work = [+!!build, +(active && shield.s < shieldMax(shield)), +!!use?.rockets];

      state = {
        active, pop, trend, cap: K, tier: T, energy: E, need, dose: d, rad, harm: clamp(d - DOSE_SAFE, 0, 1),
        level: shield.level, shield: shield.s, shieldMax: shieldMax(shield), slots: fleetSlots(fleet, ships, frigates, rack.load, stocks.ore, active ? st?.by : undefined, silo.load, T), miners: minerCap(metal),
        ore: stocks.ore, vol: stocks.vol, contact, city: cityLevel(pop), fuel: stocks.fuel, burn, spare, yard: build ? { ...build, wait: false } : queued,
        power: { geo: geo(me.m, me.comp.metal ?? 0), solar: sol, dyson: w.dyson ?? 0, fuel: Math.min(Math.max(0, need - inner), E - inner), people: NEED * pop, shield: upkeep(shield.level), yard: WORK_E * work[0], mend: WORK_E * work[1], rockets: WORK_E * work[2] }, light: clamp(w.sun ?? 0, 0, 1), sunA: w.sunA ?? 0, wings: solarWings(T),
      };
      const targets = crew.flatMap((id) => (id === undefined ? [] : [spots.get(id)!.b]));
      view.update(dt, zoom, state, list, { targets, reach: rch * me.r, hint: roam }, ships, frigates, nav);
      hud.update(real, state);
    },
    /**
     * A hit on you (before the life rules; the shell already took its share: me.guard). Returns true when the civilization
     * handled it: it killed people instead of setting life back. False: life rules apply (gentle meals, a sleeping
     * civilization, or a sterilizing ≥ 150 K impact).
     */
    hit(h: Hit) {
      if (!me.m || !active) return false;
      const kelvin = h.heat * K_PER_HEAT;
      const before = pop;
      pop = popHit(pop, kelvin);
      if (kelvin >= EXTINCT[1]) return false;
      if (pop < before) news(`hit${Math.floor(newsWindow())}`, 'Impact', `${Math.round((1 - pop / before) * 100)}% of the people died`);
      return true;
    },
    destroy() {
      me.guard = undefined;
      view.destroy();
      hud.destroy();
    },
  };
}

/** A body (not an enemy ship or missile)? */
const isBody = (t: Body | Foe): t is Body => 'motion' in t;
/** No world, rival's rock or moon: your guns may break it. */
const free = (b: Body) => !b.held && !b.rival && !b.moon;
const newsWindow = () => performance.now() / 1000 / 20; // a fresh news key every 20 s (repeat impact toasts, not one per frame)

export type Civilization = ReturnType<typeof createCivilization>;
