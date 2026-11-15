import { RenderTexture, Sprite, UniformGroup, type Renderer } from 'pixi.js';
import { clamp, smoothstep } from '../../core/rng';
import { BAKE_FRAGMENT_HEAD, bakeMesh } from '../../render/bake';
import type { Body } from './body';
import { bakes, breakFaces, faceFit, jagStage, ROUND_M, shapeOf, surfaceSeed, type Comp, type Element } from './rules';

// Big bodies stop being a pile of rock sprites and become one baked sphere (rules.ts bakes): once a pile reaches half its
// round-off radius or has been molten, never below ROUND_M; until fully round it is an irregular "potato" (lumpier
// edge EDGE_LUMP, stretched by STRETCH). The crust loses its metal as the body differentiates (Body.diff).
// Meals still land as their own rocks, then sink in and fade, and the sphere re-bakes with the blended crust, so a
// round body is always one sprite plus the few meals still sinking in. A rough body (Body.rough: comets, fragments,
// what you caught as a pile) keeps its own rocks unbaked until molten; its meals sink in the same way and its kept rocks
// grow to its collision circle. A heavy debris piece (Body.jag) bakes at once with flat break faces cut into its outline,
// re-baked (crossfaded) at each of its rounding steps. Bakes are 256² on the GPU, at most one per frame; textures are freed with their sprite.
const EDGE_LUMP = [0.03, 0.34]; // edge amplitude, round .. potato
const STRETCH = 0.45; // up to 1.45× longer than wide (real fragments ≈ 0.7 axis ratio)
const TEX = 256;
const EDGE = 0.92; // sphere radius as a share of the texture's half size
const SINK_S = 0.7; // s a meal stays on the surface before it starts to sink in
const FADE_S = 0.6; // s it takes to sink in
const TRANSFORM = 2.5; // s from pile to sphere
const REBAKE = 0.06; // re-bake when mass changed by this share since the last bake (and something sank in)
const CROSS = 0.6; // s: a new surface state (seas, frost, lava, life) fades in over the old bake

// Surface states: your world's climate drawn into its own bake, so coasts follow the sphere's relief and craters
// become lakes. Set each frame by render/overlays.ts; values are quantised (seas in eighths, frost and lava in
// quarters, life by stage), so a world changes in visible steps, each one bake with a CROSS crossfade.
type Surface = {
  sea: number; // share of the surface under water, 0..1 (0 while the water is steam)
  frozen: boolean; // the seas are ice
  frost: number; // 0..1: frost on the high ground, colder = lower
  lava: number; // 0..1: molten seams and lava basins glowing through a dark crust
  life: number; // 0: none, 1: habitable (greener seas), 2 + stage: green lowlands spread
  city?: number; // 0..1 city-light coverage: its own additive bake (cityLights), not part of the surface key
};
const surfaces = new WeakMap<Body, Surface>();
const step = (x: number, n: number) => Math.round(clamp(x, 0, 1) * n) / n;
/** Your world's surface state (quantised here); its sphere re-bakes with a crossfade when a step changes. */
export function setSurface(b: Body, s: Surface) {
  const sea = step(s.sea, 8);
  surfaces.set(b, { sea, frozen: s.frozen && sea > 0, frost: step(s.frost, 4), lava: step(s.lava, 4), life: Math.round(s.life), city: step(s.city ?? 0, 4) });
}
const lightMaps = new WeakMap<Body, { s: Sprite; key: string }>();
/** Your world's city lights (civilization): an additive sprite over the sphere; the civilization sets its alpha (brightness, flicker). */
export const cityLights = (b: Body) => lightMaps.get(b)?.s;
const keyOf = (s?: Surface) => (s ? `${s.sea}|${+s.frozen}|${s.frost}|${s.lava}|${s.life}` : '');
/** Normal quantile (Abramowitz-Stegun 26.2.23, error < 4.5e-4): the sea level that floods `p` of a roughly normal relief. */
function probit(p: number) {
  const q = clamp(p, 0.001, 0.999), t = Math.sqrt(-2 * Math.log(q < 0.5 ? q : 1 - q));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return q < 0.5 ? -z : z;
}
// The shader's `ground` (what the seas fill): 4-octave fbm (p50 0.5, sd ≈ 0.155: bake.ts) + 0.3 × finer grain.
const GROUND = [0.5, 0.16];

