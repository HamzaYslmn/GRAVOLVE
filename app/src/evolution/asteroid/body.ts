import { Container, type Sprite } from 'pixi.js';
import { motion, updateEntity, type Entity, type Vec } from '../../core/entity';
import { clamp, smoothstep } from '../../core/rng';
import { K_PER_HEAT } from '../../core/water';
import { rockView, type Rock } from './atlas';
import { tintBy } from './web';
import type { Rival } from './rival';
import { blend, capR, uncapR, mergeHeat, mergeJag, relaxJag, ROUND_M, BURST_KEEP, BURST_PIECES, burstRing, COMP, pieceShares, SPREAD, roundR, collide, contactTime, shellContact, shellPass, shellSees, DEATH_D, GRAZE, massOf, MAX_HEAT, MOLTEN, START_R, COOL, impactHeat, rub, workHeat, workShare, V_STICK, type CollideOpts, type Comp, type Element, type Phys, type Regime, type Side } from './rules';

// A body is an entity built from rock sprites ("parts"). Eating glues the meal's parts on where they touched,
// so every grown asteroid is a unique pile of what it ate. To read as one body, a pile settles (parts sink
// toward the centre; bigger piles round off), shares one light (lit from the top left) and drifts toward a
// tint from its composition. Collision shape is a circle of the body's volume; settling keeps piles close to it.

/** r in body-local units; base = unlit tint; core = the baked sphere of a round body (sphere.ts). */
type Part ={ s: Sprite; r: number; base: number; age: number; core?: boolean };

export type Body = Entity & {
  m: number;
  r: number; // collision radius (world units)
  k: number; // shrink factor from mass loss (= view scale)
  comp: Comp;
  tint: number; // colour the parts drift toward, from comp
  heat: number; // doc heat units: > MOLTEN is sticky; cools faster when small
  parts: Part[];
  home?: string; // field chunk that owns it
  hx?: number; // ...its chunk coordinates (the key is rebuilt only when they change)
  hy?: number;
  sweep?: number; // field broadphase: the frame it was last in the sweep order
  left?: number; // ...and its left edge (x − r) that frame
  gi?: number; // field gravity: its index this frame (valid while gs is this frame's stamp)
  gs?: number;
  meteor?: boolean; // a fast passer-by: never stored with a chunk, gone once it's far away
  fertile?: number; // extra share of a meal's rock gained when eating (the player's rock path, doc +20%)
  diff?: number; // 0..1 how far its metal has sunk to a core; grows only while molten
  rival?: Rival; // steers itself (rival.ts)
  baked?: number; // a round body's mass when its sphere was last baked (sphere.ts)
  comet?: boolean; // the player as a comet (player.ts), or a world comet (field.ts)
  binary?: boolean; // a contact binary: two lobes resting on each other, not settled into one blob
  burnt?: boolean; // already went through your air once (field.ts burn-up): what is left lands
  moon?: boolean; // on a kinematic orbit (yours: planet/moons.ts; a rival's rock, your star's planets): never stored, no free gravity; yours never touch you
  held?: boolean; // hands-off (a rival world, a comet, a guard moon): ships and miners leave it, it is never caught; out of the field's gravity unless it `pulls`
  pulls?: boolean; // a held body still in the field's gravity (a rival civilization world: rules.ts gravitates)
  rough?: number; // its first `rough` parts are its shape for good (keepShape): never baked round until molten (rules.ts bakes)
  jag?: number; // debris: 1 a fresh break .. 0 relaxed (rules.ts relaxJag); sphere.ts draws it in steps
  guard?: Guard; // a world's shield shell (civilization stage.ts, rivals.ts): bodies meet it before the ground (sweep)
  metShell?: Body; // the world whose shell met it while it was another world's moon (shell): it lands there by hitWorld (field.ts)
};
/** A shell of radius `r` (0 while down); `meet` is told a body closing at `v` (the world's diameters/s) at (x, y) and returns the share it stops (civilization/rules.ts shieldMeet); `own`: its own bodies pass; with it set, other worlds' moons meet the shell. */
export type Guard = { r: number; own?: (b: unknown) => boolean; meet: (b: Body, v: number, x: number, y: number) => number };

