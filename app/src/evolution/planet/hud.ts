import './hud.css';
import { AGE_GOAL, type Comp } from '../asteroid/rules';
import { big } from '../asteroid/hud';
import { addTips, cell, icon, row } from '../../ui/rows';
import { BROWN_DWARF_M, COLD_RAMP, FIELD_METAL, fieldParts, GAS_WARN, HOT_RAMP, LIFE_S, MOON_SHARE, moonSlots, nextMoonMass, radioLife, SUPER_M } from './rules';
import { P0, TIER_MAX } from '../civilization/rules';
import type { WorldState } from './stage';
import { bar as pct, finder, throttle } from '../../ui/panel';

// Age II in your card (asteroid/hud.ts): it writes the head (tier, mass) and the goal bar (life; the civilization's tier; the gas
// line's brown dwarf), and fills the World section: its summary (temperature, air, the worst condition, moons), the climate
// cells (temperature, air, water, magnetic field), the Moons row (with the next ring), and the nearest limit ahead while it
// matters (seas boil or gas world, the other in its tooltip), a scale with you as the needle.
// Every scale reads the same way: the needle is you, the band is where life wants it, the value is green inside.

const K_LOG = [100, 3000]; // temperature scale (log)
const P_LOG = [0.01, 30]; // air scale (log)
const AIR_OK = [0.7, 10]; // full air score (rules.ts habitability)
const WATER_OK = [0.3, 0.6]; // full water score (rules.ts habitability: from 10%, 30–60% ideal)
const GAS_LINE = 0.2, GAS_TOP = 0.25, GAS_SHOW = 0.05; // the gas line (rules.ts GAS_LINE), its scale's end, the row from this share
const BOIL_PAD = 2; // the seas-boil scale runs from AGE_GOAL to this × the boiling mass (log)

const logAt = (x: number, [a, b]: number[]) => Math.log(Math.max(a, x) / a) / Math.log(b / a);
/** A life score as a value class: green when good, amber when weak, red when missing. */
const grade = (s: number) => (s >= 0.6 ? 'ok' : s > 0 ? 'warn' : 'bad');
/** A mass ratio: ×6.1, ×42, ×1k+. */
const times = (r: number) => `×${r < 10 ? r.toFixed(1) : r < 1000 ? Math.round(r) : '1k+'}`;
const nth = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** The magnetic field's smallest lever (rules.ts fieldParts): metal share, how far it sank, or size. */
function fieldTip(w: WorldState, comp: Comp) {
  const f = fieldParts(w.mass, comp, w.diff), weak = w.scores.magnet > 0 ? 'Weak magnetic field' : 'No magnetic field';
  if (f.metal <= f.sunk && f.metal <= f.size) return `${weak}: needs more iron · eat metal rocks (${Math.round(FIELD_METAL * 100)}% sunk metal is full)`;
  if (f.sunk <= f.size) return `${weak}: your iron hasn't sunk · melt your world through with a big, fast impact`;
  return `${weak}: a bigger world keeps its core churning · grow, or eat more metal`;
}

/** One line about what limits life most: what's wrong and what the player can do (life speed = weakest of three × field). */
function tip(w: WorldState, comp: Comp) {
  if (w.envelope) return w.name === 'Brown dwarf' ? 'A failed star: the gas line ends here' : 'Gas world: no surface for life · grow toward a brown dwarf';
  if (!w.civ && radioLife(comp.radio ?? 0) < 0.6) return 'High rad: life is slow · eat plain rock to thin it';
  const s = w.scores, worst = Math.min(s.water, s.temp, s.air);
  if (w.life === 0 && w.lifeSpeed > 0 && worst >= 0.6) return ''; // all well: no tip; else the lever below
  if (s.magnet <= 0) return fieldTip(w, comp); // no field: life cannot start at all
  if (worst >= 0.6) return s.magnet < 0.6 ? fieldTip(w, comp) : w.life >= 0 ? '' : 'Life is about to start';
  if (s.water === worst) return w.waterShare < 0.1 ? 'Too dry: eat icy rocks and comets (water 10%+)' : w.waterShare < 0.3 ? 'Shallow seas: more ice and comets (30% water is ideal)' : 'Seas too deep: no land (water over 60%)';
  if (s.air === worst) return w.pressure < 0.7 ? 'Thin air: eat gas-rich rocks, or boil water into steam' : 'Air too thick';
  if (w.pressure < 0.05) return 'No air pressure: water cannot stay liquid';
  const cold = w.kelvin < (273 + w.boilingK) / 2; // which side of the liquid band the needle is on
  if (w.star?.owned && w.star.band) return cold ? 'Too cold: move your orbit closer to the star' : 'Too hot: move your orbit farther out'; // Age III: starlight is the climate
  if (w.kelvin < 273) return 'Frozen: thicker air traps more inner heat';
  if (cold) return 'Cold seas: thicker air warms them';
  return (w.star?.warm ?? 0) > 10 ? 'Too hot: the star is close · keep farther away' : 'Too hot: eat less and let your world cool';
}

