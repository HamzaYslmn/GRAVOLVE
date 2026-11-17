// Combat feel, pure (Node-safe, no imports): the near-miss detector on an enemy salvo, your rocket's pass, and the hit-stop budget.
// Docs: civilizationgameplay.md → Rockets.

export const NEAR = { d: 1.5, open: 0.3, salvo: 2 }; // R off your surface; R the gap must reopen (it has passed); rockets a salvo needs for the clean cue

/** A rocket as the detector sees it (a guns.ts Rocket fits): its state rides on it as `gap` (closest so far) and `by` (tracked). */
export type Passing = { x: number; y: number; R: number; from?: unknown; gap?: number; by?: boolean };
type Salvo = { n: number; live: number; hit: boolean; near: boolean };

/**
 * Salvos keyed by shooter (`from`): one shooter's rockets from the first seen until none is live (overlapping salvos merge).
 * `track` each frame for a live enemy rocket at you: 1 once per salvo when one has passed within NEAR.d R of your surface
 * and the gap has reopened by NEAR.open R. `end` when it ends: 2 when the last of an untouched salvo of NEAR.salvo+ goes.
 */
export function createDodge() {
  const salvos = new Map<unknown, Salvo>();
  return {
    track(m: Passing, at: { x: number; y: number }, r: number): 0 | 1 {
      let s = salvos.get(m.from);
      if (!m.by) {
        if (!s) salvos.set(m.from, (s = { n: 0, live: 0, hit: false, near: false }));
        [m.by, m.gap] = [true, Infinity];
        s.n++;
        s.live++;
      }
      const d = Math.hypot(m.x - at.x, m.y - at.y) - r, gap = (m.gap = Math.min(m.gap!, d));
      if (!s || s.near || gap > NEAR.d * m.R || d - gap < NEAR.open * m.R) return 0;
      s.near = true;
      return 1;
    },
    end(m: Passing, hitYou: boolean): 0 | 2 {
      const s = salvos.get(m.from);
      if (!m.by) { // never tracked: no count, but a hit still spoils its shooter's clean cue
        if (hitYou && s) s.hit = true;
        return 0;
      }
      [m.by, m.gap] = [false, undefined];
      if (!s) return 0;
      s.hit ||= hitYou;
      if (--s.live > 0) return 0;
      salvos.delete(m.from);
      return !s.hit && s.n >= NEAR.salvo ? 2 : 0;
    },
    clear: () => salvos.clear(), // rockets still marked `by` after this count nowhere
  };
}

/** Your locked rocket against its target at (x, y), radius `r`: true once a rocket, when it has passed within NEAR.d R of the target's surface and the gap reopened by NEAR.open R (the shooter's "almost"). Armed only once it has been farther than NEAR.d R (a shot from close never cues at launch). Its state rides on it as `pass` (closest so far; NaN once cued). */
export function passed(m: { x: number; y: number; R: number; pass?: number }, x: number, y: number, r: number) {
  const d = Math.hypot(m.x - x, m.y - y) - r;
  if (Number.isNaN(m.pass) || (m.pass === undefined && d <= NEAR.d * m.R)) return false;
  const gap = (m.pass = Math.min(m.pass ?? Infinity, d));
  if (gap > NEAR.d * m.R || d - gap < NEAR.open * m.R) return false;
  m.pass = NaN;
  return true;
}

export const STOP = { s: [0, 0.025, 0.04, 0.06], gap: 0.5 }; // s by tier: none, a rocket intercept, a ship in the blast, a kill or a world; s of sim time between stops
/** The hit-stop a tier earns at `now` (sim s) when the last stop was at `last`: 0 inside the gap. */
export const stopFor = (last: number, now: number, tier: number) => (now - last >= STOP.gap ? STOP.s[tier] : 0);
