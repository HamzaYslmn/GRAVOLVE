# Civilization gameplay (from LIFE on)

The civilization that starts when LIFE appears and runs by itself on top of Age II: population and tier, energy and dose,
stocks, the shield and its upkeep, miners and the mining AI, builds, the fleet (probes, fighters, the frigate), the priority target, surface
rockets, the mass driver and star contact. Stage 4 of the stage table in [`README.md`](README.md). Code: `evolution/civilization/`
(`rules.ts` numbers, `stage.ts` loop, `view.ts` look, `ships.ts` defence, the frigate and rockets, `combat.ts`, `weapon.ts`,
`mining.ts` mining AI rules), `render/tech.ts`; paths are under `app/src/`. Elsewhere: ship flight,
routes and art in [`shipsandflight.md`](shipsandflight.md); pirates in [`gameevents.md`](gameevents.md) → Pirates; rival
worlds in [`aliencivilizations.md`](aliencivilizations.md); stars, Dyson, the energy beam and colonies in
[`stargameplay.md`](stargameplay.md); the HUD in [`hudandcontrols.md`](hudandcontrols.md).

Labels: **measured** = run in the game or in a sim on the real formulas; **computed** = from the formulas; the rest are rules.

## Built

### Start

- Starts at LIFE on the rocky line with city lights, a level-1 shield and 2 defence ships (fighters) on patrol; probes, the frigate and rockets come later, see Builds (user, 2026-11-13: the ten-step tech ladder is gone; Radio, First launches, Moon landing and Interplanetary ships were only decoration, Industry comes with LIFE, the mass driver is there from the start). Star contact (Age III) comes by itself: see Star contact below. Awake while LIFE lasts here or on a colony ([`stargameplay.md`](stargameplay.md) → Colonies). 1 stock unit = 10⁻⁴ of your mass.
- Code detail: "rocky line" means not past Super-Earth on the gas line (`planet/stage.ts`, `envelope`); a Planet-mass world on the gas line can still start one. First toast: "A shield and two patrols guard your world · catch moons: miners bring what it lacks".
- **While asleep** (LIFE lost, no colony) [F]: the capacity is 0 and people fall 1/min (`ASLEEP_FALL`, was 0.25); nothing is mined or built; the shield is fed 0, so it goes out, and takes no hits. The defence ships still fly. Computed: 1 min asleep leaves 37% of the people. When life fills again: "Civilization recovers". The HUD shows it as "No life · dying out": the life bar back on the goal (red), people in red with ▼, the shield "down", the climate cells full size ("asleep" stays the internal term, `ASLEEP_FALL`).

### Population and tier

- **Population:** 0.2 bn, logistic 1/min toward K = 10 bn × √(life speed) × (m/10^4.5)^(1/3) plus the room your colonies add, capped at (energy − shield upkeep) / 0.1 E/s per bn (`fedCapacity`); above K it dwindles 0.25/min. A floor of 0.01 bn always survives (`rules.ts` P_MIN).
- **Tier** = 1 + ⌊log2(pop / 0.2 bn)⌋, 1–6 (shown next to the population): miners work faster with it. Sample run (Planet, habitability 0.5): tier 2 0:44, 3 1:33, 4 2:32, 5 4:19, 6 10:08 (computed, 2026-11-15 fuel model, `rules.test.ts`).

### Energy and dose

- **Two quantities** (user, 2026-11-15: "low radiation levels should still allow life… radiation could become an energy resource for shields, rockets, and ship production… collect radiation sources to maintain their energy supply"): **fuel** (`Stocks.fuel`, u like ore) is what the reactors burn; **radiation** (your world's radioactive share) is the dose. Miners' radioactive ore goes straight to the fuel stock, never onto your world. A green rock you eat raises the share; your people dig it out into fuel (`refine`, e-folding 180 s), leaving plain rock: eating green is the fast, risky refuel, miners the slow, clean one. Radioactive matter never decays.
- **The dose goes by your radioactive share, never carried mass** (user, 2026-11-14: a 1.1M world at 0.4% read "harmful" when the dose counted carried mass). Size term s = (m/10^4.5)^⅓, the capacity's.
- **Energy:** E = inner heat 0.5·s·k + reactors 1·s × clamp(fuel / 10 u) + solar + Dyson (`rules.ts` `energy(fuel, m, dyson, sun, metal)`, `reactor`, `solar`); k = clamp(0.75 + 0.25 · metal / 10%, 0.75, 1.25) (user 2026-11-15: more metal, more geothermal; capped so fuel stays needed: at Planet mass with an L3 shield and no fuel, 30% metal feeds 3.2 bn in the dark, 8.2 bn at a sun). Inner heat alone feeds about half a habitable world's people; the reactors (10 bn more) take you past that while their fuel lasts, throttling down under `FUEL_LOW` 10 u (no cliff).
  - **Burn** (`fuelBurn`): only for what the need exceeds inner heat + solar + Dyson, at most the reactors' power, 40 E·s a unit at Planet mass (`FUEL_E`, 12 until 2026-11-15): a full reactor burns 1.5 u/min, and the same u/s at any size for a draw scaled like the world.
  - **Solar farms** (user, 2026-11-15; panel fields on the ground: What you see): free energy from starlight, counted like inner heat (no fuel, no deploy state, always on). `solar(light, T, m)` = `SOLAR` 0.5 · s · clamp(light, 0, 1) · wings / 6, wings = `solarWings(T)` 0 / 2 / 3 / 4 / 5 / 6 at tiers 1–6; light = `star/rules.ts` `sunlight(glow, cover, x)` = dimmed glow × 3 / x (1 at 3 R★ from a sun, 1/x, no floor, 0 with no star: deep space and before contact). Half a full reactor at best: near a star an empty-fuel world keeps going, never as far as fuel takes it.
    - Computed (`rules.test.ts`, Planet mass, L3, habitability 1, out of fuel; bn settled from 10 / from P0): no star 2.00 / 2.00 · 30 R★ 2.33 / 2.33 · 12 R★ 2.83 / 2.83 · 6 R★ 4.08 / 4.08 · 3 R★ 7.00 / 6.17 (from P0 it stops at tier 5: 5 wings); with fuel 10. A fed, idle 10 bn world in full light burns 0.45 u/min.
    - A "Solar farms" toast once the farms give over 5% of the need; your card's Make bar shows their share (the solar segment).
  - **Work draws** (`WORK_E` 0.2 E/s each): a build running, the rockets on a priority, the shield mending.
  - **Fed** = clamp(energy / need) multiplies build speed, the frigate, silo and rocket reload, and the shield's mending rate (its cap stays paid first, `shieldFed`). City lights dim with it (`view.ts`). Out of fuel the people decline at the usual 0.25/min toward what inner heat feeds; nobody dies of it.
  - Computed (`rules.test.ts`, Planet mass, L3, no solar): tiers 1–3 burn nothing idle; tier 4 (1.6 bn) with 2 works 0.54 u/min; tier 6 idle 0.66 / 0.90 / 1.20 u/min at 6.4 / 8 / 10 bn, 1.50 with 2 works. A full tier-6 world (10 bn) on 25 u is fully fed until 14:10, under 80% from 18:57, and settles at 2.00 bn after 90 min (inner heat feeds 2); 25 u more feeds it again at once. At tiers 1–3 a stock burns only while something works.
  - A gorged world (5% radioactive at tier 1) is under the 3% safe share in 92 s with 200 u of fuel (500 u in the end).
  - Dyson energy reaches the civilization as its `dyson` input (`CivInput`, from the star stage): [`stargameplay.md`](stargameplay.md) → Dyson sphere; once it covers the need nothing burns. No moon makes energy.
- **Need** (shown in the panel) = 0.1 E/s per bn of people + the shield's upkeep + 0.2 E/s per working industry. Star contact and the mass driver's charge use this same need.
- **Dose** = share / the tier's safe share (`radioDose(share, radioLimit(T))`: 3% at tier 1 rising to 20% at tier 6 = 3 / 4.4 / 6.4 / 9.4 / 13.7 / 20%, user 2026-11-14: "below 20% it shouldn't cause problems"; no field or air helps) + (0.4 + star flux) × (1 − 0.5·magnet) × e^(−p/2); over 1: −20%/min per unit (≤ 40%), no growth; shows as a sickly limb and flickering lights.
  - Code detail: growth is scaled by (1 − (dose − 1)), so it slows from dose 1 and stops at dose 2 (`rules.ts` `popStep`).
  - Measured (rules.test.ts sweep, tier 1, habitability 1 at Planet mass, field 0.6, 1 atm, 10 min, no fuel): 0–2% → 5 bn (dose ≤ 0.84), 2.6% → 4.96 bn (dose 1.04), 3.5% → 4.45 bn, 5% → 0.73 bn. The share is a dose only; energy comes from the fuel stock.
  - Your card shows composition shares under 1% with one decimal, so a trace never reads as 0%.
  - Toasts ("Rad sickness") name the source: "Too much rad rock in your world … stop eating the green, your people dig it out", or near a star "Starlight burns your people · keep farther from the star". Once, 2 min before the reactors dim below the need: "Fuel runs low · green rocks and moons refuel them".
- **Life:** a little radioactive rock helps life before the civilization (×1.25 at 1%), past 3% it slows it, never below ×0.25: [`planetgameplay.md`](planetgameplay.md) → Habitability (`radioLife`).
- Hot industry (overdrive: fuel near the safe share sped yards and reloads up to ×2) was replaced by the energy fed (2026-11-15).
- Concept 3's "radioactive materials are used during stages 1 and 2": built as the fuel stock; the energy need leads to a star (Star contact below).

### Stocks

- **Stocks** (user, 2026-11-14): fuel is mined radioactive ore (and what your people dig out of eaten green rock, 2026-11-15); ore is mined metal only; volatiles are mined water. Rock never; gas lands on your world instead (Miners on moons). Sources: mined moons and other mining sites, open rival worlds (reserves, through your miners), star lifting, and home mines. Meals no longer give stock.
- **Home mines** (user, 2026-11-15: "even when there's nothing to mine, civilizations should slowly extract and use their own planet's natural resources"; `rules.ts` `homeDig`, run every frame while awake in `stage.ts` after the moons): `HOME_RATE` 5·10⁻⁶ × tier of your metal share a second into ore (a share over `HOME_RICH` 0.2 counts as 0.2) and of your water share into volatiles while the stock is under `HOME_VOL` 20 u (all shield levels cost); never the element your world lacks (`lack`). Your mass is unchanged; the dug share becomes plain rock (as `refine`). Home ore does not count toward fleet metal (the fighter and miner caps stay a mining reward). Toast "Home mines" once, when ore comes in with no moons.
  | 10% metal, 8% water | tier 1 | tier 3 | tier 6 |
  |---|---|---|---|
  | ore u/min | 0.30 | 0.90 | 1.80 |
  | volatiles u/min (under 20 u) | 0.24 | 0.72 | 1.44 |
  A tenth of a rocky 2% moon at the same tier (computed, `rules.test.ts`); an hour at tier 6 takes metal 10% → 8.98% (field unchanged at Planet mass), sum 1. Measured in game (debug Life world, planet view, tier 3, metal 12.7%, `moons.list` stubbed empty, no miners out; a 10 s window ×6): 1.132 u/min of ore against 1.132 predicted; with metal set to 0, none. Tiers 1 and 6, the 20 u volatiles stop, the lacking element and the toast's once are checked by `rules.test.ts` and the code only.
- **Metal for the fleet:** a running total of the metal of every mined haul (`metal` in `stage.ts`). It is never spent or stolen; it sets the fighter cap (the probe and frigate caps come from the tier) and the miner cap (Q5).
- Spent on ships, shield levels, slugs, Dyson segments, colony fleets and terraforming ([`stargameplay.md`](stargameplay.md)).
- Pirates steal stock from an unshielded world, 1 unit per hit (ore first, ≤ 20 u a hauler); with stock gone too, a hit knocks a little water or air off (≤ 2% a raid); since the 2026-11-14 redesign they also crack rocks and haul the pieces, and their haulers and guards stay outside your moon system: [`gameevents.md`](gameevents.md) → Pirates.

### Miners on moons

- **Miners** (user: they go to every moon, use it up, faster with the tier, and fill what the world lacks): every moon you hold is mined at 1.5% of its starting mass a minute × tier (a moon lasts ~67 min at tier 1, ~11 at tier 6); miner shuttles make round trips (user: back and forth, not a stream): at most 2 a site, one launch every 5–9 s ÷ tier; each lifts off your surface, brakes onto the site's near side, digs 1.4 s (dust kicks up, a warm ore pod in the site's colour fills on it), flies straight home loaded, lands 0.08 R off your surface in a puff of ore dust and rests 5–9 s ÷ tier before going out again; the first visit leaves a light on a moon. Measured in a test tab (tier 1, 3 moons at 3.0 / 4.5 / 6.1 R): one way ~1.5 s, a full trip ~4.5 s, up to 6 shuttles. What miners take (user, 2026-11-14): a weighted mix over what the body has, `MINE_MIX` radioactive 0.5, metal 0.3, water 0.2 (gas 0.2 only while the air is thin), renormalised over the elements present and capped by what is there (`mineMix`); never rock. Radioactive goes to the fuel stock (always mined, 2026-11-15; was landed on your world while its dose stayed under 0.8); metal goes to ore stock and the fleet metal total, water to volatiles, unless your world lacks that element (`lack`: the weakest of water / air / field under 0.6 → ice / gas / metal; then it lands; toasts "Miners bring fuel / water / air / iron"). Gas only while a latch is on (on under `AIR_LOW` 0.5 atm, off at `AIR_HIGH` 0.8 atm, never past `GAS_WARN` gas share); it lands. A moon with nothing mineable left stays as a guard.
- Code details (`stage.ts`, `view.ts`):
  - Mining runs only while the civilization is awake, and on every moon.
  - At most half a moon a frame. When only rock is left the toast says so ("Moon mined out"); the bare moon keeps guarding, or you grind it down by hand (planetgameplay.md → Moons). Free bodies with nothing mineable are not sites.
  - What lands on you arrives as mass of that element, no hit and no heat.
  - On moons the shuttles are the look: the mined mass flows every frame whatever they do (no grain line: the only stream is the manual moon grind). A flight that takes over 15 s gives up; a shuttle whose site is lost flies home empty.
