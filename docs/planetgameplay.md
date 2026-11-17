# Planet gameplay (Age II)

From the Planetoid (AGE_GOAL 10^3.5 = 3,162) to LIFE: world tiers and the gas line, surface, water, air and climate,
burn-up, calm, life, moons, survival (stages 2–3 in [README.md](README.md)). Code: `evolution/planet/` (`rules.ts`,
`stage.ts`, `moons.ts`, `hud.ts`), `core/water.ts`, `core/orbits.ts`. Handover in: [asteroidgameplay.md](asteroidgameplay.md);
from LIFE: [civilizationgameplay.md](civilizationgameplay.md); HUD: [hudandcontrols.md](hudandcontrols.md).

## Built

### World tiers and the gas line (`planet/rules.ts`)

`tierName` / `tierIndex` / `nextGoal`, the single source:

| From | Tier |
|---|---|
| 10^3.5 | Planetoid |
| 10^4 | Protoplanet (molten) / Dwarf planet |
| 10^4.5 | Planet (Rocky planet if solids ≥ 60%) |
| 10^5 | Super-Earth / Mini-Neptune |
| 10^5.5 | Ice giant (ice + gas ≥ 60%, on the gas line; a wet rocky world stays Super-Earth) |
| 10^6 | Gas giant (gas ≥ 70%) |
| 10^6.5 | Super-Jupiter |
| 10^7 | Brown dwarf (never ignites) |

