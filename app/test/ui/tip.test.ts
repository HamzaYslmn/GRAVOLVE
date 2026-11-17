// node test/ui/tip.test.ts: the tooltip's hit rule (src/ui/pick.ts pick, used by ui/tip.ts): among the rects
// under the point the deepest wins, a tie at the same depth goes to the later one (drawn on top); edges count.
import assert from 'node:assert/strict';
import { pick, type TipRect } from '../../src/ui/pick.ts';

const r = (x: number, y: number, w: number, h: number, depth: number): TipRect => ({ x, y, w, h, depth });

// A card's section (depth 0), a row in it (1), the row's value (2): the innermost under the point wins, whatever the order.
const nest = [r(0, 0, 300, 100, 0), r(10, 10, 280, 16, 1), r(200, 10, 90, 16, 2)];
assert.equal(pick(nest, 250, 18), 2, 'over the value: the value');
assert.equal(pick(nest, 50, 18), 1, 'over the row, off the value: the row');
assert.equal(pick(nest, 50, 60), 0, 'in the section, under no row: the section');
assert.equal(pick([nest[2], nest[0], nest[1]], 250, 18), 0, 'listed out of order: still the deepest');

// Misses: outside every rect, or no rects.
assert.equal(pick(nest, 301, 50), -1, '1 px right of the section');
assert.equal(pick(nest, -1, 50), -1, '1 px left of the section');
assert.equal(pick([], 5, 5), -1, 'nothing to hit');
assert.equal(pick(nest, 300, 100), 0, 'the far corner counts');

// Overlapping siblings at the same depth: the later one wins (bar segments that touch, a value laid over its label).
const segs = [r(0, 0, 50, 14, 1), r(50, 0, 50, 14, 1)];
assert.equal(pick(segs, 50, 7), 1, 'on the shared edge: the later segment');
assert.equal(pick(segs, 49, 7), 0);
const over = [r(0, 0, 100, 16, 1), r(60, 0, 40, 16, 1)];
assert.equal(pick(over, 80, 8), 1, 'overlap: the later sibling');
// A deeper rect earlier in the list still beats a shallower later one.
assert.equal(pick([r(0, 0, 20, 20, 3), r(0, 0, 100, 100, 1)], 10, 10), 0, 'deeper beats later');

// A hidden element (ui/tip.ts gives it a -1 box) is never hit.
assert.equal(pick([r(-1, -1, -1, -1, 5), r(0, 0, 10, 10, 0)], 0, 0), 1, 'a hidden rect never wins');
assert.equal(pick([r(-1, -1, -1, -1, 5)], -1, -1), -1);
