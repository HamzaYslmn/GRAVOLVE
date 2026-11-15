import { BitmapText, Container, Particle, ParticleContainer, Rectangle, Texture, type Graphics } from 'pixi.js';

// Short-lived world-space effects: dust puffs, additive flashes and sparks, floating text.
// Two particle containers (one draw call each); all capped so a pile-up can't cost frames.

const MAX_DUST = 500;
const MAX_SPARKS = 200;
const DRAG = 2.2; // 1/s: dust slows down and hangs in place
const BOUNDS = new Rectangle(-1e7, -1e7, 2e7, 2e7);
export const FAR_BOUNDS = new Rectangle(-1e9, -1e9, 2e9, 2e9); // boundsArea of world-wide particle containers (Pixi only reads it)

type Live = { p: Particle; vx: number; vy: number; age: number; life: number; s0: number; s1: number; a0: number; drag: number };

/** Soft round glow, drawn once on a canvas. Shared by halos, wells, effects and the near stars. */
export function glowTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,240,210,0.8)');
  grad.addColorStop(1, 'rgba(255,200,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return Texture.from(c);
}

/** A faint broken circle: `n` dashes, each `dash` of its spacing, turned by `spin`; a soft wide stroke under a thin core. */
export function dashRing(g: Graphics, x: number, y: number, r: number, n: number, spin: number, dash: number, width: number, color: number, alpha: number) {
  const arc = (Math.PI * 2) / n;
  for (const [wk, ak] of [[3, 0.35], [1, 1]]) {
    for (let i = 0; i < n; i++) {
      const a0 = spin + i * arc;
      g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r).arc(x, y, r, a0, a0 + arc * dash);
    }
    g.stroke({ width: width * wk, color, alpha: alpha * ak });
  }
}

export function createFx(glow: Texture) {
  const layer = new Container();
  const half = glow.width / 2;
  const pool = (blend?: 'add') => {
    const pc = new ParticleContainer({ texture: glow, boundsArea: BOUNDS, dynamicProperties: { position: true, vertex: true, color: true } });
    if (blend) pc.blendMode = blend;
    layer.addChild(pc);
    return { pc, live: [] as Live[] };
  };
  const dust = pool();
  const sparks = pool('add');
  const texts: { t: BitmapText; age: number; vy: number }[] = [];
  const said = { text: '', t: -Infinity, now: 0 }; // the last note and when

  function emit(into: typeof dust, max: number, x: number, y: number, vx: number, vy: number, life: number, s0: number, s1: number, a0: number, tint: number, drag = DRAG) {
    if (into.live.length >= max) return;
    const p = new Particle({ texture: glow, x, y, anchorX: 0.5, anchorY: 0.5, tint, alpha: a0, scaleX: s0 / half, scaleY: s0 / half });
    into.pc.addParticle(p);
    into.live.push({ p, vx, vy, age: 0, life, s0, s1, a0, drag });
  }

  function step(into: typeof dust, dt: number) {
    for (let i = into.live.length - 1; i >= 0; i--) {
      const q = into.live[i];
      q.age += dt;
      if (q.age >= q.life) {
        into.pc.removeParticle(q.p);
        into.live[i] = into.live[into.live.length - 1];
        into.live.pop();
        continue;
      }
      const k = Math.exp(-q.drag * dt), t = q.age / q.life;
      q.vx *= k;
      q.vy *= k;
      q.p.x += q.vx * dt;
      q.p.y += q.vy * dt;
      q.p.scaleX = q.p.scaleY = (q.s0 + (q.s1 - q.s0) * Math.sqrt(t)) / half;
      q.p.alpha = q.a0 * (1 - t) ** 1.5;
    }
  }

  return {
    layer,
    /**
     * A dust puff at (x, y), thrown mostly sideways to the normal (nx, ny).
     * `size` is the grain size and `speed` the throw speed, both in world units.
     */
    puff(x: number, y: number, nx: number, ny: number, count: number, size: number, speed: number, tint: number) {
      for (let i = 0; i < count; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const a = Math.atan2(ny, nx) + side * (Math.PI / 2) + (Math.random() - 0.5) * 1.6; // tangent fan
        const v = speed * (0.3 + Math.random());
        const s = size * (0.6 + Math.random() * 0.8);
        emit(dust, MAX_DUST, x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size,
          Math.cos(a) * v, Math.sin(a) * v, 0.7 + Math.random() * 1.1, s, s * 3.5, 0.32, tint);
      }
    },
    /** A ring of dust thrown out in every direction that keeps spreading and hangs for seconds: a big crash. */
    burst(x: number, y: number, count: number, size: number, speed: number, tint: number) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.4 + 0.8 * Math.random()), s = size * (0.6 + Math.random());
        emit(dust, MAX_DUST, x, y, Math.cos(a) * v, Math.sin(a) * v, 1.6 + Math.random() * 1.8, s, s * 5, 0.4, tint, 0.9);
      }
    },
    /** One soft grain of a trail (a comet's vapour), drifting with (vx, vy) and growing as it fades. */
    trail(x: number, y: number, vx: number, vy: number, size: number, tint: number) {
      emit(dust, MAX_DUST, x, y, vx, vy, 1.2 + Math.random() * 0.8, size, size * 4, 0.3, tint, 0.6);
    },
    /** One glowing (additive) grain that hangs and fades: a burning rock's streak (feedback.ts burnStreak). */
    ember(x: number, y: number, vx: number, vy: number, size: number, tint: number, life: number) {
      emit(sparks, MAX_SPARKS, x, y, vx, vy, life, size, size * 1.6, 0.7, tint, 1.5);
    },
    /** Additive flash plus a few sparks, for fast or hot hits. */
    flash(x: number, y: number, size: number, sparkCount: number, speed: number) {
      emit(sparks, MAX_SPARKS, x, y, 0, 0, 0.18, size, size * 2.2, 0.75, 0xffd9a8, 0);
      for (let i = 0; i < sparkCount; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.5 + Math.random());
        emit(sparks, MAX_SPARKS, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.3, size * 0.12, size * 0.04, 0.9, 0xffa04a, 4);
      }
    },
    /** Floating text that rises and fades, e.g. "+12". `scale` keeps it a fixed size on screen. */
    popup(x: number, y: number, text: string, color: number, scale: number) {
      const t = new BitmapText({ text, style: { fontFamily: 'monospace', fontSize: 28, fill: color } });
      t.anchor.set(0.5);
      t.position.set(x, y);
      t.scale.set(scale * 0.5);
      layer.addChild(t);
      texts.push({ t, age: 0, vy: -40 * scale });
    },
    /** A small muted note at a target (why an order waits or fizzles, why Fire did nothing); the same text within 1.2 s is dropped. */
    note(x: number, y: number, text: string, scale: number) {
      if (text === said.text && said.now - said.t < 1.2) return;
      [said.text, said.t] = [text, said.now];
      this.popup(x, y, text, 0xffd9a8, scale * 0.8);
    },
    update(dt: number) {
      said.now += dt;
      step(dust, dt);
      step(sparks, dt);
      for (let i = texts.length - 1; i >= 0; i--) {
        const q = texts[i];
        q.age += dt;
        q.t.y += q.vy * dt;
        q.t.alpha = Math.min(1, 3 * (1 - q.age / 1.1));
        if (q.age < 1.1) continue;
        q.t.destroy();
        texts.splice(i, 1);
      }
    },
  };
}

export type Fx = ReturnType<typeof createFx>;
