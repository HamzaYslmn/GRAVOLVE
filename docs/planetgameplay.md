# Planet gameplay (Age II)

Age II, from the Planetoid (AGE_GOAL 10^3.5 = 3,162) to LIFE: world tiers and the gas line, your surface, water, air and
climate, burn-up, calm, life, moons, and how a living world survives (stages 2 and 3 in [README.md](README.md)). Code:
`evolution/planet/` (`rules.ts`, `stage.ts`, `moons.ts`, `hud.ts`), `core/water.ts`, `core/orbits.ts`. The handover
into Age II: [asteroidgameplay.md](asteroidgameplay.md); from LIFE on: [civilizationgameplay.md](civilizationgameplay.md);
your HUD card and controls: [hudandcontrols.md](hudandcontrols.md). Labels: [README.md](README.md).

## Built

### World tiers and the gas line (`planet/rules.ts`)

- **Above AGE_GOAL** (`tierName` / `tierIndex` / `nextGoal`, the single source):

| From | Tier |
|---|---|
| 10^3.5 | Planetoid |
| 10^4 | Protoplanet (molten) / Dwarf planet |
| 10^4.5 | Planet (Rocky planet if solids ≥ 60%) |
| 10^5 | Super-Earth / Mini-Neptune |
| 10^5.5 | Ice giant (ice + gas ≥ 60%) |
| 10^6 | Gas giant (gas ≥ 70%) |
| 10^6.5 | Super-Jupiter |
| 10^7 | Brown dwarf (never ignites) |

- **Gas line:** in at gas ≥ 20%, out below 15% (sticky; `rules.test.ts`, 2026-11-16). From 15% at ≥ Planet mass the HUD warns once. A gas world leaves the life path and ends at Brown dwarf.
- The life path closes on the gas line only from Super-Earth mass (`envelope`: m ≥ 10^5 and on the line, read in the stage's `update`). Below that a gas-line world still runs life and can start a civilization. The warning toast says so: "20% gas makes a gas world from Super-Earth mass: no surface, no life".
- A world never reads as an asteroid again: dropping below AGE_GOAL still names a planetoid. One toast per mass step; a rocky world past Super-Earth has no next tier, its goal is "make it habitable".

### Your surface

`setSurface`: seas in the low ground of the sphere's own relief, glint, frozen seas, frost, green lowlands as life
fills, teal seas when habitable, lava seams, city lights as a separate bake. One 256² bake per state, crossfaded 0.6 s.

### Water, air and climate (`core/water.ts`, `planet/rules.ts`)

- **Water** (you only): T = 120 + 430 × heat K; melts 273 K, boils 373 K at 1 atm, 273 K at the 0.05 atm triple point (below it ice sublimates).
- **Steam** is held from 0 at 10^3 to all at 10^4.5 (log). Pressure = gas × hold × 4 × max(1, m/10^4.5)^(2/3). Water boils 2%/s at ≥ 200 K over boiling; latent 40 heat per share.
- **Climate:** heat settles toward 120 K + 200·p^0.25 at rate 1 / (`RELAX_S` × (1 + excess heat units)), `RELAX_S` 10 s. A little warmth fades in seconds; a magma ocean after a moon-sized hit (+1000–4000 K) takes minutes (user, 2026-11-14).
- At rest (`rules.test.ts`, 2026-11-16): 0.3 / 0.4 / 1 / 2.5 atm → 268 / 279 / 320 / 371 K; seas are liquid at rest from ~0.34 to ~2.56 atm (computed).
- **Rain:** vapour rains out below boiling − 5 K and leaks 0.5%/s above boiling. **First rain** returns up to 90% of the water you brought (stands in for outgassing).
- Heat itself (impact heat, cooling, molten states): [asteroidgameplay.md](asteroidgameplay.md) → Heat. In Age III a star's light adds warmth: [stargameplay.md](stargameplay.md).

### Burn-up

- `burnShare`, `reachGround`: s_b = 0.004·√min(p, 10) of your mass (0.20 / 0.40 / 0.80 / 1.26% at 0.24 / 1 / 4 / 10 atm; `test/asteroid/rules.test.ts`, 2026-11-16).
- A fast body below s_b burns up: its mass joins you as dust and warms you by a quarter of its heat (BURN_HEAT; user: burn-ups should still warm a little). Up to 4·s_b it partly lands.
- From Age II any body under min(4·s_b, `BURN_MAX` 1%) burns whatever its speed; nothing from 1% up is slowed by air (user, 2026-11-14). Bigger hits: [asteroidgameplay.md](asteroidgameplay.md) → Differences from the design doc.
- Streak: embers and a small flash above the limb; no shake, sound or text.

### Calm

- Rivals arrive by distance travelled. Bombardment B = 0.15 + 0.85·exp(−S/120) (S = seconds under 2 own D/s, reset after a full view) multiplies Age II meteors, the aimed share and comets; voids are quiet.
- Parked at 31.6k (measured, undated): void 0 hits ≥ 20 K in 30 min; settled dense belt 1 per 10 min; fresh belt ~1 per 1.5 min, nearly all slow infall of big neighbours.
- The meteors and comets B scales: [gameevents.md](gameevents.md).

### Life

Code: `planet/rules.ts`, `planet/stage.ts`. Concept 1's life conditions (water, metal, magnetic field, temperature
balance) are four scores; air is the fourth.

