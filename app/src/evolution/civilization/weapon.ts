import { K_PER_HEAT } from '../../core/water';
import { Container } from 'pixi.js';
import { motion, type Vec } from '../../core/entity';
import type { Fx } from '../../render/fx';
import { burnStreak } from '../asteroid/feedback';
import { phys, resolve, type Body, type Events } from '../asteroid/body';
import { burnShare, contactTime, impactHeat, radiusOf, reachGround, stickSpeed, type Comp } from '../asteroid/rules';
import { SLUG_LIFE, SLUG_SHARE, SLUG_SPEED } from './rules';
import { clamp } from '../../core/rng';

// Mass-driver slugs, yours and the rival worlds'. A slug is a real body (SLUG_SHARE of its shooter's mass, SLUG_SPEED of
// the shooter's diameters/s on top of its velocity) that lives SLUG_LIFE s. It is not a field body: it flies straight
// (gravity would not bend it visibly in 1–2 s) and is resolved here, in field.update's `contacts` hook, so whatever it
// breaks is dropped by the field the same frame. Each frame it is swept against every loaded body and world (no tunnelling):
//   - a world with its shield up absorbs it whole: the raw heat it would deliver goes onto the shield;
//   - else the world's air burns it like any small fast body (burnShare / reachGround): slugs never reach the ground of
//     a world with air;
//   - else the collision regimes decide, with the slug's warhead term (asteroid/rules.ts collide).
// Ships are swept as points (`marks`). The shooter's own body and moons are never hit by its own slugs.

export type Slug = { b: Body; from: Body; D: number; life: number; tint: number; foe: boolean };
/** A world that shields itself: `shield` takes raw kelvin and says whether the shield absorbed it; `p` its air (atm). */
export type Shielded = { body: Body; shield: (kelvin: number, share: number, x: number, y: number) => boolean; p: number };
/** A ship as a slug sees it: a point with a hit radius (world units). */
export type Mark = { x: number; y: number; r: number; kill: () => void };

const NONE: Vec = { x: 0, y: 0 };
/** Every slug's body (a rival's shield already judged a slug before its collision reaches onHit). */
export const slugBodies = new WeakSet<Body>();
const MUZZLE = 1.08; // shooter radii: slugs leave just outside the surface

/** A ship hit by a slug or the beam: it breaks in a flash and a burst. */
export function breakMark(fx: Fx, k: Mark) {
  k.kill();
  fx.flash(k.x, k.y, k.r * 2.5, 8, k.r * 4);
  fx.burst(k.x, k.y, 10, k.r * 0.4, k.r * 4, 0xffc890);
}

