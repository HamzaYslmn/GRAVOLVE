import { between, poissonGap } from '../../core/rng.ts';
import { slotRadius } from '../../core/orbits.ts';
import { blend, pieceShares, SPREAD as SHARDS, type Comp } from '../asteroid/rules.ts';
import type { Body } from '../asteroid/body';
import type { Ctx } from './combat';
import { bump, bumps, MISS_V, sparks } from './crash.ts';
import {
  approach, BRAKE, circuit, follow, H_TOP, H_TURN, inArc, jink, jinkStep, leash, M_TOP, M_TURN, MAX_DT, P_ACC, P_TOP, P_TURN, ROW, startJink, steps, strafe, thrust, want, type Circler, type Craft, type Jink, type Strafer,
} from './flight.ts';
import { menace, nearest, pull, trigger, type Gun, type Trigger } from './guns.ts';
import { clear, DODGE, free, LOOK, PAD, reachOf, scan, type Disc, type Near } from './nav.ts';
import {
  BREAK, CHASE_V, CHIP, CHIP_MAX, COMMIT, crackPieces, FLAG_TURN, fleetSize, FORM_V, GONE, GRAB, GUARD_IN, GUARD_OUT, GUARD_V, HOLD, JUMP_S, KEPT, LEASH, LOOT_BACK, PIRATE_CALM, PIRATE_CLASS,
  PIRATE_FIRST, PIRATE_GAP, PIRATE_K, PIRATE_MEAN, PIRATE_SPEED, PREY, RAID_S, RETREAT, rockHits, SIGHT, STAND, STAY, STEAL, T_SEE, THINK, THREAT, UNIT,
} from './rules.ts';
import type { Rival, Rivals } from './rivals';
import type { Foe } from './ships';
import type { Mark } from './weapon';

// Pirate fleets in every age (numbers in rules.ts, design in docs/gameevents.md): nomads who crack rocks, haul the
// pieces and raid worlds. A ship dies touching any body (swept: fast bodies never tunnel); rounds take hull hits.
// Node-safe (pirates.test.ts flies it with a fake ctx).
//   - States: cruise (a formation on a lane across the view) → work (a rock) or raid (a world) → leave (gone or a jump);
//     decisions every THINK s, a target kept ≥ COMMIT s. The formation's fixed slots follow a virtual lead (the flag).
//   - Jobs: form, gun (strafing runs), haul (a piece on the tractor line), guard (circling the stand-off point); evasion
//     overrides (jink, a hauler's dash to a guard, scatter). A crack keeps ships out of its fling; the tractor shoves
//     their own pieces off. Each ship scans once a frame and clears every sub-step (nav.ts); your moon system is one keep-out.

const PIRATE = 0xd9cfbf; // bone hulls, clear of you (cyan), rivals (violet) and the verdict colours
const TRACER = 0xff7a50; // their rounds
const SHOT_V = 20; // your radii/s a round flies on top of the shooter
const SHOT_S = [0.5, 0.62]; // s a round flies: raider, marauder
const RUN_IN = 1.2; // turn radii (plus 1 R) past the keep-out: a gun run turns out here...
const RUN_OUT = 3.5; // ...and comes back in past this many R farther out
const SPLAY = 0.1; // rad: the 2nd and 3rd ship of a wing come in this far off the 1st one's line (clear of its fire)
const SWING = 0.5; // rad off straight out from a body it turns out on, on its own side (prey ships: straight on past)
const AHEAD = 8; // ship radii: a ship in formation steers at a point this far past its slot
const WING = 3; // gun ships a target at most (a wing)
const RESPOND = 2; // raiders drawn by a threat at most
const PULL_S = 0.8; // s on the tractor line before a piece is aboard
const SHOVE = [4, 0.01, 0.3]; // ship radii off a piece's surface; their own pieces up to this × your mass are shoved off at this R/s
const HOT = 3; // hits left: a rock one raider burst from cracking (or any a marauder aims at)
const FLEE_S = 2; // s a threatened hauler runs to a guard
const SCATTER = [2.5, 2, 1.3]; // a body on course for the fleet within s: each ship breaks away for s at × its speed
const LANE = [1.05, 0.4]; // camera half-diagonals out a lane starts and ends; view half-widths its aim lies off the centre
const LEAVE_ARC = 0.3; // rad: the exit bearing's spread
const SYS = [1.5, 2.5]; // R: your moon system's keep-out past the outer filled slot; with no moons, its radius
const SPAWN_ROOM = 2; // R clear of any body where a fleet appears

type Kind = keyof typeof PIRATE_CLASS;
type PShip = Foe & Circler & Strafer & {
  kind: Kind; job: 'form' | 'gun' | 'haul' | 'guard'; hull: number; dead: boolean; g: Trigger; jk: Jink; flee: number; dry: number;
  aim?: Body; foe?: Foe; responding: boolean; wing: number; ward?: PShip; back: number; side: number; near: Near[];
  piece?: Body; pull: number; mass: number; comp: Comp; stolen: { ore: number; vol: number }; units: number;
};
type Target = { b: Body; kind: 'you' | 'rival' | 'rock' | 'piece'; rival?: Rival; v: number };
type Fleet = {
  ships: PShip[]; n0: number; state: 'cruise' | 'work' | 'raid' | 'leave'; v: number; flag: Craft; flagNear: Near[];
  lane: { x: number; y: number; dx: number; dy: number }; lanes: number; t: number; st: number; tick: number; held: number; stay: number;
  target?: Target; onYou: boolean; cracks: Map<Body, number>; loose: Body[]; off: { x: number; y: number }; raidT: number;
  lash: { far: number; slow: number }; lashed: boolean; chip: number; cap: number; seen: number; gun: Gun; big: Gun;
  scatter: number; sb?: Disc; sx: number; sy: number; slots: boolean; jumped: boolean; own: Set<Body>;
};

const TURNS: Record<Kind, number> = { raider: P_TURN, hauler: H_TURN, marauder: M_TURN }, TOPS: Record<Kind, number> = { raider: P_TOP, hauler: H_TOP, marauder: M_TOP }; // tops × class speed
const live = (b: Body | undefined, me: Body): b is Body => !!b && b.m > 0 && !b.view.destroyed && (b === me || !!b.view.parent); // gone: eaten, broken, or left with its chunk

