# Civilization gameplay (from LIFE on)

Runs by itself on top of Age II once LIFE appears: population and tier, energy and dose, stocks, shield, miners,
builds, fleet, priority target, rockets, battles, star contact. Stage 4 in [README.md](README.md) (labels, standing
decisions).

Code (`app/src/evolution/civilization/`): `rules.ts` (numbers), `stage.ts` (loop), `view.ts` (your look), `lattice.ts`
(shield lattice), `ships.ts` (defence, frigate), `orders.ts` (priority, notes), `mining.ts` (mining AI), `slots.ts`
(fleet slots, energy `balance`, `MAKE`/`USE`, `track`), `bolts.ts` (projectile looks), `combat.ts` (Fire, rockets);
`render/tech.ts`. Ship flight, guns, art: [shipsandflight.md](shipsandflight.md). Pirates: [gameevents.md](gameevents.md)
→ Pirates. Rival worlds: [aliencivilizations.md](aliencivilizations.md). Stars, Dyson, colonies:
[stargameplay.md](stargameplay.md). HUD and controls: [hudandcontrols.md](hudandcontrols.md).

## Built

### Start

- At LIFE on the rocky line (not past Super-Earth on the gas line): city lights, a level-1 shield, 2 fighters on patrol
  (`START_SHIPS`), 10 ore (`START_ORE`: two rockets); Fire works at once. Toast "A shield and two patrols guard your
  world · catch moons: miners bring what it lacks". 1 stock unit = 10⁻⁴ of your mass.
- No tech ladder (user, 2026-11-13): Industry comes with LIFE.
- Awake while LIFE lasts here or on a colony ([stargameplay.md](stargameplay.md) → Colonies). **Asleep** (no life, no
  colony): capacity 0, people fall 1/min (`ASLEEP_FALL`; a minute leaves 37%), nothing mined or built, the shield goes
  out and takes no hits, ships still fly. HUD "No life · dying out"; on return "Civilization recovers".

### Population and tier

- **Population:** from 0.2 bn, logistic at 1/min toward K = 10 bn × √(life speed) × (m / Planet mass)^⅓ + colony room,
  capped by what energy feeds (`fedCapacity`: (energy − shield upkeep) / 0.1 E/s per bn). Above K it falls 0.25/min;
  ≥ 0.01 bn always survives.
- **Tier** = 1 + ⌊log2(pop / 0.2 bn)⌋, 1–6; miners work faster with it. Sample: tier 2 at 0:44, 3 at 1:33, 4 at 2:32,
  5 at 4:19, 6 at 10:08 (rules.test.ts, 2026-11-16).

### Energy and dose

User, 2026-11-15: low rad should still allow life; rad becomes the energy for shields, rockets and ships, collected to
keep the supply.

- **Fuel** (`Stocks.fuel`, u) is what reactors burn; your world's **radioactive share** is the dose. Miners' radioactive
  ore goes to fuel, never onto your world. Eaten green rock raises the share; your people dig it out into fuel
  (`refine`, e-folding 180 s), leaving rock. Eating green is the fast risky refuel, miners the slow clean one.
  Radioactive matter never decays.
- **Sources** (`energy`; s = (m / Planet mass)^⅓):

  | Source | E/s | Notes |
  |---|---|---|
  | Inner heat | 0.5 · s · k | k = 0.75 + 0.25 · metal / 10%, 0.75–1.25 (user, 2026-11-15: more metal, more geothermal); about half a habitable world |
  | Reactors | 1 · s × clamp(fuel / 10 u) | 10 bn more while fuel lasts; throttles under `FUEL_LOW` 10 u |
  | Solar farms | 0.5 · s · light · wings / 6 | free; `solarWings(T)` 0/2/3/4/5/6 at tiers 1–6; light = `star/rules.ts` `sunlight` (1 at 3 R★, 1/x, 0 with no star) |
  | Dyson | star stage `dyson` | [stargameplay.md](stargameplay.md) → Dyson sphere; once it covers the need nothing burns |

  No moon makes energy.
- **Need** = 0.1 E/s per bn + shield upkeep + 0.2 E/s (`WORK_E`) per working industry (a build, the rocket magazine
  refilling, shield mending). Star contact uses it too.
