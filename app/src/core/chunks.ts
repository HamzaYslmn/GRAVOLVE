/**
 * Streams square chunks: creates the ones in a range, releases the ones that fall `keep` chunks
 * outside it. Shared by the backdrop and the asteroid field.
 */
const MAX_COORD = 1e9; // chunks
const MAX_AREA = 40000; // chunks in one range

/** On-screen chunks [x0, x1, y0, y1] (always loaded, past any budget) and the point the rest load nearest to first. */
type Focus = { screen: [number, number, number, number]; x: number; y: number };

export function chunkSet<T>(make: (cx: number, cy: number) => T, release: (item: T) => void) {
  const live = new Map<string, { cx: number; cy: number; item: T }>();
  let done = ''; // the last fully loaded range: asking for it again is a no-op
  let full: number[] | undefined; // the same as [x0, x1, y0, y1]: its chunks are all live, so a moving range scans only its new strips
  return {
    live,
    /**
     * Loads chunks in [x0..x1] x [y0..y1]: those on `focus.screen` all at once, then the rest nearest `focus` first, at
     * most `budget` of them; returns the budget left.
     */
    update(x0: number, x1: number, y0: number, y1: number, keep: number, budget = Infinity, focus?: Focus) {
      const range = `${x0},${x1},${y0},${y1},${keep}`;
      if (range === done) return budget;
      // Past ~2^53 adding 1 no longer changes a coordinate, so these loops would never end: refuse absurd ranges.
      if (![x0, x1, y0, y1].every((v) => Math.abs(v) < MAX_COORD) || (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_AREA) return budget;
      for (const [key, c] of live) {
        if (c.cx < x0 - keep || c.cx > x1 + keep || c.cy < y0 - keep || c.cy > y1 + keep) {
          release(c.item);
          live.delete(key);
          if (full && c.cx >= full[0] && c.cx <= full[1] && c.cy >= full[2] && c.cy <= full[3]) full = undefined;
        }
      }
      // Missing chunks: -1 on screen (a hole you can see), else the squared distance to the focus point.
      const [sx0, sx1, sy0, sy1] = focus?.screen ?? [x0, x1, y0, y1], fx = focus?.x ?? (x0 + x1) / 2, fy = focus?.y ?? (y0 + y1) / 2;
      const missing: [number, number, number][] = [];
      const [fx0, fx1, fy0, fy1] = full ?? [1, 0, 1, 0];
      for (let cy = y0; cy <= y1; cy++) {
        const rowFull = cy >= fy0 && cy <= fy1;
        for (let cx = x0; cx <= x1; cx++) {
          if ((rowFull && cx >= fx0 && cx <= fx1) || live.has(`${cx},${cy}`)) continue;
          const seen = cx >= sx0 && cx <= sx1 && cy >= sy0 && cy <= sy1;
          missing.push([cx, cy, seen ? -1 : (cx - fx) ** 2 + (cy - fy) ** 2]);
        }
      }
      missing.sort((a, b) => a[2] - b[2]);
      let left = missing.length;
      for (const [cx, cy, d] of missing) {
        if (d >= 0 && budget <= 0) break;
        live.set(`${cx},${cy}`, { cx, cy, item: make(cx, cy) });
        if (d >= 0) budget--;
        left--;
      }
      done = left ? '' : range; // out of budget: some chunks are still missing, so look again next frame
      if (!left) full = [x0, x1, y0, y1];
      return budget;
    },
  };
}