/** `b` keeps its look (a comet, a fragment, a rock pile you caught): its parts now stay; later meals sink in (sphere.ts). A sphere or a debris piece (still rounding) is left as it is. */
export function keepShape(b: Body) {
  if (!b.rough && b.jag === undefined && !b.parts.some((p) => p.core)) b.rough = b.parts.length;
}
/** `b` just joined the field (field.ts addBody): stretched; a piece of `from` takes its tint with its own hue, and from ROUND_M is jagged debris (jag 1: baked, rounds over time); anything else keeps its rock (keepShape). */
export function asDebris(b: Body, from: Body | undefined, rnd: () => number) {
  const p = b.parts[0], k = 0.75 + 0.55 * rnd(), w = 0.5 * (rnd() - 0.5), hue = [1 + w, 1, 1 - w];
  p.s.scale.set(p.s.scale.x * k, p.s.scale.y / k);
  if (from) [b.tint, p.s.tint] = [tintBy(from.tint, hue, 1), (p.base = tintBy(mixRgb(p.base, from.tint, 0.5, false), hue, 1))];
  if (from && b.m >= ROUND_M) b.jag = 1;
  else keepShape(b);
}

/** Mass that joins `b` as dust (burnt-up rocks): no parts, same shape, a little bigger. */
export function absorb(b: Body, m: number, comp: Comp) {
  if (m <= 0 || !b.m) return;
  b.comp = blend(b.comp, b.m, comp, m);
  b.tint = compTint(b.comp);
  resize(b, b.m + m);
}
/** Takes mass `dm` off `b`: same shape, smaller. */
export const shed = (b: Body, dm: number) => resize(b, b.m - dm);
/** `b` at mass `m`, same shape: its uncapped radius scales with the volume, then the size cap (rules.ts capR) applies. */
export function resize(b: Body, m: number) {
  const r = capR(uncapR(b.r) * Math.cbrt(m / b.m));
  [b.m, b.k, b.r] = [m, (b.k * r) / b.r, r];
  b.view.scale.set(b.k);
}
/** `b` is gone now: its view goes, the field drops it (field.ts never ticks a body with m = 0). */
export function drop(b: Body) {
  b.view.destroy({ children: true });
  [b.parts, b.m] = [[], 0];
}
/** Off any ring (your moon, a star's planet, a rival's rock): a plain body again, with the field's drag. */
export const unmoon = (b: Body) => void ([b.moon, b.motion.drag] = [false, 1e-3]);

/** Kelvin a hit delivered to `w` (a rival world in it): the actor's own heat, else impactHeat from the actor's share at w's size. */
export function hitKelvin(h: Hit, w: Body) {
  const ma = h.a.m - h.gain;
  return K_PER_HEAT * (w === h.a ? h.heat : h.heatB ?? impactHeat(ma / (ma + h.mb), (h.speed * h.a.r) / w.r, V_STICK, w.r));
}
/** What a collision did, for effects. Speed is in the actor's diameters/s. */
export type Hit = {
  kind: Regime;
  a: Body; // the actor (gone if it was eaten or destroyed: m = 0)
  b: Body;
  x: number; // contact point
  y: number;
  nx: number; // normal from a to b
  ny: number;
  speed: number;
  dust: number; // mass turned to dust or vapour
  gain: number; // actor's mass change
  mb: number; // b's mass before the hit
  shattered: boolean; // the actor broke apart (d ≥ 1)
  destroyed: boolean; // the actor was blown apart completely (d ≥ DEATH_D)
  heat: number; // heat the hit delivered to the actor (doc units; × 430 = kelvin): life setbacks read it
  broke: boolean; // the other body broke apart (d ≥ 1; it may be gone: m = 0)
  heatB?: number; // rock pairs (rub): the heat the hit gave b; unset elsewhere (hitKelvin works it out)
  lost?: number; // rock pairs (rub): energy the contact took out of the pair's motion, in touches at the stick speed (½·v_m²)
};

