# Civilization gameplay (from LIFE on)

The civilization starts when LIFE appears and runs by itself on top of Age II: population and tier, energy and dose,
stocks, the shield, miners and the mining AI, builds, the fleet, the priority target, surface rockets, the mass driver,
battles and star contact. Stage 4 of the stage table in [README.md](README.md), which also holds the labels
(measured, computed) and standing decisions.

Code (under `app/src/evolution/civilization/`): `rules.ts` (numbers), `stage.ts` (the loop), `view.ts` (your look),
`lattice.ts` (shield lattice maths), `ships.ts` (defence, frigate, rockets, silo), `orders.ts` (priority rules and
notes), `mining.ts` (mining AI), `slots.ts` (the HUD's fleet slots), `bolts.ts` (projectile looks), `combat.ts`,
`weapon.ts`; also `render/tech.ts`. Elsewhere: ship flight, guns and art in [shipsandflight.md](shipsandflight.md);
pirates in [gameevents.md](gameevents.md) → Pirates; rival worlds and fighting them in
[aliencivilizations.md](aliencivilizations.md); stars, Dyson, the beam and colonies in [stargameplay.md](stargameplay.md);
the HUD, fleet slots and controls in [hudandcontrols.md](hudandcontrols.md).

## Built

### Start

- Starts at LIFE on the rocky line (not past Super-Earth on the gas line, `planet/stage.ts`), with city lights, a
  level-1 shield, 2 fighters on patrol (`START_SHIPS`) and 10 ore (`START_ORE`: five rockets). The mass driver works from
  the start. First toast: "A shield and two patrols guard your world · catch moons: miners bring what it lacks".
  1 stock unit = 10⁻⁴ of your mass.
- No tech ladder (user, 2026-11-13): Radio, First launches, Moon landing and Interplanetary ships were only decoration;
  Industry comes with LIFE.
- Awake while LIFE lasts here or on a colony ([stargameplay.md](stargameplay.md) → Colonies).
- **While asleep** (LIFE lost, no colony): capacity 0 and people fall 1/min (`ASLEEP_FALL`); one minute leaves 37%.
  Nothing is mined or built; the shield gets no energy, goes out and takes no hits; the ships still fly. The HUD shows
  "No life · dying out". When life returns: "Civilization recovers".

### Population and tier

- **Population:** starts at 0.2 bn and grows logistically at 1/min toward K = 10 bn × √(life speed) × (m / Planet
  mass)^⅓, plus the room colonies add. It is capped by what the energy feeds (`fedCapacity`: (energy − shield upkeep) /
  0.1 E/s per bn). Above K it falls 0.25/min. At least 0.01 bn always survives.
- **Tier** = 1 + ⌊log2(pop / 0.2 bn)⌋, 1 to 6, shown next to the population. Miners work faster with it. Sample run:
  tier 2 at 0:44, 3 at 1:33, 4 at 2:32, 5 at 4:19, 6 at 10:08 (rules.test.ts, 2026-11-16).

### Energy and dose

User, 2026-11-15: "low radiation levels should still allow life… radiation could become an energy resource for shields,
rockets, and ship production… collect radiation sources to maintain their energy supply".

- **Two quantities:** **fuel** (`Stocks.fuel`, in u) is what the reactors burn; your world's **radioactive share** is
  the dose. Miners' radioactive ore goes straight to fuel, never onto your world. A green rock you eat raises the share;
  your people dig it out into fuel (`refine`, e-folding 180 s), leaving plain rock. Eating green is the fast, risky
  refuel; miners are the slow, clean one. Radioactive matter never decays.
- **Energy sources** (`energy`; s = (m / Planet mass)^⅓):

  | Source | E/s | Notes |
  |---|---|---|
  | Inner heat | 0.5 · s · k | k = 0.75 + 0.25 · metal / 10%, held to 0.75–1.25 (user, 2026-11-15: more metal, more geothermal); feeds about half a habitable world |
  | Reactors | 1 · s × clamp(fuel / 10 u) | 10 bn more while fuel lasts; throttle down under `FUEL_LOW` 10 u (no cliff) |
  | Solar farms | 0.5 · s · light · wings / 6 | free, no fuel; wings = `solarWings(T)`: 0 / 2 / 3 / 4 / 5 / 6 at tiers 1–6 |
  | Dyson | the star stage's `dyson` input | [stargameplay.md](stargameplay.md) → Dyson sphere; once it covers the need nothing burns |

  Light is `star/rules.ts` `sunlight`: 1 at 3 R★ from a sun, falling as 1/x, 0 with no star. No moon makes energy.
- **Need** (shown in the panel) = 0.1 E/s per bn + shield upkeep + 0.2 E/s (`WORK_E`) per working industry (a build, the
  rockets on a priority, the shield mending). Star contact and the mass driver's charge use the same need.
- **Burn** (`fuelBurn`): fuel pays only for what the need exceeds inner heat + solar + Dyson, at most the reactors'
  power. A unit gives 40 E·s at Planet mass (`FUEL_E`): a full reactor burns 1.5 u/min, the same u/s at any size.
- **Fed** = clamp(energy / need). It scales build speed, the frigate, silo and rocket reloads, and the shield's mending
  (the shield's cap is paid first, `shieldFed`). City lights dim with it. Out of fuel the people fall at 0.25/min toward
  what the free energy feeds; nobody dies of it.
- Computed (rules.test.ts, 2026-11-16; Planet mass, L3 shield):
  - Fuel burn: tiers 1–3 burn nothing idle; tier 4 with 2 works 0.54 u/min; tier 6 idle 0.66 / 0.90 / 1.20 u/min at
    6.4 / 8 / 10 bn, 1.50 with 2 works.
  - A full tier-6 world (10 bn) on 25 u is fully fed until 14:10, under 80% from 18:57, and settles at 2.00 bn after
    90 min (inner heat feeds 2).
  - Out of fuel, people settled from 10 bn: no star 2.00, 30 R★ 2.33, 12 R★ 2.83, 6 R★ 4.08, 3 R★ 7.00 bn (6.17 from
    the start: it stops at tier 5). A fed, idle 10 bn world in full light burns 0.45 u/min.
  - A gorged world (5% radioactive at tier 1) is under the safe share in 92 s with 200 u of fuel.
- **Dose** = share / the tier's safe share (`radioDose`, `radioLimit`: 3 / 4.4 / 6.4 / 9.4 / 13.7 / 20% at tiers 1–6;
  user, 2026-11-14: "below 20% it shouldn't cause problems") + outside radiation (0.4 + star flux) × (1 − 0.5·field) ×
  e^(−p/2). The dose goes by share, never carried mass (user, 2026-11-14). Over 1, growth slows (it stops at dose 2) and
  20%/min per unit dies (at most 40%/min). It shows as a sickly limb and flickering lights.
  - Sweep (rules.test.ts, 2026-11-16; tier 1, habitability 1, 10 min, no fuel): 0–2% → 5 bn (dose ≤ 0.84), 2.6% →
    4.96 bn, 3.5% → 4.45 bn, 5% → 0.73 bn, 7% → 0.05 bn.
- **Life:** a little radioactive rock helps life before the civilization (×1.25 at 1%), more slows it, never below
  ×0.25: [planetgameplay.md](planetgameplay.md) → Life.
- **Toasts:** "Rad sickness" with its source ("Too much rad rock in your world…" or "Starlight burns your people · keep
  farther from the star"); "Solar farms" once they give over 5% of the need; "Fuel runs low" once, 2 minutes before the
  reactors dim below the need.

### Stocks

- **Fuel** is mined radioactive ore plus what your people dig out of eaten green rock. **Ore** is mined metal only.
  **Volatiles** are mined water. Rock is never mined; gas lands on your world. Sources: moons and other mining sites,
  open rival worlds, star lifting, and home mines. Meals give no stock.
- **Home mines** (user, 2026-11-15: "even when there's nothing to mine, civilizations should slowly extract and use
  their own planet's natural resources"; `homeDig`): every frame while awake, your people dig `HOME_RATE` 5·10⁻⁶ × tier
  of your metal share a second into ore (shares over 20% count as 20%), and of your water share into volatiles while
  that stock is under 20 u. Never the element your world lacks. Mass is kept; the dug share becomes rock. Toast "Home
  mines" once, when ore comes in with no moons. Home ore does not raise the fighter or miner caps.

  | 10% metal, 8% water | tier 1 | tier 3 | tier 6 |
  |---|---|---|---|
  | ore u/min | 0.30 | 0.90 | 1.80 |
  | volatiles u/min (under 20 u) | 0.24 | 0.72 | 1.44 |

  That is a tenth of a rocky 2% moon at the same tier (computed).
- **Fleet metal:** a running total of the metal in every mined haul (`metal` in `stage.ts`). Never spent or stolen; it
  sets the fighter cap and the miner cap.
- Stock is spent on ships, shield levels, slugs, missiles, Dyson segments, colony fleets and terraforming.
- Pirates steal stock from an unshielded world, and with stock gone knock a little water or air off (≤ 2% a raid):
  [gameevents.md](gameevents.md) → Pirates.

### Miners on moons

- Every moon you hold is mined at 1.5% of its starting mass a minute × tier (`MINE_RATE`; a moon lasts about 67 min at
  tier 1, 11 at tier 6). User, 2026-11-13: miners go to every moon, use it up, work faster with the tier, and fill what
  the world lacks.
- **Shuttles make round trips** (user: back and forth, not a stream): at most 2 a site, a launch every 5–9 s ÷ tier.
  Each lifts off, brakes onto the site, digs 1.4 s (dust, a warm ore pod), flies home and lands in a puff of ore dust,
  then rests 5–9 s ÷ tier. A flight over 15 s gives up. The first visit leaves a light on the moon. Flight:
  [shipsandflight.md](shipsandflight.md) → Miner shuttles.
- **What they take** (user, 2026-11-14; `mineMix`): a mix weighted `MINE_MIX` radioactive 0.5, metal 0.3, water 0.2
  (gas 0.2 only while the air is thin), over the elements the body has. Never rock.
  - Radioactive → the fuel stock, always.
  - Metal → ore and fleet metal; water → volatiles; unless your world lacks that element (`lack`: the weakest of water /
    air / field under 0.6), then it lands on you as mass (no hit, no heat). Toasts "Miners bring fuel / water / air /
    iron".
  - Gas only while a latch is on: on under 0.5 atm (`AIR_LOW`), off at 0.8 atm (`AIR_HIGH`); it lands.
- The mined mass flows every frame (at most half a body a frame); the shuttles are the look. When only rock is left:
  "Moon mined out". The bare moon still guards, or you grind it down by hand ([planetgameplay.md](planetgameplay.md) →
  Moons).

### Mining AI ([E] rules, wired in by [G])

`mining.ts`, checked by `mining.test.ts`; `stage.ts` runs it. Concept 9: "targets must be automatically prioritized
based on distance, resource requirements, resource density, efficiency, and danger level". No priority UI.

- **Site:** distance to its near side (your radii), mass ÷ yours, composition, kind, danger 0–1, linked or not.
- **Efficiency:** moon 1, free body 0.6, debris cluster 0.8, defeated (open) rival world 2.5.
- **Need weights:** the lacking element ×3, metal ×2 while the fleet is short, radioactive ×2 while fuel is under
  `FUEL_RESERVE` 30 u. They multiply.
- **Score** = share × worth (need-weighted share of its material) × efficiency × (1 − 0.7·danger) ÷ trip time (2d/3 +
  1.4 s). 0 when mined out.
- **Reach** = outer moon slot + 6 R: 13.4 R with 5 slots, 8.4 R with 1. A linked body ≥ 25% of you holds to 1.15× the
  reach (`LINK_HOLD`). Outside it a site scores 0; a danger-1 site scores 0 while any other is open.
- **Assignment** (`assign`, every 2 s): a miner keeps a site that still scores and has room (≤ 2 a site); idle miners
  take the best open site; busy ones switch only for a site ≥ 1.25× better. Non-moon sites claim miners first.
- **Miner cap** (`minerCap`): clamp(2 + ⌊metal / 15⌋, 2, 12).
- Computed (mining.test.ts, 2026-11-16): a dry world with a rocky moon at 4 R still prefers an 80%-ice moon out to
  13.41 R (3.35×); 0 switches in 5,000 noisy re-scores; cap 0 → 2, 15 → 3, 45 → 5, 90 → 8, 150 → 12.

### Roaming miners and the mining link [G]

- **Survey** every 2 s, out to 1.3× the reach: your moons, open rival worlds (`combat.rivals.sites()`), debris clusters
  (≥ 4 bodies under 2% of you close together, mined from the biggest; `clusters()`) and free bodies (from 0.2% of you).
  Meteors, held, rival bodies and moons are skipped. **Danger** is 1 with an enemy ship within 4 R of a site.
- **Yield:** a non-moon site gives efficiency × the moon rate (of its starting mass), split over 2 miners, only for
  shuttles that have arrived. Free bodies and debris lose that mass by the same mix.
- **Open rival worlds** pay out their reserve (300·L ore + 100·L volatiles). Once **beaten**, the world itself comes down
  onto you in its own composition at 2.5 × the moon rate per crew; under the smallest moon's mass it is dropped (toast
  "Consuming a beaten world").
- **Link:** a body ≥ 25% of you holds to 1.15× the reach. No bond is drawn and no grain line. You can travel with a
  moon, but to work a planet you must stay near it. Toasts "Miners roam", "Mining link".
- **The reach gauge:** a faint gold ring (`GOLD` 0xffc04a, a thin line with 48 inward ticks) shown always while miners
  work (alpha 0.14; 0.3 while a linkable body is near; user, 2026-11-14: "should always be visible while miners are
  active").
- `civ.miners()` lists the shuttles in flight as foes, so rivals and pirates can shoot them.

### Builds and the fleet cap [F]

- **One build at a time** (user, 2026-11-14): the first wanted of `buildOrder` (fighter, your first frigate, shield
  level, a second frigate, probe), each class up to its own cap, waiting for its ore. A shield level waits for its
  volatiles without blocking the others.

  | Build | Cost | Time |
  |---|---|---|
  | Probe | 2 ore | 4 s |
  | Fighter | 3 ore | 8 s |
  | Frigate | 25 ore | 40 s |
  | Shield level L | 10·L ore + 10 volatiles | 25 s |

  Times are divided by a build speed of 0.5 + min(1, pop / K) and multiplied by the energy fed; 0.6 s between builds.
- **Fleet caps** (`fleetCap`): probes = tier; fighters = min(6, 2 + ⌊metal / 20⌋); frigates 0 below tier 3, 1 at tiers
  3–4, 2 at 5–6. Miner shuttles have their own cap (above). One terraforming ship and one colony fleet at a time.
- Sample run (rules.test.ts, 2026-11-16, three moons): first frigate at 8:56, shield level 2 at 12:21.
- No build menu, no priority toggle ("watch and feed").

### Shield

- **A physical shell** (user, 2026-11-14: "the shield should act as a real physical barrier, not just a visual effect or
  an extra health bar"): a shell at `shellR` = R·(1.18 + 0.05·(level − 1)) that a body meets before your ground
  (`Body.guard`, checked swept, so it holds at any frame rate).
  - Charge: 30 K a level, regen 1%/s of max, floor −15%. A level-1 shield at its floor is back above 0 in about 15 s.
    Each new level adds 30 K at once.
  - A body costs `shieldPunch` = 30 K × (share / 2.5%) × max(1, v / stick speed), v its closing speed along the normal
    (grazes cost less).
  - If the shield can pay, the body bounces off whole and never reaches the ground. If not, the shield drops to its
    floor (the shatter), a share k = what it could pay ÷ the punch is vaporised on the shell, and the rest, (1 − k) of
    the body at (1 − k) of its speed, lands by the usual rules (`asteroid/rules.ts` `shellPass`).
  - Bodies as heavy as you, a world's own moons, rival worlds and their bodies pass. Your moon meets a rival's shell like
    any body, and lands on the world by the same rules as a body on you (`field.ts` `hitWorld`).
  - What lands kills people only from 20 K (`HIT_MIN`), at most 90% in one hit; from 150 K it also wipes life.
- **Burn-up** (user, 2026-11-14: "objects small enough to burn up in the atmosphere don't damage or consume shield
  energy"): the shield takes a body only if what would reach your ground after your air delivers ≥ 20 K. Rival
  shields follow the same rule. Computed (rules.test.ts, 2026-11-16): airless, 0.15% bodies pass free and 0.5% are
  taken; at 0.5–2 atm everything under 1% passes free; 1% is always taken.
- **Through L1 / L3** (rules.test.ts, 2026-11-16; a Planet-mass stony world, no air; "wiped" = life wiped):

  | Hit | No shield | L1 | L3 |
  |---|---|---|---|
  | 1% at the stick speed | 97 K, 90% dead | held | held |
  | 1% at 4× | 1551 K, wiped | stops 72%; 0.28% lands at 19 K, nobody dies | held |
  | 2% at 2× | 1075 K, wiped | stops 72%; 39 K, 39% dead | held |
  | 5% at 1× | 1048 K, wiped | stops 57%; 284 K, wiped | held |
  | 5% at 2× | 4176 K, wiped | stops 29%; 1284 K, wiped | stops 86%; 52 K, 52% dead |
  | 12.5% at 1× | 4100 K, wiped | stops 23%; 2754 K, wiped | stops 69%; 696 K, wiped |

- **Upkeep** [F] (Q7): 0.1 E/s per level, paid first; the people live on the rest. `shieldFed` = clamp(E / upkeep):
  only a world with less energy than the upkeep itself loses strength and regen.
- **Weapon fire** (`shieldShot`): rounds, lance bolts, missiles, slugs, pirate rounds and the beam always land on the
  shield (no 20 K minimum). It takes what it holds down to its floor, the rest gets through, and every weapon hit, up or
  down, stops its mending for 3 s (`SHIELD_STUN`). Through an open shield: Battles.
- Toasts: "Shield holds", "Shield broken" (with the share it stopped).
- **The look** (user, 2026-11-14: "the shield is invisible around the planet"; then make the whole shield a visible
  hexagonal barrier that cracks, reddens and shatters): `view.ts` `shieldLook`, maths in `lattice.ts`.
  - One dusty counter-rotating veil per level in the faction colour, the outer layer draining first, under one hex
    lattice dome at the shell's radius. The lattice does not turn.
  - Cells by the shell's radius on screen: under 12 px a 10-cell rim; then 19 / 37 / 61 / 91 cells (n = ⌊px / 8⌋, 2–5,
    ±10% hysteresis). Brighter toward the limb.
  - Health e = charge / full max: 35% of the cells stand just above 0, all at full; the next band to go draws cracked. A
    hit re-deals the holds so the cells nearest it break first; mending closes the hole back toward it.
  - Colour: faction colour down to 60%, amber at 40%, red from 15%. The card's shield bar follows the same ramp.
  - At 0 every standing cell shatters like glass over 0.7 s. While down, dim red ghost cells show how far it is back
    from the floor; back above 0 the cells ignite over 0.8 s. A hit flares the cells near it.
  - No new draw calls: quads in the existing ParticleContainers (`view.ts` MAX_PARTS 460; rivals through `combat.ts`'s
    600).

### Defence ships

Probes and fighters (`ships.ts`). Probes are the light class (user, 2026-11-14): they break only bodies ≤ 0.5% of you,
push 0.4× as hard and patrol at 0.7× a fighter's pace. How ships fly and fire: [shipsandflight.md](shipsandflight.md).

- **No automatic rock fire** (user, 2026-11-14): your ships never attack rocks by themselves; they fly only at your
  priority target. A run fires from 9 R off the body's surface while its gun bears. A body the class cannot break is
  pushed sideways by each hit (`deflect`), up to 1 D/s in all, less for bodies over 5% of you. Rival patrols keep their
  autopilot.
- **Idle ships hunt enemy ships** (pirates, rival ships) within 9 R of your world. A round that hits breaks the ship: a
  still fighter's burst at a ship crossing 5 R out at 4 R/s kills it 58% of the time (guns.test.ts, 2026-11-16). Your
  fighters die only to enemy rounds or bodies.
- **Fire discipline** (user, 2026-11-14: "they shouldn't be able to fire continuously"):

  | Class | A run | Then cools | Gun held a minute (rules.test.ts, 2026-11-16) |
  |---|---|---|---|
  | Fighter | 2 bursts × 8 rounds at 16/s | 1.5 s | 272 rounds (4.5/s), ≤ 16 a run |
  | Probe | 1 burst × 3 rounds at 4/s | 5 s | 30 rounds (0.5/s), ≤ 3 a run |
  | Rival ships | no cap | 2.5 s | — |

  A run also ends once its target is gone or off course.

#### Breaking into food

User, 2026-11-14: ships turned everything to dust; they now break bodies into pieces your world can take, then stop.
Every gun of yours (probes, fighters, frigate, rockets) uses the same rules (`rules.ts` Breaking, `stage.ts` `cut`).

- **Targets:** only your priority. A priority you can take safely (under `pieceSize`) fizzles: no round is fired. Held
  worlds and rival bodies are only pushed.
- **The cut** (`split`): 90% (`KEEP`) flies on as unequal pieces averaging 0.8 × the burn-up share of your air (so they
  burn up whole and feed you), or with no air under `edible` (the largest piece that lands under 20 K). The other 10%
  is dust that joins you if you have air. At most `FLEET.pieces` a hit: probe 3, fighter 6, frigate 8, rocket 8.
- Pieces fly on the body's course, start 1.5 of its radii apart and spread at 0.5 radii a second. Pieces the cap left
  above the safe size get a sideways kick to pass 1.5 × contact from your centre (`deflect`): on a dead-centre line at
  10 R/s that is 0.65 R/s at 3 s out but 4.24 R/s at 0.5 s (orders.test.ts, 2026-11-16). Ordering early is the skill.
  No mass is created.
- Computed (rules.test.ts, 2026-11-16, at the stick speed): airless, 0.4–3% bodies break in one hit with 10% dust; 10%
  and 25% take 9 hits and lose 19%. At 1 atm, 0.4% and 0.8% bodies are not shot at all (they burn up or land under
  20 K).

### Priority target

- **The priority** (user, 2026-11-15: "selecting a target should set it as the priority, not trigger an immediate
  attack. If there are multiple enemies, I want to choose which one my ships focus on"; `stage.ts` `order`, `orders.ts`
  `status`): a Command tap (right-click, E, a touch long press) on anything but you and your moons (a body, a rival
  world, an enemy ship or missile; a ship under the tap first) makes it your one priority target. The same target again
  clears it, another replaces it. Setting it fires nothing: each weapon keeps its rhythm and, when it next comes free,
  takes the priority first if it can hurt and reach it. A run in progress finishes first.
- **Who takes it** (`orders.ts` `hurts`; reach: ships 1.15 × the gold reach from your centre, rockets
  `rocketRange(T)` off your surface, the siege `RECALL`):

  | Weapon | Enemy ship / missile | Free rock | Rival's rock or over 25% | Fighting rival world |
  |---|---|---|---|---|
  | Fighters (home) | every idle one, over any other enemy | ≤ 2% break; any size on course push | only on course (push) | the siege wing |
  | Probes | never (their own pick, missiles first) | ≤ 0.5% | never | never |
  | Frigate | never | 2–25%, at its next reload | never | lances from its post |
  | Surface rockets | one a reload | 1–25% cut | chip (`ships.ts` `chip`: 0.25% of you a hit, two chunks, +40 K) | never |
  | Silo missiles | never | never | never | a salvo after each lance salvo |

  The siege wing never leaves its ring for a priority ship. A rocket acts on the body it was launched at, whatever the
  priority is when it lands. On a fighting world the priority brings the siege on from `RECALL` instead of `STRIKE`
  (Battles).
- **Honest notes** (user, 2026-11-15: "it says my ship isn't ready when I actually have one that's just on cooldown"):
  one small note over the target on the tap (`fx.note`), the best state any weapon has: "Priority set" ("Rockets chip
  it" when only rockets act and only chip), "Reloading · 2 s", "Ships busy", "Not enough ore", "Shield down · fleet
  holds", "Out of range", "No fighters", "Nothing can hurt it"; also "No life · fleet idle", "Already beaten",
  "Priority cleared", and before LIFE "No fleet yet" (`planet/moons.ts`). While it waits, the note shows again whenever
  the reason changes. Low energy shows as a longer reload.
- **It ends** when the target is gone or unloaded, or the world is beaten.
- **Seen:** four turning cyan arcs round it (dim and slow while nothing can act); a besieged world gets the same arcs,
  no siege ring (user, 2026-11-15: "why does such a huge ring appear around my opponent?"). The cursor glows cyan over anything a tap would take. Toasts "Priority target" once,
  and a calm tip the first time something on course comes inside the ring.
- Still automatic: point defence against enemy ships and missiles, the shield, orbiting moons.
- Tried in a test tab 2026-11-15; not seen: probes on missiles while a ship is the priority.

### Frigate [F]

- Slow heavy lasers (user, 2026-11-14): cap 0 below tier 3, 1 at tiers 3–4, 2 at 5–6 (25 ore, 40 s each). Every 10 s
  (× the energy fed) it takes your priority when that is a free rock 2–25% of you; it never picks a rock by itself. It
  fires a salvo of 3 heavy bolts (`ARMS.lance`) 0.15 s apart, straight at 22 R/s for 2.7 s. The first bolt that hits
  breaks the body into up to 8 pieces (Breaking into food; toast "Frigate strike"). In battle it lances the enemy world
  (Battles).
- To the enemy it is a ship like any other, with 3 hull points: each round or slug takes one (`ships.ts` `lose`).
- Flight and accuracy: [shipsandflight.md](shipsandflight.md) → Frigate [F].

### Rockets

- Your world launches guided rockets from its surface from tier 1 (user, 2026-11-14; `ships.ts` `rockets`, `ROCKET`):
  2 ore each, one every 8 s (× the energy fed), only at your priority within `rocketRange(T)` = 8 + 2T radii off your
  surface. Launch aim error `rocketSpread(T)` = 0.08·(6 − T)/5 rad.
- A hit breaks a 1–25% body into up to 8 pieces (toast "Rocket hit"), chips a bigger one or a rival's rock (0.25% of
  you, +40 K), and kills ships within 0.3 R.
- They fly slower than rounds (12 R/s against 22), kicked off the aim line and arcing in (user, 2026-11-15). Flight,
  seeker and checks: [shipsandflight.md](shipsandflight.md) → Missiles and rockets.

### Mass driver

- Steel white (`STEEL`): a hair-thin long streak, a shock ring on your surface, a low `boom`. A slug is 0.05% of you
  (5 ore) plus a 2 E charge, fired at 50 of your diameters/s on top of your velocity at the cursor, every 4 s at best,
  swept. It flies 1.6 s (about 80 diameters).
- The charge fills from the energy the people and the shield do not need, at least 0.25 E/s.
- Shields absorb it (~12.6 K on a peer's shield, rules.test.ts), air burns it, else it hits with WARHEAD 0.5: it
  destroys a ship or a 0.3% body, chips a 1% moon, does nothing to a 3% moon or a planet (rules.test.ts, 2026-11-16,
  you 3·10⁴ to 8·10⁵).
- Fire is the mass driver alone (nothing before LIFE); from Dyson 20% the energy beam replaces it
  ([stargameplay.md](stargameplay.md) → Energy beam). Controls: [hudandcontrols.md](hudandcontrols.md) → Controls.

### Battles

User, 2026-11-14: wanted gravity between the worlds, fighters that chip shields (low damage), frigates for real damage
and rare, missiles from planets, roles, coordination, cinematic battles. The same rules on both sides (`rules.ts`
`ARMS`, `weaponHit`).

| Unit | Role | Picks (`guns.ts` `pick`: distance × class weight, missile 0.5, frigate 0.7, fighter 1, probe/miner 1.5) |
|---|---|---|
| Probe (1 a tier) | point defence | missiles; your priority if ≤ 0.5%; enemy ships within 9 R; never strikes a world |
| Fighter, home (one) | screen | missiles; your priority (a ship: every idle one); enemy ships within 9 R of your world |
| Fighter, siege wing (all but one, ≤ 5: `siegeWing`) | ring the world, harass | enemy ships within 6 R of their world; a strafing turn at their shield every 4 s |
| Frigate | heavy battery | your priority rock first (2–25%); then the enemy world from its post on the siege ring |
| Missile silo | salvo weapon | the enemy world, 1 s after its frigate's lance salvo |
| World | shield, range, bearing | your thrust, driver, beam, priority; a rival's engines |

| Weapon | Speed (shooter's radii/s) | Life / reach | On a shield | Through an open shield | Counter |
|---|---|---|---|---|---|
| Fighter round | 22 | 0.68 s / 15 R | 0.2 K (probe 0.15 K) | burns 0.2 u of stock, ≤ 20 u a raid, never people | bodies stop it; ships jink |
| Lance bolt (frigate) | 22 | 2.7 s / ~60 R | 7.5 K, 3 a salvo, 10 s reload, 1.5 s nose glow | wound | block the line with any body; kill the frigate (hull 3; a rival's 2) |
| Missile (silo) | 11, guided | 3 s | 20 K; salvo 1/2/3 at tiers 1/3/5 (rivals: level + temper, ≤ 4); 20 s reload; 4 ore each | wound; kills enemy ships within 0.6 R | an early burn across or away; one round, slug or beam; any body |
| Slug | 50 diameters/s | 1.6 s | ~12.6 K | air burns it | dodge |

- **Wound and landings:** heavy fire through an open shield fills a wound; every 20 K (`LANDING`) lands as one hit:
  people × 0.8, a surface flash, a dust puff, flickering lights. 8 landings take a world from 1 to 0.17. One raid (a war
  wave or a sortie) kills at most `RIVAL_HIT_MAX` 45% of the people, then a wave turns home. No weapon fire sets life
  back or heats a crust.
- **Your fleet engages by range** (`stage.ts` `engage`, `rules.ts` `sortieStep`): probes and one fighter always stay
  home. Once a rival world's surface is within `STRIKE` 14 of your radii of yours, or within `RECALL` 18 when it is your
  priority, the fleet engages it. It is recalled past `RECALL`, on another target, when the priority that alone brought
  it on is cleared outside `STRIKE`, or with your shield down (then `CALM_S` 20 s before it engages again). Never for
  losses. Distance is the throttle: no menu.
- **The silo** fires `salvo(T)` missiles 1 s after each lance salvo, only while ore covers the whole salvo above
  `RESERVE` 20 u (kept for slugs); a full pool takes fewer.
- Siege geometry (the ring, the strafing turn, the frigate's post): [shipsandflight.md](shipsandflight.md) → Strike.
  Time to break a shield, the ground phase and the duel table: [aliencivilizations.md](aliencivilizations.md) →
  Fighting a rival world. Rival waves: [aliencivilizations.md](aliencivilizations.md) → War waves.
- **Look:** the lance's nose glow growing 1.5 s and a long glowing bolt; missiles with a teardrop head and a flame;
  a landing flashes, puffs dust and flickers the lights; a collapsing shield bursts its veil. All weapon looks:
  [shipsandflight.md](shipsandflight.md) → Guns.

### Star contact

- When the people's need reaches 80% of the energy the world makes, or 300 s into the civilization, they make Star
  contact (toast "Your people need a sun") and Age III opens: [stargameplay.md](stargameplay.md) → Star contact. Debug
  "Star contact" does the same at once.

### What you see

- City lights: brighter with population (full at 5 bn), dimming with the energy fed, flickering under rad. The people
  live on the body, not in a panel.
- **Solar farms** (user, 2026-11-15: "it should look as if it's on the surface; of course, it can't pass through the
  shield"; `view.ts` `solarFarms`): from tier 2, up to 6 panel fields at fixed spots on the ground (0.46–0.68 R from the
  centre), children of your world's view, so they turn with the surface and sit under clouds and shield.
  - Each is 0.3 R wide and 0.17 R·√(1 − d²) deep, with pixel floors. On the day side it opens (eased over 1.5 s), light
    blue (`0x6cc4ff`) with a warm glint; at night, with no star or asleep, it stows as a narrow dark strip
    (`0x1b2f52`). They fade out between 5 and 3 px of radius.
- Shield veils, the lattice dome and ripples; miner shuttles with ore pods; lights on mined moons; ships and the frigate
  with engine plumes; amber rockets; the gold reach gauge while miners work; four cyan arcs on your priority.

## Planned

- **[G] Star danger:** the site score allows danger from a star's harmful zone (`mining.ts`), but `stage.ts` sets
  danger from enemy ships only.

## Open issues

- **[F] Natural infall wipes a parked world** (measured 2026-11-14, user to decide): with `worldHeat` a parked Age II
  world takes a moon-sized infall about every 1.5 min (1.8–4.3% of you, +224 to +819 K). With the shell (computed): a
  full L1 holds slow infall up to 2.9% of you and stops 67% of a 4.3% body; L3 holds up to 8.6%; a slow 5% body still
  lands through L1 at 284 K. Your ships shoot such a body only once you make it your priority. Also in
  [vision.md](vision.md) → Open issues.
- **[F] One-hit civilization wipes** (playtest, before `worldHeat`): one rock right after the shield fell killed 88% of
  the people; rival volleys had taken the shield 90 → 0 K in ~13 s. A hit that gets through may take up to 90%.
- **[F] Each shield level costs ~1 bn people** on inner heat alone.
- **[F] Broken big rocks feed you only partly** (measured 2026-11-14 at 0.26 atm): the piece cap (6 or 8 a hit) leaves
  pieces above the burn-up share for bodies over ~1% in thin air; they land partly and bounce off harmlessly (a 5% rock:
  27% reached you). More pieces a hit would cost field bodies (budget ≤ ~400).
- **[G]** The launch timer makes shuttles clumpy.
- [D] The 80%-need contact path is not playtested; in the one test contact came by the 300 s rule.
- Battles: the siege ring and its frame cost are not measured in the browser.

## Decisions

Standing decisions for every stage are in [README.md](README.md). The ones that shape the civilization, oldest first:

- **Watch and feed** (user): no build menu, no priority toggle; the levers are physical (what you eat, which moons you
  catch).
- **Pirates never destroy a world or kill you** (user); harm is capped (2026-11-13: with shield and stock gone, ≤ ~2%
  water and air a raid).
- **Fun first** (user rule): faster growth; hits kill people instead of setting life back.
- **No tech ladder** (user, 2026-11-13): a level-1 shield and 2 defence ships at LIFE; the mass driver from the start.
- **Miners on every moon, round trips** (user, 2026-11-13): they use it up, work faster with the tier, bring what the
  world lacks, and fly back and forth. Moon gifts and passive moon effects removed.
- **Q5, metal limits ships** (2026-11-13, default kept): mined metal sets the fighter cap (/20) and the miner cap (/15);
  probes and frigates are capped by tier.
- **Q7, shield upkeep** (user, 2026-11-13): 0.1 E/s per level; only a starving world loses strength.
- **Mining mix, tier rad, fleet and rockets** (user, 2026-11-14): miners take radioactive 0.5 / metal 0.3 / water 0.2
  (gas only while the air is thin), never rock; the safe share rises with the tier (3% to 20%); each class its own cap;
  rockets from tier 1; a beaten rival world is consumed by the miners.
- **Breaking into food and small ships stay small** (user, 2026-11-14: "no probes, and small fighters can't do much
  damage on planets etc"): ships break only what you cannot take safely, into pieces your air can take; probes ≤ 0.5%,
  fighters ≤ 2%; only the siege wing strafes an enemy world, and its rounds never kill people.
- **Planetary combat** (user, 2026-11-14, the combat plan with its defaults): the fleet engages by range (14 R in, 18 R
  out); the silo leaves 20 u for slugs; the missile is the anti-world weapon, the rocket the rock breaker; touching a
  beaten world melts you; live rivals orbit you; no automatic rock fire; the Sling removed (Fire = mass driver or beam);
  the shield ignores bodies that would land under 20 K.
- **Slow burn and solar farms** (user, 2026-11-15): "keep green rocks, rad same, slow consume, hard to find, but when
  its empty u can use sun and solar collectors too, (top op the planet, big solar panels like". Fuel lasts 3.3× longer
  (`FUEL_E` 40); solar farms keep an empty world going near a star. Then: "It should look as if it's on the surface; of
  course, it can't pass through the shield": the fields lie on the ground.
- **Home mines** (user, 2026-11-15): "Currently, we have to mine other objects to get ore. But even when there's nothing
  to mine, civilizations should slowly extract and use their own planet's natural resources."
- **"Rad", never "Radiation"** (user, 2026-11-15): "do not say radiation btw, rad is enough". The body type Radioactive
  keeps its name.
- **Each class its own feel** (user, 2026-11-15): fighters fast and light (16/s, 1.5 s cool), probes slow and weak (4/s,
  5 s cool), the frigate, missiles and rockets slow but heavy.
- **Rivals by temper** and **no rival throw** (user, 2026-11-15): [aliencivilizations.md](aliencivilizations.md) →
  Decisions.
- **Priority target** (user, 2026-11-15): a Command tap sets one priority, not an immediate attack; each weapon takes it
  first as it comes ready and can hurt and reach it; notes say honestly why it waits.
- **Missiles and rockets that feel like rockets** (user, 2026-11-15): "Rockets should have some homing capability …
  close-range shots are harder to dodge, while long-range shots give enemies more time to evade"; then "almost as fast
  as lasers … the opponent seems to dodge nearly 100%". Built: guided, slower than rounds (missiles 11, rockets 12, a
  round 22 R/s), kicked to alternating sides and arcing in, so a dodge slips some but not all.
