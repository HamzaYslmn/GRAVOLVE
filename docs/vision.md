# GRAVOLVE vision

What GRAVOLVE is for: the user's concept, who plays, what makes it fun, goals, roadmap and wave plan, open decisions and
cross-cutting issues. How systems work today: the topic docs in [README.md](README.md) (labels too). Design rule: **fun
first, then realism**.

## Concept

The user's concept (user, 2026-11-13), verbatim; the source of every Planned item.

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

**Core priorities** (user, 2026-11-13): balanced progression, intelligent mining, meaningful planetary survival,
effective enemy AI, a seamless hand-over from planet to star. Standing preferences: [README.md](README.md).

## Audience

| Player | Comes for | Gets | Session |
|---|---|---|---|
| **Grower** (eat-and-grow, the old game's fans) | a fast, physical power curve | Age I: a tier every few meals | 2–5 min, many runs |
| **Gardener** (space sandbox) | shaping a planet and watching it live | seas, moons, life, city lights on the body | 20–60 min |
| **Builder-fighter** | a civilization that reaches its sun | miners, shield, fleet, priority, rockets, rival waves, Dyson | the last 20–30 min |
| **Collector** | things to find and tick off | discoveries, comets, 39 achievements, a best score | across runs |

- **Why this game:** one body, one unbroken run from pebble to a star with a Dyson sphere, decided by real collisions.
  The old game swapped your body at each tier and grew life only by fighting (`analysis/SOLAR/00-overview.md`).
- **Platforms:** desktop browser first; phones by joystick, tap and long press (touch checked only with synthetic
  events); YouTube Playables. Only bests, achievements, hints and settings are saved; a long run needs suspend and resume
  (Roadmap 4).

## What makes it fun

1. **Growth you can feel:** meals snap on, popups, eat streaks climb in pitch, the pile rounds into a sphere.
2. **Your history is drawn on your body:** lava seams, seas, frost, coasts, city lights, shield veil, Dyson lattice.
3. **Physics is the toolset:** speed and angle decide eat / splash / bounce / break; a moon is guard and ore; a star
   cooks you unless you prepared.

| Stage | Core pleasure | Short goal | Mid goal | Long goal |
|---|---|---|---|---|
| Asteroid | momentum, matching speed | the next green well | next tier | Planetoid |
| Forging | "I am a place now" | water, air, iron | first moon, first rain | life starts |
| Living world | care | needles in their bands | life fills faster | LIFE |
| Civilization | they act, you feed them | catch moons, Rad safe | tier, a ship, a shield level | star contact |
| Combat | physics as a weapon | rockets, priority, sieges | — | — |
| Star | scale: bind and fly a sun | reach the band, ride a flare | link, Dyson, a colony | Dyson 50% (Age III complete), 100% (Type II) |
| Gas line | — | gas share | next giant tier | Brown dwarf |

Every stage keeps the next meal, the goal bar and the age in view.

## Roadmap

1. **Events director** ([gameevents.md](gameevents.md)): fills dead time, "≥ 3 new things per 5 minutes". Not built.
1b. **Rivals and factions**: built [B], [J], [M]; left: army strength, rival-vs-rival war.
2. **Expansion:** built [I], [L]; left: flying your star to a second one, belts and comets, comet terraforming, rival
   systems. **End goal: three suns**, then an **Ascension** card with one legacy (the old game's Big Crunch → Big Bang).
3. **Gas line as its own game:** banded giants, rings, a moon system as its "civilization".
4. **Suspend and resume** a run.
5. **More stars and star events:** hot-star link balance, superflares, sungrazers, rival star claims.
6. **Challenges** the old game's way, once the director exists.
7. **Low-end and touch pass** on real devices ([techandperformance.md](techandperformance.md) → Open issues).

## Wave plan

Concept cut into packages (no package H), mapped to the Kardashev steps (`gamedesign.html` Tip 0–III; it puts Tip II at
a 50% Dyson swarm, the game calls 50% "Age III complete" and 100% "Type II"). Built packages live in their topic doc's
Built section. Concept status read from code 2026-11-16, updated 2026-11-17.

| Kardashev step | Wave | ID | Package | Concept | Status | Topic doc |
|---|---|---|---|---|---|---|
| — | 1 | **A** | Docs split into topic files | — | Done | [README.md](README.md) |
| Before a civ (stages 1–3) | — | — | Asteroid → planet; life from water, metal, field, temperature | 1 | Built | [asteroidgameplay.md](asteroidgameplay.md), [planetgameplay.md](planetgameplay.md) |
| Type 0 → I | 2 | **F** | At LIFE a shield and two fighters; fighters break ≤ 2%; frigates and rockets; per-class caps; shield upkeep 0.1 E/s (Q7); lost habitability hurts | 1, 2, 6 | Done | [civilizationgameplay.md](civilizationgameplay.md) |
| Type I | 1 | **E** | Mining AI rules: score, need, efficiency, danger, reach, miner cap | 2, 9 | Done | [civilizationgameplay.md](civilizationgameplay.md) |
| Type I | 3 | **G** | Roaming miners, reach gauge; defeated worlds at efficiency 2.5 | 2, 9 | Done, partial: danger ignores stars | [civilizationgameplay.md](civilizationgameplay.md) |
| Type I | 1 | **B** | Pirates roam every age in 1–14, attack only after LIFE, give up on a leash, moons hit them, harm capped | 7 | Done | [gameevents.md](gameevents.md) |
| Type I | 2 | **J** | Rivals: named, stances, war waves, defeat opens worlds; rockets by real thrust | 8 | Done, partial: no army strength, no rival-vs-rival war, defeated worlds not colonized | [aliencivilizations.md](aliencivilizations.md) |
| Type I | 4 | **M** | Mining defeated worlds; pirates raid miners and rivals | 7, 8, 9 | Done | [aliencivilizations.md](aliencivilizations.md) |
| Type I → II | 1 | **C** | Star visuals (`star/look.ts`) | 3 | Done | [stargameplay.md](stargameplay.md) |
| Type I → II | 1 | **D** | Contact at ≥ 80% need or 300 s, link after 60 s, control at the link, auto orbit, Collector role removed | 3 | Done | [stargameplay.md](stargameplay.md) |
| Type I → II | 3 | **K** | Energy beam on Fire from Dyson 20% | 4 | Removed 2026-11-17 (Fire is always a rocket) | [stargameplay.md](stargameplay.md) |
| Type II | 2 | **I** | System planets on rings (+3% a planet, capacity 2–6); star swallows star; re-link | 3 | Done | [stargameplay.md](stargameplay.md) |
| Type II | 4 | **L** | Dyson from ore; colonies and terraforming; unstable colonies become gas worlds (no brown dwarf); carry on as a colony (Q3) | 4, 5 | Done, partial: the carry-on loses star, Dyson, moons, stock, people | [stargameplay.md](stargameplay.md) |
| Toward Type III | later | — | Expansion (three suns, Ascension); the events director | — | Planned | [gameevents.md](gameevents.md) |

## Concept vs standing decisions

All built.

| Concept | Standing decision | Resolution |
|---|---|---|
| Pirates "sometimes toward the player" | no player seeking | [B]: attack you only from LIFE, rarely, give up on a leash; no warning (Q2) |
| Pirates "threaten habitability" | never destroy a world or kill you | [B]: ≤ ~2% water and air a raid |
| "Number of pirates completely random" | escalating fleets | [B]: random, no escalation |
| Shields consume energy | no upkeep (fun first) | [F]: 0.1 E/s a level, paid first (Q7) |
| Control to the star at the link | engine only at Dyson 50% | [D]: control at the link; Dyson makes it stronger (Q1) |
| Click-to-fire weapons, auto colony ships and miners | watch and feed | no conflict: Fire launches rockets; colonies and miners automatic; the only order is the priority |
| Star grows with planets | realism | [I]: fun first, +3% a planet |
| "Improve brightness, halo" | background dim; hot planets not stars | [C]: only stars boil and bloom |
| Planets turn into gas giants, control lost | growth never stops play | [L]: colonies past the gas line leave their ring; your home world keeps today's rule (Q3) |

## Open decisions

Q1–Q7 all decided; topic docs link here.

| # | Question | Decision | Docs |
|---|---|---|---|
| Q1 | Orbit distance once thrust steers the star | Automatic, like moons; living and terraforming planets move into the habitable zone. Built [D] | [stargameplay.md](stargameplay.md) |
| Q2 | When pirates start | Always present, random sizes; avoid them as an asteroid; attack you only after LIFE, rarely | [gameevents.md](gameevents.md) |
| Q3 | What ends a run after star control | Game over when your last living planet is lost; a swallowed star frees your world [I]; a living colony carries on [L] | [stargameplay.md](stargameplay.md) |
| Q4 | Old doc files | Deleted 2026-11-13 (git has them) | — |
| Q5 | "Limited by metal" | Metal your miners bring in: fighter and miner caps; probes and frigates by tier | [civilizationgameplay.md](civilizationgameplay.md) |
| Q6 | Collector moon role | Removed [D]; moons have no roles | [planetgameplay.md](planetgameplay.md) |
| Q7 | Shield upkeep | 0.1 E/s a level; only a starving world loses strength. Built [F] | [civilizationgameplay.md](civilizationgameplay.md) |

The user's words (2026-11-13), verbatim:

- **Q1:** "As with moons, this should happen automatically. All habitable planets must be within the habitable zone.
  Uninhabitable or lifeless planets, such as resource-poor dwarf planets, can exist inside or outside this zone. Planets
  undergoing terraforming will automatically be moved into the habitable zone."
- **Q2:** "Pirates will always be present in the game. During the Asteroid Age, players must avoid them. Pirate groups of
  varying sizes, from small to large fleets, will appear randomly throughout the world. Pirates will only begin attacking
  players after the Life Age. Attacks should be unpredictable and relatively infrequent to avoid frustrating players."
- **Q3:** "Star maybe can die but our game over should be last living planet. maybe i collide to other star wrongly, but
  if there is life, i can found another star."
- Pirate harm, fleet size, shields and escape (2026-11-13, 2026-11-17): [gameevents.md](gameevents.md) → Decisions.

Still waiting: the events plan's decisions ([gameevents.md](gameevents.md)) and the rivals plan's (roster size,
alliances, rivals at the star stage, rivals eating each other; [aliencivilizations.md](aliencivilizations.md)).

## Open issues

Cross-cutting only; stage issues in their topic doc, performance in techandperformance.md.

- **Parked worlds get swallowed in Age II:** a 0.48× rival grew to 1.3× and ate a parked 21k world at 385 s; a drifting
  2.8× body at 175 s (not re-run). Ideas: rivals stop hunting you once they outweigh you past Age I, or held drift for
  ≥ 1.15× bodies near a settled world.
- **Infall growth:** a parked world in a dense spot grew 50k → 250k in 10 min, near boiling (not re-run).
- **Infall vs the Age II heat rule** (2026-11-14, user to decide): a moon-sized infall every ~1.5 min (1.8% → +224 K,
  2.5% → +363 K, 4.3% → +819 K); the first big hit wipes life (≥ 150 K). Guards and fighters do not cover 8–39% bodies.
- **Star system on screen** [I]: fixed by the stylised scale in a scripted check, not yet in play.
- **Red-dwarf link trap** [D] (before the 2–4 R★ band; not re-run): Rad sickness in the band; no liquid band at thin air.
- **Combat balance not re-played** since the shield shell (2026-11-14), the weapons overhaul (2026-11-15) and rockets
  (2026-11-17).
- **Ship gradients dropped:** ~95 SVG parser warnings at the bake. **Debug Life route collapses** within 15–35 s. **Hot
  stars** above 4,700 K untested. Pacing and life sims not re-run after the web, burn-up and calm changes.
- **Not built:** steam venting below 1000 mass, milestone slow motion, banded gas giants, the second shape pass, gas
  stripping and impact moons, wider Age II voids, leaving a star orbit, several owned stars, army strength and
  rival-vs-rival war [J], the events director.
