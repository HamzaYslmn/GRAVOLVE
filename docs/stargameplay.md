# Star gameplay

Age III: contact, stars as places, the stylised scale, approach, link, control, orbit, Dyson sphere, system planets,
losing and swallowing stars, colonies and terraforming, the look. Code: `evolution/star/` (`rules.ts` numbers, tested in
`rules.test.ts`; `stage.ts` approach, link, control, orbit, collisions; `dyson.ts`; `system.ts`; `colony.ts`; `look.ts`;
`hud.ts`). Contact in `civilization/stage.ts`, carrying on as a colony in `main.ts`. Labels: [README.md](README.md).

## Built

### Star contact

- **Automatic** (`civilization/stage.ts`): when the need (people + shield upkeep + `WORK_E` per working industry) is ≥ 80%
  of the energy made (`CONTACT_NEED`), or 300 s into the civilization (`CONTACT_S`). One calm toast "Your people need a
  sun" / "Their world no longer feeds them · its far light shows on the horizon"; no arrow. Debug's Star jump uses the
  same hook. In the one test (undated) contact came by the 300 s rule.

### Stars as places

- Placed after contact in world units: the first 24,000 u away toward the emptiest of 8 directions, then one per 120,000 u
  cell (60%); a far-light sprite (60,000 u) makes them landmarks.
- Mass 0.4 · 20^(u²) suns (median 0.85), T = 5,800·M^0.6 K; 1 sun = `SUN` 6e7; radius `starRadius` = 800·(M/0.4)^0.15 u
  whatever your mass.

| Class (`starName`) | From | Example mass | T | Radius (u) | Light (M^0.6) |
|---|---|---|---|---|---|
| Red dwarf | 0 K | 0.4 suns | 3,347 K | 800 | 0.58 |
| Orange star | 4,400 K | | | | |
| Yellow star | 5,300 K | 1 | 5,800 K | 918 | 1.00 |
| White star | 6,500 K | 2 | 8,791 K | 1,018 | 1.52 |
| Blue star | 10,000 K | 4 | 13,325 K | 1,130 | 2.30 |
| Blue giant | 16,000 K | 8 | 20,197 K | 1,254 | 3.48 |

Fun first: radii differ only 1.6×, so every system fits on screen; classes read by tint (`starColor`) and halo.

### Stylised scale (user, 2026-11-14)

"No need to make the distances realistic … a little closer than usual. Otherwise, the star system won't fit on the screen.
Same for planet moons, sizes etc." `layout(R★, r, slots)` from the star's centre (reach = your outer moon slot + 0.5 r):

| Zone | Rule |
|---|---|
| Dyson shell | 1.45 R★ |
| Roche | 1.3–1.6 R★ |
| Link band | 2–4 R★ |
| Your orbit floor | max(2, 1.25 + reach) R★ |
| Your orbit range | floor to floor + 1.2 R★, placed by the liquid band |
| Ring k | orbit + reach + 0.4 + 0.35·k R★ |
| Catch zone | ring 0 to ring 0 + 1 R★ |

- The smallest star (`starMass(0)`, 800 u) is 1.6× the planet cap `R_CAP` 500 u and above any spawn or brown dwarf. A blue
  giant's system at 1e5 overflows the short half-view at the 2.5× zoom cap (computed 2026-11-16; accepted).

### Approach

- **Light** = M^0.6 (fun first: M^3.5 made blue giants 1,450×), dimmed ≤ 80% by the Dyson: dose flux 2.3·light/x² (x in
  R★, ignored past 10); warmth 50·√light/x K (fading out 12 → 8 R★); sunlight 3·light/x on solar farms
  ([civilizationgameplay.md](civilizationgameplay.md) → Energy and dose). Only a blue giant burns, at the band's inner edge
  (dose 1.02 at 2 R★; sun 0.41; 2026-11-16).
- **Roche** 1.3–1.6 R★ (rock 1.51 / metal 1.30 / ice 1.60) strips ≤ 15%/s ("Roche limit"); touching the star kills.
- **One gravity** (user, 2026-11-14: the star's pull was too weak, stars didn't pull stars): μ★ = G_WORLD · M · SUN, no
  boost, on you (until linked) and loose bodies out to 12 R★ (`PULL_X`) and on other stars. Pull at 2.5 R★ on a 1e5 world:
  red dwarf 25%, sun 47%, blue giant 200% of thrust (link a blue giant with sideways speed).
