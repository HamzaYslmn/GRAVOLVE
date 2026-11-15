# Tech and performance

The stack, how drawing and baking work, audio, the frame budget, every measured cost, and how to test. Code:
`render/` (`background.ts`, `bake.ts`, `fx.ts`, `overlays.ts`, `tech.ts`), `evolution/asteroid/sphere.ts` and
`atlas.ts` (bakes), `evolution/star/look.ts` (star page, 1024²), `audio/sfx.ts`, `main.ts` (frame loop), and the `app/test/**/*.test.ts`
files run by `npm test`. Target: browser first, frontend only, very many bodies, low-end hardware.

## Built

### Stack

- Vite + TypeScript + PixiJS 8 (WebGL2), main thread only. All game code is TypeScript; no Rust/WASM.
- In `app/`: `npm run dev`, `npm run build` (`tsc --noEmit` + `vite build`), `npm test` (the Node `app/test/**/*.test.ts` files, in parallel), `npm run bench` (cost asserts, idle machine).
- Frame loop in `main.ts`: `spheres.begin()` runs before the field update, so sphere bakes happen in the real frame only.
- One world `SEED` in `main.ts` drives backdrop, field and rock shapes; each run derives its own field seed.

### Architecture (DRY / KISS / YAGNI pass, 2026-11-14)

- **One kit, one combat per run.** `main.ts` builds the `Kit` (`kit.ts`: input, glow, fx, canvas, sfx, the field getter, the camera, the game area) once; every stage takes it, with no optional fields or getter wrappers. The run's combat (`civilization/combat.ts`) starts with Age I's pirates; at Age II the planet stage calls `combat.attach(moons, news)` instead of building a second one, so pirates fly on (Age I's fleet no longer retires). A respawn destroys both and builds them fresh; `rivals.destroy()` now also drops each rival world's body (before, a respawn left it in the field unmanaged).
- **Shared modules** (one copy each; CLAUDE.md → Conventions lists them): HUD throttle and DOM helpers `ui/panel.ts`; news latch `ui/toast.ts` `createNews`; weapon readout `ui/reticle.ts` `createReadout`; storage `ui/settings.ts` `load`/`save`; heat units `core/water.ts` `K_PER_HEAT`/`heatOfK`; `body.ts` `drop`/`hitKelvin`; the field's `bodies`; `flight.ts` `bearing`; `nav.ts` `homeStep`; `guns.ts` `nearest`; `crash.ts` `bump`; `ships.ts` `foeOf`/`dropLost`; `view.ts` `shieldLook` (your shield and rivals'); `weapon.ts` `breakMark`; combat `Ctx.wreck`; `star/system.ts` `ride`; the Dyson builder in `star/dyson.ts`. Life is one threshold, `planet/rules.ts` `LIFE_S`.
- **Kept apart on purpose:** the field's generation stays in `field.ts` (it shares about a dozen closures with the spawners; a split would pass a big context around), in-file `heap()` and `enter()` helpers instead; the field rival's guard moon (`asteroid/rival.ts` `tendMoon`: intercepts threats) and the civilization rival's rock (`rivals.ts` `rockMoon`: hold, throw) share only two lines; the pirates' fleet scatter stays beside per-ship `scan`/`clear`: it is the visible organised break the user asked for ("proper evasive maneuvers"), not just collision avoidance.
- **Follow-ups (same day):** Age I combat takes no moons (`combat.ts` `NO_MOONS`, a typed empty view, no cast); debug mode is one module (`ui/debug.ts`: panel, actions, stage-jump step; main.ts passes getters); the unused `drawn` particle-count hooks are gone (combat, civilization, view).
- **Check:** the first run's world (fixed field seed, 120 manual ticks) fingerprints the same before and after the pass: 440 bodies, hash −1213147338 (measured in the browser).

### Rendering

