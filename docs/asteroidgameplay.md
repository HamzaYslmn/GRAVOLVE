# Asteroid gameplay (Age I)

You start as a 69.5-mass speck of dust and eat, dodge and ram your way to a Planetoid. Code: `evolution/asteroid/`
(`rules.ts`, `body.ts`, `player.ts`, `sphere.ts`, `atlas.ts`, `wells.ts`, `feedback.ts`) and `core/` (`entity.ts`,
`camera.ts`, `input.ts`, `water.ts`). Field: [worldgen.md](worldgen.md); HUD: [hudandcontrols.md](hudandcontrols.md);
labels: [README.md](README.md). START_R 16 world units is the yardstick; speeds in own diameters per second (D/s).

## Built

### Tiers

- **Age I tiers** (`TIERS`, √10× apart): Cosmic dust, Pebble 10^0.5, Meteoroid 10, Small 10^1.5, Medium 100, Large
  10^2.5, Giant asteroid 1000, Planetoid 10^3.5.
- **Goal:** AGE_GOAL 10^3.5 = 3,162 (start 69.5), target 80–120 s. Higher tiers: [planetgameplay.md](planetgameplay.md) →
  World tiers and the gas line. **Tier-up:** a 3 s harvest (your pull on bodies ≤ 0.3× you × 5; Age I only).

### Handover, deaths and respawn

- **Handover** (`main.ts`): melt-through (metal sinks, sphere smooths), flash, dust ring, boom, shake, 0.8 s slow motion,
  "Age I complete" with your path (iron / ocean / gas / rocky). Then Age II.
- **Deaths:** eaten, destroyed (d ≥ 5), crumbled (below a Pebble), fell into a star.
- **Respawn** after Age I: "Continue as a planetoid" (Enter / Space / C) or "New run" (R): a molten body of AGE_GOAL × 1.01
  with your composition, same field, 1–2 views from anything heavier; life and stars start over. Before Age I only "Play
  again". Each run has its own field seed.

### Bodies and collisions

| Element | Density | Durability D | Hardness H |
|---|---|---|---|
| metal | 7.8 | 2.0 | 0.8 |
| rock | 3.0 | 1.0 | 0.5 |
| ice | 0.9 | 0.4 | 0.2 |
| gas | 0.2 | 0.1 | 0 |
| radio | 9.0 | 1.2 | 0.6 |

- Mixes in `COMP`; start dust rock 80, metal 10, ice 8, gas 2%. Durability = weighted geometric mean × (1 − 0.3·looseness);
  hardness −0.2 molten, −0.4 molten metal.
- **Size cap** (user, 2026-11-14: "there is things bigger than a star"): `radiusOf` folds in 1/r³ = 1/r_loose³ + 1/500³, so
  nothing passes `R_CAP` 500 u (1e5 / 1e6 / 1e7 habitable world: 185 / 352 / 472 u).
- **Damage:** q = ½v²·share²·(0.5 + H_other)/(0.5 + H_self), v in the body's own D/s; d = q / (40·D·m^0.2); none below
  0.1, ≤ 50% by d 1, from d 1 it keeps 0.5/d, d ≥ 5 destroys. Each side in its own diameters, so a crumb on a planet splashes.
- **Pieces:** ice and gas boil off; 10% of the solid loss (+15% × metal) stays as pieces, the rest dust; 2–8 pieces
  (2 + 6 × lost share), ≤ 6 from a destroyed body; unequal (`pieceShares`, largest 5.7× smallest; user, 2026-11-14);
  differentiated bodies throw metal-rich debris. No cracks.
- At 795k (2026-11-16): a 2.2% body splashes at 6.1 D/s, 10% at 12.6; against a peer you chip at 36.3, shatter at 66.3, die
  at 148.2.

**Regimes** (`collide`; T heavier, P lighter, V impact speed, v_m = V_STICK 8 in T's D/s, ×1.5 molten, b_crit =
R_T/(R_T+R_P)):

