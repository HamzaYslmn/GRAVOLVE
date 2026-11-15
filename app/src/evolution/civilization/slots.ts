import { ARMS, FLEET, ROCKET, type ShipClass } from './rules.ts';
import type { State, Weapon } from './orders.ts';

// One HUD slot per fleet class (hud.ts, bottom left in your card): count / cap, readiness 0..1 from the class's own reload,
// and its look on the priority: `on` takes it, `off` cannot hurt or reach it, `none` nothing to show. Pure, Node-safe.

export const SLOTS = ['probe', 'fighter', 'frigate', 'rocket'] as const;
export type SlotKey = (typeof SLOTS)[number];
export type Slot = { n: number; cap: number; ready: number; look: '' | 'on' | 'off' | 'none' };

const WEAPON: Record<SlotKey, Weapon> = { probe: 'probes', fighter: 'fighters', frigate: 'frigate', rocket: 'rockets' };
const acts = (s: State | undefined) => s === 'go' || s === 'busy';
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const unit = (x: number) => Math.min(1, Math.max(0, x));

export function slots(
  fleet: Record<ShipClass, [number, number]>,
  ships: readonly { kind: 'probe' | 'fighter'; mode: string; cool: number }[],
  frigates: readonly { load: number }[],
  rack: number, ore: number, by?: Record<Weapon, State>,
): Record<SlotKey, Slot> {
  const ship = (k: 'probe' | 'fighter') => mean(ships.filter((s) => s.kind === k).map((s) => (s.mode === 'run' ? 0 : unit(1 - s.cool / FLEET[k].cool))));
  const out = {
    probe: { n: fleet.probe[0], cap: fleet.probe[1], ready: ship('probe') },
    fighter: { n: fleet.fighter[0], cap: fleet.fighter[1], ready: ship('fighter') },
    frigate: { n: fleet.frigate[0], cap: fleet.frigate[1], ready: mean(frigates.map((f) => unit(f.load / ARMS.lance.reload))) },
    rocket: { n: Math.floor(ore / ROCKET.ore), cap: 0, ready: unit(rack / ROCKET.reload) },
  } as Record<SlotKey, Slot>;
  for (const k of SLOTS) {
    const s = out[k], w = WEAPON[k];
    const on = acts(by?.[w]) || ((k === 'fighter' || k === 'frigate') && s.n > 0 && acts(by?.siege)); // a siege counts for the ships that fly it
    s.look = !s.n ? 'none' : !by ? '' : on ? 'on' : 'off';
  }
  return out;
}
