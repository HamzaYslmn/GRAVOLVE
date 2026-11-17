import '../../ui/hud.css'; // HUD primitives first: the stage CSS builds on them
import './hud.css';
import type { Container } from 'pixi.js';
import type { Aim } from './player';
import type { Body, Hit } from './body';
import { hold, kelvin, pressure, waterState, type WaterState } from '../../core/water';
import { toast, toastBusy } from '../../ui/toast';
import { load, save } from '../../ui/settings';
import { bar, finder, fit, hex, label, PERIOD, throttle, widths } from '../../ui/panel';
import { cell, head, icon, tipText, addTips } from '../../ui/rows';
import { createTip } from '../../ui/tip';
import type { Controls } from '../../core/input';
import type { Biome } from './web';
import { habOf, type Entry } from '../rivals/ledger';
import { handsOff, lifeName, moonCap, MOON, MOON_SHARE } from '../planet/rules';
import { AGE_GOAL, shapeOf, MAX_HEAT, mealsTo, MOLTEN, TAGS, tierAt, TIERS, V_STICK, type Comp, type Element } from './rules';

// The stage HUD, plain DOM over the canvas: every readout is an icon with a label on the card's shared columns (ui/rows.ts,
// ui/hud.css). Two cards and a marker:
//   your card (bottom left, 320 px; 340 from 1000 px tall): head (age, tier, mass) and the stage's goal bar, then sections,
//     each only once its stage exists: World (speed, composition; planet/ adds climate, moons, limits), the civilization's
//     People, Energy, Stocks, Fleet (civilization/), the Star (star/), and one tip. Each section is a header with a live
//     one-line summary and a body a click on the header opens or folds (Energy's bar and the stock amounts always show).
//     Defaults: World open; with a civilization Defence instead (from 900 px tall World and Defence); your own toggles win
//     (gravolve.hudOpen); under 900 px
//     one section besides World is open at a time. Phones (PHONE): compact, every section folded to its header (speed stays),
//     a tap opens one at a time, not saved (hud.css).
//   target card (top right): the body you are heading for, with the same corner brackets as the marker in the world.
//   marker: those brackets around the target body itself, in the verdict colour; a named rival gets its name over it.
// Every [data-tip] explains itself on hover (ui/tip.ts); each stage registers its texts (ui/rows.ts addTips).
// Updated ~12×/s; the marker follows every frame.

// [element, label, colour, icon]: colour and shape together, so a segment reads at a glance (and without colour vision).
const ELEMENTS: [Element, string, string, string][] = [
  ['metal', 'Metal', '#9fb0c8', '<path d="M6 1 10.3 3.5v5L6 11 1.7 8.5v-5Z"/><circle cx="6" cy="6" r="1.7"/>'],
  ['rock', 'Rock', '#c9a27a', '<path d="M2 8.2 2.8 4 6 1.6 9.6 3 11 7.2 8.4 10.6H3.6Z"/><path d="M6 4.2 5.1 6.9 7 7.8"/>'],
  ['ice', 'Water', '#6fd3ff', '<path d="M6 1.2C4 4 2.8 5.8 2.8 7.6a3.2 3.2 0 0 0 6.4 0C9.2 5.8 8 4 6 1.2Z"/>'],
  ['gas', 'Gas', '#ffd27a', '<path d="M1.5 3.8c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0M1.5 8.2c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0"/>'],
  ['radio', 'Rad', '#8dff6a', '<path class="fill" d="M4.95 4.54L3.3 1.68A5.4 5.4 0 0 1 8.7 1.68L7.05 4.54A2.1 2.1 0 0 0 4.95 4.54ZM8.1 6.36L11.4 6.36A5.4 5.4 0 0 1 8.7 11.04L7.05 8.18A2.1 2.1 0 0 0 8.1 6.36ZM4.95 8.18L3.3 11.04A5.4 5.4 0 0 1 0.6 6.36L3.9 6.36A2.1 2.1 0 0 0 4.95 8.18Z"/><circle class="fill" cx="6" cy="6.36" r="1.1"/>'], // radioactive heavy elements
];
// Speed gauge on a log scale (there is no top speed): the eat zone (0..8) keeps ~20% of the width,
// 256 diameters/s and up pins the needle.
const SPEED_TOP = 256;
const gx = (v: number) => Math.min(1, Math.log1p(Math.max(0, v) / V_STICK) / Math.log1p(SPEED_TOP / V_STICK));
const speedText = (v: number) => (v < 10 ? v.toFixed(1) : v < 1000 ? v.toFixed(0) : `${(v / 1000).toFixed(v < 1e4 ? 1 : 0)}k`);
// A rival world's life conditions in the target card (keys of planet/rules.ts habitability).
const RIVAL_CHIPS = [['water', 'Water', 'water'], ['air', 'Air', 'air'], ['magnet', 'Magnetic field', 'magnet']] as const;
const WATER: Record<WaterState, string> = { ice: 'Ice', liquid: 'Liquid', steam: 'Steam' };
// px: the composition bar in your card (its inner width: --ui-card less 2 × --ui-s4, styles/base.css) and the target card;
// on phones (a narrower card on small screens) the bar `el` is measured.
const MIX_TARGET = 200;
const BIG = matchMedia('(min-height: 1000px)');
/** Phones: a narrow touch screen, or any screen under 500 px tall (the same query as hud.css's phone rules). */
export const PHONE = matchMedia('(pointer: coarse) and (max-width: 640px), (max-height: 500px)');
export const innerPx = (el?: HTMLElement) => (PHONE.matches && el?.clientWidth) || (BIG.matches ? 316 : 296);
const AIR_HINT_M = 300; // from here the air cell tells where air starts (core/water.ts: from 1.0k mass)
const OPEN_ONE = 900; // px tall: under this one section besides World open at a time; from it more open by default
const GUARD_MS = 400; // after a toggle the card swallows presses this long: the header moved, a quick second click must not fire

