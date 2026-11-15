import { clamp } from '../../core/rng.ts';
import { ACC, arrive, ATTACK_V, avoid, BRAKE, circuit, CLEAR, CLIMB, follow, GUN, GUN_ARC, inArc, INNER, keepOut, OUTER, RETURN_V, S_ACC, S_TURN, SHOT_V, SPECK, thrust, TURN, want, WING, wrap, type Craft, type Fighter } from './flight.ts';
import { intercept, SIEGE } from './rules.ts';

// Steering round bodies, every faction. Once a frame `scan` lists the ≤ NEAR bodies in reach (nearest last); every
// sub-step `clear` bends `want` round each one's keep-out circle in its own frame (the body carried on by the time since
// the scan), passing on the side the ship already flies (its velocity, so the side never flips). Threaded scans
// (`thread`) first look at each pair's surface gap on arrival: 6–10 ship radii both keep-outs squeeze so the ship flies
// the gap (slower while squeezed), closer the pair is one disc; a bent course keeps only its speed along the tangent
// (at least BEND of it: a hard bend slows the ship, so it can turn). Unthreaded: full speed along the tangent, slower
// among two, braking away when stuck. Home ships fly in their world's frame (`scanRel`, `clearRel`). `free` moves a goal
// out of bodies; `reachOf` pre-filters a list. The siege ring round an enemy world: `ringStep`, `siegePost` (at the end).
/** A body as flight sees it (asteroid/body.ts Body); `fast`: it wrecks any ship it touches (the star, star/colony.ts); a moon or held world is never a pebble. */
export type Disc = { m: number; r: number; motion: { x: number; y: number; vx: number; vy: number }; fast?: unknown; moon?: boolean; held?: boolean };
/** A body to steer round this frame: its keep-out radius, how far ahead it starts to bend the course, the gap to its keep-out; threaded: `q` the share of its pad a squeeze left. */
export type Near = { b: Disc; keep: number; reach: number; gap: number; q?: number };
/** `wide` widens each keep-out (a formation's half-width), `grow` one body's (a rock about to crack); `dodge` × cruise: bodies closing faster are not dodged. */
type ScanOpts<B> = { wide?: number; grow?: (b: B) => number; thread?: boolean; dodge?: number };
export const PAD = 5; // ship radii off a body's surface: the keep-out...
const LAG = 0.1; // ...plus this many s of the speed relative to it (at most another body radius)
export const LOOK = 1.2; // s ahead a ship watches (plus two turn radii)...
const NEAR = 4; // ...for at most this many bodies
export const DODGE = 3; // × cruise: bodies closing faster are not dodged; home ships pass HOME_DODGE
export const HOME_DODGE = 12; // they fly in their world's frame, so the field streams past them at its speed
const CROWD = 0.6; // × cruise at most among two or more bodies
const STUCK = 0.5; // × cruise: still bent by two after two passes, it brakes away from the nearest
const THREAD = [6, 10]; // ship radii: a pair's surface gap on arrival this wide is threaded (both pads squeeze to SQUEEZE of it); narrower, one disc
const SQUEEZE = 0.45;
const BEND = 0.3; // threaded: a bent course keeps its speed along the tangent, at least this share

/** The ≤ NEAR bodies a craft (radius `sr`, cruise `sp`, turn rate `turn`) must steer round, nearest last. */
export function scan<B extends Disc>(c: Craft, bodies: readonly B[], skip: (b: B) => boolean, sr: number, sp: number, turn: number, o: ScanOpts<B> = {}): Near[] {
  const out: Near[] = [], wide = o.wide ?? 0, grow = o.grow, dodge = o.dodge ?? DODGE;
  for (const b of bodies) {
    if (!b.m || b.r < SPECK * sr) continue;
    const m = b.motion, dx = m.x - c.x, dy = m.y - c.y, ux = Math.abs(c.vx - m.vx), uy = Math.abs(c.vy - m.vy), more = wide + (grow?.(b) ?? 0), far0 = 2 * b.r + PAD * sr + more + (LOOK + 2 / turn) * Math.max(ux + uy, 0.5 * sp);
    if (Math.abs(dx) > far0 || Math.abs(dy) > far0) continue; // a cheap bound first (|w| ≤ ux + uy)
    const w = Math.hypot(ux, uy), wr = Math.max(w, 0.5 * sp);
    const keep = b.r + PAD * sr + Math.min(LAG * w, b.r) + more, reach = LOOK * wr + (2 * wr) / turn, far = keep + reach;
    if (Math.abs(dx) > far || Math.abs(dy) > far || w > dodge * sp || skip(b)) continue;
    const gap = Math.hypot(dx, dy) - keep;
    if (gap < reach) out.push(o.thread ? { b, keep, reach, gap, q: 1 } : { b, keep, reach, gap });
  }
  out.sort((p, q) => q.gap - p.gap);
  const near = out.length > NEAR ? out.slice(out.length - NEAR) : out;
  if (o.thread) weave(c, near, sr);
  return near;
}

