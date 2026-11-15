import './hud.css';
import type { Container } from 'pixi.js';
import type { Aim } from './player';
import type { Body, Hit } from './body';
import { hold, kelvin, pressure, waterState, type WaterState } from '../../core/water';
import { toast, toastBusy } from '../../ui/toast';
import { load, save } from '../../ui/settings';
import { bar, finder, hex, PERIOD, throttle } from '../../ui/panel';
import type { Biome } from './web';
import { habOf, type Entry } from '../rivals/ledger';
import { lifeName, MOON_SHARE } from '../planet/rules';
import { AGE_GOAL, shapeOf, MAX_HEAT, mealsTo, MOLTEN, TAGS, TIERS, V_STICK, type Comp, type Element } from './rules';

// The stage HUD, plain DOM over the canvas: every readout is an icon with a short caption. Two cards and a marker:
//   your card (bottom left, 256 px): everything about your own body. Head (age, tier, mass), the stage's goal bar (moon pips
//     on its label), speed on one line, composition, then each stage's rows (Age I here; planet/, civilization/ and star/
//     add theirs), one tip.
//   target card (top right): the body you are heading for, with the same corner brackets as the marker in the world.
//   marker: those brackets around the target body itself, in the verdict colour; a named rival gets its name over it.
// Updated ~12×/s; the marker follows every frame.

// [element, label, colour, icon]: colour and shape together, so a segment reads at a glance (and without colour vision).
const ELEMENTS: [Element, string, string, string][] = [
  ['metal', 'Metal', '#9fb0c8', '<path d="M6 1 10.3 3.5v5L6 11 1.7 8.5v-5Z"/><circle cx="6" cy="6" r="1.7"/>'],
  ['rock', 'Rock', '#c9a27a', '<path d="M2 8.2 2.8 4 6 1.6 9.6 3 11 7.2 8.4 10.6H3.6Z"/><path d="M6 4.2 5.1 6.9 7 7.8"/>'],
  ['ice', 'Water', '#6fd3ff', '<path d="M6 1.2C4 4 2.8 5.8 2.8 7.6a3.2 3.2 0 0 0 6.4 0C9.2 5.8 8 4 6 1.2Z"/>'],
  ['gas', 'Gas', '#ffd27a', '<path d="M1.5 3.8c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0M1.5 8.2c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0"/>'],
  ['radio', 'RAD', '#8dff6a', '<path class="fill" d="M4.95 4.18L3.3 1.32A5.4 5.4 0 0 1 8.7 1.32L7.05 4.18A2.1 2.1 0 0 0 4.95 4.18ZM8.1 6L11.4 6A5.4 5.4 0 0 1 8.7 10.68L7.05 7.82A2.1 2.1 0 0 0 8.1 6ZM4.95 7.82L3.3 10.68A5.4 5.4 0 0 1 0.6 6L3.9 6A2.1 2.1 0 0 0 4.95 7.82Z"/><circle class="fill" cx="6" cy="6" r="1.1"/>'], // radioactive heavy elements
];
// Speed gauge on a log scale (there is no top speed): the eat zone (0..8) keeps ~20% of the width,
// 256 diameters/s and up pins the needle.
const SPEED_TOP = 256;
const gx = (v: number) => Math.min(1, Math.log1p(Math.max(0, v) / V_STICK) / Math.log1p(SPEED_TOP / V_STICK));
const speedText = (v: number) => (v < 10 ? v.toFixed(1) : v < 1000 ? v.toFixed(0) : `${(v / 1000).toFixed(v < 1e4 ? 1 : 0)}k`);
// A rival world's life conditions in the target card (keys of planet/rules.ts habitability).
const RIVAL_CHIPS = [['water', 'Water', 'water'], ['air', 'Air', 'air'], ['magnet', 'Magnetic field', 'magnet']] as const;
// 12×12 stroke icons shared by the HUD (planet/, civilization/ too).
const ICON = {
  temp: '<path d="M5 7.4V2.2a1 1 0 0 1 2 0v5.2a2.4 2.4 0 1 1-2 0Z"/>',
  air: '<path d="M1.5 4.5h6.2a1.6 1.6 0 1 0-1.6-1.6M1.5 7.5h8a1.6 1.6 0 1 1-1.6 1.6"/>',
  water: '<path d="M6 1.2C4 4 2.8 5.8 2.8 7.6a3.2 3.2 0 0 0 6.4 0C9.2 5.8 8 4 6 1.2Z"/>',
  magnet: '<path d="M2.8 1.8v4.4a3.2 3.2 0 0 0 6.4 0V1.8M2.8 4h2M7.2 4h2"/>',
  ore: '<path d="M2 4.5 4 2h4l2 2.5L6 10.5Z"/><path d="M2 4.5h8"/>',
  shield: '<path d="M6 1.3 10 3v3c0 2.4-1.7 4.1-4 4.9C3.7 10.1 2 8.4 2 6V3Z"/>',
  people: '<circle cx="6" cy="3.4" r="1.9"/><path d="M2.2 10.8a3.8 3.8 0 0 1 7.6 0"/>',
  bolt: '<path d="M6.8 1 2.6 6.8h3.2L5 11l4.4-6H6.2Z"/>',
  rad: '<circle cx="6" cy="6" r="1.2"/><path d="M4.9 4.1 3.2 1.3a5.3 5.3 0 0 1 5.6 0L7.1 4.1M8.1 6h3.3a5.3 5.3 0 0 1-2.7 4.7L7 7.9M4.9 7.9 3.3 10.7A5.3 5.3 0 0 1 .6 6h3.3"/>',
  ship: '<path d="M6 1.2 9.4 10.4 6 8.4 2.6 10.4Z"/>',
  speed: '<path d="M1.5 8.5a4.5 4.5 0 0 1 9 0"/><path d="M6 8.5 8.4 5"/>',
  orbit: '<circle cx="6" cy="6" r="4.6"/><circle class="fill" cx="10" cy="3.7" r="1.4"/>',
  planet: '<circle cx="6" cy="6" r="4"/>',
};
export const icon = (k: keyof typeof ICON) => `<svg class="icon" viewBox="0 0 12 12" aria-hidden="true">${ICON[k]}</svg>`;
/**
 * One readout cell: icon · caption · value on one line, the track full width under them. `track` 'bar' fills (`i` width),
 * 'scale' has a band (where life wants it) and a needle (you). The value's class ok / warn / bad colours the cell.
 */