const pct = (f: number) => `${Math.round(f * 100)}%`;
/** A composition share as text: one decimal under 1%, so a trace never reads as 0%. */
const share = (f: number) => (f > 0.0005 && f < 0.01 ? `${(f * 100).toFixed(1)}%` : pct(f));
/** A composition as tooltip rows, biggest first. */
export const mixRows = (c: Comp) => ELEMENTS.filter(([e]) => (c[e] ?? 0) >= 0.0005).sort((a, b) => c[b[0]]! - c[a[0]]!).map(([e, name]) => `${name}\t${share(c[e]!)}`).join('\n');
/** Mass as text: 12.3, 4.5k, 21.3M. */
export const big = (m: number) => (m >= 1e6 ? `${(m / 1e6).toFixed(m >= 1e8 ? 0 : 1)}M` : m >= 1e4 ? `${Math.round(m / 1e3)}k` : m >= 1e3 ? `${(m / 1e3).toFixed(1)}k` : m.toFixed(1));

/**
 * A composition as one stacked bar `px` wide: every element from 0.5% keeps icon · share, the biggest also their names
 * while there is room (ui/panel.ts widths), so a segment's width follows its label, not its share. Flex weights, so the
 * bar still fills when its real width differs.
 */
const mixBar = (c: Comp, px: number) => {
  const els = ELEMENTS.filter(([e]) => (c[e] ?? 0) >= 0.005);
  const w = widths(px, els.map(([e, name]) => [c[e]!, name, share(c[e]!)]));
  return els.map(([e, name, col, svg], i) => {
    const v = share(c[e]!);
    return `<i style="flex:${w[i].toFixed(1)} 1 0;background:${col}"><svg class="icon" viewBox="0 0 12 12" aria-hidden="true">${svg}</svg><span>${label(fit(w[i], name, v), name, v)}</span></i>`;
  }).join('');
};

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

const tierOf = (m: number) => TIERS[tierAt(m)];

// The no-drag lesson: FAST_HINT bounces above the stick speed bring the "too fast" hint, and every fast
// bounce flashes the speed needle so the bounce reads as "my speed".
const FAST_HINT = 2;
const FLASH_S = 1.2;
let fastHits = 0, flashed = 0;
/** The speed row's tooltip (every stage): `v` and the predicted hit in your diameters a second. */
export const speedTip = (v: number, aim?: Aim, moon = false) =>
  `Speed ${speedText(v)}: your own diameters a second. No drag in space: thrust against your motion to brake.\nGreen, under ${V_STICK}: rocks stick, you eat them.\nAmber, to ${3 * V_STICK}: rough hits.\nRed: hits bounce or break.\nAll red: your target outweighs you, slow is not safe.${aim && !moon ? `\nThe small mark under it: your speed into your target, ${speedText(aim.speed)}.` : ''}`;
/** The composition bar's tooltip (every stage). */
export const mixTip = (c: Comp) =>
  `What you are made of:\n${mixRows(c)}\nWater makes seas, gas makes air, sunk metal makes the magnetic field, Rad keeps a core churning and fuels reactors.`;
