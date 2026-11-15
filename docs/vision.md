# GRAVOLVE vision

What GRAVOLVE is for: the user's concept, who plays, what makes it fun, the goals, the roadmap and wave plan, the open
decisions and the cross-cutting open issues. How each system works today is in the topic docs listed in
[README.md](README.md), which also explains the labels. Design rule: **fun first, then realism**.

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

### Core priorities

Balanced progression, intelligent mining behavior, meaningful planetary survival mechanics, effective enemy AI, and a
seamless transition from planetary control to stellar control (user, 2026-11-13).

Standing preferences shape all of it (README.md → Standing decisions (user)).

### Kardashev mapping

The concept frames the run as a climb up the Kardashev scale; `gamedesign.html` names the steps Tip 0–III.

| Step | Stages | What marks it | Status |
|---|---|---|---|
| Before a civilization | 1 Asteroid, 2 Forging, 3 Living world | you are a body, then a world; life fills | Built |
| Type 0 → I: one planet | 4 Civilization at LIFE (concept 1) | people, a shield, two fighters; inner heat, reactors on rad fuel, solar farms | Built |
| Type I: the planet's space | 4 Civilization with moons (concept 2, 9) | miners on moons and free bodies, per-class fleet, rockets, mining AI | Built [E], [F], [G] |
| Type I → II: a star | 5 Star takeover (concept 3, 4) | star contact, link, you steer the star, Dyson, energy beam | Built [C], [D], [K] |
| Type II: a planetary system | 5 (concept 3, 5) | system planets, colonies, terraforming | Built [I], [L]; carry-on as a colony is the smallest version (Q3) |
| Toward Type III | 6 Expansion | several stars; three suns, then Ascension | Planned |

`gamedesign.html` puts Tip II at a Dyson swarm of 50%; the game calls 50% "Age III complete" and 100% "Type II".

### Where the concept stands

Read from code, 2026-11-16. Numbers live in the topic docs.

| # | Concept point | Status | What is built | Package |
|---|---|---|---|---|
| 1 | Planet formation and life | Built | asteroid → planet; life from water, metal, field, temperature; at LIFE a shield and two fighters; fighters break bodies ≤ 2% | [F] |
| 2 | Space mining and defence | Built | miners on moons and free bodies; frigates (1 from tier 3, 2 from tier 5) and surface rockets break 2–25% bodies; each ship class has its own cap; sites weighted by need | [E], [F], [G], Q5 |
| 3 | Star connection and control | Built | contact at ≥ 80% energy need or 300 s; link after 60 s; you steer the star; star classes; +3% a planet, capacity 2–6; new star look | [C], [D], [I] |
| 4 | Dyson and energy | Built | Dyson from ore, faster with colonies; star energy, a stronger engine, the beam from 20% (costs star mass) | [K], [L] |
| 5 | Colonization and terraforming | Built | colony fleets, terraforming, unstable colonies turn to gas worlds and leave their ring; no brown dwarf | [L] |
| 6 | Planetary survival | Built | shields break under hits and cost 0.1 E/s a level; lost habitability hurts the people | [F], Q7 |
| 7 | Space pirates | Built | roam every age in groups of 1–14 ships, no escalation; attack you only after LIFE, rarely; give up past a leash; moons can hit them; harm capped | [B], [M] |
| 8 | Alien civilizations | Partial | named rivals, stances, war waves, defeat opens their worlds; missiles guided only briefly (distance or an early sidestep beats them); no army strength, no rival-vs-rival war, defeated worlds not colonized | [J], [M] |
| 9 | Mining AI | Built | roaming miners with a reach gauge; sites by distance, need, density, efficiency, danger (enemy ships only, not stars); defeated worlds mined at efficiency 2.5 | [E], [G], [J], [M] |

## Audience

| Player | Comes for | What they get | Session |
|---|---|---|---|
| **Grower** (eat-and-grow players; fans of the old game) | a fast, physical power curve | Age I: a new tier every few meals | 2–5 min, many runs |
| **Gardener** (space sandbox players) | shaping a planet and watching it live | seas, moons, life, city lights on the body itself | 20–60 min, one run |
| **Builder-fighter** | a civilization that reaches its sun | miners, shield, fleet, the priority target, mass driver, rival war waves, Dyson, the beam, a star that gathers planets | the last 20–30 min |
| **Collector** | things to find and tick off | discoveries, giants, comets, 39 achievements, a best score | across runs |

