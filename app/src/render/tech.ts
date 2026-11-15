import { Container, Graphics, Particle, Rectangle, RenderTexture, Texture, UniformGroup, type ParticleContainer, type Renderer } from 'pixi.js';
import { BAKE_FRAGMENT_HEAD, bakeMesh } from './bake';
import { ART_H, ART_W, ENGINES, SHIP_ART } from './shipArt';

// The tech page: one mipmapped 1024² texture baked once, so one ParticleContainer draws every ship, satellite and grain.
// Cells: fleet (baked in colour: tint white), stations, veil (shield shell), ripple (shield hit), ring (radio pulse),
// dot (satellites, grains, lights), hex (a shield lattice cell); all but the fleet are white art, coloured by tint.

const PAGE = 1024;
export const SHIP_PX = 28; // art px across a fleet cell: a fighter ≈ 14 long, a carrier ≈ 24 (classes to scale)
export const SHIP_SCALE = 0.4; // a fleet cell in radii of your world: ships are world-sized (every faction the same), not screen-sized
export const SHIP_MIN_PX = 8; // ...but a cell never shrinks under this many screen px when zoomed far out (a fighter ≥ 4 px)
/** World units per art px of a ship (and of what belongs to it: plumes, tracers, satellites) around a player world of radius R. */
export const shipUnit = (R: number, zoom: number) => Math.max(SHIP_SCALE * R, SHIP_MIN_PX / zoom) / SHIP_PX;
/** A ship's hit and touch radius in world units (raiders are 14 art px long): rounds, bodies and slugs read it. */
export const shipR = (R: number, zoom: number) => 6 * shipUnit(R, zoom);
const FLEET_W = 128; // a fleet cell, the art's 160 × 100 box scaled
const FLEET_H = (FLEET_W * ART_H) / ART_W;
const FLEET_Y = 512; // the fleet fills the page's lower half, 8 cells a row
const UNIT = 256; // the bake quad's size; smaller cells draw it scaled down (the shader reads vPos / 256)

const fragment = /* glsl */ `${BAKE_FRAGMENT_HEAD}
uniform vec4 uCell; // kind (0 station, 1 veil, 2 ripple, 3 ring, 4 dot, 5 hex), -, station seed, -

float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float hexDist(vec2 p) { p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.732))), p.x); }

void main() {
  vec2 p = vPos / ${UNIT}.0 * 2.0 - 1.0;
  float d = length(p);
  float kind = uCell.x;
  if (kind < 0.5) {
    // Station: a ring on a cross; filled mid-grey, bright outline and hub, so the tint reads at 8 px.
    float h1 = rnd(vec2(uCell.z, 3.0), 3.0);
    float sd = min(abs(d - 0.55 - 0.08 * h1) - 0.07, min(sdBox(p, vec2(0.72, 0.06)), sdBox(p, vec2(0.06, 0.72))));
    sd = min(sd, d - 0.16);
    float px = 2.0 / 64.0;
    float fill = smoothstep(px, -px, sd);
    float rim = smoothstep(px * 2.5, 0.0, abs(sd + px * 1.2));
    float v = fill * 0.62 + rim * 0.38 + exp(-d * d / 0.01) * 0.6;
    float a = clamp(max(fill, rim), 0.0, 1.0);
    finalColor = vec4(vec3(min(1.0, v)) * a, a);
    return;
  }
  if (kind < 1.5) {
    // Veil: mottled along the ring (it turns; sampled on a circle, so no seam at ±π), a soft rim, a faint inner fill.
    float ang = atan(p.y, p.x);
    float n = fbm(vec2(cos(ang), sin(ang)) * (0.9 + 1.8 * d) + vec2(fbm(p * 2.0, 3, 103.0) * 1.5, 0.0), 4, 101.0);
    float rim = exp(-pow((d - 0.86) / 0.08, 2.0));
    float inner = smoothstep(0.88, 0.2, d) * 0.22;
    float a = (rim + inner) * (0.35 + 1.1 * n) * smoothstep(1.0, 0.94, d);
    a = clamp(a, 0.0, 1.0);
    finalColor = vec4(vec3(a), a);
    return;
  }
  if (kind < 2.5) {
    // Ripple: a hex lattice in a patch that fades out from its centre.
    vec2 h = p * 5.0, r = vec2(1.0, 1.732), hh = r * 0.5;
    vec2 a1 = mod(h, r) - hh, b1 = mod(h - hh, r) - hh;
    vec2 gv = dot(a1, a1) < dot(b1, b1) ? a1 : b1;
    float edge = smoothstep(0.08, 0.0, 0.5 - hexDist(gv));
    float a = edge * exp(-d * d / 0.35) * smoothstep(1.0, 0.85, d) + 0.15 * exp(-d * d / 0.15);
    finalColor = vec4(vec3(a), a);
    return;
  }
  if (kind < 3.5) {
    // Ring: thin and soft, broken here and there.
    float ang = atan(p.y, p.x);
    float a = exp(-pow((d - 0.85) / 0.045, 2.0)) * (0.45 + 0.55 * smoothstep(0.3, 0.6, fbm(vec2(ang * 3.0, 0.0), 3, 107.0)));
    finalColor = vec4(vec3(a), a);
    return;
  }
  if (kind > 4.5) {
    // Hex: a lattice cell's bright outline (flat sides along x), a faint fill, a little dust; zero toward the cell's edge.
    float h = hexDist(p), u = (h - 0.70) / 0.07;
    float a = exp(-u * u) + 0.10 * smoothstep(0.72, 0.6, h);
    a *= (0.8 + 0.4 * fbm(p * 4.0, 3, 109.0)) * smoothstep(0.95, 0.85, h);
    a = clamp(a, 0.0, 1.0);
    finalColor = vec4(vec3(a), a);
    return;
  }
  float a = clamp(exp(-d * d / 0.09) * 0.7 + exp(-d * d / 0.012), 0.0, 1.0);
  finalColor = vec4(vec3(a), a);
}`;

