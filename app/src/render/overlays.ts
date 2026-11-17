import { Container, Rectangle, RenderTexture, Sprite, Texture, UniformGroup, type Renderer } from 'pixi.js';
import { clamp, smoothstep } from '../core/rng';
import { mixRgb, type Body } from '../evolution/asteroid/body';
import { airR, burnShare, MOLTEN, SPECK } from '../evolution/asteroid/rules';
import { setSurface } from '../evolution/asteroid/sphere';
import { LIFE_S } from '../evolution/planet/rules';
import type { WorldState } from '../evolution/planet/stage';
import { BAKE_FRAGMENT_HEAD, bakeMesh } from './bake';

// Your world's sky and surface, from the planet stage's WorldState: seas, frost, life and lava baked into your sphere
// (sphere.ts setSurface), plus live layers from one 512² atlas (atmosphere limb, steam deck, clouds, steam veil) that
// turn with the body. A hot world stays dark red, never a white disc that reads as a star.

const CELL = 256;
const R0 = 0.78; // disc radius as a share of a cell's half size (room for the limb's outer glow)
const EDGE = airR(1) / (1 + (1.3 * 0.11) / R0); // the edge layer's scale: its glow is still ~18% at airR, gone by ~1.46 R
const EASE = 0.5; // 1/s: how fast the live layers follow the climate
const CLOUD_S = 24; // s: one form-and-dissolve cycle of the two cloud fields
const BOOST_S = 3; // s: a milestone brightens its layer this long, fading (alpha only: no pulse)

const fragment = /* glsl */ `${BAKE_FRAGMENT_HEAD}
uniform float uCell; // 0 limb, 1 steam deck, 2 and 3 scattered clouds

void main() {
  vec2 p = vPos / ${CELL}.0 * 2.0 - 1.0;
  float d = length(p);
  vec3 L = normalize(vec3(-0.55, -0.6, 0.58)); // the sphere bake's light (sphere.ts)
  if (uCell < 0.5) {
    // Limb: faint over the disc, brightest at the rim, fading outward; brighter on the lit side (scattering).
    float a = d < ${R0} ? pow(d / ${R0}, 8.0) : exp(-pow((d - ${R0}) / 0.11, 2.0));
    float lit = 0.3 + 0.7 * smoothstep(-0.7, 0.9, dot(p / max(d, 1e-4), normalize(L.xy)));
    a *= lit;
    finalColor = vec4(vec3(a), a);
    return;
  }
  // Clouds on a sphere: noise in longitude / latitude, so they crowd and thin toward the limb.
  vec2 q = p / ${R0};
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));
  float disc = smoothstep(1.0, 0.985, length(q));
  vec2 ll = vec2(asin(clamp(q.x / max(sqrt(1.0 - q.y * q.y), 1e-3), -1.0, 1.0)), asin(clamp(q.y, -1.0, 1.0)));
  float c;
  if (uCell < 1.5) {
    // Steam deck: lumpy and banded, mostly closed, with rifts the surface (or its lava) shows through.
    c = smoothstep(0.36, 0.6, fbm(ll * vec2(1.6, 3.2) + vec2(0.0, 7.0), 5, 81.0));
  } else {
    // Weather: streaky bands with gaps.
    float salt = uCell < 2.5 ? 91.0 : 97.0;
    float w = fbm(ll * vec2(1.8, 3.6) + vec2(fbm(ll * 2.0, 3, salt + 3.0) * 1.5, fbm(ll * 2.6, 3, salt + 5.0) * 0.6), 5, salt);
    c = smoothstep(0.5, 0.68, w);
  }
  vec3 n = vec3(q, z);
  float shade = 0.12 + 0.88 * max((dot(n, L) + 0.2) / 1.2, 0.0);
  float a = c * disc * smoothstep(0.0, 0.18, z);
  finalColor = vec4(vec3(shade) * a, a);
}`;

type Frames = { limb: Texture; deck: Texture; clouds: [Texture, Texture] };
let atlas: Frames | undefined;

/** The four 256² cells on one 512² page, baked once (kept for the session: one per page, reused by every run). */
function bakeAtlas(renderer: Renderer): Frames {
  const uniforms = new UniformGroup({ uCell: { value: 0, type: 'f32' }, uSeed: { value: 7, type: 'f32' } });
  const mesh = bakeMesh(CELL, fragment, uniforms), holder = new Container();
  holder.addChild(mesh);
  const page = RenderTexture.create({ width: CELL * 2, height: CELL * 2 });
  for (let i = 0; i < 4; i++) {
    uniforms.uniforms.uCell = i;
    uniforms.update();
    mesh.position.set((i % 2) * CELL, Math.floor(i / 2) * CELL);
    renderer.render({ container: holder, target: page, clear: i === 0 });
  }
  holder.destroy({ children: true });
  const at = (i: number) => new Texture({ source: page.source, frame: new Rectangle((i % 2) * CELL, Math.floor(i / 2) * CELL, CELL, CELL) });
  return { limb: at(0), deck: at(1), clouds: [at(2), at(3)] };
}

