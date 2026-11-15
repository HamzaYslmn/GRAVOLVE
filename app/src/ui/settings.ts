// Settings: a gear button that opens a small panel (frame-rate cap, FPS/stats display, sound, volume).
// Choices persist in localStorage (YouTube: cloud save); if storage is blocked the defaults apply.
import './settings.css';

// Browsers always present at the display rate, so "unlimited" is a benchmark mode:
// it renders as fast as possible, but extra frames are never shown.
const CAPS = ['vsync', 30, 60, 120, 240, 'unlimited'] as const;
type FpsCap =(typeof CAPS)[number];
const label = (c: FpsCap) => (c === 'vsync' ? 'VSync' : c === 'unlimited' ? 'Unlimited (benchmark)' : `${c} FPS`);
const parseCap = (v: string | null): FpsCap => CAPS.find((c) => String(c) === v) ?? 'vsync';

// YouTube Playables SDK (index.html): null outside YouTube. There, cloud save is the only storage.
type YT = {
  IN_PLAYABLES_ENV: boolean;
  game: { firstFrameReady(): void; gameReady(): void; loadData(): Promise<string>; saveData(data: string): Promise<void> };
  engagement: { sendScore(score: { value: number }): Promise<void> };
  system: { isAudioEnabled(): boolean; onAudioEnabledChange(cb: (on: boolean) => void): void; onPause(cb: () => void): void; onResume(cb: () => void): void };
};
declare const ytgame: YT | undefined;
export const yt = typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV ? ytgame : null;
let cloud: Record<string, string> = {}, canSave = false, dirty = false;

/** Fills the cloud record (await before anything reads storage). A failed load never saves, so it can't overwrite. */
export async function loadCloud() {
  if (!yt) return;
  let text: string;
  try {
    text = await yt.game.loadData();
  } catch {
    return;
  }
  try {
    const o = JSON.parse(text);
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (typeof v === 'string') cloud[k] = v;
  } catch {} // empty or old data: start fresh
  canSave = true;
}

/** Writes a pending cloud save now (YouTube's pause, which exit also sends). */
export function flush() {
  if (!yt || !dirty) return;
  dirty = false;
  yt.game.saveData(JSON.stringify(cloud)).catch(() => {});
}

/** localStorage under `gravolve.<key>` (YouTube: the cloud record); blocked storage reads null and saves nothing. */
export const load = (key: string) => {
  if (yt) return cloud[key] ?? null;
  try {
    return localStorage.getItem(`gravolve.${key}`);
  } catch {
    return null;
  }
};
export const save = (key: string, value: string) => {
  if (yt) {
    if (cloud[key] === value) return;
    cloud[key] = value;
    if (!canSave || dirty) return;
    dirty = true; // one write per burst (a volume drag)
    return void setTimeout(flush, 500);
  }
  try {
    localStorage.setItem(`gravolve.${key}`, value);
  } catch {}
};

const GEAR = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/>
<path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>`;

type Handlers = {
  onCap: (cap: FpsCap) => void; onStats: (show: boolean) => void; onSound: (on: boolean) => void; onVolume: (v: number) => void;
  onDebug: (on: boolean) => void; // debug mode: the biome map (ui/minimap.ts) and the transform window (ui/debug.ts), off by default
  achievements: { label: () => string; open: () => void }; // the gallery button (ui/achievements.ts)
};

const VOLUME = 20; // % by default

export function createSettings(handlers: Handlers) {
  const root = document.createElement('div');
  root.id = 'settings';
  root.innerHTML = `
    <button id="settings-toggle" class="ui-panel" type="button" aria-label="Settings" aria-expanded="false" aria-controls="settings-panel">${GEAR}</button>
    <div id="settings-panel" class="ui-panel" role="dialog" aria-label="Settings" hidden>
      <label>Frame rate
        <select id="fps-cap">${CAPS.map((c) => `<option value="${c}">${label(c)}</option>`).join('')}</select>
      </label>
      <label class="check"><input id="show-stats" type="checkbox"> Show FPS</label>
      <label class="check"><input id="sound" type="checkbox"> Sound</label>
      <label class="check"><input id="debug-mode" type="checkbox"> Debug mode</label>
      <label>Volume <output id="volume-out"></output><input id="volume" type="range" min="0" max="100" step="5"></label>
      <button type="button" class="ach-open"></button>
      <details class="howto"><summary>How to play</summary><ul>
        <li>Move with WASD / arrows, or drag on touch. Space has no drag: push against your motion to brake.</li>
        <li>Touch smaller rocks slowly to eat them. A green glow is safe, red can swallow or shatter you.</li>
        <li>Grow into a planet, start life, then take over a star.</li>
        <li><b>Fun fact:</b> metal rocks are about twice as sturdy as stone, and ice or gas crumble first.</li>
      </ul></details>
    </div>`;
  document.body.appendChild(root);

  const toggle = root.querySelector<HTMLButtonElement>('#settings-toggle')!;
  const panel = root.querySelector<HTMLDivElement>('#settings-panel')!;
  const cap = root.querySelector<HTMLSelectElement>('#fps-cap')!;

  const gallery = root.querySelector<HTMLButtonElement>('.ach-open')!;
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) gallery.textContent = handlers.achievements.label(); // the count as of now
  };
  gallery.addEventListener('click', () => handlers.achievements.open());
  toggle.addEventListener('click', () => setOpen(panel.hidden !== false));
  document.addEventListener('pointerdown', (e) => !root.contains(e.target as Node) && setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  cap.value = String(parseCap(load('fpsCap')));
  cap.addEventListener('change', () => {
    save('fpsCap', cap.value);
    handlers.onCap(parseCap(cap.value));
  });
  // On/off switches, on by default unless `def` is false.
  const onOff = (id: string, key: string, on: (v: boolean) => void, def = true) => {
    const box = root.querySelector<HTMLInputElement>(`#${id}`)!;
    box.checked = def ? load(key) !== '0' : load(key) === '1';
    box.addEventListener('change', () => {
      save(key, box.checked ? '1' : '0');
      on(box.checked);
    });
    on(box.checked);
  };

  handlers.onCap(parseCap(cap.value));
  onOff('show-stats', 'showStats', handlers.onStats);
  if (yt) root.querySelector('#sound')!.closest('label')!.remove(); // YouTube's mute is the one mute
  else onOff('sound', 'sound', handlers.onSound);
  onOff('debug-mode', 'debug', handlers.onDebug, false);
  const vol = root.querySelector<HTMLInputElement>('#volume')!, volOut = root.querySelector<HTMLOutputElement>('#volume-out')!;
  const stored = Number(load('volume') ?? VOLUME);
  vol.value = String(Number.isFinite(stored) ? stored : VOLUME);
  const setVolume = () => {
    volOut.value = `${vol.value}%`;
    handlers.onVolume(Number(vol.value) / 100);
  };
  vol.addEventListener('input', () => {
    save('volume', vol.value);
    setVolume();
  });
  setVolume();
}

/** Display refresh interval, measured once from rAF (clamped so a hidden tab can't skew it). */
export function measureRefreshMs(): Promise<number> {
  return new Promise((resolve) => {
    const ts: number[] = [];
    const tick = (t: number) => {
      ts.push(t);
      if (ts.length < 21) return requestAnimationFrame(tick);
      const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
      resolve(Math.min(34, Math.max(4, d[10])));
    };
    requestAnimationFrame(tick);
  });
}
