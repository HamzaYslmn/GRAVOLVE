import './styles/base.css';
import { Application, Container } from 'pixi.js';
import { createBackground, SPACE } from './render/background';
import { createFx, glowTexture } from './render/fx';
import { createSfx } from './audio/sfx';
import { rockAtlas } from './evolution/asteroid/atlas';
import { absorb, drop, type Body, type Hit } from './evolution/asteroid/body';
import { burnStreak, impactFeedback } from './evolution/asteroid/feedback';
import { createAsteroidField } from './evolution/asteroid/field';
import { BIOME_SKY, biomeNews, createHud, describe, noteHit, rosterNews } from './evolution/asteroid/hud';
import { createMinimap } from './ui/minimap';
import { createDebug } from './ui/debug';
import { createNews, toast, type News, type RunNews } from './ui/toast';
import { BROWN_DWARF_M, LIFE_S, tierIndex } from './evolution/planet/rules';
import { scoreOf } from './core/score';
import { AGE_GOAL, MOLTEN, TIERS } from './evolution/asteroid/rules';
import { createPlayer } from './evolution/asteroid/player';
import { createPlanetStage, MILESTONES, type PlanetStage } from './evolution/planet/stage';
import { createCombat, type Combat } from './evolution/civilization/combat';
import { createSpheres } from './evolution/asteroid/sphere';
import { createCamera } from './core/camera';
import { createInput } from './core/input';
import { bankScore, recordAge, sendBest, showGameOver, type RunStats } from './ui/gameover';
import { createSettings, DEBUG, flush, load, loadCloud, measureRefreshMs, save, yt } from './ui/settings';
import { createAchievements, type Snap } from './core/achievements';
import { createAchievementUi } from './ui/achievements';
import type { Motion } from './core/entity';
import { clamp } from './core/rng';
import type { Kit } from './kit';

const SEED = 292; // world seed: backdrop, asteroid field and rock shapes all derive from it

// ponytail: WebGL2 only. The bake shaders are GLSL; add WGSL versions if WebGPU is ever needed.
const app = new Application();
await app.init({
  preference: 'webgl',
  resizeTo: window,
  background: SPACE, // shown under chunks that haven't been baked yet
  antialias: false,
  resolution: Math.min(devicePixelRatio, 1.5), // full-res on 4K laptops costs more than it shows
  autoDensity: true,
});
document.body.appendChild(app.canvas);
await loadCloud(); // YouTube cloud save, before anything reads storage
sendBest(); // YouTube's score starts from the saved best

const glow = glowTexture();
const background = createBackground(app.renderer, SEED, glow);
const world = new Container();
app.stage.addChild(background.container, world);
const rockLayer = new Container();
const playerLayer = new Container();
const fx = createFx(glow);
world.addChild(rockLayer, playerLayer, fx.layer);

// Asteroids, player and camera. Zoom 1 = 1 world unit per CSS px.
const BASE_ZOOM = 1.02;
const START = { x: 0, y: 700 };
const atlas = rockAtlas(app.renderer, SEED);
const spheres = createSpheres(app.renderer); // big bodies round off into one baked sphere
const camera = createCamera(world, app.canvas, START, BASE_ZOOM);
// Screen px → world (the camera's centre and zoom; shake ignored): Fire and Command aim at what is under the pointer.
const input = createInput(app.canvas, (sx, sy) => ({ x: camera.state.x + (sx - app.screen.width / 2) / camera.state.zoom, y: camera.state.y + (sy - app.screen.height / 2) / camera.state.zoom }));
const sfx = createSfx();
// What Age II needs (planet/stage.ts: moons, reticle, combat: the field of this run, the camera, sound).
// The game area's half sizes (world units): your natural view, never shrunk by zooming in; spawns and ranges use it.
const gameArea = { halfW: 640, halfH: 360 };
const kit: Kit = { input, glow, fx, canvas: app.canvas, field: () => field, view: camera.state, area: gameArea, sfx };
const gameHud = createHud(input, app.canvas);
const minimap = DEBUG ? createMinimap() : undefined; // debug mode: biome map (settings)
// Debug mode (ui/debug.ts), localhost dev server only (settings DEBUG): one-click stage jumps and star helpers; a touched run saves no records.
const debugUi = DEBUG ? createDebug({ me: () => player.body, planet: () => planet, field: () => field, over: () => !!run.cause, touched: () => void (run.debug = true) }) : undefined;
// Achievements: a snapshot of what already exists about twice a second, plus moments from the hits.
const ach = createAchievements({ load: () => JSON.parse(load('ach') ?? '{}') ?? {}, save: (v) => save('ach', JSON.stringify(v)) });
const achUi = createAchievementUi(ach);
const ACH_S = 0.5; // s of wall time between snapshots
let achT = 0, achDt = 0, eater = 0; // eater: what ate you / your mass
let frozen = 0; // hit-stop: seconds of frozen game time left
let slowmo = 0; // seconds of slow motion left (a giant crash nearby)
const SLOW_RATE = 0.3; // game speed during slow motion
const HEAR_R = 0.4; // other bodies' hits are heard within this share of the screen's half-diagonal from you

