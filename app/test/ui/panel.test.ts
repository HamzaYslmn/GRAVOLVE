// node test/ui/panel.test.ts: the composition bar's segment widths (src/ui/panel.ts widths): every shown element keeps
// icon · value, the biggest shares get their names while there is room, the rest goes by share.
import assert from 'node:assert/strict';
import { fit, widths } from '../../src/ui/panel.ts';

type Part = [number, string, string];
const levels = (px: number, parts: Part[]) => widths(px, parts).map((w, i) => fit(w, parts[i][1], parts[i][2]));
const total = (px: number, parts: Part[]) => widths(px, parts).reduce((a, b) => a + b, 0);

// The screenshot: Rock hogged the bar, Metal showed only an icon, Rad was invisible (asteroid/hud.ts ELEMENTS order).
// Bars: your card 232 px, the target card 200 px (asteroid/hud.ts MIX_ME, MIX_TARGET); labels 10 px with 12 px icons.
const shot: Part[] = [[0.08, 'Metal', '8%'], [0.56, 'Rock', '56%'], [0.24, 'Water', '24%'], [0.108, 'Gas', '11%'], [0.012, 'Rad', '1%']];
assert.ok(Math.abs(total(232, shot) - 228) < 1e-9, `your card fills 232 px less 4 gaps: ${total(232, shot)}`);
assert.deepEqual(levels(232, shot), [2, 3, 3, 2, 2], 'your card: Rock and Water named; Metal, Gas and Rad icon · value');
assert.ok(fit(widths(232, shot)[4], 'Rad', '1%') >= 2, `Rad keeps icon · value: ${widths(232, shot)[4]}`);
assert.ok(Math.abs(total(200, shot) - 196) < 1e-9, `the target card fills 200 px less 4 gaps: ${total(200, shot)}`);
assert.deepEqual(levels(200, shot), [2, 3, 2, 2, 2], 'target card: only Rock named, the rest icon · value');

// Worst case: one dominant element and four traces still all show icon · value.
const worst: Part[] = [[0.003, 'Metal', '0.7%'], [0.97, 'Rock', '97%'], [0.007, 'Water', '0.7%'], [0.007, 'Gas', '0.7%'], [0.007, 'Rad', '0.7%']];
assert.ok(levels(200, worst).every((k) => k >= 2), `every trace keeps its value: ${levels(200, worst)}`);
assert.equal(total(200, worst), 196);
// A narrower bar than the values need: the smallest share keeps only its icon, so no label is cut.
assert.deepEqual(levels(176, worst), [1, 2, 2, 2, 2], 'too narrow: the smallest trace shows its icon only');
assert.equal(total(176, worst), 172);

// One element takes the whole bar.
assert.deepEqual(widths(232, [[1, 'Rock', '100%']]), [232]);