/** The pair pass (≤ 6 pairs): a gap to thread squeezes both keep-outs, a narrower one merges the pair; then the gaps again, nearest last. */
function weave(c: Craft, near: Near[], sr: number) {
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
    const a = near[i], e = near[j], ma = a.b.motion, me = e.b.motion, dx = me.x - ma.x, dy = me.y - ma.y, d = Math.hypot(dx, dy) || 1e-9;
    const u = Math.hypot(c.vx - (ma.vx + me.vx) / 2, c.vy - (ma.vy + me.vy) / 2), there = Math.hypot((ma.x + me.x) / 2 - c.x, (ma.y + me.y) / 2 - c.y) / Math.max(u, 1e-9);
    const g = d - a.b.r - e.b.r + ((dx * (me.vx - ma.vx) + dy * (me.vy - ma.vy)) / d) * Math.min(there, LOOK); // the gap when it gets there
    if (g >= THREAD[1] * sr) continue;
    if (g >= THREAD[0] * sr) {
      for (const n of [a, e]) if (n.b.r + SQUEEZE * g < n.keep) [n.keep, n.q] = [n.b.r + SQUEEZE * g, Math.min(n.q ?? 1, (SQUEEZE * g) / (PAD * sr))];
      continue;
    }
    const r = (d + a.b.r + e.b.r) / 2, k = r - a.b.r, M = a.b.m + e.b.m; // one disc over both, its centre k past a's along the line
    const b: Disc = { m: M, r, motion: { x: ma.x + (dx / d) * k, y: ma.y + (dy / d) * k, vx: (ma.vx * a.b.m + me.vx * e.b.m) / M, vy: (ma.vy * a.b.m + me.vy * e.b.m) / M } };
    near[i] = { b, keep: r + Math.max(a.keep - a.b.r, e.keep - e.b.r), reach: Math.max(a.reach, e.reach), gap: 0, q: 1 };
    near.splice(j, 1);
    j = i; // the merged disc against the rest again
  }
  for (const n of near) n.gap = Math.hypot(n.b.motion.x - c.x, n.b.motion.y - c.y) - n.keep;
  near.sort((p, q) => q.gap - p.gap);
}

/** Bends `want` round one keep-out circle in the body's frame (`t` s after the scan); true when it had to. */
function bend(c: Craft, n: Near, t: number) {
  const m = n.b.motion, px = c.x - (m.x + m.vx * t), py = c.y - (m.y + m.vy * t), d = Math.hypot(px, py) || 1e-9, ux = -px / d, uy = -py / d; // u: toward the body
  const wx = want.x - m.vx, wy = want.y - m.vy, vx = c.vx - m.vx, vy = c.vy - m.vy, inside = d < n.keep;
  const sp = Math.max(Math.hypot(wx, wy), inside ? CLIMB * (n.keep - d) : 0);
  if (sp < 1e-9) return false;
  const v = Math.hypot(vx, vy), cv = ux * vy - uy * vx, cw = (ux * wy - uy * wx) / sp, s = (Math.abs(cv) > 0.02 * v ? cv : cw) >= 0 ? 1 : -1; // the side it is passing on
  const dot = (ux * wx + uy * wy) / sp;
  if (inside) {
    const close = Math.max(0, ux * vx + uy * vy);
    if (dot <= 0 && close <= 0) return false; // on its way out
    const out = Math.min(1, (CLIMB * (n.keep - d) + close) / sp), t = Math.sqrt(1 - out * out); // slide, climbing out harder when deeper or closing
    want.x = m.vx + (-s * uy * t - ux * out) * sp;
    want.y = m.vy + (s * ux * t - uy * out) * sp;
    return true;
  }
  const sin = n.keep / d;
  if (dot <= 0 || Math.abs(cw) >= sin * (1 - 1e-6) || d * dot - n.keep > n.reach) return false;
  const cos = Math.sqrt(1 - sin * sin), tx = ux * cos - s * uy * sin, ty = s * ux * sin + uy * cos, k = n.q === undefined ? 1 : Math.max(BEND, (tx * wx + ty * wy) / sp);
  want.x = m.vx + tx * sp * k;
  want.y = m.vy + ty * sp * k;
  return true;
}

