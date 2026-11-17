// node test/rivals/ledger.test.ts: the roster has distinct names and personas from every group; over a simulated
// 20-minute run (you 69.5 → 10^6, with a shrink and a pause) every off-screen rival stays within BAND of you, grows with
// you, and the one with the largest share ends ahead of the smallest; each forges a world (melts through, reaches LIFE in a few minutes
// as a careful player does, never crosses the gas line); round robin skips the dead and those on the map.
import assert from 'node:assert/strict';
import {
  A_ENG, alarmStep, BAND, COMMIT, DODGE, evade, GATHER_U, newWave, next, PROFILE, pursueStep, remember, REST_S, restStep, roster, sidestep, stance, stationStep, STOCK_RATE,
  TELL, TELL_MIN, tell, TEMPERS, tick, volley, want, waveStep, WORLD_FLAGS, type Mood, type Temper, type Wave,
} from '../../src/evolution/rivals/ledger.ts';
import {
  ARMS, BEATEN, CALM_S, FLEET, raid, RIVAL_SALVO, rivalFrigates, rivalLevel, rivalSalvo, ROCKET, salvo, SHIELD_K, shieldMax, shieldRegen,
  shieldShot, SIEGE, siegeWing, START_ORE, START_SHIPS, strength, waveFighters, weaponHit, type Shield,
} from '../../src/evolution/civilization/rules.ts';
import { COMP, G_WORLD, gravitates, pairPull, pullMass, radiusOf, youPull } from '../../src/evolution/asteroid/rules.ts';
import { createRockets } from '../../src/evolution/civilization/guns.ts';
import { rocketAt } from '../civilization/fakes.ts';
import { lcg } from '../helpers.ts';
import { LIFE_S } from '../../src/evolution/planet/rules.ts';

const comp = { rock: 0.8, metal: 0.1, ice: 0.08, gas: 0.02 };
const list = roster(292, 69.5, comp);
for (let seed = 0; seed < 200; seed++) { // every roster: 5 distinct names and personas, ≥ 2 bold, ≥ 1 mid, ≥ 1 cautious
  const l = seed === 0 ? list : roster(seed, 69.5, comp), groups = l.map((e) => PROFILE[e.temper].group), count = (g: string) => groups.filter((x) => x === g).length;
  assert.ok(l.length === 5 && new Set(l.map((e) => e.name)).size === 5 && new Set(l.map((e) => e.temper)).size === 5 && count('bold') >= 2 && count('mid') >= 1 && count('cautious') >= 1, `a roster of 5, never passive: ${l.map((e) => e.temper)}`);
}
for (const t of TEMPERS) assert.ok(PROFILE[t].mass[0] < PROFILE[t].mass[1] && PROFILE[t].mass[1] < 1.1 && PROFILE[t].massS >= 12, `${t}: mass under 1.1× you, masses ≥ 12 s in view`);

// You: Age I in 100 s (×45), then ×10 every 3 minutes; a 20% shrink at 6:00 (an impact), parked flat 10:00–12:00.
const youAt = (t: number) => {
  let m = t < 100 ? 69.5 * 45 ** (t / 100) : 3162 * 10 ** ((t - 100) / 180);
  if (t >= 360) m *= 0.8;
  if (t >= 600 && t < 720) m = youAt(599.9);
  return Math.min(m, 1e6);
};
const dt = 0.25, marks = new Map(list.map((e) => [e, { aged: NaN, soup: NaN, alive: NaN, gasMax: 0 }]));
let worst = [Infinity, 0];
for (let t = 0; t < 1200; t += dt) {
  const you = youAt(t);
  tick(list, dt, you);
  for (const e of list) {
    const r = e.m / you, k = marks.get(e)!;
    worst = [Math.min(worst[0], r), Math.max(worst[1], r)];
    assert.ok(r >= BAND[0] - 1e-9 && r <= BAND[1] + 1e-9, `${e.name} (${e.temper}) at ${t} s: ${r.toFixed(2)}× you`);
    if (e.aged && isNaN(k.aged)) k.aged = t;
    if (e.life.progress > 0 && isNaN(k.soup)) k.soup = t;
    if (e.life.progress >= LIFE_S && isNaN(k.alive)) k.alive = t;
    k.gasMax = Math.max(k.gasMax, e.comp.gas ?? 0);
  }
}
const byShare = [...list].sort((a, b) => PROFILE[a.temper].share - PROFILE[b.temper].share), low = byShare[0], high = byShare[list.length - 1];
assert.ok(high.m > low.m, `${high.temper} ends ahead of ${low.temper}`);
assert.ok(low.m > 1e5 * BAND[0], 'they grew with you');
for (const [e, k] of marks) {
  assert.ok(k.soup - k.aged > 60 && k.soup - k.aged < 240, `${e.name}: life ${(k.soup - k.aged).toFixed(0)} s after melting through`);
  assert.ok(k.alive - k.aged < 400, `${e.name}: LIFE ${(k.alive - k.aged).toFixed(0)} s after melting through`);
  assert.ok(k.gasMax < 0.15, `${e.name}: gas ${k.gasMax.toFixed(3)} (the gas line)`);
}
assert.equal(want({ ...list[0], m: 1e5, heat: 6 }), 'none', 'a molten world waits to cool');

// Round robin: skips a dead rival and one on the map.
list[1].alive = false;
list[2].out = true;
assert.equal(next(list, list[0]), list[3]);
assert.equal(next(list, list[3]), list[4]);
assert.equal(next(list, list[4]), list[0]);
console.log(`ledger ok: ${list.map((e) => `${e.name} (${e.temper}) ${(e.m / youAt(1199)).toFixed(2)}×`).join(', ')} at 20:00; ratio range ${worst[0].toFixed(2)}–${worst[1].toFixed(2)}×`);
console.log(`rival worlds ok: ${[...marks].map(([e, k]) => `${e.name} melts at ${k.aged.toFixed(0)} s, life +${(k.soup - k.aged).toFixed(0)} s, LIFE +${(k.alive - k.aged).toFixed(0)} s`).join('; ')}`);

