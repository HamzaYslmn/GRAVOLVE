import './hud.css';
import { DONE } from './rules';
import type { StarState } from './stage';
import { cell } from '../asteroid/hud';
import { bar as pct, finder, hex, throttle } from '../../ui/panel';

// The star in your card (asteroid/hud.ts): near a star, or once one is yours, the card gets `data-star`, the goal bar
// becomes the link and then the Dyson sphere (with its energy), and a section shows the star (name, mass, temperature
// in its colour), two cells (Orbit: your distance on 0..8 R★, the band where your seas stay liquid; Planets: carried / cap,
// colonies) and why something waits. Without a body target the target card shows the star: "Link 40%". ~12 updates/s.

const X_MAX = 8; // R★ across the orbit scale (stage.ts NEAR_X)
const xs = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '∞');

export function createStarHud() {
  const host = document.getElementById('game-hud');
  const card = host?.querySelector<HTMLElement>('.me');
  const target = host?.querySelector<HTMLElement>('.target');
  const el = document.createElement('div');
  el.className = 'sec star';
  el.innerHTML = `<div class="head"><b class="name"></b><span class="mass"></span></div>
    <div class="cells">${cell('orbit', 'orbit', 'Orbit', 'scale')}${cell('planets', 'planet', 'Planets')}</div><div class="sub warn why"></div>`;
  card?.querySelector('.goal')?.after(el);
  const link = document.createElement('div');
  link.className = 'star-link';
  target?.append(link);
  const $ = finder(el), due = throttle();

  return {
    update(dt: number, s: StarState | undefined, show: boolean) {
      if (!due(dt)) return;
      card?.toggleAttribute('data-star', show && !!s);
      const tgt = !!s && s.targeted && !s.owned;
      target?.toggleAttribute('data-star', tgt);
      if (!s || !show || !card) return;
      el.style.setProperty('--star', hex(s.color));
      // The goal: link, then Dyson 50% (Age III complete), then the closed sphere (Type II).
      const half = s.cover >= DONE, whole = s.cover >= 1 - 1e-9;
      card.querySelector<HTMLElement>('.goal i')!.style.width = pct(s.owned ? s.cover : s.link);
      card.querySelector('.goal')!.classList.remove('stalled', 'lost');
      card.querySelector('.goal .to')!.textContent = !s.owned ? 'Link the star' : whole ? 'Type II civilization' : `Dyson → ${half ? 100 : DONE * 100}%`; // building / waiting: the why line
      card.querySelector('.goal .left')!.textContent = s.owned ? `${Math.round(s.cover * 100)}% · ${s.energy.toFixed(s.energy < 10 ? 1 : 0)} E/s` : `${Math.round(s.link * 100)}%`;
      $('.name').textContent = s.name;
      $('.mass').textContent = `${s.mass.toFixed(s.mass < 10 ? 2 : 0)} M☉ · ${Math.round(s.kelvin / 100) * 100} K`;
      // Orbit: the needle is you, the band is where your seas stay liquid (green inside, amber outside, red: nowhere).
      const b = s.band, lo = b ? Math.min(b[0], X_MAX) : 0;
      $('.orbit .band').style.cssText = b ? `left:${pct(lo / X_MAX)};width:${pct((Math.min(b[1], X_MAX) - lo) / X_MAX)}` : 'width:0';
      $('.orbit .needle').style.left = pct(s.x / X_MAX);
      $('.orbit .cap').textContent = s.owned ? 'Orbit' : 'Distance';
      const v = $('.orbit .v');
      v.textContent = `${xs(s.x)} R★`;
      v.className = `v ${!b ? 'bad' : s.x >= b[0] && s.x <= b[1] ? 'ok' : 'warn'}`;
      $('.planets').hidden = !s.owned;
      $('.planets i').style.width = pct(s.planets / Math.max(1, s.cap));
      $('.planets .v').textContent = `${s.planets}/${s.cap}${s.colonies ? ` · ${s.colonies} col` : ''}`;
      $('.why').textContent = [s.wait, s.fleetWait, s.beamOff].filter(Boolean).join(' · ');
      if (tgt && target) {
        // The target card (asteroid/hud.ts leaves it alone while it has no body target and data-star is set).
        target.querySelector('.name')!.textContent = s.name;
        target.querySelector('.ratio')!.textContent = `${s.mass.toFixed(2)} M☉`;
        target.querySelector('.sub')!.textContent = `Star · ${Math.round(s.kelvin / 100) * 100} K`;
        target.style.setProperty('--verdict', hex(s.color));
        target.classList.remove('rival');
        link.textContent = `Link ${Math.round(s.link * 100)}%`;
      }
    },
    destroy() {
      card?.removeAttribute('data-star');
      target?.removeAttribute('data-star');
      el.remove();
      link.remove();
    },
  };
}
