import { Container, Particle, ParticleContainer, Sprite, UniformGroup, type Renderer, type Texture } from 'pixi.js';
import { BAKE_FRAGMENT_HEAD, bakePage } from '../../render/bake';
import { FAR_BOUNDS } from '../../render/fx';
import { YOU } from '../../render/tech';
import { mixRgb } from '../asteroid/body';
import { clamp, smoothstep } from '../../core/rng';
import { DIM, FAR_LIGHT, FLUX_K, PANELS } from './rules';

// How a star looks. White art on one 1024² star page baked once on the GPU (mipmapped), coloured by tint. All star sprites
// use normal blend in one batch: "glow" cells are baked with alpha 0, which under premultiplied normal blend adds light, so
// the opaque photosphere and the additive layers share one draw call.
// Class character comes from the star's colour (its temperature). Fill-rate fallback: a star wider than half the screen
// drops far light, haze and corona. Only stars get boiling layers, streamers and bloom past 2 R★: a hot planet never reads
// as a star.

const PAGE = 1024;
const UNIT = 256;
const DISC = 0.9; // photosphere and granulation disc radius as a share of the cell half size
const LIMB = 0.8; // limb cell: disc radius (room for the fringe)

const fragment = /* glsl */ `${BAKE_FRAGMENT_HEAD}
uniform vec4 uCell; // x kind: 0 photo, 1 gran, 2 corona, 3 limb, 4 halo, 5 haze, 6 flare, 7 far, 8 shadow, 9 panel, 10 hauler, 11 dot; y variant

float hexDist(vec2 p) { p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.732))), p.x); }
float sdCapsule(vec2 p, float a, float b, float r) { p.x -= clamp(p.x, a, b); return length(p) - r; }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
// Worley F2 - F1: bright cells, dark lanes.
float lanes(vec2 q, float salt) {
  vec2 i = floor(q), f = fract(q);
  float f1 = 9.0, f2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = vec2(x, y);
    float e = length(c + vec2(rnd(i + c, salt), rnd(i + c, salt + 7.0)) - f);
    if (e < f1) { f2 = f1; f1 = e; } else if (e < f2) f2 = e;
  }
  return f2 - f1;
}
void glowOut(float a) { finalColor = vec4(vec3(clamp(a, 0.0, 1.0)), 0.0); } // alpha 0: adds light under normal blend

void main() {
  vec2 p = vPos / ${UNIT}.0 * 2.0 - 1.0;
  float d = length(p), kind = uCell.x, v = uCell.y;
  vec2 dir = p / max(d, 1e-4);
  if (kind < 0.5) {
    // Photosphere: limb darkening 1 → 0.42, warmer toward the limb, faint mottling, spots by variant.
    float r = d / ${DISC}, mu = sqrt(max(0.0, 1.0 - r * r));
    vec3 limb = v > 1.5 ? vec3(0.8, 0.86, 1.0) : vec3(1.0, 0.56, 0.34); // hot stars: a cooler, not browner, limb
    vec3 c = (0.42 + 0.58 * mu) * mix(limb, vec3(1.0), sqrt(mu)) * (0.92 + 0.16 * fbm(p * 7.0, 4, 37.0));
    if (v < 1.5) {
      // Spots: round umbrae in a penumbra, edges roughened; few large (v 0) or a few small (v 1).
      vec2 q = p * (v < 0.5 ? 2.2 : 3.5), i = floor(q);
      float spot = 0.0, rough = 0.45 * (fbm(q * 3.0, 3, 49.0) - 0.5);
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 k = i + vec2(x, y);
        if (rnd(k, 45.0 + v) > (v < 0.5 ? 0.3 : 0.08)) continue;
        float e = length(k + 0.25 + 0.5 * vec2(rnd(k, 47.0), rnd(k, 48.0)) - q) / (0.15 + 0.17 * rnd(k, 46.0)) + rough;
        spot = max(spot, 0.4 * smoothstep(1.0, 0.75, e) + 0.3 * smoothstep(0.5, 0.3, e));
      }
      c *= 1.0 - spot;
    }
    float a = smoothstep(1.0, 0.985, r);
    finalColor = vec4(c * a, a);
    return;
  }
  if (kind < 1.5) {
    // Granulation: warped Worley cells, coarse (v 0) or fine (v 1), fading toward the limb.
    float r = d / ${DISC}, mu = sqrt(max(0.0, 1.0 - r * r));
    vec2 q = p * (v < 0.5 ? 4.0 : 10.0);
    q += 0.3 * vec2(fbm(q * 0.7, 3, 11.0), fbm(q * 0.7 + 9.0, 3, 13.0));
    float b = (0.7 * smoothstep(0.0, 0.55, lanes(q, 17.0 + v)) + 0.3 * fbm(q * 1.3, 3, 19.0)) * (0.6 + 0.6 * fbm(q * 0.35, 3, 21.0));
    glowOut(b * pow(mu, 0.4) * smoothstep(1.0, 0.97, r));
    return;
  }
  if (kind < 2.5) {
    // Corona: radial streamers (noise round the circle, so no seam), broken along their length; fades to 0 at the edge.
    float s = fbm(dir * 3.0 + 11.0 * v, 4, 23.0 + 6.0 * v), s2 = fbm(dir * 6.0 + 4.0, 3, 29.0 + v);
    float streak = pow(smoothstep(0.35, 0.8, s), 1.5) * 0.9 + 0.2 * smoothstep(0.45, 0.8, s2);
    glowOut(pow(max(0.0, 1.0 - d), 2.2) * (0.25 + streak) * (0.7 + 0.6 * fbm(p * 2.5, 3, 53.0 + v)));
    return;
  }
  if (kind < 3.5) {
    // Limb: reddened edge inside, a thin rim, spicule hairs of varied length outside, a soft haze past them.
    float r = d / ${LIMB};
    float rim = exp(-pow((r - 1.0) / 0.012, 2.0));
    float hairs = smoothstep(0.45, 0.85, vnoise(dir * 36.0, 61.0)) * (0.5 + 0.5 * vnoise(dir * 9.0, 62.0));
    float len = 0.03 + 0.1 * fbm(dir * 6.0, 3, 63.0);
    float fringe = hairs * smoothstep(1.0 + len, 1.0, r) * smoothstep(0.99, 1.005, r);
    float haze = exp(-pow((r - 1.0) / 0.06, 2.0)) * 0.25 * smoothstep(0.99, 1.01, r);
    float inner = pow(smoothstep(0.7, 1.0, r), 2.0) * 0.55 * smoothstep(1.005, 0.99, r);
    glowOut(rim * 0.9 + fringe * 0.8 + haze + inner);
    return;
  }
  if (kind < 4.5) {
    // Halo: a bright middle with a long soft tail, 0 at the edge.
    glowOut(pow(max(0.0, 1.0 - d), 2.5) / (1.0 + 4.0 * d * d));
    return;
  }
  if (kind < 5.5) {
    // Radiation haze: noisy haze plus short radial grains (dashes along rays), fading out to the edge.
    float ray = vnoise(dir * 20.0, 71.0);
    float grains = smoothstep(0.55, 0.85, ray) * smoothstep(0.5, 0.85, vnoise(vec2(d * 7.0, ray * 25.0), 73.0));
    float haze = smoothstep(0.3, 0.75, fbm(p * 2.5, 4, 75.0));
    glowOut(pow(max(0.0, 1.0 - d), 1.6) * smoothstep(0.0, 0.25, d) * (haze * 0.5 + grains * 0.7));
    return;
  }
  if (kind < 6.5) {
    // Flare: a prominence loop standing on its base (bottom edge of the cell), knotted by noise.
    vec2 c = p - vec2(0.0, 0.85);
    float loop = exp(-pow((length(c * vec2(1.0, 0.8)) - 0.62) / 0.09, 2.0)) * step(c.y, 0.05);
    float knots = 0.5 + 0.8 * fbm(vec2(atan(c.y, c.x) * 4.0, length(c) * 6.0), 3, 31.0);
    float base = exp(-pow(p.y - 0.85, 2.0) / 0.01) * smoothstep(0.9, 0.2, abs(p.x)) * 0.6;
    glowOut(loop * knots + base);
    return;
  }
  if (kind < 7.5) {
    // Far light: a 1 / (1 + 6 r²)³ tail, 0 at the edge. Steeper than 1/d² so the screen side facing the star is clearly brighter.
    float q = 1.0 + d * d * 6.0, e = 1.0 / 343.0;
    glowOut((1.0 / (q * q * q) - e) / (1.0 - e));
    return;
  }
  if (kind < 8.5) {
    // Shadow: black, alpha rising across the terminator toward +x (the night side), soft disc edge.
    float a = smoothstep(-0.25, 0.55, p.x) * smoothstep(1.0, 0.94, d) * 0.92;
    finalColor = vec4(0.0, 0.0, 0.0, a);
    return;
  }
  if (kind < 9.5) {
    // Dyson panel: a hex tile, dark-ish fill with faint cells, bright frame.
    float h = hexDist(p);
    float fill = smoothstep(0.86, 0.82, h);
    float frame = smoothstep(0.1, 0.0, abs(h - 0.8)) ;
    vec2 g = fract(p * 3.0) - 0.5;
    float grid = smoothstep(0.42, 0.48, max(abs(g.x), abs(g.y))) * 0.25;
    float lum = fill * (0.55 + grid) + frame * 0.45;
    float a = clamp(max(fill, frame), 0.0, 1.0);
    finalColor = vec4(vec3(min(1.0, lum)) * a, a);
    return;
  }
  if (kind < 10.5) {
    // Hauler: a hull with a panel crate on its back, an engine glow; nose along +x.
    float px = 2.0 / 64.0;
    float sd = min(sdCapsule(p, -0.45, 0.5, 0.13), sdBox(p - vec2(-0.1, 0.0), vec2(0.28, 0.3)));
    float fill = smoothstep(px, -px, sd);
    float rim = smoothstep(px * 2.5, 0.0, abs(sd + px * 1.2));
    float engine = exp(-dot(p - vec2(-0.62, 0.0), p - vec2(-0.62, 0.0)) / 0.01);
    float lum = fill * 0.6 + rim * 0.4 + engine;
    float a = clamp(max(max(fill, rim), engine), 0.0, 1.0);
    finalColor = vec4(vec3(min(1.0, lum)) * a, a);
    return;
  }
  float a = clamp(exp(-d * d / 0.08) * 0.6 + exp(-d * d / 0.01), 0.0, 1.0);
  finalColor = vec4(vec3(a), a);
}`;

