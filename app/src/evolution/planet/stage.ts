import type { Kit } from '../../kit';
import type { Container, Renderer } from 'pixi.js';
import { K_PER_HEAT, type WaterState } from '../../core/water';
import { createOverlays } from '../../render/overlays';
import { toast, type RunNews } from '../../ui/toast';
import { absorb, resize, type Body, type Hit } from '../asteroid/body';
import { AGE_GOAL } from '../asteroid/rules';
import { createCivilization, type Civilization, type CivState } from '../civilization/stage';
import type { Combat } from '../civilization/combat';
import { lack } from '../civilization/rules';
import { createStarStage, type StarState } from '../star/stage';
import { createWorldHud } from './hud';
import { createMoons } from './moons';
import {
  beforeClimate, climate, envelope, GAS_WARN, gasPath, habitability, impact, lifeStep, nextGoal, onGasLine, PLANET_M, PROTO_M, RAIN_GAP, seaCover, lifeName, stageOf, THIEF, tierIndex, tierName,
  type Life, type Sky,
} from './rules';

export const MILESTONES = new Set(['age2', 'civ', 'needsun', 'starlink', 'age3', 'type2']); // toasts that never drop (ui/toast.ts)
const NEWS_WAIT = 4; // s after the handover before the stage's own news: Age I's toasts go first
const RAIN_BACK = 0.9; // share of the water you brought that the first rain restores (stands in for outgassing)
/** One toast per step of the ladder: the molten/solid and rocky/plain names of one mass step share a key. */
const tierKey = (name: string) => (name === 'Protoplanet' || name === 'Dwarf planet' ? 'dwarf' : name === 'Rocky planet' || name === 'Planet' ? 'planet' : name);

export { tierIndex };

// Age II (Worlds), created by main.ts at AGE_GOAL. Keeps Age I's body, field and collisions and adds climate,
// magnetic field, life, impact setbacks, world tiers, its HUD rows and the climate drawn on the body
// (render/overlays.ts); later it hosts moons, combat, the civilization and Age III (stars).
// Frame order (main.ts): before() → player.update (cools, boils water) → update() → field (meals, hits → hit()).

/** One plain snapshot per frame for the HUD and the surface visuals (render reads it, never computes climate). */
export type WorldState = {
  mass: number; gasShare: number;
  name: string; // tier (rules.ts tierName)
  goal?: { name: string; mass: number; need?: string }; // next tier on your line; none: a rocky world's goal is life
  kelvin: number; pressure: number; boilingK: number; // surface temperature, atmospheres, where water boils now
  water: WaterState; waterShare: number; seaCover: number; vapor: number; // vapor: share of your mass in the air as steam
  scores: { water: number; temp: number; air: number; magnet: number }; // the doc's four, 0..1
  lifeSpeed: number; life: number; lifeName: string; lifeProgress: number; // life: stage index, −1 none
  envelope: boolean; // gas line past Super-Earth mass: no surface for life (doc)
  gasLine: boolean; // on the sticky gas line (in at 20% gas, out below 15%: rules.ts onGasLine)
  gasWarn: boolean; // a world with a surface from Planet mass with gas ≥ 15%: the HUD warns before the gas line locks life out
  diff: number; // 0..1 how far your metal has sunk to a core (Body.diff; the magnetic field's lever)
  moons: number; slots: number; // your moons, and how many slots your mass gives (moons.ts)
  civ?: CivState; // from an intelligent species on (evolution/civilization): population, energy, tech, shield
  star?: StarState; // Age III (evolution/star): the nearest star or yours, link, Dyson
};