// ---- Rival civilizations [J]: stances, war waves, bolts, duels with waves.
{
  const mood: Mood = { temper: 'hungry', wave: false, shield: 1, fleetShort: false, far: false, seen: 60, stock: 0, level: 1 };
  assert.equal(stance({ ...mood, far: true }), 'explore', 'far: explore');
  assert.equal(stance({ ...mood, seen: 5 }), 'explore', 'just met: explore');
  assert.equal(stance(mood), 'gather', 'no stock: gather');
  assert.equal(stance({ ...mood, stock: 99 }), 'attack', 'stock ready: attack');
  assert.equal(stance({ ...mood, temper: 'careful', stock: 99, shield: 0.3 }), 'defend', 'a Careful one with its shield low: defend');
  assert.equal(stance({ ...mood, stock: 99, rest: true }), 'gather', 'resting after you outran it: gather, no wave');
  for (const temper of ['hungry', 'raider'] as const) assert.equal(stance({ ...mood, temper, stock: 99, shield: 0.05 }), 'attack', `a ${temper} one keeps attacking with its shield low`);
  assert.equal(stance({ ...mood, stock: 99, fleetShort: true }), 'defend', 'fleet short: defend');
  assert.equal(stance({ ...mood, shield: 0, wave: true }), 'attack', 'a wave out keeps its course');
  assert.equal(stance({ ...mood, temper: 'raider', stock: PROFILE.raider.cost * 2 }), 'attack', 'a Raider attacks on less stock');
  assert.equal(stance({ ...mood, temper: 'careful', stock: PROFILE.careful.cost * 2, shield: 0.7 }), 'defend', 'a Careful one defends sooner');
  // The odds (its strength ÷ yours) gate an attack by temper: Careful 1.2, Hungry 0.8, Raider 0.6.
  const odds = strength(3 + waveFighters(2), rivalFrigates(2), 2) / strength(4, 1, 2);
  for (const t of TEMPERS) {
    const m = { ...mood, temper: t, stock: 1e3 };
    assert.equal(stance({ ...m, odds: PROFILE[t].odds }), 'attack', `${t} attacks at its odds`);
    assert.equal(stance({ ...m, odds: PROFILE[t].odds - 0.01 }), 'gather', `${t} waits below its odds`);
  }
  // Personas: a Brute attacks outgunned; a Grudger never starts it, but hurt attacks at any odds; a Jackal waits at even
  // odds and attacks while your shield is under half; a Prober jabs at even odds and stops once hurt; spite emboldens.
  const at = (temper: Temper, odds: number, more: Partial<Mood> = {}) => stance({ ...mood, temper, stock: 1e3, odds, ...more });
  assert.ok(at('brute', 0.3) === 'attack' && at('grudger', 5) === 'gather' && at('grudger', 0.1, { hurt: true }) === 'attack', 'Brute outgunned, Grudger only once hurt');
  assert.ok(at('jackal', 1) === 'gather' && at('jackal', 1, { weak: true }) === 'attack', 'a Jackal waits for your shield to fall under half');
  assert.ok(at('prober', 1) === 'attack' && at('prober', 1, { hurt: true }) === 'gather', 'a Prober stops once hurt');
  assert.ok(at('hungry', 0.6, { spite: 1 }) === 'attack' && at('hungry', 1, { spite: -1 }) === 'gather', 'spite lowers the odds it needs, fear raises them');
  assert.ok(at('jackal', 99, { shield: 0.4 }) === 'defend' && at('prober', 99, { seen: 9 }) === 'attack' && at('grudger', 99, { seen: 20 }) === 'explore', 'defend share and explore time by persona');
  console.log(`odds: an L2 rival (3 home + ${waveFighters(2)} wave fighters, ${rivalFrigates(2)} frigate) against your 4 fighters and a frigate at L2: ${odds.toFixed(2)} → ${(['careful', 'hungry', 'raider'] as Temper[]).filter((t) => odds >= PROFILE[t].odds).join(', ')} attack`);

  // A wave masses its massS s in view (time out of view does not count) before it leaves.
  const w = newWave(3, 0, PROFILE.hungry);
  for (let t = 0; t < 30; t += 0.1) waveStep(w, 0.1, false);
  assert.equal(w.phase, 'mass', 'never leaves unseen');
  let left = 0;
  while (w.phase === 'mass') {
    waveStep(w, 0.1, true);
    left += 0.1;
  }
  assert.ok(left >= PROFILE.hungry.massS - 1e-6 && left < PROFILE.hungry.massS + 0.2, `masses ${left.toFixed(1)} s in view`);
  // It retreats at 40% losses: 5 ships turn at the 2nd loss, 4 at the 2nd, 3 at the 2nd, 2 at the 1st.
  for (const [n, turn] of [[5, 2], [4, 2], [3, 2], [2, 1]]) {
    const v = newWave(n, 0, PROFILE.hungry);
    v.phase = 'go';
    for (let k = 1; k <= n; k++) {
      v.alive = n - k;
      waveStep(v, 0.1, true);
      assert.equal(v.phase, k >= turn ? 'home' : 'go', `wave of ${n} after ${k} lost`);
      if (v.phase === 'home') break;
    }
  }
  const lostF = newWave(3, 1, PROFILE.hungry);
  lostF.phase = 'go';
  lostF.frig = 0;
  waveStep(lostF, 0.1, true);
  assert.equal(lostF.phase, 'home', 'a wave turns home when its frigate is lost');
  const late = newWave(4, 0, PROFILE.hungry);
  late.phase = 'go';
  for (let t = 0; t < PROFILE.hungry.waveS + 0.2; t += 0.1) waveStep(late, 0.1, true);
  assert.equal(late.phase, 'home', 'goes home after its waveS');
  // A persona's wave (newWave's p): a Prober's wave of 3 turns home at its first loss, and by 15 s; a Brute's masses 14 s.
  const jab = newWave(3, 0, PROFILE.prober), jabT = newWave(3, 0, PROFILE.prober), brute = newWave(3, 0, PROFILE.brute);
  [jab.phase, jab.alive, jabT.phase] = ['go', 2, 'go'];
  waveStep(jab, 0.1, true);
  let jt = 0, bt = 0;
  for (; jabT.phase === 'go'; jt += 0.1) waveStep(jabT, 0.1, true);
  for (; brute.phase === 'mass'; bt += 0.1) waveStep(brute, 0.1, true);
  assert.ok(jab.phase === 'home' && jt <= PROFILE.prober.waveS + 0.15 && Math.abs(bt - PROFILE.brute.massS) < 0.15, `Prober home at its first loss and at ${jt.toFixed(1)} s; Brute masses ${bt.toFixed(1)} s`);

  // Duels without the Sling (the user, 2026-11-14): you stay and fight a rival of level L. Your rockets (ROCKET: a magazine of
  // salvo(T), one refilled every ROCKET.reload s, ROCKET.ore each from your stock, all land on its dodging world (the dodge
  // sim below measures 100% over the keep); a frigate of its that is out first, half of them). Its rockets: a salvo of rivalSalvo(L, its salvo) every RIVAL_SALVO s, half land on you as you
  // stay: outside its wave in volleys (restStep) and never on your people (floor: your people), with its wave out within the
  // wave's raid caps. Its war wave by its temper's odds: each fighter's rounds, each frigate's lance salvo; your home fighters,
  // at most two, each kill one wave ship per 3.5 s pass half the time. Your sortie while your shield holds (CALM_S after it
  // falls): every SIEGE.pass s a pair of the siege wing strafes (rounds chip their shield and burn their stock, never people),
  // each frigate's lance salvo every reload (90% land). Win = their people at BEATEN; lose = yours.
  const rnd = lcg(11), F = ARMS.round, Lc = ARMS.lance;
  type You = { T: number; level: number; fighters: number; frigates: number; ore: number };
  const duel = (you: You, L: number, temper: Temper) => {
    const a: Shield = { level: you.level, s: SHIELD_K * you.level }, b: Shield = { level: L, s: SHIELD_K * L }, wa = { k: 0 }, wb = { k: 0 }, capb = { floor: 0, burnt: 0 };
    const yours = strength(you.fighters, you.frigates, you.level), wing = siegeWing(you.fighters), n = salvo(you.T);
    let pa = 1, pb = 1, p60 = 1, ore = you.ore, mag = n, load = 0, cb = 3, stock = 0, mineT = 15, rest = 0, frig = rivalFrigates(L), fhp = 0, lanceT = 0;
    let on = true, calm = 0, passT = SIEGE.pass, myLance = Lc.reload, wave: Wave | undefined, cap = raid(1);
    const hit = (arm: 'round' | 'lance' | 'rocket', k: number, c = cap) => void (pa = weaponHit(a, wa, pa, arm, k, c).P);
    const hurt = (arm: 'round' | 'lance' | 'rocket', k: number) => {
      const h = weaponHit(b, wb, pb, arm, k, capb);
      [pb, stock] = [h.P, Math.max(0, stock - h.burn)];
    };
    for (let t = 0; t < 900; t += 0.1) {
      if (t <= 60) p60 = pa;
      shieldRegen(a, 0.1);
      shieldRegen(b, 0.1);
      const gone = wave?.phase === 'go';
      if (mag < n && (load += 0.1) >= ROCKET.reload) [mag, load] = [mag + 1, 0];
      if (mag >= 1 && ore >= ROCKET.ore) {
        [mag, ore] = [mag - 1, ore - ROCKET.ore];
        if (gone && wave!.frig > 0) { if (rnd() < 0.5 && ++fhp >= Lc.rivalHull) [wave!.frig, frig, fhp] = [wave!.frig - 1, frig - 1, 0]; } // at its frigate first
        else if (rnd() < 0.61) hurt('rocket', ROCKET.k); // the share that lands on its dodging world (the dodge sim below: 61% over the keep; user 2026-11-18: a small margin to dodge)
      }
      rest = restStep(rest, a.s <= 0, 0.1);
      if ((gone || volley(!!wave, rest)) && (cb -= 0.1) <= 0) {
        cb = RIVAL_SALVO;
        for (let i = 0; i < rivalSalvo(L, PROFILE[temper].salvo); i++) if (rnd() < 0.5) hit('rocket', ROCKET.k, gone ? cap : { floor: pa, burnt: 0 }); // half: approximate
      }
      // Your sortie (rules.ts sortieStep: off with your shield down, then CALM_S).
      calm = Math.max(0, calm - 0.1);
      if (on && a.s <= 0) [on, calm] = [false, CALM_S];
      else if (!on && !calm && a.s > 0) on = true;
      if (on) {
        if ((passT -= 0.1) <= 0) [passT] = [SIEGE.pass, ...Array.from({ length: Math.min(2, wing) * FLEET.fighter.rounds * FLEET.fighter.bursts }, () => rnd() < F.hit && hurt('round', F.k))];
        if (you.frigates && (myLance -= 0.1) <= 0) [myLance] = [Lc.reload, ...Array.from({ length: Lc.salvo * you.frigates }, () => rnd() < Lc.hit && hurt('lance', Lc.k))];
      }
      stock += STOCK_RATE * L * 0.1;
      if (!wave && (mineT -= 0.1) <= 0) [mineT, stock] = [15, stock + GATHER_U];
      const st = stance({ temper, wave: !!wave, shield: b.s / shieldMax(b), fleetShort: false, far: false, seen: t, stock, level: L, odds: strength(L + 1 + waveFighters(L), frig, L) / yours, hurt: pb < 1, weak: a.s < 0.5 * shieldMax(a) });
      if (st === 'attack' && !wave) [wave, stock, lanceT] = [newWave(waveFighters(L) + frig, frig, PROFILE[temper]), stock - PROFILE[temper].cost * waveFighters(L), Lc.reload];
      if (wave) {
        const was = wave.phase;
        waveStep(wave, 0.1, true);
        if (was === 'mass' && wave.phase === 'go') cap = raid(pa);
        if (wave.phase === 'go') {
          const fighters = wave.alive - wave.frig;
          if (rnd() < (fighters * FLEET.fighter.rounds * FLEET.fighter.bursts * F.hit * 0.5 * 0.1) / F.run) hit('round', F.k); // half of each fighter's run lands on your world
          if (wave.frig > 0 && (lanceT -= 0.1) <= 0) [lanceT] = [Lc.reload, ...Array.from({ length: Lc.salvo * wave.frig }, () => rnd() < Lc.hit && hit('lance', Lc.k))];
          if (pa <= cap.floor * 1.001) wave.phase = 'home';
          for (let k = 0; k < Math.min(2, on ? you.fighters - wing : you.fighters); k++) if (fighters > 0 && rnd() < (0.5 * 0.1) / 3.5) wave.alive--;
        }
        if (wave.phase === 'home' || !wave.alive) wave = undefined;
      }
      if (pb <= BEATEN) return { t, p60, pa };
      if (pa <= BEATEN) return { t: -t, p60, pa };
    }
    return { t: Infinity, p60, pa };
  };
  const tiers: Record<number, You> = {
    1: { T: 1, level: 1, fighters: START_SHIPS, frigates: 0, ore: START_ORE }, // a new civilization: L1 shield, two fighters, 10 ore
    3: { T: 3, level: 2, fighters: 4, frigates: 1, ore: 60 },
    5: { T: 5, level: 3, fighters: 6, frigates: 2, ore: 120 },
  };
  const rate = (T: number, L: number, temper: Temper = 'hungry') => {
    const rs = Array.from({ length: 300 }, () => duel(tiers[T], L, temper)), won = rs.filter((r) => r.t > 0 && Number.isFinite(r.t)), lost = rs.filter((r) => r.t < 0);
    const med = (xs: number[]) => xs.sort((x, y) => x - y)[xs.length >> 1] ?? NaN;
    return { win: won.length / rs.length, lose: lost.length / rs.length, wonT: med(won.map((r) => r.t)), lostT: med(lost.map((r) => -r.t)), left: won.reduce((q, r) => q + r.pa, 0) / Math.max(1, won.length), held60: rs.filter((r) => r.p60 >= 0.5).length / rs.length };
  };
  const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
  // Rivals by temper (user, 2026-11-15: "rivals can beat me, some don't; sometimes I need to run, sometimes fight"), each at
  // the level it meets you (rivalLevel at 0 s). Tier 1 never wins a duel (rounds never take people): it holds or leaves.
  const meet = (t: Temper) => rivalLevel(0, 1, PROFILE[t].lead), row = (T: number, L: number, t: Temper, r: ReturnType<typeof rate>, label: string) =>
    console.log(`duel, tier ${T} ${label} vs ${t} L${L}: win ${pct(r.win)} (median ${r.wonT.toFixed(0)} s, people left ${r.left.toFixed(2)}), lose ${pct(r.lose)} (median ${r.lostT.toFixed(0)} s), ≥ 50% people at 60 s in ${pct(r.held60)}`);
  const t1 = (t: Temper, L = meet(t)) => { const r = rate(1, L, t); row(1, L, t, r, '(L1 shield, 2 fighters, 10 ore)'); assert.ok(r.held60 >= 0.9, `there is time to leave a ${t} rival: ≥ 50% of your people at 60 s in ${r.held60}`); return r; };
  const careful1 = t1('careful'), hungry1 = t1('hungry'), raider1 = t1('raider');
  t1('hungry', 2);
  assert.ok(careful1.lose <= 0.1 && careful1.win <= 0.1, `a Careful rival cannot beat a new civilization: hold (lose ${careful1.lose})`);
  assert.ok(hungry1.win <= 0.1 && hungry1.lose >= 0.7 && hungry1.lostT >= 240, `a Hungry rival beats a new civilization that stays, over minutes (lose ${hungry1.lose}, ${hungry1.lostT} s)`);
  assert.ok(raider1.lose >= 0.9 && raider1.lostT <= 360, `a Raider beats a new civilization fast: run (lose ${raider1.lose}, ${raider1.lostT} s)`);
  const t3 = (t: Temper, L: number) => { const r = rate(3, L, t); row(3, L, t, r, '(L2 shield, 4 fighters, a frigate, 60 ore)'); return r; };
  const careful3 = t3('careful', 1), hungry3 = t3('hungry', 2), raider3 = t3('raider', 3);
  t3('hungry', 3);
  assert.ok(careful3.win >= 0.9, `with a frigate you beat a Careful rival (${careful3.win})`);
  assert.ok(hungry3.win >= 0.7, `with a frigate you win >= 70% vs an equal rival (${hungry3.win})`);
  assert.ok(raider3.win >= 0.5 && raider3.lose >= 0.02, `a Raider one level up is a contest: it sometimes beats you (win ${raider3.win}, lose ${raider3.lose})`);
  for (const [t, L] of [['careful', 2], ['hungry', 3], ['hungry', 4], ['raider', 4]] as const) row(5, L, t, rate(5, L, t), '(L3 shield, 6 fighters, two frigates, 120 ore)');
  // The other personas, at the level each meets you (after the rows above, so their draws stay put).
  const more: Temper[] = ['brute', 'stalker', 'jackal', 'prober', 'grudger'];
  for (const t of more) t1(t);
  for (const t of more) t3(t, rivalLevel(0, 2, PROFILE[t].lead));
  // The pad's tell by persona (TELL): a second or more, shorter than its wave's massing; pure; 0..hot, ending at hot × dim on a
  // steady last COMMIT share; Brute shortest and hottest, Stalker longest; only the Jackal reads your shield; Prober flickers 4 times, Grudger 2.
  {
    const curve = (t: Temper, weak = false, n = 600) => Array.from({ length: n + 1 }, (_, i) => tell(t, (i / n) * TELL[t].s, weak));
    for (const t of TEMPERS) {
      const T = TELL[t], c = curve(t), last = c.slice(Math.ceil(600 * (1 - COMMIT)));
      assert.ok(T.s >= TELL_MIN && T.s < PROFILE[t].massS, `${t}: the tell lasts ${TELL_MIN}+ s, under its massing (${T.s} s)`);
      assert.ok(tell(t, 0.7) === tell(t, 0.7) && c.every((k) => k >= 0 && k <= T.hot + 1e-9), `${t}: the tell is pure and within 0..hot`);
      assert.ok(Math.abs(tell(t, T.s) - T.hot * T.dim) < 1e-9 && tell(t, 9) === tell(t, T.s) && last.every((k, i) => !i || k >= last[i - 1] - 1e-12), `${t}: it ends at hot × dim, steady over the last ${COMMIT}`);
      assert.equal(curve(t, true).some((k, i) => k !== c[i]), t === 'jackal', `${t}: ${t === 'jackal' ? 'brightens' : 'ignores'} your weak shield`);
      const peaks = c.slice(0, Math.floor(600 * (1 - COMMIT))).filter((k, i, a) => i > 0 && i < a.length - 1 && k > a[i - 1] && k >= a[i + 1]).length;
      assert.equal(peaks, T.blink, `${t}: ${T.blink} flickers before it commits`);
    }
    const s = TEMPERS.map((t) => TELL[t].s), hot = TEMPERS.map((t) => TELL[t].hot);
    assert.ok(TELL.brute.s === Math.min(...s) && TELL.brute.hot === Math.max(...hot) && TELL.stalker.s === Math.max(...s), 'Brute: shortest and hottest; Stalker: longest');
    assert.equal(new Set(TEMPERS.map((t) => JSON.stringify(TELL[t]))).size, TEMPERS.length, 'every persona has its own tell');
  }
  assert.ok(rivalLevel(0, 1, PROFILE.raider.lead) === 2, 'a Raider meets a new civilization one level up');
  // You can flee: a rival world's engines (A_ENG) cannot hold you accelerating away at 2 R/s² from 10 R: past ENGAGE (30 R) within 8 s.
  {
    const flee = (cap = A_ENG, close?: number) => {
      let ox = 10, vx = 0, t = 0;
      for (; t < 30 && ox < 30; t += 0.05) {
        const dv = stationStep(ox, 0, vx, 0, 10, 0.004, 1, 0.05, false, 0, 0, cap, undefined, close);
        vx += 2 * 0.05 + dv.x;
        ox += vx * 0.05;
      }
      return { ox, t };
    };
    const { ox, t } = flee();
    console.log(`fleeing at 2 R/s² from 10 R: past 30 R in ${t.toFixed(1)} s (A_ENG); by persona ${TEMPERS.map((p) => `${p} ${flee(PROFILE[p].eng, PROFILE[p].close).t.toFixed(1)}`).join(', ')} s`);
    assert.ok(ox >= 30 && t <= 8, `you outrun a rival world (${ox.toFixed(1)} R at ${t.toFixed(1)} s)`);
  }
}
// ---- A rival world in the field's gravity (asteroid/rules.ts gravitates: WORLD_FLAGS), its engines (stationStep). Two
// bodies, field gravity (G_WORLD · pairPull, d ≥ contact): you 1e5 at rest, a 0.551× rival 10 R off you.
{
  assert.ok(gravitates(WORLD_FLAGS), 'a rival world gravitates');
  const z = stationStep(10, 0, 0, 0, 10, 0.1, 1, 0.1, true);
  assert.ok(z.x === 0 && z.y === 0, 'beaten: engines off');
  const mY = 1e5, mR = 0.551 * mY, R = radiusOf(mY, COMP.stony), r = radiusOf(mR, { rock: 0.55, metal: 0.15, ice: 0.25, gas: 0.05 }), k = pairPull(youPull(mY, R), mY, pullMass(mR, mY), mR);
  const sim = (beaten: boolean, orbit: boolean, T: number, fed = false) => { // fed: its last thrust fed back (`was`, as rivals.ts runs it)
    const y = { x: 0, y: 0, vx: 0, vy: 0 }, w = { x: 10 * R, y: 0, vx: 0, vy: 0 }, dt = 1 / 60;
    if (orbit) { // its circular relative speed, split by mass (you keep the momentum's other share)
      const v = Math.sqrt((G_WORLD * k * (mY + mR)) / (10 * R));
      [w.vy, y.vy] = [(v * mY) / (mY + mR), (-v * mR) / (mY + mR)];
    }
    let lo = Infinity, hi = 0, touch = Infinity, dv = 0, thrust = 0, was = { x: 0, y: 0 };
    for (let t = 0; t < T; t += dt) {
      const dx = w.x - y.x, dy = w.y - y.y, d = Math.hypot(dx, dy), dd = Math.max(d, R + r), f = (G_WORLD * k * dt) / dd ** 3;
      [w.vx, w.vy, y.vx, y.vy] = [w.vx - dx * f * mY, w.vy - dy * f * mY, y.vx + dx * f * mR, y.vy + dy * f * mR];
      const e = stationStep(dx / R, dy / R, (w.vx - y.vx) / R, (w.vy - y.vy) / R, 10, (G_WORLD * k * (mY + mR)) / dd ** 2 / R, 1, dt, beaten, 0, 0, A_ENG, fed ? was : undefined);
      [w.vx, w.vy, thrust, was] = [w.vx + e.x * R, w.vy + e.y * R, Math.max(thrust, Math.hypot(e.x, e.y) / dt), { x: e.x / dt, y: e.y / dt }];
      for (const p of [w, y]) [p.x, p.y] = [p.x + p.vx * dt, p.y + p.vy * dt];
      const g = Math.hypot(w.x - y.x, w.y - y.y) / R;
      if (t > 10) [lo, hi] = [Math.min(lo, g), Math.max(hi, g)];
      if (g * R <= R + r && touch === Infinity) touch = t;
      dv = Math.max(dv, Math.hypot(y.vx, y.vy) / R);
    }
    return { lo, hi, touch, dv, thrust };
  };
  const alive = sim(false, false, 120), fed = sim(false, false, 120, true), parked = sim(true, false, 20), coast = sim(true, true, 120);
  const pull10 = (G_WORLD * k * mR) / (10 * R) ** 2 / R;
  console.log(`two worlds (you 1e5, a 0.551× rival from 10 R; your pull from it at 10 R ${pull10.toFixed(3)} R/s²): alive, from rest, kept ${alive.lo.toFixed(1)}–${alive.hi.toFixed(1)} R for 120 s, engines ≤ ${alive.thrust.toFixed(2)} R/s² (A_ENG ${A_ENG}), your speed up to ${alive.dv.toFixed(2)} R/s; beaten and parked touches you at ${parked.touch.toFixed(1)} s; beaten on its orbit ${coast.touch === Infinity ? 'never touches' : `touches at ${coast.touch.toFixed(1)} s`} (${coast.lo.toFixed(1)}–${coast.hi.toFixed(1)} R)`);
  assert.ok(alive.lo >= 8 && alive.hi <= 12 && alive.dv > 0.05 && alive.thrust <= A_ENG + 1e-9, 'a live rival orbits you 8–12 R off, and its pull moves you');
  console.log(`  with its last thrust fed back (rivals.ts): kept ${fed.lo.toFixed(1)}–${fed.hi.toFixed(1)} R, engines ≤ ${fed.thrust.toFixed(2)} R/s², your speed up to ${fed.dv.toFixed(2)} R/s`);
  assert.ok(fed.lo >= 8 && fed.hi <= 12 && fed.dv > 0.05 && fed.thrust <= A_ENG + 1e-9, 'fed back, a live rival still orbits you 8–12 R off');
  assert.ok(parked.touch < 20, 'a beaten world parked beside you falls in within 20 s');
  assert.ok(coast.touch === Infinity && coast.hi < 30, 'a beaten world on its orbit stays bound, never touching, 120 s');
  // Its dodge (DODGE, as civilization/rivals.ts keepStation runs it, at DODGE.a where the game passes its own thrust, asteroid/
  // player.ts thrustOf): your rockets (rules.ts ROCKET, guns.ts createRockets: a salvo of 1–3 off your surface, pads
  // alternating) at it on its circular station `keep` R off you; it sees the launch, reacts after 0–0.4 s, builds its thrust
  // over DODGE.ramp (its last thrust fed back) across the rocket's line of sight, the way it already crosses it, until they
  // are gone, then brakes back onto its station (A_ENG engines alone cannot get it out of the way). The rockets fly by real
  // thrust (nose ≤ ROCKET.turn, push ≤ ROCKET.acc), 25.2 R (one moon slot): whichever way it steps, from 8 R nearly all land,
  // from 12 R all, and a salvo of 2–3 always lands one.
  const s0 = sidestep(5, 0.1, 9, 0);
  assert.ok(s0.y > 0 && Math.abs(s0.x) < 0.03 * DODGE.v, 'it steps across a rocket\'s line of sight, on its miss\'s side');
  assert.ok(sidestep(5, 0.1, 9, 0, -1).y < 0, 'or the way it already crosses that line');
  const fan = evade({ x: 0, y: 0, vx: 0, vy: 0 }, [{ x: -5, y: -0.1, vx: 9, vy: 0 }, { x: -5, y: -0.2, vx: 9, vy: 0 }, { x: 5, y: 0, vx: 9, vy: 0 }]);
  assert.ok(fan.n === 2 && Math.abs(Math.hypot(fan.x, fan.y) - DODGE.v) < 1e-9, 'sidesteps sum up to DODGE.v; a rocket that passed is no threat');
  { // the ramp: a goal velocity alone (on station, no pull, at rest), cap 7 R/s²; thrust = Δv / dt
    const dt = 1 / 60, go = (ay: number, was?: { x: number; y: number }) => stationStep(10, 0, 0, 0, 10, 0, 1, dt, false, 0, ay, 7, was).y / dt, step = (7 / DODGE.ramp) * dt;
    let T = 0, n = 0;
    for (; n < Math.round(DODGE.ramp * 60) - 1; n++) T = go(50, { x: 0, y: T });
    const full = go(50, { x: 0, y: T });
    assert.ok(Math.abs(go(50, { x: 0, y: 0 }) - step) < 1e-6, `from rest it builds cap / ramp a second (${go(50, { x: 0, y: 0 })})`);
    assert.ok(T < 7 && Math.abs(full - 7) < 1e-9, `full thrust after ramp s, not before (${T.toFixed(3)}, then ${full})`);
    assert.ok(Math.abs(go(50, { x: 0, y: -7 }) - step) < 1e-6, 'a reversal dips to zero and builds again');
    assert.ok(Math.abs(go(0.001, { x: 0, y: 7 }) - 0.001 / dt) < 1e-9, 'cutting is instant');
    assert.ok(Math.abs(go(50) - 7) < 1e-12, 'without `was`, full thrust at once (as before)');
  }
  const rnd = lcg(11), sideRnd = lcg(23); // sideRnd: the pads' own stream, it never shifts the dodge's draws
  /** `n` salvos of 1–3 at a rival keeping `keepOf()` R off, dodging at `burn` R/s² (or on A_ENG alone). Land share, the fewest landed of a salvo of 2–3, slowest station speed after, steepest thrust rise. */
  const salvos = (n: number, keepOf: () => number, dodge = true, burn = DODGE.a) => {
    let fired = 0, landed = 0, slow = 0, ease = 0, rise = 0, floor = Infinity;
    for (let i = 0; i < n; i++) {
      const keep = keepOf(), turn = rnd() < 0.5 ? -1 : 1, b = rnd() * 2 * Math.PI, pull = (d: number) => (G_WORLD * k * (mY + mR)) / Math.max(d, R + r) ** 2;
      const c = Math.sqrt((pull(keep * R) / R) * keep) * turn * R, w = { x: Math.cos(b) * keep * R, y: Math.sin(b) * keep * R, vx: -Math.sin(b) * c, vy: Math.cos(b) * c };
      const world = { m: mR, r, motion: w }, pool = createRockets(12, sideRnd), salvo = 1 + Math.floor(rnd() * 3), dt = 1 / 60, seek = () => ({ ...w, r });
      for (let j = 0; j < salvo; j++) pool.launch(rocketAt(R, { tx: w.x, ty: w.y, target: world, seek }));
      fired += salvo;
      let alarm = -DODGE.react[1] * rnd(), gone = Infinity, worst = 0, back = 0, was = { x: 0, y: 0 }, got = 0;
      const end = () => gone + DODGE.brake + 1;
      for (let t = 0; t < end(); t += dt) {
        const ev = evade(w, pool.live.filter((m) => !m.dead)), [ax, ay] = (alarm = alarmStep(alarm, ev.n > 0, dt, rnd)) > 0 ? [ev.x, ev.y] : [0, 0];
        const d = Math.hypot(w.x, w.y), g = (pull(d) * dt) / d, e = stationStep(w.x / R, w.y / R, w.vx / R, w.vy / R, keep, pull(d) / R, turn, dt, false, ax, ay, dodge && alarm > 0 ? burn : A_ENG, was);
        rise = Math.max(rise, (Math.hypot(e.x, e.y) / dt - Math.hypot(was.x, was.y)) / dt);
        was = { x: e.x / dt, y: e.y / dt };
        [w.vx, w.vy] = [w.vx - w.x * g + e.x * R, w.vy - w.y * g + e.y * R];
        if (pool.live.length) pool.step(dt, [world], [], 0, () => void got++, () => {});
        if (ev.n) gone = Infinity; // one coming round again: still dodging
        else if (gone === Infinity) gone = t; // the last one has hit, died or passed
        [w.x, w.y] = [w.x + w.vx * dt, w.y + w.vy * dt];
        const cd = Math.sqrt((pull(d) / R) * (d / R)) * turn * R; // its circular speed here: off the dodge, it sails on its station again
        if (t > end() - dt) [worst, back] = [Math.abs((w.x * w.vy - w.y * w.vx) / d - cd) / R, Math.abs((w.x * w.vx + w.y * w.vy) / d) / R]; // off its circular speed; easing back to its kept distance
      }
      [slow, ease, landed] = [Math.max(slow, worst), Math.max(ease, back), landed + got];
      if (salvo > 1) floor = Math.min(floor, got);
    }
    return { land: landed / fired, slow, ease, rise, floor, burn };
  };
  const l8 = salvos(200, () => 8), l12 = salvos(200, () => 12);
  const all = salvos(300, () => 8 + 4 * rnd()), soft = salvos(200, () => 8 + 4 * rnd(), true, 5), hard = salvos(200, () => 8 + 4 * rnd(), true, 14);
  const cruise = salvos(100, () => 8 + 4 * rnd(), false), pc = (x: number) => (100 * x).toFixed(0);
  console.log(`your rockets (${ROCKET.speed} R/s, ≤ ${ROCKET.turn} rad/s, pads ±${ROCKET.pad} rad, alternating) at a dodging rival world (burn ${DODGE.a} R/s² built over ${DODGE.ramp} s, react 0–${DODGE.react[1]} s): land ${pc(l8.land)} / ${pc(l12.land)}% from 8 / 12 R, ${pc(all.land)}% over keep 8–12 R (burn 5: ${pc(soft.land)}%, 14: ${pc(hard.land)}%), ${pc(cruise.land)}% on A_ENG engines alone; a salvo of 2–3 lands at least ${Math.min(all.floor, l8.floor, l12.floor, soft.floor, hard.floor)}; thrust rises ≤ ${Math.max(all.rise, l8.rise).toFixed(1)} R/s³; ${DODGE.brake + 1} s after the last one at worst ${all.slow.toFixed(2)} R/s off its circular speed, easing back to its distance at ≤ ${all.ease.toFixed(2)} R/s`);
  // A small margin to dodge, bots and players alike (user, 2026-11-18): close in nearly all land, from far a good burn slips most.
  assert.ok(l8.land >= 0.95, `from 8 R nearly all land (${l8.land})`);
  assert.ok(l12.land >= 0.1 && l12.land <= 0.5, `from 12 R it has time to burn across: most slip, not all (${l12.land})`);
  assert.ok(all.land >= 0.5 && all.land <= 0.7, `over keep 8–12 R it slips 30–50%, about your own share (${all.land})`);
  assert.ok(soft.land >= 0.95 && hard.land >= 0.2 && hard.land < all.land, `a weak burn (5 R/s²) slips none, a strong one (14 R/s²) more, never all (${soft.land}, ${hard.land})`);
  assert.ok(l8.floor >= 1 && soft.floor >= 1, 'from 8 R, or at a weak burn, every salvo of 2–3 lands at least one');
  assert.ok(cruise.land >= 0.95, `A_ENG engines alone hardly get it out of the way (${cruise.land})`);
  assert.ok(all.slow < 0.5 && all.ease <= 3, `DODGE.brake + 1 s after the last rocket it sails its station again (under 0.5 R/s off: ${all.slow}), only easing back to its distance (${all.ease} R/s, ledger CLOSE_V 3)`);
  for (const s of [l8, l12, all, soft, hard, cruise]) assert.ok(s.rise <= s.burn / DODGE.ramp + 1e-6, `thrust builds, never jumps (${s.rise} R/s³)`);
}
// Rocket volleys outside a wave (playtest J): none while your shield is down and for REST_S after. An L1 shield (30 K,
// 0.3 K/s) under a peer's salvos of 2 rockets (ROCKET.k, half land, every RIVAL_SALVO s) for 10 min: without the rest it
// stays low; with it it mends between volleys.
{
  assert.ok(!volley(true, 0) && volley(false, 0) && !volley(false, 1), 'volleys pause while a wave is out or resting');
  let rest = 5;
  for (let t = 0; t < 20; t += 0.1) rest = restStep(rest, true, 0.1);
  assert.equal(rest, REST_S, 'the rest holds while your shield is down');
  rest = restStep(rest, false, REST_S - 0.05);
  assert.ok(!volley(false, rest) && volley(false, restStep(rest, false, 0.1)), 'and runs out REST_S after it is back up');
  const rnd = lcg(5);
  const run = (volleys: boolean) => {
    const sh: Shield = { level: 1, s: SHIELD_K };
    let cb = 3, rest = 0, down = 0, broke = false, top = 0;
    for (let t = 0; t < 600; t += 0.1) {
      shieldRegen(sh, 0.1);
      rest = restStep(rest, sh.s <= 0, 0.1);
      if ((!volleys || volley(false, rest)) && (cb -= 0.1) <= 0) {
        cb = RIVAL_SALVO;
        for (let i = 0; i < 2; i++) if (rnd() < 0.5) shieldShot(sh, ROCKET.k); // weapon fire (rules.ts shieldShot), as rivals.ts lands it
      }
      if (sh.s <= 0) [down, broke] = [down + 0.1, true];
      else if (broke && t > 120) top = Math.max(top, sh.s / shieldMax(sh)); // after the first volleys
    }
    return { down: down / 600, top };
  };
  const off = run(false), on = run(true);
  console.log(`L1 shield under a peer's rocket salvos for 10 min: without the rest down ${(100 * off.down).toFixed(0)}% of the time, back to ${(100 * off.top).toFixed(0)}% at best; with it (rest ${REST_S} s) down ${(100 * on.down).toFixed(0)}%, back to ${(100 * on.top).toFixed(0)}% between volleys`);
  assert.ok(off.top < 0.5, `without the rest the shield stays low (${off.top})`);
  assert.ok(on.top >= 0.3 && on.down < 0.4, `with it it mends between volleys (${on.top}, down ${on.down})`);
}
// Pursuit: outrun (outside its keep + slack, the gap growing) a world lets go after its temper's patience, then rests
// its rest s; one keeping station beside you (at its distance, or closing) never lets go.
{
  const dt = 0.1, letGo = (t: Temper, d: number, dd: number, T = 300, spite = 0) => {
    const p = { slow: 0, rest: 0 };
    for (let s = 0; s < T; s += dt) if (!pursueStep(p, t, d, 10, dd, dt, spite)) return s + dt;
    return Infinity;
  };
  const at = TEMPERS.map((t) => letGo(t, 20, 2));
  at.forEach((s, i) => assert.ok(Math.abs(s - PROFILE[TEMPERS[i]].patience) < 0.2, `${TEMPERS[i]} lets go at its patience: ${s}`));
  assert.equal(letGo('careful', 10, 0, 600), Infinity, 'at station beside you: follows');
  assert.equal(letGo('careful', 20, -1, 600), Infinity, 'closing on you: follows');
  assert.ok(Math.abs(letGo('hungry', 20, 2, 300, 1) - 2 * PROFILE.hungry.patience) < 0.2 && Math.abs(letGo('hungry', 20, 2, 300, -1) - 0.5 * PROFILE.hungry.patience) < 0.2, 'spite +1 doubles its patience; −1 halves it (the floor)');
  const backAt = TEMPERS.map((t) => {
    const p = { slow: 0, rest: 0 };
    let s = 0, back = -1;
    for (; s < 600 && back < 0; s += dt) if (pursueStep(p, t, 20, 10, 2, dt) && p.slow > 0 && s > PROFILE[t].patience) back = s;
    assert.ok(back >= PROFILE[t].patience + PROFILE[t].rest - 0.2, `${t} rests ${PROFILE[t].rest} s before it follows again: ${back}`);
    return back;
  });
  console.log(`pursuit: outrun, a world lets go after ${TEMPERS.map((t, i) => `${t} ${at[i].toFixed(1)}`).join(' / ')} s, follows again at ${backAt.map((v) => v.toFixed(0)).join(' / ')} s; at station it never lets go`);
  // Memory (remember): clamped to −1..1, by group.
  const e = (temper: Temper) => ({ ...list[0], temper, spite: 0 }), b = e('brute'), j = e('jackal'), c = e('prober');
  [b, j, c].forEach((x) => remember(x, 'hurt'));
  assert.ok(b.spite === 0.5 && j.spite === 0.5 && c.spite === -0.5, 'hurt: bold and mid angrier, cautious warier');
  [b, j, c].forEach((x) => (remember(x, 'beaten'), remember(x, 'beaten')));
  assert.ok(b.spite === 1 && j.spite === -1 && c.spite === -1, 'beaten twice: clamped');
  remember(c, 'won');
  assert.equal(c.spite, -0.5, 'it won: +0.5 for all');
  // Catching up (keepStation's gates: engines only within ENGAGE 30 R and while it follows, pursueStep): you pass it at
  // 6 R/s on its kept 10 R; a Stalker's engines and closing speed bring it back onto station, a Hungry one's fall behind.
  const station = (t: Temper) => {
    const P = PROFILE[t], q = { slow: 0, rest: 0 }, h = 1 / 60;
    let x = -10, y = 0, vx = -6, vy = 0, was = { x: 0, y: 0 };
    for (let s = 0; s < 60; s += h) {
      const d = Math.hypot(x, y), dd = (x * vx + y * vy) / d;
      if (d > 30 || !pursueStep(q, t, d, 10, dd, h)) return -s;
      if (s > 1 && Math.abs(d - 10) < 1 && Math.abs(dd) < 0.5) return s;
      const g = stationStep(x, y, vx, vy, 10, 0, 1, h, false, 0, 0, P.eng, was, P.close);
      [vx, vy, was] = [vx + g.x, vy + g.y, { x: g.x / h, y: g.y / h }];
      [x, y] = [x + vx * h, y + vy * h];
    }
    return -60;
  };
  const back = TEMPERS.map(station);
  console.log(`passed at 6 R/s on station: ${TEMPERS.map((t, i) => `${t} ${back[i] > 0 ? `back at ${back[i].toFixed(1)} s` : `lost at ${(-back[i]).toFixed(1)} s`}`).join(', ')}`);
  assert.ok(back[TEMPERS.indexOf('stalker')] > 0 && back[TEMPERS.indexOf('hungry')] < 0, 'a Stalker catches up from behind, a Hungry one does not');
}
console.log('rival civilizations ok');