export type Events = {
  debris: (x: number, y: number, vx: number, vy: number, m: number, comp: Comp, from?: Body) => void; // `from`: the body it broke off
  hit: (h: Hit) => void;
};

const NONE: Vec = { x: 0, y: 0 }; // rocks don't steer
const BLEND_S = 25; // s for a pile's colours to mostly blend
const SETTLE_FAST = 5; // pile radii/s while a meal slides in
const SETTLE_SLOW = 0.15; // pile radii/s afterwards
const FRESH_S = 0.35; // how long a meal counts as sliding in
// Restitution by state: solid rock 0.5, loose rubble down to 0.15, molten ~0. Low bounces let gravity recapture gently.
const bounceOf = (b: Body) => 0.5 * (1 - 0.7 * phys(b).rubble!) * (1 - smoothstep(1, MOLTEN, b.heat));
const MIN_PIECE = 0.3; // fragments lighter than this are just dust...
const PIECE_SHARE = 1e-3; // ...or than this share of the pair: splashing crumbs on a planet must not flood the field with specks
const MAX_SPIN = 1; // rad/s: about where a rubble pile flies apart from its own spin (≈ √(G·m/r³), the same at every size)
const LIGHT = [-Math.SQRT1_2, -Math.SQRT1_2]; // toward the light (top left), as the baked rocks

/** A free rock. With `rnd`, each copy gets its own flip, stretch, warm/cool tint and tumble. */
export function rockBody(rock: Pick<Rock, 'texture' | 'comp'>, r: number, x: number, y: number, rnd?: () => number): Body {
  const s = rockView(rock.texture, r);
  let spin = 0;
  if (rnd) {
    s.rotation = rnd() * Math.PI * 2;
    const squash = 0.88 + rnd() * 0.24;
    s.scale.x *= (rnd() < 0.5 ? -1 : 1) * squash;
    s.scale.y /= squash;
    const warm = rnd() - 0.5, lum = 0.82 + rnd() * 0.18;
    const ch = (k: number) => Math.round(255 * Math.min(1, lum * (1 + k)));
    s.tint = (ch(warm * 0.12) << 16) | (ch(0) << 8) | ch(-warm * 0.12);
    spin = (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.3) * Math.sqrt(12 / r); // small rocks tumble faster
  }
  const view = new Container();
  view.addChild(s);
  return {
    motion: motion(x, y, 0, 1e-3), control: () => NONE, view, spin,
    m: massOf(r, rock.comp), r, k: 1, comp: rock.comp, tint: compTint(rock.comp), heat: 0,
    parts: [{ s, r, base: s.tint as number, age: 1 }],
  };
}

/** Moves, settles, shades and cools a body. `shade` false (off screen): physics only, its parts are not settled or recoloured until it is seen. */
export function tickBody(b: Body, dt: number, shade = true) {
  updateEntity(b, dt);
  b.heat *= Math.exp((-COOL * START_R * dt) / b.r); // cools ∝ 1/radius (doc)
  if (b.heat > MOLTEN) {
    // Differentiation: only a molten body lets its metal sink to a core (~20 s fully molten); it never un-sinks.
    b.diff = Math.min(1, (b.diff ?? 0) + (dt / 20) * smoothstep(MOLTEN, 5, b.heat));
  }
  if (b.jag) b.jag = relaxJag(b.jag, b.r, b.comp, b.heat, dt);
  if (b.parts.length < 2 || !shade) return;

  const R = b.r / b.k; // pile radius, local units
  const limit = settleLimit(b);
  const blendT = 1 - Math.exp(-dt / BLEND_S);
  const c = Math.cos(b.view.rotation), s = Math.sin(b.view.rotation);
  for (const p of b.parts) {
    p.age += dt;
    let x = p.s.x, y = p.s.y;
    const d = Math.hypot(x, y);
    if (d > limit(p)) {
      const step = Math.min(d - limit(p), (p.age < FRESH_S ? SETTLE_FAST : SETTLE_SLOW) * R * dt);
      x *= (d - step) / d;
      y *= (d - step) / d;
      p.s.position.set(x, y);
    }
    if (p.core) continue; // the baked sphere has its own colours and light
    p.base = mixRgb(p.base, b.tint, blendT);
    const lit = (((c * x - s * y) * LIGHT[0] + (s * x + c * y) * LIGHT[1]) / R) * 0.5 + 0.5; // 0 far side, 1 lit side
    p.s.tint = mixRgb(p.base, 0, 0.22 * (1 - lit), false);
  }
}

