import './hud.css';
import { DOSE_SAFE, FUEL_RESERVE } from './rules';
import { energyTint } from './lattice';
import { YOU } from '../../render/tech';
import type { CivState } from './stage';
import { flow, fuelLeft, SLOTS, type Flow, type Power, type SlotKey } from './slots';
import { SHIP_ART } from '../../render/shipArt';
import { bar as pct, finder, fit, hex, label, throttle } from '../../ui/panel';
import { icon } from '../asteroid/hud';

// The civilization's rows in your card (asteroid/hud.ts), docs/hudandcontrols.md: vitals, MAKE and USE power bars,
// fuel, fleet pips, yard and stocks.

// Power segments: key, name, icon (asteroid/hud.ts). Each is labelled inside as far as it fits (ui/panel.ts fit).
const MAKE = [['geo', 'Geothermal', 'geo'], ['solar', 'Sun', 'sun'], ['dyson', 'Dyson', 'dyson'], ['fuel', 'Fuel', 'rad']] as const;
const USE = ['people', 'shield', 'yard', 'mend', 'rockets'] as const; // the strip under it, colours only
const TRACK = 152; // px: the energy track (card 234 − caption, totals and gaps)

const DOSE_MAX = 3;
const svg = (box: string, body: string) => `<svg class="art" viewBox="${box}">${body}</svg>`;
const LINE = 'fill="none" stroke="currentColor" stroke-width="1"';
const ART: Record<SlotKey, string> = {
  probe: svg('20 18 130 64', SHIP_ART.you.probe), fighter: svg('20 18 130 64', SHIP_ART.you.fighter), frigate: svg('20 18 130 64', SHIP_ART.you.frigate),
  rocket: svg('0 0 12 12', `<path d="M1.5 6h5.5l3-2v4l-3-2M3 4.2 1.5 6 3 7.8" ${LINE}/>`),
  missile: svg('0 0 12 12', `<path d="M1 6h7.5M8.5 4.3 11 6 8.5 7.7ZM1 4.3v3.4M3 4.6v2.8" ${LINE}/>`),
};
const seg = ([k, , ic]: readonly [string, string, Parameters<typeof icon>[0]]) => `<i class="s-${k}">${icon(ic)}<em></em></i>`;
const meter = (cls: string, ic: Parameters<typeof icon>[0], track: string) => `<span class="m ${cls}">${icon(ic)}<b></b>${track}</span>`;
const span = (s: number) => (s < 90 ? `${Math.round(s)}s` : `${Math.round(s / 60)}m`);
const num = (x: number) => (x < 10 ? x.toFixed(1) : String(Math.round(x)));

