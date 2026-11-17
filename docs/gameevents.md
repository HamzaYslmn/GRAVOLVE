# Game events

What happens to you rather than what you do: meteors, comets, giant clashes, pirates, and the planned events director.
Code: `evolution/asteroid/field.ts` (meteors, shower, comets, clash, discoveries, places, encounters),
`evolution/civilization/pirates.ts`, `escape.ts` and the pirate block of `civilization/rules.ts`. Rivals:
[aliencivilizations.md](aliencivilizations.md); ship flight: [shipsandflight.md](shipsandflight.md); the field:
[worldgen.md](worldgen.md). Labels: [README.md](README.md). **[D n]** = pending decision (Decisions); **[B]**, **[M]** =
package IDs ([vision.md](vision.md) → Wave plan).

## Built

### What runs today

Independent Poisson clocks, no director yet (as in the old game).

| Stream | Code | Rate | Note |
|---|---|---|---|
| Meteors | `field.ts` `meteors` | mean 10 s, 1 in 10 a shower of 2–4; 1–20% of you in Age I, 0.1–1% from Age II (`METEOR_SHARE_AGE2`), ≤ 10^4; cross in 0.8–1.3 s | 12% aimed near you (20% in Age I); Age II × bombardment × max(0.05, density), none aimed in voids |
| First shower | `SHOWER_AT` | once, 20–30 s into Age I | 3–4 of 2–10%, missing a still player by ≥ 4 radii |
| World comets | `comets` | mean 75 s (× bombardment in Age II), 1–12%, 3–7 own D/s | never aimed |
| Great comets | `greatComets` | mean 240 s, 0.5–3× you, 1.5–3 D/s | pass 0.5–0.8 half-diagonals away, `held`, shed ≤ 40 ice crumbs; 5 passes in 1,275 s parked, 0 contacts |
| Age I rivals | `field.ts`, `asteroid/rival.ts` | by travel, none before 15 s | [aliencivilizations.md](aliencivilizations.md) → Age I cores |
| Giant clash | `giants` | mean 300 s, 3–12× you | Age I only |
| Discoveries | `discover` | 0.12 per screen | [worldgen.md](worldgen.md) → Places |
| Places | `discover` | fields 0.06, giants 0.02 per screen | fields on filaments; giants 20–200×, drifting |
| Encounters | `field.ts` | 0.25 per screen | 1.5–6× you, drifting |
| Pirates | `pirates.ts` | one fleet at a time, every age | Pirates |
| Rival worlds | `rivals.ts` | travel × local density (`pace`), from the civilization | [aliencivilizations.md](aliencivilizations.md) |
| Star flares | `star/stage.ts` | mean 20 s near a star | [stargameplay.md](stargameplay.md) → Approach |

### Meteors and comets

- **Meteors:** local material, 25% piles, 10% binaries; the unaimed ones cross a disc 3× the view's half-diagonal.
  Age II rate: [planetgameplay.md](planetgameplay.md) → Calm.
- **Heat** (Age II): `worldHeat`, +90 K at 1%, +1000 K at 5%, +2862 K at 10% (slow); Age II meteors mostly burn up; big
  hits are world comets and natural infall. Rules: [asteroidgameplay.md](asteroidgameplay.md) → Differences from the
  design doc.
- **Biomes:** Firefall Belt × 4 meteors; Frost Reach comets × 1.75, a Kuiper belt × 3 ([worldgen.md](worldgen.md) → Biomes).

### Giant clash

- Age I only, one at a time, mean 300 s (skipped if the heavier would pass M_MAX 10^4). Two giants of 3–12× you (the
  lighter ≥ half, no net momentum) drift in from off screen over 20–40 s (`CLASH_S`) and meet near the screen edge
  (0.85–0.95 of the way to it), hitting at the speed that gives the heavier `CLASH_D` 1.2–3 damage, so both shatter. Dust
  ring, flash, boom, shake; 0.6 s slow motion only if near and both outweigh you. Dev `field.clash()`.
- Checked (field.test.ts, 2026-11-16, 8 seeds): 6 met after 24.6–36.6 s, damage 1.20–2.86, never touching a parked player.

### Pirates

