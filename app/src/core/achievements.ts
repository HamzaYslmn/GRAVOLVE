// Achievements: a pure list plus a tracker, no DOM (ui/achievements.ts draws them, main.ts feeds them). main.ts builds
// a snapshot about twice a second and reports moments the snapshot cannot see (a meal, a shatter, a setback, Age I, a
// respawn, the end of the run). Each unlocks once, ever; unlocks persist through the Store main.ts hands in, as {id: unlock time}.
import { AGE_GOAL } from '../evolution/asteroid/rules.ts';
import { BROWN_DWARF_M, PLANET_M } from '../evolution/planet/rules.ts';
import { DONE } from '../evolution/star/rules.ts';

const TOP = 0; // WorldState.life once life holds (planet/rules.ts stageOf)

type Comp = { rock?: number; metal?: number; ice?: number; gas?: number; radio?: number };
/** Your world (planet stage) at snapshot time; absent in Age I. */
export type WorldSnap = {
  water: string; waterShare: number; life: number; lifeSpeed: number; envelope: boolean; moons: number; slots: number; magnet: number;
  star?: { owned: boolean; cover: number; mass: number; name: string };
  seen: (key: string) => boolean; // the planet stage's news keys (latched once per run)
};
export type Snap = {
  t: number; // run seconds
  dt: number; // game seconds since the last snapshot (the in-a-row timers)
  m: number; // your mass (0: the run is over)
  comp: Comp;
  comet: boolean;
  speed: number; // own diameters/s
  web: number; // cosmic web density where you are (field.webHere): < 0.1 is a void
  shadow: boolean; // within 3 of its radii of a body ≥ 20× your mass
  world?: WorldSnap;
};
/** What the snapshot cannot see: reported by main.ts as it happens. */
type Moment =
  | { kind: 'eat'; comet: boolean; radio: number } // you ate a body whole (its comet flag, its radioactive share)
  | { kind: 'hurt' } // a hit shattered you
  | { kind: 'giant' } // you broke a heavier body to nothing and lived
  | { kind: 'setback' } // a hit cost life progress (Impact winter / Mass extinction)
  | { kind: 'aged'; t: number; comp: Comp } // Age I complete
  | { kind: 'respawn' } // "Continue as a planetoid"
  | { kind: 'death'; cause: string; ratio: number }; // ratio: what ate you over your mass (0 if not eaten)

/** Per-run memory the tests read. */
type Run = {
  ate: boolean; cometMeal: boolean; greenMeal: boolean; hurt: boolean; giant: boolean; respawned: boolean;
  agedAt?: number; agedComp?: Comp; untouched: boolean;
  chain: 'none' | 'on' | 'broken'; // life filling → LIFE without a setback, per world
  cause?: string; eatenRatio: number;
  timers: { eden: number; dark: number; shadow: number; comet: number; ice: number };
  stars: Set<string>;
  ages: number[]; // run seconds when Age I / II / III completed (index 0..2)
  fresh: string[]; // ids unlocked this run
};

type Group = 'Milestone' | 'Mastery' | 'Discovery' | 'Style' | 'Secret';
export type Achievement = { id: string; name: string; hint: string; group: Group; secret?: boolean; test: (s: Snap, r: Run) => boolean };

const star = (s: Snap) => s.world?.star;
const life = (s: Snap) => s.world?.life ?? -1;
const share = (c: Comp | undefined, k: keyof Comp) => c?.[k] ?? 0;
const a = (group: Group, id: string, name: string, hint: string, test: Achievement['test'], secret = false): Achievement => ({ id, name, hint, group, test, secret });