- Rocks near a star fall in and burn (moons and held spared); touching stars merge.
- **Flares:** mean 20 s, 1.6 s brightening (a prominence), then 9·light/x² K and dose × 4 for 4 s, fade 1.2 s; past 6 R★
  only a show. An up shield takes it as weapon fire (`shieldTake`).
- Run endings: "Fell into a …" or "Torn apart by a …'s tides" (below 0.25 × AGE_GOAL).

### Link

- 60 s in 2–4 R★ (`BAND`), decaying 2× outside; filaments (1 + 4 × progress strands) grow and snap when you leave. Toasts
  "Linking", then "Star linked" / "The … is yours · your thrust steers it · your world finds its seas' orbit by itself".
  Only the nearest star links; the camera pulls back from 8 R★ (full at 5).

### Control

- **From the link your thrust steers the star** (user, 2026-11-14: it was far too slow): engine = 2 × thrust × clamp(0.6 +
  √(Dyson E/s ÷ 10), 0.6, 2), drag 0.4. A sun: 1.20 / 3.20 / 4.00 × your thrust at Dyson 0 / 50 / 100%.

### Orbit

- Kinematic (`core/orbits.ts`, μ★), captured at your distance clamped to your orbit range, easing at 0.8 R★/s to
  `orbitGoal` (the middle of the liquid band inside the range; with none it stays, Q1). Lap = 2π√(d³/μ★), ≥ 12 s
  (`LAP_MIN`); at 4 R★ a sun 24.0 s.
- Your world and system planets are carried. Star lifting: 0.2 ore/s while awake.
- **Camera** (user, 2026-11-14: focus on the star): follows your star, pulled back so orbit, moons and planets stay inside
  0.72 of the short half-screen, ≤ `STAR_VIEW` 1.6× your view on approach, 2.5× in orbit.

### Dyson sphere

`star/dyson.ts`.

- 10 segments × 60 ore × 20 s, 400 panels each carried by a hauler (2.6 s, equator first); spends the ore stock.
- Energy 20·√L·cover E/s into the civilization's `dyson` input; stronger engine; dimming moves the liquid band inward.
  E/s at 50 / 100%: red dwarf 2.0 / 4, sun 10.0 / 20, blue giant 380.5 / 761 (2026-11-16).
- Waits are said ("Waits for your people: life must recover", "Next segment needs 60 ore · n stored"). Toasts "Dyson
  sphere"; **50%** "Age III complete"; **100%** "Type II civilization".
- Build speed × (1 + 0.5 per colony) (`dysonSpeed`, concept 4).

### System planets [I]

`star/system.ts`, in the 0.25 s tick.

- **Capture** (`catchPlanet`): a round world (≥ 10^3.5) in the catch zone, slower than circular, ≤ 0.15 R★ (`PLANET_R`),
  not a rival, meteor, moon, held or fast body, takes the lowest free ring; `carry` eases it in at 2 R★/s; `release` frees
  them when the star is lost. Planets reuse `b.moon` (no free gravity; pirates, ships, capture and your rockets skip them).
- **Capacity** min(6, 2 + ⌊2·log2(M/0.4)⌋): red dwarf 2, sun 4, 1.6 suns and up 6.
- **Growth:** +3% star mass a planet (`GROW`), as the concept asks. Toast "A planet joins your star"; Debug "+Planet".

### Losing or swallowing a star [I] (Q3, in part)

