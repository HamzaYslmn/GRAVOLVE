import { Container, Graphics, ParticleContainer, Sprite, type Renderer } from 'pixi.js';
import { between, clamp } from '../../core/rng';
import { FAR_BOUNDS, type Fx } from '../../render/fx';
import { drawShip, quads, shipUnit, techPage, YOU, type Put, type TechPage } from '../../render/tech';
import { drop, mixRgb, type Body } from '../asteroid/body';
import { cityLights } from '../asteroid/sphere';
import { homeContact, pebble, smolder, sparks } from './crash';
import { MAX_DT, S_TURN, steps, type Craft } from './flight';
import { cells, cracked, energyTint, FORM_S, ghost, holds, KEEP, punch, RED, share, shard, SHATTER_S, tier, whiten, type Layout } from './lattice';
import { ferry, scanRel, type Home } from './nav';
import { DIG, SPEED } from './mining';
import { shellR, SHIELD_FLOOR, shieldLayers, shieldMax, type Shield } from './rules';
import { homeBodies, scar, type Foe, type Nav, type Ship, type Tally } from './ships';
import type { CivState } from './stage';

// What the civilization looks like on your world.
//   city lights   sphere.ts bakes them; here only their brightness = population, dimming and flickering under radiation
//   shield        up to 3 counter-rotating dusty veils (one per level, brightness by each layer's strength) under a hex
//                 lattice dome (lattice.ts): holes and cracks open from the hit side, cyan → amber → red as it drains, it
//                 shatters like glass at 0 and re-forms from dim red ghost cells; a hit flares the cells there and ripples
//   miners        shuttles on round trips to the sites stage.ts assigns (more often with the tier): out, dig, home loaded
//                 with ore, land in a puff of it, rest; the first visit leaves a light on a moon. The reach is a gold
//                 gauge, a thin line with ticks pointing in (moon slots are broken cyan circles), always while miners
//                 work, brighter while a big body is near
//   ships         probes, fighters and frigates on patrol (their rounds and your rockets: combat.ts)
//   star contact  a slow, warm pulse ring
// Draw calls: one ParticleContainer (tech page) for ships, lights, ore and the lattice's cells; the additive veils,
// ripples and rings share its source, so they batch.

const WARM = 0xffd27a;
const MAX_PARTS = 460;

// Miner shuttles use the ships' flight model (nav.ts ferry), relative to your world, in your radii: lift off the
// surface, brake onto the site's near side, dig, fly straight down home, land, rest, go again; round the bodies on the
// way (a 2 ship-radii pad, WIDE, so they reach sites in debris), and they can hit them (crashes).
//   t: s in this leg; a: angle of the spot it sits on (on the site digging, on your world landing and docked); seen: has dug there
type Shuttle = Craft & { site: Body; leg: 'out' | 'dig' | 'home' | 'dock'; t: number; a: number; wait: number; load: boolean; seen: boolean; foe?: Foe };
/** What stage.ts tells the shuttles: one target per assigned miner, the reach (world units), and whether to show it. */
type MineView = { targets: Body[]; reach: number; hint: boolean };
const TRIP_S = [5, 9]; // s between launches, and resting at home, at tier 1 (÷ tier)
const LEG_S = 15; // s: a flight longer than this gives up
const PAD = 0.08; // R: a landed shuttle sits this far off the surface
const LAND = 0.25; // R: a shuttle this close to its spot has landed
const WIDE = -3; // ship radii off each keep-out (nav.ts PAD 5: a 2 radii pad)
const TICKS = 48; // on the reach gauge
const GOLD = 0xffc04a; // the reach: ore gold, more saturated than WARM so it keeps its hue when faint
const PULSE = [4.5, 0.32]; // star contact's ring: s it grows and fades over, its brightest alpha
const RIPPLE_S = 0.5; // s a shield ripple fades over
const HOT_S = 0.25; // s the cells near a hit glow

/**
 * A world's shield look in `parent`: up to 3 counter-rotating additive veils (one per level, always `tint`) and on top a
 * hex lattice (lattice.ts) through the caller's `put`: holes and cracks at the hit side, coloured by charge, shattering at
 * 0; ripples at hits. `seed` deals the holes; `most`: the finest lattice tier (rivals 3).
 */
