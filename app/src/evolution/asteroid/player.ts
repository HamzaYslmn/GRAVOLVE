import { Sprite, type Container, type Texture } from 'pixi.js';
import { shapeThrust, stickThrust, type Vec } from '../../core/entity';
import type { Axis } from '../../core/input';
import { clamp, smoothstep } from '../../core/rng';
import { K_PER_HEAT, LATENT, pressure } from '../../core/water';
import type { Rock } from './atlas';
import { gap, heatGlow, phys, rockBody, shed, tickBody, type Body } from './body';
import type { Spheres } from './sphere';
import { createWells } from './wells';
import { EXTINCT } from '../planet/rules';
import { blend, boilOff, BURN_MAX, burnShare, collide, COMP, MOLTEN, critSpeed, DEATH_D, density, fallSpeed, GRAZE, reachGround, START_R, TOP, worldOpts } from './rules';

// The player: an asteroid body steered by input, growing by eating rocks (body.ts). Thrust rises slower
// than size, so you get more sluggish in your own diameters as you grow. Space handling: no drag, momentum is
// kept, thrust against your motion brakes with the same thrust (RETRO), and forward thrust fades out toward your top
// speed: TOP × your critical speed (rules.ts critSpeed: a head-on hit on a peer destroys you), so it depends on your
// mass and make-up and you can always choose to fly fast enough to kill, or to chip a planet, but not speed up forever.
// Gravity wells (wells.ts) predict what touching a sensed body would do (see `predict` and `update`).

const ACCEL = 500; // units/s² at the start size
export const DRAG = 0.1; // 1/s: the rivals' drag (their chase AI is tuned on it); you have none
const RETRO = 1;
const MAX_SPEED = 1e4; // own diameters/s: numeric guard only, keeps the numbers finite
const VIEW_GROW = 0.8; // view ∝ size^0.8: you look a little bigger on screen as you grow
const VIEW_SPEED = 0.6; // up to 1.6× wider at high speed, to see what is coming
const FAST = [8, 60]; // diameters/s: speed pull-back starts at the stick speed, full by 60
const SIZE_POWER = 0.4; // accel ∝ size^0.4: faster in world units, slower in own diameters
const WEIGHT = 0.3; // accel × (start density / density)^WEIGHT
// Comet: from COMET_IN ice you are a comet, below COMET_OUT an asteroid again. Ice boils off mostly when
// heated or burnt as jet fuel by thrusting (cold coasting is nearly dormant); boiling eats heat, and the
// jets push up to thrust × (1 + JET).
const COMET_IN = 0.5;
const COMET_OUT = 0.4;
const BOIL = 0.012; // share of your ice per second at boil rate 1
const BOIL_COLD = 0.2; // boil rate when cold and coasting
const BOIL_THRUST = 0.6; // extra while thrusting
const JET = 0.25;
const ROCK_BONUS = 0.2; // the doc's rock path: +20% of a meal's rock mass
const AIM_RANGE = 5; // player radii between surfaces at which the nearest rock shows its well
const COLORS = { eat: 0x5fe08a, messy: 0xffd166, bounce: 0xff9f43, broken: 0xff4fa8, death: 0xff2d4a };
const THREAT_RANGE = 12; // player radii between surfaces at which a heavier body shows its well
const LOOKAHEAD = 3; // s ahead at which bodies on your course show their wells
const COURSE = 1.4; // a closest approach nearer than this × the contact distance is on course
const RISE = 8; // 1/s: wells fade in
const FALL = 3; // 1/s: and out
const SENSED = 5; // wells at once, most urgent first
const AIM_CONE = Math.PI / 6; // rad either side of your heading: the target panel picks the heaviest body in it
const HEAD_V = 0.5; // own diameters/s: slower than this, your input (or the last heading) sets the cone
const TINY = 0.01; // mass ratio under which a harmless body is dust to you: the nearest-rock well skips it while anything bigger is in range

/** Full thrust (units/s²) for a body of this size and make-up, as yours would be. */
export const thrustOf = (b: Body) => ACCEL * (b.r / START_R) ** SIZE_POWER * (density(COMP.dust) / density(b.comp)) ** WEIGHT;

/** A prediction: the body, the verdict colour, how dangerous it is (0 safe .. 1 deadly) and the impact speed (your diameters/s). */
export type Aim = { target: Body; color: number; danger: number; speed: number };