/**
 * Bends `want` round every `scan`ned body (two passes), each carried on by `t` s since the scan. `sp`: its cruise.
 * Threaded: slower while a squeezed body bends it. Unthreaded: slower among two; true when blocked (two bodies still
 * bending in the second pass and the course still into one of them: it then brakes away from the nearest of those).
 * `top` (pirates): a course faster than its top past a faster body ahead of which it sits steps across that body's track
 * at its top instead, on the side it is on (it cannot match the body's speed).
 */
export function clear(c: Craft, near: readonly Near[], sp: number, t = 0, top = Infinity) {
  const blocked = route(c, near, sp, t);
  if (top < Infinity && Math.hypot(want.x, want.y) > top) for (let i = near.length - 1; i >= 0; i--) {
    const m = near[i].b.motion, bv = Math.hypot(m.vx, m.vy), px = c.x - m.x - m.vx * t, py = c.y - m.y - m.vy * t;
    if (bv <= top || px * m.vx + py * m.vy <= 0) continue;
    const s = m.vx * py - m.vy * px >= 0 ? top / bv : -top / bv;
    [want.x, want.y] = [-m.vy * s, m.vx * s];
    break;
  }
  return blocked;
}
function route(c: Craft, near: readonly Near[], sp: number, t: number) {
  if (!near.length) return false;
  const thread = near[0].q !== undefined;
  let bent = 0, sq: Near | undefined;
  for (let pass = 0; pass < 2; pass++) {
    bent = 0;
    for (const n of near) if (bend(c, n, t)) [bent, sq] = [bent + 1, (n.q ?? 1) < (sq?.q ?? 1) ? n : sq];
  }
  if (thread) {
    if (!sq) return false;
    const o = sq.b.motion, wx = want.x - o.vx, wy = want.y - o.vy, w = Math.hypot(wx, wy), cap = (0.5 + 0.5 * sq.q!) * sp;
    if (w > cap) [want.x, want.y] = [o.vx + (wx / w) * cap, o.vy + (wy / w) * cap];
    return false;
  }
  let on = near[near.length - 1], worst = Infinity;
  if (bent >= 2) {
    const [x, y] = [want.x, want.y];
    for (const n of near) {
      const m = n.b.motion, g = Math.hypot(c.x - (m.x + m.vx * t), c.y - (m.y + m.vy * t)) - n.keep;
      if (bend(c, n, t) && g < worst) [on, worst] = [n, g];
      [want.x, want.y] = [x, y];
    }
  }
  const o = on.b.motion;
  if (worst < Infinity) {
    // Away from it, slower while the nose still points at it (a nose-first craft keeps half the asked speed into a turn).
    const dx = c.x - (o.x + o.vx * t), dy = c.y - (o.y + o.vy * t), d = Math.hypot(dx, dy) || 1e-9;
    const k = STUCK * sp * Math.max(0.1, (Math.cos(c.heading) * dx + Math.sin(c.heading) * dy) / d);
    want.x = o.vx + (dx / d) * k;
    want.y = o.vy + (dy / d) * k;
    return true;
  }
  const wx = want.x - o.vx, wy = want.y - o.vy, w = Math.hypot(wx, wy);
  if (near.length >= 2 && w > CROWD * sp) [want.x, want.y] = [o.vx + (wx / w) * CROWD * sp, o.vy + (wy / w) * CROWD * sp];
  return false;
}

