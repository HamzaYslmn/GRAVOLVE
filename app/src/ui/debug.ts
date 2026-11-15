// Debug mode (settings: "Debug mode"): a small button beside the settings gear opening a dropdown of one-click actions
// in three groups (jump to a stage, boost, your star); closed, it covers nothing. A greyed button says why on hover. A
// jump runs over the next frames (`step`). A run you touch saves no records or achievements (`touched`: run.debug).
import './debug.css';
import { absorb, compTint, type Body } from '../evolution/asteroid/body';
import { radiusOf, type Comp } from '../evolution/asteroid/rules';
import { LIFE_S, moonSlots } from '../evolution/planet/rules';
import type { PlanetStage } from '../evolution/planet/stage';
import { layout } from '../evolution/star/rules';
import { heatOfK } from '../core/water';
import type { Field } from '../kit';
import { toast } from './toast';

const HABITABLE: Comp = { rock: 0.55, metal: 0.12, ice: 0.3, gas: 0.03 }, METAL: Comp = { rock: 0.4, metal: 0.5, ice: 0.07, gas: 0.03 };
const STAR_TYPES = [0.4, 1, 8]; // suns: red dwarf, sun-like, blue giant
const JUMP: Record<string, number> = { planet: 1, life: 2, star: 3 };
const GROUPS = [
  { title: 'Jump', acts: [{ id: 'planet', label: 'Planet', hint: 'A habitable Super-Earth' }, { id: 'life', label: 'Life', hint: 'Life and a civilization' }, { id: 'star', label: 'Star', hint: 'Link the nearest star' }] },
  { title: 'Boost', acts: [{ id: 'grow', label: 'Grow ×3', hint: 'Triple your mass' }, { id: 'ore', label: '+Ore', hint: '500 ore and 200 volatiles for your people' }] },
  { title: 'Star', acts: [{ id: 'dyson', label: 'Dyson', hint: 'Build 30% more of the Dyson sphere' }, { id: 'type', label: 'Type', hint: 'Red dwarf → sun → blue giant' }, { id: 'catch', label: '+Planet', hint: 'A planet for your star to catch' }] },
];

/** What debug mode reads of the game (main.ts), live each call. */
export type DebugGame = { me: () => Body; planet: () => PlanetStage | undefined; field: () => Field; over: () => boolean; touched: () => void };

export function createDebug(game: DebugGame) {
  let starType = 0, goal = 0, goalT = 0, held = 0; // goal: 1 planet, 2 life, 3 a linked star; held: s at 300 K after Age II began
  const own = () => game.planet()?.star?.own;
  /** Why an action can't run now ('' = it can). */
  const off = (id: string) =>
    !game.me().m || game.over() ? 'Not during game over'
    : id === 'ore' && !game.planet()?.civ ? 'Needs a civilization (Life)'
    : ['dyson', 'type', 'catch'].includes(id) && !own() ? 'Link a star first (Star)' : '';
  function apply(id: string) {
    const me = game.me(), planet = game.planet(), star = planet?.star, s = own();
    if (off(id)) return;
    game.touched();
    if (JUMP[id]) [goal, goalT, held] = [JUMP[id], 20, 0];
    else if (id === 'grow') absorb(me, 2 * me.m, me.comp);
    else if (id === 'ore') planet!.civ!.gain(500, 200, 100);
    else if (!star || !s) return;
    else if (id === 'dyson') star.debug('dyson');
    else if (id === 'type') star.debug(String(STAR_TYPES[(starType = (starType + 1) % STAR_TYPES.length)]));
    else {
      // A round world in your star's catch zone (star/rules.ts layout), at rest beside it: caught within EAT_S (star/system.ts).
      const a = Math.random() * Math.PI * 2, x = layout(s.R, me.r, moonSlots(me.m)).catch(star.state?.x ?? 0)[0] + 0.5;
      const w = game.field().spawn(s.m.x + Math.cos(a) * x * s.R, s.m.y + Math.sin(a) * x * s.R, s.m.vx, s.m.vy, 10 ** (3.6 + Math.random()), { ...METAL });
      if (w) w.diff = 0.5; // a melted world bakes round (spawned pieces stay rough otherwise: asteroid/rules.ts bakes)
    }
  }

  const box = document.createElement('details');
  box.id = 'debug';
  box.hidden = true;
  box.innerHTML = `<summary class="ui-panel" title="Debug actions">DBG</summary><div class="menu ui-panel"><small>Debug runs save no records</small>${GROUPS
    .map((g) => `<section><h3>${g.title}</h3><div class="acts">${g.acts
      .map((a) => `<button type="button" data-id="${a.id}" data-hint="${a.hint}" title="${a.hint}">${a.label}</button>`).join('')}</div></section>`).join('')}</div>`;
  document.body.appendChild(box);
  const buttons = [...box.querySelectorAll('button')];
  const refresh = () => {
    for (const b of buttons) {
      const why = off(b.dataset.id!);
      b.disabled = !!why;
      b.title = why || b.dataset.hint!;
    }
  };
  box.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    apply(b.dataset.id!);
    b.blur(); // keys go back to the game
  });
  box.addEventListener('toggle', refresh);
  document.addEventListener('pointerdown', (e) => box.open && !box.contains(e.target as Node) && (box.open = false));
  setInterval(() => box.open && refresh(), 500); // ponytail: polls only while open; fine for 8 buttons
  return {
    set visible(v: boolean) {
      box.hidden = !v;
      if (!v) box.open = false;
    },
    /** A stage jump, a step a frame: a habitable Super-Earth (thick enough air for life) → held at 300 K through the Age II melt → LIFE → star linked. */
    step(dt: number) {
      if (!goal) return;
      const me = game.me(), planet = game.planet();
      if ((goalT -= dt) <= 0 || !me.m || game.over()) return void ((goal = 0), toast('Debug', 'Jump stopped'));
      if (!planet) {
        if (me.m < 1e5) absorb(me, 1e5 - me.m, me.comp);
        [me.comp, me.tint, me.diff] = [{ ...HABITABLE }, compTint(HABITABLE), 1];
        const r = radiusOf(me.m, me.comp); // a real habitable world's size, not the dust it grew as
        [me.k, me.r] = [(me.k * r) / me.r, r];
        me.view.scale.set(me.k);
        return;
      }
      if ((held += dt) < 2 || (goal > 1 && !planet.civ)) me.heat = Math.min(me.heat, heatOfK(300));
      if (goal === 1) return void (held >= 2 && (goal = 0));
      if (!planet.civ) return void ([planet.life.progress, planet.life.calm] = [LIFE_S, 999]);
      if (goal === 2) return void (goal = 0);
      if (!planet.star) return planet.civ.contact();
      if (own() || !planet.star.debug('link')) goal = 0;
    },
  };
}