export function createOverlays(layer: Container, renderer: Renderer) {
  const t = (atlas ??= bakeAtlas(renderer));
  const root = new Container();
  const cloudA = new Sprite({ texture: t.clouds[0], anchor: 0.5, alpha: 0, tint: 0xeef1f4 });
  const cloudB = new Sprite({ texture: t.clouds[1], anchor: 0.5, alpha: 0, tint: 0xeef1f4 });
  const deck = new Sprite({ texture: t.deck, anchor: 0.5, alpha: 0, tint: 0xbdb4a6 }); // murky cream-grey, not star-white
  const veil = new Sprite({ texture: t.limb, anchor: 0.5, alpha: 0, tint: 0x8f877c }); // steam haze past the rim, dim and murky (a bright halo would read as a star)
  const limb = new Sprite({ texture: t.limb, anchor: 0.5, alpha: 0, blendMode: 'add' });
  const edge = new Sprite({ texture: t.limb, anchor: 0.5, alpha: 0, blendMode: 'add' }); // the air's faint outer reach, out past airR (burn-ups happen in it)
  root.addChild(cloudA, cloudB, deck, veil, limb, edge); // one atlas: the four normal layers batch together, the two additive ones too
  layer.addChild(root);
  const shown = { clouds: 0, deck: 0, veil: 0, air: 0, edge: 0, lava: 0 };
  let phase = 0, boost = 0;

  return {
    /** A milestone just happened (planet stage news): its layer brightens for a moment. */
    milestone(key: string) {
      if (key === 'air') boost = BOOST_S;
    },
    /** Draws the climate snapshot on your body. */
    update(dt: number, b: Body, w: WorldState) {
      root.visible = b.m > 0 && b.view.visible;
      if (!root.visible) return;
      const steam = w.water === 'steam', liquid = w.water === 'liquid', p = w.pressure, habitable = w.lifeSpeed > 0;
      const lava = smoothstep(MOLTEN - 1, MOLTEN + 2, b.heat);
      // Into the bake: what the surface is doing now (sphere.ts quantises and crossfades).
      setSurface(b, {
        sea: steam || w.envelope ? 0 : w.seaCover,
        frozen: w.water === 'ice',
        frost: w.waterShare >= 0.01 && !w.envelope ? clamp((273 - w.kelvin) / 120, 0, 1) : 0,
        lava,
        life: habitable ? 2 + 5 * clamp(w.lifeProgress / LIFE_S, 0, 1) : 0, // greens in as life fills
        city: w.civ?.city ?? 0, // civilization: night lights (sphere.ts bakes them as their own layer)
      });

      const k = 1 - Math.exp(-EASE * dt), ease = (key: keyof typeof shown, goal: number) => (shown[key] += (goal - shown[key]) * k);
      ease('lava', lava);
      // Steam deck while the seas boil; lava shows through it, so a molten world reads dark red, not white.
      ease('deck', steam && w.vapor > 0.002 ? 0.8 * (1 - 0.6 * shown.lava) : w.envelope ? 0.85 : 0);
      ease('veil', steam ? Math.min(1, w.vapor / 0.01) * 0.3 : 0);
      // Weather over liquid seas with air; fuller on a habitable world; thin over frozen ones.
      ease('clouds', liquid && p > 0.1 ? (habitable ? 0.7 : 0.45) * Math.min(1, w.waterShare / 0.1) : w.water === 'ice' && p > 0.2 ? 0.2 : 0);
      // Limb: alpha 0.7·t, t = smoothstep(−2, 0.48, log10 p).
      ease('air', 0.7 * smoothstep(-2, 0.48, Math.log10(Math.max(p, 1e-3))));
      ease('edge', 4 * burnShare(p) > SPECK ? 0.12 + 0.3 * shown.air : 0); // any air that can burn a rock shows out to its edge
      boost = Math.max(0, boost - dt);

      root.position.copyFrom(b.view.position);
      root.rotation = b.view.rotation;
      const s = b.r / (R0 * (CELL / 2)); // disc → your radius
      phase += (dt / CLOUD_S) * Math.PI * 2;
      const wave = 0.5 + 0.5 * Math.sin(phase);
      cloudA.scale.set(s);
      cloudB.scale.set(s);
      cloudA.alpha = shown.clouds * wave;
      cloudB.alpha = shown.clouds * (1 - wave);
      cloudA.rotation = 0.06 * Math.sin(phase * 0.5); // a little drift; small, so their baked light side stays put
      cloudB.rotation = -0.06 * Math.sin(phase * 0.5 + 1);
      deck.scale.set(s * 1.01);
      deck.alpha = shown.deck;
      deck.tint = w.envelope ? 0xd8c9a4 : 0xbdb4a6; // a gas envelope is tan bands, a steam sky murky grey
      veil.scale.set(s * 1.12);
      veil.alpha = shown.veil;
      // Limb colour: blue air, yellow haze when thick, pale grey steam, tan gas envelope.
      const gas = w.gasShare;
      let col = mixRgb(0x6fb8ff, 0xffcf8a, clamp((p - 2) / 6, 0, 1), false);
      col = mixRgb(col, 0xc9ced8, Math.min(1, gas > 0 ? (2 * w.vapor) / gas : 0), false);
      col = mixRgb(col, 0xe9d9b0, clamp((gas - 0.15) / 0.15, 0, 1), false);
      col = mixRgb(col, 0xb8dc4a, 0.75 * (w.civ?.harm ?? 0), false); // radiation sickness: a sickly yellow-green limb
      limb.tint = col;
      limb.alpha = Math.min(1, shown.air * (steam ? 0.6 : 1) + 0.35 * (boost / BOOST_S) * (shown.air > 0.01 ? 1 : 0));
      limb.scale.set(s * (1 + 0.05 * Math.min(1, p / 3))); // thicker air reaches further out
      [edge.tint, edge.alpha] = [col, shown.edge];
      edge.scale.set(s * EDGE);
    },
    destroy() {
      root.destroy({ children: true }); // the atlas is shared and kept
    },
  };
}