- **Why this game:** one body, one unbroken run from pebble to a star with a Dyson sphere, every step visible on the body and decided by real collisions. The old game swapped your body and threw away mass at each tier, and its life only grew by fighting (`analysis/SOLAR/00-overview.md`); GRAVOLVE keeps the body and lets life grow by care.
- **Platforms:** desktop browser first (keyboard and mouse). Phones work by joystick, tap and long press, but touch was only checked with synthetic events. Also runs on YouTube Playables. Costs: techandperformance.md → Measured costs.
- **Gap for the long run:** only bests (score, peak, fastest ages), achievements, hints and settings are saved (on YouTube, in its cloud save). A long run needs suspend and resume (Roadmap item 4).

## What makes it fun

1. **Growth you can feel.** Meals snap onto your pile, popups, eat streaks climb in pitch, the pile rounds into a sphere.
2. **Your history is drawn on your body.** Lava seams, seas, frost, green coasts, city lights, a shield veil, a Dyson lattice. No panel is needed to see how your world is doing.
3. **Physics is the toolset.** Speed and angle decide eat / splash / bounce / break; a moon is a guard and ore; a star cooks you unless you prepared.

| Stage | Core pleasure | Systems that carry it |
|---|---|---|
| Asteroid | momentum flight, matching speed, the power curve | collision regimes, wells, feedback, tiers |
| Forging a world | "I am a place now": first moon, first air, first rain | moons, climate, overlays |
| Living world | care: a blue world that stays alive | habitability, life, calm |
| Civilization | they act on their own and you feed them | tiers, roaming miners, shield, fleet |
| Combat | physics as a weapon | mass driver, beam, priority target, rockets and missiles, rivals, pirates, sieges |
| Star takeover | scale: bind a sun, enclose it, fly it | link, star control, orbit, system planets, colonies, Dyson |

## Goals

Every stage keeps three goals in view: the next meal (well and target card), the goal bar, and the age.

| Stage | Short (seconds) | Mid (a minute or two) | Long | Where it shows |
|---|---|---|---|---|
| Asteroid | the next green well | next tier; a composition tag | Planetoid | goal bar, tip, age chip |
| Forging | water, air, iron | first moon; first rain | life starts | stage cells, moon pips, the body |
| Living world | keep the needles in their bands | life fills faster | LIFE | goal bar, green coasts, clouds |
| Civilization | catch moons; keep Rad safe | next tier, a ship, a shield level | star contact | tier, city lights, miners, toast |
| Star | reach the band; ride out a flare | link; Dyson segments; a planet, a colony | Dyson 50% (Age III complete), then 100% (Type II) | lattice, star cells ("n/cap · k col") |
| Gas line | gas share | next giant tier | Brown dwarf | goal bar, toast |

## Roadmap

In order.

