# GRAVOLVE docs

The index of the design docs. Code is truth: if a doc and `app/src` disagree, the code wins and the doc gets fixed.
Paths in every doc are under `app/src/` unless they start with `docs/` or `app/`.
The authoritative list of user decisions is `.claude/CLAUDE.md` → Design preferences; the bullets below mirror it.

## Files

| File | Purpose |
|---|---|
| [README.md](README.md) | This index: files, labels, doc layout, standing decisions, stages, code → doc map |
| [vision.md](vision.md) | The concept (verbatim), audience, fun and goals, roadmap, wave plan (with the Kardashev steps and concept status), open decisions Q1–Q7, cross-cutting open issues |
| [asteroidgameplay.md](asteroidgameplay.md) | Age I: tiers, bodies and collisions, heat, gravity, flight and camera, shapes |
| [worldgen.md](worldgen.md) | The field every stage shares: chunks, spawn masses, biomes, regions, cosmic web |
| [planetgameplay.md](planetgameplay.md) | Age II: world tiers, gas line, water, air, climate, life, moons, survival |
| [civilizationgameplay.md](civilizationgameplay.md) | From LIFE on: people, energy, fuel, shield, miners, fleet, rockets on Fire, priority target |
| [stargameplay.md](stargameplay.md) | Stars, link, star control, system planets, Dyson, colonies |
| [gameevents.md](gameevents.md) | Meteors, comets, clashes, pirates; the events director (planned) |
| [shipsandflight.md](shipsandflight.md) | Ship flight model, routes, classes and roles, faction art |
| [aliencivilizations.md](aliencivilizations.md) | Rivals: Age I cores, roster and ledger, rival worlds, strategy, defeat |
| [hudandcontrols.md](hudandcontrols.md) | Controls, HUD, hints, toasts, game over, score, debug mode, achievements, settings, YouTube Playables |
| [techandperformance.md](techandperformance.md) | Stack, rendering, bakes, audio, budget, measured costs, testing |
| [gamedesign.html](gamedesign.html) | The original design doc (Turkish). `asteroid/rules.ts` stays in sync with its "Çarpışma ve Dönüşüm" section; each deliberate difference is stated in the topic doc |

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

- Package tags **[A]–[M]** are listed in vision.md → Wave plan; open decisions **Q1–Q7** in vision.md → Open decisions.
  Planned items are proposals until built; the user can change them.
- Cross-references name the file and a heading (`stargameplay.md` → Link), never a section number or anchor.
- The docs keep the current rule, its numbers, the dated decisions and each measurement's result line with its date;
  the history and full logs live in git. Code comments stay short.

## Standing decisions (user)

Short form. Numbers and details live in the linked doc.

