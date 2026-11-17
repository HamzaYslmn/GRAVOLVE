import type { Kit } from '../../kit';
import type { News } from '../../ui/toast';
import { Sprite, type Container, type Renderer } from 'pixi.js';
import { step, type Motion } from '../../core/entity';
import { capture, type Orbit } from '../../core/orbits';
import { clamp, hashSeed, poissonGap, rng, smoothstep } from '../../core/rng';
import { drop, shed, type Body } from '../asteroid/body';
import { K_PER_HEAT } from '../../core/water';
import { thrustOf } from '../asteroid/player';
import { AGE_GOAL, density } from '../asteroid/rules';
import { moonSlots } from '../planet/rules';
import type { Civilization } from '../civilization/stage';
import { createStarHud } from './hud';
import { createColonies } from './colony';
import { createDyson, PER_SEG } from './dyson';
import { createStarView, starPage, type Hauler, type StarView } from './look';
import { YOU } from '../../render/tech';
import { carry, catchPlanet, release, ride, type Planet } from './system';
import {
  capacity, CELL, dysonEnergy, GROW, engineAccel, ENGINE_DRAG, FAR_LIGHT, FIRST, FLARE_DOSE, FLARE_MEAN, FLARE_RISE, FLARE_S, FLARE_X, flareK, flux, glare,
  BAND, inBand, layout, linkStep, liquidBand, ORBIT_RATE, orbitGoal, PLANET_R, PANELS, PULL_X, roche, starMu, starPull, SEGMENTS, STAR_CHANCE, starColor, starKelvin, starMass,
  starName, starRadius, sunlight, tearRate, warmth,
} from './rules';

// Star takeover: created by the planet stage once the civilization has made Star contact. Stars are places: the first
// FIRST away, then one per CELL × CELL cell, each a landmark whose far light shows from screens away.
//   Approach: its light warms your climate and adds to your people's dose; it pulls on you; inside the Roche limit tides
//             strip you; touching it ends the run (`fate`); flares are heat pulses after a visible brightening.
//   Link:     BAND (2–4 R★) for 60 s (decays 2× outside): filaments grow between you and snap when you leave.
//   Control:  your thrust steers the star (engine, stronger with the Dyson sphere); your world rides a kinematic orbit
//             (core/orbits.ts) that eases by itself into the middle of its liquid band. Round worlds it passes slowly
//             join it on outer rings (system.ts), each growing it GROW. Touching another star, the lighter is swallowed:
//             losing yours frees your world (LOST s of grace from the well) to link another.
//   Dyson:    the civilization builds it (dyson.ts); energy = light × coverage feeds the civilization (`dyson`); the glow dims.

type Star = {
  key: string; m: Motion; M: number; K: number; glow: number; R: number; color: number; name: string;
  link: number; owned: boolean; placed: number; segs: number; build?: { t: number; launched: number }; haulers: Hauler[];
  flareNext: number; flareT: number; flareAt: number; view?: StarView; wasIn: boolean;
};

/** What the HUD and the planet stage read each frame. */
export type StarState = {
  name: string; kelvin: number; mass: number; color: number; x: number; // x: your distance in star radii
  link: number; owned: boolean; cover: number; energy: number; band?: [number, number]; warm: number; targeted: boolean;
  wait?: string; // why the Dyson sphere is not building
  fleetWait?: string; // why the next colony fleet waits (colony.ts)
  planets: number; cap: number; colonies: number; // system planets your star carries / can carry, of them colonies
};
type Light = { flux: number; warm: number; dyson: number; sun: number; at: number };

const FLARE_FALL = 1.2; // s the flare fades after its pulse
const EAT_S = 0.25; // s between checks for bodies inside a star
const WARM_X = [12, 8]; // R★: the star's warmth fades in between these (its 1/x tail would warm the whole map)
const NEAR_X = 8; // R★: the Star panel and the target show within this
// In orbit your world stays inside this share of the short half-screen (any direction: the system turns as you orbit), so
// neither sits under a HUD panel (the corner panels lie outside a 0.72 circle).
const SAFE = 0.72;
const LOST = 5; // s after your star is swallowed before the new one's well (pull, tides, surface) acts on you