| Regime | Condition | Result | Well |
|---|---|---|---|
| Merge | V < v_m | T keeps all of P | green |
| Eaten | other ≥ 1.15× you, V < v_m | game over; below 1.15× you eat it (Age I; Age II below) | red |
| Graze | sliding/V > b_crit, V ≥ v_m | hit-and-run | orange |
| Partial accretion | V < 3·v_m, T not shattered | T keeps ξ = (3v_m − V)/(2v_m) of P; never you as P | yellow |
| Bounce / erosion | otherwise | both chip, either can shatter or die | orange; pink you break; red you die |

- Your sliding counts 40% (GRAZE). Rock–rock pairs count full sliding, stick below half their mutual escape speed, get no
  game pull (belts don't clump), and rub (user, 2026-11-17): Coulomb friction (`MU` 0.6) plus relief (`ROUGH` 0.25) slow
  a skim until it sticks and set both spinning; a skim at 0.55–0.65 of escape merges in 0.3–1.6 s at any tick rate
  (body.test.ts). Near-equal masses: the tougher is T (`rank` = m·(D·(0.5 + H))^0.1; never under 1/1.4 of the other).
  Rub sparks scale with the energy lost.
- Restitution: solid 0.5, rubble to 0.15, molten ~0. MAX_SPIN 1 rad/s. Every loaded rock is swept against you
  (`contactTime`): no tunnelling.
- **Shared mass helpers** (`body.ts`): `absorb`, `shed`, `drop` (m = 0). `shatter` keeps `BURST_KEEP` 0.4 as ≤ 6
  fragments on a ring wide enough that none touch at birth (`burstRing`), used for a body a world repels. Your guns use
  their own cut (`KEEP` 0.9: [civilizationgameplay.md](civilizationgameplay.md) → Breaking into food).
  `field.spawn(…, from)` takes the parent.

### Heat

- **Impact heat** (`impactHeat`): Δheat = 1.5·e + 2·s²·√(r/16), e = s·(v/v_m)², s = the other's share. Slow meals barely
  heat; the infall term lets giant mergers melt a world.
- **Rock pairs heat by the energy lost** (`rub`, `workHeat`, 2026-11-17): graze or bounce heat both by the kinetic energy
  restitution and friction took, split by softness, over heat capacity; the infall term only on merges. Two 1000 u stony
  rocks bouncing at 16 D/s heat +3.2 each; a rubbing pair merges at ~+0.8.
- **Heat is seen** (`heatGlow`, 2026-11-17): a hot rock shows a thin rim behind its own outline (`atlas.ts` `rockGlow`),
  deep red to ember orange, never white, alpha ≤ 0.75, from 800 K, where real rock starts to glow (heat 1.58; user 2026-11-17: realist, was 0.15) to full at MOLTEN; on screen only (13
  draw calls with or without 15 halos). Your body uses the same rim.
- **Swallowing** (`mergeHeat`, user 2026-11-14): energy kept; each side brings heat capacity × mass × heat (rock 1, metal
  0.56, ice 2.6, gas 1.3, heavy 0.16), the hit's heat added once, so cold meals cool you (1% ice at 120 K takes 550 K to
  543 K).
- 1 heat unit = `K_PER_HEAT` 430 K above 120 K: > 1 heated, > 3 molten (stick ×1.5), > 5 molten metal, > 8 vaporizing;
  MAX_HEAT 10 (4420 K). Cooling COOL 0.08/s at the start radius, ∝ 1/r.
- **Radioactive matter neither decays nor heats** (user, 2026-11-14): fuel ([civilizationgameplay.md](civilizationgameplay.md)
  → Energy and dose); a little helps life. Green rocks are 25% radioactive.
- `Body.diff` (sunk metal) grows only while molten; feeds the field and crust look.

### Gravity

