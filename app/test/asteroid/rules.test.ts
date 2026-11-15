// Run: node test/asteroid/rules.test.ts. The doc's example (150 start dust vs 400 metallic), then the
// collision regimes at a 795k player.
import assert from 'node:assert/strict';
import { shapeThrust } from '../../src/core/entity.ts';
import { K_PER_HEAT, kelvin } from '../../src/core/water.ts';
import { HIT_MIN, SHIELD_K, shieldMeet, type Shield } from '../../src/evolution/civilization/rules.ts';
import { bakes, BURN_MAX, burnShare, COMP, collide, pieceShares, SPREAD, GIANT_HIT, gravitates, pairPull, MAX_HEAT, MOLTEN, worldHeat, worldOpts, contactTime, shellContact, shellPass, shellSees, V_STICK, critSpeed, damage, DEATH_D, durability, heatCap, impactHeat as hitHeat, mergeHeat, TOP, hardness, impactHeat, massOf, need, reachGround, radiusOf, R_CAP, density, roundR, roundShape, START_R, type CollideOpts, type Comp, type Phys } from '../../src/evolution/asteroid/rules.ts';

const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
// Collision numbers below use the loose radius (the size cap, checked further down, only touches planets).
const P = (m: number, comp: Comp, more: Partial<Phys> = {}): Phys => ({ m, comp, r: 4 * Math.cbrt((3 * m) / density(comp)), ...more });
const R = (p: Phys) => p.r ?? radiusOf(p.m, p.comp);
/** `a` hits `b` at `v` of a's diameters/s, head-on, or at impact angle sine `b` (sliding share). */
const hit = (a: Phys, b: Phys, v: number, o: CollideOpts = {}, sin = 0) => {
  const w = v * 2 * R(a);
  return collide(a, b, w * Math.sqrt(1 - sin * sin), w * sin, o);
};
const you = P(150, COMP.dust), metal400 = P(400, COMP.metallic);
const me = { player: true };

// Lighter and slow: the heavier body swallows you (the stick speed is in ITS diameters: 8 of them ≈ 8.9 of yours here).
assert.equal(hit(you, metal400, 6, me).kind, 'eaten');
// Lighter and medium or fast: the player is never partly accreted, it bounces (and chips).
assert.equal(hit(you, metal400, 20, me).kind, 'bounce');
assert.equal(hit(you, metal400, 20).kind, 'accrete'); // a rock in your place would be: the heavier keeps part of it
// The player margin: a slightly heavier body (< 1.15×) merges into you, the same as an equal one; 1.2× swallows you.
assert.equal(hit(you, P(160, COMP.dust), 6, me).kind, 'eat');
assert.equal(hit(you, P(150, COMP.dust), 6, me).kind, 'eat');
assert.equal(hit(you, P(180, COMP.dust), 6, me).kind, 'eaten');
// Molten bodies stick at higher speed (×1.5).
assert.equal(hit(metal400, P(40, COMP.dust), 10).kind, 'accrete');
assert.equal(hit(metal400, P(40, COMP.dust), 10, { stick: 12 }).kind, 'eat');
assert.equal(hit(metal400, P(40, COMP.dust), 10, { repel: true }).kind, 'bounce'); // a repelled hit never feeds anything (a solid world bounces small bodies)
assert.equal(hit(metal400, P(40, COMP.dust), 2, { repel: true }).kind, 'bounce');

// Heavier and slow: a whole merge, nothing lost.
const slow = hit(metal400, you, 6);
assert.equal(slow.kind, 'eat');
near(slow.a.rest + slow.b.rest, 550, 1e-9);

// Heavier but rough (between v_m and 3·v_m): partial accretion. Most of the meal flies off, some of it as pieces.
const rough = hit(metal400, P(40, COMP.dust), 14);
assert.equal(rough.kind, 'accrete');
near(rough.xi, (24 - 14) / 16, 1e-9);
assert.ok(rough.b.rest < 40 * 0.5, `rough meal kept ${rough.b.rest}`);
assert.ok(rough.b.pieces > 0 && rough.b.pieces < 40 - rough.b.rest, 'some of the loss is collectable');