- **Fun first, then realism.** When they conflict, fun wins and the deviation is stated.
- **Browser first, low-end hardware.** Measure before optimizing ([techandperformance.md](techandperformance.md)).
- **Danger is seen, never told.** No off-screen arrows or alerts (tried and removed), no verdict text (only the well colour and the panel edge), no meteor warnings ([hudandcontrols.md](hudandcontrols.md)).
- **Wells are a natural aura** (breathing glow, noisy haze), never crisp rings ([asteroidgameplay.md](asteroidgameplay.md)).
- **No squash pulse. No reverb or echo.**
- **No carbon element:** metal, rock, water ("Water" in UI), gas, plus a radioactive trace.
- **Radioactive matter never decays:** miners take it to a fuel stock that reactors burn; solar farms add power in starlight. Player text says "Rad", never "Radiation" ([civilizationgameplay.md](civilizationgameplay.md)).
- **Background stays dim;** gameplay objects are the brightest things. Hot planets must not look like stars (deep-red glow; boiling layers are for stars only).
- **Absolute spawn masses** plus a thin tail relative to you: small rocks common, something bigger now and then, planets never rain or fly at you. Fast things are small, big things drift ([worldgen.md](worldgen.md)).
- **Momentum flight:** drag 0, braking as slow as speeding up; top speed 1.2 × the body's critical speed (user, 2026-11-14). Spin only from angular momentum ([asteroidgameplay.md](asteroidgameplay.md)).
- **Eaten at ≥ 1.15× you** on a slow touch; in Age I anything lighter (equal included) merges into you.
- **From Age II** (user, 2026-11-14; a deliberate difference from `gamedesign.html`): every hit heats your world (+90 K at 1%, +1000 K at 5%, +4000 K at 12.5%); only bodies under 1% burn up; ≥ 12.5% is a giant impact that merges and melts the world ([asteroidgameplay.md](asteroidgameplay.md)).
- **The shield is a physical shell:** it ignores what would land under 20 K, stops or bounces what it can pay for, and when overwhelmed still vaporises its share so a smaller, slower remainder lands. 30 K of charge a level ([civilizationgameplay.md](civilizationgameplay.md)).
- **Growth never stops play:** no "keep going" card.
- **One body, one run.** After Age I a death offers "Continue as a planetoid". After star control, game over = last living planet lost ([stargameplay.md](stargameplay.md)).
- **Watch and feed:** no build menu. The one player order is the priority target. **Stars only by takeover**, link automatic.
- **Target panel: composition only** (no density, hardness, durability, change line).
- **Priority target** (user, 2026-11-15): one right-click / E / tap sets one fleet priority; it fires nothing by itself; each weapon takes it when it can ([civilizationgameplay.md](civilizationgameplay.md) → Priority target).
- **Weapons read by shape and motion;** hue says the faction. Rockets fly with a flame ([shipsandflight.md](shipsandflight.md)).
- **Moons:** at most 5, caught by flying (match speed on a free ring), never by a click; never thrown (no Sling); ore for your miners, guards by orbiting ([planetgameplay.md](planetgameplay.md) → Moons).
- **Fire** (user, 2026-11-17) launches a guided rocket from your surface, one rocket for you and rival worlds: limited turning, range 3 × the mining reach (rivals arm within 2 ×), no shots across the map; the seeker lets go 0.57 s before the hit, so a hard late burn across slips it, burning away does not (user, 2026-11-18) ([civilizationgameplay.md](civilizationgameplay.md) → Rockets).
- **Rival worlds have their own goals** (user, 2026-11-17): they follow you only within 30 R, give up an outflown chase by persona, and arrive by travel × local density (a quiet stretch speeds the next one up to ×4), so empty space stays lonely ([aliencivilizations.md](aliencivilizations.md) → Rival civilizations).
- **Personas** (user, 2026-11-17): each stage has its own table (Age I cores, rival worlds, civilizations, pirate captains), and a named rival reads all of them from its one temper. A roster of 5, never passive; rivals remember you for the run ([aliencivilizations.md](aliencivilizations.md) → Personas, [gameevents.md](gameevents.md) → Pirates).
- **Salvage** (user, 2026-11-17): enemy wrecks within your fire range give what the ship was made of, burned and carried; your own wrecks give nothing ([civilizationgameplay.md](civilizationgameplay.md) → Stocks).
- **Home mines** (user, 2026-11-15; gated 2026-11-17): your people dig their own world only while nothing else is minable ([civilizationgameplay.md](civilizationgameplay.md) → Stocks).
- **Pirates never destroy a world or kill you:** harm is capped (shield, stock, ≤ ~2% water/air a raid). Keep them as harsh as this (user, 2026-11-17); their ships carry light shields, and a losing fleet that is pressed jumps away to light speed ([gameevents.md](gameevents.md) → Pirates).
- **Look:** you cyan, rivals violet; BASE_ZOOM 1.02 (`main.ts`); ship cell floor `SHIP_MIN_PX` 8 screen px (`render/tech.ts`), so a fighter can draw at ~4 px far out.

