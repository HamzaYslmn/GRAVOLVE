import { Container, RenderTexture, Sprite, Texture, UniformGroup, type Renderer } from 'pixi.js';
import { chunkSet } from '../core/chunks';
import { fbm, hashSeed, rng, smoothstep } from '../core/rng';
import { BAKE_FRAGMENT_HEAD, bakeMesh } from './bake';

// Infinite galaxy backdrop, generated from a seed in chunks (like terrain in a voxel game).
// Each chunk is baked once on the GPU from global coordinates, so neighbours meet seamlessly and
// the same seed always gives the same sky. Per frame it's only the visible chunk sprites.
// Two parallax layers: baked nebula chunks far back, sparse star sprites nearer, so moving reads
// as depth. Everything stays dim and soft so gameplay objects (bright, crisp) never blend into it.
// ponytail: float coordinates with an integer hash stay exact to ~1e6 background units; switch to
// split int/frac coordinates if the world ever grows past that.

const CHUNK = 512; // background units per chunk (~half a screen): invisible, just the streaming unit
const RES = 0.5; // texels per unit: the backdrop is soft, so half resolution at a quarter of the memory
const BAKES_PER_FRAME = 1; // per layer; spreads generation while moving so it never hitches
export const SPACE = 0x02030a; // empty space; the app background uses it under unbaked chunks

const lib = /* glsl */ `${BAKE_FRAGMENT_HEAD}
uniform vec2 uOrigin; // chunk origin, background units
uniform float uScale; // background units per texel

// One small star per cell, kept inside its cell so no neighbour lookups are needed.
float stars(vec2 P, float cell, float chance, float salt) {
  vec2 c = floor(P / cell);
  if (rnd(c, salt) > chance) return 0.0;
  vec2 d = P - (c + 0.25 + 0.5 * vec2(rnd(c, salt + 1.0), rnd(c, salt + 2.0))) * cell;
  float b = pow(rnd(c, salt + 3.0), 2.5);
  float r = uScale * (0.55 + 0.35 * b);
  return exp(-dot(d, d) / (r * r)) * (0.25 + 0.75 * b);
}
vec3 starTint(vec2 P, float cell, float salt) {
  return mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.86, 0.72), rnd(floor(P / cell), salt));
}
// Removes 8-bit banding in the dark gradients.
vec3 dither(vec3 c) { return c + (rnd(vPos * 1.37, 999.0) - 0.5) / 255.0; }
`;

// Far layer: nebula fields, voids, dust lanes, and a faint distant star field.
const nebulaFrag = /* glsl */ `${lib}
// Four colour families (teal, blue, violet, rose), blended by a slow hue field.
vec3 pick(float h, vec3 a, vec3 b, vec3 c, vec3 d) {
  vec3 x = mix(a, b, smoothstep(0.32, 0.42, h));
  x = mix(x, c, smoothstep(0.5, 0.6, h));
  return mix(x, d, smoothstep(0.64, 0.74, h));
}
void main() {
  vec2 P = uOrigin + vPos * uScale;

  // Region fields: where nebulae live vs open voids, and which colour family they use.
  float region = fbm(P / 1100.0, 3, 10.0);
  float field = smoothstep(0.45, 0.62, region); // ~1 screen wide fields, ~45% coverage
  float hue = fbm(P / 2000.0, 2, 30.0);

  // Body: domain-warped noise in a few soft painterly steps.
  vec2 p = P / 450.0;
  vec2 q = vec2(fbm(p, 3, 40.0), fbm(p + 5.2, 3, 50.0));
  float f = fbm(p + 1.6 * q, 5, 60.0);
  float d = smoothstep(0.42, 0.72, f) * field;
  float lv = (floor(d * 3.0) + smoothstep(0.0, 0.5, fract(d * 3.0))) / 3.0;
  // Thin glowing filaments: ridged noise along the same warp, like light catching gas strands.
  float fil = pow(1.0 - abs(2.0 * fbm(p * 1.8 + 2.0 * q, 4, 65.0) - 1.0), 7.0) * smoothstep(0.1, 0.5, d);

  vec3 shadow = pick(hue, vec3(0.01, 0.05, 0.07), vec3(0.02, 0.04, 0.14), vec3(0.06, 0.03, 0.13), vec3(0.09, 0.02, 0.07));
  vec3 mid    = pick(hue, vec3(0.04, 0.2, 0.24), vec3(0.06, 0.14, 0.38), vec3(0.18, 0.09, 0.36), vec3(0.32, 0.09, 0.24));
  vec3 light  = pick(hue, vec3(0.35, 0.75, 0.72), vec3(0.32, 0.55, 0.85), vec3(0.65, 0.42, 0.85), vec3(0.9, 0.5, 0.58));

  vec3 col = vec3(0.008, 0.012, 0.039);                         // space
  col += shadow * smoothstep(0.25, 0.75, f) * field * 0.9;       // haze reaching past the edges
  col = mix(col, mid, lv * 0.75);                                // body, peaks ~0.3: visible, never bright
  col += light * (fil * 0.12 + smoothstep(0.8, 1.0, d) * 0.08); // filaments and a lit core

  float dust = smoothstep(0.58, 0.72, fbm(p * 1.7 + q, 4, 70.0)) * field; // dark lanes
  col *= 1.0 - 0.6 * dust;

  // Distant stars with organic density: a halo around nebulae (wider than the gas itself),
  // scattered clusters, near-empty voids, and only a sprinkle everywhere else.
  float halo = smoothstep(0.36, 0.6, region);
  float clump = smoothstep(0.6, 0.8, fbm(P / 520.0, 3, 20.0));
  float open = smoothstep(0.3, 0.5, fbm(P / 1700.0, 2, 25.0)); // 0 inside large voids
  float dens = (0.012 + 0.26 * halo + 0.5 * clump) * open;
  float s = stars(P, 8.0, dens, 80.0) * 0.2 + stars(P, 34.0, dens, 81.0) * 0.4; // faint many, brighter few
  col += starTint(P, 8.0, 85.0) * s * (1.0 - 0.8 * dust);

  finalColor = vec4(dither(col), 1.0);
}`;

