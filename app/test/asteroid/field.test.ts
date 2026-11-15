// Run: node test/asteroid/field.test.ts. The asteroid field (field.ts) in Node: Pixi headless, Math.random seeded, three
// seeds of 60 s at 1/30 with a player crossing chunks (Age I, then a gassy Age II world, eaten → follow), the roster alive
// so guard moons are caught. Prints a digest (count, hits, hash of rounded x, y, m): a refactor keeps it identical.
// `--bench`: field.update at rest (cost line; run on an idle machine).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ // src imports leave out '.ts' (Vite resolves them)
  resolve: (spec, ctx, next) => next(ctx.parentURL?.includes('/src/') && /^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec) ? `${spec}.ts` : spec, ctx),
});
const { Container, Texture } = await import('pixi.js');
const { rng } = await import('../../src/core/rng.ts');
const { createAsteroidField } = await import('../../src/evolution/asteroid/field.ts');
const { absorb, drop, rockBody, tickBody } = await import('../../src/evolution/asteroid/body.ts');
const { makeRival, tendMoon } = await import('../../src/evolution/asteroid/rival.ts');
const { roster } = await import('../../src/evolution/rivals/ledger.ts');
const { AGE_GOAL, COMP, radiusOf, START_R } = await import('../../src/evolution/asteroid/rules.ts');
type Body = import('../../src/evolution/asteroid/body.ts').Body;
type Field = ReturnType<typeof createAsteroidField>;
type Hit = import('../../src/evolution/asteroid/body.ts').Hit & { ma: number; ka: number; kb: number };

const DT = 1 / 30, HALF = [640, 360] as const;
const atlas = (['rock', 'metal', 'ice', 'gas'] as const).map((kind) => ({ texture: Texture.EMPTY, comp: COMP.stony, kind }));
const spheres = { update() {} } as never;
const you = (x: number, y: number) => {
  const b = rockBody({ texture: Texture.EMPTY, comp: COMP.dust }, START_R, x, y);
  b.motion.drag = 0;
  return b;
};
const finite = (b: Body) => Number.isFinite(b.motion.x + b.motion.y + b.motion.vx + b.motion.vy + b.r + b.m + b.heat);

/** One seeded run: `seconds` of play, the player flying a fixed course (`course(t)`: velocity), Age II from `age2` s; `each` after every update. */
function run(seed: number, seconds = 60, age2 = 30, course = (t: number) => [t < 20 ? 220 : 0, t < 20 ? 0 : 160], each = (_f: Field) => {}) {
  Math.random = rng(seed * 31 + 7);
  let p = you(0, 700), hits = 0, deaths = 0, bad = 0, guards = 0;
  const named = new Set<Body>();
  const field = createAsteroidField(new Container(), atlas as never, Texture.EMPTY, spheres, seed, p, (h) => void (hits++, Number.isFinite(h.speed) || bad++), () => {});
  for (const e of field.roster) e.life.progress = 1; // alive: a named world on the map catches a guard moon
  for (let t = 0; t < seconds; t += DT) {
    if (!p.m) field.follow((p = you(p.motion.x, p.motion.y), deaths++, p)); // eaten: a fresh body in the same field
    if (t >= age2 && p.m < AGE_GOAL) absorb(p, AGE_GOAL * 1.01 - p.m, { rock: 0.7, gas: 0.3 });
    [p.motion.vx, p.motion.vy] = course(t);
    p.motion.x += p.motion.vx * DT;
    p.motion.y += p.motion.vy * DT;
    field.update(p.motion, HALF[0], HALF[1], DT, () => {}, HALF[0]);
    each(field);
    assert.equal(new Set(field.bodies).size, field.bodies.length, 'no body is listed twice (it would collide with itself)');
    assert.ok(!p.held, 'the player is never held (a rival world\'s guard moon)');
    for (const b of field.bodies) {
      if (b.rival?.entry && !named.has(b)) assert.ok(Math.abs(b.r / radiusOf(b.m, b.comp) - 1) < 0.01, 'a named rival is built of its own make-up');
      if (b.rival?.entry) named.add(b);
      if (b.rival?.moon) guards++;
      if (b.held && !b.rival && !b.comet) assert.ok(field.bodies.some((w) => w.rival?.moon === b), 'nothing plain stays held once its world is gone');
    }
  }
  let h = 2166136261;
  for (const b of [p, ...field.bodies]) for (const v of [b.motion.x, b.motion.y, b.m * 100]) h = Math.imul(h ^ Math.round(v), 16777619) >>> 0;
  return { field, p, hits, deaths, bad, guards, named: named.size, n: field.bodies.length, hash: h.toString(16) };
}

