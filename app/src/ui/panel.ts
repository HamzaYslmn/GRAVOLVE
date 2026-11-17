// Shared by the stage HUDs (asteroid, planet, civilization, star): their update throttle and DOM helpers.
import { clamp } from '../core/rng.ts';

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
// A segment's label in Oxanium 700 at --ui-caption (10 px), measured per glyph class (digits are tabular; letters: the
// widest of the names' average), after the 12 px icon, its 2 px gap and 1 px to spare (ui/hud.css, asteroid/hud.css .mix).
const ICON_PX = 13; // an icon-only segment
const glyph = (c: string) => (c === '.' ? 2.8 : c === ' ' ? 2.4 : c === '%' ? 8.9 : c >= '0' && c <= '9' ? 5.8 : 6);
const need = (s: string) => Math.ceil(ICON_PX + 2 + [...s].reduce((a, c) => a + glyph(c), 0));
/** How much of a label fits a bar segment `px` wide (a phone storage bar): 3 icon · name · value, 2 icon · value, 1 icon, 0 nothing. */
export const fit = (px: number, name: string, val: string) => (px >= need(`${name} ${val}`) ? 3 : px >= need(val) ? 2 : px >= ICON_PX ? 1 : 0);
/**
 * Widths for a stacked bar's segments [share, name, value] in a bar `px` wide (1 px gaps): each gets room for
 * icon · value (more than fit: the smallest shares keep only their icon), the biggest shares then get their names
 * while there is room, the rest goes by share.
 */
export function widths(px: number, parts: [number, string, string][]) {
  const w = parts.map(([, , v]) => need(v)), big = parts.map((_, i) => i).sort((a, b) => parts[b][0] - parts[a][0]);
  let free = px - (parts.length - 1) - w.reduce((a, b) => a + b, 0);
  for (const i of [...big].reverse()) if (free < 0) [free, w[i]] = [free + w[i] - ICON_PX, ICON_PX];
  for (const i of big) {
    const more = need(`${parts[i][1]} ${parts[i][2]}`) - w[i];
    if (more <= free) [w[i], free] = [w[i] + more, free - more];
  }
  const sum = parts.reduce((a, p) => a + p[0], 0) || 1;
  return w.map((x, i) => x + (Math.max(0, free) * parts[i][0]) / sum);
}
/** The text a segment shows at fit level `k`. */
export const label = (k: number, name: string, val: string) => (k > 2 ? `${name} ${val}` : k > 1 ? val : '');
