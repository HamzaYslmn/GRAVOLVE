// Run: node test/core/entity.test.ts (part of npm test). Motion must not depend on frame rate: same input, same time -> same place.
import assert from 'node:assert/strict';
import { motion, shapeThrust, step, stickThrust } from '../../src/core/entity.ts';

function fly(fps: number) {
  const m = motion(0, 0, 1200, 3);
  const dt = 1 / fps;
  for (let i = 0; i < fps; i++) step(m, { x: 1, y: 0 }, dt); // 1 s full thrust
  for (let i = 0; i < fps; i++) step(m, { x: 0, y: 0 }, dt); // 1 s coasting
  return m;
}

const slow = fly(30), fast = fly(240);
assert.ok(Math.abs(slow.x - fast.x) / fast.x < 1e-6, `30 vs 240 fps drift: ${slow.x} vs ${fast.x}`);
const top = motion(0, 0, 1200, 3);
for (let i = 0; i < 600; i++) step(top, { x: 1, y: 0 }, 1 / 60);
assert.ok(Math.abs(top.vx - 400) < 5, `top speed should settle at accel/drag = 400, got ${top.vx}`);
assert.ok(fast.vx < 25, 'should glide nearly to a stop after 1 s without thrust');
// Shaped thrust: forward fades to nothing at the top speed, braking is stronger, sideways untouched.
const at = (f: number) => shapeThrust({ x: 1, y: 0 }, f * 100, 0, 100, 1.5).x;
assert.ok(at(0.5) > 0.7 && at(1) === 0 && at(2) === 0, `forward fade: ${at(0.5)} ${at(1)}`);
assert.equal(shapeThrust({ x: -1, y: 0 }, 50, 0, 100, 1.5).x, -1.5);
const turn = shapeThrust({ x: 0, y: 1 }, 150, 0, 100, 1.5);
assert.ok(turn.x === 0 && turn.y === 1, `sideways: ${turn.x} ${turn.y}`);
// No drag (the player): same place at 30 and 240 fps, coasting keeps the speed exactly, no top speed.
const space = (fps: number) => {
  const m = motion(0, 0, 100, 0);
  for (let i = 0; i < 3 * fps; i++) step(m, { x: i < 2 * fps ? 1 : 0, y: 0 }, 1 / fps); // 2 s thrust, 1 s coast
  return m;
};
const s30 = space(30), s240 = space(240);
assert.ok(Math.abs(s30.x - s240.x) < 1e-6 && Math.abs(s30.vx - 200) < 1e-9 && Math.abs(s30.x - 400) < 1e-6, `drag 0: ${s30.x} ${s240.x} ${s30.vx}`);
assert.equal(shapeThrust({ x: 1, y: 0 }, 1e6, 0, Infinity, 1).x, 1); // top = Infinity: forward thrust is never faded
// Touch stick: the stick sets a wanted velocity (top · tilt²); thrust (≤ full) closes the gap, no drag.
const ACC = 500, TOP = 2300; // the start-size player: 500 u/s², top ~72 own D/s of 32 u
const stick = (sx: number, sy: number, vx: number, vy: number, s: number, fps = 60) => {
  const m = motion(0, 0, ACC, 0);
  [m.vx, m.vy] = [vx, vy];
  for (let i = 0; i < s * fps; i++) step(m, stickThrust({ x: sx, y: sy }, m.vx, m.vy, TOP, ACC), 1 / fps);
  return m;
};
const full = stick(1, 0, 0, 0, 8), half = stick(0.5, 0, 0, 0, 4), stop = stick(0, 0, 800, 0, 3), drift = stick(0, -0.5, 600, 0, 3);
assert.ok(Math.abs(full.vx - TOP) < 0.02 * TOP, `full tilt settles at top: ${full.vx}`);
assert.ok(Math.abs(half.vx - TOP / 4) < 0.02 * TOP, `half tilt: a quarter of top (fine control near the centre): ${half.vx}`);
assert.ok(Math.hypot(stop.vx, stop.vy) < 5, `a still finger at the centre brakes to a stop: ${stop.vx}`);
assert.ok(Math.abs(drift.vx) < 5 && Math.abs(drift.vy + TOP / 4) < 10, `sideways drift braked off, now flying up the stick: ${drift.vx} ${drift.vy}`);
assert.ok(Math.abs(stick(0.7, 0.3, 300, 0, 3, 30).x - stick(0.7, 0.3, 300, 0, 3, 240).x) < 0.01 * stick(0.7, 0.3, 300, 0, 3, 240).x, 'stick: 30 vs 240 fps');
console.log(`motion ok: 30fps x=${slow.x.toFixed(1)}, 240fps x=${fast.x.toFixed(1)}, top speed ${top.vx.toFixed(1)}; stick: full ${full.vx.toFixed(0)}, half ${half.vx.toFixed(0)} u/s, stops from 800 u/s in 3 s`);
