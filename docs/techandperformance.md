# Tech and performance

The stack, drawing and baking, audio, the frame budget, measured costs and testing. Code: `main.ts` (frame loop),
`kit.ts`, `app/index.html` (YouTube SDK), `render/` (`background.ts`, `bake.ts`, `fx.ts`, `overlays.ts`, `tech.ts`),
`evolution/asteroid/sphere.ts` and `atlas.ts` (bakes), `evolution/star/look.ts` (star page), `evolution/civilization/bolts.ts`
(projectiles), `audio/sfx.ts`, and the `app/test/**` files. Target: browser first, frontend only, very many bodies,
low-end hardware.

## Built

### Stack

- Vite + TypeScript + PixiJS 8, WebGL2 only (`preference: 'webgl'`), main thread only. No Rust/WASM. Render resolution ≤ 1.5 × CSS px (`main.ts`).
- In `app/`: `npm run dev`; `npm run build` (`tsc --noEmit && vite build --base=./`); `npm test` (every `test/**/*.test.ts` with `node --test`, in parallel); `npm run bench` (the nav, pirates and field cost lines with their limits; idle machine only).
- **YouTube Playables:** the SDK loads in `index.html` and is a no-op elsewhere (`ui/settings.ts` `yt`). On YouTube, storage is its cloud save (`loadCloud`, saves batched 0.5 s, flushed on pause); YouTube's pause stops the frame loop and banks the run score; its mute holds all audio (`sfx.hold`); the best score is sent (`ui/gameover.ts` `sendBest`). Details: hudandcontrols.md → YouTube Playables.
- One world `SEED` in `main.ts` drives backdrop, field and rock shapes; each run derives its own field seed.

### Architecture

- **One kit, one combat per run.** `main.ts` builds the `Kit` (`kit.ts`: input, glow, fx, canvas, sfx, the field getter, the camera view, the game area) once; every stage takes it. The run's combat (`civilization/combat.ts`) starts with Age I's pirates; at Age II the planet stage calls `combat.attach(moons)` instead of building a second one. A respawn destroys both and builds them fresh.
- **Shared modules:** one copy each; `.claude/CLAUDE.md` → Conventions lists them.
- **Kept apart on purpose:** field generation stays in `field.ts` (it shares many closures with the spawners); the field rival's guard moon (`asteroid/rival.ts`) and the civilization rival's rock moon (`rivals.ts` `rockMoon`, which only holds it) share almost nothing; the pirates' fleet scatter stays beside per-ship `scan`/`clear`, since it is the visible organised break the user asked for.

### Rendering

- **Backdrop** (`render/background.ts`): seeded sky in 512-unit chunks; far nebula baked on the GPU, near stars as sprites; parallax by depth. Cost = one full-screen sprite (measured). Biome tint and void dimming: worldgen.md → Cosmic web.
- **Overlays** (`render/overlays.ts`): one 512² atlas (limb, steam deck, clouds, steam veil); +1 draw call.
- **Shared bake code** `render/bake.ts` (shader + quad); glow texture, particles, flashes, popups and notes `render/fx.ts`.
- **Projectiles:** rounds share one pool (`guns.ts` `SHOTS` ≤ 96); rockets ≤ 12 in flight (hulls on the normal layer, flames additive). Bolts, flashes and glows are drawn by `civilization/bolts.ts` `drawBolts` into one additive ParticleContainer, ≤ `MAX_GLOW` 400 quads (worst case 327, `guns.test.ts`), +1 draw call (structural).
- **Ships** draw from one ParticleContainer on the tech page (1 draw call for all ships, structural); engine plumes are quads in it. Ships are world-sized with a screen floor (`render/tech.ts` `SHIP_SCALE` 0.4 of your radius a fleet cell, `SHIP_MIN_PX` 8 px a cell); see shipsandflight.md.
- **No drawing off screen.**

### Baked once

| Bake | Size | Cost | Owner doc |
|---|---|---|---|
| Rock atlas: 128 rocks, 256 px | two mipmapped 2048² pages | ~130 ms, ~45 MB at startup (measured, not re-run) | asteroidgameplay.md |
| Well textures: 3, pooled sprites | — | ~23 ms (measured, not re-run) | asteroidgameplay.md |
| Tech page: ships (3 factions, SVG via Pixi `Graphics.svg`, 128 × 80 cells), stations, shield veil and ripple, ring, dot, hex | 1024², mipmapped | 153 ms (measured before the pirate-art polish; re-measure) | shipsandflight.md |
| Star page: 16 one-time draws, white art tinted per star | 1024², mipmapped (4 MiB + mips) | not measured | stargameplay.md |

- **Spheres** (`sphere.ts`): ≤ 1 bake a frame (yours first), re-bake on a 6% mass change, textures freed with their chunk. Rough bodies never bake until molten. A heavy debris piece costs 1 bake plus one per rounding step (≤ 4), still ≤ 1 a frame (measured, not re-run). Your Age II surface: one 256² bake per state, crossfaded over 0.6 s.

