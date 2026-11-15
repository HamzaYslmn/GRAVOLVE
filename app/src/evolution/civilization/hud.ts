import './hud.css';
import { DOSE_SAFE } from './rules';
import { energyTint } from './lattice';
import { YOU } from '../../render/tech';
import { cell } from '../asteroid/hud';
import type { CivState } from './stage';
import { SLOTS } from './slots';
import { SHIP_ART } from '../../render/shipArt';
import { bar as pct, finder, hex, throttle } from '../../ui/panel';

// The civilization's rows in your card (asteroid/hud.ts; planet/hud.ts puts its tier on the goal bar):
//   people     fill = population / what the world can hold, ▲ / ▼ trend (red ▼ while life is lost)
//   energy     fill = supply / need (full = all they need), "100% · 7m": how long the fuel lasts at this burn (none while
//              inner heat covers the need); amber under 2 min, red while under-fed
//   radiation  scale 0..3, the band is safe (≤ 1), the needle is the dose
//   shield     fill = charge / what the levels hold, "L3 · 69%", "down" in red; bar and icon in the lattice's colour (lattice.ts energyTint)
//   slots      one per fleet class (slots.ts): art to scale, count / cap (rockets: how many the ore buys), a reload bar;
//              a cyan edge takes the priority, dim cannot, faint: none yet
//   stock      in words: Fuel 42 · Ore 984 · Vol 735

const DOSE_MAX = 3;
const ROCKET_ICON = '<svg class="art" viewBox="0 0 12 12"><path d="M1.5 6h5.5l3-2v4l-3-2M3 4.2 1.5 6 3 7.8" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
const art = (k: (typeof SLOTS)[number]) => (k === 'rocket' ? ROCKET_ICON : `<svg class="art" viewBox="20 18 130 64">${SHIP_ART.you[k]}</svg>`);
const label = (k: string) => k[0].toUpperCase() + k.slice(1);

export function createCivHud(panel: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'sec civ';
  el.innerHTML = `<div class="cells">${cell('pop', 'people', 'People')}${cell('energy', 'bolt', 'Energy')}${cell('dose', 'rad', 'Radiation', 'scale')}${cell('shield', 'shield', 'Shield')}</div>
    <div class="slots">${SLOTS.map((k) => `<div class="slot ${k}">${art(k)}<em>${label(k)}</em><b class="v"></b><div class="bar"><i></i></div></div>`).join('')}</div>
    <div class="stock"><span>Fuel <b class="fuel"></b></span><span>Ore <b class="ore"></b></span><span>Vol <b class="vol"></b></span></div>`;
  panel.querySelector(':scope > .tip')?.before(el);
  const $ = finder(el), due = throttle();
  $('.dose .band').style.cssText = `left:0;width:${pct(DOSE_SAFE / DOSE_MAX)}`;
  const value = (sel: string, text: string, cls: string) => {
    const v = $(`${sel} .v`);
    v.textContent = text;
    v.className = `v ${cls}`;
  };
  return {
    update(dt: number, s: CivState) {
      if (!due(dt)) return;
      const down = !s.active || s.trend < 0;
      value('.pop', `${s.pop.toFixed(s.pop >= 10 ? 0 : 1)}B${down ? '▼' : s.trend > 0 ? '▲' : ''}`, down ? 'bad' : s.trend > 0 ? 'ok' : '');
      $('.pop i').style.width = pct(s.pop / Math.max(1e-6, s.cap));
      const fed = s.energy / Math.max(1e-6, s.need);
      const left = Number.isFinite(s.left) ? ` · ${s.left < 90 ? `${Math.round(s.left)}s` : `${Math.round(s.left / 60)}m`}` : '';
      value('.energy', `${Math.round(Math.min(fed, 1) * 100)}%${left}`, fed < 1 ? 'bad' : s.left < 120 ? 'warn' : 'ok');
      $('.energy i').style.width = pct(fed);
      $('.dose .needle').style.left = pct(s.dose / DOSE_MAX);
      value('.dose', s.dose.toFixed(1), s.harm > 0 ? 'bad' : 'ok');
      const charge = Math.max(0, s.shield) / Math.max(1e-6, s.shieldMax);
      value('.shield', s.shield > 0 ? `L${s.level} · ${Math.round(charge * 100)}%` : 'down', s.shield > 0 ? '' : 'bad');
      $('.shield i').style.width = pct(charge);
      $('.shield').style.color = s.shield > 0 ? hex(energyTint(YOU, charge)) : ''; // down: the .bad red
      for (const k of SLOTS) {
        const q = s.slots[k], box = $(`.slot.${k}`);
        box.className = `slot ${k} ${s.active ? q.look : 'none'}`;
        box.querySelector('.v')!.textContent = k === 'rocket' ? (q.n > 99 ? '99+' : `×${q.n}`) : q.cap ? `${q.n}/${q.cap}` : '–';
        (box.querySelector('.bar > i') as HTMLElement).style.width = pct(q.ready);
      }
      $('.fuel').textContent = String(Math.floor(s.fuel));
      $('.ore').textContent = String(Math.floor(s.ore));
      $('.vol').textContent = String(Math.floor(s.vol));
    },
    destroy() {
      el.remove();
    },
  };
}
