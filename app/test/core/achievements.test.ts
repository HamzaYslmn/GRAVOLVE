// Run: node test/core/achievements.test.ts (part of npm test). Achievements: each fires once, unlocks persist, secrets stay hidden.
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, createAchievements, GROUPS, type Snap, type Store, type WorldSnap } from '../../src/core/achievements.ts';

// A store in memory (localStorage stand-in), and one that throws like blocked storage.
const memStore = (): Store & { data: string } => {
  const s = {
    data: '{}',
    load: () => JSON.parse(s.data),
    save: (v: Record<string, number>) => void (s.data = JSON.stringify(v)),
  };
  return s;
};
const blocked: Store = {
  load: () => { throw new Error('blocked'); },
  save: () => { throw new Error('blocked'); },
};

const snap = (o: Partial<Snap> = {}): Snap => ({ t: 10, dt: 0.5, m: 100, comp: { rock: 1 }, comet: false, speed: 2, web: 1, shadow: false, ...o });
const world = (o: Partial<WorldSnap> = {}): WorldSnap => ({
  water: 'ice', waterShare: 0, life: -1, lifeSpeed: 0, envelope: false, moons: 0, slots: 1, magnet: 0, seen: () => false, ...o,
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

// The list: unique ids, known groups, 39 tiles (One small step went with the moon-landing tech).
assert.equal(new Set(ACHIEVEMENTS.map((x) => x.id)).size, ACHIEVEMENTS.length);
assert.equal(ACHIEVEMENTS.length, 39);
assert.ok(ACHIEVEMENTS.every((x) => GROUPS.includes(x.group) && x.name && x.hint));
assert.ok(ACHIEVEMENTS.filter((x) => x.group === 'Secret').every((x) => x.secret));

// Nothing unlocks on a plain Age I snapshot.
{
  const A = createAchievements(memStore());
  assert.deepEqual(A.tick(snap()), []);
}

// Conditions fire once: First bite on the first meal, never again, also not after a new run.
{
  const st = memStore(), A = createAchievements(st, () => 1234);
  A.moment({ kind: 'eat', comet: false, radio: 0 });
  assert.deepEqual(ids(A.tick(snap())), ['bite']);
  A.moment({ kind: 'eat', comet: false, radio: 0 });
  assert.deepEqual(A.tick(snap()), []);
  A.newRun();
  A.moment({ kind: 'eat', comet: false, radio: 0 });
  assert.deepEqual(A.tick(snap()), []);
  assert.deepEqual(JSON.parse(st.data), { bite: 1234 });

  // Persistence round-trip: a new tracker on the same store knows it; unknown keys in storage are ignored.
  st.data = JSON.stringify({ bite: 1234, nonsense: 5, planet: 'x' });
  const B = createAchievements(st);
  assert.deepEqual(B.count(), { got: 1, all: 39 });
  B.moment({ kind: 'eat', comet: true, radio: 0.25 }); // a real green rock (asteroid/rules.ts COMP.radioactive): Green glow is reachable
  assert.deepEqual(ids(B.tick(snap())), ['catcher', 'green']);
  assert.deepEqual(Object.keys(JSON.parse(st.data)).sort(), ['bite', 'catcher', 'green']);
  const t = B.tiles();
  assert.deepEqual(ids(t.filter((x) => x.fresh)), ['catcher', 'green']); // this run's new ones
  assert.ok(t.find((x) => x.id === 'bite')!.got && !t.find((x) => x.id === 'bite')!.fresh); // got before

  // Another tab unlocks Moonrise meanwhile: this tab neither fires it again nor drops it when it saves.
  st.data = JSON.stringify({ ...JSON.parse(st.data), moonrise: 99 });
  B.moment({ kind: 'giant' });
  assert.deepEqual(ids(B.tick(snap({ world: world({ moons: 1 }) }))), ['giant']);
  assert.equal(JSON.parse(st.data).moonrise, 99);
}

// Secrets stay hidden until unlocked, then show their name.
{
  const A = createAchievements(memStore());
  const hidden = A.tiles().filter((x) => x.group === 'Secret');
  assert.equal(hidden.length, 4);
  assert.ok(hidden.every((x) => x.name === '?' && x.hint === 'Secret' && !x.got));
  A.moment({ kind: 'death', cause: 'star', ratio: 0 });
  assert.deepEqual(ids(A.tick(snap({ m: 0 }))), ['icarus']);
  const ic = A.tiles().find((x) => x.id === 'icarus')!;
  assert.equal(ic.name, 'Icarus');
  assert.ok(A.tiles().filter((x) => x.group === 'Secret' && x.id !== 'icarus').every((x) => x.name === '?'));
  // Swallowed whole: only by a body ≥ 20× you.
  A.newRun();
  A.moment({ kind: 'death', cause: 'eaten', ratio: 5 });
  assert.deepEqual(A.tick(snap({ m: 0 })), []);
  A.newRun();
  A.moment({ kind: 'death', cause: 'eaten', ratio: 25 });
  assert.deepEqual(ids(A.tick(snap({ m: 0 }))), ['swallowed']);
}

// Age I moments: Sprinter, Untouched, Planetesimal, Iron world; a shatter before Age I spoils Untouched.
{
  const A = createAchievements(memStore());
  A.moment({ kind: 'aged', t: 68, comp: { metal: 0.45, rock: 0.55 } });
  assert.deepEqual(ids(A.tick(snap({ t: 68.4, m: 3200 }))), ['ironworld', 'planetesimal', 'sprinter', 'untouched']);
  assert.deepEqual(A.ages(), [[1, 68]]);
  assert.deepEqual(A.ages(), []); // drained
  const B = createAchievements(memStore());
  B.moment({ kind: 'hurt' });
  B.moment({ kind: 'aged', t: 90, comp: { ice: 0.5, rock: 0.5 } });
  assert.deepEqual(ids(B.tick(snap({ t: 90, m: 3200 }))), ['planetesimal', 'waterworld']);
}

// In-a-row timers: Into the dark needs 30 s straight; leaving the void resets it.
{
  const A = createAchievements(memStore());
  for (let i = 0; i < 50; i++) A.tick(snap({ web: 0.05 })); // 25 s
  A.tick(snap({ web: 0.5 })); // out: reset
  let got: string[] = [];
  for (let i = 0; i < 59; i++) got = got.concat(ids(A.tick(snap({ web: 0.05 })))); // 29.5 s
  assert.deepEqual(got, []);
  assert.deepEqual(ids(A.tick(snap({ web: 0.05 }))), ['dark']); // 30 s
  // Comet life adds up over the run (not in a row).
  for (let i = 0; i < 120; i++) A.tick(snap({ comet: i % 2 === 0 }));
  assert.deepEqual(ids(A.tick(snap({ comet: true }))), []); // 30.5 s so far
  let c: string[] = [];
  for (let i = 0; i < 60; i++) c = c.concat(ids(A.tick(snap({ comet: true }))));
  assert.deepEqual(c, ['cometlife']);
}

// Life: Unbroken chain only without a setback since life began to fill; Phoenix after a respawn; Fast thinker by 15 min.
{
  const A = createAchievements(memStore());
  A.tick(snap({ world: world({ life: -1, lifeSpeed: 1, water: 'liquid', waterShare: 0.2 }) }));
  A.moment({ kind: 'setback' });
  const got = ids(A.tick(snap({ t: 1000, world: world({ life: 0 }) })));
  assert.ok(got.includes('lookup') && !got.includes('chain') && !got.includes('thinker') && !got.includes('phoenix'), got.join());
  A.moment({ kind: 'respawn' });
  A.tick(snap({ t: 1100, world: world({ life: -1, lifeSpeed: 1 }) }));
  assert.deepEqual(ids(A.tick(snap({ t: 1300, world: world({ life: 0 }) }))), ['chain', 'phoenix']);
  assert.deepEqual(A.ages(), [[2, 1000]]); // Age II at the first intelligent species of the run
}

// Star: Bound, Half a sphere (Age III), Type II, Sun tamer, Pacifist; Stargazer after three kinds.
{
  const A = createAchievements(memStore());
  const st = (o: Partial<NonNullable<WorldSnap['star']>>) => world({ life: 0, star: { owned: false, cover: 0, mass: 1, name: 'Yellow star', ...o } });
  A.tick(snap({ world: st({}) }));
  A.tick(snap({ world: st({ name: 'Red dwarf' }) }));
  const g1 = ids(A.tick(snap({ t: 2000, world: st({ owned: true, mass: 5, name: 'Blue star', cover: 0.5 }) })));
  for (const id of ['bound', 'half', 'tamer', 'pacifist', 'gazer']) assert.ok(g1.includes(id), `${id} in ${g1}`);
  assert.ok(!g1.includes('type2'));
  assert.deepEqual(ids(A.tick(snap({ world: st({ owned: true, cover: 1 }) }))), ['type2']);
}

// Thieves: the planet stage latches 'stolen' on the first stolen moon and 'thief' at THIEF in a run (planet/stage.ts).
{
  const A = createAchievements(memStore()), keys = new Set<string>();
  const w = () => world({ seen: (k) => keys.has(k) });
  assert.deepEqual(A.tick(snap({ world: w() })), []);
  keys.add('stolen');
  assert.deepEqual(ids(A.tick(snap({ world: w() }))), ['thief']);
  keys.add('thief');
  assert.deepEqual(ids(A.tick(snap({ world: w() }))), ['masterthief']);
}

// Blocked storage: no throw, unlocks last for the session.
{
  const A = createAchievements(blocked);
  A.moment({ kind: 'eat', comet: false, radio: 0 });
  assert.deepEqual(ids(A.tick(snap())), ['bite']);
  assert.deepEqual(A.tick(snap()), []);
}

console.log(`achievements: ${ACHIEVEMENTS.length} achievements, once-only, persistence, secrets ok`);