- The shuttles use the ships' flight model (cruise 3 R/s, brake 8 R/s²): [`shipsandflight.md`](shipsandflight.md).

### Mining AI ([E] rules, wired in by [G])

`civilization/mining.ts`, checked by `mining.test.ts` (in `npm test`); `stage.ts` runs it. Concept 9: "targets must be
automatically prioritized based on distance, resource requirements, resource density, efficiency, and danger level". No
priority UI (watch and feed).

- **Site** = `{ id, d, share, comp, kind, danger, linked? }`: distance to its near side (your radii), mass ÷ yours,
  composition, kind (moon / free / debris / defeated), danger 0–1, and whether a link already holds it. **Needs** =
  `{ lack?, fleetShort, energyShort }` (fleet under its cap; the fuel stock under `FUEL_RESERVE` 30 u).
- **Efficiency:** moon 1, free body 0.6, debris cluster 0.8, defeated (open rival) world 2.5.
- **Need weights** (`weights`): the lacking element ×3, metal ×2 while the fleet is short, radioactive ×2 while fuel is
  short; they multiply.
- **Score** = share × worth (the need-weighted share of its material) × efficiency × (1 − 0.7·danger) ÷ trip time; 0 when
  mined out. The share term was added with [G]: without it a near moon always beat a big far body. Trip time
  `tripTime(d)` = 2d/3 + 1.4 s (3 R/s and a 1.4 s dig, as the shuttles fly).
- **Reach** ("outermost ring") = outer moon slot + 6 R: 13.4 R with 5 slots, 8.4 R with 1 (slots compressed 2026-11-14). A linked body ≥ 25% of you
  (too big to be a moon) holds to 1.15× the reach. Outside it a site scores 0; a danger-1 site scores 0 while any other
  is open.
- **Assignment** (`assign`, re-scored every 2 s): a miner keeps a site that still scores and has room (≤ 2 a site); idle
  miners take the best open site; busy ones, worst first, switch only for a site ≥ 1.25× better. Non-moon sites claim
  miners first (moons are mined anyway); idle miners then go to the moons.
- **Miner cap from metal** (`minerCap`): clamp(2 + ⌊metal / 15⌋, 2, 12), metal = the mined-metal total (Q5).
- Computed (`mining.test.ts`): a dry world with a rocky moon at 4 R still prefers an 80%-ice moon out to 13.77 R
  (3.44×); 0 switches in 5,000 re-scores with ±5% noise (6 miners, 5 sites); cap 0 → 2, 15 → 3, 45 → 5, 90 → 8, 150 → 12.

### Roaming miners and the mining link [G]