// Surface albedo per element (crust colours; metal is the dull iron of a weathered surface).
const ALBEDO: Record<Element, number[]> = {
  rock: [0.45, 0.4, 0.35],
  metal: [0.55, 0.52, 0.48],
  ice: [0.62, 0.74, 0.86],
  gas: [0.75, 0.7, 0.58],
  radio: [0.45, 0.5, 0.36], // heavy elements sink too, but this is what shows of them
};

const fragment = /* glsl */ `${BAKE_FRAGMENT_HEAD}
uniform vec3 uAlbedo;  // crust colour
uniform vec3 uIceCol;  // ice patches
uniform vec4 uMix;     // ice share, metal share (surface), lumpiness, crater count
uniform vec4 uHist;    // lava plains (was molten), ice cracks, hue tint strength, city lights (0: surface; 1 + coverage: lights layer)
uniform vec3 uHue;     // the body's own tint (its region's palette for spawned worlds), normalised
uniform vec4 uShape;   // edge radius, edge lump amplitude, stretch (√ of the axis ratio), -
uniform vec4 uCuts[6]; // debris break faces: nx, ny, distance (edge radii), on
uniform vec4 uSurf;    // surface state (setSurface): sea level on ground, frozen, frost, lava
uniform vec4 uSurf2;   // habitable, vegetation, active (0: a plain body, none of the surface states), -
uniform float uTex;

void main() {
  vec2 p = vPos / uTex * 2.0 - 1.0;
  p = vec2(p.x / uShape.z, p.y * uShape.z); // stretched along x; it turns with the body
  float pix = 2.0 / uTex;
  float ang = atan(p.y, p.x);
  vec2 dir = vec2(cos(ang), sin(ang));
  float edge = uShape.x * (1.0 + uShape.y * (fbm(dir * 1.6 + 3.0, 3, 5.0) - 0.5) * 2.0);
  for (int i = 0; i < 6; i++) if (uCuts[i].w > 0.5) edge = min(edge, uShape.x * uCuts[i].z / max(dot(dir, uCuts[i].xy), 0.001));
  float d = length(p);
  float alpha = smoothstep(edge, edge - pix * 1.5, d);
  vec2 q = p / edge;                                   // unit disc
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));

  // Surface relief: large lumps fade with mass, fine grain and craters stay.
  float h = (fbm(q * 2.4, 4, 11.0) - 0.5) * (0.06 + 0.25 * uMix.z) + (fbm(q * 9.0, 3, 21.0) - 0.5) * 0.04;
  float cavity = 0.0;
  for (int i = 0; i < 16; i++) {
    if (float(i) >= uMix.w) break;
    vec2 c = vec2(rnd(vec2(i, 1), 40.0), rnd(vec2(i, 2), 41.0)) * 1.6 - 0.8;
    float r = 0.06 + 0.22 * pow(rnd(vec2(i, 3), 42.0), 2.0);
    float k = length(q - c) / r;
    if (k < 1.0) { h -= (1.0 - k * k) * 0.3 * r; cavity = max(cavity, 1.0 - k); }
    h += exp(-pow((k - 1.0) / 0.25, 2.0)) * 0.08 * r;
  }
  vec3 n = normalize(vec3(q - vec2(dFdx(h), dFdy(h)) / pix * 0.6, z + 0.001));
  vec3 L = normalize(vec3(-0.55, -0.6, 0.58));
  float diffuse = max((dot(n, L) + 0.15) / 1.15, 0.0);

  // Crust: rock base, ice where the noise is high (more with more ice), dull metal flecks.
  float m = fbm(q * 3.0, 4, 31.0);
  vec3 col = uAlbedo * mix(vec3(1.0), uHue, uHist.z) * (0.85 + 0.3 * m);
  col = mix(col, uIceCol, smoothstep(1.0 - uMix.x * 1.4, 1.05 - uMix.x * 1.4, fbm(q * 2.2, 4, 35.0) + 0.15));
  col = mix(col, vec3(0.62, 0.58, 0.52), uMix.y * smoothstep(0.62, 0.7, fbm(q * 7.0, 3, 37.0)));
  // Lava plains: a body that was molten has dark, smooth basalt seas (and fewer craters, set in uMix.w).
  float sea = uHist.x * smoothstep(0.52, 0.58, fbm(q * 1.7, 4, 45.0));
  col = mix(col, col * vec3(0.5, 0.48, 0.47), sea);
  // Ice crust cracks: thin dark lines across an icy surface.
  float line = 1.0 - smoothstep(0.0, 0.018, abs(fbm(q * 2.6, 3, 51.0) - 0.5));
  col = mix(col, col * vec3(0.62, 0.48, 0.4), uHist.y * line);
  col *= 1.0 - cavity * 0.3 * (1.0 - sea);

  // Surface states: seas fill the low ground of this relief, frost settles on the heights, lowlands green with
  // life; a molten world is a dark crust split by glowing seams and lava basins.
  float ground = fbm(q * 2.4, 4, 11.0) + (fbm(q * 9.0, 3, 21.0) - 0.5) * 0.3 - cavity * 0.15;
  float ocean = uSurf2.z * smoothstep(uSurf.x + 0.008, uSurf.x - 0.008, ground);
  float depth = clamp((uSurf.x - ground) / 0.12, 0.0, 1.0);
  float frost = uSurf2.z * uSurf.z * smoothstep(0.64 - 0.22 * uSurf.z, 0.68 - 0.22 * uSurf.z, ground + 0.25 * (fbm(q * 6.0, 3, 61.0) - 0.5));
  float veg = uSurf2.z * uSurf2.y * smoothstep(uSurf.x + 0.03 + 0.2 * uSurf2.y, uSurf.x + 0.01, ground) * smoothstep(0.38, 0.52, fbm(q * 5.0, 3, 63.0));
  col = mix(col, vec3(0.17, 0.33, 0.13) * (0.8 + 0.4 * m), veg * 0.8 * (1.0 - frost));
  col = mix(col, vec3(0.88, 0.89, 0.9), frost * 0.85); // frost: grey-white, so it reads apart from blue sea ice
  vec3 water = mix(mix(vec3(0.15, 0.42, 0.6), vec3(0.12, 0.47, 0.48), uSurf2.x), mix(vec3(0.03, 0.12, 0.32), vec3(0.03, 0.18, 0.3), uSurf2.x), depth);
  float floe = 1.0 - smoothstep(0.0, 0.02, abs(fbm(q * 3.4, 3, 67.0) - 0.5)); // cracks in sea ice
  vec3 seaIce = mix(vec3(0.74, 0.86, 0.96), vec3(0.52, 0.68, 0.86), depth * 0.7) * (1.0 - 0.22 * floe);
  col = mix(col, mix(water, seaIce, uSurf.y), ocean);
  float seam = 1.0 - smoothstep(0.0, 0.02 + 0.04 * uSurf.w, abs(fbm(q * 3.2, 3, 71.0) - 0.5));
  float pool = smoothstep(0.3 + 0.2 * uSurf.w, 0.26 + 0.2 * uSurf.w, ground);
  float melt = uSurf2.z * uSurf.w * max(seam * 0.85, pool);
  float glow = melt * (0.65 + 0.35 * fbm(q * 14.0, 2, 73.0));
  col *= 1.0 - 0.6 * uSurf2.z * uSurf.w; // a dark, glassy crust between the seams
  col = mix(col, vec3(0.06, 0.035, 0.03), min(1.0, melt * 1.5)); // lava itself is lit from within, not by the sun
  vec3 nn = normalize(mix(n, vec3(q, z + 0.001), ocean)); // water is flat: the sphere's own normal
  diffuse = max((dot(nn, L) + 0.15) / 1.15, 0.0);
  if (uHist.w > 0.5) {
    // City lights: warm dots on land, crowding the coasts and spreading inland with coverage, night side only.
    float level = uHist.w - 1.0;
    float land = (1.0 - ocean) * (1.0 - frost) * (1.0 - min(1.0, melt * 2.0));
    float coast = uSurf.x > -0.5 ? smoothstep(uSurf.x + 0.14, uSurf.x + 0.005, ground) : smoothstep(0.62, 0.4, ground);
    float spread = smoothstep(1.05 - level, 1.2 - level, 0.55 * coast + 0.6 * fbm(q * 3.5, 3, 81.0));
    vec2 g = q * 22.0, cell = floor(g), f = fract(g) - 0.5 - (vec2(rnd(cell, 85.0), rnd(cell, 87.0)) - 0.5) * 0.5;
    float town = exp(-dot(f, f) / 0.045) * step(rnd(cell, 83.0), 0.25 + 0.65 * spread) * (0.5 + 0.8 * rnd(cell, 89.0));
    float night = smoothstep(0.25, -0.2, dot(vec3(q, z), L));
    float v = land * night * spread * (1.5 * town + 0.22) * smoothstep(0.0, 0.2, z) * alpha;
    vec3 c = vec3(1.0, 0.76, 0.4) * v;
    finalColor = vec4(c, max(c.r, max(c.g, c.b)));
    return;
  }

  vec3 lit = col * (0.08 + 1.0 * diffuse) + col * 0.06 * (1.0 - diffuse);
  lit += vec3(0.42, 0.55, 0.75) * pow(1.0 - z, 3.0) * 0.25 * max(0.3 - dot(n, L), 0.0); // cool rim
  lit += vec3(1.0, 0.95, 0.85) * pow(max(dot(reflect(-L, nn), vec3(0.0, 0.0, 1.0)), 0.0), 24.0) * 0.4 * ocean * (1.0 - 0.7 * uSurf.y); // sun glint on open water
  lit += mix(vec3(0.7, 0.12, 0.03), vec3(1.0, 0.45, 0.08), glow * glow) * glow * 1.2; // lava light: red to orange, never white (a hot world must not read as a star)
  finalColor = vec4(lit * alpha, alpha);
}`;

