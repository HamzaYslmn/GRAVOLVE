import type { Texture } from 'pixi.js';
import type { Fx } from '../../render/fx';
import { AMBER, VIOLET, type Put } from '../../render/tech';
import type { Body } from '../asteroid/body';
import { BOLT, JET, least, MUZZLE, SLUG_LOOK, type Gun, type Missiles, type Quad, type Shots } from './guns';
import { ARMS } from './rules';
import type { Civilization } from './stage';
import type { Slug } from './weapon';

// The additive layer (combat.ts): rounds, missiles, slugs, muzzle flashes and charging glows, each a few quads of the tech
// page's `dot` (guns.ts BOLT, SLUG_LOOK), never under a few screen px.

/** Heavy guns (lances, shells): a bigger muzzle flash and hit, a lower, louder shot. */
export const heavy = (g: Gun) => g.look === 'lance' || g.look === 'shell';

/** What one frame of bolts needs: the layer's `add` and `dot`, ship unit `unit` at `zoom`, your world, what flies, `sr` a ship's radius. */
export type BoltsIn = {
  add: Put; dot: Texture; unit: number; zoom: number; me: Body; shots: Shots; missiles: Missiles; slugs: readonly Slug[];
  dt: number; onScreen: (x: number, y: number, r?: number) => boolean; fx: Fx; civ?: Civilization; sr: number;
};

export function drawBolts(o: BoltsIn) {
  const { add, dot, unit: u, zoom: z, me, shots, missiles, dt, fx, civ, sr } = o, pm = me.motion;
  /** One quad of a look with its head at (x, y), heading `rot`. */
  const bolt = (q: Quad, x: number, y: number, rot: number, tint: number, alpha: number, long = q.long ?? 1) => {
    const w = least(q.k, q.px, u, z), back = long > 1 ? 0.3 * w * long : 0;
    add(dot, x - Math.cos(rot) * back, y - Math.sin(rot) * back, rot, w, tint, alpha, long);
  };
  // Rounds: a glowing streak in the gun's tint round a hot core; for MUZZLE.s after launch a flash where it left.
  for (let i = 0; i < shots.n; i++) {
    const s = shots.pool[i], L = BOLT[s.gun.look ?? 'round'], rvx = s.vx - pm.vx, rvy = s.vy - pm.vy, age = s.gun.life - s.life;
    if (!o.onScreen(s.x, s.y, least(L.glow.k, L.glow.px, u, z) * (L.glow.long ?? 1) + (age < MUZZLE.s ? Math.hypot(rvx, rvy) * age : 0))) continue;
    const rot = Math.atan2(rvy, rvx);
    bolt(L.glow, s.x, s.y, rot, s.gun.tint, L.glow.a!);
    bolt(L.core, s.x, s.y, rot, L.coreTint ?? 0xffffff, 1);
    if (L.halo) bolt(L.halo, s.x, s.y, 0, s.gun.tint, L.halo.a!);
    if (age >= MUZZLE.s) continue;
    const t = age / MUZZLE.s, w = heavy(s.gun) ? least(MUZZLE.heavyK, MUZZLE.heavyPx, u, z) : least(MUZZLE.k, MUZZLE.px, u, z);
    add(dot, s.x - rvx * age, s.y - rvy * age, 0, w * (1 - 0.5 * t), s.gun.tint, 0.9 * (1 - t));
  }
  // Missiles and rockets (BOLT.missile, BOLT.rocket): a flickering flame (the side's tint round a white-yellow jet), long and
  // full while the motor runs up, a little shorter at cruise, a dim stub once the seeker lets go (it flies
  // straight from here; a rocket keeps half a flame); a teardrop head in the side's tint round a white core;
  // smoke embers left hanging in the shooter's frame.
  for (const m of missiles.live) {
    const L = BOLT[m.look], F = L.flame!, hw = least(L.glow.k, L.glow.px, u, z), fw = least(F.k, F.px, u, z);
    if (!o.onScreen(m.x, m.y, hw + fw * F.long!)) continue;
    const tint = m.team === 'you' ? AMBER : VIOLET, rot = Math.atan2(m.vy - pm.vy, m.vx - pm.vx), c = Math.cos(rot), sn = Math.sin(rot);
    const burn = !m.lock ? (m.look === 'rocket' ? 0.55 : 0.3) : Math.hypot(m.vx - m.v0x, m.vy - m.v0y) < 0.98 * m.u ? 1 : 0.8, fl = 0.85 + 0.3 * Math.random();
    for (const [q, t] of [[F, tint], [L.jet!, JET]] as const) {
      const w = least(q.k, q.px, u, z) * (0.6 + 0.4 * burn), len = q.long! * burn * fl, back = 0.35 * hw + 0.5 * w * len;
      add(dot, m.x - c * back, m.y - sn * back, rot, w, t, q.a! * (0.5 + 0.5 * burn) * fl, len);
    }
    bolt(L.glow, m.x, m.y, rot, tint, L.glow.a!);
    bolt(L.core, m.x, m.y, rot, 0xffffff, 1);
    const tail = 0.35 * hw + fw * F.long! * burn;
    if (Math.random() < dt * (m.lock ? 25 : 8)) fx.ember(m.x - c * tail, m.y - sn * tail, m.v0x, m.v0y, fw * 0.8, 0x9a8a78, 0.35);
  }
  // Slugs (world-sized: SLUG_LOOK): steel, a hair-thin very long streak, dead straight, a white head; no halo, no pulse.
  for (const s of o.slugs) {
    const sm = s.b.motion, r = s.b.r, S = SLUG_LOOK, rot = Math.atan2(sm.vy - pm.vy, sm.vx - pm.vx), w = Math.max(S.w[1] / z, S.w[0] * r), len = Math.max(S.len[1] / z, S.len[0] * s.D);
    add(dot, sm.x - Math.cos(rot) * len * 0.45, sm.y - Math.sin(rot) * len * 0.45, rot, w, s.tint, 0.9, len / w);
    add(dot, sm.x, sm.y, 0, Math.max(S.head[1] / z, S.head[0] * r), 0xffffff, 1);
  }
  // Your silo's glow on the surface; your frigates' noses charging.
  const g = civ?.siloGlow();
  if (g) add(dot, pm.x + Math.cos(g.a) * me.r, pm.y + Math.sin(g.a) * me.r, 0, Math.max(me.r * (0.1 + 0.15 * g.k), 16 / z), AMBER, 0.4 + 0.5 * g.k);
  for (const f of civ?.frigates ?? []) if (f.glow > 0) {
    const k = Math.min(1, f.glow / ARMS.lance.glow);
    add(dot, pm.x + f.x + Math.cos(f.heading) * sr * 1.5, pm.y + f.y + Math.sin(f.heading) * sr * 1.5, 0, Math.max(sr * (1 + 3 * k), 14 / z), 0xe8fdff, 0.5 + 0.4 * k);
  }
}