export function shieldLook(parent: Container, page: TechPage, tint: number, seed: number, most = 5) {
  const veils = [0, 1, 2].map(() => parent.addChild(new Sprite({ texture: page.veil, anchor: 0.5, alpha: 0, blendMode: 'add', tint })));
  const ripples: { s: Sprite; t: number }[] = [];
  let n = -1, L = cells(2), hold = holds(0, 0), vis = new Float32Array(0), hot = new Float32Array(0), lastE = NaN, form = Infinity;
  let bearing: number | undefined, pending: number | undefined, broke: { L: Layout; ids: number[]; t: number } | undefined;
  return {
    veils,
    /** A hit at bearing `a` from the world's centre: a ripple, the cells near it flare; the next fall in charge breaks them first. */
    ripple(a: number) {
      let q = ripples.find((p) => p.t >= RIPPLE_S);
      if (!q) {
        ripples.push((q = { s: new Sprite({ texture: page.ripple, anchor: 0.5, alpha: 0, blendMode: 'add', tint }), t: 0 }));
        parent.addChildAt(q.s, parent.getChildIndex(veils[2]) + 1);
      }
      [q.t, q.s.rotation, bearing, pending] = [0, a, a, a];
      const hx = Math.cos(a), hy = Math.sin(a);
      for (let i = 0; i < hot.length; i++) hot[i] = Math.max(hot[i], Math.exp(-((Math.hypot(L.c[i].x - hx, L.c[i].y - hy) / 0.5) ** 2)));
    },
    /** The shield `sh` round a world of radius R at (x, y); veils turn with `clock`. `put` undefined: off screen (no veils, no cells). */
    step(x: number, y: number, R: number, clock: number, dt: number, sh: Shield, zoom: number, put?: Put) {
      const max = shieldMax(sh), e = max > 0 ? Math.max(SHIELD_FLOOR, sh.s / max) : SHIELD_FLOOR, fr = shieldLayers(sh), level = sh.level;
      const Rs = shellR(R, level), tintE = energyTint(tint, e);
      veils.forEach((v, i) => {
        const goal = i < level ? (e > 0 ? 0.05 + 0.09 * fr[i] : 0.015) : 0; // dim: the planet stays the main read
        v.alpha += (goal - v.alpha) * Math.min(1, dt * 3);
        v.visible = !!put;
        v.position.set(x, y);
        v.rotation = (i % 2 ? -1 : 1) * clock * (0.05 + 0.03 * i) + i * 2.1;
        v.scale.set(shellR(R, i + 1) / (0.86 * (page.veil.frame.width / 2)));
      });
      for (const q of ripples) {
        q.t += dt;
        const k = Math.min(1, q.t / RIPPLE_S), a = q.s.rotation;
        [q.s.alpha, q.s.tint] = [0.9 * (1 - k) ** 1.5, tintE];
        q.s.position.set(x + Math.cos(a) * Rs, y + Math.sin(a) * Rs);
        q.s.scale.set(((0.3 + 0.7 * Math.sqrt(k)) * R * 0.8) / (page.ripple.frame.width / 2));
      }
      // The lattice: its tier by size on screen; a new tier re-deals the holes (round the last hit).
      const t = Math.min(most, tier(Rs * zoom, n));
      if (t !== n) {
        [n, L] = [t, cells(t)];
        [hold, vis, hot] = [holds(L.c.length, seed + 31 * n), new Float32Array(L.c.length).fill(-1), new Float32Array(L.c.length)];
        if (bearing !== undefined) punch(hold, L, bearing, 1);
      }
      if (e < lastE && lastE > 0 && pending !== undefined) punch(hold, L, pending, share(lastE));
      if (lastE > 0 && e <= 0) broke = { L, ids: L.c.flatMap((_, i) => (hold[i] < share(lastE) ? [i] : [])), t: 0 };
      if (lastE <= 0 && e > 0) form = 0;
      [lastE, pending, form] = [e, undefined, form + dt];
      const S = share(e), base = 0.3 + 0.12 * level, hotter = energyTint(tint, e - 0.25);
      for (let i = 0; i < L.c.length; i++) {
        const c = L.c[i], px = c.size * Rs * zoom, boost = clamp(9 / px, 1, 2), h = hold[i], at = FORM_S * Math.min(1, h / KEEP);
        const wait = h < S && form < at; // re-forming: the lowest holds ignite first
        const up = h < S && !wait, crack = up && cracked(h, e);
        const goal = up ? base * c.w * boost * (crack ? 0.5 : 1) : wait || ghost(h, e) ? 0.16 * c.w * boost : 0;
        vis[i] = vis[i] < 0 ? goal : vis[i] + (goal - vis[i]) * Math.min(1, dt * 8);
        hot[i] = up && form >= at && form - dt < at ? 0.8 : Math.max(0, hot[i] - dt / HOT_S); // ignites
        if (!put || level <= 0 || vis[i] < 0.004) continue;
        const col = whiten(up ? (crack ? hotter : tintE) : RED, 0.6 * hot[i]);
        put(page.hex, x + c.x * Rs, y + c.y * Rs, c.rot, c.size * Rs, col, Math.min(1, vis[i] * (1 + 1.2 * hot[i])), Math.max(c.long, 1.6 / px)); // ≥ 1.6 px thick
      }
      // The shatter: every cell standing at the break flies out, spinning and tumbling.
      if (broke && (broke.t += dt) >= SHATTER_S) broke = undefined;
      if (broke && put) {
        const k = broke.t / SHATTER_S;
        for (const i of broke.ids) {
          const c = broke.L.c[i], d = shard(i, k), out = d.out * R;
          put(page.hex, x + c.x * Rs + Math.cos(c.rot) * out, y + c.y * Rs + Math.sin(c.rot) * out, c.rot + d.spin, c.size * Rs, d.tint, Math.min(1, 1.6 * base * (0.5 + 0.5 * c.w) * d.alpha), Math.max(0.15, c.long * d.flip));
        }
      }
    },
    destroy() {
      for (const v of veils) v.destroy();
      for (const q of ripples) q.s.destroy();
    },
  };
}
export type ShieldLook = ReturnType<typeof shieldLook>;