Where the concept changed earlier rules: vision.md → Concept vs standing decisions.

## Stages

| # | Stage | Code | Ends | Doc |
|---|---|---|---|---|
| 1 | Asteroid (Age I) | `evolution/asteroid/` | `AGE_GOAL` 10^3.5 = 3,162 mass | [asteroidgameplay.md](asteroidgameplay.md) |
| 2 | Forging a world (Age II) | `evolution/planet/` | life starts | [planetgameplay.md](planetgameplay.md) |
| 3 | Living world | `evolution/planet/` | LIFE (an intelligent species) | [planetgameplay.md](planetgameplay.md) |
| 4 | Civilization | `evolution/civilization/` | star contact: people need ≥ 80% of the energy made, or 300 s in | [civilizationgameplay.md](civilizationgameplay.md) |
| 5 | Star takeover (Age III) | `evolution/star/` | Dyson 50% "Age III complete", 100% "Type II" | [stargameplay.md](stargameplay.md) |
| 6 | Expansion | not built | several stars, three suns | vision.md → Roadmap |

## Code → doc

| Code (`app/src/` unless noted) | Doc |
|---|---|
| `main.ts`, `kit.ts`, `app/index.html` | techandperformance (frame loop, kit, YouTube SDK); hudandcontrols (score, achievements feed, debug); asteroidgameplay (handover, respawn); stargameplay (camera cap, colony carry-on) |
| `core/entity.ts`, `core/camera.ts` | asteroidgameplay |
| `core/input.ts` (+ `input.css`) | hudandcontrols |
| `core/chunks.ts`, `core/rng.ts` | worldgen |
| `core/water.ts` | planetgameplay; asteroidgameplay (heat) |
| `core/orbits.ts` | planetgameplay (moons); stargameplay |
| `core/achievements.ts`, `core/score.ts` | hudandcontrols |
| `evolution/asteroid/rules.ts`, `body.ts`, `player.ts`, `sphere.ts`, `atlas.ts`, `wells.ts`, `feedback.ts` | asteroidgameplay (bakes also techandperformance) |
| `evolution/asteroid/field.ts`, `web.ts` | worldgen; meteors, comets, clash in gameevents |
| `evolution/asteroid/rival.ts`, `evolution/rivals/ledger.ts` | aliencivilizations |
| `evolution/asteroid/hud.ts`, `planet/hud.ts`, `civilization/hud.ts`, `civilization/slots.ts`, `star/hud.ts` (+ `hud.css`) | hudandcontrols |
| `evolution/planet/rules.ts`, `stage.ts`, `moons.ts` | planetgameplay |
| `evolution/civilization/rules.ts` (its pirate block: gameevents; its rival block: aliencivilizations), `stage.ts`, `view.ts`, `lattice.ts`, `combat.ts`, `mining.ts`, `orders.ts` | civilizationgameplay |
| `evolution/civilization/flight.ts`, `nav.ts`, `crash.ts`, `guns.ts`, `ships.ts`, `bolts.ts` | shipsandflight |
| `evolution/civilization/pirates.ts`, `escape.ts` | gameevents |
| `evolution/civilization/rivals.ts`, `away.ts` | aliencivilizations |
| `evolution/star/rules.ts`, `stage.ts`, `look.ts`, `system.ts`, `dyson.ts`, `colony.ts` | stargameplay |
| `render/shipArt.ts` | shipsandflight |
| `render/background.ts`, `bake.ts`, `fx.ts`, `overlays.ts`, `tech.ts` | techandperformance |
| `audio/sfx.ts` | techandperformance |
| `ui/` settings, toast, reticle, gameover, achievements, debug, minimap, panel, rows, tip, pick, hud.css (+ css); `styles/base.css` | hudandcontrols |
| `app/test/**` (`helpers.ts`, `civilization/fakes.ts`, `*.test.ts`) | techandperformance → Testing, and the doc of the module checked |
