# GRAVOLVE docs

The index of the design docs: what each file covers, the labels and layout they share, the standing user decisions,
the stages, and which doc owns which code folder. Code is truth: if a doc and `app/src` disagree, the code wins and the
doc gets fixed. Paths in every doc are under `app/src/` unless they start with `docs/`.

## Files

| File | Purpose |
|---|---|
| [README.md](README.md) | This index: file map, labels, Built/Planned layout, standing decisions, stage table, Kardashev mapping, code → doc map |
| [vision.md](vision.md) | The concept (9 points, verbatim), audience, pillars, goals per stage, roadmap and wave plan, open decisions Q1–Q7, cross-cutting open issues |
| [asteroidgameplay.md](asteroidgameplay.md) | Age I: tiers, bodies and collisions, heat, gravity, flight and camera, shapes, Age I play |
| [worldgen.md](worldgen.md) | The field shared by every stage: chunks, spawn masses, biomes, regions, cosmic web, places |
| [planetgameplay.md](planetgameplay.md) | Age II: world tiers and the gas line, water / air / climate / calm, life, moons, your surface, planetary survival |
| [civilizationgameplay.md](civilizationgameplay.md) | From LIFE on: population, energy, stocks, shield and its upkeep, miners and the mining AI, builds and the fleet (probes, fighters, frigates), surface rockets, mass driver |
| [stargameplay.md](stargameplay.md) | Stars, approach, link, control, system planets, Dyson, energy weapons, colonization and terraforming |
| [gameevents.md](gameevents.md) | Meteors, comets, clashes, pirates, the events director and its catalogue |
| [shipsandflight.md](shipsandflight.md) | Ship flight model, patrol / strike / pursuit routes, ship classes and roles, faction art spec |
| [aliencivilizations.md](aliencivilizations.md) | Rivals: Age I cores, roster and ledger, rival worlds, strategy AI, defeat and spoils |
| [hudandcontrols.md](hudandcontrols.md) | Controls (Fire / Command), HUD panels, debug mode, hints, toasts, game over, achievements, records, settings |
| [techandperformance.md](techandperformance.md) | Stack, rendering, bakes, audio, budgets, measured costs, testing notes |
| [gamedesign.html](gamedesign.html) | The original design doc (Turkish). Untouched; `asteroid/rules.ts` constants stay in sync with its "Çarpışma ve Dönüşüm" section, and each deliberate difference is stated in the topic doc |

## Labels

| Label | Meaning |
|---|---|
| **measured** | run in the game, in a test tab or in a sim on the real formulas (say which when it matters) |
| **computed** | worked out from the formulas or cited constants |
| **structural** | design reasoning only, to be measured when built |
| **checked** | read in the code |
| rule (no label) | how the code works today |
| *start value* | a first guess, to tune by measurement |
| (user) / (user, date) | a user decision; kept verbatim wherever the text moves |

## Layout of every gameplay doc

```
# <Title>
<one paragraph: what this covers; owning code paths>
## Built          rules and numbers as they are in code today, with their labels and "(user, date)" notes
## Planned        concept items not built yet, each tagged with its package, e.g. "[F] Fighters fragment bodies"
## Open issues
## Decisions      user decisions, dated, newest last
```