/** The tooltip for `key`, from the latest world state. */
function tipFor(key: string, w: WorldState, comp: Comp): string | null {
  const m = w.mass, civ = w.civ, life = Math.round((100 * w.lifeProgress) / LIFE_S), next = nextMoonMass(m);
  switch (key) {
    case 'age': return w.star?.owned ? 'Age III: your star. Build a Dyson sphere around it.' : 'Age II: worlds. Give life water, warmth, air and a magnetic field until an intelligent species appears.';
    case 'tier': return `${w.name}: your world type.${w.goal ? `\nNext: ${w.goal.name} at ${big(w.goal.mass)} mass (${times(w.goal.mass / m)})${w.goal.need ? `, needs ${w.goal.need}` : ''}.` : w.envelope ? '' : '\nA rocky world has no bigger type: growing thickens your air (Seas boil).'}`;
    case 'mass': return `Mass ${big(m)}. Bigger worlds hold more air and feed more people.`;
    case 'goal':
      if (civ?.active) return `Civilization tier ${civ.tier} of ${TIER_MAX}: a tier for each doubling of your people.${civ.tier < TIER_MAX ? `\nNext tier at ${(P0 * 2 ** civ.tier).toFixed(1)} bn (now ${civ.pop.toFixed(1)}).` : ''}`;
      if (civ) return `No life: your people dwindle until life fills again (${life}%).`;
      if (w.envelope || w.gasLine) return `On the gas line: grow to a brown dwarf at ${big(BROWN_DWARF_M)} mass (${times(BROWN_DWARF_M / m)}), the start of Age III.`;
      return `Life ${life}%. It fills while water, temperature and air are good and you have a magnetic field; at 100% an intelligent species appears.\nIt falls back while the seas boil or dry out or the air is gone; a hard impact sets it back.`;
    case 'world': return 'Your world: what it is made of, its climate, its moons and the limits ahead.';
    case 'temp': return `Surface ${Math.round(w.kelvin - 273)}°C. The band: where your seas stay liquid at this pressure (0 to ${Math.round(w.boilingK - 273)}°C).\nLife is best from ${COLD_RAMP} K over freezing to ${HOT_RAMP} K under boiling. Thicker air traps more inner heat.`;
    case 'air': return `Air ${w.pressure.toFixed(2)} atm. Life wants ${AIR_OK[0]}–${AIR_OK[1]} atm (the band): it starts from 0.2 and is gone at 30.\nThicker air traps more heat.`;
    case 'water': return `Water ${Math.round(w.waterShare * 100)}% of your mass. ${WATER_OK[0] * 100}–${WATER_OK[1] * 100}% is ideal (the band); under 10% there is no life, past 60% deep seas leave little land and life slows.`;
    case 'magnet': return `Magnetic field: ${w.scores.magnet >= 0.6 ? 'strong' : w.scores.magnet > 0 ? 'weak' : 'none'}. From metal sunk to your core (${Math.round(FIELD_METAL * 100)}% is full) and size; a strong field halves the rad from space.\nNo field, no life.`;
    case 'moons': return `Moons: ${w.moons} of ${w.slots} rings filled${next ? `; a ${nth(moonSlots(m) + 1)} ring opens at ${big(next)} mass (${times(next / m)})` : ' (at most 5)'}.\nCatch one by flying a small body (${MOON_SHARE[0] * 100}–${MOON_SHARE[1] * 100}% of you) onto a free ring and matching its speed until the ring closes.\nMoons guard you by orbiting and are ore for your miners.`;
    case 'lim-boil': return w.limits.boil === Infinity ? null : `At today's gas share (${Math.round(w.gasShare * 100)}%) your air thickens as you grow, and your seas warm with it.\nSeas start to suffer\t${big(w.limits.suffer)} (${times(w.limits.suffer / m)})\nSeas boil\t${big(w.limits.boil)} (${times(w.limits.boil / m)})\nBoiling seas: life dies back, and a civilization falls asleep with it. Starlight brings both closer.`;
    case 'lim-gas': return `Gas ${Math.round(w.gasShare * 100)}% of your mass. At ${GAS_LINE * 100}% gas a world from Super-Earth mass (${big(SUPER_M)}) becomes a gas world: no surface, no life.\nUnder ${GAS_WARN * 100}% you are safe.`;
  }
  return null;
}
/** The limit row's tooltip: the limit shown first, the other one under it while it matters. */
const limTip = (key: string, w: WorldState, comp: Comp) => [tipFor(key, w, comp), tipFor(key === 'lim-gas' ? 'lim-boil' : 'lim-gas', w, comp)].filter(Boolean).join('\n\n') || null;