// Very fast (≥ 3·v_m): nobody keeps anything.
assert.equal(hit(metal400, P(40, COMP.dust), 30).kind, 'bounce');

// A 795k player (radius 418) against stony bodies, head-on unless said.
const big = P(795658, COMP.dust, { r: 418 }), D = 2 * 418;
const peer = P(big.m, COMP.stony);
/** Speed (player diameters/s) at which f(v) reaches `goal`; f grows with v. */
const reach = (f: (v: number) => number, goal: number) => {
  let lo = 0, hi = 1e4;
  for (let i = 0; i < 80; i++) [lo, hi] = f((lo + hi) / 2) < goal ? [(lo + hi) / 2, hi] : [lo, (lo + hi) / 2];
  return lo;
};
// The lighter body takes the hit in its own diameters: a 2.2% body splashes (d = 1) at ~6.1, a 10% one at ~12.6 of yours.
const splash = (g: number) => { const t = P(big.m * g, COMP.stony); return reach((v) => damage(t, big, (v * D) / (2 * R(t))), 1); };
const s2 = splash(0.022), s10 = splash(0.1);
near(s2, 6.1, 0.1); near(s10, 12.6, 0.1);
// Against a peer you chip (d 0.3) at ~36, shatter (d 1) at ~66, are destroyed (d 5) at ~148 diameters/s.
const yours = (v: number) => hit(big, peer, v, me).a.d;
const chip = reach(yours, 0.3), shatter = reach(yours, 1), dead = reach(yours, 5);
near(chip, 36.3, 0.5); near(shatter, 66.3, 0.5); near(dead, 148.2, 0.5);
// A peer at 30 diameters/s costs you ~6% and it ~7%; at 60, ~40% and ~46% (bounce: both chip).
const lost = (v: number) => { const o = hit(big, peer, v, me); assert.equal(o.kind, 'bounce'); return [1 - o.a.rest / big.m, 1 - o.b.rest / peer.m]; };
const [y30, p30] = lost(30), [y60, p60] = lost(60);
near(y30, 0.058, 0.005); near(p30, 0.075, 0.005); near(y60, 0.40, 0.01); near(p60, 0.465, 0.01);
// Grazing: b = 0.9 > b_crit 0.5 at 30 diameters/s is hit-and-run; b = 0.4 is a hit.
assert.equal(hit(big, peer, 30, me, 0.9).kind, 'graze');
assert.equal(hit(big, peer, 30, me, 0.4).kind, 'bounce');
// A 10% body: whole merge below 8, partial accretion 8..24 (ξ 1 → 0), bounce above; either side can break.
const t10 = P(big.m * 0.1, COMP.stony);
assert.equal(hit(big, t10, 7.9, me).kind, 'eat');
const a12 = hit(big, t10, 12, me);
assert.equal(a12.kind, 'accrete'); near(a12.xi, 0.75, 1e-9);
assert.equal(hit(big, t10, 24, me).kind, 'bounce');
assert.ok(hit(big, t10, 30, me).b.d >= 5, 'a fast 10% body is destroyed, not just you');
// A crumb (0.1%) hitting a planet above 3·v_m is blown apart (d ≥ DEATH_D).
assert.ok(hit(big, P(big.m * 1e-3, COMP.stony), 30, me).b.d >= 5);
// Heavier bodies: 1.2× swallows you below its stick speed, 1.1× merges into you; a 10× body is a well (eats at 10 of yours).
assert.equal(hit(big, P(big.m * 1.2, COMP.stony), 4, me).kind, 'eaten');
assert.equal(hit(big, P(big.m * 1.1, COMP.stony), 4, me).kind, 'eat');
assert.equal(hit(big, P(big.m * 10, COMP.stony), 10, me).kind, 'eaten');
// The start: a 0.1× meal at 5 diameters/s is a full merge.
const s0 = P(massOf(START_R, COMP.dust), COMP.dust), start = hit(s0, P(0.1 * s0.m, COMP.stony), 5, me);
assert.equal(start.kind, 'eat'); near(start.b.rest, 0.1 * s0.m, 1e-9);

