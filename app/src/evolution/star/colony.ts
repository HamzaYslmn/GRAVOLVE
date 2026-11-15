import type { News } from '../../ui/toast';
import { ParticleContainer, type Container, type Renderer } from 'pixi.js';
import type { Motion } from '../../core/entity';
import { pressure } from '../../core/water';
import { FAR_BOUNDS, type Fx } from '../../render/fx';
import { drawShip, quads, shipR, shipUnit, SHIP_PX, techPage, YOU } from '../../render/tech';
import { absorb, drop, type Body } from '../asteroid/body';
import { bump, bumps, crash, MISS_V, pebble, smolder, sparks } from '../civilization/crash';
import { arrive, BRAKE, MAX_DT, steps, thrust, TURN, type Craft } from '../civilization/flight';
import { clear, HOME_DODGE, LOOK, PAD, reachOf, scan, type Disc } from '../civilization/nav';
import { scar } from '../civilization/ships';
import { capacity as room } from '../civilization/rules';
import type { Civilization } from '../civilization/stage';
import { envelope, habitability } from '../planet/rules';
import { COLONY, COLONY_HAB, COLONY_LOST, colonyScore, dysonSpeed, heatAt, liquidBand, TERRA_VOL, terraMass, terraNeed, warmth, zoneSlot } from './rules';
import type { Planet } from './system';

// Colonies (concept 4–6): a planet your star catches gets a carrier and a colony ship (COLONY: ore, volatiles,
// 1 bn people; one fleet at a time, it waits for stock). On arrival: a colony at COLONY_HAB, else it terraforms: one ship at a time
// brings TERRA_VOL volatiles a trip (air or water, the weaker). Colonies and terraforming planets leave their outer ring
// for a slot in their liquid band (zoneSlot), clear of your world's orbit and each other; their climate is set from the
// star. Colonies add room for people (civilization capacity) and Dyson speed. A colony is lost (its people die with it)
// under COLONY_LOST, eaten, or past the gas line: then it is a gas world that leaves its ring and drifts off.
// Ships steer round the star, the planets and the bodies near them (nav.ts scan + clear, threaded) and can hit them:
// a graze hurts a ship, a wreck loses it; a lost colony ship leaves the planet unclaimed (the next fleet pays again).

type Sun = { m: Motion; R: number; glow: number };
type Trip = { p: Planet; need?: 'gas' | 'ice'; ships: (Craft & { cls: 'miner' | 'carrier' | 'colonizer' })[]; dud?: boolean }; // dud: its colony ship was lost

const V = 2; // R★/s cruise (the system is compressed: a planet is ~1–6 R★ away)
const ACC = 2; // R★/s² thrust
const ZONE_AIR = 0.7; // atm: a planet's band is placed as if it had at least this much air (full air score)

/** Sets a planet's climate from the star where it is (Body.heat), then its scores. */
function assess(b: Body, s: Sun, cover: number) {
  const atm = pressure(b.m, b.comp.gas ?? 0), x = Math.hypot(b.motion.x - s.m.x, b.motion.y - s.m.y) / s.R;
  b.heat = heatAt(atm, warmth(s.glow, cover, x));
  const h = habitability(b);
  return { atm, h, score: colonyScore(h) };
}