export function createWorldHud() {
  const host = document.getElementById('game-hud')!; // the stage HUD's root: hides with it under the game over card
  const card = host.querySelector<HTMLElement>('.me')!;
  host.dataset.stage = 'planet'; // shows the World header, hides Age I's rows (asteroid/hud.css)
  const el = document.createElement('div');
  el.className = 'world2';
  el.innerHTML = `<div class="cells clim">${cell('temp', 'temp', 'Temp', 'scale')}${cell('air', 'air', 'Air', 'scale')}${cell('water', 'water', 'Water', 'scale')}${cell('magnet', 'magnet', 'Field')}</div>
    <div class="row moons" data-tip="moons">${icon('orbit')}<em class="lb">Moons</em><span class="pips"></span><span class="v"></span></div>
    ${row('boil lim', 'temp', 'Seas boil', 'scale', 'lim-boil')}${row('gasl lim', 'gas', 'Gas world', 'scale', 'lim-gas')}`;
  const nodes = [...el.children] as HTMLElement[];
  card.querySelector('.world > .body')!.append(...nodes);
  const $ = finder(card.querySelector('.world')!), c$ = finder(card), due = throttle();
  const scale = (sel: string, lo: number, hi: number, at: number) => {
    $(`${sel} .band`).style.cssText = `left:${pct(lo)};width:${pct(hi - lo)}`;
    $(`${sel} .needle`).style.left = pct(at);
  };
  const value0 = (sel: string) => $(`${sel} .v`).textContent ?? '';
  const value = (sel: string, text: string, cls: string) => {
    const v = $(`${sel} .v`);
    v.textContent = text;
    v.className = `v ${cls}`;
  };
  let pips = '', sum = '', last: [WorldState, Comp] | undefined;
  const untip = addTips((key) => (!last ? null : key.startsWith('lim-') ? limTip(key, ...last) : tipFor(key, ...last)));

  return {
    /** Your card (the civilization's sections go in here: civilization/hud.ts). */
    panel: card,
    update(dt: number, w: WorldState, comp: Comp) {
      last = [w, comp];
      if (!due(dt)) return;
      c$('.age').textContent = w.star?.owned ? 'Age III' : 'Age II';
      c$('.head .name').textContent = w.name;
      c$('.head .mass').textContent = big(w.mass);

      // The goal bar (the star's while one is near: star/hud.ts): the civilization's tier, the gas line's brown dwarf, or life
      // (red under a civilization that lost it: people dwindle until it refills).
      const gas = w.envelope || w.gasLine, lost = !!w.civ && !w.civ.active, life = `${Math.round((100 * w.lifeProgress) / LIFE_S)}%`;
      card.classList.toggle('nolife', lost);
      if (!card.hasAttribute('data-star')) {
        const [to, left, f] = w.civ?.active ? ['Civilization', `T${w.civ.tier}/${TIER_MAX}`, w.civ.tier / TIER_MAX]
          : lost ? ['No life · dying out', life, w.lifeProgress / LIFE_S]
          : w.name === 'Brown dwarf' ? ['Brown dwarf', 'Age II complete', 1]
          : gas ? ['→ Brown dwarf', `×${(BROWN_DWARF_M / w.mass).toPrecision(2)} mass`, Math.log(w.mass / AGE_GOAL) / Math.log(BROWN_DWARF_M / AGE_GOAL)]
          : [w.lifeName, life, w.lifeProgress / LIFE_S];
        c$('.goal i').style.width = pct(f);
        c$('.goal .to').textContent = to;
        c$('.goal .left').textContent = left;
        c$('.goal').classList.toggle('stalled', !w.civ?.active && !gas && w.lifeSpeed <= 0);
        c$('.goal').classList.toggle('lost', lost);
      }

      // Temperature (log, liquid band, hatched when the air is too thin), air (log, breathable band), water, field.
      const lo = logAt(273, K_LOG), hi = logAt(Math.max(274, w.boilingK), K_LOG);
      scale('.temp', lo, hi, logAt(w.kelvin, K_LOG));
      $('.temp .band').classList.toggle('thin', w.pressure < 0.05);
      value('.temp', `${Math.round(w.kelvin - 273)}°C`, grade(w.scores.temp));
      scale('.air', logAt(AIR_OK[0], P_LOG), logAt(AIR_OK[1], P_LOG), logAt(w.pressure, P_LOG));
      value('.air', w.pressure >= 0.005 ? `${w.pressure.toFixed(w.pressure < 1 ? 2 : 1)} atm` : 'none', grade(w.scores.air));
      scale('.water', WATER_OK[0], WATER_OK[1], w.waterShare);
      value('.water', `${Math.round(w.waterShare * 100)}%`, grade(w.scores.water));
      $('.magnet i').style.width = pct(w.scores.magnet);
      value('.magnet', w.scores.magnet >= 0.6 ? 'Strong' : w.scores.magnet > 0 ? 'Weak' : 'None', grade(w.scores.magnet));
      $('.clim').hidden = w.envelope; // a gas world has no surface: nothing to read here

      // Moons: one pip per ring (hollow = free), filled n / rings.
      const p = Array.from({ length: w.slots }, (_, i) => `<i class="${i < w.moons ? 'moon' : 'free'}"></i>`).join('');
      if (p !== pips) $('.moons .pips').innerHTML = pips = p;
      const m = w.mass, next = nextMoonMass(m);
      $('.moons .v').textContent = `${w.moons}/${w.slots}${next ? ` · next ${times(next / m)}` : ''}`;

      // The header's summary: temperature, air, the worst condition if it is water or the field, moons; the worst one coloured.
      const parts: [number, string][] = [[w.scores.temp, value0('.temp')], [w.scores.air, value0('.air')], [w.scores.water, `Water ${value0('.water')}`], [w.scores.magnet, `Field ${value0('.magnet').toLowerCase()}`]];
      const worst = parts.reduce((a, b, i) => (b[0] < parts[a][0] ? i : a), 0), shown = w.envelope ? [] : worst > 1 && parts[worst][0] < 0.6 ? [0, 1, worst] : [0, 1];
      const html = [...shown.map((i) => (i === worst && parts[i][0] < 0.6 ? `<b class="${grade(parts[i][0])}">${parts[i][1]}</b>` : parts[i][1])), `Moons ${w.moons}/${w.slots}`].join(' · ');
      if (html !== sum) $('.hd .v').innerHTML = sum = html;

      // Limits ahead, each its own state colour (no alert): seas boil while they are liquid on a rocky world (the band from where
      // they start to suffer), the gas line while gas is worth watching, the next moon ring (neutral).
      const { suffer, boil } = w.limits, rocky = !w.envelope;
      const boilOn = rocky && w.water === 'liquid' && Number.isFinite(boil), gasOn = rocky && w.gasShare >= GAS_SHOW;
      const gasFirst = gasOn && (w.gasShare >= GAS_WARN || !boilOn); // one limit row: the nearer one (the other in its tooltip)
      $('.boil').hidden = !boilOn || gasFirst;
      if (boilOn) {
        const ax = [AGE_GOAL, BOIL_PAD * boil], s = logAt(suffer, ax), b = logAt(boil, ax);
        scale('.boil', s, b, logAt(m, ax));
        $('.boil .scale').style.setProperty('--past', pct(b));
        value('.boil', `${times(boil / m)} mass`, m >= boil ? 'bad' : m >= suffer ? 'warn' : 'ok');
      }
      $('.gasl').hidden = !gasFirst;
      if (gasOn) {
        scale('.gasl', GAS_WARN / GAS_TOP, GAS_LINE / GAS_TOP, w.gasShare / GAS_TOP);
        $('.gasl .scale').style.setProperty('--past', pct(GAS_LINE / GAS_TOP));
        value('.gasl', `${Math.round(w.gasShare * 100)}% / ${GAS_LINE * 100}%`, w.gasShare >= GAS_LINE ? 'bad' : w.gasShare >= GAS_WARN ? 'warn' : 'ok');
      }

      c$(':scope > .tip').textContent = tip(w, comp);
    },
    destroy() {
      host.dataset.stage = 'asteroid';
      card.querySelector('.age')!.textContent = 'Age I';
      card.classList.remove('nolife');
      card.querySelector('.goal')!.classList.remove('lost', 'stalled');
      nodes.forEach((n) => n.remove());
      untip();
    },
  };
}