- Package tags **[A]–[M]** are listed in [vision.md](vision.md#wave-plan); open decisions **Q1–Q7** in
  [vision.md](vision.md#open-decisions). Planned items are proposals until built; the user can change them.
- Cross-references name the file and a heading (`stargameplay.md` → Link), never a section number.
- History and measurement logs belong in git; the docs keep the current rule, its numbers and the dated decisions.

## Standing decisions (user)

- **Fun first, then realism.** When they conflict, fun wins and the deviation is stated.
- **Browser first, low-end hardware.** Measure before optimizing.
- **Danger is seen, never told.** No off-screen arrows or alerts (tried and removed). No verdict text: only the well colour and the target panel edge. No meteor warnings.
- **Wells are a natural aura** (breathing glow, noisy haze); crisp concentric rings were rejected. Same taste for the shield veil.
- **No squash pulse.** **No reverb or echo.**
- **No carbon element:** metal, rock, water, gas, plus a radioactive trace; water takes carbon's "life starts faster".
- **Background stays dim;** gameplay objects are the brightest things on screen. **Hot planets must not look like stars:** heat glow is deep red behind the body; boiling additive layers belong to stars.
- **Absolute spawn masses** plus a thin tail relative to you: small rocks stay common, something bigger turns up now and then, planets never rain or fly at you. **Fast things are small, big things drift.**
- **Momentum flight:** drag 0, braking as slow as speeding up; forward thrust fades out toward a top speed of 1.2 × the body's critical speed (the speed at which a head-on hit on a body like it destroys it), so each body has its own and can always choose to fly fast enough to die on impact or chip a planet, but cannot speed up forever (user, 2026-11-14).
- **Spin only from angular momentum.**
- **Eaten, not captured:** a slow touch from a body ≥ 1.15× you ends the run (no 5 s escape window); in Age I anything lighter, an equal peer included, merges into you, so equal bodies never flip between bounce and stick. **From Age II** (user 2026-11-14; a deliberate difference from `gamedesign.html`): every hit heats your world by `worldHeat`, its fall energy spread through the whole world, scaling with mass ratio^1.5 and (speed / stick speed)² (real physics is linear in mass; ^1.5 keeps pebbles mild): slow hits +8 K at 0.2%, +90 K at 1%, +256 K at 2%, +1000 K at 5%, +4000 K at `GIANT_HIT` 0.125, capped at 4420 K. Only bodies under `BURN_MAX` 1% burn up in the air; a shield holds only hits up to its full range (34.5 / 69 / 103.5 K at levels 1–3), bigger ones break through and collapse it; heat far above the climate cools slowly (`RELAX_S` × (1 + excess heat units), so a magma ocean lasts minutes). A solid world (≤ 1410 K, `MOLTEN`) bounces small bodies, which then shatter on the ground; a body ≥ `GIANT_HIT` (too big to be a moon) is a giant impact (Earth–Theia): it merges and melts the surface; while either body is molten they merge like asteroids again, rival worlds included (user, 2026-11-14). Small bodies burn up in your air as dust. See [asteroidgameplay.md](asteroidgameplay.md).
- **Growth never stops play:** no "keep going" card; you level up and transform automatically.
- **One body, one run;** after Age I a death offers "Continue as a planetoid".
- **Watch and feed:** no build menu, no priority toggle. **Stars only by takeover,** link automatic. Rocky line is the main game.
- **Target panel: composition only** (no density/hardness/durability, no change line).
- **No meteor trails** except burn-up streaks in your own air.
- **Ships attack rocks only as your priority** (user, 2026-11-14; priority 2026-11-15): a Command tap on any body, rival world or enemy ship makes it your one priority target, not an immediate attack: each weapon takes it first as it comes ready and can hurt and reach it, fighters focus a priority ship over any other (the same target again clears it; a rival world: the siege, which also starts by itself within 14 R; a small note says honestly how it stands, "Reloading · 2 s" while ships cool); rockets only at the priority, homing (distance and an early sidestep beat them and missiles). No Sling: Fire is the mass driver or the beam. The shield ignores what would land under 20 K. [civilizationgameplay.md](civilizationgameplay.md) → Priority target.
- **Pirates never destroy a world or kill you.** Their harm is capped (user, 2026-11-13): shield, stock, and with both gone a little water / air (≤ ~2% a raid).
- **Look:** you cyan, rivals violet; ships ≥ 8 px; BASE_ZOOM 1.02 (20% closer than the old 0.85).

Note on "ships ≥ 8 px": in code the floor is a fleet *cell* of `SHIP_MIN_PX` 8 screen px, so a fighter can draw at
~4 px when zoomed far out (`render/tech.ts:18`). See [shipsandflight.md](shipsandflight.md).

### Where the concept changed them

The user's concept ([vision.md](vision.md#concept)) superseded three earlier rules; the full list of conflicts and
resolutions is in [vision.md](vision.md#concept-vs-standing-decisions).

| Earlier rule | Concept | Now | Package / decision |
|---|---|---|---|
| No shield upkeep (fun-first deviation, `civilizationgameplay.md`) | "Planetary shields consume energy" | **decided 2026-11-13, built:** 0.1 E/s per level, paid before the people are fed | [F], Q7 |
| Pirates never seek you out | "sometimes toward the player", they "may attack", you can escape | **decided 2026-11-13, built:** pirates always roam the world in random-size groups; avoid them as an asteroid; they attack you only after LIFE, unpredictably and rarely, and give up past a distance; still no warning text or arrow. Redesigned 2026-11-14: every group has a hauler, they crack and haul rocks, and never fly into planets ([gameevents.md](gameevents.md) → Pirates) | [B], Q2 |
| Star engine only at Dyson 50% | "Control then transfers to the star" at the link | **built:** control at the link with a base engine of 1.2× your thrust; Dyson scales it to 4×. "Stars only by takeover, link automatic" still holds | [D], Q1 |

## Stages

| # | Stage | Owner | Ends | Length | Doc |
|---|---|---|---|---|---|
| 1 | Asteroid (Age I) | `evolution/asteroid/` | AGE_GOAL 10^3.5 = 3,162 (start 69.5) | 73 s skilled, 150 s+ slow bots (measured); target 80–120 s | [asteroidgameplay.md](asteroidgameplay.md) |
| 2 | Forging a world (Age II) | `evolution/planet/` | life starts | a few minutes | [planetgameplay.md](planetgameplay.md) |
| 3 | Living world | `evolution/planet/` | LIFE (an intelligent species) | ~1 min once habitable (30 s at life speed 1) | [planetgameplay.md](planetgameplay.md) |
| 4 | Civilization | `evolution/civilization/` | Star contact: your people need ≥ 80% of the energy the world makes, or 300 s in | ≤ 5 min (the 300 s rule) | [civilizationgameplay.md](civilizationgameplay.md) |
| 5 | Star takeover (Age III) | `evolution/star/` | Dyson 50% "Age III complete", 100% "Type II"; system planets and colonies run inside it | | [stargameplay.md](stargameplay.md) |
| 6 | Expansion | not built (several stars, three suns) | | | [vision.md](vision.md#roadmap) |

## Kardashev mapping

The concept frames the run as a climb up the Kardashev scale; `gamedesign.html` names the steps Tip 0–III
(pre-planetary, planetary, stellar, galactic civilization).

| Kardashev step | GRAVOLVE stages | What marks it in the game | Status |
|---|---|---|---|
| Before a civilization | 1 Asteroid, 2 Forging, 3 Living world | you are a body, then a world; life fills | Built |
| Type 0 → I: one planet | 4 Civilization at LIFE (concept 1) | people, a level-1 shield and 2 defence ships; energy from inner heat and reactors burning a radioactive fuel stock; the world's own resources | Built |
| Type I: the planet's space | 4 Civilization with moons (concept 2, 9) | miners on every moon (a radioactive / metal / water mix, never rock); probes, fighters and frigates each with its own cap, surface rockets, roaming miners, mining AI | Built [E], [F], [G] |
| Type I → II: a star | 5 Star takeover (concept 3, 4) | star contact when your people need a sun; link after 60 s near a star; you steer the star; Dyson 50% "Age III complete", 100% "Type II"; the energy beam | Built ([C], [D], [K]) |
| Type II: a planetary system | 5 (concept 3, 5) | system planets the star carries, colonies, terraforming | Built [I], [L]; carrying on as a colony is the smallest version (Q3) |
| Toward Type III | 6 Expansion | several stars; end goal three suns, then Ascension | Planned (roadmap, no package yet) |

`gamedesign.html` puts Tip II at a Dyson swarm of 50%; the game calls 50% "Age III complete" and 100% "Type II".

## Code → doc

| Code (`app/src/`) | Doc |
|---|---|
| `main.ts` (frame loop, handover, respawn, debug transforms, achievements feed, the run's one combat and news latch (`combat`, `runNews`), star camera cap, carrying on as a colony) | [asteroidgameplay.md](asteroidgameplay.md) (handover, respawn), [hudandcontrols.md](hudandcontrols.md) (debug, achievements), [techandperformance.md](techandperformance.md) (frame loop, bakes), [gameevents.md](gameevents.md) (Age I pirates), [stargameplay.md](stargameplay.md) (camera cap, colony carry-on) |
| `core/entity.ts`, `core/camera.ts` | [asteroidgameplay.md](asteroidgameplay.md) (flight and camera) |
| `core/input.ts` | [hudandcontrols.md](hudandcontrols.md) |
| `core/chunks.ts`, `core/rng.ts` | [worldgen.md](worldgen.md) |
| `core/water.ts` | [planetgameplay.md](planetgameplay.md) (water, climate), [asteroidgameplay.md](asteroidgameplay.md) (heat) |
| `core/orbits.ts` | [planetgameplay.md](planetgameplay.md) (moons), [stargameplay.md](stargameplay.md) (your orbit, system planets) |
| `core/achievements.ts` | [hudandcontrols.md](hudandcontrols.md) |
| `evolution/asteroid/rules.ts`, `body.ts`, `player.ts`, `sphere.ts`, `atlas.ts`, `wells.ts`, `feedback.ts` | [asteroidgameplay.md](asteroidgameplay.md); `body.ts` `absorb` / `shed` / `drop` / `shatter` are shared by every stage (Bodies and collisions) |
| `evolution/asteroid/field.ts`, `web.ts` | [worldgen.md](worldgen.md); meteors, comets, clash in [gameevents.md](gameevents.md) |
| `evolution/asteroid/rival.ts`, `evolution/rivals/ledger.ts` (roster, off-screen life, stance and war-wave rules) | [aliencivilizations.md](aliencivilizations.md) |
| `evolution/asteroid/hud.ts`, `evolution/planet/hud.ts`, `evolution/civilization/hud.ts` (+ `slots.ts`, the fleet slots), `evolution/star/hud.ts` | [hudandcontrols.md](hudandcontrols.md) |
| `evolution/planet/rules.ts`, `stage.ts`, `moons.ts` (moon select, grind; Command's tap sets your priority target) | [planetgameplay.md](planetgameplay.md) |
| `evolution/civilization/rules.ts`, `stage.ts`, `view.ts`, `lattice.ts`, `combat.ts`, `weapon.ts`, `mining.ts` | [civilizationgameplay.md](civilizationgameplay.md); star contact (`stage.ts`) and the energy beam shot (`combat.ts`) also in [stargameplay.md](stargameplay.md) |
| `evolution/civilization/flight.ts`, `nav.ts`, `crash.ts`, `guns.ts`, `ships.ts` | [shipsandflight.md](shipsandflight.md); defence duties, the frigate and rockets in [civilizationgameplay.md](civilizationgameplay.md) |
| `evolution/civilization/pirates.ts` | [gameevents.md](gameevents.md) (Pirates); their routes in [shipsandflight.md](shipsandflight.md) |
| `evolution/civilization/rivals.ts`, `away.ts` (its ships away) | [aliencivilizations.md](aliencivilizations.md) |
| `evolution/star/rules.ts`, `stage.ts`, `look.ts` | [stargameplay.md](stargameplay.md); star page cost in [techandperformance.md](techandperformance.md) |
| `evolution/star/system.ts` (system planets: catch, carry, release) | [stargameplay.md](stargameplay.md#system-planets-i) |
| `evolution/star/colony.ts` (colony fleets, colonies, terraforming) | [stargameplay.md](stargameplay.md#colonies-and-terraforming-l); the people it adds or kills in [civilizationgameplay.md](civilizationgameplay.md) |
| `render/shipArt.ts` | [shipsandflight.md](shipsandflight.md) |
| `render/background.ts`, `bake.ts`, `fx.ts`, `overlays.ts`, `tech.ts` | [techandperformance.md](techandperformance.md) |
| `audio/sfx.ts` | [techandperformance.md](techandperformance.md) |
| `ui/` (settings, toast, reticle, game over, achievements, debug, minimap, panel) | [hudandcontrols.md](hudandcontrols.md) |
| `app/test/**/*.test.ts` (`npm test`) | [techandperformance.md](techandperformance.md) (testing) and the doc of the module they check |
