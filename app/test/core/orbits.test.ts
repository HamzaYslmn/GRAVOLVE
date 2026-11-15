// Run: node test/core/orbits.test.ts (part of npm test). Kinematic orbits: same place at 30 and 240 fps, thrust never strips a moon.
import assert from 'node:assert/strict';
import { motion, step } from '../../src/core/entity.ts';
import { bound, breaks, capture, circular, matchQuality, matchStep, place, relVelocity, slotRadius, stepOrbit, type Orbit } from '../../src/core/orbits.ts';

const MU = 4e5; // any host pull: G_WORLD · pull mass
const R = 60;

// Same path at 30 and 240 fps: a moon caught at 1.7 slot radii springs in while it turns, then a guard steers it
// half way round at a capped rate. Host flies with full thrust and no drag (the player).
function run(fps: number) {
  const host = motion(0, 0, 900, 0), o: Orbit = capture(1.7 * slotRadius(R, 0), 0, 0, 30, slotRadius(R, 0));
  const dt = 1 / fps;
  let worst = 0;
  for (let i = 0; i < 6 * fps; i++) {
    step(host, { x: i < 3 * fps ? 1 : -0.3, y: 0.5 }, dt);
    stepOrbit(o, MU, dt, i >= 4 * fps ? { to: -2.5, rate: 1.5 } : undefined);
    const p = place(o, host.x, host.y);
    if (i > 2 * fps) worst = Math.max(worst, Math.abs(Math.hypot(p.x - host.x, p.y - host.y) - slotRadius(R, 0)));
  }
  return { o, host, p: place(o, host.x, host.y), worst };
}
const a = run(30), b = run(240);
assert.ok(Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) < 1e-6 * Math.hypot(b.p.x, b.p.y), `30 vs 240 fps: ${a.p.x},${a.p.y} vs ${b.p.x},${b.p.y}`);
assert.ok(Math.abs(a.o.angle - b.o.angle) < 1e-9, `angle ${a.o.angle} vs ${b.o.angle}`);
// Thrust never strips a moon: after the spring settles the moon stays on its slot however the host accelerates (900 u/s²).
assert.ok(a.worst < 1e-3 * R, `left its slot by ${a.worst}`);

// Its own orbital motion never breaks it; a kick to escape speed does.
const o = capture(slotRadius(R, 1), 0, 0, 1, slotRadius(R, 1)), v = relVelocity(o, MU), vc = circular(MU, o.dist);
assert.ok(Math.abs(Math.hypot(v.x, v.y) - vc) < 1e-9 && !breaks(MU, o.dist, v.x, v.y), 'circular speed is not escape');
assert.ok(breaks(MU, o.dist, v.x + 0.5 * vc, v.y + 0.5 * vc), 'a hard kick frees it');

// Capture by match: quality 1 at rest, 0.75 at half the window, 0 at and past it; the ring fills in exactly `hold` at a
// perfect match at 30 and 240 fps, drains in `drain`, and never leaves 0..1.
assert.equal(matchQuality(0, 2), 1);
assert.ok(Math.abs(matchQuality(1, 2) - 0.75) < 1e-12);
assert.equal(matchQuality(2, 2), 0);
assert.equal(matchQuality(5, 2), 0);
const fill = (fps: number) => { let p = 0, n = 0; while (p < 1) [p, n] = [matchStep(p, 1, 1 / fps, 1.5, 0.5), n + 1]; return n / fps; };
assert.ok(Math.abs(fill(30) - 1.5) < 1e-9 && Math.abs(fill(240) - 1.5) < 1e-9, `fills in ${fill(30)} / ${fill(240)} s`);
let drain = 1, dn = 0;
while (drain > 0) [drain, dn] = [matchStep(drain, 0, 1 / 240, 1.5, 0.5), dn + 1];
assert.ok(Math.abs(dn / 240 - 0.5) < 1e-9, `drains in ${dn / 240} s`);
assert.ok(matchStep(0, 0, 1, 1.5, 0.5) === 0 && matchStep(0.9, 1, 1, 1.5, 0.5) === 1, 'clamped to 0..1');
const d = 3 * R, c = circular(MU, d);
assert.ok(bound(MU, d, 0, 0, 1.4 * c) && !bound(MU, d, 0, 0, 1.42 * c), 'bound below escape speed (√2 × circular)');

// Slots: the first 1.4 R off your surface, 1.25 R apart (moon sizes: test/planet/rules.test.ts), the fifth at 7.4 R.
assert.equal(slotRadius(1, 0), 2.4);
assert.ok(Math.abs(slotRadius(1, 4) - 7.4) < 1e-9);
assert.ok(Math.abs(slotRadius(1, 1) - slotRadius(1, 0) - 1.25) < 1e-9, 'slots 1.25 R apart');
console.log(`orbits ok: 30/240 fps match, slot error ${a.worst.toExponential(1)}, circular ${vc.toFixed(1)} u/s at slot 1`);
