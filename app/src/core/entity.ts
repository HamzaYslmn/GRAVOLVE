import type { Container } from 'pixi.js';

// Every game object is the same three parts:
//   motion  - position and velocity, integrated with thrust and drag
//   control - where it wants to go: a vector of length <= 1 (player input, AI), see shapeThrust for braking
//   view    - what draws it (any Pixi container)
// New object types reuse these; only the control and the view differ.

export type Vec = { x: number; y: number };

export type Motion = Vec & {
  vx: number;
  vy: number;
  accel: number; // units/s² at full thrust
  drag: number; // 1/s; top speed settles at accel / drag, and it glides to a stop without thrust
};

export type Entity = {
  motion: Motion;
  control: () => Vec;
  view: Container;
  spin: number; // rad/s tumble (angular momentum only)
};

export function motion(x: number, y: number, accel: number, drag: number): Motion {
  return { x, y, vx: 0, vy: 0, accel, drag };
}

/**
 * Exact solution of dv/dt = thrust*accel - drag*v over the step, so the same input gives the
 * same path at 30 or 240 fps (a plain Euler step drifts several % in top speed between them).
 */
export function step(m: Motion, thrust: Vec, dt: number) {
  if (!m.drag) {
    // No drag (the player in space: momentum is kept, no top speed): constant thrust, exact too.
    const ax = thrust.x * m.accel, ay = thrust.y * m.accel;
    m.x += m.vx * dt + 0.5 * ax * dt * dt;
    m.y += m.vy * dt + 0.5 * ay * dt * dt;
    m.vx += ax * dt;
    m.vy += ay * dt;
    return;
  }
  const k = Math.exp(-m.drag * dt);
  const tx = (thrust.x * m.accel) / m.drag; // terminal velocity for this thrust
  const ty = (thrust.y * m.accel) / m.drag;
  const c = (1 - k) / m.drag;
  m.x += tx * dt + (m.vx - tx) * c;
  m.y += ty * dt + (m.vy - ty) * c;
  m.vx = tx + (m.vx - tx) * k;
  m.vy = ty + (m.vy - ty) * k;
}

export function updateEntity(e: Entity, dt: number) {
  step(e.motion, e.control(), dt);
  e.view.position.set(e.motion.x, e.motion.y);
  e.view.rotation += e.spin * dt; // spin is angular momentum only: moving fast must not spin you up
}

/**
 * Shapes a steering input for a body that coasts (low drag). Thrust along the motion fades out toward
 * `top` (a soft top speed: past it, pushing forward does nothing), thrust against the motion is
 * multiplied by `retro` (braking is easier than speeding up), and sideways thrust is untouched, so
 * turning stays crisp. The result can be longer than 1 when braking.
 */
export function shapeThrust(input: Vec, vx: number, vy: number, top: number, retro: number): Vec {
  const v = Math.hypot(vx, vy);
  if (!v) return input;
  const ux = vx / v, uy = vy / v, along = input.x * ux + input.y * uy;
  const k = along > 0 ? along * Math.max(0, 1 - (v / top) ** 2) : along * retro;
  return { x: input.x + (k - along) * ux, y: input.y + (k - along) * uy };
}

// Touch joystick: the stick sets the velocity you want, not raw thrust. Tilt t → speed top · t^STICK_CURVE along the stick
// (fine control near the centre, top speed at full tilt); the thrust closes the gap over STICK_TAU s, so it also brakes off
// sideways drift. Same thrust, still no drag: a finger held still at the centre brakes to a stop, a lifted finger coasts.
const STICK_CURVE = 2;
const STICK_TAU = 0.35;
/** Thrust (length ≤ 1) that steers velocity (vx, vy) toward the stick's wanted velocity. */
export function stickThrust(stick: Vec, vx: number, vy: number, top: number, accel: number): Vec {
  const t = Math.hypot(stick.x, stick.y), sp = t > 0 ? (top * t ** STICK_CURVE) / t : 0, k = accel * STICK_TAU;
  const ax = (stick.x * sp - vx) / k, ay = (stick.y * sp - vy) / k, a = Math.hypot(ax, ay);
  return a > 1 ? { x: ax / a, y: ay / a } : { x: ax, y: ay };
}
