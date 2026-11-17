import { Geometry, Mesh, Shader, type UniformGroup } from 'pixi.js';

// One-time GPU bakes (background chunks, rock atlas, spheres, overlays, the tech page, star looks): a quad whose fragment shader fills a texture.
// ES 3.0 for integer math (Pixi treats shaders without #version as WebGL1 GLSL).
// highp: mediump breaks the hash on mobile GPUs, and bakes only run once per chunk/atlas.

/** A size x size quad drawing `fragment` (which must start with BAKE_FRAGMENT_HEAD); vPos = pixel position. */
export function bakeMesh(size: number, fragment: string, uniforms: UniformGroup) {
  return new Mesh({
    geometry: new Geometry({
      attributes: { aPosition: [0, 0, size, 0, size, size, 0, size] },
      indexBuffer: [0, 1, 2, 0, 2, 3],
    }),
    shader: Shader.from({ gl: { vertex: BAKE_VERTEX, fragment }, resources: { uniforms } }),
  });
}

const BAKE_VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec2 vPos;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPos = aPosition;
}`;

/** Fragment header: version, output, uSeed, vPos, and seeded hash/noise/fbm. */
export const BAKE_FRAGMENT_HEAD = /* glsl */ `#version 300 es
precision highp float;
out vec4 finalColor;
uniform float uSeed;
in vec2 vPos;

// Integer hash (pcg2d): exact for any lattice coordinate, unlike sin/fract hashes.
float rnd(vec2 c, float salt) {
  uvec2 v = uvec2(ivec2(floor(c))) + uvec2(uint(uSeed), uint(salt) * 747796405u);
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return float(v.x) * (1.0 / 4294967296.0);
}
float vnoise(vec2 p, float salt) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rnd(i, salt), rnd(i + vec2(1, 0), salt), u.x),
             mix(rnd(i + vec2(0, 1), salt), rnd(i + vec2(1, 1), salt), u.x), u.y);
}
// Normalised fbm. Spread: p25 ~0.39, p50 ~0.5, p75 ~0.6, p95 ~0.72.
float fbm(vec2 p, int octaves, float salt) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int k = 0; k < 6; k++) {
    if (k >= octaves) break;
    s += a * vnoise(p, salt + float(k)); n += a;
    p = p * 2.03 + 17.1; a *= 0.5;
  }
  return s / n;
}
`;
