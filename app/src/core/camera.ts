import type { Container } from 'pixi.js';
import type { Motion, Vec } from './entity';
import { clamp } from './rng';

// Follow camera: eases toward the target and leads in its direction of travel. Wheel zooms around the screen
// centre; on top, the caller says how much world to show (`view`). `shake` sets trauma (offset ∝ trauma²),
// on real time so it keeps shaking through a hit-stop. `kick` is a one-off directional shove (your own bounces).

const FOLLOW = 6; // 1/s: how quickly the camera catches up
// Look-ahead: the exponential follow trails by v/FOLLOW, so the lead adds that back plus LEAD s, capped at
// LEAD_MAX of the half view and eased on its own (braking doesn't swing the view).
const LEAD = 0.5;
const LEAD_MAX = 0.45; // share of the half view
const LEAD_EASE = 2; // 1/s
const KICK_BACK = 14; // 1/s: how fast a kick settles
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_EASE = 1.5; // 1/s: zoom changes slowly so a meal or a burst of speed doesn't jolt the view
const SHAKE_PX = 8; // screen px at full trauma
const SHAKE_DECAY = 1.6; // trauma/s

/** Starts centred on `start`; `follow` eases from there. */
export function createCamera(world: Container, surface: HTMLElement, start: Vec, zoom: number) {
  let wheel = zoom;
  let trauma = 0;
  let time = 0;
  const lead = { x: 0, y: 0 }, kick = { x: 0, y: 0 };
  const cam = { x: start.x, y: start.y, zoom };
  surface.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      wheel = clamp(wheel * Math.exp(-e.deltaY * 0.001), ZOOM_MIN, ZOOM_MAX);
    },
    { passive: false },
  );

  return {
    /** Current centre (world units) and zoom; read-only for callers. */
    state: cam as Readonly<typeof cam>,
    /** Raises trauma to at least `amount` (0..1; a big hit ≈ 0.6). Hits don't stack, so a swarm of small ones stays calm. */
    shake(amount: number) {
      trauma = Math.min(1, Math.max(trauma, amount));
    },
    /** A shove of `px` screen pixels along (nx, ny), settling back quickly. Doesn't stack: the bigger one wins. */
    kick(nx: number, ny: number, px: number) {
      if (px > Math.hypot(kick.x, kick.y)) [kick.x, kick.y] = [nx * px, ny * px];
    },
    /** `view` is how much world to show relative to the start (2 = twice as wide); `real` = unscaled frame time (s). */
    follow(t: Motion, dt: number, width: number, height: number, view: number, real: number) {
      const k = 1 - Math.exp(-FOLLOW * dt), cap = (LEAD_MAX * Math.min(width, height)) / 2 / cam.zoom;
      let lx = t.vx * (LEAD + 1 / FOLLOW), ly = t.vy * (LEAD + 1 / FOLLOW);
      const l = Math.hypot(lx, ly);
      if (l > cap) [lx, ly] = [(lx * cap) / l, (ly * cap) / l];
      const e = 1 - Math.exp(-LEAD_EASE * dt);
      lead.x += (lx - lead.x) * e;
      lead.y += (ly - lead.y) * e;
      cam.x += (t.x + lead.x - cam.x) * k;
      cam.y += (t.y + lead.y - cam.y) * k;
      const want = wheel / view;
      cam.zoom *= (want / cam.zoom) ** (1 - Math.exp(-ZOOM_EASE * dt)); // eased in log space
      time += real;
      trauma = Math.max(0, trauma - SHAKE_DECAY * real);
      const kb = Math.exp(-KICK_BACK * real);
      kick.x *= kb;
      kick.y *= kb;
      const s = trauma * trauma * SHAKE_PX; // two detuned sines: jittery but smooth, no RNG
      const sx = s * (Math.sin(time * 53) + 0.5 * Math.sin(time * 91)) / 1.5;
      const sy = s * (Math.sin(time * 61 + 1) + 0.5 * Math.sin(time * 83 + 2)) / 1.5;
      world.scale.set(cam.zoom);
      world.position.set(width / 2 - cam.x * cam.zoom + sx + kick.x, height / 2 - cam.y * cam.zoom + sy + kick.y);
    },
  };
}
