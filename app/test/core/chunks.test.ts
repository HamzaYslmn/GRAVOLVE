// node test/core/chunks.test.ts: chunk streaming under a tight budget: on-screen chunks always load at once, the rest
// nearest the focus first, and a fast flight across a big view never leaves a hole on screen.
import assert from 'node:assert/strict';
import { chunkSet } from '../../src/core/chunks.ts';

// One frame, budget 2: a 3×3 screen in a 9×9 range loads all 9 on-screen chunks plus the 2 nearest the focus.
{
  const order: string[] = [], set = chunkSet((cx, cy) => order.push(`${cx},${cy}`), () => {});
  set.update(0, 8, 0, 8, 0, 2, { screen: [3, 5, 3, 5], x: 7, y: 4 });
  assert.equal(order.length, 11);
  for (let x = 3; x <= 5; x++) for (let y = 3; y <= 5; y++) assert.ok(order.includes(`${x},${y}`), `screen chunk ${x},${y}`);
  const [fx, fy] = order[10].split(',').map(Number);
  assert.ok(order[9] === '7,4' && Math.abs(fx - 7) + Math.abs(fy - 4) === 1, `nearest the focus ahead first: ${order.slice(9)}`);
  set.update(0, 8, 0, 8, 0, Infinity, { screen: [3, 5, 3, 5], x: 7, y: 4 });
  assert.equal(set.live.size, 81, 'the rest loads on later frames');
}
// A fast flight: the view (13×9 chunks) moves 3 chunks a frame with a budget of 4; no on-screen chunk is ever missing.
{
  const set = chunkSet((cx, cy) => `${cx},${cy}`, () => {});
  let holes = 0;
  for (let f = 0; f < 200; f++) {
    const x = 3 * f, screen: [number, number, number, number] = [x - 6, x + 6, -4, 4];
    set.update(x - 9, x + 12, -7, 7, 1, 4, { screen, x: x + 3, y: 0 });
    for (let cx = screen[0]; cx <= screen[1]; cx++) for (let cy = -4; cy <= 4; cy++) if (!set.live.has(`${cx},${cy}`)) holes++;
  }
  assert.equal(holes, 0, 'no holes on screen');
}
// Away and back (chunks released, then wanted again) with budgets that run out: every chunk in range ends up live, and
// nothing outside range + keep stays loaded.
{
  const set = chunkSet((cx, cy) => `${cx},${cy}`, () => {});
  const path = [0, 3, 6, 30, 33, 2, 1, 0, -20, 0, 0, 0, 0];
  for (const x of path) set.update(x - 5, x + 5, -3, 3, 1, 6, { screen: [x - 2, x + 2, -1, 1], x, y: 0 });
  for (let i = 0; i < 20; i++) set.update(-5, 5, -3, 3, 1, 6);
  for (let cx = -5; cx <= 5; cx++) for (let cy = -3; cy <= 3; cy++) assert.ok(set.live.has(`${cx},${cy}`), `back home: ${cx},${cy}`);
  for (const c of set.live.values()) assert.ok(c.cx >= -6 && c.cx <= 6 && c.cy >= -4 && c.cy <= 4, `stale ${c.cx},${c.cy}`);
}
console.log('chunks ok');
