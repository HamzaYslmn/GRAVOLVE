// Run: node test/civilization/strain.test.ts. Shield strain (rules.ts landIn, shieldStrain; user, 2026-11-17): a world
// closing on your ground breaks the shield with time to flee, under the real pull (asteroid/rules.ts, as field.ts gravity);
// a near miss never strains it.
import assert from 'node:assert/strict';
import { COMP, G_WORLD, pairPull, pullMass, radiusOf, youPull } from '../../src/evolution/asteroid/rules.ts';
import { landIn, shieldStrain, STRAIN } from '../../src/evolution/civilization/rules.ts';

const DT = 1 / 600;
const pair = (M: number, q: number) => {
  const R = radiusOf(M, COMP.stony), m = q * M, r = radiusOf(m, COMP.stony);
  return { R, c: R + r, mu: G_WORLD * pairPull(youPull(M, R), M, pullMass(m, M), m) * (M + m) };
};
/** Two-body fall from offset (x, 0) at velocity (vx, vy): each step `see(t, tau, d)`; returns the closest distance and when it touched. */
function fall(x: number, vx: number, vy: number, c: number, mu: number, see: (t: number, tau: number, d: number) => void) {
  let y = 0, t = 0, min = Infinity;
  for (; t < 60; t += DT) {
    const d = Math.hypot(x, y);
    min = Math.min(min, d);
    if (d <= c) return { min, hit: t };
    see(t, landIn(x, y, vx, vy, c, mu), d);
    const a = mu / (d * d * d);
    [vx, vy] = [vx - a * x * DT, vy - a * y * DT];
    [x, y] = [x + vx * DT, y + vy * DT];
    if (x * vx + y * vy > 0 && d > 20 * c) break; // gone
  }
  return { min, hit: -1 };
}

// The window: from planet-sized to huge worlds, half to twice you, from rest or closing, the break comes 0.5–0.8 s before contact.
{
  const gaps: number[] = [];
  for (const M of [3200, 1e5, 1e6]) for (const q of [0.5, 1.1, 2]) for (const v of [0, 1, 3]) {
    const { R, c, mu } = pair(M, q);
    let crack = -1, broke = -1;
    const { hit } = fall(c + 8 * R, -v * R, 0.05 * R, c, mu, (t, tau) => {
      if (crack < 0 && shieldStrain(tau) < 1) crack = t;
      if (broke < 0 && shieldStrain(tau) === 0) broke = t;
    });
    assert.ok(hit > 0 && broke > 0 && crack >= 0, `M ${M} q ${q} v ${v}: it lands and the shield breaks first`);
    assert.ok(hit - broke >= 0.5 && hit - broke <= 0.8, `M ${M} q ${q} v ${v}: broke ${(hit - broke).toFixed(2)} s before contact`);
    assert.ok(broke - crack >= 0.6, `M ${M} q ${q} v ${v}: cracks show ${(broke - crack).toFixed(2)} s before the break`);
    gaps.push(hit - broke);
  }
  console.log(`strain window ok: the shield breaks ${Math.min(...gaps).toFixed(2)}–${Math.max(...gaps).toFixed(2)} s before a world lands (cracks from ${STRAIN.from} s)`);
}

// A near miss (periapsis 1.05 × contact) never strains; just inside (0.95 ×) it does and lands.
{
  const { R, c, mu } = pair(1e5, 1.1), d0 = c + 6 * R, w = 0.5 * R;
  const tangential = (rp: number) => { // the sideways speed at d0 (radial w) whose orbit's periapsis is rp
    const v2 = (w * w + 2 * mu * (1 / rp - 1 / d0)) * rp * rp / (d0 * d0 - rp * rp); // L = d0·vt, and L² = rp²(vt² + w² + 2mu(1/rp − 1/d0))
    return Math.sqrt(v2);
  };
  let strained = false;
  const miss = fall(d0, -w, tangential(1.05 * c), c, mu, (_t, tau) => void (strained ||= shieldStrain(tau) < 1));
  assert.ok(miss.hit < 0 && miss.min > c && !strained, `a near miss (closest ${(miss.min / c).toFixed(3)} × contact) never strains the shield`);
  let broke = false;
  const close = fall(d0, -w, tangential(0.95 * c), c, mu, (_t, tau) => void (broke ||= shieldStrain(tau) === 0));
  assert.ok(close.hit > 0 && broke, 'a grazing hit breaks it before it lands');
}

// Backing off, touching, no pull.
{
  assert.equal(landIn(10, 0, 1, 0, 4, 5), Infinity, 'leaving: no strain');
  assert.equal(landIn(4, 0, -1, 0, 4, 5), 0, 'touching: 0');
  assert.ok(Math.abs(landIn(10, 0, -2, 0, 4, 0) - 3) < 1e-12, 'no pull: gap / speed');
  assert.equal(landIn(10, 0, 0, 0, 4, 0), Infinity, 'at rest, no pull: never');
  assert.ok(shieldStrain(Infinity) === 1 && shieldStrain(STRAIN.from) === 1 && shieldStrain(STRAIN.to) === 0 && shieldStrain(0) === 0, 'full from 1.5 s, broken at 0.6 s');
}
console.log('strain ok: near misses, backing off and touching');