type StarPage = {
  photo: Texture[]; gran: Texture; granFine: Texture; corona: Texture; corona2: Texture; limb: Texture; halo: Texture; haze: Texture;
  panel: Texture; hauler: Texture; dot: Texture; shadow: Texture; flare: Texture; far: Texture;
};
let page: StarPage | undefined;

/** Bakes the star page once for the session (16 draws into one mipmapped 1024² texture, 4 MiB + mips). */
export function starPage(renderer: Renderer): StarPage {
  if (page) return page;
  const uniforms = new UniformGroup({ uCell: { value: new Float32Array(4), type: 'vec4<f32>' }, uSeed: { value: 41, type: 'f32' } });
  const { rt, cell, destroy } = bakePage(renderer, PAGE, UNIT, fragment, uniforms);
  const photo = [0, 1, 2].map((v) => cell(v * 256, 0, 256, 0, v)), gran = cell(768, 0, 256, 1, 0);
  const granFine = cell(0, 256, 256, 1, 1), corona = cell(256, 256, 256, 2, 0), corona2 = cell(512, 256, 256, 2, 1), limb = cell(768, 256, 256, 3);
  const halo = cell(0, 512, 256, 4), haze = cell(256, 512, 256, 5), flare = cell(512, 512, 128, 6), far = cell(640, 512, 128, 7);
  const shadow = cell(768, 512, 128, 8), panel = cell(896, 512, 64, 9), hauler = cell(960, 512, 64, 10), dot = cell(896, 576, 64, 11);
  destroy();
  rt.source.updateMipmaps();
  page = { photo, gran, granFine, corona, corona2, limb, halo, haze, panel, hauler, dot, shadow, flare, far };
  return page;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const SHELL = 1.45; // Dyson sphere radius in R★
const TILT = 0.42; // rad the sphere's spin axis leans toward you
const SPIN = 0.04; // rad/s
const PANEL_SIDE = Math.sqrt((4 * Math.PI) / PANELS) * 0.86; // equal-area tiles (Fibonacci sphere), gaps between them
const STRANDS = 5;
const GRAINS = 32; // per strand, overlapping into a thread of light

/** Fibonacci-sphere panel slots, equator first (an equatorial ring, then bands toward the poles). */
const SLOTS = (() => {
  const s = Array.from({ length: PANELS }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / PANELS, rad = Math.sqrt(1 - y * y), th = i * GOLDEN;
    return { x: Math.cos(th) * rad, y, z: Math.sin(th) * rad };
  });
  return s.sort((a, b) => Math.abs(a.y) - Math.abs(b.y));
})();