/** A home body's motion (world units) and the time since the frame's scan: home ships fly relative to it. */
export type Home = { x: number; y: number; vx: number; vy: number; t: number };
/** `scan` for a craft flying relative to its home body `o` (bodies in world units; threaded, HOME_DODGE); kept as `c.near`. */
export function scanRel<B extends Disc>(c: Craft, o: { x: number; y: number; vx: number; vy: number }, bodies: readonly B[], skip: (b: B) => boolean, sr: number, sp: number, turn: number, wide = 0) {
  const a: Craft = { x: c.x + o.x, y: c.y + o.y, vx: c.vx + o.vx, vy: c.vy + o.vy, heading: c.heading, burn: 0 };
  return (c.near = scan(a, bodies, skip, sr, sp, turn, { wide, thread: true, dodge: HOME_DODGE }));
}
/** `clear` for a craft flying relative to its home body: shifted (and `want` with it) by the body's motion `o`, cleared round `c.near`, shifted back. */
function clearRel(c: Craft, sp: number, o: Home) {
  if (!c.near?.length) return;
  const [x, y, vx, vy] = [c.x, c.y, c.vx, c.vy];
  [c.x, c.y, c.vx, c.vy, want.x, want.y] = [x + o.x + o.vx * o.t, y + o.y + o.vy * o.t, vx + o.vx, vy + o.vy, want.x + o.vx, want.y + o.vy];
  clear(c, c.near, sp, o.t);
  [c.x, c.y, c.vx, c.vy, want.x, want.y] = [x, y, vx, vy, want.x - o.vx, want.y - o.vy];
}

/** The bodies that can matter within `range` of (x, y) moving at (vx, vy) over `T` s (a box test per body, its relative speed and radius added): once a frame, for scan and bump. */
export function reachOf<B extends Disc>(bodies: readonly B[], x: number, y: number, vx: number, vy: number, range: number, T: number) {
  const out: B[] = [];
  for (const b of bodies) {
    const m = b.motion, r = range + T * Math.hypot(m.vx - vx, m.vy - vy) + b.r;
    if (b.m && Math.abs(m.x - x) < r && Math.abs(m.y - y) < r) out.push(b);
  }
  return out;
}

/** Moves a goal point out of every body's keep-out: `room` world units off its surface (a few rounds, for bodies side by side). */
export function free<P extends { x: number; y: number }>(p: P, bodies: readonly Disc[], room: number) {
  for (let k = 0; k < 4; k++) {
    let moved = false;
    for (const b of bodies) {
      const m = b.motion, dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy), r = b.r + room;
      if (!b.m || d >= r) continue;
      [p.x, p.y, moved] = d > 1e-9 ? [m.x + (dx / d) * r, m.y + (dy / d) * r, true] : [m.x + r, m.y, true];
    }
    if (!moved) break;
  }
  return p;
}

// Home steppers: patrols, attack runs and shuttles round their own world (radius R at the origin).
const WING_V = 0.5; // R/s: a wingman with a body within 1 R of its keep-out catches up at most this much faster than its leader
const AHEAD = 0.8; // R: a wingman steers at a point this far ahead of its slot
const LEAD = 3; // s: longest lead on a target
const BREAK = [1, 0.4]; // a run breaks off this many R + s × closing speed off the target's surface...
const BREAK_TURN = 1.4; // ...turning this many rad off its velocity, away from the target...
const BREAK_S = 1.2; // ...for this long, then back on its circuit

/** Speed on a circuit at `d` from the centre: `v`, faster when far out (up to RETURN_V), in R/s. */
const lap = (d: number, R: number, v: number) => clamp((v * d) / (OUTER[1] * R), v, RETURN_V) * R;

/**
 * One home-patrol sub-step round a world of radius R at the origin: its circuit (speed `v` R/s), or its leader's wing
 * (near a body, at most WING_V faster than its leader); round the world and its scanned bodies (`o`: the world's motion),
 * its waypoint kept out of their keep-outs.
 */
