// node test/civilization/orders.test.ts: the priority target (docs/civilizationgameplay.md "Priority target"). Your ships never
// pick rocks by themselves (ships.ts has no scan in frigateStep); each ship takes the priority only while orders.ts status says
// it can hurt and reach it, with an honest note (a cooling fleet reloads, never "no ships"); a pushed body misses by MISS ×
// contact (deflect); rockets are yours to fire, guided: a target that changes course after the launch is still hit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRockets } from '../../src/evolution/civilization/guns.ts';
import { type Disc } from '../../src/evolution/civilization/nav.ts';
import { deflect, MISS, RECALL } from '../../src/evolution/civilization/rules.ts';
import { CLEARED, status, type Fleet, type Target } from '../../src/evolution/civilization/orders.ts';
import { rocketAt } from './fakes.ts';

// No automatic rock fire: frigateStep takes the priority, never scans for bodies on course; no gates of its own. Rockets fly
// only on Fire (combat.ts): nothing in ships.ts or stage.ts launches one.
{
  const src = readFileSync(new URL('../../src/evolution/civilization/ships.ts', import.meta.url), 'utf8');
  const body = (name: string) => {
    const a = src.indexOf(`export function ${name}(`), b = src.indexOf('\nexport ', a + 1);
    assert.ok(a >= 0, `ships.ts has ${name}`);
    return src.slice(a, b < 0 ? undefined : b);
  };
  assert.ok(!body('frigateStep').includes('closing(') && /order: Body \| undefined/.test(body('frigateStep')), 'the frigate scans for nothing: it takes your priority');
  assert.ok(!src.includes('.fast') && body('defend').includes('if (!frag) for (const b of near)'), 'yours see no rock as a threat by themselves');
  assert.ok(!body('frigateStep').includes('FRAG'), 'no frigate size gate: orders.ts decides');
  const stage = readFileSync(new URL('../../src/evolution/civilization/stage.ts', import.meta.url), 'utf8');
  assert.ok(!src.includes('.launch(') && !stage.includes('.launch('), 'no rocket launches by itself');
  assert.ok(stage.includes('b.m > ROCKET.share * me.m ? chip('), 'stage.ts: your rocket chips or cuts by the body it hit');
}

// status (orders.ts): one priority target; each ship takes it first when it comes free and can hurt and reach it. Here the
// gold ring is 10 R (ships reach LINK_HOLD × it, 11.5 R); two fighters, a probe, no frigate, all ready, the shield up.
{
  const T0: Target = { kind: 'body', share: 0.02, free: true, course: false, d: 6 };
  const F0: Fleet = { awake: true, ring: 10, shield: true, n: { fighters: 2, probes: 1, frigate: 0 }, eta: { fighters: 0, probes: 0, frigate: 0 } };
  const notes = new Set<string>([CLEARED, 'No fleet yet', 'Reloading · 99 s']);
  const st = (t: Partial<Target> = {}, f: Partial<Fleet> = {}) => {
    const r = status({ ...T0, ...t }, { ...F0, ...f, n: { ...F0.n, ...f.n }, eta: { ...F0.eta, ...f.eta } });
    notes.add(r.note);
    return r;
  };
  const a = st();
  assert.ok(a.ok && a.note === 'Priority set' && a.on.fighters && !a.wait, 'a 2% rock at 6 R: fighters take it');
  // The reported bug: ships only cooling read as "No ships ready".
  const cool = st({ share: 0.005 }, { eta: { fighters: 2, probes: 2 } as Fleet['eta'] });
  assert.ok(cool.by.fighters === 'busy' && cool.note === 'Reloading · 2 s' && cool.on.fighters && !cool.wait, `cooling fighters: ${cool.note}, never "No fighters"`);
  assert.equal(st({ share: 0.005 }, { eta: { fighters: 2.2, probes: 4 } as Fleet['eta'] }).note, 'Reloading · 3 s', 'the soonest weapon, rounded up');
  assert.equal(st({ share: 0.005 }, { eta: { fighters: 2 } as Fleet['eta'] }).note, 'Priority set', 'a ready probe takes a 0.5% rock');
  assert.equal(st({ share: 0.005 }, { eta: { fighters: Infinity, probes: Infinity } as Fleet['eta'] }).note, 'Ships busy', 'every ship on another run');
  assert.equal(st({ share: 0.008 }, { n: { fighters: 0 } as Fleet['n'] }).note, 'No fighters', 'a 0.8% rock is only for fighters');
  const far = st({ d: 20 });
  assert.ok(far.ok && far.note === 'Out of range' && far.wait && !far.on.fighters, 'out of every reach: it stands and waits');
  assert.ok(st({ d: 11.5, share: 0.005 }).on.fighters && st({ d: 11.6, share: 0.005 }).note === 'Out of range', 'ships reach 11.5 R');
  assert.equal(st({ share: 0.4 }).note, 'Nothing can hurt it', 'over 25%: no ship can (your rockets chip it)');
  assert.ok(!st({ share: 0.1 }).on.fighters && st({ share: 0.1, course: true }).on.fighters, 'fighters push a 10% rock only on course');
  const frig = (share: number, n = 1) => st({ share }, { n: { frigate: n } as Fleet['n'] }).on.frigate;
  assert.ok(frig(0.1) && frig(0.02) && frig(0.25) && !frig(0.01) && !frig(0.3) && !frig(0.1, 0) && !st({ share: 0.1, free: false }, { n: { frigate: 1 } as Fleet['n'] }).on.frigate, 'the frigate lances free 2–25% rocks');
  assert.equal(st({ share: 0.1 }, { n: { frigate: 1 } as Fleet['n'], eta: { frigate: 1.5 } as Fleet['eta'] }).note, 'Reloading · 2 s', 'the frigate reloading');
  const ship = st({ kind: 'foe', share: 0, free: false, d: 8 }, { n: { frigate: 1 } as Fleet['n'] });
  assert.ok(ship.on.fighters && !ship.on.probes && !ship.on.frigate && ship.note === 'Priority set', 'an enemy ship: fighters');
  const world = (d: number, shield = true) => st({ kind: 'world', share: 0.6, free: false, d }, { shield });
  assert.ok(world(RECALL).ok && world(RECALL).on.siege && world(RECALL).note === 'Priority set', 'a fighting world: the siege within RECALL');
  assert.ok(world(RECALL + 1).note === 'Out of range' && world(RECALL, false).note === 'Shield down · fleet holds', '...not past it, nor with your shield down');
  const beaten = st({ kind: 'beaten', share: 0.6, free: false });
  assert.ok(!beaten.ok && beaten.note === 'Already beaten', 'a beaten world is refused');
  const asleep = st({}, { awake: false });
  assert.ok(asleep.ok && asleep.wait && asleep.note === 'No life · fleet idle' && !Object.values(asleep.on).some(Boolean), 'asleep: it stands, nothing takes it');
  for (const n of notes) assert.ok(n.length > 0 && n.length <= 26, `a short note: ${n}`);
}

