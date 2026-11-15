// Debug biome map (settings: "Biome map"): a small canvas of the biomes around you (asteroid/field.ts biomeAt, the scale
// each place was generated at), your position as a dot and your view as a frame. North up, SPAN of your views across.
// Redrawn a few rows at a time into a pixel buffer (one putImageData), a full pass every PASS_S, so it never stalls a
// frame and costs the same at 60 or 240 fps; the frame and the dot are restyled only when they move.
import './minimap.css';
import type { Biome } from '../evolution/asteroid/web';

const CELLS = 56; // samples across
const PASS_S = 0.5; // s for a full map: the same lookups per second at any frame rate (a biome lookup is ~2.4 µs)
const SPAN = 24; // your views across
const COLOR: Record<Biome, number> = {
  belt: 0x8f8a7c, ice: 0x3987e5, metal: 0x8a7bea, gas: 0xeda100, rapids: 0x1baf7a, meteors: 0xe34948, kuiper: 0x85d8f0, void: 0x0b0b10,
};

export function createMinimap() {
  const box = document.createElement('div');
  box.id = 'minimap';
  box.className = 'ui-panel';
  box.hidden = true;
  box.innerHTML = `<div class="map"><canvas width="${CELLS}" height="${CELLS}"></canvas><div class="frame"></div><i class="you"></i></div>`;
  document.body.appendChild(box);
  const ctx = box.querySelector('canvas')!.getContext('2d')!, frame = box.querySelector<HTMLElement>('.frame')!, you = box.querySelector<HTMLElement>('.you')!;
  const img = ctx.createImageData(CELLS, CELLS), px = img.data;
  let row = 0, cx = 0, cy = 0, cell = 1; // the pass in progress keeps its own centre and scale
  let frameCss = '', youCss = '', due = 0, last = performance.now(); // due: rows owed, at CELLS / PASS_S a second
  return {
    set visible(v: boolean) {
      box.hidden = !v;
    },
    /** `at`: you (world units); `halfW`/`halfH`: your view's half size; `biomeAt`: the biome at a world point. */
    update(at: { x: number; y: number }, halfW: number, halfH: number, biomeAt: (x: number, y: number) => Biome) {
      if (box.hidden) return;
      const now = performance.now();
      due = Math.min(CELLS, due + ((now - last) / 1000) * (CELLS / PASS_S));
      last = now;
      if (row === 0) [cx, cy, cell] = [at.x, at.y, (SPAN * 2 * halfW) / CELLS];
      const first = row;
      for (; due >= 1 && row < CELLS; due--, row++)
        for (let i = 0; i < CELLS; i++) {
          const c = COLOR[biomeAt(cx + (i - CELLS / 2 + 0.5) * cell, cy + (row - CELLS / 2 + 0.5) * cell)], k = 4 * (row * CELLS + i);
          [px[k], px[k + 1], px[k + 2], px[k + 3]] = [c >> 16, (c >> 8) & 255, c & 255, 255];
        }
      if (row > first) ctx.putImageData(img, 0, 0, 0, first, CELLS, row - first);
      if (row >= CELLS) row = 0;
      const span = CELLS * cell, x = 50 + (100 * (at.x - cx)) / span, y = 50 + (100 * (at.y - cy)) / span; // % of the map
      const w = (100 * 2 * halfW) / span, h = (100 * 2 * halfH) / span, r = (v: number) => v.toFixed(1);
      const f = `width:${r(w)}%;height:${r(h)}%;left:${r(x - w / 2)}%;top:${r(y - h / 2)}%`, d = `left:${r(x)}%;top:${r(y)}%`;
      if (f !== frameCss) frame.style.cssText = frameCss = f; // a style write forces a style recalc: only when it moved
      if (d !== youCss) you.style.cssText = youCss = d;
    },
  };
}