export const ACHIEVEMENTS: Achievement[] = [
  a('Milestone', 'bite', 'First bite', 'Eat your first rock', (_, r) => r.ate),
  a('Milestone', 'planetesimal', 'Planetesimal', 'Finish Age I: grow to 3,162', (s) => s.m >= AGE_GOAL),
  a('Milestone', 'planet', 'Planet', 'Grow to 31,623', (s) => s.m >= PLANET_M),
  a('Milestone', 'rain', 'First rain', 'Liquid seas on your world', (s) => s.world?.water === 'liquid' && s.world.waterShare >= 0.01),
  a('Milestone', 'moonrise', 'Moonrise', 'Catch your first moon', (s) => (s.world?.moons ?? 0) >= 1),
  a('Milestone', 'spark', 'Spark', 'Life begins to stir', (s) => life(s) >= 0 || (s.world?.lifeSpeed ?? 0) > 0),
  a('Milestone', 'lookup', 'They look up', 'Your world comes to life', (s) => life(s) === TOP),
  a('Milestone', 'bound', 'Bound to a sun', 'Link a star', (s) => !!star(s)?.owned),
  a('Milestone', 'half', 'Half a sphere', 'Dyson sphere 50%: Age III complete', (s) => !!star(s)?.owned && star(s)!.cover >= DONE),
  a('Milestone', 'type2', 'Type II', 'Close the whole Dyson sphere', (s) => !!star(s)?.owned && star(s)!.cover >= 1 - 1e-9),
  a('Milestone', 'failed', 'Failed star', 'A gas world of 10 million: brown dwarf', (s) => !!s.world?.envelope && s.m >= BROWN_DWARF_M),

  a('Mastery', 'sprinter', 'Sprinter', 'Finish Age I within 70 s', (_, r) => r.agedAt !== undefined && r.agedAt <= 70),
  a('Mastery', 'untouched', 'Untouched', 'Finish Age I without breaking', (_, r) => r.untouched),
  a('Mastery', 'giant', 'Giant killer', 'Break a heavier body to dust and live', (_, r) => r.giant),
  a('Mastery', 'eden', 'Eden', 'Life speed 90% for a minute', (_, r) => r.timers.eden >= 60),
  a('Mastery', 'chain', 'Unbroken chain', 'Life with no setback', (s, r) => life(s) === TOP && r.chain === 'on'),
  a('Mastery', 'house', 'Full house', 'Four moon slots, all filled', (s) => (s.world?.moons ?? 0) >= 4 && s.world!.moons >= s.world!.slots),
  a('Mastery', 'thinker', 'Fast thinker', 'Life within 15 min', (s) => life(s) === TOP && s.t <= 900),
  a('Mastery', 'duelist', 'Duelist', 'Beat a rival world', (s) => !!s.world?.seen('beaten')),
  a('Mastery', 'bounty', 'Bounty', 'Destroy a pirate fleet', (s) => !!s.world?.seen('pirates-down')),
  a('Mastery', 'thief', 'Moon thief', 'Catch a moon another host just lost', (s) => !!s.world?.seen('stolen')),
  a('Mastery', 'masterthief', 'Master thief', 'Steal 10 moons in one run', (s) => !!s.world?.seen('thief')),
  a('Mastery', 'tamer', 'Sun tamer', 'Link a star of 4 suns or more', (s) => !!star(s)?.owned && star(s)!.mass >= 4),

  a('Discovery', 'catcher', 'Comet catcher', 'Eat a comet', (_, r) => r.cometMeal),
  a('Discovery', 'green', 'Green glow', 'Eat a green rad rock', (_, r) => r.greenMeal),
  a('Discovery', 'dark', 'Into the dark', '30 s in a void', (_, r) => r.timers.dark >= 30),
  a('Discovery', 'shadow', "In a giant's shadow", '5 s close to a body 20× your mass', (_, r) => r.timers.shadow >= 5),
  a('Discovery', 'four', 'Four elements', 'Rock, metal, water and gas, 10% each', (s) => s.m > 0 && (['rock', 'metal', 'ice', 'gas'] as const).every((k) => share(s.comp, k) >= 0.1)),
  a('Discovery', 'iron', 'Iron heart', 'Magnetic field 90%', (s) => (s.world?.magnet ?? 0) >= 0.9),
  a('Discovery', 'gazer', 'Stargazer', 'Three kinds of star in one run', (_, r) => r.stars.size >= 3),

  a('Style', 'cometlife', 'Comet life', 'A minute as a comet in one run', (_, r) => r.timers.comet >= 60),
  a('Style', 'sling', 'Slingshot', 'Fly at 100 diameters a second', (s) => s.m > 0 && s.speed >= 100),
  a('Style', 'pacifist', 'Pacifist', 'Link a star without beating a rival', (s) => !!star(s)?.owned && !s.world!.seen('beaten')),
  a('Style', 'ironworld', 'Iron world', 'Finish Age I with 40% metal', (_, r) => share(r.agedComp, 'metal') >= 0.4),
  a('Style', 'waterworld', 'Water world', 'Finish Age I with 40% water', (_, r) => share(r.agedComp, 'ice') >= 0.4),

  a('Secret', 'icarus', 'Icarus', 'Lost to a star', (_, r) => r.cause === 'star', true),
  a('Secret', 'swallowed', 'Swallowed whole', 'Eaten by a body 20× your mass', (_, r) => r.cause === 'eaten' && r.eatenRatio >= 20, true),
  a('Secret', 'phoenix', 'Phoenix', 'Life on a world that rose again', (s, r) => r.respawned && life(s) === TOP, true),
  a('Secret', 'underice', 'Life under the ice', 'Life lives on under frozen seas for a minute', (_, r) => r.timers.ice >= 60, true),
];

export const GROUPS: Group[] = ['Milestone', 'Mastery', 'Discovery', 'Style', 'Secret'];