export const cell = (cls: string, ic: keyof typeof ICON, cap: string, track: 'bar' | 'scale' = 'bar') =>
  `<div class="cell ${cls}">${icon(ic)}<em class="cap">${cap}</em><span class="v"></span>${track === 'bar' ? '<div class="bar"><i></i></div>' : '<div class="scale"><s class="band"></s><i class="needle"></i></div>'}</div>`;
const WATER: Record<WaterState, string> = { ice: 'Ice', liquid: 'Liquid', steam: 'Steam' };
const AIR_HINT_M = 300; // from here the air cell tells where air starts (core/water.ts: from 1.0k mass)

const pct = (f: number) => `${Math.round(f * 100)}%`;
/** A composition share as text: one decimal under 1%, so a trace never reads as 0%. */
const share = (f: number) => (f > 0.0005 && f < 0.01 ? `${(f * 100).toFixed(1)}%` : pct(f));

/** A composition as one stacked bar (a segment per element, its name and share on hover). */
const mixBar = (c: Comp) =>
  ELEMENTS.map(([e, name, col]) => [name, col, c[e] ?? 0] as const).filter(([, , f]) => f >= 0.005)
    .map(([name, col, f]) => `<i style="width:${bar(f)};background:${col}" title="${name} ${share(f)}"></i>`).join('');
/** Its legend: icon and share for each element of 1% or more. */
const legend = (c: Comp) =>
  ELEMENTS.filter(([e]) => (c[e] ?? 0) >= 0.01)
    .map(([e, name, col, svg]) => `<span title="${name}" style="color:${col}"><svg class="icon" viewBox="0 0 12 12" aria-hidden="true">${svg}</svg><em>${share(c[e]!)}</em></span>`).join('');

