import type { Field, Kit } from '../../kit';
import type { News } from '../../ui/toast';
import { Container, Graphics, ParticleContainer, type Renderer, type Texture } from 'pixi.js';
import type { Vec } from '../../core/entity';
import type { Sfx } from '../../audio/sfx';
import { dashRing, FAR_BOUNDS, type Fx } from '../../render/fx';
import { drawShip, quads, shipR, shipUnit, techPage, VIOLET, YOU, type TechPage } from '../../render/tech';
import { createReadout } from '../../ui/reticle';
import { drop, shed, type Body } from '../asteroid/body';
import type { Moons } from '../planet/moons';
import { bumps } from './crash';
import { SPECK } from './flight';
import { createRockets, createShots, MAX_GLOW, type Hull, type Rockets, type Seek, type Shots, type Team } from './guns';
import { drawBolts, heavy } from './bolts';
import { fireReach } from './mining';
import { createPirates } from './pirates';
import { createRivals } from './rivals';
import { ROCKET, SALVAGE, type Wreck } from './rules';
import { foeOf, lose, type Foe, type Ship } from './ships';
import type { Civilization } from './stage';

// Combat: your rockets, rival civilizations and the pirate fleet. Created with the planet stage (and in Age I by main.ts,
// for roaming pirates only); Fire and rivals wait for a civilization.
//   Fire: a rocket (rules.ts ROCKET, guns.ts createRockets) off your surface at what you aim at (the cursor, a tap or the
//         stick's point; Space: the HUD target): it locks the enemy ship or rocket there (civilization foeAt), else the body
//         under it, else flies at the point and on until its fuel (the fire range, mining.ts fireReach) is spent. One from
//         the magazine (civilization fire: ROCKET.ore each); the magazine shows as the reticle's ring (on touch an arc).
//   Your priority target (civilization/stage.ts order) shows as four turning cyan arcs round its body (no siege ring).
//   Contacts run in the field's `contacts` hook (main.ts), after the field's own collisions: every rocket and every ship's
//   rounds (ctx.shots, ctx.rockets: guns.ts), every ship touching bodies (yours and rival home patrols graze or wreck; ships away die).
//   Hits on rival worlds come through `hit` (main.ts onHit), so shields and people react to any body.
// Drawing: one ParticleContainer on the tech page (ships, rocket hulls), one additive one over it (rounds, rocket flames,
// muzzle flashes, charging glows: bolts.ts, never under a few screen px), the rivals' additive veils and ripples, one Graphics
// for tractor lines, priority arcs and the touch arc. A burst on screen makes a quiet sound; hits light up in the gun's tint.

/** What combat reads of your moons (planet/moons.ts); Age I has none (NO_MOONS) until the planet stage attaches them. */
type MoonsView = Pick<Moons, 'list' | 'owns'>;
const NO_MOONS: MoonsView = { list: () => [], owns: () => false };
/** The camera this frame (world centre and half sizes in world units). */
// halfW/halfH: the game area (spawns, sight, leash, leave: never shrunk by zooming in); seenW/seenH: what is on screen.
type Cam = { x: number; y: number; halfW: number; halfH: number; seenW: number; seenH: number; zoom: number };
/** What rivals and pirates share. */
export type Ctx = {
  me: Body; fx: Fx; page: TechPage; root: Container; lines: Graphics;
  field: () => Field | undefined; sfx: () => Sfx | undefined; news: News;
  cam: Cam; near: Body[]; civ?: Civilization; moons: MoonsView; mine: Foe[]; // your defence ships as foes, this frame
  shots: Shots; // every ship's rounds in flight
  rockets: Rockets; // every rocket in flight, yours and the rivals'
  miners: Foe[]; // your miner shuttles as foes, this frame
  /** One particle this frame; `size` world units across; `long` stretches it along `rot` (streaks). */
  put: (tex: Texture, x: number, y: number, rot: number, size: number, tint: number, alpha: number, long?: number) => void;
  kill: (b: Body) => void; // a body is gone (the field drops it)
  shed: (b: Body, dm: number) => void; // a body loses mass dm (asteroid/body.ts)
  wreck: (x: number, y: number, tint: number, pitch: number, cls?: Wreck, cargo?: number) => void; // a ship breaks up: a flash, a burst in its tint, a crack; an enemy `cls` salvages
  salvage: (x: number, y: number, cls: Wreck, cargo?: number) => void; // an enemy wreck within your fire range: rules.ts SALVAGE (+ `cargo` u of ore) into your stocks
  draw: (cls: 'raider' | 'hauler' | 'marauder', x: number, y: number, heading: number, burn: number, bank: number) => void; // a pirate ship this frame
  onScreen: (x: number, y: number, r?: number) => boolean;
  diag: () => number; shipR: () => number; // the camera's half-diagonal; a ship's hit and touch radius (render/tech.ts shipR)
};

