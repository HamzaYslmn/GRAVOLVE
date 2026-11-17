import './tip.css';
import { PERIOD } from './panel.ts';
import { pick, type TipRect } from './pick.ts';

// One shared HUD tooltip. The cards stay pointer-events:none, so the mouse is hit-tested by hand: a passive window
// pointermove only stores the point; update() tests the cards' rects, and only inside one its [data-tip] elements
// (innermost wins, ui/pick.ts). Text comes from text(key, el) while shown, refreshed every PERIOD. A line "a\tb" is a
// two-column row (label, value). Over a [data-sec] section header the canvas shows a pointer (a click there is the HUD's).
const GAP = 8; // px between the card and the tip, and the tip's margin to the viewport edge
let onCard = false;
/** True while the mouse is over a HUD card (the reticle steps aside: ui/reticle.ts). */
export const overCard = () => onCard;

type Opts = {
  card: () => HTMLElement[];
  text: (key: string, el: HTMLElement) => string | null;
  surface: HTMLElement;
  host: HTMLElement;
};

export function createTip({ card, text, surface, host }: Opts) {
  const el = document.createElement('div');
  el.className = 'ui-panel tooltip';
  el.hidden = true;
  host.appendChild(el);

  let x = 0, y = 0, moved = false, on = false; // last mouse point (client px); on: it is over the canvas
  let over: HTMLElement | null = null, box: DOMRect | null = null; // the hovered [data-tip] and its card's rect
  let shown: string | null = null, wait = 0, sec = false, prev = '', leaf = false; // leaf: over holds no [data-tip]

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    [x, y, on, moved] = [e.clientX, e.clientY, e.target === surface, true]; // anything else on top (settings, game over) hides it
  }, { passive: true });
  const leave = () => ((on = moved = false), hide());
  document.documentElement.addEventListener('pointerleave', leave);
  window.addEventListener('blur', leave);

  const pointer = (want: boolean) => {
    // Inline !important: canvas.no-cursor (ui/reticle.css) hides the cursor with !important; Pixi writes the inline cursor too.
    if (want && surface.style.getPropertyPriority('cursor') !== 'important') {
      if (!sec) prev = surface.style.cursor;
      surface.style.setProperty('cursor', 'pointer', 'important');
    } else if (!want && sec) surface.style.cursor = prev;
    sec = want;
  };
  const inside = (r: DOMRect) => r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const NONE: TipRect = { x: -1, y: -1, w: -1, h: -1, depth: 0 };
  // Rects in document order. Inside a missed element nothing is measured (its children lie within it), so only the
  // path under the mouse and its siblings cost a getBoundingClientRect; only hits get a depth.
  const rects = (els: NodeListOf<HTMLElement>, root: HTMLElement) => {
    const out: TipRect[] = [];
    let miss: HTMLElement | null = null;
    for (const e of els) {
      if (miss?.contains(e)) { out.push(NONE); continue; }
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) { out.push(NONE); continue; } // no box (hidden, or display: contents): its children may still have one
      if (!inside(r)) { out.push(NONE), (miss = e); continue; }
      let depth = 0;
      for (let p = e.parentElement; p && p !== root; p = p.parentElement) depth++;
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height, depth });
    }
    return out;
  };

  /** The hit-test: which card, which [data-tip], whether over a header. */
  function test() {
    let root: HTMLElement | null = null;
    if (on) for (const c of card()) if (c.isConnected && inside((box = c.getBoundingClientRect()))) { root = c; break; }
    if (!root) return hide();
    onCard = true;
    const tips = root.querySelectorAll<HTMLElement>('[data-tip]');
    const i = pick(rects(tips, root), x, y);
    pointer(pick(rects(root.querySelectorAll<HTMLElement>('[data-sec]'), root), x, y) >= 0);
    const next = i < 0 ? null : tips[i];
    if (next !== over) [over, wait, leaf] = [next, 0, !!next && !next.querySelector('[data-tip]')];
    if (!over) el.hidden = true;
  }

  function render(s: string | null) {
    if (s === null) return void (el.hidden = true);
    if (s !== shown) {
      shown = s;
      el.replaceChildren(...s.split('\n').map((line) => {
        const row = document.createElement('div');
        const [a, b] = line.split('\t');
        if (b === undefined) row.textContent = a;
        else {
          row.className = 'tooltip-row';
          row.append(Object.assign(document.createElement('span'), { textContent: a }), Object.assign(document.createElement('span'), { textContent: b }));
        }
        return row;
      }));
    }
    el.hidden = false;
    // Right of the card, level with the hovered element; flipped left if it doesn't fit, clamped to the viewport.
    const w = el.offsetWidth, h = el.offsetHeight, top = over!.getBoundingClientRect().top;
    let left = box!.right + GAP;
    if (left + w > innerWidth - GAP) left = Math.max(GAP, box!.left - GAP - w);
    el.style.left = `${left}px`;
    el.style.top = `${Math.max(GAP, Math.min(top, innerHeight - GAP - h))}px`;
  }

  function hide() {
    [over, box, leaf, onCard] = [null, null, false, false];
    el.hidden = true;
    pointer(false);
  }

  return {
    /** Call once a frame: no work unless the mouse moved or a tip is showing. */
    update(dt: number) {
      if (!moved && !over) return;
      if (over && !over.isConnected) moved = true; // the HUD replaced it: test again
      wait -= dt;
      if (moved && on && leaf && over && wait > 0 && inside(over.getBoundingClientRect())) moved = false; // still on the same leaf until the refresh
      if (moved || wait <= 0) {
        moved = false;
        test(); // a new element under the mouse resets wait: its text now
      }
      if (over && wait <= 0) {
        wait = PERIOD;
        render(text(over.dataset.tip!, over));
      }
    },
    hide,
  };
}