- **Gas line:** in at gas ≥ 20%, out below 15% (sticky). From 15% at ≥ Planet mass a toast warns once ("20% gas makes a gas
  world from Super-Earth mass: no surface, no life"); the Limits row shows it from 5%. The life path closes only from
  Super-Earth mass (`envelope`: m ≥ 10^5 on the line); below it a gas-line world still runs life. A gas world ends at Brown
  dwarf.
- A world never reads as an asteroid again. One toast per mass step; a rocky world past Super-Earth's goal is "make it
  habitable". Growing thickens the air at the same gas share: `airLimits(m, gas, warm)` gives where seas start to suffer
  (`HOT_RAMP` 30 K under boiling) and boil (a 125k Super-Earth at 7.7% gas, no starlight: ×2.84, ×6.07; 2026-11-17).

### Your surface

`setSurface`: seas in the sphere's low ground, glint, frozen seas, frost, green lowlands as life fills, teal when habitable,
lava seams, city lights as a separate bake; one 256² bake per state, crossfaded 0.6 s.

### Water, air and climate (`core/water.ts`, `planet/rules.ts`)

- **Water** (you only): T = 120 + `K_PER_HEAT` 430 × heat K; melts 273 K, boils 373 K at 1 atm, 273 K at the 0.05 atm
  triple point.
- **Steam** held from 0 at 10^3 to all at 10^4.5 (log); pressure = gas × hold × 4 × max(1, m/10^4.5)^(2/3); water boils
  2%/s at ≥ 200 K over boiling; latent 40 heat per share.
- **Climate:** heat settles toward 120 K + 200·p^0.25 at 1 / (`RELAX_S` 10 s × (1 + excess heat units)): warmth fades in
  seconds, a magma ocean after a moon-sized hit takes minutes (user, 2026-11-14). At rest 0.3 / 1 / 2.5 atm → 268 / 320 /
  371 K; seas liquid at rest from ~0.34 to ~2.56 atm.
- **Rain:** below boiling − 5 K; leaks 0.5%/s above. **First rain** returns ≤ 90% of the water you brought.
- Heat itself: [asteroidgameplay.md](asteroidgameplay.md) → Heat; starlight: [stargameplay.md](stargameplay.md).

### Burn-up

- `burnShare`, `reachGround`: s_b = 0.004·√min(p, 10) of your mass (0.20 / 0.40 / 0.80 / 1.26% at 0.24 / 1 / 4 / 10 atm).
  A fast body below s_b burns up, joining you as dust with a quarter of its heat (`BURN_HEAT`; user: burn-ups still warm a
  little); up to 4·s_b it partly lands.
- From Age II any body under min(4·s_b, `BURN_MAX` 1%) burns at any speed; nothing from 1% is slowed by air (user,
  2026-11-14). Bigger hits: [asteroidgameplay.md](asteroidgameplay.md) → Differences from the design doc.
- Streak: embers and a small flash; no shake, sound or text.

### Calm

- Bombardment B = 0.15 + 0.85·exp(−S/120) (S = seconds under 2 own D/s, reset after a full view) scales Age II meteors,
  the aimed share and comets ([gameevents.md](gameevents.md)); voids are quiet.
- Parked at 31.6k (undated): void 0 hits ≥ 20 K in 30 min; settled dense belt 1 per 10 min; fresh belt ~1 per 1.5 min.

### Life

Concept 1's conditions (water, metal, field, temperature) are four scores with air (`planet/rules.ts`, `stage.ts`).

- **Scores** 0..1: water 10% → 30% (full to 60%, halves toward 90%); temperature only while liquid, full from 281 K to
  boiling − 30 K; air 0.2 → 0.7 atm (falls past 10–30); field = min(2, metal × diff / 6%) × size, ≤ 1 (user, 2026-11-15:
  more metal makes it stronger).
- **Life speed** = min(water, temp, air) × (0.5 + 0.5·field) × `radioLife`; all four > 0 to start.
- **Rad and life** (user, 2026-11-15: low rad still allows life): × 1.00 / 1.13 / 1.25 (best) / 1.13 / 1.00 / 0.83 / 0.58
  / 0.25 at 0 / 0.5 / 1 / 2 / 3 / 5 / 8 / ≥ 12%. Below ×0.6 the tip reads "High rad: life is slow · eat plain rock to thin
  it"; with a civilization the share is a dose ([civilizationgameplay.md](civilizationgameplay.md) → Energy and dose).
- **One step: LIFE** (user: the six-stage ladder took too long): while all four hold, life fills 30 s at speed 1 ("Life
  emerging"), then LIFE: Age II ends, the civilization starts ("Age II complete · An intelligent species looks up at you")
  unless past Super-Earth on the gas line. It keeps filling to 45 s as a buffer (drain 0.5 s/s); frozen seas only pause.
  LIFE in 29 s ideal (2026-11-16).
- **Setbacks** by delivered heat: ≥ 20 K −10 s ("Impact winter"); ≥ 150 K wipes life ("Mass extinction"). Never ends the
  run. From LIFE bodies meet the shield first ([civilizationgameplay.md](civilizationgameplay.md) → Shield).

### Moons

Code: `core/orbits.ts`, `planet/moons.ts`.

- **Slots:** 1–5 at 10^3.5 / 10^4 / 10^4.5 / 10^5 / 10^5.5, slot k at R·(2.4 + 1.25k), the fifth at 7.4 R (user,
  2026-11-14; 2026-11-15: around 5 moons, not 7, none overlapping). No moon wider than `MOON_R` 0.45 R.
- Kinematic, the old game's way: spring 0.25 s, rate √(μ/a³). `moons.fit()` keeps the outer slot on screen. Free slots are
  faint drifting dashed circles.

#### Capture by match

User, 2026-11-14: match its velocity to bring it into orbit, like the old game. No click, no automatic catch (`catchStep`,
`matchQuality`, `matchStep`).

| Part | Rule |
|---|---|
| Who | any free body (meteors too), a rival's rock on its circle and a living rival world's guard moon; not your moons or planets, rival worlds, great comets (`handsOff`), or one let go < 3 s ago |
| Size | 0.2–12.5% of you (`MOON_SHARE`), ≤ 0.45 R wide (`moonCap`) |
| Ring | any free slot, the nearest (`pickSlot`; user, 2026-11-15: any orbit I choose) |
| Lane / window | ±0.5 R (`LANE`); `MATCH_V` 1 D/s or 0.6 × circular speed if larger |
| Fill / drain | q = 1 − (v / window)²: `MATCH_S` 1.5 s at a perfect match; out of lane or window empties in 0.5 s |
| Grip | on your lowest free ring, slower than 2 × the window; elsewhere from match quality 0.5: your pull is cancelled |
| Candidate | one at a time: the filling one, else the nearest that would fill, then the slowest |
| Caught / break | your moon where it is, keeping its travel and look; breaks above √2 × circular speed or when shattered |

- Drift-ins use the same ring; from ~10^6.8 your pull at the inner slot beats your thrust (a hard catch, accepted). Moons
  skip free gravity and never touch you; one that outgrows 12.5% or 0.45 R rains the excess onto you.
- A rival's rock and your moon flown into a rival world meet shells and ground like any body (`hitWorld`).
- **Feedback** (no text, no velocity line; user, 2026-11-14): the candidate's ring brightens and closes as it fills, others
  dim; a sweeping arc on it (cyan; green if stolen); too big shows the dashed size ring. Sounds `grip`, `snap`, `capture` /
  `steal`; hint "Catch a moon" once.
- **Playing it:** fly to it, brake onto the lit ring, feather until the arc fills, hold 1.5 s. Touch: near the lane with a
  candidate within 4 D/s, the stick's wanted velocity is measured from the candidate's.
- Measured (capture.test.ts, 2026-11-16): a naive pilot catches a drifting 2% body in 7.0–11.3 s from 10^3.5 to 10^6.5 at
  any frame rate; fly-bys never start a ring; a rival's rock, matched, in ≤ 1.52 s, never sitting still.

#### Stealing

- The old game's rule: a theft if the body orbited another host when its ring started (`hostOf`: a ≥ 4× body within 8
  radii) or was let go within 30 s (`markFreed`): green arc, sparks, "stolen", a toast; "Moon thief", "Master thief" (10).
- **Mid-fight** (user, 2026-11-15): a rival's rock still on its circle can be stolen, no defeat needed; hold it on one of
  your free rings with thrust (no grip). It turns against its world's orbit round you, so sitting still never catches it.
  A new one grows after 30 s.
- A beaten rival world mined down to ≤ 12.5% is caught the same way.

#### What a moon does

- **It orbits its slot:** that is the guarding (no guard mode, no running to threats; user, 2026-11-14). No roles, no Sling
  (user, 2026-11-14: too easy). No moon makes energy. Every moon is mined and used up
  ([civilizationgameplay.md](civilizationgameplay.md) → Miners on moons).
- **Select and grind** (user, 2026-11-14): right-click / E selects a moon (`moons.inspect()`); holding Command grinds `FEED`
  0.015 of your mass a second onto you as dust, no heat (a 12.5% moon ~8 s; "Moon ground down").

### Planetary survival (concept 6)

| Threat | Protection | Where |
|---|---|---|
| Fast small bodies | burn-up (s_b grows with pressure) | Burn-up |
| Impacts | `worldHeat` (+90 K at 1%, +1000 K at 5%, +4000 K at 12.5%); a solid world bounces; heat cools over minutes | [asteroidgameplay.md](asteroidgameplay.md) → Differences from the design doc |
| Medium hits | moons; from LIFE shield and ships | [civilizationgameplay.md](civilizationgameplay.md) → Shield |
| Bombardment | settle: B → 0.15; voids quiet | Calm |
| Hits through | ≥ 20 K −10 s, ≥ 150 K wipes life; never ends the run | Life |
| Gas | sticky gas line | World tiers |
| Pirates | shield, stock, ≤ 2% water + air a raid | [gameevents.md](gameevents.md) → Pirates |
| Losing your world after star control | a living colony carries on (Q3) | [stargameplay.md](stargameplay.md) → Colonies and terraforming [L] |

- Losing LIFE [F]: the civilization sleeps unless a colony keeps it awake ([civilizationgameplay.md](civilizationgameplay.md)
  → Start). **Destabilized planets** [L] (concept 5): a system planet or colony with gas ≥ 20% at ≥ 10^5 leaves its ring;
  your home world keeps the sticky line and Brown dwarf ending.

## Planned

- A gas world becoming a brown dwarf (concept 5); the rest of concept 6 is carried by [F], [E], [G], [L], [B].

## Open issues

- Orbiting moons block only what crosses their path.
- **Debug LIFE route collapses** (undated): the air rains out and the civilization sleeps within 15–35 s.
- Not built: banded gas giants. Stale comment: the `planet/rules.ts` header lists radioactive rock as a heat source.
- Cross-cutting: [vision.md](vision.md) → Open issues.

## Decisions

Standing: [README.md](README.md).

- **Growth never stops play** (user): no "keep going" card; after Age I a death offers "Continue as a planetoid".
- **Moons sit well clear of you** (user): ≤ 5, ≤ 0.45 R; caught by matching on any free ring (user, 2026-11-15); lasso,
  tether, click capture and rival tether removed (2026-11-14); lost moons won back or stolen the same way.
- **Burn-ups still warm a little** (user): a quarter of the heat.
- **One life step: LIFE** (user, 2026-11-13).
- **Moon gifts and passive moon effects removed** (user, 2026-11-13); miners use every moon.
- Q1 orbits automatic, Q3 last living planet, Q6 Collector role removed, no Sling (2026-11-14): [vision.md](vision.md) →
  Open decisions.
