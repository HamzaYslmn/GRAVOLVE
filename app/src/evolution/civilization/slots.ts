import { ARMS, FLEET, ROCKET, type ShipClass } from './rules.ts';
import type { State, Weapon } from './orders.ts';

// One HUD slot per fleet class (hud.ts, bottom left in your card): count / cap, one pip per ship (0..1 of its own reload),
// their mean, and its look on the priority: `on` takes it, `off` cannot hurt or reach it, `none` nothing to show. Rockets:
// your magazine, one pip per rocket (the one refilling fills). Pure, Node-safe.

export const SLOTS = ['probe', 'fighter', 'frigate', 'rocket'] as const;
export type SlotKey = (typeof SLOTS)[number];
export type Slot = { n: number; cap: number; ready: number; pips: number[]; look: '' | 'on' | 'off' | 'none' };
/** Your rocket magazine (stage.ts): rockets loaded, its size, s banked toward the next. */
export type Mag = { n: number; cap: number; load: number };

const WEAPON: Partial<Record<SlotKey, Weapon>> = { probe: 'probes', fighter: 'fighters', frigate: 'frigate' };
const acts = (s: State | undefined) => s === 'go' || s === 'busy';
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const unit = (x: number) => Math.min(1, Math.max(0, x));

export function slots(
  fleet: Record<ShipClass, [number, number]>,
  ships: readonly { kind: 'probe' | 'fighter'; mode: string; cool: number }[],
  frigates: readonly { load: number }[],
  mag: Mag, by?: Record<Weapon, State>,
): Record<SlotKey, Slot> {
  const ship = (k: 'probe' | 'fighter') => ships.filter((s) => s.kind === k).map((s) => (s.mode === 'run' ? 0 : unit(1 - s.cool / FLEET[k].cool)));
  const out = {
    probe: { n: fleet.probe[0], cap: fleet.probe[1], pips: ship('probe') },
    fighter: { n: fleet.fighter[0], cap: fleet.fighter[1], pips: ship('fighter') },
    frigate: { n: fleet.frigate[0], cap: fleet.frigate[1], pips: frigates.map((f) => unit(f.load / ARMS.lance.reload)) },
    rocket: { n: mag.n, cap: mag.cap, pips: Array.from({ length: mag.cap }, (_, i) => (i < mag.n ? 1 : i === mag.n ? unit(mag.load / ROCKET.reload) : 0)) },
  } as Record<SlotKey, Slot>;
  for (const k of SLOTS) {
    const s = out[k], w = WEAPON[k];
    s.ready = mean(s.pips);
    const on = (!!w && acts(by?.[w])) || ((k === 'fighter' || k === 'frigate') && s.n > 0 && acts(by?.siege)); // a siege counts for the ships that fly it
    s.look = !s.n ? 'none' : !by || !w ? '' : on ? 'on' : 'off';
  }
  return out;
}

/** E/s by source (MAKE) and by use (USE; `rockets`: your magazine refilling), hud.ts power bars. */
export type Power = Record<'geo' | 'solar' | 'dyson' | 'fuel' | 'people' | 'shield' | 'yard' | 'mend' | 'rockets', number>;
/** The yards: what is building, or the first wanted job (`wait`: short of its ore). */
export type Yard = { kind: ShipClass | 'shield'; prog: number; ore: number; vol: number; wait: boolean };

export const MAKE = ['geo', 'solar', 'dyson', 'fuel'] as const;
export const USE = ['people', 'shield', 'yard', 'mend', 'rockets'] as const;
/**
 * The energy line: `used` E/s of `capacity` (CivState.energy; omitted: what the sources give), the reactor's unburnt share
 * (`idle`) and the shortfall (`short`, 0 unless use passes capacity). Sources are what each gives in full, so free energy past
 * the use (a Dyson world) is spare, not idle; `fuel` is only the reactor share drawn.
 */
export function balance(power: Power, energy?: number) {
  const sources = MAKE.map((k) => ({ k, e: power[k] })), uses = USE.map((k) => ({ k, e: power[k] }));
  const made = sources.reduce((a, s) => a + s.e, 0), used = uses.reduce((a, s) => a + s.e, 0), capacity = energy ?? made;
  return { used, capacity, idle: Math.max(0, capacity - made), short: Math.max(0, used - capacity), sources, uses };
}

export const FLOW_S = 45; // s the fuel rates are averaged over
const ease = (a: number, b: number, dt: number) => a + (1 - Math.exp(-dt / FLOW_S)) * (b - a);
/** A sampled total (`x`) and how fast it rises, u/s smoothed over FLOW_S. */
export type Track = { x: number; v: number };
/**
 * Smoothed rise of any cumulative counter (income `got`; spend as `got − stock`), `plus` u/s added to the raw rate. Never
 * negative (a fall reads 0); the first sample or dt 0 restarts at 0.
 */
export function track(t: Track | undefined, x: number, dt: number, plus = 0): Track {
  return !t || dt <= 0 ? { x, v: 0 } : { x, v: ease(t.v, Math.max(0, (x - t.x) / dt + plus), dt) };
}
export type Flow = { fuel: number; use: number; gain: number }; // last stock (u), smoothed burn and inflow (u/s)

/** The fuel line's rates, smoothed over FLOW_S: inflow is what the stock gained plus what burned (`track` with the burn). */
export function flow(f: Flow | undefined, fuel: number, burn: number, dt: number): Flow {
  if (!f || dt <= 0) return { fuel, use: burn, gain: 0 };
  return { fuel, use: ease(f.use, burn, dt), gain: track({ x: f.fuel, v: f.gain }, fuel, dt, burn).v };
}
/** s the spare fuel lasts at `use` u/s; Infinity while nothing burns. */
export const fuelLeft = (spare: number, use: number) => (use < 1e-6 ? Infinity : spare / use);