// Swept contact: a body 100 of your diameters/s at 30 fps steps 3.3 diameters a frame and would skip a 2%
// body (radius 0.27 of yours) sitting in its path; the sweep finds the first touch inside the step.
{
  const r = 418, rr = r + 0.27 * r, step = (100 * 2 * r) / 30;
  near(contactTime(-step / 2, 0, -step, 0, rr), (step / 2 - rr) / step, 1e-9); // passed right through it: touched at the front
  assert.equal(contactTime(-(step / 2), 2 * rr, -step, 0, rr), -1); // passed beside it: no hit
  assert.equal(contactTime(rr * 0.5, 0, -1, 0, rr), -1); // touching at the start: the broadphase has it
  assert.equal(contactTime(3 * rr, 0, 1, 0, rr), -1); // moving apart
}
// Shield shell (shellContact, shellPass; civilization/rules.ts shieldMeet): met at the contact distance, before the ground,
// at any frame rate; a held body leaves, a broken one goes on lighter and slower.
{
  const c = shellContact(5, 0, -15, 0, 10, 0.1)!; // from 20 to 5 off a shell at 10
  near(Math.hypot(c.x, c.y), 10, 1e-9); near(c.nx, 1, 1e-12); near(c.vn, 150, 1e-9);
  const o = shellContact(3, 4, -9, -12, 10, 1 / 30)!;
  near(Math.hypot(o.x, o.y), 10, 1e-9); // the contact distance, off any line
  assert.ok(!shellContact(5, 0, -1, 0, 10, 0.1) && !shellContact(25, 0, 5, 0, 10, 0.1) && !shellContact(5, 30, -15, 0, 10, 0.1), 'inside at the start, moving out, or missing: no meeting');
  assert.deepEqual(shellPass(1, 5), [1, -5]); // held: thrown back whole
  const [keep, vn] = shellPass(0.4, 5);
  near(keep, 0.6, 1e-12); near(vn, 3, 1e-12); // broken: what is left goes on, slower
  // A plain-object fall through a shell at 30 and 120 fps: a world at the origin (R 10, stick speed 160 u/s), shell at 12;
  // a 5% body at the stick speed from 40 away, slightly off-line. Constant velocity: the same meeting exactly; under a
  // central pull, within 2%.
  const R = 10, vs = V_STICK * 2 * R, rr = 12;
  const fall = (fps: number, mu: number, q0: number) => {
    const sh: Shield = { level: 1, s: 30 }, dt = 1 / fps, b = { x: 40, y: 3, vx: -vs, vy: 0, q: q0 };
    let met: { r: number; s: number; q: number; k: number } | undefined, closest = Infinity;
    for (let t = 0; t < 1.5; t += dt) {
      const d = Math.hypot(b.x, b.y);
      [b.vx, b.vy] = [b.vx - (mu * b.x) / d ** 3 * dt, b.vy - (mu * b.y) / d ** 3 * dt];
      [b.x, b.y] = [b.x + b.vx * dt, b.y + b.vy * dt];
      const m = shellContact(b.x, b.y, b.vx * dt, b.vy * dt, rr, dt);
      if (m) {
        const k = shieldMeet(sh, 1000, b.q, m.vn / vs);
        if (k) {
          const [kp, v2] = shellPass(k, m.vn);
          [b.q, b.vx, b.vy, b.x, b.y] = [b.q * kp, b.vx + m.nx * (m.vn - v2), b.vy + m.ny * (m.vn - v2), m.x * 1.001, m.y * 1.001];
          met ??= { r: Math.hypot(m.x, m.y), s: sh.s, q: b.q, k };
        }
      }
      if (met?.k === 1) closest = Math.min(closest, Math.hypot(b.x, b.y));
    }
    return { ...met!, closest };
  };
  for (const q of [0.05, 0.01]) {
    const [a, b] = [fall(30, 0, q), fall(120, 0, q)];
    near(a.r, rr, 1e-9); near(b.r, rr, 1e-9); near(a.s, b.s, 1e-9); near(a.q, b.q, 1e-12);
    const [g, h] = [fall(30, 2e5, q), fall(120, 2e5, q)];
    assert.ok(Math.abs(g.s - h.s) <= 0.02 * 34.5 && Math.abs(g.q - h.q) <= 0.02 * q, `under a pull, 30 vs 120 fps within 2%: ${g.s.toFixed(3)}/${h.s.toFixed(3)} K, ${g.q.toFixed(5)}/${h.q.toFixed(5)}`);
    if (q === 0.01) assert.ok(a.k === 1 && a.closest >= rr && b.closest >= rr, 'a held body never comes inside the shell');
    else { assert.ok(a.k < 1, 'a 5% body breaks a full L1'); near(a.q, q * (1 - a.k), 1e-12); } // and goes on lighter
  }
}