1. **Events director** (gameevents.md): fills dead time, restores clashes with debris, "≥ 3 new things per 5 minutes". Not built.
1b. **Rivals and ship factions** (aliencivilizations.md, shipsandflight.md): built: art, Age I rival rules, roster and ledger, rival worlds, stances, war waves, defeat, pirates raiding everyone ([B], [J], [M]). Left: army strength, rival-vs-rival war, the Marauder capital.
2. **Expansion:** built: system planets on rings (capacity 2–6) [I]; colony fleets and terraforming [L]. Left: flying your star to a second one, belts and comets, comet terraforming, rival systems. **End goal: three suns**, then an **Ascension** card and one legacy for the next run (the old game's Big Crunch → Big Bang loop is the model).
3. **Gas line as its own game:** banded giants, rings, a moon system as its "civilization".
4. **Suspend and resume** a run (player, stage state, field seed).
5. **More stars and star events:** hot-star link balance, superflares, sungrazers, rival star claims.
6. **Challenges** the old game's way (start body + one spawner + one end condition + a score), once the director exists.
7. **Low-end and touch pass** on real devices (techandperformance.md → Open issues).

## Wave plan

The concept is cut into packages. Built packages are in their topic doc's Built section, the rest in Planned. There is
no package H.

| Wave | ID | Package | Concept | Status | Topic doc |
|---|---|---|---|---|---|
| 1 | **A** | Docs split into topic files | — | Done | [README.md](README.md) |
| 1 | **B** | Pirates roam, pursue and give up; random fleet size; moons can hit them; capped harm | 7 | Done | [gameevents.md](gameevents.md), [shipsandflight.md](shipsandflight.md) |
| 1 | **C** | Star visuals overhaul (`star/look.ts`) | 3 | Done | [stargameplay.md](stargameplay.md) |
| 1 | **D** | Automatic star contact, star control at the link, automatic orbit, Collector role removed | 3 | Done | [stargameplay.md](stargameplay.md), [civilizationgameplay.md](civilizationgameplay.md) |
| 1 | **E** | Mining AI rules (`civilization/mining.ts`): site score, need, efficiency, danger, reach, miner cap | 2, 9 | Done | [civilizationgameplay.md](civilizationgameplay.md) |
| 2 | **F** | Fleet and survival: fighters fragment bodies, frigates and rockets, per-class caps, shield upkeep, lost habitability hurts | 1, 2, 6 | Done | [civilizationgameplay.md](civilizationgameplay.md), [shipsandflight.md](shipsandflight.md), [planetgameplay.md](planetgameplay.md) |
| 2 | **I** | System planets on rings, the star grows with each; star swallows star; re-link after a lost star | 3 | Done | [stargameplay.md](stargameplay.md) |
| 2 | **J** | Rivals as strategic opponents: stances, war waves, harassment, defeat opens their worlds | 8 | Done, partial: no army strength, no rival-vs-rival war | [aliencivilizations.md](aliencivilizations.md) |
| 3 | **G** | Roaming miners and the reach gauge; wires in [E] | 2, 9 | Done, partial: site danger ignores stars | [civilizationgameplay.md](civilizationgameplay.md), [worldgen.md](worldgen.md) |
| 3 | **K** | Energy beam on Fire from Dyson 20%, costing star mass | 4 | Done | [stargameplay.md](stargameplay.md), [hudandcontrols.md](hudandcontrols.md) |
| 4 | **L** | Colonies and terraforming; unstable colonies become gas worlds; carry on as a colony (Q3) | 4, 5 | Done, partial: the carry-on loses star, Dyson, moons, stock and people | [stargameplay.md](stargameplay.md), [planetgameplay.md](planetgameplay.md) |
| 4 | **M** | Mining defeated worlds; pirates raid miners and rivals | 7, 8, 9 | Done, partial: no Marauder capital | [aliencivilizations.md](aliencivilizations.md), [gameevents.md](gameevents.md) |
| later | — | The events director and its catalogue | — | Planned | [gameevents.md](gameevents.md) |

## Concept vs standing decisions

Where the concept met a standing decision, and how it was settled. All rows are built.

| Concept | Standing decision | Resolution |
|---|---|---|
| Pirates "sometimes toward the player", "may attack" | no player seeking | [B]: fleets roam everywhere, attack you only from LIFE, rarely, and give up on a leash; still no warning (Q2). |
| Pirates "threaten planetary habitability" | pirates never destroy a world or kill you | [B]: with stock empty and shield down, hits knock off a capped share of water and air (≤ ~2% a raid). |
| "Number of pirates completely random" | escalating fleet sizes | [B]: random size, no escalation, no "next one will be bigger" toast. |
| Shields consume energy | no shield upkeep (fun first) | [F]: 0.1 E/s a level, paid before the people are fed (Q7). |
| Control transfers to the star at the link | engine only at Dyson 50% | [D]: control at the link with a base engine; the Dyson makes it stronger (Q1). |
| Click-to-fire weapons, auto colony ships, auto miner priority | watch and feed, no build menu | No conflict: the beam is Fire; colony fleets and miner sites are automatic; the only order is the priority target ([K], [L], [E], [G]). |
| Star grows when it gains planets | realism | [I]: fun first, +3% a planet; stated in stargameplay.md. |
| "Improve brightness, halo" | background stays dim; hot planets must not look like stars | [C]: only stars get boiling layers and bloom; far light dimmed (stargameplay.md → How a star looks). |
| Planets turn into gas giants, control lost | growth never stops play; one body, one run | [L]: colonies and system planets past the gas line become gas worlds and leave their ring; your home world keeps today's rule (Q3). |

## Open decisions

Q1–Q7 are all decided. Topic docs link here instead of copying the quotes.

| # | Question | Decision | Docs |
|---|---|---|---|
| Q1 | Orbit distance once thrust steers the star | Automatic, like moons; living and terraforming planets move into the habitable zone. Built for your world [D] | [stargameplay.md](stargameplay.md) |
| Q2 | When pirates start | Always present, random sizes; avoid them as an asteroid; they attack you only after LIFE, rarely | [gameevents.md](gameevents.md) |
| Q3 | What ends a run after star control | Game over when your last living planet is lost. Built: a swallowed star frees your world to link another [I]; with a living colony you carry on as that world [L]. Left: a carry-on that keeps star, Dyson, moons, stock and people | [stargameplay.md](stargameplay.md), [hudandcontrols.md](hudandcontrols.md) |
| Q4 | Old doc files | Done 2026-11-13: the old plan files were deleted (git has them) | — |
| Q5 | "Limited by metal": which metal | Metal your miners bring in (the user had no preference). Fighter and miner caps grow with it; probes and frigates go by tier | [civilizationgameplay.md](civilizationgameplay.md) |
| Q6 | Collector moon role | Removed [D]. Moons have no roles or modes today | [planetgameplay.md](planetgameplay.md) |
| Q7 | Shield upkeep | 0.1 E/s a level; only a starving world loses regeneration and strength. Built [F] | [civilizationgameplay.md](civilizationgameplay.md) |

The user's words (2026-11-13), verbatim:

- **Q1, orbits round your star** (user, 2026-11-13): "As with moons, this should happen automatically. All habitable planets must be within the habitable zone. Uninhabitable or lifeless planets, such as resource-poor dwarf planets, can exist inside or outside this zone. Planets undergoing terraforming will automatically be moved into the habitable zone." No orbit control: living and terraforming planets ease into the liquid band by themselves; lifeless ones keep any ring.
- **Q2, when pirates appear** (user, 2026-11-13): "Pirates will always be present in the game. During the Asteroid Age, players must avoid them. Pirate groups of varying sizes, from small to large fleets, will appear randomly throughout the world. Pirates will only begin attacking players after the Life Age. Attacks should be unpredictable and relatively infrequent to avoid frustrating players." Replaces "pirates from the civilization, one sighting before".
- **Q3, what ends a run after star control** (user, 2026-11-13): "Star maybe can die but our game over should be last living planet. maybe i collide to other star wrongly, but if there is life, i can found another star." Game over = your last living planet is lost; a star can be lost (a bad star collision) and, while life remains, you can link to another star.
- **Pirate harm** (user, 2026-11-13): capped. With your shield down and stock empty, hits knock a little water / air off as catchable pieces (≤ ~2% a raid). Pirates still never destroy a world or kill you.
- **Pirate fleet size** (user, 2026-11-13): random, no escalation.

Still waiting for the user: the events plan's decisions (gameevents.md) and the rivals plan's decisions: roster size,
alliances, rivals at the star stage, rivals eating each other (aliencivilizations.md).

## Open issues

Cross-cutting only; stage issues live in their topic doc, performance in techandperformance.md → Open issues.

- **Parked worlds get swallowed in Age II:** rivals snowball (a 0.48× rival grew to 1.3× and ate a parked 21k world at 385 s); a drifting 2.8× body ate a parked world at 175 s (measured, not re-run). Ideas: rivals stop hunting you once they outweigh you past Age I, or held drift for ≥ 1.15× bodies near a settled world. (aliencivilizations.md, planetgameplay.md)
- **Infall growth:** a parked world in a dense spot grew 50k → 250k in 10 min from infall and stayed near boiling (measured, not re-run).
- **Infall against the Age II heat rule** (measured 2026-11-14, user to decide): a parked world takes a moon-sized infall about every 1.5 min (2.5% → +363 K, 1.8% → +224 K, 4.3% → +819 K). The first big hit wipes life (≥ 150 K) and the civilization stops defending. Guards and fighters do not cover 8–39% bodies. (planetgameplay.md, asteroidgameplay.md)
- **Star system on screen** [I]: planets were off screen most of the time in the playtest; the stylised star scale fixed it in a scripted check, not yet in play. (stargameplay.md → Open issues)
- **Red-dwarf link trap** [D] (playtest, before the link band became 2–4 R★; not re-run): holding the band brought the "Rad sickness" toast; at thin air there is no liquid band, so the orbit never moves. (stargameplay.md)
- **Combat balance not re-played** since the shield shell (2026-11-14) and the weapons overhaul (2026-11-15): one-hit civilization wipes and harmless-looking war waves were seen before it. (civilizationgameplay.md, aliencivilizations.md)
- **Ship gradients dropped:** ~95 Pixi "[SVG parser] … unsupported" warnings at the ship-page bake. (shipsandflight.md → Open issues)
- **Debug Life route collapses:** the air rains out and the civilization sleeps within 15–35 s. (planetgameplay.md → Open issues)
- **Hot stars** above 4,700 K untested for link balance. (stargameplay.md)
- Pacing and life sims were not re-run after the web, burn-up and calm changes (the sim scripts are not in the repo).
- **Not built:** steam venting below 1000 mass, milestone slow motion, banded gas giants, the second shape pass, gas stripping and impact moons, wider voids in Age II, leaving a star orbit, several owned stars, the Marauder capital [M], army strength and rival-vs-rival war [J], the events director.
