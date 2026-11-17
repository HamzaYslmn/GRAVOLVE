// The tooltip's hit rule (ui/tip.ts), pure so Node tests it: the innermost rect under a point.
export type TipRect = { x: number; y: number; w: number; h: number; depth: number };

/** Index of the rect containing (x, y), edges included: the deepest wins, a tie goes to the later one (on top); -1 if none. */
export function pick(rects: TipRect[], x: number, y: number): number {
  let best = -1;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) continue;
    if (best < 0 || r.depth >= rects[best].depth) best = i;
  }
  return best;
}