// Durability: weak phases cost more than their share; metal is the toughest; looseness weakens.
assert.ok(durability(P(1, { metal: 0.5, gas: 0.5 })) < (2 + 0.1) / 2, 'gas weakens metal more than its share');
assert.ok(durability(P(1, COMP.metallic)) > durability(P(1, COMP.stony)) && durability(P(1, COMP.stony)) > durability(P(1, COMP.icy)));
near(durability(P(1, COMP.stony, { rubble: 1 })), durability(P(1, COMP.stony)) * 0.7, 1e-9);
// Heat softens: molten metal loses 0.4 hardness.
near(hardness(P(1, COMP.metallic)) - hardness(P(1, COMP.metallic, { heat: 6 })), 0.4, 1e-9);

near(radiusOf(massOf(16, COMP.dust), COMP.dust), 16, 1e-9);
// Size cap (stylised scale): nothing but a star passes R_CAP; radius still rises with mass; under 1e5 rock it is within 2%
// of the loose law; mass and radius invert each other.
{ const loose = (m: number, c: Comp) => 4 * Math.cbrt((3 * m) / density(c));
  for (const c of [...Object.values(COMP), { metal: 1 }, { rock: 1 }, { ice: 1 }, { gas: 1 }, { radio: 1 }] as Comp[]) {
    let last = 0;
    for (let m = 1; m <= 1e9; m *= 1.5) {
      const r = radiusOf(m, c);
      assert.ok(r < R_CAP && r > last, `radius ${r} at ${m}`);
      near(massOf(r, c) / m, 1, 1e-6);
      last = r;
    }
  }
  for (let m = 1; m <= 1e5; m *= 2) assert.ok(radiusOf(m, { rock: 1 }) / loose(m, { rock: 1 }) > 0.98, `rock ${m} within 2%`);
  console.log('radius 1e5 / 1e6 / 1e7: habitable', [1e5, 1e6, 1e7].map((m) => radiusOf(m, { rock: 0.55, metal: 0.12, ice: 0.3, gas: 0.03 }).toFixed(0)).join(' / '), '· pure gas', [1e5, 1e6, 1e7].map((m) => radiusOf(m, { gas: 1 }).toFixed(0)).join(' / ')); }