if (process.argv.includes('--bench')) {
  Math.random = rng(1);
  const p = you(0, 700), field = createAsteroidField(new Container(), atlas as never, Texture.EMPTY, spheres, 292, p, () => {}, () => {});
  for (let i = 0; i < 120; i++) field.update(p.motion, HALF[0], HALF[1], 1 / 60, () => {}, HALF[0]);
  const N = 600, t0 = performance.now();
  for (let i = 0; i < N; i++) field.update(p.motion, HALF[0], HALF[1], 1 / 60, () => {}, HALF[0]);
  console.log(`cost: field.update at rest ${((performance.now() - t0) / N).toFixed(3)} ms with ${field.bodies.length} bodies (limit ~0.6 ms)`);
} else {
  for (const seed of [292, 292 + 7919, 292 + 2 * 7919]) {
    const r = seed > 9000 ? run(seed, 60, 40, (t) => [0, t < 30 ? 0 : 160]) : run(seed); // the third parks: the first hunter comes for it
    console.log(`seed ${seed}: ${r.n} bodies, ${r.hits} hits, ${r.deaths} deaths, ${r.named} named rivals, ${r.guards} guard frames, ${r.bad} non-finite hits, player m ${r.p.m.toFixed(1)}, digest ${r.hash}`);
    assert.ok(r.n > 20, 'the field is full of rock');
  }

  // A living named world catches a small rock as its guard moon, never the player at the same size and spot (rival.ts tendMoon).
  const world = makeRival(rockBody({ texture: Texture.EMPTY, comp: COMP.stony }, 60, 0, 0), Texture.EMPTY, 0);
  world.rival!.entry = { ...roster(1, world.m, COMP.stony)[0], life: { progress: 1, calm: 0 } };
  const near = (comp: object) => rockBody({ texture: Texture.EMPTY, comp: comp as never }, radiusOf(0.01 * world.m, comp as never), 200, 0);
  const me = near(COMP.dust), rock = near(COMP.stony);
  tendMoon(world, [me, world], me, DT);
  assert.ok(!world.rival!.moon && !me.held, 'the player at 1% of a living world is never caught as its moon');
  tendMoon(world, [me, rock, world], me, DT);
  assert.ok(world.rival!.moon === rock && rock.held, 'a rock there is');

  // A world that dies holding its guard moon lets it go: one update later the moon is a plain body again.
  let moon: Body | undefined, freed = false;
  run(292, 60, 30, undefined, (f) => {
    if (moon) return void (freed ||= (assert.ok(!moon.held, 'its guard moon is let go'), true));
    const w = f.bodies.find((b) => b.rival?.moon);
    if (w) [moon] = [w.rival!.moon, drop(w)];
  });
  assert.ok(freed, 'a guard moon was seen');

  // Giant clash (forced, Age I): two giants drift in from off screen for ~CLASH_S s and meet near the screen's edge beside a
  // parked player (holding its place); the staged impact shatters both (CLASH_D: the heavier's damage 1.2–3), read back from
  // the mass each kept (rules.ts lossFrac). A bigger body can swallow a giant on its way: that pair never meets.
  const dOf = (kept: number) => (kept <= 0 ? Infinity : kept <= 0.5 ? 0.5 / kept : 0.1 + 1.8 * (1 - kept));
  let meets = 0;
  for (const seed of [292, 8211, 16130, 5, 77, 1, 2, 3]) {
    Math.random = rng(seed);
    const p = you(0, 700), giants: Body[] = [];
    let hit: Hit | undefined, lost = '', touched = false, gap = Infinity, hold: { x: number; y: number } | undefined;
    const field = createAsteroidField(new Container(), atlas as never, Texture.EMPTY, spheres, seed, p, (h) => {
      const ga = giants.includes(h.a), gb = giants.includes(h.b);
      if (ga && gb) hit ??= { ...h, ma: h.a.m - h.gain, ka: h.a.m, kb: h.b.m };
      else if ((ga || gb) && (h.a === p || h.b === p)) touched = true;
      else if ((ga && !h.a.m) || (gb && !h.b.m)) lost ||= `a giant swallowed by a ${(ga ? h.b : h.a).m.toFixed(0)} u body on its way`;
    }, () => {});
    const step = () => (p.m && (hold ? Object.assign(p.motion, hold, { vx: 0, vy: 0 }) : tickBody(p, DT, false)), field.update(p.motion, HALF[0], HALF[1], DT, () => {}, HALF[0]));
    for (let i = 0; i < 30; i++) step();
    hold = { x: p.motion.x, y: p.motion.y }; // parked from here on
    field.clash();
    step();
    giants.push(...field.bodies.filter((b) => b.meteor && b.m > 2 * p.m));
    assert.equal(giants.length, 2, 'a forced clash brings two giants');
    assert.ok(giants.every((g) => finite(g) && Math.hypot(g.motion.x - p.motion.x, g.motion.y - p.motion.y) > Math.hypot(...HALF)), 'both start finite, off screen');
    const v0 = giants.map((g) => Math.hypot(g.motion.vx, g.motion.vy) / (2 * g.r));
    let t = 0;
    for (; !hit && !lost && t < 60; t += DT) {
      step();
      for (const g of giants) if (g.m && p.m) gap = Math.min(gap, (Math.hypot(g.motion.x - p.motion.x, g.motion.y - p.motion.y) - g.r - p.r) / p.r);
    }
    assert.ok(!touched, 'a parked player is never touched (so never eaten) by a clash giant');
    assert.ok(gap > 15, 'the giants pass a parked player well clear');
    if (lost) {
      console.log(`clash ${seed}: ${lost} after ${t.toFixed(1)} s, closest pass ${gap.toFixed(1)} R`);
      continue;
    }
    assert.ok(hit, 'they meet');
    meets++;
    const da = dOf(hit.ka / hit.ma), db = dOf(hit.kb / hit.mb), mx = (hit.a.motion.x + hit.b.motion.x) / 2 - p.motion.x, my = (hit.a.motion.y + hit.b.motion.y) / 2 - p.motion.y;
    console.log(`clash ${seed}: met after ${t.toFixed(1)} s at (${(mx / HALF[0]).toFixed(2)}, ${(my / HALF[1]).toFixed(2)}) half views, drift ${v0.map((v) => v.toFixed(2)).join(' / ')} diam/s, impact ${hit.speed.toFixed(0)} diam/s, damage ${da.toFixed(2)} / ${db.toFixed(2)}, closest pass ${gap.toFixed(1)} R`);
    assert.ok(t >= 15 && t <= 40, 'a slow approach: big things drift');
    assert.ok(hit.shattered && hit.broke && da >= 1.1 && da <= 3.3, 'the staged impact shatters both at the heavier\'s CLASH_D');
  }
  assert.ok(meets >= 5, 'most forced clashes meet');

  // Giants you leave behind pass out of meteor reach and are gone for good (m 0): nothing keeps a ghost of them.
  Math.random = rng(3);
  const pc = you(0, 700), fc = createAsteroidField(new Container(), atlas as never, Texture.EMPTY, spheres, 3, pc, () => {}, () => {});
  fc.clash();
  fc.update(pc.motion, HALF[0], HALF[1], DT, () => {}, HALF[0]);
  fc.clash(); // a second one waits until this pair has met: never two at once (it would leave the first unsteered)
  for (let i = 0; i < 90; i++) fc.update(pc.motion, HALF[0], HALF[1], DT, () => {}, HALF[0]);
  const left = fc.bodies.filter((b) => b.meteor && b.m > 2 * pc.m);
  pc.motion.x += 2e4;
  fc.update(pc.motion, HALF[0], HALF[1], DT, () => {}, HALF[0]);
  assert.ok(left.length === 2 && left.every((g) => !g.m), 'giants out of reach are dropped');
}
