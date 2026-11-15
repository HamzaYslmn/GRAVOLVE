# World generation

The field every stage flies through: chunks streamed from the run seed, the mass of what spawns, the cosmic web and its
voids, the named biomes, the region maps, and the places worth finding. Code: `app/src/evolution/asteroid/field.ts`
(spawning, chunks, places), `asteroid/web.ts` (web, biomes, kind mixes, moving groups; pure, checked by `web.test.ts`),
`core/chunks.ts` (chunk streaming), `render/background.ts` and `asteroid/hud.ts` `BIOME_SKY` (the sky). One world `SEED`
in `main.ts` drives the backdrop, the field and rock shapes; each run derives its own field seed.

Code is the truth: if this file and the code disagree, the code wins. Labels: **measured** = run in the game or in a sim
on the real formulas; **computed** = from the formulas; the rest are rules. "Screen" = a 1280×720 view at the start zoom.

Not here: meteors, comets and the giant clash ([gameevents.md](gameevents.md)); rival cores and how they arrive
([aliencivilizations.md](aliencivilizations.md)); stars as places ([stargameplay.md](stargameplay.md)); what the bodies
are and how they collide ([asteroidgameplay.md](asteroidgameplay.md)).

## Built

### Chunks

1200 units, generated once from the run seed, stored on unload, restored on load; rocks rehome; only loaded chunks
simulate. The view here is the game area: your natural view, never shrunk by zooming in (`main.ts` `gameArea`); spawns and ranges in combat (`combat.ts` `cam.halfW`) and the star stage use it too, only on-screen tests use the zoomed view (user, 2026-11-14: zoomed in, rival worlds and pirates spawned right next to you; measured after: at 3× zoom a pirate fleet appeared 3.06 visible half-diagonals out). Zoomed out (wheel, down to 0.25), the margin shrinks by what the view grew, to one chunk at least, and the look-ahead is capped by the natural view (user, 2026-11-14: fps fell 197 → 130 zoomed out; measured before: 437 → 873 loaded bodies from zoom 1.02 to 0.236, frame 1.1 → 2.6 ms; after: 478 → 480–508 bodies). Loaded = view + one view half-size per side (≥ 2 chunks), unload half a margin further. Load ahead 2 s
(≤ 1.5 half-views). On-screen chunks always load at once; the rest load nearest a point half the look-ahead in front of
you first, ≤ 16 a 1/60 s (scaled by the frame's dt) (user, 2026-11-14: fast flight left holes; measured at 1e5 mass before:
34% of the view missing at 200 D/s and 60 fps, 33% at 100 D/s and 30 fps; after: 0, at 0.4–2.0 ms of chunk work a frame
at those speeds, worst frame 15 ms; `core/chunks.test.ts`). `chunks.ts` skips loaded ranges, refuses > 1e9 or > 40k chunks. Start: 160
units clear, nothing heavier within 900, HOME 3000 always full, web forced on within 6–12k.