### Audio

`audio/sfx.ts`: every sound is synthesised from short recipes (noise, sine, triangle), rendered on the first gesture
(noisy recipes 3 times, tonal ones once). No files, no reverb or echo. Each event sound has 2–3 takes, never the same
twice running. A per-kind gap limits repeats (shots 0.05 s, grind 0.12 s, Dyson clinks 0.1 s); 12 voices with priority
stealing; big moments duck gameplay sounds; banners are never ducked. Sound toggle and volume gate everything (on
YouTube, its mute).

| Event | Sound | Where |
|---|---|---|
| Eat, bounce, graze, shatter, eaten, death, big crash | `eat`, `hit`, `crack`, `eaten`, `death`, `boom` | `asteroid/feedback.ts`, `main.ts` |
| Moon captured / stolen | `capture` / `steal` | `planet/moons.ts` |
| Capture grip bites / a ring lost | `grip` / `snap` | `planet/moons.ts` |
| Moon knocked loose; grind | `loose`; `grind` (last crumbs `eat`) | `planet/moons.ts` |
| Guns; rockets | `shot`; `rocket`, `blast` | `civilization/combat.ts`, `rivals.ts` |
| A pirate jumps to light speed | `warp` (0.9 s whine = the spool, then snap and whoosh; steady pitch) | `civilization/pirates.ts` |
| Ship built, shield level; shield hit | `launch`, `shield`; `shield` (overwhelmed an octave down) | `civilization/stage.ts` |
| Star linked; Dyson panel | `link` over `boom`; `segment` | `star/stage.ts`, `star/dyson.ts` |
| Banners (`ui/toast.ts` → `announce`) | `achieve`, `setback`, `comet`, `milestone`, `tier`, else `chime` | `audio/sfx.ts` |

- Silent banners (`QUIET`): moon, stolen, lost, ground, starlink, swallow, starlost (the event already sounded). Setback banners: the `SETBACK` keys plus any key starting "hit".
- Not voiced on purpose: off-screen threats (pirates arriving, meteors); danger is seen, never told.
- The old game's four samples were rebuilt as recipes; its rules kept: ±1 semitone, gain = loud^0.5, pan by screen, bigger bodies lower, skip below 0.04, 12 voices.
- Other bodies' hits are heard only near you (`main.ts` `HEAR_R` 0.4 of the half-diagonal).
- Mix: eat streaks climb a semitone (≤ 5); death / eaten / boom duck −8 dB; 25 Hz cut, presence lift, exciter, compressor-limiter, tanh soft clip. Volume default 20%.

### Budget

- Field update ≤ ~0.6 ms at rest (1280×720), ≤ ~400 loaded bodies, ≤ 1 sphere bake a frame.
- Measure first: time the cheapest case, find fixed per-frame overhead before tuning. Label every claim; drop changes with no measurable gain.

### Measured costs

Latest number per row. "Not re-run" = measured once, code has changed since.

| What | Number | Note |
|---|---|---|
| `npm run bench`, field | `field.update` at rest 0.333 ms, 446 bodies (limit ~0.6) | Node, 2026-11-16, machine not idle |
| `npm run bench`, nav | 30 home ships among 400 bodies 0.100 ms (p95 0.133), +2.8 µs a ship for steering | Node, 2026-11-16, machine not idle |
| `npm run bench`, pirates | `pirates.update`, 14 ships, 400 bodies: 0.136 ms mean, 0.223 p95 | Node, 2026-11-16, machine not idle |
| Pirate shields and jumps | `pirates.update` 0.29–0.30 ms vs 0.32–0.39 ms at the last commit, runs interleaved on the same busy machine: no measurable cost; browser full frame with all 14 jumping 1.75 ms mean (p95 3.0) vs 1.83 (3.6) just before; ≤ 7 additive quads a ship | 2026-11-17, machine not idle |
| Shield lattice | 4.1 µs a frame, 91 cells (`lattice.test.ts` cost line) | Node, 2026-11-16 |
| Field in the page | 0.30 ms at zoom 1.02, 0.36 ms at 0.24; frame CPU 0.48 / 0.70 ms (~475 bodies) | browser, 2026-11-14 |
| Gravity, broadphase | ~10 µs each at 440–470 bodies | Node, 2026-11-14 |
| Wheel zoom-out | loaded bodies stay ~480–510 at any zoom-out | browser, 2026-11-14 |
| Debug biome map | ~0.06 ms a frame (one pass every 0.5 s) | 2026-11-14 |
| Field at 795k mass | 0.6 ms at rest; 1.0 ms mean / 2.2 ms p95 at 100 D/s | not re-run |
| Chunk loading at speed | 0.4–2.0 ms of chunk work a frame at 100–200 D/s, worst frame 15 ms (1e5 mass) | not re-run |
| Speed zoom | 2× loaded 4,463 bodies, 9.8 ms a frame | why speed zoom is capped at 1.6× (`player.ts` `VIEW_SPEED`) |
| `SPECK` cut | loaded bodies at 152k mass 2,158 → ~100 | worldgen.md → Spawn masses |
| Draw calls | 7–14; civilization +3; 14–19 with a star | not re-run |
| Combat | draw calls 14.9 → 15.7, frame CPU 0.59 → 0.99 ms | before the 2026-11-15 weapons overhaul; not re-run |
| Star | link: frame CPU 1.30 → 1.53 ms; blue giant halo filling the screen: frame 1.57 ms mean vs 1.22 with no star, field 0.19 ms; at 1e6 red dwarf 1.82 ms, blue giant 1.50 ms | not re-run |
| Star visuals [C] | star container 1 / 2 / 4 draw calls (far / linking / Dyson); frame CPU no measurable change; GPU 0.03–0.18 ms a star | not re-run |
| Rivals, civilization | `rivals.update` 0.06–0.09 ms; `civ.update` 0.10 ms median | not re-run |
| System planets | 8 carried ≈ +0.06 ms field update (noise) | not re-run |
| Wells | ~0.01 ms with 6 wells (0.3–0.6 ms as vector circles) | not re-run |
| Moons | 0.08 ms with 4 moons | before the capture rework |
| Frame, dev desktop | 0.3–2.7 ms mean | low-end unmeasured |