/** What the stage tells the view each frame. */
type StarLook = {
  x: number; y: number; R: number; color: number; K: number; glow: number; zoom: number; screenHalf: number; // screenHalf: half the smaller screen side (px)
  dist: number; // your distance to the star (world units): the far light fades out once you are close
  placed: number; // panels in place
  link: number; owned: boolean; // link progress, and whether it is yours
  flare: number; flareAt: number; // 0..1 rise (then decay) of a flare, its angle
  you?: { x: number; y: number; r: number }; // the filaments end here (undefined: none)
};
export type Hauler = { sx: number; sy: number; slot: number; t: number };

const HOT = [3300, 20200]; // red dwarf (0.4 suns) → blue giant (8 suns)
const heatOf = (K: number) => clamp(Math.log(K / HOT[0]) / Math.log(HOT[1] / HOT[0]), 0, 1);
const SUN = heatOf(5800);

/** What a star's class changes in its look (from its temperature): red dwarf → sun → blue giant, interpolated. */
function classLook(K: number) {
  const h = heatOf(K), u = h < SUN ? h / SUN : (h - SUN) / (1 - SUN);
  const k = (red: number, sun: number, blue: number) => (h < SUN ? red + (sun - red) * u : sun + (blue - sun) * u);
  const rgb = (red: number, sun: number, blue: number) => (h < SUN ? mixRgb(red, sun, u, false) : mixRgb(sun, blue, u, false));
  return {
    spots: K < 4400 ? 0 : K < 7500 ? 1 : 2, // large spots / a few small ones / none
    coarse: K < 4400,
    halo: [k(2.2, 3.2, 5), k(0.3, 0.45, 0.6)], // radius (R★), alpha
    corona: [k(2.3, 2.9, 4.2), k(0.45, 0.42, 0.5)],
    gran: [k(0.18, 0.14, 0.07), k(0.08, 0.12, 0.06)], // blue giants are smooth
    core: [k(1, 1.1, 1.4), k(0.2, 0.25, 0.75)], // the white bloom over the disc, strongest for hot stars
    photo: k(0.8, 0.65, 0.45), // how much class colour tints the photosphere
    limb: rgb(0xff4020, 0xff8a38, 0x8ab8ff), // saturated chromosphere
    far: k(0.32, 0.4, 0.5),
    haze: k(0.1, 0.12, 0.16),
  };
}
const HAZE_S = 5; // s for the radiation grains to drift out and fade