- **Backdrop** (`render/background.ts`): seeded sky in 512-unit chunks; far nebula baked on the GPU, near stars as sprites. Parallax slides depth × the world's on-screen motion (world units made a grown player's sky race); the sky shrinks only zoom^(depth/4). Cost = one full-screen sprite (measured). Biome sky tint and void dimming: [worldgen.md](worldgen.md) → Cosmic web.
- **Overlays** (`render/overlays.ts`): one 512² atlas: limb (alpha 0.7·smoothstep(−2, 0.48, log10 p)), steam deck (thin over lava so a hot world stays dark red), clouds. +1 draw call.
- **Shared bake code** `render/bake.ts` (shader + quad); glow texture, particles, flashes and popups `render/fx.ts`. Ship engine plumes are quads in the ships' own ParticleContainer (`render/tech.ts` `drawShip`); rounds share one pool (`guns.ts` `createShots`, ≤ 96). Bolts, muzzle flashes, beam ends and charging glows: one additive ParticleContainer over the ships (`combat.ts`, `guns.ts` `BOLT`, ≤ `MAX_GLOW` 400 quads, worst case ≈ 262 computed), +1 draw call (structural).
- **Ships** draw from one ParticleContainer on the tech page: 200 ships = 1 draw call (measured before the tech ladder went); the civilization adds +3 draw calls. Ships are world-sized with a screen floor (`render/tech.ts` `SHIP_SCALE` 0.4 of your radius a fleet cell, `SHIP_MIN_PX` 8 px a cell) ([shipsandflight.md](shipsandflight.md)).
- **No drawing off screen.**

### Baked once

