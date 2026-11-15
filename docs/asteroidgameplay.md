# Asteroid gameplay (Age I)

Age I: you start as a 69.5-mass speck of dust and eat, dodge and ram your way to a Planetoid. This file covers the tiers, how
bodies collide, heat, gravity, flight and the camera, how bodies look, and what Age I play shows you. Code:
`app/src/evolution/asteroid/` (`rules.ts`, `body.ts`, `player.ts`, `sphere.ts`, `atlas.ts`, `wells.ts`, `feedback.ts`) and
`app/src/core/` (`entity.ts`, `camera.ts`, `input.ts`, `water.ts`). The field you fly through is in
[worldgen.md](worldgen.md); the HUD in [hudandcontrols.md](hudandcontrols.md).

Code is the truth: if this file and the code disagree, the code wins and this file gets fixed. Labels: **measured** = run
in the game or in a sim on the real formulas; **computed** = from the formulas; the rest are rules. Units: START_R 16
world units is the yardstick; speeds are mostly in own diameters per second (D/s).

The collision rules follow the design doc (`docs/gamedesign.html`, tab "Çarpışma ve Dönüşüm"). Each deliberate
difference is listed under [Differences from the design doc](#differences-from-the-design-doc).

## Built

### Tiers

- **Age I tiers** (`asteroid/rules.ts` TIERS, √10× apart): Cosmic dust, Pebble 10^0.5, Meteoroid 10, Small 10^1.5, Medium 100, Large 10^2.5, Giant asteroid 1000, Planetoid 10^3.5, Protoplanet 10^4, Planet 10^4.5.
- **Goal:** AGE_GOAL 10^3.5 = 3,162 (start 69.5). Length: 73 s skilled, 150 s+ slow bots (measured); target 80–120 s.
- Tiers above AGE_GOAL and the gas line belong to Age II: [planetgameplay.md](planetgameplay.md) → World tiers.
- **Tier-up:** 3 s harvest (pull on bodies ≤ 0.3× you × 5, reach too).
- HUD stage line on `#game-hud[data-stage]`, e.g. "Age I · Asteroid → Planetoid" with a log-mass bar (layout in [hudandcontrols.md](hudandcontrols.md)).

### Handover, deaths and respawn

- **Handover** (`main.ts`): melt-through (heat MOLTEN + 2: metal sinks, sphere smooths), flash, dust ring, boom, shake, 0.8 s slow motion, toast "Age I complete" with the path (iron / ocean / gas / rocky world). Age II then takes over ([planetgameplay.md](planetgameplay.md)).
- **Deaths:** eaten, destroyed (d ≥ 5), crumbled (below a Pebble), fell into a star.
- **Respawn** (after Age I): "Continue as a planetoid" (Enter/Space/C) or "New run" (R): a molten body of AGE_GOAL × 1.01 with your composition, same field, 1–2 views away from anything heavier; life and stars start over. Each run has its own field seed. Before Age I the card offers only "Play again".

### Bodies and collisions

Code: `asteroid/rules.ts`, `asteroid/body.ts`.

- **Elements** (density / durability D / hardness H): metal 7.8/2.0/0.8, rock 3.0/1.0/0.5, ice 0.9/0.4/0.2, gas 0.2/0.1/0, radio 9.0/1.2/0.6. Mixes in `COMP` (start dust: rock 80, metal 10, ice 8, gas 2%).
- **Units:** START_R 16 world units is the yardstick; mass = (r/4)³ · density / 3 for the loose radius; speeds mostly in own diameters/s (D/s).
- **Size cap** (stylised scale, user 2026-11-14: "there is things bigger than a star"): `radiusOf` folds in 1/r³ = 1/r_loose³ + 1/500³, so no rock, planet or brown dwarf passes `R_CAP` 500 u (the smallest star is 766 u, stargameplay.md). Small bodies are untouched (≤ 2% at 1e5 rock); merges, dust and mass loss un-cap, add volumes as before, then re-cap (`body.ts` `resize`). Computed: habitable world 1e5 / 1e6 / 1e7 → 185 / 352 / 472 u (were 189 / 406 / 875), pure gas 379 / 480 / 498. Measured: debug Grow from 1e5 to 2.4e7 → your radius 178 → 486 u; the largest loaded body 456–492 u. `G_WORLD` and `START_M` now live in `rules.ts` (field.ts re-exports G_WORLD).
- **Durability** = geometric mean of the phases (a little ice or gas costs more than its share) × (1 − 0.3·looseness). **Hardness** −0.2 molten, −0.4 molten metal.
- **Damage:** q = ½v²·share²·(0.5 + H_other)/(0.5 + H_self), v in the body's own D/s; d = q / (40·D·m^0.2). No loss below d 0.1, up to 50% by d 1; d ≥ 1 shatters to 0.5/d with 2–8 fragments; d ≥ 5 destroys. Fragments are unequal (`rules.ts` `pieceShares`, spread `SPREAD` 0.7: the largest 5.7× the smallest in mass, piece counts unchanged; user, 2026-11-14: an icy body's fragments were identical spheres). Ice and gas boil off; 10% of the solid loss (+15% × metal) stays as pieces, the rest is dust. Broken differentiated bodies throw metal-rich debris.
- **No cracks** (deliberate difference from gamedesign.html: removed as unused bloat); a hit only chips mass.

