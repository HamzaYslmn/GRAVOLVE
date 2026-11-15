// Impact sounds synthesised from short recipes (filtered noise or sine layers), rendered on the first user gesture into
// a few variants each; no audio files, no reverb. Playback follows the old game's rules (pitch jitter, loudness from
// force, pan, voice stealing); big moments duck the rest, and an exciter lifts the sub-150 Hz end for small speakers.
// Event sounds have 2-3 takes each (different notes and sweeps), never the same take twice running; banners sound
// through `announce` (ui/toast.ts). List: docs/techandperformance.md, Audio.

import { clamp } from '../core/rng';

export type Sound = 'eat' | 'hit' | 'crack' | 'death' | 'eaten' | 'boom'
  // Age II moons
  | 'capture' | 'steal' | 'grip' | 'snap' | 'loose' | 'grind'
  // civilization and star
  | 'shot' | 'beam' | 'launch' | 'shield' | 'segment' | 'link'
  // banners (announce)
  | 'chime' | 'tier' | 'milestone' | 'achieve' | 'setback' | 'comet';

/**
 * One layer of a recipe: source, filter type, filter Hz at the start and at the end, Q, and [seconds, dB] points.
 * Sources: 'white' and 'brown' noise (brown falls 6 dB/octave above 100 Hz), 'crackle' (sparse clicks:
 * debris), 'sine' and 'triangle' (their Hz are the pitch; no filter), 'sawtooth' and 'square' (Hz are the pitch; the
 * filter follows it at q times the pitch). Loudness moves in straight dB lines between points.
 */
type Source = 'white' | 'brown' | 'crackle' | 'sine' | 'triangle' | 'sawtooth' | 'square';
type Layer = [source: Source, filter: BiquadFilterType, hz0: number, hz1: number, q: number, env: [number, number][]];
type Recipe = [seconds: number, layers: Layer[]];
const NOISE: Source[] = ['white', 'brown', 'crackle']; // recipes with noise render several takes; tonal ones once

/** A sine note at `t`: up to `dB` in 6 ms, rings `ring` s; `to` glides the pitch over the ring. */
const note = (hz: number, t: number, dB: number, ring: number, to = hz): Layer =>
  ['sine', 'lowpass', hz, to, 0, [[t, -80], [t + 0.006, dB], [t + ring * 0.25, dB - 9], [t + ring, -80]]];
/** A slow sine swell (pads): in over 30% of `len`, out by its end. */
const swell = (hz: number, t: number, dB: number, len: number): Layer =>
  ['sine', 'lowpass', hz, hz, 0, [[t, -80], [t + len * 0.3, dB], [t + len * 0.55, dB - 4], [t + len, -80]]];
/** Band-passed white noise peaking at 60% of `len`, its band moving hz0 → hz1: whooshes and hisses. */
const swish = (t: number, len: number, hz0: number, hz1: number, dB: number, q = 1.5): Layer =>
  ['white', 'bandpass', hz0, hz1, q, [[t, -70], [t + len * 0.6, dB], [t + len, -80]]];
const click = (t: number, hz: number, dB = -6): Layer => ['white', 'bandpass', hz, hz, 1, [[t, -60], [t + 0.002, dB], [t + 0.03, -70]]];
/** Notes one after another, `gap` s apart. */
const arp = (hz: number[], gap: number, dB: number, ring: number) => hz.map((h, i) => note(h, i * gap, dB - i, ring));
/** A struck metal plate: inharmonic partials, the high ones quieter and shorter. */
const metal = (hz: number, dB: number, ring: number) => [1, 2.17, 3.58, 5.1].map((k, i) => note(hz * k, 0, dB - 4 * i, ring * (1 - 0.18 * i)));
/** A buzzy zap: a filtered sawtooth (or square) diving hz0 → hz1 over `len`, sharp attack, fast decay. */
const zap = (t: number, hz0: number, hz1: number, len: number, dB: number, src: Source = 'sawtooth', bright = 3): Layer =>
  [src, 'lowpass', hz0, hz1, bright, [[t, -80], [t + 0.002, dB], [t + len * 0.3, dB - 6], [t + len, -80]]];
