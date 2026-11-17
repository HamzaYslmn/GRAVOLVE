# World generation

The field every stage flies through: chunks streamed from the run seed, the mass of what spawns, the named biomes, the
region maps, the cosmic web and its voids, and the places worth finding. Code: `evolution/asteroid/field.ts` (spawning,
chunks, places), `asteroid/web.ts` (web, biomes, kind mixes, moving groups; pure, checked by `web.test.ts`),
`core/chunks.ts`, `render/background.ts` and `asteroid/hud.ts` `BIOME_SKY` (the sky). One world `SEED` in `main.ts`
drives the backdrop, the field and rock shapes; each run derives its own field seed. "Screen" = a 1280×720 view at the
start zoom. Labels: [README.md](README.md).

Not here: meteors, comets and the giant clash ([gameevents.md](gameevents.md)); rival cores
([aliencivilizations.md](aliencivilizations.md)); stars ([stargameplay.md](stargameplay.md)); what bodies are and how they
collide ([asteroidgameplay.md](asteroidgameplay.md)).

## Built

### Chunks

- 1200 units each, generated once from the run seed, stored on unload, restored on load; only loaded chunks simulate. Stored chunks keep their Pixi objects (~1 KB per rock).
- The view here is the game area: your natural view, never shrunk by zooming in (`main.ts` `gameArea`). Combat (`combat.ts` `cam.halfW`) and the star stage use it too (user, 2026-11-14: zoomed in, rival worlds and pirates spawned right next to you).
- Loaded = view + one natural half-view per side (≥ 2 chunks); unload half a margin further. Zoomed out (down to 0.25), the margin shrinks to one chunk at least.
- Load ahead 2 s of your motion (≤ 1.5 half-views). On-screen chunks load at once, the rest ≤ 16 per 1/60 s, nearest first. `chunks.ts` refuses > 1e9 or > 40k chunks.
- Measured 2026-11-14: 0 holes in the view at 200 D/s and 60 fps (`core/chunks.test.ts`); zoomed out, loaded bodies 478 → 480–508.
- Start: 160 units clear, nothing heavier than you within 900, HOME 3000 always full, the web forced on within 6–12k.

### Spawn masses

- **Belt:** N(>m) ∝ m^-0.6 up to M_MAX 10^4. Floor at generation: max(0.02 × start mass × (you/start)^0.45, 0.001 × you). Below 0.001 × you (`SPECK`, under a pixel once you are big) nothing spawns, no fragment is made and loaded rocks are dropped.
- Past M_MAX the belt count is × (you / M_MAX)^-0.25 (`THIN`): 0.51 at 150k, 0.32 at 1M.
- Protoplanets 0.5% of spawns (2,000–10^4, round). Radioactive 3% of single rocks, with a green cast and a strong green glow (user).
- **Tail** above M_MAX: N(>q) = 0.43 · min(1, (you/550)^-0.34) · q^-0.6 per screen, q = mass/you in [max(0.01, M_MAX/you), 1.15]. Empty below ~8.7k; nothing in it can eat you. The thin factor is the knob for late-tier pace.
- **Encounters:** 0.25 per screen at 1.5–6× you. Rare things roll per screen (chance / scale^1.6). Big things drift at belt speed, never aimed.
- **Piles:** between 300 and 1000 mass half the bodies are old rubble piles, 15% of those contact binaries; outside that range the chance grows with mass relative to you (12–50%).
- **Motion:** each rock takes the shared drifts of where it spawns (belt flow, rapids, its moving group) plus its own scatter of 4–26 start units/s × √scale.

### Biomes

`web.ts` `place` / `biomeAt`. One per place, checked in order: start area (always belt) → void (web < 0.1) → Kuiper
belt → rapids → meteor belt → the strongest material region above 0.5 → belt.

