# World generation

The field every stage flies through: chunks from the run seed, spawn masses, named biomes, region maps, the cosmic web
and voids, places. Code: `evolution/asteroid/field.ts` (spawning, chunks, places), `asteroid/web.ts` (web, biomes, kind
mixes, moving groups; pure, `web.test.ts`), `core/chunks.ts`, `render/background.ts`, `asteroid/hud.ts` `BIOME_SKY`. One
world `SEED` in `main.ts` drives backdrop, field and rock shapes; each run derives its own field seed. "Screen" = a
1280×720 view at the start zoom. Not here: meteors, comets, clash ([gameevents.md](gameevents.md)); rival cores
([aliencivilizations.md](aliencivilizations.md)); stars ([stargameplay.md](stargameplay.md)); bodies and collisions
([asteroidgameplay.md](asteroidgameplay.md)). Labels: [README.md](README.md).

## Built

### Chunks

- 1200 units, generated once, stored on unload (Pixi objects kept, ~1 KB a rock), restored on load; only loaded chunks
  simulate.
- The view is the game area: your natural view, never shrunk by zooming in (`gameArea`); combat and the star stage use it
  too (user, 2026-11-14: zoomed in, rivals and pirates spawned next to you).
- Loaded = view + a natural half-view per side (≥ 2 chunks), unloaded half a margin further; load ahead 2 s of motion
  (≤ 1.5 half-views); on-screen chunks at once, the rest ≤ 16 per 1/60 s. `chunks.ts` refuses > 1e9 or > 40k chunks. 0
  holes at 200 D/s (2026-11-14).
- Start: 160 units clear, nothing heavier within 900, HOME 3000 full, the web forced on within 6–12k.

### Spawn masses

- **Belt:** N(>m) ∝ m^-0.6 up to M_MAX 10^4; floor max(0.02 × start × (you/start)^0.45, 0.001 × you). Below 0.001 × you
  (`SPECK`) nothing spawns, no fragment is made, loaded rocks are dropped. Past M_MAX × (you / M_MAX)^-0.25 (`THIN`).
- Protoplanets 0.5% (2,000–10^4, round). Radioactive 3% of single rocks, green cast and strong green glow (user).
- **Tail** above M_MAX: N(>q) = 0.43 · min(1, (you/550)^-0.34) · q^-0.6 per screen, q in [max(0.01, M_MAX/you), 1.15];
  nothing in it can eat you; `THIN` is the late-tier pace knob.
- **Encounters:** 0.25 per screen at 1.5–6× you; rare things roll per screen (chance / scale^1.6); big things drift, never
  aimed.
- **Piles:** at 300–1000 mass half are rubble piles, 15% of those contact binaries; elsewhere 12–50% by mass.
- **Motion:** shared drifts where it spawns (belt flow, rapids, moving group) plus 4–26 start units/s × √scale scatter.

### Biomes

`web.ts` `place` / `biomeAt`, checked in order: start area (belt) → void (web < 0.1) → Kuiper → rapids → meteor belt →
the strongest material region above 0.5 → belt.