/** A blaster bolt at `t`: two zaps diving at different speeds (the spring-like twang) over a falling sine body. */
const bolt = (t: number, hz: number, dB: number): Layer[] =>
  [zap(t, hz, hz * 0.06, 0.16, dB), zap(t, hz * 0.83, hz * 0.05, 0.1, dB - 5, 'square', 2), note(hz * 0.3, t, dB - 4, 0.12, 70)];
/** A recipe as long as its last layer. */
const rec = (...layers: Layer[]): Recipe => [Math.max(...layers.map((l) => l[5][l[5].length - 1][0])) + 0.02, layers];
const settle = note(110, 0.05, -16, 0.25, 70); // a low bump: something with weight comes to rest

const RECIPES: Record<string, Recipe> = {
  // Moon captured: a whoosh, a low settle, a rising chime (three takes). Stolen: brighter, two more notes on top.
  capture1: rec(swish(0, 0.2, 400, 1800, -6), settle, note(392, 0.08, -18, 0.6), note(587, 0.17, -18, 0.8)),
  capture2: rec(swish(0, 0.22, 300, 1500, -6), settle, note(440, 0.07, -19, 0.5), note(659, 0.15, -19, 0.6), note(880, 0.24, -22, 0.8)),
  capture3: rec(swish(0, 0.16, 500, 2200, -6), settle, note(440, 0.06, -18, 0.7, 523), note(784, 0.19, -21, 0.8)),
  steal1: rec(swish(0, 0.2, 500, 2400, -6), settle, ...arp([523, 784, 1047, 1568], 0.08, -18, 0.6)),
  steal2: rec(swish(0, 0.18, 600, 2800, -6), settle, ...arp([587, 880, 1175, 1760], 0.07, -18, 0.6)),
  // A capture grips: a quick rising fwip and a pluck. Let go, cut or failed: a falling pluck.
  grip1: rec(swish(0, 0.12, 800, 3200, -8, 3), note(660, 0.03, -22, 0.25, 990)),
  grip2: rec(swish(0, 0.14, 600, 2600, -8, 3), note(587, 0.03, -22, 0.3, 880)),
  grip3: rec(swish(0, 0.1, 1000, 3600, -8, 3), note(740, 0.02, -22, 0.22, 1110)),
  snap1: rec(click(0, 2200), note(700, 0, -22, 0.22, 330)),
  snap2: rec(click(0, 1800), note(620, 0, -22, 0.25, 290)),
  // A moon lost (knocked loose, taken): two falling notes over a falling hiss.
  loose1: rec(swish(0, 0.3, 1600, 400, -10), note(659, 0.02, -19, 0.5), note(523, 0.2, -19, 0.8, 494)),
  loose2: rec(swish(0, 0.3, 1400, 350, -10), note(587, 0.02, -19, 0.5), note(440, 0.2, -19, 0.8, 415)),
  // Grinding a moon down: a short burst of grit (played a few times a second while held).
  grind1: rec(['crackle', 'bandpass', 2400, 2400, 1, [[0, -60], [0.02, -18], [0.12, -32], [0.18, -70]]], ['brown', 'lowpass', 500, 500, 0.7, [[0, -60], [0.03, -26], [0.18, -70]]]),
  // Guns: blaster bolts, one to three per burst.
  shot1: rec(...bolt(0, 3000, -14)),
  shot2: rec(...bolt(0, 2600, -14), ...bolt(0.075, 2400, -17)),
  shot3: rec(...bolt(0, 3400, -15), ...bolt(0.06, 3200, -17), ...bolt(0.12, 3000, -19)),
  // Energy beam: a heavy cannon bolt: zaps a fifth apart diving low, a square growl, a sub hit, a warm buzz under it.
  beam1: rec(zap(0, 1600, 70, 0.5, -12), zap(0, 2400, 105, 0.42, -16), zap(0.01, 1200, 50, 0.55, -16, 'square', 1.5), note(100, 0, -8, 0.35, 35),
    ['sawtooth', 'lowpass', 55, 48, 6, [[0, -80], [0.02, -20], [0.3, -24], [0.6, -80]]]),
  beam2: rec(zap(0, 1400, 60, 0.55, -12), zap(0, 2100, 90, 0.46, -16), zap(0.01, 1050, 45, 0.6, -16, 'square', 1.5), note(90, 0, -8, 0.4, 32),
    ['sawtooth', 'lowpass', 49, 43, 6, [[0, -80], [0.02, -20], [0.35, -24], [0.65, -80]]]),
  // A ship launches: ignition thump, an engine roar opening up and fading as it leaves, a faint rising engine tone.
  launch1: rec(click(0, 1200, -8), note(70, 0, -12, 0.25, 40), ['brown', 'lowpass', 250, 1800, 0.7, [[0, -60], [0.05, -14], [0.35, -8], [0.9, -60]]],
    ['triangle', 'lowpass', 80, 170, 0, [[0, -80], [0.3, -22], [0.9, -80]]], swish(0.1, 0.7, 400, 2500, -14, 0.8)),
  launch2: rec(click(0, 1000, -8), note(62, 0, -12, 0.3, 36), ['brown', 'lowpass', 200, 1500, 0.7, [[0, -60], [0.06, -14], [0.45, -8], [1.1, -60]]],
    ['triangle', 'lowpass', 70, 150, 0, [[0, -80], [0.4, -22], [1.1, -80]]], swish(0.12, 0.9, 350, 2200, -14, 0.8)),
  // The shield deflects a hit: a thump, a short buzzing zap, and a force-field hum (two detuned saws) falling away.
  shield1: rec(note(140, 0, -10, 0.35, 55), zap(0, 1800, 200, 0.25, -18, 'sawtooth', 2),
    ['sawtooth', 'lowpass', 110, 60, 12, [[0, -80], [0.01, -18], [0.15, -24], [0.6, -80]]], ['sawtooth', 'lowpass', 111.5, 61, 12, [[0, -80], [0.01, -19], [0.15, -25], [0.6, -80]]]),
  shield2: rec(note(120, 0, -10, 0.4, 48), zap(0, 1500, 170, 0.28, -18, 'sawtooth', 2),
    ['sawtooth', 'lowpass', 98, 52, 12, [[0, -80], [0.01, -18], [0.17, -24], [0.65, -80]]], ['sawtooth', 'lowpass', 99.4, 53, 12, [[0, -80], [0.01, -19], [0.17, -25], [0.65, -80]]]),
  shield3: rec(note(160, 0, -10, 0.3, 62), zap(0, 2100, 240, 0.22, -18, 'sawtooth', 2),
    ['sawtooth', 'lowpass', 123, 68, 12, [[0, -80], [0.01, -18], [0.13, -24], [0.55, -80]]], ['sawtooth', 'lowpass', 124.7, 69, 12, [[0, -80], [0.01, -19], [0.13, -25], [0.55, -80]]]),
  // A Dyson panel placed: a small far clink.
  segment1: rec(...metal(1320, -24, 0.3)),
  segment2: rec(...metal(1480, -24, 0.3)),
  segment3: rec(...metal(1760, -24, 0.25)),
  // Star linked: a slow warm chord over a low swell.
  link1: rec(swell(220, 0, -18, 2.6), swell(330, 0.1, -20, 2.5), swell(440, 0.2, -21, 2.4), swell(554, 0.3, -23, 2.3), ['brown', 'lowpass', 300, 300, 0.7, [[0, -60], [0.5, -20], [2.4, -80]]]),
  link2: rec(swell(196, 0, -18, 2.6), swell(294, 0.1, -20, 2.5), swell(392, 0.2, -21, 2.4), swell(587, 0.3, -23, 2.3), ['brown', 'lowpass', 300, 300, 0.7, [[0, -60], [0.5, -20], [2.4, -80]]]),
  // Banners: a soft bell (news), two rising notes (tier), a rising arpeggio (milestone), a sparkle (achievement),
  // two falling notes (a setback), an icy hiss (comet).
  chime1: rec(note(784, 0, -22, 0.6), note(1568, 0, -34, 0.3)),
  chime2: rec(note(880, 0, -22, 0.6), note(1760, 0, -34, 0.3)),
  chime3: rec(note(1047, 0, -23, 0.5), note(2093, 0, -35, 0.25)),
  tier1: rec(note(392, 0, -20, 0.5), note(587, 0.11, -20, 0.8)),
  tier2: rec(note(440, 0, -20, 0.5), note(659, 0.11, -20, 0.8)),
  tier3: rec(note(523, 0, -20, 0.5), note(784, 0.11, -20, 0.8)),
  milestone1: rec(...arp([523, 659, 784, 1047], 0.09, -20, 1.2), swell(262, 0, -24, 1.4)),
  milestone2: rec(...arp([440, 554, 659, 880], 0.09, -20, 1.2), swell(220, 0, -24, 1.4)),
  milestone3: rec(...arp([392, 587, 784, 988], 0.09, -20, 1.2), swell(196, 0, -24, 1.4)),
  achieve1: rec(...arp([1047, 1319, 1568, 2093], 0.05, -21, 0.5), ['white', 'highpass', 6000, 6000, 0.7, [[0, -70], [0.2, -30], [0.7, -80]]]),
  achieve2: rec(...arp([1175, 1480, 1760, 2349], 0.05, -21, 0.5), ['white', 'highpass', 6000, 6000, 0.7, [[0, -70], [0.2, -30], [0.7, -80]]]),
  setback1: rec(note(330, 0, -20, 0.7), note(262, 0.2, -20, 1.1, 247)),
  setback2: rec(note(294, 0, -20, 0.7), note(220, 0.2, -20, 1.1, 208)),
  comet1: rec(swish(0, 1.2, 3500, 7000, -14, 0.7), note(1760, 0.1, -30, 1), note(2637, 0.25, -32, 0.9)),

  // "Asteroid Absorbed": a 0.22 s swell of sub rumble and ~2 kHz hiss, cut off like something sucked in.
  absorb: [0.37, [
    ['white', 'lowpass', 60, 60, 1.2, [[0, -40], [0.04, -26], [0.09, -11], [0.13, -2], [0.18, 9], [0.22, 14], [0.25, -14], [0.3, -25], [0.37, -45]]],
    ['white', 'lowpass', 2500, 2500, 1.5, [[0, -54], [0.02, -46], [0.04, -36], [0.09, -29], [0.13, -23], [0.18, -20], [0.208, -16], [0.22, -50], [0.37, -75]]],
    // Added: a hiss sweeping up with the swell, the reward cue.
    ['white', 'bandpass', 700, 3000, 2.5, [[0, -60], [0.06, -38], [0.15, -27], [0.205, -24], [0.225, -60], [0.37, -80]]],
  ]],
  // "Impact - Asteroid Asteroid": a 50 Hz thump under a click, a second clack, then crackling debris around 1 kHz over a
  // low grumble that thins out, with one last low bump at 0.72 s.
  impact: [1.05, [
    ['sine', 'lowpass', 52, 43, 0, [[0, -40], [0.004, -10], [0.045, -12], [0.07, -30], [0.1, -50]]],
    ['white', 'bandpass', 1500, 1500, 0.3, [[0, -50], [0.002, -14], [0.02, -17], [0.035, -35], [0.05, -50]]],
    ['white', 'bandpass', 1500, 1500, 0.7, [[0.05, -50], [0.055, -16], [0.07, -22], [0.09, -45]]],
    ['brown', 'lowpass', 350, 350, 0.5, [[0, -50], [0.003, -30], [0.05, -30], [0.1, -35], [0.3, -42], [0.45, -56], [0.62, -62], [0.72, -50], [0.8, -62], [0.9, -68], [1, -90]]],
    ['crackle', 'bandpass', 1000, 1000, 1.2, [[0.03, -40], [0.08, -21], [0.13, -24], [0.25, -26], [0.35, -40], [0.45, -52], [0.6, -51], [0.72, -52], [0.9, -64], [1, -90]]],
    ['crackle', 'bandpass', 1500, 1500, 0.3, [[0.03, -50], [0.08, -36], [0.25, -38], [0.35, -48], [0.45, -58], [0.72, -58], [0.9, -70], [1, -90]]],
  ]],
  // "Explosion 2": a click, then a 65 Hz rumble under brown noise, fading while the top end closes.
  explosion2: [1.12, [
    ['white', 'lowpass', 65, 65, 2.5, [[0, -10], [0.003, 4], [0.04, 12], [0.1, 13], [0.3, 11], [0.5, 2], [0.7, -6], [0.9, -11], [1.05, -18], [1.1, -60]]],
    ['brown', 'lowpass', 6000, 1000, 0.5, [[0, -40], [0.003, -15], [0.3, -17], [0.5, -24], [0.7, -28], [0.9, -36], [1.05, -44], [1.1, -80]]],
    ['white', 'bandpass', 1500, 1500, 0.3, [[0, -50], [0.002, -16], [0.025, -20], [0.05, -45]]],
  ]],
  // "Explosion 1": a hard click, then a steady narrow 70-80 Hz rumble with a quiet hiss over it, falling away.
  explosion1: [2, [
    ['white', 'lowpass', 74, 74, 4, [[0, 10], [0.02, 6], [0.1, 4], [0.85, 3], [0.95, -5], [1.2, -13], [1.4, -17], [1.5, -24], [1.7, -45], [1.9, -60], [2, -80]]],
    ['white', 'lowpass', 2000, 2000, 0.8, [[0, -50], [0.03, -19], [0.5, -23], [0.9, -28], [1.2, -45], [1.5, -62], [1.9, -85]]],
    ['white', 'bandpass', 1200, 1200, 0.8, [[0, -40], [0.002, -2], [0.02, -5], [0.04, -22], [0.06, -40]]],
  ]],
};