/** One star's sprites, its Dyson sphere and its filaments, in `root` (the world, under the rocks). */
export function createStarView(root: Container, pg: StarPage) {
  const box = new Container();
  const pc = (blend?: 'add') => {
    const c = new ParticleContainer({ texture: pg.panel, boundsArea: FAR_BOUNDS, dynamicProperties: { position: true, rotation: true, vertex: true, color: true } });
    if (blend) c.blendMode = blend;
    return c;
  };
  const back = pc(), front = pc(), fil = pc('add');
  const sprite = (tex: Texture) => new Sprite({ texture: tex, anchor: 0.5 });
  const far = sprite(pg.far), halo = sprite(pg.halo), haze = [sprite(pg.haze), sprite(pg.haze)], corona = [sprite(pg.corona), sprite(pg.corona2)];
  const photo = sprite(pg.photo[0]), core = sprite(pg.halo), gran = [sprite(pg.gran), sprite(pg.granFine)], limb = sprite(pg.limb), flare = sprite(pg.flare);
  flare.anchor.set(0.5, 0.92); // its base sits on the limb
  box.addChild(back, far, halo, ...haze, ...corona, photo, core, ...gran, limb, flare, front, fil);
  root.addChildAt(box, 0);
  const spins = [0.07, -0.09].map((s) => s * (0.75 + 0.5 * Math.random())); // 0.05–0.12 rad/s: drifting, not spinning
  const breathe = [6 + 3 * Math.random(), 6 + 3 * Math.random()]; // corona breathing periods (s)
  let look = classLook(5800), lookOf = -1;
  const mk = (tex: Texture, c: ParticleContainer) => {
    const p = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5, alpha: 0 });
    c.addParticle(p);
    return p;
  };
  const backP = SLOTS.map(() => mk(pg.panel, back)), frontP = SLOTS.map(() => mk(pg.panel, front));
  const ships: Particle[] = [], grains: Particle[] = [];
  const arrived = new Float32Array(PANELS); // seconds since each panel arrived (the arrival flash)
  let spin = Math.random() * 6, t = 0, shown = 0;

  /** Screen-plane position of panel slot i (world units around the star), and how much it faces you (z > 0: front). */
  const project = (i: number, R: number) => {
    const s = SLOTS[i], c = Math.cos(spin), sn = Math.sin(spin);
    const x = s.x * c + s.z * sn, z = -s.x * sn + s.z * c, y = s.y * Math.cos(TILT) - z * Math.sin(TILT), zz = s.y * Math.sin(TILT) + z * Math.cos(TILT);
    return { x: x * R * SHELL, y: y * R * SHELL, z: zz };
  };

  return {
    update(dt: number, s: StarLook, haulers: Hauler[]) {
      t += dt;
      spin += SPIN * dt;
      if (s.K !== lookOf) {
        [look, lookOf] = [classLook(s.K), s.K];
        photo.texture = pg.photo[look.spots];
        gran[0].texture = look.coarse ? pg.gran : pg.granFine;
      }
      const c = look, dim = s.placed / PANELS, light = 1 - DIM * dim, rise = s.flare, wide = s.R * s.zoom > s.screenHalf; // fill-rate fallback
      const place = (sp: Sprite, radius: number, half: number) => {
        sp.position.set(s.x, s.y);
        sp.scale.set(radius / half);
      };
      // Far light: the landmark you see from screens away; gone within 1.5 U, where the halo takes over.
      place(far, FAR_LIGHT, 64);
      far.tint = s.color;
      far.alpha = c.far * light * clamp((s.dist / FAR_LIGHT - 0.1) / 0.17, 0, 1);
      far.visible = !wide && far.alpha > 0.004;
      // Halo: the class's bloom; the Dyson shell's dull infrared (waste heat) takes it over as the sphere closes.
      place(halo, c.halo[0] * s.R, UNIT / 2);
      halo.tint = mixRgb(s.color, 0xb0402a, 0.7 * dim, false);
      halo.alpha = c.halo[1] * (1 + 0.6 * rise) * light + 0.22 * dim;
      // Radiation: haze and grains drifting out to where the dose turns harmful, √(FLUX_K·light) R★ (no edge, no text).
      const harm = Math.sqrt(FLUX_K * s.glow * light) * s.R;
      haze.forEach((h, i) => {
        const u = t / HAZE_S + i / 2, ph = u % 1;
        h.visible = !wide;
        place(h, harm * (0.7 + 0.45 * ph), UNIT / 2);
        h.rotation = Math.floor(u) * 2.4 + i; // a new pattern each cycle, swapped while invisible
        h.tint = s.color;
        h.alpha = Math.sin(Math.PI * ph) * c.haze * (1 + rise) * light;
      });
      // Corona: two streamer layers, breathing ±5%.
      corona.forEach((k, i) => {
        k.visible = !wide;
        place(k, c.corona[0] * s.R * (i ? 0.8 : 1) * (1 + 0.05 * Math.sin((2 * Math.PI * t) / breathe[i] + i)), UNIT / 2);
        k.rotation += (i ? -0.025 : 0.015) * dt;
        k.tint = mixRgb(mixRgb(s.color, 0xffffff, 0.25, false), YOU, 0.5 * s.link, false);
        k.alpha = c.corona[1] * (i ? 0.7 : 1) * (1 + 0.4 * rise) * light;
      });
      // Photosphere (opaque), a near-white core bloom, granulation, the limb.
      place(photo, s.R, (UNIT / 2) * DISC);
      photo.rotation += 0.012 * dt;
      photo.tint = mixRgb(0, mixRgb(0xffffff, s.color, c.photo, false), 0.35 + 0.65 * light, false);
      place(core, c.core[0] * s.R, UNIT / 2);
      core.tint = mixRgb(0xffffff, s.color, 0.2, false);
      core.alpha = c.core[1] * (1 + 0.3 * rise) * light;
      gran.forEach((g, i) => {
        place(g, s.R, (UNIT / 2) * DISC);
        g.rotation += spins[i] * dt;
        g.tint = i ? mixRgb(s.color, YOU, 0.55 * s.link, false) : s.color; // the fine layer eases toward your colour as you link
        g.alpha = c.gran[i] * (1 + 0.3 * rise) * (0.35 + 0.65 * light);
      });
      place(limb, s.R, (UNIT / 2) * LIMB);
      limb.tint = c.limb;
      limb.alpha = (0.7 + 0.3 * rise) * (0.5 + 0.5 * light);
      flare.visible = rise > 0.01;
      if (flare.visible) {
        flare.position.set(s.x + Math.cos(s.flareAt) * s.R * 0.97, s.y + Math.sin(s.flareAt) * s.R * 0.97);
        flare.rotation = s.flareAt + Math.PI / 2;
        flare.scale.set((s.R * (0.25 + 0.45 * rise)) / (UNIT / 4));
        flare.tint = mixRgb(0xffffff, c.limb, 0.5, false);
        flare.alpha = Math.min(1, rise * 1.4) * light;
      }

      // Dyson sphere: placed panels, the back half behind the star (lit gold inner faces), the front half over it (dark
      // outer faces: the star is visibly enclosed). An arriving panel flashes.
      const n = Math.min(s.placed, PANELS), side = PANEL_SIDE * SHELL * s.R / 64;
      for (let i = 0; i < PANELS; i++) {
        const b = backP[i], f = frontP[i];
        if (i >= n) {
          if (i < shown) b.alpha = f.alpha = 0;
          continue;
        }
        arrived[i] += dt;
        const q = project(i, s.R), facing = Math.abs(q.z), rot = Math.atan2(q.y, q.x), sq = Math.max(0.18, facing);
        const flash = Math.max(0, 1 - arrived[i] / 0.6), on = q.z >= 0 ? f : b, off = q.z >= 0 ? b : f;
        off.alpha = 0;
        on.x = s.x + q.x;
        on.y = s.y + q.y;
        on.rotation = rot;
        on.scaleX = side * sq;
        on.scaleY = side;
        on.tint = q.z >= 0 ? mixRgb(0x4a3c28, 0xfff2c0, flash, false) : mixRgb(0xffcf7a, 0xffffff, flash, false);
        on.alpha = q.z >= 0 ? 0.92 : 0.75;
      }
      shown = n;
      back.visible = n > 0; // an empty particle container still costs a draw call
      front.visible = n > 0 || haulers.length > 0;
      // Haulers: each carries one panel from your world to its slot (the slot turns with the sphere: they home in on it).
      while (ships.length < haulers.length) ships.push(mk(pg.hauler, front));
      ships.forEach((p, i) => {
        const h = haulers[i];
        if (!h) return void (p.alpha = 0);
        const q = project(h.slot, s.R), tx = s.x + q.x, ty = s.y + q.y, u = h.t, e = smoothstep(0, 1, u);
        const dx = tx - h.sx, dy = ty - h.sy, len = Math.hypot(dx, dy) || 1, arc = Math.sin(Math.PI * u) * 0.18 * len;
        const x = h.sx + dx * e - (dy / len) * arc, y = h.sy + dy * e + (dx / len) * arc;
        const v = 6 * u * (1 - u), dirx = dx * v - (dy / len) * Math.cos(Math.PI * u) * Math.PI * 0.18 * len, diry = dy * v + (dx / len) * Math.cos(Math.PI * u) * Math.PI * 0.18 * len;
        p.x = x;
        p.y = y;
        p.rotation = Math.atan2(diry, dirx);
        p.scaleX = p.scaleY = Math.max(10 / s.zoom, 0.05 * s.R) / 64;
        p.tint = 0xcfe8ff;
        p.alpha = 1;
      });

      // Link filaments: 1 + 4 × progress strands of grains flowing from the star to you along wobbling curves, tinted from
      // the star's colour to yours; once the star is yours, two faint steady strands remain.
      const strands = s.you ? (s.owned ? 2 : Math.min(STRANDS, 1 + Math.floor(4 * s.link))) : 0, want = strands * GRAINS;
      fil.visible = want > 0;
      while (grains.length < want) grains.push(mk(pg.dot, fil));
      grains.forEach((g, i) => (g.alpha = i < want ? g.alpha : 0));
      if (s.you && strands) {
        const ax = s.you.x - s.x, ay = s.you.y - s.y, d = Math.hypot(ax, ay) || 1, ux = ax / d, uy = ay / d;
        const strength = s.owned ? 0.35 : 0.3 + 0.7 * s.link, size = Math.max(4 / s.zoom, Math.min(s.R * 0.08, s.you.r * 0.55)) / 32;
        for (let k = 0; k < strands; k++) {
          const off = (k - (strands - 1) / 2) * 0.32, ca = Math.cos(off), sa = Math.sin(off);
          const sx = s.x + (ux * ca - uy * sa) * s.R, sy = s.y + (uy * ca + ux * sa) * s.R; // leaves the star spread out
          const ex = s.you.x - (ux * Math.cos(off * 1.6) - uy * Math.sin(off * 1.6)) * s.you.r, ey = s.you.y - (uy * Math.cos(off * 1.6) + ux * Math.sin(off * 1.6)) * s.you.r;
          const wob = Math.sin(t * (0.7 + 0.13 * k) + k * 1.7) * 0.22 * d, mx = (sx + ex) / 2 - uy * wob, my = (sy + ey) / 2 + ux * wob;
          for (let j = 0; j < GRAINS; j++) {
            const g = grains[k * GRAINS + j], u = (j / GRAINS + t * 0.35) % 1, w = 1 - u;
            g.x = w * w * sx + 2 * w * u * mx + u * u * ex;
            g.y = w * w * sy + 2 * w * u * my + u * u * ey;
            // Each grain is a streak along the curve, long enough to touch the next: a thread of light, not a dotted line.
            const tx = w * (mx - sx) + u * (ex - mx), ty = w * (my - sy) + u * (ey - my);
            g.rotation = Math.atan2(ty, tx);
            g.scaleY = size * (0.7 + 0.6 * Math.sin(Math.PI * u));
            g.scaleX = Math.max(g.scaleY, (2.2 * d) / GRAINS / 22); // the dot's bright core is ~22 px of its 64
            g.tint = mixRgb(s.color, YOU, u, false);
            g.alpha = Math.sin(Math.PI * u) * strength;
          }
        }
      }
    },
    /** Sample points along the current filaments (the snap scatters grains from here). */
    strandPoints() {
      return grains.filter((g) => g.alpha > 0.05).map((g) => ({ x: g.x, y: g.y }));
    },
    destroy() {
      box.destroy({ children: true });
    },
  };
}

export type StarView = ReturnType<typeof createStarView>;