export function guard(c: Fighter, R: number, h: number, acc: number, turn: number, v: number, o?: Home) {
  const l = c.lead;
  let side = -(l?.sense ?? 0) * WING[1] * R;
  if (l && o && c.near) {
    // Its slot inside a scanned keep-out: the other side of its leader (a split; follow's trim rejoins).
    const nx = Math.cos(l.heading), ny = Math.sin(l.heading), x = o.x + o.vx * o.t + l.x - nx * WING[0] * R - ny * side, y = o.y + o.vy * o.t + l.y - ny * WING[0] * R + nx * side;
    if (c.near.some((n) => Math.hypot(x - n.b.motion.x - n.b.motion.vx * o.t, y - n.b.motion.y - n.b.motion.vy * o.t) < n.keep)) side = -side;
  }
  if (l) follow(c, l, WING[0] * R, side, AHEAD * R, c.near?.some((n) => n.gap < R) ? Math.min(RETURN_V * R, Math.hypot(l.vx, l.vy) + WING_V * R) : RETURN_V * R); // outside the hard turns (in toward the world)
  else {
    circuit(c, c.x, c.y, INNER.map((x) => x * R), OUTER.map((x) => x * R), lap(Math.hypot(c.x, c.y), R, v), turn);
    if (o && c.near) for (const n of c.near) {
      // A waypoint inside a scanned keep-out moves out to its edge (the course then skirts the body, not into it).
      const m = n.b.motion, x = o.x + o.vx * o.t + c.wx - m.x - m.vx * o.t, y = o.y + o.vy * o.t + c.wy - m.y - m.vy * o.t, d = Math.hypot(x, y) || 1e-9;
      if (d < n.keep) [c.wx, c.wy] = [c.wx + x * (n.keep / d - 1), c.wy + y * (n.keep / d - 1)];
    }
  }
  homeStep(c, R, 2 * R, acc, turn, h, o);
}

/**
 * One sub-step toward `want` round its world (radius R at the origin): round the bodies of its scan (`clearRel`, when the
 * world's motion `o` is given), then round CLEAR R of the world (`skirt`), never inside it.
 */
export function homeStep(c: Craft, R: number, reach: number, acc: number, turn: number, h: number, o?: Home) {
  if (o) clearRel(c, Math.hypot(want.x, want.y), o);
  skirt(c, CLEAR * R, R, reach, turn);
  thrust(c, acc, turn, h);
  keepOut(c, R);
}

const ORIGIN = { x: 0, y: 0, vx: 0, vy: 0 };
/** Bends `want` round its home world (radius r at the origin, keep-out radius rk) as `bend` a threaded body: within `reach` or its look ahead at its speed, climbing out from inside. */
function skirt(c: Craft, rk: number, r: number, reach: number, turn: number) {
  bend(c, { b: { m: 1, r, motion: ORIGIN }, keep: rk, reach: Math.max(reach, (LOOK + 2 / turn) * Math.hypot(c.vx, c.vy)), gap: 0, q: 1 }, 0);
}

/**
 * One attack-run sub-step round a world of radius R at the origin, at a target at (tx, ty) moving at (tvx, tvy), radius
 * `tr`: ATTACK_V at the intercept; in gun range the nose goes on the lead point. 'fire' while the gun bears; 'break' once
 * closer than BREAK off its surface.
 */
export function runStep(c: Fighter, tx: number, ty: number, tvx: number, tvy: number, tr: number, R: number, h: number, o?: Home): 'fire' | 'break' | '' {
  const u = ATTACK_V * R, ox = tx - c.x, oy = ty - c.y, d = Math.hypot(ox, oy) || 1e-9, gap = d - tr;
  const close = -(ox * (tvx - c.vx) + oy * (tvy - c.vy)) / d;
  if (gap < BREAK[0] * R + BREAK[1] * Math.max(0, close)) return 'break';
  const inRange = gap < GUN * R, wx = inRange ? tvx - c.vx : tvx, wy = inRange ? tvy - c.vy : tvy;
  const t = Math.min(LEAD, intercept(ox, oy, wx, wy, inRange ? SHOT_V * R : u) ?? d / u), ax = ox + wx * t, ay = oy + wy * t, al = Math.hypot(ax, ay) || 1;
  want.x = (ax / al) * u;
  want.y = (ay / al) * u;
  avoid(c.x - tx, c.y - ty, tr + 0.5 * R, gap);
  homeStep(c, R, d, ACC * R, TURN, h, o);
  return inRange && inArc(c, tx, ty, tvx, tvy, SHOT_V * R, GUN_ARC) ? 'fire' : '';
}