- G = 0.12 as in the design doc. **Game pull** with you: `pullMass` = 2·m·min(10, (m/you)^0.5) (a 10× body ~20% of your
  thrust at contact, 40× ~85%); one factor per pair (`pairPull`): momentum kept, the heavier moves less. **Your pull**
  `youPull` × (r/16)^0.5. Sources: the 24 heaviest loaded bodies plus you; reach ends below 0.3 u/s². Rock on rock is
  plain physics.

### Flight and camera

- **Thrust** 500 u/s² × (r/16)^0.4 × (dust density / yours)^0.3; drag 0, braking at full thrust (exact drag-0
  integration). Rivals keep drag 0.1.
- **Top speed** = TOP 1.2 × `critSpeed`; forward thrust fades as (v/top)² (start 60 D/s in 5 s; 1e6 stony 168 in 102 s).
  Eating needs < 8 D/s.
- **Game area = your natural view:** the field loads around min(camera zoom, natural zoom); a wheel zoom-in only changes
  what you see.
- **Camera:** view ∝ size^0.8; speed zoom ≤ 1.6× between 8 and 60 D/s; lead ≤ 0.45 half-view; non-stacking shake; star
  pull-back ([stargameplay.md](stargameplay.md)). Input: [hudandcontrols.md](hudandcontrols.md) → Controls.

### Shapes and looks

Bake costs: [techandperformance.md](techandperformance.md).

- **Atlas:** 128 rocks at startup, 256 px each; materials (user) earthy rock 50%, silver metal 20%, ice 20%, gassy 10%;
  metal angular, ice shards, gas misty blobs, rock potatoes; metal gets a cold-white sheen (`METAL_GLOW`).
- **Piles:** meals glue on where they touched; tints drift to the composition colour.
- **Round-off:** `roundR` = 75 − 25·ice units; one sphere only from `ROUND_M` 10^3.5 past half the round-off radius, or with
  a molten past (user, 2026-11-15: every asteroid tier stays irregular).

#### Rough bodies

`Body.rough`, `keepShape` (user, 2026-11-14): comets, fragments under 10^3.5, loot pieces and captured rock piles keep their
rocks until molten; a captured comet keeps coma and tail; a small fragment is an atlas rock of its main element.

#### Debris

User, 2026-11-15: a shattered planet doesn't split into spheres at once. A piece ≥ 10^3.5 (`Body.jag`) bakes with its
parent's crust and 4–6 flat faces, rounding in `JAG_S` 90 s at its round-off radius (45 s at 2×, 30 s from 3×, 5 s
molten). The target panel calls it a "fragment".

#### Spheres

Your pile rounds over 2.5 s. Craters 16 to 4, lava plains if once molten, cracked ice, metal sinking as it differentiates.
Re-bake on 6% mass change, ≤ 1 bake a frame (`spheres.begin()` in `main.ts`). Heat is a deep-red glow behind the body.
Age II surface: [planetgameplay.md](planetgameplay.md) → Your surface.

### Age I play

- **Sensing:** nearest rock within 5 radii, anything on course within 3 s, heavier bodies within 12 radii; ≤ 5 wells. HUD
  target: heaviest on screen within ±30° of your heading (`AIM_CONE`), else heaviest on screen.
- **Wells:** glow, two counter-rotating haze veils, faint sinking waves; sized and coloured by verdict.
- **Comet form:** ice ≥ 50% (out below 40%); ice boils 1.2%/s × (0.2 cold + heat/2 ≤ 2 + 0.6 thrusting): 0.24–3.4%/s;
  boiling eats heat; jets push ≤ thrust × 1.25.
- **Paths:** Metallic (metal ≥ 40%), Water-rich (ice ≥ 25%), Gas-rich (gas ≥ 20%), Comet; rock path +20% of a meal's rock.
- **Feedback:** dust, flashes, shake, popups ≥ 0.5% of you; eaten = gulp + 0.7 s slow motion.
- Meteors, comets, clash, pirates: [gameevents.md](gameevents.md). Rival cores: [aliencivilizations.md](aliencivilizations.md)
  → Age I cores.

### Differences from the design doc

