import './hud.css';
import { BAND, DONE, LINK_S } from './rules';
import type { StarState } from './stage';
import { addTips, cell, head } from '../../ui/rows';
import { bar as pct, finder, hex, throttle } from '../../ui/panel';

// The star in your card (asteroid/hud.ts): near a star, or once one is yours, the card gets `data-star`, the goal bar becomes
// the link and then the Dyson sphere (with its energy), and the Star section shows it: the header's summary (name, your distance
// in its colour), the body two cells (Orbit: your distance on 0..8 R★, the band where your seas stay liquid; Planets: carried /
// cap, colonies) and one short line of what waits (all of it in the tooltip). Without a body target the target card shows the star: "Link 40%". ~12 updates/s.

const X_MAX = 8; // R★ across the orbit scale (stage.ts NEAR_X)
const xs = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '∞');
const kelvin = (s: StarState) => `${Math.round(s.kelvin / 100) * 100} K`;
const linkTip = (s: StarState) => `Link ${Math.round(s.link * 100)}%: stay ${BAND[0]}–${BAND[1]} star radii from it and the link fills in ${LINK_S} s; outside it fades twice as fast. Linked, the star is yours: Age III.`;

export function createStarHud() {
  const host = document.getElementById('game-hud');
  const card = host?.querySelector<HTMLElement>('.me');
  const target = host?.querySelector<HTMLElement>('.target');
  const el = document.createElement('div');
  el.className = 'sec star';
  el.dataset.s = 'star';
  el.innerHTML = `${head('star', 'sun', 'Star')}<div class="body"><div class="cells">${cell('orbit', 'orbit', 'Orbit', 'scale')}${cell('planets', 'planet', 'Planets')}</div><div class="why" data-tip="why"></div></div>`;
  card?.querySelector(':scope > .tip')?.before(el);
  const link = document.createElement('div');
  link.className = 'star-link';
  link.dataset.tip = 't-link';
  target?.append(link);
  const $ = finder(el), due = throttle();
  let last: StarState | undefined;
  const untip = addTips((key) => {
    const s = last;
    if (!s) return null;
    const own = !!card?.hasAttribute('data-star');
    switch (key) {
      case 'star': return own ? `${s.name}: ${s.mass.toFixed(2)} solar masses, ${kelvin(s)}.\n${s.owned ? 'Yours: its light feeds your Dyson sphere and solar farms.' : 'Link it to make it yours.'}` : null;
      case 'orbit': return own ? `${s.owned ? 'Orbit' : 'Distance'} ${xs(s.x)} star radii. The band: where your seas stay liquid in its light${s.band ? '' : ' (nowhere, this star is too hot or too cold)'}.${s.owned ? '' : `\nThe link needs ${BAND[0]}–${BAND[1]} radii.`}` : null;
      case 'planets': return own ? `Planets your star carries: ${s.planets} of ${s.cap}${s.colonies ? `, ${s.colonies} of them colonies` : ''}.` : null;
      case 'goal':
        if (!own) return null;
        if (!s.owned) return linkTip(s);
        return `Dyson sphere ${Math.round(s.cover * 100)}%: ${s.energy.toFixed(1)} E/s from your star. Age III is complete at ${DONE * 100}%; closed, you are a Type II civilization.`;
      case 'why': return own ? ['What waits:', s.wait, s.fleetWait].filter(Boolean).join('\n') : null;
      case 't-link': return linkTip(s);
      case 't-ratio': return target?.hasAttribute('data-star') ? `${s.name}: ${s.mass.toFixed(2)} solar masses, ${kelvin(s)}.` : null;
    }
    return null;
  });

  return {
    update(dt: number, s: StarState | undefined, show: boolean) {
      last = s;
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
      $('.hd .v').textContent = `${s.name} · ${xs(s.x)} R★`;
      // Orbit: the needle is you, the band is where your seas stay liquid (green inside, amber outside, red: nowhere).
      const b = s.band, lo = b ? Math.min(b[0], X_MAX) : 0;
      $('.orbit .band').style.cssText = b ? `left:${pct(lo / X_MAX)};width:${pct((Math.min(b[1], X_MAX) - lo) / X_MAX)}` : 'width:0';
      $('.orbit .needle').style.left = pct(s.x / X_MAX);
      $('.orbit .lb').textContent = s.owned ? 'Orbit' : 'Distance';
      const v = $('.orbit .v');
      v.textContent = `${xs(s.x)} R★`;
      v.className = `v ${!b ? 'bad' : s.x >= b[0] && s.x <= b[1] ? 'ok' : 'warn'}`;
      $('.planets').hidden = !s.owned;
      $('.planets i').style.width = pct(s.planets / Math.max(1, s.cap));
      $('.planets .v').textContent = `${s.planets}/${s.cap}${s.colonies ? ` · ${s.colonies} col` : ''}`;
      const why = [s.wait, s.fleetWait].filter(Boolean);
      $('.why').textContent = why.length ? `${why[0]}${why.length > 1 ? ` · +${why.length - 1}` : ''}` : '';
      if (tgt && target) {
        // The target card (asteroid/hud.ts leaves it alone while it has no body target and data-star is set).
        target.querySelector('.name')!.textContent = s.name;
        target.querySelector('.ratio')!.textContent = `${s.mass.toFixed(2)} M☉`;
        target.querySelector('.sub')!.textContent = `Star · ${kelvin(s)}`;
        target.style.setProperty('--verdict', hex(s.color));
        target.classList.remove('rival');
        link.textContent = `Link ${Math.round(s.link * 100)}%`;
      }
    },
    destroy() {
      card?.removeAttribute('data-star');
      target?.removeAttribute('data-star');
      untip();
      el.remove();
      link.remove();
    },
  };
}
