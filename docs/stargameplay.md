# Star gameplay

Age III: star contact, stars as places, the stylised scale, the approach, the link, control of a star and the automatic
orbit, the Dyson sphere, system planets, losing and swallowing stars, the energy beam, colonies and terraforming, and how
a star looks. Code: `evolution/star/` (`rules.ts` numbers, checked by `rules.test.ts`; `stage.ts` approach, link,
control, orbit, beam feed, star collisions; `dyson.ts` the Dyson builder; `system.ts` system planets; `colony.ts`
colony fleets, colonies and terraforming; `look.ts` sprites and the star page; `hud.ts` the Star panel). Contact is in
`civilization/stage.ts`, the beam shot in `civilization/combat.ts`, carrying on as a colony in `main.ts`. Labels:
[README.md](README.md).

## Built

### Star contact

- **Contact is automatic** (`civilization/stage.ts`): when your people's need (people + shield upkeep) is ≥ 80% of the energy the world makes (`CONTACT_NEED`), or 300 s into the civilization (`CONTACT_S`).
- One calm toast: "Your people need a sun" / "Their world no longer feeds them · its far light shows on the horizon". No arrow: the first star's far light shows where it is. The planet stage then creates the star stage (`createStarStage`).
- Debug's Star jump calls the same contact hook, then links the nearest star.
- Measured (one test, undated): contact came by the 300 s rule; the need never reached 80% (population capped by habitability, a 0.38 atm world).

### Stars as places

- Placed after contact, in fixed world units: the first 24,000 u away toward the emptiest of 8 directions (by field fill), then one per 120,000 u cell (60%). A far-light sprite (60,000 u) makes them landmarks without arrows.
- Mass 0.4 · 20^(u²) suns (median 0.85), T = 5,800·M^0.6 K. 1 sun = `SUN` 6e7 game mass; radius `starRadius` = 800·(M/0.4)^0.15 u, the same whatever your mass.
- Classes by temperature (`starName`; examples computed):

| Class | From | Example mass | T | Radius (u) | Light (M^0.6) |
|---|---|---|---|---|---|
| Red dwarf | 0 K | 0.4 suns | 3,347 K | 800 | 0.58 |
| Orange star | 4,400 K | | | | |
| Yellow star | 5,300 K | 1 | 5,800 K | 918 | 1.00 |
| White star | 6,500 K | 2 | 8,791 K | 1,018 | 1.52 |
| Blue star | 10,000 K | 4 | 13,325 K | 1,130 | 2.30 |
| Blue giant | 16,000 K | 8 | 20,197 K | 1,254 | 3.48 |

Fun first: smallest to largest differ only 1.6× in radius, so every system fits on screen; classes read mostly by tint
(a blackbody fit, `starColor`) and halo.

### Stylised scale (user, 2026-11-14)

"No need to make the distances realistic … a little closer than usual. Otherwise, the star system won't fit on the
screen. Same for planet moons, sizes etc." One rule set from the star's centre (`rules.ts` `layout(R★, r, slots)`;
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

- The smallest star a beam can leave (`BEAM_MIN` 0.3 suns, 766 u, 1.8e7 mass) is 1.5× the planet size cap `R_CAP` 500 u and above any spawn (0.9e7) or brown dwarf. Moon slots are compressed too ([planetgameplay.md](planetgameplay.md) → Moons).
- Computed (`rules.test.ts`, 2026-11-16), orbit at its floor, system edge vs the short half-view at the 2.5× zoom cap: at 1e5 a red dwarf 4,185 / 6,262 u, a sun 5,081, a blue giant 6,916 (overflows); at 1e6 7,283 / 8,179 / 10,015 of 10,464.

### Approach

- **Light** = M^0.6 (fun first: M^3.5 made blue giants 1,450×), dimmed ≤ 80% by the Dyson. Compressed with the system:
  - dose: flux 2.3·light/x² (x in R★; ignored past 10 R★);
  - warmth: 50·√light/x K on your climate (fades out between 12 and 8 R★);
  - sunlight: 3·light/x on your solar farms (1 at 3 R★ from a sun, no floor; [civilizationgameplay.md](civilizationgameplay.md) → Energy and dose).
