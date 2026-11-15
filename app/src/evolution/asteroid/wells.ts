import { Container, Sprite, Texture } from 'pixi.js';
import { fbm, smoothstep } from '../../core/rng';
import { mixRgb, type Body } from './body';

// Gravity wells: the danger around a body drawn as an aura, not a target. A breathing glow of the verdict
// colour, two veils of uneven haze turning in opposite directions, and faint waves sinking inward; wider,
// brighter and quicker the more dangerous. All pooled additive sprites of three textures baked once.

const WAVES = 2;
const MAX_WELLS = 6;
const PER_WELL = 3 + WAVES; // glow, two haze veils, waves
const TEX = 256; // px, haze and wave textures
const WAVE_AT = 0.8; // wave radius as a share of the texture's half size
const SOFTEN = 0.3; // how far the haze colour leans to white: the verdict reads, it doesn't shout

/**
 * A white ring texture, alpha = `band(d)` × angular noise, where d is the distance from the centre
 * (1 = edge). The noise wraps around the circle seamlessly (sampled on a circle in noise space).
 */
function bake(band: (d: number) => number, lumps: number, seed: number) {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d')!, img = g.createImageData(TEX, TEX), h = TEX / 2;
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const dx = x + 0.5 - h, dy = y + 0.5 - h, d = Math.hypot(dx, dy) / h, a = Math.atan2(dy, dx);
      const n = fbm(Math.cos(a) * lumps + d * 0.8, Math.sin(a) * lumps, 4, seed);
      const alpha = band(d) * (0.35 + 0.65 * smoothstep(0.3, 0.7, n));
      img.data.set([255, 255, 255, Math.round(255 * alpha)], (y * TEX + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  return Texture.from(c);
}

export function createWells(glow: Texture) {
  const layer = new Container();
  const haze = bake((d) => smoothstep(0.42, 0.72, d) * (1 - smoothstep(0.78, 1, d)), 1.6, 91);
  const wave = bake((d) => Math.exp(-(((d - WAVE_AT) / 0.1) ** 2)), 3.5, 92);
  const sprites = Array.from({ length: MAX_WELLS * PER_WELL }, (_, i) => {
    const k = i % PER_WELL;
    return new Sprite({ texture: k === 0 ? glow : k < 3 ? haze : wave, anchor: 0.5, blendMode: 'add', visible: false });
  });
  layer.addChild(...sprites);
  let time = 0, used = 0;

  return {
    layer,
    /** Starts a frame. */
    begin(dt: number) {
      time += dt;
      used = 0;
    },
    /**
     * A well around `b`. `strength` 0..1 fades it in and out (distance, time to contact); `danger`
     * 0 (safe) .. 1 (deadly) sets its size, motion and brightness.
     */
    well(b: Body, color: number, strength: number, danger: number, zoom: number) {
      if (strength <= 0 || used >= MAX_WELLS) return;
      const base = used++ * PER_WELL, { x, y } = b.motion, seed = b.r * 7.3; // each body's aura moves on its own phase
      const inner = b.r + 2 / zoom, outer = b.r * (1.8 + 1.2 * danger) + 16 / zoom;
      const breathe = 0.8 + 0.2 * Math.sin(time * (1.2 + 3.5 * danger) + seed);
      const soft = mixRgb(color, 0xffffff, SOFTEN * (1 - danger), false); // deadly stays pure red
      const set = (s: Sprite, radius: number, alpha: number, tint: number, spin = 0) => {
        s.visible = alpha > 0.004;
        s.position.set(x, y);
        s.tint = tint;
        s.scale.set(radius / (TEX / 2));
        s.alpha = alpha;
        s.rotation = spin;
      };
      set(sprites[base], inner * 2.6 * (TEX / glow.width), strength * (0.12 + 0.2 * danger) * breathe, color); // the glow close in
      const turn = time * (0.12 + 0.35 * danger);
      set(sprites[base + 1], outer, strength * (0.08 + 0.14 * danger) * breathe, soft, seed + turn);
      set(sprites[base + 2], outer * 0.82, strength * (0.06 + 0.1 * danger), soft, -seed - turn * 1.4);
      const speed = 0.2 + 0.6 * danger; // waves per second sinking in
      for (let k = 0; k < WAVES; k++) {
        const f = (time * speed + k / WAVES + seed) % 1; // 0 at the rim of the well, 1 at the body
        const r = (outer - (outer - inner) * f * f) / WAVE_AT;
        set(sprites[base + 3 + k], r, strength * Math.sin(Math.PI * f) ** 2 * (0.08 + 0.2 * danger), color, seed * 3 + k);
      }
    },
    /** Ends a frame: hides what wasn't used. */
    end() {
      for (let i = used * PER_WELL; i < sprites.length; i++) sprites[i].visible = false;
    },
    destroy() {
      layer.destroy({ children: true });
      haze.destroy(true);
      wave.destroy(true);
    },
  };
}