`rules.ts` stays in sync with `docs/gamedesign.html` ("Çarpışma ve Dönüşüm"); these differ on purpose:

| Design doc | Game | Why |
|---|---|---|
| Cracks lower durability and heal | No cracks | Unused bloat |
| A body 1–1.15× you bounces you lightly | Anything below 1.15× merges into you | No flip between bounce and stick (user) |
| Heat formula on every hit | Rock pairs: energy lost (`rub`) | A rubbing pair heated every frame |
| Merge / partial accretion on any slow touch | Age I only | A world is not a magnet (user, 2026-11-14) |
| A red ring marks no return | Wells are a natural aura | User rejected crisp rings |
| Death: "Play again" | After Age I "Continue as a planetoid" | One body, one run |
| Ice boils 5%/s above heat 1 | Comets 0.24–3.4%/s; others by `core/water.ts` | No reason recorded |
| Partial accretion leaves a crater | No crater | No cracks |
| Radioactive matter heats and decays in 120 s | Neither | It is fuel (user, 2026-11-14) |
| Sizes grow without limit | Radii ≤ 500 u | No planet as big as a star (user, 2026-11-14) |

**From Age II** (`worldOpts`, user 2026-11-14):

- Every hit heats your world by `worldHeat` = mass ratio^1.5 × (speed / stick)²: +90 K at 1%, +1000 K at 5%, +4000 K at
  `GIANT_HIT` 12.5% (slow). Big heat cools over minutes.
- Only bodies under `BURN_MAX` 1% burn up, at the air's edge (`airR` 1.35 R, outside any shield shell; 2026-11-17:
  air, shell, ground in that order). Debris born inside the air, or a remnant the shell shed, lands unburnt.
  The air shows out there: an edge haze (overlays.ts `edge`, alpha 0.12 + 0.3 × the limb's, on any air that can burn a
  rock) still ~18% at 1.35 R. Measured 2026-11-17 (0.26 atm, 26 px world): +10 of 255 brightness at 1.35 R, +22 at 1.15 R,
  +2 at 1.45 R; disc peak 223. Burn grains fall 0.15 R on into the air.
  A solid world (≤ 1410 K) bounces smaller ones, which shatter on the ground.
- A body ≥ 12.5% merges and melts the surface; while either is molten they merge like asteroids, rival worlds included.
- Verdict colours (`predict`): molten or Age I the regime colours; solid: green if it burns up or lands under 20 K, orange
  to 150 K, red from 150 K.
- From LIFE a shield shell meets bodies first ([civilizationgameplay.md](civilizationgameplay.md) → Shield); a shatter's
  pieces start apart on a ring (`burstRing`); natural infall is front-loaded while a new world is molten (14 of 15 hits in
  the first 94 s, then clear).

Same as the doc: elements, G, game pull, damage, durability, regimes, impact heat, cooling, radioactive 3% of single rocks,
tiers, start dust, rock–rock sticking.

## Planned

Steam venting below 1000 mass; milestone sounds and slow motion; a second shape pass (battered remnants, metal core
fragments, two new rock materials, comet families).

## Open issues

- **Still newcomer:** the 15 s hunter eats a player who never moves (visible 3.9 s before).
- Age I time depends on the player: 23 s greedy bot to 150 s+ slow bot, 73 s skilled (undated sims).
- Durability's m^0.2 makes big bodies tougher in their own units; revisit for Age II.
- Stale comment: the `rules.ts` header lists departures the design doc no longer has; only `R_CAP` is real.
- Cross-cutting: [vision.md](vision.md) → Open issues.

## Decisions

Standing: [README.md](README.md). Age I only:

- Slow hits barely heat. Atlas materials 50 / 20 / 20 / 10%. The game area is your natural view. No cracks.
- **Momentum flight** (user, 2026-11-14): drag 0, braking as slow as speeding up; thrust fades toward 1.2 × the body's
  critical speed (a head-on hit on a peer destroys it), so each body can fly fast enough to die or chip a planet, but not
  speed up forever.
