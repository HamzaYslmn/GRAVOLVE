// Mining AI, plain numbers (no Pixi; survey reads bodies), checked by test/civilization/mining.test.ts. Miners pick their own sites inside the
// reach: score = share × need × density × efficiency × (1 − 0.7·danger) ÷ round-trip time, greedy assignment with
// at most PER_SITE miners a site and a switch margin so they never flip-flop. Distances are in your radii.
import type { Comp, Element } from '../asteroid/rules.ts';
import { slotRadius } from '../../core/orbits.ts';
import { clamp } from '../../core/rng.ts';
import { mineable, UNIT, type Lack, type Ore } from './rules.ts';
import type { Body } from '../asteroid/body.ts';
import { MOON_SHARE, moonSlots } from '../planet/rules.ts';

export type SiteKind = 'moon' | 'free' | 'debris' | 'defeated';
/** d: distance to the site (R); share: its mass / yours; danger 0–1 (pirates within 4 R, a star's harmful zone); linked: a link already holds it. */
export type Site = { id: number; d: number; share: number; comp: Comp; kind: SiteKind; danger: number; linked?: boolean };
/** lack: what your world lacks (rules.ts `lack`); fleetShort: fewer ships than the cap; energyShort: the fuel stock is low (rules.ts FUEL_RESERVE). */
export type Needs = { lack?: Lack; fleetShort: boolean; energyShort: boolean };

export const EFFICIENCY: Record<SiteKind, number> = { moon: 1, free: 0.6, debris: 0.8, defeated: 2.5 };
const DANGER = 0.7; // a danger-1 site keeps 30% of its score (and is skipped while any other site is open)
export const SPEED = 3; // R/s a miner flies
export const DIG = 1.4; // s at the site
const RING = 6; // R past the outer moon slot
export const BIG = 0.25; // a body this share of you or more is mined through a link (moons cap at 12.5%: planet/rules.ts MOON_SHARE)
export const LINK_HOLD = 1.15; // a link breaks past this × reach
export const PER_SITE = 2;
const SWITCH = 1.25; // a busy miner moves only for a site this much better
export const RESCORE = 2; // s between re-scores

/** The reach ("outermost ring") with `slots` moon slots: the outer slot + RING. */
export const reach = (slots: number) => slotRadius(1, Math.max(0, slots - 1)) + RING;
/** A world's Fire range in its R, off its surface: FIRE_REACH × the reach (rockets' fuel, yours and rival worlds'). */
export const FIRE_REACH = 3;
export const fireRange = (slots: number) => FIRE_REACH * reach(slots);
/** `b`'s mining reach in world units, off its surface. */
export const mineReach = (b: Pick<Body, 'm' | 'r'>) => reach(moonSlots(b.m)) * b.r;
/** `b`'s fire range in world units, off its surface: a rocket's fuel (guns.ts createRockets). */
export const fireReach = (b: Pick<Body, 'm' | 'r'>) => FIRE_REACH * mineReach(b);
/** 2 × the mining reach: a rival world arms its pad and its frigate lance within it (rivals.ts). */
export const armReach = (b: Pick<Body, 'm' | 'r'>) => 2 * mineReach(b);
/** Inside the reach; a linked big body holds until LINK_HOLD × reach. */
export const inReach = (s: Site, slots: number) => s.d <= reach(slots) * (s.linked && s.share >= BIG ? LINK_HOLD : 1);

/** Weight of one unit of each element: ×3 what the world lacks, metal ×2 while the fleet is short, radioactive ×2 while fuel is short. */
function weights(n: Needs): Record<Element, number> {
  const w: Record<Element, number> = { metal: 1, rock: 1, ice: 1, gas: 1, radio: 1 };
  if (n.lack) w[n.lack] *= 3;
  if (n.fleetShort) w.metal *= 2;
  if (n.energyShort) w.radio *= 2;
  return w;
}
const tripTime = (d: number) => (2 * d) / SPEED + DIG;
/** need × density: the weighted share of the site's material. */
function worth(c: Comp, w: Record<Element, number>) {
  let sum = 0, v = 0;
  for (const [e, f] of Object.entries(c) as [Element, number][]) (sum += f ?? 0), (v += (f ?? 0) * w[e]);
  return sum > 0 ? v / sum : 0;
}
/** × share: a site yields in proportion to its mass (stage.ts), so a big body beats a pebble next door. */
const score = (s: Site, w: Record<Element, number>) =>
  s.share > 0 ? (s.share * worth(s.comp, w) * EFFICIENCY[s.kind] * (1 - DANGER * clamp(s.danger, 0, 1))) / tripTime(s.d) : 0;

/** Scores by site id: 0 out of reach; a danger-1 site only counts when no other site is open. */
export function scores(sites: Site[], n: Needs, slots: number) {
  const w = weights(n), open = sites.filter((s) => inReach(s, slots) && s.share > 0), safe = open.some((s) => s.danger < 1);
  return new Map(sites.map((s) => [s.id, open.includes(s) && (!safe || s.danger < 1) ? score(s, w) : 0]));
}

/**
 * New site per miner (by id, undefined = idle at home) from the current ones: miners keep a site that still scores and has
 * room, idle miners take the best open site, then busy miners (worst first) move only for an open site SWITCH× better.
 */
