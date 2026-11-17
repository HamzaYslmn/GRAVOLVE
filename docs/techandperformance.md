# Tech and performance

Stack, drawing and baking, audio, budget, measured costs, tests. Code: `main.ts` (frame loop), `kit.ts`, `app/index.html`
(YouTube SDK), `render/`, `asteroid/sphere.ts` and `atlas.ts` (bakes), `star/look.ts`, `audio/sfx.ts`, `app/test/**`.
Target: browser first, frontend only, very many bodies, low-end hardware.

## Built

### Stack

- Vite + TypeScript + PixiJS 8, WebGL2 only (`preference: 'webgl'`), main thread, no Rust/WASM; render resolution ≤ 1.5 ×
  CSS px. Commands: `.claude/CLAUDE.md` → Stack and commands (`npm run build` = `tsc --noEmit && vite build --base=./`).
- **YouTube Playables:** SDK in `index.html`, a no-op elsewhere (`settings.ts` `yt`); cloud save (`loadCloud`, 0.5 s
  batches), pause stops the loop, its mute holds audio (`sfx.hold`): [hudandcontrols.md](hudandcontrols.md) → YouTube
  Playables.

### Architecture

- **One kit, one combat per run:** `main.ts` builds the `Kit` (input, glow, fx, canvas, sfx, field getter, camera view,
  game area) once; the run's combat starts with Age I pirates and the planet stage calls `combat.attach(moons)` at Age II;
  a respawn rebuilds both. Shared modules: `.claude/CLAUDE.md` → Conventions.
- **Kept apart on purpose:** field generation stays in `field.ts` (shared closures); the Age I guard moon (`asteroid/rival.ts`)
  and the civilization rival's rock moon (`rockMoon`) share almost nothing; the pirate fleet scatter stays beside per-ship
  `scan`/`clear` (the visible organised break the user asked for).

### Rendering

- **Backdrop** (`background.ts`): seeded sky in 512-unit chunks, far nebula baked on the GPU, near stars as sprites,
  parallax; one full-screen sprite (measured). Tint: [worldgen.md](worldgen.md) → Cosmic web.
- **Overlays** (`overlays.ts`): one 512² atlas (limb, steam deck, clouds, veil), +1 draw call. Shared bake `bake.ts`; glow,
  particles, flashes, popups, notes `fx.ts`.
- **Projectiles:** rounds ≤ 96 (`SHOTS`), rockets ≤ 12 (hulls normal layer, flames additive); `bolts.ts` `drawBolts` into
  one additive ParticleContainer, ≤ `MAX_GLOW` 400 quads (worst 327, `guns.test.ts`), +1 draw call.
- **Ships:** one ParticleContainer on the tech page, 1 draw call, plumes as quads (`SHIP_SCALE` 0.4 R a cell, `SHIP_MIN_PX`
  8 px). No drawing off screen.

### Baked once

| Bake | Size | Cost |
|---|---|---|
| Rock atlas: 128 rocks, 256 px | two mipmapped 2048² pages | ~130 ms, ~45 MB at startup (not re-run) |
| Well textures: 3 | — | ~23 ms (not re-run) |
| Tech page: ships (SVG, 128 × 80 cells), stations, shield veil and ripple, ring, dot, hex | 1024², mipmapped | 153 ms (before the pirate-art polish; re-measure) |
| Star page: 16 draws, white art tinted per star | 1024², mipmapped | not measured |

- **Spheres** (`sphere.ts`): ≤ 1 bake a frame (yours first), re-bake on 6% mass change, freed with their chunk; rough bodies
  never bake until molten; a debris piece ≤ 1 + 4 bakes. Your surface: a 256² bake per state, crossfaded 0.6 s.

### Audio

`audio/sfx.ts`: every sound synthesised from short recipes (noise, sine, triangle), rendered on the first gesture. No
files, no reverb or echo. 2–3 takes per event, never the same twice; per-kind gaps (shots 0.05 s, grind 0.12 s, Dyson
0.1 s); 12 voices with priority stealing; big moments duck gameplay (death / eaten / boom −8 dB), banners never ducked.
Sound toggle and volume (default 20%) gate everything.

| Event | Sound | Where |
|---|---|---|
| Eat, bounce, graze, shatter, eaten, death, crash | `eat`, `hit`, `crack`, `eaten`, `death`, `boom` | `feedback.ts`, `main.ts` |
| Moon captured / stolen; grip / ring lost; knocked loose; grind | `capture` / `steal`; `grip` / `snap`; `loose`; `grind` | `planet/moons.ts` |
| Guns; rockets | `shot`; `rocket`, `blast` | `combat.ts`, `rivals.ts` |
| Pirate light-speed jump | `warp` (0.9 s whine = the spool, then snap and whoosh; steady pitch) | `pirates.ts` |
| Ship built, shield level; shield hit | `launch`, `shield` (overwhelmed an octave down) | `civilization/stage.ts` |
| Star linked; Dyson panel | `link` over `boom`; `segment` | `star/stage.ts`, `dyson.ts` |
| Banners (`announce`) | `achieve`, `setback`, `comet`, `milestone`, `tier`, else `chime` | `sfx.ts` |

