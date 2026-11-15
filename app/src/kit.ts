// What main.ts hands every stage: one object, built once (the field getter follows each run's new field).
import type { Texture } from 'pixi.js';
import type { Controls } from './core/input';
import type { Fx } from './render/fx';
import type { Sfx } from './audio/sfx';
import type { createAsteroidField } from './evolution/asteroid/field';

export type Field = ReturnType<typeof createAsteroidField>;
export type Kit = {
  input: Controls; glow: Texture; fx: Fx; canvas: HTMLElement; sfx: Sfx;
  field: () => Field;
  view: Readonly<{ x: number; y: number; zoom: number }>; // the camera this frame
  area: Readonly<{ halfW: number; halfH: number }>; // the game area's half sizes (world units): your natural view
};
