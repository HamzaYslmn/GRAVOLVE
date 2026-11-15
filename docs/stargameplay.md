# Star gameplay

Age III: the way in (star contact), stars as places, the approach, the link, control of a star and the automatic orbit,
system planets, losing and swallowing stars, the Dyson sphere, the energy beam, colonies and terraforming, and how a star
looks. Code: `app/src/evolution/star/` (`rules.ts` numbers, checked by `rules.test.ts`; `stage.ts` approach, link,
control, orbit, Dyson, beam, star collisions; `system.ts` system planets; `colony.ts` colony fleets, colonies and
terraforming; `look.ts` sprites and the star page; `hud.ts` the Star panel); contact in `civilization/stage.ts`; the beam
shot in `civilization/combat.ts`; carrying on as a colony in `main.ts`. Labels
(**measured**, **computed**, rule) and the Built / Planned convention: [README.md](README.md). Code is truth: where this
file and `app/src` disagree, the code wins.

## Built

### Stage

| # | Stage | Owner | Ends | Length |
|---|---|---|---|---|
| 5 | Star takeover (Age III) | `evolution/star/` | Dyson 50% "Age III complete", 100% "Type II" | |
| 6 | Expansion | not built (system planets and colonies are built inside stage 5) | | `vision.md` → Roadmap |

### Star contact

- **Contact is automatic** (`civilization/stage.ts`): when your people's need (people + shield upkeep) is ≥ 80% of the
  energy the world makes (`CONTACT_NEED`), or 300 s into the civilization (`CONTACT_S`). One calm toast: "Your people need a sun" / "Their world
  no longer feeds them · its far light shows on the horizon". No arrow: the first star's far light shows where it is.
  The planet stage then creates the star stage (`planet/stage.ts:178`).
- Debug "Star contact" (id `contact`) calls the same hook and gets the same toast.
- Measured: in the one test, contact came by the 300 s rule; the need never reached 80% (population capped by
  habitability, a 0.38 atm world).

### Stars as places

- **Stars as places** after Star contact, in fixed world units (stylised scale, below): the first 24,000 u away toward the
  emptiest side (the emptiest of 8 directions by field fill), then one per 120,000 u cell (60%). 0.4 · 20^(u²) suns
  (median 0.85), T = 5,800·M^0.6 K; a far-light sprite (60,000 u) makes them landmarks without arrows.
- **Stars in game units:** 1 sun = `SUN` 6e7 game mass; radius `starRadius` = 800·(M/0.4)^0.15 u, the same whatever your
  mass. The smallest star a beam can leave (0.3 suns, 766 u) is 1.5× the size cap of any planet (500 u, asteroidgameplay.md)
  and 1.8e7 mass, above any spawn (0.9e7) or brown dwarf.
- **Classes** by temperature (`rules.ts` `starName`); examples computed from the formulas:

| Class | From | Example mass | T | Radius (u) | Light (M^0.6) |
|---|---|---|---|---|---|
| Red dwarf | 0 K | 0.4 suns | 3,347 K | 800 | 0.58 |
| Orange star | 4,400 K | | | | |
| Yellow star | 5,300 K | 1 | 5,800 K | 918 | 1.00 |
| White star | 6,500 K | 2 | 8,791 K | 1,018 | 1.52 |
| Blue star | 10,000 K | 4 | 13,325 K | 1,130 | 2.30 |
| Blue giant | 16,000 K | 8 | 20,197 K | 1,254 | 3.48 |

  Fun first: smallest to largest differ only 1.6× in radius so every system fits on screen; classes read mostly by tint
  (a blackbody fit, `starColor`) and halo. In your radii (computed): red dwarf 4.3 / 2.3 / 1.7 at 1e5 / 1e6 / 1e7, sun
  4.9 / 2.6 / 1.9, blue giant 6.7 / 3.6 / 2.7. Measured: debug Star at 1e5 and at 9e5 gave the same radii (800.0 / 917.9 /
  1,253.8 u).

### Stylised scale (user, 2026-11-14)

"No need to make the distances realistic … a little closer than usual. Otherwise, the star system won't fit on the
screen. Same for planet moons, sizes etc." One rule set, from the star's centre (`rules.ts` `layout(R★, r, slots)`, pure;
reach = your outer moon slot + 0.5 r):