/** `frame`: the touch assist (planet/moons.ts frame): the stick steers relative to a candidate moon moving with you. */
export function createPlayer(layer: Container, rock: Rock, glow: Texture, spheres: Spheres, control: () => Axis, x: number, y: number, frame: () => Vec | undefined = () => undefined) {
  const body = rockBody({ texture: rock.texture, comp: COMP.dust }, START_R, x, y);
  body.motion.drag = 0;
  body.control = () => {
    const m = body.motion, v = Math.hypot(m.vx, m.vy), max = MAX_SPEED * 2 * body.r, top = TOP * critSpeed(body) * 2 * body.r;
    if (v > max) [m.vx, m.vy] = [(m.vx * max) / v, (m.vy * max) / v];
    const c = control();
    if (!c.stick) return shapeThrust(c, m.vx, m.vy, top, RETRO);
    const f = frame(); // centring the stick then matches the candidate instead of braking to rest
    return stickThrust(c, m.vx - (f?.x ?? 0), m.vy - (f?.y ?? 0), top, m.accel || thrustOf(body));
  };
  body.spin = 0.3;
  body.fertile = ROCK_BONUS;
  const halo = new Sprite({ texture: glow, anchor: 0.5, tint: 0x7fc8ff, alpha: 0.35, blendMode: 'add' });
  const wells = createWells(glow);
  layer.addChild(wells.layer, halo, body.view); // heat shows as a rim on your outline (body.ts heatGlow), as on any rock

  /**
   * What touching `t` would do, falling in included (rules.ts collide regimes, by worldOpts): green merge, yellow partial
   * accretion, orange graze or bounce, pink you break, red it eats you or the hit destroys you. Age I and a molten world
   * (heat > MOLTEN) read the regimes as they are: what you would eat is green. A solid Age II world reads the hit's heat
   * (rules.ts worldHeat) instead: green if it burns up whole in your air or lands under EXTINCT[0] K (planet/rules.ts) with
   * no damage, orange up to EXTINCT[1] (a setback for life), red from there (it wipes life out: moon-sized, giant impacts).
   */
  function predict(t: Body): Aim {
    const p = body.motion, D = 2 * body.r, contact = body.r + t.r;
    const dx = t.motion.x - p.x, dy = t.motion.y - p.y, d = Math.hypot(dx, dy) || 1;
    const rvx = t.motion.vx - p.vx, rvy = t.motion.vy - p.vy, w = Math.hypot(rvx, rvy);
    const cross = Math.abs(dx * rvy - dy * rvx), fall = fallSpeed(t.m / body.m, contact / D) * D;
    let closing = fall, sliding = cross / d; // drifting apart: only the fall and the sideways motion
    if (dx * rvx + dy * rvy < 0 && w) {
      // On the way in: impact angle from the straight-line miss distance, narrowed by the fall
      // (angular momentum: miss × w = contact × sliding at contact).
      const V = Math.hypot(w, fall), sin = Math.min(1, cross / (contact * V)); // miss = cross / w
      [closing, sliding] = [V * Math.sqrt(1 - sin * sin), V * sin];
    }
    const o = worldOpts(phys(body), phys(t)), out = collide(phys(body), phys(t), closing, sliding, o);
    const solid = !!o.world && body.heat <= MOLTEN, K = out.a.heat * K_PER_HEAT;
    const burns = solid && t.m < BURN_MAX * body.m && reachGround(t.m / body.m, burnShare(pressure(body.m, body.comp.gas ?? 0))) <= 0;
    const [color, danger] =
      out.kind === 'eaten' || out.a.d >= DEATH_D ? [COLORS.death, 1] :
      solid && (burns || (K < EXTINCT[0] && out.a.d < 0.1)) ? [COLORS.eat, 0.1] :
      solid && K >= EXTINCT[1] ? [COLORS.death, 1] :
      solid ? [COLORS.bounce, 0.5] :
      out.a.d >= 1 ? [COLORS.broken, 0.75] :
      out.kind === 'eat' ? [COLORS.eat, 0.1] :
      out.kind === 'accrete' ? [COLORS.messy, 0.35] :
      [COLORS.bounce, 0.5]; // graze or bounce
    return { target: t, color, danger, speed: Math.hypot(closing, GRAZE * sliding) / D };
  }

  /** Loses `lost` mass as vapour: same shape, smaller. */
  function shrink(lost: number) {
    if (lost > 0) shed(body, lost);
  }

  let aim: Aim | undefined, hx = 0, hy = 0; // the target, and the heading (unit vector) whose cone it comes from
  const shown = new Map<Body, number>(); // well strength per shown body, eased toward its goal
  return {
    body,
    /** The heaviest body on screen in the cone ahead of you and what touching it would do, for the HUD. */
    aim: () => aim,
    /** How much world the camera should show, relative to the start (bigger = zoomed out). */
    view() {
      const v = Math.hypot(body.motion.vx, body.motion.vy) / (2 * body.r);
      return (body.r / START_R) ** VIEW_GROW * (1 + VIEW_SPEED * smoothstep(FAST[0], FAST[1], v));
    },
    /** Removes everything the player drew (its rock parts may live on inside whatever ate it). */
    destroy() {
      for (const o of [halo, body.view]) if (!o.destroyed) o.destroy({ children: true }); // its sphere and city lights free their bakes (sphere.ts begin)
      wells.destroy();
    },
    /** `around`: bodies near you, for the wells; `inView`: whether a body is on screen (the target panel picks from those). */
    update(dt: number, zoom: number, around: Body[], inView: (b: Body) => boolean) {
      if (!body.m) {
        halo.visible = wells.layer.visible = false; // eaten or destroyed
        return;
      }
      if (around.some((t) => t.moon)) around = around.filter((t) => !t.moon); // your moons never touch you
      // The rock whose surface is closest, if in range; dust only when nothing bigger is in range.
      let target: Body | undefined, dust: Body | undefined, nearest = AIM_RANGE * body.r, nearestDust = nearest;
      for (const t of around) {
        const g = gap(body, t);
        if (t.m < TINY * body.m) { if (g < nearestDust) [dust, nearestDust] = [t, g]; }
        else if (g < nearest) [target, nearest] = [t, g];
      }
      target ??= dust;
      const ice = body.comp.ice ?? 0;
      body.comet = ice >= (body.comet ? COMET_OUT : COMET_IN);
      let boil = 0;
      if (body.comet) {
        const c = control();
        boil = BOIL_COLD + clamp(body.heat / 2, 0, 2) + (Math.hypot(c.x, c.y) > 0.1 ? BOIL_THRUST : 0);
        const lost = body.m * ice * BOIL * boil * dt;
        body.heat = Math.max(0, body.heat - (LATENT * lost) / body.m);
        body.comp = blend(body.comp, body.m, { ice: 1 }, -lost);
        shrink(lost);
      } else if (ice) {
        shrink(boilOff(body, dt)); // hot water boils (rules.ts boilOff)
      }
      body.motion.accel = thrustOf(body) * (1 + JET * Math.min(1, boil));
      halo.tint = body.comet ? 0x9ff0ff : 0x7fc8ff;
      halo.alpha = body.comet ? 0.6 : 0.35;
      tickBody(body, dt);
      spheres.update(body, dt, true);
      halo.position.copyFrom(body.view.position);
      halo.scale.set((body.r * (body.comet ? 6 : 4)) / glow.width); // a comet's coma is wider
      heatGlow(body);
      halo.alpha *= 1 - clamp((body.heat - 0.2) / 3, 0, 0.55); // the cool halo gives way to the heat rim (both together read as a star)

      // Sensing: the nearest rock once close, anything on your course within LOOKAHEAD s, and heavier
      // bodies close by. The most urgent one is the aim (HUD target panel).
      wells.begin(dt);
      const me = body.motion, sensed: { t: Body; s: number }[] = [];
      for (const t of around) {
        const px = t.motion.x - me.x, py = t.motion.y - me.y, g = gap(body, t);
        let s = t === target ? 1.5 * (1 - g / (AIM_RANGE * body.r)) : 0;
        if (!t.meteor || t.m > body.m) { // meteors stay unannounced unless heavier than you
          const vx = t.motion.vx - me.vx, vy = t.motion.vy - me.vy, v2 = vx * vx + vy * vy, along = -(px * vx + py * vy);
          if (along > 0 && v2 > 0) {
            const tca = along / v2; // s to closest approach
            if (tca < LOOKAHEAD && Math.hypot(px + vx * tca, py + vy * tca) < COURSE * (t.r + body.r)) s = Math.max(s, 1.2 * (1 - tca / LOOKAHEAD));
          }
          if (t.m > body.m) s = Math.max(s, 0.6 * (1 - g / (THREAT_RANGE * body.r)));
        }
        if (s > 0) sensed.push({ t, s: Math.min(1, s) });
      }
      sensed.sort((a, b) => b.s - a.s);
      // Target panel: the heaviest body on screen inside a cone along where you are heading (your motion, else your
      // input, else the last heading); with nothing in the cone (or no heading yet), the heaviest on screen.
      const sp = Math.hypot(me.vx, me.vy), c = control(), cl = Math.hypot(c.x, c.y);
      if (sp > HEAD_V * 2 * body.r) [hx, hy] = [me.vx / sp, me.vy / sp];
      else if (cl > 0.1) [hx, hy] = [c.x / cl, c.y / cl];
      let big: Body | undefined, any: Body | undefined;
      for (const t of around) {
        if (!t.m || (big && t.m <= big.m) || !inView(t)) continue;
        if (!any || t.m > any.m) any = t;
        const dx = t.motion.x - me.x, dy = t.motion.y - me.y, d = Math.hypot(dx, dy) || 1;
        const off = Math.acos(clamp((dx * hx + dy * hy) / d, -1, 1)) - Math.asin(Math.min(1, t.r / d)); // its nearest edge
        if (!(hx || hy) || off <= AIM_CONE) big = t;
      }
      const pick = big ?? any;
      aim = pick && predict(pick);
      const want = new Map(sensed.slice(0, SENSED).map(({ t, s }, i) => [t, i ? 0.75 * s : s]));
      for (const t of want.keys()) if (!shown.has(t)) shown.set(t, 0);
      for (const [t, s] of [...shown].sort(([a], [b]) => +want.has(b) - +want.has(a))) { // wanted first: fading ones never take the last well sprites
        const goal = t.m ? (want.get(t) ?? 0) : 0;
        const next = s + (goal - s) * (1 - Math.exp(-(goal > s ? RISE : FALL) * dt));
        if ((next < 0.01 && !goal) || !t.m) shown.delete(t); // gone bodies drop at once
        else {
          shown.set(t, next);
          const p = t === aim?.target ? aim : predict(t);
          wells.well(t, p.color, next, p.danger, zoom);
        }
      }
      wells.end();
    },
  };
}
