# Asteroid gameplay (Age I)

Age I: you start as a 69.5-mass speck of dust and eat, dodge and ram your way to a Planetoid. Code: `evolution/asteroid/`
(`rules.ts`, `body.ts`, `player.ts`, `sphere.ts`, `atlas.ts`, `wells.ts`, `feedback.ts`) and `core/` (`entity.ts`,
`camera.ts`, `input.ts`, `water.ts`). The field: [worldgen.md](worldgen.md); the HUD: [hudandcontrols.md](hudandcontrols.md);
labels: [README.md](README.md). Units: START_R 16 world units is the yardstick; speeds are in own diameters per second (D/s).

## Built

### Tiers

- **Age I tiers** (`rules.ts` TIERS, √10× apart): Cosmic dust, Pebble 10^0.5, Meteoroid 10, Small 10^1.5, Medium 100, Large 10^2.5, Giant asteroid 1000, Planetoid 10^3.5.
- **Goal:** AGE_GOAL 10^3.5 = 3,162 (start 69.5); target length 80–120 s. Higher tiers and the gas line: [planetgameplay.md](planetgameplay.md) → World tiers.
- **Tier-up:** a 3 s harvest (your pull on bodies ≤ 0.3× you × 5; Age I only).

### Handover, deaths and respawn

- **Handover** (`main.ts`): melt-through (metal sinks, the sphere smooths), flash, dust ring, boom, shake, 0.8 s slow motion, toast "Age I complete" with your path (iron / ocean / gas / rocky world). Then Age II.
- **Deaths:** eaten, destroyed (d ≥ 5), crumbled (below a Pebble), fell into a star.
- **Respawn** after Age I: "Continue as a planetoid" (Enter / Space / C) or "New run" (R): a molten body of AGE_GOAL × 1.01 with your composition, in the same field, 1–2 views from anything heavier; life and stars start over. Before Age I the card offers only "Play again". Each run has its own field seed.

### Bodies and collisions

Code: `rules.ts`, `body.ts`.

| Element | Density | Durability D | Hardness H |
|---|---|---|---|
| metal | 7.8 | 2.0 | 0.8 |
| rock | 3.0 | 1.0 | 0.5 |
| ice | 0.9 | 0.4 | 0.2 |
| gas | 0.2 | 0.1 | 0 |
| radio | 9.0 | 1.2 | 0.6 |

- Mixes in `COMP`; start dust is rock 80, metal 10, ice 8, gas 2%. Durability is the weighted geometric mean of the phases × (1 − 0.3·looseness); hardness −0.2 molten, −0.4 molten metal.
- **Size cap** (user, 2026-11-14: "there is things bigger than a star"): `radiusOf` folds in 1/r³ = 1/r_loose³ + 1/500³, so nothing passes `R_CAP` 500 u (the smallest star is 766 u); small bodies are untouched. Computed (`rules.test.ts`, 2026-11-16): a habitable world of 1e5 / 1e6 / 1e7 is 185 / 352 / 472 u.
- **Damage:** q = ½v²·share²·(0.5 + H_other)/(0.5 + H_self), v in the body's own D/s; d = q / (40·D·m^0.2). No loss below d 0.1, up to 50% by d 1; from d 1 the body keeps 0.5/d; d ≥ 5 destroys it. Each side takes damage in its own diameters, so a crumb hitting a planet splashes.
- **Pieces:** ice and gas boil off; 10% of the solid loss (+15% × metal) stays as pieces, the rest is dust. A chip sprays 2–8 pieces (2 + 6 × the lost share); a destroyed body bursts into ≤ 6. Pieces are unequal (`pieceShares`, largest 5.7× the smallest; user, 2026-11-14). Broken differentiated bodies throw metal-rich debris. No cracks: a hit only chips mass.
- At 795k (`rules.test.ts`, 2026-11-16): a 2.2% body splashes at 6.1 D/s, 10% at 12.6; against a peer you chip at 36.3, shatter at 66.3, die at 148.2 D/s.

