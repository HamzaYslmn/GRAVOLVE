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
/** How much of a label fits a bar segment `px` wide (a phone storage bar): 3 icon · name · value, 2 icon · value, 1 icon, 0 nothing. */
export const fit = (px: number, name: string, val: string) => {
  const w = (s: string) => 13 + s.length * 5.4; // icon + padding, ~9 px bold text
  return px >= w(`${name} ${val}`) ? 3 : px >= w(val) ? 2 : px >= 12 ? 1 : 0;
};
/** The text a segment shows at fit level `k`. */
export const label = (k: number, name: string, val: string) => (k > 2 ? `${name} ${val}` : k > 1 ? val : '');