type Part = [sound: string, volume: number, rate: number];
/** Takes `name`1..n of a recipe, one picked per play (never the same twice running). */
const takes = (name: string, n: number, volume = 1): Part[][] => Array.from({ length: n }, (_, i) => [[`${name}${i + 1}`, volume, 1]]);
// Which rendered sounds make each cue, as alternative takes; a slower rate plays one lower and longer.
const CUES: Record<Sound, Part[][]> = {
  eat: [[['absorb', 0.55, 1]]],
  eaten: [[['absorb', 1, 0.45], ['explosion1', 0.35, 0.6]]], // swallowed: the meal sound turned on you, slow and deep
  hit: [[['impact', 0.9, 1]]],
  crack: [[['explosion2', 0.5, 1.15]]],
  death: [[['explosion1', 1, 0.8], ['explosion2', 0.5, 0.6]]], // the long blast over a slowed-down, deeper one
  boom: [[['explosion1', 0.9, 0.7]]],
  capture: takes('capture', 3), steal: takes('steal', 2), grip: takes('grip', 3), snap: takes('snap', 2), loose: takes('loose', 2),
  grind: takes('grind', 1),
  shot: takes('shot', 3), beam: takes('beam', 2, 0.6), launch: takes('launch', 2, 0.35), shield: takes('shield', 3, 0.9), segment: takes('segment', 3), link: takes('link', 2),
  chime: takes('chime', 3), tier: takes('tier', 3), milestone: takes('milestone', 3), achieve: takes('achieve', 2), setback: takes('setback', 2), comet: takes('comet', 1),
};
// Higher survives when voices run out.
const PRIORITY: Record<Sound, number> = {
  hit: 0, shot: 0, grind: 0, segment: 0, eat: 1, snap: 1, grip: 1, launch: 1, crack: 2, capture: 2, steal: 2, loose: 2, shield: 2, beam: 2,
  boom: 3, link: 3, chime: 3, tier: 3, milestone: 3, achieve: 3, setback: 3, comet: 3, death: 4, eaten: 4,
};
// s between two of a kind: the rate limit (the first of a burst plays; callers pass the loudest when they can).
const GAP: Record<Sound, number> = {
  eat: 0.06, hit: 0.06, crack: 0.09, death: 0, eaten: 0, boom: 0.4, shot: 0.05, grind: 0.12, segment: 0.1, snap: 0.08, grip: 0.1,
  capture: 0.15, steal: 0.15, loose: 0.3, launch: 0.3, shield: 0.12, beam: 0.1, link: 1,
  chime: 0.3, tier: 0.3, milestone: 0.3, achieve: 0.3, setback: 0.3, comet: 0.3,
};
const UI: Sound[] = ['chime', 'tier', 'milestone', 'achieve', 'setback', 'comet']; // banners: never ducked, steady pitch
const STEADY: Sound[] = [...UI, 'link']; // chords: no random pitch, so they stay in tune
const VARIANTS = 3; // renders of each noisy recipe, each with its own noise (tonal ones render once)
const CRACKLE_HZ = 350; // clicks per second in 'crackle' noise
const MAX_VOICES = 12; // sounds playing at once
const MIN_GAIN = 0.04; // quieter than this is not worth a voice
const SEMITONES = 1; // random pitch, +- this much
const SIZE = 0.35; // how strongly body size bends the pitch: rate = pitch^SIZE (the sounds are bass-heavy already; more gets inaudible)
const FAR_HZ = 500; // 'boom' lowpass at its quietest (farthest)...
const NEAR_HZ = 5000; // ...and at its loudest (closest)
const LOUDNESS = 0.5; // gain = loud^this: soft hits stay audible, hard ones don't blow up
const MASTER = 1.25;
const HEADROOM = 2; // the soft clipper bends smoothly up to this many times full scale before it flattens
const VARY_DB = 1.5; // random level per play, +- this much
const STREAK_S = 1.2; // meals closer together than this are a streak...
const STREAK_MAX = 5; // ...climbing a semitone each, up to this many
const FALL: Partial<Record<Sound, number>> = { crack: 0.88, death: 0.8 }; // pitch at the end of the sound: a sag reads as loss
const BIG: Sound[] = ['death', 'eaten', 'boom']; // these duck the rest
const DUCK = 0.4; // gain of everything else under a big moment (-8 dB)...
const DUCK_HOLD = 0.35; // ...held this long, then
const DUCK_BACK = 0.5; // s to come back
const LOW_CUT = 25; // Hz: below this is only lost headroom
const PRESENCE: [hz: number, dB: number] = [1800, 3]; // attacks stay readable on small speakers
const EXCITE = 0.35; // level of the low-end harmonics (heard as bass where there is no bass)
const BANNER = 0.6; // banner sounds sit under gameplay
// News keys whose event already made its own sound (moons.ts, star/stage.ts): their banner stays silent.
const QUIET = new Set(['moon', 'stolen', 'lost', 'ground', 'starlink', 'swallow', 'starlost']);
// Bad news (keys, or titles of keyless toasts): two falling notes, never an alarm.
const SETBACK = new Set(['overwhelmed', 'rad', 'starrad', 'needsun', 'roche', 'swallowed', 'gas-warn', 'boil', 'Impact winter', 'Mass extinction']);