- The game area is your natural view: the field loads, spawns and recycles around `min(camera zoom, natural zoom)`
  ([asteroidgameplay.md](asteroidgameplay.md#flight-and-camera)).
- Stored chunks keep their Pixi objects (~1 KB per rock, `field.ts` note); serialising to plain data waits until long
  runs need it.

### Spawn masses

- **Belt:** N(>m) ∝ m^-0.6 up to M_MAX 10^4, floor max(0.02 × start mass × (you/start)^0.45, 0.001 × you) at generation. Below 0.001 × you (`SPECK`, under a pixel once you are big) nothing spawns, no fragment is made and loaded rocks are dropped: at 152k mass loaded bodies went from 2,158 to ~100 (measured). Past M_MAX the belt count × (you / M_MAX)^-0.25 (`THIN`): 0.51 at 150k, 0.32 at 1M. Protoplanets 0.5% (2,000–10^4, round); radioactive 3% of single rocks (green cast and a strong green glow, user).
- **Tail** above M_MAX: N(>q) = 0.43 · min(1, (you/550)^-0.34) · q^-0.6 per screen, q = mass/you in [max(0.01, M_MAX/you), 1.15]. Empty below ~8.7k; nothing in it can eat you. Approved target: late tiers ~2 min, 10^6 at ~11:40 for an engaged player; the sim gives tiers after 10^4 of 38 / 47 / 72 / 118 s and 10^6 at 7:49. At 795k only 0.05 bodies of 0.1–1.15× per screen (measured), chosen because denser made late tiers ~20 s; the thin factor is the knob.
- **Encounters** 0.25 per screen at 1.5–6× you. Rare things roll per screen (chance / scale^1.6). Big things drift at belt speed, never aimed.
- **Piles:** between 300 and 1000 mass half the bodies are old rubble piles, 15% of those contact binaries; outside that range the chance grows with mass relative to you (12–50%).
- **Motion:** each rock gets the shared drifts of where it spawns (belt flow, rapids, its moving group) plus its own scatter of 4–26 start units/s × √scale.

### Biomes

Code: `web.ts` `place` / `biomeAt`, pure, checked by `web.test.ts`. One per place, checked in order: start area (always
belt) → void (web < 0.1) → Kuiper belt → rapids → meteor belt → the strongest material region above 0.5 → belt.

| Biome | Name | Kind shares [rock, metal, ice, gas] (`kindMix`) | Map share (measured) |
|---|---|---|---|
| belt | Stone Drift | .78 / .08 / .11 / .03 (rock-rich) | 40–41% |
| ice | Frost Reach | .12 / .03 / .75 / .10 (water-rich); world comets × 1.75 (user, 2026-11-14) | 4–4.5% |
| metal | Iron Graveyard | .25 / .65 / .05 / .05 | 2–2.6% |
| gas | Veil Nebula | .12 / 0 / .30 / .58 | 2.1–2.3% |
| kuiper | Kuiper Rim | .12 / .15 / .67 / .06 (user: more metal, the old star's cores) | 5–6% |
| rapids | Swift Current | belt mix | 2.1–2.4% |
| meteors | Firefall Belt | belt mix | 2.3–2.8% |
| void | The Hollow | belt mix, near-empty | 40% |

Map shares are from `web.test.ts` over 3 seeds (re-run 2026-11-13: same ranges).

- **Kuiper belt:** the rim of every void (web 0.1–0.7 with a void within 2.5–5k units). Lore (user): a star formed there long ago and swept the space clean. Sparse but never empty, slow (motion × 0.35), more big icy bodies (slope 0.45), world comets × 3, radioactive rocks 15% of single rocks (3% elsewhere: the dead star's remains, user).
- **Rapids:** thin ridge bands on filaments; everything flows along the band at 9 start D/s × √scale, scatter × 2. Ride it by matching speed, crossing it hurts. Rocks that leave downstream come back in upstream off screen (`recycle`), so a parked player's rapids don't drain.
- **Meteor belt:** thin ridge bands; fill ≥ 0.4 then × 1.6, slope 1.0 (more small rocks), meteors × 4 while inside (user, 2026-11-14: was × 3, which measured 16.6/min vs 4.5 in the belt).
- **Moving clusters** (`groupDrift`): irregular cells ~1600 region units; half stand still, the rest drift together at 10–25 start units/s (individual scatter × 0.2), on top of belt flow.
- **Names:** a toast after 0.5 s in a new biome (was 2 s: fast flight crossed thin bands unnamed); the run's first is silent, the same one not again within 40 s (`hud.ts` `biomeNews`; toast in [hudandcontrols.md](hudandcontrols.md)). Subtitles describe the place, never warn.
- **Spacing:** one special place at a time: where two overlap, both fade into plain belt (`CLEAR` 0.01–0.1 of the runner-up), and material regions keep clear of voids (`shore`, web 0.1–0.4). Regions 42k, rapids 90k, meteor bands 60k world units per noise unit (3× the first cut); band cuts 0.91–0.93, gas from 0.6, so the bands keep ≥ 2% with 40% voids. Along straight lines (measured, `web.test.ts`): median 5.2 screens of plain belt between two different biomes (8 before the voids grew; 0 and 61% touching at first), none touching but void and its Kuiper rim. 98–99.7% of Kuiper spots border a void. Cost ~2 µs/frame for the biome lookups; the meteor belt loads the most rocks (784 vs 447 at the start, field update ~1.4–1.9× the start, measured before the spacing change; knob `METEOR_FILL`).

### Regions

Density (`web.ts`) = belts × clumps × richness 0.2–1.8 × web. Plain Stone Drift keeps half of it (`field.ts` `PLAIN_FILL`
0.5, user: too crowded), eased by the special places' strengths; the start area stays full. Computed over 3 seeds: belt
density 0.273 → 0.141, other biomes −2 to −5% (edges), the whole map 66% of its rock. Belts flow (30 u/s at start size).
Mineral palettes (basalt, rust, carbon, pale, slate). Maps read at (x, y)/S, S = scale^0.8 in half-octave steps, so
regions span about as many screens at every size. S only grows within a run (shrinking from boil-off or chips used to
flip it at a step and swap the whole map under you: the biome name flickered), and each chunk keeps the S it was
generated at: the biome name, meteor rate, web and recycling read that, so they match the rocks there.

### Cosmic web

web = smoothstep(0.72, 0.87, 1 − |2·fbm(x/40000) − 1|) (was 0.6–0.75: user, too much plain belt); density × web, void
floor 0.002, filaments ×1.3. Voids ~40% of the map (was 20%), median ~17 start screens wide, quartiles 9–28 (measured;
`web.test.ts`). Tail and rivals × max(0.15, web); discoveries, encounters, giants × max(0.3, web).

The backdrop dims in voids, and each biome colours the sky (user: background matches the biome; eased 1.5 s, `hud.ts`
`BIOME_SKY`): the nebulae multiplied 28% toward its hue plus an additive full-screen wash of it at 0.09 × saturation (was
45% and 0.18: user, too strong) over space; ice cold blue, metal steel, gas amber, rapids teal, meteors ember, Kuiper a
pale radioactive green. Backdrop rendering and cost: [techandperformance.md](techandperformance.md).

### Places

- **Discoveries** (0.12 per screen): swarm (one parent's fragments), moonlets (a 1.2–4× body with small rocks on orbits), stream (ice debris led by a comet).
- **Asteroid fields** (0.06, filaments only): 60–150 bodies over 1.5–3 views, 60% one kind, 1–2 cores of 0.5–3×, one drift.
- **Giants** (0.02): 20–200× you, drift ≤ 0.05 own D/s, 8–24 moonlets. Flight at 30 D/s, 31.6k: 4 giants in 130 s (measured).
- **Spawn cap:** every spawn, relative ones included (tail, encounters, cores, hunters, the giant clash, giants), is at most 0.9e7 (`field.ts` `rock`, `GIANT_MAX`): below a brown dwarf, never a star. Bodies can still merge past it (measured: at you 8.4e6 one loaded body of 4.1e7 after 40 s of flight, single-part, not a rival: capped bodies that merged); the size cap keeps it under 500 u (asteroidgameplay.md).
- None of these come within 2 × 900 units of the start.

### Accretion disks as mining sites [G]

Concept 2: miners gather metal, water and radioactives "from nearby moons and accretion disks". The field makes no
special disks; the civilization reads the bodies already there (`civilization/stage.ts` survey, every 2 s, inside the
mining reach of outer moon slot + 6 R):

- **Debris cluster** (`mining.ts` `clusters()`): ≥ 4 bodies under 2% of you within 1.5 R of the first, mined from the
  biggest at efficiency 0.8. Swarms, asteroid fields, moonlets, shatter fragments and the frigate's pieces all qualify.
- **Free body:** ≥ 2% of you, or a lone body ≥ 0.2%, at efficiency 0.6. Meteors, held, rival, fast and orbiting bodies
  are skipped.
- Danger 1 with an enemy ship within 4 R. Mined without capture, as a radioactive / metal / water mix, never rock (a bare moon stays as a guard); metal or water you lack lands on you. Rules in
  [civilizationgameplay.md](civilizationgameplay.md#mining-ai-e-rules-wired-in-by-g).

## Planned

- **Real disks** (not in a package): whether the field should also spawn rings of debris round large bodies, or only
  keep using the places it already makes.
- **Events director spawn API** (separate package, after wave 2): `field.ts` exposes a small spawn API (body, cluster, fragments, region sample) instead of each event reaching into it. Plan in [gameevents.md](gameevents.md).

## Open issues

- Region seams between chunks generated at very different sizes are unchecked.
- Giants are round (the sphere bake rounds anything past roundR).
- Not built: wider voids in Age II.
- Dense belts at 316k–796k: 650–980 loaded, ~1.9 ms ([techandperformance.md](techandperformance.md)).
- The meteor belt loads the most rocks (784 vs 447 at the start); the numbers predate the spacing change. Knob `METEOR_FILL`.
- Parked worlds in Age II: a drifting 2.8× body ate a parked world at 175 s, and a parked world in a moderately dense spot grew 50k → 250k in 10 min from infall. Both break "big things never meet a still player" ([vision.md](vision.md), [planetgameplay.md](planetgameplay.md)).

## Decisions

User decisions that shape the field (standing decisions in full: [README.md](README.md)). Undated ones predate 2026-11-13.

- **Absolute spawn masses** plus a thin tail relative to you: small rocks stay common, something bigger turns up now and then, planets never rain or fly at you. **Fast things are small, big things drift.**
- **Background stays dim;** gameplay objects are the brightest things on screen.
- Biomes must feel different and be named (a calm toast, not an alert), with several screens of plain belt between two of them.
- Voids are where an old star swept space clean, ringed by a Kuiper belt; some groups stand still, some drift as one.
- Kuiper belts: more metal (the old star's cores) and 15% radioactive rocks (the dead star's remains).
- Radioactive rocks: a green cast and a strong green glow.
- Plain Stone Drift keeps half its rock (too crowded before).
- Web cut 0.72–0.87 (0.6–0.75 left too much plain belt).
- The sky takes the biome's colour, eased; wash 0.09 × saturation, nebulae 28% (45% and 0.18 were too strong).
