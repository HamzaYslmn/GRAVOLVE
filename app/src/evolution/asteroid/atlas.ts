import { Matrix, Rectangle, RenderTexture, Sprite, Texture, UniformGroup, type Renderer } from 'pixi.js';
import { rng } from '../../core/rng';
import { BAKE_FRAGMENT_HEAD, bakeMesh } from '../../render/bake';
import { COMP, type Comp, type Element } from './rules';

// Procedural asteroids, baked once on the GPU into mipmapped atlas pages: 128 unique rocks, each a lit
// height field: metaball silhouette with bites and chipped facets, bumps and craters, and a material
// (rock, metal, water ice, gas). Every rock draws its own random recipe; the shape family follows the material (user:
// metal angular and silver, ice crystal shards, rock earthy potatoes and rubble, gas soft misty blobs).
// ponytail: lighting is baked, so it turns with the rock; spins are slow. Bake albedo + normals and
// light at runtime if that ever looks wrong.

// 256 px per rock, on two 2048² pages of 8×8 (WebGL2 only promises 2048).
const CELL = 256;
const COLS = 8;
const ROWS = 8; // per page
const PAGES = 2; // 128 rocks
const FIT = 0.86; // the rock's farthest point sits at this fraction of the cell half-width
const SPRITE_R = (CELL / 2) * FIT; // a rock sprite's radius at scale 1