export function createCivHud(panel: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'sec civ';
  el.innerHTML = `<div class="vit">${meter('pop', 'people', '<div class="bar"><i></i></div>')}${meter('dose', 'rad', '<div class="scale"><s class="band"></s><i class="needle"></i></div>')}${meter('shield', 'shield', '<div class="bar"><i></i></div>')}</div>
    <div class="pw"><em class="cap">Energy</em><div class="track">${MAKE.map(seg).join('')}<i class="s-spare"></i><u></u><s class="need"></s></div><b><span class="mk"></span><span class="us"></span></b><div class="strip">${USE.map((k) => `<i class="s-${k}"></i>`).join('')}</div></div>
    <div class="tank"><em class="cap">Fuel</em><b></b></div>
    <div class="fleet">${SLOTS.map((k) => `<span class="g ${k}">${ART[k]}<span class="p"></span></span>`).join('')}<span class="yard"><span class="job" hidden><em></em><div class="bar"><i></i></div></span><b class="st"></b></span></div>`;
  panel.querySelector(':scope > .tip')?.before(el);
  const $ = finder(el), due = throttle();
  $('.dose .band').style.cssText = `left:0;width:${pct(DOSE_SAFE / DOSE_MAX)}`;
  const shown = {} as Record<SlotKey, { key: string; p: number[] }>;
  let fl: Flow | undefined, acc = 0;
  const vital = (cls: string, text: string, state: string, fill?: number) => {
    const m = $(`.${cls}`);
    m.querySelector('b')!.textContent = text;
    m.className = `m ${cls} ${state}`;
    if (fill !== undefined) m.querySelector<HTMLElement>('.bar > i')!.style.width = pct(fill);
  };
  const said: Record<string, string> = {};
  /** The energy bar's sources on `scale`, each labelled as far as it fits; returns their sum. */
  const fill = (p: Power, scale: number) => {
    let sum = 0;
    for (const [k, name] of MAKE) {
      const v = p[k], f = v / scale, i = $(`.track .s-${k}`), t = label(fit(f * TRACK, name, num(v)), name, num(v)), ic = f * TRACK >= 12;
      i.style.width = pct(f);
      if (said[k] !== `${ic}${t}`) [said[k], i.querySelector('em')!.textContent] = [`${ic}${t}`, t], i.classList.toggle('bare', !ic);
      sum += v;
    }
    return sum;
  };
  return {
    update(dt: number, s: CivState) {
      acc += dt;
      if (!due(dt)) return;
      const wall = acc;
      acc = 0;
      // Vitals
      const down = !s.active || s.trend < 0;
      vital('pop', `${s.pop.toFixed(s.pop >= 10 ? 0 : 1)}B${down ? '▼' : s.trend > 0 ? '▲' : ''}`, down ? 'bad' : s.trend > 0 ? 'ok' : '', s.pop / Math.max(1e-6, s.cap));
      vital('dose', `Rad ${s.dose.toFixed(1)}`, s.harm > 0 ? 'bad' : 'ok');
      $('.dose .needle').style.left = pct(s.dose / DOSE_MAX);
      const charge = Math.max(0, s.shield) / Math.max(1e-6, s.shieldMax);
      vital('shield', s.shield > 0 ? `Lv${s.level} ${Math.round(charge * 100)}%` : 'down', s.shield > 0 ? '' : 'bad', charge);
      $('.shield').style.color = s.shield > 0 ? hex(energyTint(YOU, charge)) : ''; // down: the .bad red
      // Energy: the sources labelled, a white tick at what the people use (red past supply), the uses as a strip under it.
      const scale = Math.max(s.energy, s.need, 1e-6), made = fill(s.power, scale);
      let used = 0;
      for (const k of USE) ($(`.strip .s-${k}`).style.width = pct(s.power[k] / scale)), (used += s.power[k]);
      $('.s-spare').style.width = pct(Math.max(0, s.energy - made) / scale);
      $('.pw u').style.cssText = `left:${pct(s.energy / scale)};width:${pct((Math.min(used, scale) - s.energy) / scale)}`;
      $('.need').style.left = pct(Math.min(used, scale) / scale);
      $('.mk').textContent = `+${num(s.energy)}`;
      $('.us').textContent = `−${num(used)}`;
      $('.us').className = `us ${used > s.energy ? 'bad' : ''}`;
      // Fuel: stock, the burn and inflow averaged over FLOW_S (per minute), how long the spare lasts at that burn.
      if (wall > 0) fl = flow(fl, s.fuel, s.burn, wall);
      const left = fl ? fuelLeft(s.spare, fl.use) : Infinity;
      const rate = (sign: string, x = 0) => (x * 60 >= 0.05 ? ` ${sign}${(x * 60).toFixed(1)}` : ''), rates = rate('−', fl?.use) + rate('+', fl?.gain); // only what moves
      $('.tank > b').className = s.burn > 0 && s.spare <= 0 ? 'bad' : s.fuel < FUEL_RESERVE ? 'warn' : ''; // reactors dimming: red; under the reserve: amber
      $('.tank > b').textContent = `${Math.floor(s.fuel)}${Number.isFinite(left) ? ` · ${span(left)}` : ''}${rates && ` ·${rates}/min`}`; // time left before the rates: it matters most
      // Fleet: one pip per ship (its own reload), faint hollow ones up to the cap; markup only when the count changes.
      for (const k of SLOTS) {
        const q = s.slots[k], g = $(`.g.${k}`), was = shown[k];
        g.hidden = !q.cap && !q.pips.length;
        g.className = `g ${k} ${s.active ? q.look : 'none'}`; // the silo short of ore is 'none' (slots.ts)
        const buys = k === 'rocket' ? `×${q.n > 99 ? '99+' : q.n}` : '', key = `${q.pips.length}/${q.cap}${buys}`;
        if (was?.key !== key) {
          const hollow = k === 'missile' ? 0 : Math.max(0, q.cap - q.pips.length);
          g.querySelector('.p')!.innerHTML = '<i></i>'.repeat(q.pips.length) + '<i class="e"></i>'.repeat(hollow) + (buys && `<em>${buys}</em>`);
          shown[k] = { key, p: [] };
        }
        const pips = g.querySelectorAll<HTMLElement>('.p > i:not(.e)'), last = shown[k].p;
        q.pips.forEach((v, i) => {
          if (last[i] === undefined || Math.abs(v - last[i]) >= 0.125 || (v >= 1 && last[i] < 1) || (v <= 0 && last[i] > 0)) {
            last[i] = v;
            pips[i].style.setProperty('--p', v.toFixed(3));
          }
        });
      }
      // Yard at the fleet row's end: what it builds, its progress, cost / stock (amber while it waits for ore).
      const y = s.yard, ore = Math.floor(s.ore), vol = Math.floor(s.vol);
      $('.job').hidden = !y;
      if (y) {
        $('.job em').textContent = y.kind[0].toUpperCase() + y.kind.slice(1);
        $('.job i').style.width = pct(y.prog);
      }
      $('.st').textContent = y ? `${Math.ceil(y.ore)}/${ore} ore${y.vol > 0 ? ` · ${Math.ceil(y.vol)}/${vol} vol` : ''}` : `Ore ${ore} · Vol ${vol}`;
      $('.st').className = `st ${y?.wait ? 'warn' : ''}`;
    },
    destroy() {
      el.remove();
    },
  };
}