- **Scores** 0..1: water 10% → 30% (full to 60%, halves toward 90%); temperature only while liquid, full from 281 K to boiling − 30 K; air 0.2 → 0.7 atm (falls past 10–30); magnetic field = min(2, metal × diff / 6%) × size, capped at 1 (user, 2026-11-15: more metal makes it stronger, so up to 12% sunk metal makes up for a small world's weak dynamo).
- **Life speed** = min(water, temp, air) × (0.5 + 0.5·field) × radioLife(radioactive share); all four > 0 to start.
- **Rad and life** (user, 2026-11-15: "low radiation levels should still allow life to develop"; `radioLife`, `rules.test.ts` 2026-11-16):

| Rad share | 0% | 0.5% | 1% | 2% | 3% | 5% | 8% | ≥ 12% |
|---|---|---|---|---|---|---|---|---|
| Life speed × | 1.00 | 1.13 | 1.25 (best) | 1.13 | 1.00 | 0.83 | 0.58 | 0.25 |

  Before a civilization, below ×0.6 the tip reads "High rad: life is slow · eat plain rock to thin it". Once it exists the share is a dose its people dig out into fuel: [civilizationgameplay.md](civilizationgameplay.md) → Energy and dose.
- **One step: LIFE** (user: the six-stage ladder took too long): while all four conditions hold, life fills for 30 s at speed 1 ("Life emerging"), then LIFE appears, an intelligent species: Age II ends and the civilization starts. It keeps filling to 45 s, a buffer, so a short spell of bad conditions (drain 0.5 s/s) or an impact winter does not end LIFE at once; frozen seas only pause.
- **Setbacks** by delivered heat: ≥ 20 K −10 s ("Impact winter"); ≥ 150 K wipes life out and it fills again from zero ("Mass extinction"). Never ends the run.
- `rules.test.ts` (2026-11-16): LIFE in 29 s at ideal conditions; a sample world (field 0.42, life speed 0.50) in 60 s.
- The civilization starts at LIFE (toast "Age II complete · An intelligent species looks up at you") unless the world is past Super-Earth on the gas line. From then a body meets the shield's shell before your ground: [civilizationgameplay.md](civilizationgameplay.md) → Shield.
- Life chips, bar and tips: [hudandcontrols.md](hudandcontrols.md) → HUD.

### Moons

Code: `core/orbits.ts`, `planet/moons.ts`.

- **Slots:** 1 / 2 / 3 / 4 / 5 at 10^3.5 / 10^4 / 10^4.5 / 10^5 / 10^5.5, slot k at R·(2.4 + 1.25k), the fifth at 7.4 R (user, 2026-11-14: "same for planet moons, sizes etc"; 2026-11-15: moons looked too large and overlapped, "around 5 moons instead of 7"). Moons are no wider than `MOON_R` 0.45 R, so neighbours never touch.
- Kinematic, the old game's way (real gravity cannot hold a moon against your thrust): spring 0.25 s, rate √(μ/a³). `moons.fit()` widens the camera so the outer slot stays on screen.
- Free slots show as faint drifting dashed circles; your HUD card shows a pip per slot.

#### Capture by match

User, 2026-11-14: "match our planet's velocity with the target's velocity to bring it into orbit … like in old game".
No click and no automatic catch (`planet/rules.ts` `catchStep`, `core/orbits.ts` `matchQuality` / `matchStep`).

| Part | Rule |
|---|---|
| Who | Any free body (meteors too) and a rival's rock on its circle. Not your moons or planets, a rival world, a held body, or one let go < 3 s ago |
| Size | 0.2–12.5% of you (`MOON_SHARE`) and no wider than 0.45 R (`moonCap`). Widest share (`rules.test.ts`, 2026-11-16): stony / icy / gas-rich / metallic 9.1 / 3.2 / 2.8 / 12.5% at 10^4, 1.7 / 0.6 / 0.5 / 3.4% at 10^7 |
| Ring | Any free slot, the one the body sits nearest (`pickSlot`; user, 2026-11-15: "I should be able to place moons in any orbit I choose, as long as they meet the requirements") |
| Lane | `LANE` ±0.5 R round that ring |
| Window | `MATCH_V` 1 D/s (the old game's ~0.9), or 0.6 × the slot's circular speed if larger (1.49 D/s at 10^7) |
| Fill | q = 1 − (v / window)²: `MATCH_S` 1.5 s at a perfect match, 2 s at half the window |
| Drain | out of the lane or window, 0.5 s full to empty |
| Grip | on your lowest free ring, slower than 2 × the window; elsewhere matched to 0.5: your pull on it is cancelled, so it floats |
| Candidate | one at a time: the one filling, else the nearest in-size body that would fill now, then the slowest |
| Ends | leaving the lane or window, a hit, leaving the size range, the slot filling |
| Caught | your moon where it is, keeping its sense of travel and its look ([asteroidgameplay.md](asteroidgameplay.md) → Rough bodies) |
| Break | above √2 × circular speed, or when shattered |

- Lucky drift-ins go through the same ring. From ~10^6.8 your pull at the inner slot exceeds your thrust: a hard catch, accepted.
- Moons never store with chunks and skip free gravity; yours never touch you. A moon that outgrows 12.5% of you or 0.45 R rains the excess on you as dust.
- A rival's rock on its circle meets your shell and ground like any body (`hitWorld`) and leaves its circle the moment it touches either. A moon flown into a rival world meets its shell and ground the same way.

#### Feedback

No text and no velocity line (user, 2026-11-14).

- Every free ring is equally faint. With a candidate near, its ring brightens and closes as it fills; the others dim.
- On the candidate: a bright arc sweeping with the progress (cyan; green if it will count as stolen). A body too big shows the dashed moon-size ring.
- Sounds: `grip`, `snap` (a ring past 30% lost), `capture` / `steal`. One hint toast the first time ("Catch a moon").

#### Playing it

- Keyboard: fly to it, brake so it sits on the lit ring, feather until the arc starts filling, hold 1.5 s (one 60 fps frame of thrust is 0.12 D/s at Age II start).
- Touch (`player.ts`, `moons.frame()`): near the lane with a candidate within 4 D/s of you, the stick's wanted velocity is measured from the candidate's, so centring the stick matches it.

#### Stealing

- The old game's rule: a catch is a theft if the body orbited another host when its ring started filling (`hostOf`: a ≥ 4× body within 8 of its radii) or another host let it go within 30 s (`markFreed`). Green arc and sparks, a "stolen" popup, a toast. Achievements "Moon thief" and "Master thief" (10 in a run, `THIEF`).
- **Mid-fight** (user, 2026-11-15: "I should be able to steal it during combat if I manage to match their speed"): a rival's rock still on its circle can be stolen, no defeat needed. Keep it on one of your free rings with thrust (no grip on it). It turns against its world's orbit round you, so sitting still never catches it. Taken, it leaves the rival; a new one grows after 30 s.
- A beaten rival world mined down to ≤ 12.5% is a free body, caught the same way.

#### Measured

`test/planet/capture.test.ts` (Node: `catchStep` + `entity.step`, real constants), 2026-11-16:

- A naive pilot from 30 D away catches a 2% body drifting at 0.5 D/s in 7.0 s at 10^3.5, 10.0–10.1 s at 10^5.5, 11.3 s at 10^6.5, the same at 30 / 60 / 144 fps.
- Fly-bys at 3 and 20 D/s never start the ring; a matched body closes in 1.5 s; a 0.1 s blip costs 20%.
- Parked with no input, drifting belt bodies are caught 0–1.5% of the time; 187 / 256 / 369 of 400 land on you at 10^3.5 / 10^5.5 / 10^6.5.
- A rival's rock, matched beside it, is caught in ≤ 1.52 s up to 10^6.5; sitting still, the ring never starts (270 runs).

#### What a moon does

- **It orbits its slot:** that is the guarding; whatever crosses its path hits it (no guard mode, no running to meet threats: user, 2026-11-14).
- No roles, no Sling (user, 2026-11-14: it made combat too easy; early survival comes from life, civilization and its military). No moon makes energy; star energy comes from the Dyson sphere ([stargameplay.md](stargameplay.md)).
- Every moon you hold is mined by the civilization and used up: [civilizationgameplay.md](civilizationgameplay.md) → Miners on moons.

#### Select and grind

User, 2026-11-14.

- A right-click / E tap on a moon selects it: the target panel shows it (`moons.inspect()`) until a Command elsewhere or the moon is lost.
- Holding Command on a moon grinds it down: `FEED` 0.015 of your mass a second streams onto you as dust (no hit, no heat; a 12.5% moon takes ~8 s). Letting go keeps what is left ("Moon ground down" at the end).
- Controls: [hudandcontrols.md](hudandcontrols.md) → Controls; the priority target: [civilizationgameplay.md](civilizationgameplay.md) → Priority target.

### Planetary survival (concept 6, what exists today)

| Threat | What protects the world | Where |
|---|---|---|
| Fast small bodies | burn-up in your air (s_b grows with pressure) | Burn-up |
| Impacts (Age II) | every hit heats the world (`worldHeat`: +90 K at 1%, +1000 K at 5%, +4000 K at 12.5%); a solid world bounces smaller bodies; big heat cools over minutes | [asteroidgameplay.md](asteroidgameplay.md) → Differences from the design doc |
| Medium hits | moons in the path; from LIFE the shield and ships (fighters, rockets, the frigate) | Moons; [civilizationgameplay.md](civilizationgameplay.md) → Shield, Defence ships |
| Bombardment | settling: B falls to 0.15 after a few minutes under 2 own D/s; voids are quiet | Calm |
| Hits that get through | ≥ 20 K −10 s of life, ≥ 150 K wipes life; never ends the run | Life |
| Losing a condition | life drains 0.5 s/s (frozen seas only pause); the 45 s buffer covers short spells | Life |
| Gas | the sticky gas line; past Super-Earth a gas world has no surface for life | World tiers and the gas line |
| Pirates (from LIFE, rare) | shield, then stock; with both gone each hit knocks 0.02% of you off as a water or air piece, ≤ 2% of your water + air a raid; never a world kill | [gameevents.md](gameevents.md) → Pirates |
| Losing your world after star control | a living colony: you carry on as that world (Q3, smallest version) | [stargameplay.md](stargameplay.md) → Colonies and terraforming [L] |

- Losing LIFE hurts [F]: the civilization sleeps, people fall 1/min, nothing is mined or built and the shield goes out, unless a colony keeps it awake: [civilizationgameplay.md](civilizationgameplay.md) → Start.
- **Destabilized planets** [L] (concept 5: "Excessive or unsuitable resource accumulation can destabilize planets"): for system planets and colonies, gas ≥ 20% at ≥ 10^5 makes a gas world that leaves its ring (a colony is lost with it). Your home world keeps the sticky gas line, the Brown dwarf ending and "growth never stops play": [stargameplay.md](stargameplay.md) → Colonies and terraforming [L].

## Planned

Concept 6's survival loop is carried by built systems (shield upkeep and lost habitability [F], the mining AI [E] [G],
colonies [L], the capped pirate chip [B]). Not in any package:

- A gas world becoming a brown dwarf (concept 5).

## Open issues

- Orbiting moons only block bodies that happen to cross their path.
- **Debug LIFE route collapses** (playtest, undated): after debug LIFE the air rains out and the civilization falls asleep within 15–35 s.
- Not built: banded gas giants (a Brown dwarf draws as a cratered rock).
- Stale code comment: the `planet/rules.ts` header still lists radioactive rock as an Age II heat source; radioactive matter never heats.
- Cross-cutting Age II issues (parked worlds, infall growth, steam venting): [vision.md](vision.md) → Open issues; durability: [asteroidgameplay.md](asteroidgameplay.md) → Open issues; wider voids: [worldgen.md](worldgen.md) → Open issues.

## Decisions

Standing decisions: [README.md](README.md). The ones that shape Age II:

- **Growth never stops play** (user): no "keep going" card; one body, one run; after Age I a death offers "Continue as a planetoid".
- **Moons sit well clear of you** (user): slot k at R·(2.4 + 1.25k), at most 5, no wider than 0.45 R; free slots visible but faint. Moons are caught by matching speed on any free ring (user, 2026-11-15); the lasso, tether, tug of war, click capture and rival tether were removed (2026-11-14). A lost moon is won back the same way or stolen (the old game's theft rule).
- **Burn-ups still warm a little** (user): a quarter of the heat (BURN_HEAT).
- **One life step: LIFE** (user, 2026-11-13: the six-stage ladder took too long; the doc had soup → intelligent over 480 s).
- **Moon gifts and passive moon effects removed** (user, 2026-11-13: "remove moon effects too, radioactive moon gives energy etc"); miners use every moon instead.
- Q1, orbits round your star: automatic; living and terraforming planets keep to the habitable zone ([vision.md](vision.md) → Open decisions).
- Q3, what ends a run after star control: the last living planet lost; a lost star can be replaced, and a living colony carries the run on ([vision.md](vision.md) → Open decisions).
- Q6, Collector moon role: removed; no Sling either (2026-11-14) ([vision.md](vision.md) → Open decisions).