- **Burn** (`fuelBurn`): fuel pays only what the need exceeds inner heat + solar + Dyson, at most reactor power. 40 E·s
  a unit at Planet mass (`FUEL_E`): a full reactor 1.5 u/min at any size.
- **Fed** = clamp(energy / need): scales builds, frigate and rocket reloads, shield mending (the shield's cap paid first,
  `shieldFed`); city lights dim with it. Out of fuel people fall 0.25/min toward what free energy feeds; nobody dies of it.
- Computed (rules.test.ts, 2026-11-16, Planet mass, L3): tiers 1–3 burn nothing idle; tier 6 idle 0.66–1.20 u/min, 1.50
  with 2 works; a tier-6 world on 25 u is fully fed until 14:10 and settles at 2.00 bn after 90 min; out of fuel it
  settles at 2.00 bn with no star, 7.00 at 3 R★ (an empty world at a sun keeps ~6–7 of 10 bn); a fed idle 10 bn world in
  full light burns 0.45 u/min; a 5% radioactive tier-1 world is under the safe share in 92 s.
- **Dose** = share / the tier's safe share (`radioLimit` 3 / 4.4 / 6.4 / 9.4 / 13.7 / 20% at tiers 1–6; user,
  2026-11-14: "below 20% it shouldn't cause problems") + outside rad (0.4 + star flux) × (1 − 0.5·field) × e^(−p/2). By
  share, never carried mass (user, 2026-11-14). Over 1 growth slows (stops at 2) and 20%/min per unit dies (≤ 40%/min);
  a sickly limb and flickering lights. Sweep (tier 1, 10 min, 2026-11-16): 0–2% → 5 bn, 3.5% → 4.45, 5% → 0.73, 7% → 0.05.
- **Life:** a little rad helps (×1.25 at 1%), never below ×0.25: [planetgameplay.md](planetgameplay.md) → Life.
- **Toasts:** "Rad sickness" with its source (rad rock, or starlight: keep farther from the star); "Solar farms" once
  over 5% of the need; "Fuel runs low" 2 minutes before the reactors dim below the need.

### Stocks

- **Fuel:** mined radioactive ore plus what is dug from eaten green rock. **Ore:** mined metal. **Volatiles:** mined
  water. Rock is never mined; gas lands on your world. Sources: moons and mining sites, open rival worlds, star lifting,
  home mines, salvage. Meals give no stock. Spent on ships, shield levels, rockets, Dyson segments, colony fleets and
  terraforming. Pirates steal from an unshielded world: [gameevents.md](gameevents.md) → Pirates.
- **Salvage** (user, 2026-11-17: loot that fits what a ship is made of, burns and carries; `rules.ts` `SALVAGE`,
  `combat.ts` `salvage`): an enemy wreck within your fire range while awake credits about half its build in ore, the fuel
  it flew on and, from pirates, the crew's Water, with a green popup. A rival miner adds its haul; a pirate hauler also
  bursts its hold and returns stolen stock. Your own wrecks and jumped pirates give nothing.

  | Wreck | Ore | Fuel | Water |
  |---|---|---|---|
  | Rival fighter | 1.5 | 0.3 | 0 |
  | Rival probe, miner | 1 | 0.2 | 0 |
  | Rival frigate | 12 | 2 | 0 |
  | Pirate raider | 1.5 | 0.5 | 0.3 |
  | Pirate hauler | 2 | 0.5 | 0.5 |
  | Pirate marauder | 5 | 1.5 | 1 |