// Impact heat follows speed: a gentle 2% meal at 31.6k barely warms (< 3 K), the same body at 16 diam/s ~50 K.
{ const r = radiusOf(31623, COMP.dust), K = (s: number, v: number) => impactHeat(s / (1 + s), v, 8, r) * K_PER_HEAT;
  assert.ok(K(0.02, 1.5) < 3 && K(0.02, 16) > 40 && K(0.1, 1.5) < 30, `heat ${K(0.02, 1.5)} ${K(0.02, 16)} ${K(0.1, 1.5)}`); }
// Shape: stony bodies are irregular until ~8,200 mass, icy ones round by ~1,100, metal stays irregular past M_MAX; molten rounds anything.
const roundAt = (c: Comp) => massOf(roundR(c), c);
near(roundAt(COMP.stony), 8201, 5); near(roundAt(COMP.icy), 1099, 5); assert.ok(roundAt(COMP.metallic) > 1e4);
assert.ok(roundShape(radiusOf(1000, COMP.stony), COMP.stony) < 0.01 && roundShape(radiusOf(1000, COMP.stony), COMP.stony, 1) === 1);
// Atmosphere shield: burn-up share at 0.24 / 1 / 4 atm = 0.2% / 0.4% / 0.8% of your mass, capped at 10 atm;
// between s_b and 4·s_b part of it lands, past 4·s_b all of it; no air, no shield.
near(burnShare(0.24), 0.00196, 1e-5); near(burnShare(1), 0.004, 1e-12); near(burnShare(4), 0.008, 1e-12); near(burnShare(50), burnShare(10), 1e-12);
assert.ok(reachGround(0.0039, burnShare(1)) === 0 && reachGround(0.016, burnShare(1)) === 1 && reachGround(0.01, 0) === 1);
near(reachGround(0.01, burnShare(1)), 0.5, 1e-9); // 1% of you through 1 atm: half of it lands
{ const sb = burnShare(1), r = radiusOf(1, COMP.dust); // a 0.4% rock is 16% of your radius
  near(radiusOf(sb, COMP.dust) / r, 0.159, 1e-3); }