const fragment = /* glsl */ `${BAKE_FRAGMENT_HEAD}
uniform vec4 uLobes[6];  // x, y, r, on
uniform vec4 uBites[3];  // x, y, r, on
uniform vec4 uCuts[8];   // nx, ny, d, on
uniform vec4 uXform;     // shape centre x, y, cell->shape scale, rotation
uniform vec2 uStretch;
uniform vec3 uAlbedo;
uniform vec3 uMottle;
uniform vec4 uSurf;      // roughness, crater count, crater size, young-crater chance
uniform vec4 uLook;      // strata, unused, mottle scale, edge wobble
uniform vec3 uKind;      // how metallic, icy and gassy the material is (0..1 each)
uniform float uCell;

vec2 toShape(vec2 uv) {
  vec2 w = uv * uXform.z + uXform.xy;
  float c = cos(uXform.w), s = sin(uXform.w);
  return vec2(c * w.x + s * w.y, -s * w.x + c * w.y) / uStretch;
}

// ~signed distance to the silhouette (shape units, > 0 inside).
float inside(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < 6; i++) {
    if (uLobes[i].w < 0.5) continue;
    vec2 d = p - uLobes[i].xy;
    float q = uLobes[i].z * uLobes[i].z / (dot(d, d) + 1e-4);
    f += q * q;
  }
  for (int i = 0; i < 3; i++) {
    if (uBites[i].w < 0.5) continue;
    float d = length(p - uBites[i].xy) / uBites[i].z;
    if (d < 1.0) f *= d * d * (3.0 - 2.0 * d);
  }
  float s = log(max(f, 1e-6)) * 0.25; // f ~ (r/d)^4, so this ~ (r - d) / r near the edge
  for (int i = 0; i < 8; i++) {
    if (uCuts[i].w < 0.5) continue;
    s = min(s, uCuts[i].z - dot(p, uCuts[i].xy));
  }
  return s;
}

void main() {
  vec2 uv = vPos / uCell * 2.0 - 1.0;
  vec2 p = toShape(uv);
  float pix = 2.0 * uXform.z / uCell; // one texel in shape units
  float metal = uKind.x, ice = uKind.y, gas = uKind.z;
  float rough = uSurf.x * (1.0 - 0.55 * metal - 0.45 * ice); // metal and ice are smoother than rock

  float s = inside(p) + (fbm(p * 2.6, 3, 5.0) - 0.5) * uLook.w;
  float alpha = smoothstep(-pix * (1.0 + 5.0 * gas), pix, s); // gassy bodies have a soft, fuzzy edge

  // Height field.
  float h = sqrt(clamp(s / 0.5, 0.0, 1.0)) * 0.55;          // rounded body, bevelled at chips
  h += (fbm(p * 2.8, 4, 11.0) - 0.5) * 0.28 * rough;         // large bumps
  h += (fbm(p * 11.0, 3, 21.0) - 0.5) * 0.045 * rough;       // fine grain
  float cavity = 0.0, young = 0.0;
  for (int i = 0; i < 14; i++) {
    if (float(i) >= uSurf.y) break;
    vec2 c = vec2(rnd(vec2(i, 1), 40.0), rnd(vec2(i, 2), 41.0)) * 1.7 - 0.85;
    float r = uSurf.z * (0.25 + 0.75 * pow(rnd(vec2(i, 3), 42.0), 1.5));
    float d = length(p - c) / r;
    if (d < 1.0) {
      h -= (1.0 - d * d) * 0.32 * r;
      cavity = max(cavity, 1.0 - d);
    }
    h += exp(-pow((d - 1.0) / 0.2, 2.0)) * 0.1 * r;           // raised rim
    if (rnd(vec2(i, 4), 43.0) < uSurf.w) {                    // young crater: bright floor and rays
      float ang = atan(p.y - c.y, p.x - c.x);
      float rays = pow(vnoise(vec2(ang * 3.5, float(i)), 44.0), 3.0) * exp(-max(d - 1.0, 0.0) * 1.6);
      young = max(young, max(1.0 - d, 0.0) * 0.6 + rays * step(1.0, d) * 0.8);
    }
  }

  // Normal from the height field; light from the upper left, slightly toward the viewer.
  vec3 n = normalize(vec3(-dFdx(h) / pix, -dFdy(h) / pix, 1.0));
  vec3 L = normalize(vec3(-0.55, -0.6, 0.58));
  float ndl = dot(n, L);
  float diffuse = max((ndl + 0.2) / 1.2, 0.0); // slightly wrapped: soft terminator

  // Albedo.
  float m = fbm(p * uLook.z, 4, 31.0);
  vec3 albedo = mix(uAlbedo, uMottle, smoothstep(0.35, 0.7, m));
  float bands = sin((p.y * 7.0 + fbm(p * 1.5, 3, 33.0) * 6.0)) * 0.5 + 0.5;
  albedo *= 1.0 - uLook.x * 0.22 * bands;                     // strata on some rocks
  albedo *= 1.0 - cavity * 0.35;                              // crater floors collect dark regolith
  albedo = mix(albedo, albedo * 1.7 + 0.06, young * 0.5);     // fresh, unweathered material

  albedo *= 1.0 + metal * 0.12 * (sin(p.x * 46.0 + fbm(p * 3.0, 2, 63.0) * 9.0) * 0.5 - 0.25); // brushed streaks on metal
  vec3 col = albedo * (0.1 + 1.05 * diffuse) * (1.0 - 0.35 * metal);         // metals reflect more than they scatter
  col += albedo * 0.08 * (1.0 - diffuse);                                      // bounce light
  vec3 R = reflect(-L, n);
  float fres = pow(1.0 - max(n.z, 0.0), 2.5);

  // Metal: chrome-like. A fake sky with a sharp horizon gives a banded reflection that reads as metal, not ice.
  vec3 sky = mix(vec3(0.04, 0.05, 0.07), vec3(0.95, 0.98, 1.05), smoothstep(-0.12, 0.22, -n.y - n.x * 0.4 + (fbm(p * 1.2, 2, 61.0) - 0.5) * 0.3));
  col += metal * (albedo * sky * (1.0 + 1.0 * fres) + pow(max(R.z, 0.0), 40.0) * 1.6 + pow(max(R.z, 0.0), 8.0) * 0.35 * albedo
        + fres * vec3(0.55, 0.62, 0.75) * 0.35);                               // silver: cool sky, a hot glint, a bright rim

  // Ice: cyan light scattered inside, blue-dark fracture veins, a crisp white glint and frost sparkles.
  float vein = smoothstep(0.03, 0.0, abs(fbm(p * 3.2, 3, 51.0) - 0.5));
  col = mix(col, col * vec3(0.55, 0.75, 1.0), ice * vein * 0.6);
  col += ice * vec3(0.12, 0.4, 0.7) * (0.35 + 0.65 * (1.0 - diffuse)) * 0.45;
  col += ice * vec3(0.25, 0.6, 0.95) * fres * 0.55;                              // light glowing through the thin edges
  vec2 fc = p * 60.0;                                                            // frost sparkles: round dots
  float frost = step(0.985, rnd(floor(fc), 52.0)) * smoothstep(0.45, 0.15, length(fract(fc) - 0.5));
  col += ice * (pow(max(R.z, 0.0), 40.0) * 1.2 + frost * diffuse * 0.7);

  // Gas: pale frosted volatiles in a wide mist (fbm-broken, so it reads as vapour, not a ring).
  col = mix(col, col * 0.7 + vec3(0.2, 0.18, 0.12), gas * 0.4);
  float haze = gas * 0.5 * exp(-max(-s, 0.0) * 3.5) * (0.6 + 0.8 * fbm(p * 3.0, 3, 71.0)) * (1.0 - alpha) * smoothstep(1.0, 0.75, length(uv)); // gone before the cell edge

  col += vec3(0.42, 0.55, 0.75) * fres * (0.35 + 0.4 * ice) * (1.0 - 0.7 * metal) * max(-ndl + 0.3, 0.0); // cool rim (not on metal)

  vec3 glow = vec3(0.95, 0.9, 0.78) * haze;
  finalColor = vec4(col * alpha + glow, alpha + haze);
}`;