/** Starts a break off a run: BREAK_TURN off its velocity, away from (tx, ty). */
export function breakOff(c: Fighter, tx: number, ty: number) {
  const a = Math.atan2(c.vy, c.vx), away = (tx - c.x) * c.vy - (ty - c.y) * c.vx > 0 ? 1 : -1;
  [c.mode, c.t, c.bh] = ['break', BREAK_S, a + away * BREAK_TURN];
}

/** One break sub-step round a world of radius R at the origin; then back on its circuit (a new waypoint from where it is). */
export function breakStep(c: Fighter, R: number, h: number, o?: Home) {
  want.x = Math.cos(c.bh) * ATTACK_V * R;
  want.y = Math.sin(c.bh) * ATTACK_V * R;
  homeStep(c, R, 2 * R, ACC * R, TURN, h, o);
  if ((c.t -= h) <= 0) [c.mode, c.wx, c.wy] = ['patrol', 0, 0];
}

/** One miner-shuttle sub-step (relative to its world of radius R at the origin): brake onto a point (dx, dy) off it moving at (gvx, gvy), at `v`; round its scanned bodies (`o`: the world's motion); `round`: plan round the world. */
export function ferry(c: Craft, dx: number, dy: number, gvx: number, gvy: number, v: number, R: number, h: number, round: boolean, o?: Home) {
  arrive(dx, dy, gvx, gvy, v, BRAKE * S_ACC * R);
  if (o) clearRel(c, v, o);
  if (round) avoid(c.x, c.y, CLEAR * R, Math.hypot(dx, dy));
  thrust(c, S_ACC * R, S_TURN, h);
  keepOut(c, R);
}

// The siege (rules.ts SIEGE): your ships round an enemy world, relative to your world (radius R at the origin).
const RING_K = 3; // 1/s: a ring ship closes this share of its radial error a second...
const SLOT_K = 0.6; // ...and speeds up (slows) by this share of its pace per rad it lags (leads) its slot, at most SLOT_MAX
const SLOT_MAX = 0.5;
/** The siege ring's radius round an enemy world of radius `er` whose centre is `d` from yours: SIEGE.ring's middle past its surface, never within SIEGE.clear R of your centre (nor within 1.5 R of its surface). */
export const siegeRing = (er: number, d: number, R: number) => Math.max(er + 1.5 * R, Math.min(er + ((SIEGE.ring[0] + SIEGE.ring[1]) / 2) * R, d - SIEGE.clear * R));
/**
 * One ring sub-step: round an enemy world at (ex, ey) moving at (evx, evy) on radius `rho`, counter-clockwise at `v` R/s,
 * held toward its slot (`slot`: rad round the enemy); round its scanned bodies (`o`: your world's motion) and your world.
 */
export function ringStep(c: Craft, ex: number, ey: number, evx: number, evy: number, rho: number, slot: number, v: number, R: number, h: number, o?: Home) {
  const px = c.x - ex, py = c.y - ey, d = Math.hypot(px, py) || 1e-9, nx = px / d, ny = py / d, sp = v * R;
  const vt = sp * (1 + clamp(SLOT_K * wrap(slot - Math.atan2(py, px)), -SLOT_MAX, SLOT_MAX)), vr = clamp(RING_K * (rho - d), -sp, sp);
  want.x = evx + nx * vr - ny * vt;
  want.y = evy + ny * vr + nx * vt;
  homeStep(c, R, 2 * R, ACC * R, TURN, h, o);
}
/** A frigate's post on the siege ring (radius `rho` round an enemy world at (ex, ey) from yours): on the bearing from it to you, `side` rad round. */
export function siegePost(ex: number, ey: number, rho: number, side: number) {
  const a = Math.atan2(-ey, -ex) + side;
  return { x: ex + Math.cos(a) * rho, y: ey + Math.sin(a) * rho };
}