/** How round (settled) a pile of this mass gets: 0 loose .. 1 at ~3000 mass. */
const roundness = (m: number) => clamp(Math.log10(m) / 3.5, 0, 1);

/** Distance between the surfaces of two bodies (negative when they overlap). */
export const gap = (a: Body, b: Body) => Math.hypot(b.motion.x - a.motion.x, b.motion.y - a.motion.y) - a.r - b.r;

/** The body as the rules see it: an unsettled pile counts as loose rubble. */
export const phys = (b: Body): Phys => ({ m: b.m, comp: b.comp, heat: b.heat, rubble: b.parts.length > 1 ? 1 - roundness(b.m) : 0, r: b.r });

// Visual settling follows the shape rule (rules.ts roundR): loose at the start, 0.65 by the time the body is
// baked at half its round-off radius (sphere.ts). phys() uses `roundness` instead (looseness for the collision rules).
const settle = (b: Body) => 0.65 * clamp((2 * b.r) / roundR(b.comp), 0, 1) ** 1.5;
/** How far from the centre (local units) a part may sit: heavier piles pull parts deeper, toward round. */
function settleLimit(b: Body) {
  const R = b.r / b.k;
  if (b.binary) return (p: Part) => Math.max(0, R - p.r * 0.2); // the lobes keep touching instead of merging
  const round = settle(b);
  return (p: Part) => Math.max(0, R - p.r * (0.4 + 0.6 * round));
}

/**
 * Glues `others` onto `core` as if they had merged long ago: each touches the pile at a random
 * angle, then everything is settled at once and the colours are mostly blended.
 */
export function cluster(core: Body, others: Body[], rnd: () => number) {
  for (const b of others) {
    const t = rnd() * Math.PI * 2, d = core.r + b.r * 0.5;
    b.motion.x = core.motion.x + Math.cos(t) * d;
    b.motion.y = core.motion.y + Math.sin(t) * d;
    b.motion.vx = core.motion.vx;
    b.motion.vy = core.motion.vy;
    eat(core, b, 0, 0);
  }
  const limit = settleLimit(core);
  for (const p of core.parts) {
    const d = Math.hypot(p.s.x, p.s.y), l = limit(p);
    if (d > l) p.s.position.set((p.s.x * l) / d, (p.s.y * l) / d);
    p.age = FRESH_S;
    p.base = mixRgb(p.base, core.tint, 0.6, false);
  }
  return core;
}

