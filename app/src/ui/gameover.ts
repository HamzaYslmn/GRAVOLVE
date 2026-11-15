// End-of-run cards. Game over: why the run ended (what hit you, how fast), the rule that killed you in
// one line, how far you got toward Age I, a few numbers, and a restart (button, Enter, Space or R).
// Bests persist in localStorage, YouTube cloud save on YouTube (a per-player convenience; blocked storage just means no bests).
import './gameover.css';
import { load, save, yt } from './settings';
import { massScore, type Part } from '../core/score';
import { START_M } from '../evolution/asteroid/rules';

export type RunStats = {
  cause: keyof typeof LESSON;
  detail: string; // what happened, e.g. "Swallowed by a Metallic rock · 1.3× your mass at 2.0 diam/s"
  seconds: number;
  peak: number;
  meals: number;
  score: { total: number; parts: Part[] }; // core/score.ts

  progress: number; // 0..1 toward the Age I goal, in log mass
  achievements: string; // the achievements row (ui/achievements.ts), with an `.ach-open` button
  onGallery: () => void; // that button
  debug?: boolean; // a run changed in debug mode (ui/debug.ts): no records
};

// The rule behind each death, said once, on the card (never in the target panel).
const LESSON = {
  eaten: 'A red aura means it outweighs you: touch it slowly and it swallows you.',
  destroyed: 'Too fast: below 8 diam/s you merge, up to 24 you keep part, faster both sides break.',
  crumbled: 'Every hard bounce chips you. Eat to rebuild before the next hit.',
  star: 'Inside about 1.3–1.6 star radii (the Roche limit) tides tear a world apart; link from 2–4 radii.',
};

// Best score, peak mass, and the fastest run time to complete each age (age1..age3, s), under gravolve.best.
type Best = { score: number; peak: number; age1?: number; age2?: number; age3?: number };
const loadBest = (): Best => {
  let b: Partial<Best> = {};
  try {
    b = JSON.parse(load('best') ?? '{}') ?? {};
  } catch {}
  const peak = b.peak ?? 0;
  return { ...b, peak, score: b.score ?? massScore(Math.max(peak, START_M), START_M) }; // old saves: the mass part
};
/** YouTube shows the best run score; it must match the saved best. */
export function sendBest() {
  const { score } = loadBest();
  if (yt && score > 0) yt.engagement.sendScore({ value: Math.round(score) }).catch(() => {});
}
/** Keeps a run's score if it is the best (the card, and YouTube's pause, which exit also sends). */
export function bankScore(total: number, debug?: boolean) {
  const best = loadBest();
  if (!debug && total > best.score) saveBest({ ...best, score: total });
}
const saveBest = (b: Best) => (save('best', JSON.stringify(b)), sendBest());
/** An age completed `t` s into the run: kept if it is the fastest (saved at once, so a run that never ends still counts). */
export function recordAge(age: 1 | 2 | 3, t: number) {
  const best = loadBest(), k = `age${age}` as const;
  if (best[k] === undefined || t < best[k]!) saveBest({ ...best, [k]: t });
}
const AGES = ['I', 'II', 'III'] as const;
const clock = (sec: number) =>`${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

type Button = { label: string; keys: string[]; act: () => void };

/** A centred card; the first button has focus. Removes itself when a button (or its key) is used. */
function card(id: string, label: string, html: string, buttons: Button[]) {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'ui-panel end-card';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', label);
  el.innerHTML = `${html}<div class="buttons">${buttons.map((b) => `<button type="button">${b.label}</button>`).join('')}</div>
    <small>${buttons.map((b) => b.keys.join(' / ').replace(/Key|Digit/g, '')).join(' · ')}</small>`;
  document.body.appendChild(el);
  const els = [...el.querySelectorAll<HTMLButtonElement>('.buttons > button')];
  els[0].focus();
  const close = (b: Button) => {
    removeEventListener('keydown', onKey);
    el.remove();
    b.act();
  };
  const onKey = (e: KeyboardEvent) => {
    const b = buttons.find((x) => x.keys.includes(e.code));
    if (!b) return;
    e.preventDefault();
    close(b);
  };
  els.forEach((x, i) => x.addEventListener('click', () => close(buttons[i])));
  addEventListener('keydown', onKey);
}

/** `next`: past Age I you go on from the start of your stage; the card's first button does that. */
export function showGameOver(stats: RunStats, restart: () => void, next?: () => void) {
  const best = loadBest(), total = stats.score.total, record = !stats.debug && total > 0 && total >= best.score; // ≥: YouTube's pause may have banked this run already
  if (!stats.debug && (record || stats.peak > best.peak)) saveBest({ ...best, score: Math.max(best.score, total), peak: Math.max(best.peak, stats.peak) });
  const n = (v: number) => v.toLocaleString('en');
  card('gameover', 'Game over', `
    <h1>GAME OVER</h1>
    <p class="cause">${stats.detail}</p>
    <p class="lesson">${LESSON[stats.cause]}</p>
    <div class="progress"><span>Age I</span><div class="bar"><i style="width:${Math.round(stats.progress * 100)}%"></i></div><b>${Math.round(stats.progress * 100)}%</b></div>
    <dl>
      <dt>Score</dt><dd>${n(total)}${record ? ' <em>best</em>' : ''}</dd>
      <dt>Best score</dt><dd>${n(Math.max(best.score, total))}</dd>
      ${stats.score.parts.map((p) => `<dt class="part">${p.label}</dt><dd class="part">${n(p.points)}</dd>`).join('')}
      <dt>Peak mass</dt><dd>${stats.peak.toFixed(1)}</dd>
      <dt>Rocks eaten</dt><dd>${stats.meals}</dd>
      <dt>Time</dt><dd>${clock(stats.seconds)}</dd>
      ${AGES.map((n, i) => {
        const t = best[`age${i + 1}` as 'age1'];
        return t === undefined ? '' : `<dt>Fastest Age ${n}</dt><dd>${clock(t)}</dd>`;
      }).join('')}
    </dl>${stats.achievements}`, next
    ? [{ label: 'Continue as a planetoid', keys: ['Enter', 'Space', 'KeyC'], act: next }, { label: 'New run', keys: ['KeyR'], act: restart }]
    : [{ label: 'Play again', keys: ['Enter', 'Space', 'KeyR'], act: restart }]);
  document.querySelector<HTMLButtonElement>('#gameover .ach-open')?.addEventListener('click', stats.onGallery);
}