export function createColonies(layer: Container, renderer: Renderer, me: Body, civ: Civilization, fx: Fx, news: News) {
  const page = techPage(renderer), pc = new ParticleContainer({ texture: page.source, boundsArea: FAR_BOUNDS, dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true } });
  layer.addChild(pc);
  const quad = quads(pc, 48); // a hull and two plume quads a ship
  const trips: Trip[] = [];
  let count = 0, wait: string | undefined;

  const ship = (cls: Trip['ships'][0]['cls'], a: number, side: number): Trip['ships'][0] => {
    const pm = me.motion, ox = -Math.sin(a) * side * me.r, oy = Math.cos(a) * side * me.r;
    return { x: pm.x + ox, y: pm.y + oy, vx: pm.vx, vy: pm.vy, heading: a, burn: 0, cls };
  };
  const launch = (p: Planet, need?: Trip['need']) => {
    const a = Math.atan2(p.b.motion.y - me.motion.y, p.b.motion.x - me.motion.x);
    trips.push({ p, need, ships: need ? [ship('miner', a, 0)] : [ship('carrier', a, -0.6), ship('colonizer', a, 0.6)] });
  };
  /** A colony is gone: its people die with it (its share of the room, at most half), the room and Dyson speed drop. */
  function lose(p: Planet, title: string, sub: string) {
    const cs = civ.state, share = cs ? Math.min(0.5, room(p.score ?? 0, p.b.m) / Math.max(cs.cap, 1e-9)) : 0;
    civ.colonies(0, (cs?.pop ?? 0) * share);
    news(null, title, sub);
  }

  return {
    /** Colonies now (Dyson speed: rules.ts dysonSpeed). */
    get count() {
      return count;
    },
    get speed() {
      return dysonSpeed(count);
    },
    /** Why the next colony fleet waits (the Star panel's why row). */
    get wait() {
      return wait;
    },
    /** `you`: your world's orbit target (R★); `cover`: Dyson cover; `range`: where living planets may sit (R★); `reach`: your moons' reach (R★); `bodies`: the field's, for the ships. Runs before system.ts carry (it still sees eaten planets) and the field's move. */
    update(dt: number, zoom: number, planets: Planet[], s: Sun, cover: number, you: number, range: [number, number], reach: number, bodies: readonly Body[]) {
      const cs = civ.state, taken = [you];
      wait = undefined;
      let extra = 0;
      count = 0;
      for (let i = planets.length - 1; i >= 0; i--) {
        const p = planets[i], b = p.b;
        if (!p.life) continue;
        if (!b.m) {
          if (p.life === 'colony') lose(p, 'Colony destroyed', 'A world your people lived on is gone · its people with it');
          continue;
        }
        if (p.life === 'fleet') continue;
        const { atm, h, score } = assess(b, s, cover);
        if (envelope(b.m, b.comp)) { // past the gas line at Super-Earth mass: no ground for a colony
          if (p.life === 'colony') lose(p, 'A colony became a gas world', 'Too much gas buried its ground · it leaves its ring');
          else news(null, 'A gas world', 'Too much gas buried its ground · it leaves its ring');
          [b.moon, b.motion.drag] = [false, 1e-3];
          planets.splice(i, 1);
          continue;
        }
        if (p.life === 'terra' && score >= COLONY_HAB) {
          p.life = 'colony';
          news(null, 'Colony', 'Your people settle another world · room for more of them, a faster Dyson sphere');
        } else if (p.life === 'colony' && score < COLONY_LOST) {
          p.life = 'terra';
          lose(p, 'Colony lost', 'Its world no longer holds life · its people died · miners try again');
        }
        p.score = score;
        if (p.life === 'colony') [count, extra] = [count + 1, extra + room(score, b.m)];
        else if (cs?.active && !trips.some((t) => t.need)) { // one terraforming ship at a time
          const need = terraNeed(h);
          if (need && civ.spend(0, TERRA_VOL)) launch(p, need);
        }
        // Its own ring in its liquid band, clear of your orbit and the other living planets.
        const band = liquidBand(Math.max(atm, ZONE_AIR), s.glow, cover), gap = reach + 0.4; // clear of your moons, as a ring (rules.ts layout)
        const g = band && zoneSlot(band, taken, gap, range);
        if (g !== undefined) p.goal = g;
        if (p.goal !== undefined) taken.push(p.goal);
      }
      // The next caught planet gets a fleet (one at a time) once there is stock.
      const next = planets.find((p) => !p.life && !envelope(p.b.m, p.b.comp));
      if (next && cs?.active && !trips.some((t) => !t.need)) {
        if (cs.pop >= COLONY.pop + 0.5 && civ.spend(COLONY.ore, COLONY.vol)) {
          next.life = 'fleet';
          civ.colonies(extra, COLONY.pop);
          launch(next);
          news(null, 'Colony fleet', 'A carrier and a colony ship leave for the new planet');
        } else wait = `Colony ship needs ${COLONY.ore} ore · ${COLONY.vol} volatiles · ${COLONY.pop} bn people to spare`;
      }
      civ.colonies(extra);

      // Ships: brake onto the planet round the star, the planets and the bodies in reach; a colony fleet settles or starts
      // terraforming, a miner unloads. Contacts at once, the bodies carried on by this frame (the field moves after).
      const unit = shipUnit(me.r, zoom), u = unit * SHIP_PX, n = steps(dt), h = Math.min(dt, MAX_DT) / n, sr = shipR(me.r, zoom), sp = V * s.R, T = LOOK + 2 / TURN;
      const star: Disc = { m: 1, r: s.R, motion: s.m, fast: true }; // touching the star always wrecks
      quad.begin();
      for (let i = trips.length - 1; i >= 0; i--) {
        const t = trips[i], b = t.p.b, skip = (q: Disc) => q === b || q === me;
        let there = !b.m || !planets.includes(t.p);
        for (let j = t.ships.length - 1; j >= 0; j--) {
          const c = t.ships[j], list = [star, ...reachOf(bodies, c.x, c.y, c.vx, c.vy, T * sp + PAD * sr, T)];
          c.near = scan(c, list, skip, sr, sp, TURN, { thread: true, dodge: HOME_DODGE });
          for (let k = 0; k < n; k++) {
            arrive(b.motion.x - c.x, b.motion.y - c.y, b.motion.vx, b.motion.vy, sp, BRAKE * ACC * s.R);
            clear(c, c.near, sp, k * h);
            thrust(c, ACC * s.R, TURN, h, s.m.vx, s.m.vy);
          }
          const hit = bump(c.x, c.y, c.vx, c.vy, list, sr, dt, skip, MISS_V * me.r, dt), grade = hit && !hit.miss ? crash(c, hit, sr, me.r) : 0;
          if (grade === 2) {
            bumps.colony.wreck++;
            t.ships.splice(j, 1);
            fx.flash(c.x, c.y, sr * 3, 8, sr * 6);
            fx.burst(c.x, c.y, 10, sr * 0.5, sr * 6, YOU);
            if (hit!.b !== star) scar(fx, hit!.b as Body, hit!.x, hit!.y, sr, me);
            if (c.cls === 'colonizer') {
              if (t.p.life === 'fleet') t.p.life = undefined;
              t.dud = true;
              news(null, 'Colony ship lost', 'It struck a body on the way · the planet waits for the next fleet');
            }
            continue;
          }
          if (grade === 1) {
            bumps.colony.graze++;
            fx.burst(hit!.x, hit!.y, 6, sr * 0.3, sr * 4, 0xffd9a8);
            if (pebble(hit!.b, sr)) drop(hit!.b as Body);
          } else if (sparks(fx, c, hit, dt, sr * 0.35, YOU, () => true)) bumps.colony.miss++;
          smolder(fx, c, dt, sr * 0.35, YOU, () => true);
          drawShip(quad.put, page, 'you', c.cls, c.x, c.y, c.heading, unit, c.burn, 1, c.bank);
          if (Math.hypot(b.motion.x - c.x, b.motion.y - c.y) < b.r + u) there = true;
        }
        if (!t.ships.length) there = true;
        if (!there) continue;
        trips.splice(i, 1);
        if (!b.m || !planets.includes(t.p) || t.dud || !t.ships.length) continue;
        fx.flash(b.motion.x, b.motion.y, b.r * 1.5, 6, b.r);
        if (t.need) absorb(b, terraMass(b.m, b.comp, t.need), { [t.need]: 1 });
        else {
          // Settle now if it can, else terraform; either way it leaves its outer ring for the warm band.
          [t.p.ring, t.p.goal] = [-1, t.p.goal ?? t.p.o.target / s.R]; // stays put until its band has room
          t.p.life = 'terra';
          if (assess(b, s, cover).score < COLONY_HAB) news('terra', 'Terraforming', 'Too harsh to settle yet · it moves into the warm band and your miners bring it air and water');
        }
      }
      quad.end();
    },
    /** Your star is gone: every colony goes with its rings. */
    release(planets: Planet[]) {
      for (const p of planets) if (p.life === 'colony' && p.b.m) lose(p, 'Colonies adrift', 'Without the star their worlds freeze · their people die');
      civ.colonies(0);
      count = 0;
    },
    destroy() {
      trips.length = 0;
      pc.destroy();
    },
  };
}