- Silent banners (`QUIET`): moon, stolen, lost, ground, starlink, swallow, starlost, pirates-jump. Off-screen threats are not
  voiced (danger is seen, never told). The old game's rules kept: ±1 semitone, gain = loud^0.5, pan by screen, bigger
  lower, skip below 0.04. Other bodies' hits heard only within `HEAR_R` 0.4 half-diagonal. Eat streaks climb a semitone
  (≤ 5); 25 Hz cut, presence lift, exciter, compressor-limiter, tanh clip.

### Budget

Field update ≤ ~0.6 ms at rest (1280×720), ≤ ~400 loaded bodies, ≤ 1 sphere bake a frame. Measure first:
`.claude/CLAUDE.md` → Performance.

### Measured costs

Latest per row; "not re-run" = measured once, code changed since.

| What | Number | Note |
|---|---|---|
| Bench, field | `field.update` at rest 0.333 ms, 446 bodies | 2026-11-16, machine not idle |
| Bench, nav | 30 home ships among 400 bodies 0.100 ms (p95 0.133) | 2026-11-16 |
| Bench, pirates | 14 ships, 400 bodies 0.136 ms mean | 2026-11-16 |
| Pirate shields and jumps | no measurable cost; 14 jumping: frame 1.75 ms mean (1.83 before) | 2026-11-17, not idle |
| Shield lattice | 4.1 µs a frame, 91 cells | 2026-11-16 |
| Field in the page | 0.30 ms at zoom 1.02, 0.36 at 0.24; frame CPU 0.48 / 0.70 ms (~475 bodies) | browser, 2026-11-14 |
| Gravity, broadphase | ~10 µs each at 440–470 bodies | 2026-11-14 |
| Wheel zoom-out | ~480–510 loaded at any zoom | 2026-11-14 |
| Debug biome map | ~0.06 ms a frame | 2026-11-14 |
| Field at 795k | 0.6 ms at rest; 1.0 / 2.2 ms (p95) at 100 D/s | not re-run |
| Chunk loading at speed | 0.4–2.0 ms a frame at 100–200 D/s, worst 15 ms | not re-run |
| Speed zoom 2× | 4,463 bodies, 9.8 ms | why it is capped at 1.6× (`VIEW_SPEED`) |
| `SPECK` cut | 2,158 → ~100 loaded at 152k | — |
| Draw calls | 7–14; civilization +3; 14–19 with a star | not re-run |
| Combat | frame CPU 0.59 → 0.99 ms | before 2026-11-15; not re-run |
| Star | link 1.30 → 1.53 ms; blue giant halo 1.57 vs 1.22 ms; star container 1 / 2 / 4 draw calls | not re-run |
| Rivals, civilization | `rivals.update` 0.06–0.09 ms; `civ.update` 0.10 ms | not re-run |
| Wells; moons; system planets | 0.01 ms (6 wells); 0.08 ms (4 moons); +0.06 ms (8 planets) | not re-run |
| Frame, dev desktop | 0.3–2.7 ms mean | low-end unmeasured |

Wins (measured): chunk range skip 0.54 → 0.05 ms; persistent sort-and-sweep broadphase; one-pass gravity sources.

### Testing

- Test files (`app/test/`, mirroring `src`): `core/{achievements,chunks,entity,orbits,score,water}`,
  `asteroid/{body,debris,field,rules,sphere,web}`, `planet/{capture,moons,rules}`,
  `civilization/{crowd,escape,flight,guns,lattice,mining,nav,orders,pirates,rules,slots}`, `rivals/ledger`, `star/rules`,
  `ui/{panel,tip}`. Procedure: `.claude/CLAUDE.md` → Testing.

## Planned

- Events director budget: ≤ 400 + 120 event bodies, ≤ 0.3 ms a frame ([gameevents.md](gameevents.md)). Ship art layers in
  one draw call. Low-end and touch pass on devices. Sounds for settings clicks, game over and DBG.

## Open issues

- **Dense belts at 316k–796k:** 650–980 loaded, ~1.9 ms (not re-run); the 2.5× orbit view 560 → 688 bodies, 2.7 → 3.6 ms.
- **Star camera cap** [D] (`STAR_VIEW`): too small for big stars, but the field loads ∝ view²; measure before widening.
- **SVG gradient warnings:** ~95 at the ship-page bake, gradients dropped.
- A 214 ms hitch at 399 s in the long playtest. Low-end hardware, device touch, GPU cost, star fill rate and a fresh
  tech-page bake are unmeasured.

## Decisions

- **Browser first, low-end hardware; measure before optimizing** (user). **No reverb or echo** (user). **No Rust/WASM.**
  **Background stays dim** (user).
