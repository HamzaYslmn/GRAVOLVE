import type { Texture } from 'pixi.js';
import type { Fx } from '../../render/fx';
import { RUST, SHIP_PX, SHIP_SCALE, VIOLET, YOU, type Fleet, type Put } from '../../render/tech';
import { ART_W } from '../../render/shipArt';
import type { Body } from '../asteroid/body';
import { JUMP, type Wake, type Warp } from './escape';
import { BOLT, JET, least, MUZZLE, type Gun, type Quad, type Rockets, type Shots } from './guns';
import { ARMS, PIRATE_CLASS, ROCKET } from './rules';
import type { Civilization } from './stage';

// The additive layer (combat.ts): rounds, rockets' flames, muzzle flashes and charging glows, pirate shields and jumps,
// each a few quads of the tech page's `dot` (guns.ts BOLT), `veil` or `ring`, never under a few screen px; rocket hulls on the normal layer.

/** Heavy guns (lances, shells): a bigger muzzle flash and hit, a lower, louder shot. */
export const heavy = (g: Gun) => g.look === 'lance' || g.look === 'shell';

const RIM = { raider: 3.5, hauler: 4.2, marauder: 6.5 }; // ship radii across a pirate shield
const HOT = 0xfff1dc, WARM = 0xffd9a0; // a jump's white-hot core and warm sparks
let spin = 0; // rad: shields and shock rings turn

/** What one frame of bolts needs: the layer's `add` and `dot`, ship unit `unit` at `zoom`, your world, what flies, `sr` a ship's radius; pirate ships and their jumps. */
export type BoltsIn = {
  add: Put; dot: Texture; veil: Texture; ring: Texture; unit: number; zoom: number; me: Body; shots: Shots;
  dt: number; onScreen: (x: number, y: number, r?: number) => boolean; fx: Fx; civ?: Civilization; sr: number; pirates: readonly Warp[]; wakes: Wake[];
  put: Put; fleet: Fleet; rockets: Rockets; // the normal layer (rocket hulls), the baked ships, rockets in flight
};

