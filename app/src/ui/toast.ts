import './toast.css';
import { sfx } from '../audio/sfx';

// The one toast queue: a short banner under the top edge for news (tier reached,
// Age I done, comet, climate milestones, life). Every stage's HUD calls `toast()`; banners never overwrite
// each other: up to 3 wait their turn (the oldest routine one drops first; a `keep` milestone never drops), each shows
// TOAST_S. Wall-clock timers, so it keeps time in slow motion and hit-stop. News latched once per run: createNews.

const TOAST_S = 3.2; // matches the CSS animation
const PENDING = 3;

const queue: [string, string, boolean, string | null][] = [];
let el: HTMLElement | undefined, timer = 0;

function show() {
  const host = document.getElementById('game-hud');
  if (!host) return void (queue.length = 0);
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.className = 'toast';
    host.appendChild(el);
  }
  const [title, sub, keep, key] = queue.shift()!;
  sfx()?.announce(title, sub, key, keep);
  el.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
  el.classList.remove('show');
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
  timer = window.setTimeout(() => {
    timer = 0;
    el?.classList.remove('show');
    if (queue.length) show();
  }, TOAST_S * 1000);
}

/** Queues a banner: shown now if none is up, else after the ones waiting. `keep`: a milestone, never dropped. */
export function toast(title: string, sub = '', keep = false, key: string | null = null) {
  queue.push([title, sub, keep, key]);
  const drop = queue.length > PENDING ? queue.findIndex((q) => !q[2]) : -1;
  if (drop >= 0) queue.splice(drop, 1);
  if (!timer) show();
}

/** True while a banner is up or waiting (first-run hints wait for a quiet moment). */
export const toastBusy = () => timer !== 0 || queue.length > 0;

/** A stage's news line: `key` toasts once per run (null: every time). */
export type News = (key: string | null, title: string, sub: string) => boolean;
/** Run news: each key latched once; `milestones` toast as keep. */
export function createNews(milestones: ReadonlySet<string> = new Set()) {
  const seen = new Set<string>();
  const say: News = (key, title, sub) => {
    if (key !== null && (seen.has(key) || !seen.add(key))) return false;
    toast(title, sub, key !== null && milestones.has(key), key);
    return true;
  };
  return { seen, say };
}
export type RunNews = ReturnType<typeof createNews>;