type Art = typeof SHIP_ART;
/** Each faction's ships by class (render/shipArt.ts): one cell, baked in colour. */
export type Fleet = { [F in keyof Art]: Record<keyof Art[F], Texture> };
export type TechPage = { source: Texture; fleet: Fleet; stations: Texture[]; veil: Texture; ripple: Texture; ring: Texture; dot: Texture; hex: Texture };
let page: TechPage | undefined;

/** Bakes the page once (kept for the session; every run reuses it). ~25 draws into one texture. */
export function techPage(renderer: Renderer): TechPage {
  if (page) return page;
  const uniforms = new UniformGroup({ uCell: { value: new Float32Array(4), type: 'vec4<f32>' }, uSeed: { value: 13, type: 'f32' } });
  const mesh = bakeMesh(UNIT, fragment, uniforms), holder = new Container();
  holder.addChild(mesh);
  const rt = RenderTexture.create({ width: PAGE, height: PAGE, autoGenerateMipmaps: true });
  let first = true;
  const cell = (x: number, y: number, size: number, kind: number, seed = 0) => {
    (uniforms.uniforms.uCell as Float32Array).set([kind, 0, seed, 0]);
    uniforms.update();
    mesh.position.set(x, y);
    mesh.scale.set(size / UNIT);
    renderer.render({ container: holder, target: rt, clear: first });
    first = false;
    return new Texture({ source: rt.source, frame: new Rectangle(x, y, size, size) });
  };
  const stations = [0, 1, 2, 3].map((s) => cell(s * 64, 0, 64, 0, s + 1));
  const veil = cell(256, 0, 256, 1), ripple = cell(0, 256, 128, 2), ring = cell(128, 256, 128, 3), dot = cell(256, 256, 64, 4), hex = cell(320, 256, 64, 5);
  holder.destroy({ children: true });
  // The fleet: each ship's SVG as Pixi Graphics, drawn into its cell at one scale (so classes stay to scale).
  const art = new Container();
  let i = 0;
  const fleet = Object.fromEntries(Object.entries(SHIP_ART).map(([faction, classes]) => [faction, Object.fromEntries(Object.entries(classes).map(([cls, svg]) => {
    const x = (i % 8) * FLEET_W, y = FLEET_Y + Math.floor(i++ / 8) * FLEET_H, g = new Graphics().svg(`<svg>${svg}</svg>`);
    g.position.set(x, y);
    g.scale.set(FLEET_W / ART_W);
    art.addChild(g);
    return [cls, new Texture({ source: rt.source, frame: new Rectangle(x, y, FLEET_W, FLEET_H) })];
  }))])) as Fleet;
  renderer.render({ container: art, target: rt, clear: false });
  art.destroy({ children: true });
  rt.source.updateMipmaps();
  page = { source: new Texture({ source: rt.source }), fleet, stations, veil, ripple, ring, dot, hex };
  return page;
}