/** `web`: the cosmic web where the camera is (asteroid/web.ts), 1 on a filament .. 0 deep in a void; `tint`: the biome's sky colour. */
type View = { width: number; height: number; x: number; y: number; scale: number; base: number; web?: number; tint?: number };

/**
 * A parallax layer of chunks. It slides `depth` × as far as the world does on screen, whatever the
 * camera zoom (in world units a grown player's sky would race past faster than the rocks in front).
 * As the camera pulls back, the sky shrinks only a little (ZOOM_SHARE of the layer's depth).
 * Visible chunks load first (all of them on the first frame), then a one-chunk margin ahead of motion.
 */
function parallaxLayer(depth: number, make: (cx: number, cy: number) => Container, release: (c: Container) => void) {
  const container = new Container();
  const chunks = chunkSet((cx, cy) => {
    const c = make(cx, cy);
    c.position.set(cx * CHUNK, cy * CHUNK);
    return container.addChild(c);
  }, release);
  let budget = Infinity;
  let last: { x: number; y: number } | undefined; // world point under the screen centre last frame
  let bx = 0, by = 0; // background point under the screen centre

  function update(v: View) {
    const zoom = (v.scale / v.base) ** (depth * ZOOM_SHARE);
    const wx = (v.width / 2 - v.x) / v.scale, wy = (v.height / 2 - v.y) / v.scale;
    if (last) {
      bx += ((wx - last.x) * v.scale * depth) / zoom; // the world's screen motion × depth, in background units
      by += ((wy - last.y) * v.scale * depth) / zoom;
    } else [bx, by] = [wx * v.base * depth, wy * v.base * depth];
    last = { x: wx, y: wy };
    container.scale.set(zoom);
    container.position.set(v.width / 2 - bx * zoom, v.height / 2 - by * zoom);
    const hw = v.width / 2 / zoom, hh = v.height / 2 / zoom;
    const x0 = Math.floor((bx - hw) / CHUNK), x1 = Math.floor((bx + hw) / CHUNK);
    const y0 = Math.floor((by - hh) / CHUNK), y1 = Math.floor((by + hh) / CHUNK);
    budget = chunks.update(x0, x1, y0, y1, 2, budget);
    chunks.update(x0 - 1, x1 + 1, y0 - 1, y1 + 1, 1, budget);
    budget = BAKES_PER_FRAME;
  }

  return { container, update };
}

/** Far layer: nebula chunks baked to textures (one full-screen fill per frame). */
function nebulaLayer(renderer: Renderer, depth: number, seed: number) {
  const size = CHUNK * RES;
  const uniforms = new UniformGroup({
    uOrigin: { value: new Float32Array(2), type: 'vec2<f32>' },
    uScale: { value: 1 / RES, type: 'f32' },
    uSeed: { value: seed, type: 'f32' },
  });
  const baker = bakeMesh(size, nebulaFrag, uniforms);
  const free: RenderTexture[] = []; // textures of released chunks, reused instead of reallocated

  return parallaxLayer(
    depth,
    (cx, cy) => {
      const texture = free.pop() ?? RenderTexture.create({ width: size, height: size });
      (uniforms.uniforms.uOrigin as Float32Array).set([cx * CHUNK, cy * CHUNK]);
      uniforms.update();
      renderer.render({ container: baker, target: texture, clear: true });
      const sprite = new Sprite(texture);
      sprite.scale.set(1 / RES);
      return sprite;
    },
    (chunk) => {
      free.push((chunk as Sprite).texture as RenderTexture);
      chunk.destroy();
    },
  );
}

