// Run: node test/asteroid/sphere.test.ts. Sphere bakes (sphere.ts) headless, on a stub GL: the baked disc sits above the glows
// and halos behind a body (they stay behind it, the rival halo keeps the first slot it is sized by), and a sphere stored
// without its texture and chipped below ROUND_M is baked again when it comes back, never left invisible but solid.
import assert from 'node:assert/strict';
import { tsResolve } from '../helpers.ts';

tsResolve();
const { DOMAdapter, Sprite, Texture } = await import('pixi.js');
const gl = new Proxy({}, { get: (_t, k) => (k === 'getShaderPrecisionFormat' ? () => ({ precision: 23 }) : typeof k === 'string' && k === k.toUpperCase() ? 1 : () => null) });
DOMAdapter.set({ ...DOMAdapter.get(), createCanvas: () => ({ getContext: () => gl, width: 1, height: 1 }) as never });
const { createSpheres } = await import('../../src/evolution/asteroid/sphere.ts');
const { rockBody, shed } = await import('../../src/evolution/asteroid/body.ts');
const { makeRival } = await import('../../src/evolution/asteroid/rival.ts');
const { COMP, ROUND_M, radiusOf } = await import('../../src/evolution/asteroid/rules.ts');

const spheres = createSpheres({ render() {} } as never);
const big = () => Object.assign(rockBody({ texture: Texture.EMPTY, comp: COMP.radioactive }, radiusOf(2 * ROUND_M, COMP.radioactive), 0, 0), { diff: 0.5 });
const tick = (b: ReturnType<typeof big>) => (spheres.begin(), spheres.update(b, 1 / 30));
const core = (b: ReturnType<typeof big>) => b.parts.find((p) => p.core)?.s;

// A green rock's glow (field.ts glowBehind) stays under the disc.
const rock = big(), glow = new Sprite(Texture.EMPTY);
rock.view.addChildAt(glow, 0);
tick(rock);
assert.ok(core(rock) && rock.view.getChildIndex(glow) < rock.view.getChildIndex(core(rock)!), 'the glow sits under the baked disc');

// A rival world's halo stays its first child (rival.ts sizeHalo grows it there), under the disc.
const world = makeRival(big(), Texture.EMPTY, 0), halo = world.view.children[0];
tick(world);
assert.ok(core(world) && world.view.children[0] === halo, 'the halo keeps its slot under the disc');

// Stored (field.ts store frees the core), chipped below ROUND_M, loaded again: it bakes a new disc.
const chip = big();
tick(chip);
core(chip)!.destroy();
chip.parts = [];
shed(chip, chip.m - 0.5 * ROUND_M);
tick(chip);
assert.ok(core(chip), 'a sphere back from storage under ROUND_M is drawn again');
console.log('sphere: glow and halo under the disc, a stored sphere re-baked');
