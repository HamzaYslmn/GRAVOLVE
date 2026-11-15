import './input.css';
import type { Vec } from './entity';

// Player input: a direction vector (length <= 1) from the keyboard (WASD / arrows) or an on-screen
// touch joystick that appears where the finger lands, plus two verbs:
//   Fire    - left mouse at the cursor, Space at the HUD target, a tap or a quick tap of a second finger on touch;
//   Command - right mouse on a body, E (at the cursor), a long press (LONG_S) on touch. A short Command is a tap
//             (`command()`, sent on release); kept down past HOLD_S it is a hold (`hold()`), e.g. absorbing a moon.
// Two fingers moving apart or together zoom (a pinch, sent to the camera as a wheel event); steering pauses, you coast.
// Points are kept in screen pixels and turned into world points when read (`toWorld`, from the camera), so a still
// cursor keeps aiming at what is under it while the camera moves. Verbs wait at most STALE_S for a reader.

const KEYS: Record<string, Vec> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};
const JOY_RADIUS = 56; // px the knob can travel; full thrust at the edge
const DEADZONE = 0.12; // share of the stick's reach that does nothing
const JOY_SHOW_S = 0.12; // the joystick base shows only after this, or once the finger moves past the deadzone: taps don't flash it
const TAP_S = 0.25; // a touch shorter than this that never left the deadzone is a tap (Fire)
const LONG_S = 0.5; // a touch held still this long is a Command
const HOLD_S = 0.4; // a Command kept down this long is a hold
const STALE_S = 0.3; // an unread verb is dropped after this
const PINCH_PX = 8; // a second finger that travels this far while the finger gap changes this much starts a pinch

type Pt = { x: number; y: number }; // screen px relative to the canvas
/** A verb's target: a world point, or 'target' (Space: the HUD target) / 'cursor' (E with no point under it). */
export type Aim = Vec | 'target' | 'cursor';
/** A steering direction; `stick`: it comes from the touch joystick (the player turns it into a wanted velocity). */
export type Axis = Vec & { stick?: boolean };
export type Controls = ReturnType<typeof createInput>;

