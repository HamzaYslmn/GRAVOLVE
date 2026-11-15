import type { Kit } from '../../kit';
import type { News } from '../../ui/toast';
import type { Motion, Vec } from '../../core/entity';
import type { Civilization } from '../civilization/stage';
import type { Hauler } from './look';
import { DONE, LIFT, PANELS, SEG_ORE, SEG_S, SEGMENTS } from './rules';

// The Dyson sphere round your star: one segment at a time while the civilization lives and has the ore; each panel by
// hauler. DONE coverage completes Age III, all PANELS Type II.

const FLY_S = 2.6; // s a hauler takes from your world to its panel slot
export const PER_SEG = PANELS / SEGMENTS;

type Sphere = { m: Motion; R: number; segs: number; placed: number; build?: { t: number; launched: number }; haulers: Hauler[] };

export function createDyson(civ: Civilization, kit: Pick<Kit, 'fx' | 'sfx'>, news: News) {
  let done = false, closed = false, wait: string | undefined;
  return {
    /** Why the sphere is not building (the HUD's Dyson row). */
    get wait() {
      return wait;
    },
    /** One step on your star `s`; haulers leave `from` (your world); `speed`: build speed (colonies). */
    update(s: Sphere, from: Vec, speed: number, dt: number) {
      const cs = civ.state;
      if (cs?.active) civ.gain(LIFT * dt); // people lift matter off their star
      if (!s.build && s.segs < SEGMENTS && cs?.active && civ.spend(SEG_ORE)) {
        s.build = { t: 0, launched: 0 };
        if (!s.segs) news('dyson', 'Dyson sphere', `Your people start enclosing the star · ${SEG_ORE} ore a segment`);
      }
      // Waiting for the people (life fell back, the civilization sleeps) or for the ore of the next segment.
      wait = s.build || s.segs >= SEGMENTS ? undefined : !cs?.active ? 'Waits for your people: life must recover'
        : `Next segment needs ${SEG_ORE} ore · ${Math.floor(civ.stocks.ore)} stored`;
      if (s.build) {
        const b = s.build;
        b.t += (dt / SEG_S) * speed;
        while (b.launched < PER_SEG && b.t >= ((b.launched + 0.5) / PER_SEG) * 0.88) {
          s.haulers.push({ sx: from.x, sy: from.y, slot: s.segs * PER_SEG + b.launched, t: 0 });
          b.launched++;
        }
        if (b.t >= 1 && b.launched >= PER_SEG && !s.haulers.length) {
          s.segs++;
          s.build = undefined;
        }
      }
      for (let i = s.haulers.length - 1; i >= 0; i--) {
        const h = s.haulers[i];
        if ((h.t += dt / FLY_S) < 1) continue;
        s.placed = Math.max(s.placed, h.slot + 1);
        kit.sfx.play('segment', 0.5, 1);
        s.haulers.splice(i, 1);
      }
      if (!done && s.placed / PANELS >= DONE) {
        done = true;
        kit.fx.flash(s.m.x, s.m.y, s.R * 4, 40, s.R * 3);
        kit.sfx.play('boom', 1, 0.5);
        news('age3', 'Age III complete', 'Half a Dyson sphere · your people run on starlight · next: close it');
      }
      if (!closed && s.placed >= PANELS) {
        closed = true;
        kit.fx.flash(s.m.x, s.m.y, s.R * 5, 50, s.R * 4);
        kit.sfx.play('boom', 1, 0.4);
        news('type2', 'Type II civilization', 'The whole star works for your people');
      }
    },
  };
}