export function createPirates(ctx: Ctx, rivals: Rivals, rnd: () => number = Math.random) {
  let fleet: Fleet | undefined, timer = between(PIRATE_FIRST, rnd), attackT: number | undefined, hunt = false;
  const deaths = { body: 0, shot: 0 }; // what broke pirate ships (test hook): touching a body, or slugs, rounds and the beam
  const stats = { rounds: 0, hits: 0, cracked: 0, hauled: 0, shoved: 0 }; // rounds fired, rounds on their target body, rocks cracked, pieces stowed, pieces shoved off a ship (test hook)
  const gap = () => PIRATE_CALM + poissonGap(PIRATE_MEAN, rnd);
  const enemies = () => [...ctx.mine, ...rivals.foes()]; // ships that shoot back: your fighters, rival ships

  /** Your moon system's keep-out (a disc round you): the outer filled slot + SYS[0] R, or SYS[1] R with no moons. */
  function system(): Disc {
    const me = ctx.me, moons = ctx.moons.list();
    return { m: me.m, r: moons.length ? slotRadius(me.r, Math.max(...moons.map((m) => m.slot))) + SYS[0] * me.r : SYS[1] * me.r, motion: me.motion };
  }
  const near = () => (ctx.me.m ? [ctx.me, ...ctx.near] : ctx.near);

  /** Fixed formation slots (ship radii behind and beside the flag), redone only when a ship dies. */
  function slots(fl: Fleet) {
    const alive = fl.ships.filter((s) => !s.dead), point = alive.find((s) => s.kind === 'marauder') ?? alive.find((s) => s.kind === 'raider');
    const haulers = alive.filter((s) => s.kind === 'hauler'), rest = alive.filter((s) => s !== point && s.kind !== 'hauler');
    rest.sort((a, b) => (a.kind === 'marauder' ? -1 : b.kind === 'marauder' ? 1 : 0));
    let row = 0;
    if (point) [point.back, point.side, point.ward, row] = [0, 0, undefined, 1];
    for (const h of haulers) {
      [h.back, h.side] = [row * ROW[0], 0];
      for (const side of [-1, 1]) {
        const e = rest.shift();
        if (e) [e.back, e.side, e.ward] = [row * ROW[0], side * ROW[1], h];
      }
      row++;
    }
    rest.forEach((s, i) => {
      const k = 1 + (i >> 1);
      [s.back, s.side, s.ward] = [(row - 1 + k) * ROW[0], (i % 2 ? 1 : -1) * (1 + k) * ROW[1], undefined];
    });
    fl.slots = false;
  }
  const width = (fl: Fleet) => Math.max(0, ...fl.ships.filter((s) => !s.dead).map((s) => Math.abs(s.side))) * ctx.shipR() + 2 * ctx.shipR();

  /** A lane from the flag across the view: aimed within LANE[1] view half-widths of its centre, ending LANE[0] half-diagonals past it. */
  function lane(fl: Fleet) {
    const c = ctx.cam, a = rnd() * 2 * Math.PI, r = Math.sqrt(rnd()) * LANE[1] * c.halfW, ax = c.x + Math.cos(a) * r, ay = c.y + Math.sin(a) * r;
    const d = Math.hypot(ax - fl.flag.x, ay - fl.flag.y) || 1, dx = (ax - fl.flag.x) / d, dy = (ay - fl.flag.y) / d;
    fl.lane = { x: ax + dx * LANE[0] * ctx.diag(), y: ay + dy * LANE[0] * ctx.diag(), dx, dy };
  }

  /** A fleet appears LANE[0] half-diagonals out, in formation on a lane across the view (test hook: `u` sets its size, rules.ts fleetSize). */
  function launch(u = rnd()) {
    if (fleet) return false;
    const c = ctx.cam, me = ctx.me, R = me.r, sr = ctx.shipR(), a = rnd() * 2 * Math.PI, v = between(PIRATE_SPEED, rnd);
    const p = free({ x: c.x + Math.cos(a) * LANE[0] * ctx.diag(), y: c.y + Math.sin(a) * LANE[0] * ctx.diag() }, [...near(), ...(me.m ? [system()] : [])], SPAWN_ROOM * R);
    const n = fleetSize(u), ships: PShip[] = [];
    const mk = (kind: Kind): PShip => {
      const s: PShip = {
        kind, job: 'form', hull: PIRATE_CLASS[kind].hull, dead: false, g: trigger(), jk: jink(), flee: 0, dry: 0, responding: false, wing: 0, back: 0, side: 0, near: [],
        x: p.x, y: p.y, vx: 0, vy: 0, heading: 0, burn: 0, wx: 0, wy: 0, k: Math.floor(rnd() * 1e6), sense: rnd() < 0.5 ? 1 : -1, out: false,
        pull: 0, mass: 0, comp: { rock: 1 }, stolen: { ore: 0, vol: 0 }, units: 0, kill: () => hit(s),
      };
      return s;
    };
    for (let i = 0; i < n.marauder; i++) ships.push(mk('marauder'));
    for (let i = 0; i < n.raiders; i++) ships.push(mk('raider'));
    for (let i = 0; i < n.haulers; i++) ships.push(mk('hauler'));
    const gun = (k: 0 | 1): Gun => {
      const G = PIRATE_CLASS[k ? 'marauder' : 'raider'].gun;
      return { team: 'pirate', u: SHOT_V * R, life: SHOT_S[k], arc: G.arc, spread: G.spread, tint: TRACER, look: k ? 'shell' : 'pirate', takes: (b) => fleet === fl && fl.cracks.has(b as Body), onBody: (b: Body, x: number, y: number) => fleet === fl && struck(fl, b, x, y, G.hits) };
    };
    const fl: Fleet = {
      ships, n0: ships.length, state: 'cruise', v, flag: { x: p.x, y: p.y, vx: 0, vy: 0, heading: 0, burn: 0 }, flagNear: [], lane: { x: 0, y: 0, dx: 1, dy: 0 }, lanes: 0,
      t: 0, st: 0, tick: 0, held: 0, stay: between(STAY, rnd), onYou: false, cracks: new Map(), loose: [], off: { x: 0, y: 0 }, raidT: 0, lash: { far: 0, slow: 0 }, lashed: false,
      chip: 0, cap: 0, seen: 0, gun: gun(0), big: gun(1), scatter: 0, sx: 0, sy: 0, slots: true, jumped: false, own: new Set(),
    };
    slots(fl);
    lane(fl);
    const f = fl.flag, h = Math.atan2(fl.lane.dy, fl.lane.dx), nx = Math.cos(h), ny = Math.sin(h), fsp = speed(fl) * v * R;
    [f.heading, f.vx, f.vy] = [h, nx * fsp, ny * fsp];
    for (const s of ships) [s.x, s.y, s.vx, s.vy, s.heading] = [f.x - nx * s.back * sr - ny * s.side * sr, f.y - ny * s.back * sr + nx * s.side * sr, f.vx, f.vy, h];
    fleet = fl;
    return true;
  }
  /** The formation's speed, × cruise: slower with a hauler or marauder about. */
  const speed = (fl: Fleet) => (fl.ships.some((s) => !s.dead && s.kind !== 'raider') ? FORM_V : 1);

  /** Leave: everyone forms up round the haulers and flies straight out from the view's centre (ends an attack on you). */
  function leave(fl: Fleet, cx: number, cy: number) {
    if (fl.onYou) [hunt, attackT] = [false, gap()];
    // The flag starts at the haulers (gun ships may be inside your moon system), out of every keep-out by the formation's width.
    const hs = fl.ships.filter((s) => !s.dead && s.kind === 'hauler'), room = PAD * ctx.shipR() + width(fl);
    if (hs.length) [cx, cy] = [hs.reduce((t, s) => t + s.x, 0) / hs.length, hs.reduce((t, s) => t + s.y, 0) / hs.length];
    [cx, cy] = (({ x, y }) => [x, y])(free({ x: cx, y: cy }, ctx.me.m ? [...near(), system()] : near(), room));
    const c = ctx.cam, a = Math.atan2(cy - c.y, cx - c.x) + (rnd() - 0.5) * 2 * LEAVE_ARC, f = fl.flag;
    Object.assign(fl, { state: 'leave', st: 0, target: undefined, onYou: false, loose: [] });
    fl.cracks.clear();
    for (const s of fl.ships) [s.job, s.aim, s.foe, s.responding, s.piece, s.pull] = ['form', undefined, undefined, false, undefined, 0];
    [f.x, f.y] = [cx, cy];
    const end = free({ x: cx + Math.cos(a) * 2 * ctx.diag(), y: cy + Math.sin(a) * 2 * ctx.diag() }, near(), room);
    const d = Math.hypot(end.x - cx, end.y - cy) || 1;
    fl.lane = { x: end.x, y: end.y, dx: (end.x - cx) / d, dy: (end.y - cy) / d };
  }

  function gone(fl: Fleet) {
    if (fl.onYou) [hunt, attackT] = [false, gap()];
    if (fleet === fl) [fleet, timer] = [undefined, poissonGap(PIRATE_GAP, rnd)];
  }

  /** A round on a ship: one hull hit; the last one breaks it. */
  function hit(s: PShip) {
    if (s.dead) return;
    if (--s.hull <= 0) return die(s, 'shot');
    ctx.fx.flash(s.x, s.y, ctx.shipR() * 2, 4, ctx.shipR() * 3);
  }

  function die(s: PShip, why: keyof typeof deaths) {
    const fl = fleet;
    if (s.dead || !fl) return;
    [s.dead, s.piece, fl.slots] = [true, undefined, true];
    deaths[why]++;
    ctx.wreck(s.x, s.y, PIRATE, 1.8);
    if (s.kind !== 'hauler') return;
    // The hold bursts: KEPT of what it carried as 1–4 pieces the field keeps, and your stolen stock comes back × LOOT_BACK.
    const f = ctx.field(), sr = ctx.shipR(), n = Math.min(4, Math.floor((KEPT * s.mass) / (GRAB[0] * ctx.me.m)));
    for (let i = 0; i < n && f; i++) {
      const a = rnd() * Math.PI * 2, v = (0.5 + rnd()) * sr * 6;
      f.spawn(s.x + Math.cos(a) * sr * 2, s.y + Math.sin(a) * sr * 2, s.vx + Math.cos(a) * v, s.vy + Math.sin(a) * v, (KEPT * s.mass) / n, s.comp);
    }
    const back = { ore: s.stolen.ore * LOOT_BACK, vol: s.stolen.vol * LOOT_BACK };
    if (back.ore + back.vol > 0 && ctx.civ) {
      ctx.civ.gain(back.ore, back.vol);
      ctx.fx.popup(s.x, s.y, `+${Math.round(back.ore + back.vol)} ore`, 0x8ef0a8, 1 / ctx.cam.zoom);
      ctx.news('loot', 'Loot recovered', 'A hauler burst: what they stole comes back with interest');
    }
  }

  /** Mass m of composition c aboard a hauler (as stock units at your mass for its hold). */
  function stow(s: PShip, m: number, c: Comp) {
    s.comp = s.mass > 0 ? blend(s.comp, s.mass, c, m) : c;
    s.mass += m;
    s.units += m / (UNIT * Math.max(1e-9, ctx.me.m));
  }
  const room = (fl: Fleet) => fl.ships.find((s) => s.kind === 'hauler' && !s.dead && s.units < HOLD);

  /** Shield and stock gone: a hit knocks CHIP of you off as a catchable piece of water or air, within the raid's cap. */
  function chip(fl: Fleet, a: number) {
    const me = ctx.me, f = ctx.field(), c = me.comp, ice = c.ice ?? 0, gas = c.gas ?? 0, el = rnd() * (ice + gas) < gas ? 'gas' : 'ice';
    const m0 = me.m, m = Math.min(CHIP * m0, fl.cap - fl.chip, 0.5 * (c[el] ?? 0) * m0);
    if (!f || m <= 0) return;
    fl.chip += m;
    const comp: Comp = {}, pm = me.motion, v = 2 * me.r;
    for (const [e, s] of Object.entries(c) as [keyof Comp, number][]) comp[e] = (s * m0 - (e === el ? m : 0)) / (m0 - m);
    me.comp = comp;
    ctx.shed(me, m);
    f.spawn(pm.x + Math.cos(a) * me.r * 1.3, pm.y + Math.sin(a) * me.r * 1.3, pm.vx + Math.cos(a) * v, pm.vy + Math.sin(a) * v, m, { [el]: 1 });
  }

  /** A round on the body it was aimed at: a rock being worked loses `n` hits (cracks at 0); a raided world takes `strike`. */
  function struck(fl: Fleet, b: Body, x: number, y: number, n: number) {
    stats.hits++;
    const left = fl.cracks.get(b);
    if (left === undefined) return strike(fl, b, x, y);
    if (left > n) fl.cracks.set(b, left - n);
    else crack(fl, b);
  }

  /** A round on the world it was aimed at (you or a rival): the shield soaks it, then stock goes into a hauler, then a chip of water or air. */
  function strike(fl: Fleet, b: Body, hx: number, hy: number) {
    const me = ctx.me, T = fl.target, hold = fl.ships.find((s) => s.kind === 'hauler' && !s.dead && s.units < HOLD && s.stolen.ore + s.stolen.vol < STEAL);
    if (T?.kind === 'you' && b === me && ctx.civ && !ctx.civ.shieldTake(PIRATE_K, 1e-4, hx, hy)) {
      if (ctx.civ.stocks.ore + ctx.civ.stocks.vol <= 0) chip(fl, Math.atan2(hy - me.motion.y, hx - me.motion.x)); // no stock left: water or air (no hauler room: nothing)
      else if (hold) {
        const got = ctx.civ.steal(Math.min(1, STEAL - hold.stolen.ore - hold.stolen.vol)); // the last of it too: the hauler has it, nothing is chipped
        hold.stolen.ore += got.ore;
        hold.stolen.vol += got.vol;
        stow(hold, (got.ore + got.vol) * UNIT * me.m, { rock: 0.7, metal: 0.3 });
      }
    } else if (T?.kind === 'rival' && T.rival && b === T.rival.b && !rivals.shieldTake(T.rival, PIRATE_K, 1e-4, hx, hy)) {
      const r = room(fl);
      if (r) stow(r, UNIT * me.m, { rock: 0.6, metal: 0.4 }); // their stock: comes back as pieces if you burst the hauler
    }
  }

  /** A worked rock cracks: crackPieces() unequal pieces (asteroid/rules.ts pieceShares) of KEPT of it, flung out; big ones are cracked again, small ones hauled. */
  function crack(fl: Fleet, b: Body) {
    fl.cracks.delete(b);
    const f = ctx.field(), me = ctx.me;
    if (!f || !b.m) return;
    const n = crackPieces(b.m, me.m), w = pieceShares(n, SHARDS), bm = b.motion, a0 = rnd() * 2 * Math.PI;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i * 2 * Math.PI) / n + (rnd() - 0.5) * 0.2, v = (0.6 + 0.6 * rnd()) * b.r, c = Math.cos(a), s = Math.sin(a), m = KEPT * b.m * w[i];
      const p = f.spawn(bm.x + c * 1.15 * b.r, bm.y + s * 1.15 * b.r, bm.vx + c * v, bm.vy + s * v, m, b.comp, b), share = m / me.m;
      fl.own.add(p);
      if (share > GRAB[1]) fl.cracks.set(p, rockHits(share));
      else if (share >= GRAB[0]) fl.loose.push(p);
    }
    ctx.fx.flash(bm.x, bm.y, b.r * 1.5, 8, b.r * 3);
    ctx.fx.burst(bm.x, bm.y, 14, b.r * 0.1, b.r * 1.5, b.tint);
    ctx.sfx()?.play('crack', 0.3, 1.2);
    ctx.kill(b);
    stats.cracked++;
  }

  /** What the fleet would go for now (THINK): the best score among what it sees within SIGHT. */
  function best(fl: Fleet, alive: PShip[], cx: number, cy: number): Target | undefined {
    const me = ctx.me, R = me.r, reach = SIGHT * ctx.diag(), armed = alive.some((s) => s.kind !== 'hauler'), hold = !!room(fl), sys = system();
    const off = (b: Body) => Math.hypot(b.motion.x - cx, b.motion.y - cy) - b.r;
    const seen = (b: Body) => ctx.onScreen(b.motion.x, b.motion.y, -b.r) && off(b) < reach;
    const score = (v: number, b: Body) => v / (1 + Math.max(0, off(b)) / (10 * R));
    const runs = PAD * ctx.shipR() + (RUN_IN * fl.v * R) / P_TURN + (1 + RUN_OUT) * R; // how far past a rock's radius its gun runs reach
    let top: Target | undefined;
    const offer = (t: Target) => void (t.v > (top?.v ?? 0) && (top = t));
    if (armed && hunt && ctx.civ?.state?.active && seen(me)) offer({ b: me, kind: 'you', v: score(3, me) });
    if (armed) for (const r of rivals.list) if (!r.beaten && live(r.b, me) && seen(r.b)) offer({ b: r.b, kind: 'rival', rival: r, v: score(2, r.b) });
    const rocks: Body[] = [];
    for (const b of ctx.near) {
      const share = b.m / me.m;
      if (b.moon || b.meteor || b.held || b.comet || b.rival || share > BREAK[1] || share < GRAB[0] || !live(b, me) || !seen(b)) continue;
      const out = Math.hypot(b.motion.x - sys.motion.x, b.motion.y - sys.motion.y) - sys.r - b.r; // off your moon system: guns and haulers stay out of it
      if (share >= BREAK[0] && out > runs) rocks.push(b);
      else if (share <= GRAB[1] && hold && out > PAD * ctx.shipR() + R) offer({ b, kind: 'piece', v: score(0.4, b) });
    }
    if (armed) for (const b of rocks) {
      let crowd = 0;
      for (const o of rocks) if (o !== b && Math.hypot(o.motion.x - b.motion.x, o.motion.y - b.motion.y) < 4 * R) crowd++;
      offer({ b, kind: 'rock', v: score(0.5 + (b.comp.ice ?? 0) + (b.comp.metal ?? 0) + Math.min(1, 0.2 * crowd), b) });
    }
    return top;
  }

  /** Takes on a target: work (a rock or piece) or raid (a world); the stand-off point lies on the fleet's side. */
  function engage(fl: Fleet, t: Target, cx: number, cy: number) {
    const me = ctx.me, b = t.b;
    if (fl.onYou && t.kind !== 'you') [hunt, attackT] = [false, gap()];
    Object.assign(fl, { target: t, held: 0, lanes: 0, onYou: t.kind === 'you' });
    if (t.kind === 'you' || t.kind === 'rival') {
      if (fl.state !== 'raid') Object.assign(fl, { state: 'raid', st: 0, raidT: between(RAID_S, rnd), lash: { far: 0, slow: 0 }, lashed: false, chip: 0, cap: CHIP_MAX * ((me.comp.ice ?? 0) + (me.comp.gas ?? 0)) * me.m });
    } else {
      [fl.state, fl.st] = ['work', 0];
      fl.cracks.clear();
      fl.loose = fl.loose.filter((p) => live(p, me));
      if (t.kind === 'rock') fl.cracks.set(b, rockHits(b.m / me.m));
      else if (!fl.loose.includes(b)) fl.loose.push(b);
    }
    const a = Math.atan2(cy - b.motion.y, cx - b.motion.x), r = t.kind === 'you' ? system().r + PAD * ctx.shipR() + GUARD_OUT[1] * me.r : b.r + STAND * me.r;
    [fl.off.x, fl.off.y] = [Math.cos(a) * r, Math.sin(a) * r];
  }

  /** One decision (every THINK s): leave, keep or change the target, then every ship's job. */
  function think(fl: Fleet, alive: PShip[], cx: number, cy: number) {
    const me = ctx.me, R = me.r, haulers = alive.filter((s) => s.kind === 'hauler'), T = fl.target;
    if (fl.slots) slots(fl);
    if (fl.state === 'leave') return;
    fl.loose = fl.loose.filter((p) => live(p, me));
    for (const [b] of fl.cracks) if (!live(b, me)) fl.cracks.delete(b);
    const full = !room(fl), raidOver = fl.state === 'raid' && (!live(T?.b, me) || fl.st >= fl.raidT || fl.lashed);
    if (alive.length <= (1 - RETREAT) * fl.n0 || !haulers.length || full || fl.t >= fl.stay || raidOver) return leave(fl, cx, cy);
    if (fl.state === 'work' && !live(T?.b, me)) {
      // The rock cracked or a piece went: the biggest piece left to crack, else one to haul, else look around.
      const next = [...fl.cracks.keys()].sort((a, b) => b.m - a.m)[0];
      if (next) fl.target = { b: next, kind: 'rock', v: T!.v };
      else if (fl.loose.length) fl.target = { b: fl.loose[0], kind: 'piece', v: T!.v };
      else [fl.state, fl.target] = ['cruise', undefined];
    }
    if (fl.state === 'cruise' || fl.held >= COMMIT) {
      const t = best(fl, alive, cx, cy), cur = fl.target;
      if (t && cur && t.b === cur.b) cur.v = t.v;
      else if (t && (!cur || t.v > cur.v) && !fl.cracks.has(t.b) && !fl.loose.includes(t.b)) engage(fl, t, cx, cy);
    }
    assign(fl, alive, haulers, cx, cy, R);
  }

  /** Jobs: threat responders, then gun wings (≤ WING a target), haulers on pieces, the rest guard (or form). */
  function assign(fl: Fleet, alive: PShip[], haulers: PShip[], cx: number, cy: number, R: number) {
    const foes = enemies(), me = ctx.me, guns = alive.filter((s) => s.kind !== 'hauler');
    for (const s of guns) {
      if (s.foe && (!foes.concat(ctx.miners).includes(s.foe) || Math.hypot(s.foe.x - s.x, s.foe.y - s.y) > THREAT[2] * R)) [s.foe, s.responding] = [undefined, false];
    }
    // An enemy ship near a hauler or the fleet centre draws up to RESPOND raiders.
    for (const e of foes) {
      if (!haulers.some((h) => Math.hypot(h.x - e.x, h.y - e.y) < THREAT[0] * R) && Math.hypot(cx - e.x, cy - e.y) >= THREAT[1] * R) continue;
      let n = guns.filter((s) => s.foe === e).length;
      for (const s of guns.filter((q) => q.kind === 'raider' && !q.foe).sort((p, q) => Math.hypot(p.x - e.x, p.y - e.y) - Math.hypot(q.x - e.x, q.y - e.y))) {
        if (n++ >= RESPOND) break;
        [s.foe, s.responding] = [e, true];
      }
    }
    const working = fl.state === 'work' || fl.state === 'raid';
    // Targets for the guns: the rocks being cracked (the main one first), or the raided world and its ships (once on screen T_SEE s).
    const aims: Body[] = fl.state === 'work' ? [...(fl.target?.kind === 'rock' ? [fl.target.b] : []), ...[...fl.cracks.keys()].filter((b) => b !== fl.target?.b)] : fl.state === 'raid' && fl.target ? [fl.target.b] : [];
    const prey = fl.state === 'raid' && fl.seen >= T_SEE ? [...(fl.onYou ? [...ctx.miners, ...ctx.mine] : []), ...rivals.foes()].filter((f) => ctx.onScreen(f.x, f.y)) : [];
    for (const s of guns) if (!s.responding) {
      if (!working || (s.aim && !aims.includes(s.aim))) s.aim = undefined;
      if (s.foe && (!prey.includes(s.foe) || !working)) s.foe = undefined;
    }
    const wing = (t: Body | Foe) => guns.filter((s) => s.aim === t || s.foe === t).length;
    const idle = guns.filter((s) => !s.responding && !s.aim && !s.foe).sort((a, b) => (a.kind === 'marauder' ? -1 : b.kind === 'marauder' ? 1 : 0) || (a.ward ? 1 : 0) - (b.ward ? 1 : 0));
    for (const s of idle) {
      const p = nearest(prey.filter((f) => wing(f) < WING), s.x, s.y, PREY * R);
      if (p) [s.foe, s.dry, s.out] = [p, 0, false];
      else if ((s.aim = aims.find((b) => wing(b) < WING))) [s.dry, s.out] = [0, false]; // a new target: a fresh run in
    }
    for (const s of guns) {
      const job = s.foe || s.aim ? 'gun' : working ? 'guard' : 'form';
      if (job === 'gun' && s.job !== 'gun') [s.dry, s.out] = [0, false];
      s.job = job;
    }
    // A wing a target: each ship's place in it (the 2nd and 3rd come in off the 1st one's line).
    const wings = new Map<Body | Foe, number>();
    for (const s of guns) {
      const t = s.job === 'gun' ? s.foe ?? s.aim : undefined;
      s.wing = t ? wings.get(t) ?? 0 : 0;
      if (t) wings.set(t, s.wing + 1);
    }
    // Haulers: a loose piece each (claimed, outside your moon system) while they have room; else guard (or form).
    const sys = system();
    for (const h of haulers) {
      if (h.piece && (!live(h.piece, me) || !working || h.units >= HOLD)) [h.piece, h.pull] = [undefined, 0];
      if (!h.piece && working && h.units < HOLD && h.flee <= 0) {
        h.piece = fl.loose.filter((p) => !haulers.some((o) => o.piece === p) && Math.hypot(p.motion.x - sys.motion.x, p.motion.y - sys.motion.y) > sys.r + p.r + PAD * ctx.shipR())
          .sort((a, b) => Math.hypot(a.motion.x - h.x, a.motion.y - h.y) - Math.hypot(b.motion.x - h.x, b.motion.y - h.y))[0];
      }
      h.job = h.piece ? 'haul' : working ? 'guard' : 'form';
    }
  }

  function step(fl: Fleet, dt: number) {
    const me = ctx.me, R = me.r, sr = ctx.shipR(), alive = fl.ships.filter((s) => !s.dead);
    if (!alive.length) {
      if (!fl.jumped) ctx.news('pirates-down', 'Pirate fleet destroyed', 'Burst haulers spill what they stole');
      return gone(fl);
    }
    [fl.t, fl.st, fl.held] = [fl.t + dt, fl.st + dt, fl.held + dt];
    if (alive.some((s) => ctx.onScreen(s.x, s.y))) {
      fl.seen += dt;
      ctx.news('pirates', 'Pirate fleet', 'Raiders crack rocks and haulers carry them off · they break on anything they touch');
    }
    let cx = 0, cy = 0, cvx = 0, cvy = 0;
    for (const s of alive) [cx, cy, cvx, cvy] = [cx + s.x / alive.length, cy + s.y / alive.length, cvx + s.vx / alive.length, cvy + s.vy / alive.length];
    if ((fl.tick += dt) >= THINK) {
      fl.tick -= THINK;
      think(fl, alive, cx, cy);
    }
    const sp = fl.v * R, fsp = speed(fl) * sp, T = fl.target, tb = T && live(T.b, me) ? T.b : undefined;
    let spread = 0;
    for (const s of alive) spread = Math.max(spread, Math.hypot(s.x - cx, s.y - cy));
    // The bodies near the fleet, once a frame (each ship's scan reads only these): within reach of the fleet at their speed.
    const look = (LOOK + 2 / FLAG_TURN) * 1.3 * sp + width(fl), bodies = reachOf(near(), cx, cy, 0, 0, spread + look, LOOK + 2 / FLAG_TURN);
    const withSys = [...bodies, system()];
    const stand = tb ? free({ x: tb.motion.x + fl.off.x, y: tb.motion.y + fl.off.y, vx: tb.motion.vx, vy: tb.motion.vy }, withSys.filter((b) => b !== tb), PAD * sr + (GUARD_OUT[1] + 1) * R) : undefined; // room for the guards' circuit, outside your moon system too
    if (fl.state === 'raid' && tb) {
      const tv = Math.hypot(tb.motion.vx, tb.motion.vy);
      fl.lashed ||= leash(fl.lash, Math.hypot(fl.flag.x - me.motion.x, fl.flag.y - me.motion.y), LEASH * ctx.diag(), tv > CHASE_V * sp, dt);
    }
    // Scatter (in formation): a moving body on course for the fleet centre (missing by less than its spread), slow enough to dodge.
    if ((fl.scatter -= dt) <= 0 && (fl.state === 'cruise' || fl.state === 'leave')) {
      fl.scatter = 0;
      for (const b of bodies) {
        if (b.r < 3 * sr || b === tb || Math.hypot(b.motion.vx, b.motion.vy) < 0.5 * sp) continue; // a still body: the flag steers round it
        const px = b.motion.x - cx, py = b.motion.y - cy, wx = b.motion.vx - cvx, wy = b.motion.vy - cvy, w2 = wx * wx + wy * wy, d = Math.hypot(px, py) || 1e-9;
        const close = -(px * wx + py * wy) / d, t = -(px * wx + py * wy) / (w2 || 1e-9);
        if (close <= 0 || close > DODGE * sp || t > SCATTER[0] || Math.hypot(px + wx * t, py + wy * t) >= spread + b.r + R) continue;
        const w = Math.sqrt(w2);
        [fl.scatter, fl.sb, fl.sx, fl.sy] = [SCATTER[1], b, wx / w, wy / w];
        break;
      }
    }
    // Evasion: gun ships jink off a ship closing nose-on or a round about to pass; a hauler drops its line and runs to a guard.
    const foes = enemies();
    for (const s of alive) {
      s.jk.cool = Math.max(0, s.jk.cool - dt);
      s.flee = Math.max(0, s.flee - dt);
      const m = menace(s, foes, ctx.shots, 'pirate', sr, R);
      if (!m) continue;
      if (s.kind !== 'hauler') startJink(s, s.jk, m.x, m.y, m.vx, m.vy);
      else if (s.flee <= 0) [s.flee, s.piece, s.pull] = [FLEE_S, undefined, 0];
    }
    // Scans: transit ships keep out of your moon system; a gun ship's own target bends its run only inside the turn-out.
    // A rock one burst from cracking keeps every ship out of its pieces' fling (its keep-out grows by its radius + PAD).
    const big = new Set(alive.filter((s) => s.kind === 'marauder').map((s) => s.aim)), hot = new Set<Disc>();
    for (const [b, left] of fl.cracks) if (left <= HOT || big.has(b)) hot.add(b);
    const grow = (b: Disc) => (hot.has(b) ? b.r + PAD * sr : 0);
    fl.flagNear = scan(fl.flag, withSys, () => false, sr, fsp, FLAG_TURN, { wide: width(fl), grow });
    for (const s of alive) {
      const list = s.job === 'gun' && fl.onYou ? bodies : withSys, aim = s.job === 'gun' && !s.foe ? s.aim : undefined;
      s.near = scan(s, list, (b) => b === aim || b === s.piece, sr, PIRATE_CLASS[s.kind].speed * sp, TURNS[s.kind], { grow: s.job === 'gun' ? undefined : grow }); // gun ships turn out well clear of a crack; the shove keeps fresh pieces off them
      if (aim) {
        const keep = aim.r + PAD * sr, gap = Math.hypot(aim.motion.x - s.x, aim.motion.y - s.y) - keep, r0 = turnOut(s, aim, sp, sr, R);
        for (const n of s.near) if (fl.cracks.has(n.b as Body) || fl.loose.includes(n.b as Body)) n.reach = Math.min(n.reach, r0 - n.keep); // the rocks and pieces they work: bent round only inside the turn-out too (the shove keeps their pieces off)
        s.near.push({ b: aim, keep, reach: r0 - keep, gap });
        s.near.sort((p, q) => q.gap - p.gap);
      }
    }
    const guards = alive.filter((s) => s.job === 'guard' && s.kind !== 'hauler');
    const dtc = Math.min(dt, MAX_DT), n = steps(dtc), h = dtc / n;
    for (let k = 0; k < n; k++) {
      // The flag: along its lane at formation speed, or onto the stand-off point; clear of bodies by the formation's width.
      const f = fl.flag;
      if (stand && (fl.state === 'work' || fl.state === 'raid')) approach(f, stand.x, stand.y, stand.vx, stand.vy, 0, CHASE_V * sp, BRAKE * P_ACC * fsp);
      else {
        const dx = fl.lane.x - f.x, dy = fl.lane.y - f.y, d = Math.hypot(dx, dy) || 1e-9;
        [want.x, want.y] = [(dx / d) * fsp, (dy / d) * fsp];
      }
      clear(f, fl.flagNear, fsp);
      thrust(f, P_ACC * fsp, FLAG_TURN, h, 0, 0, CHASE_V * sp);
      for (const s of alive) fly(fl, s, h, sp, sr, R, stand, guards);
    }
    // Shove: their own piece (cracked, loose, or a small rock being cracked) closing within SHOVE ship radii of a hull has its
    // drift off that ship brought up to SHOVE[2] R/s by the tractor (gravity keeps pushing pieces into the ships circling them).
    for (const p of new Set([...fl.own, ...fl.loose, ...fl.cracks.keys()])) {
      if (!live(p, me)) fl.own.delete(p);
      if (!live(p, me) || p.m > SHOVE[1] * me.m) continue;
      for (const s of alive) {
        if (s.piece === p) continue;
        const dx = p.motion.x - s.x, dy = p.motion.y - s.y, d = Math.hypot(dx, dy) || 1e-9;
        if (d > p.r + SHOVE[0] * sr) continue;
        if ((p.motion.vx - s.vx) * dx + (p.motion.vy - s.vy) * dy >= 0) continue; // parting already
        const kick = SHOVE[2] * R - (p.motion.vx * dx + p.motion.vy * dy) / d; // its own drift off the ship brought up to SHOVE[2] R/s (never the ship's speed: no snowplough)
        if (kick <= 0) continue;
        stats.shoved++;
        [p.motion.vx, p.motion.vy] = [p.motion.vx + (dx / d) * kick, p.motion.vy + (dy / d) * kick];
        ctx.lines.moveTo(s.x, s.y).lineTo(p.motion.x, p.motion.y).stroke({ width: sr / 5, color: PIRATE, alpha: 0.25 });
      }
    }
    // Hauling: a piece within reach is pulled in on the tractor line, then it is aboard.
    for (const s of alive) {
      const p = s.piece;
      if (!p || s.job !== 'haul' || !live(p, me)) continue;
      if (Math.hypot(p.motion.x - s.x, p.motion.y - s.y) >= p.r + 5 * sr) {
        s.pull = 0;
        continue;
      }
      p.motion.vx += (s.x - p.motion.x) * dt * 2;
      p.motion.vy += (s.y - p.motion.y) * dt * 2;
      ctx.lines.moveTo(s.x, s.y).lineTo(p.motion.x, p.motion.y).stroke({ width: sr / 5, color: PIRATE, alpha: 0.35 });
      if ((s.pull += dt) < PULL_S) continue;
      stow(s, p.m, p.comp);
      ctx.kill(p);
      stats.hauled++;
      [s.piece, s.pull] = [undefined, 0];
      fl.loose = fl.loose.filter((q) => q !== p);
    }
    // Guns: a burst while the target bears on the inbound leg, in range, the lead point in the arc and the line clear.
    for (const s of alive) {
      const G = PIRATE_CLASS[s.kind].gun;
      if (G && s.job === 'gun') fire(fl, s, G, dt, sr, R, alive);
      ctx.draw(s.kind, s.x, s.y, s.heading, s.burn, s.bank ?? 0);
    }
    // Lanes in cruise: past a lane's end, another across the view; two with nothing and they leave.
    const f = fl.flag;
    if (fl.state === 'cruise' && (fl.lane.x - f.x) * fl.lane.dx + (fl.lane.y - f.y) * fl.lane.dy < 2 * R) {
      if (++fl.lanes >= 2) leave(fl, cx, cy);
      else lane(fl);
    }
    if (fl.state !== 'leave') return;
    // Leaving: the lane runs on; gone once every ship is past GONE half-diagonals; ships still on screen after JUMP_S jump out.
    const c = ctx.cam, out = (s: PShip) => Math.hypot(s.x - c.x, s.y - c.y) > GONE * ctx.diag();
    if ((fl.lane.x - f.x) * fl.lane.dx + (fl.lane.y - f.y) * fl.lane.dy < 2 * R) [fl.lane.x, fl.lane.y] = [f.x + fl.lane.dx * ctx.diag(), f.y + fl.lane.dy * ctx.diag()];
    const late = fl.st >= JUMP_S && alive.some((s) => ctx.onScreen(s.x, s.y));
    if (alive.every(out) || fl.st >= 2 * JUMP_S) return gone(fl);
    if (!late) return;
    for (const s of alive) if (s.kind === 'hauler' || fl.st >= JUMP_S + 0.5) {
      if (ctx.onScreen(s.x, s.y)) ctx.fx.flash(s.x, s.y, sr * 4, 10, sr * 8);
      [s.dead, fl.jumped] = [true, true];
    }
  }

  /** A gun run at body b turns out this far from its centre: its keep-out + RUN_IN turn radii + 1 R. */
  const turnOut = (s: PShip, b: Body, sp: number, sr: number, R: number) => b.r + PAD * sr + (RUN_IN * PIRATE_CLASS[s.kind].speed * sp) / TURNS[s.kind] + R;

  /** One sub-step of one ship: evasion, else its job's route; then clear of bodies and thrust. */
  function fly(fl: Fleet, s: PShip, h: number, sp: number, sr: number, R: number, stand: { x: number; y: number; vx: number; vy: number } | undefined, guards: PShip[]) {
    const ss = PIRATE_CLASS[s.kind].speed * sp;
    let fx = 0, fy = 0; // the frame the nose reads its motion in: a gun ship's target body, else space
    if (s.flee > 0) {
      const g = nearest(guards, s.x, s.y, Infinity);
      const dx = g ? g.x - s.x : s.vx, dy = g ? g.y - s.y : s.vy, d = Math.hypot(dx, dy) || 1e-9;
      [want.x, want.y] = [(dx / d) * ss, (dy / d) * ss];
    } else if (fl.scatter > 0 && fl.sb) {
      const side = (s.x - fl.sb.motion.x) * -fl.sy + (s.y - fl.sb.motion.y) * fl.sx >= 0 ? 1 : -1;
      [want.x, want.y] = [-fl.sy * side * SCATTER[2] * ss, fl.sx * side * SCATTER[2] * ss];
    } else if (!jinkStep(s.jk, ss, h)) {
      const t = s.job === 'gun' ? (s.foe ?? s.aim?.motion) : undefined;
      if (s.job === 'gun' && t) {
        const tvx = t.vx ?? 0, tvy = t.vy ?? 0, body = !s.foe && s.aim ? s.aim : undefined, r0 = body ? turnOut(s, body, sp, sr, R) : R;
        strafe(s, s.x - t.x, s.y - t.y, s.vx - tvx, s.vy - tvy, r0, r0 + RUN_OUT * R, 0, ss, body ? SWING : undefined); // the target's keep-out is in its scan list
        if (!s.out && s.wing) {
          const a = (s.wing % 2 ? 1 : -1) * SPLAY, c = Math.cos(a), n = Math.sin(a);
          [want.x, want.y] = [want.x * c - want.y * n, want.x * n + want.y * c];
        }
        [want.x, want.y, fx, fy] = [want.x + tvx, want.y + tvy, body ? tvx : 0, body ? tvy : 0];
      } else if (s.job === 'haul' && s.piece) {
        const p = s.piece.motion;
        approach(s, p.x, p.y, p.vx, p.vy, s.piece.r + 3 * sr, ss, BRAKE * P_ACC * ss);
      } else if (s.job === 'guard' && stand) {
        const c = stand, cvx = c.vx, cvy = c.vy; // never round a hauling hauler: its tractored piece crosses that circle
        circuit(s, s.x - c.x, s.y - c.y, GUARD_IN.map((r) => r * R), GUARD_OUT.map((r) => r * R), GUARD_V * sp, TURNS[s.kind]);
        [want.x, want.y] = [want.x + cvx, want.y + cvy];
      } else follow(s, fl.flag, s.back * sr, s.side * sr, AHEAD * sr, 1.3 * ss);
    }
    clear(s, s.near, ss, 0, TOPS[s.kind] * ss);
    thrust(s, P_ACC * ss, TURNS[s.kind], h, fx, fy, TOPS[s.kind] * ss);
  }

  /** A gun ship's trigger this frame: held while it closes on its target (the inbound leg), in range, the lead point in its arc, nothing else on the line. */
  function fire(fl: Fleet, s: PShip, G: NonNullable<(typeof PIRATE_CLASS)[Kind]['gun']>, dt: number, sr: number, R: number, alive: PShip[]) {
    const gun = s.kind === 'marauder' ? fl.big : fl.gun, b = s.foe ? undefined : s.aim, t = s.foe ?? b?.motion;
    gun.u = SHOT_V * R;
    if (!t) return;
    const tx = t.x, ty = t.y, tvx = t.vx ?? 0, tvy = t.vy ?? 0, tr = b?.r ?? 0, armed = !!b && fl.cracks.has(b) ? true : fl.seen >= T_SEE, d = Math.hypot(tx - s.x, ty - s.y) - tr;
    if (d < (G.range + RUN_OUT) * R) s.dry += dt; // s in its runs since the last burst (test hook)
    const closing = (tx - s.x) * (s.vx - tvx) + (ty - s.y) * (s.vy - tvy) > 0; // the inbound leg: closing on it
    const held = armed && closing && d < G.range * R && inArc(s, tx, ty, tvx, tvy, gun.u, G.arc) && clearLine(s, tx, ty, tr, b, alive, sr);
    const p = pull(s.g, dt, held, G.rounds, G.rate, G.gap);
    if (p && ctx.shots.fire(gun, s.g, p === 1, s.x, s.y, s.vx, s.vy, s.heading, tx, ty, tvx, tvy, b)) {
      stats.rounds++;
      s.dry = 0;
    }
  }

  /** Nothing but the target between a ship and (tx, ty) (radius tr): no other body from its scan (bar rocks being worked), no ship of its own fleet. */
  function clearLine(s: PShip, tx: number, ty: number, tr: number, b: Body | undefined, alive: PShip[], sr: number) {
    const dx = tx - s.x, dy = ty - s.y, L = Math.hypot(dx, dy) || 1e-9, ux = dx / L, uy = dy / L, end = L - tr;
    const blocks = (x: number, y: number, r: number) => {
      const qx = x - s.x, qy = y - s.y, along = qx * ux + qy * uy;
      return along > 0 && along < end && Math.abs(qx * uy - qy * ux) < r;
    };
    for (const n of s.near) if (n.b !== b && !fleet?.cracks.has(n.b as Body) && blocks(n.b.motion.x, n.b.motion.y, n.b.r + sr)) return false; // a rock they work takes the round too
    for (const o of alive) if (o !== s && blocks(o.x, o.y, 1.5 * sr)) return false;
    return true;
  }

  const afloat = () => (fleet?.ships ?? []).filter((s) => !s.dead);
  rivals.watch(afloat); // their patrols hunt raiders
  return {
    get fleet() {
      return fleet;
    },
    deaths,
    stats,
    /** Test hook: launch a fleet now (false: one is already about). */
    launch,
    /** Test hook: an attack on you is due now. */
    attack: () => void (hunt = true),
    update(dt: number, civ: Ctx['civ']) {
      if (!ctx.me.m) return;
      if (civ && !hunt && (attackT = (attackT ?? gap()) - dt) <= 0) hunt = true;
      if (!fleet && ctx.cam.halfW > 0 && (timer -= dt) <= 0) launch(); // a zero-size view would launch it on you
      if (fleet) step(fleet, dt);
    },
    /** Slugs and the beam: any touch breaks a ship. */
    marks: (): Mark[] => afloat().map((s) => ({ x: s.x, y: s.y, r: ctx.shipR(), kill: () => die(s, 'shot') })),
    foes: afloat, // rounds: each takes one hull hit (`kill` = hit)
    /** Ships die touching any body, swept along this frame's relative motion so fast bodies never tunnel; a hauler's claimed piece is spared. */
    contacts(bodies: Body[], dt: number) {
      if (!fleet) return;
      const sr = ctx.shipR();
      for (const s of fleet.ships) {
        if (s.dead) continue;
        const hit = bump(s.x, s.y, s.vx, s.vy, bodies, sr, dt, (b) => b === s.piece, MISS_V * ctx.me.r);
        if (hit && !hit.miss) [bumps.pirate.wreck] = [bumps.pirate.wreck + 1, die(s, 'body')];
        else if (sparks(ctx.fx, s, hit, dt, sr * 0.4, TRACER, ctx.onScreen)) bumps.pirate.miss++;
      }
    },
    destroy() {
      fleet = undefined;
    },
  };
}