/** What kind of rock a composition reads as. */
function rockName(b: Body) {
  const c = b.comp;
  const kind = (c.radio ?? 0) >= 0.06 ? 'Radioactive' : (c.metal ?? 0) >= 0.4 ? 'Metallic' : (c.gas ?? 0) >= 0.2 ? 'Gaseous' : (c.ice ?? 0) >= 0.25 ? 'Icy' : 'Stony';
  // Structure tells how it formed: a lone fragment, a rubble pile, a contact binary, an irregular body, a round world.
  const what = b.rival ? 'rival' : b.comet ? 'comet' : b.binary ? 'contact binary'
    : b.jag ? 'fragment' : b.parts.some((p) => p.core) ? (shapeOf(b.r, b.comp, b.diff, b.jag) >= 0.9 ? tierOf(b.m)[1].toLowerCase() : 'irregular body')
    : b.parts.length > 1 ? 'rubble pile' : 'rock';
  return `${kind} ${what}`;
}
/** "a Metallic rock (meteoroid)": article, material, structure and (unless the name already says it) size class. */
export function describe(b: Body) {
  const name = rockName(b), round = b.parts.some((p) => p.core), who = b.rival?.entry?.name;
  return `${who ? `${who}, ` : ''}${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}${round ? '' : ` (${tierOf(b.m)[1].toLowerCase()})`}`;
}
/** The world your composition is heading for (doc: metal, water, gas or rock path), told when Age I ends. */
const pathOf = (c: Comp) =>
  (c.metal ?? 0) >= 0.4 ? 'an iron world in the making' : (c.ice ?? 0) >= 0.25 ? 'an ocean world in the making'
    : (c.gas ?? 0) >= 0.2 ? 'a gas giant in the making' : 'a rocky world in the making';

const tierOf = (m: number) => TIERS[TIERS.filter(([t]) => m >= t).length - 1];

// The no-drag lesson: FAST_HINT bounces above the stick speed bring the "too fast" hint, and every fast
// bounce flashes the speed needle so the bounce reads as "my speed".
const FAST_HINT = 2;
const FLASH_S = 1.2;
let fastHits = 0, flashed = 0;
/** A hit with you as the actor (field.ts). */
export function noteHit(h: Hit) {
  if ((h.kind === 'bounce' || h.kind === 'graze') && h.speed > V_STICK) [fastHits, flashed] = [fastHits + 1, FLASH_S];
}

const MOON = 0x9fdcff; // moons.ts MOON

