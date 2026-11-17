import './reticle.css';
import type { Graphics } from 'pixi.js';
import type { Aim, Controls } from '../core/input';
import type { Vec } from '../core/entity';
import { clamp } from '../core/rng';
import { overCard } from './tip';

// The soft reticle: replaces the OS cursor over the game while you have a weapon (rockets on
// Fire). The cooldown is a ring that fills around it; full = ready. No aim line, numbers or mode switch. The OS
// cursor stays hidden while it shows.

function createReticle(canvas: HTMLElement) {
  const el = document.createElement('div');
  el.id = 'reticle';
  el.hidden = true;
  el.innerHTML = '<svg viewBox="0 0 40 40"><circle class="ring" cx="20" cy="20" r="9"/><circle class="cool" cx="20" cy="20" r="14" pathLength="100"/><circle class="dot" cx="20" cy="20" r="1.4"/></svg>';
  document.body.append(el);
  const cool = el.querySelector<SVGCircleElement>('.cool')!;
  let shown = false, last = -1;
  return {
    /** `at` = cursor in canvas px (null: hide); `ready` 0..1 (1 = ready to fire). */
    update(at: { x: number; y: number } | null, ready: number) {
      const show = !!at;
      if (show !== shown) {
        [shown, el.hidden] = [show, !show];
        canvas.classList.toggle('no-cursor', show); // a class, not the inline style: Pixi writes the inline cursor itself
      }
      if (!at) return;
      const r = canvas.getBoundingClientRect();
      el.style.transform = `translate(${r.left + at.x}px, ${r.top + at.y}px)`;
      const p = Math.round(clamp(ready, 0, 1) * 100);
      if (p !== last) [last, cool.style.strokeDasharray] = [p, `${p} 100`];
      el.classList.toggle('ready', p >= 100);
    },
    destroy() {
      canvas.classList.remove('no-cursor');
      el.remove();
    },
  };
}

/** A weapon's readout (combat.ts rockets: the magazine): the reticle under the mouse (the OS cursor over a HUD card), on touch the cooldown as an arc of radius r round x, y. */
export function createReadout(canvas: HTMLElement, input: Controls) {
  const reticle = createReticle(canvas);
  return {
    update(on: boolean, ready: number, g: Graphics, x: number, y: number, r: number, width: number, color: number) {
      reticle.update(on && input.kind() === 'mouse' && !overCard() ? input.cursor() : null, ready);
      if (on && input.kind() === 'touch' && ready < 1) g.moveTo(x, y - r).arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + ready * 2 * Math.PI).stroke({ width, color, alpha: 0.5 });
    },
    /** The world point a Fire aims at: the HUD target, the cursor, or the stick's point. */
    at: (a: Aim | null, target: () => Vec | undefined): Vec | null => (a === 'target' ? target() ?? null : a === 'cursor' ? input.aimWorld() : a),
    destroy: reticle.destroy,
  };
}