| Bake | Size | Cost | Owner doc |
|---|---|---|---|
| Rock atlas: 128 rocks, 256 px | two mipmapped 2048² pages | ~130 ms, ~45 MB at startup | [asteroidgameplay.md](asteroidgameplay.md) (shapes) |
| Well textures: 3, pooled sprites | — | ~23 ms | [asteroidgameplay.md](asteroidgameplay.md) (Age I play) |
| Tech page: ships (3 factions, SVG via Pixi `Graphics.svg`, 128 × 80 cells), stations, shield veil and ripple, ring, dot, hex (the shield lattice's cell, 64 px at 320, 256) | 1024², mipmapped | 149 → 153 ms with the SVG ship art (measured, noise; before the polish pass that gave pirates ~2–2.7× the elements, no time recorded since); 24.6 ms at the civilization's first frame (measured before the ship-art page). The bake logs ~95 Pixi warnings "[SVG parser] <defs>/<linearGradient>… unsupported" and drops the gradient fills (playtest) | [shipsandflight.md](shipsandflight.md) |
| Star page: 16 one-time draws, white art tinted per star (photosphere ×3, granulation ×2, corona ×2, limb, halo, haze, flare, far light, shadow, Dyson panel, hauler, dot) | 1024², mipmapped (4 MiB + mips) | — | [stargameplay.md](stargameplay.md) |

- **Spheres** (`sphere.ts`): ≤ 1 bake a frame (yours first), re-bake on 6% mass change, textures freed with their chunk. Rough bodies (comets, fragments under 10^3.5 mass, loot, caught rock piles: `rules.ts` `bakes`) never bake until molten; a rough body ≥ 10^3.5 mass runs one more branch a frame (meals sinking in), structural. A debris piece ≥ 10^3.5 mass (`Body.jag`) costs 1 bake plus one per rounding step (≤ 4) over its life, still ≤ 1 a frame: measured on a 2e5 planet shattered in Age II, 5–6 bakes over the next 6 frames, then 4 per forced step, never 2 in a frame; field update median 0.1 ms, p95 0.3 ms (32 bodies, 300 manual ticks). Your surface in Age II: one 256² bake per state, crossfaded 0.6 s.

### Audio

`audio/sfx.ts`: every sound is synthesised from short recipes (noise, sine and triangle layers), rendered once on the
first gesture (noisy recipes 3 times, tonal ones once); no files, no reverb or echo. Each event sound has 2–3 takes
(different notes or sweeps), never the same take twice running. A per-kind gap rate-limits repeats (shots 0.05 s, grind
0.12 s, Dyson clinks 0.1 s), 12 voices with priority stealing, big moments duck gameplay sounds, banners are never ducked.
Sound toggle and volume (settings) gate everything. Files without a kit reach the sound player through `sfx()`.

| Event | Sound (takes) | Where |
|---|---|---|
| Eat, bounce, graze, shatter, eaten, death, big crash | `eat`, `hit`, `crack`, `eaten`, `death`, `boom` (as before) | `asteroid/feedback.ts`, `main.ts` |
| Moon captured / stolen | `capture` (3: whoosh, settle, rising chime) / `steal` (2: brighter arpeggio) | `planet/moons.ts` addMoon |
| Capture: the grip bites / a ring past 30% lost, an order not taken | `grip` (3: fwip and pluck) / `snap` (2: falling pluck) | moons.ts update |
| Moon knocked loose | `loose` (2: two falling notes) | moons.ts |
| Moon grind / last crumbs | `grind` (grit bursts while held) / `eat` | moons.ts |
| Gun bursts, energy beam | `shot` (3: one to three blaster bolts, sawtooth zaps diving in pitch; frigate guns lower), `beam` (2: heavy cannon bolt, zaps a fifth apart, sub hit, buzz) | `civilization/combat.ts` |
| Ship or frigate built, shield level | `launch` (2: ignition thump, engine roar fading out), `shield` | `civilization/stage.ts` |
| Shield takes a hit / overwhelmed | `shield` (3: thump, short zap, falling force-field hum) / the same, an octave down | civilization/stage.ts hit |
| Star linked | `link` (2: slow warm chord) over `boom` | `star/stage.ts` |
| Dyson panel placed | `segment` (3: small far clink) | `star/dyson.ts` |
| Banners (`ui/toast.ts` → `announce`, when shown) | achievement `achieve` (2), setback `setback` (2: impact, extinction, radiation, shield overwhelmed…), Comet `comet`, milestone `milestone` (3), new tier `tier` (3), any other news `chime` (3); silent where the event already sounded (moon, stolen, lost, robbed, pulled, ground, starlink, swallow, starlost) | `audio/sfx.ts` QUIET, SETBACK |

Not voiced on purpose: off-screen threats (pirates arriving, meteors): danger is seen, never told; their banners get the
plain chime. Pirates cracking rocks keep `crack` (`pirates.ts`, left alone while it was being edited).

- Synthesised, no files: the old game's four samples were measured and rebuilt as noise/sine recipes with filters and dB envelopes, 3 variants each, rendered on the first key or tap.
- Old game's rules: ±1 semitone, gain = loud^0.5, pan by screen, bigger bodies lower, skip below 0.04, 12 voices with priorities.
- Other bodies' hits are heard only near you: closeness (1 − d / (0.4 × half-diagonal))², measured from you (`main.ts` `HEAR_R`). Your own crumb hits are quieter: × min(1, 0.25 + 10 × crumb share of you).
- Mix: eat streaks climb a semitone (≤ 5), crack/death sag, ±1.5 dB, death/eaten/boom duck −8 dB, 25 Hz cut, presence lift, parallel exciter for small speakers, compressor-limiter, tanh soft clip; volume is linear after the clipper. Volume default 20% (settings, [hudandcontrols.md](hudandcontrols.md)).

### Budget

- Field update ≤ ~0.6 ms at rest (1280×720), ≤ ~400 loaded bodies, ≤ 1 sphere bake a frame.
- Measure first: time the cheapest case, find fixed per-frame overhead before tuning. Label every claim measured or structural; drop changes with no measurable gain. Prefer config and one-line fixes, and deleting code, over new modules.

### Measured costs

| What | Number | Note |
|---|---|---|
| Frame cost, dev desktop | 0.3–2.7 ms mean (measured) | low-end hardware unmeasured |
| Age I field update | 0.1–0.6 ms (measured earlier); 0.8 ms p50 with 440+ loaded bodies at rest (playtest, 1280×720) | the playtest number is over the 0.6 ms / 400-body budget; no baseline from before waves 2–4 |
| Field update at 795k | 0.6 ms at rest; at 100 D/s 1.0 ms mean / 2.2 ms p95 (measured) | |
| Draw calls | 7–14; +3 civilization; 14–19 with a star (measured before the star visuals overhaul, which kept the star's own calls unchanged) | |
| Combat (civilization) | draw calls 14.9 → 15.7, frame CPU 0.59 → 0.99 ms (measured) | weapon visuals (2026-11-14): +1 draw call, typical fight ~50 glow quads; browser frame cost not yet measured (Node bench unchanged: nav 0.114 → 0.112 ms, pirates.update 0.180 → 0.148 ms, noise) |
| Star link | draw calls 13 → 14–19; frame CPU 1.30 → 1.53 ms while linking (measured) | before the visuals overhaul |
| Star visuals ([C]) | star container draw calls unchanged: 1 far, 2 linking, 4 with Dyson + linking; frame CPU no measurable difference (sun 1.39 vs 1.49 ms old, blue giant 1.25 vs 1.26, red dwarf 1.02 vs 0.91; noise ±0.1 ms, machine loaded); GPU for the star (timer query median) red dwarf 0.03 vs 0.09 ms old, sun 0.04 vs 0.10, blue giant 0.18 vs 0.12 (measured) | 12 sprites a star, one batch, all normal blend |
| Pirates ([B]) | 17-ship fleet, 477 bodies: pirate update 0.54 ms/frame, contacts 0.17 ms; idle 0.02 ms each (measured) | no baseline for the old code |
| Shared ship helpers ([M]) | pirate + rival flight 250–271 → 182–192 µs a frame (17 ships, 400 bodies, same checksum; computed in Node) | `flight.ts` `obstacle`, `skirt` (since replaced by `scan` + `clear`), `touch`, `approach`, `nearest`, `Bolt` |
| Pirate redesign (2026-11-14) | `pirates.update` 0.13 ms mean, 0.22 ms p95 for 14 ships among 400 bodies (Node, `pirates.test.ts` cost line); a cheap box bound first in `scan`: 0.16 → 0.12–0.13 ms (Node bench). Not measured in the browser | target was ≤ 0.15 ms; the bodies near the fleet are filtered once a frame by reach at their speed |
| Rival civilizations ([J]) | `rivals.update` 0.06–0.09 ms (measured) | stances, waves, bolts |
| Civilization with roaming miners ([G]) | `civ.update` 0.10 ms median (measured) | survey every 2 s |
| System planets ([I]) | 8 carried planets ≈ +0.06 ms field update (measured; noise) | kinematic rings, the existing 0.25 s tick |
| Wells | ~0.01 ms with 6 wells vs 0.3–0.6 ms as vector circles (measured) | pooled sprites |
| Moons | 0.08 ms with 4 moons (measured) | |
| Biome lookups | ~2 µs/frame | the meteor belt loads the most rocks (784 vs 447 at the start, field update ~1.4–1.9× the start, measured before the spacing change; knob `METEOR_FILL`) |
| `SPECK` cut (nothing below 0.001 × you) | loaded bodies at 152k mass 2,158 → ~100 (measured) | [worldgen.md](worldgen.md) → Spawn masses |
| Speed zoom | 2× loaded 4,463 bodies, 9.8 ms a frame (measured) | why speed zoom is capped at 1.6× |

**Wins:** chunk range skip 0.54 → 0.05 ms; sort-and-sweep broadphase 1.0–1.2 → 0.3 ms at ~1000 bodies; no drawing
off screen, render CPU 0.85 → 0.45 ms (all measured). In `field.ts`: one-pass sorted `SOURCES` ~7× cheaper than a full
sort a frame; the persistent broadphase insertion sort ~6× faster than a fresh sort, same contacts (A/B in Node).

**Biggest cost left:** gravity, ~1.0 ms at ~1000 bodies. Tried, no measurable gain: dropping the per-pair Map lookup,
a shared empty cell array, a two-level grid, capping your pull's reach.

### Testing

- `npm test` runs the Node tests in `app/test/` in parallel (`core/*`, `asteroid/rules`, `asteroid/web`, `rivals/ledger`, `planet/{rules,capture,moons}`, `civilization/{rules,flight,guns,nav,crowd,pirates,mining,lattice,orders}`, `star/rules`); `npm run bench` runs the cost asserts (idle machine). Run `npm test` and `npm run build` after changes; compare the failure set, not just the count.
- The built-in browser pane freezes a page while it is hidden, which looks exactly like a hang in scripted soaks. Measure only while the pane is visible, and tick manually through the dev-only hook `window.__g()` (player, field, run, camera, gameHud, app, spheres, planet, input, combat: the run's combat). Dev test hooks also exist on the civilization (`contact`: star contact; `mining`: each miner's site), the planet stage (`life`), the star stage (`planets`, `stars`) and the rivals (`spawn`, `deaths`).
- A manual tick that calls only `field.update` gets no sphere bakes: `spheres.begin()` runs in `main.ts`'s frame.
- Mute audio in test tabs by patching `AudioContext.prototype.resume` to suspend; never through the user's settings.
- Test tabs share `localStorage` with the player: don't pollute `gravolve.best`, `gravolve.ach`, `gravolve.hints`; restore them if a run writes them. An open game page keeps achievements in memory and re-saves them: edit storage, then reload the page at once. A debug-mode run saves no records ([hudandcontrols.md](hudandcontrols.md#debug-mode)).

## Planned

- **Events director budget:** loaded bodies ≤ 400 + 120 event bodies at peak, event sprites ≤ 300 (ships share the 200-ship container), event CPU ≤ 0.3 ms mean per frame at 1280×720, director bookkeeping ≤ 0.02 ms (structural; rules in [gameevents.md](gameevents.md)).
- **Ship art layers:** tendency layers and light/flare dots stay in the same container, still one draw call (structural; [shipsandflight.md](shipsandflight.md)).
- **Low-end and touch pass** on real devices (roadmap item 7, [vision.md](vision.md#roadmap)): fill rate with a star at half screen, dense belts at 316k+, the 214 ms hitch.
- **Audio:** settings clicks, game-over and DBG have no sounds of their own (death already plays at game over).

## Field cost (2026-11-14)
- Gravity uses reused typed arrays for pull and source rank instead of two Maps a frame: identical results (max |Δv| = 0), 0.115 → 0.079 ms for 440 bodies (measured, Node A/B). Chunk release stores rocks in one pass a frame instead of one pass per released chunk. A moving load range scans only its new strips when the last range loaded fully: 2.5–3× cheaper scan (Node A/B), no gain while the budget runs out.
- In the page at the start (1280×720, 440 bodies, ticks by hand): field update 0.40–0.43 ms (gravity 0.14, body loop 0.12, broadphase and the rest 0.15), whole frame ~0.65–0.7 ms CPU. Earlier the same day 0.92–1.01 ms, but on a busier machine (the unchanged body loop also read 0.19–0.26), so only the A/B numbers above are clean.
- Renderers and animations: everything outside the field is ~0.25 ms of CPU at rest; nothing to cut there without a measured target. GPU not measured.
- Debug biome map (`ui/minimap.ts`, user report 2026-11-14: 240 → 170–180 fps with it on): it did 224 biome lookups (2.38 µs each, measured) and 224 one-pixel canvas fills a frame, plus two style writes a frame (style recalc). Now a pixel buffer with one putImageData, a full pass every 0.5 s whatever the frame rate, styles only when they move: lookups 0.53 → ~0.06 ms a frame at 240 fps, drawing 134–163 → 2–3 µs (measured, off-screen canvas A/B).
- Collisions and gravity, second pass (2026-11-14), each A/B'd in Node with identical results:
  - Broadphase keeps last frame's order (a list of bodies, insertion-sorted: bodies barely move) instead of a fresh sort a frame, and a body's chunk key is rebuilt only when it changes chunk: 61 → 10 µs at 440 bodies, 149 → 25 µs at 880 (same contacts).
  - Gravity picks its 24 sources with one pass and a short sorted list instead of sorting every body by mass, and each source visits only bodies within its reach (a window of the broadphase order): 76–79 → 10 µs at 470 bodies, 163 → 22 µs at 880 (max |Δv| = 0). A body new this frame gets its first pull a frame late.
  - Sphere updates return at once for rocks too small to round (most of them).
  - In the page after all of it (start size, ~475 bodies, ticks by hand): field 0.30 ms at zoom 1.02, 0.36 ms at 0.24 (0.62–0.68 / 0.74 ms earlier the same session); frame CPU 0.48 / 0.70 ms. Section split before the last two changes: gravity 117, body loop 107, broadphase + collisions 44, rehome 36 µs.
- Wheel zoom-out: the loaded area used to grow with the square of the view (fixed 2-chunk margin round a bigger view): 437 → 873 bodies, frame 1.1 → 2.6 ms at zoom 0.236. Now the margin shrinks as the view grows: loaded bodies stay ~480–510 at any zoom-out, frame 0.6 ms normal vs 0.7–0.78 ms at 4× out (measured, ticks by hand, one run).
- A/B against commit 43d7f1c at the start of Age I (same tab, 240 Hz pane, debug map on in both): both held 240 fps, whole-frame CPU 1.31 ms there vs 1.36–1.55 ms here with more bodies loaded (different run seed; the user was also steering). GPU 0.6 vs 0.65 ms (timer query), the same.

## Open issues

- **Dense belts at 316k–796k:** 650–980 loaded, ~1.9 ms. The 2.5× orbit view: 560 → 688 bodies, 2.7 → 3.6 ms; drop to 1.6× if low-end suffers.
- **[D] Star camera cap** (`STAR_VIEW` 1.6× on approach, 2.5× in orbit): too small for big stars (in orbit 8 suns at 12 R★ need ~6 U of view), but the field loads ∝ view², so widening it needs a measurement first ([stargameplay.md](stargameplay.md) → Open issues).
- **Age I field budget overrun** (playtest): field update 0.8 ms p50 with 440+ loaded bodies at rest at 1280×720, over the 0.6 ms / 400-body budget. The baseline before waves 2–4 is unknown, so it is not known whether they caused it.
- **SVG gradient warnings:** the ship-page bake (`render/tech.ts` `Graphics().svg`) logs ~95 "[SVG parser] <defs>/<linearGradient>… unsupported" warnings and the ships lose their gradient fills ([shipsandflight.md](shipsandflight.md#rendering)).
- A 214 ms hitch at 399 s in the long playtest; cause unknown.
- Low-end hardware, touch on a device and star fill rate on low-end are unmeasured.
- Test tabs share `localStorage` with the player.
- The tech page bake has two measurements (24.6 ms and 149–153 ms) from before and after the 1024² ship-art page; re-measure once.

## Decisions

- **Browser first, low-end hardware. Measure before optimizing** (user).
- **No reverb or echo** in audio (user).
- **No Rust/WASM:** all game code in TypeScript on the main thread (the old galaxy test was deleted).
- **Background stays dim;** gameplay objects are the brightest, crispest things (user).