- **Home mines** (user, 2026-11-15: "even when there's nothing to mine, civilizations should slowly extract and use
  their own planet's natural resources"; `homeDig`): only awake and with nothing else to mine (user, 2026-11-17): no
  mineable moon (rock-only doesn't count), no miner site. Digs `HOME_RATE` 5·10⁻⁶ × tier of your metal share a second
  into ore (shares over 20% count as 20%), and water into volatiles while under 20 u; never the element your world lacks;
  mass kept, the dug share becomes rock. Toast "Home mines" once. Home ore does not raise the fighter or miner caps.
  `CivState.homeIdle` gives the HUD the reason it idles. At 10% metal, 8% water: ore 0.30 / 0.90 / 1.80 u/min, volatiles
  0.24 / 0.72 / 1.44 at tiers 1 / 3 / 6, a tenth of a rocky 2% moon (computed).
- **Fleet metal:** running total of mined metal (`metal`), never spent or stolen; sets the fighter and miner caps.

### Miners on moons

- Every held moon is mined at 1.5% of its starting mass a minute × tier (`MINE_RATE`; ~67 min at tier 1, 11 at tier 6).
  User, 2026-11-13: miners go to every moon, use it up, work faster with the tier, fill what the world lacks.
- **Round trips** (user: back and forth, not a stream): ≤ 2 shuttles a site, a launch every 5–9 s ÷ tier; lift off, brake
  on, dig 1.4 s, fly home, land in an ore puff, rest 5–9 s ÷ tier; a flight over 15 s gives up; the first visit leaves a
  light. Flight: [shipsandflight.md](shipsandflight.md) → Miner shuttles.
- **Mix** (user, 2026-11-14; `mineMix`): `MINE_MIX` radioactive 0.5, metal 0.3, water 0.2 (gas 0.2 only while the air is
  thin: on under 0.5 atm, off at 0.8), over what the body has; never rock. Radioactive → fuel always. Metal → ore and
  fleet metal, water → volatiles, unless your world lacks it (`lack`: weakest of water / air / field under 0.6): then it
  lands as mass (no hit, no heat). Toasts "Miners bring fuel / water / air / iron".
- Mass flows every frame (≤ half a body a frame); shuttles are the look. Rock only left: "Moon mined out"; it still
  guards, or you grind it ([planetgameplay.md](planetgameplay.md) → Moons).

### Mining AI ([E] rules, wired in by [G])

`mining.ts` (tested in `mining.test.ts`), run by `stage.ts`. Concept 9: targets prioritised by distance, need, density,
efficiency and danger; no priority UI.

- **Efficiency:** moon 1, free body 0.6, debris cluster 0.8, open rival world 2.5. **Need weights** (multiply): lacking
  element ×3, metal ×2 while the fleet is short, radioactive ×2 under `FUEL_RESERVE` 30 u.
- **Score** = share × need-weighted worth × efficiency × (1 − 0.7·danger) ÷ trip time (2d/3 + 1.4 s); 0 when mined out.
- **Reach** = outer moon slot + 6 R (8.4 R with 1 slot, 13.4 with 5); outside it 0; a linked body ≥ 25% of you holds to
  1.15× (`LINK_HOLD`); a danger-1 site scores 0 while another is open.
- **Assignment** every 2 s: keep a site that scores and has room (≤ 2); idle miners take the best; busy ones switch only
  for ≥ 1.25× better; non-moon sites first. **Miner cap** clamp(2 + ⌊metal / 15⌋, 2, 12).
- Checked (2026-11-16): an 80%-ice moon at 13.41 R beats a rocky one at 4 R for a dry world; 0 switches in 5,000 noisy
  re-scores.

### Roaming miners and the mining link [G]

- **Survey** every 2 s to 1.3× the reach: moons, open rival worlds, debris clusters (≥ 4 bodies under 2% close
  together), free bodies from 0.2% of you; meteors, held and rival bodies skipped. Danger 1 with an enemy ship within 4 R.
- **Yield:** efficiency × the moon rate, split over 2 miners, only for arrived shuttles. Open rival worlds pay their
  reserve (300·L ore + 100·L volatiles); a **beaten** world then comes down onto you at 2.5 × the moon rate per crew,
  dropped under the smallest moon's mass ("Consuming a beaten world").
- **Link:** a body ≥ 25% holds to 1.15× the reach; nothing drawn. You travel with a moon, but must stay near a planet to
  work it. Toasts "Miners roam", "Mining link".
- **Reach gauge:** a faint gold ring (`GOLD` 0xffc04a, 48 inward ticks), always while miners work (alpha 0.14, 0.3 near a
  linkable body; user, 2026-11-14).
- `civ.miners()` lists shuttles in flight as foes for rivals and pirates.

### Builds and the fleet cap [F]

- **One build at a time** (user, 2026-11-14): the first wanted of fighter, first frigate, shield level, second frigate,
  probe, each to its cap, waiting for ore; a shield level waits for volatiles without blocking.

  | Build | Cost | Time |
  |---|---|---|
  | Probe | 2 ore | 4 s |
  | Fighter | 3 ore | 8 s |
  | Frigate | 25 ore | 40 s |
  | Shield level L | 10·L ore + 10 volatiles | 25 s |

  Times ÷ (0.5 + min(1, pop / K)) × energy fed; 0.6 s between builds. First frigate at 8:56, shield 2 at 12:21 (sample,
  2026-11-16).
- **Caps** (`fleetCap`): probes = tier; fighters = min(6, 2 + ⌊metal / 20⌋); frigates 0 below tier 3, 1 at 3–4, 2 at 5–6;
  one terraforming ship and one colony fleet at a time. No build menu ("watch and feed").

### Shield

- **A physical shell** (user, 2026-11-14: a real barrier, not a health bar) at `shellR` = R·(1.18 + 0.05·(level − 1)),
  met before your ground (`Body.guard`, swept).
  - 30 K a level (added at once), regen 1%/s of max, floor −15% (L1 back above 0 in ~15 s).
  - A body costs `shieldPunch` = 30 K × (share / 2.5%) × max(1, v / stick), v along the normal.
  - Paid: it bounces off whole. Not: the shield drops to its floor, k = paid ÷ punch is vaporised on the shell, and
    (1 − k) of it at (1 − k) speed lands by the usual rules (`asteroid/rules.ts` `shellPass`).
  - A world's own moons pass. A world (a rival body or world, a shielded world, or anything as heavy as you:
    `shellWorld`) pays at the shell like any body, so it breaks the shield there first, then comes on whole to the ground
    rules (user, 2026-11-17: three layers, air → shell → ground).
  - **Strain** (user, 2026-11-17; `STRAIN`, `landIn`, `shieldStrain`, stage.ts `strain`): a body of `GIANT_HIT` or more
    on course for your ground caps the charge by its seconds to contact τ (two-body, the pull at its distance): full at
    τ ≥ 1.5 s, the floor at 0.6 s; each quarter lost ripples the shell on its side. Leaving or a missing orbit strains
    nothing; backing off stops the drain and regen refills it. Without it, contact at the shell gave 0.05 s (measured).
    strain.test.ts: breaks 0.56–0.59 s before contact (3200–1e6 worlds, 0.5–2×, 0–3 R/s). Browser 2026-11-17 (L1, 1e5,
    1.1× world): from rest cracks 1.37 s and breaks 0.57 s before contact (1.34 R gap); at 3 R/s 0.57 s (2.09 R); a pass
    1.71 R clear left it full; turning away after a quarter lost (30 → 22): no hit, back to 25.9 in 15 s.
    You meet a rival's shell too. Your moon meets a rival's shell and ground like any body on you (`field.ts` `hitWorld`).
  - The ripple flashes on the shell, never the ground (`view.ts` `ripple`), weapon hits included.
  - Landing kills people only from 20 K (`HIT_MIN`), ≤ 90% a hit; from 150 K it also wipes life.
- **Burn-up** (user, 2026-11-14): taken only if what reaches the ground after your air delivers ≥ 20 K; rivals alike.
  The air burns first, at its edge outside the shell (`airR` 1.35 R); the shell then judges what is left, unburnt.
  Airless 0.15% bodies pass free, 0.5% are taken; at 0.5–2 atm all under 1% pass (2026-11-16).
- **Through L1 / L3** (rules.test.ts, 2026-11-16, Planet-mass stony airless world):

  | Hit | No shield | L1 | L3 |
  |---|---|---|---|
  | 1% at stick | 97 K, 90% dead | held | held |
  | 1% at 4× | 1551 K, wiped | 0.28% lands at 19 K | held |
  | 2% at 2× | 1075 K, wiped | 39 K, 39% dead | held |
  | 5% at 1× | 1048 K, wiped | 284 K, wiped | held |
  | 5% at 2× | 4176 K, wiped | 1284 K, wiped | 52 K, 52% dead |
  | 12.5% at 1× | 4100 K, wiped | 2754 K, wiped | 696 K, wiped |

- **Upkeep** (Q7): 0.1 E/s per level, paid first; only a world with less energy than the upkeep loses strength.
- **Weapon fire** (`shieldShot`): rounds, lance bolts and rockets always land on it (no 20 K minimum), down to its floor;
  every weapon hit stops mending 3 s (`SHIELD_STUN`). Through an open shield: Battles.
- Toasts "Shield holds", "Shield broken".
- **Look** (user, 2026-11-14: visible hex barrier that cracks, reddens and shatters; `view.ts` `shieldLook`, `lattice.ts`):
  a counter-rotating veil per level under one still hex dome; 10-cell rim under 12 px, then 19 / 37 / 61 / 91 cells
  (n = ⌊px / 8⌋, ±10% hysteresis); cells break nearest a hit first and mend back; faction colour to 60%, amber at 40%, red
  from 15% (the card's bar alike); at 0 it shatters over 0.7 s, dim red ghosts while down, ignites over 0.8 s. No new draw
  calls (`view.ts` MAX_PARTS 460).

### Defence ships

Probes and fighters (`ships.ts`). Probes are light (user, 2026-11-14): break only ≤ 0.5%, push 0.4× as hard, patrol at
0.7× pace. Flight and guns: [shipsandflight.md](shipsandflight.md).

- **No automatic rock fire** (user, 2026-11-14): ships hit rocks only as your priority, from 9 R off its surface. A body
  the class cannot break is pushed (`deflect`, ≤ 1 D/s, less over 5% of you).
- **Idle ships hunt enemy ships** within 9 R of your world; a round breaks a ship (a fighter burst kills a 4 R/s crosser
  at 5 R 58% of the time, 2026-11-16). Your fighters die only to enemy rounds or bodies.
- **Fire discipline** (user, 2026-11-14: no continuous fire): fighter 2 bursts × 8 at 16/s then 1.5 s cool (272 rounds a
  minute held); probe 1 × 3 at 4/s then 5 s (30); rival ships no cap, 2.5 s. A run ends when its target is gone.

#### Breaking into food

User, 2026-11-14: ships break bodies into pieces your world can take, then stop. Every gun of yours uses `rules.ts`
Breaking and `stage.ts` `cut`.

- Only your priority; one you can take safely (under `pieceSize`) fizzles. Held worlds and rival bodies are only pushed.
- **The cut** (`split`): 90% (`KEEP`) flies on as pieces averaging 0.8 × the burn-up share of your air (no air: `edible`,
  landing under 20 K); 10% dust joins you if you have air. ≤ `FLEET.pieces` a hit: probe 3, fighter 6, frigate 8, rocket 8.
- Pieces keep the course, start 1.5 radii apart, spread 0.5 radii/s; oversize pieces get a sideways kick past 1.5 ×
  contact (0.65 R/s at 3 s out, 4.24 at 0.5 s: order early). No mass is created.
- Airless 0.4–3% bodies break in one hit; 10–25% take 9 hits and lose 19%; at 1 atm 0.4–0.8% are not shot (2026-11-16).

### Priority target

- **The priority** (user, 2026-11-15: selecting sets the focus, not an attack; `stage.ts` `order`, `orders.ts` `status`):
  a Command tap (right-click, E, touch long press) on anything but you and your moons (body, rival world, enemy ship or
  rocket; ship first) sets one priority; the same again clears it, another replaces it. Nothing fires at once: each
  weapon takes it first when free and able to hurt and reach it; a run in progress finishes.
- **Who takes it** (reach: ships 1.15 × the gold reach; the siege `RECALL`; rockets only on Fire):

  | Weapon | Enemy ship / rocket | Free rock | Rival's rock or > 25% | Fighting world |
  |---|---|---|---|---|
  | Fighters (home) | every idle one | ≤ 2% break; on course push | on course push | the siege wing |
  | Probes | never (rockets first by pick) | ≤ 0.5% | never | never |
  | Frigate | never | 2–25% at next reload | never | lances from its post |

  The siege wing never leaves its ring; on a fighting world the priority brings the siege on from `RECALL`, not `STRIKE`.
- **Honest notes** (user, 2026-11-15: no "not ready" while a ship only cools; `fx.note`): the best state any weapon has:
  "Priority set", "Reloading · 2 s", "Ships busy", "Shield down · fleet holds", "Out of range", "No fighters", "Nothing can
  hurt it", "No life · fleet idle", "Already beaten", "Priority cleared", before LIFE "No fleet yet"; shown again when the
  reason changes. Low energy shows as a longer reload.
- Ends when the target is gone or the world beaten. **Seen:** four turning cyan arcs (dim while nothing can act); a
  besieged world the same, no siege ring (user, 2026-11-15); the cursor glows over anything a tap would take. Still
  automatic: point defence, the shield, moons.

### Frigate [F]

- Slow heavy guns (user, 2026-11-14), cap and cost under Builds. Every 10 s × energy fed it takes your priority if a free
  rock 2–25% of you (never by itself): a salvo of 3 lance bolts (`ARMS.lance`) that breaks it into ≤ 8 pieces ("Frigate
  strike"); in battle it lances the enemy world. 3 hull points to the enemy (`ships.ts` `lose`). Flight:
  [shipsandflight.md](shipsandflight.md) → Frigate [F].

### Rockets

- **Fire** (left-click, tap, stick point; Space: the HUD target) launches a guided rocket from your surface (user,
  2026-11-17; `combat.ts`, `rules.ts` `ROCKET`; the same rocket for rival worlds). It locks the enemy ship or rocket under
  the aim, else the body (held while it lives), else flies the world-fixed ray through the clicked point; past your mining
  reach it locks the first enemy ship, rocket or your priority it can make (`guns.ts` `spot`), else flies on. Nothing fires
  before LIFE.
- **Flight** (user, 2026-11-17: slower, true from a moving world): 9 R/s relative to its target, 11.7 R/s² along the nose
  only, nose ≤ 2.8 rad/s, pads ±0.7 rad; it flies in its target's frame, so a click from a moving world lands (5 R/s: 224 of
  224 on a still rock at 2–20 R). A point shot keeps your forward speed. A lock comes round: a 10 R/s crossing ship and a
  6 R/s one breaking 90° at 0.6 s are both hit 100%. The seeker lets go 0.57 s before the hit (user, 2026-11-18: a small
  margin to dodge): the counterplay is a hard burn across in that last half second (a 6–7.5 R/s² world slips 22–45%),
  range or point defence (one fighter stops 39%); burning away no longer
  outruns it.
- **Magazine** (`stage.ts` `fire`, `mag`): `salvo(T)` 2 / 3 / 4 at tiers 1 / 3 / 5 (user, 2026-11-17: at least a rival's
  pair); `ROCKET.ore` 5 ore a launch; one back every 6 s × energy fed, drawing `WORK_E`. Notes "Reloading", "No ore"; the
  reticle ring and the Fleet Rockets row show it.
- **Look** (`bolts.ts`): drawn in the ships' unit, `ROCKET.len` 0.095 R (0.95 × the rival probe; bigger 2026-11-17),
  smaller than any ship; the flame and embers grow with thrust (bright on launch and turns, low in straight cruise); flame
  width floor `w` 2.5 px (was 1.5; flame 2 × `w`, jet 1.1 × `w`).
- **Range:** fuel = 3 × your mining reach off your surface (user, 2026-11-17; `mining.ts` `fireReach`: 25.2 / 32.7 /
  40.2 R with 1 / 3 / 5 slots; no shots across the map); turning costs range. Rival worlds still arm within 2 × (`armReach`).
- **Hits:** a free body ≤ 25% of you breaks into ≤ 8 pieces ("Rocket hit"); bigger or a rival's rock is chipped (`ships.ts`
  `chip`: 0.25% of you, two chunks, +40 K); a rival world takes 20 K (`weaponHit`); a direct hit kills a ship (through a
  pirate's shield), ships within 0.6 R take the blast.
- **Near miss** (2026-11-18; `feel.ts` `createDodge`, wired in `combat.ts` `contacts`): an enemy rocket that passes within
  `NEAR.d` 1.5 R of your surface, once the gap has reopened by 0.3 R (it has passed), plays a `whoosh` panned to it and 5
  violet embers back along its path, once a salvo (one shooter's rockets in flight). The last rocket of an untouched salvo
  of 2+ plays `dodge` and 8 embers where it ends (shot down, burst on a moon or out of fuel). Your locked rocket passing its
  target without a hit: 3 cyan embers, no sound (`passed`). Measured over 2,880 planner runs (2026-11-18): ≤ 1 whoosh and ≤ 1
  clean cue a salvo, none at or before the closest approach, none off the far pad, none in a salvo with a hit; the clean
  cue comes a median 1.8 s (max 3.6 s) after the first pass. Your death silences both cues.
- **Hit feel** (2026-11-18; `feel.ts` `STOP`, `stopFor`; `kit.freeze`): your rocket bursting on screen by tier: 1 an enemy
  rocket in the blast, 2 a ship in it, 3 a kill or a live rival world. Hit-stop 25 / 40 / 60 ms of game time (HUD and audio
  run on), at least 0.5 s apart (≤ 120 ms a second); one `strike` (loud, pitch 0.3 / 2, 0.5 / 1, 0.8 / 0.3) replaces the
  blast sound, and a wreck's crack within 0.1 s of it stays silent. No shake, no squash.
- Flight and checks: [shipsandflight.md](shipsandflight.md) → Rockets.

### Battles

User, 2026-11-14: gravity between worlds, fighters that chip shields, rare frigates for real damage, rockets from planets,
cinematic battles. Same rules both sides (`ARMS`, `weaponHit`).

| Unit | Role | Picks (`guns.ts` `pick`: distance × class weight, rocket 0.5, frigate 0.7, fighter 1, probe/miner 1.5) |
|---|---|---|
| Probe (1 a tier) | point defence | rockets; priority ≤ 0.5%; enemy ships within 9 R |
| Fighter, home (one) | screen | rockets; priority; enemy ships within 9 R |
| Siege wing (the rest, ≤ 5) | ring and harass | ships within 6 R of their world; a strafing turn at their shield every 4 s |
| Frigate | heavy battery | priority rock 2–25%; then the enemy world from its post |

| Weapon | On a shield | Through an open shield | Counter |
|---|---|---|---|
| Fighter round | 0.2 K (probe 0.15) | 0.2 u of stock, ≤ 20 u a raid, never people | bodies; ships jink |
| Lance bolt | 7.5 K, 3 a salvo, 10 s, 1.5 s nose glow | wound | block the line; kill the frigate (hull 3; a rival's 2) |
| Rocket | 20 K | wound; outside a wave a rival's kills none of your people | early burn; one round; any body |

Speeds and reaches: [shipsandflight.md](shipsandflight.md) → Guns.

- **Wound:** heavy fire through an open shield fills it; every 20 K (`LANDING`) lands as one hit: people × 0.8, a flash,
  dust, flickering lights (8 landings: 1 → 0.17). One raid kills ≤ `RIVAL_HIT_MAX` 45%, then a wave turns home. No weapon
  fire sets life back or heats a crust.
- **Engage by range** (`engage`, `sortieStep`): probes and one fighter stay home; the fleet engages a rival world within
  `STRIKE` 14 R of your surface (`RECALL` 18 when it is your priority), and is recalled past `RECALL`, on another target,
  when the priority that brought it is cleared outside `STRIKE`, or with your shield down (`CALM_S` 20 s). Never for
  losses; no menu.
- Siege geometry: [shipsandflight.md](shipsandflight.md) → Strike. Shield break times, ground phase, duels and waves:
  [aliencivilizations.md](aliencivilizations.md) → Fighting a rival world, War waves.

### Star contact

- When the need reaches 80% of the energy made, or 300 s into the civilization: "Your people need a sun", Age III opens
  ([stargameplay.md](stargameplay.md) → Star contact). Debug "Star contact" does it at once.

### What you see

- City lights: brighter with population (full at 5 bn), dim with energy fed, flicker under rad.
- **Solar farms** (user, 2026-11-15: on the surface, never through the shield; `view.ts` `solarFarms`, code name
  `solarWings`): from tier 2, 2–6 fields fixed on the ground (0.46–0.68 R out), turning with it under clouds and shield;
  0.3 R wide; open by day light blue (`0x6cc4ff`) with a glint, stowed dark at night (`0x1b2f52`); fade out at 5–3 px.
- Shield veils and lattice, shuttles with ore pods, lights on mined moons, ships with plumes, rockets with cyan trim, the
  gold reach gauge, four cyan arcs on your priority.
- Embers for rocket feel (Rockets → Near miss): 5 violet as an enemy rocket whooshes past, 8 where the last of a dodged
  salvo ends, 3 cyan as your rocket overshoots its target.

## Planned

- **[G] Star danger:** `mining.ts` allows danger from a star's harmful zone; `stage.ts` sets it from enemy ships only.

## Open issues

- **[F] Natural infall wipes a parked world** (2026-11-14, user to decide): a moon-sized infall about every 1.5 min
  (1.8–4.3%, +224 to +819 K). L1 holds slow infall to 2.9%, L3 to 8.6%; a slow 5% body lands through L1 at 284 K. Also
  [vision.md](vision.md) → Open issues.
- **[F] One-hit wipes** (before `worldHeat`): one rock right after the shield fell killed 88%.
- **[F] Each shield level costs ~1 bn people** on inner heat alone.
- **[F] Broken big rocks feed you only partly** (2026-11-14, 0.26 atm): the piece cap leaves pieces above burn-up share
  for bodies over ~1% (a 5% rock: 27% reached you).
- [G] Shuttles launch in clumps. [D] The 80%-need contact path is not playtested. The siege ring's frame cost is not
  measured.

## Decisions

Standing decisions: [README.md](README.md). Civilization ones, oldest first:

- **Watch and feed** (user): no build menu, no priority toggle; levers are physical (what you eat, which moons).
- **Pirates never destroy a world** (user, 2026-11-13): ≤ ~2% water and air a raid.
- **Fun first** (user rule): faster growth; hits kill people instead of setting life back.
- **No tech ladder** (user, 2026-11-13): a level-1 shield and 2 ships at LIFE; Fire from the start.
- **Miners on every moon, round trips** (user, 2026-11-13); moon gifts and passive moon effects removed.
- **Q5, metal limits ships** (2026-11-13): fighter cap /20, miner cap /15; probes and frigates by tier.
- **Q7, shield upkeep** (user, 2026-11-13): 0.1 E/s per level; only a starving world loses strength.
- **Mining mix, tier rad, fleet** (user, 2026-11-14): radioactive 0.5 / metal 0.3 / water 0.2, never rock; safe share 3%
  to 20%; each class its own cap; rockets from tier 1; a beaten world is consumed.
- **Breaking into food, small ships stay small** (user, 2026-11-14): probes ≤ 0.5%, fighters ≤ 2%; only the siege wing
  strafes a world, never killing people.
- **Planetary combat** (user, 2026-11-14): engage 14 R in, 18 R out; touching a beaten world melts you; live rivals orbit
  you; no automatic rock fire; the Sling removed; the shield ignores bodies landing under 20 K. (Its weapons — mass
  driver, silo, missile — superseded 2026-11-17: Rockets on Fire.)
- **Slow burn and solar farms** (user, 2026-11-15): green rocks stay rare, fuel lasts 3.3× longer (`FUEL_E` 40), solar
  farms keep an empty world going near a star, on the ground.
- **Home mines** (user, 2026-11-15); gated to nothing else to mine (user, 2026-11-17).
- **"Rad", never "Radiation"** (user, 2026-11-15); the body type Radioactive keeps its name.
- **Each class its own feel** (user, 2026-11-15): fighters fast and light, probes slow and weak, frigate and rockets slow
  but heavy.
- **Rivals by temper**, **no rival throw** (user, 2026-11-15): [aliencivilizations.md](aliencivilizations.md) → Decisions.
- **Priority target** (user, 2026-11-15): sets one priority, not an attack; notes say honestly why it waits.
- **Rockets that feel like rockets** (user, 2026-11-15): homing; close shots harder to dodge, far ones easier; slower than
  rounds, kicked to alternating sides. (Missiles superseded 2026-11-17; the feel carries over.)
- **Rockets on Fire** (user, 2026-11-17): left-click launches a guided rocket (real thrust, nose ≤ 2.8 rad/s, fuel = 3 ×
  mining reach since 2026-11-17); right-click / E sets the priority. Mass driver, Dyson energy beam, surface priority rockets, your silo, rival
  slugs and silo removed; rivals launch the same rocket. Duel balance by `ROCKET.ore` 5 and `RIVAL_SALVO` 8 s.
- **Salvage** (user, 2026-11-17): wrecks drop what they were made of, burned and carried.
- **Rocket feel** (2026-11-18): a near miss is heard and seen once a salvo, a dodged salvo of 2+ gets its own cue, your
  overshoot shows embers only; your hits stop time briefly by tier (≤ 60 ms, ≥ 0.5 s apart) with one strike sound. No
  shake, no squash.