Nomad fleets in every age (user, Q2) that crack rocks, haul pieces and raid worlds. Redesigned 2026-11-14 (user: never
into planets, every group with a cargo ship). One combat per run (`main.ts`, `__g()`): Age I flies only pirates; from
Age II the planet stage attaches its moons. Flight: [shipsandflight.md](shipsandflight.md) → Pirate flight.

- **When:** one fleet at a time; the first 30–60 s into the run (respawn: a fresh wait), then a Poisson gap of mean 40 s
  after one is gone. Attacks on you are due from LIFE, every 60 s + Poisson mean 180 s.
- **Fleet:** `fleetSize(u)` = 1 + ⌊14u²⌋ (1–14, no escalation). A lone ship is a gunless scavenger hauler. Bone hulls,
  orange flares and rounds.
- **Shields** (user, 2026-11-17; `escape.ts`): soak rounds and rocket blasts before the hull; back 4 s after the last hit,
  one round every 2 s. A rocket's direct hit and any body kill outright. Faint rust bubble, a flare per soak, a white pop
  on breaking (`bolts.ts`). A spooling ship has none.

| Class | How many | Shield, hull (rounds) | Speed | Gun |
|---|---|---|---|---|
| Raider | the rest | 1, 1 | cruise 4–5.5 R/s | 6 R, ±0.25 rad, 3 at 6/s, 0.9 s apart |
| Hauler | max(1, round(n/5)) | 2, 2 | 0.8 × | none; holds 100 u, ≤ 20 u of your stock |
| Marauder | 1 from 10 ships | 3, 4 | 0.8 × | 9 R, ±0.2 rad, 5 at 5/s, 1.5 s apart, 3 rock hits a round |

- **Lifecycle:** cruise → work (a rock) or raid (a world) → leave. Appears 1.05 half-diagonals out on a lane within 0.4
  half-widths of the centre (it crosses the screen); two empty lanes and it leaves.
- **Targets** every 0.5 s: value / (1 + distance / 10 R) over what is on screen within 0.75 half-diagonals: you 3 (only
  while an attack is due and you are awake), a rival world 2, a rock of 0.5–25% 0.5 + ice and metal share + ≤ 1 for
  neighbours, a loose 0.1–0.5% piece 0.4 (hauler room). Never moons, meteors, comets, fast or held bodies, or rocks whose
  runs would cross your moon system. Kept ≥ 4 s.
- **Jobs:** gun (strafing runs, ≤ 3 a target), haul (brake beside a claimed piece, 0.8 s tractor, aboard), guard (a
  stand-off 3.5 R past the target, out of bodies and your moon system), form. An enemy ship within 6 R of a hauler or 4 R
  of the fleet draws ≤ 2 raiders until dead or 9 R off.
- **Work:** clamp(round(3 + 40 × share), 3, 12) hits crack a rock into 2–5 pieces of 0.25% of you (80%, flung 0.6–1.2
  radii/s; the rest dust); over 0.5% cracked again, 0.1–0.5% hauled whole. Pieces are real bodies: take them first. A rock
  about to crack keeps the fleet out of the fling; their own pieces are tractored off ships (≤ 0.3 R/s).
- **Raid:** gun runs at you or a rival world, ships first, only after `T_SEE` 6 s on screen. Moons are cover: any body
  stops a round and the fleet holds fire with one on the line. Haulers and guards wait outside your moon system.
- **Harm caps** (user, 2026-11-13): a shielded world loses 3 K a round; an open one 1 u of stock into a hauler (≤ 20 u
  each); with both gone a chip of 0.02% of your mass as water or air, ≤ 2% a raid.
- **Evasion:** a hauler drops its line and runs 2 s to a guard; a body on course scatters the fleet 2 s. Below 10 R/s only
  haulers can be rammed; from 10 R/s raiders too; flying off at ≥ 10 R/s escapes a raid (2026-11-15).