/** Handles touching bodies `a` (the actor) and `b` by the rules' regimes (rules.ts collide, options as CollideOpts). */
export function resolve(a: Body, b: Body, ev: Events, o: CollideOpts = {}) {
  if (a === b) return; // safety: a body must never eat itself (its parts loop would never end)
  const am = a.motion, bm = b.motion, rdt = o.rub, rr = a.r + b.r; // rdt: never by truthiness, hit-stop frames pass 0
  const bound = rdt !== undefined && Math.hypot(bm.vx - am.vx, bm.vy - am.vy) < 4 * (o.stick ?? V_STICK) * a.r; // a rock pair under its escape speed (2·v_m)
  const d = Math.hypot(bm.x - am.x, bm.y - am.y) || 1e-6;
  const nx = (bm.x - am.x) / d, ny = (bm.y - am.y) / d;
  const rvx = bm.vx - am.vx, rvy = bm.vy - am.vy, vn = rvx * nx + rvy * ny, vt = rvx * ny - rvy * nx;
  const closing = Math.max(0, -vn), sliding = Math.abs(vt);
  // Hit speed for effects and the game-over card: the head-on part in full, sliding only partly, in a's diameters.
  const fly = Math.hypot(closing, (o.graze ?? GRAZE) * sliding), speed = fly / (2 * a.r);
  const out = collide(phys(a), phys(b), closing, sliding, o);
  const m0 = a.m, mb = b.m, minPiece = Math.max(MIN_PIECE, PIECE_SHARE * (a.m + b.m));
  const hit: Hit = {
    kind: out.kind, a, b, x: am.x + nx * a.r, y: am.y + ny * a.r, nx, ny, speed, dust: 0, gain: 0, mb, heat: out.a.heat,
    shattered: out.a.d >= 1, destroyed: out.a.d >= DEATH_D && out.kind !== 'accrete', broke: out.b.d >= 1,
  };
  const done = () => {
    [a.heat, b.heat] = [Math.min(MAX_HEAT, a.heat), Math.min(MAX_HEAT, b.heat)];
    hit.gain = a.m - m0;
    ev.hit(hit);
  };

  if (out.kind === 'eat' || out.kind === 'eaten') {
    // Slower than the stick speed: the heavier keeps everything; the meal's fall turns to heat (deeper wells, hotter).
    const [T, P, s, q, qP] = out.kind === 'eat' ? ([a, b, 1, out.a.heat, out.b.heat] as const) : ([b, a, -1, out.b.heat, out.a.heat] as const);
    if (rdt !== undefined) P.heat = Math.min(MAX_HEAT, P.heat + qP); // rock pairs: the meal's own impact heat mixes in too
    eat(T, P, s * rvx, s * rvy, q); // the meal's parts stay on, shapes and all; its cold or heat mixes in (mergeHeat)
    return done();
  }
  if (out.kind === 'accrete') {
    // The heavier keeps part of the lighter: a crater on it, the rest of the meal sprays off as pieces.
    const [T, P, sT, sP, s] = out.t === 'a' ? ([a, b, out.a, out.b, 1] as const) : ([b, a, out.b, out.a, -1] as const);
    hit.dust = lose(T, sT, s * nx, s * ny, P, ev, fly, minPiece) + lose(P, sP, -s * nx, -s * ny, T, ev, fly, minPiece);
    if (rdt !== undefined) P.heat = Math.min(MAX_HEAT, P.heat + sP.heat); // rock pairs: the meal's own impact heat mixes in too
    eat(T, P, s * rvx, s * rvy, sT.heat);
    return done();
  }
  // Graze and bounce: both chip, either may break. Rock pairs: restitution and friction (rules.ts rub); what they take out of the motion is the heat.
  const r = rdt === undefined ? undefined : rub(vn, vt, Math.min(bounceOf(a), bounceOf(b)), bound ? (sliding * rdt) / rr : 0);
  if (r) {
    const pa = phys(a), pb = phys(b), E = (r.lost * a.m * b.m) / (a.m + b.m);
    [hit.heat, hit.heatB, hit.lost] = [workHeat(pa, E * workShare(pa, pb)), workHeat(pb, E * workShare(pb, pa)), r.lost / (2 * ((o.stick ?? V_STICK) * a.r) ** 2)];
  }
  hit.dust = lose(a, out.a, nx, ny, b, ev, fly, minPiece) + lose(b, out.b, -nx, -ny, a, ev, fly, minPiece);
  a.heat += hit.heat;
  b.heat += hit.heatB ?? out.b.heat;
  if (out.a.d >= DEATH_D) hit.dust += burst(a, fly, ev, minPiece);
  if (out.b.d >= DEATH_D) hit.dust += burst(b, fly, ev, minPiece);
  if (a.m && b.m) {
    // Push apart and reflect the closing speed along the normal (a graze keeps its sliding speed; rock pairs rub).
    const ia = 1 / a.m, ib = 1 / b.m, push = Math.max(0, rr - d) / (ia + ib);
    am.x -= nx * push * ia; am.y -= ny * push * ia;
    bm.x += nx * push * ib; bm.y += ny * push * ib;
    if (r) {
      const mu = 1 / (ia + ib), jx = (r.dn * nx + r.dt * ny) * mu, jy = (r.dn * ny - r.dt * nx) * mu; // tangent (ny, −nx)
      am.vx -= jx * ia; am.vy -= jy * ia;
      bm.vx += jx * ib; bm.vy += jy * ib;
      for (const p of [a, b]) p.spin = clamp(p.spin + (r.dt * mu) / (0.4 * p.m * p.r), -MAX_SPIN, MAX_SPIN); // friction rolls both: angular momentum kept
    } else if (vn < 0) {
      const j = (-(1 + Math.min(bounceOf(a), bounceOf(b))) * vn) / (ia + ib);
      am.vx -= j * ia * nx; am.vy -= j * ia * ny;
      bm.vx += j * ib * nx; bm.vy += j * ib * ny;
    }
  }
  done();
}

