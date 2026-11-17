import type { Sfx } from '../../audio/sfx';
import type { Fx } from '../../render/fx';
import { compTint, mixRgb, type Body, type Hit } from './body';
import { START_R, V_STICK } from './rules';

// How a collision feels: dust, flash and sparks scaled by how hard the hit was (speed / stick limit);
// the player's own hits add shake, sound (quieter for crumbs), a mass popup and hit-stop. Other bodies' hits are heard panned
// and only near you, fading with distance; a crash of two bodies heavier than you is a moment of its own.

type Feel = {
  fx: Fx;
  sfx: Sfx;
  shake: (amount: number) => void;
  kick: (nx: number, ny: number, px: number) => void;
  freeze: (seconds: number) => void;
  zoom: () => number;
  /** Stereo pan (-1..1) and closeness of a world point (1 at you .. 0 from a share of the screen away, main.ts HEAR_R). */
  hear: (x: number, y: number) => { pan: number; near: number };
  slow: (seconds: number) => void;
};

const pitchOf = (r: number) => Math.sqrt(START_R / r); // 1 at your starting size, lower for bigger bodies

/**
 * A rock burning up in your air (field.ts burn): a shooting star. A streak of glowing grains along its path
 * through the air shell and a small flash just above your limb at (x, y). `whole`: nothing was left to land.
 */
export function burnStreak(fx: Fx, me: Body, rock: Body, x: number, y: number, ux: number, uy: number, whole: boolean) {
  const len = me.r * 1.4, grain = Math.max(rock.r * 0.8, me.r * 0.05), n = 12;
  const lx = x + (x - me.motion.x) * 0.08, ly = y + (y - me.motion.y) * 0.08; // just above the limb
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), j = (Math.random() - 0.5) * grain * 0.4; // t 0 at the limb .. 1 where it entered the air
    fx.ember(lx - ux * len * t + j, ly - uy * len * t + j, me.motion.vx, me.motion.vy, grain * (1 - 0.6 * t), mixRgb(0xfff2d8, 0xff8a3a, t, false), 0.5 + 0.5 * (1 - t));
  }
  fx.flash(lx, ly, grain * (whole ? 2.5 : 1.6), whole ? 5 : 3, grain * 6);
}

const SPARKS = 12; // rock pairs' rub: sparks per touch-at-the-stick-speed of energy lost