// Top speed (user, 2026-11-13): critSpeed is the speed at which a head-on hit on a body like you destroys you, so it
// differs per body (tougher, heavier: faster); TOP × it caps thrust. Full thrust reaches the critical speed, never the top.
const crits: string[] = [];
for (const [m, c] of [[69, COMP.dust], [1e3, COMP.stony], [3.16e4, COMP.stony], [1e5, COMP.icy], [1e6, COMP.stony]] as const) {
  const p = P(m, c), v = critSpeed(p);
  near(v, reach((u) => damage(p, P(m, c), u), DEATH_D), 0.01 * v);
  const acc = (500 * (R(p) / START_R) ** 0.4) / (2 * R(p)); // player.ts thrustOf at this size, own diameters/s²
  let u = 0, reached = -1;
  for (let t = 0; t < 400; t += 1 / 60) {
    u += (shapeThrust({ x: 1, y: 0 }, u || 1e-9, 0, TOP * v, 1).x * acc) / 60;
    if (reached < 0 && u >= v) reached = t;
  }
  assert.ok(reached > 0 && u < TOP * v, `${m}: reaches its critical speed and stays under the top (${u.toFixed(0)} < ${(TOP * v).toFixed(0)})`);
  crits.push(`${m} ${v.toFixed(0)} D/s in ${reached.toFixed(0)} s`);
}
assert.ok(critSpeed(P(1e5, COMP.icy)) < critSpeed(P(1e5, COMP.stony)) && critSpeed(P(1e3, COMP.stony)) < critSpeed(P(1e6, COMP.stony)), 'ice is weaker, mass is tougher');
console.log(`top speed ok: critical ${crits.join(', ')}; top = ${TOP}× it`);
// Swallowing (user, 2026-11-14): each side brings capacity × mass × heat, the hit's heat is added once; energy is kept.
{
  const you = P(1000, COMP.dust, { heat: 1 }), q = hitHeat(0.01, 4, 8, 40); // a slow 1% meal
  const ice = P(10, COMP.icy, { heat: 0 }), rock = P(10, COMP.stony, { heat: 0 }), warm = P(10, COMP.icy, { heat: 2 });
  const after = (meal: Phys, add = 0) => mergeHeat(you, meal, add);
  const E = (b: Phys) => heatCap(b.comp) * b.m * (b.heat ?? 0);
  near(after(ice, q) * (heatCap(you.comp) * you.m + heatCap(ice.comp) * ice.m), E(you) + heatCap(you.comp) * you.m * q + E(ice), 1e-9); // conserved
  assert.ok(after(ice, q) < you.heat!, 'a cold ice meal cools a warm body, impact and all');
  assert.ok(after(ice) < after(rock), 'ice (high heat capacity) cools more than rock of the same mass');
  assert.ok(after(warm) > you.heat!, 'a hotter meal warms you');
  near(mergeHeat(P(5, COMP.icy, { heat: 0.7 }), P(5, COMP.metallic, { heat: 0.7 })), 0.7, 1e-12); // equal heats stay put
  assert.ok(mergeHeat(you, ice, hitHeat(0.01, 30, 8, 40)) > you.heat!, 'a fast hit still heats you');
  console.log(`swallow heat ok: a 1% ice meal at 120 K takes a 550 K body to ${kelvin(after(ice, q)).toFixed(0)} K, rock to ${kelvin(after(rock, q)).toFixed(0)} K`);
}
console.log(`burn-up ok: shares ${[0.24, 1, 4, 10].map((p) => (100 * burnShare(p)).toFixed(2) + '%').join(' / ')} at 0.24 / 1 / 4 / 10 atm; a 1% rock through 1 atm lands ${(100 * reachGround(0.01, burnShare(1))).toFixed(0)}%`);
// Age II (rules.ts worldOpts): a solid world bounces a slow 1% body (no loss to you), a molten one eats it; a body too big
// to be a moon (GIANT_HIT) merges and melts the world (~+4000 K at the moon limit); either body molten merges, rival worlds included.
{
  const solid: Phys = { m: 1e5, comp: COMP.stony, heat: 0.4 }, molten: Phys = { ...solid, heat: MOLTEN + 0.5 }, slow = 0.1, rock = (s: number): Phys => ({ m: s * 1e5, comp: COMP.stony });
  const small = collide(solid, rock(0.01), slow, 0, worldOpts(solid, rock(0.01)));
  const hot = collide(molten, rock(0.01), slow, 0, worldOpts(molten, rock(0.01)));
  const theia = collide(solid, rock(GIANT_HIT), slow, 0, worldOpts(solid, rock(GIANT_HIT)));
  assert.ok(small.kind === 'bounce' && small.a.rest === 1e5 && hot.kind === 'eat', 'a slow 1% body bounces off a solid world and merges into a molten one');
  assert.ok(theia.kind === 'eat' && K_PER_HEAT * theia.a.heat > 3500 && solid.heat! + theia.a.heat > MOLTEN, `giant impact merges and melts: +${(K_PER_HEAT * theia.a.heat).toFixed(0)} K`);
  const rival: Phys = { m: 0.47e5, comp: COMP.stony, heat: 0.4 }, hotRock: Phys = { ...rock(0.01), heat: MOLTEN + 1 };
  assert.ok(collide(molten, rival, slow, 0, worldOpts(molten, rival)).kind === 'eat' && !worldOpts(molten, rival).repel, 'a molten world eats a slow rival world');
  assert.ok(!worldOpts(solid, hotRock).repel && !worldOpts({ ...solid, m: 1e3 }, rock(0.01)).repel, 'a molten impactor merges too; Age I is untouched');
  // The scale (user: by mass, size and speed): slow hits +8 K at 0.2%, ~90 K at 1%, ~1000 K at 5% (a moon melts the
  // surface past ~6%), 4000 K at the moon limit; 3× the stick speed is 9× the heat. Only bodies under BURN_MAX burn up.
  const K = (q: number, v = 1) => K_PER_HEAT * worldHeat(q, v);
  assert.ok(K(0.002) < 10 && K(0.01) > 80 && K(0.01) < 100 && K(0.05) > 900 && Math.abs(K(GIANT_HIT) - 4000) < 1 && Math.abs(K(0.01, 3) - 9 * K(0.01)) < 1e-6);
  assert.ok(BURN_MAX <= 0.01 && 4 * burnShare(10) > BURN_MAX, 'thick air no longer burns up moons');
  console.log(`world impact heat: ${[0.002, 0.01, 0.02, 0.05, 0.1, GIANT_HIT].map((q) => `${q * 100}% +${K(q).toFixed(0)} K`).join(', ')} (slow; × (v / v_stick)² faster)`);
  console.log(`giant impact ok: a ${GIANT_HIT * 100}% body adds ${(K_PER_HEAT * theia.a.heat).toFixed(0)} K (capped at ${kelvin(MAX_HEAT).toFixed(0)} K); molten from ${kelvin(MOLTEN)} K`);
}
// Your moon on a rival world (shellSees, field.ts hitWorld): a world's own moons pass its shell, another world's moon
// meets it at the same cost a free body would, and lands by worldOpts (bounce, worldHeat) instead of being eaten.
{
  const own = (b: unknown) => b === rock;
  const rock = { moon: true };
  assert.ok(!shellSees({ moon: true }) && shellSees({ moon: true }, () => false) && !shellSees(rock, own) && shellSees({}), 'your moons pass your shell; with `own`, only its own rock does');
  assert.ok(!shellSees({ pulls: true }, own) && !shellSees({ rival: {} }, own), 'worlds and rival bodies always pass');
  // Your guard (planet/stage.ts) names you and your moons: a rival's rock on its circle meets your shell, yours pass.
  const me = {}, myMoon = { moon: true }, mine = (b: unknown) => b === me || b === myMoon;
  assert.ok(!shellSees(myMoon, mine) && shellSees({ moon: true }, mine), 'your moons pass your shell, a rival rock meets it');
  const s1: Shield = { level: 1, s: SHIELD_K }, s2: Shield = { level: 1, s: SHIELD_K };
  assert.equal(shieldMeet(s1, 1000, 0.05, 1), shieldMeet(s2, 1000, 0.05, 1)); assert.equal(s1.s, s2.s); // a moon pays as a free body
  const W: Phys = { m: 1e4, comp: COMP.stony }, M: Phys = { m: 200, comp: COMP.stony }, V = 0.5 * V_STICK * 2 * radiusOf(W.m, W.comp);
  const old = collide(W, M, V), now = collide(W, M, V, 0, worldOpts(W, M));
  assert.ok(old.kind === 'eat' && now.kind === 'bounce' && K_PER_HEAT * now.a.heat >= HIT_MIN, `a slow 2% moon: was eaten, now bounces and heats the world +${(K_PER_HEAT * now.a.heat).toFixed(0)} K`);
  console.log(`moon on a rival ok: a slow 2% moon bounces and adds ${(K_PER_HEAT * now.a.heat).toFixed(0)} K (was eaten)`);
}
console.log(`rules ok: slow meal ${slow.a.rest.toFixed(0)}+${slow.b.rest.toFixed(0)}, rough meal kept ${rough.b.rest.toFixed(1)} of 40\n` +
  `  795k: 2.2%/10% splash at ${s2.toFixed(1)}/${s10.toFixed(1)} D/s; peer chip ${chip.toFixed(1)}, shatter ${shatter.toFixed(1)}, dead ${dead.toFixed(1)} D/s; ` +
  `peer loss you/it at 30 ${(100 * y30).toFixed(1)}/${(100 * p30).toFixed(1)}%, at 60 ${(100 * y60).toFixed(1)}/${(100 * p60).toFixed(1)}%; 10% at 12 D/s keeps ${(100 * a12.b.rest / t10.m).toFixed(0)}%`);