/** Breaks `b` into a few fragments and dust (a small body bounced off a solid world, field.ts). */
export const shatter = (b: Body, ev: Events) => burst(b, Math.hypot(b.motion.vx, b.motion.vy), ev, Math.max(MIN_PIECE, 0.05 * b.m));

/** Destroyed (d ≥ DEATH_D): what survived still flies apart, a burst of unequal fragments faster the harder the hit; the rest is dust. */
function burst(b: Body, fly: number, ev: Events, minPiece: number) {
  const m = b.m, bm = b.motion, n = Math.min(BURST_PIECES, Math.floor((m * BURST_KEEP) / minPiece)), w = pieceShares(n, SPREAD), ring = burstRing(w, b.r);
  for (let i = 0; i < n; i++) {
    const t = ring.t[i], v = Math.max(60, 0.2 * fly) * (0.6 + 0.8 * Math.random());
    ev.debris(bm.x + Math.cos(t) * ring.d, bm.y + Math.sin(t) * ring.d, bm.vx + Math.cos(t) * v, bm.vy + Math.sin(t) * v, m * BURST_KEEP * w[i], debrisComp(b, 1), b);
  }
  drop(b);
  return n ? m * (1 - BURST_KEEP) : m;
}

/**
 * Swept test: if `a` and `b` passed through each other this frame, puts them back where they first touched, so the
 * hit happens instead of a tunnel. The correction is shared by mass (the lighter moves). Geometry: rules.ts contactTime.
 */
export function sweep(a: Body, b: Body, dt: number) {
  if (!a.m || !b.m || a === b || shell(a, b, dt)) return;
  const qx = b.motion.x - a.motion.x, qy = b.motion.y - a.motion.y;
  const sx = (b.motion.vx - a.motion.vx) * dt, sy = (b.motion.vy - a.motion.vy) * dt;
  const t = contactTime(qx, qy, sx, sy, a.r + b.r);
  if (t < 0) return;
  const k = 0.999; // a hair inside contact, so the broadphase sees it
  const dx = (qx - sx + sx * t) * k - qx, dy = (qy - sy + sy * t) * k - qy, wa = b.m / (a.m + b.m);
  a.motion.x -= dx * wa; a.motion.y -= dy * wa;
  b.motion.x += dx * (1 - wa); b.motion.y += dy * (1 - wa);
}

/**
 * `b` crossing world `w`'s shield shell this frame (w.guard) meets it there: the guard stops share k of it (rules.ts
 * shellPass): all of it bounces off; else that share vaporises on the shell and the rest goes on, slower. The impulse is
 * shared by mass and `b` waits just outside the shell (its ground comes a later frame). A world's own bodies (`own`: yours
 * are you, your moons and star planets, planet/stage.ts; all moons where the guard names no `own`), rival bodies and worlds
 * pass; a foreign moon meets it and lands by hitWorld (field.ts). True when it met the shell.
 */