| Zone | Rule |
|---|---|
| Dyson shell | 1.45 R★ |
| Roche | 1.3–1.6 R★ |
| Link band | 2–4 R★ |
| Your orbit floor | max(2, 1.25 + reach) R★: your moons always clear the star |
| Your orbit range | floor to floor + 1.2 R★, placed by the liquid band |
| Ring k | your orbit + reach + 0.4 + 0.35·k R★: rings always clear your moons |
| Catch zone | ring 0 to ring 0 + 1 R★ |

Moon slots are compressed too (2.4 + 1.0·k your radii, moons ≤ 12.5% of you: planetgameplay.md). Computed, orbit at its
floor (orbit / ring 0 / system edge / short half-view at the 2.5× cap, world units): 1e5 round a red dwarf 2,094 / 3,507 /
3,907 / 6,262, sun 2,241 / 3,702 / 4,803, blue giant 2,661 / 4,256 / 6,638 (six rings overflow; four fit); 1e6 round a red
dwarf 3,782 / 6,883 / 7,283 / 10,464, sun 3,929 / 7,078 / 8,179, blue giant 4,349 / 7,632 / 10,015.
Star radii (`starRadius`): red dwarf 800, sun 918, blue giant 1254 world units; the smallest beam-capable star (`BEAM_MIN`,
766 u) is 1.5 × the planet size cap `R_CAP`. Pull at 2.5 R★: a sun ~47% of a 1e5 world's thrust, a blue giant more than
all of it (fly past sideways).

### Approach

