import type { Kit } from '../../kit';
import type { News } from '../../ui/toast';
import { Container, Graphics, ParticleContainer, type Renderer, type Texture } from 'pixi.js';
import type { Vec } from '../../core/entity';
import { K_PER_HEAT, pressure } from '../../core/water';
import type { Sfx } from '../../audio/sfx';
import { dashRing, FAR_BOUNDS, type Fx } from '../../render/fx';
import { AMBER, drawShip, quads, shipR, shipUnit, STEEL, techPage, VIOLET, YOU, type TechPage } from '../../render/tech';
import { createReadout } from '../../ui/reticle';
import { drop, shatter, shed, type Body } from '../asteroid/body';
import type { createAsteroidField } from '../asteroid/field';
import { G_WORLD, pieceShares, SPREAD } from '../asteroid/rules';
import type { Moons } from '../planet/moons';
/** What combat reads of your moons (planet/moons.ts); Age I has none (NO_MOONS) until the planet stage attaches them. */
type MoonsView = Pick<Moons, 'list' | 'owns'>;
const NO_MOONS: MoonsView = { list: () => [], owns: () => false };
import type { Beam } from '../star/stage';
import { bumps } from './crash';
import { SPECK } from './flight';
import { createMissiles, createShots, MAX_GLOW, type Hull, type Missiles, type Shots, type Team } from './guns';
import { drawBolts, heavy } from './bolts';
import { createPirates } from './pirates';
import { createRivals } from './rivals';
import { ARMS, BEAM_COOL, beamLeft, chargeRate, DRIVER_COOL, fireDir, SLUG_E, SLUG_ORE, SLUG_SPEED } from './rules';
import { foeOf, lose, type Foe, type Ship } from './ships';
import type { Civilization } from './stage';
import { breakMark, createSlugs, type Mark, type Shielded } from './weapon';

// Combat: the mass driver, rival civilizations and the pirate fleet. Created with the planet stage (and in Age I by
// main.ts, for roaming pirates only); the driver and rivals wait for a civilization.
//   Fire: the mass driver only (nothing before LIFE): a slug flies at the cursor (Space: the HUD target) for SLUG_ORE u of ore and SLUG_E of charge, at most every DRIVER_COOL s. The
//         cooldown and charge show as the reticle's ring; on touch a thin arc on your halo. From Dyson 20% (star/stage.ts
//         `beam`) an energy beam replaces the slug: no ore, every BEAM_COOL s, paid in star mass.
//   Your priority target (civilization/stage.ts order) shows as four turning cyan arcs round its body; a priority world under
//   siege keeps its siege ring. The rival world your sortie goes for is your priority, else your HUD target, else the nearest.
//   Contacts run in the field's `contacts` hook (main.ts), after the field's own collisions: slugs, every ship's rounds
//   (ctx.shots, guns.ts), every ship touching bodies (yours and rival home patrols graze or wreck; ships away die).
//   Hits on rival worlds come through `hit` (main.ts onHit), so shields and people react to any body.
// Drawing: one ParticleContainer on the tech page (ships), one additive one over it (rounds, missiles, slugs, muzzle
// flashes, charging glows: guns.ts BOLT, never under a few screen px), the rivals' additive veils and ripples, one Graphics
// for tractor lines, the beam and the touch arc. A burst on screen makes a quiet sound; hits light up in the gun's tint.

type Field = ReturnType<typeof createAsteroidField>;
/** The camera this frame (world centre and half sizes in world units). */
// halfW/halfH: the game area (spawns, sight, leash, leave: never shrunk by zooming in); seenW/seenH: what is on screen.
type Cam = { x: number; y: number; halfW: number; halfH: number; seenW: number; seenH: number; zoom: number };
/** What rivals and pirates share. */
export type Ctx = {
  me: Body; fx: Fx; page: TechPage; slugs: ReturnType<typeof createSlugs>; root: Container; lines: Graphics;
  field: () => Field | undefined; sfx: () => Sfx | undefined; news: News;
  cam: Cam; near: Body[]; civ?: Civilization; moons: MoonsView; mine: Foe[]; // your defence ships as foes, this frame
  shots: Shots; // every ship's rounds in flight
  missiles: Missiles; // every silo's missiles in flight
  miners: Foe[]; // your miner shuttles as foes, this frame
  /** One particle this frame; `size` world units across; `long` stretches it along `rot` (streaks). */
  put: (tex: Texture, x: number, y: number, rot: number, size: number, tint: number, alpha: number, long?: number) => void;
  kill: (b: Body) => void; // a body is gone (the field drops it)
  shed: (b: Body, dm: number) => void; // a body loses mass dm (asteroid/body.ts)
  wreck: (x: number, y: number, tint: number, pitch: number) => void; // a ship breaks up: a flash, a burst in its tint, a crack
  draw: (cls: 'raider' | 'hauler' | 'marauder', x: number, y: number, heading: number, burn: number, bank: number) => void; // a pirate ship this frame
  onScreen: (x: number, y: number, r?: number) => boolean;
  diag: () => number; shipR: () => number; // the camera's half-diagonal; a ship's hit and touch radius (render/tech.ts shipR)
};