/** `combat`: the run's (main.ts owns it: Age I's pirates fly on); the stage hands it its moons and news. */
export function createPlanetStage(layer: Container, me: Body, renderer: Renderer, kit: Kit, combat: Combat, runNews: RunNews) {
  const sky: Sky = { vapor: 0, gas0: 0 };
  const life: Life = { progress: 0, calm: 0 };
  const look = createOverlays(layer, renderer);
  const hud = createWorldHud();
  const { seen, say: news } = runNews; // the run's (main.ts): Age I's news, moons, combat, civilization and star, latched once
  let line = gasPath(me.comp), age = 0;
  let best = -1, tier = tierName(me.m, me.comp, me.heat, line), state: WorldState | undefined, civ: Civilization | undefined;
  let star: ReturnType<typeof createStarStage> | undefined, light = { flux: 0, warm: 0, dyson: 0, sun: 0, at: 0 };
  // The water you brought: the melt-through boils it off and a planetoid keeps little of the steam.
  // Once the surface first cools below boiling, it rains back up to RAIN_BACK of it.
  let brought = me.m * (me.comp.ice ?? 0), boiled = false;
  /** The stage's own news, after NEWS_WAIT (not latched while waiting); the body shows it too. */
  const once = (key: string, title: string, sub: string) => void (age >= NEWS_WAIT && news(key, title, sub) && look.milestone(key));
  const moons = createMoons(layer, me, kit.input, kit.glow, kit.fx, kit.canvas, news);
  combat.attach(moons); // mass driver, rival worlds, pirates

  return {
    /** The latest snapshot (undefined before the first update). */
    get state() {
      return state;
    },
    /** News keys latched this run (achievements read them: core/achievements.ts); 'winter' / 'extinction' mark setbacks. */
    get seen(): ReadonlySet<string> {
      return seen;
    },
    /** Before the player's update: whatever gas appears during it is boiled water kept by gravity (vapour). */
    before() {
      if (me.m) beforeClimate(sky, me);
    },
    moons,
    /** Life's progress and calm (dev test hook: scripted runs start at an intelligent species). */
    life,
    /** Combat: mass driver, rivals, pirates (test hook). */
    combat,
    /** The civilization once there is one (test hook). */
    get civ() {
      return civ;
    },
    /** Age III: stars, link, orbit, Dyson (test hook). */
    get star() {
      return star;
    },
    /** Set when a star ended the run (main.ts ends it with this line). */
    get fate() {
      return star?.fate;
    },
    /** World units the camera should keep in view around you (a star near you; 0: none). */
    fit: () => Math.max(star?.fit() ?? 0, moons.fit()),
    /** What the camera should follow instead of you (in orbit around your star: the system), if anything. */
    focus: () => star?.focus(),
    /** `dt` game time, `real` wall time (the HUD); `near` = bodies around you, `zoom` the camera's, `aimTarget` the HUD target (moons.ts). */
    update(dt: number, real: number, near: Body[], zoom: number, aimTarget: () => Body | undefined) {
      age += dt;
      moons.update(dt, near, zoom, aimTarget, civ);
      if (moons.stolen >= THIEF) seen.add('thief'); // Master thief (core/achievements.ts), not a toast
      if (!me.m) return;
      // Age III: the star's light (warmth, dose, Dyson energy), your orbit and the Dyson sphere; read by the climate and the civilization below.
      if (star) light = star.update(dt, real, zoom, !!aimTarget(), state?.pressure ?? 0);
      if (!me.m) return;
      const m0 = me.m, leaked = climate(sky, me, dt, light.warm);
      if (leaked) {
        const m1 = me.m; // vapour lost to space: same shape, smaller
        me.m = m0;
        resize(me, m1);
      }
      let hab = habitability(me);
      if (brought > 0 && hab.k >= hab.bp) boiled = true;
      else if (brought > 0 && boiled && hab.k < hab.bp - RAIN_GAP) {
        // First rain: what the melt boiled away comes back (vapour still in the air rains out by itself: climate()).
        const back = RAIN_BACK * brought - me.m * (me.comp.ice ?? 0) - sky.vapor;
        brought = 0;
        if (back > 0) {
          absorb(me, back, { ice: 1 });
          hab = habitability(me);
          once('seas', 'First rain', 'The water your melt boiled off falls back as seas');
        }
      }
      line = onGasLine(line, me.comp);
      const vapor = sky.vapor / me.m, gassy = envelope(me.m, me.comp, line), gas = me.comp.gas ?? 0;
      const stage = gassy ? -1 : lifeStep(life, hab, dt);
      // A world never reads as an asteroid again: dropping below AGE_GOAL (lost steam) still names a planetoid.
      const named = Math.max(me.m, AGE_GOAL), water = me.comp.ice ?? 0;
      const name = tierName(named, me.comp, me.heat, line), goal = nextGoal(named, me.comp, line);
      const gasWarn = !gassy && me.m >= PLANET_M && gas >= GAS_WARN;
      state = {
        mass: me.m, gasShare: gas, name, goal, kelvin: hab.k, pressure: hab.p, boilingK: hab.bp, water: hab.state, waterShare: water, seaCover: seaCover(water), vapor,
        scores: { water: hab.water, temp: hab.temp, air: hab.air, magnet: hab.magnet }, lifeSpeed: gassy ? 0 : hab.rate,
        life: stage, lifeName: lifeName(life.progress), lifeProgress: life.progress, envelope: gassy,
        gasLine: line, gasWarn, diff: me.diff ?? 0,
        moons: moons.list().length, slots: moons.slots,
      };

      // News, as it happens (the HUD queues them; each latched once per run, life stages when new).
      if (hab.p >= 0.05) once('air', 'Atmosphere', 'Gas your gravity holds · see the glow on your rim');
      if (hab.state === 'steam' && vapor > 0.01) once('steam', 'Steam sky', 'Your water boiled into the air · it rains once you cool');
      if (hab.state === 'liquid' && water > 0.01) once('seas', 'First oceans', `Liquid water: ${hab.p.toFixed(2)} atm, surface below boiling`);
      if (hab.state === 'ice' && water >= 0.1 && hab.p >= 0.05) once('frozen', 'Frozen seas', 'Too cold: thicker air would trap more heat');
      if (gasWarn) once('gas-warn', `Gas ${Math.round(gas * 100)}%`, '20% gas makes a gas world from Super-Earth mass: no surface, no life');
      if (seen.has('seas') && hab.state === 'steam') once('boil', 'Seas boiling', 'Too hot: eat less and let your world cool');
      if (leaked && vapor > 0.005) once('leak', 'Water escaping', 'A boiling sky loses its vapour to space');
      if (hab.magnet >= 0.5) once('magnet', 'Magnetic field', 'Your sunken iron core shields the surface');
      if (stage > best) {
        best = stage;
        if (stage === 0) once('age2', 'Age II complete', 'An intelligent species looks up at you');
      }
      // An intelligent species starts a civilization (rocky line only); it keeps running if life falls back.
      if (!civ && stage === 0 && !gassy) civ = createCivilization(layer, me, renderer, kit.fx, moons, hud.panel, news, kit.field);
      if (civ) {
        if (me.guard && !me.guard.own) me.guard.own = (b) => b === me || (!!(b as Body).moon && (moons.owns(b as Body) || !!star?.planets.some((p) => p.b === b))); // these pass your shell and ground; a rival's rock does not (field.ts)
        civ.update(dt, real, near, zoom, { life: stage, rate: hab.rate, magnet: hab.magnet, pressure: hab.p, lack: lack(hab), foes: combat.foes(), shots: combat.shots, sites: combat.rivals.sites(), flux: light.flux, dyson: light.dyson, sun: light.sun, sunA: light.at });
        state.civ = civ.state;
        // Star contact (the people need a sun) opens Age III (evolution/star).
        if (!star && civ.state?.contact) star = createStarStage(layer, me, renderer, kit, civ, news);
        state.star = star?.state;
      }
      combat.update(dt, near, zoom, aimTarget, stage, civ, star?.beam);
      if (name === 'Brown dwarf') once('age2', 'Brown dwarf: a failed star', 'Age II complete · the gas line ends here');
      else if (name !== tier && age >= NEWS_WAIT) {
        // Every tier above the planetoid is told here: one toast per mass step.
        if (me.m >= PROTO_M) once(tierKey(name), name, goal ? `Next: ${goal.name}` : gassy ? '' : 'Next: make it habitable');
        tier = name;
      }

      look.update(dt, me, state);
      hud.update(real, state, me.comp);
    },
    /** A hit where you're the actor (main.ts passes the field's hits): a big impactor sets life back (doc: mass extinction). */
    hit(h: Hit) {
      if (!me.m || h.kind === 'eaten') return;
      if (civ?.hit(h)) return; // the shield took it, or people died instead of life falling back (civilization/stage.ts)
      const lost = impact(life, h.heat * K_PER_HEAT); // delivered heat in kelvin
      if (!lost) return;
      best = stageOf(life.progress);
      seen.add(lost === 'soft' ? 'winter' : 'extinction'); // for achievements (Unbroken chain), not a toast key
      if (lost === 'soft') toast('Impact winter', 'Dust darkens the sky: life loses ground');
      else toast('Mass extinction', 'The impact wiped out life · it starts again');
    },
    destroy() {
      star?.destroy();
      civ?.destroy();
      moons.destroy();
      look.destroy();
      hud.destroy();
    },
  };
}

export type PlanetStage = ReturnType<typeof createPlanetStage>;