const MAX_PARTS = 600;
const BURST_SOUND = 0.25; // s: at most one burst sound this often
const PICK_PX = 18; // screen px round a point: what a Fire there locks

export function createCombat(layer: Container, me: Body, renderer: Renderer, kit: Kit, news: News, moons: MoonsView = NO_MOONS) {
  const root = new Container(), lines = new Graphics();
  let page: TechPage | undefined, pc: ParticleContainer | undefined, quad: ReturnType<typeof quads> | undefined, glowPc: ParticleContainer | undefined, glow: ReturnType<typeof quads> | undefined;
  layer.addChild(root, lines);
  const shots = createShots(), rockets = createRockets();
  let clock = 0, heard = -1, alive = new Set<unknown>(); // alive: enemy ships and rockets this frame (your locked rockets let go of the dead)
  const readout = createReadout(kit.canvas, kit.input);
  const mineFoes = new WeakMap<Ship, Foe>();

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
    root, lines, field: kit.field, sfx: () => kit.sfx, news,
    cam: { x: 0, y: 0, halfW: 1, halfH: 1, seenW: 1, seenH: 1, zoom: 1 }, near: [], moons, mine: [], miners: [], shots, rockets,
    put: (tex, x, y, rot, size, tint, alpha, long) => quad?.put(tex, x, y, rot, size, tint, alpha, long),
    kill: drop,
    shed,
    wreck(x, y, tint, pitch, cls, cargo) {
      const sr = ctx.shipR();
      kit.fx.flash(x, y, Math.max(sr * 3, 12 / ctx.cam.zoom), 8, sr * 6);
      kit.fx.burst(x, y, 10, sr * 0.5, sr * 6, tint);
      ctx.sfx()?.play('crack', 0.2, pitch);
      if (cls) ctx.salvage(x, y, cls, cargo);
    },
    salvage(x, y, cls, cargo = 0) {
      const S = SALVAGE[cls], civ = ctx.civ, ore = S.ore + cargo, n = (v: number) => +v.toFixed(1);
      if (!civ?.state?.active || !me.m || Math.hypot(x - me.motion.x, y - me.motion.y) - me.r > fireReach(me)) return; // too far: lost
      civ.gain(ore, S.vol, S.fuel);
      kit.fx.popup(x, y, `+${n(ore)} ore · +${n(S.fuel)} fuel${S.vol ? ` · +${n(S.vol)} Water` : ''}`, 0x8ef0a8, 1 / ctx.cam.zoom);
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

  /** Rockets of the other side than `team`, still flying (foes). */
  const enemyRockets = (team: Team) => rockets.live.filter((m) => m.team !== team && !m.dead);
  /** The free body under world point `p` (within max(1.4 r, PICK_PX)): not you or your moons; several: the heaviest. */
  const bodyAt = (p: Vec) => {
    let best: Body | undefined;
    for (const b of ctx.near) if (b.m && b !== me && !moons.owns(b) && Math.hypot(b.motion.x - p.x, b.motion.y - p.y) <= Math.max(1.4 * b.r, PICK_PX / ctx.cam.zoom) && (!best || b.m > best.m)) best = b;
    return best;
  };
  /** Fire at `at` (`target`: the HUD target with Space): lock what is there, take a rocket from the magazine, launch it. */
  function launch(civ: Civilization, at: Vec, target?: Body) {
    const z = ctx.cam.zoom, foe = target ? undefined : civ.foeAt(at, PICK_PX / z), b = target ?? (foe ? undefined : bodyAt(at)), why = civ.fire();
    if (why !== 'ok') return void (why && kit.fx.note(at.x, at.y, why === 'ore' ? 'No ore' : 'Reloading', 1 / z));
    const seek: Seek | undefined = foe ? () => (alive.has(foe) ? { x: foe.x, y: foe.y, vx: foe.vx ?? 0, vy: foe.vy ?? 0 } : undefined) : b ? () => (b.m ? { ...b.motion, r: b.r } : undefined) : undefined;
    if (foe) alive.add(foe);
    const pm = me.motion, t = seek?.() ?? at;
    rockets.launch({ team: 'you', x: pm.x, y: pm.y, vx: pm.vx, vy: pm.vy, r: me.r, tx: t.x, ty: t.y, R: me.r, range: fireReach(me), seek, fuze: !!foe, target: foe ?? b, from: me, own: (q) => q === me || moons.owns(q as Body) });
    kit.sfx.play('rocket', 0.45, 1);
    news('rocket1', 'Rockets', `Click or tap launches a rocket at what you aim at · ${ROCKET.ore} ore · it turns, but never sharply`);
  }

  const combat = {
    rivals,
    pirates,
    shots,
    rockets,
    /** Wrecks, grazes and sparked near misses by faction (dev counter: window.__g().combat.bumps). */
    bumps,
    /** `life` = the life stage index (−1 none), `civ` the civilization if any, `aimTarget` the HUD target (Space). */
    update(dt: number, near: Body[], zoom: number, aimTarget: () => Body | undefined, life: number, civ: Civilization | undefined) {
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
      civ?.arm({ foe: (prefer) => rivals.foe(prefer ?? aimTarget()) }); // your priority (stage.ts), else your target
      if (me.m && (civ || life >= 0 || rockets.live.length)) void ctx.page; // bakes the tech page once

      // Fire: a rocket from the magazine; the reticle's ring is the magazine (full: one is loaded).
      const armed = !!civ?.state?.active && me.m > 0, mag = civ?.mag;
      if (armed) {
        const aim = kit.input.fire(), at = readout.at(aim, () => aimTarget()?.motion);
        if (at) launch(civ!, at, aim === 'target' ? aimTarget() : undefined);
      }
      readout.update(armed, !mag || mag.n >= 1 ? 1 : Math.min(0.999, mag.load / ROCKET.reload), lines, me.motion.x, me.motion.y, me.r * 1.3, 2 / zoom, YOU);

      const pr = civ?.priority, od = pr?.t, ob = od && 'motion' in od ? od : undefined, wait = pr?.wait; // your priority: four cyan arcs turning round it (a ship too; dim and slow while no weapon is ready or reloading), no text
      if (od && me.m) dashRing(lines, ob ? ob.motion.x : (od as Foe).x, ob ? ob.motion.y : (od as Foe).y, ob ? 1.6 * ob.r : 3 * ctx.shipR(), 4, clock * (wait ? 0.5 : 1.5), 0.45, 1.5 / zoom, YOU, wait ? 0.25 : 0.55);
      rivals.update(dt, civ);
      pirates.update(dt, civ);

      // A burst on screen: a quiet sound (heavy guns lower and louder), at most every BURST_SOUND s.
      for (const m of shots.muzzles) if (clock - heard >= BURST_SOUND && ctx.onScreen(m.x, m.y)) {
        heard = clock;
        kit.sfx.play('shot', heavy(m.gun) ? 0.45 : 0.3, heavy(m.gun) ? 0.5 : 1);
      }
      shots.muzzles.length = 0;
      if (page && glow) drawBolts({ add: glow.put, dot: page.dot, veil: page.veil, ring: page.ring, pirates: pirates.foes(), wakes: pirates.wakes, unit: shipUnit(me.r, v.zoom), zoom: v.zoom, me, shots, dt, onScreen: ctx.onScreen, fx: kit.fx, civ, sr: ctx.shipR(), put: ctx.put, fleet: page.fleet, rockets });
      quad?.end();
      glow?.end();
    },
    /** After the field's collisions (field.update `contacts`): rockets and rounds hit; ships touching bodies graze or wreck (enemies away: die). */
    contacts(dt: number) {
      const f = ctx.field();
      if (!f) return;
      const bodies = me.m ? [me, ...ctx.near] : ctx.near, r = ctx.shipR(), z = ctx.cam.zoom;
      // Every ship of every side is a hull to rounds and rockets; a rocket is a smaller hull (ROCKET.size): rounds and a locked rocket can stop it.
      const hulls: Hull[] = [];
      const add = (list: readonly Foe[], team: Team) => list.forEach((q) => hulls.push({ x: q.x, y: q.y, vx: q.vx, vy: q.vy, r, team, kill: q.kill }));
      add(ctx.mine, 'you');
      add(ctx.miners, 'you');
      add(rivals.foes(), 'rival');
      add(pirates.foes(), 'pirate');
      for (const m of rockets.live) if (!m.dead) hulls.push({ x: m.x, y: m.y, vx: m.vx, vy: m.vy, r: r * ROCKET.size, team: m.team, kill: m.kill });
      if (rockets.live.some((m) => m.team === 'you' && m.fuze)) alive = new Set(combat.foes());
      // A rocket on a body: a world takes weapon fire (rivals.rocketHit), anything else of yours is cut or chipped (stage.ts).
      // Its end: a burst lights up wide in the side's hue; one shot down flares like a round's hit; one out of fuel puffs grey.
      if (rockets.live.length) rockets.step(dt, bodies, hulls, SPECK * r, (m, b, x, y) => void (!rivals.rocketHit(m, b, x, y) && m.team === 'you' && ctx.civ?.rocketHit(b, x, y)), (m, x, y, end) => {
        if (!ctx.onScreen(x, y, me.r)) return;
        const tint = m.team === 'you' ? YOU : VIOLET, b = ROCKET.blast * m.R;
        if (end === 'burst') {
          blaze(x, y, Math.max(b, 26 / z), Math.max(1.5 * b, 36 / z), 0.35, tint, 12, 0, Math.PI);
          kit.fx.burst(x, y, 14, r * 0.5, b * 1.5, tint);
          ctx.sfx()?.play('blast', 0.35, 1);
        } else if (end === 'shot') blaze(x, y, Math.max(1.5 * r, 6 / z), Math.max(2.5 * r, 9 / z), 0.22, tint, 5, 0, Math.PI);
        else {
          kit.fx.ember(x, y, 0, 0, Math.max(2 * r, 8 / z), 0x9a8a78, 0.3);
          kit.fx.burst(x, y, 8, Math.max(1.2 * r, 3 / z), r * 4, 0x8a8478);
        }
      });
      // A round's hit: a hot flash, light in the gun's tint and sparks thrown back along its path (lances and shells 2.2 ×);
      // a ship (or a rocket) also breaks up in a burst.
      if (shots.n) shots.step(dt, bodies, hulls, SPECK * r, (s, x, y, ship) => {
        if (!ctx.onScreen(x, y, 4 * r)) return;
        const k = heavy(s.gun) ? 2.2 : 1;
        blaze(x, y, Math.max(1.5 * r * k, (6 * k) / z), Math.max(2.5 * r * k, (9 * k) / z), 0.22, s.gun.tint, ship || s.gun.look === 'lance' ? 8 : 4, Math.atan2(me.motion.vy - s.vy, me.motion.vx - s.vx), 0.9);
        if (ship) kit.fx.burst(x, y, 10, Math.max(0.5 * r, 2 / z), r * 5, 0xffc890);
      });
      ctx.civ?.crashes(bodies, ctx.shipR(), dt, ctx.onScreen, (v, p) => ctx.sfx()?.play('crack', v, p));
      rivals.contacts(bodies, dt);
      pirates.contacts(bodies, dt);
    },
    /** Enemy ships and rockets your defence ships hunt (civ.update's `foes`). */
    foes: (): Foe[] => [...rivals.foes(), ...pirates.foes(), ...enemyRockets('you')],
    /** A field hit (main.ts onHit, any actor): rival worlds' shields and people. */
    hit: rivals.hit,
    destroy() {
      rivals.destroy();
      pirates.destroy();
      shots.clear();
      rockets.clear();
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
  return combat;

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
}
export type Combat = ReturnType<typeof createCombat>;
