import { ARMS, FLEET, RESERVE, ROCKET, salvo, type ShipClass } from './rules.ts';
import type { State, Weapon } from './orders.ts';

// One HUD slot per fleet class (hud.ts, bottom left in your card): count / cap, one pip per ship (0..1 of its own reload),
// their mean, and its look on the priority: `on` takes it, `off` cannot hurt or reach it, `none` nothing to show. Pure, Node-safe.

export const SLOTS = ['probe', 'fighter', 'frigate', 'rocket', 'missile'] as const;
export type SlotKey = (typeof SLOTS)[number];
export type Slot = { n: number; cap: number; ready: number; pips: number[]; look: '' | 'on' | 'off' | 'none' };

const WEAPON: Record<SlotKey, Weapon> = { probe: 'probes', fighter: 'fighters', frigate: 'frigate', rocket: 'rockets', missile: 'siege' };
const acts = (s: State | undefined) => s === 'go' || s === 'busy';
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const unit = (x: number) => Math.min(1, Math.max(0, x));

/** `siloLoad` s loaded and tier `T` (stage.ts); T 0 leaves the missile slot empty. */
export function slots(
  fleet: Record<ShipClass, [number, number]>,
  ships: readonly { kind: 'probe' | 'fighter'; mode: string; cool: number }[],
  frigates: readonly { load: number }[],
  rack: number, ore: number, by?: Record<Weapon, State>, siloLoad = 0, T = 0,
): Record<SlotKey, Slot> {
  const ship = (k: 'probe' | 'fighter') => ships.filter((s) => s.kind === k).map((s) => (s.mode === 'run' ? 0 : unit(1 - s.cool / FLEET[k].cool)));
  const cap = T > 0 ? salvo(T) : 0; // the silo fires its whole salvo or nothing (ships.ts siloStep)
  const out = {
    probe: { n: fleet.probe[0], cap: fleet.probe[1], pips: ship('probe') },
    fighter: { n: fleet.fighter[0], cap: fleet.fighter[1], pips: ship('fighter') },
    frigate: { n: fleet.frigate[0], cap: fleet.frigate[1], pips: frigates.map((f) => unit(f.load / ARMS.lance.reload)) },
    rocket: { n: Math.floor(ore / ROCKET.ore), cap: 0, pips: [unit(rack / ROCKET.reload)] },
    missile: { n: ore >= RESERVE + cap * ARMS.missile.ore ? cap : 0, cap, pips: Array(cap).fill(unit(siloLoad / ARMS.missile.reload)) },
  } as Record<SlotKey, Slot>;
  for (const k of SLOTS) {
    const s = out[k], w = WEAPON[k];
    s.ready = mean(s.pips);
    const on = acts(by?.[w]) || ((k === 'fighter' || k === 'frigate') && s.n > 0 && acts(by?.siege)); // a siege counts for the ships that fly it
    s.look = !s.n ? 'none' : !by ? '' : on ? 'on' : 'off';
  }
  return out;
}

/** E/s by source (MAKE) and by use (USE), hud.ts power bars. */
export type Power = Record<'geo' | 'solar' | 'dyson' | 'fuel' | 'people' | 'shield' | 'yard' | 'mend' | 'rockets', number>;
/** The yards: what is building, or the first wanted job (`wait`: short of its ore). */
export type Yard = { kind: ShipClass | 'shield'; prog: number; ore: number; vol: number; wait: boolean };

export const FLOW_S = 45; // s the fuel rates are averaged over
export type Flow = { fuel: number; use: number; gain: number }; // last stock (u), smoothed burn and inflow (u/s)

/** The fuel line's rates, smoothed over FLOW_S: inflow is what the stock gained plus what burned. */
export function flow(f: Flow | undefined, fuel: number, burn: number, dt: number): Flow {
  if (!f || dt <= 0) return { fuel, use: burn, gain: 0 };
  const k = 1 - Math.exp(-dt / FLOW_S), inflow = Math.max(0, (fuel - f.fuel) / dt + burn);
  return { fuel, use: f.use + k * (burn - f.use), gain: f.gain + k * (inflow - f.gain) };
}
/** s the spare fuel lasts at `use` u/s; Infinity while nothing burns. */
export const fuelLeft = (spare: number, use: number) => (use < 1e-6 ? Infinity : spare / use);