- Touching stars: the heavier swallows the lighter, keeping both masses ("A star swallowed"). Yours swallowed: planets
  released (colonies die: "Colonies adrift"), your world gets 5 s of protection (`LOST`), thrown out at 2 R★/s ("Star
  lost"); link another. Touching a star or its tides still ends the run unless a colony lives.

### Colonies and terraforming [L]

`star/colony.ts`, hook `colonies` in `civilization/stage.ts`, carry-on in `main.ts`.

- **Colony fleet:** a carrier and colony ship per caught planet, one fleet at a time, `COLONY` 60 ore + 40 volatiles + 1 bn
  people, only with ≥ 1.5 bn at home ("Colony ship needs …").
- The planet is `terra`; a colony at score ≥ 0.3 (`COLONY_HAB`), score = min(water, temp, air) × (0.5 + 0.5·field).
- **Terraforming:** a miner flies 20 volatiles a trip (`TERRA_VOL`): +0.1 atm or +2% water, the weaker; none for
  temperature alone. A 10^4 rock at a sun: 9 trips to 0.44 atm, 16% water (2026-11-16).
- **Rings (Q1):** colonies and terraforming planets move to a ring in their liquid band clear of your moons (`zoneSlot`);
  lifeless ones keep theirs.
- **Gives:** `capacity(score, m)` to the people cap, faster Dyson; keeps the civilization awake if home life fails.
- **Losing one** (score < 0.15 `COLONY_LOST`, eaten, past the gas line, star lost): its share of people dies (≤ 50%); one
  that only lost its score goes back to terraforming. Past the gas line (`envelope`) a planet leaves its ring ("A gas
  world").
- **Carrying on (Q3):** your world dies while a colony lives: no card, you go on as the colony ("Your colony carries on");
  star, Dyson, moons, stock and people stay behind; a new civilization at 0.2 bn. Once a run.
- Measured (undated): fleet 2.5–4 s; terraform → colony 30–45 s; one colony took the cap 10.1 → 16.2 bn.

### How a star looks

`look.ts`. Only stars get boiling layers, streamers and bloom wider than 2 R★.

- **Photosphere:** an opaque disc (white centre → class colour → dark limb), two drifting granulation layers; hides the
  Dyson's back half. **Limb and corona:** thin rim, spicules, two breathing streamer layers. **Halo** with the Dyson's
  infrared folded in; **haze** grains to √(2.3·light) R★. **Far light** alpha 0.32 / 0.4 / 0.5 by class.

| Class | Disc | Halo (radius / alpha) | Corona | Haze |
|---|---|---|---|---|
| Red dwarf | orange-red, coarse cells, large spots | 2.2 R★ / 0.30 | 2.3 R★ | ~1.2 R★ |
| Sun-like | white centre, orange limb, fine cells | 3.2 R★ / 0.45 | 2.9 R★ | ~1.6 R★ |
| Blue giant | pale blue-white, strongest bloom, long streamers | 5 R★ / 0.60 | 4.2 R★ | ~3 R★ |

- One 1024² star page baked once; 12 sprites a star in one batch ([techandperformance.md](techandperformance.md)). A star
  wider than half the screen drops far light, haze and corona. A shadow sprite on your night side (16 → 8 R★). The Star
  section in your card: [hudandcontrols.md](hudandcontrols.md).

## Planned

- **Q3, the rest:** a carry-on that keeps star, Dyson, moons, stock and people.
- Leaving a star orbit by choice, several owned stars, comet terraforming, a gas world becoming a brown dwarf. Star events:
  [gameevents.md](gameevents.md).

## Open issues

- **[D] Thick-air worlds cannot reach their band** with no Dyson (red dwarf or sun from 1.3 atm, 8 suns from 1.0 atm;
  2026-11-16): they wait at the range's outer edge.
- **Stylised-scale side effects** (2026-11-14, not playtested): a blue giant burns a civilization in the band; a neighbour
  star can fall into yours; living planets often find no room in the band.
- **[D]** The orbit eases for any world with a band, not only living ones. **[D]** The 80%-need contact path and the
  red-dwarf link trap are not re-playtested. **[L]** No colony formed in the playtest (≥ 1.5 bn never met). **[C]** The
  wide-star fallback is unchecked; hot stars above 4,700 K untested.

## Decisions

- **Stars only by takeover, link automatic** (user, standing). **Background dim; hot planets not stars** (user, standing).
- **Light = M^0.6** (fun first).
- **Unified stylised scale** (user, 2026-11-14: "fix all sizings, there is things bigger than a star", "star has no
  gravity", distances "a little closer than usual"): planets ≤ 500 u, stars absolute (800·(M/0.4)^0.15 u, 1 sun = 6e7), one
  gravity from mass (12 s lap floor), the compressed `layout`, ≤ 5 moons, ≤ 6 planets, light 50 / 2.3 / 9.
- **Star visuals** (user, 2026-11-13): improve sizes, brightness, rad and halos.
- **Concept 3–5** adopted as the plan (user, 2026-11-13); the energy beam [K] was built, then removed 2026-11-17.
- **Energy beam removed** (user, 2026-11-17): Fire is always a rocket; the Dyson keeps its energy and stronger engine.
- Q1 orbits automatic, Q3 last living planet: [vision.md](vision.md) → Open decisions.