export function createHud() {
  const root = document.createElement('div');
  root.id = 'game-hud';
  root.dataset.stage = 'asteroid'; // planet/hud.ts sets 'planet'
  root.innerHTML = `
    <div class="mark" hidden><b></b></div>
    <section class="panel ui-panel me">
      <div class="head"><em class="age">Age I</em><b class="name"></b><span class="mass"></span></div>
      <div class="goal"><div class="bar"><i></i></div><div class="label"><span class="to"></span><span class="pips"></span><span class="left"></span></div></div>
      <div class="speed">${icon('speed')}<em class="cap">Speed</em><div class="gauge"><i class="zone stick" style="width:${pct(gx(V_STICK))}"></i><i class="zone messy" style="width:${pct(gx(3 * V_STICK) - gx(V_STICK))}"></i><i class="zone bounce"></i><i class="needle you"></i><i class="needle hit"></i></div><span class="v"></span></div>
      <div class="mix"></div><div class="legend"></div>
      <div class="cells rock">${cell('heat', 'temp', 'Temp')}${cell('wet', 'water', 'Water')}${cell('air', 'air', 'Air')}</div>
      <div class="tip"></div>
    </section>
    <section class="panel ui-panel target" hidden><div class="head"><b class="name"></b><span class="ratio"></span></div><div class="sub"></div>
      <span class="moonsize" hidden>Moon-size</span>
      <div class="mix"></div><div class="legend"></div>
      <div class="chips" hidden>${RIVAL_CHIPS.map(([k, label, ic]) => `<span data-k="${k}" title="${label}">${icon(ic)}</span>`).join('')}<em class="life"></em></div></section>`;
  document.body.appendChild(root);
  const $ = finder(root), due = throttle(), mark = $('.mark');
  let lastTier = -1, comet = false, mine = '', theirs = '', body: Body | undefined;
  const seen = new Set<string>((load('hints') ?? '').split(',').filter(Boolean));

  return {
    /** Shows or hides the whole HUD (e.g. under the game over card). */
    set visible(v: boolean) {
      root.hidden = !v;
    },
    /** `moon`: a moon you selected, shown in the target card; `world`: the camera's container, to place the marker. */
    update(dt: number, me: Body, aim: Aim | undefined, moon?: { body: Body }, world?: Container) {
      // The marker follows its body every frame (the cards update at PERIOD).
      const t = moon?.body ?? aim?.target;
      mark.hidden = !t?.m || !world;
      if (t?.m && world) {
        const p = world.toGlobal(t.motion), s = Math.max(22, 2 * t.r * world.scale.x + 16);
        mark.style.transform = `translate(${(p.x - s / 2).toFixed(1)}px, ${(p.y - s / 2).toFixed(1)}px)`;
        mark.style.width = mark.style.height = `${s.toFixed(1)}px`;
      }
      if (!due(dt) || !me.m) return;
      if (me !== body) [body, lastTier] = [me, -1]; // a new run or a respawn: the HUD outlives runs
      const ageOne = root.dataset.stage === 'asteroid';
      flashed = Math.max(0, flashed - PERIOD);
      $('.speed').classList.toggle('flash', flashed > 0 && me.m < AGE_GOAL);

      // Tier news and first-run hints
      const i = TIERS.filter(([t]) => me.m >= t).length - 1;
      const [from, name] = TIERS[i], next = TIERS[i + 1];
      if (lastTier >= 0 && i > lastTier) {
        // Above Age I the planet stage names the worlds.
        if (TIERS[lastTier][0] < AGE_GOAL && from >= AGE_GOAL) toast('Age I complete', `${name}: ${pathOf(me.comp)}`, true);
        else if (from < AGE_GOAL) toast(name, 'New tier · you pull small rocks in');
      }
      else if (!toastBusy()) {
        // Each once, each tied to something on screen (nothing about off-screen dangers).
        const hint = !seen.has('move') ? ['move', 'WASD / arrows', 'Drag on touch · no drag in space: you keep your speed, push against it to brake']
          : fastHits >= FAST_HINT && me.m < AGE_GOAL && !seen.has('fast') ? ['fast', 'Too fast to eat', 'Thrust against your motion · below 8 diam/s rocks stick']
          : aim && aim.danger < 0.2 && !seen.has('safe') ? ['safe', 'Green glow', 'Safe to eat: touch it slowly']
          : aim && aim.danger >= 1 && !seen.has('deadly') ? ['deadly', 'Red glow', 'It can swallow or shatter you'] : null;
        if (hint) {
          seen.add(hint[0]);
          toast(hint[1], hint[2]);
          if (hint[0] === 'fast') flashed = 3 * FLASH_S;
          save('hints', [...seen].join(','));
        }
      }
      lastTier = Math.max(lastTier, i);
      if (!!me.comet !== comet) {
        comet = !!me.comet;
        toast(comet ? 'Comet' : 'Extinct comet', comet ? 'Ice boils off you: faster, but you shrink' : 'Your ice is spent');
      }

      // Speed in your own diameters per second; the second needle is the predicted impact speed in the verdict colour.
      // Against a heavier target, slow isn't "eat": the eat and rough zones turn red.
      $('.speed').classList.toggle('heavy', !!aim && aim.target.m > me.m);
      const v = Math.hypot(me.motion.vx, me.motion.vy) / (2 * me.r);
      $('.speed .v').textContent = speedText(v);
      $('.speed .you').style.left = pct(gx(v));
      const hit = $('.speed .hit');
      hit.hidden = !aim;
      if (aim) [hit.style.left, hit.style.background] = [pct(gx(aim.speed)), hex(aim.color)];

      // What you are made of: rebuilt only when the rounded shares change.
      const m = mixBar(me.comp) + legend(me.comp);
      if (m !== mine) [mine, $('.me .mix').innerHTML, $('.me .legend').innerHTML] = [m, mixBar(me.comp), legend(me.comp)];

      if (ageOne) {
        // Head and goal: the tier, the bar to the next one.
        $('.me .name').textContent = name;
        $('.me .mass').textContent = me.m.toFixed(1);
        $('.goal i').style.width = next ? bar((me.m - from) / (next[0] - from)) : '100%';
        $('.goal .to').textContent = next ? `→ ${next[1]}` : 'Final tier';
        $('.goal .left').textContent = next ? `~${Math.ceil(Math.log(next[0] / me.m) / Math.log(1.1))} meals` : '';
        // Heat, water and air: each only once there is something to tell.
        const gas = me.comp.gas ?? 0, air = pressure(me.m, gas), ice = me.comp.ice ?? 0;
        const heat = $('.rock .heat');
        heat.hidden = me.heat <= 1;
        $('.rock .heat i').style.cssText = `width:${bar(me.heat / MAX_HEAT)};background:${me.heat > MOLTEN ? '#ff7a2a' : '#ffb347'}`;
        $('.rock .heat .v').textContent = `${Math.round(kelvin(me.heat))} K`;
        $('.rock .wet').hidden = ice < 0.005;
        $('.rock .wet .v').textContent = WATER[waterState(me.m, me.heat, gas)];
        $('.rock .wet i').style.width = bar(ice / 0.5);
        $('.rock .air').hidden = air < 0.01 && me.m < AIR_HINT_M;
        $('.rock .air .v').textContent = air >= 0.01 ? `${air.toFixed(air < 1 ? 2 : 1)} atm` : hold(me.m) <= 0 ? 'at 1.0k' : 'none';
        $('.rock .air i').style.width = bar(air / 1);
        $('.rock').hidden = heat.hidden && $('.rock .wet').hidden && $('.rock .air').hidden;
        // The tip: tags earned, then the closest one not earned yet.
        const has = [...(me.comet ? ['Comet'] : []), ...TAGS.filter((t) => (me.comp[t.el] ?? 0) >= t.min).map((t) => t.name)];
        const want = TAGS.filter((t) => (me.comp[t.el] ?? 0) < t.min)
          .map((t) => ({ t, n: mealsTo(me.comp[t.el] ?? 0, t.feed[t.el]!, t.min) })).sort((a, b) => a.n - b.n)[0];
        $('.me .tip').innerHTML = [...has.map((n) => `<b>${n}</b>`), want ? `${want.t.name} in ~${want.n} meals` : ''].filter(Boolean).join(' · ');
      } else $('.rock').hidden = true; // Age II: the climate cells take over

      // Target
      const panel = $('.target');
      panel.hidden = !t && !('star' in panel.dataset); // a star shows here when there is no body target (star/hud.ts)
      // Moon-size (Age II on): lit when it could be your moon, 0.2–12.5% of you (planet/rules.ts MOON_SHARE) and free.
      const moonsize = $('.target .moonsize');
      moonsize.hidden = !t || !!moon || ageOne;
      if (!t) return;
      const who = moon ? undefined : t.rival?.entry?.name;
      $('.target .name').textContent = who ?? tierOf(t.m)[1];
      const r = t.m / me.m;
      $('.target .ratio').textContent = r < 0.001 ? '×<0.001' : `×${r >= 10 ? Math.round(r) : r.toPrecision(2)}`;
      moonsize.classList.toggle('on', r >= MOON_SHARE[0] && r <= MOON_SHARE[1] && !t.held && !t.rival);
      $('.target .sub').textContent = moon ? `Moon · ${rockName(t)}` : who ? `${tierOf(t.m)[1]} · ${rockName(t)}` : rockName(t);
      const tm = mixBar(t.comp) + legend(t.comp);
      if (tm !== theirs) [theirs, $('.target .mix').innerHTML, $('.target .legend').innerHTML] = [tm, mixBar(t.comp), legend(t.comp)];
      // A named rival forging a world (rivals/ledger.ts): its life conditions and stage, as your card shows yours.
      const e = t.rival?.entry, alive = !!e && t.m >= AGE_GOAL;
      $('.target .chips').hidden = !alive;
      if (alive) {
        const h = habOf({ ...e, m: t.m, comp: t.comp, heat: t.heat, diff: t.diff ?? e.diff });
        for (const [k] of RIVAL_CHIPS) {
          const chip = $(`.target .chips [data-k="${k}"]`), s = h[k];
          chip.classList.toggle('on', s > 0);
          chip.classList.toggle('good', s >= 0.6);
        }
        $('.target .chips .life').textContent = lifeName(e.life.progress);
      }
      // One colour ties card and marker: the verdict (a selected moon: its blue); rivals are violet by name.
      const c = hex(moon ? MOON : aim!.color);
      panel.style.setProperty('--verdict', c);
      panel.classList.toggle('rival', !!t.rival);
      mark.style.setProperty('--verdict', c);
      mark.classList.toggle('rival', !!who);
      mark.firstElementChild!.textContent = who ?? '';
    },
  };
}