// deflect: the kicked straight line passes at MISS × contact (exactly, judged at closest approach); none for a miss already.
{
  const contact = 1.3, closest = (px: number, py: number, wx: number, wy: number) => {
    const t = Math.max(0, -(px * wx + py * wy) / (wx * wx + wy * wy));
    return Math.hypot(px + wx * t, py + wy * t);
  };
  for (const [px, py, wx, wy] of [[30, 0.2, -10, 0], [20, -5, -6, 1.5], [12, 0, -4, 0], [6, 1, -12, 0]]) {
    const k = deflect(px, py, wx, wy, contact), m = closest(px, py, wx + k.x, wy + k.y);
    assert.ok(m >= MISS * contact * (1 - 1e-9), `kicked by (${k.x.toFixed(2)}, ${k.y.toFixed(2)}) it passes at ${m.toFixed(3)}`);
  }
  const k = deflect(30, 5, -10, 0, contact);
  assert.ok(k.x === 0 && k.y === 0, 'a body already missing gets no kick');
  const early = Math.hypot(...Object.values(deflect(30, 0, -10, 0, contact))), late = Math.hypot(...Object.values(deflect(5, 0, -10, 0, contact)));
  console.log(`deflect a body on a dead-centre line at 10 R/s (contact ${contact} R): ${early.toFixed(2)} R/s at 3 s out, ${late.toFixed(2)} R/s at 0.5 s`);
  assert.ok(late > 4 * early, 'ordering early is the skill: a late kick costs several times more');
}

// Your rocket (guns.ts createRockets, a world of radius 1 at rest): a rock 9 R out crossing at 3 R/s that turns back 0.4 s
// after the launch is hit from either pad side; the same shot without a seeker is missed. (A rock pushed sideways harder and
// harder outruns the outside pad's turn: no snap turns, guns.test.ts.) A rocket hears only a hit on its own target.
{
  const run = (guided: boolean, side = 1) => {
    const pool = createRockets(12, () => (side > 0 ? 0 : 0.9)), target: Disc = { m: 1, r: 0.4, motion: { x: 8, y: -4, vx: 0, vy: 3 } };
    let got = false, best = Infinity;
    const m = pool.launch(rocketAt(1, { tx: 8, ty: -4, target, ...(guided ? { seek: () => ({ ...target.motion, r: target.r }) } : {}), hit: (b: Disc) => void (got ||= b === target) }))!;
    for (let t = 0, dt = 1 / 60; t < 3 && pool.live.length; t += dt) {
      if (t >= 0.4) target.motion.vy = -3;
      target.motion.x += target.motion.vx * dt;
      target.motion.y += target.motion.vy * dt;
      pool.step(dt, [target], [], 0, () => {}, () => {});
      best = Math.min(best, Math.hypot(m.x - target.motion.x, m.y - target.motion.y) - target.r);
    }
    return { got, best };
  };
  const g = [run(true, 1), run(true, -1)], un = run(false);
  console.log(`your rocket at a rock 9 R out turning back 0.4 s after launch: guided ${g.map((f) => (f.got ? 'hit' : `missed by ${f.best.toFixed(2)} R`)).join(' / ')} (both pad sides), without a seeker ${un.got ? 'hit' : `missed by ${un.best.toFixed(2)} R`}`);
  assert.ok(g.every((f) => f.got) && !un.got, 'the seeker follows a target that changes course, from either side');
}
console.log('priority target ok');
