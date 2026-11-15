# GRAVOLVE vision

What GRAVOLVE is for: the user's concept, who plays, what makes it fun, the goals per stage, the roadmap and its wave
plan, the open decisions, and the open issues that cut across stages. How each system works today is in the topic docs
listed in [README.md](README.md); labels (measured / computed / structural) are explained there too.
Design rule: **fun first, then realism**.

## Concept

The user's concept (user, 2026-11-13), verbatim. It is the source of every Planned item in the docs.

> **Game Concept – Evolution of Civilization**
>
> The game is based on a progression system inspired by the Kardashev Scale. The player starts as a single asteroid and evolves into an advanced, multi-planetary stellar civilization. The core gameplay combines resource management, planetary survival, exploration, colonization, and combat mechanics.
>
> **1. Planet Formation and Life**
> The player starts as an asteroid and gradually transforms into a planet. Life emerges when conditions such as water, metal, magnetic field, and temperature balance become sufficient.
> Once life emerges, the planet automatically gains an energy shield and two fighter ships. The fighters break apart approaching large celestial bodies, reducing the heating caused by atmospheric entry and making resource collection easier.
> This stage represents a civilization that depends solely on the resources of its own planet.
>
> **2. Space Mining and Defense**
> When the planet begins collecting moons, mining ships start gathering necessary resources such as metal, water, and radioactive materials from nearby moons and accretion disks.
> One frigate is equipped with missiles capable of breaking large celestial bodies into collectible fragments.
> The number of mining ships and other ships is limited by the amount of metal available, and resource collection activities are prioritized according to the civilization's needs.
>
> **3. Star Connection and Control**
> As the planet's energy requirements increase, the player must connect to a star. Radioactive materials are used during stages 1 and 2.
> When the planet remains near a star for 60 seconds, an orbital connection is established. Control then transfers to the star. The star becomes the player's main character and carries its connected planets along with it.
> The sizes, brightness, radiation, and halo effects of stars must be visually improved. The current implementation looks very ugly.
> Different stellar classes can exist, such as red dwarfs, Sun-like stars, and massive stars. Within the game's progression system, acquiring new planets causes the star to grow and increases the number of planets it can carry.
>
> **4. Dyson Sphere and Energy Development**
> A Dyson Sphere is gradually constructed around the star using collected metals.
> Increasing the number of planets that support life accelerates technological development and Dyson Sphere construction.
> The Dyson Sphere makes stellar energy available for use, reducing dependence on radioactive resources and unlocking advanced planetary defense systems.
> In later stages, planets gain energy weapons that the player can fire by clicking on targets. This eliminates the need to waste resources by launching moons. These weapons are powerful enough to heat up planets, but they consume the star's fuel, causing the star to shrink slightly.
>
> **5. Colonization and Terraforming**
> When a star system containing life captures a new planet, the existing civilization sends a carrier ship and a colonization ship.
> If the new planet's conditions are suitable, colonization begins. Otherwise, miners gather resources from nearby moons to support making the planet habitable (terraforming).
> Excessive or unsuitable resource accumulation can destabilize planets. As a gameplay mechanic, planets may become uninhabitable or transform into structures resembling gas giants or brown dwarfs. Control may be lost, and planets may leave their orbits.
>
> **6. Planetary Survival**
> Planetary shields consume energy and can break as a result of excessive collisions.
> The player must balance resource collection, defending planets that support life, maintaining environmental stability, and expanding the civilization.
> A planet losing its habitability must significantly affect the civilization's development.
>
> **7. Space Pirates**
> Pirates periodically attack planets, moons, and mining operations, attempting to steal resources and prevent development. They have no allegiance to any faction and are generally seen roaming around in large groups, sometimes toward the player.
> We also need to change the flight behavior of all spaceships. They do not necessarily have to fly in planetary orbits; simply flying around and following the planet, as in the old game, is sufficient. This will allow early-stage players to hit pirate ships using moons. If they try to fly in low orbit, the player can never reach them. Bring back a similar mechanic from the old game.
> Pirates can damage defense systems, deplete resources, and threaten planetary habitability.
> The number of pirates is completely random. They may attack the player, and the player can choose to escape. After a certain distance, they stop pursuing the player.
>
> **8. Alien Civilizations**
> Alien civilizations are not simple raiders but strategic opponents. While protecting their own systems, they harass the player, compete for resources, and attempt to slow down the player's technological development.
> Once their defense fleets are destroyed, the player can seize the dense reserves of metal, radioactive materials, and other resources on alien planets, or colonize those planets.
> However, we want realistic enemies here, not enemies with guided missiles that can never be defeated.
>
> **9. Resource Extraction and Mining AI**
> Existing mining ships can extract resources from the planets of defeated alien civilizations.
> Miners must be able to travel independently to nearby resource locations without requiring the target planets to join the player's orbit.
> A visual connection can indicate active resource transfer between two planets without creating a gravitational connection between them. This allows the player to stay near that planet and exploit its resources, just like a satellite.
> However, the difference is that the player can travel around with a moon, but if the player wants to exploit a planet's resources, they must remain near it (there could be an outermost ring or something similar).
> Since the mining fleet is limited, targets must be automatically prioritized based on distance, resource requirements, resource density, efficiency, and danger level.
> Defeated civilizations provide higher mining efficiency thanks to the dense resource reserves they have accumulated on their planets.