/** Surface shares after differentiation (Body.diff, grown while molten): sunk metal leaves the crust. */
function crust(c: Comp, diff: number) {
  const sink = diff * 0.85;
  const s: Record<Element, number> = { metal: (c.metal ?? 0) * (1 - sink), rock: c.rock ?? 0, ice: c.ice ?? 0, gas: c.gas ?? 0, radio: (c.radio ?? 0) * (1 - sink) };
  const sum = s.metal + s.rock + s.ice + s.gas + s.radio || 1;
  for (const e in s) s[e as Element] /= sum;
  return s;
}

type Part = Body['parts'][number];
/** Meals on `b` (not its core, not a rough body's kept rocks) sink in and fade; a rough body's kept rocks then grow to cover its collision radius `R` (local units). */
function sink(b: Body, dt: number, R: number, core?: Part) {
  let sank = false;
  for (let i = b.rough ?? 0; i < b.parts.length; i++) {
    const p = b.parts[i];
    if (p === core || p.age < SINK_S) continue;
    const f = Math.min(1, (p.age - SINK_S) / FADE_S);
    p.s.alpha = 1 - f;
    p.s.position.set(p.s.x * (1 - 2 * dt), p.s.y * (1 - 2 * dt)); // sinking toward the centre
    if (f >= 1) {
      p.s.destroy();
      sank = true;
    }
  }
  if (!sank) return;
  b.parts = b.parts.filter((p) => !p.s.destroyed);
  const kept = b.parts.slice(0, b.rough ?? 0), reach = Math.max(...kept.map((p) => Math.hypot(p.s.x, p.s.y) + p.r)), k = R / reach;
  if (k > 1) for (const p of kept) [p.r, p.s.x, p.s.y, p.s.scale.x, p.s.scale.y] = [p.r * k, p.s.x * k, p.s.y * k, p.s.scale.x * k, p.s.scale.y * k];
}