- **Fighting back:** ram, drag them through a belt (bodies closing > 3 × cruise are not dodged), a rocket's direct hit,
  rounds and blasts (shield, then hull); your defence ships and rival patrols hunt them. A tractoring hauler is nearly
  stopped. A destroyed hauler bursts 80% of its hold into 1–4 pieces and returns your stolen stock × 1.5 ("Loot
  recovered"). Wrecks within your fire range also give salvage: [civilizationgameplay.md](civilizationgameplay.md) → Stocks.
- **Leaving:** holds full, after 60–90 s, half the ships or every hauler lost, or a raid ends (20–40 s, the leash, the
  target gone): they form round the haulers and fly straight out (±0.3 rad); gone past 1.3 half-diagonals.
- **Rout and jump** (user, 2026-11-17; `escape.ts`): a leaving fleet is routed under 20% of its ships (from 6 ships up) or
  while pressed (hit or killed in the last 3 s, or you within 12 R closing faster than a quarter of their cruise); routed
  it flies at full cruise. 8 s after the rout (14 s after leaving at most) each ship on screen spools 0.9 s (haulers
  first, the rest 0.5–1.7 s after): no shield, straight, one round kills it; then it jumps. Off-screen ships are just
  gone. Jumped ships leave no wreck or loot and the fleet is not "destroyed". Look: a growing rust glow, flickering core,
  closing ring, spiralling sparks and a nose spike; then a white streak 60 ship radii ahead in a rust glow fading over
  0.7 s, a flash and a shock ring. Sound `warp`: 0.9 s rising whine, then click, thump and falling whoosh.
- **Toasts:** "Pirate fleet"; "Pirate fleet destroyed"; "Loot recovered"; "Pirates jumped away" (no chime). Achievement
  "Bounty" ([hudandcontrols.md](hudandcontrols.md)).

Checked (pirates.test.ts, Node, fake world):

- 2026-11-16: a 60 s raid on 500 u takes 21.3 u unshielded, 12.0 behind L1, 10.3 behind L2; an empty store loses 0.207% as
  water and air. Raids round 4 moons and 5 rocks: 0 body deaths, 0.71–0.72 hits/s. Work: 60% of rounds hit, 0 deaths.
  Full holds: gone after 8.4 s. A 1 R body at 4 × cruise kills a fleet of 8; charging at 20 R/s rams every ship.
- 2026-11-17: a raider's first round is soaked, the second kills; shields back after 6 s; a direct rocket hit kills a
  shielded ship; a half-killed fleet of 10 routs and its 5 survivors jump 10.4 s after leaving. Browser: 14 ships jumping
  on screen, frame mean 1.75 ms (1.83 before).

Standing rule: **pirates never destroy a world or kill you** ([README.md](README.md)). Cost:
[techandperformance.md](techandperformance.md).

## Planned

### Events director (proposed; no code yet)

User: "constantly show users something new … a pirate fleet that fires on random planets and steals their resources …
other random events too. Let's increase fun." Featured events on top of the ambient streams; proposed `core/director.ts`
and `director.test.ts`.

**Ground rules:**

1. Ignoring is always valid and always leaves something to collect or see.
2. Danger is seen, never told: body, wells, a natural pre-cue, sound.
3. A threat is on screen ≥ `T_SEE` before it can touch a still player: 3 s Asteroid, 6 s from Forging on, 10 s epic.
4. Fast things are small (> 5 own D/s only ≤ 15% of you), big things drift (≥ 1.15× never on a path meeting a still player).
5. Shows happen 0.5–1.0 view half-sizes from you; off-screen harm is capped and leaves aftermath.
6. Small rocks stay common; events add bodies, never remove the belt.
7. Budget: ≤ 120 event bodies, ≤ 300 event sprites, ≤ 0.3 ms a frame.

**Def** (sketch): `{ id, stages, tier: minor|major|epic, kind: spectacle|opportunity|threat, every, cooldown, weight(ctx),
ready(ctx), start(ctx) }`; stage modules register defs; the clash moves into the director first.

**Scheduling:** spectacles tick in real time, threats with dt × B, opportunities faster while you roam; featured gap
`poissonGap(mean)` per stage; weight = base × place × novelty (× 2 unseen this run, × 3 never on this device,
`gravolve.seen`); ≤ 1 major and ≤ 2 minors with a calm window after a major; an opener 20–40 s after each handover; a
first-sighting toast **[D 9]**.

| Stage | Mean gap (min–max) | Major share | Calm after major | Threat min gap | Opener |
|---|---|---|---|---|---|
| Asteroid | 40 s (20–90) | 25% | 30 s | 60 s | meteor storm |
| Forging | 50 s (25–110) | 30% | 40 s | 90 s | planet clash |
| Living | 75 s (35–180) | 25% | 60 s | settled 10 min, roaming 3, void 15 | life-bearing comet |
| Civilization | 55 s (30–120) | 30% | 45 s | 3 min | trade convoy |
| Star takeover | 60 s (30–130) | 35% | 50 s | 2.5 min | superflare |
| Expansion | 50 s (25–110) | 35% | 45 s | 2 min | megastructure sighting |

Target: ≥ 3 distinct events per 5 min at every stage.

### Event catalogue

All Planned unless marked Built; sizes relative to you.

| Stage | Event | What you see and do | Size, rarity |
|---|---|---|---|
| Asteroid | Meteor storm (minor threat) | 8–16 cross over 6–10 s from one side; dodge or eat | 0.3–5%; ~1 / 2.5 min |
| Asteroid | Clash at every size (major) | the giant clash (Built) leaving 20–40 fragments to harvest | 3–12× Age I, 0.5–3× later; ~1 / 4 min |
| Asteroid | Migrating swarm | 30–80 small rocks flowing as one river | 0.05–1%; ~1 / 3 min |
| Asteroid | Rival brawl | two rivals fight over a rock; take the wreck | 0.35–2×; ~1 / 3 min |
| Asteroid | Comet breakup | 3–6 nuclei to chase for ice | 2–12%; ~1 / 4 min |
| Asteroid | Hot vein | 5–10 glowing green rocks in a dark stretch; reward to redesign | 0.5–3%; ~1 / 5 min |
| Forging | Planet clash (major opener) | two young worlds collide beside you; harvest water and core debris | 0.5–3×; mean 180 s |
| Forging | Great comet — **Built** as a stream | tails and ice crumbs; catch it as an icy moon | 0.5–3×, mean 240 s |
| Forging | Comet storm (major) | 5–12 comets in parallel over 30–45 s | 1–8%; ~1 / 6 min |
| Forging | Rogue planet (major) | a dark wanderer drags a wake and tugs moons | 2–8×, ≤ 1.5 D/s; ~1 / 6 min |
| Forging | Easy moon | a slow binary, one moon-sized | 0.5–5%; ~1 / 4 min |
| Forging | Outgassing | steam vents after a big meal; free air | hot, holding air |
| Living | Life-bearing comet (opener) | merge it gently for life and water | 0.5–2%; ~1 / 5 min |
| Living | Shooting-star shower | small rocks burn up; dust joins you | ~1 / 4 min |
| Living | Dinosaur killer (major threat) | a slow big rock visible > 10 s out; block, priority or move. Needs rework: a slow 8–12% hit now wipes life | 8–12%; ≤ 1 / 10 min |
| Living | Supervolcano | lava glow, ash 30 s; −20–40 K, +gas | ~1 / 8 min |
| Living | Life bloom | life speed × 2 for 60 s when all scores > 0.6 | once a life stage |
| Living | Nebula crossing (major) | coloured fog; +gas and ice, −15 K | 6–15 screens |
| Living | Gamma-ray burst (epic) | a beam sweeping the sky 4 s; field, air and shield protect | once a run, ≥ 15 min |
| Civilization | Trade convoy (opener) | neutral freighters; leave for +10–20 ore, or raid and anger rivals 5 min **[D 8]** | 4–8 ships; ~1 / 4 min |
| Civilization | Refugee fleet | let them land for +0.5–1 bn | 5–12 ships; ~1 / 6 min |
| Civilization | Derelict probe | touch or Command it; 15% it wakes and fires 20 s **[D 7]**; reward to redesign | ~1 / 6 min |
| Civilization | Golden asteroid | catch as a moon: metal × 3 | 0.5–3%; ~1 / 6 min |
| Civilization | Rival civ war (major) | two rival worlds fight; join or loot | ≥ 2 rivals loaded |
| Civilization | Pirate flagship cache | a marauder drops a cache; needs a new reward | fleets of 10+ |
| Civilization | Richer targets | fleets come more often to richer targets | — |
| Star | Superflare / CME (major opener) | a prominence then a plasma cloud; shield absorbs, link pauses | dose × 10 for 8 s; ~1 / 3 min |
| Star | Sungrazer | a comet breaks up at the star | 1–5%; ~1 / 4 min |
| Star | Rival star claim (major) | another civ's filaments reach for your star | ~1 / 8 min while linking |
| Star | Planet migration (major) | a gas giant drifts inward | ~1 / 10 min |
| Star | Pirate Dyson raid (major) | pirates haul off Dyson panels | ≥ 2 segments |
| Expansion | Supernova shock (epic) | a shell front over 60–90 s; heavy-metal dusting | ≤ once / 20 min |
| Expansion | Black hole passage (epic) | slingshot past or drag pirates in; too close is death **[D 6]** | 10–100×, ≥ 1 view away |
| Expansion | Ancient megastructure | stay 30 s for two Dyson segments or a colony ship | 1 / ~40 screens |
| Expansion | Colony aftermath | hunt the raiders for its stock | loss ≤ 10% |
| Expansion | Invasion fleet (epic) | the old game's Invaders missions | ≤ 3 waves of ≤ 30 |
| Expansion | Stellar nursery | a new star to take over | 1 / ~30 screens |

**Verification (proposed):** a simulated hour per stage within ±20% of the pacing table; each event through a dev hook in
a visible tab; a 20 min parked fairness soak (no harm from anything not on screen ≥ `T_SEE`).

## Open issues

- **[B] Pirates go unseen** (playtest, undated): Age I on screen in 0 of 138 samples; Age II the attack was never due in
  ~380 s.
- **[B] What "avoid them" means for an asteroid** (Q2) beyond competing for food.
- **[M]** A raid on you costs 3–4 shuttles per 20 s. **[B]** Chipped water / air pieces mostly fall back (easy to catch).
- The flagship cache and derelict probe rewards named a tech step that no longer exists. None of [D 1]–[D 12] answered.
- Natural infall on a parked world: [vision.md](vision.md) → Open issues.

## Decisions

Standing ([README.md](README.md)): fun first; danger is seen, never told; fast things are small, big things drift;
**pirates never destroy a world or kill you**.

- 2026-11-13 (user): raids on you start with the civilization (then with the mass driver; superseded 2026-11-17:
  [civilizationgameplay.md](civilizationgameplay.md) → Rockets).
- 2026-11-13 (user): pirates loop round their target between waypoints (the old game's way).
- **Q2, when pirates appear** (user, 2026-11-13): always present, avoided as an asteroid, random-size groups, attacks only
  after LIFE, unpredictable and rare.
- **Pirate harm** (user, 2026-11-13): capped; with shield and stock gone ≤ ~2% water / air a raid as catchable pieces.
- **Pirate fleet size** (user, 2026-11-13): random 1–14, no escalation.
- **Keep pirates as harsh as this** (user, 2026-11-17): no softening of raids, fleet sizes or timers.
- **Ship shields, rout and jump** (user, 2026-11-17): light shields; a losing, pressed fleet jumps to light speed with a
  cinematic effect; jumped ships drop nothing.
- **Salvage** (user, 2026-11-17): [civilizationgameplay.md](civilizationgameplay.md) → Stocks.

Pending (events plan, 2026-11-13; "yes" = the game master's default):

| # | Decision | Recommended | Status |
|---|---|---|---|
| D1 | Pacing ~40 s (Asteroid) to ~75 s (Living), never two big at once | yes | open |
| D2 | Novelty per device (`gravolve.seen`) | yes | open |
| D3 | Pirates from Civilization with a sighting in Living | — | settled by Q2 |
| D4 | Pirates never destroy a world or kill you | yes | settled |
| D5 | Every event leaves something | yes | open |
| D6 | Black hole can kill (alt: only shreds moons) | yes | open |
| D7 | Derelict probe 15% bad outcome | yes | open |
| D8 | Raiding convoys angers rivals 5 min | yes | open |
| D9 | Name events on first sight | yes | open |
| D10 | Clash 3–12× Asteroid, 0.5–3× later | yes | open |
| D11 | Settled Living world: threats inside the calm budget | yes | open |
| D12 | Director and clash first | yes | open |
