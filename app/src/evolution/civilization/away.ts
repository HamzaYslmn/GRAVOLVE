import { approach, avoid, BRAKE, circuit, formation, leadAt, P_ACC, P_TURN, RF_TURN, rivalTop, RING_IN, RING_OUT, ROW, strafe, thrust, want, type Circler, type Strafer } from './flight.ts';
import { clear, scan, type Disc, type Near } from './nav.ts';

// Rival ships away from home (war wave, probe, miner, the frigates' battery), pure: rivals.ts fires, digs and draws them,
// flight.test.ts flies them in Node. Absolute world units; flight as pirates (flight.ts); tops in space: flight.ts rivalTop.
// Once a frame `plan`, then `step` each ship each sub-step, then `settle` each ship (a miner's landing, docking home).

export const OUT_V = 5; // your radii/s cruise (pirates 4–5.5)
export const MASS_IN = [1.5, 1.7]; // rival radii: a massing wave's circuit round its world, waypoints in and out (inside its rock's circle)
export const MASS_OUT = [1.9, 2.1];
export const PROBE_S = 10; // s a probe circles you before it goes home
export const DIG_S = 2;
export const DOCK = 1.3; // rival radii: a ship flying home lands this close

export type Role = 'probe' | 'miner' | 'frigate' | 'fighter';
/** A ship away: `rock` a miner's, `dig` s on it at angle `da`, `t` s out, `home` flying back, s since a frigate `fired` a salvo. */
export type Away = Circler & Strafer & { role: Role; rock?: Disc; dig: number; da: number; t: number; home: boolean; fired: number };
export type Centre = { x: number; y: number; vx: number; vy: number };
/** One rival's frame: `you`, its `world`, the wave's `phase`, the chasing centre `c` and its low-passed velocity `fv`, your outer moon slot, the ship radius, bodies to steer round (`own`: not these), its lance. `fly`: set by `plan`. */
export type Frame = {
  you: Disc; world: Disc; phase: 'mass' | 'go' | 'home' | undefined; c: Centre; fv: { x: number; y: number }; outer: number; sr: number;
  bodies: readonly Disc[]; own: (b: Disc, s: Away) => boolean; lance: { u: number; reload: number }; fly?: Fly;
};
type Fly = { sp: number; acc: number; brake: number; massing: boolean; flying: Away[]; wc: Centre; wfv: { x: number; y: number }; keep: number; mOut: number[]; route: (s: Away) => void };
/** A ship's frame plan: a wave fighter, flying home, digging, the frame it flies in (`fc`), its top, the bodies near it. */
export type Plan = { wave: boolean; home: boolean; digging: boolean; fc: { x: number; y: number }; top: number; near: Near[] };

export const isWave = (s: Away) => s.role === 'frigate' || s.role === 'fighter';

/**
 * Once a frame. The war wave: massing, its fighters in a V on the first round their world; out, wings of three in trail on
 * strafing runs at you (round the chasing centre, frame velocity low-passed). Its frigates keep their battery circuit at home.
 */
export function plan(out: readonly Away[], f: Frame, dt: number): Plan[] {
  const pm = f.you.motion, bm = f.world.motion, R = f.world.r, mR = f.you.r, sp = OUT_V * mR, acc = sp * P_ACC, sr = f.sr;
  const massing = f.phase === 'mass', up = massing || f.phase === 'go', flying = up ? out.filter((s) => s.role === 'fighter') : [];
  const wc = massing ? bm : f.c, wfv = massing ? { x: bm.vx, y: bm.vy } : f.fv, keep = massing ? R + (2 + ROW[1]) * sr : 1.25 * mR + (2 + ROW[1]) * sr;
  const mIn = MASS_IN.map((q) => q * R), mOut = MASS_OUT.map((q) => q * R);
  const route = (s: Away) => {
    const x = s.x - wc.x, y = s.y - wc.y;
    if (!massing) return strafe(s, x, y, s.vx - wfv.x, s.vy - wfv.y, RING_IN * mR, f.outer + RING_OUT * mR, keep, sp);
    circuit(s, x, y, mIn, mOut, sp, RF_TURN);
    avoid(x, y, keep, 2 * R);
  };
  f.fly = { sp, acc, brake: BRAKE * acc, massing, flying, wc, wfv, keep, mOut, route };
  return out.map((s) => {
    s.t += dt;
    if ((s.role === 'probe' && s.t > PROBE_S) || (s.role === 'miner' && (!s.rock || !s.rock.m))) s.home = true;
    const battery = s.role === 'frigate', wave = isWave(s) && !battery, home = battery ? !up : wave ? !flying.length : s.home, digging = !home && !!s.rock && s.dig > 0;
    // The frame it flies in: home (a frigate on its battery circuit too), the wave's, you (a probe), or its rock.
    const fc = home || battery ? { x: bm.vx, y: bm.vy } : wave ? wfv : s.rock ? { x: s.rock.motion.vx, y: s.rock.motion.vy } : { x: pm.vx, y: pm.vy };
    return { wave, home, digging, fc, top: rivalTop(sp, wave, home || battery || (wave && massing) || s.rock ? fc : undefined), near: digging ? [] : scan(s, f.bodies, (b) => f.own(b, s), sr, sp, battery ? RF_TURN : P_TURN) };
  });
}