// Asteroid materials: [albedo, mottle, kind (metal, ice, gas), composition]. Equal odds per entry:
// half rock, a fifth metal, a fifth water ice, a tenth gas-rich.
const MATERIALS: [number[], number[], number[], Comp][] = [
  [[0.27, 0.2, 0.15], [0.36, 0.27, 0.2], [0, 0, 0], COMP.darkRock], // rock: dark basalt brown
  [[0.44, 0.31, 0.2], [0.55, 0.4, 0.27], [0, 0, 0], COMP.stony], // rock: umber
  [[0.52, 0.3, 0.19], [0.63, 0.39, 0.25], [0, 0, 0], COMP.stony], // rock: rusty red-brown (Mars)
  [[0.6, 0.47, 0.3], [0.7, 0.57, 0.38], [0, 0, 0], COMP.stony], // rock: ochre sand
  [[0.5, 0.45, 0.33], [0.6, 0.54, 0.41], [0.05, 0, 0], COMP.enstatite], // rock: khaki clay
  [[0.78, 0.8, 0.84], [0.9, 0.92, 0.95], [1, 0, 0], COMP.metallic], // metal: polished silver
  [[0.6, 0.64, 0.7], [0.74, 0.78, 0.84], [1, 0, 0], COMP.ironRich], // metal: brushed steel
  [[0.36, 0.6, 0.88], [0.7, 0.87, 1.0], [0, 1, 0], COMP.icy], // water: clear blue ice
  [[0.38, 0.52, 0.66], [0.62, 0.76, 0.88], [0, 0.75, 0], COMP.hydrated], // water: dirty ice
  [[0.72, 0.66, 0.52], [0.86, 0.8, 0.64], [0, 0.3, 1], COMP.gasRich], // gas: frosted volatiles
];

type Rnd = () => number;
type Shape = { lobes: number[][]; bites: number[][]; cuts: number[][]; stretch: [number, number]; rot: number };