## Core priorities

Balanced progression, intelligent mining behavior, meaningful planetary survival mechanics, effective enemy AI, and a
seamless transition from planetary control to stellar control (user, 2026-11-13).

Standing preferences that shape all of it ([README.md](README.md#standing-decisions-user)): fun first, then realism; no
off-screen arrows or alerts, no verdict text, danger shown naturally; visible change on the world over numbers; low-end
hardware; measured claims.

### Where the concept stands today

Read from code after waves 2–4 and a cleanup (2026-11-14). Built = in the game; Partial = some of it; Missing = Planned.

| # | Concept item | Status | Package |
|---|---|---|---|
| 1 | Asteroid → planet; life from water, metal, field, temperature | Built | — |
| 1 | Shield + two fighters at life | Built | — |
| 1 | Fighters break up approaching large bodies | Built (bodies ≤ 2% shattered; small pieces and dust join you without heat) | [F] |
| 2 | Miners work moons once held | Built | — |
| 2 | Miners work accretion disks / nearby bodies | Built (debris clusters, free bodies) | [G] |
| 2 | One frigate with missiles that shatter large bodies | Built as heavy lasers on frigates (one from tier 3, two from tier 5) plus surface rockets from tier 1, both shattering 2–25% bodies into catchable pieces (2026-11-14); in battles the frigate lances enemy worlds and a silo fires briefly guided missiles at them (2026-11-15) | [F] |
| 2 | Ship counts limited by metal | Built: each class its own cap (probes = tier, fighters from mined metal, frigates by tier), miner cap from mined metal (2026-11-14) | [F], [G], Q5 |
| 2 | Collection prioritized by need | Built (`lack()` and need-weighted site scores) | [G] |
| 3 | Rising energy need forces a star connection | Built (contact at ≥ 80% energy need or 300 s) | — |
| 3 | 60 s near a star → connection | Built | — |
| 3 | Control transfers to the star, carries its planets | Built (thrust steers the star; system planets ride rings) | [D], [I] |
| 3 | Star classes | Built (radius 0.14·M^0.45) | — |
| 3 | Star grows with new planets; planet capacity | Built (+3% a planet, capacity 2–8) | [I] |
| 3 | Star visuals | Built (overhaul) | — |
| 4 | Dyson built from metal | Built (spends ore) | — |
| 4 | More living planets speed tech / Dyson | Built (Dyson × (1 + 0.5 per colony), colonies add people room) | [L] |
| 4 | Dyson replaces radioactives, unlocks advanced defence | Built (energy, a stronger engine, the beam from 20%) | [K] |
| 4 | Click-to-fire energy weapons costing star fuel | Built (beam on Fire, 0.2% of the star a shot) | [K] |
| 5 | Carrier + colony ship, colonization, terraforming, destabilized planets | Built (gas worlds leave their ring; no brown dwarf) | [L] |
| 6 | Shields break under collisions | Built | — |
| 6 | Shields consume energy | Built (0.1 E/s per level) | [F], Q7 |
| 6 | Losing habitability must hurt | Built (people −1/min, no mining or building, shield out) | [F] |
| 7 | Pirates attack planets, moons, mining; no allegiance | Built | — |
| 7 | Large roaming groups, sometimes toward the player | Built (roam in every age; attacks on you from LIFE) | — |
| 7 | Completely random number | Built (1–14 raiders, no escalation) | — |
| 7 | Escape possible; pursuit ends past a distance | Built (chase ≤ 1.5× cruise, leash) | — |
| 7 | Ships fly around and follow the planet | Built (patrols and pirates) | — |
| 7 | Not in low orbit, so moons can hit them | Built (raid loops cross the moon slots) | — |
| 7 | Moons can kill pirate ships | Built (swept hit test) | — |
| 7 | Pirates damage defences, drain resources, threaten habitability | Built (shield, stock, then a capped water / air chip) | — |
| 8 | Alien civilizations as strategic opponents | Partial (named rivals, stances, massing war waves, slug volleys, gather miners; no army strength, no rival-vs-rival war, slugs from sight) | [J] |
| 8 | Seize reserves / colonize after the defence fleet falls | Partial (open worlds mined at 2.5; not colonized) | [J], [M] |
| 8 | No undefeatable guided missiles | Built (checked: bolts never steer) | — |
| 9 | Miners travel without capture; link; outer ring | Built (roaming shuttles, gold reach gauge; grain line removed 2026-11-14) | [G] |
| 9 | Auto-priority by distance, need, density, efficiency, danger | Built (`civilization/mining.ts`; danger from enemy ships only, not stars) | [E], [G] |
| 9 | Defeated civilizations give higher efficiency | Built (open rival worlds, efficiency 2.5) | [J], [M] |

## Audience

| Player | Comes for | What they get | Session |
|---|---|---|---|
| **Grower** (eat-and-grow players; fans of the old game) | a fast, physical power curve | Age I: 69 → 3,162 in ~73 s, a tier every 15–20 s (measured) | 2–5 min, many runs |
| **Gardener** (space sandbox, "raise a world" players) | shaping a planet and watching it live | seas, moons, life, city lights on the body itself | 20–60 min, one long run |
| **Builder-fighter** | a civilization that reaches its sun | roaming miners, shield, fighters and a frigate, attack orders, mass driver, rival war waves, Dyson sphere, the energy beam, steering a star that gathers planets and colonies | the last 20–30 min of a run |
| **Collector** | things to find and tick off | discoveries, giants, great comets, 39 achievements, bests | across runs |

- **Why this game:** one body, one unbroken run from pebble to a star with a Dyson sphere, where every step is visible on the body and decided by real collisions. The old game swapped your body and threw away mass at each tier, and its life only grew by fighting (`analysis/SOLAR/00-overview.md`); GRAVOLVE keeps the body and lets life grow by care.
- **Platforms:** desktop browser first (keyboard + mouse: Fire and Command). Phone works by joystick, tap and long-press, but touch was checked with synthetic events only, never on a device. Frame cost is 0.3–2.7 ms mean on the dev desktop (measured); low-end hardware is unmeasured.
- **Gap for the long run:** nothing is saved except bests, achievements, hints and settings. A 45-minute ladder in a browser tab or on a phone needs suspend/resume ([Roadmap](#roadmap), item 4).

## What makes it fun

Three pillars, each proven by a great moment in the 75-minute playtest:

1. **Growth you can feel.** Meals snap onto your pile, popups, eat streaks climb in pitch, the pile rounds into a sphere near 1k.
2. **Your history is drawn on your body.** Lava seams, seas filling craters, frost, green coasts, city lights, a shield veil, a Dyson lattice. No panel is needed to know how your world is doing.
3. **Physics is the toolset.** Speed and angle decide eat / splash / bounce / break; a moon is a guard and ore for your miners; a star cooks you unless you prepared (defence ships clearing 13 pirates in ~14 s).

| Stage | Core pleasure | Systems that carry it |
|---|---|---|
| Asteroid | momentum flight, matching speed, the power curve | collision regimes, wells, feedback, tiers |
| Forging a world | "I am a place now": first moon, first air, first rain | moons, climate, overlays |
| Living world | care: a blue world that stays alive | habitability, life (one step to LIFE), calm by settling |
| Civilization | they act on their own and you feed them | tiers, roaming miners and the mining link, shield, fighters, frigate |
| Combat | physics as a weapon | mass driver, energy beam, attack orders (ships fly at what you order, briefly guided rockets), rivals and their war waves, pirates; planetary battles: gravitating worlds, shield-chipping fighters, frigate lances, missiles as finishers |
| Star takeover | scale: bind a sun, enclose it, fly it | link, star control, automatic orbit, system planets, colonies, Dyson |

## Challenges

| Stage | Hard in a good way | Still weak |
|---|---|---|
| Asteroid | approach below 8 own D/s with no drag; read well colours; choose a composition | a still newcomer is eaten by the 15 s hunter; Age I time depends far more on the player (23 s greedy bot to 150 s+ slow bot) than on threats |
| Forging | catch a moon by a slow, alongside approach; gather water, air, iron from the right regions | your pull drags big neighbours in: a parked world grows fast and runs hot |
| Living world | eat vs rest; settle vs roam; keep four conditions up | Age II neighbours can swallow a parked world |
| Civilization | diet as economy (green rock = energy and dose); which moons to catch and where to park for the miners; shield levels cost people | one rock after the shield falls can kill 88% of the people; the fleet stayed small (cap 2 in a ~10 min playtest, before the per-class caps of 2026-11-14), so fighters and the frigate are rarely seen; star contact by the 80% need is not playtested |
| Combat | order your ships early at what threatens you; strip the shield, then land frigate and missile fire; flee a stronger rival early on; outrun a war wave or a pirate fleet | war waves read harmless (home 3 of 3 times without touching the shield); duels balanced only in the check sim; after Dyson 20% the beam makes the driver nearly pointless |
| Star | hold the 3–8 R★ band through flares; steer the star while your world finds its orbit; catch planets and settle them | the system is off screen (planets seen ~11% of the time); no colony formed in the playtest (the ≥ 1.5 bn rule); red-dwarf link band vs radiation sickness; nothing after Type II until Expansion; hot stars untested; thick-air worlds wait at 12 R★ |

## Goals

Every stage keeps three goals in view: the next meal (well and target panel), the bar in the stage line, and the age.

| Stage | Short (seconds) | Mid (a minute or two) | Long | Where it shows |
|---|---|---|---|---|
| Asteroid | the next green well | next tier; a composition tag | Planetoid (melt-through) | tier bar, tags, "Age I · Asteroid → Planetoid" |
| Forging | water, air, iron: the dim chip | first moon; first rain | all four conditions met: life starts | chips, slot pips, the body |
| Living world | keep the needle in the blue band | life fills faster; a moon whose material helps | LIFE | life bar, green coasts, clouds |
| Civilization | catch moons; keep the dose safe | next tier, a new ship or shield level | star contact: your people need a sun (≥ 80% of the energy, or 300 s) | tier, city lights, miner shuttles, the toast |
| Star | reach the band; ride out a flare | link 100% (then you steer the star); each Dyson segment; a planet caught, a colony | Dyson 50% (Age III complete), then 100% (Type II) | filaments, lattice, the star dimming, "Planets n/cap · colonies" |
| Gas line | gas share | next giant tier | Brown dwarf: "a failed star" | stage line, toast |

## Pass 1 (done)

Pass 1 fixed the playtest's top problems; it proceeded on all ten recommendations. Current rules and numbers are in the
topic docs.

- **Life speed** = weakest of water / temperature / air × (0.5 + 0.5 × magnetic field); core term full at 6% sunk metal. A typical world runs ~0.55 (measured); LIFE is one step, 30 s at speed 1, ~1 min there (user: the six-stage ladder took ~16 min).
- **Stable climate:** INNER_K 200, TRAP 0.25: seas liquid at rest from 0.34 atm; resting brings seas back.
- **Correct tips:** your card's tip names the real lever; gas warning from 15% gas; the Dyson row says why it waits.
- **Softer setbacks:** ≥ 20 K −10 s ("Impact winter"), ≥ 150 K wipes life out and it fills again from zero ("Mass extinction"), never the end of the run; the civilization stays awake while LIFE lasts; great comets are out of your pull. (Rules as in code today: [planetgameplay.md](planetgameplay.md#life).)
- **Water kept at the handover:** first rain returns up to 90% (96% after 60 s, measured).
- **Age I threats and lesson:** first rival at 15 s is a hunter 1.4–1.8× you; a forced shower at 20–30 s; "no drag" hint and "Too fast to eat" hint; rivals chase at most 7 of your D/s.
- **Gas line:** sticky (in 20%, out 15%), a proper Brown dwarf ending.
- **Combat:** one hit takes ≤ 45% of a rival's people; rivals come on screen; duels by temper (2026-11-15, [aliencivilizations.md](aliencivilizations.md)): a new civilization holds a Careful rival, loses to a Hungry one if it stays and must run from a Raider; with a frigate it wins.
- **Endgame:** Dyson 100% = "Type II civilization"; orbit framing (view up to 2.5×); respawn at 3,194 reads Planetoid.
- **Meta:** achievements with toast and gallery (39 today, `core/achievements.ts`; list in [hudandcontrols.md](hudandcontrols.md#achievements)); fastest Age I / II / III bests.

## Roadmap

In order. Items 1, 1b and 2 are now cut into the packages of the [wave plan](#wave-plan).

1. **Events director** ([gameevents.md](gameevents.md)): fills dead time, restores clashes with debris, "≥ 3 new things per 5 minutes". First: director + clash + meteor storm + life-bearing comet + trade convoy. Runs after wave 2.
1b. **Rival civilizations and ship factions** ([aliencivilizations.md](aliencivilizations.md), [shipsandflight.md](shipsandflight.md), user): four named rivals walk the same ladder off screen (asteroid threat → habitable world → army → war), pirates raid everyone, and three ship factions (you smooth cyan, rivals crystalline violet, pirates scrap bone) on the design doc's classes. Built: ship art, Age I rival rules, roster and ledger, forging-world AI, living rival worlds; pirates roam every age ([B]); named rival civilizations with stances, massing war waves and defeat by the fleet ([J]); pirates raid named rivals and shoot miners and rival ships ([M]). Left: army strength, rival-vs-rival war, the Marauder capital.
2. **Expansion:** built so far: system planets on kinematic orbits (capacity 2–8, the old game used 3 / 6 / 8 per star) ([I]); terraforming (20 volatiles per trip = +0.1 atm or +2% water) and colony fleets (60 ore + 40 volatiles + 1 bn people; colonies raise the population cap and Dyson speed) ([L]). Left: fly your star to a second one with the engine, belts and comets, redirecting a comet to terraform, rival systems. **End goal: three suns**, then an **Ascension**: a summary card, and the next run starts with one legacy of your choice (start material or a tint). The old game's Big Crunch → Big Bang loop with a speed-run timer is the model.
3. **Gas line as its own game:** banded gas-giant look (a Brown dwarf still draws as a cratered rock), rings, a moon system as its "civilization".
4. **Suspend and resume** a run (player, stage state, field seed).
5. **More stars and star events:** hot-star link balance (untested above 4,700 K), superflares, sungrazers, rival star claims.
6. **Challenges** the old game's way (a start body + one spawner + one end condition + a score), once the director's spawn API exists.
7. **Low-end and touch pass** on real devices: fill rate with a star at half screen, dense belts at 316k+ (650–980 loaded, ~1.9 ms, measured), the 214 ms hitch at 399 s ([techandperformance.md](techandperformance.md#open-issues)).

Recommended (Pass 1 proceeded on these): after Age III the run ends in three suns and Ascension, not an endless sandbox; Pass 2 in the order listed.

## Wave plan

The concept is cut into packages. Built packages are described in their topic doc's Built section, the rest in its
Planned section; planned ones are proposals until built. There is no package H.

| Wave | ID | Package | Concept | Status | Topic doc |
|---|---|---|---|---|---|
| 1 | **A** | Docs split into topic files (this set) | — | Done | [README.md](README.md) |
| 1 | **B** | Pirates roam, pursue and give up; random fleet size; moons can hit them; capped habitability harm | 7 | Done | [gameevents.md](gameevents.md), [shipsandflight.md](shipsandflight.md) |
| 1 | **C** | Star visuals overhaul (`star/look.ts` only) | 3 | Done | [stargameplay.md](stargameplay.md), [techandperformance.md](techandperformance.md) |
| 1 | **D** | Way to Age III (automatic star contact), star control at the link, automatic orbit, Collector role removed | 3 | Done (Q3 finished in part by [I] and [L]) | [stargameplay.md](stargameplay.md), [civilizationgameplay.md](civilizationgameplay.md) |
| 1 | **E** | Mining AI rules, pure (`civilization/mining.ts`): site score, need, efficiency, danger, reach, miner cap from metal | 2, 9 | Done (wired in by [G]) | [civilizationgameplay.md](civilizationgameplay.md) |
| 2 | **F** | Fleet and survival: fighters fragment bodies, frigates and rockets (2026-11-14: was one frigate with unguided missiles), per-class fleet caps, shield upkeep, lost habitability hurts | 1, 2, 6 | Done | [civilizationgameplay.md](civilizationgameplay.md), [shipsandflight.md](shipsandflight.md), [planetgameplay.md](planetgameplay.md) |
| 2 | **I** | System planets: the star carries them on rings and grows with each; star swallows star, re-link after a lost star (Q3 part) | 3 | Done | [stargameplay.md](stargameplay.md) |
| 2 | **J** | Alien civilizations as strategic opponents: stances, war waves, harassment, defeat opens their worlds | 8 | Done, partial: no army strength, no rival-vs-rival war, slugs still fire from sight | [aliencivilizations.md](aliencivilizations.md) |
| 3 | **G** | Roaming miners and the mining link (reach circle); wires the [E] rules into the game | 2, 9 | Done, partial: site danger ignores stars | [civilizationgameplay.md](civilizationgameplay.md), [worldgen.md](worldgen.md) |
| 3 | **K** | Energy weapons on Fire from Dyson ≥ 20%, costing star mass | 4 | Done | [stargameplay.md](stargameplay.md), [hudandcontrols.md](hudandcontrols.md) |
| 4 | **L** | Colonization and terraforming; destabilized colonies become gas worlds and leave their ring; carry on as a colony (Q3) | 4, 5 | Done, partial: the Q3 carry-on is the smallest version (star, Dyson, moons, stock and people lost) | [stargameplay.md](stargameplay.md), [planetgameplay.md](planetgameplay.md) |
| 4 | **M** | Mining defeated worlds; pirates raid miners and named rivals | 7, 8, 9 | Done, partial: no Marauder capital | [aliencivilizations.md](aliencivilizations.md), [gameevents.md](gameevents.md) |
| after 2 | — | The events director and its catalogue | — | Planned | [gameevents.md](gameevents.md) |

Wave 1 was built on 2026-11-13, waves 2–4 and a cleanup on 2026-11-13/14. Every package A–M is done; the partial ones
keep their open part in their topic doc's Planned section.

## Concept vs standing decisions

Where the concept conflicts with a standing decision. Rows marked Built are settled and in code; the rest are
proposals until built, each a dated decision in its topic doc once confirmed.

| Concept | Standing decision | Resolution |
|---|---|---|
| Pirates "sometimes toward the player", "may attack" | "no player seeking" | **Built [B]:** fleets roam across your area (heading at the camera ±90°), raid what they see and give up on a leash; they turn on you only from LIFE, rarely (Q2). Still no warning text or arrow. |
| Pirates "threaten planetary habitability" | "Pirates never destroy a world or kill you" | **Built [B]:** the standing rule holds; with stock empty and shield down, hits knock a small capped share of water/air off as catchable pieces (≤ 2% a raid). |
| "Number of pirates completely random" | escalating fleet sizes | **Built [B]:** random size (1–14 raiders), no escalation, no "next one will be bigger" toast. |
| Shields consume energy | "No shield upkeep" (fun first) | **Built [F]** (Q7): cheap upkeep, 0.1 E/s per level, paid before the people are fed. |
| Control transfers to the star at the link | engine only at Dyson 50% | **Built [D]:** control at the link with a base engine of 1.2× your thrust (user, 2026-11-14: was too slow); the Dyson scales it to 4×. "Stars only by takeover, link automatic" still holds. Q1 |
| Click-to-fire weapons; auto colony ships; auto miner priority | "Watch and feed, no build menu, no priority toggle" | **Built, no conflict:** the beam is the existing Fire; colony fleets and miner sites are automatic; no priority UI. [K], [L], [E], [G] |
| Star grows when it gains planets | realism | **Built [I]:** fun first, +3% a planet; the deviation is stated in [stargameplay.md](stargameplay.md). |
| "Improve brightness, halo" | "Background stays dim", "hot planets must not look like stars" | **Built [C]:** only stars get boiling layers, streamers and bloom past 2 R★; far light dimmed to 0.32–0.5 ([stargameplay.md](stargameplay.md) → How a star looks). |
| Planets turn into gas giants, control lost | "Growth never stops play", one body one run | **Built [L]:** colonies and system planets past the gas line become gas worlds and leave their ring; your home world keeps today's rule. Run end after star control: Q3. |

## Open decisions

Each with the recommended default. The relevant ones are repeated in each topic doc's Open issues.

| # | Question | Default | Alternative | Docs |
|---|---|---|---|---|
| Q1 | Orbit distance once thrust steers the star | **Decided:** automatic, like moons; living and terraforming planets move into the habitable zone, lifeless ones may sit anywhere. Built for your world ([D]) | — | [stargameplay.md](stargameplay.md) |
| Q2 | When pirates start | **Decided:** always present, random sizes across the world; avoid them in the Asteroid Age; they attack you only after LIFE, unpredictable and infrequent | — | [gameevents.md](gameevents.md) |
| Q3 | What ends a run after star control | **Decided:** game over when your last living planet is lost; a star can be lost, and with life left you can link to another. Built: a swallowed star frees your world to link another ([I]); with a living colony you carry on as that world ([L]). Left: the full carry-on that keeps the star, Dyson, moons, stock and people | — | [stargameplay.md](stargameplay.md), [hudandcontrols.md](hudandcontrols.md) |
| Q4 | Old doc files | done 2026-11-13: `systems.md` / `eventsplan.md` / `rivalsplan.md` deleted (git has them), `vision.md` rewritten | — | [README.md](README.md) |
| Q5 | "Limited by metal": which metal | **Decided (default, no preference):** metal your miners brought in (stock). Built [F], [G]: fighter cap /20 and miner cap /15 of the mined-metal total (probes and frigates go by tier, 2026-11-14) | — | [civilizationgameplay.md](civilizationgameplay.md) |
| Q6 | Collector moon role | **Decided:** remove. Removed in [D]: Command switched Guard ↔ Sling (the Sling went 2026-11-14) | — | [planetgameplay.md](planetgameplay.md), [stargameplay.md](stargameplay.md) |
| Q7 | Shield upkeep | **Decided:** 0.1 E/s per level. Built [F] | — | [civilizationgameplay.md](civilizationgameplay.md) |

Older open questions still waiting for the user: the events plan's decisions ([gameevents.md](gameevents.md)) and the
rivals plan's decisions (roster size, alliances, rivals at the star stage, rivals eating each other;
[aliencivilizations.md](aliencivilizations.md)).

## Open issues

Cross-cutting issues; stage-only issues live in their topic doc. Performance items are in
[techandperformance.md](techandperformance.md#open-issues).

Top playtest problems after waves 2–4 (1280×720, measured):

- **One-hit civilization wipes** [F], [J]: rival volleys took the shield 90 → 0 K in ~13 s (~25 K steps every 4 s), then
  one rock killed 88% of the people. ([civilizationgameplay.md](civilizationgameplay.md#open-issues))
- **The star system is invisible** [I]: captured planets were on screen ~11% of the time (rings at 14 + 4k R★ against a
  10.5 × 5.9 R★ half-view; the zoom never pulled back). Colonies were on screen 0%: none formed, since the ≥ 1.5 bn at
  home rule was never met [L]. ([stargameplay.md](stargameplay.md#open-issues))
- **Red-dwarf link trap** [D]: "stay 3–8 radii" against "Radiation sickness · keep farther" at 6 R★; people 0.07 → 0.02
  bn; at 0.10 atm there is no liquid band, so the orbit never moves.
- **Pirates go unseen** [B]: Age I 0 of 138 samples on screen (closest 33 R); in Age II the attack was never due in
  ~380 s. ([gameevents.md](gameevents.md#open-issues))
- **War waves read harmless** [J]: they came home 3 of 3 times without touching the shield; two rival worlds collided
  ("A world swallowed"). ([aliencivilizations.md](aliencivilizations.md#open-issues)) Since the planetary combat of
  2026-11-14 their rounds always land on your shield and their frigates lance it (not yet played in the browser); rival
  worlds now gravitate and keep 6 R apart.
- **Fleet rock-breaking never appeared** [F] in ~10 min (before the per-class caps and rockets of 2026-11-14): the fleet cap stayed 2 and the rocks that hit were 4–20% of
  you, above the fighters' 2%.
- **Age I field update over budget:** 0.8 ms p50 with 440+ loaded bodies at rest (budget 0.6 ms / 400; baseline before
  this push unknown). ([techandperformance.md](techandperformance.md#open-issues))
- **Ship gradients dropped:** ~95 Pixi "[SVG parser] … unsupported" warnings at the ship-page bake; the art loses its
  gradient fills. ([shipsandflight.md](shipsandflight.md#open-issues))
- **Debug LIFE route collapses:** the air rains out and the civilization sleeps within 15–35 s.
- Fixed in the cleanup: 11 toasts back to back at the Age I → II handover (milestones now `keep`).

Older cross-cutting issues:

- **Parked worlds get swallowed in Age II:** rivals snowball (a 0.48× rival grew to 1.3× and ate a parked 21k world at 385 s); a drifting 2.8× body ate a parked world at 175 s. Both are gaps in "big things never meet a still player". Ideas: rivals stop hunting you once they outweigh you past Age I, or `held` drift for ≥ 1.15× bodies near a settled world. ([aliencivilizations.md](aliencivilizations.md), [planetgameplay.md](planetgameplay.md))
- **Infall growth:** a parked world in a moderately dense spot grew 50k → 250k in 10 min from infall and stayed near boiling. ([planetgameplay.md](planetgameplay.md))
- **Infall against the Age II heat rule** (measured 2026-11-14, not fixed, user to decide): a parked Age II world takes a moon-sized natural infall about every 1.5 min (2.5% → +363 K, 1.8% → +224 K, 4.3% → +819 K). The first big hit wipes life (≥ 150 K), the civilization sleeps and stops defending. Guards and fighters do not cover 8–39% bodies. ([planetgameplay.md](planetgameplay.md), [asteroidgameplay.md](asteroidgameplay.md))
- **Still newcomer:** the 15 s hunter eats a player who never moves (visible 3.9 s before it arrives). ([asteroidgameplay.md](asteroidgameplay.md))
- Giants are round (the sphere bake rounds anything past roundR). Region seams between chunks generated at very different sizes are unchecked. ([asteroidgameplay.md](asteroidgameplay.md), [worldgen.md](worldgen.md))
- Durability's m^0.2 makes big bodies tougher in their own units (peer shatter 27 D/s at the start, 66 at 795k); revisit for Age II. A peer bounce at 2·v_m gives 3.0 heat; lower HEAT_KIN if peers melt too easily. ([asteroidgameplay.md](asteroidgameplay.md))
- Hot stars above 4,700 K untested for link balance. ([stargameplay.md](stargameplay.md))
- Pacing and life sims were not re-run after the web, burn-up and calm changes (the sim scripts are not in the repo).
- Not built: steam venting below 1000 mass, milestone slow motion, banded gas giants (a Brown dwarf draws as a cratered rock), the second shape pass (battered remnants, metal core fragments, two new rock materials, comet families), gas stripping and impact moons, wider voids in Age II, leaving a star orbit, several owned stars, the Marauder capital ([M]), army strength and rival-vs-rival war ([J]).

### Decided 2026-11-13 (open decisions Q1–Q7)

- **Q1, orbits round your star** (user, 2026-11-13): "As with moons, this should happen automatically. All habitable planets must be within the habitable zone. Uninhabitable or lifeless planets, such as resource-poor dwarf planets, can exist inside or outside this zone. Planets undergoing terraforming will automatically be moved into the habitable zone." No orbit control: living and terraforming planets ease into the liquid band by themselves; lifeless ones keep any ring.
- **Q2, when pirates appear** (user, 2026-11-13): "Pirates will always be present in the game. During the Asteroid Age, players must avoid them. Pirate groups of varying sizes, from small to large fleets, will appear randomly throughout the world. Pirates will only begin attacking players after the Life Age. Attacks should be unpredictable and relatively infrequent to avoid frustrating players." Replaces "pirates from the civilization, one sighting before".
- **Q3, what ends a run after star control** (user, 2026-11-13): "Star maybe can die but our game over should be last living planet. maybe i collide to other star wrongly, but if there is life, i can found another star." Game over = your last living planet is lost; a star can be lost (a bad star collision) and, while life remains, you can link to another star.
- **Q5, which metal limits ships** (2026-11-13: user had no preference, so the default stands): the metal your miners bring in (stock) sets the fighter cap, so metal-rich moons mean more fighters (probes and frigates go by tier since 2026-11-14).
- **Q6, Collector moon role** (user, 2026-11-13): remove it, the last passive moon effect. Moons are Guard, Sling and ore for miners; star energy comes from the link and the Dyson sphere. (The Sling went 2026-11-14.)
- **Q7, shield upkeep** (user, 2026-11-13): cheap upkeep, 0.1 E/s per shield level; only a starving world loses regeneration and strength. Replaces the fun-first "no upkeep" rule.
- **Pirate harm** (user, 2026-11-13): capped. With your shield down and stock empty, hits knock a little water / air off as catchable pieces (≤ ~2% a raid). Pirates still never destroy a world or kill you.
- **Pirate fleet size** (user, 2026-11-13): random, no escalation: 1–14 raiders, mostly small, sometimes huge; the "next one will be bigger" toast goes.