function shell(w: Body, b: Body, dt: number) {
  const g = w.guard, wm = w.motion, bm = b.motion;
  if (!g?.r || !shellSees(b, g.own)) return false;
  const c = shellContact(bm.x - wm.x, bm.y - wm.y, (bm.vx - wm.vx) * dt, (bm.vy - wm.vy) * dt, g.r + b.r, dt);
  const k = c ? g.meet(b, c.vn / (2 * w.r), wm.x + c.nx * g.r, wm.y + c.ny * g.r) : 0;
  if (!c || !k) return false;
  const [keep, vn] = shellPass(k, c.vn), dv = c.vn - vn, wb = 1 - b.m * keep / (b.m * keep + w.m); // closing speed lost: outward along the normal
  if (keep < 1) shed(b, b.m * (1 - keep));
  if (b.moon) b.metShell = w; // another world's moon: lands by w's ground rules even once shed loose (field.ts hitWorld)
  [bm.vx, bm.vy, bm.x, bm.y] = [bm.vx + c.nx * dv * wb, bm.vy + c.ny * dv * wb, wm.x + c.x * 1.001, wm.y + c.y * 1.001];
  [wm.vx, wm.vy] = [wm.vx - c.nx * dv * (1 - wb), wm.vy - c.ny * dv * (1 - wb)];
  return true;
}

/**
 * What breaks off a body: a differentiated body broken deep (`depth` = share lost) throws out its metal
 * core, so smashing a once-molten giant yields iron chunks (where real iron meteorites come from).
 */
const debrisComp = (b: Body, depth: number) => (b.diff ? blend(b.comp, 1, COMP.metallic, b.diff * depth) : b.comp);

/**
 * Shrinks `b` to what survived (same shape, smaller) and sprays its collectable pieces (unequal: pieceShares) out
 * sideways from the contact: two for a chip, up to eight when most of it broke off; faster the harder the hit
 * (`closing`, world units/s). Returns dust mass.
 */
function lose(b: Body, s: Side, nx: number, ny: number, other: Body, ev: Events, closing: number, minPiece: number) {
  if (s.rest >= b.m) return 0;
  const n = Math.min(Math.floor(s.pieces / minPiece), 2 + Math.round(6 * (1 - s.rest / b.m))), w = pieceShares(n, SPREAD);
  if (n >= 1) {
    // From the contact point, sideways out of both bodies, so neither re-eats them at once.
    const cx = b.motion.x + nx * b.r, cy = b.motion.y + ny * b.r;
    const out = b.r + other.r + 4;
    const vx = (b.motion.vx * b.m + other.motion.vx * other.m) / (b.m + other.m);
    const vy = (b.motion.vy * b.m + other.motion.vy * other.m) / (b.m + other.m);
    const base = Math.atan2(-ny, -nx); // back out of the contact, on b's side
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, t = base + side * (0.5 + Math.random()); // a fan on both sides of the normal
      const fly = Math.max(40, 0.15 * closing) * (0.5 + 0.8 * Math.random());
      ev.debris(cx + Math.cos(t) * out, cy + Math.sin(t) * out, vx + Math.cos(t) * fly, vy + Math.sin(t) * fly, s.pieces * w[i], debrisComp(b, 1 - s.rest / b.m), b);
    }
  }
  shed(b, b.m - s.rest);
  return n >= 1 ? s.dust : s.dust + s.pieces; // pieces too small to keep are dust as well
}

/**
 * Moves `b`'s parts into `a` exactly where they touch (settling then pulls them in), re-centres `a`
 * on the new centre of mass, and turns an off-centre hit into spin. `q`: the heat the hit gives `a` (impactHeat),
 * added once, to the merged body.
 */