// Biome names (web.ts): a calm place name once you have been somewhere new BIOME_S s, never the same one within BIOME_AGAIN s.
const BIOME_S = 0.5; // fast flight crosses a thin band (rapids, meteors) in about a second
const BIOME_AGAIN = 40;
const BIOMES: Record<Biome, [string, string]> = {
  belt: ['Stone Drift', 'common rock, easy meals'],
  ice: ['Frost Reach', 'water-rich rock: seas start here'],
  metal: ['Iron Graveyard', 'shattered old cores, heavy and tough'],
  gas: ['Veil Nebula', 'light, gassy bodies that crumble'],
  rapids: ['Swift Current', 'the whole stream rides one flow'],
  meteors: ['Firefall Belt', 'dense, lively rock, always moving'],
  kuiper: ['Kuiper Rim', 'icy leftovers ringing an old star'],
  void: ['The Hollow', 'a star once swept this space clean'],
};
/** Feed it the run's roster each frame (asteroid/field.ts); calm toasts when a named rival is gone or its life falls back. */
export function rosterNews() {
  const told = new Set<Entry>(), setbacks = new Map<Entry, number>();
  return (list: readonly Entry[]) => {
    for (const e of list) {
      if (!e.alive && !told.has(e)) [told.add(e), toast(`${e.name} is gone`, 'a rival core, eaten or broken')];
      if (e.setbacks > (setbacks.get(e) ?? 0)) toast(`${e.name}'s life set back`, 'a big impact on their world');
      setbacks.set(e, e.setbacks);
    }
  };
}