/** A random silhouette recipe for a material kind: lobes fused by metaballs, dents, and flat cut facets. */
function shape(rnd: Rnd, mat: Element): Shape {
  const facet = (n: number, d: number[]) => Array.from({ length: n }, (_, i) => {
    const a = ((i + 0.3 * rnd()) / n) * Math.PI * 2; // spread round the body: a low-poly outline
    return [Math.cos(a), Math.sin(a), d[0] + rnd() * (d[1] - d[0])];
  });
  if (mat === 'metal') { // an angular chunk: one or two lobes cut into a 5–8-sided polyhedron
    const lobes = rnd() < 0.6 ? [[0, 0, 1]] : [[-0.25, 0, 0.85], [0.3, 0.1, 0.7]];
    const e = 1 + rnd() * 0.5;
    return { lobes, bites: [], cuts: facet(5 + Math.floor(rnd() * 4), [0.5, 0.72]), stretch: [e, 1 / Math.sqrt(e)], rot: rnd() * Math.PI };
  }
  if (mat === 'ice') { // a crystal shard: long and narrow, cut into facets with a point
    const e = 1.5 + rnd() * 0.9;
    return { lobes: [[0, 0, 1]], bites: [], cuts: facet(4 + Math.floor(rnd() * 3), [0.42, 0.62]), stretch: [e, 1 / Math.sqrt(e)], rot: rnd() * Math.PI };
  }
  if (mat === 'gas') { // a soft, round blob (its mist does the rest)
    const lobes = [[0, 0, 1], ...Array.from({ length: Math.floor(rnd() * 3) }, () => { const a = rnd() * Math.PI * 2; return [Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.5 + rnd() * 0.2]; })];
    return { lobes, bites: [], cuts: [], stretch: [1 + rnd() * 0.25, 1], rot: rnd() * Math.PI };
  }
  const lobes: number[][] = [];
  const kind = rnd();
  if (kind < 0.25) lobes.push([0, 0, 1]); // single body
  else if (kind < 0.5) {
    const a = rnd() * Math.PI * 2, d = 0.4 + rnd() * 0.4; // contact binary / peanut / egg
    lobes.push([-Math.cos(a) * d * 0.5, -Math.sin(a) * d * 0.5, 0.8], [Math.cos(a) * d * 0.6, Math.sin(a) * d * 0.6, 0.5 + rnd() * 0.3]);
  } else {
    const n = 3 + Math.floor(rnd() * 4); // rubble pile
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 0.6;
      lobes.push([Math.cos(a) * d, Math.sin(a) * d, 0.35 + rnd() * 0.35]);
    }
  }
  const bites = Array.from({ length: Math.floor(rnd() * 3) }, () => {
    const a = rnd() * Math.PI * 2;
    return [Math.cos(a) * (0.75 + rnd() * 0.3), Math.sin(a) * (0.75 + rnd() * 0.3), 0.25 + rnd() * 0.3];
  });
  const cuts = Array.from({ length: Math.floor(rnd() * 5) }, () => {
    const a = rnd() * Math.PI * 2;
    return [Math.cos(a), Math.sin(a), 0.45 + rnd() * 0.35]; // flat facet at distance d from the centre
  });
  const e = 1 + rnd() ** 1.5 * 0.7;
  return { lobes, bites, cuts, stretch: [e, 1 / Math.sqrt(e)], rot: rnd() * Math.PI };
}

/** Same silhouette test as the shader (without edge noise), in the shape's own space. */
function insideJS(x: number, y: number, s: Shape) {
  let f = 0;
  for (const [lx, ly, r] of s.lobes) {
    const q = (r * r) / ((x - lx) ** 2 + (y - ly) ** 2 + 1e-4);
    f += q * q;
  }
  for (const [bx, by, r] of s.bites) {
    const d = Math.hypot(x - bx, y - by) / r;
    if (d < 1) f *= d * d * (3 - 2 * d);
  }
  let dist = Math.log(Math.max(f, 1e-6)) * 0.25;
  for (const [nx, ny, d] of s.cuts) dist = Math.min(dist, d - (x * nx + y * ny));
  return dist;
}

/** Centre and scale that fit the stretched, rotated silhouette into the cell. */
function fit(s: Shape) {
  const c = Math.cos(s.rot), si = Math.sin(s.rot);
  const pts: [number, number][] = [];
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    let lo = 0, hi = 4;
    for (let k = 0; k < 20; k++) {
      const m = (lo + hi) / 2, wx = Math.cos(t) * m, wy = Math.sin(t) * m;
      // world -> shape space, as in the shader's toShape()
      const px = (c * wx + si * wy) / s.stretch[0], py = (-si * wx + c * wy) / s.stretch[1];
      insideJS(px, py, s) > 0 ? (lo = m) : (hi = m);
    }
    pts.push([Math.cos(t) * lo, Math.sin(t) * lo]);
  }
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const far = Math.max(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  return { cx, cy, scale: far / FIT };
}

/** `kind`: which of the four element looks a rock was baked with; the field spawns kinds by region. */
export type Rock = { texture: Texture; comp: Comp; kind: Element };
const kindOf = ([metal, ice, gas]: number[]): Element => (gas >= 0.5 ? 'gas' : ice >= 0.5 ? 'ice' : metal >= 0.5 ? 'metal' : 'rock');