// One run = a fresh player in a freshly spawned field. Dying shows the game over card after a beat,
// with the camera on whatever ate you; restarting rebuilds both in place.
const DEATH_BEAT = 1.4; // s between dying and the card
const CRUMBLE_M = TIERS[1][0]; // below a pebble you're just dust: the run ends
let player: ReturnType<typeof createPlayer>;
let field: ReturnType<typeof createAsteroidField>;
let run: {
  seconds: number; peak: number; meals: number; cause?: RunStats['cause']; detail: string; start: number; focus: Motion; card: number; aged: boolean; debug: boolean;
  ships: number; worlds: number; life: boolean; tier: number; linked: boolean; cover: number; // the score's (core/score.ts); ships: banked from combats before a respawn
};
let runs = 0; // each run gets its own field seed, so restarts are a fresh sky of rocks
let tier = 0; // your tier index, for the tier-up reward
let planet: PlanetStage | undefined; // Age II (evolution/planet): created at AGE_GOAL, gone with the run
// The run's combat (civilization/combat.ts): Age I's pirates, then Age II's driver and rivals once the planet stage attaches.
let combat: Combat;
let runNews: RunNews; // news latched once per run (a respawn starts fresh): toasts, achievements' seen keys
let news = biomeNews(); // biome names on arrival, fresh each run
let gone = rosterNews(); // named rivals lost, fresh each run
// Combat's news, counting rival worlds beaten for the score (rivals.ts says 'beaten' once per rival).
const say: News = (k, t, sub) => (k === 'beaten' && run.worlds++, runNews.say(k, t, sub));
// Enemy ships shot down by this combat (rival patrols shooting pirates near you count too).
const kills = () => combat.pirates.deaths.shot + combat.rivals.deaths.shot;
const runScore = () => scoreOf({ ...run, ships: run.ships + kills() });
/** The old player, planet stage and combat go; a fresh player at (x, y) with its own impact feedback and run news. */
function freshPlayer(x: number, y: number) {
  player?.destroy();
  planet = void planet?.destroy();
  combat?.destroy();
  achUi.closeGallery();
  player = createPlayer(playerLayer, atlas[0], glow, spheres, input.axis, x, y, () => planet?.moons.frame()); // frame: the touch assist
  feel = feelFor(player.body);
  runNews = createNews(MILESTONES);
  return player.body;
}
function startRun() {
  for (const c of rockLayer.removeChildren()) c.destroy({ children: true });
  gameHud.visible = true;
  ach.newRun();
  [achDt, eater] = [0, 0];
  const me = freshPlayer(START.x, START.y);
  run = { seconds: 0, peak: me.m, meals: 0, detail: '', start: me.m, focus: me.motion, card: 0, aged: false, debug: false, ships: 0, worlds: 0, life: false, tier: 0, linked: false, cover: 0 };
  tier = tierIndex(me.m);
  field = createAsteroidField(rockLayer, atlas, glow, spheres, SEED + 7919 * runs++, me, onHit, (b, x, y, ux, uy, whole) => burnStreak(fx, player.body, b, x, y, ux, uy, whole));
  news = biomeNews();
  gone = rosterNews();
  combat = createCombat(playerLayer, me, app.renderer, kit, say);
}
let feel: ReturnType<typeof impactFeedback>;
const feelFor = (me: Body) => impactFeedback(me, {
  fx, sfx, shake: camera.shake, kick: camera.kick, zoom: () => camera.state.zoom,
  freeze: (s) => (frozen = Math.max(frozen, s)),
  slow: (s) => (slowmo = Math.max(slowmo, s)),
  hear(x, y) { // heard only near you: full at your side, silent HEAR_R × the half-diagonal away, fading with the square
    const { width, height } = app.screen, c = camera.state, me = player.body.motion;
    const sx = (x - c.x) * c.zoom, d = Math.hypot(x - me.x, y - me.y) * c.zoom / (HEAR_R * Math.hypot(width, height) / 2);
    return { pan: clamp(sx / (width / 2), -1, 1) * 0.8, near: Math.max(0, 1 - d) ** 2 };
  },
});
function onHit(h: Hit) {
  const me = player.body; // read now: a respawn after Age I swaps the body
  feel(h);
  combat.hit(h); // rival worlds' shields and people
  if (h.a !== me) return;
  noteHit(h); // the speed gauge's hard-hit flash
  const p0 = planet?.life.progress;
  planet?.hit(h); // big impacts set life back
  if (h.kind === 'eat' || h.kind === 'accrete') run.meals++;
  // Achievement moments: a meal, a shatter, a life setback (Impact winter / Mass extinction), a heavier body broken to nothing.
  if (p0 !== undefined && planet!.life.progress < p0) ach.moment({ kind: 'setback' });
  if (h.kind === 'eat') ach.moment({ kind: 'eat', comet: !!h.b.comet, radio: h.b.comp.radio ?? 0 });
  if (h.shattered || h.destroyed) ach.moment({ kind: 'hurt' });
  if (me.m && !h.b.m && h.mb > me.m - h.gain) ach.moment({ kind: 'giant' });
  if (h.kind === 'eaten') eater = h.mb / -h.gain;
  if (me.m || run.cause) return;
  const at = `at ${h.speed.toFixed(1)} diam/s`;
  if (h.kind === 'eaten') run.focus = h.b.motion; // watch what ate you
  end(h.kind === 'eaten' ? 'eaten' : 'destroyed', h.kind === 'eaten' ? `Swallowed by ${describe(h.b)}, ${ratio(h.mb / -h.gain)}× your mass, touched ${at}`
    : h.b.meteor ? `Hit by a ${h.b.comet ? 'comet' : 'meteor'} ${at}` : `Smashed against ${describe({ ...h.b, m: h.mb })} ${at}`); // its mass before the hit: it may have been destroyed too
}
/** The run ends: the card after DEATH_BEAT. With `n`, you burst into n specks where you were (crumbled, a star). */
function end(cause: NonNullable<RunStats['cause']>, detail: string, n = 0, spread = 0, tint = 0, loud = 0, pitch = 1) {
  const me = player.body;
  if (n) {
    fx.burst(me.motion.x, me.motion.y, n, me.r * 0.5 + 1, me.r * spread, tint);
    sfx.play('death', loud, pitch);
    [me.m, me.view.visible] = [0, false];
  }
  [run.cause, run.detail, run.card, gameHud.visible] = [cause, detail, DEATH_BEAT, false];
}
/** A living colony of your star (star/colony.ts), if any. */
const colony = () => planet?.star?.planets.find((p) => p.life === 'colony' && p.b.m > 0)?.b;
/**
 * Death after Age I: a fresh molten body of AGE_GOAL mass and your composition, in the same field, at the spot 1–2 views
 * away with the most room from anything heavier; life starts over. `from`: a living colony (star/colony.ts) — play goes
 * on as that world with its people (star, Dyson sphere and moons stay behind).
 */