export function drawBolts(o: BoltsIn) {
  const { add, dot, unit: u, zoom: z, me, shots, dt, fx, civ, sr } = o, pm = me.motion;
  spin += dt * 0.6;
  // Pirate shields: a faint bubble while it holds (brighter the fuller), a flare growing 25% for 0.3 s when a round is
  // soaked, and a white pop when that round broke it.
  for (const s of o.pirates) {
    const max = PIRATE_CLASS[s.kind].shield, D = Math.max(RIM[s.kind] * sr, 14 / z);
    if (s.spool > 0 || (s.sh <= 0.05 && s.flare <= 0) || !o.onScreen(s.x, s.y, D)) continue;
    const k = s.flare / 0.3, a = Math.max(0.05 + 0.1 * Math.min(1, s.sh / max), 0.85 * k * k);
    add(o.veil, s.x, s.y, spin + s.heading, D * (1 + 0.25 * (1 - k) * (k > 0 ? 1 : 0)), RUST, a);
    if (k > 0 && s.sh < 1) add(dot, s.x, s.y, 0, D * 0.9, 0xffffff, 0.6 * k);
  }
  // Jumps (escape.ts JUMP): while it spools, a growing glow, a flickering white core, an energy ring closing in and two
  // sparks spiralling in, then a spike off the nose; at the jump, a white streak shooting 60 ship radii ahead in its rust
  // glow, its tail chasing its head as it fades, a flash crossed by a short flare and a shock ring where it left.
  for (let i = o.wakes.length - 1; i >= 0; i--) {
    const w = o.wakes[i], s = w.s, c = Math.cos(s.heading), n = Math.sin(s.heading);
    if (!s.dead) {
      if (!o.pirates.includes(s)) o.wakes.splice(i, 1); // its fleet is gone
      else if (o.onScreen(s.x, s.y, 10 * sr)) {
        const k = Math.min(1, s.spool / JUMP.spool), r = Math.max(5 * sr, 18 / z) * (1 - k);
        add(dot, s.x, s.y, 0, Math.max(sr * (2.5 + 5 * k * k), 14 / z), RUST, 0.3 + 0.6 * k);
        add(dot, s.x, s.y, 0, Math.max(sr * (1 + 1.5 * k), 6 / z), HOT, (0.55 + 0.45 * k) * (0.85 + 0.3 * Math.random()));
        add(o.ring, s.x, s.y, -spin * 3, Math.max(sr * (9 - 7 * k), 10 / z), WARM, 0.7 * Math.sin(Math.PI * k));
        for (const p of [0, Math.PI]) add(dot, s.x + Math.cos(9 * k * k + p) * r, s.y + Math.sin(9 * k * k + p) * r, 0, Math.max(0.6 * sr, 3 / z), WARM, 0.9 * k);
        const spike = (s.spool - (JUMP.spool - 0.15)) / 0.15, wd = Math.max(0.5 * sr, 2 / z), L = 12 * sr * spike;
        if (spike > 0) add(dot, s.x + c * L * 0.4, s.y + n * L * 0.4, s.heading, wd, HOT, 0.8, Math.max(1, L / wd));
      }
      continue;
    }
    if (s.spool < JUMP.spool) { // killed while it spooled
      o.wakes.splice(i, 1);
      continue;
    }
    const t = (w.t += dt);
    if (t >= JUMP.trail) {
      o.wakes.splice(i, 1);
      continue;
    }
    const f = 1 - t / JUMP.trail, M = Math.max(60 * sr, 220 / z), head = M * Math.min(1, t / JUMP.streak), tail = t > JUMP.streak ? M * ((t - JUMP.streak) / (JUMP.trail - JUMP.streak)) ** 2 : 0;
    const L = Math.max(head - tail, 1e-6), mid = (head + tail) / 2, wd = Math.max(0.45 * sr, 2.5 / z) * (1 - 0.5 * (1 - f)), x = s.x + c * mid, y = s.y + n * mid;
    if (o.onScreen(x, y, L)) {
      add(dot, x, y, s.heading, 4 * wd, RUST, 0.6 * f * f, L / (4 * wd));
      add(dot, x, y, s.heading, wd, HOT, f ** 1.5, L / wd);
    }
    if (t < JUMP.flash) {
      const q = 1 - t / JUMP.flash, fw = Math.max(sr * (5 + 6 * (1 - q)), 28 / z);
      add(dot, s.x, s.y, 0, fw, 0xffffff, q);
      add(dot, s.x, s.y, s.heading + Math.PI / 2, Math.max(0.6 * sr, 3 / z), HOT, 0.9 * q, (2.5 * fw) / Math.max(0.6 * sr, 3 / z)); // the flare across it
    }
    if (t < JUMP.ring) add(o.ring, s.x, s.y, spin * 4, sr * (3 + 12 * Math.sqrt(t / JUMP.ring)), WARM, 0.8 * (1 - t / JUMP.ring) ** 1.5);
  }
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
  // Rockets (ROCKET, render/shipArt.ts rocket): the baked hull on the normal layer, ROCKET.len R long in the ships' unit
  // (smaller than any ship); behind it a flickering flame in the side's hue round a white-yellow jet, both growing with
  // the thrust (m.burn), a nozzle glow and embers streaming back from the nozzle; off the pad a flash and a puff of dust.
  for (const m of o.rockets.live) {
    const len = (ROCKET.len / SHIP_SCALE) * SHIP_PX * u;
    if (!o.onScreen(m.x, m.y, 3 * len)) continue;
    const c = Math.cos(m.heading), sn = Math.sin(m.heading), tint = m.team === 'you' ? YOU : VIOLET, tx = m.x - c * len * 0.5, ty = m.y - sn * len * 0.5;
    const on = m.fuel > 0 ? 0.5 + 0.5 * m.burn : 0, fl = 0.85 + 0.3 * Math.random(), w = Math.max(0.5 * len, 2.5 / z), L = w * (1 + 1.5 * on) * fl;
    if (!m.lit) {
      m.lit = true;
      fx.flash(tx, ty, 2 * w, 0, 0);
      fx.puff(tx, ty, c, sn, 6, 0.5 * w, 5 * w, 0x8a8478);
    }
    add(dot, tx - c * L * 0.45, ty - sn * L * 0.45, m.heading, 2 * w, tint, 0.85 * on, Math.max(1, (2 * L) / (2 * w)));
    add(dot, tx - c * L * 0.25, ty - sn * L * 0.25, m.heading, 1.1 * w, JET, on, Math.max(1, L / (1.1 * w)));
    add(dot, tx, ty, 0, 2.2 * w, tint, 0.5 * on * fl);
    o.put(o.fleet[m.team === 'you' ? 'you' : 'rival'].rocket, m.x, m.y, m.heading, (len * ART_W) / 128, 0xffffff, 1);
    if (on && Math.random() < dt * 30 * on) fx.ember(tx - c * L * 0.7, ty - sn * L * 0.7, m.vx - c * 6 * m.R, m.vy - sn * 6 * m.R, Math.max(0.3 * w, 1.5 / z), 0x6a6258, 0.4);
  }
  // Your frigates' noses charging.
  for (const f of civ?.frigates ?? []) if (f.glow > 0) {
    const k = Math.min(1, f.glow / ARMS.lance.glow);
    add(dot, pm.x + f.x + Math.cos(f.heading) * sr * 1.5, pm.y + f.y + Math.sin(f.heading) * sr * 1.5, 0, Math.max(sr * (1 + 3 * k), 14 / z), 0xe8fdff, 0.5 + 0.4 * k);
  }
}