export function assign(current: (number | undefined)[], sc: Map<number, number>) {
  const count = new Map<number, number>(), add = (id: number, k: number) => count.set(id, (count.get(id) ?? 0) + k);
  const val = (id: number | undefined) => (id === undefined ? 0 : sc.get(id) ?? 0);
  const out = current.map((id) => (id !== undefined && val(id) > 0 && (count.get(id) ?? 0) < PER_SITE ? (add(id, 1), id) : undefined));
  const best = () => {
    let b: number | undefined;
    for (const [id, v] of sc) if (v > 0 && (count.get(id) ?? 0) < PER_SITE && v > val(b)) b = id;
    return b;
  };
  for (let k = 0; k < out.length; k++) if (out[k] === undefined && (out[k] = best()) !== undefined) add(out[k]!, 1);
  const busy = current.map((_, k) => k).filter((k) => out[k] !== undefined && out[k] === current[k]).sort((a, b) => val(out[a]) - val(out[b]));
  for (const k of busy) {
    const b = best();
    if (b !== undefined && val(b) >= SWITCH * val(out[k])) add(out[k]!, -1), add(b, 1), (out[k] = b);
  }
  return out;
}

export const DANGER_R = 4; // R: an enemy ship this near a site makes it danger 1
export const SMALL = 0.02; // share: lighter bodies can form a debris cluster; alone they are a site only from MOON_SHARE[0] up
export const DEBRIS_N = 4; // small bodies...
const DEBRIS_GAP = 1.5; // ...within this many R of the first: a debris cluster (an accretion disk)

/** Debris clusters among points (in R): groups of ≥ DEBRIS_N within DEBRIS_GAP of the group's first point, by index. */
export function clusters(p: { x: number; y: number }[]) {
  const used = new Uint8Array(p.length), out: number[][] = [], g2 = DEBRIS_GAP ** 2;
  for (let i = 0; i < p.length; i++) {
    if (used[i]) continue;
    const g = [i], x = p[i].x, y = p[i].y;
    for (let j = i + 1; j < p.length; j++) if (!used[j] && (p[j].x - x) ** 2 + (p[j].y - y) ** 2 <= g2) g.push(j);
    if (g.length >= DEBRIS_N) for (const k of (out.push(g), g)) used[k] = 1;
  }
  return out;
}

/** Miner cap from the metal stock your miners brought in. */
export const minerCap = (metal: number) => clamp(2 + Math.floor(metal / 15), 2, 12);

/** A mining site this re-score; m0 = the mass its rate is drawn from (a debris cluster's whole mass, an open world's stock). */
export type Spot = { b: Body; kind: SiteKind; m0: number; site?: { ore: number; vol: number }; beaten?: boolean };
const ids = new WeakMap<Body, number>();
let lastId = 0;
/**
 * Sites (stage.ts) within 1.3 × the reach `rch` of you (`me`, in R: the ring shows before you are in): your moons (`list`),
 * open rival worlds (`open`), debris clusters (DEBRIS_N small bodies close together, mined from the biggest), free bodies
 * (alone from MOON_SHARE[0] up) with the elements `on`. Danger 1 with an enemy ship (`foes`) within DANGER_R. `mined`: each
 * site's mass when its mining began (set here once); `crew`: each miner's site id.
 */
export function survey(me: Body, near: Body[], list: { body: Body }[], foes: { x: number; y: number }[], open: { body: Body; site: { ore: number; vol: number }; beaten: boolean }[], rch: number, on: readonly Ore[], mined: WeakMap<Body, number>, crew: (number | undefined)[]) {
  const R = me.r, pm = me.motion, out = new Map<number, Spot>(), sites: Site[] = [], small: Body[] = [];
  const dist = (b: Body) => (Math.hypot(b.motion.x - pm.x, b.motion.y - pm.y) - b.r) / R;
  const add = (b: Body, kind: SiteKind, m0: number, site?: Spot['site'], beaten?: boolean) => {
    const d = dist(b);
    if (d > 1.3 * rch) return;
    let id = ids.get(b);
    if (id === undefined) ids.set(b, (id = ++lastId));
    if (!mined.has(b)) mined.set(b, m0);
    const foe = foes.some((f) => Math.hypot(f.x - b.motion.x, f.y - b.motion.y) < DANGER_R * R);
    out.set(id, { b, kind, m0: mined.get(b)!, site, beaten });
    sites.push({ id, d, share: site && site.ore + site.vol <= 0 ? 0 : b.m / me.m, comp: b.comp, kind, danger: foe ? 1 : 0, linked: crew.includes(id) });
  };
  for (const m of list) add(m.body, 'moon', m.body.m);
  for (const r of open) add(r.body, 'defeated', (r.site.ore + r.site.vol) * UNIT * me.m, r.site, r.beaten);
  for (const b of near) {
    if (b === me || !b.m || b.moon || b.held || b.meteor || b.rival || dist(b) > 1.3 * rch || !mineable(b.comp, on)) continue;
    if (b.m < SMALL * me.m) small.push(b);
    else add(b, 'free', b.m);
  }
  const grouped = new Set<Body>();
  for (const g of clusters(small.map((b) => ({ x: b.motion.x / R, y: b.motion.y / R })))) {
    const parts = g.map((i) => small[i]).sort((a, b) => b.m - a.m);
    for (const b of parts) grouped.add(b);
    add(parts[0], 'debris', parts.reduce((a, b) => a + b.m, 0));
  }
  for (const b of small) if (!grouped.has(b) && b.m >= MOON_SHARE[0] * me.m) add(b, 'free', b.m);
  return { out, sites };
}