| Biome | Name | Kind shares [rock, metal, ice, gas] (`kindMix`) | Map share |
|---|---|---|---|
| belt | Stone Drift | .78 / .08 / .11 / .03 | 40–41% |
| ice | Frost Reach | .12 / .03 / .75 / .10; world comets × 1.75 (user, 2026-11-14) | 4.2–4.4% |
| metal | Iron Graveyard | .25 / .65 / .05 / .05 | 2.1–2.6% |
| gas | Veil Nebula | .12 / 0 / .30 / .58 | 2.1–2.3% |
| kuiper | Kuiper Rim | .12 / .15 / .67 / .06 (user: more metal, the old star's cores) | 5.3–6.0% |
| rapids | Swift Current | belt mix | 2.1–2.4% |
| meteors | Firefall Belt | belt mix | 2.3–2.8% |
| void | The Hollow | belt mix, near-empty | 40% |

Map shares: `web.test.ts`, 3 seeds, 2026-11-16.

- **Kuiper belt:** the rim of every void (web 0.1–0.7 with a void within 2.5–5k units). Lore (user): a star formed there long ago and swept the space clean. Sparse but never empty, slow (motion × 0.35), more big icy bodies (slope 0.45), world comets × 3, radioactive rocks 15% of single rocks (the dead star's remains, user).
- **Rapids:** thin ridge bands on filaments; everything flows along the band at 9 start D/s × √scale, scatter × 2. Ride it by matching speed; crossing it hurts. Rocks that leave downstream come back upstream off screen (`recycle`), so a parked player's rapids don't drain.
- **Meteor belt:** thin ridge bands; fill ≥ 0.4 then × 1.6, slope 1.0 (more small rocks), meteors × 4 while inside (user, 2026-11-14).
- **Moving clusters** (`groupDrift`): irregular cells of ~1600 region units; half stand still, the rest drift together at 10–25 start units/s (own scatter × 0.2), on top of belt flow.
- **Names:** a toast after 0.5 s in a new biome; the run's first is silent; the same one not again within 40 s (`hud.ts` `biomeNews`). Subtitles describe the place, never warn.
- **Spacing:** one special place at a time: where two overlap, both fade into plain belt (`CLEAR` 0.01–0.1 of the runner-up), and material regions keep clear of voids (`shore`, web 0.1–0.4). Region maps 42k, rapids 90k, meteor bands 60k world units per noise unit; band cuts 0.91–0.93; region cuts metal 0.6, ice 0.55, gas 0.6. Measured along straight lines (`web.test.ts`, 2026-11-16): median 5.2 screens of plain belt between two biomes, 0 of 1463 touching; 99.1–99.6% of Kuiper spots border a void.

### Regions

- Density (`web.ts`) = belts × clumps × richness 0.2–1.8 × web. Plain Stone Drift keeps half of it (`PLAIN_FILL` 0.5, user: too crowded); the start area stays full. Belts flow (`BELT_FLOW` 30 u/s at start size). Mineral palettes: basalt, rust, carbon, pale, slate.
- Maps are read at (x, y)/S, S = scale^0.8 in half-octave steps, so regions span about as many screens at every size. S only grows within a run, and each chunk keeps the S it was made at, so the map never swaps under you.

### Cosmic web

- web = smoothstep(0.72, 0.87, 1 − |2·fbm(x/40000) − 1|); density × web, void floor 0.002, filaments × 1.3.
- Measured (`web.test.ts`, 2026-11-16): voids 40% of the map, median 16.5–17.3 start screens wide, quartiles ~9–28.
- Tail and rivals × max(0.15, web); discoveries, encounters and giants × max(0.3, web). Rival civilizations arrive by distance × local fill (`civilization/rules.ts` `pace`, [aliencivilizations.md](aliencivilizations.md)): voids stay lonely.
- **Sky:** the backdrop dims in voids, and each biome colours the sky (user: background matches the biome; eased 1.5 s): the nebulae multiplied 28% toward its hue plus an additive wash at 0.09 × saturation. Ice cold blue, metal steel, gas amber, rapids teal, meteors ember, Kuiper a pale radioactive green. Rendering and cost: [techandperformance.md](techandperformance.md).

### Places

- **Discoveries** (0.12 per screen): swarm (one parent's fragments), moonlets (a 1.2–4× body with small rocks on orbits), stream (ice debris led by a comet).
- **Asteroid fields** (0.06, filaments only): 60–150 bodies over 1.5–3 views, 60% one kind, 1–2 cores of 0.5–3×, one drift.
- **Giants** (0.02): 20–200× you, drift ≤ 0.05 own D/s, 8–23 moonlets.
- **Spawn cap:** every spawn, relative ones included, is at most `GIANT_MAX` 0.9e7: below a brown dwarf, never a star. Bodies can still merge past it; the size cap keeps them under 500 u.
- None of these come within 2 × 900 units of the start.

### Mining sites

The field makes no special disks for concept 2's "accretion disks". Miners read the places it already makes (debris
clusters, free bodies): [civilizationgameplay.md](civilizationgameplay.md) → Mining AI.

## Planned

- **Real disks** (no package): whether the field should also spawn rings of debris round large bodies, or keep using the places it makes.
- **Events spawn API** (with the events director, [gameevents.md](gameevents.md)): today `field.spawn` (one body) and `field.clash()` (the next giant clash, dev) exist; cluster, fragment and region-sample calls are planned.

## Open issues

- Region seams between chunks generated at very different sizes are unchecked.
- Giants are round: from 10^3.5, a body past half its round-off radius bakes as a sphere (`rules.ts` `bakes`).
- Not built: wider voids in Age II.
- The meteor belt loads the most rocks (784 vs 447 at the start, measured before the spacing change); knob `METEOR_FILL`. Dense belts at 316k–796k: [techandperformance.md](techandperformance.md).
- Parked worlds in Age II meet big drifting bodies and grow from infall: [vision.md](vision.md) → Open issues.

## Decisions

Standing decisions in full: [README.md](README.md). The ones that shape the field:

- **Absolute spawn masses** plus a thin tail relative to you: small rocks stay common, something bigger turns up now and then, planets never rain or fly at you. **Fast things are small, big things drift.**
- **Background stays dim;** gameplay objects are the brightest things on screen.
- Biomes must feel different and be named (a calm toast, not an alert), with several screens of plain belt between two of them.
- Voids are where an old star swept space clean, ringed by a Kuiper belt; some groups stand still, some drift as one.
- Kuiper belts: more metal (the old star's cores) and 15% radioactive rocks (the dead star's remains).
- Radioactive rocks: a green cast and a strong green glow.
- Plain Stone Drift keeps half its rock (it was too crowded).
- Web cut 0.72–0.87 (a lower cut left too much plain belt).
- The sky takes the biome's colour, eased; wash 0.09 × saturation, nebulae 28% (stronger was too much).