/** A hit with you as the actor (field.ts). */
export function noteHit(h: Hit) {
  if ((h.kind === 'bounce' || h.kind === 'graze') && h.speed > V_STICK) [fastHits, flashed] = [fastHits + 1, FLASH_S];
}

/** `input`, `surface` (the canvas): section headers take clicks (input.claim), tooltips follow the mouse (ui/tip.ts). */
export function createHud(input?: Controls, surface?: HTMLElement) {
  const root = document.createElement('div');
  root.id = 'game-hud';
  root.dataset.stage = 'asteroid'; // planet/hud.ts sets 'planet'
  root.innerHTML = `
    <div class="mark" hidden><b></b></div>
    <section class="panel ui-panel me">
      <div class="head"><em class="age" data-tip="age">Age I</em><b class="name" data-tip="tier"></b><span class="mass" data-tip="mass"></span></div>
      <div class="goal" data-tip="goal"><div class="bar"><i></i></div><div class="label"><span class="to"></span><span class="left"></span></div></div>
      <div class="sec world" data-s="world">${head('world', 'world', 'World')}<div class="body">
        <div class="speed row" data-tip="speed">${icon('speed')}<em class="lb">Speed</em><div class="gauge"><i class="zone stick" style="width:${pct(gx(V_STICK))}"></i><i class="zone messy" style="width:${pct(gx(3 * V_STICK) - gx(V_STICK))}"></i><i class="zone bounce"></i><i class="needle you"></i><i class="needle hit"></i></div><span class="v"></span></div>
        <div class="mix" data-tip="mix"></div>
        <div class="cells rock">${cell('heat', 'temp', 'Temp')}${cell('wet', 'water', 'Water')}${cell('air1', 'air', 'Air')}</div>
      </div></div>
      <div class="tip"></div>
    </section>
    <section class="panel ui-panel target" hidden><div class="head"><b class="name"></b><span class="ratio" data-tip="t-ratio"></span></div><div class="sub"></div>
      <span class="moonsize" data-tip="t-moonsize" hidden>Moon-size</span>
      <div class="mix" data-tip="t-mix"></div>
      <div class="chips" data-tip="t-chips" hidden>${RIVAL_CHIPS.map(([k, , ic]) => `<span data-k="${k}">${icon(ic)}</span>`).join('')}<em class="life"></em></div></section>`;
  document.body.appendChild(root);
  const $ = finder(root), due = throttle(), mark = $('.mark'), card = $('.me'), target = $('.target');
  let lastTier = -1, comet = false, mine = '', theirs = '', body: Body | undefined, seenAim: Aim | undefined, seenT: Body | undefined, seenMoon = false, seenV = 0;
  const seen = new Set<string>((load('hints') ?? '').split(',').filter(Boolean));

  // Open sections: the defaults by height, then your own toggles in order (newest last: "energy:1 world:0"); under OPEN_ONE
  // only the newest section you opened besides World stays open. Each section's .open class follows (sync, at PERIOD).
  // Phones keep their own one open section in memory, never saved: a phone starts compact and never edits desktop's set.
  let picks = (load('hudOpen') ?? '').split(' ').filter((p) => /^[a-z]+:[01]$/.test(p)).map((p) => [p.slice(0, -2), p.endsWith('1')] as [string, boolean]);
  let phoneOpen = '';
  const opened = () => {
    if (PHONE.matches) return new Set(phoneOpen ? [phoneOpen] : []);
    const tall = innerHeight >= OPEN_ONE, civ = !!card.querySelector('.sec[data-s="fleet"]');
    const on = new Set(civ ? (tall ? ['world', 'fleet'] : ['fleet']) : ['world']);
    for (const [k, v] of picks) v ? on.add(k) : on.delete(k);
    if (!tall) {
      const keep = picks.filter(([k, v]) => v && k !== 'world').at(-1)?.[0] ?? (civ ? 'fleet' : undefined);
      for (const k of [...on]) if (k !== 'world' && k !== keep) on.delete(k);
    }
    return on;
  };
  let on = opened();
  const sync = () => {
    on = opened(); // each time: the window may have turned into a phone's or back (a resize, a rotation)
    // A phone's open section that has gone (the star left, a new run): back to compact.
    if (PHONE.matches && on.has(phoneOpen) && !card.querySelector<HTMLElement>(`.sec[data-s="${phoneOpen}"]`)?.offsetHeight) [phoneOpen, on] = ['', new Set()];
    card.querySelectorAll<HTMLElement>('.sec[data-s]').forEach((e) => e.classList.toggle('open', on.has(e.dataset.s!)));
  };
  const inside = (e: HTMLElement, x: number, y: number) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  const secAt = (x: number, y: number) => [...card.querySelectorAll<HTMLElement>('[data-sec]')].find((h) => inside(h, x, y));
  let guard = 0; // until then a press anywhere on the card is the HUD's (and does nothing): the header just moved under it
  input?.claim((x, y) => !root.hidden && (!!secAt(x, y) || (performance.now() < guard && inside(card, x, y))), (x, y) => {
    const k = secAt(x, y)?.dataset.sec;
    if (!k || performance.now() < guard) return;
    [guard, on] = [performance.now() + GUARD_MS, opened()];
    if (PHONE.matches) return void ((phoneOpen = on.has(k) ? '' : k), sync());
    const shut = innerHeight < OPEN_ONE && k !== 'world' && !on.has(k) ? [...on].filter((o) => o !== 'world') : []; // the one it replaces
    picks = [...picks.filter(([p]) => p !== k && !shut.includes(p)), ...shut.map((o) => [o, false] as [string, boolean]), [k, !on.has(k)]];
    sync();
    save('hudOpen', picks.map(([p, v]) => `${p}:${+v}`).join(' '));
  });
  const tip = surface && createTip({ card: () => [card, target], text: tipText, surface, host: root });

  // Age I's texts, and the target card's (later stages answer first for the keys they own).
  addTips((key) => {
    const me = body, t = seenT;
    if (key.startsWith('t-')) {
      if (!t || !me) return null;
      const r = t.m / me.m;
      if (key === 't-ratio') return `Its mass: ×${r < 0.001 ? '<0.001' : r.toPrecision(2)} yours (${big(t.m)}).\nThe glow and these brackets: green safe to eat, red deadly.`;
      if (key === 't-mix') return `What it is made of:\n${mixRows(t.comp)}`;
      if (key === 't-moonsize') return 'Moon-size, lit when it could be your moon: 0.2–12.5% of your mass and narrow enough for a ring.\nCatch it by flying it onto a free ring and matching its speed until the ring closes.';
      if (key === 't-chips') return 'A rival world\'s life conditions: Water, Air, Magnetic field.\nDim: missing. Amber: weak. Green: good.\nThe word at the right: how far its life has come.';
      return null;
    }
    if (!me) return null;
    if (key === 'speed') return speedTip(seenV, seenAim, seenMoon);
    if (key === 'mix') return mixTip(me.comp);
    if (root.dataset.stage !== 'asteroid') return null;
    const i = tierAt(me.m), [from, name] = TIERS[i], next = TIERS[i + 1];
    switch (key) {
      case 'age': return `Age I: from dust to a world. Grow by eating smaller rocks.\nAt ${big(AGE_GOAL)} mass you are a Planetoid: Age II, worlds and life.`;
      case 'tier': return `${name}: your size class.${next ? `\nNext: ${next[1]} at ${big(next[0])} mass.` : ''}`;
      case 'mass': return `Mass ${big(me.m)}. Each rock you eat adds its mass: touch smaller rocks slowly.`;
      case 'goal': return next ? `Next tier: ${next[1]} at ${big(next[0])} mass (from ${big(from)}).\nAbout ${Math.ceil(Math.log(next[0] / me.m) / Math.log(1.1))} meals, a meal counted as +10% of you.` : 'Final tier of Age I.';
      case 'heat': return `Heat ${Math.round(kelvin(me.heat))} K. Fast hits warm you; you cool slowly.\nOver ${Math.round(kelvin(MOLTEN))} K you are molten: rocks stick to you up to ${1.5 * V_STICK} diameters a second.`;
      case 'wet': return `Water ${share(me.comp.ice ?? 0)} of your mass, now ${WATER[waterState(me.m, me.heat, me.comp.gas ?? 0)].toLowerCase()}.\nIt makes the seas of your world later: life wants 30–60%.`;
      case 'air1': return `Air: the gas your gravity holds, from 1.0k mass.\nLife later wants 0.7–10 atm: eat gas-rich rocks.`;
    }
    return null;
  });

  return {
    /** Shows or hides the whole HUD (e.g. under the game over card). */
    set visible(v: boolean) {
      root.hidden = !v;
      if (!v) tip?.hide();
    },
    /** `moon`: a moon you selected, shown in the target card; `world`: the camera's container, to place the marker. */
    update(dt: number, me: Body, aim: Aim | undefined, moon?: { body: Body }, world?: Container) {
      tip?.update(dt);
      // The marker follows its body every frame (the cards update at PERIOD).
      const t = moon?.body ?? aim?.target;
      [seenAim, seenT, seenMoon] = [aim, t, !!moon];
      mark.hidden = !t?.m || !world;
      if (t?.m && world) {
        const p = world.toGlobal(t.motion), s = Math.max(22, 2 * t.r * world.scale.x + 16);
        mark.style.transform = `translate(${(p.x - s / 2).toFixed(1)}px, ${(p.y - s / 2).toFixed(1)}px)`;
        mark.style.width = mark.style.height = `${s.toFixed(1)}px`;
      }
      if (!due(dt) || !me.m) return;
      if (me !== body) [body, lastTier] = [me, -1]; // a new run or a respawn: the HUD outlives runs
      sync(); // stage sections come and go
      const ageOne = root.dataset.stage === 'asteroid';
      flashed = Math.max(0, flashed - PERIOD);
      $('.speed').classList.toggle('flash', flashed > 0 && me.m < AGE_GOAL);

      // Tier news and first-run hints
      const i = tierAt(me.m);
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
      $('.speed .v').textContent = speedText((seenV = v));
      $('.speed .you').style.left = pct(gx(v));
      const hit = $('.speed .hit');
      hit.hidden = !aim;
      if (aim) [hit.style.left, hit.style.background] = [pct(gx(aim.speed)), hex(aim.color)];

      // What you are made of: rebuilt only when the rounded shares change.
      const m = mixBar(me.comp, innerPx($('.me .mix')));
      if (m !== mine) $('.me .mix').innerHTML = mine = m;

      if (ageOne) {
        // Head and goal: the tier, the bar to the next one.
        $('.me .name').textContent = name;
        $('.me .mass').textContent = big(me.m);
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
        $('.rock .air1').hidden = air < 0.01 && me.m < AIR_HINT_M;
        $('.rock .air1 .v').textContent = air >= 0.01 ? `${air.toFixed(air < 1 ? 2 : 1)} atm` : hold(me.m) <= 0 ? 'at 1.0k' : 'none';
        $('.rock .air1 i').style.width = bar(air / 1);
        $('.rock').hidden = heat.hidden && $('.rock .wet').hidden && $('.rock .air1').hidden;
        // The tip: tags earned, then the closest one not earned yet.
        const has = [...(me.comet ? ['Comet'] : []), ...TAGS.filter((t) => (me.comp[t.el] ?? 0) >= t.min).map((t) => t.name)];
        const want = TAGS.filter((t) => (me.comp[t.el] ?? 0) < t.min)
          .map((t) => ({ t, n: mealsTo(me.comp[t.el] ?? 0, t.feed[t.el]!, t.min) })).sort((a, b) => a.n - b.n)[0];
        $('.me .tip').innerHTML = [...has.map((n) => `<b>${n}</b>`), want ? `${want.t.name} in ~${want.n} meals` : ''].filter(Boolean).join(' · ');
      } else $('.rock').hidden = true; // Age II: the climate cells take over

      // Target
      const panel = $('.target');
      panel.hidden = !t && !('star' in panel.dataset); // a star shows here when there is no body target (star/hud.ts)
      // Moon-size (Age II on): lit when it could be your moon (the size gate of a catch) and free.
      const moonsize = $('.target .moonsize');
      moonsize.hidden = !t || !!moon || ageOne;
      if (!t) return;
      const who = moon ? undefined : t.rival?.entry?.name;
      $('.target .name').textContent = who ?? tierOf(t.m)[1];
      const r = t.m / me.m, cap = moonCap(t.m, t.r, me.m, me.r);
      $('.target .ratio').textContent = r < 0.001 ? '×<0.001' : `×${r >= 10 ? Math.round(r) : r.toPrecision(2)}`;
      moonsize.classList.toggle('on', t.m >= Math.min(MOON_SHARE[0] * me.m, 0.25 * cap) && t.m <= 1.01 * cap && !handsOff(t) && !t.rival); // planet/moons.ts sizeOk's bounds
      $('.target .sub').textContent = moon ? `Moon · ${rockName(t)}` : who ? `${tierOf(t.m)[1]} · ${rockName(t)}` : rockName(t);
      const tm = mixBar(t.comp, MIX_TARGET);
      if (tm !== theirs) $('.target .mix').innerHTML = theirs = tm;
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