- Computed (`rules.test.ts`, 2026-11-16), dose (field 0.6, 1 atm) at 2 / 3 / 4 R★: red dwarf 0.31 / 0.23 / 0.21, sun 0.41 / 0.28 / 0.23, blue giant 1.02 / 0.55 / 0.38 (only a blue giant burns, at the band's inner edge). Warmth at 2 R★: red 19 K, sun 25 K, blue 47 K.
- **Roche** 1.3–1.6 R★ (rock 1.51 / metal 1.30 / ice 1.60) strips up to 15%/s; toast "Roche limit" / "Tides are tearing your world apart · climb out". Touching the star kills.
- **One gravity** (user, 2026-11-14: "star's gravity not good enough", "star isnt pull a star"): μ★ = G_WORLD · M · SUN, no boost, pulling you (until linked), loose bodies and other stars with μ★/d²; on you and loose bodies only out to 12 R★ (`PULL_X`). Pull at 2.5 / 5 R★ as a share of a 1e5 world's thrust (computed, 2026-11-16): red dwarf 25 / 6%, sun 47 / 12%, blue giant 200 / 50% (link a blue giant with sideways speed).
- Rocks near a star fall in and burn (moons and held bodies are spared). Stars pull each other: yours moves by its engine, the rest drift free, and touching stars merge.
- **Flares:** mean 20 s, 1.6 s brightening (a prominence rises on the limb), then 9·light/x² K and dose × 4 for 4 s; fade 1.2 s; past 6 R★ only a show. A shield that is up takes the whole flare as weapon fire (`civilization/stage.ts` `shieldTake`); a downed one lets it through.
- **Run endings here:** "Fell into a …" (touching the star) or "Torn apart by a …'s tides" (below 0.25 × AGE_GOAL).

### Link

- 60 s in 2–4 R★ (`BAND`); progress decays 2× outside. Filaments (1 + 4 × progress strands of grains, star colour → yours) grow and snap when you leave.
- Toasts: "Linking" on entering the band; at 100% "Star linked" / "The … is yours · your thrust steers it · your world finds its seas' orbit by itself".
- Only the nearest star links; the others decay. On approach the camera pulls back from 8 R★ (full at 5 R★).

### Control

- **From the link your thrust steers the star:** engine = 2 × thrust × clamp(0.6 + √(Dyson E/s ÷ 10), 0.6, 2), drag 0.4 (it coasts to a stop in a few seconds). User, 2026-11-14: the star was far too slow. "Stars only by takeover, link automatic" still holds.
- Engine × your thrust at Dyson 0 / 50 / 100% (`rules.test.ts`, 2026-11-16): red dwarf 1.20 / 2.10 / 2.47; sun 1.20 / 3.20 / 4.00; 8 suns 1.20 / 4.00 / 4.00.

### Orbit

- Kinematic (`core/orbits.ts`, μ = μ★), captured at your distance clamped to your orbit range. It eases at 0.8 R★/s to `orbitGoal`: the middle of the liquid band inside the range; with no band it stays in the range (Q1). Orbit goal for a 1e5 world round a sun, no Dyson / full Dyson (2026-11-16): 3.2/2.6, 3.2/3.2, 3.8/3.8 R★ at 0.3 / 1 / 1.4 atm.
- Lap = 2π√(d³/μ★), never under 12 s (`LAP_MIN`). True lap at 4 R★: red dwarf 30.9 s, sun 24.0 s, blue giant 13.5 s.
- Your world and your system planets are carried. Star lifting: 0.2 ore/s while the civilization is awake. Measured (undated): at 1e6 round a red dwarf with two planets, orbit 5.2 R★, lap 44.9 s; star, world and planets stayed on screen every frame, moons and planets clear of the star.
- **Camera** (user, 2026-11-14: "when we attach to the Sun I should be controlling the star… normally focus on star"): it follows your star, pulled back so your orbit, moons and planets stay inside 0.72 of the short half-screen, at most `STAR_VIEW` 1.6× your own view on approach, 2.5× in orbit. Measured (red dwarf, undated): your world and the star both on screen 100%.

### Dyson sphere

`star/dyson.ts` (`createDyson`).

- 10 segments × 60 ore × 20 s, 400 panels; each panel carried by a hauler (2.6 s flight, equator first). The segment spends the ore stock (mined metal plus star lifting).
- Energy 20·√L·cover E/s. It feeds the civilization as its `dyson` input ([civilizationgameplay.md](civilizationgameplay.md) → Energy and dose) and makes the engine stronger. Dimming moves the liquid band inward. From 20% it unlocks the energy beam.
- The panel says why it waits: "Waits for your people: life must recover" or "Next segment needs 60 ore · n stored".
- Toasts: "Dyson sphere" at the start; **50%** "Age III complete" ("Half a Dyson sphere · your people run on starlight · next: close it"); **100%** "Type II civilization".
- Build speed × (1 + 0.5 per colony) (`dysonSpeed`, concept 4: more living planets speed up the sphere).
- Computed (`rules.test.ts`, 2026-11-16): E/s at 50% / 100%: red dwarf 2.0 / 4, yellow star 10.0 / 20, white star 33.6 / 67, blue giant 380.5 / 761. Dyson 50% = 5 segments, 300 ore, ≥ 100 s of building. Liquid band round a sun, cover 0% → 100%: 0.3 atm 1.4–3.9 → 0.6–1.7 R★; 0.6 atm 1.7–∞ → 0.7–∞ R★.

### System planets [I]

`star/system.ts`, run from `star/stage.ts` in the 0.25 s tick.

- **Capture** (`catchPlanet`): a round world (≥ 10^3.5) in the catch zone, slower than circular speed, no bigger than 0.15 R★ (`PLANET_R`), and not a rival, meteor, moon, held or fast body, takes the lowest free ring. `carry` eases it there at 2 R★/s, then moves it kinematically; `release` frees them when the star is lost.
- Planets reuse the `b.moon` flag: no free gravity, never stored with chunks; pirates, ships and moon capture skip them; your slugs and the beam pass them.
- **Capacity** min(6, 2 + ⌊2·log2(M/0.4)⌋): red dwarf 2, sun 4, 1.6 suns and up 6 (the old game had 3 / 6 / 8; 6 so a system fits on screen).
- **Growth:** each planet adds 3% to the star's mass (`GROW`; `grow` recomputes its class and μ). Fun-first deviation, as the concept asks: "acquiring new planets causes the star to grow and increases the number of planets it can carry".
- Toast "A planet joins your star"; the Star panel shows "Planets n/cap". Debug "+Planet" spawns a 10^3.6–10^4.6 metal world in the catch zone.

### Losing or swallowing a star [I] (Q3, in part)

- When your star touches another, the heavier swallows the lighter and keeps both masses (fun first): "A star swallowed".
- If yours is swallowed: its planets are released (colonies die with it: "Colonies adrift"), your world gets 5 s of protection from the new star's pull, tides and surface (`LOST`) and is thrown out at 2 R★/s ("Star lost"). You fly it again and can link another star.
- Game over is unchanged: touching a star or its tides still ends the run, unless a colony lives (Colonies and terraforming [L]).

### Energy beam [K]

- From Dyson ≥ 20% (`BEAM_COVER`), Fire shoots an instant beam (no ore, `BEAM_COOL` 3 s) from your surface toward the aim point and 3 R past it. It stops at the first body (your moons and planets are skipped) and kills every enemy ship before it. It works like a gun (user, 2026-11-14): every shot takes a bite.
- **Power** P = √(cover / 20%) × M^0.3 (`beamPower`): red dwarf 0.76 → 1.70, sun 1 → 2.24, blue giant 1.87 → 4.17 over 20 → 100% cover.
- **A shot** bites `BEAM_BITE` 1% of your mass × P off the body and adds 20 K × P of heat (`beamK`). The body shrinks (`shed`); 40% of the bite flies off sideways as three chunks (at 1.3–1.7× the body's escape speed), the rest is dust. A body within 2 bites (`BEAM_SHATTER`) shatters.
- **Rival worlds:** while the shield holds, a shot takes 20 K × P off it and removes nothing. Once it is down, each shot bites and kills 3 × the share removed of its people (`BEAM_KILL`, capped by `RIVAL_HIT_MAX`). A beaten rival beamed down to moon size becomes a free body you can catch.
- **Star fuel:** each shot shrinks the star to 0.998 of its mass (`BEAM_COST`); none that would leave it under 0.3 suns (`BEAM_MIN`): "Beam off: the star is too small to feed it", and Fire sends a slug again.
- Look: two cyan glows round a white core for 0.45 s. Toast "Energy beam". The control is the existing Fire; no new button.
- Computed (`rules.test.ts`, 2026-11-16): shots to destroy (red dwarf 20% / sun 20% / sun full / blue giant full): a 10% body 13 / 9 / 4 / 2, a 50% world 65 / 49 / 22 / 11; a red dwarf hits the 0.3-sun floor after 143 shots.
- Measured (sun, Dyson 30%, P 1.22, undated): a level-1 rival at 0.53 of you was beaten after 23 shots for 4.5% of the star.

### Colonies and terraforming [L]

`star/colony.ts`, with a hook in `civilization/stage.ts` (`colonies`) and the carry-on in `main.ts`.

- **Colony fleet:** each caught planet gets a carrier and a colony ship, one fleet at a time, costing `COLONY` 60 ore + 40 volatiles + 1 bn people, only with ≥ 1.5 bn at home. Until then the Star panel says "Colony ship needs …".
- On arrival the planet is `terra`; it becomes a colony at score ≥ 0.3 (`COLONY_HAB`). Score = min(water, temp, air) × (0.5 + 0.5·field): life speed without its field gate, since miners can bring air and water but not a core.
- **Terraforming:** one miner flies 20 volatiles from stock per trip (`TERRA_VOL`): +0.1 atm or +2% water, whichever score is weaker; none when only temperature is the problem. Computed (`rules.test.ts`, 2026-11-16): a 10^4 rock (2% gas, 8% water) at a sun takes 9 trips (180 volatiles) to reach 0.44 atm and 16% water, +30.4% mass.
- **Rings (Q1):** colonies and terraforming planets move to a ring in their liquid band, clear of your moons (`zoneSlot`); no room: it stays. Lifeless planets keep their rings. Colony ships fly 2 R★/s.
- **What colonies give:** each adds `capacity(score, m)` to the people cap and speeds the Dyson (`dysonSpeed`). Star panel: "Planets 2/5 · 1 col". While a colony lives the civilization stays awake even if your home life fails.
- **Losing a colony** (score < 0.15 `COLONY_LOST`, eaten, past the gas line, or the star lost): its share of the people dies (its room ÷ the cap, ≤ 50%), the cap and Dyson speed drop, and a calm toast says so; a colony that only lost its score goes back to terraforming.
- **Destabilized planets:** a planet past the gas line (`envelope`: gas ≥ 20% at ≥ 10^5) leaves its ring and drifts off ("A gas world"; a colony is lost with it). Your home world keeps the sticky gas line and the Brown dwarf ending ([planetgameplay.md](planetgameplay.md)).
- **Carrying on (Q3):** if your world dies while a colony lives, there is no game-over card: you go on as the colony world (its mass, make-up, heat and velocity) with life full ("Your colony carries on"). Smallest version: the star, Dyson, moons, stock and people stay behind; a new civilization starts at 0.2 bn and must make contact again. At most once a run (`run.card = -1`).
- Measured (undated): a fleet flies 2.5–4 s; terraform → colony in 30–45 s with stock; the people cap went 10.1 → 16.2 bn with one colony; losing it took the people 4.64 → 2.91 bn.

### How a star looks

`look.ts`. Only stars get boiling layers, streamers and bloom wider than 2 R★, so a hot planet never reads as a star.

- **Photosphere:** one opaque disc (near-white centre → class colour → a darker limb) and two drifting granulation layers. It hides the back half of the Dyson shell.
- **Limb and corona:** a thin saturated rim with a spicule fringe; two corona streamer layers breathing ±5%.
- **Halo:** its own baked falloff, with the Dyson's infrared glow folded in. **Haze:** radial grains out to √(2.3·light) R★, dimming with the Dyson; no edge, no text.
- **Far light:** alpha 0.32 / 0.4 / 0.5 by class, class-tinted.

| Class | Disc | Halo (radius / alpha) | Corona | Haze |
|---|---|---|---|---|
| Red dwarf | orange-red, coarse cells, a few large round spots | 2.2 R★ / 0.30 | 2.3 R★ | ~1.2 R★ |
| Sun-like | white centre, orange limb, fine cells, few small spots | 3.2 R★ / 0.45 | 2.9 R★ | ~1.6 R★ |
| Blue giant | smooth pale blue-white, cool limb, strongest centre bloom, long streamers | 5 R★ / 0.60 | 4.2 R★ | ~3 R★ |

- **Page and sprites:** one 1024² star page baked once; 12 sprites a star in one batch, plus the Dyson halves and the link filaments. Star page and frame cost: [techandperformance.md](techandperformance.md).
- **Fill-rate fallback:** a star wider than half the screen drops far light, haze and corona.
- **Lighting:** a shadow sprite on your world only (your night side, fading in from 16 to 8 R★).
- The Star panel (name, temperature, mass, link or Dyson bar, a why row, "Seas liquid" range, planets and colonies; no engine row) shows in your HUD card near a star: [hudandcontrols.md](hudandcontrols.md).

## Planned

- **Q3, the rest:** a colony carry-on that keeps the star, its Dyson sphere, moons, stock and people.
- **Not in any package:** leaving a star orbit by choice, several owned stars, terraforming by redirecting a comet (roadmap item 2), a gas world turning into a brown dwarf (concept 5). Star events (superflare, sungrazer, rival star claim, pirate Dyson raid): [gameevents.md](gameevents.md).

## Open issues

- **[D] Thick-air worlds cannot reach their band:** with no Dyson the liquid band starts beyond a 1e5 world's orbit range (3.79 R★) for a red dwarf or a sun from 1.3 atm, 8 suns from 1.0 atm (computed 2026-11-16). They wait at the range's outer edge until the Dyson pulls the band in.
- **Blue giant at 1e5:** six rings overflow the short side at the 2.5× zoom cap (computed). Accepted with the stylised scale.
- **Stylised-scale side effects** (2026-11-14, not playtested): a blue giant burns a civilization in the link band and needs sideways speed to link; a neighbour star can fall into yours; living planets often find no room in the band clear of your moons.
- **[D]** The orbit eases for any world with a band, not only living and terraforming ones (Q1 lets lifeless ones sit anywhere).
- **[D]** The 80%-need contact path is not playtested.
- **[D] Red-dwarf link trap:** a playtest before the stylised scale lost people at 6 R★ and found no liquid band at 0.10 atm; the compressed flux now keeps a red dwarf's dose low in the band; not re-playtested.
- **[L] No colony formed in the playtest:** the ≥ 1.5 bn at home rule was never met.
- **[K]** The beam is slow against worlds: ~70 s of steady fire (23 shots) and 4.5% of the star to beat a level-1 rival half your mass at a sun's 30%; first lever: shield heat (20 K × P). Not playtested by a person.
- **[C]** The wide-star fallback was not checked visually. Hot stars above 4,700 K are untested for link balance.

## Decisions

- **Stars only by takeover, link automatic** (user, standing; [README.md](README.md)). **Background stays dim; hot planets must not look like stars:** boiling additive layers belong to stars (user, standing).
- **Light = M^0.6** (fun first: M^3.5 made blue giants 1,450× a sun).
- **Unified stylised scale** (user, 2026-11-14: "fix all sizings, there is things bigger than a star", "star has no gravity", "no need to make the distances realistic … a little closer than usual. Otherwise, the star system won't fit on the screen. same for planet moons, sizes etc", "star isnt pull a star"): planets capped at 500 u, stars absolute (800·(M/0.4)^0.15 u, 1 sun = 6e7), one gravity from mass for everything including star on star (12 s lap floor), the compressed `layout`, at most 5 moons, a star carries ≤ 6 planets, light 50 / 2.3 / 9.
- **Star visuals:** "The sizes, brightness, radiation, and halo effects of stars must be visually improved. The current implementation looks very ugly." (user, 2026-11-13).
- **Concept 3–5** (energy need → star, control at the link, classes, growth and planet capacity, Dyson from metal, energy weapons on star fuel, carrier and colony ships, terraforming, destabilized planets) adopted as the plan (user, 2026-11-13).
- Q1, orbits round your star: automatic; living and terraforming planets ease into the liquid band, lifeless ones keep any ring ([vision.md](vision.md) → Open decisions).
- Q3, what ends a run after star control: the last living planet lost; a lost star can be replaced by linking another ([vision.md](vision.md) → Open decisions).