function respawn(from?: Body) {
  const old = player.body, c = camera.state, view = app.screen.width / c.zoom;
  const big = field.bodies.filter((b) => b.m > 0.5 * AGE_GOAL);
  let best = { x: c.x, y: c.y, room: -Infinity };
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, d = view * (1 + (i % 3) / 2), x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    const room = Math.min(Infinity, ...big.map((b) => Math.hypot(b.motion.x - x, b.motion.y - y) - b.r));
    if (room > best.room) best = { x, y, room };
  }
  run.ships += kills();
  const { x, y } = from?.motion ?? best, me = freshPlayer(x, y);
  absorb(me, (from?.m ?? AGE_GOAL * 1.01) - me.m, from?.comp ?? old.comp); // just past the line, so it reads Planetoid
  me.heat = from ? from.heat : MOLTEN + 2;
  if (from) {
    [me.diff, me.motion.vx, me.motion.vy] = [from.diff, from.motion.vx, from.motion.vy];
    drop(from);
  }
  ach.moment({ kind: 'respawn' });
  field.follow(me);
  combat = createCombat(playerLayer, me, app.renderer, kit, say);
  planet = createPlanetStage(playerLayer, me, app.renderer, kit, combat, runNews);
  if (from) planet.life.progress = LIFE_S * 1.5; // the colony's people carry on (life full, with its buffer)
  [run.cause, run.card, run.detail, run.focus, gameHud.visible] = [undefined, 0, '', me.motion, true];
  tier = tierIndex(me.m);
}
startRun();

