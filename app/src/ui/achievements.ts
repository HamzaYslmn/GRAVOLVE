// Achievements on screen: a toast after the fact on first unlock (through the shared queue, only in a
// quiet moment so they never push stage news out), a row on the game-over card (count, one pip per achievement, this run's
// new ones lit and named) and the full gallery (settings panel and the card). No progress pop-ups, no sounds of their own.
import './achievements.css';
import { GROUPS, type Achievement, type Achievements } from '../core/achievements';
import { toast, toastBusy } from './toast';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function createAchievementUi(ach: Achievements) {
  const waiting: Achievement[] = [];
  let gallery: HTMLElement | undefined;

  function closeGallery() {
    gallery?.remove();
    gallery = undefined;
    removeEventListener('keydown', onKey, true);
  }
  // While the gallery is open it owns the keyboard (Space/Enter must not restart the run under it); Escape closes it.
  function onKey(e: KeyboardEvent) {
    e.stopImmediatePropagation();
    if (e.key === 'Escape') closeGallery(); // never preventDefault on Esc (YouTube Playables rule)
  }

  return {
    /** Newly unlocked: shown one by one when no other banner is up or waiting. */
    announce(list: Achievement[]) {
      waiting.push(...list);
    },
    /** Called a few times a second. `quiet`: the run is over (the card names them instead). */
    pump(quiet: boolean) {
      if (quiet) return void (waiting.length = 0);
      if (waiting.length && !toastBusy()) {
        const a = waiting.shift()!;
        toast(`Achievement · ${a.name}`, a.hint);
      }
    },
    /** The game-over card's row: count, pips (got before dim-lit, new bright), the new ones by name, a button to the gallery. */
    row() {
      const tiles = ach.tiles(), { got, all } = ach.count(), fresh = tiles.filter((t) => t.fresh);
      return `<div class="ach-row">
        <div class="ach-head"><span>Achievements</span><b>${got} / ${all}</b><button type="button" class="ach-open">All</button></div>
        <div class="ach-pips">${tiles.map((t) => `<i class="${t.fresh ? 'new' : t.got ? 'got' : ''}" title="${esc(t.name)}: ${esc(t.hint)}"></i>`).join('')}</div>
        ${fresh.length ? `<p class="ach-new">New: ${fresh.map((t) => esc(t.name)).join(' · ')}</p>` : ''}
      </div>`;
    },
    label: () => {
      const { got, all } = ach.count();
      return `Achievements ${got} / ${all}`;
    },
    openGallery() {
      closeGallery();
      const tiles = ach.tiles(), { got, all } = ach.count();
      const el = document.createElement('div');
      el.id = 'ach-gallery';
      el.className = 'ui-panel';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Achievements');
      el.innerHTML = `<div class="ach-top"><h2>Achievements</h2><b>${got} / ${all}</b><button type="button" class="ach-close" aria-label="Close">✕</button></div>
        <div class="ach-scroll">${GROUPS.map((g) => `<h3>${g}</h3><div class="ach-grid">${tiles.filter((t) => t.group === g)
          .map((t) => `<div class="ach-tile${t.got ? ' got' : ''}${t.fresh ? ' new' : ''}"><b>${esc(t.name)}</b><span>${esc(t.hint)}</span></div>`).join('')}</div>`).join('')}</div>`;
      el.addEventListener('pointerdown', (e) => e.stopPropagation()); // the settings panel stays open behind it
      el.querySelector('.ach-close')!.addEventListener('click', closeGallery);
      document.body.appendChild(el);
      el.querySelector<HTMLButtonElement>('.ach-close')!.focus();
      addEventListener('keydown', onKey, true);
      gallery = el;
    },
    closeGallery,
  };
}
