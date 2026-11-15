import './hud.css';
import { AGE_GOAL, type Comp } from '../asteroid/rules';
import { cell } from '../asteroid/hud';
import { BROWN_DWARF_M, FIELD_METAL, fieldParts, LIFE_S, radioLife } from './rules';
import { TIER_MAX } from '../civilization/rules';
import type { WorldState } from './stage';
import { bar as pct, finder, throttle } from '../../ui/panel';

// Age II in your card (asteroid/hud.ts): it writes the head (tier, mass), the moon pips on the goal label and the goal bar (life; the
// civilization's tier; the gas line's brown dwarf), and adds the climate cells: temperature, air, water, magnetic field
// (one compact line while a civilization lives: asteroid/hud.css).
// Every scale reads the same way: the needle is you, the band is where life wants it, the value is green inside.

const K_LOG = [100, 3000]; // temperature scale (log)
const P_LOG = [0.01, 30]; // air scale (log)
const AIR_OK = [0.7, 10]; // full air score (rules.ts habitability)
const WATER_OK = [0.3, 0.6]; // full water score (rules.ts habitability: from 10%, 30–60% ideal)

const logAt = (x: number, [a, b]: number[]) => Math.log(Math.max(a, x) / a) / Math.log(b / a);
/** Mass for the card: 100k, 21.3M, so the tier name keeps its room. */
const big = (m: number) => (m >= 1e6 ? `${(m / 1e6).toFixed(m >= 1e8 ? 0 : 1)}M` : m >= 1e4 ? `${Math.round(m / 1e3)}k` : m.toFixed(1));
/** A life score as a value class: green when good, amber when weak, red when missing. */
const grade = (s: number) => (s >= 0.6 ? 'ok' : s > 0 ? 'warn' : 'bad');

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

export function createWorldHud() {
  const host = document.getElementById('game-hud')!; // the stage HUD's root: hides with it under the game over card
  const card = host.querySelector<HTMLElement>('.me')!;
  host.dataset.stage = 'planet'; // hides Age I's rows (asteroid/hud.css)
  const el = document.createElement('div');
  el.className = 'sec world';
  el.innerHTML = `<div class="cells">${cell('temp', 'temp', 'Temp', 'scale')}${cell('air', 'air', 'Air', 'scale')}${cell('water', 'water', 'Water', 'scale')}${cell('magnet', 'magnet', 'Field')}</div>
    <div class="sub next"></div><div class="sub warn gas"></div>`;
  card.querySelector(':scope > .tip')!.before(el);
  const $ = finder(el), c$ = finder(card), due = throttle();
  const scale = (sel: string, lo: number, hi: number, at: number) => {
    $(`${sel} .band`).style.cssText = `left:${pct(lo)};width:${pct(hi - lo)}`;
    $(`${sel} .needle`).style.left = pct(at);
  };
  const value = (sel: string, text: string, cls: string) => {
    const v = $(`${sel} .v`);
    v.textContent = text;
    v.className = `v ${cls}`;
  };
  let pips = '';

  return {
    /** Your card (the civilization's section goes in here: civilization/hud.ts). */
    panel: card,
    update(dt: number, w: WorldState, comp: Comp) {
      if (!due(dt)) return;
      c$('.age').textContent = w.star?.owned ? 'Age III' : 'Age II';
      c$('.head .name').textContent = w.name;
      c$('.head .mass').textContent = big(w.mass);
      const p = Array.from({ length: w.slots }, (_, i) => `<i class="${i < w.moons ? 'moon' : 'free'}"></i>`).join('');
      if (p !== pips) c$('.pips').innerHTML = pips = p;

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
      // The next tier: its name and the mass still to gain (no meals in Age II).
      $('.next').textContent = w.goal ? `Next: ${w.goal.name} · ×${(w.goal.mass / w.mass).toPrecision(2)} mass${w.goal.need ? ` · needs ${w.goal.need}` : ''}` : '';
      // Before the gas line locks life out: a rocky world from Planet mass with gas ≥ 15% is told.
      $('.gas').textContent = w.gasWarn ? `Gas ${Math.round(w.gasShare * 100)}% · ${w.gasLine ? `gas world at ${big(1e5)}: under 15% to stay rocky` : '20% makes a gas world: no life'}` : '';

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
      el.querySelector<HTMLElement>('.cells')!.hidden = w.envelope; // a gas world has no surface: nothing to read here

      c$(':scope > .tip').textContent = tip(w, comp);
    },
    destroy() {
      host.dataset.stage = 'asteroid';
      card.querySelector('.pips')!.innerHTML = '';
      card.querySelector('.age')!.textContent = 'Age I';
      card.classList.remove('nolife');
      card.querySelector('.goal')!.classList.remove('lost', 'stalled');
      el.remove();
    },
  };
}