/** One sub-step of `h` s for ship `i` (after `plan`). */
export function step(out: readonly Away[], i: number, p: Plan, f: Frame, h: number) {
  const s = out[i], rock = s.rock, { sp, acc, brake, massing, flying, wc, wfv, keep, mOut, route } = f.fly!, pm = f.you.motion, bm = f.world.motion, R = f.world.r, mR = f.you.r;
  if (p.digging) return;
  if (p.home) approach(s, bm.x, bm.y, bm.vx, bm.vy, R, sp, brake);
  else if (s.role === 'frigate') {
    // The battery: its circuit round its world; charging or firing, nearly still with its nose on the lead point.
    const x = s.x - bm.x, y = s.y - bm.y;
    if (f.phase === 'go' && s.fired >= f.lance.reload && f.you.m) {
      const a = leadAt(s, pm.x, pm.y, pm.vx, pm.vy, f.lance.u);
      [want.x, want.y] = [Math.cos(a) * 0.15 * sp, Math.sin(a) * 0.15 * sp];
    } else circuit(s, x, y, mOut, mOut, 0.5 * sp, RF_TURN);
    avoid(x, y, R + (2 + ROW[1]) * f.sr, 2 * R);
    [want.x, want.y] = [want.x + bm.vx, want.y + bm.vy];
  } else if (p.wave) formation(flying, flying.indexOf(s), massing ? 0 : 3, wc.x, wc.y, wfv, f.sr, mR, 1.3 * sp, keep, route, massing ? 1 : 0);
  else if (s.role === 'probe') {
    strafe(s, s.x - pm.x, s.y - pm.y, s.vx - pm.vx, s.vy - pm.vy, f.outer + 1.5 * mR, f.outer + 4 * mR, f.outer + mR, sp);
    [want.x, want.y] = [want.x + pm.vx, want.y + pm.vy];
  } else approach(s, rock!.motion.x, rock!.motion.y, rock!.motion.vx, rock!.motion.vy, rock!.r + 2 * f.sr, sp, brake);
  clear(s, p.near, sp, 0, p.top);
  thrust(s, acc, s.role === 'frigate' ? RF_TURN : P_TURN, h, p.fc.x, p.fc.y, p.top);
}

/** After the sub-steps: a miner lands on its rock and digs (`dig`), done after DIG_S (`dug`: home, rock let go); a ship flying home within DOCK of its world `docked`. */
export function settle(s: Away, p: Plan, f: Frame, dt: number): 'dig' | 'dug' | 'docked' | undefined {
  const rock = s.rock, sr = f.sr, bm = f.world.motion;
  if (s.role === 'miner' && !p.home && rock && (s.dig > 0 || Math.hypot(rock.motion.x - s.x, rock.motion.y - s.y) < rock.r + 3 * sr)) {
    if (!s.dig) s.da = Math.atan2(s.y - rock.motion.y, s.x - rock.motion.x);
    s.dig += dt;
    [s.x, s.y, s.vx, s.vy] = [rock.motion.x + Math.cos(s.da) * (rock.r + sr), rock.motion.y + Math.sin(s.da) * (rock.r + sr), rock.motion.vx, rock.motion.vy];
    if (s.dig < DIG_S) return 'dig';
    [s.home, s.rock] = [true, undefined];
    return 'dug';
  }
  if (p.home && Math.hypot(bm.x - s.x, bm.y - s.y) < DOCK * f.world.r) return 'docked';
}