export function createCivView(layer: Container, me: Body, renderer: Renderer, fx: Fx) {
  const page = techPage(renderer);
  const root = new Container();
  const shield = shieldLook(root, page, YOU, 7);
  const rings: { s: Sprite; t: number }[] = [];
  const pc = new ParticleContainer({ texture: page.source, boundsArea: FAR_BOUNDS, dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true } });
  const gauge = new Graphics();
  root.addChild(gauge, pc);
  layer.addChild(root);
  const quad = quads(pc, MAX_PARTS), put = quad.put;
  const flights: Shuttle[] = [], bases = new Set<Body>(), work = new Map<Body, number>();
  let clock = 0, pulseT = 0, trafficT = 0, flick = 1, flickGoal = 1, flickT = 0, shown = 0, hint = 0, jolt = 0, built = 0; // jolt: s the lights flicker after a landing; built: the reach gauge's radius in px

  /** Ore: the moon's colour, warmed and brightened so it reads against space and the moon. */
  const mixTint = (t: number) => mixRgb(mixRgb(t, WARM, 0.35, false), 0xffffff, 0.25, false);

  return {
    /** The shield took a hit at (x, y): its lattice ripples there. */
    ripple(x: number, y: number) {
      shield.ripple(Math.atan2(y - me.motion.y, x - me.motion.x));
      fx.flash(x, y, me.r * 0.25, 4, me.r * 0.3);
    },
    /** The shield went below 0 (its lattice shatters by itself): a burst of dust. */
    breakShield() {
      fx.burst(me.motion.x, me.motion.y, 20, me.r * 0.08, me.r * 1.4, YOU);
    },
    /** Heavy fire landed at (x, y) (rules.ts weaponHit): a surface flash, a dust puff, the city lights flicker. */
    landing(x: number, y: number) {
      jolt = 1.5;
      fx.flash(x, y, me.r * 0.35, 10, me.r * 0.8);
      fx.burst(x, y, 12, me.r * 0.05, me.r * 0.5, 0xd8c8a8);
    },
    update(dt: number, zoom: number, s: CivState, moons: { body: Body }[], mine: MineView, ships: Ship[], frigates: Ship[], nav: Nav) {
      clock += dt;
      quad.begin();
      const show = me.m > 0 && me.view.visible;
      root.visible = show;
      const lights = cityLights(me);
      if (!show) {
        if (lights) lights.alpha = 0;
        return;
      }
      const R = me.r, pm = me.motion, px = (n: number) => n / zoom, unit = shipUnit(R, zoom), su = (n: number) => n * unit; // su: ship-scaled
      shown += ((s.active ? 1 : 0.3) - shown) * Math.min(1, dt);

      // City lights: brightness with population and power (they dim when the reactors run dry); radiation harm dims them and
      // makes them flicker.
      jolt = Math.max(0, jolt - dt);
      const shake = Math.max(s.harm, jolt > 0 ? 0.7 : 0);
      if ((flickT -= dt) <= 0) [flickGoal, flickT] = [1 - shake * (0.3 + 0.7 * Math.random()), 0.04 + 0.16 * Math.random()];
      flick += (flickGoal - flick) * Math.min(1, dt * 25);
      if (lights) lights.alpha = Math.min(1, 0.35 + 0.45 * Math.min(1, s.pop / 5) + 0.2 * Math.min(1, s.energy / Math.max(s.need, 1e-6))) * (1 - 0.45 * s.harm) * (shake > 0 ? flick : 1) * shown;

      // Shield: the veils and the lattice (shieldLook), under the shuttles and ships.
      shield.step(pm.x, pm.y, R, clock, dt, { level: s.level, s: s.shield }, zoom, put);

      // After star contact a slow warm pulse.
      if (s.contact && (pulseT -= dt) <= 0) {
        pulseT = 6;
        let f = rings.find((q) => q.t >= PULSE[0]);
        if (!f) {
          rings.push((f = { s: new Sprite({ texture: page.ring, anchor: 0.5, alpha: 0, blendMode: 'add', tint: WARM }), t: 0 }));
          root.addChildAt(f.s, shield.veils.length);
        }
        f.t = 0;
      }
      for (const f of rings) {
        f.t += dt;
        const k = Math.min(1, f.t / PULSE[0]);
        f.s.alpha = PULSE[1] * (1 - k) * Math.min(1, k * 6);
        f.s.position.set(pm.x, pm.y);
        f.s.scale.set((R * (1.05 + k * 6)) / (0.85 * (page.ring.frame.width / 2)));
      }

      // The reach: a thin gold line with ticks pointing in, drifting slowly, always while miners work (brighter while a body
      // to link with is near). Built in screen pixels; rebuilt only when its size on screen changes by over 5%.
      hint += ((s.active && s.miners > 0 ? (mine.hint ? 0.3 : 0.14) : 0) - hint) * (1 - Math.exp(-dt / 0.4));
      const P = mine.reach * zoom;
      gauge.visible = hint > 0.004 && P > 0;
      if (gauge.visible) {
        if (!(Math.abs(P / built - 1) <= 0.05)) {
          built = P;
          gauge.clear().circle(0, 0, P).stroke({ width: 1, color: GOLD, alpha: 0.5 });
          for (let i = 0; i < TICKS; i++) {
            const t = (i * 2 * Math.PI) / TICKS, c = Math.cos(t), n = Math.sin(t), len = i % 4 ? 7 : 15;
            gauge.moveTo(c * P, n * P).lineTo(c * (P - len), n * (P - len));
          }
          gauge.stroke({ width: 1.5, color: GOLD, alpha: 1 });
        }
        gauge.position.set(pm.x, pm.y);
        gauge.scale.set(mine.reach / built);
        [gauge.rotation, gauge.alpha] = [-clock * 0.03, hint * shown];
      }
      // Miner shuttles: launch for the target most short of its miners (s.miners in all); more often with the tier.
      const rest = () => between(TRIP_S) / s.tier;
      const short = () => {
        let best: Body | undefined, most = 0;
        for (const b of new Set(mine.targets)) {
          const k = mine.targets.filter((t) => t === b).length - flights.filter((f) => f.site === b).length;
          if (k > most) [best, most] = [b, k];
        }
        return best;
      };
      if (mine.targets.length && s.active && flights.length < s.miners && (trafficT -= dt) <= 0) {
        trafficT = rest();
        const best = short();
        if (best) {
          // From the side facing the site, lifting off outward.
          const a = Math.atan2(best.motion.y - pm.y, best.motion.x - pm.x) + (Math.random() - 0.5) * 0.8, r = R * (1 + PAD);
          flights.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, heading: a, burn: 0, site: best, leg: 'out', t: 0, a, wait: 0, load: false, seen: false });
        }
      }
      work.clear();
      const dtc = Math.min(dt, MAX_DT), n = steps(dtc), h = dtc / n, pad = R * (1 + PAD), list = homeBodies(flights, me, nav), o: Home = { x: pm.x, y: pm.y, vx: pm.vx, vy: pm.vy, t: 0 };
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i], live = (b: Body) => b.m > 0 && mine.targets.includes(b);
        if (!live(f.site) && (f.leg === 'out' || f.leg === 'dock')) [f.site, f.seen] = [short() ?? f.site, false]; // reassigned: off to the new site
        const m = f.site, mm = m.motion, mx = mm.x - pm.x, my = mm.y - pm.y, alive = live(m);
        if (alive && f.seen) work.set(m, (work.get(m) ?? 0) + 1);
        f.t += dt;
        if (!alive && (f.leg === 'out' || f.leg === 'dig')) [f.leg, f.t, f.load, f.a] = ['home', 0, false, Math.atan2(f.y, f.x)];
        if ((f.leg === 'out' || f.leg === 'home') && f.t > LEG_S) {
          flights.splice(i, 1);
          continue;
        }
        if (f.leg === 'out' || f.leg === 'home') scanRel(f, pm, list, (b) => b === me || b === m, nav.sr, SPEED * R, S_TURN, WIDE * nav.sr);
        if (f.leg === 'out') {
          const land = m.r + PAD * R;
          for (let k = 0; k < n; k++) {
            const dx = mx - f.x, dy = my - f.y, d = Math.hypot(dx, dy) || 1, go = Math.max(0, d - land) / d;
            o.t = k * h;
            ferry(f, dx * go, dy * go, mm.vx - pm.vx, mm.vy - pm.vy, SPEED * R, R, h, true, o);
          }
          if (Math.hypot(mx - f.x, my - f.y) < m.r + LAND * R) {
            [f.leg, f.t, f.a, f.seen] = ['dig', 0, Math.atan2(f.y - my, f.x - mx), true];
            if (m.moon && !bases.has(m)) fx.flash(mm.x, mm.y, m.r * 1.2, 6, m.r);
            if (m.moon) bases.add(m);
          }
        } else if (f.leg === 'dig') {
          // Sits on the moon; dust kicks up while it digs.
          const r = m.r + PAD * R, cx = Math.cos(f.a), cy = Math.sin(f.a);
          [f.x, f.y, f.vx, f.vy, f.burn] = [mx + cx * r, my + cy * r, mm.vx - pm.vx, mm.vy - pm.vy, 0];
          if (Math.random() < dt * 5) fx.puff(mm.x + cx * m.r, mm.y + cy * m.r, cx, cy, 1, su(3), 0.15 * R, m.tint);
          if (f.t >= DIG) [f.leg, f.t, f.load, f.a] = ['home', 0, true, Math.atan2(f.y, f.x)];
        } else if (f.leg === 'home') {
          // Straight down to the spot under it: the near side, so no detour round the world.
          const tx = Math.cos(f.a) * pad, ty = Math.sin(f.a) * pad;
          for (let k = 0; k < n; k++) [o.t] = [k * h, ferry(f, tx - f.x, ty - f.y, 0, 0, SPEED * R, R, h, false, o)];
          if (Math.hypot(tx - f.x, ty - f.y) < LAND * R) {
            [f.leg, f.t, f.wait] = ['dock', 0, rest()];
            const cx = Math.cos(f.a), cy = Math.sin(f.a);
            if (f.load) fx.puff(pm.x + cx * R, pm.y + cy * R, cx, cy, 6, su(3), 0.25 * R, mixTint(m.tint));
          }
        } else {
          [f.x, f.y, f.vx, f.vy, f.burn] = [Math.cos(f.a) * pad, Math.sin(f.a) * pad, 0, 0, 0];
          if (f.t >= f.wait) {
            if (!alive || !s.active) {
              flights.splice(i, 1);
              continue;
            }
            [f.leg, f.t, f.load, f.heading] = ['out', 0, false, f.a];
          }
        }
        const x = pm.x + f.x, y = pm.y + f.y;
        drawShip(put, page, 'you', 'miner', x, y, f.heading, unit, f.leg === 'out' || f.leg === 'home' ? f.burn : -1, shown, f.bank);
        // The ore it carries: a warm pod that fills while it digs and rides home.
        const ore = f.leg === 'dig' ? f.t / DIG : f.leg === 'home' && f.load ? 1 : 0;
        if (ore > 0) put(page.dot, x, y, 0, su(10) * (0.4 + 0.6 * ore), mixTint(m.tint), shown);
      }
      // Lights on the moons with a base (on the side facing you).
      for (const m of moons) {
        const b = m.body;
        if (!bases.has(b) || !b.m) continue;
        const dx = pm.x - b.motion.x, dy = pm.y - b.motion.y, d = Math.hypot(dx, dy) || 1;
        put(page.dot, b.motion.x + (dx / d) * b.r * 0.75, b.motion.y + (dy / d) * b.r * 0.75, 0, px(7), WARM, shown);
      }


      // Defence ships on patrol.
      for (const s of ships) drawShip(put, page, 'you', s.kind, pm.x + s.x, pm.y + s.y, s.heading, unit, s.burn, 1, s.bank);
      for (const s of frigates) drawShip(put, page, 'you', 'frigate', pm.x + s.x, pm.y + s.y, s.heading, unit, s.burn, 1, s.bank);

      quad.end();
    },
    /**
     * After the field moved (stage.ts crashes): each shuttle in flight bumps the bodies (not your world or its site: it
     * lands there); a graze hurts it, a wreck loses the flight and its load (the next leaves after the usual rest); its
     * world's surface as ships.ts crashes. `seen`: sparks on screen; `crack(volume, pitch)`.
     */
    crashes(nav: Nav, dt: number, tally: Tally, seen: (x: number, y: number) => boolean, crack: (v: number, pitch: number) => void) {
      const pm = me.motion, R = me.r, sr = nav.sr, list = homeBodies(flights, me, nav);
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i];
        if (f.leg !== 'out' && f.leg !== 'home') {
          f.slam = 0;
          continue;
        }
        const { grade, hit, hard, a } = homeContact(f, pm, list, sr, R, dt, (b) => b === me || b === f.site);
        if (grade === 2) {
          [tally.wreck] = [tally.wreck + 1, flights.splice(i, 1)];
          fx.burst(a.x, a.y, 8, R * 0.03, R * 0.5, YOU);
          if (hard) scar(fx, hard.b, hard.x, hard.y, sr, me);
          crack(0.2, 1.6);
          continue;
        }
        if (grade === 1) {
          tally.graze++;
          fx.burst(hard?.x ?? a.x, hard?.y ?? a.y, 6, sr * 0.3, sr * 4, 0xffd9a8);
          if (hard && pebble(hard.b, sr)) [fx.burst(hard.b.motion.x, hard.b.motion.y, 8, hard.b.r * 0.6, sr * 3, hard.b.tint), drop(hard.b)];
          crack(0.08, 2.2);
        } else if (sparks(fx, a, hit, dt, sr * 0.35, YOU, seen)) tally.miss++;
        f.spark = a.spark;
        smolder(fx, a, dt, sr * 0.35, YOU, seen);
      }
    },
    /** Shuttles that have reached `b` and still work it (stage.ts mines a site only through them). */
    working: (b: Body) => work.get(b) ?? 0,
    /** Shuttles away from home as foes (stable objects); a kill breaks one up in a small burst. */
    shuttles(): Foe[] {
      const pm = me.motion, out: Foe[] = [];
      for (const f of flights) {
        if (f.leg === 'dock') continue;
        const foe = (f.foe ??= {
          x: 0, y: 0, kill() {
            const i = flights.indexOf(f);
            if (i >= 0) flights.splice(i, 1), fx.burst(foe.x, foe.y, 8, me.r * 0.03, me.r * 0.5, YOU);
          },
        });
        [foe.x, foe.y, foe.vx, foe.vy] = [pm.x + f.x, pm.y + f.y, pm.vx + f.vx, pm.vy + f.vy];
        out.push(foe);
      }
      return out;
    },
    destroy() {
      const lights = cityLights(me);
      if (lights && !lights.destroyed) lights.alpha = 0;
      root.destroy({ children: true });
    },
  };
}
