// node test/civilization/escape.test.ts: pirate shields soak rounds and mend after a rest (never while spooling); a
// leaving fleet is routed under 20% or when pressed, jumps ROUT_S s later (JUMP_S at most), haulers first; the spool
// fires once and ends at JUMP.spool at any frame rate, at once off screen.
import assert from 'node:assert/strict';
import { delay, JUMP, jumpAt, LEAD, mend, MEND, pressed, PRESS_S, REST, ROUT, ROUT_S, routAt, soak, spool, SPREAD, type Warp } from '../../src/evolution/civilization/escape.ts';
import { JUMP_S, PIRATE_CLASS, RETREAT } from '../../src/evolution/civilization/rules.ts';

const ship = (kind: Warp['kind']): Warp => ({ x: 0, y: 0, heading: 0, kind, dead: false, sh: PIRATE_CLASS[kind].shield, calm: 99, flare: 0, spool: 0 });

// Soak: a raider's first round is soaked, the second reaches the hull; caps 1 / 2 / 3 rounds.
{
  assert.deepEqual([PIRATE_CLASS.raider.shield, PIRATE_CLASS.hauler.shield, PIRATE_CLASS.marauder.shield], [1, 2, 3]);
  const s = ship('raider'), fl = { hurt: 99 };
  assert.ok(soak(s, fl) && fl.hurt === 0 && s.calm === 0 && s.flare > 0, 'the first round is soaked and presses the fleet');
  assert.ok(!soak(s, fl), 'the second reaches the hull');
  const m = ship('marauder');
  assert.ok(soak(m) && soak(m) && soak(m) && !soak(m), 'a marauder soaks three');
}

// Mend: nothing before REST; full after REST + cap × MEND; never above the cap; none while spooling.
{
  const s = ship('marauder'), max = PIRATE_CLASS.marauder.shield;
  s.sh = 0;
  soak(s);
  let t = 0;
  for (; t < REST - 0.05; t += 0.05) mend(s, max, 0.05);
  assert.equal(s.sh, 0, 'no mending before REST');
  for (; t < REST + max * MEND + 0.1; t += 0.05) mend(s, max, 0.05);
  assert.equal(s.sh, max, 'full after REST + cap × MEND, never above');
  s.spool = 0.1;
  mend(s, max, 0.05);
  assert.equal(s.sh, 0, 'a spooling ship has no shield');
}

// Thresholds for n0 = 1..14: the fleet leaves (RETREAT) before it is routed by share (ROUT); the share rule only fires from n0 6.
{
  const share: number[] = [];
  for (let n0 = 1; n0 <= 14; n0++) {
    const leaveAt = Math.floor((1 - RETREAT) * n0), routBy = Math.ceil(ROUT * n0) - 1; // living ships at which each fires
    assert.ok(leaveAt >= routBy, `n0 ${n0}: leave at ${leaveAt} alive before the rout at ${routBy}`);
    if (routBy >= 1) share.push(n0);
  }
  assert.equal(share[0], 6, 'the share rule needs a fleet of 6');
  assert.equal(routAt(-1, 3, 0.5, false), -1);
  assert.equal(routAt(-1, 3, 0.1, false), 3);
  assert.equal(routAt(-1, 4, 0.5, true), 4);
  assert.equal(routAt(4, 9, 0.5, false), 4, 'a rout latches');
}

// jumpAt: unrouted JUMP_S; routed ROUT_S later, never past JUMP_S.
assert.equal(jumpAt(-1), JUMP_S);
assert.equal(jumpAt(2), 2 + ROUT_S);
assert.equal(jumpAt(12), JUMP_S);

// Pressed: a recent hit; you closing inside PRESS_R; a still world they fly away from is not.
assert.ok(pressed(PRESS_S - 0.1, 50, 0, 6));
assert.ok(pressed(99, 8, 3, 6));
assert.ok(!pressed(99, 8, -3, 6) && !pressed(99, 20, 3, 6));

// Spool at 30 and 120 fps: begins once (shield gone), gone within a frame of JUMP.spool; off screen gone at once.
for (const fps of [30, 120]) {
  const s = ship('hauler'), dt = 1 / fps;
  let began = 0, t = 0, end = -1;
  for (let k = 0; k < fps * 3 && end < 0; k++, t += dt) {
    const j = spool(s, t - 0.5, dt, true);
    if (j === 1) began++;
    if (j === 2) end = t - 0.5;
  }
  assert.ok(began === 1 && s.sh === 0, `${fps} fps: spooling begins once`);
  assert.ok(Math.abs(end - JUMP.spool) <= dt + 1e-9, `${fps} fps: gone at ${end.toFixed(3)} s`);
}
assert.equal(spool(ship('raider'), 0, 1 / 60, false), 2, 'off screen: gone at once');
assert.equal(spool(ship('raider'), -0.1, 1 / 60, true), 0);

// Delay: haulers first, gun ships LEAD..LEAD + SPREAD s after, each at its own moment.
assert.equal(delay('hauler', 12345), 0);
for (const k of [0, 37, 99, 123456]) {
  const d = delay('raider', k);
  assert.ok(d >= LEAD && d <= LEAD + SPREAD, `delay ${d}`);
}
console.log(`escape: shields 1/2/3 rounds, mend ${REST} s + ${MEND} s a round; rout under ${ROUT * 100}% or pressed, jumps ${ROUT_S} s later (≤ ${JUMP_S} s), spool ${JUMP.spool} s`);
