// Shared by the stage HUDs (asteroid, planet, civilization, star): their update throttle and DOM helpers.
import { clamp } from '../core/rng';

export const PERIOD = 1 / 12; // s between a HUD's DOM updates
/** A HUD's throttle: true at most every PERIOD s of the dt fed to it. */
export function throttle() {
  let wait = 0;
  return (dt: number) => (wait -= dt) <= 0 && ((wait = PERIOD), true);
}
export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
/** A bar's CSS width for share f (clamped 0..1). */
export const bar = (f: number) => `${(clamp(f, 0, 1) * 100).toFixed(1)}%`;
/** querySelector under `root`, non-null (the HUD built the markup itself). */
export const finder = (root: ParentNode) => <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