const MAX_PARTS = 600;
const BEAM_PAST = 3; // your radii the beam runs past the aim point
const BEAM_W = 0.15; // your radii: half-width of the beam for ships
const BEAM_SHOW = 0.45; // s the beam line fades over
const BURST_SOUND = 0.25; // s: at most one burst sound this often
const KICK_S = 0.12; // s a slug's shock ring spreads on your surface

export function createCombat(layer: Container, me: Body, renderer: Renderer, kit: Kit, news: News, moons: MoonsView = NO_MOONS) {
  const root = new Container(), lines = new Graphics();
  let page: TechPage | undefined, pc: ParticleContainer | undefined, quad: ReturnType<typeof quads> | undefined, glowPc: ParticleContainer | undefined, glow: ReturnType<typeof quads> | undefined;
  layer.addChild(root, lines);
  const slugs = createSlugs(kit.fx);
  const shots = createShots(), missiles = createMissiles(ARMS.missile.max);
  let clock = 0, heard = -1;
  const readout = createReadout(kit.canvas, kit.input);
  const mineFoes = new WeakMap<Ship, Foe>();
  let cool = 0, charge = SLUG_E;
  const shot = { ux: 0, uy: 0, x: 0, y: 0, t: 0, hr: 0 }; // the last beam: direction, end point, s left on screen, radius of what it hit
  const kick = { t: 0, a: 0 }; // the last slug's shock ring on your surface: s left, its bearing

  const ctx: Ctx = {
    me, fx: kit.fx, get page() {
      if (!page) {
        page = techPage(renderer);
        const mk = () => new ParticleContainer({ texture: page!.source, boundsArea: FAR_BOUNDS, dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true } });
        [pc, glowPc] = [mk(), mk()];
        glowPc.blendMode = 'add';
        layer.addChild(pc, glowPc);
        [quad, glow] = [quads(pc, MAX_PARTS), quads(glowPc, MAX_GLOW)];
      }
      return page;
    },
    slugs, root, lines, field: kit.field, sfx: () => kit.sfx, news,
    cam: { x: 0, y: 0, halfW: 1, halfH: 1, seenW: 1, seenH: 1, zoom: 1 }, near: [], moons, mine: [], miners: [], shots, missiles,
    put: (tex, x, y, rot, size, tint, alpha, long) => quad?.put(tex, x, y, rot, size, tint, alpha, long),
    kill: drop,
    shed,
    wreck(x, y, tint, pitch) {
      const sr = ctx.shipR();
      kit.fx.flash(x, y, Math.max(sr * 3, 12 / ctx.cam.zoom), 8, sr * 6);
      kit.fx.burst(x, y, 10, sr * 0.5, sr * 6, tint);
      ctx.sfx()?.play('crack', 0.2, pitch);
    },
    draw: (cls, x, y, heading, burn, bank) => drawShip(ctx.put, ctx.page, 'pirate', cls, x, y, heading, shipUnit(me.r, ctx.cam.zoom), burn, 1, bank),
    onScreen(x, y, r = 0) {
      const c = ctx.cam;
      return Math.abs(x - c.x) < c.seenW + r && Math.abs(y - c.y) < c.seenH + r;
    },
    diag: () => Math.hypot(ctx.cam.halfW, ctx.cam.halfH),
    shipR: () => shipR(me.r, ctx.cam.zoom),
  };
  const rivals = createRivals(ctx);
  const pirates = createPirates(ctx, rivals);

  /** Your world as a slug sees it: the civilization's shield, then your air. */
  const yourWorld = (): Shielded => ({ body: me, shield: (k, share, x, y) => ctx.civ?.shieldTake(k, share, x, y) ?? false, p: pressure(me.m, me.comp.gas ?? 0) });
  /** Missiles of the other side than `team`, still flying (foes, marks). */
  const enemyMissiles = (team: Team) => missiles.live.filter((m) => m.team !== team && !m.dead);

  return {
    rivals,
    pirates,
    slugs,
    shots,
    missiles,
    /** Wrecks, grazes and sparked near misses by faction (dev counter: window.__g().combat.bumps). */
    bumps,
    /** `life` = the life stage index (−1 none), `civ` the civilization if any, `aimTarget` the HUD target (Space), `beam` your star's. */
    update(dt: number, near: Body[], zoom: number, aimTarget: () => Body | undefined, life: number, civ: Civilization | undefined, beam?: Beam) {
      quad?.begin();
      glow?.begin();
      clock += dt;
      lines.clear();
      const v = kit.view, a = kit.area;
      const seenW = innerWidth / 2 / v.zoom, seenH = innerHeight / 2 / v.zoom; // the canvas fills the window; clientWidth would force a layout
      Object.assign(ctx.cam, { x: v.x, y: v.y, zoom: v.zoom, seenW, seenH, halfW: Math.max(seenW, a.halfW), halfH: Math.max(seenH, a.halfH) });
      [ctx.near, ctx.civ] = [near, civ];
      // Your defence ships as foes for the enemy (stable objects: ships.ts keeps hunting the same one).
      ctx.mine = [...(civ?.ships ?? []), ...(civ?.frigates ?? [])].map((s) => foeOf(s, me, mineFoes, lose));
      ctx.miners = civ?.miners() ?? [];
      for (const q of ctx.miners) q.cls = 'miner';
      civ?.arm({ missiles, foe: (prefer) => rivals.foe(prefer ?? aimTarget()) }); // your priority (stage.ts), else your target
      if (me.m && (civ || life >= 0 || slugs.live.length)) void ctx.page; // bakes the tech page once

      // The mass driver, or from Dyson 20% the energy beam.
      const driver = !!civ?.state?.active && me.m > 0, beamK = (driver && beam?.k) || 0;
      if (beamK) news('beam', 'Energy beam', 'Fire burns starlight now · no ore · each shot costs your star a little mass');
      if (driver) {
        cool = Math.max(0, cool - dt);
        charge = Math.min(SLUG_E, charge + chargeRate(civ!.state!.energy, civ!.state!.need) * dt);
        const at = readout.at(kit.input.fire(), () => aimTarget()?.motion);
        if (at && !cool && beamK) {
          fireBeam(at, beamK, beam!.bite * me.m);
          beam!.burn();
          cool = BEAM_COOL;
          kit.sfx.play('beam', 0.6, 1);
        } else if (at && !cool && charge >= SLUG_E) {
          if (civ!.spend(SLUG_ORE)) {
            const dir = fireDir(at.x - me.motion.x, at.y - me.motion.y, me.motion.vx, me.motion.vy, SLUG_SPEED * 2 * me.r);
            slugs.fire(me, dir, oreMix(me), STEEL, false);
            [cool, charge, kick.t, kick.a] = [DRIVER_COOL, charge - SLUG_E, KICK_S, Math.atan2(dir.y, dir.x)];
            kit.sfx.play('boom', 0.3, 1.6);
            news('driver1', 'Mass driver', `Left-click fires an ore slug · ${SLUG_ORE} ore · it strips shields, ships and small moons`);
          } else kit.fx.note(at.x, at.y, 'No ore', 1 / zoom);
        } else if (at && !cool && !beamK) kit.fx.note(at.x, at.y, 'Charging', 1 / zoom);
      }
      const ready = !driver ? 1 : beamK ? 1 - cool / BEAM_COOL : Math.min(1 - cool / DRIVER_COOL, charge / SLUG_E) * ((civ?.stocks.ore ?? 0) >= SLUG_ORE ? 1 : 0.999);
      readout.update(driver, ready, lines, me.motion.x, me.motion.y, me.r * 1.3, 2 / zoom, YOU);
      if ((kick.t -= dt) > 0 && me.m) { // a slug's thump: a steel shock ring spreading from the muzzle
        const k = 1 - kick.t / KICK_S;
        lines.circle(me.motion.x + Math.cos(kick.a) * me.r, me.motion.y + Math.sin(kick.a) * me.r, me.r * (0.1 + 0.6 * k)).stroke({ width: Math.max(2.5 / zoom, 0.04 * me.r), color: STEEL, alpha: 0.85 * (1 - k) });
      }
      // The beam: two cyan glows round a white core from your surface to where it stopped, narrowing as it fades, with a
      // glow at each end.
      if (shot.t > 0 && me.m) {
        const a = Math.max(0, (shot.t -= dt) / BEAM_SHOW), k = 0.4 + 0.6 * a, x0 = me.motion.x + shot.ux * me.r, y0 = me.motion.y + shot.uy * me.r;
        for (const [px, r, color, alpha] of [[18, 0.5, YOU, 0.18], [8, 0.22, YOU, 0.5], [3, 0.08, 0xffffff, 1]])
          lines.moveTo(x0, y0).lineTo(shot.x, shot.y).stroke({ width: Math.max(px / zoom, r * me.r) * k, color, alpha: alpha * a });
        if (page) {
          glow?.put(page.dot, x0, y0, 0, Math.max(40 / zoom, 0.8 * me.r), YOU, a);
          glow?.put(page.dot, shot.x, shot.y, 0, Math.max(50 / zoom, 0.5 * shot.hr), YOU, a);
        }
      }

      // Your siege: a faint continuous cyan circle on the ring your fighters fly round the enemy world (slot hints are dashed).
      const sg = civ?.sortie;
      if (sg && me.m) lines.circle(sg.world.motion.x, sg.world.motion.y, sg.ring).stroke({ width: 1.5 / zoom, color: YOU, alpha: 0.18 });
      const pr = civ?.priority, od = pr?.t, ob = od && 'motion' in od ? od : undefined, wait = pr?.wait; // your priority: four cyan arcs turning round it (a ship too; dim and slow while no weapon is ready or reloading), no text
      if (od && od !== sg?.world && me.m) dashRing(lines, ob ? ob.motion.x : (od as Foe).x, ob ? ob.motion.y : (od as Foe).y, ob ? 1.6 * ob.r : 3 * ctx.shipR(), 4, clock * (wait ? 0.5 : 1.5), 0.45, 1.5 / zoom, YOU, wait ? 0.25 : 0.55);
      rivals.update(dt, civ);
      pirates.update(dt, civ);

      // A burst on screen: a quiet sound (heavy guns lower and louder), at most every BURST_SOUND s.
      for (const m of shots.muzzles) if (clock - heard >= BURST_SOUND && ctx.onScreen(m.x, m.y)) {
        heard = clock;
        kit.sfx.play('shot', heavy(m.gun) ? 0.45 : 0.3, heavy(m.gun) ? 0.5 : 1);
      }
      shots.muzzles.length = 0;
      if (page && glow) drawBolts({ add: glow.put, dot: page.dot, unit: shipUnit(me.r, v.zoom), zoom: v.zoom, me, shots, missiles, slugs: slugs.live, dt, onScreen: ctx.onScreen, fx: kit.fx, civ, sr: ctx.shipR() });
      quad?.end();
      glow?.end();
    },
    /** After the field's collisions (field.update `contacts`): slugs hit; ships touching bodies graze or wreck (enemies away: die). */
    contacts(dt: number) {
      const f = ctx.field();
      if (!f) return;
      const bodies = me.m ? [me, ...ctx.near] : ctx.near;
      const worlds = [...(me.m ? [yourWorld()] : []), ...rivals.worlds()];
      const r = ctx.shipR();
      const enemy = [...rivals.marks(), ...pirates.marks(), ...enemyMissiles('you').map((m) => ({ x: m.x, y: m.y, r, kill: m.kill }))]; // your slugs shoot missiles down too
      slugs.contacts(dt, bodies, worlds, (s): Mark[] => (s.foe ? [] : enemy), f.events, (s, b) => (s.foe ? rivals.own(s, b) : b.moon === true)); // your moons and your star's planets
      // Every ship of every side is a hull to rounds and missiles; a missile is a smaller hull to rounds (ARMS.missile.size).
      const hulls: Hull[] = [];
      const add = (list: readonly Foe[], team: Team) => list.forEach((q) => hulls.push({ x: q.x, y: q.y, vx: q.vx, vy: q.vy, r, team, kill: q.kill }));
      add(ctx.mine, 'you');
      add(ctx.miners, 'you');
      add(rivals.foes(), 'rival');
      add(pirates.foes(), 'pirate');
      const z = ctx.cam.zoom;
      // A missile's end: a burst lights up wide in the side's tint; one shot down or burnt out flares like a round's hit.
      if (missiles.live.length) missiles.step(dt, bodies, hulls, SPECK * r, rivals.missileHit, (m, x, y, burst) => {
        if (!ctx.onScreen(x, y, me.r)) return;
        const tint = m.team === 'you' ? AMBER : VIOLET;
        if (burst) blaze(x, y, Math.max(0.6 * me.r, 26 / z), Math.max(0.9 * me.r, 36 / z), 0.35, tint, 12, 0, Math.PI);
        else blaze(x, y, Math.max(1.5 * r, 6 / z), Math.max(2.5 * r, 9 / z), 0.22, tint, 4, 0, Math.PI);
        kit.fx.burst(x, y, burst ? 16 : 6, r * 0.5, burst ? m.blast : r * 4, tint);
        if (burst) ctx.sfx()?.play('boom', m.look === 'rocket' ? 0.22 : 0.35, m.look === 'rocket' ? 1.4 : 1);
      });
      if (shots.n) {
        for (const m of missiles.live) if (!m.dead) hulls.push({ x: m.x, y: m.y, vx: m.vx, vy: m.vy, r: r * ARMS.missile.size, team: m.team, kill: m.kill });
        // A round's hit: a hot flash, light in the gun's tint and sparks thrown back along its path (lances and shells 2.2 ×);
        // a ship (or a missile) also breaks up in a burst.
        shots.step(dt, bodies, hulls, SPECK * r, (s, x, y, ship) => {
          if (!ctx.onScreen(x, y, 4 * r)) return;
          const k = heavy(s.gun) ? 2.2 : 1;
          blaze(x, y, Math.max(1.5 * r * k, (6 * k) / z), Math.max(2.5 * r * k, (9 * k) / z), 0.22, s.gun.tint, ship || s.gun.look === 'lance' ? 8 : 4, Math.atan2(me.motion.vy - s.vy, me.motion.vx - s.vx), 0.9);
          if (ship) kit.fx.burst(x, y, 10, Math.max(0.5 * r, 2 / z), r * 5, 0xffc890);
        });
      }
      ctx.civ?.crashes(bodies, ctx.shipR(), dt, ctx.onScreen, (v, p) => ctx.sfx()?.play('crack', v, p));
      rivals.contacts(bodies, dt);
      pirates.contacts(bodies, dt);
    },
    /** Enemy ships your defence ships hunt (civ.update's `foes`). */
    foes: (): Foe[] => [...rivals.foes(), ...pirates.foes(), ...enemyMissiles('you')],
    /** A field hit (main.ts onHit, any actor): rival worlds' shields and people. */
    hit: rivals.hit,
    destroy() {
      rivals.destroy();
      pirates.destroy();
      slugs.clear();
      shots.clear();
      missiles.clear();
      readout.destroy();
      root.destroy({ children: true });
      lines.destroy();
      pc?.destroy();
      glowPc?.destroy();
    },
    /** Age II takes over (planet/stage.ts): its moons. */
    attach(m: Moons) {
      [moons, ctx.moons] = [m, m];
    },
  };

  /** A hit's light: a hot flash `f` across, a glow `l` in `tint` for `life` s, `n` sparks within ±`fan` rad of `a` (≥ 1.5 px). */
  function blaze(x: number, y: number, f: number, l: number, life: number, tint: number, n: number, a: number, fan: number) {
    const r = ctx.shipR(), size = Math.max(0.5 * r, 1.5 / ctx.cam.zoom);
    kit.fx.flash(x, y, f, 0, 0);
    kit.fx.ember(x, y, 0, 0, l, tint, life);
    for (let i = 0; i < n; i++) {
      const b = a + (2 * Math.random() - 1) * fan, v = 10 * r * (0.6 + 0.6 * Math.random());
      kit.fx.ember(x, y, Math.cos(b) * v, Math.sin(b) * v, size, tint, 0.3 + 0.15 * Math.random());
    }
  }

  /**
   * The energy beam, instant: from your surface toward `at`, BEAM_PAST of your radii beyond it, stopped by the first body
   * (not your moons or your star's planets). Every enemy ship before that dies. The body (a rival world only once its
   * shield is down: rivals.beam) loses `bite` of mass, 40% of it as three unequal chunks, and takes `K` kelvin; within
   * BEAM_SHATTER bites it shatters.
   */
  function fireBeam(at: Vec, K: number, bite: number) {
    const pm = me.motion, d = Math.hypot(at.x - pm.x, at.y - pm.y) || 1, ux = (at.x - pm.x) / d, uy = (at.y - pm.y) / d;
    const x0 = pm.x + ux * me.r, y0 = pm.y + uy * me.r;
    let t = Math.max(0, d - me.r) + BEAM_PAST * me.r, hit: Body | undefined;
    for (const b of ctx.near) {
      if (!b.m || b === me || b.moon) continue;
      const qx = b.motion.x - x0, qy = b.motion.y - y0, along = qx * ux + qy * uy, off2 = qx * qx + qy * qy - along * along;
      if (off2 >= b.r * b.r) continue;
      const half = Math.sqrt(b.r * b.r - off2);
      if (along + half > 0 && along - half < t) [t, hit] = [Math.max(0, along - half), b];
    }
    for (const k of [...rivals.marks(), ...pirates.marks(), ...enemyMissiles('you').map((m) => ({ x: m.x, y: m.y, r: ctx.shipR(), kill: m.kill }))]) {
      const qx = k.x - x0, qy = k.y - y0, along = qx * ux + qy * uy;
      if (along < 0 || along > t || Math.abs(qx * uy - qy * ux) > k.r + BEAM_W * me.r) continue;
      breakMark(kit.fx, k);
    }
    const x = x0 + ux * t, y = y0 + uy * t;
    Object.assign(shot, { ux, uy, x, y, t: BEAM_SHOW, hr: hit?.r ?? 0 });
    kit.fx.flash(x0, y0, me.r * 0.3, 0, 0);
    kit.fx.flash(x, y, Math.max(me.r * 0.3, (hit?.r ?? 0) * 0.5), hit ? 10 : 3, me.r * 2);
    if (!hit) return;
    const f = ctx.field();
    const left = beamLeft(hit.m, bite);
    if (!f || !rivals.beam(hit, K, (hit.m - left) / hit.m, x, y)) return; // a rival's shield took it
    if (!left) return void shatter(hit, f.events);
    const hm = hit.motion, v = Math.sqrt((2 * G_WORLD * hit.m) / (1.6 * hit.r)), a0 = Math.atan2(-uy, -ux), w = pieceShares(3, SPREAD); // escape speed where they start; unequal chunks
    for (let i = 0; i < 3; i++) { // chunks fan out sideways off the beam's line (the next shot must not hit them), not falling back
      const a = a0 + (i % 2 ? -1 : 1) * (0.9 + 0.4 * i + 0.2 * Math.random()), s = v * (1.3 + 0.4 * Math.random()), c = Math.cos(a), sn = Math.sin(a);
      f.events.debris(hm.x + c * hit.r * 1.6, hm.y + sn * hit.r * 1.6, hm.vx + c * s, hm.vy + sn * s, 0.4 * bite * w[i], hit.comp, hit);
    }
    kit.fx.burst(x, y, 12, hit.r * 0.05, hit.r * 0.8, hit.tint);
    shed(hit, bite);
    hit.heat += K / K_PER_HEAT;
  }
}

/** A slug is made of your ore: your rock, metal and radioactive share (rock if you have none). */
function oreMix(b: Body) {
  const c = b.comp, ore = (c.rock ?? 0) + (c.metal ?? 0) + (c.radio ?? 0);
  return ore > 0 ? { rock: (c.rock ?? 0) / ore, metal: (c.metal ?? 0) / ore, radio: (c.radio ?? 0) / ore } : { rock: 1 };
}
export type Combat = ReturnType<typeof createCombat>;