**Regimes** (`collide`; T heavier, P lighter, V impact speed, v_m = V_STICK 8 in T's D/s, ×1.5 if molten, b_crit = R_T/(R_T+R_P)):

| Regime | Condition | Result | Well |
|---|---|---|---|
| Merge | V < v_m | T keeps all of P | green |
| Eaten | other ≥ 1.15× you (EATEN_MARGIN), V < v_m | game over; below 1.15× you are T: you eat it (Age I; Age II: see the differences table) | red |
| Graze | sliding/V > b_crit, V ≥ v_m | hit-and-run, nothing changes hands | orange |
| Partial accretion | V < 3·v_m, T not shattered | T keeps ξ = (3v_m − V)/(2v_m) of P's rest, the rest flies off; never you as P | yellow |
| Bounce / erosion | otherwise | both chip; either can shatter or die | orange; pink you break; red you die |

- Each side takes damage in its own diameters, so a crumb hitting a planet splashes. Your sliding speed counts 40% (GRAZE). Rock–rock pairs count full sliding, stick only below half their plain mutual escape speed, and get no game pull: rock merges in the first 30 s fell 48 → 13–15 (measured).
- Restitution: solid 0.5, rubble to 0.15, molten ~0. MAX_SPIN 1 rad/s.
- Every loaded rock is swept against you (`contactTime`): no tunnelling at 100 D/s and 30 fps (measured).
- At 795k (computed, `rules.test.ts`): a 2% body splashes at 6.1 D/s, 10% at 12.6; vs a peer you chip (d 0.3) at 36, shatter at 66, die at 148 D/s.
- Guards: no self-collision; duplicate and non-finite bodies dropped.
- **Shared mass helpers** (`body.ts`, used everywhere): `absorb(b, m, comp)` adds dust mass, `shed(b, dm)` shrinks a body
  (same shape), `drop(b)` removes it (its view goes and m = 0; the field never ticks a body with m = 0, so `shatter` and
  `drop` can be called straight from any stage). `shatter` keeps `BURST_KEEP` 0.4 of a destroyed body as up to
  `BURST_PIECES` 6 unequal fragments, the rest dust (`rules.ts`), placed evenly round a ring (one random phase, ±10% of the spacing) just wide enough that the two largest neighbours clear by 5% (`burstRing`: no two pieces touch at birth, so none merge at once; before 2026-11-15, 41–92% of bursts had an overlapping pair); fighters, probes, the frigate, rockets and the beam reuse it
  ([civilizationgameplay.md](civilizationgameplay.md#defence-ships-fighters)). `Events.debris(…, from)` and `field.spawn(…, from)`
  take the body a piece broke off (optional).

### Heat

Code: `asteroid/rules.ts`, `core/water.ts`.

- **Impact heat** (`impactHeat`): Δheat = 1.5·e + 2·s²·√(r/16), e = s·(v/v_m)², s = the other's mass share, v in your D/s. Speed term (user: slow hits barely heat) plus a merger infall term, so giant mergers still melt a world and build its core. Decision: nearly zero for slow meals, not strictly zero.
- **Swallowing** (`mergeHeat`, user 2026-11-14): energy is kept. Each side brings heat capacity × mass × heat (capacity per mass, rock = 1: metal 0.56, ice 2.6, gas 1.3, heavy elements 0.16, from their real specific heats), the hit's heat (impactHeat for the heavier body) is added once, and the sum spreads over the merged capacity. A cold meal cools you, a hot or fast one warms you. Computed: a 1% ice meal at 120 K takes a 550 K body to 543 K, the same mass of rock to 548 K. (Before, each side also took its own hit heat and the meal's inflated heat was mass-averaged in, so even cold ice warmed you.)
- Computed: a 2% body at 1.5 / 4 / 8 / 16 D/s gives 0.8 / 3.5 / 13 / 51 K at the start, 1.6 / 4.3 / 14 / 52 K at 10^5; a slow 10% merger 9–36 K; a peer at 16 D/s 1,500–2,300 K.
- 1 heat unit = 430 K above 120 K. > 1 heated, > 3 molten (stick ×1.5), > 5 molten metal, > 8 vaporizing; capped at MAX_HEAT 10.
- Cooling COOL 0.08/s at start radius, ∝ 1/r (an earlier 0.3 never let heat show; the design doc now says ≈ 8%/s too). Radioactive matter neither decays nor heats (user, 2026-11-14): it is a civilization's fuel: miners take it into a fuel stock, and what you eat your people dig out into it ([civilizationgameplay.md](civilizationgameplay.md) → Energy). Before that, a little helps life (×1.25 at 1%), a lot slows it ([planetgameplay.md](planetgameplay.md) → Life). Green rocks are 25% radioactive (rock 60%, metal 15%), so eating them shows in your make-up.
- `Body.diff` (sunk metal) grows only while molten; it feeds the magnetic field and the crust look.
- What heat does to your water (melting, boiling, steam, air) is Age II: [planetgameplay.md](planetgameplay.md).

### Gravity

Code: `asteroid/rules.ts`, `asteroid/field.ts`.

- G = 0.12 in player units. The design doc first had 4.6: belt rocks left after 20 s were 78 / 62 / 40 / 13% at G 0 / 0.12 / 0.4 / 1.6 (measured); the doc now uses 0.12 too.
- **Game pull** on pairs with you: `pullMass` = 2·m·min(10, (m/you)^0.5). At contact a 10× body pulls ~20% of your thrust, 40× ~85%, a peer ~1.5% (computed). The ×10 cap stops a tiny player turning rocks into black holes (bodies were flung to 1e16). **One factor per pair** (the stronger of the two boosts, `field.ts` `gravity`): momentum is kept and the heavier body always moves less. Before, your boosted pull (`youPull`) moved any body under ~2.5× you more than you moved toward it, and the pair gained momentum: at 150k a 1.5× body covered 69% of a 4-radius gap (real 40%). Now 40%, and a heavier body tugs you 27% of your thrust at contact for 1.5× (was 8%), 33% for 2× (was 12%), 67% for 6× (was 40%), 20×+ unchanged; start size unchanged. Measured in a sim on the real formulas (physics designer), not in the game.
- **Your pull** grows with size: `youPull` × (r/16)^0.5, since pull in your own radii depends only on density. On a rock 5 radii off: 0.053 / 0.113 / 0.166 your radii/s² at start / planetoid / dwarf (computed).
- Sources: the 24 heaviest loaded bodies plus you; reach ends below 0.3 u/s². Rock on rock is plain physics. Capping your reach at 15 radii changed nothing measurable; dropped.

### Flight and camera

Code: `asteroid/player.ts`, `core/entity.ts`, `core/camera.ts`, `core/input.ts`.

- Thrust 500 u/s² (15.6 D/s²) × (r/16)^0.4 × (dust density / yours)^0.3. Drag 0, braking at full thrust (RETRO 1). Top speed = TOP 1.2 × `critSpeed` (`rules.ts`: √(8·DEATH_D·Q0·durability·m^0.2) own D/s, a head-on hit on a peer destroys you); forward thrust fades as (v/top)² (`shapeThrust`). Computed, full thrust from rest: start dust 60 D/s critical in 5 s, 1,000 stony 84 in 13 s, 31,600 stony 119 in 36 s, 1e5 icy 77 in 38 s, 1e6 stony 168 in 102 s. Measured at the start size: holding thrust 15 s levels at ~70 D/s (top 72). MAX_SPEED 1e4 own D/s stays as a numeric guard (gravity can still push past the top). Rivals keep drag 0.1.
- Exact drag-0 integration (`entity.test.ts`: same place at 30 and 240 fps). Sideways thrust: `shapeThrust`.
- Time to 10 / 30 / 100 D/s (computed): start 0.6 / 1.9 / 6.4 s; 31.6k 2.2 / 6.5 / 21.8 s; 795k 4.1 / 12.4 / 41.5 s. Eating needs < 8 D/s; speed is for travel and ramming.
- **Game area = your natural view** (`main.ts`): the field loads, spawns and recycles around `min(camera zoom, natural zoom)`, so a wheel zoom-in only changes what you see (rivals spawned at your side before, user); zoomed out, it is what you see.
- Camera: view ∝ size^0.8; speed zoom ≤ 1.6× between 8 and 60 D/s (2× loaded 4,463 bodies, 9.8 ms a frame, measured); lead ≤ 0.45 half-view, eased; shake on real time, non-stacking; own bounces kick the view; ≤ 1.6× pull-back for a near star, 2.5× in a star orbit ([stargameplay.md](stargameplay.md)).
- Input (`core/input.ts`): WASD/arrows, touch joystick (deadzone 0.12). Fire and Command: [hudandcontrols.md](hudandcontrols.md) → Controls.

### Shapes and looks

Code: `asteroid/rules.ts`, `body.ts`, `sphere.ts`, `atlas.ts`. Bake costs and budgets: [techandperformance.md](techandperformance.md).

- **Atlas:** 128 rocks baked at startup, 256 px, two mipmapped 2048² pages (~130 ms, ~45 MB); 10 materials (user: earthy rock 50%: basalt brown, umber, Mars red-brown, ochre, khaki clay; silver metal 20%: polished silver, brushed steel; clear and dirty ice 20%; gassy 10%); flip, stretch, tint per rock. The shape family follows the material: metal an angular 5–8-sided chunk, ice a long faceted crystal shard, gas a soft round blob in a wide fbm mist (faded before the cell edge, plus a mist sprite in the field, `GAS_MIST`), rock the old potatoes, peanuts and rubble piles; up to 8 flat cuts. Metal: cool sky reflection, a hot glint, a bright rim, faint brushed streaks; ice: light glowing through thin edges. Metal reads as metal at a few pixels: less diffuse darkening and a brighter mirror sky in the bake, no mineral palette tint, and a cold-white additive sheen behind each metal rock (`field.ts` `METAL_GLOW`, alpha 0.7, 2.2× radius).
- **Piles:** meals glue on where they touched; parts settle by radius; one shared light; tints drift to the composition colour.
- **Round-off:** `roundR` = 75 − 25·ice units; baked as one sphere from half that radius and ≥ 10^3.5 mass, Planetoid (or a molten past; user, 2026-11-15: every asteroid tier, icy Giant asteroids too, stays an irregular atlas rock; they had turned the late belt into identical balls), an irregular "potato" until round (edge 0.34 → 0.03, stretch ≤ 1.45×; the drawn roundness is `rules.ts` `shapeOf`: `roundShape` less a debris piece's jag). Round at ~8,200 stony, ~14,000 metal; icy from 10^3.5. At 795k 74 of 102 baked bodies were irregular (measured). The rule is `rules.ts` `bakes` (`ROUND_M` 10^3.5).
- **Rough bodies** (`Body.rough`, `body.ts` `keepShape`; user, 2026-11-14: captured comets turned into plain spheres): comets (`field.ts` `coma`), every fragment under 10^3.5 mass and loot piece (`addBody`, `body.ts` `asDebris`) and whatever you capture while it is still a rock pile keep their own rocks for good: never baked until molten (diff ≥ 0.3). A captured comet keeps its sprite, coma and tail. Meals they eat sink in and fade like on a sphere, and the kept rocks grow to cover the collision circle. A small fragment is an atlas rock of its main solid element (ice shards, angular metal, earthy rock; never the gas kind, pieces are solids), stretched a further 0.75–1.3×, half tinted like the body it broke off with its own hue shift.
- **Debris** (`Body.jag`, `rules.ts` Debris block; user, 2026-11-15: "a freshly shattered planet shouldn't immediately split into spheres"): a piece ≥ 10^3.5 mass broken off a body starts at jag 1 and bakes at once through the sphere shader with the parent's crust (its own hue shift and ±20% shade), 4–6 flat break faces cut into its outline from its seed (`breakFaces`; the sprite is scaled by `faceFit` so the cut outline has the collision circle's area) plus the potato lump and stretch. It rounds over time: jag falls at r/roundR (≤ 3×) / `JAG_S` 90 s per s (90 s at its round-off radius, 45 s at 2×, 30 s from 3×; nothing below half of it while cold), 1/5 per s while molten (heat > 3), and a merge multiplies it by 1 − the meal's share. Drawn in 4 steps (`jagStage`, ceil), each a re-bake crossfaded over 0.6 s; at 0 it bakes like any body. Physics ignore it. The target panel calls it a "fragment" while jag > 0.
- Catalogue: rocks, rubble piles (50% of 300–1000 mass), contact binaries (15% of piles), irregular bodies, round worlds, comets; protoplanets spawn differentiated. Where each turns up: [worldgen.md](worldgen.md).
- **Spheres:** your pile rounds over 2.5 s. One seed per sphere for life; history shows: craters 16 (pristine) to 4 (resurfaced), lava plains if once molten, cracked ice crusts, metal sinking out of the crust from 1.5k to 15k, region tint. Re-bake on 6% mass change, ≤ 1 bake a frame (`spheres.begin()` in `main.ts`: yours first); textures freed with their chunk.
- Your world's surface in Age II (seas, frost, life, city lights): [planetgameplay.md](planetgameplay.md) → Your surface.
- Your heat shows as a deep-red glow behind the body, never on top (a hot rock, not a star; `player.ts`).

### Age I play

Code: `asteroid/player.ts`, `wells.ts`, `feedback.ts`. HUD panels, debug mode, hints and the game-over card: [hudandcontrols.md](hudandcontrols.md).

- **Sensing:** nearest rock within 5 radii, anything on course ≤ 3 s (closest approach < 1.4× contact), heavier bodies within 12 radii; up to 5 wells. The HUD target is the heaviest body on screen within ±30° of your heading (`player.ts` `AIM_CONE`; heading = your motion above 0.5 own D/s, else your input, else the last heading; none in the cone: the heaviest on screen, so a body beside you still shows). From Age II it is also what E acts on off the canvas (a Command: [hudandcontrols.md](hudandcontrols.md) → Controls). Your moons ignored; meteors only when nearest.
- **Wells:** glow, two counter-rotating haze veils, faint sinking waves; size, speed, brightness by verdict; haze 30% toward white (deadly unsoftened); fade 8/s in, 3/s out. Pooled sprites of 3 textures baked once (~23 ms): ~0.01 ms with 6 wells vs 0.3–0.6 ms as vector circles (measured).
- **Comet form:** ice ≥ 50% (out < 40%); ice boils by heat and thrust (≤ 1.2%/s, cold coasting dormant), boiling eats heat, jets ≤ thrust × 1.25, cyan coma.
- **Paths:** tags Metallic (metal ≥ 40%), Water-rich (ice ≥ 25%), Gas-rich (gas ≥ 20%), Comet; chips show trade-offs. Rock path: +20% of a meal's rock.
- **Feedback:** dust, flashes, non-stacking shake for hits that matter, mass popups ≥ 0.5% of you, hit-stop; eaten = deep gulp + 0.7 s slow motion.
- What else Age I throws at you: meteors, the forced first shower, comets, the giant clash and roaming pirate fleets (they strip rich rocks and die if rammed; they never target you before LIFE) in [gameevents.md](gameevents.md); rival cores (the first hunter at 15 s) in [aliencivilizations.md](aliencivilizations.md) → Age I cores.

### Differences from the design doc

`asteroid/rules.ts` keeps its constants in sync with `docs/gamedesign.html` ("Çarpışma ve Dönüşüm"). These differ on purpose:

| Design doc | Game | Why |
|---|---|---|
| Cracks: a hit with d ≥ 0.3 adds one (≤ 5), each −10% durability, one heals per 30 s | No cracks; a hit only chips mass | Removed as unused bloat |
| A body 1–1.15× you only bounces you lightly | Anything below 1.15× you, an equal peer included, merges into you | Equal bodies never flip between bounce and stick ("eaten, not captured", user) |
| Merge and partial accretion on any slow touch | **Age I only.** From Age II (mass ≥ `AGE_GOAL`, rules.ts `worldOpts`): every hit heats your world by `worldHeat`, its fall energy spread through the whole world, scaling with mass ratio^1.5 and (speed / stick speed)² (real physics is linear in mass; ^1.5 keeps pebbles mild): slow hits +8 K at 0.2%, +90 K at 1%, +256 K at 2%, +1000 K at 5%, +4000 K at `GIANT_HIT` 0.125, capped at 4420 K. Only bodies under `BURN_MAX` 1% burn up in the air; a shield holds only hits up to its full range (34.5 / 69 / 103.5 K at levels 1–3), bigger ones break through and collapse it; heat far above the climate cools slowly (`RELAX_S` × (1 + excess heat units), so a magma ocean lasts minutes). A solid world (≤ 1410 K, `MOLTEN`) bounces small bodies, which then shatter on the ground; a body ≥ `GIANT_HIT` (too big to be a moon) is a giant impact (Earth–Theia): it merges and melts the surface; while either body is molten they merge like asteroids again, rival worlds included (user, 2026-11-14). Any body under 4× the burn-up share and under `BURN_MAX` 1% of you entering your air burns and joins you as dust, with no stick speed needed | A world is not a magnet for every rock, but a giant merger melts it (user, 2026-11-14). The target panel and aura follow your state: molten (or Age I) the regime colours, so what you can eat is green; solid, by the hit's heat: green if it burns up or lands under 20 K, orange to 150 K, red from 150 K. Age II meteors are 0.1–1% of you (fast things stay small). `field.ts` `hitWorld` (also your moon landing on a rival world, and a rival's rock on its circle landing on you), `player.ts` predict; `field.harvest` on tier-up runs only in Age I |
| A red ring on the map marks where the pull beats your thrust (point of no return) | Wells are a natural aura (glow, haze, sinking waves) in the verdict colour; no crisp rings | User: crisp concentric rings rejected |
| Death card: "Play again" from the start | After Age I: "Continue as a planetoid" or "New run" | One body, one run; Age II keeps going |
| Ice boils at heat > 1 at 5% of the ice a second | A comet boils ≤ 1.2%/s by heat and thrust (cold coasting dormant); other bodies boil by `core/water.ts` (up to 2% of the water a second, ≥ 200 K over the boiling point) | Read from code (`player.ts` BOIL, `water.ts` BOIL); no reason recorded |
| Partial accretion leaves a crater on T | No crater; T just keeps ξ of P | Follows from no cracks |

Same as the doc: elements, G 0.12, game pull, damage, durability, regimes, impact heat, cooling ≈ 8%/s, radioactive 3% of single rocks (no decay: fuel, user 2026-11-14), tiers, start dust, rock–rock sticking at half the mutual escape speed.

## Planned

No concept item is pending for Age I: concept 1 "starts as an asteroid" is Built. Not built and not in any package yet:

- Steam venting below 1000 mass.
- Milestone sounds and slow motion.
- The second shape pass: battered remnants, metal core fragments (fragment outlines: done, Debris above), two new rock materials, comet families.

## Open issues

- **Still newcomer:** the 15 s hunter eats a player who never moves (visible 3.9 s before).
- Age I time depends far more on the player (23 s greedy bot to 150 s+ slow bot) than on threats.
- Durability's m^0.2 makes big bodies tougher in their own units (peer shatter 27 D/s at the start, 66 at 795k); revisit for Age II. A peer bounce at 2·v_m gives 3.0 heat; lower HEAT_KIN if peers melt too easily.
- Giants are round (the sphere bake rounds anything past roundR).
- Pacing sims were not re-run after the web, burn-up and calm changes (the sim scripts are not in the repo).
- Stale code comment in `asteroid/rules.ts` (values are right): line 4 lists "no 5 s capture window" as a departure, but the design doc's collision tab no longer has a capture window.

Cross-cutting open issues (parked worlds, infall growth, low-end hardware): [vision.md](vision.md).

## Decisions

User decisions that shape Age I (standing decisions in full: [README.md](README.md)). Undated ones predate 2026-11-13.

- **Fun first, then realism.** When they conflict, fun wins and the deviation is stated.
- **Danger is seen, never told.** No off-screen arrows or alerts (tried and removed). No verdict text: only the well colour and the target panel edge. No meteor warnings.
- **Wells are a natural aura** (breathing glow, noisy haze); crisp concentric rings were rejected.
- **No squash pulse.** **No reverb or echo.**
- **No carbon element:** metal, rock, water, gas, plus a radioactive trace.
- **Hot bodies must not look like stars:** heat glow is deep red behind the body.
- **Momentum flight:** drag 0, braking as slow as speeding up; forward thrust fades out toward a top speed of 1.2 × the body's critical speed (the speed at which a head-on hit on a body like it destroys it), so each body has its own and can always choose to fly fast enough to die on impact or chip a planet, but cannot speed up forever (user, 2026-11-14).
- **Spin only from angular momentum.**
- **Eaten, not captured:** a slow touch from a body ≥ 1.15× you ends the run (no 5 s escape window); in Age I anything lighter, an equal peer included, merges into you. From Age II a solid world takes small bodies only as burn-up dust (they bounce and shatter); a giant impact merges and melts it, and a molten world merges like an asteroid (user, 2026-11-14; differences table above).
- **Growth never stops play:** no "keep going" card; you level up and transform automatically.
- **One body, one run;** after Age I a death offers "Continue as a planetoid".
- **No meteor trails** except burn-up streaks in your own air.
- **Look:** you cyan, rivals violet; BASE_ZOOM 1.02 (20% closer than the old 0.85).
- Slow hits barely heat (impact heat nearly zero for slow meals, not strictly zero).
- Rock atlas materials: earthy rock 50%, silver metal 20%, ice 20%, gassy 10%.
- The game area is your natural view, so a wheel zoom-in never spawns rivals at your side.
- No cracks (removed as unused bloat).
