import { JUMP_S, PIRATE_CLASS } from './rules.ts';

// Pirate ship shields and the rout: when a leaving fleet is beaten down or pressed, its ships spool their drives and jump
// out one by one (pirates.ts flies it, bolts.ts draws it). Pure, Node-safe (escape.test.ts).

export const ROUT = 0.2; // living share of the fleet under which a leaving fleet is routed
export const ROUT_S = 8; // s from the rout to the first jump
export const PRESS_S = 3; // s since a ship was hit or killed: still pressed
export const PRESS_R = 12; // your radii: you within this of the fleet centre...
export const PRESS_V = 0.25; // ...closing faster than this × their cruise: pressed
export const ROUT_V = 1; // × cruise: a routed formation flies at full speed
export const REST = 4; // s after a hit before a shield mends...
export const MEND = 2; // ...then s a round
export const LEAD = 0.5; // s haulers jump ahead of the gun ships...
export const SPREAD = 1.2; // ...which follow over this many s, each at its own moment
/** Jump phases, s: spool (alive, shield down, killable; the warp sound's whine is as long), then from the jump the streak growing, the flash, the shock ring, the fading trail. */
export const JUMP = { spool: 0.9, streak: 0.12, flash: 0.18, ring: 0.35, trail: 0.7 };

/** What the shield and the jump read of a ship: `sh` rounds of shield, `calm` s since a hit, `flare` s of hit flash left, `spool` s spooling (0: not). */
export type Warp = { x: number; y: number; heading: number; kind: keyof typeof PIRATE_CLASS; dead: boolean; sh: number; calm: number; flare: number; spool: number };
/** A jump drawn by bolts.ts: the ship and s since it left (spooling while alive). */
export type Wake = { s: Warp; t: number };

/** A round or blast on a ship: the shield takes it (true) while it holds a full round; any hit restarts the rest and presses the fleet. */
export function soak(s: Warp, fleet?: { hurt: number }) {
  s.calm = 0;
  if (fleet) fleet.hurt = 0;
  if (s.sh < 1) return false;
  s.sh -= 1;
  s.flare = 0.3;
  return true;
}

/** A shield's frame: nothing for REST s after a hit, then a round every MEND s up to `max`; a spooling ship has none. */
export function mend(s: Warp, max: number, dt: number) {
  s.calm += dt;
  s.flare = Math.max(0, s.flare - dt);
  if (s.spool > 0) s.sh = 0;
  else if (s.calm >= REST) s.sh = Math.min(max, s.sh + dt / MEND);
}

/** Pressed: a ship hit or killed within PRESS_S s, or you `d` R off the fleet centre closing at `close` R/s on a cruise of `v` R/s. */
export const pressed = (hurt: number, d: number, close: number, v: number) => hurt < PRESS_S || (d < PRESS_R && close > PRESS_V * v);

/** The leave clock's time the rout began (−1: none), latched once the living `share` falls under ROUT or the fleet is pressed. */
export const routAt = (rout: number, st: number, share: number, press: boolean) => (rout >= 0 ? rout : share < ROUT || press ? st : -1);

/** When the jumps start on the leave clock: JUMP_S, or ROUT_S after a rout if sooner. */
export const jumpAt = (rout: number) => (rout < 0 ? JUMP_S : Math.min(JUMP_S, rout + ROUT_S));

/** A ship's own delay after the jump time: haulers at once, the rest LEAD + up to SPREAD s by their seed `k`. */
export const delay = (kind: Warp['kind'], k: number) => (kind === 'hauler' ? 0 : LEAD + ((k % 100) / 100) * SPREAD);

/** A ship's jump `t` s past its moment: 0 nothing, 1 spooling began (shield gone), 2 gone (at once when off screen). */
export function spool(s: Warp, t: number, dt: number, seen: boolean): 0 | 1 | 2 {
  if (t < 0) return 0;
  if (s.spool <= 0) {
    if (!seen) return 2;
    [s.spool, s.sh] = [1e-6, 0];
    return 1;
  }
  s.spool += dt;
  return s.spool >= JUMP.spool ? 2 : 0;
}