const freshRun = (): Run => ({
  ate: false, cometMeal: false, greenMeal: false, hurt: false, giant: false, respawned: false, untouched: false, chain: 'none', eatenRatio: 0,
  timers: { eden: 0, dark: 0, shadow: 0, comet: 0, ice: 0 }, stars: new Set(), ages: [], fresh: [],
});

/** Where unlocks live (createAchievements catches a blocked store: unlocks then last for the session). */
export type Store = { load(): Record<string, number>; save(v: Record<string, number>): void };

/** A gallery tile: secrets read "?" until unlocked. */
type Tile = { id: string; name: string; hint: string; group: Group; got: boolean; fresh: boolean };

export function createAchievements(store: Store, now = () => Date.now()) {
  const got: Record<string, number> = {};
  // Takes in what storage holds (another tab may have unlocked more since), so a save never drops someone else's unlocks.
  const merge = () => {
    let stored: Record<string, number> = {};
    try {
      stored = store.load();
    } catch {
      // no storage: what this session has
    }
    for (const [k, v] of Object.entries(stored)) if (!got[k] && ACHIEVEMENTS.some((x) => x.id === k) && typeof v === 'number') got[k] = v;
  };
  merge();
  let run = freshRun();
  let ages: [number, number][] = []; // ages completed since the last call: [age, run seconds]

  const age = (i: number, t: number) => {
    if (run.ages[i] !== undefined) return;
    run.ages[i] = t;
    ages.push([i + 1, t]);
  };

  return {
    /** A new run (not a respawn). */
    newRun() {
      run = freshRun();
      ages = [];
    },
    moment(e: Moment) {
      if (e.kind === 'eat') {
        run.ate = true;
        run.cometMeal ||= e.comet;
        run.greenMeal ||= e.radio >= 0.2; // green rocks are 25% radioactive (asteroid/rules.ts COMP.radioactive)
      } else if (e.kind === 'hurt') run.hurt = true;
      else if (e.kind === 'giant') run.giant = true;
      else if (e.kind === 'setback') run.chain = run.chain === 'on' ? 'broken' : run.chain;
      else if (e.kind === 'aged' && run.agedAt === undefined) {
        [run.agedAt, run.agedComp, run.untouched] = [e.t, { ...e.comp }, !run.hurt];
        age(0, e.t);
      } else if (e.kind === 'respawn') [run.respawned, run.chain] = [true, 'none']; // a new world: its life starts over
      else if (e.kind === 'death') [run.cause, run.eatenRatio] = [e.cause, e.ratio];
    },
    /** One snapshot: updates the in-a-row timers, returns what unlocked now (each once, ever). */
    tick(s: Snap): Achievement[] {
      const T = run.timers, w = s.world, on = s.m > 0, dt = s.dt;
      const hold = (k: keyof Run['timers'], c: boolean) => (T[k] = c ? T[k] + dt : 0);
      hold('eden', on && (w?.lifeSpeed ?? 0) >= 0.9);
      hold('dark', on && s.web < 0.1);
      hold('shadow', on && s.shadow);
      hold('ice', on && !!w && w.life >= 0 && w.water === 'ice' && w.waterShare >= 0.1);
      if (on && s.comet) T.comet += dt; // in one run, not in a row
      if (w) {
        if ((w.life >= 0 || w.lifeSpeed > 0) && run.chain === 'none') run.chain = 'on';
        if (w.star) run.stars.add(w.star.name);
        if (w.life === TOP || (w.envelope && s.m >= BROWN_DWARF_M)) age(1, s.t);
        if (w.star?.owned && w.star.cover >= DONE) age(2, s.t);
      }
      const out: Achievement[] = [];
      merge(); // a few hundred bytes of JSON twice a second
      for (const x of ACHIEVEMENTS) {
        if (got[x.id] || !x.test(s, run)) continue;
        got[x.id] = now();
        run.fresh.push(x.id);
        out.push(x);
      }
      if (out.length) {
        try {
          store.save(got);
        } catch {
          // no storage: they last for the session
        }
      }
      return out;
    },
    /** Ages completed since the last call, as [age, run seconds] pairs (bests). */
    ages() {
      const out = ages;
      ages = [];
      return out;
    },
    /** All tiles in list order (secrets hidden until unlocked; `fresh`: unlocked this run). */
    tiles(): Tile[] {
      return ACHIEVEMENTS.map((x) => {
        const g = !!got[x.id], hide = x.secret && !g;
        return { id: x.id, name: hide ? '?' : x.name, hint: hide ? 'Secret' : x.hint, group: x.group, got: g, fresh: run.fresh.includes(x.id) };
      });
    },
    count: () => ({ got: Object.keys(got).length, all: ACHIEVEMENTS.length }),
  };
}

export type Achievements = ReturnType<typeof createAchievements>;