/** One quad this frame on a tech-page ParticleContainer: `size` world units across; `long` stretches it along `rot`. */
export type Put = (tex: Texture, x: number, y: number, rot: number, size: number, tint: number, alpha: number, long?: number) => void;

/** A ParticleContainer's quads, reused frame to frame: `begin`, then `put` each; `end` hides the rest. At most `max`. */
export function quads(pc: ParticleContainer, max: number) {
  const parts: Particle[] = [];
  let used = 0;
  const put: Put = (tex, x, y, rot, size, tint, alpha, long = 1) => {
    if (used >= max) return;
    let p = parts[used];
    if (!p) {
      p = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 });
      parts.push(p);
      pc.addParticle(p);
    }
    used++;
    [p.texture, p.x, p.y, p.rotation, p.tint, p.alpha] = [tex, x, y, rot, tint, alpha];
    p.scaleY = size / tex.frame.width;
    p.scaleX = p.scaleY * long;
  };
  return {
    put,
    begin: () => void (used = 0),
    end: () => {
      for (let i = used; i < parts.length; i++) parts[i].alpha = 0;
    },
  };
}

// Engine plumes (drawShip): an outer glow and a short white core per engine, stretched along the nose.
//   len, wide: × the base (nozzle × (3 + 9·burn) long, nozzle × 2.2 wide, art units); flick: ± share of the length per frame
export const YOU = 0x7fe8ff, VIOLET = 0xb48cff, AMBER = 0xffb46b; // you cyan, rivals violet, your rockets and missiles amber
export const STEEL = 0xe9f4ff; // your mass driver's slugs: steel white, never a laser's cyan
const PLUME = {
  you: { tint: YOU, core: 0xe8fbff, len: 1, wide: 1, alpha: 0.9, flick: 0.12 }, // steady cyan
  rival: { tint: VIOLET, core: 0xf1e6ff, len: 1.6, wide: 0.7, alpha: 0.55, flick: 0.06 }, // one long thin trail
  pirate: { tint: 0xff7a50, core: 0xffd9a0, len: 1, wide: 1, alpha: 0.9, flick: 0.3 }, // unequal sputtering flares
};

const BANK = [0.4, 0.5]; // at full bank the hull narrows this share across the nose (length kept), the outer plume grows this share

/**
 * A ship through `put`: its engine plumes (render/shipArt.ts ENGINES; `burn` 0–1 sets their length, below 0 none: docked
 * or digging), then the hull on top. `unit`: world units per art px (shipUnit); `bank`
 * −1…1 (flight.ts Craft.bank): turning, the hull narrows and the engine on the outside of the turn burns longer.
 */
export function drawShip<F extends keyof Fleet>(put: Put, page: TechPage, faction: F, cls: keyof Fleet[F], x: number, y: number, heading: number, unit: number, burn: number, alpha: number, bank = 0) {
  const k = (SHIP_PX * unit) / ART_W, c = Math.cos(heading), s = Math.sin(heading), p = PLUME[faction], b = Math.max(-1, Math.min(1, bank));
  if (burn >= 0) for (const [ex, ey, nz] of (ENGINES[faction] as Record<keyof Fleet[F], number[][]>)[cls]) {
    const outer = 1 + BANK[1] * Math.max(0, -Math.sign(ey - ART_H / 2) * b); // the engines outside the turn (bank > 0 turns toward the art's +y)
    const len = nz * (3 + 9 * Math.min(1, burn)) * outer * p.len * (1 + (2 * Math.random() - 1) * p.flick) * k, w = nz * 2.2 * p.wide * k;
    const ox = (ex - ART_W / 2) * k, oy = (ey - ART_H / 2) * (1 - BANK[0] * Math.abs(b)) * k, bx = x + ox * c - oy * s, by = y + ox * s + oy * c; // the nozzle
    put(page.dot, bx - c * len * 0.3, by - s * len * 0.3, heading, w, p.tint, alpha * p.alpha, len / w);
    put(page.dot, bx - c * len * 0.1, by - s * len * 0.1, heading, w * 0.45, p.core, alpha * p.alpha, (len * 0.35) / (w * 0.45));
  }
  const narrow = 1 - BANK[0] * Math.abs(b);
  put(page.fleet[faction][cls], x, y, heading, SHIP_PX * unit * narrow, 0xffffff, alpha, 1 / narrow);
}