/** Bakes 128 unique rocks into two mipmapped pages. Returns each rock's sub-texture and composition. */
export function rockAtlas(renderer: Renderer, seed: number): Rock[] {
  const rnd = rng(seed);
  const uniforms = new UniformGroup({
    uLobes: { value: new Float32Array(24), type: 'vec4<f32>', size: 6 },
    uBites: { value: new Float32Array(12), type: 'vec4<f32>', size: 3 },
    uCuts: { value: new Float32Array(32), type: 'vec4<f32>', size: 8 },
    uXform: { value: new Float32Array(4), type: 'vec4<f32>' },
    uStretch: { value: new Float32Array(2), type: 'vec2<f32>' },
    uAlbedo: { value: new Float32Array(3), type: 'vec3<f32>' },
    uMottle: { value: new Float32Array(3), type: 'vec3<f32>' },
    uSurf: { value: new Float32Array(4), type: 'vec4<f32>' },
    uLook: { value: new Float32Array(4), type: 'vec4<f32>' },
    uKind: { value: new Float32Array(3), type: 'vec3<f32>' },
    uCell: { value: CELL, type: 'f32' },
    uSeed: { value: 1, type: 'f32' },
  });
  const u = uniforms.uniforms as Record<string, Float32Array | number>;
  const mesh = bakeMesh(CELL, fragment, uniforms);
  const pages = Array.from({ length: PAGES }, () => RenderTexture.create({ width: COLS * CELL, height: ROWS * CELL, autoGenerateMipmaps: true }));
  const per = COLS * ROWS;
  const frame = (i: number) => new Rectangle(((i % per) % COLS) * CELL, Math.floor((i % per) / COLS) * CELL, CELL, CELL);
  const put = (arr: Float32Array, rows: number[][], stride = 4) => {
    arr.fill(0);
    rows.forEach((row, i) => {
      row.forEach((v, j) => (arr[i * stride + j] = v));
      arr[i * stride + 3] = 1; // "on" flag
    });
  };

  const looks: { comp: Comp; kind: Element }[] = [];
  for (let i = 0; i < PAGES * per; i++) {
    const [albedo, mottle, kind, comp] = MATERIALS[Math.floor(rnd() * MATERIALS.length)];
    const s = shape(rnd, kindOf(kind));
    const { cx, cy, scale } = fit(s);
    put(u.uLobes as Float32Array, s.lobes);
    put(u.uBites as Float32Array, s.bites);
    put(u.uCuts as Float32Array, s.cuts);
    (u.uXform as Float32Array).set([cx, cy, scale, s.rot]);
    (u.uStretch as Float32Array).set(s.stretch);
    looks.push({ comp, kind: kindOf(kind) });
    const shade = 0.85 + rnd() * 0.3; // brightness spread within a material
    (u.uAlbedo as Float32Array).set(albedo.map((v) => v * shade));
    (u.uMottle as Float32Array).set(mottle.map((v) => v * shade));
    (u.uSurf as Float32Array).set([0.4 + rnd() * 0.8, Math.floor(rnd() ** 0.8 * 14), 0.12 + rnd() * 0.22, rnd() * 0.35]);
    (u.uLook as Float32Array).set([rnd() < 0.3 ? 0.5 + rnd() * 0.5 : 0, 0, 1.5 + rnd() * 3, 0.03 + rnd() * 0.08]);
    (u.uKind as Float32Array).set(kind);
    u.uSeed = 1 + i * 7919 + Math.floor(rnd() * 1e5);
    uniforms.update();
    renderer.render({
      container: mesh,
      target: pages[Math.floor(i / per)],
      clear: i % per === 0,
      transform: new Matrix().translate(frame(i).x, frame(i).y),
    });
  }
  for (const p of pages) p.source.updateMipmaps(); // small rocks are drawn far below cell size and would shimmer
  mesh.destroy();
  return looks.map(({ comp, kind }, i) => ({
    texture: new Texture({ source: pages[Math.floor(i / per)].source, frame: frame(i) }),
    comp,
    kind,
  }));
}

/** A rock sprite whose farthest point is `radius` world units from its centre. */
export function rockView(texture: Texture, radius: number) {
  const s = new Sprite({ texture, anchor: 0.5 });
  s.scale.set(radius / SPRITE_R);
  return s;
}