**Wins** (measured): chunk range skip 0.54 → 0.05 ms; persistent sort-and-sweep broadphase; gravity with 24 sources
picked in one pass; no drawing off screen.

### Testing

- `npm test` and `npm run build` after changes; compare the failure set, not just the count.
- Tests in `app/test/`, mirroring `src`: `core/{achievements,chunks,entity,orbits,score,water}`, `asteroid/{debris,field,rules,sphere,web}`, `planet/{capture,moons,rules}`, `civilization/{crowd,escape,flight,guns,lattice,mining,nav,orders,pirates,rules,slots}`, `rivals/ledger`, `star/rules`. Shared helpers `test/helpers.ts` and fakes `test/civilization/fakes.ts`. While working, run one file: `node test/<area>/<x>.test.ts`.
- The built-in browser pane freezes a page while it is hidden, which looks exactly like a hang in scripted soaks. Measure only while the pane is visible, and tick manually through the dev-only hook `window.__g()` (player, field, run, camera, gameHud, app, spheres, planet, input, combat); `__g().app.ticker.update(t)` ticks a hidden page, and a hidden pane has width 0 (set a viewport).
- Dev test hooks: civilization `contact`, `order(t)`, `priority`, `foeAt(p, pad)`, `gain(ore, vol, fuel)`, `shieldTake`; planet `life`; `moons.catching()`; `spheres.bakes`; `combat.rivals.spawn/attack/beat`, `combat.pirates.launch/attack`, `combat.bumps`; field `clash()` (Age I only).
- A manual tick that calls only `field.update` gets no sphere bakes: `spheres.begin()` runs in `main.ts`'s frame.
- Mute audio in test tabs by patching `AudioContext.prototype.resume` to suspend; never through the user's settings.
- Test tabs share `localStorage` with the user: don't pollute `gravolve.best`, `gravolve.ach`, `gravolve.hints`; restore them if a run writes them. An open game page keeps achievements in memory and re-saves them: edit storage, then reload at once. A debug run saves no records (hudandcontrols.md → Debug mode).

## Planned

- **Events director budget:** ≤ 400 + 120 event bodies at peak, event CPU ≤ 0.3 ms mean a frame at 1280×720 (structural; gameevents.md). Not built.
- **Ship art layers** in the same container, still one draw call (structural; shipsandflight.md).
- **Low-end and touch pass** on real devices (vision.md → Roadmap).
- **Audio:** settings clicks, game over and DBG have no sounds of their own.

## Open issues

- **Dense belts at 316k–796k:** 650–980 loaded, ~1.9 ms (not re-run). The 2.5× orbit view: 560 → 688 bodies, 2.7 → 3.6 ms.
- **Star camera cap** [D] (`main.ts` `STAR_VIEW` 1.6× on approach, 2.5× in orbit): too small for big stars, but the field loads ∝ view², so widening it needs a measurement first (stargameplay.md → Open issues).
- **SVG gradient warnings:** the ship-page bake logs ~95 "[SVG parser] … unsupported" warnings and drops gradient fills (shipsandflight.md).
- A 214 ms hitch at 399 s in the long playtest; cause unknown.
- Low-end hardware, touch on a device, GPU cost and star fill rate are unmeasured.
- The tech page bake needs one fresh measurement.

## Decisions

- **Browser first, low-end hardware. Measure before optimizing** (user).
- **No reverb or echo** in audio (user).
- **No Rust/WASM:** all game code in TypeScript on the main thread.
- **Background stays dim;** gameplay objects are the brightest, crispest things (user).