export function impactFeedback(player: Body, { fx, sfx, shake, kick, freeze, zoom, hear, slow }: Feel) {
  return (h: Hit) => {
    const small = h.a.r < h.b.r ? h.a : h.b;
    const hard = h.speed / V_STICK; // 1 = the stick limit
    const throwSpeed = h.speed * 2 * h.a.r; // closing speed, world units/s
    const dustShare = h.dust / Math.max(1e-6, small.m + h.dust);
    const k = h.lost === undefined ? 1 : Math.min(1, h.lost), whole = (x: number) => Math.floor(x + Math.random()); // rock pairs: dust and sparks by the energy the contact lost; chance rounding keeps a slow rub's total the same at any tick rate
    const count = whole(k * Math.min(40, 3 + 8 * hard + 40 * dustShare));
    const grit = mixRgb(compTint(small.comp), 0x000000, 0.4, false); // dusty, darker than the rock
    fx.puff(h.x, h.y, h.nx, h.ny, count, small.r * 0.35 + 1, throwSpeed * 0.35 + 12, grit);
    if (h.kind === 'graze' && k < 1) { // a rub: a few sparks that ride with the pair, no flash
      for (let i = whole(SPARKS * k); i > 0; i--) {
        const t = Math.random() * 2 * Math.PI, v = (0.2 + 0.4 * Math.random()) * throwSpeed;
        fx.ember(h.x, h.y, small.motion.vx + Math.cos(t) * v, small.motion.vy + Math.sin(t) * v, small.r * 0.06 + 0.5, 0xffa04a, 0.25 + 0.3 * Math.random());
      }
    } else if (h.kind === 'graze') fx.flash(h.x, h.y, small.r * 0.45, Math.round(2 + 3 * Math.min(2, hard)), throwSpeed * 0.4); // a scrape: sparks, no blast
    // Capped: a hit can be 100s of times the stick speed, and a non-finite count would never end.
    else if (h.kind === 'bounce' || hard > 1) fx.flash(h.x, h.y, small.r * (0.6 + 0.5 * Math.min(hard, 6)), Math.min(40, Math.round(4 * hard)), throwSpeed * 0.6);
    // The lighter body splashed: a small ring of its dust.
    if (h.broke && h.kind !== 'eat') fx.burst(h.x, h.y, Math.round(10 + 20 * Math.min(1, hard / 3)), small.r * 0.3 + 1, throwSpeed * 0.2 + 20, grit);

    if (h.a !== player && h.b !== player) {
      if (!player.m) return;
      const { pan, near } = hear(h.x, h.y);
      if (h.kind === 'bounce' && hard > 1 && Math.min(h.a.m - h.gain, h.mb) >= player.m) { // both heavier than you before the hit (they lose a lot in it)
        fx.burst(h.x, h.y, 80, small.r * 0.45 + 2, throwSpeed * 0.3 + 40, grit);
        fx.flash(h.x, h.y, small.r * 3.5, 40, throwSpeed * 0.8);
        shake(0.2 + 0.5 * near);
        if (near > 0.3) slow(0.6);
        sfx.play('boom', 0.15 + 0.85 * near, 0.7 * pitchOf(small.r), pan);
      } else if (near > 0.01 && (hard > 0.6 || h.shattered)) {
        sfx.play(h.shattered ? 'crack' : h.kind === 'eat' || h.kind === 'accrete' ? 'eat' : 'hit', 0.5 * near * Math.min(1, hard), pitchOf(small.r), pan);
      }
      return;
    }
    const pitch = pitchOf(player.r);
    if (h.a === player && !player.m) {
      // Eaten or destroyed: the biggest moment of the run.
      fx.puff(h.x, h.y, h.nx, h.ny, 40, player.r * 0.5 + 1, player.r * 4, grit);
      fx.flash(h.x, h.y, player.r * 2, 12, player.r * 8);
      shake(0.9);
      freeze(0.15);
      slow(0.7);
      sfx.play(h.kind === 'eaten' ? 'eaten' : 'death', 1, pitch);
      return;
    }
    const gainShare = h.gain / player.m;
    const loud = Math.min(1, 0.25 + 10 * (small.m + Math.abs(h.gain)) / player.m); // crumbs tick quietly, real hits at full
    // Only meals and hits that matter shake the view; crumbs in a dust cloud don't.
    if (h.kind === 'eat' || h.kind === 'accrete') {
      if (gainShare > 0.03) shake(Math.min(0.35, gainShare * 2));
      sfx.play('eat', (0.3 + gainShare * 3) * loud, pitch);
      // Partial accretion: a crunch on top of the gulp.
      if (h.kind === 'accrete') sfx.play('crack', (0.15 + 0.15 * Math.min(2, hard)) * loud, pitch * 1.2);
    } else if (h.kind === 'graze') {
      // Hit-and-run: a light, high scrape and a small shove.
      kick(-h.nx, -h.ny, 1 + Math.min(2, hard));
      sfx.play(h.shattered ? 'crack' : 'hit', (0.15 + 0.2 * Math.min(1.5, hard)) * loud, pitch * 1.35);
    } else {
      // Erosion: you lost a real chip without breaking: your own grit sprays.
      if (!h.shattered && -h.gain > 0.01 * player.m) fx.burst(h.x, h.y, 14, player.r * 0.12 + 1, throwSpeed * 0.15 + 15, mixRgb(compTint(player.comp), 0x000000, 0.4, false));
      // Your own bounce shoves the view away from the contact; shake only for the big ones.
      if (small.m > 0.05 * player.m || hard > 1) kick(-h.nx, -h.ny, 2 + 3 * Math.min(1.5, hard));
      if (hard > 1.5) shake(0.2 + 0.2 * Math.min(1.5, hard - 1.5));
      sfx.play(h.shattered || h.dust > 0.2 * small.m ? 'crack' : 'hit', (0.25 + 0.35 * hard) * (h.shattered ? 1 : loud), pitch);
    }
    if (Math.abs(h.gain) >= 0.005 * player.m) { // crumbs on a big body don't spam "+0.1"
      const sign = h.gain > 0 ? '+' : '−';
      fx.popup(player.motion.x, player.motion.y - player.r * 1.6, `${sign}${Math.abs(h.gain).toFixed(1)}`, h.gain > 0 ? 0x8ef0a8 : 0xff7a7a, 1 / zoom());
    }
    if ((h.kind === 'eat' || h.kind === 'accrete') && h.b.rival) fx.popup(player.motion.x, player.motion.y - player.r * 2.4, 'Rival eaten', 0xffb38a, 1 / zoom());
    if (h.shattered) {
      shake(0.6);
      freeze(0.08);
    } else if (gainShare > 0.2) freeze(0.05);
  };
}
