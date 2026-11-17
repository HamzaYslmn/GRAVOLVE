import type { News } from '../../ui/toast';
import { sfx } from '../../audio/sfx';
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Vec } from '../../core/entity';
import type { Aim, Controls } from '../../core/input';
import { bound, breaks, capture, circular, place, rate, relVelocity, slotRadius, SPRING_S, stepOrbit, wrap, type Orbit } from '../../core/orbits';
import { dashRing, type Fx } from '../../render/fx';
import { YOU } from '../../render/tech';
import { absorb, drop, keepShape, mixRgb, shed, unmoon, type Body } from '../asteroid/body';
import { G_WORLD, youPull } from '../asteroid/rules';
import { APPROACH, catchStep, FEED, handsOff, LANE, matchWindow, moonCap, MOON, MOON_SHARE, moonSlots, pickSlot, STOLEN_S } from './rules';
import { clamp } from '../../core/rng';
import type { Foe } from '../civilization/ships';

// Moons on core/orbits.ts slots around you: field bodies flagged `moon` that the field ticks and collides (`resolve`) but
// never stores, pulls freely or lets touch you; each frame they are placed on their circle round where you are now.
//   Capture by match (rules.ts catchStep; no click): a free body of moon size on the lane round any free slot, moving with
//            you, fills a ring; full, it is your moon where it is (body.ts keepShape). The grip cancels your pull on a
//            matched body. Caught off another host, or within STOLEN_S of one letting it go (markFreed): stolen.
//   A moon guards just by orbiting (whatever crosses its path hits it) and is ore for your miners (civilization/stage.ts).
//   Command: a tap on a moon selects it (`inspect`), a hold grinds it down (FEED of your mass a second, no heat); a tap on
//            any other body or an enemy ship sets your priority target (`orders`; before LIFE: "No fleet yet").
//   Break: a hit leaving it faster than escape relative to you, or shattering it. Shown on the orbit, never in a panel.

type Moon = { b: Body; o: Orbit; slot: number; v: Vec; m: number; turn: number; face: number; lit: number; absorbing: boolean; pip: Sprite; stolen: boolean };
/** Your priority target (civilization/stage.ts order: sets or clears it on a body or an enemy ship and notes how it stands); the enemy ship under a point. */
type Orders = { order: (t: Body | Foe) => { ok: boolean }; foeAt: (p: Vec, pad: number) => Foe | undefined };
/** Where a target is and how big (a ship: `pad`). */
const spot = (t: Body | Foe, pad: number) => ('motion' in t ? { x: t.motion.x, y: t.motion.y, r: t.r } : { x: t.x, y: t.y, r: pad });
/** Before LIFE a Command on a body only says so (a fizzle). */
function noFleet(fx: Fx, t: Body | Foe, zoom: number) {
  const s = spot(t, 0);
  fx.note(s.x, s.y - s.r - 14 / zoom, 'No fleet yet', 1 / zoom);
  sfx()?.play('snap', 0.6, 1);
}

const GRAIN_GAP = 0.25; // your radii between grains of a grinding stream...
const GRAIN_V = 1.5; // ...flowing down at this many radii/s
const GRAIN_TINT = 0xffd27a; // warmed toward the miners' ore colour
const SPILL_S = 2; // s: a moon past moonCap spills the excess onto you (no moon heavier than its planet)
const RECAPTURE_S = 3; // s a let-go body cannot be caught again (broken free, absorbing)
const GREEN = 0x7dff9a; // stolen
const TRAIL = 1.6; // rad of fading orbit trail behind a moon
const SEGS = 10;
const HOST_MIN = 4; // a host weighs at least this × the body
const HOST_D = 8; // host radii: farther out nothing counts as its moon
const ORBIT_V = 0.5; // × circular speed around the host, sideways, to count as orbiting it
const PICK_PX = 26; // screen px around a body that a Command still hits
const LAG_S = 0.1; // s of a body's path behind it that a Command still hits (reaction lag on fast bodies)
const DASHES = 18; // per free-slot hint
const ASSIST_V = 4; // your diameters/s: a candidate moving with you closer than this lends the touch stick its frame

const freed = new WeakMap<Body, number>();
let now = 0; // game seconds, module-wide so rivals.ts can mark bodies
/** A body let go by another host (a rival's rock dropped): caught by you within STOLEN_S it counts as stolen. */
export const markFreed = (b: Body) => void freed.set(b, now);
const recentlyFreed = (b: Body) => now - (freed.get(b) ?? -Infinity) < STOLEN_S;