export function createStarStage(layer: Container, me: Body, renderer: Renderer, kit: Kit, civ: Civilization, news: News) {
  const world = layer.parent ?? layer; // stars sit under the rocks (index 0 of the world)
  const pg = starPage(renderer);
  const hud = createStarHud();
  const salt = hashSeed(Math.floor(me.motion.x), Math.floor(me.motion.y), Math.floor(Math.random() * 2 ** 31));
  const origin = { x: me.motion.x, y: me.motion.y };
  const stars = new Map<string, Star>(), empty = new Set<string>(); // empty: cells without a star (or whose star was swallowed)
  let own: Star | undefined; // your star
  let orbit: Orbit | undefined, eatT = 0, flareDose = 0, fate: string | undefined, state: StarState | undefined;
  let half = Infinity; // the camera's short half-view last frame (world units)
  let lost = 0; // s of grace left after losing your star
  const planets: Planet[] = [];
  const lay = (s: Star) => layout(s.R, me.r, moonSlots(me.m)); // your orbit range and the rings round a star (rules.ts)
  const colonies = createColonies(layer, renderer, me, civ, kit.fx, news);
  const dyson = createDyson(civ, kit, news);

  const make = (key: string, x: number, y: number, rnd: () => number): Star => {
    const s = {
      key, m: { x, y, vx: 0, vy: 0, accel: 0, drag: ENGINE_DRAG }, M: 0, K: 0, glow: 0, R: 0, color: 0, name: '',
      link: 0, owned: false, placed: 0, segs: 0, haulers: [], flareNext: poissonGap(FLARE_MEAN, rnd), flareT: -1, flareAt: 0, wasIn: false,
    };
    return grow(s, starMass(rnd()));
  };
  /** A star of M suns (new, a planet caught, a star swallowed): temperature, light, size, colour and name follow. */
  function grow(s: Star, M: number) {
    [s.M, s.K] = [M, starKelvin(M)];
    [s.glow, s.R, s.color, s.name] = [glare(M), starRadius(M), starColor(s.K), starName(s.K)];
    return s;
  }
  // The first star: FIRST away, toward the emptiest of 8 directions (stars sit in the web's quiet stretches).
  {
    const field = kit.field(), rnd = rng(salt);
    let best = { a: rnd() * Math.PI * 2, fill: Infinity };
    for (let i = 0; i < 8; i++) {
      const a = best.a + (i * Math.PI) / 4, fill = field.fillAt(origin.x + Math.cos(a) * FIRST, origin.y + Math.sin(a) * FIRST);
      if (fill < best.fill) best = { a, fill };
    }
    stars.set('0,0', make('0,0', origin.x + Math.cos(best.a) * FIRST, origin.y + Math.sin(best.a) * FIRST, rnd));
  }
  /** The star of cell (i, j), if it has one (cells are CELL wide, centred on where stars began). */
  function cell(i: number, j: number) {
    const key = `${i},${j}`;
    if (stars.has(key) || empty.has(key) || (i === 0 && j === 0)) return;
    const rnd = rng(hashSeed(i, j, salt));
    if (rnd() > STAR_CHANCE) return void empty.add(key);
    stars.set(key, make(key, origin.x + (i + 0.6 * rnd() - 0.3) * CELL, origin.y + (j + 0.6 * rnd() - 0.3) * CELL, rnd));
  }

  // Your night side: a dark half disc over your sphere, turned away from the star.
  const shade = new Sprite({ texture: pg.shadow, anchor: 0.5 });
  layer.addChildAt(shade, Math.min(layer.children.length, layer.getChildIndex(me.view) + 1));

  function snap(s: Star) {
    for (const p of s.view?.strandPoints() ?? []) {
      if (Math.random() > 0.5) continue;
      const a = Math.random() * Math.PI * 2, v = s.R * (0.3 + Math.random() * 0.6);
      kit.fx.ember(p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, s.R * 0.05, Math.random() < 0.5 ? s.color : YOU, 0.6 + Math.random() * 0.5);
    }
    kit.sfx.play('crack', 0.35, 1.6);
  }

  function control(s: Star) {
    s.owned = true;
    own = s;
    s.link = 1;
    const rx = me.motion.x - s.m.x, ry = me.motion.y - s.m.y, d = Math.hypot(rx, ry);
    const [lo, hi] = lay(s).orbit;
    orbit = capture(rx, ry, me.motion.vx - s.m.vx, me.motion.vy - s.m.vy, clamp(d, lo * s.R, hi * s.R));
    kit.fx.flash(s.m.x, s.m.y, s.R * 3, 30, s.R * 2);
    kit.sfx.play('boom', 0.8, 0.6);
    kit.sfx.play('link', 1, 1);
    news('starlink', 'Star linked', `The ${s.name.toLowerCase()} is yours · your thrust steers it · your world finds its seas' orbit by itself`);
  }

  /** Two stars touch: the heavier swallows the lighter (fun first: it keeps both masses). Yours lost: your world flies free. */
  function merge(a: Star, b: Star) {
    const [w, l] = a.M >= b.M ? [a, b] : [b, a], yours = l.owned;
    grow(w, w.M + l.M);
    l.view?.destroy();
    [l.view, l.owned] = [undefined, false];
    stars.delete(l.key);
    empty.add(l.key);
    kit.fx.flash(w.m.x, w.m.y, w.R * 5, 40, w.R * 4);
    kit.sfx.play('boom', 1, 0.4);
    if (w.owned) return news('swallow', 'A star swallowed', `Your ${w.name.toLowerCase()} took in a ${l.name.toLowerCase()} · it grows`);
    if (!yours) return;
    own = undefined;
    colonies.release(planets);
    release(planets);
    orbit = undefined;
    lost = LOST;
    const pm = me.motion, dx = pm.x - w.m.x, dy = pm.y - w.m.y, d = Math.hypot(dx, dy) || 1;
    [pm.vx, pm.vy] = [(dx / d) * 2 * w.R, (dy / d) * 2 * w.R]; // the blast throws you clear of it
    news('starlost', 'Star lost', `Your star fell into a ${w.name.toLowerCase()} · while your world lives, link another`);
  }

  /** A star's gravity on loose bodies (starPull, out to PULL_X R★): they fall in and burn. */
  function pull(s: Star, dt: number) {
    const reach = PULL_X * s.R, g = starMu(s.M) * dt;
    for (const b of kit.field().bodies) {
      if (!b.m || b.moon || b.held) continue;
      const dx = s.m.x - b.motion.x, dy = s.m.y - b.motion.y, d2 = dx * dx + dy * dy;
      if (d2 > reach * reach) continue;
      const d = Math.sqrt(d2) || 1, a = g / Math.max(d2, s.R * s.R);
      b.motion.vx += (dx / d) * a;
      b.motion.vy += (dy / d) * a;
    }
  }

  /** Bodies that fall into a star burn up (checked every EAT_S s). */
  function eat(s: Star) {
    for (const b of kit.field().bodies) {
      if (!b.m || b.moon || b.held) continue;
      const d = Math.hypot(b.motion.x - s.m.x, b.motion.y - s.m.y);
      if (d > s.R + 0.3 * b.r) continue;
      kit.fx.flash(b.motion.x, b.motion.y, Math.max(b.r * 3, s.R * 0.08), 6, b.r * 2);
      drop(b);
    }
  }

  /** Sprites only for stars whose far light can reach you (and yours); only the star you are at links. */
  function views(near: Star | undefined, dt: number) {
    const pm = me.motion;
    for (const s of stars.values()) {
      const reach = Math.hypot(pm.x - s.m.x, pm.y - s.m.y) < FAR_LIGHT + s.R; // within its far light
      if ((reach || s.owned) && !s.view) s.view = createStarView(world, pg);
      else if (!reach && !s.owned && s.view) {
        s.view.destroy();
        s.view = undefined;
      }
      if (s !== near) s.link = linkStep(s.link, Infinity, dt);
    }
  }

  /** At the nearest star: its light, then its well and link (not yours) or your orbit (yours), then flares. Returns your distance in R★. */
  function visit(s: Star, out: Light, dt: number, zoom: number, pressure: number, rocheX: number) {
    const pm = me.motion, dx = s.m.x - pm.x, dy = s.m.y - pm.y, d = Math.hypot(dx, dy) || 1, cover = s.placed / PANELS;
    let x = d / s.R;
    // Light: flux (dose; × FLARE_DOSE for a while after an unshielded flare), warmth (climate), sunlight (solar), Dyson energy.
    flareDose = Math.max(0, flareDose - dt);
    const F = flux(s.glow, cover, x);
    out.flux = x < 10 ? F * (flareDose > 0 ? FLARE_DOSE : 1) : 0;
    out.warm = warmth(s.glow, cover, x) * smoothstep(WARM_X[0], WARM_X[1], x);
    [out.sun, out.at] = [sunlight(s.glow, cover, x), Math.atan2(dy, dx)]; // starlight on your solar farms, bearing to the star
    out.dyson = s.owned ? dysonEnergy(s.M, cover) : 0;
    lost = Math.max(0, lost - dt);
    if (!s.owned) approach(s, dx, dy, d, x, rocheX, dt);
    else if (orbit) x = steer(s, orbit, cover, dt, zoom, pressure);
    flare(s, dx, dy, d, x, cover, dt);
    return x;
  }

  /** The well: a pull toward it, tides inside the Roche limit, the end at its surface (none just after your star was lost); the link. */
  function approach(s: Star, dx: number, dy: number, d: number, x: number, rocheX: number, dt: number) {
    const pm = me.motion;
    const a = lost > 0 || x >= PULL_X ? 0 : starPull(starMu(s.M), d, s.R) * dt;
    pm.vx += (dx / d) * a;
    pm.vy += (dy / d) * a;
    const tear = lost > 0 ? 0 : tearRate(x, rocheX);
    if (tear > 0) {
      shed(me, me.m * Math.min(0.5, tear * dt));
      for (let i = 0; i < 3; i++) {
        const j = () => (Math.random() - 0.5) * me.r;
        kit.fx.trail(pm.x + (dx / d) * me.r + j(), pm.y + (dy / d) * me.r + j(), pm.vx + (dx / d) * me.r * 3, pm.vy + (dy / d) * me.r * 3, me.r * 0.25, me.tint);
      }
      news('roche', 'Roche limit', 'Tides are tearing your world apart · climb out');
    }
    if (!lost && d < s.R + 0.3 * me.r) fate = `Fell into a ${s.name.toLowerCase()}`;
    else if (tear > 0 && me.m < 0.25 * AGE_GOAL) fate = `Torn apart by a ${s.name.toLowerCase()}'s tides`;
    // The link: automatic in the band; filaments snap when you leave it.
    const was = s.link;
    s.link = linkStep(s.link, x, dt);
    const now = inBand(x);
    if (s.wasIn && !now && was > 0.05) snap(s);
    s.wasIn = now;
    if (now && was === 0) news('linking', 'Linking', `Stay ${BAND[0]}–${BAND[1]} radii from the ${s.name.toLowerCase()} for a minute`);
    if (s.link >= 1) control(s);
  }

  /** Your thrust steers the star; your world rides its orbit round it, easing into the middle of its liquid band. Returns your distance in R★. */
  function steer(s: Star, o: Orbit, cover: number, dt: number, zoom: number, pressure: number) {
    const pm = me.motion;
    s.m.accel = engineAccel(thrustOf(me), dysonEnergy(s.M, cover));
    step(s.m, kit.input.axis(), dt);
    const band = liquidBand(pressure, s.glow, cover);
    const L = lay(s), at = o.target / s.R, goal = band ? orbitGoal(band, L.orbit) : clamp(at, ...L.orbit); // the range moves as your moons grow
    ride(o, pm, s, starMu(s.M), goal, ORBIT_RATE, dt);
    me.view.position.set(pm.x, pm.y);
    colonies.update(dt, zoom, planets, s, cover, at, [L.orbit[0], L.ring(capacity(s.M) - 1, at)], L.reach, kit.field().bodies);
    carry(planets, s, starMu(s.M), dt, (k) => L.ring(k, at));
    dyson.update(s, pm, colonies.speed, dt); // more living planets build faster (concept 4)
    return o.dist / s.R;
  }

  /** Flares: the star brightens and a prominence rises on its limb, then the pulse. */
  function flare(s: Star, dx: number, dy: number, d: number, x: number, cover: number, dt: number) {
    if (s.flareT < 0 && (s.owned || x < 1.5 * FLARE_X) && (s.flareNext -= dt) <= 0) [s.flareT, s.flareAt] = [0, Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 2];
    if (s.flareT < 0) return;
    const before = s.flareT, pm = me.motion;
    s.flareT += dt;
    if (before < FLARE_RISE && s.flareT >= FLARE_RISE) {
      const kelvin = flareK(s.glow, cover, x);
      kit.fx.flash(s.m.x + Math.cos(s.flareAt) * s.R, s.m.y + Math.sin(s.flareAt) * s.R, s.R * 1.2, 16, s.R);
      if (kelvin > 0.5 && !civ.shieldTake(kelvin, pm.x - (dx / d) * me.r, pm.y - (dy / d) * me.r)) {
        me.heat += kelvin / K_PER_HEAT;
        flareDose = FLARE_S;
      }
    }
    if (s.flareT >= FLARE_RISE + FLARE_FALL) [s.flareT, s.flareNext] = [-1, poissonGap(FLARE_MEAN, Math.random)];
  }

  /** Stars pull each other too (one gravity): yours moves by its engine step, the rest drift free; touching, one swallows the other. */
  function gravity(dt: number) {
    const shown = [...stars.values()].filter((s) => s.view);
    for (const s of shown) {
      pull(s, dt);
      for (const o of shown) if (o !== s && s.view && o.view) {
        const dx = o.m.x - s.m.x, dy = o.m.y - s.m.y, d = Math.hypot(dx, dy) || 1;
        if (d < o.R + s.R) merge(s, o);
        else [s.m.vx, s.m.vy] = [s.m.vx + (dx / d) * starPull(starMu(o.M), d, s.R) * dt, s.m.vy + (dy / d) * starPull(starMu(o.M), d, s.R) * dt];
      }
      if (!s.owned) [s.m.x, s.m.y] = [s.m.x + s.m.vx * dt, s.m.y + s.m.vy * dt];
    }
  }

  /** Every EAT_S s: bodies inside a star burn; `yours` (your star at the frame's start) catches a passing planet. */
  function sweep(yours: Star | undefined, dt: number) {
    if ((eatT -= dt) > 0) return;
    eatT = EAT_S;
    for (const s of stars.values()) if (s.view) eat(s);
    if (yours?.owned && orbit && catchPlanet(planets, yours, starMu(yours.M), kit.field().bodies, orbit.dir, lay(yours).catch(orbit.target / yours.R))) {
      const b = planets[planets.length - 1].b;
      grow(yours, yours.M * (1 + GROW));
      kit.fx.flash(b.motion.x, b.motion.y, b.r * 3, 8, b.r * 2);
      news('planet', 'A planet joins your star', `It rides an outer ring · each planet grows the star · ${planets.length}/${capacity(yours.M)}`);
    }
  }

  /** The star sprites, and your night side facing away from the star (fades in within ~12 R★). */
  function draw(near: Star | undefined, x: number, dt: number, zoom: number) {
    const pm = me.motion, screenHalf = Math.min(kit.canvas.clientWidth || innerWidth, kit.canvas.clientHeight || innerHeight) / 2;
    half = screenHalf / zoom;
    for (const s of stars.values()) {
      if (!s.view) continue;
      const f = s.flareT < 0 ? 0 : s.flareT < FLARE_RISE ? s.flareT / FLARE_RISE : 1 - (s.flareT - FLARE_RISE) / FLARE_FALL;
      const linking = s === near && (s.owned || s.link > 0.002);
      s.view.update(dt, {
        x: s.m.x, y: s.m.y, R: s.R, color: s.color, K: s.K, glow: s.glow, zoom, screenHalf, dist: Math.hypot(pm.x - s.m.x, pm.y - s.m.y), placed: s.placed, link: s.link, owned: s.owned,
        flare: clamp(f, 0, 1), flareAt: s.flareAt, you: linking ? { x: pm.x, y: pm.y, r: me.r } : undefined,
      }, s.haulers);
    }
    shade.visible = !!near && x < 16;
    if (!near) return;
    shade.position.set(pm.x, pm.y);
    shade.rotation = Math.atan2(pm.y - near.m.y, pm.x - near.m.x);
    shade.scale.set((me.r * 1.02) / 64);
    shade.alpha = 0.8 * smoothstep(16, 8, x);
  }

  /** The Star panel and what the planet stage reads. */
  function report(near: Star | undefined, x: number, out: Light, aimed: boolean, pressure: number, real: number) {
    if (!near) return hud.update(real, undefined, false);
    const cover = near.placed / PANELS;
    state = {
      name: near.name, kelvin: near.K, mass: near.M, color: near.color, x, link: near.link, owned: near.owned, cover,
      energy: near.owned ? dysonEnergy(near.M, cover) : 0, band: liquidBand(pressure, near.glow, cover), warm: out.warm, targeted: !aimed && x < NEAR_X,
      wait: near.owned ? dyson.wait : undefined, fleetWait: near.owned ? colonies.wait : undefined, planets: near.owned ? planets.length : 0, cap: capacity(near.M), colonies: colonies.count,
    };
    hud.update(real, state, x < NEAR_X || near.owned);
  }

  return {
    get state() {
      return state;
    },
    /** Set when the star ended the run (main.ts reads it through the planet stage). */
    get fate() {
      return fate;
    },
    /** Your star, if any. */
    get own() {
      return own;
    },
    /** Half the world (units) the camera should keep in view around you: the nearest star and its glow (0: none). */
    fit() {
      const s = own ?? nearest();
      if (!s?.view) return 0;
      const d = Math.hypot(me.motion.x - s.m.x, me.motion.y - s.m.y), x = d / s.R;
      if (!s.owned) return smoothstep(8, 5, x) * (d + 1.15 * s.R);
      // In orbit the camera follows your star (focus): keep your world, its moons and your planets round it on the short screen side.
      const W = kit.canvas.clientWidth || innerWidth, H = kit.canvas.clientHeight || innerHeight;
      const L = lay(s), edge = planets.length ? (Math.max(...planets.map((p) => p.goal ?? L.ring(p.ring, x))) + PLANET_R) * s.R : 0;
      return (Math.max(d + L.reach * s.R, edge) / SAFE) * (Math.max(W, H) / Math.min(W, H));
    },
    /** In orbit: the camera follows your star, shifted toward your world only as far as keeps it in view when the system outgrows the zoom-out cap. */
    focus(): Motion | undefined {
      const s = own;
      if (!s || !me.m) return undefined;
      const pm = me.motion, d = Math.hypot(pm.x - s.m.x, pm.y - s.m.y) || 1, k = clamp((d + 2 * me.r - SAFE * half) / d, 0, 1);
      return k ? { x: s.m.x + (pm.x - s.m.x) * k, y: s.m.y + (pm.y - s.m.y) * k, vx: s.m.vx + (pm.vx - s.m.vx) * k, vy: s.m.vy + (pm.vy - s.m.vy) * k, accel: 0, drag: 0 } : s.m;
    },
    /** Debug window (main.ts): 'link' the nearest star now, 'dyson' adds a quarter of the sphere, a number sets the star's mass (suns). Returns why it could not. */
    debug(cmd: string): string | undefined {
      const s = own ?? nearest();
      if (!s || !me.m) return 'No star near';
      if (cmd === 'link') {
        if (own) return 'Already linked';
        const a = Math.atan2(me.motion.y - s.m.y, me.motion.x - s.m.x);
        [me.motion.x, me.motion.y, me.motion.vx, me.motion.vy] = [s.m.x + Math.cos(a) * 3 * s.R, s.m.y + Math.sin(a) * 3 * s.R, s.m.vx, s.m.vy];
        control(s);
      } else if (cmd === 'dyson') {
        if (!own) return 'Link a star first';
        s.segs = Math.min(SEGMENTS, s.segs + Math.ceil(SEGMENTS / 4));
        s.placed = Math.max(s.placed, s.segs * PER_SEG);
        [s.build, s.haulers.length] = [undefined, 0]; // a segment in flight would land past the sphere
      } else grow(s, Number(cmd));
    },
    /** Your system planets (test hook). */
    planets,
    /**
     * `aimed`: the HUD has a body target (the star shows in the target panel only without one); `pressure`: your air (atm).
     * Returns what the planet stage passes on: `flux` (dose), `warm` (kelvin added to the climate), `dyson` (E/s), `sun` (sunlight) and `at` (bearing to the star).
     */
    update(dt: number, real: number, zoom: number, aimed: boolean, pressure: number) {
      const out: Light = { flux: 0, warm: 0, dyson: 0, sun: 0, at: 0 };
      if (!me.m) return out;
      const pm = me.motion, ci = Math.round((pm.x - origin.x) / CELL), cj = Math.round((pm.y - origin.y) / CELL);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) cell(i, j);
      const yours = own, near = yours ?? nearest(), rocheX = roche(density(me.comp));
      views(near, dt);
      const x = near ? visit(near, out, dt, zoom, pressure, rocheX) : Infinity;
      gravity(dt);
      sweep(yours, dt);
      draw(near, x, dt, zoom);
      report(near, x, out, aimed, pressure, real);
      return out;
    },
    destroy() {
      for (const s of stars.values()) s.view?.destroy();
      colonies.destroy();
      release(planets);
      if (!shade.destroyed) shade.destroy();
      hud.destroy();
    },
  };

  function nearest() {
    let best: Star | undefined, bx = Infinity;
    for (const s of stars.values()) {
      const x = Math.hypot(me.motion.x - s.m.x, me.motion.y - s.m.y) / s.R;
      if (x < bx) [best, bx] = [s, x];
    }
    return best;
  }
}