**Regimes** (`collide`; T heavier, P lighter, V impact speed, v_m = V_STICK 8 in T's D/s, ×1.5 if molten, b_crit = R_T/(R_T+R_P)):

| Regime | Condition | Result | Well |
|---|---|---|---|
| Merge | V < v_m | T keeps all of P | green |
| Eaten | other ≥ 1.15× you, V < v_m | game over; below 1.15× you are T and eat it (Age I; Age II: Differences from the design doc) | red |
| Graze | sliding/V > b_crit, V ≥ v_m | hit-and-run, nothing changes hands | orange |
| Partial accretion | V < 3·v_m, T not shattered | T keeps ξ = (3v_m − V)/(2v_m) of P's rest; never you as P | yellow |
| Bounce / erosion | otherwise | both chip; either can shatter or die | orange; pink you break; red you die |

- Your sliding speed counts 40% (GRAZE). Rock–rock pairs count full sliding, stick below half their mutual escape speed and get no game pull, so belts don't clump. They rub (user, 2026-11-17): Coulomb friction (`MU` 0.6, dry rock on rock) plus surface relief (`ROUGH` 0.25 of the sliding speed per contact length, below escape speed only) slow a skim until it sticks; friction also sets both spinning (angular momentum kept). Measured (test/asteroid/body.test.ts): a skim at 0.55–0.65 of escape merges in 0.3–1.6 s, the same within 10% at 30/60/144 Hz; from about orbital speed the rock lifts off onto an orbit and comes back. Near-equal masses: the tougher body is T and keeps the other (`rank` = m·(durability·(0.5 + hardness))^0.1: metallic leads stony down to 0.96 of its mass; never a body under 1/1.4 of the other); exact ties by chance. Rub sparks scale with the energy the contact lost (no flash every frame).
- Restitution: solid 0.5, rubble to 0.15, molten ~0. MAX_SPIN 1 rad/s. Every loaded rock is swept against you (`contactTime`): no tunnelling.
- **Shared mass helpers** (`body.ts`, every stage): `absorb` adds dust mass, `shed` shrinks a body, `drop` removes it (m = 0, never ticked again). `shatter` keeps `BURST_KEEP` 0.4 of a body as up to 6 fragments on a ring wide enough that none touch at birth (`burstRing`). Fighters, probes, the frigate and rockets use it ([civilizationgameplay.md](civilizationgameplay.md) → Defence ships). `field.spawn(…, from)` takes the body a piece broke off.

### Heat

Code: `rules.ts`, `core/water.ts`.

- **Impact heat** (`impactHeat`): Δheat = 1.5·e + 2·s²·√(r/16), e = s·(v/v_m)², s = the other's mass share. Slow meals barely heat; the infall term lets giant mergers melt a world.
- **Rock pairs heat by the energy lost** (`rub`, `workHeat`, 2026-11-17): a graze or bounce heats both by the relative kinetic energy restitution and friction took out, split by softness (the softer deforms more), over each body's heat capacity; the infall term only on merges, where the meal's own impact heat mixes in too. Calibrated so an equal pair's head-on bounce heats like the kinetic term above: two 1000 u stony rocks at 16 diameters/s bounce at +3.2 heat each (measured, every tick rate). A rubbing equal pair merges at about +0.8.
- **Swallowing** (`mergeHeat`, user 2026-11-14): energy is kept. Each side brings heat capacity × mass × heat (rock 1, metal 0.56, ice 2.6, gas 1.3, heavy elements 0.16) and the hit's heat is added once, so a cold meal cools you. Computed (2026-11-16): a 1% ice meal at 120 K takes a 550 K body to 543 K.
- 1 heat unit = 430 K above 120 K: > 1 heated, > 3 molten (stick ×1.5), > 5 molten metal, > 8 vaporizing; clamped at MAX_HEAT 10 (4420 K). Cooling COOL 0.08/s at the start radius, ∝ 1/r.
- **Radioactive matter neither decays nor heats** (user, 2026-11-14): it is a civilization's fuel ([civilizationgameplay.md](civilizationgameplay.md) → Energy and dose). Before that, a little helps life ([planetgameplay.md](planetgameplay.md) → Life). Green rocks are 25% radioactive.
- `Body.diff` (sunk metal) grows only while molten; it feeds the magnetic field and the crust look. Water and climate: [planetgameplay.md](planetgameplay.md).

### Gravity

- G = 0.12 in player units, as in the design doc.
- **Game pull** on pairs with you: `pullMass` = 2·m·min(10, (m/you)^0.5). At contact a 10× body pulls ~20% of your thrust, 40× ~85% (computed). One factor per pair (`pairPull`): momentum is kept and the heavier body always moves less.
- **Your pull** grows with size (`youPull` × (r/16)^0.5), since pull in your own radii depends only on density.
- Sources: the 24 heaviest loaded bodies plus you; reach ends below 0.3 u/s². Rock on rock is plain physics.

### Flight and camera

Code: `player.ts`, `core/entity.ts`, `core/camera.ts`, `core/input.ts`.

- **Thrust** 500 u/s² × (r/16)^0.4 × (dust density / yours)^0.3. Drag 0, braking at full thrust (exact drag-0 integration: `entity.test.ts`). Rivals keep drag 0.1.
- **Top speed** = TOP 1.2 × `critSpeed` (the speed at which a head-on hit on a peer destroys you); forward thrust fades as (v/top)². Computed (2026-11-16), critical speed and time from rest: start 60 D/s in 5 s, 31,600 stony 119 in 36 s, 1e6 stony 168 in 102 s. Eating needs < 8 D/s; speed is for travel and ramming.
- **Game area = your natural view** (`main.ts`): the field loads and spawns around `min(camera zoom, natural zoom)`, so a wheel zoom-in only changes what you see.
- **Camera:** view ∝ size^0.8; speed zoom ≤ 1.6× between 8 and 60 D/s; lead ≤ 0.45 half-view; non-stacking shake; ≤ 1.6× pull-back near a star, 2.5× in a star orbit ([stargameplay.md](stargameplay.md)).
- Input: WASD / arrows, touch joystick (deadzone 0.12). Fire and Command: [hudandcontrols.md](hudandcontrols.md) → Controls.

### Shapes and looks

Code: `rules.ts`, `body.ts`, `sphere.ts`, `atlas.ts`. Bake costs: [techandperformance.md](techandperformance.md).

- **Atlas:** 128 rocks baked at startup, 256 px each. Materials (user): earthy rock 50%, silver metal 20%, clear and dirty ice 20%, gassy 10%. The shape follows the material: metal angular chunks, ice long shards, gas soft misty blobs, rock potatoes and rubble. Metal gets a cold-white sheen behind it (`METAL_GLOW`) so it reads at a few pixels.
- **Piles:** meals glue on where they touched; tints drift to the composition colour.
- **Round-off:** `roundR` = 75 − 25·ice units. A body bakes as one sphere only from `ROUND_M` 10^3.5 and past half its round-off radius, or with a molten past (`bakes`; user, 2026-11-15: every asteroid tier stays an irregular rock). Until fully round it is a "potato".

#### Rough bodies

`Body.rough`, `keepShape` (user, 2026-11-14: captured comets turned into plain spheres). Comets, fragments under 10^3.5
mass, loot pieces and whatever you capture as a rock pile keep their own rocks until molten. A captured comet keeps its
coma and tail. A small fragment is an atlas rock of its main solid element, half tinted like its parent.

#### Debris

User, 2026-11-15: "a freshly shattered planet shouldn't immediately split into spheres". A piece ≥ 10^3.5 mass
(`Body.jag`) bakes at once with its parent's crust and 4–6 flat break faces. It rounds in `JAG_S` 90 s at its round-off
radius, 45 s at 2×, 30 s from 3× (`debris.test.ts`, 2026-11-16), 5 s while molten, drawn in 4 steps. The target panel
calls it a "fragment".

#### Spheres

Your pile rounds over 2.5 s. History shows: craters 16 (pristine) to 4 (resurfaced), lava plains if once molten, cracked
ice, metal sinking out of the crust as it differentiates. Re-bake on 6% mass change, ≤ 1 bake a frame (`spheres.begin()`
in `main.ts`). Your heat is a deep-red glow behind the body, never on top. Your Age II surface:
[planetgameplay.md](planetgameplay.md) → Your surface.

### Age I play

Code: `player.ts`, `wells.ts`, `feedback.ts`.

- **Sensing:** nearest rock within 5 radii, anything on course within 3 s, heavier bodies within 12 radii; up to 5 wells. The HUD target is the heaviest body on screen within ±30° of your heading (`AIM_CONE`), else the heaviest on screen.
- **Wells:** glow, two counter-rotating haze veils, faint sinking waves; size, speed and brightness by verdict.
- **Comet form:** ice ≥ 50% (out below 40%). Ice boils at 1.2%/s × (0.2 cold and coasting + heat/2 up to 2 + 0.6 while thrusting): 0.24%/s dormant to 3.4%/s hot and thrusting. Boiling eats heat; jets push up to thrust × 1.25.
- **Paths:** Metallic (metal ≥ 40%), Water-rich (ice ≥ 25%), Gas-rich (gas ≥ 20%), Comet. Rock path: +20% of a meal's rock.
- **Feedback:** dust, flashes, non-stacking shake, mass popups ≥ 0.5% of you; eaten = deep gulp + 0.7 s slow motion.
- Meteors, comets, the giant clash and pirates (never targeting you before LIFE): [gameevents.md](gameevents.md). Rival cores: [aliencivilizations.md](aliencivilizations.md) → Age I cores.

### Differences from the design doc

`rules.ts` keeps its constants in sync with `docs/gamedesign.html` ("Çarpışma ve Dönüşüm"). These differ on purpose:

| Design doc | Game | Why |
|---|---|---|
| Cracks lower durability and heal | No cracks | Unused bloat |
| A body 1–1.15× you bounces you lightly | Anything below 1.15× you merges into you | Equal bodies never flip between bounce and stick (user) |
| Heat formula on every hit | Rock pairs: the energy the contact lost (`rub`) | A rubbing pair was heated every frame (+2–4 a frame, measured) |
| Merge and partial accretion on any slow touch | Age I only; Age II below | A world is not a magnet for every rock (user, 2026-11-14) |
| A red ring marks the point of no return | Wells are a natural aura | User rejected crisp rings |
| Death card: "Play again" | After Age I: "Continue as a planetoid" | One body, one run |
| Ice boils at 5%/s above heat 1 | A comet boils 0.24–3.4%/s by heat and thrust; other bodies by `core/water.ts` | No reason recorded |
| Partial accretion leaves a crater | No crater | Follows from no cracks |
| Radioactive matter heats and decays to rock in 120 s | It neither heats nor decays | It is fuel (user, 2026-11-14) |
| Sizes grow without limit | Radii capped at 500 u | No planet as big as a star (user, 2026-11-14) |

**From Age II** (`worldOpts`, user 2026-11-14):

- Every hit heats your world by `worldHeat` = mass ratio^1.5 × (speed / stick speed)²: slow, +90 K at 1%, +1000 K at 5%, +4000 K at `GIANT_HIT` 12.5%. Big heat cools over minutes.
- Only bodies under `BURN_MAX` 1% burn up in your air. A solid world (≤ 1410 K) bounces smaller ones, which shatter on the ground.
- A body ≥ 12.5% merges and melts the surface; while either body is molten they merge like asteroids.
- Verdict colours (`predict`): molten or Age I, the regime colours; solid, green if it burns up or lands under 20 K, orange to 150 K, red from 150 K.
- From LIFE a shield shell meets bodies first: [civilizationgameplay.md](civilizationgameplay.md) → Shield.

Same as the doc: elements, G, game pull, damage, durability, regimes, impact heat, cooling, radioactive 3% of single
rocks, tiers, start dust, rock–rock sticking.

## Planned

Not in any package: steam venting below 1000 mass; milestone sounds and slow motion; a second shape pass (battered
remnants, metal core fragments, two new rock materials, comet families).

## Open issues

- **Still newcomer:** the 15 s hunter eats a player who never moves (visible 3.9 s before).
- Age I time depends far more on the player than on threats: 73 s skilled, 23 s greedy bot to 150 s+ slow bot (undated sims, not in the repo).
- Durability's m^0.2 makes big bodies tougher in their own units; revisit for Age II.
- Stale code comment: the `rules.ts` header lists the 5 s capture window, geometric-mean durability and loose piles as departures, but the design doc has no capture window and now has both of the others. Only `R_CAP` is a real departure.
- Cross-cutting issues (parked worlds, infall growth, low-end hardware): [vision.md](vision.md).

## Decisions

Standing decisions: [README.md](README.md). The ones only Age I needs:

- Slow hits barely heat (impact heat nearly zero for slow meals, not strictly zero).
- Rock atlas materials: earthy rock 50%, silver metal 20%, ice 20%, gassy 10%.
- The game area is your natural view, so a wheel zoom-in never spawns rivals at your side.
- No cracks (removed as unused bloat).
- **Momentum flight:** drag 0, braking as slow as speeding up; forward thrust fades out toward a top speed of 1.2 × the body's critical speed (the speed at which a head-on hit on a body like it destroys it), so each body has its own and can always choose to fly fast enough to die on impact or chip a planet, but cannot speed up forever (user, 2026-11-14).