- **Survey** every 2 s, out to 1.3× the reach (so the ring shows before you are in): your moons, open rival worlds
  (`combat.rivals.sites()`), debris clusters (≥ 4 bodies under 2% of you within 1.5 R of the first, mined from the
  biggest; pure `clusters()`: concept 2's accretion disks), and free bodies (≥ 2% of you, or a lone body ≥ 0.2%).
  Meteors, held, rival, fast bodies and moons of others are skipped. **Danger** 1 when an enemy ship (rival or pirate) is
  within 4 R of a site.
- **Yield:** moons as above. Any other site gives efficiency × the moon rate (1.5%/min of its starting mass × tier), split
  over 2 miners, only for shuttles that have arrived. Free bodies and debris lose that mass by the same mix and are gone below min(0.1% of you, 30% of their start). Open rival worlds run down their reserve
  (`site.ore` / `site.vol`) at efficiency 2.5; once **beaten** (`rivals.ts` `sites()` passes `beaten`) the world is also consumed while your miners work it: its mass comes down onto you in its own composition at `EFFICIENCY.defeated` × `MINE_RATE` × tier of its starting mass a second per shuttle ÷ `PER_SITE`, and under the smallest moon's mass it is dropped (toast "Consuming a beaten world"). The user said "probes" for this; it is built for miners (default, the user can change it).
- **Look:** shuttles fly to their site; a linked body ≥ 25% of you holds to 1.15× the reach and snaps with one spark (no gravitational bond, no grain line: deleted 2026-11-14). The reach shows as a faint
  gold gauge (`GOLD` 0xffc04a: a thin line with 48 inward ticks, unlike the moon slots' broken cyan `dashRing`) always while miners work (alpha 0.14; 0.3 while a linkable body is near; user 2026-11-14: "should always be visible while miners are active"). Built once in screen pixels and turned, rebuilt only when its size on screen changes by over 5% (`view.ts`). Toasts "Miners roam", "Mining link". So you can travel with a
  moon, but to exploit a planet you must stay near it.
- Hook `civ.miners()`: the shuttles in flight as foes, so rival bolts and pirate raiders can shoot them
  ([`gameevents.md`](gameevents.md) → Pirates, [`aliencivilizations.md`](aliencivilizations.md)).
- Measured: parked 9 R from a 30% body, the link formed and the body lost 0.22 u/s (0.225 computed); the link held to
  13.9 R and snapped at 14.2 R (reach 12.2, hold 14.0); miners switched site 1.5 s after a foe appeared; `civ.update`
  0.10 ms median.

### Builds and the fleet cap [F]

- **Builds** one at a time (user, 2026-11-14): the first one wanted of `buildOrder`: fighter, your first frigate, shield level, a second frigate, probe (was frigate first), each class to its own cap, waiting for its ore (a shield waits for its volatiles without blocking the others). Costs and times (`FLEET`): probe 2 ore / 4 s, fighter 3 ore / 8 s, frigate 25 ore / 40 s (was 10 / 16: rare and dear, the heavy battery; Battles); a shield level L is 10·L ore + 10 volatiles / 25 s (was 40·L). Computed sample run (`rules.test.ts`, 25 min, three moons): a frigate at 8:56 and shield level 2 at 12:21 (2026-11-15 fuel model; at 40 ore, the plan's price, the run could buy the frigate or the shield level, not both).
- **Fleet caps** (`fleetCap(class, tier, metal)`, each class its own): probe = tier; fighter = min(6, 2 + ⌊metal / 20⌋) (Q5); frigate 0 below tier 3, 1 at tiers 3–4, 2 at 5–6. The panel shows ships total / total cap, the per-class counts on hover. Miner shuttles are capped separately by `minerCap(metal)` (above). One terraforming ship at a time and one colony fleet at a time ([`stargameplay.md`](stargameplay.md)).
- Code details: build times are divided by a build speed of 0.5 + min(1, pop / K), so 0.5–1.5× (`rules.ts`
  `buildSpeed`) × the energy fed (Energy and dose); 0.6 s between two builds.
- No build menu, no priority toggle (standing decision "watch and feed").

### Shield

- **Shield, a physical barrier** (2026-11-14; user: "the shield should act as a real physical barrier, not just a visual effect or an extra health bar"; a shield that breaks still absorbs the first blow, and the planet takes only what gets through): a shell at `shellR` = R·(1.18 + 0.05·(level − 1)) (the outer veil's rim, the same number `view.ts` draws) that a body meets before your ground (`asteroid/body.ts` `Body.guard`, checked swept in `sweep`, so it holds at any frame rate). Its charge (30 K per level, regen 1%/s, floor −15%) pays `shieldPunch` = 30 K × (share / `SHIELD_STOP` 2.5%) × max(1, v / stick speed) for the body (v: its closing speed along the shell's normal, so grazes cost less). It can pay: the body bounces off whole (`REBOUND` 1, elastic; its sideways speed kept), never reaches the ground; the shield drops by the punch. It cannot: the shield goes to its floor (the shatter), share k = what it could pay / the punch is vaporised on the shell (sparks), and the rest, (1 − k) of the body at (1 − k) of its closing speed, goes on and lands by the usual rules (`asteroid/rules.ts` `shellPass`). Bodies as heavy as you, a world's own moons, rival worlds and rival bodies pass; another world's moon (yours on a rival's shell) meets it like any body (`Guard.own`, `asteroid/rules.ts` `shellSees`). The impulse is shared by mass: your world recoils a little.
- Code details (`rules.ts` `shieldMeet`, `shieldHolds`; `stage.ts` `me.guard`): the guard's shell is 0 while the shield is down or the civilization asleep. A held hit: ripple, flash, "Shield holds"; a broken one: ripple, flash, sparks, the shatter, "Shield broken" with the share it stopped. What lands kills people only from 20 K (`HIT_MIN`), at most 90% in one hit, and does not set life back; ≥ 150 K kills people and wipes life too. A level-1 shield at its −15% floor is back above 0 in ~15 s (`rules.test.ts`). Each new level adds 30 K at once. Rival worlds have the same shell (`rivals.ts`, `Body.guard`; judged with their 1 atm air). Past it, your moon (also once the shell has shed it loose: `Body.metShell`) lands on a rival world by `worldOpts` as a body lands on you (`field.ts` `hitWorld`): bounce and shatter, `worldHeat`, people from 20 K; before 2026-11-15 it passed the shell and was eaten as a meal.
- Before → after (computed, `rules.test.ts` prints the after side through L1 / L3, a Planet-mass stony world, no air; K at your ground, people dead): 1% at the stick speed 97 K, 90% dead → held by L1 (6 K left of 30); 2% slow 270 K, life wiped → held by L1; 1% at 4× 1551 K → L1 stops 72%, 0.28% lands at 19 K, nobody dies; 2% at 2× 1075 K → L1 stops 72%, 39 K, 39% dead, life kept; 5% slow 1048 K → L1 stops 57%, 2.1% lands at 284 K (still 90% dead, life wiped), L3 holds it; 5% at 2× 4176 K → L3 stops 86%, 52 K, 52% dead; 12.5% slow 4100 K (merge and melt) → L1 stops 23%, 9.6% bounces at 2754 K, no merge; L3 stops 69%, 3.9% at 696 K; 25% slow 11536 K → L1 12%, 22% merges at 9587 K. What lands is always below the hit itself; people and life still saturate wherever it stays over 90 K / 150 K (`popHit`, `EXTINCT` unchanged). Before, the old all-or-nothing shield (a whole hit up to 1.15 × its maximum, ≤ 10% of you per level) let every one of these through whole with its full heat, and collapsed.
- **Burn-up** (user, 2026-11-14: "objects small enough to burn up in the atmosphere don't damage or consume shield energy"; the transparency rule in `shieldMeet`): the shield takes a body only if what reaches your ground after your air delivers ≥ `HIT_MIN` 20 K, the same line under which nobody dies. The shell judges what would reach your ground after your air (`ships.ts` `strike`, as `field.ts` burns at the surface); rival shields follow the same rule. Computed (`rules.test.ts`, a Planet-mass stony world, at 4 / 12 of your diameters/s): airless 0.15% (6 / 14 K) free, 0.3% 15 K free at 4 but 38 K taken at 12, 0.5% (33 K) taken; 0.26 atm 0.5% 11 K free, 28 K taken at 12; 0.5–2 atm everything under 1% free; 1% (92 / 218 K) always taken. Weapon fire is unchanged (`shieldShot`, no minimum).
- **Upkeep** [F] (Q7): `upkeep(level)` = 0.1 E/s per level, paid first: the people are fed from `fedCapacity(K, E − upkeep)`. `shieldFed(E, level)` = clamp(E / upkeep, 0, 1); the shield's maximum and regeneration are × that share, so only a world with less energy than the upkeep itself loses strength. Computed: level 3 on inner heat alone caps people at 2 bn (was 5) with the shield 100% fed; with E 0.15 against an upkeep of 0.3 it is fed 50%.
- **Weapon fire** (2026-11-14, `shieldShot`): rounds, lance bolts, missiles, slugs, pirate rounds and the beam always land on the shield (no 20 K minimum, no size or range gate): it takes what it holds down to its floor, the rest gets through, and every weapon hit, up or down, stops its mending for `SHIELD_STUN` = 3 s. It is back once regen lifts it above 0 (3 s after the last hit, then 15 s from the floor). Through an open shield: see Battles. Before, the rivals' 2 K rounds and pirates' 3 K rounds did nothing to a shield (pirates stole with it up), and a slug hotter than its range was not absorbed at all.
- Concept 6's "shields can break as a result of excessive collisions" (`shieldMeet`, the −15% floor, `breakShield`) and "shields consume energy" are both built.
- The look (2026-11-14; user: "the shield is invisible around the planet", then: parts looked missing, as if the lower section were damaged; make the whole shield a visible hexagonal barrier that cracks, reddens and shatters): one dusty counter-rotating veil per level (always the faction colour, alpha 0.05 + 0.09 × the layer's share, `rules.ts` `shieldLayers`: the outer layer drains first; noise sampled on a circle, so no seam) under one **hex lattice** dome (`lattice.ts`, drawn by `view.ts` `shieldLook`).
  - Dome seen from above: ring k of 6k cells at sphere angle φ = k·(π/2)/(n + 0.5), on screen at Rs·sin φ, Rs = `shellR` = R·(1.18 + 0.05·(level − 1)) (the outer veil's rim and the physical shell; ripples sit there too); cells squashed radially by φ·cos φ / sin φ (0.3–1), brighter toward the limb (0.22 + 0.78 sin² φ), alpha (0.30 + 0.12·level) × that; small cells × clamp(9 / px, 1, 2). The lattice does not turn (holes stay put).
  - Cells by the shell's radius on screen S: under 12 px a 10-cell rim at φ 70° (≥ 1.6 px thick); then n = clamp(⌊S / 8⌋, 2, 5) (19 / 37 / 61 / 91 cells), ±10% hysteresis; rivals at most n = 3.
  - Health e = charge / full max (an underfed shield shows holes): a cell stands while its seeded hold < 0.35 + 0.65·e (35% stand just above 0); the next 0.35·(1 − e) of them draw cracked (half alpha, one ramp step hotter). A hit re-deals the standing holds so the cells nearest it break first (±0.15 pitch jitter); the mend closes the hole back toward it. 19 cells: 19 / 14 (3 cracked) / 10 (5 cracked) / 7 (all cracked) at 100 / 60 / 25 / 0+ %.
  - Colour (you and rivals): faction colour down to 60%, to amber `0xffb46b` at 40%, to red `0xff4a3a` at 15%, red below. The veils and city lights keep cyan / violet. The ripple and the card's shield bar and icon follow the same ramp.
  - At 0 every standing cell shatters like glass over 0.7 s (flies out 0.5–1.1 R with ease-out, spins 4–9 rad/s, tumbles, white → red, fades); a body too big for a full shield takes it to its floor and shatters all of them as it meets the shell (the remainder lands a moment later); the dust burst stays. While down, dim red ghost cells (alpha 0.16) show how far it is back from the floor (35% of the cells at 0, frozen while stunned); back above 0 they ignite over 0.8 s, lowest holds first.
  - A hit flares the cells near it (alpha × (1 + 1.2·hot), 60% toward white, hot = exp(−(d / 0.5 Rs)²) fading over 0.25 s) and shows the hex ripple.
  - Cost (measured in Node, `performance.now` over 1,000 steps of the step's lattice logic with a stub `put`): 6.9 µs a step at rest with 91 cells, 16–17 µs under fire every 20 frames (the re-deal sorts), 3 µs with 19 cells, 3.6–4.1 µs for a rival's 37. No new draw calls: quads in the existing ParticleContainers (`view.ts` MAX_PARTS 360 → 460, rivals through `combat.ts`'s 600). Not yet tried in a test tab.

### Defence ships (probes and fighters)

What they do (`ships.ts`); probes are the light class (user, 2026-11-14): their lasers break only bodies ≤ 0.5% of you (`FLEET.probe.breaks`), push 0.4× a fighter's kick and they patrol at 0.7× its pace. Fighters, below; how they fly and fire (pairs on a circuit, attack runs, guns, the flight model) is in [`shipsandflight.md`](shipsandflight.md).

- **No automatic rock fire** (user, 2026-11-14): your ships never attack rocks by themselves. They fly only at your priority target
  (Priority target, below). A run fires bursts from 9 R off its surface
  while its gun bears; a body the class cannot break is pushed sideways by every hit, a sixth of the kick that makes it
  miss (`deflect`), up to 1 D/s in all, less for bodies over 5% of you. Its wingman fires with it. Rival patrols keep
  their autopilot (aliencivilizations.md). Before, every body on course drew fire: pieces of a big body stayed on course
  and above safe size (a 10% rock left 8 × 1.13% pieces of 109–116 K each, computed), so ammunition was spent and the
  threat still landed.
- **Fire discipline** (user, 2026-11-14: "they shouldn't be able to fire continuously"): a run fires at most `FLEET.bursts`
  bursts of `FLEET.rounds` (fighter 2 × 6, probe 1 × 4), then the ship breaks off and cools `FLEET.cool` (fighter 3 s,
  probe 4 s; rival ships keep 2.5 s and no cap). A run also ends once its target is gone or no longer on course. Measured
  (`rules.test.ts`, the gun held a minute): fighter 2.4 rounds/s (was 5.6, no cap a run), probe 0.9/s.
- **Breaking into food** (user, 2026-11-14: ships turned everything to dust; they now break bodies into pieces your world
  can take and stop there). Every gun of yours (probes, fighters, the frigate, rockets) uses the same rules (`rules.ts`
  Breaking, `stage.ts` `cut`):
  - **Targets:** your priority (Priority target). A priority on what you can take safely (under
    `pieceSize`) fizzles at once, no round fired. Held (rival) worlds and rival bodies are only pushed.
  - **The cut** (`split`, `pieceSize`): 90% (`KEEP`) in pieces cut to 0.8 × the burn-up share of your air on average (so
    they burn up whole: all of it feeds you), or with no air to `edible`, the largest piece that lands under 20 K (0.34% of
    you at the stick speed). Unequal since 2026-11-14 (`asteroid/rules.ts` `pieceShares` at `cutSpread`: spread 0.25, the
    largest 1.25 × the mean and still under the size; less spread where the piece cap made the mean bigger), each passed
    its parent as `from`; the breaking check's hits and dust came out unchanged. At most `FLEET.pieces` a hit (probe 3,
    fighter 6, frigate 8, rocket 8), the mean never under
    1.5 × the field's drop floor (`SPECK` 1e-3 of you). The other 10% is dust and joins you if you have air. Pieces fly
    on the body's course, 1.5 of its radii out (so they never touch and merge), spreading at 0.5 of its radii a second,
    and burn up in your air as streaks. Pieces the cap left above the safe size get a sideways kick that makes them pass
    1.5 × contact from your centre (`deflect`, solved exactly at closest approach; computed `orders.test.ts`: on a
    dead-centre line at 10 R/s, 0.65 R/s at 3 s out, 4.2 R/s at 0.5 s: ordering early is the skill). No mass is created.
  - **Computed** (`rules.test.ts`, every gun on every piece until none is a target, stick speed): 0.4–3% → one hit,
    10% dust; 10% and 25% → 9 hits, 19% dust; at 1 atm 0.4% and 0.8% bodies are not shot at all (they burn up or land
    under 20 K). Before (Node, the old `shatter`): 60% of every break was dust, 84–108% of a body lost on an airless world.
  - **Measured** (test tab, debug Life jump, 0.26 atm, the field around cleared, one rock thrown at 4 R/s from 18 R):
    0.3% and 0.6% not shot (they burned or landed); 0.9% broken 14 R out into 5 × 0.16%, 93% of it reached you; 1.2% /
    1.5% / 1.9% → 83 / 74 / 80% (6-piece cap: pieces 0.18–0.29% partly land and bounce); a 5% rock broken by a rocket
    9.9 R out into 8 × 0.56%, 27% reached you; no round was ever fired at a piece. A swarm of 8 rocks of 0.8–1.5% at once
    (3 ships, no frigate): 13 rounds in 10 s, most rocks got through. Before the change the same 0.9% case lost 60% as
    dust. Measured at 0.26 atm, pieces cut to `edible` fed you 68–71% of a 1.5–1.9% rock. With guns (Node): a 0.4 R body falling at 4 R/s is first hit 10.5–11.8 R out ([shipsandflight.md](shipsandflight.md) → Strike).
- Idle ships hunt enemy ships (pirates, rival ships) within 9 R of your world with the same run: a round that hits breaks the ship (a still fighter's burst at a ship crossing 5 R out at 4 R/s: 59%, Node). Your fighters are lost only to enemy rounds (pirates during a raid on you, rival waves and patrols) or to bodies.

### Priority target

- **The priority** (user, 2026-11-14: right-click to attack; 2026-11-15: "selecting a target should set it as the
  priority, not trigger an immediate attack. If there are multiple enemies, I want to choose which one my ships focus on";
  `stage.ts` `order`, `orders.ts` `status`): a Command tap (right-click, E, a touch long press released before the hold)
  on anything but you and your moons (a body, a rival world, an enemy ship or missile; a ship under the tap first, `foeAt`)
  makes it your one priority target; the same target again clears it, another replaces it (no queue). Setting it fires
  nothing by itself: each weapon keeps its rhythm and, when it next comes free, takes the priority first if it can hurt
  and reach it, else does its normal job. A run in progress is finished first; a fighter cools (`FLEET.cool`), then takes it.
- **Who takes it** (`orders.ts` `hurts`; reach: ships `LINK_HOLD` × the gold ring from your centre, rockets
  `rocketRange(T)` off your surface, the siege `RECALL`):

  | Weapon | Enemy ship / missile | Free rock | Rival's rock or over 25% | Fighting rival world |
  |---|---|---|---|---|
  | Fighters (home, off the siege ring) | every idle one, over any nearer or heavier enemy, no cap | ≤ 2% break; any size on course push | only on course (push) | the siege wing |
  | Probes | never (their normal pick, missiles first) | ≤ 0.5% | never | never |
  | Frigate | never | 2–25%, at its next reload, before the world | never | lances from its post |
  | Surface rockets | one a reload | 1–25% cut | chip (`ships.ts` `chip`: 0.25% of you a hit, two chunks, +40 K) | never |
  | Silo missiles | never | never | never | a salvo after the lance |

  The priority comes before hunting other enemy ships. The siege wing never leaves its ring for a priority ship (home fighters and rockets take it).
  A rocket cuts or chips by the body it was launched at, whatever stands as the priority when it lands. On a fighting
  world the sortie comes on from `RECALL` instead of `STRIKE` (Battles); several worlds: the priority, else the HUD
  target, else the nearest.
- **Honest notes** (user, 2026-11-15: "it says my ship isn't ready when I actually have one that's just on cooldown"):
  one small muted note over the target on the tap (`fx.note`), the best any weapon has, in this order: "Priority set"
  ("Rockets chip it" when rockets alone act and only chip), "Reloading · 2 s" (the soonest weapon, rounded up), "Ships
  busy" (all on other runs), "Not enough ore", "Shield down · fleet holds" (a world), "Out of range", "No fighters",
  "Nothing can hurt it"; "No life · fleet idle" while life is lost (it stands, nothing takes it); "Already beaten" (a
  fizzle, not taken); "Priority cleared"; before LIFE "No fleet yet" (`planet/moons.ts`). While it waits (no weapon ready
  or reloading) the note shows once more whenever the reason changes. Low energy shows as a longer reload.
- **It ends** (every frame): the target is gone or unloaded, or the world is beaten.
- **Seen:** four cyan arcs turning round it (1.6 of its radii, a ship 3 ship radii; dim and slow while it waits; a
  besieged world too: no siege ring, user 2026-11-15); the cursor glows cyan over anything a tap would take; toasts "Priority target"
  once, and once a calm tip the first time something on course is inside the ring.
- Stays automatic: point defence against enemy ships and missiles, the shield, orbiting
  moons.
- **Tried** 2026-11-15 (test tab, debug Life, ticked by hand): the farther of two raiders set as priority, the idle fighter
  took it; with both fighters cooling the note read "Reloading · 3 s"; the same raider again "Priority cleared"; a 1.2%
  rock broken by both fighters, its twin beside it never fired at; a 10% rock: fighters stayed, one rocket cut it; at
  25 R "Out of range" with a dim mark, moved to 7 R a rocket cut it; ore 0 on a 40% body "Not enough ore", then one
  rocket chipped 0.25%; a rocket at a 5% rock still cut it after the priority moved to a 40% body; of two rival worlds
  16 R out the clicked one was besieged; beaten: "Already beaten"; life lost: "No life · fleet idle"; before LIFE "No
  fleet yet". Not seen: probes on enemy missiles while a ship is the priority (no missiles came).

### Frigate [F]

- Slow heavy lasers (user, 2026-11-14): cap 0 below tier 3, 1 at tiers 3–4, 2 at tiers 5–6 (25 ore, 40 s each; the lance, `ARMS.lance`, and its siege role: Battles). Each flies its own circuit; every 10 s (× the energy fed) it takes your priority when that is a free rock 2–25% of you (`orders.ts`; it never picks one by itself), turns its nose onto the lead point and fires a salvo of 3 heavy laser bolts (`ARMS.lance.salvo`) 0.15 s apart, each aimed once, straight at 22 R/s on top of its velocity, 2.7 s life (30 R/s and 2 s before 2026-11-14: slowed to be seen, reach kept). The first bolt that hits breaks the body into up to 8 pieces by the same cut (Defence ships → Breaking into food). Toast "Frigate strike". No shots at rocks without a priority. Not tried in a test tab since the cut changed (no frigate before tier 3; the cut is shared with rockets, which were).
- Kept apart from `civ.ships` (its own cap and stepper), but a ship like any other to the enemy (`combat.ts` `ctx.mine`): hull 3 (`ARMS.lance.hull`), each round or slug takes a point (`ships.ts` `lose`), and at its last point it lances from the far side of you. Bolts are rounds in the shared pool (`guns.ts`). Measured (Node, with the earlier 20 R/s shells): against a 0.3 R body crossing 10 R out at 4 R/s it lined up in 1.48 s on average and every salvo hit (200 trials). At 22 R/s against rocks drifting under gravity (`guns.test.ts`): 900 of 900 bolts hit (as at 30 R/s).

### Rockets

- Your world launches rockets from its surface from tier 1 (user, 2026-11-14; `ships.ts` `rockets`, `ROCKET` in `rules.ts`): 2 ore each, reload 8 s × the energy fed (slow but heavy, 2026-11-15), only at your priority (orders.ts says when they take it) within `rocketRange(T)` = 8 + 2T radii off your surface. Guided (user, 2026-11-15; `guns.ts` `steer`, the missile pool): each leaves kicked 0.8 rad (46°) to one side of the aim line (less from nearer than 6 R, half a second of cruise), the side after the last one's (a random first side), at 0.3 × cruise and speeds up at 14 R/s² to 12 R/s on top of you (a round is 22 R/s: a rocket is seen coming; 26 R/s at 60 R/s² before 2026-11-15, user: "almost as fast as lasers"), closes its aim error on the lead point lazily, at nav 6 / the time to go (the missile's 4 would miss a rock pushed sideways at 4 R/s² by 0.25 R), at most 1.4 rad/s at cruise (a lateral-acceleration limit, 17 R/s² sideways): it arcs in, 0.04 / 0.32 / 0.75 R off the line at 3 / 6 / 10 R (scratch sim and browser alike), and lets go for good after 2.8 s, past 1.4 rad off the nose or within 0.1 s of the target (homing nearly all the way): a rock 9 R out pushed sideways at 4 R/s² is hit from either side, the same shot without a seeker missed by 0.21 R (`orders.test.ts`). Life: the range + 2 R at cruise + 0.5 s. Time to a still rock (scratch sim): 0.78 / 0.95 / 1.12 / 1.47 s at 8 / 10 / 12 / 16 R from your centre (a round: 0.36–0.73 s). Launch aim error `rocketSpread(T)` = 0.08·(6 − T)/5 rad. Measured 2026-11-15 (debug Life): a 7.9% rock 9 R out cut by the first rocket; a 40% body chipped 0.6% in 8 s and warmed ~50 K; a pirate raider ordered at died in 0.5 s (one fighter and a rocket on it). A new civilization starts with `START_ORE` 10 ore (five rockets) before its miners bring metal in. Measured 2026-11-14 on the debug Life jump: 4 rockets in 3 min, 2 bodies (1.1%, 1.7%) still got through and the 198 K one wiped life (the jump drops a living world into a neighbourhood that normal play clears while molten). A hit breaks the body into up to 8 pieces by the same cut as the frigate (toast "Rocket hit"). Drawn as amber teardrops with a flame (Look).

### Star contact

- When the people's need (people + shield upkeep) reaches ≥ 80% of the energy the world makes, or 300 s into the
  civilization, they make Star contact (toast "Your people need a sun") and Age III opens:
  [`stargameplay.md`](stargameplay.md) → Star contact. Debug "Star contact" does the same at once.

### What you see

- City lights: brightness by population (full at 5 bn), dimming and flickering under radiation; the civilization's people on the body, not in a panel.
- Solar farms (`view.ts` `solarFarms`, user 2026-11-15: "it should look as if it's on the surface; of course, it can't pass through the shield"; from tier 2, one field per wing, up to 6): panel fields at fixed spots on the ground (bearing, distance 0.46–0.68 R), Sprites (tech page `panel` cell) in a container that is a child of your world's view, so they turn with the surface and sit under its clouds, limb and shield. Each is 0.3 R wide along the surface (≥ 2.6 px) and 0.17 R·√(1 − d²) deep (foreshortened toward the limb, ≥ 1.5 px); farthest corner ≤ 0.78 R while the radius is ≥ 12 px (the pixel floors reach 0.93 R at 4 px: still inside the disc). Light per field from the star's bearing on the turning surface (eased over 1.5 s): on the day side it opens to full width, light blue (`0x6cc4ff` by (0.5 + 0.5·light)·open) with a flickering warm glint; on the night side, with no star or asleep it stows as a narrow dark strip (`0x1b2f52`, 0.45 wide). The plan's deep blue `0x5aa0f0` vanished on seas and under clouds (checked with magenta stand-ins: geometry right, colour lost). Fade 5 → 3 px of radius on screen. Measured at 1280×720: planet view radius 26.8 px (fields about 8 × 3–4 px open), star orbit 11.9–13.9 px (about 3–4 × 2 px: specks of blue, readable only as colour); 12 Sprites, normal blend, no quads in the ParticleContainer. Fields under cloud are hidden as the ground is.
- Shield veils, the hex-lattice dome and ripples, miner shuttles with ore pods, lights on moons with a base, defence ships and the frigate with engine plumes (their rounds: `combat.ts`), amber rockets with flames and the faint gold reach gauge (always while miners work). Your priority target: four turning cyan arcs round its body, a besieged world included (the faint cyan circle on the siege ring was removed, user 2026-11-15: "why does such a huge ring appear around my opponent?"; the fighters still fly the ring).
- +3 draw calls; 200 ships = 1 draw call (measured before the ladder went).

### Mass driver

- **Mass driver:** steel white (`STEEL`), a hair-thin very long streak and a shock ring on your surface, a low `boom`; slug 0.05% of you (5 ore) + 2 E charge, 50 own D/s + your velocity, aimed at the cursor, 4 s cooldown, swept. Shields absorb it, air burns it, else `collide` with WARHEAD 0.5: destroys a ship or a 0.3% body, chips a 1% moon, nothing to a 3% moon or a planet (checked 31.6k–796k).
- Code details (`rules.ts`): the 2 E charge fills from the energy the people and the shield do not need, at least 0.25 E/s; a slug flies 1.6 s (~80 of your diameters). On a shield a slug is ~12.6 K (computed, `rules.test.ts`).
- Fire is the mass driver alone (nothing before LIFE); from Dyson 20% the energy beam replaces the slug ([`stargameplay.md`](stargameplay.md) → Energy beam). Controls: [`hudandcontrols.md`](hudandcontrols.md) → Controls.

### Battles (planetary combat, 2026-11-14)

The user: fighters attack only ships, a beaten world's gravity is gone, and battles are ships milling about; wanted
gravity between the worlds, fighters that chip shields (low damage), frigates for real damage and rare, briefly guided missiles
from planets, roles, coordination, cinematic battles. The same rules on both sides (`rules.ts` `ARMS`, `weaponHit`).

| Unit | Role | Picks (`guns.ts` `pick`: distance × class weight, missile 0.5, frigate 0.7, fighter 1, probe/miner 1.5) |
|---|---|---|
| Probe (1 a tier) | point defence | missiles; your priority if ≤ 0.5%; enemy ships within 9 R; never strikes a world |
| Fighter, home (one) | screen | missiles; your priority (a ship: every idle one); enemy ships within 9 R of your world |
| Fighter, siege wing (all but one, ≤ 5: `siegeWing`) | ring the world, harass | enemy ships within 6 R of their world; a strafing turn at their shield every 4 s |
| Frigate | heavy battery | your priority rock first (2–25%); then the enemy world from its post on the siege ring |
| Missile silo | salvo weapon | the enemy world, 1 s after its frigate's lance salvo |
| World | shield, range, bearing | your thrust, driver, beam, priority; a rival's engines |

| Weapon | Speed (shooter's radii/s) | Life / range | On a shield | Through an open shield | Counter |
|---|---|---|---|---|---|
| Fighter round | 30 | 0.5 s / 15 R | 0.2 K, 2 bursts of 8 at 16/s, 1.5 s cool (probe 0.15 K, 3 at 4/s, 5 s cool) | burns 0.2 u of stock, ≤ 20 u a raid, never people | bodies stop it; ships jink |
| Lance bolt (frigate) | 30 | 2 s / 60 R | 7.5 K, 3 a salvo, 10 s reload, 1.5 s nose glow | wound | block the line (any body); kill the frigate (hull 3; rival 2) |
| Missile (silo) | 11, guided, kicked ±0.9 rad | 3 s / ~28 R | 20 K (one landing), salvo 1/2/3 (rivals: level + temper, `SALVO_LEAD`, ≤ 4), 20 s reload, 4 ore each | wound; kills enemy ships within 0.6 R | burn across its path a moment after the launch (it leaves to alternating sides, arcs in and homes the whole flight at 9.9 R/s² sideways: about half land whatever the range; burning straight away from the flash outruns a salvo, a late burn or coasting does not); one round, slug or beam; any body stops it |
| Slug | 50 D/s | 1.6 s | ~12.6 K | air burns it | dodge |

- **Wound and landings:** heavy fire through an open shield fills a wound; every 20 K (`LANDING` = `HIT_MIN`) lands as
  one hit: people × 0.8, a surface flash, a dust puff, the city lights flicker. One raid (a war wave) kills at
  most `RIVAL_HIT_MAX` = 45% of your people, then the wave turns home. No weapon fire sets life back or heats a crust.
  8 landings (160 K) take a world from 1 to 0.17 (the plan said 144 K = 7.2 landings; landings are whole, so it is 8).
- **Your fleet engages by range** (`stage.ts` `engage`, `rules.ts` `sortieStep`): probes and one fighter always screen;
  once a rival world's surface is within `STRIKE` = 14 of your radii of yours, or within `RECALL` = 18 of your priority
  (a Command tap on it: the user's 2026-11-14 decision keeps both), your fleet engages it. Recalled past
  `RECALL`, on another target, when the priority that alone brought it on is cleared outside `STRIKE`, or with your shield down (then `CALM_S` = 20 s before it engages again); never for losses (the old recall at half the
  strike wing lost ended the whole sortie at the first loss with a wing of one: measured, see below). Distance is the
  throttle: no menu. Rival waves: [aliencivilizations.md](aliencivilizations.md) → War waves.
- **The siege** (2026-11-14; user: "surround an enemy planet, invade its orbit, engage defences, break shields";
  `rules.ts` `SIEGE`, `ships.ts` `defend`, `nav.ts` `ringStep` / `siegePost`): the wing, recounted every frame, is every
  fighter but one, at most 5 (`siegeWing`: 1 → 0, 2 → 1, 6 → 5), paired among itself. Its leaders fly a ring 3–3.8 of
  your radii past the enemy world's surface (aimed at the middle, 3.4; never nearer than 2.5 R to your centre), counter-
  clockwise in the enemy's frame, spread evenly round it and turning at patrol pace; wingmen follow. Idle ring ships take
  enemy ships within 6 R of the enemy world (missiles first). Every 4 s (`SIEGE.pass`) one free leader takes the strafing
  turn: it swings 3 R further out (`SIEGE.out`), then makes the usual run in with its wingman, breaks, cools 1.5 s and
  rejoins the ring. Straight from the ring a run never fired (Node: the nose was still coming round when the run broke off
  2.4 R out; 0 rounds); from 3 R further out, one 6-round burst a ship (6.4 R out; measured in Node, the run stepper alone).
  The frigate lances from its post on the ring, on the bearing from the enemy to you (two frigates ±0.5 rad), shifting
  round the ring while a body blocks the line; at its last hull point it falls back to 5 R off you on the far side. The
  silo fires `salvo(T)` missiles (tiers 1/3/5: 1/2/3) 1 s after each lance salvo while ore ≥ `RESERVE` = 20 u (kept for
  slugs), and no longer stops when a fighter dies. Seen: the fighters circling and the enemy's shield rings (no siege circle drawn since 2026-11-15).
  Checked in Node (`nav.test.ts`): from your world to a 0.89 R world 10 R off drifting 0.5 R/s, the ring band reached in
  2.4 s, held for the next 20 s, never nearer than 3.27 R to its surface, 1.6 turns in 30 s, the same at 30/60/120 fps.
  Not yet tried in a test tab (the measured failure it answers: debug Life jump, tier 1, 2 fighters + 1 probe, an L2 rival
  10 R off: the sortie started with a wing of 1, was recalled at the first loss 2.8 s in, all three ships died by 7.8 s,
  ship-frames on runs at the world 90 against 1043 at enemy ships).
- **Sustained K/s on a shield** (computed): fighter 0.48 (16 rounds × 0.2 K × 75% a 5 s run), frigate 2.03 (4.2
  fighters), three fighters 1.44 (less than one frigate), missiles salvo × 20 K per 20 s, your driver 3.1 (2026-11-15: each
  class its own feel; before, fighter 0.42, missiles 12 K per 12 s, lance 6 K per 8 s). The siege wing
  strafes in turns, one pair every 4 s: one burst a ship as measured (12 rounds a turn) is 0.68 K/s, under the
  three-fighter 1.25 the table below assumes; if both ships ever fired both bursts (24 rounds) it would be 1.35 K/s, a
  little over it (structural). Ring ships hunting enemy ships add nothing on the shield.
- **Time to break an equal shield** L1 / L2 / L3 (s), planned (the mean-rate model) | measured (`rules.test.ts`: real
  `shieldShot` and `shieldRegen` with the stun, volley by volley, averaged over 20 start phases):

  | Fire | Planned | Measured |
  |---|---|---|
  | 2 strike fighters | 31 / 62 / 94 | 34 / 65 / 95 |
  | 3 fighters | 21 / 42 / 62 | 24 / 44 / 65 |
  | frigate alone | 16 / 37 / 63 | 15 / 35 / 55 |
  | frigate + 2 fighters | 10 / 20 / 30 | 13 / 23 / 33 |
  | missiles, all land (salvo = level) | 40 / 40 / 40 | 30 / 30 / 30 |
  | missiles, half land (a dodging world 8–12 R off) | 122 | 110 |
  | your driver | 10 / 19 / 29 | 10 / 18 / 30 |

  Volleys land whole, so the measured time can be up to one firing cycle off the mean (frigate L1, missiles).
- **Ground phase** (computed): from an open shield, 8 landings: a frigate alone ~79 s of fire, frigate + missiles
  (salvo 2, half land) ~53 s; fighters alone never. A lone frigate cannot keep a shield down (its 10 s reload is longer than
  the stun: the shield creeps back), fighters can: their light fire keeps a shield from mending.
- **Missiles** (2026-11-15, homing: `guns.ts` `steer`; `ARMS.missile`; slower and kicked wide the same day, user: "they should
  travel at a slightly wider angle and move more slowly … the opponent shouldn't be able to dodge every single rocket"; a
  visible arc and dangerous rival missiles later that day): each leaves the pad kicked 0.9 rad (52°) off the aim line (less
  from nearer than 5.5 R, half a second of cruise: half the kick from 2.75 R), sides alternating within a salvo (`guns.ts`
  launch: a random first side when the pool is empty), at 0.22 × cruise, 8 R/s² to 11 R/s (boost visible ~1 s; 8 R/s at
  10 R/s² before, 14 R/s at 30 R/s² first). While locked the seeker closes its aim error lazily, at nav 4 / the time to go
  (by the closing speed, never under its own speed), at most 0.9 rad/s at cruise (`turn × u / speed`: 9.9 R/s² sideways;
  before, it turned at the full rate at once, ~3× the cruise rate at boost speed, and undid the kick in ~0.25 s), so a
  salvo visibly arcs in from both sides: peak swing off the line to a still world 0.81 / 1.08 / 1.36 / 1.91 / 2.46 R from
  8 / 10 / 12 / 16 / 20 R (scratch sim). Seeker on 3 s (the whole flight), off for good 0.15 s from the target, cone 1.4 rad,
  3 s life (~28 R). A still target is never missed (both sides, 1.5–20 R, 30 and 60 fps). Flight to a still world
  (scratch sim): 1.08 / 1.28 / 1.47 / 1.67 / 1.85 s from 8 / 10 / 12 / 14 / 16 R centre to centre. Computed (`guns.test.ts`,
  a world of radius R crossing at 1 R/s, both kick sides): from 16 R a steady target is hit (the seeker lets go 0.13 s out),
  so are one turning back 0.2 s after launch and a launch 0.08 rad off; a held 7.5 R/s² burn from 0.8 s is caught from
  8 R; from 0.3 s at 10 R, whichever way it burns, one kick side hits and the other misses (by 1.3–2.1 R); random
  sidesteps land 88% (54% before).
  A rival world dodges as you do (2026-11-15, `ledger.ts` `DODGE`, `evade`): it sees the launch, reacts after 0–0.4 s,
  builds its own thrust (`thrustOf`, as yours at its size) over 0.3 s across the missile's line of sight, the way it
  already crosses it (never flipping), up to 5 R/s while a missile is still closing, then brakes 1.2 s back onto its
  station. Computed (`ledger.test.ts`, salvos of 1–3 from your surface, at 7 R/s²): 58 / 50 / 52 / 72% land from
  8 / 12 / 16 / 20 R, 52% over keep 8–12 R (burn 5 R/s²: 64%, 14 R/s²: 50%), 100% on its 0.6 R/s² cruise engines alone,
  every salvo of 2–3 lands at least one. By salvo (scratch sim, same harness): salvo 1: 60 / 52 / 50 / 50%, salvo 2:
  61 / 50 / 50 / 72%, salvo 3: 60 / 50 / 49 / 83% from 8 / 12 / 16 / 20 R; a salvo of 2 or 3 lands ≥ 1 every time. Your
  thrust is 7.3 R/s² at 10⁵, 9.2 at 3·10⁴, 4.9 at 10⁶ (stony, `thrustOf`).
  A rival's silo flies in your radii (2026-11-15, `rivals.ts` silo; before, speed and seeker scaled by its own radius, so a
  0.69-radius rival's missiles came at 5.5 of your R/s and a burn escaped them all): its size no longer matters. Its salvo
  of 2–3 at you (scratch sim, real `createMissiles`, 8–12 R, your 7.3 R/s²; landed / salvos landing one): holding still
  100 / 100%; burning across from the flash 30 / 61%, from 0.3 s after 50 / 100%; diagonally away from 0.3 s 38 / 49%;
  straight away from the flash 0%, from 0.3 s 14%; full thrust any way from 0.2–1 s 81 / 91%; reacting ~1 s late or
  coasting 1–4 R/s, all land. At 4.9 R/s² (10⁶) across from the flash lands 50 / 100%, straight away 26%. Browser (debug
  Life, 15 missiles a style launched as rivals.ts does, 9–12 R, your 7.4 R/s² by real keys): held still 15 of 15; across
  at the flash 6 (4 of 6 salvos landed one); across 0.3 s after 8 (6 of 6); diagonally away 0.3 s after 4; straight away
  at the flash 0; across ~1 s late 15; coasting 3 R/s 15; at 30 fps held still and coasting 10 of 10 each. To rounds a
  missile is a smaller target than a ship (`ARMS.missile.size` 0.12 × a ship's hit radius): one home fighter firing
  bursts every 0.6 s stops 41% of inbound missiles from 7–11 R (`guns.test.ts`, 400 tries; 60% at 0.18 with one burst
  before). One pool of 12 (`ARMS.missile.max`) holds missiles and rockets. Browser (debug Life, your silo of 2 at a
  0.66-radius L1 rival dodging 8–17 R off, 10 salvos): 9 of 20 landed, none shot down, 9 of 10 salvos landed one; at a
  still rival the salvo split to both sides, peak swing 0.9–1.05 / 1.7–1.8 / 2.2–2.45 R from 10 / 14 / 18 R (~27 px a
  radius at the start zoom).
- **Look:** the lance's nose glow growing 1.5 s (never under 14 px) and a long glowing bolt with a halo; missiles (kicked off the pad to alternating sides, then arcing in) a teardrop head and a long flickering flame that drops to a dim stub once the seeker lets go (0.15 s out, shaken off, or burnt out), a
  surface glow at the launch point first (never under 16 px), a wide flash, tinted light and sparks where they burst (all weapon visuals: [shipsandflight.md](shipsandflight.md) → Guns); a landing flashes, puffs dust and flickers the
  lights; a collapsing shield bursts its veil; a rival's engine plume.

### Cost

- Combat (mass driver, rival worlds, pirates), measured: draw calls 14.9 → 15.7, frame CPU 0.59 → 0.99 ms. `civ.update`
  with roaming miners 0.10 ms median (measured).
- Budgets and the tech page bake: [`techandperformance.md`](techandperformance.md).

### Fun-first deviations

- Faster growth; hits kill people instead of setting life back. The earlier "no shield upkeep" deviation is gone: Q7,
  built in [F].

### Concept coverage

| Concept item | Status | Evidence |
|---|---|---|
| 1 Shield + two fighters at life | Built | `stage.ts`; `START_SHIPS = 2` (`rules.ts`) |
| 1 Fighters break up large bodies, less entry heat, easier collection | Built [F] | your priority target (`order`, `orders.ts` `status`), cut into pieces that burn up in your air (`split`, `cut`, unsafe ones `deflect`ed); fighters ≤ 2%, probes ≤ 0.5%, the frigate and rockets 2–25% / 1–25%; heavier ones pushed |
| 2 Miners work moons once held | Built | mining loop in `stage.ts`; `MINE_RATE` |
| 2 Miners also work accretion disks / nearby bodies | Built [G] | debris clusters (`clusters()`) and free bodies inside the reach |
| 2 Frigate with missiles | Built [F] as heavy laser salvos (up to 2 frigates, 2026-11-14) that also lance enemy worlds; surface rockets from tier 1; a missile silo against worlds (Battles) | `frigateStep`, `rockets` in `ships.ts`; `createMissiles` in `flight.ts` |
| 2 Ship counts limited by metal | Built [F], [G] | `fleetCap(class, tier, metal)` (fighters from metal, probes and frigates from tier), `minerCap(metal)` |
| 2 Collection prioritized by need | Built [G] | `lack()` for what lands; need weights in the site score |
| 6 Shields break under collisions | Built | `shieldMeet` (a shell at `shellR`), floor −15%, `breakShield` |
| 6 Shields consume energy | Built [F] | `upkeep`, `shieldFed` (Q7) |
| 6 Losing habitability must hurt | Built [F] | asleep: people −1/min, no mining or building, shield out |
| 9 Miners travel to nearby sources; link; outer ring | Built [G] | roaming shuttles, reach circle |
| 9 Auto-priority by distance, need, density, efficiency, danger | Built [E], [G] | `scores`, `assign` in `mining.ts` |
| 9 Defeated civilizations give higher efficiency | Built [J], [G] | open rival worlds are sites at efficiency 2.5 |

## Planned

What is left of the concept here is small:

- **[G] Star danger:** the site score allows danger from a star's harmful zone (`mining.ts`), but `stage.ts` sets danger
  from enemy ships only.

## Open issues

- **[F] Natural infall wipes a parked world** (measured 2026-11-14, not fixed, user to decide): with `worldHeat` a parked Age II world takes a moon-sized infall about every 1.5 min (2.5% → +363 K, 1.8% → +224 K, 4.3% → +819 K), all far past the old shield's 34.5–103.5 K range. Since the shell (Shield above, computed): a full L1 holds slow infall up to 2.9% of you and stops 67% of a 4.3% body; L3 holds up to 8.6%; a slow 5% body still lands through L1 at ~284 K. Before it, the first big hit wiped life, the civilization sleeps and stops defending. Since 2026-11-14 your ships shoot such a body only once you make it your priority. Also in [`vision.md`](vision.md) → Open issues.
- **[F] One-hit civilization wipes** (playtest, before `worldHeat`; worse now, see above): one rock right after the shield fell killed 88% of the people; rival
  volleys took the shield 90 → 0 K in ~13 s (~25 K steps every 4 s). A hit that gets through may take up to 90%.
- **[F] Rock-breaking is rarely seen** (playtest): fighter and frigate breaking never appeared in ~10 min; the fleet cap
  stayed 2 and the rocks that hit were 4–20% of you, above the fighters' 2%. Written before the fleet change (frigate from tier 3, rockets from tier 1, probes): not re-played.
- **[F] Each shield level costs ~1 bn people** on inner heat alone (level 3: cap 5 → 2 bn).
- **[F] Broken big rocks still feed you only partly** (measured 2026-11-14 at 0.26 atm): the piece cap (6 / 8 a hit) leaves pieces above the burn-up share for bodies over ~1% in thin air; they land partly and bounce off harmlessly (a 5% rock: 27% of it reached you). Harmless pieces are not shot again. More pieces a hit would cost field bodies (budget ≤ ~400).
- **[G]** The launch timer makes shuttles clumpy; a level-1 open world takes ~26 min to empty at tier 1 (before the mix change, not re-measured).
- [D] The 80%-need contact path is not playtested; in the one test contact came by the 300 s rule.
- Planetary combat (Battles) is checked in Node only: not played in the browser yet; frame cost not measured.

## Decisions

Standing decisions for every stage are in [`README.md`](README.md). The ones that shape the civilization:

- **Watch and feed** (user): no build menu, no priority toggle; levers are physical (what you eat, which moons you catch).
- **Pirates never destroy a world or kill you** (user).
- **Fun-first deviations** (user rule "fun first, then realism"): faster growth, no shield upkeep, hits kill people instead of setting life back. (No shield upkeep was replaced by Q7 below.)
- **No tech ladder** (user, 2026-11-13): Radio, First launches, Moon landing and Interplanetary ships were only decoration; Industry comes with LIFE; the mass driver is there from the start; a level-1 shield and 2 defence ships at LIFE.
- **Miners on every moon** (user, 2026-11-13): they use it up, work faster with the tier, and bring what the world lacks.
- **Miner shuttles make round trips** (user, 2026-11-13: back and forth, not a stream): out, dig, home loaded, land in a puff.
- **Moon gifts and passive moon effects removed** (2026-11-13, with the miners redesign); the Collector role went later with Q6.

### Decided 2026-11-13 (open decisions Q1–Q7)

- **Q5, which metal limits ships** (2026-11-13: user had no preference, so the default stands): the metal your miners bring in sets the fighter cap, so metal-rich moons mean a bigger fleet. Built [F], [G]: fighters (/20) and miners `minerCap` (/15) read the same mined-metal total; since 2026-11-14 probes and frigates are capped by tier.
- **Q7, shield upkeep** (user, 2026-11-13): cheap upkeep, 0.1 E/s per shield level; only a starving world loses regeneration and strength. Replaces the fun-first "no upkeep" rule. Built [F].
- **Pirate harm** (user, 2026-11-13): capped. With your shield down and stock empty, hits knock a little water / air off as catchable pieces (≤ ~2% a raid). Pirates still never destroy a world or kill you.

### Decided 2026-11-14

- **Mining mix, tier radiation, fleet and rockets** (user): miners take radioactive 0.5 / metal 0.3 / water 0.2 (gas only while the air is thin), never rock; the safe radioactive share rises with the tier (3% to 20%); hot industry (overdrive, replaced 2026-11-15 by the fuel stock and the energy fed); probes, fighters and frigates each their own cap; rockets from tier 1; shields cost 10·L ore + 10 volatiles. A beaten rival world is consumed by the miners. All built.
- **Breaking into food** (user): ships break only what you cannot take safely, into pieces your air can take, then stop; capped bursts and cooldowns (Defence ships). Built.
- **Small ships stay small** (user: "no probes, and small fighters can't do much damage on planets etc"): probes keep breaking only ≤ 0.5% (they mostly push now: with air, bodies that small are rarely a target), fighters ≤ 2%; your probes and fighters make no runs at a planet (a held world). Built. Battles keep it: only the siege wing strafes an enemy world (one pair a turn), and its rounds only chip the shield and burn stock, never people.
- **Planetary combat** (user, the combat plan with its defaults): touching a beaten world melts you (giant impact); the
  shield returns above 0; the silo spends ore by itself, leaving 20 u for slugs; your fleet attacks by range (14 R in, 18 R
  out); no rival frigate at L1; live rivals orbit you; the anti-world weapon is the missile, the rocket stays the rock
  breaker; pirate rounds drain the shield before they steal; fighter rounds burn 0.2 u of stock on an open world, 20 u a
  raid; two rival worlds keep apart. Built.
- **Combat redesign** (user, 2026-11-14, with the answers to the plan's questions): no automatic rock fire, attacks by
  order (a single right-click / E tap / touch long press; the same body again cancels; on a rival world the siege, which
  also still starts by itself within 14 R); rockets only at the order, unguided; the Sling removed completely (Fire = mass
  driver / beam only) and `Body.foe` with it; a right-click hold on a free body does nothing (moons are caught by matching speed:
  [planetgameplay.md](planetgameplay.md) → Moons); the shield ignores bodies that would land under 20 K. Early danger: rivals' level
  and mass by temper (Rival civilizations in aliencivilizations.md), more hunter cores. Built; not yet tried in a test tab.

### Decided 2026-11-15

- **Slow burn and solar wings** (user): "keep green rocks, rad same, slow consume, hard to find, but when its empty u can use sun and solar collectors too, (top op the planet, big solar panels like". Fuel lasts 3.3× longer (`FUEL_E` 12 → 40); green rocks, their shares and the dose are unchanged; the solar wings (Energy and dose) keep an empty-fuel world going near a star.
- **Solar farms on the ground** (user): "It should look as if it's on the surface; of course, it can't pass through the shield." The limb masts went; panel fields lie on the ground and turn with it, opening light blue on the day side (What you see). Built.
- **Home mines** (user): "Currently, we have to mine other objects to get ore. But even when there's nothing to mine, civilizations should slowly extract and use their own planet's natural resources." Your people dig metal and water out of their own world, slowly (Stocks). Built.
- **"Rad", never "Radiation"** (user): "do not say radiation btw, rad is enough". Player-visible text says Rad (the card's Rad cell, "Rad sickness", "rad rock", "High rad"); the body-type name Radioactive stays.
- **Each class its own feel** (user): fighters fire fast and light (16/s, 1.5 s cool), probes slow and weak (4/s, 5 s cool), the frigate (7.5 K × 3 per 10 s), missiles (20 K per 20 s) and rockets (8 s) slow but heavy.
- **Rivals by temper** (user: "rivals can beat me, some don't"): only a Careful rival turtles; a Hungry or Raider one keeps attacking, and their silo loads while the wave masses, firing `rivalSalvo(L, SALVO_LEAD)` (Careful +0, Hungry +2, Raider +1). Measured duel table in [aliencivilizations.md](aliencivilizations.md).
- **No rival throw** (user): rivals never launch their rock moon; it only circles their world as a passive guard. Your ships no longer fire at any rock by themselves.
- **Priority target** (user): a Command tap sets one priority (the same tap clears it), not an immediate attack; each weapon
  takes it first as it comes ready and can hurt and reach it; fighters focus a priority ship over any other enemy; notes
  say honestly why it waits ("Reloading · 2 s", never "no ships" while ships only cool). Built (Priority target).
- **Missile chases** (user: "Rockets should have some homing capability … close-range shots are harder to dodge, while
  long-range shots give enemies more time to evade"): missiles and rockets home nearly all the way but turn only so hard
  (`turn` a lateral-acceleration limit); a rival world builds its thrust over 0.3 s, never in one frame. Built (Missiles).
- **Rockets that feel like rockets** (user, 2026-11-15: "almost as fast as lasers … the opponent seems to dodge nearly
  100%"): missiles 11 R/s and rockets 12 R/s (a round 22), each kicked off the aim line to alternating sides and arcing in lazily, so a dodge
  slips some but not all (about half land at every range). Built (Missiles, Rockets).
