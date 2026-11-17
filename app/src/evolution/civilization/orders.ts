import { LINK_HOLD } from './mining.ts';
import { FLEET, FRAG, RECALL } from './rules.ts';

// Priority target (stage.ts order, planet/moons.ts Command): one target your ships take first, each when it next comes
// free and can hurt and reach it; setting it fires nothing (docs/civilizationgameplay.md "Priority target"). Rockets are
// yours to fire (Fire, combat.ts). status says, per weapon, how it stands, which take it now (`on`), the note over the
// target and whether its mark dims (`wait`).

export type Weapon = 'fighters' | 'probes' | 'frigate' | 'siege';
export type State = 'go' | 'busy' | 'shield' | 'range' | 'none' | 'cant';
/**
 * A body (`share` of you; `free`: no world, moon or rival's rock, so guns may break it; `course`: on course to hit you), a
 * rival world still fighting or beaten, or an enemy ship or rocket (`foe`). `d`: your radii from your centre to its near
 * side (a world: surface to surface).
 */
export type Target = { kind: 'body' | 'world' | 'beaten' | 'foe'; share: number; free: boolean; course: boolean; d: number };
/** Your fleet: LIFE holds, the gold `ring` (R), `shield` up with no calm; home ships by class; `eta`: s until each can act (0 now, Infinity: all on other runs). */
export type Fleet = {
  awake: boolean; ring: number; shield: boolean;
  n: { fighters: number; probes: number; frigate: number };
  eta: { fighters: number; probes: number; frigate: number };
};
export const CLEARED = 'Priority cleared';

const WEAPONS: readonly Weapon[] = ['fighters', 'probes', 'frigate', 'siege'];
const RANK: readonly State[] = ['go', 'busy', 'shield', 'range', 'none', 'cant']; // the note: the best state any weapon has
const NOTE = { shield: 'Shield down · fleet holds', range: 'Out of range', none: 'No fighters', cant: 'Nothing can hurt it' };

/** Can weapon `w` hurt `t`: fighters break ≤ 2% or push anything on course, probes break ≤ 0.5%, the frigate 2–25%; ships: fighters; a fighting world: the siege. */
function hurts(w: Weapon, t: Target) {
  if (t.kind !== 'body') return t.kind === 'foe' ? w === 'fighters' : t.kind === 'world' && w === 'siege';
  const s = t.share;
  return w === 'fighters' ? (t.free && s <= FLEET.fighter.breaks) || t.course : w === 'probes' ? t.free && s <= FLEET.probe.breaks
    : w === 'frigate' && t.free && s >= FRAG && s <= FLEET.frigate.breaks;
}
/** Weapon `w` on `t`, the first that applies: cant, none (no such ship), range, shield (the siege), busy (reloading or on a run), go. */
function state(w: Weapon, t: Target, f: Fleet): State {
  const n = w in f.n ? f.n[w as keyof Fleet['n']] : 1, eta = w in f.eta ? f.eta[w as keyof Fleet['eta']] : 0;
  const reach = w === 'siege' ? t.d <= RECALL : t.d <= f.ring * LINK_HOLD;
  return !hurts(w, t) ? 'cant' : !n ? 'none' : !reach ? 'range' : w === 'siege' && !f.shield ? 'shield' : eta > 0 ? 'busy' : 'go';
}
/** How priority `t` stands with fleet `f`: taken (`ok`: not a beaten world), the note, `wait` (no weapon ready or reloading: a dim mark), per weapon `on` (takes it when free) and its state `by`. */
export function status(t: Target, f: Fleet) {
  const by = {} as Record<Weapon, State>, on = {} as Record<Weapon, boolean>;
  for (const w of WEAPONS) {
    by[w] = state(w, t, f);
    on[w] = f.awake && RANK.indexOf(by[w]) <= RANK.indexOf('busy'); // ready or reloading
  }
  const best = RANK.find((s) => WEAPONS.some((w) => by[w] === s))!;
  const eta = Math.min(...WEAPONS.filter((w) => by[w] === 'busy').map((w) => f.eta[w as keyof Fleet['eta']]));
  const note = t.kind === 'beaten' ? 'Already beaten' : !f.awake ? 'No life · fleet idle'
    : best === 'go' ? 'Priority set' : best === 'busy' ? (eta < Infinity ? `Reloading · ${Math.ceil(eta)} s` : 'Ships busy') : NOTE[best];
  return { ok: t.kind !== 'beaten', note, wait: !f.awake || RANK.indexOf(best) > RANK.indexOf('busy'), on, by };
}