/** Feed it the biome you are in each frame; it toasts the name on arrival (the first biome of a run silently). */
export function biomeNews() {
  let shown: Biome | undefined, maybe: Biome | undefined, held = 0, clock = 0;
  const last = new Map<Biome, number>();
  return (biome: Biome, dt: number) => {
    clock += dt;
    if (!shown) return void (shown = biome);
    if (biome === shown) return void (maybe = undefined);
    if (biome !== maybe) [maybe, held] = [biome, 0];
    if ((held += dt) < BIOME_S) return;
    shown = biome;
    if (clock - (last.get(biome) ?? -Infinity) < BIOME_AGAIN) return;
    last.set(biome, clock);
    toast(...BIOMES[biome]);
  };
}

/** Each biome's sky hue: render/background.ts shifts the nebulae toward it and washes space in it (white: no change). */
export const BIOME_SKY: Record<Biome, number> = {
  belt: 0xffffff,
  ice: 0x4aa0ff, // cold blue
  metal: 0x8a9cc8, // grey steel
  gas: 0xffa840, // amber haze
  rapids: 0x30e0b0, // teal
  meteors: 0xff5a3a, // ember red
  kuiper: 0x7dff9a, // a dead star's pale radioactive green
  void: 0xffffff, // already dimmed by the web
};