const gainOf = (dB: number) => 10 ** (dB / 20);

/** Renders a recipe to a buffer. */
function render([seconds, layers]: Recipe, sampleRate: number) {
  const c = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  for (const [source, type, hz0, hz1, q, env] of layers) {
    const from = env[0][0], to = env[env.length - 1][0];
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(gainOf(env[0][1]), from);
    for (const [t, dB] of env.slice(1)) g.gain.exponentialRampToValueAtTime(gainOf(dB), t);
    g.gain.linearRampToValueAtTime(0, to + 0.005);
    g.connect(c.destination);
    if (!NOISE.includes(source)) {
      const o = c.createOscillator();
      o.type = source as OscillatorType;
      o.frequency.setValueAtTime(hz0, from);
      o.frequency.exponentialRampToValueAtTime(hz1, to);
      if (source === 'sawtooth' || source === 'square') {
        // The filter follows the pitch at q times it: a falling zap stays equally bright all the way down.
        const f = c.createBiquadFilter();
        f.type = type;
        f.frequency.setValueAtTime(Math.min(20000, hz0 * q), from);
        f.frequency.exponentialRampToValueAtTime(Math.min(20000, hz1 * q), to);
        o.connect(f).connect(g);
      } else o.connect(g);
      o.start();
      continue;
    }
    // Noise at RMS 1: white, brown (white through a 100 Hz one-pole lowpass) or crackle (mostly silence, a click now and then).
    const buf = c.createBuffer(1, c.length, sampleRate), d = buf.getChannelData(0), k = (2 * Math.PI * 100) / sampleRate;
    let lp = 0, sum = 0;
    for (let i = 0; i < d.length; i++) {
      const w = source === 'crackle' && Math.random() > CRACKLE_HZ / sampleRate ? 0 : Math.random() * 2 - 1;
      d[i] = source === 'brown' ? (lp += (w - lp) * k) : w;
      sum += d[i] * d[i];
    }
    const norm = 1 / Math.sqrt(sum / d.length || 1);
    for (let i = 0; i < d.length; i++) d[i] *= norm;
    const src = c.createBufferSource(), f = c.createBiquadFilter();
    src.buffer = buf;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(hz0, from);
    if (hz1 !== hz0) f.frequency.exponentialRampToValueAtTime(hz1, to);
    src.connect(f).connect(g);
    src.start();
  }
  return c.startRendering();
}