- **Approach is physics:** light = M^0.6 (fun first; M^3.5 made blue giants 1,450×), dimmed ≤ 80% by Dyson. Light is
  compressed with the system: flux 2.3·light/x² into the dose (x in R★; ignored past 10 R★); warmth 50·√light/x K (fades
  out between 12 and 8 R★). Roche 1.3–1.6 R★ strips ≤ 15%/s; touching kills. Computed by `rules.test.ts`: Roche rock
  1.51 / metal 1.30 / ice 1.60 R★; dose (field 0.6, 1 atm) at 2 / 3 / 4 R★: red dwarf 0.31 / 0.23 / 0.21, sun 0.41 / 0.28
  / 0.23, blue giant 1.02 / 0.55 / 0.38 (only a blue giant burns, at the band's inner edge); warmth at 2 R★: red 19 K, sun
  25 K, blue 47 K.
- **One gravity** (user, 2026-11-14: "star's gravity not good enough", "star isnt pull a star"): μ★ = G_WORLD · M · SUN,
  no boost. It pulls you (until linked), loose bodies and other stars with μ★/d², floored at the surface; on you and loose
  bodies only out to 12 R★ (`PULL_X`). The same μ drives your placed orbit, your planets' rings and the catch test.
  Computed: pull at 2.5 / 5 R★ as a share of a 1e5 world's thrust: red dwarf 25 / 6%, sun 47 / 12%, blue giant 200 / 50%
  (link a blue giant with sideways speed; danger reads from colour); μ★ ÷ your μ at 1e5: 35 / 88 / 705. Rocks near a star
  fall in and burn. Stars pull each other with the same μ (0.24 u/s² at cell distance): yours moves by its engine, the
  rest drift free, and touching stars merge. Measured (manual ticks): a red dwarf parked 5 R★ from a 1.2-sun star fell in
  and was swallowed in 5.3 s; a 4.3-sun star took in a 1.2-sun one from 5 R★ in 2.3 s.
- Ends of the run here: "Fell into a …" (touching the star) or "Torn apart by a …'s tides" (below 0.25 × AGE_GOAL).
- **Flares:** mean 20 s, 1.6 s brightening (a prominence rises on the limb), then 9·light/x² K and dose ×4 for 4 s;
  fade 1.2 s; past 6 R★ only a show. A shield that is up takes the whole flare as weapon fire (`civilization/stage.ts` `shieldTake`: `shieldShot`, down to its floor, with the stun); a downed one lets it through.
- Bodies that fall into a star burn up (checked every 0.25 s); moons and held bodies are spared.

### Link

- **Link:** 60 s in 2–4 R★ (`BAND`), decays 2× outside; filaments (1 + 4 × progress strands of grains, star colour → yours) grow
  and snap when you leave. Toasts: "Linking" on entering the band; at 100% "Star linked" / "The … is yours · your thrust
  steers it · your world finds its seas' orbit by itself".
- Only the nearest star links; the others decay. On approach the camera pulls back from 8 R★ (full at 5 R★).

### Control

- **From the link your thrust steers the star:** engine = 2 × thrust × clamp(0.6 + √(Dyson E/s ÷ 10), 0.6, 2), drag
  0.4 (it coasts to a stop in a few seconds). User, 2026-11-14: the star was far too slow (was 0.5 × 0.35 = 0.17×). With
  no Dyson the base is 1.2× your thrust; the Dyson scales it to 4×. "Stars only by takeover, link automatic" still holds.
- Engine × thrust at Dyson 0 / 50 / 100% (computed): red dwarf 1.20 / 2.10 / 2.47; sun 1.20 / 3.20 / 4.00; 8 suns
  1.20 / 4.00 / 4.00.
- Measured before the stylised scale (white star, no Dyson): 1.86 R★/s² while holding a key, 4.2 R★/s reached and 17.4 R★
  covered in 6 s (stars are now ~2–5× larger in world units, so fewer R★/s).

### Orbit

- **Orbit:** kinematic (`core/orbits.ts` at system scale, μ = μ★), captured at your distance clamped to your orbit range
  (layout above: it moves out as your moon slots grow). It eases by itself at 0.8 R★/s to `orbitGoal(band, range)`: the
  middle of the part of the liquid band inside the range; with no band it stays inside the range (Q1). Lap = 2π√(d³/μ★),
  never under 12 s (`LAP_MIN`, fun first: a blue giant's true lap near its floor is ~5–8 s). True lap at 4 R★ (computed):
  red dwarf 30.9 s, sun 24.0 s, blue giant 13.5 s.
- Orbit goal with no Dyson / full Dyson at 0.3 / 1 / 1.4 atm for a 1e5 world round a sun-sized range (2.44–3.64 R★,
  computed): red dwarf 2.7 / 2.4, 3.0 / 3.0, 3.6 / 3.4 R★; sun 3.0 / 2.4, 3.0 / 3.0, 3.6 / 3.6; 8 suns 3.2 / 2.8, 3.6 /
  3.0, 3.6 / 3.6.
- Measured (manual ticks, red dwarf): at 1e5, before the layout clamp, the orbit sat at 5.66 R★ with a 52.1 s lap (2π√(d³/μ★) = 51.9 s); a rock
  placed on the far side at circular speed stayed within 5.15–5.66 R★ for a lap; one placed 0.35 rad ahead swung 4.6–6.7
  R★ (your world's own pull) but kept pace (±0.19 rad over 60 s). At 1e6 (6 slots) round a red dwarf with both planets:
  orbit 5.2 R★, lap 44.9 s; your outer moon slot's edge stayed ≥ 686 u (0.85 R★) off the surface and both planets ≥ 242 u
  clear of it for a whole lap; star, world and both planets on screen in every frame (zoom 0.0352, short half-view
  10,227 u).
- Your world and your system planets are carried (System planets below). Star lifting: 0.2 ore/s while the
  civilization is awake.
- Camera in orbit: follows your star (user, 2026-11-14: "when we attach to the Sun I should be controlling the star… normally focus on star"), pulled back so your world's orbit plus your moons' reach, and the outer ring of your planets, stay inside 0.72 of the short half-screen; when the orbit outgrows the zoom-out cap (or while the zoom is still easing out) the camera shifts toward your world only as far as keeps it in that circle. Measured (red dwarf, holding a key 6.7 s then coasting): your world and the star both on screen 100%, camera at most 5.4 R★ off the star. The camera may pull back at most `STAR_VIEW` (`main.ts`) 1.6× your own view on approach, 2.5× in orbit. Measured at 1280×720 around a red dwarf: camera 0.00 R★ off the star, your world (6.4 R★) on screen 100%, half-view 18.7 × 10.5 R★; captured planets at 14 / 18 R★ still 0% on screen over 25 s (rings outside the short half-view; before the stylised scale, which fixed it: Orbit above).
- Cost with a blue giant's halo filling the short side (1e5, linked at 3 R★, halo 370 px; measured with manual ticks and
  `gl.finish`, the pane hidden): frame 1.57 ms mean / 2.6 p95 vs 1.22 / 2.4 in Age II with no star; field update 0.19 ms
  mean / 0.4 p95 (budget 0.6). At 1e6: red dwarf frame 1.82 ms, blue giant 1.50 ms, field 0.13–0.14 ms.

### Dyson sphere

- **Dyson:** 10 segments × 60 ore × 20 s, 400 panels, each panel carried by a hauler (2.6 s flight, equator first);
  energy 20·√L·cover E/s; dimming moves the liquid band inward; the panel says why it waits ("Waits for your people:
  life must recover" or "Next segment needs 60 ore · n stored"). The segment spends ore stock, which since 2026-11-14 is mined metal only (rock never counts) plus star lifting. **50%** = "Age III complete" ("Half a Dyson sphere · your people run on starlight · next: close it");
  **100%** = "Type II civilization".
- Computed by `rules.test.ts`: Dyson E/s at 50% / 100%: red dwarf 2.0 / 4, yellow star 10.0 / 20, white star 33.6 / 67,
  blue giant 380.5 / 761; Dyson 50% = 5 segments, 300 ore, ≥ 100 s of building. Liquid band around a sun by cover 0% →
  100%: 0.3 atm 1.4–3.9 → 0.6–1.7 R★; 0.6 atm 1.7–∞ → 0.7–∞ R★ (computed from `liquidBand`).
- Build speed × (1 + 0.5 per colony) (`dysonSpeed`, concept 4: more living planets speed up the sphere).
- Dyson energy feeds the civilization as its `dyson` input ([civilizationgameplay.md](civilizationgameplay.md) →
  Energy) and makes the engine stronger. From 20% it unlocks the energy beam (below).

### System planets [I]

`star/system.ts`, run from `star/stage.ts` in the existing 0.25 s tick.

- **Capture** (`catchPlanet`): a round world (≥ 10^3.5) in the catch zone (ring 0 to ring 0 + 1 R★, layout above),
  slower than circular speed relative to the star, no bigger than 0.15 R★ (`PLANET_R`: 120–190 u), and not a rival,
  meteor, moon, held or fast body, takes the lowest free ring k (your orbit + reach + 0.4 + 0.35·k R★, clear of your
  moons). `carry` eases it to its ring at 2 R★/s (`RING_RATE`), then moves it kinematically (`core/orbits.ts`, μ★ with the
  12 s lap floor), turning the same way as your world; eaten planets drop out; `release` frees them when the star is lost.
- Planets reuse the `b.moon` flag: no free gravity, never stored with chunks; pirates, ships and moon capture skip them;
  your slugs and the beam pass them.
- **Capacity** `min(6, 2 + ⌊2·log2(M/0.4)⌋)` (the old game: 3 / 6 / 8 per star; 6 so a system fits on screen).
  Computed: red dwarf 2, sun 4, 1.6 suns and up 6.
- **Growth:** each planet adds 3% to the star's mass (`GROW`); `grow(star, M)` recomputes temperature, light, radius,
  colour, name and the orbit's μ. **Fun-first deviation:** a real star gains nothing visible from holding planets; here
  growth is the reward the concept asks for ("acquiring new planets causes the star to grow and increases the number of
  planets it can carry"). Computed, filling every ring: 1 → 1.13 suns (still 4 planets).
- Toast "A planet joins your star"; the Star panel shows "Planets n/cap". Debug "Add planet" spawns a 10^3.6–10^4.6
  metal world 0.5 R★ into the catch zone ([hudandcontrols.md](hudandcontrols.md#debug-mode)).
- Measured: caught within one tick; ring 0 held 14.0 R★ while the star moved 2,646 u (old scale); +3% mass each; 8
  carried planets ≈ +0.06 ms field update (noise). Stylised scale, red dwarf at 1e6: rings 0 / 1 at 8.95 / 9.30 R★.

### Losing or swallowing a star [I] (Q3, in part)

- When your star touches another, the heavier swallows the lighter and keeps both masses (fun first): "A star swallowed".
- If yours is swallowed: its planets are released (colonies die with it: "Colonies adrift"), your world gets 5 s of
  protection from the new star's pull, tides and surface (`LOST`) and is thrown out at 2 R★/s ("Star lost"). You fly it
  again and can link another star. Measured: a red dwarf rammed into a blue star was lost, and another star was linked
  61 s later.
- Game over is unchanged: touching a star or its tides still ends the run (Approach above), unless a colony lives
  (Colonies below).

### Energy beam [K]

- From Dyson ≥ 20% (`BEAM_COVER`), Fire shoots an instant beam (no ore, 3 s cooldown `BEAM_COOL`) from your surface toward
  the aim point and 3 R past it. It stops at the first body (your moons and planets are skipped) and kills every enemy
  ship before it. It works like a gun (user, 2026-11-14): every shot takes a bite.
- **Power** P = √(cover / 20%) × M^0.3 (`beamPower`): red dwarf 0.76 → 1.70, sun 1 → 2.24, blue giant 1.87 → 4.17 over
  20 → 100% cover. A shot bites 1% of your mass × P (`BEAM_BITE`) off the body and adds 20 K × P of heat (`beamK`); the
  body shrinks visibly (`shed`), 40% of the bite flies off sideways as three chunks (field debris, at 1.3–1.7× the body's
  escape speed so they do not fall back or sit on the beam's line), the rest is dust. A body within 2 bites
  (`BEAM_SHATTER`) shatters (`shatter`). No per-body damage state.
- **Rival worlds:** while the shield holds, a shot takes 20 K × P off it and removes nothing (`rivals.beam`); once it is
  down, each shot bites as above and kills 3 × the share of the world removed of its people (`BEAM_KILL`, `beamPop`,
  capped by `RIVAL_HIT_MAX`). The shield still mends between shots, so now and then a shot is soaked again until the
  rival's fleet is gone (open: no mending). A beaten rival beamed down to moon size (12.5% of you) leaves the roster as a
  free body you can catch (a spoil). This is the "advanced defence" the Dyson unlocks.
- **Star fuel:** each shot shrinks the star to 0.998 of its mass (`BEAM_COST`, `grow`). A shot that would leave it under
  0.3 suns is refused (`BEAM_MIN`): the Star panel says "Beam off: the star is too small to feed it" and Fire sends a slug
  again.
- Look: two cyan glows round a white core for 0.45 s, narrowing as they fade, a glow at each end (≥ 40 and 50 px), with flashes. Toast "Energy beam". Hand-off: the star stage exposes
  `beam`; `planet/stage.ts` passes `star?.beam` to combat. The control is the existing Fire
  ([hudandcontrols.md](hudandcontrols.md)); no new button, no menu.
- Computed (`star/rules.test.ts`, `civilization/rules.test.ts`): 100 shots shrink a sun by 18.1%; a 0.4-sun red dwarf
  hits the floor after 143 shots. Shots to destroy (red dwarf 20% / sun 20% / sun full / blue giant full): a 1% rock 1
  everywhere, a 10% body 13 / 9 / 4 / 2, a 50% world 65 / 49 / 22 / 11. Rival shields break after 2 shots (level 1) and 6
  (level 3, mending included) at P = 1; an equal-mass level-1 rival is beaten after 10 + 42 shots at P = 1 and 4 + 19 at
  full sun cover (shield shots + bites), with 58% of its world left.
- Measured (sun, Dyson 30%, P 1.22, manual ticks): a 10% body lost 1.22% of you a shot with three 0.163% chunks, and
  shattered on the 8th shot for 1.6% of the star; all 21 chunks flew clear, 16 still loaded 20 s later. A level-1 rival
  (0.53 of you): shield 30 → 6 → −4.5 K with no mass lost, then 1.19% of you a shot; two shots soaked after it mended,
  none once its fleet was shot away; beaten after 23 shots (people 0.185, 59% of its world left) for 4.5% of the star.
  A beaten rival shot from 13% to 11.8% of you left the roster and was caught as a moon. Earlier (heat beam): 15 packed
  raiders died to one beam.

### Colonies and terraforming [L]

`star/colony.ts`, with a hook in `civilization/stage.ts` (`colonies`) and the carry-on in `main.ts`.

- **Colony fleet:** each caught planet gets a carrier and a colony ship, one fleet at a time, costing `COLONY` 60 ore + 40
  volatiles + 1 bn people, and only with ≥ 1.5 bn at home. Until then the Star panel's why row says "Colony ship needs …".
  On arrival the planet is `terra`; it becomes a colony at score ≥ 0.3 (`COLONY_HAB`). Score = min(water, temp, air) ×
  (0.5 + 0.5·field): life speed without its "field above 0" gate, since miners can bring air and water but not a core.
  A planet's climate is set from the star's warmth where it is (`heatAt`).
- **Terraforming:** one miner flies 20 volatiles from stock per trip (`TERRA_VOL`): +0.1 atm or +2% water, whichever
  score is weaker; none when only temperature is the problem. Computed: an airless 10^4 rock at a sun takes 10 trips (200
  volatiles) to reach 0.43 atm and 18% water, +34% mass.
- **Rings (Q1):** colonies and terraforming planets move to a ring in their liquid band (`zoneSlot`: from your orbit
  floor to the last ring, in 0.1 R★ steps, at least reach + 0.4 R★ from your orbit and other living rings, so clear of
  your moons; the band is placed as if the planet had ≥ 0.7 atm). No room: it stays. Lifeless planets keep their rings.
  Colony ships fly 2 R★/s, 2 R★/s² (the system is compressed).
- **What colonies give:** each adds the civilization `capacity(score, m)` to the people cap, and Dyson build speed
  × (1 + 0.5 per colony) (`dysonSpeed`). Star panel: "Planets 2/5 · 1 colony". While a colony lives the civilization stays
  awake even if your home life fails.
- **Losing a colony** (score < 0.15 `COLONY_LOST`, eaten, past the gas line, or the star lost): its share of the people
  dies (its room ÷ the cap, ≤ 50%), the cap and Dyson speed drop, and a calm toast says so; a colony that only lost its
  score goes back to terraforming.
- **Destabilized planets:** a planet past the gas line (`envelope`: gas ≥ 20% at ≥ 10^5) is a gas world: it leaves its
  ring and drifts off ("A gas world"; a colony is lost with it). Your home world keeps the sticky gas line and the Brown
  dwarf ending ([planetgameplay.md](planetgameplay.md)).
- **Carrying on (Q3):** if your world dies while a colony lives, there is no game-over card: you go on as the colony
  world (its mass, make-up, heat and velocity) with life full ("Your colony carries on"). Smallest version: the star,
  Dyson, moons, stock and people stay behind; a new civilization starts at 0.2 bn and must make contact again. The card
  shows at most once (`run.card = -1`).
- Measured: a fleet flies 2.5–4 s; terraform → colony in 30–45 s with stock; the people cap went 10.1 → 16.2 bn with one
  colony; losing it took the people 4.64 → 2.91 bn.

### How a star looks

`look.ts`. The standing rules hold: the background stays dim, and only stars get boiling layers, streamers and bloom wider
than 2 R★, so a hot planet never reads as a star.

- **Photosphere:** one opaque normal-blend disc (near-white centre → class colour → a darker, warmer limb; a cooler limb
  on hot stars) and two granulation layers drifting 0.05–0.12 rad/s.
- **Limb and corona:** a thin saturated chromosphere rim with a spicule fringe; two corona streamer layers breathing ±5%
  over 6–9 s (no hollow ring, no seam).
- **Halo:** its own baked falloff (not the shared glow); the Dyson's infrared glow is folded into it.
- **Radiation:** a haze with outward radial grains out to √(2.3·light) R★ (`FLUX_K`), dimming with the Dyson; no edge, no
  text (a red dwarf's sits under its disc).
- **Far light:** alpha 0.32–0.5 by class (was 0.8), class-tinted.
- The opaque disc hides the back half of the Dyson shell. Flares: the same prominence loop, tinted with the rim colour.

| Class | Disc | Halo (radius / alpha) | Corona | Haze |
|---|---|---|---|---|
| Red dwarf | orange-red, coarse cells, a few large round spots with penumbra | 2.2 R★ / 0.30 | 2.3 R★ | ~1.2 R★ |
| Sun-like | white centre, orange limb, fine cells, few small spots | 3.2 R★ / 0.45 | 2.9 R★ | ~1.6 R★ |
| Blue giant | smooth pale blue-white, cool limb, strongest centre bloom, long streamers | 5 R★ / 0.60 | 4.2 R★ | ~3 R★ |

- **Page and sprites:** one 1024² star page baked once (4 MiB + mips, 16 one-time bake draws); 12 sprites a star in one
  batch (far, halo, haze ×2, corona ×2, photosphere, core, granulation ×2, limb, flare), all normal blend: glow cells are
  baked with alpha 0, so they add light. Plus the Dyson sphere's back and front halves (2 particle containers) and the
  filaments (1 additive container, only while linking). `StarLook` carries the star's temperature `K` and light `glow`,
  so the class needs no colour search.
- **Fill-rate fallback:** a star wider than half the screen drops far light, haze and corona.
- Measured: draw calls for the star container unchanged (1 far, 2 linking, 4 with Dyson + linking). Frame CPU showed no
  measurable difference (150-frame blocks, noise ±0.1 ms): sun 1.39 vs 1.49 ms old, blue giant 1.25 vs 1.26, red dwarf
  1.02 vs 0.91. GPU for the star (timer query median): red dwarf 0.03 vs 0.09 ms old, sun 0.04 vs 0.10, blue giant
  0.18 vs 0.12. Page cost: [techandperformance.md](techandperformance.md).
- Lighting: a shadow sprite on your world only (your night side, fading in within 16 → 8 R★).
- The Star panel (name, temperature, mass, link or Dyson bar, a why row, "Seas liquid" range, "Planets n/cap · colonies";
  no engine row) shows in your HUD card near a star: [hudandcontrols.md](hudandcontrols.md).

### Measured

- Link 60.02 s; Dyson 50% 100 s after control with stock; draw calls 13 → 14–19; frame CPU 1.30 → 1.53 ms while linking
  (before the visuals overhaul).

### Concept coverage

Concept points 3, 4 and 5 (the user's words: `vision.md` → Concept), read from code after waves 2–4 (2026-11-14):

| Concept item | Status | Evidence |
|---|---|---|
| Rising energy need forces a star connection; radioactives before | Built | contact at ≥ 80% energy need or 300 s (`civilization/stage.ts`); energy = inner heat + radioactive + Dyson |
| 60 s near a star → connection | Built | `LINK_S = 60`, band 2–4 R★ (`star/rules.ts`); `control()` in `star/stage.ts` |
| Control transfers to the star, carries its planets | Built [D], [I] | thrust steers the star from the link; system planets ride rings (`star/system.ts`) |
| Star classes | Built | 0.4–8 suns, six named classes, radius 800·(M/0.4)^0.15 u (`star/rules.ts`) |
| Star grows with new planets; planet capacity | Built [I] | +3% mass a planet (`GROW`), `capacity(M)` |
| Star visuals | Built | [C] overhaul in `star/look.ts` |
| Dyson built from metal | Built | 10 × 60 ore × 20 s; ore is mined metal (since 2026-11-14) plus star lifting |
| More living planets speed tech and Dyson | Built [L] | `dysonSpeed` 1 + 0.5 per colony; colonies add people room |
| Dyson replaces radioactives, unlocks advanced defence | Built [K] | Dyson energy feeds the civilization and the engine; the beam from 20% |
| Click-to-fire energy weapons costing star fuel | Built [K] | beam on Fire, 0.2% of the star a shot, floor 0.3 suns |
| Carrier + colony ship, colonization, terraforming, destabilized planets | Built [L] | `star/colony.ts`; gas worlds leave their ring |

## Planned

- **Q3, the rest:** the full colony carry-on that keeps the star, its Dyson sphere, moons, stock and people (today you
  carry on as the colony world with a fresh civilization and no star).
- **Not in any package yet:** leaving a star orbit by choice, several owned stars, terraforming by redirecting a comet
  (roadmap item 2), a gas world turning into a brown dwarf (concept 5).

## Open issues

- **[D] Thick-air worlds cannot reach their band:** with no Dyson the liquid band starts beyond the top of the orbit range
  for a sun from 1.2 atm, a red dwarf from 1.3 atm, 8 suns from 0.9 atm (gassy worlds at 1.36–1.41 atm are common). They
  wait at the range's outer edge (warm but liquid) until the Dyson pulls the band in; from ~1.6 atm there is no band.
- **Blue giant at 1e5:** six rings overflow the short side at the 2.5× zoom cap (the first four fit; all six from ~2e5,
  computed). Accepted with the stylised scale.
- **Stylised-scale side effects** (2026-11-14): only a blue giant still burns a civilization in the link band (sun and
  red dwarf doses stay under 0.5); moons over 12.5% of you can no longer be caught; the mining reach and
  guard distances shrink with the slots; climate and dose shift in Age III; linking a blue giant needs sideways speed; a
  neighbour star can fall into yours; living planets often find no room in the band clear of your moons (they then keep
  their ring). Not playtested.
- **[D]** The orbit eases for any world with a band, not only living and terraforming ones (Q1 lets lifeless ones sit
  anywhere).
- **[D]** The 80%-need contact path is not playtested.
- **[L] No colony formed in the playtest** (0% of the time): the 1 bn spare people rule (≥ 1.5 bn at home) was never met.
- **[D] Red-dwarf link trap** (playtest, before the stylised scale): the link toast said "stay 3–8 radii" while
  "Radiation sickness · keep farther" fired at 6 R★; people fell 0.07 → 0.02 bn; at 0.10 atm there is no liquid band.
  The compressed flux now keeps a red dwarf's dose under 0.35 in the whole band (computed); not re-playtested.
- **[K]** The gun-like beam is slow against worlds: ~70 s of steady fire (23 shots) and 4.5% of the star to beat a
  level-1 rival half your mass at a sun's 30% (frigates and missiles are the burst weapons); first tuning lever: shield heat
  (20 K × P). Not playtested by a person.
- **[L] Q3 carry-on is the smallest version:** the star, Dyson, moons, stock and people are lost when you continue as a
  colony.
- **[C]** The wide-star fallback was not checked visually.
- Hot stars above 4,700 K untested for link balance.
- Not built: leaving a star orbit, several owned stars.
- The ore stock is mined metal only (2026-11-14), so the Dyson now matches the concept's "collected metals"; star lifting adds ore at 0.2/s on top.
- Conflicts with standing rules, settled: a growing star vs realism → fun first ([I]); planets turning into gas worlds
  vs "growth never stops play" → system planets and colonies only ([L]); control at the link ([D]) and the brighter stars
  ([C], under "hot planets must not look like stars").
- Star events (superflare, sungrazer, rival star claim, pirate Dyson raid) are planned in
  [gameevents.md](gameevents.md).

## Decisions

- **Stars only by takeover, link automatic** (user, standing; [README.md](README.md)).
- **Background stays dim; hot planets must not look like stars:** heat glow is deep red behind the body; boiling
  additive layers belong to stars (user, standing).
- **Light = M^0.6** (fun first: M^3.5 made blue giants 1,450× a sun).
- **Unified stylised scale** (user, 2026-11-14: "fix all sizings, there is things bigger than a star", "star has no
  gravity", "no need to make the distances realistic … a little closer than usual. Otherwise, the star system won't fit
  on the screen. same for planet moons, sizes etc", "star isnt pull a star"): planets capped at 500 u, stars absolute
  (800·(M/0.4)^0.15 u, 1 sun = 6e7), one gravity from mass for everything including star on star (12 s lap floor), the
  compressed `layout` above, moons ≤ 12.5% on 2.4 + 1.0k slots, capacity 6, light 50 / 2.3 / 9.
- **The way to Age III is not designed yet;** debug "Star contact" opens it (user, 2026-11-13, when the ten-step tech
  ladder went). Replaced by automatic contact ([D], from concept 3).
- **Star visuals:** "The sizes, brightness, radiation, and halo effects of stars must be visually improved. The current
  implementation looks very ugly." (user, 2026-11-13).
- **Concept 3–5** (energy need → star, control at the link, classes, growth and planet capacity, Dyson from metal,
  energy weapons on star fuel, carrier and colony ships, terraforming, destabilized planets) adopted as the plan (user,
  2026-11-13).

### Decided 2026-11-13 (open decisions Q1–Q7)

- **Q1, orbits round your star** (user, 2026-11-13): "As with moons, this should happen automatically. All habitable planets must be within the habitable zone. Uninhabitable or lifeless planets, such as resource-poor dwarf planets, can exist inside or outside this zone. Planets undergoing terraforming will automatically be moved into the habitable zone." No orbit control: living and terraforming planets ease into the liquid band by themselves; lifeless ones keep any ring.
- **Q3, what ends a run after star control** (user, 2026-11-13): "Star maybe can die but our game over should be last living planet. maybe i collide to other star wrongly, but if there is life, i can found another star." Game over = your last living planet is lost; a star can be lost (a bad star collision) and, while life remains, you can link to another star.