// Rival recipe hunger: a dry rival wants ice ×3, a metal-poor one metal ×2, one near the gas line shuns gas; a balanced one eats by mass.
{
  const dry = { rock: 0.9, metal: 0.05, ice: 0.03, gas: 0.02 }, ok = { rock: 0.6, metal: 0.15, ice: 0.2, gas: 0.05 }, gassy = { rock: 0.5, metal: 0.15, ice: 0.15, gas: 0.2 };
  assert.ok(need(dry, { ice: 1 }) > 2.9 && need(dry, { rock: 1 }) === 1, `dry rival ${need(dry, { ice: 1 })}`);
  assert.ok(Math.abs(need(dry, { metal: 1 }) - 2) < 1e-9, 'metal-poor rival wants metal ×2');
  assert.equal(need(ok, { ice: 1 }), 1);
  assert.ok(need(gassy, { gas: 1 }) <= 0.21 && need(gassy, { rock: 1 }) === 1, 'near the gas line: gas ×0.2');
  console.log(`rival need ok: dry wants ice ×${need(dry, { ice: 1 }).toFixed(1)}, metal ×${need(dry, { metal: 1 }).toFixed(1)}; near the gas line gas ×${need(gassy, { gas: 1 }).toFixed(1)}`);
}

// Gravity pass (field.ts): a rival civilization world (held, pulls) gravitates; comets (held) and moons do not.
{
  assert.ok(gravitates({ held: true, pulls: true }) && gravitates({}), 'rival worlds and free bodies gravitate');
  assert.ok(!gravitates({ held: true }) && !gravitates({ moon: true }) && !gravitates({ moon: true, held: true, pulls: true }), 'comets, guard moons and moons do not');
  assert.ok(pairPull(4, 2, 3, 1) === 3 && pairPull(1, 0, 2, 4) === 1, 'the stronger pull per unit mass, per pair');
  console.log('gravity pass ok: rival worlds gravitate, comets and moons do not');
}