| Biome | Name | Kinds [rock, metal, ice, gas] (`kindMix`) | Map share |
|---|---|---|---|
| belt | Stone Drift | .78 / .08 / .11 / .03 | 40–41% |
| ice | Frost Reach | .12 / .03 / .75 / .10; world comets × 1.75 (user, 2026-11-14) | 4.2–4.4% |
| metal | Iron Graveyard | .25 / .65 / .05 / .05 | 2.1–2.6% |
| gas | Veil Nebula | .12 / 0 / .30 / .58 | 2.1–2.3% |
| kuiper | Kuiper Rim | .12 / .15 / .67 / .06 (user: more metal, the old star's cores) | 5.3–6.0% |
| rapids | Swift Current | belt mix | 2.1–2.4% |
| meteors | Firefall Belt | belt mix | 2.3–2.8% |
| void | The Hollow | near-empty | 40% |

Shares: `web.test.ts`, 3 seeds, 2026-11-16.

- **Kuiper belt:** every void's rim (web 0.1–0.7 with a void within 2.5–5k). Lore (user): an old star swept the space
  clean. Sparse, slow (× 0.35), big icy bodies (slope 0.45), comets × 3, radioactive 15% of single rocks (the dead star).
- **Rapids:** ridge bands on filaments flowing at 9 start D/s × √scale, scatter × 2; ride by matching, crossing hurts;
  rocks leaving downstream come back upstream off screen (`recycle`).
- **Meteor belt:** ridge bands, fill ≥ 0.4 then × 1.6, slope 1.0, meteors × 4 inside (user, 2026-11-14).
- **Moving clusters** (`groupDrift`, ~1600 region units): half still, half drifting together at 10–25 start units/s.
- **Names:** a toast after 0.5 s in a new biome (the first silent, not again within 40 s, `biomeNews`); subtitles describe,
  never warn.
- **Spacing:** one special place at a time; overlaps fade to plain belt (`CLEAR` 0.01–0.1); material regions keep clear of
  voids (`shore`, web 0.1–0.4). Map scales 42k / 90k / 60k units; band cuts 0.91–0.93; region cuts metal 0.6, ice 0.55, gas
  0.6. Median 5.2 screens of plain belt between biomes, 0 of 1463 touching (2026-11-16).

### Regions

- Density = belts × clumps × richness 0.2–1.8 × web; plain Stone Drift keeps half (`PLAIN_FILL` 0.5); the start stays full.
  Belts flow (`BELT_FLOW` 30 u/s at start size). Palettes: basalt, rust, carbon, pale, slate.
- Maps are read at (x, y)/S, S = scale^0.8 in half-octave steps; each chunk keeps its S, so the map never swaps under you.

### Cosmic web

- web = smoothstep(0.72, 0.87, 1 − |2·fbm(x/40000) − 1|); density × web, void floor 0.002, filaments × 1.3. Voids 40% of
  the map, median ~17 start screens wide (2026-11-16).
- Tail and Age I rivals × max(0.15, web); discoveries, encounters, giants × max(0.3, web). Rival civilizations and their
  pace: [aliencivilizations.md](aliencivilizations.md) → Rival civilizations.
- **Sky:** dims in voids; each biome tints it (eased 1.5 s): nebulae 28% toward its hue plus a 0.09 × saturation wash. Ice
  blue, metal steel, gas amber, rapids teal, meteors ember, Kuiper pale green ([techandperformance.md](techandperformance.md)).

### Places

- **Discoveries** (0.12 per screen): swarm, moonlets (a 1.2–4× body with small orbiting rocks), stream (ice debris led by
  a comet). **Asteroid fields** (0.06, filaments): 60–150 bodies over 1.5–3 views, 60% one kind, 1–2 cores of 0.5–3×.
  **Giants** (0.02): 20–200× you, ≤ 0.05 D/s, 8–23 moonlets. None within 2 × 900 units of the start.
- **Spawn cap:** every spawn ≤ `GIANT_MAX` 0.9e7 (below a brown dwarf); merges can pass it, the size cap holds 500 u.
- Mining sites use these places (no special accretion disks): [civilizationgameplay.md](civilizationgameplay.md) → Mining AI.

## Planned

- **Real disks:** rings of debris round large bodies, or keep using existing places. **Events spawn API** beyond
  `field.spawn` and `field.clash()` ([gameevents.md](gameevents.md)).

## Open issues

- Region seams between chunks made at very different sizes unchecked. Giants are round (`bakes`). No wider voids in
  Age II. The meteor belt loads the most rocks (784 vs 447; knob `METEOR_FILL`). Parked worlds and infall:
  [vision.md](vision.md) → Open issues.

## Decisions

Standing: [README.md](README.md). Field ones:

- **Absolute spawn masses** plus a thin tail: small rocks common, something bigger now and then, planets never rain or fly
  at you. **Fast things are small, big things drift.** Background stays dim.
- Biomes feel different and are named (calm toast), several screens of plain belt between two.
- Voids are an old star's swept space ringed by a Kuiper belt (more metal, 15% radioactive); some groups still, some drift.
- Radioactive rocks: green cast, strong glow. Plain Stone Drift keeps half its rock. Web cut 0.72–0.87. Sky wash 0.09,
  nebulae 28%.