export function createSpheres(renderer: Renderer) {
  const uniforms = new UniformGroup({
    uAlbedo: { value: new Float32Array(3), type: 'vec3<f32>' },
    uIceCol: { value: new Float32Array([0.72, 0.84, 0.95]), type: 'vec3<f32>' },
    uMix: { value: new Float32Array(4), type: 'vec4<f32>' },
    uHist: { value: new Float32Array(4), type: 'vec4<f32>' },
    uHue: { value: new Float32Array(3), type: 'vec3<f32>' },
    uShape: { value: new Float32Array([EDGE, 0, 1, 0]), type: 'vec4<f32>' },
    uCuts: { value: new Float32Array(24), type: 'vec4<f32>', size: 6 },
    uSurf: { value: new Float32Array([-1, 0, 0, 0]), type: 'vec4<f32>' },
    uSurf2: { value: new Float32Array(4), type: 'vec4<f32>' },
    uTex: { value: TEX, type: 'f32' },
    uSeed: { value: 1, type: 'f32' },
  });
  const mesh = bakeMesh(TEX, fragment, uniforms);
  // Core sprites and their baked textures: a destroyed sprite drops its texture reference, so it is kept here to free it.
  const live = new Map<Sprite, RenderTexture>();
  const seeds = new WeakMap<Body, number>();
  const edges = new WeakMap<Body, number>(); // each body's baked edge radius (share of the texture half size)
  const keys = new WeakMap<Body, string>(); // the surface state each body was last baked with
  const fades = new WeakMap<Body, { s: Sprite; t: number; e: number }>(); // a new surface bake fading in over the core (e: the old bake's edge)
  let budget = 1, nth = Math.floor(Math.random() * 9973), count = 0; // count: bakes so far (dev: __g().spheres.bakes)
  const look = (b: Body) => keyOf(surfaces.get(b)) + jagStage(b.jag); // what a bake shows: surface state and debris step

  function bake(b: Body, tex?: RenderTexture, lights = 0) {
    const s = crust(b.comp, b.diff ?? 0), u = uniforms.uniforms as Record<string, Float32Array | number>;
    if (!seeds.has(b)) seeds.set(b, surfaceSeed(nth++)); // one surface per body: a re-bake keeps its features
    const seed = seeds.get(b)!, shade = b.jag === undefined ? 1 : 0.8 + 0.4 * ((seed * 0.381) % 1); // sibling pieces differ in shade
    (u.uAlbedo as Float32Array).set([0, 1, 2].map((i) => shade * (Object.keys(ALBEDO) as Element[]).reduce((a, e) => a + ALBEDO[e][i] * s[e], 0)));
    // History shows: a never-molten body keeps its craters (16), a resurfaced one has few, plus lava plains.
    const diff = b.diff ?? 0, hot = Math.max(diff, smoothstep(1, 3, b.heat));
    const jag = jagStage(b.jag), round = shapeOf(b.r, b.comp, diff, jag), lump = EDGE_LUMP[0] + (EDGE_LUMP[1] - EDGE_LUMP[0]) * (1 - round);
    const st = Math.sqrt(1 + STRETCH * (1 - round) * ((seed * 0.618) % 1)), edge = 0.96 / ((1 + lump) * st); // fits the texture
    const faces = breakFaces(seed, jag), cuts = (u.uCuts as Float32Array).fill(0);
    faces.forEach(([x, y, d], i) => cuts.set([x, y, d, 1], 4 * i));
    if (!lights) edges.set(b, edge / faceFit(faces)); // the lights layer reuses the core's numbers; a cut outline is drawn bigger, to its collision circle's area
    (u.uShape as Float32Array).set([edge, lump, st, 0]);
    const surf = surfaces.get(b);
    if (!lights) keys.set(b, look(b));
    // With a surface state, water shows as seas and frost instead of the plain crust's ice patches.
    (u.uMix as Float32Array).set([surf ? 0 : s.ice, s.metal, 1 - round, Math.round(16 - 12 * hot)]);
    (u.uSurf as Float32Array).set(surf ? [surf.sea > 0 ? GROUND[0] + GROUND[1] * probit(surf.sea) : -1, +surf.frozen, surf.frost, surf.lava] : [-1, 0, 0, 0]);
    (u.uSurf2 as Float32Array).set(surf ? [Math.min(1, surf.life), clamp((surf.life - 2) / 4, 0, 1), 1, 0] : [0, 0, 0, 0]);
    const rgb = [16, 8, 0].map((sh) => ((b.tint >> sh) & 255) / 255), mean = (rgb[0] + rgb[1] + rgb[2]) / 3 || 1;
    (u.uHue as Float32Array).set(rgb.map((v) => v / mean));
    (u.uHist as Float32Array).set([hot, smoothstep(0.2, 0.4, s.ice), 0.6, lights ? 1 + lights : 0]);
    u.uSeed = seed;
    uniforms.update();
    const target = tex ?? RenderTexture.create({ width: TEX, height: TEX });
    renderer.render({ container: mesh, target, clear: true });
    budget--;
    count++;
    return target;
  }

  return {
    /** Starts a frame: one bake allowed; textures of sprites that are gone are freed. */
    begin() {
      budget = 1;
      for (const [s, tex] of live) {
        if (!s.destroyed) continue;
        live.delete(s);
        tex.destroy(true);
      }
    },
    /** Rounds `b` off once it's heavy enough (`animate`: as a visible process, for your own body; others just are round), keeps its sphere sized, sinks meals in, re-bakes when it changed. */
    update(b: Body, dt: number, animate = false) {
      if (!b.m || b.view.destroyed || (b.m < ROUND_M && b.parts.length && !b.parts[0].core)) return; // most rocks: too small to round, nothing to do (none left: a stored sphere, re-baked)
      const R = b.r / b.k; // body-local radius
      let core = b.parts[0]?.core ? b.parts[0] : b.parts.find((p) => p.core);
      if (!core) {
        if (!(bakes(b.m, b.r, b.comp, b.diff, b.rough, b.jag) || !b.parts.length) || budget <= 0) return void (b.rough && sink(b, dt, R));
        const f = fades.get(b);
        if (f) [f.s.destroy(), fades.delete(b)];
        // Rounding off is a process, not a swap: the sphere fades in under the pile while the rocks sink into it,
        // outer ones last, over ~TRANSFORM s; the sphere settles from a little smaller to its full size.
        const tex = bake(b), s = new Sprite({ texture: tex, anchor: 0.5, alpha: 0 }), at = b.parts.length ? b.view.getChildIndex(b.parts[0].s) : b.view.children.length; // above glows and halos, under the pile
        if (!animate) for (const p of b.parts) p.s.destroy();
        else for (const p of b.parts) p.age = SINK_S - (TRANSFORM - FADE_S) * (0.1 + 0.45 * Math.min(1, Math.hypot(p.s.x, p.s.y) / R) + 0.45 * Math.random()); // outer ones tend to go last, spread over the whole process
        core = { s, r: R, base: 0xffffff, age: animate ? 0 : TRANSFORM, core: true };
        [b.parts, b.rough] = [[core, ...b.parts.filter((p) => !p.s.destroyed)], undefined];
        b.view.addChildAt(s, at);
        b.baked = b.m;
        live.set(s, tex);
      }
      if (b.parts.length === 1) core.age += dt; // tickBody ages parts only while there are two or more
      const grown = smoothstep(0, TRANSFORM, core.age); // 0 → 1 while rounding off, then 1 for good
      core.s.alpha = grown;
      const fade = fades.get(b), edge = edges.get(b) ?? EDGE; // during a crossfade the core still shows the old bake (its edge: fade.e)
      core.s.scale.set((R / ((fade?.e ?? edge) * (TEX / 2))) * (0.86 + 0.14 * grown));
      core.s.position.set(0, 0);
      core.r = R;
      sink(b, dt, R, core);
      if (fade) {
        // A new surface state fades in over the old bake, then takes the core's place.
        fade.t += dt;
        fade.s.alpha = core.s.alpha * smoothstep(0, CROSS, fade.t);
        fade.s.scale.set(core.s.scale.x * (fade.e / edge));
        if (fade.t >= CROSS) {
          const old = live.get(core.s), tex = fade.s.texture as RenderTexture;
          live.delete(fade.s);
          [core.s.texture, core.s.scale.x, core.s.scale.y] = [tex, fade.s.scale.x, fade.s.scale.y];
          fade.s.destroy(); // keeps its texture: the core takes it over
          live.set(core.s, tex);
          old?.destroy(true);
          fades.delete(b);
        }
      } else if (budget > 0 && grown >= 1 && look(b) !== keys.get(b)) {
        const e = edge, tex = bake(b), s = new Sprite({ texture: tex, anchor: 0.5, alpha: 0 });
        s.scale.set(core.s.scale.x * (e / (edges.get(b) ?? EDGE)));
        b.view.addChildAt(s, b.view.getChildIndex(core.s) + 1);
        live.set(s, tex);
        fades.set(b, { s, t: 0, e });
        b.baked = b.m;
      } else if (budget > 0 && Math.abs(b.m - (b.baked ?? 0)) > REBAKE * b.m && b.parts.length === 1) {
        bake(b, core.s.texture as RenderTexture);
        b.baked = b.m;
      }
      // City lights: their own additive bake over the core (same seed and relief, so they sit on its coasts), re-baked
      // when the coverage step changes or the core was re-baked.
      const city = surfaces.get(b)?.city ?? 0, lt = lightMaps.get(b), lkey = `${city}|${b.baked}|${keys.get(b)}`;
      if (city > 0 && budget > 0 && grown >= 1 && !fades.has(b) && lt?.key !== lkey) {
        const tex = bake(b, undefined, city);
        if (lt) {
          const old = live.get(lt.s);
          [lt.s.texture, lt.key] = [tex, lkey];
          live.set(lt.s, tex);
          old?.destroy(true);
        } else {
          const s = new Sprite({ texture: tex, anchor: 0.5, blendMode: 'add', alpha: 0 });
          b.view.addChild(s);
          live.set(s, tex);
          lightMaps.set(b, { s, key: lkey });
        }
      }
      if (lt && !lt.s.destroyed) {
        [lt.s.visible, lt.s.position.x, lt.s.position.y] = [city > 0, 0, 0];
        lt.s.scale.copyFrom(core.s.scale);
      }
    },
    /** Bakes so far (dev checks: at most one a frame). */
    get bakes() {
      return count;
    },
  };
}

export type Spheres = ReturnType<typeof createSpheres>;