// Frame cap. Unlimited drives the ticker from a MessageChannel loop instead of rAF.
let refreshMs = 1000 / 60; // replaced by the measured display interval below
let frameMs = 16.7; // smoothed, for the stats display
let frames = 0;
let unlimited = false;
let paused = false, looping = false; // paused: YouTube's onPause
const loop = new MessageChannel();
loop.port1.onmessage = () => {
  if (!unlimited || paused || (!yt && document.hidden)) return void (looping = false); // resumed by kick
  app.ticker.update();
  loop.port2.postMessage(0);
};
const kick = () => unlimited && !paused && !looping && ((looping = true), loop.port2.postMessage(0));
/** Runs the frame loop by the cap, or holds it while paused. */
const drive = () => {
  if (paused || unlimited) app.ticker.stop();
  else app.ticker.start();
  kick();
};
if (!yt) document.addEventListener('visibilitychange', kick); // YouTube pauses through its SDK only

// Runs in the background so startup isn't blocked; the game plays at VSync until it resolves.
const hud = document.getElementById('hud')!;
measureRefreshMs().then((ms) => {
  refreshMs = ms;
  createSettings({
    onCap(cap) {
      unlimited = cap === 'unlimited';
      // A cap at/above the display rate would only drop jittery frames, so it falls back to VSync.
      app.ticker.maxFPS = typeof cap === 'number' && 1000 / cap > refreshMs * 1.05 ? cap : 0;
      drive();
    },
    onStats: (show) => (hud.hidden = !show),
    onSound: (on) => (sfx.enabled = on),
    onVolume: (v) => (sfx.volume = v),
    onDebug: (on) => void (minimap && (minimap.visible = on), debugUi && (debugUi.visible = on)),
    achievements: { label: achUi.label, open: achUi.toggleGallery },
  });
});

const ratio = (r: number) => (r >= 10 ? r.toFixed(0) : r.toFixed(1));

/** One achievements snapshot (core/achievements.ts) from what exists now; unlocks are toasted in a quiet moment. */
function checkAchievements(near: Body[]) {
  if (run.debug) return void ((achDt = 0), ach.ages()); // a debug run unlocks nothing and sets no bests
  const me = player.body, w = planet?.state, alive = !run.cause && me.m > 0, p = me.motion;
  const seen = planet?.seen; // the planet stage's news keys
  const s: Snap = {
    t: run.seconds, dt: achDt, m: alive ? me.m : 0, comp: me.comp, comet: !!me.comet, speed: Math.hypot(p.vx, p.vy) / (2 * me.r), web: field.webHere(),
    shadow: alive && near.some((b) => b.m >= 20 * me.m && Math.hypot(b.motion.x - p.x, b.motion.y - p.y) <= 3 * b.r),
    world: w && {
      water: w.water, waterShare: w.waterShare, life: w.life, lifeSpeed: w.lifeSpeed, envelope: w.envelope, moons: w.moons, slots: w.slots,
      magnet: w.scores.magnet, star: w.star, seen: (k) => !!seen?.has(k),
    },
  };
  achDt = 0;
  achUi.announce(ach.tick(s));
  for (const [age, t] of ach.ages()) recordAge(age as 1 | 2 | 3, t);
  achUi.pump(!!run.cause);
}