function eat(a: Body, b: Body, rvx: number, rvy: number, q = 0) {
  const am = a.motion, bm = b.motion;
  const dx = bm.x - am.x, dy = bm.y - am.y;
  const ca = Math.cos(a.view.rotation), sa = Math.sin(a.view.rotation);
  const cb = Math.cos(b.view.rotation), sb = Math.sin(b.view.rotation);
  for (const p of b.parts) {
    const s = p.s;
    const wx = dx + b.k * (cb * s.x - sb * s.y), wy = dy + b.k * (sb * s.x + cb * s.y); // b-local -> world offset
    s.position.set((ca * wx + sa * wy) / a.k, (-sa * wx + ca * wy) / a.k); // -> a-local
    s.rotation += b.view.rotation - a.view.rotation;
    s.scale.set((s.scale.x * b.k) / a.k, (s.scale.y * b.k) / a.k);
    p.r = (p.r * b.k) / a.k;
    p.age = 0;
    p.core = false; // a swallowed sphere is just a meal now
    a.view.addChild(s);
    a.parts.push(p);
  }

  a.heat = mergeHeat(a, b, q); // before the make-ups merge: each side's own heat capacity
  const bonus = a.fertile ? a.fertile * b.m * (b.comp.rock ?? 0) : 0; // grown on top of the meal, all rock
  const m = a.m + b.m, w = b.m / m;
  if (a.jag) a.jag = mergeJag(a.jag, w);
  const ox = dx * w, oy = dy * w; // centre-of-mass shift
  const lx = (ca * ox + sa * oy) / a.k, ly = (-sa * ox + ca * oy) / a.k;
  for (const p of a.parts) p.s.position.set(p.s.x - lx, p.s.y - ly);
  am.x += ox; am.y += oy;
  am.vx += rvx * w; am.vy += rvy * w; // momentum
  // Angular momentum of the meal about the new centre, plus both spins; disc-ish inertia 0.4·m·r².
  const L = b.m * ((dx - ox) * rvy - (dy - oy) * rvx) + 0.4 * (a.spin * a.m * a.r ** 2 + b.spin * b.m * b.r ** 2);
  a.r = capR(Math.cbrt(uncapR(a.r) ** 3 + uncapR(b.r) ** 3) * Math.cbrt((m + bonus) / m)); // volumes add uncapped (the bonus rock too), then the cap
  a.spin = clamp(L / (0.4 * m * a.r ** 2), -MAX_SPIN, MAX_SPIN);
  a.comp = blend(blend(a.comp, a.m, b.comp, b.m), m, { rock: 1 }, bonus);
  a.tint = compTint(a.comp);
  a.m = m + bonus;
  a.view.position.set(am.x, am.y);
  drop(b);
}

// Element hues (from the design doc's palette), applied as a soft multiply over the baked rock colour.
const HUE: Record<Element, number[]> = {
  metal: [0.86, 0.82, 0.74], // warm steel: metal-rich piles must not drift toward ice blue
  rock: [0.79, 0.64, 0.48],
  ice: [0.44, 0.83, 1],
  gas: [1, 0.82, 0.48],
  radio: [0.55, 1, 0.45],
};
/** The composition's hue at full brightness, half strength (used as a tint and for dust). */
export function compTint(c: Comp) {
  const rgb = [0, 0, 0];
  for (const [e, f] of Object.entries(c)) HUE[e as Element].forEach((v, i) => (rgb[i] += v * f));
  const top = Math.max(...rgb) || 1; // keep brightness, take only the hue
  return rgb.reduce((out, v) => (out << 8) | Math.round(255 * (0.5 + (0.5 * v) / top)), 0);
}

/** Lerp between two 0xRRGGBB colours; stochastic rounding (default) so tiny per-frame steps still add up. */
export function mixRgb(a: number, b: number, t: number, dither = true) {
  let out = 0;
  for (const sh of [16, 8, 0]) {
    const ca = (a >> sh) & 255, cb = (b >> sh) & 255;
    out |= clamp(ca + Math.floor((cb - ca) * t + (dither ? Math.random() : 0.5)), 0, 255) << sh;
  }
  return out;
}