export function createSfx() {
  let ctx: AudioContext | null = null;
  let mix: GainNode, fx: GainNode, big: GainNode;
  let streak = 0, lastMeal = -1;
  const buffers: Record<string, AudioBuffer[]> = {};
  const last: Partial<Record<Sound, number>> = {}, took: Partial<Record<Sound, number>> = {};
  let voices: { priority: number; end: number; bus: GainNode; sources: AudioBufferSourceNode[] }[] = [];
  let enabled = true, held = false; // held: YouTube muted or paused the game
  let volume = 0.2, out: GainNode | undefined; // player volume, applied after the soft clipper so the mix keeps its character

  const unlock = () => {
    if (!ctx) {
      const c = (ctx = new AudioContext());
      // Output: a soft clipper (tanh), so a pile-up of loud sounds saturates instead of clipping hard.
      const ceiling = c.createWaveShaper(), curve = new Float32Array(1025);
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(HEADROOM * (i / 512 - 1)) / Math.tanh(HEADROOM);
      ceiling.curve = curve;
      out = c.createGain();
      out.gain.value = volume;
      ceiling.connect(out).connect(c.destination);
      const glue = c.createDynamicsCompressor(); // gentle glue, and a limiter for pile-ups
      glue.threshold.value = -10;
      glue.knee.value = 6;
      glue.ratio.value = 6;
      glue.attack.value = 0.003;
      glue.release.value = 0.15;
      glue.connect(ceiling);
      const cut = c.createBiquadFilter(), lift = c.createBiquadFilter();
      cut.type = 'highpass';
      cut.frequency.value = LOW_CUT;
      lift.type = 'peaking';
      [lift.frequency.value, lift.gain.value] = PRESENCE;
      mix = c.createGain();
      mix.gain.value = MASTER / HEADROOM; // the shaper only sees -1..1, so the headroom is made in front of it
      mix.connect(cut).connect(lift).connect(glue);
      // Exciter: the low end alone, saturated, with its fundamental removed: only the new harmonics are added.
      const low = c.createBiquadFilter(), drive = c.createWaveShaper(), high = c.createBiquadFilter(), ex = c.createGain();
      low.type = 'lowpass';
      low.frequency.value = 220;
      const dc = new Float32Array(257);
      for (let i = 0; i < dc.length; i++) dc[i] = Math.tanh(5 * (i / 128 - 1));
      drive.curve = dc;
      high.type = 'highpass';
      high.frequency.value = 180;
      ex.gain.value = EXCITE;
      mix.connect(low).connect(drive).connect(high).connect(ex).connect(glue);
      fx = c.createGain();
      big = c.createGain();
      fx.connect(mix);
      big.connect(mix);
      for (const [name, recipe] of Object.entries(RECIPES))
        Promise.all(Array.from({ length: recipe[1].some((l) => NOISE.includes(l[0])) ? VARIANTS : 1 }, () => render(recipe, c.sampleRate)))
          .then((b) => (buffers[name] = b))
          .catch((e) => console.warn(`sfx: ${name} failed to render`, e));
    }
    void (held ? ctx.suspend() : ctx.resume());
  };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);

  /**
   * `loud` 0..1; `pitch` 1 at the player's starting size, lower for bigger bodies; `pan` -1 (left)..1 (right).
   */
  function play(kind: Sound, loud: number, pitch: number, pan = 0) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const c = ctx, now = c.currentTime, all = CUES[kind], priority = PRIORITY[kind];
    const pick = all.length < 2 ? 0 : ((took[kind] ?? 0) + 1 + Math.floor(Math.random() * (all.length - 1))) % all.length, cue = all[pick];
    const v = clamp(loud, 0, 1) ** LOUDNESS;
    if (v * cue[0][1] <= MIN_GAIN || cue.some((p) => !buffers[p[0]])) return;
    if (now - (last[kind] ?? -1) < GAP[kind]) return;
    voices = voices.filter((o) => o.end > now);
    if (voices.length >= MAX_VOICES) {
      // Full: the least important voice (oldest first) makes room, unless it matters more than this one.
      const drop = voices.reduce((a, b) => (b.priority < a.priority ? b : a));
      if (drop.priority > priority) return;
      drop.bus.gain.setTargetAtTime(0, now, 0.01);
      drop.sources.forEach((s) => s.stop(now + 0.06));
      voices.splice(voices.indexOf(drop), 1);
    }
    last[kind] = now;
    took[kind] = pick;
    if (kind === 'eat') [streak, lastMeal] = [now - lastMeal < STREAK_S ? Math.min(STREAK_MAX, streak + 1) : 0, now];
    if (BIG.includes(kind)) {
      fx.gain.cancelScheduledValues(now);
      fx.gain.setTargetAtTime(DUCK, now, 0.02);
      fx.gain.setTargetAtTime(1, now + DUCK_HOLD, DUCK_BACK / 3);
    }

    const semis = (STEADY.includes(kind) ? 0 : SEMITONES * (Math.random() * 2 - 1)) + (kind === 'eat' ? streak : 0);
    const bend = clamp(pitch, 0.3, 2) ** SIZE * 2 ** (semis / 12);
    const bus = c.createGain(), panner = c.createStereoPanner();
    bus.gain.value = v * gainOf(VARY_DB * (Math.random() * 2 - 1));
    panner.pan.value = clamp(pan, -0.9, 0.9);
    bus.connect(panner);
    if (kind === 'boom') {
      // A crash far away loses its top end; `loud` is how close it was.
      const far = c.createBiquadFilter();
      far.type = 'lowpass';
      far.frequency.value = FAR_HZ * (NEAR_HZ / FAR_HZ) ** clamp(loud, 0, 1);
      panner.connect(far).connect(big);
    } else panner.connect(BIG.includes(kind) || UI.includes(kind) ? big : fx);

    let end = now;
    const sources = cue.map(([name, volume, rate]) => {
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = buffers[name][Math.floor(Math.random() * buffers[name].length)];
      src.playbackRate.value = rate * bend;
      const length = src.buffer.duration / (rate * bend);
      if (FALL[kind]) src.playbackRate.setValueAtTime(rate * bend, now).linearRampToValueAtTime(rate * bend * FALL[kind]!, now + length);
      g.gain.value = volume;
      src.connect(g).connect(bus);
      src.start(now);
      end = Math.max(end, now + length / (FALL[kind] ?? 1));
      return src;
    });
    voices.push({ priority, end, bus, sources });
  }

  /** A banner shows (ui/toast.ts): its sound, picked from the news key, title and sub. */
  function announce(title: string, sub: string, key: string | null, keep: boolean) {
    if (key && QUIET.has(key)) return;
    const kind: Sound = title.startsWith('Achievement') ? 'achieve'
      : SETBACK.has(key ?? title) || key?.startsWith('hit') ? 'setback'
      : title === 'Comet' ? 'comet'
      : keep ? 'milestone'
      : sub.startsWith('New tier') ? 'tier'
      : 'chime';
    play(kind, BANNER, 1);
  }

  const api = {
    play,
    announce,
    set enabled(v: boolean) {
      enabled = v;
    },
    /** Silences all output, sounds already playing included, until released. */
    set hold(v: boolean) {
      held = v;
      if (ctx) void (v ? ctx.suspend() : ctx.resume());
    },
    /** 0..1, linear gain on the final output. */
    set volume(v: number) {
      volume = v;
      if (out) out.gain.value = v;
    },
  };
  shared = api;
  return api;
}

export type Sfx = ReturnType<typeof createSfx>;
let shared: Sfx | undefined;
/** The game's one Sfx (made in main.ts), for modules not handed a kit; undefined in Node checks. */
export const sfx = () => shared;