/** The heavier body `b` orbits, not `me`: bound to it within HOST_D of its radii (a rival's rock or guard moon, re-placed each frame, needs no bound test). */
function hostOf(b: Body, near: Body[], me: Body): Body | undefined {
  let best: Body | undefined, bp = 0;
  for (const h of near) {
    if (h === me || h === b || !h.m || h.moon || h.m < HOST_MIN * b.m) continue;
    const rx = b.motion.x - h.motion.x, ry = b.motion.y - h.motion.y, d = Math.hypot(rx, ry);
    if (d > HOST_D * h.r) continue;
    const mu = G_WORLD * h.m, vx = b.motion.vx - h.motion.vx, vy = b.motion.vy - h.motion.vy;
    // Orbiting: bound and moving round at ORBIT_V of circular at least (belt rocks drifting together are not moons).
    if (!b.moon && !b.held && (!bound(mu, rx, ry, vx, vy) || Math.abs(rx * vy - ry * vx) / (d || 1) < ORBIT_V * circular(mu, d))) continue;
    if (mu / (d * d) > bp) [best, bp] = [h, mu / (d * d)];
  }
  return best;
}

export function createMoons(layer: Container, me: Body, input: Controls, glow: Texture, fx: Fx, canvas: HTMLElement, news: News) {
  const view = new Container();
  const lines = new Graphics();
  const hover = new Sprite({ texture: glow, anchor: 0.5, tint: YOU, alpha: 0, blendMode: 'add' });
  view.addChild(lines, hover);
  layer.addChildAt(view, 0); // under your body and halo
  const moons: Moon[] = [];
  const released = new WeakMap<Body, number>();
  const hints = [0, 0, 0, 0, 0];
  let shown: Moon | null = null, stolen = 0, zoomNow = 1; // shown: selected by a Command (target panel)
  // The catch in progress: the candidate, its ring (0..1), last match quality, grip felt, theft (decided once it fills), the touch frame, its slot.
  let cand: Body | null = null, prog = 0, lastQ = 0, gripped = false, theft: boolean | undefined, assist: Vec | undefined, slot = -1;

  const muNow = () => G_WORLD * youPull(me.m, me.r);
  /** Off its orbit. */
  function letGo(moon: Moon) {
    const b = moon.b;
    unmoon(b);
    released.set(b, now);
    moon.pip.destroy();
    moons.splice(moons.indexOf(moon), 1);
    if (shown === moon) shown = null;
  }
  /** The moon nearest a Command's point (E without a cursor: the first moon); within max(3 r, R) of it for a point. */
  function pick(at: Aim): Moon | undefined {
    const key = typeof at === 'string', p = key ? input.aimWorld() : at;
    if (!p) return moons[0];
    let best: Moon | undefined, bd = Infinity;
    for (const m of moons) {
      const d = Math.hypot(m.b.motion.x - p.x, m.b.motion.y - p.y);
      if (d < bd && (key || d < Math.max(3 * m.b.r, me.r))) [best, bd] = [m, d]; // E: the moon nearest the cursor, wherever it is
    }
    return best;
  }

  const mine = (b: Body) => moons.some((m) => m.b === b);
  /** Could `b` be caught at all (size and the lane are checked after)? Not you, a moon (yours, or your star's planet; a rival's rock on its circle can be stolen), a rival world or core, a great comet, nor a body just let go. A living rival world's guard moon can (stolen). */
  const catchable = (b: Body) => b !== me && b.m > 0 && (!b.moon || me.guard?.own?.(b) === false) && !b.rival && !handsOff(b) && now - (released.get(b) ?? -Infinity) >= RECAPTURE_S;
  const sizeOk = (b: Body) => { const cap = moonCap(b.m, b.r, me.m, me.r); return b.m >= Math.min(MOON_SHARE[0] * me.m, 0.25 * cap) && b.m <= 1.01 * cap; };
  /** The free body under a world point (within max(1.4 r, PICK_PX)), anywhere on its last LAG_S of path (a fast one has moved since the click): not you or your moons. Several: the heaviest that fits a slot, else the heaviest. */
  function under(p: Vec, near: Body[]): Body | undefined {
    let best: Body | undefined, bd = -Infinity;
    for (const b of near) {
      if (b === me || !b.m || mine(b)) continue;
      const m = b.motion, sx = -m.vx * LAG_S, sy = -m.vy * LAG_S, ss = sx * sx + sy * sy;
      const u = ss ? clamp(((p.x - m.x) * sx + (p.y - m.y) * sy) / ss, 0, 1) : 0;
      const d = Math.hypot(m.x + sx * u - p.x, m.y + sy * u - p.y);
      const score = sizeOk(b) ? b.m : -1 / b.m; // any body that fits outranks one that doesn't
      if (d < Math.max(1.4 * b.r, PICK_PX / zoomNow) && score > bd) [best, bd] = [b, score];
    }
    return best;
  }

  /** A new moon on slot `k`: pip, a ring of sparks, green ones and a popup if stolen. */
  function addMoon(b: Body, o: Orbit, k: number, theft: boolean) {
    [b.moon, b.motion.drag, b.meteor, b.held] = [true, 0, false, false]; // no free gravity, never touches you, never stored; a guard moon no longer held
    keepShape(b); // it keeps its look: never baked round
    const pip = new Sprite({ texture: glow, anchor: 0.5, tint: MOON, alpha: 0, blendMode: 'add' });
    view.addChild(pip);
    const mu = muNow(), pm = me.motion;
    moons.push({ b, o, slot: k, v: { x: b.motion.vx, y: b.motion.vy }, m: b.m, turn: o.dir * rate(o, mu), face: o.angle, lit: 1, absorbing: false, pip, stolen: theft });
    const col = theft ? GREEN : MOON;
    for (let i = 0; i < (theft ? 16 : 10); i++) {
      const a = (i / (theft ? 16 : 10)) * Math.PI * 2;
      fx.ember(b.motion.x + Math.cos(a) * b.r * 1.3, b.motion.y + Math.sin(a) * b.r * 1.3, pm.vx + Math.cos(a) * b.r, pm.vy + Math.sin(a) * b.r, b.r * 0.35, col, theft ? 1.3 : 0.9);
    }
    sfx()?.play(theft ? 'steal' : 'capture', 0.8, 1);
    news('moon', 'Moon captured', 'It guards you · right-click, E or long-press it: see it · keep holding: grind it down');
    if (!theft) return;
    stolen++;
    fx.popup(b.motion.x, b.motion.y - b.r * 2, 'stolen', GREEN, 1 / zoomNow);
    news('stolen', 'Moon stolen', `Taken from another host · ${stolen} this run`);
  }

  return {
    /** The slot count (HUD moon pips). */
    get slots() {
      return moonSlots(me.m);
    },
    /** Moons stolen this run (caught off another host, or within STOLEN_S of one letting it go). */
    get stolen() {
      return stolen;
    },
    /** World units the camera should keep in view around you: the outer slot, stretched by the screen's aspect so it fits the short side (main.ts compares fit with the long one). */
    fit() {
      const s = moonSlots(me.m), w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      return s && me.m ? ((slotRadius(me.r, s - 1) + 1.2 * me.r) * Math.max(w, h)) / Math.min(w, h) : 0;
    },
    /** The bodies held as moons, by slot (the civilization mines them all). */
    list: () => [...moons].sort((a, b) => a.slot - b.slot).map((m) => ({ body: m.b, slot: m.slot })),
    /** The moon a Command selected (the target panel shows it instead of the nearest body). */
    inspect: () => (shown ? { body: shown.b } : undefined),
    /** Is `b` one of your moons right now (rivals.ts: their rock is no longer theirs to place)? */
    owns: mine,
    /** Touch assist (player.ts): the velocity of a candidate near the lane already moving with you, else undefined. */
    frame: () => assist,
    /** The catch in progress (dev and tests): the candidate, its ring 0..1 and the match quality. */
    catching: () => (cand ? { body: cand, p: prog, q: lastQ, slot } : undefined),
    /** `near` = bodies around you (field.around), `zoom` for line widths, `aimTarget` = the HUD target (E off the canvas), `orders`: the civilization's priority target (none before LIFE). */
    update(dt: number, near: Body[], zoom: number, aimTarget: () => Body | undefined, orders?: Orders) {
      now += dt;
      zoomNow = zoom;
      lines.clear();
      assist = undefined;
      if (!me.m) return;
      const mu = muNow(), R = me.r, pm = me.motion, slots = moonSlots(me.m);

      // 1. What happened to each moon last frame: eaten or destroyed, shattered, or knocked loose (field collisions only
      //    change a moon's velocity: compare with what it was given).
      for (const moon of [...moons]) {
        const b = moon.b;
        if (!b.m || !b.moon || b.m < 0.5 * moon.m) {
          letGo(moon); // gone, or shattered: what is left flies on with its pieces
          continue;
        }
        const dvx = b.motion.vx - moon.v.x, dvy = b.motion.vy - moon.v.y;
        if (dvx * dvx + dvy * dvy < 1e-6) continue;
        // Measured against the plain circular motion (no spring): a moon springing in moves fast for a moment, and a crumb
        // touching it then must not count as an escape-speed kick.
        const rel = relVelocity({ ...moon.o, dist: moon.o.target }, mu);
        if (breaks(mu, moon.o.target, rel.x + dvx, rel.y + dvy)) {
          letGo(moon); // knocked out faster than escape: it keeps the velocity the hit gave it
          sfx()?.play('loose', 0.8, 1);
          news('lost', 'Moon knocked loose', 'A hard hit broke its orbit · match its speed to catch it again');
          continue;
        }
        moon.o.dist += ((dvx * Math.cos(moon.o.angle) + dvy * Math.sin(moon.o.angle)) * SPRING_S) || 0; // a wobble the spring takes back
      }

      // 2. Capture by match on any free slot's lane (rules.ts catchStep, pickSlot). The candidate: the one filling (it keeps
      //    its ring), else an in-size body within APPROACH of a free lane: one that would fill now, then the slowest; a body
      //    too big sitting matched in a lane gets the size gauge.
      let used = 0;
      for (const m of moons) used |= 1 << m.slot;
      const dist = (b: Body) => Math.hypot(b.motion.x - pm.x, b.motion.y - pm.y);
      const relV = (b: Body) => Math.hypot(b.motion.vx - pm.vx, b.motion.vy - pm.vy);
      let big: Body | undefined;
      if (!(cand && slot < slots && catchable(cand) && prog > 0 && Math.abs(dist(cand) - slotRadius(R, slot)) <= (LANE + APPROACH) * R)) {
        if (cand && lastQ > 0 && prog >= 0.3) sfx()?.play('snap', 0.4, 1); // lost mid-match: eaten, swept off, the slot gone
        let best: Body | null = null, bk = -1, bv = Infinity;
        for (const b of near) {
          if (!catchable(b)) continue;
          const d = dist(b), k = pickSlot(d, R, slots, used, b === cand ? slot : -1), o = k < 0 ? Infinity : Math.abs(d - slotRadius(R, k));
          if (o > (LANE + APPROACH) * R) continue;
          const fills = o <= LANE * R && relV(b) < matchWindow(R, circular(mu, slotRadius(R, k))), v = relV(b) - (fills ? 1e9 : 0);
          if (sizeOk(b)) { if (v < bv) [best, bk, bv] = [b, k, v]; }
          else if (fills && b.m > MOON_SHARE[0] * me.m) big = b;
        }
        if (best !== cand) [prog, lastQ, gripped, theft] = [0, 0, false, undefined];
        [cand, slot] = [best, bk];
      }
      const sr = cand ? slotRadius(R, slot) : 0;
      if (cand) {
        const b = cand, bm = b.motion, rx = bm.x - pm.x, ry = bm.y - pm.y, vx = bm.vx - pm.vx, vy = bm.vy - pm.vy, d = Math.hypot(rx, ry) || 1;
        const s = catchStep(prog, R, mu, sr, rx, ry, vx, vy, sizeOk(b) ? MOON_SHARE[0] : 0, dt, slot === pickSlot(0, R, slots, used)); // share: a pass token (sizeOk is the size gate, its floor can sit under MOON_SHARE[0]); wide grip on the lowest free ring only
        if (s.grip && !b.moon) {
          // Cancels your pull on it this frame (planet.update runs before field.update): a matched body floats in the lane.
          [bm.vx, bm.vy] = [bm.vx + (rx / d) * s.grip * dt, bm.vy + (ry / d) * s.grip * dt];
          if (!gripped) sfx()?.play('grip', 0.4, 1);
          gripped = true;
        }
        if (s.q === 0 && lastQ > 0 && s.p >= 0.3) sfx()?.play('snap', 0.4, 1);
        if (s.q > 0 && theft === undefined) theft = !!hostOf(b, near, me) || recentlyFreed(b); // the old game's theft rule, judged once
        [prog, lastQ] = [s.p, s.q];
        if (Math.hypot(vx, vy) < ASSIST_V * 2 * R) assist = { x: bm.vx, y: bm.vy };
        news('match', 'Catch a moon', 'Bring a small body onto a free ring and match its speed');
        if (prog >= 1) {
          addMoon(b, capture(rx, ry, vx, vy, sr), slot, !!theft);
          [cand, prog, lastQ, used] = [null, 0, 0, used | (1 << slot)];
        }
      }

      // 3. Command. A tap on a moon selects it; on any other body (the HUD target for E off the canvas) sets or clears
      //    your priority target there (a fizzle sound: none taken). A hold on a moon grinds it down (shown in the target
      //    panel); on anything else it does nothing.
      const at = (a: Aim) => (typeof a === 'string' ? input.aimWorld() : a);
      const edge = (b: Body, p: Vec | null) => (p ? Math.hypot(b.motion.x - p.x, b.motion.y - p.y) - b.r : 0);
      const cmd = input.command();
      if (cmd) {
        const p = at(cmd), tb = p ? undefined : aimTarget();
        const ship = p ? orders?.foeAt(p, PICK_PX / zoomNow) : undefined, body = ship ?? (p ? under(p, near) : tb && tb !== me && !mine(tb) ? tb : undefined), moon = p ? pick(cmd) : moons.find((m) => m.b === tb) ?? (body ? undefined : moons[0]);
        shown = null;
        if (body && (ship || !moon || edge(body as Body, p) < edge(moon.b, p))) orders?.order(body) ?? noFleet(fx, body, zoomNow); // a ship first
        else if (moon) [moon.lit, shown] = [1, moon];
      }
      const hold = input.hold();
      if (!hold) for (const m of moons) m.absorbing = false;
      else if (!moons.some((m) => m.absorbing)) {
        const p = at(hold), m = pick(hold), b = p ? under(p, near) : undefined;
        if (m && !(b && edge(b, p) < edge(m.b, p))) [m.absorbing, shown] = [true, m];
      }

      // 4. Move every moon on its orbit (an orbiting moon guards just by being there: whatever crosses its path hits it) and place it for the field's tick (it lands exactly on its spot: x − v·dt).
      const w = 1.5 / zoom;
      for (const moon of [...moons]) {
        const { b, o } = moon;
        o.target = slotRadius(R, moon.slot);
        const a0 = o.angle;
        stepOrbit(o, mu, dt);
        moon.turn = dt > 0 ? wrap(o.angle - a0) / dt : moon.turn;
        const rel = relVelocity(o, mu, moon.turn), v = { x: pm.vx + rel.x, y: pm.vy + rel.y }, p = place(o, pm.x, pm.y);
        [b.motion.vx, b.motion.vy, b.motion.x, b.motion.y] = [v.x, v.y, p.x - v.x * dt, p.y - v.y * dt];
        if (b.m > 1.002 * moonCap(b.m, b.r, me.m, R)) {
          // A moon never outgrows an eighth of you, nor wider than MOON_R (moonCap): what it eats past that rains down onto you as dust (no hit, no heat).
          const spill = (b.m - moonCap(b.m, b.r, me.m, R)) * (1 - Math.exp(-dt / SPILL_S));
          shed(b, spill);
          absorb(me, spill, b.comp);
          if (Math.random() < dt * 20) fx.ember(p.x, p.y, (pm.x - p.x) * 0.8 + pm.vx, (pm.y - p.y) * 0.8 + pm.vy, b.r * 0.3, 0xffd9a8, 1.2);
        }
        [moon.v, moon.m] = [v, b.m];

        if (moon.absorbing) {
          // Ground down: FEED of you a second joins you as dust, like a body burning up in your air (no hit, no heat);
          // the last crumbs come down whole. Grains flow from its near side to you, dust kicks up where it is cut.
          const dm = Math.min(b.m, FEED * me.m * dt), last = b.m - dm < 0.5 * MOON_SHARE[0] * me.m;
          absorb(me, last ? b.m : dm, b.comp);
          sfx()?.play(last ? 'eat' : 'grind', last ? 0.7 : 0.45, 1);
          const dx = pm.x - p.x, dy = pm.y - p.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, L = d - b.r - R;
          if (Math.random() < dt * 8) fx.puff(p.x + ux * b.r, p.y + uy * b.r, ux, uy, 1, b.r * 0.2, 0.3 * R, b.tint);
          if (L > 0) {
            const N = Math.min(25, Math.ceil(L / (GRAIN_GAP * R))), off = (now * GRAIN_V * R) / L, tint = mixRgb(b.tint, GRAIN_TINT, 0.4, false);
            for (let i = 0; i < N; i++) {
              const k = (i / N + off) % 1, wob = Math.sin(k * 14 + now * 3) * 0.05 * R;
              lines.circle(p.x + ux * (b.r + L * k) - uy * wob, p.y + uy * (b.r + L * k) + ux * wob, Math.max(1.5 / zoom, 0.025 * R)).fill({ color: tint, alpha: 0.7 * Math.sin(Math.PI * k) });
            }
          }
          if (last) {
            drop(b);
            letGo(moon);
            news('ground', 'Moon ground down', 'All of it joined you · catch another');
            continue;
          }
          shed(b, dm);
          moon.m = b.m;
        }

        // The orbit hint: a faint trail fading out behind the moon (brighter for a moment once selected); stolen ones keep a
        // green tint.
        moon.lit = Math.max(0, moon.lit - dt);
        const col = moon.stolen ? mixRgb(MOON, GREEN, 0.45, false) : MOON, back = moon.turn >= 0 ? -1 : 1, alpha = 0.16 + 0.3 * moon.lit;
        for (let i = 0; i < SEGS; i++) {
          const s0 = o.angle + back * TRAIL * (1 - i / SEGS), s1 = o.angle + back * TRAIL * (1 - (i + 1) / SEGS);
          lines.moveTo(pm.x + Math.cos(s0) * o.dist, pm.y + Math.sin(s0) * o.dist);
          lines.arc(pm.x, pm.y, o.dist, s0, s1, back > 0).stroke({ width: w, color: col, alpha: (alpha * (i + 1)) / SEGS });
        }
        // The side it faces: outward.
        moon.face += wrap(o.angle - moon.face) * (1 - Math.exp(-dt / 0.12));
        moon.pip.tint = col;
        moon.pip.alpha += (0.22 - moon.pip.alpha) * (1 - Math.exp(-dt / 0.15));
        moon.pip.position.set(p.x + Math.cos(moon.face) * b.r * 0.85, p.y + Math.sin(moon.face) * b.r * 0.85);
        moon.pip.scale.set((b.r * 1.1) / (glow.width / 2));
      }

      // Free slots: faint broken circles drifting slowly, all alike; the candidate's ring brightens and closes (its dashes
      // join) as it fills.
      for (let s = 0; s < hints.length; s++) {
        const free = s < slots && !((used >> s) & 1), on = !!cand && s === slot, want = !free ? 0 : on ? 0.12 + 0.3 * lastQ : cand ? 0.025 : 0.045;
        hints[s] += (want - hints[s]) * (1 - Math.exp(-dt / 0.25));
        if (hints[s] < 0.004) continue;
        dashRing(lines, pm.x, pm.y, slotRadius(R, s), DASHES, now * 0.04 * (s % 2 ? -1 : 1), on ? 0.35 + 0.65 * prog : 0.35, w, MOON, hints[s]);
      }
      // The candidate: a faint ring and a bright arc from 12 o'clock sweeping with the ring's progress (green: it will count
      // as stolen).
      if (cand) {
        const bm = cand.motion, rr = Math.max(1.5 * cand.r, 14 / zoom), col = theft ? GREEN : YOU;
        lines.circle(bm.x, bm.y, rr).stroke({ width: w, color: col, alpha: 0.12 + 0.3 * lastQ });
        if (prog > 0) lines.moveTo(bm.x, bm.y - rr).arc(bm.x, bm.y, rr, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * prog).stroke({ width: 1.6 * w, color: col, alpha: 0.75 });
      }
      // Too big to hold: a dashed ring at the size a moon may be, the body overflowing it.
      if (big) dashRing(lines, big.motion.x, big.motion.y, big.r * Math.cbrt(moonCap(big.m, big.r, me.m, me.r) / big.m), DASHES, now * 0.5, 0.5, w, MOON, 0.5);
      // A soft cyan glow under the cursor on a body or ship a tap would make your priority (or clear it).
      const cur = input.kind() === 'mouse' ? input.aimWorld() : null, hb = cur && orders ? orders.foeAt(cur, PICK_PX / zoom) ?? under(cur, near) : undefined;
      const hs = hb && spot(hb, 10 / zoom);
      hover.alpha += ((hs ? 0.35 : 0) - hover.alpha) * (1 - Math.exp(-dt / 0.1));
      if (hs) [hover.position.set(hs.x, hs.y), hover.scale.set((hs.r * 1.9) / (glow.width / 2))];
    },
    /** Let every moon go (the stage ends: respawn or a new run). */
    destroy() {
      cand = null;
      for (const m of [...moons]) letGo(m);
      view.destroy({ children: true });
    },
  };
}

export type Moons = ReturnType<typeof createMoons>;