// Fragments (body.ts burst/lose, field.ts addBody): unequal pieces summing to the whole, largest first; a ship's cut stays
// near equal (s = 0.25: the largest ≤ 1.25 × an equal share). Bakes: a rough body (comet, fragment, caught pile) stays as it is until molten.
{
  for (const s of [0, 0.25, SPREAD]) for (let n = 1; n <= 8; n++) {
    const w = pieceShares(n, s);
    assert.equal(w.length, n);
    assert.ok(Math.abs(w.reduce((a, v) => a + v, 0) - 1) < 1e-12 && w.every((v, i) => v > 0 && (!i || v <= w[i - 1])), `shares ${n}, ${s}`);
    if (n > 1) assert.ok(Math.abs(w[0] / w[n - 1] - (1 + s) / (1 - s)) < 1e-9 && (s !== 0.25 || w[0] <= 1.25 / n + 1e-12));
  }
  assert.deepEqual(pieceShares(1, SPREAD), [1]);
  const icy = radiusOf(69e3, COMP.icy);
  assert.ok(!bakes(69e3, icy, COMP.icy, 0, 1) && bakes(69e3, icy, COMP.icy) && bakes(69e3, icy, COMP.icy, 0.5, 1), 'rough icy 69k: unbaked until molten');
  assert.ok(!bakes(500, radiusOf(500, COMP.icy), COMP.icy) && !bakes(500, radiusOf(500, COMP.icy), COMP.icy, 1), 'nothing under ROUND_M bakes');
  console.log(`fragments ok: ${pieceShares(6, SPREAD).map((v) => (100 * v).toFixed(1)).join('/')}% of the kept mass (6 pieces), largest:smallest ${((1 + SPREAD) / (1 - SPREAD)).toFixed(1)}; rough bodies bake only once molten`);
}