export function createSlugs(fx: Fx) {
  const live: Slug[] = [];
  return {
    live,
    /** Fires a slug from `from` along unit `dir` (its world velocity = from's + dir × SLUG_SPEED of from's diameters/s). */
    fire(from: Body, dir: Vec, comp: Comp, tint: number, foe: boolean) {
      const m = SLUG_SHARE * from.m, D = 2 * from.r, u = SLUG_SPEED * D, fm = from.motion;
      const b: Body = {
        motion: motion(fm.x + dir.x * from.r * MUZZLE, fm.y + dir.y * from.r * MUZZLE, 0, 0), control: () => NONE, view: new Container(), spin: 0,
        m, r: radiusOf(m, comp), k: 1, comp, tint, heat: 0, parts: [],
      };
      [b.motion.vx, b.motion.vy] = [fm.vx + dir.x * u, fm.vy + dir.y * u];
      // Recoil: the slug's momentum back on the shooter.
      fm.vx -= (dir.x * u * m) / from.m;
      fm.vy -= (dir.y * u * m) / from.m;
      fx.flash(b.motion.x, b.motion.y, from.r * 0.12, 4, from.r * 0.5);
      slugBodies.add(b);
      const s: Slug = { b, from, D, life: SLUG_LIFE, tint, foe };
      live.push(s);
      return s;
    },
    /**
     * Moves every slug one frame and resolves what it meets first (after the field moved its bodies: their step this frame
     * was v·dt). `bodies` = the loaded bodies (and you), `worlds` = shielded worlds, `marks(s)` = ships this slug can hit.
     */
    contacts(dt: number, bodies: Body[], worlds: Shielded[], marks: (s: Slug) => Mark[], ev: Events, own: (s: Slug, b: Body) => boolean) {
      for (let i = live.length - 1; i >= 0; i--) {
        const s = live[i], sb = s.b, sm = sb.motion;
        const x0 = sm.x, y0 = sm.y, x1 = x0 + sm.vx * dt, y1 = y0 + sm.vy * dt;
        // First contact along the step: bodies (swept circles), then ships (points), whichever comes first.
        let first = 2, hit: Body | undefined, mark: Mark | undefined;
        for (const b of bodies) {
          if (!b.m || b === s.from || own(s, b)) continue;
          const bm = b.motion, qx = bm.x - x1, qy = bm.y - y1, rr = b.r + sb.r;
          if (Math.abs(qx) > rr + Math.abs(sm.vx - bm.vx) * dt + rr || Math.abs(qy) > rr + Math.abs(sm.vy - bm.vy) * dt + rr) continue; // cheap reject
          const t = contactTime(qx, qy, (bm.vx - sm.vx) * dt, (bm.vy - sm.vy) * dt, rr);
          const inside = (bm.x - bm.vx * dt - x0) ** 2 + (bm.y - bm.vy * dt - y0) ** 2 < rr * rr; // started inside (fired point-blank)
          const tt = inside ? 0 : t;
          if (tt >= 0 && tt < first) [first, hit] = [tt, b];
        }
        const sx = x1 - x0, sy = y1 - y0, ss = sx * sx + sy * sy || 1;
        for (const k of marks(s)) {
          const t = clamp(((k.x - x0) * sx + (k.y - y0) * sy) / ss, 0, 1);
          if (t < first && (x0 + sx * t - k.x) ** 2 + (y0 + sy * t - k.y) ** 2 < (k.r + sb.r) ** 2) [first, mark, hit] = [t, k, undefined];
        }
        if (mark) {
          breakMark(fx, mark);
          live.splice(i, 1);
          continue;
        }
        if (!hit) {
          [sm.x, sm.y] = [x1, y1];
          if ((s.life -= dt) <= 0) live.splice(i, 1);
          continue;
        }
        // Put the slug where it first touched (relative offset at that moment), a hair inside contact.
        const bm = hit.motion, rr = hit.r + sb.r, t = first;
        const rx = bm.x - x1 - (bm.vx - sm.vx) * dt * (1 - t), ry = bm.y - y1 - (bm.vy - sm.vy) * dt * (1 - t), rl = Math.hypot(rx, ry) || 1;
        [sm.x, sm.y] = [bm.x - (rx / rl) * rr * 0.999, bm.y - (ry / rl) * rr * 0.999];
        live.splice(i, 1);
        const cx = sm.x + (rx / rl) * sb.r, cy = sm.y + (ry / rl) * sb.r; // contact point
        const w = worlds.find((q) => q.body === hit);
        const rvx = sm.vx - bm.vx, rvy = sm.vy - bm.vy, speed = Math.hypot(rvx, rvy);
        if (w) {
          // A shield takes the slug's raw heat (what it would deliver to that world), whole, while it is up.
          const share = sb.m / (sb.m + hit.m), kelvin = K_PER_HEAT * impactHeat(share, speed / (2 * hit.r), stickSpeed(phys(hit), phys(sb)), hit.r);
          if (w.shield(kelvin, sb.m / hit.m, cx, cy)) continue;
          // Air: a fast small body burns up (only the share that would reach the ground lands).
          const sbn = burnShare(w.p), f = reachGround(sb.m / hit.m, sbn);
          if (f < 1) {
            burnStreak(fx, hit, sb, cx, cy, rvx / (speed || 1), rvy / (speed || 1), f <= 0);
            if (f <= 0) continue;
            sb.m *= f;
          }
        }
        // Momentum of whatever of the slug does not bounce off goes into the target (a shot rock is knocked aside).
        const m0 = sb.m, tx = bm.vx, ty = bm.vy;
        if (s.foe && hit === bodies[0]) resolve(hit, sb, ev, { player: true }); // a rival's slug on you (`bodies[0]`): you are the actor (life rules)
        else resolve(sb, hit, ev, { warhead: s.D });
        if (hit.m && !sb.m) [bm.vx, bm.vy] = [tx + (rvx * m0) / hit.m, ty + (rvy * m0) / hit.m];
      }
    },
    clear() {
      live.length = 0;
    },
  };
}
