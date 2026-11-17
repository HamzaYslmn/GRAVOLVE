// Markup builders shared by every stage's part of your card (evolution/<stage>/hud.ts; styles in ui/hud.css) and the
// tooltip text registry: one line grid for every readout, one section header, one icon set.

// 12×12 stroke icons, their ink centred on the box (16 px in section headers: class lg).
const ICON = {
  temp: '<path d="M5 6.8V1.6a1 1 0 0 1 2 0v5.2a2.4 2.4 0 1 1-2 0Z"/>',
  air: '<path d="M1.5 4.5h6.2a1.6 1.6 0 1 0-1.6-1.6M1.5 7.5h8a1.6 1.6 0 1 1-1.6 1.6"/>',
  water: '<path d="M6 1.2C4 4 2.8 5.8 2.8 7.6a3.2 3.2 0 0 0 6.4 0C9.2 5.8 8 4 6 1.2Z"/>',
  gas: '<path d="M1.5 3.8c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0M1.5 8.2c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0"/>',
  magnet: '<path d="M1.5 1.5h3v4.5a1.5 1.5 0 0 0 3 0V1.5h3V6a4.5 4.5 0 0 1-9 0Z"/><path class="fill" d="M1.5 1.5h3v2h-3ZM7.5 1.5h3v2h-3Z"/>', // horseshoe magnet, lit poles
  ore: '<path d="M2 4.25 4 1.75h4l2 2.5L6 10.25Z"/><path d="M2 4.25h8"/>',
  shield: '<path d="M6 1.3 10 3v3c0 2.4-1.7 4.1-4 4.9C3.7 10.1 2 8.4 2 6V3Z"/>',
  people: '<circle cx="6" cy="3.4" r="1.9"/><path d="M2.2 10.8a3.8 3.8 0 0 1 7.6 0"/>',
  bolt: '<path d="M6.8 1 2.6 6.8h3.2L5 11l4.4-6H6.2Z"/>',
  rad: '<circle cx="6" cy="6.4" r="1.2"/><path d="M4.9 4.5 3.2 1.7a5.3 5.3 0 0 1 5.6 0L7.1 4.5M8.1 6.4h3.3a5.3 5.3 0 0 1-2.7 4.7L7 8.3M4.9 8.3 3.3 11.1A5.3 5.3 0 0 1 .6 6.4h3.3"/>',
  ship: '<path d="M6 1.4 9.4 10.6 6 8.6 2.6 10.6Z"/>',
  speed: '<path d="M1.5 8.25a4.5 4.5 0 0 1 9 0"/><path d="M6 8.25 8.4 4.75"/>',
  orbit: '<circle cx="6" cy="6" r="4.6"/><circle class="fill" cx="10" cy="3.7" r="1.4"/>',
  planet: '<circle cx="6" cy="6" r="4"/>',
  world: '<circle cx="6" cy="6" r="4.6"/><path d="M1.6 4.6c2.6 1.2 6.2 1.2 8.8 0M1.6 7.4c2.6 1.2 6.2 1.2 8.8 0"/>',
  geo: '<path d="M1.2 10.6 4.6 4.4l1.6 2.2 1.1-1.5 3.5 5.5Z"/><path d="M5.4 3.4c-.7-.7.7-1.3 0-2M7.6 3.4c-.7-.7.7-1.3 0-2"/>',
  sun: '<circle cx="6" cy="6" r="2.2"/><path d="M6 .9v1.5M6 9.6v1.5M.9 6h1.5M9.6 6h1.5M2.4 2.4l1 1M8.6 8.6l1 1M2.4 9.6l1-1M8.6 3.4l1-1"/>',
  dyson: '<circle class="fill" cx="6" cy="6" r="1.6"/><path d="M6 1.3a4.7 4.7 0 0 1 4.7 4.7M6 10.7A4.7 4.7 0 0 1 1.3 6"/>',
  yard: '<path d="M1.5 10.5h9M3 10.5V6l3-2 3 2v4.5M6 4V1.5"/>',
  mend: '<path d="M6 2v8M2 6h8"/>',
  rocket: '<path d="M1.5 6h5.5l3-2v4l-3-2M3 4.2 1.5 6 3 7.8"/>',
  mine: '<path d="M2 10 7.2 4.8M4.6 1.8c2.4-.4 4.6.6 5.6 2.6-1.6-.8-3.6-1-5.6-.4Z"/>', // a pick
  crate: '<path d="M1.5 3.5 6 1.5l4.5 2v5L6 10.5l-4.5-2Z"/><path d="M1.5 3.5 6 5.5l4.5-2M6 5.5v5"/>',
};
export type IconKey = keyof typeof ICON;
export const icon = (k: IconKey, cls = '') => `<svg class="icon${cls && ` ${cls}`}" viewBox="0 0 12 12" aria-hidden="true">${ICON[k]}</svg>`;

const TRACK = { '': '<span class="t"></span>', bar: '<div class="bar"><i></i></div>', scale: '<div class="scale"><s class="band"></s><i class="needle"></i></div>' };
export type Track = keyof typeof TRACK;
/** One line: icon · label · track (a bar, a scale, or a text slot `.t`) · value, on the card's shared columns. */
export const row = (cls: string, ic: IconKey | '', label: string, track: Track = '', tip = cls) =>
  `<div class="row ${cls}" data-tip="${tip}">${ic && icon(ic)}<em class="lb">${label}</em>${TRACK[track]}<span class="v"></span></div>`;
/** One readout cell of a grid: icon · label · value on one line, the track (none: '') full width under them. */
export const cell = (cls: string, ic: IconKey, label: string, track: 'bar' | 'scale' | '' = 'bar', tip = cls) =>
  `<div class="cell ${cls}" data-tip="${tip}">${icon(ic)}<em class="lb">${label}</em><span class="v"></span>${track && TRACK[track]}</div>`;
/**
 * A section's header: its 16 px icon, caption, chevron and a live one-line summary at the right. A click on it opens or
 * folds the section's body (`data-sec`; asteroid/hud.ts).
 */
export const head = (name: string, ic: IconKey, cap: string) =>
  `<div class="hd" data-tip="${name}" data-sec="${name}">${icon(ic, 'lg')}<em class="cap">${cap}</em><i class="chev"></i><span class="v"></span></div>`;

/** A tooltip's text for a `data-tip` key, or null when the key is not this stage's (ui/tip.ts: '\n' lines, "label\tvalue" rows). */
export type TipText = (key: string, el: HTMLElement) => string | null | undefined;
const tips: TipText[] = [];
/** Registers a stage's texts; the latest registered answers first (the star overrides the world's goal). Returns the remover. */
export function addTips(f: TipText) {
  tips.unshift(f);
  return () => void tips.splice(tips.indexOf(f), 1);
}
export const tipText = (key: string, el: HTMLElement) => {
  for (const f of tips) {
    const t = f(key, el);
    if (t) return t;
  }
  return null;
};
/** Rates and amounts for tooltips and rows. */
export const num = (x: number) => (Math.abs(x) < 10 ? x.toFixed(1) : String(Math.round(x)));
export const signed = (x: number) => (Math.abs(x) < 0.05 ? '0.0' : `${x < 0 ? '−' : '+'}${num(Math.abs(x))}`);