const NEAR_CANDIDATES = 90; // per chunk; density keeps ~0 in voids, ~20 typical, up to ~60 in clusters

/** Near-layer star density at a point (its own clusters and voids; parallax differs from the nebulae). */
function nearDensity(x: number, y: number, seed: number) {
  const clump = smoothstep(0.58, 0.8, fbm(x / 650, y / 650, 3, seed + 200));
  const spread = smoothstep(0.35, 0.65, fbm(x / 1300, y / 1300, 2, seed + 210));
  const open = smoothstep(0.3, 0.5, fbm(x / 2000, y / 2000, 2, seed + 220)); // 0 inside large voids
  return (0.03 + 0.25 * spread + 0.6 * clump) * open;
}

/** Near layer: sparse dim stars as small sprites. Drawing ~1k tiny quads costs far less than another full-screen layer. */
function nearStarLayer(depth: number, seed: number, texture: Texture) {
  const px = 3 / texture.width; // sprite scale per ~3 px of star

  return parallaxLayer(
    depth,
    (cx, cy) => {
      const rnd = rng(hashSeed(cx, cy, seed)); // same stars every time the chunk is revisited
      const chunk = new Container();
      for (let i = 0; i < NEAR_CANDIDATES; i++) {
        const x = rnd() * CHUNK, y = rnd() * CHUNK;
        if (rnd() >= nearDensity(cx * CHUNK + x, cy * CHUNK + y, seed)) continue; // organic clusters and gaps
        const s = new Sprite({ texture, anchor: 0.5 });
        s.position.set(x, y);
        const b = rnd() ** 2.5; // most stars faint, a few a little brighter
        s.scale.set(px * (0.7 + 0.7 * b)); // ~2-4 px
        s.alpha = 0.2 + 0.3 * b; // dim: marks motion, never mistaken for gameplay objects
        s.tint = rnd() < 0.5 ? 0xb8ccff : 0xffe2c4;
        chunk.addChild(s);
      }
      return chunk;
    },
    (chunk) => chunk.destroy({ children: true }),
  );
}

// Parallax depths, tuned to the play area (~2 screens across): crossing it slides the nebulae
// ~0.7 screen and the near stars ~1.2 screens, so moving around reveals new fields and voids.
const NEBULA_DEPTH = 0.35;
const STARS_DEPTH = 0.6;
const ZOOM_SHARE = 0.25;

// The backdrop follows the cosmic web: in a void the nebulae fade to VOID_NEBULA and the near stars to
// VOID_STARS, eased over ~WEB_EASE s, so a void reads as dark, empty space. Layer alpha only: no extra draw, no re-bake.
const VOID_NEBULA = 0.2;
const VOID_STARS = 0.5;
const WEB_EASE = 1.5; // s
// The biome's sky (asteroid/hud.ts BIOME_SKY): the nebulae multiplied toward its hue (SKY_MUL) and an additive wash of it
// over space (SKY_WASH × saturation, so white adds nothing). One full-screen quad; stays dim under the gameplay.
const SKY_MUL = 0.28;
const SKY_WASH = 0.09;

/** `glow` is a soft round dot texture, reused for the near stars. */
export function createBackground(renderer: Renderer, seed: number, glow: Texture) {
  const container = new Container();
  const layers = [nebulaLayer(renderer, NEBULA_DEPTH, seed), nearStarLayer(STARS_DEPTH, seed, glow)];
  layers[1].container.blendMode = 'add';
  const wash = new Sprite({ texture: Texture.WHITE, blendMode: 'add', alpha: 0 });
  container.addChild(layers[0].container, wash, layers[1].container);
  let lit = 1, last = performance.now();
  const sky = [1, 1, 1]; // the biome hue, eased
  return {
    container,
    update(v: View) {
      const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const ease = 1 - Math.exp(-dt / WEB_EASE);
      lit += ((v.web ?? 1) - lit) * ease;
      layers[0].container.alpha = VOID_NEBULA + (1 - VOID_NEBULA) * lit;
      layers[1].container.alpha = VOID_STARS + (1 - VOID_STARS) * lit;
      const want = v.tint ?? 0xffffff;
      [16, 8, 0].forEach((sh, i) => (sky[i] += (((want >> sh) & 255) / 255 - sky[i]) * ease));
      const rgb = (k: (v: number) => number) => sky.reduce((c, v) => (c << 8) | Math.round(255 * k(v)), 0);
      layers[0].container.tint = rgb((v) => 1 - SKY_MUL * (1 - v));
      wash.tint = rgb((v) => v);
      wash.alpha = SKY_WASH * (Math.max(...sky) - Math.min(...sky));
      wash.setSize(v.width, v.height);
      layers.forEach((l) => l.update(v));
    },
  };
}