app.ticker.add((ticker) => {
  debugUi?.step(ticker.deltaMS / 1000);
  const { width, height } = app.screen;
  let dt = Math.min(ticker.deltaMS / 1000, 1 / 20); // a stall shouldn't teleport the player
  if (frozen > 0) [frozen, dt] = [frozen - dt, 0];
  else if (slowmo > 0) [slowmo, dt] = [slowmo - dt, dt * SLOW_RATE];
  const { zoom } = camera.state;
  const pv = player.body.motion, reach = Math.max(2.5 * Math.hypot(width, height) / 2 / zoom, 3 * Math.hypot(pv.vx, pv.vy)); // world units: the screen and a bit beyond, or 3 s of your flight
  const near = field.around(reach);
  planet?.before(); // Age II tracks the steam the player's update boils off
  spheres.begin(); // a new frame's bake budget: your own sphere bakes first, the field gets what is left
  const c = camera.state, hw = width / 2 / zoom, hh = height / 2 / zoom;
  player.update(dt, zoom, near, (b) => Math.abs(b.motion.x - c.x) < hw + b.r && Math.abs(b.motion.y - c.y) < hh + b.r);
  planet?.update(dt, Math.min(ticker.deltaMS / 1000, 0.25), near, zoom, () => player.aim()?.target); // moons, climate, life, your HUD card, sky
  if (!planet) combat.update(dt, near, zoom, () => undefined, -1, undefined); // Age II: the planet stage drives it
  const me = player.body;
  // Chipped below a pebble (the size-relative rules break down at mass 1-3), or a star tore you apart / you fell in.
  if (!run.cause && me.m > 0 && me.m < CRUMBLE_M) end('crumbled', 'Chipped down to dust by hard bounces', 30, 3, 0x9a8f80, 0.6, 1.5);
  if (!run.cause && planet?.fate) end('star', planet.fate, 40, 4, 0xffc890, 0.8, 0.8);
  for (const b of [me, ...near]) {
    // Comet tails (yours and the world's): vapour left behind, drifting slower, so it streams out behind the path.
    if (!b.comet || !b.m || Math.random() > dt * 40) continue;
    const j = () => (Math.random() - 0.5) * b.r * 0.8;
    fx.trail(b.motion.x + j(), b.motion.y + j(), b.motion.vx * 0.35 + j(), b.motion.vy * 0.35 + j(), b.r * 0.5, 0x9fe8ff);
  }
  if (!run.cause) news(field.biomeHere(), ticker.deltaMS / 1000);
  gameHud.update(ticker.deltaMS / 1000, player.body, player.aim(), planet?.moons.inspect(), world);
  if (!run.cause) gone(field.roster);
  if (!run.cause) {
    run.seconds += dt;
    run.peak = Math.max(run.peak, player.body.m);
    const w = planet?.state; // milestones for the score, kept through a respawn
    if (w) {
      run.life ||= w.life === 0 || (w.envelope && me.m >= BROWN_DWARF_M);
      run.tier = Math.max(run.tier, w.civ?.active ? w.civ.tier : 0);
      run.linked ||= !!w.star?.owned;
      run.cover = Math.max(run.cover, w.star?.owned ? w.star.cover : 0);
    }
    const now = tierIndex(me.m); // Age I tiers, then Age II's mass steps (planet/rules.ts)
    // Age I tier up: a few seconds of clearing your neighbourhood, small bodies spiral in (field.harvest). Not in Age II,
    // where nothing merges by a hit: it would only pull a bombardment onto you.
    if (now > tier && me.m < AGE_GOAL) field.harvest(3);
    tier = Math.max(tier, now);
    if (!run.aged && me.m >= AGE_GOAL) {
      // Age I ends without stopping the game: the body transforms. Its own gravity melts it through
      // (molten: metal sinks to a core over ~20 s, the sphere smooths), with a flash,
      // a dust ring and a boom, then play goes on toward Protoplanet. The HUD toasts the path.
      run.aged = true;
      ach.moment({ kind: 'aged', t: run.seconds, comp: { ...me.comp } });
      planet = createPlanetStage(playerLayer, me, app.renderer, kit, combat, runNews); // Age II takes over: climate, life, your HUD card
      me.heat = Math.max(me.heat, MOLTEN + 2);
      const { x, y } = me.motion;
      fx.flash(x, y, me.r * 1.5, 24, me.r * 4); // brief, inside the disc: a planet never reads as a star
      fx.burst(x, y, 24, me.r * 0.15, me.r * 4, 0x9a8a78); // grey-brown dust thrown out, not a warm glow on the world
      sfx.play('boom', 1, 0.8);
      camera.shake(0.5);
      slowmo = Math.max(slowmo, 0.8);
    }
  } else if (run.card > 0 && (run.card -= dt) <= 0 && colony()) {
    respawn(colony()); // your world is gone but a colony lives: game over is the last living planet
    toast('Your colony carries on', 'Your people live on another world · link a star again');
  } else if (run.card <= 0 && run.card > -1 && run.cause) {
    run.card = -1; // the card once
    const progress = clamp(Math.log(run.peak / run.start) / Math.log(AGE_GOAL / run.start), 0, 1); // in log mass
    ach.moment({ kind: 'death', cause: run.cause, ratio: run.cause === 'eaten' ? eater : 0 });
    checkAchievements(near); // the card shows what this death unlocked
    showGameOver({ cause: run.cause, detail: run.detail, seconds: run.seconds, peak: run.peak, meals: run.meals, score: runScore(), progress, achievements: achUi.row(), onGallery: achUi.toggleGallery, debug: run.debug }, startRun, run.aged ? () => respawn() : undefined);
  }
  achDt += dt;
  if ((achT += ticker.deltaMS / 1000) >= ACH_S && !run.cause) {
    achT = 0;
    checkAchievements(near);
  }
  // A star near you: pull back to keep it in the picture (evolution/star), at most STAR_VIEW× your own view (the field loads ∝ view²).
  // In orbit (planet.focus: your star) up to 2.5×, so your world's orbit stays clear of the HUD panels across the link band.
  const fit = planet?.fit() ?? 0, look = player.view(), orbiting = !run.cause && planet?.focus(), STAR_VIEW = orbiting ? 2.5 : 1.6;
  const view = Math.max(look, Math.min(STAR_VIEW * look, (fit * BASE_ZOOM) / (Math.max(width, height) / 2)));
  camera.follow(orbiting || run.focus, dt, width, height, view, Math.min(ticker.deltaMS / 1000, 1 / 20));
  // The game area is your natural view (wheel zoom-in only changes what you see; zoomed out, it is what you see), so nothing
  // spawns at your side because you zoomed in. Rockets and ships meet bodies after the field's own collisions.
  const area = Math.min(zoom, BASE_ZOOM / view);
  [gameArea.halfW, gameArea.halfH] = [width / 2 / area, height / 2 / area];
  field.update(camera.state, gameArea.halfW, gameArea.halfH, dt, (d) => combat.contacts(d), Math.max(width, height) / 2 / (BASE_ZOOM / view)); // the margin: your natural view, not the zoomed-out one
  minimap?.update(player.body.motion, gameArea.halfW, gameArea.halfH, field.biomeAt);
  fx.update(dt);
  background.update({ width, height, x: world.x, y: world.y, scale: world.scale.x, base: BASE_ZOOM, web: field.webHere(), tint: BIOME_SKY[field.biomeHere()] }); // voids look dark, biomes tint the sky
  if (ticker.elapsedMS < 100) frameMs += (ticker.elapsedMS - frameMs) * 0.05; // a stall or a throttled tab isn't a frame
  if (++frames % 30 === 0 && !hud.hidden) hud.textContent = `GRAVOLVE\nfps    ${(1000 / frameMs).toFixed(0)}\nrocks  ${near.length}\nmass   ${me.m.toFixed(1)}`;
});
// YouTube Playables: pause and mute come from YouTube; ready once the first frame is up and input is live.
if (yt) {
  let audio = yt.system.isAudioEnabled();
  const sync = () => {
    sfx.hold = paused || !audio;
    drive();
  };
  yt.system.onAudioEnabledChange((on) => ((audio = on), sync()));
  yt.system.onPause(() => ((paused = true), sync(), bankScore(runScore().total, run.debug), flush()));
  yt.system.onResume(() => ((paused = false), sync()));
  sync();
  const { game } = yt;
  app.ticker.addOnce(() => (game.firstFrameReady(), game.gameReady()));
}
// Dev test hook: scripted tests tick the game manually through it.
if (import.meta.env.DEV) (window as any).__g = () => ({ player, field, run, camera, gameHud, app, spheres, planet, input, combat });