export function createInput(surface: HTMLElement, toWorld: (sx: number, sy: number) => Vec) {
  const held = new Set<string>();
  const isField = (t: EventTarget | null) => t instanceof HTMLSelectElement || t instanceof HTMLInputElement;
  const now = () => performance.now() / 1000;
  const local = (e: PointerEvent): Pt => {
    const r = surface.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  let cursor: Pt | null = null; // mouse over the canvas
  let lastKind: 'mouse' | 'touch' = 'mouse';
  let fire: { at: Pt | 'target'; t: number } | null = null;
  let tap: { at: Pt | 'cursor'; t: number } | null = null;
  let press: { at: Pt | 'cursor'; t: number; by: string } | null = null; // a Command being held down
  const world = (at: Pt | 'target' | 'cursor'): Aim => (typeof at === 'string' ? at : toWorld(at.x, at.y));
  const commandDown = (at: Pt | 'cursor', by: string) => (press = { at, t: now(), by });
  const commandUp = (by: string) => {
    if (press?.by !== by) return;
    if (now() - press.t < HOLD_S) tap = { at: press.at, t: now() };
    press = null;
  };

  window.addEventListener('keydown', (e) => {
    if (isField(e.target)) return; // don't steal arrows from the settings select
    if (e.code === 'Space' && !e.repeat) fire = { at: 'target', t: now() };
    else if (e.code === 'KeyE' && !e.repeat) commandDown('cursor', 'key'); // E: the moon nearest the cursor, wherever it is
    if (!(e.code in KEYS)) return;
    held.add(e.code);
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
    if (e.code === 'KeyE') commandUp('key');
  });
  window.addEventListener('blur', () => [held.clear(), (press = null)]); // no stuck keys after alt-tab

  // Mouse: left = Fire at the cursor, right = Command on what is under it (no context menu over the game).
  surface.addEventListener('contextmenu', (e) => e.preventDefault());
  surface.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    [cursor, lastKind] = [local(e), 'mouse'];
    // A button pressed or let go while another is held comes as a move (chorded buttons), never as a pointerdown or up.
    if (e.button === 0 && e.buttons & 1) fire = { at: cursor, t: now() };
    else if (e.button === 2) void (e.buttons & 2 ? commandDown(cursor, 'mouse') : commandUp('mouse'));
  });
  surface.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && (cursor = null));

  // Touch joystick: base appears under the finger (after JOY_SHOW_S or past the deadzone), knob follows within JOY_RADIUS.
  const base = document.createElement('div');
  base.id = 'joystick';
  base.hidden = true;
  base.innerHTML = '<div id="joystick-knob"></div>';
  document.body.appendChild(base);
  const knob = base.firstElementChild as HTMLDivElement;
  let touch: { id: number; ox: number; oy: number; x: number; y: number; at: Pt; t: number; moved: boolean; cmd: boolean } | null = null;
  let second: { id: number; ox: number; oy: number; x: number; y: number; at: Pt; t: number; moved: boolean; d: number } | null = null; // quick tap: Fire; a drag: pinch
  let pinch = false; // latched until every finger lifts: no steering, no tap, no long press
  const gap = () => Math.max(1, Math.hypot(second!.x - touch!.x, second!.y - touch!.y));
  const joy: Vec = { x: 0, y: 0 };

  surface.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      [cursor, lastKind] = [local(e), 'mouse'];
      if (e.button === 0) fire = { at: cursor, t: now() };
      else if (e.button === 2) commandDown(cursor, 'mouse');
      return;
    }
    if (e.pointerType !== 'touch') return;
    lastKind = 'touch';
    if (touch) {
      // A second finger: fires on a quick release, or pinches (a third finger is ignored).
      if (!second) (second = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, at: local(e), t: now(), moved: false, d: 0 }), (second.d = gap());
      return;
    }
    const t = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, at: local(e), t: now(), moved: false, cmd: false };
    touch = t;
    if (second) second.d = gap(); // a finger landing again while the other pinch finger stays down
    base.style.left = `${e.clientX}px`;
    base.style.top = `${e.clientY}px`;
    knob.style.transform = '';
    setTimeout(() => touch === t && !t.cmd && !pinch && (base.hidden = false), JOY_SHOW_S * 1000);
    setTimeout(() => {
      if (touch !== t || t.moved || second || pinch) return; // long press, still: a Command at that point (the joystick steps aside)
      t.cmd = true;
      base.hidden = true;
      joy.x = joy.y = 0;
      commandDown(t.at, 'touch');
    }, LONG_S * 1000);
  });
  surface.addEventListener('pointermove', (e) => {
    if (e.pointerId === second?.id) [second.x, second.y] = [e.clientX, e.clientY];
    else if (e.pointerId === touch?.id) [touch.x, touch.y] = [e.clientX, e.clientY];
    else return;
    if (touch && second && !touch.cmd) {
      const d = gap();
      if (Math.hypot(second.x - second.ox, second.y - second.oy) > PINCH_PX) second.moved = true;
      // Both the second finger's own travel and the gap change: a steering thumb alone never pinches.
      if (!pinch && second.moved && Math.abs(d - second.d) > PINCH_PX) {
        pinch = true;
        second.d = d;
        joy.x = joy.y = 0;
        base.hidden = true; // steering steps aside: you coast
      }
      if (pinch) {
        // ponytail: the camera zooms on wheel events (camera.ts: wheel *= exp(-deltaY * 0.001)), so a pinch is sent as one; a camera.zoomBy(f) is the upgrade.
        surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000 * Math.log(d / second.d), cancelable: true }));
        second.d = d;
      }
    }
    if (pinch || e.pointerId !== touch?.id || touch.cmd) return;
    let dx = e.clientX - touch.ox, dy = e.clientY - touch.oy;
    const len = Math.hypot(dx, dy);
    if (len > DEADZONE * JOY_RADIUS) (touch.moved = true), (base.hidden = false);
    if (len > JOY_RADIUS) (dx *= JOY_RADIUS / len), (dy *= JOY_RADIUS / len);
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Deadzone, rescaled so full tilt is still 1: a resting thumb must not steer (you glide for ages).
    const t = Math.hypot(dx, dy) / JOY_RADIUS, k = t < DEADZONE ? 0 : (t - DEADZONE) / (1 - DEADZONE) / (t || 1);
    joy.x = (dx / JOY_RADIUS) * k;
    joy.y = (dy / JOY_RADIUS) * k;
  });
  const end = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return; // the right button's release is heard on the window (it may leave the canvas)
    if (e.pointerId === second?.id) {
      if (e.type === 'pointerup' && !pinch && !second.moved && now() - second.t < TAP_S) fire = { at: second.at, t: now() }; // a quick second finger fires there
      second = null;
    } else if (e.pointerId === touch?.id) {
      if (touch.cmd) commandUp('touch');
      else if (!pinch && !touch.moved && now() - touch.t < TAP_S) fire = { at: touch.at, t: now() }; // a quick tap fires there
      touch = null;
      joy.x = joy.y = 0;
      base.hidden = true;
    }
    if (!touch && !second) pinch = false;
  };
  surface.addEventListener('pointerup', end);
  window.addEventListener('pointerup', (e) => e.pointerType === 'mouse' && e.button === 2 && commandUp('mouse'));
  surface.addEventListener('pointercancel', end);

  const out: Axis = { x: 0, y: 0, stick: false };
  const fresh = <T extends { t: number }>(v: T | null) => (v && now() - v.t < STALE_S ? v : null);
  return {
    /** Current direction, length <= 1 (diagonals aren't faster); `stick` while a finger steers and no key is held. */
    axis(): Axis {
      let x = joy.x, y = joy.y;
      for (const code of held) (x += KEYS[code].x), (y += KEYS[code].y);
      const len = Math.hypot(x, y);
      out.x = len > 1 ? x / len : x;
      out.y = len > 1 ? y / len : y;
      out.stick = !!touch && touch.moved && !touch.cmd && !pinch && !held.size;
      return out;
    },
    /** The mouse cursor as a world point (null off the canvas or on touch). */
    aimWorld: (): Vec | null => (cursor ? toWorld(cursor.x, cursor.y) : null),
    /** The cursor in canvas pixels (the reticle), null off the canvas. */
    cursor: () => cursor,
    /** 'touch' once the last input was a finger (the cooldown then shows on your halo, not a reticle). */
    kind: () => lastKind,
    /** A Fire since the last read, or null. */
    fire(): Aim | null {
      const f = fresh(fire);
      fire = null;
      return f && world(f.at);
    },
    /** A short Command (released before HOLD_S) since the last read, or null. */
    command(): Aim | null {
      const c = fresh(tap);
      tap = null;
      return c && world(c.at);
    },
    /** While a Command is held past HOLD_S: where it was pressed; else null. */
    hold: (): Aim | null => (press && now() - press.t >= HOLD_S ? world(press.at) : null),
  };
}
