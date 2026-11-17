# Game events

What happens to you rather than what you do: meteors, comets, giant clashes, pirates, and the planned events director
with its catalogue. Code: `evolution/asteroid/field.ts` (meteors, first shower, comets, great comets, giant clash,
discoveries, places, encounters), `evolution/civilization/pirates.ts` and the pirate block of `civilization/rules.ts`.
Rivals: [aliencivilizations.md](aliencivilizations.md); ship flight: [shipsandflight.md](shipsandflight.md); the field:
[worldgen.md](worldgen.md). Labels: [README.md](README.md). **[D n]** = a pending decision (Decisions); **[B]**, **[M]** =
package IDs ([vision.md](vision.md) → Wave plan).

## Built

### What runs today

Independent Poisson clocks with no awareness of each other: no "an event is running", no novelty, no quiet periods, no
director yet, as in the old game.

| Stream | Code | Rate | Note |
|---|---|---|---|
| Meteors | `field.ts` `meteors` | Poisson mean 10 s, 1 in 10 a shower of 2–4; 1–20% of you in Age I, 0.1–1% from Age II (`METEOR_SHARE_AGE2`), ≤ 10^4; cross the screen in 0.8–1.3 s | 12% aimed near you (20% in Age I); Age II rate × bombardment × local density, none aimed in voids |
| First shower | `field.ts` `SHOWER_AT` | once, 20–30 s into Age I | 3–4 meteors of 2–10%, missing a still player by ≥ 4 radii |
| World comets | `field.ts` `comets` | mean 75 s (× bombardment in Age II), 1–12% of you, 3–7 own D/s | never aimed |
| Great comets | `field.ts` `greatComets` | mean 240 s, 0.5–3× you, 1.5–3 own D/s | pass 0.5–0.8 view half-diagonals away, `held`, shed up to 40 ice crumbs |
| Rivals | `field.ts`, `asteroid/rival.ts` | by travel, none before 15 s | [aliencivilizations.md](aliencivilizations.md) → Age I cores |
| Giant clash | `field.ts` `giants` | mean 300 s, 3–12× you | Age I only (Giant clash below) |
| Discoveries | `field.ts` `discover` | 0.12 per screen | swarm / moonlets / stream: [worldgen.md](worldgen.md) → Places |
| Places | `field.ts` `discover` | fields 0.06, giants 0.02 per screen | fields on web filaments only; giants 20–200× you, drifting |
| Encounters | `field.ts` | 0.25 per screen | 1.5–6× you, drifting |
| Pirates | `civilization/pirates.ts` | one fleet at a time, every age | Pirates below |
| Rival worlds | `civilization/rivals.ts` | by travel, from the civilization | [aliencivilizations.md](aliencivilizations.md) |
| Star flares | `star/stage.ts` | mean 20 s near a star | [stargameplay.md](stargameplay.md) → Approach |

### Meteors and comets

- **Meteors:** local material, 25% piles, 10% binaries, tumbling. 12% are aimed through your area (20% in Age I), the rest through a disc 3× the view's half-diagonal. Age II: × bombardment × max(0.05, density) ([planetgameplay.md](planetgameplay.md) → Calm).
- **Heat on your world** (Age II): a hit heats it by `worldHeat`: slow, +90 K at 1%, +1000 K at 5%, +2862 K at 10% (× (V / stick speed)² faster). Age II meteors mostly burn up (under 1%); the big hits are world comets (1–12%) and natural infall. Rules: [asteroidgameplay.md](asteroidgameplay.md) → Differences from the design doc.
- **Comets:** world comets fly random lines with a coma and vapour tail. Great comets are `held` (out of gravity); parked 1,275 s: 5 passes, 0 contacts (measured, undated).
- **Biomes:** the Firefall Belt quadruples the meteor rate; Frost Reach makes world comets 1.75× as often, a Kuiper belt 3× ([worldgen.md](worldgen.md) → Biomes).

### Giant clash

- Age I only, one at a time. Poisson mean 300 s; the timer re-arms when it fires, and the clash is skipped when the heavier giant would pass M_MAX (10^4), so the next try is a full gap later.
- Two giants of 3–12× you (the lighter at least half the heavier, no net momentum) start off screen (the heavier 1.6 half-diagonals from the meeting point, the lighter farther) and drift in over 20–40 s (`CLASH_S`), each steered toward the other every frame.
- They meet across your line of sight, on screen near its edge: 0.85–0.95 of the way from you to the edge, per axis.
- At contact a staged impact replaces the drift: they hit at the closing speed that gives the heavier `CLASH_D` 1.2–3 damage, so both shatter. Dust ring, flash, boom, scaled shake; 0.6 s slow motion only when the hit is near you and both outweigh you (`feedback.ts`).
- Dev hook: `field.clash()` brings the next one now.
- Checked (`test/asteroid/field.test.ts`, 2026-11-16, a parked player, 8 seeds): 6 met after 24.6–36.6 s, impact 37–76 diam/s, the heavier's damage 1.20–2.86, closest pass 19.9–49.4 R; in 2 a bigger body swallowed a giant on its way. The test asserts ≥ 5 meet, damage 1.1–3.3, a closest pass over 15 R and no touch on the parked player. A coasting player can still drift into a giant's path.

### Pirates

Nomad fleets in every age (user, Q2) that crack rocks, haul the pieces off and raid worlds when they can. Redesigned
2026-11-14 (user: "they end up flying straight into planets … every pirate group should have at least one cargo ship …
redesign their entire lifecycle"). Numbers in `civilization/rules.ts` (pirate block), behaviour in
`civilization/pirates.ts`. `main.ts` makes one combat per run (in `window.__g()`): in Age I it flies only the pirates; at
Age II the planet stage attaches its moons and drives it. How they fly: [shipsandflight.md](shipsandflight.md) → Pirate
flight.

- **When:** one fleet at a time. The first comes 30–60 s into the run (the timer is set once, when the run's combat is made; a respawn makes a fresh combat and a new wait). The next comes a Poisson gap of mean 40 s after one is gone. Attacks on you are due from LIFE, every 60 s + Poisson mean 180 s.
- **Fleet:** `fleetSize(u)` = 1 + ⌊14u²⌋ ships (1–14, no escalation). A lone ship is a scavenger hauler (no gun, takes loose pieces, leaves). A rocket's direct hit and any body kill a ship outright. Bone hulls, orange flares and rounds.
- **Shields** (user, 2026-11-17; `escape.ts`): each ship has a light shield that soaks rounds and rocket blasts before the hull (raider 1, hauler 2, marauder 3); after 4 s without a hit it mends a round every 2 s. A faint rust bubble while it holds, a flare when a round is soaked, a white pop when it breaks (`bolts.ts`). A spooling ship has none.

| Class | How many | Shield, hull (rounds) | Speed | Gun |
|---|---|---|---|---|
| Raider | the rest | 1, 1 | cruise 4–5.5 R/s | 6 R off the target, ±0.25 rad, bursts of 3 at 6/s, 0.9 s apart |
| Hauler | max(1, round(n/5)): every group has one | 2, 2 | 0.8 × | none; holds 100 u, ≤ 20 u of it your stolen stock |
| Marauder | 1 from 10 ships | 3, 4 | 0.8 × | 9 R, ±0.2 rad, bursts of 5 at 5/s, 1.5 s apart, 3 rock hits a round |

- **Lifecycle:** cruise → work (a rock) or raid (a world) → leave. A fleet appears 1.05 camera half-diagonals out, in formation, on a straight lane aimed within 0.4 view half-widths of the centre (so it crosses the screen); two empty lanes and it leaves.
- **Target choice:** every 0.5 s, score = value / (1 + distance / 10 R) over what is on screen within 0.75 half-diagonals. Values: you 3 (only while an attack is due and your civilization is awake), a rival world 2, a rock of 0.5–25% of you 0.5 + its ice and metal share + up to 1 for neighbouring rocks, a loose piece of 0.1–0.5% 0.4 (while a hauler has room). Never moons, meteors, comets, fast or held bodies, or rocks whose gun runs would cross your moon system. A target is kept ≥ 4 s.
- **Jobs:** gun (strafing runs, ≤ 3 a target), haul (brake beside a claimed piece, 0.8 s on the tractor line, aboard), guard (circling a stand-off point 3.5 R past the target, kept off every body and out of your moon system), form. An enemy ship within 6 R of a hauler or 4 R of the fleet centre draws up to 2 raiders until it dies or is 9 R off.
- **Their own pieces:** a rock about to crack keeps the flag, guards and haulers out of its pieces' fling. A piece of their own work (≤ 1% of you) drifting onto a ship is nudged off by the ship's tractor (up to 0.3 R/s). Pieces spawn spread apart (no overlap at birth).
- **Work:** guns crack a rock in clamp(round(3 + 40 × share), 3, 12) hits into 2–5 pieces of 0.25% of you each (80% of it, flung at 0.6–1.2 of its radii a second; the rest is dust). Pieces over 0.5% of you are cracked again, 0.1–0.5% hauled whole. Cracked pieces are real bodies: you can take them first.
- **Raid:** gun runs at you or a rival world, ships first (your shuttles and fighters within 6 R while it is on you; rival ships), and only once the target has been on screen 6 s (`T_SEE`). Your moons are cover: any body stops a round, and the fleet holds fire when one is on the line. Haulers and guards wait outside your moon system (its outer filled slot + 1.5 R, 2.5 R with no moons); only gun runs go in.
- **Harm caps** (user, 2026-11-13): a shielded world loses 3 K a round; an open one 1 u of stock into a hauler (≤ 20 u each); with shield and stock gone, a chip of 0.02% of your mass as water or air, ≤ 2% of your water and air a raid.
- **Evasion:** a hauler drops its line and runs 2 s to the nearest guard; a moving body on course scatters the fleet for 2 s. Measured 2026-11-15 (Node): below 10 R/s only haulers can be rammed; raiders can be rammed from 10 R/s; flying away at 10 R/s or more escapes a raid.
- **Fighting back:** ram them, or drag them through a belt (bodies closing faster than 3 × their cruise are not dodged); a rocket's direct hit kills any ship (through its shield); rounds and blasts meet the shield, then the hull. A tractoring hauler is nearly stopped: the moment to hit it. A destroyed hauler bursts: 80% of its hold as 1–4 pieces of ≥ 0.1% of you, and your stolen stock × 1.5 ("Loot recovered"). **Salvage** (user, 2026-11-17; `rules.ts` `SALVAGE`, `combat.ts` `salvage`): any enemy wreck within your fire range credits your stocks with its hull metal (ore, about half its build), the reactor fuel it flew on and, on pirate ships, the crew's Water: raider 1.5 ore / 0.5 fuel / 0.3 Water, marauder 5 / 1.5 / 1, hauler 2 / 0.5 / 0.5 (plus its hold); rival fighter 1.5 / 0.3, probe and miner 1 / 0.2 (a loaded miner + 4 ore), frigate 12 / 2. A green popup shows it; farther wrecks are lost; your own wrecks give nothing. Your defence ships and rival home patrols hunt them.
- **Leaving:** when the holds are full, after 60–90 s, with half the ships lost or no hauler left, or when a raid ends (20–40 s, the leash, the target gone). Everyone forms up round the haulers and flies straight out from the view centre (±0.3 rad); gone past 1.3 half-diagonals.
- **Rout and jump** (user, 2026-11-17; `escape.ts`): a leaving fleet is routed once under 20% of its ships live (from 6 ships up) or while pressed (a ship hit or killed in the last 3 s, or you within 12 R closing faster than a quarter of their cruise); routed, it flies at full cruise. 8 s after the rout (14 s after leaving at the latest) each ship on screen spools its drive for 0.9 s (haulers first, the rest 0.5–1.7 s after, one by one): shield down, flying straight, still killable by one round; then it jumps. Ships off screen at that moment are just gone. Jumped ships leave no wreck, loot or salvage, and the fleet does not count as destroyed. Look (`bolts.ts`): while it spools, a growing rust glow, a flickering white core, an energy ring closing in and two sparks spiralling in, then a spike off the nose; at the jump, a white streak shooting 60 ship radii ahead in a rust glow, its tail chasing its head as it fades over 0.7 s, a flash crossed by a short flare and a shock ring. Sound `warp`: a 0.9 s rising whine and hiss, then a click, a thump and a falling whoosh.
- **Toasts:** "Pirate fleet" once a fleet is on screen; "Pirate fleet destroyed · Burst haulers spill what they stole"; "Loot recovered"; "Pirates jumped away · A routed fleet spools up and jumps · a spooling ship has no shield" (no banner chime: the warp sound plays). Achievement "Bounty": destroy a pirate fleet ([hudandcontrols.md](hudandcontrols.md)).

**Checked** (`node test/civilization/pirates.test.ts`, 2026-11-16; Node, a fake world, not the browser):

- **Raid harm**, a 60 s attack on a 500 u store, 3 seeds: 21.3 u stolen with the shield ignored; behind a level-1 shield 12.0 u (first theft after 33.5 s on average, shield down 13.6 s in all), level 2 10.3 u (18.9 s, 8.0 s); nothing chipped while stock lasts. An empty store: 0.207% of you chipped as water and air (at most 80% of the raid's cap). A hauler stole at most its 20 u.
- **Raids** (world + 4 moons + 5 rocks, 4 runs × 120 s at 30 and 120 fps): 8 raids, 0 body deaths, closest 5.7–7.0 ship radii off a body, haulers ≥ 1.12 × the moon-system keep-out, 0.71–0.72 hits a second a raid.
- **Work** (a 4% rock, 40 runs): 194 cracks, 146 pieces hauled, 60% of rounds hit (worst run 44%), 0 body deaths; a gun ship's longest dry spell median 5.2 s, max 10.1 s. Own pieces (10 ships, 5 rocks, 40 runs): 0 body deaths, 298 cracks, 294 hauled, 2279 shoves.
- **Leaving:** full holds → leaving after 0.47–0.49 s, gone after 8.4 s; half the ships or every hauler lost → leaving after 0.5 s.
- **Shields and rout** (2026-11-17): a raider's first round is soaked, the second kills it; a soaked shield is back after 6 s; a rocket's direct hit still kills a shielded ship. Half a 10-ship fleet killed: it leaves routed, and its 5 survivors spool and jump 10.4 s after leaving (5 wakes, no wreck, no "destroyed" news); one shot while spooling kills that ship. Browser (1280 × 720, all 14 of a fleet jumping on screen): full frame mean 1.75 ms, p95 3.0 ms, against 1.83 / 3.6 ms just before.
- **Fighting back:** one fighter burst from 6 R behind kills a straight raider 73%, a jinking one 41% (the test's own hull, no shield: a shielded raider needs a second hit). A 1 R body closing at 2 × cruise on a fleet of 8 kills 0, at 4 × all 8. Charging at 5 R/s rams none; at 20 R/s every ship (fleets of 5 and 12). Leaving a raid at 20 R/s: no rounds after, and the fleet leaves after 7.0–7.5 s.
- Cost: [techandperformance.md](techandperformance.md).

Standing rule: **pirates never destroy a world or kill you** ([README.md](README.md)).

## Planned

### Events director (proposed; no code yet)

The user's request: "constantly show users something new … a pirate fleet that fires on random planets and steals their
resources … other random events too. Let's increase fun." Fun first, then realism. Featured events run on top of the
ambient streams. Proposed files, not in the repo: `core/director.ts` and its check `director.test.ts`.

**Ground rules for every event:**

1. **Ignoring is always valid and always leaves something** to collect or see.
2. **Danger is seen, never told:** a threat shows by its body, the wells, a natural pre-cue and its sound.
3. **Visible approach:** a threat is on screen at least `T_SEE` before it can touch a still player: 3 s Asteroid, 6 s from Forging on, 10 s for epic events.
4. **Fast things are small, big things drift:** > 5 own D/s only for bodies ≤ 15% of you; anything ≥ 1.15× you never on a path that meets a still player.
5. **Shows happen where you look:** 0.5–1.0 view half-sizes from you. Off-screen harm is capped and leaves visible aftermath.
6. **Small rocks stay common:** events add bodies; none removes the belt.
7. **Budget:** ≤ 120 event bodies, ≤ 300 event sprites, event CPU ≤ 0.3 ms a frame (structural).

**Event definition** (sketch):

```ts
type EventDef = {
  id: string; stages: Stage[];
  tier: 'minor' | 'major' | 'epic';           // major/epic: one at a time
  kind: 'spectacle' | 'opportunity' | 'threat';
  every: number;                               // target mean minutes between, when eligible
  cooldown: number;                            // s before the same id may run again
  weight(ctx): number;                         // place + state (region, density, web, star near, stocks)
  ready(ctx): boolean;                         // prerequisites (moon, civ level, a star in range)
  start(ctx): EventHandle;                     // returns { done(): boolean, bodies: number }
};
```

Stage modules would register their defs; the field would grow a small spawn API beyond today's `field.spawn` and
`field.clash()`; the clash would move into the director as its first event.

**Scheduling:**

- **Three clocks:** spectacles tick with real time, threats with dt × B (settling quiets them), opportunities faster while you roam.
- **Featured gap** = `poissonGap(mean)` clamped per stage; candidates are ready, off cooldown, and fit concurrency and the threat budget.
- **Weight** = base × place × novelty (× 2 if not seen this run, × 3 if never seen on this device, `gravolve.seen`).
- **Concurrency:** ≤ 1 major and ≤ 2 minors at a time, with a calm window after a major.
- **Stage opener** 20–40 s after each handover. **First sighting:** a toast names an event once it is on screen **[D 9]**.

**Pacing per stage** (structural targets):

| Stage | Featured mean gap (min–max) | Major share | Calm after major | Threat min gap | Opener |
|---|---|---|---|---|---|
| Asteroid | 40 s (20–90) | 25% | 30 s | 60 s | meteor storm |
| Forging | 50 s (25–110) | 30% | 40 s | 90 s | planet clash beside you |
| Living | 75 s (35–180) | 25% | 60 s | settled 10 min, roaming 3 min, void 15 min | life-bearing comet |
| Civilization | 55 s (30–120) | 30% | 45 s | 3 min | trade convoy |
| Star takeover | 60 s (30–130) | 35% | 50 s | 2.5 min | superflare |
| Expansion | 50 s (25–110) | 35% | 45 s | 2 min | ancient megastructure sighting |

Novelty target: ≥ 3 distinct events seen per 5 min at every stage, plus ambient. Build order: director and the clash at
every size first, then events by stage.

### Event catalogue

Everything here is Planned unless a row says Built. Sizes and speeds are relative to you.

**Asteroid**

| Event | What you see and do | Size, rarity, needs |
|---|---|---|
| Meteor storm (minor, threat) | the first 2 pass wide, then 8–16 cross over 6–10 s from one side; dodge, or match course and eat them | 0.3–5% each; ~1 per 2.5 min; `meteors()` with a count and one source angle |
| Clash at every size (major, spectacle → opportunity) | the giant clash (Built), now leaving 20–40 kept fragments each; watch, then harvest | 3–12× you in Age I, 0.5–3× from Forging on; ~1 per 4 min in belts |
| Migrating swarm (minor, opportunity) | 30–80 small rocks flowing across the screen as one river; graze-feed in its flow | 0.05–1% each, belt flow × 2; ~1 per 3 min |
| Rival brawl (minor, spectacle → opportunity) | two rivals fight over a big rock; take the wreck or snipe the chipped winner | rivals 0.35–2× you; ~1 per 3 min |
| Comet breakup (minor, opportunity) | a comet splits into 3–6 nuclei with small comas; chase them for ice | 2–12%; ~1 per 4 min, ice regions × 2 |
| Hot vein (minor, opportunity) | 5–10 radioactive rocks glowing green (`RADIO_GREEN`, `glowBehind`) in a dark stretch; reward to be redesigned (radioactive rock no longer heats) | 0.5–3% each; ~1 per 5 min, metal regions × 2 |

**Forging a world**

| Event | What you see and do | Size, rarity, needs |
|---|---|---|
| Planet clash (major, opener) | two young worlds collide beside you, one icy, one differentiated; harvest water and metal-rich core debris (`debrisComp`, `asteroid/body.ts`) | 0.5–3× you, 0.7–1.0 half-views away; mean 180 s in belts |
| Great comet (major, opportunity): **Built** as an ambient stream | a huge dark nucleus with dust and ion tails, shedding ice crumbs; fly in its tail, or catch it as an icy moon | 0.5–3× you, mean 240 s |
| Comet storm (major, threat / opportunity) | 5–12 comets on parallel lines over 30–45 s; stand in it for water (heat cost), or step aside | 1–8% each; ~1 per 6 min near ice regions |
| Rogue planet (major, spectacle) | a dark wanderer out of a void drags a wake of rocks and tugs moons | 2–8× you, ≤ 1.5 own D/s, 0.6–1 view away; ~1 per 6 min, voids × 3 |
| Easy moon (minor, opportunity) | a slow binary pair, one the right size for a moon; catch it by match ([planetgameplay.md](planetgameplay.md) → Moons) | 0.5–5%; ~1 per 4 min while a slot is free |
| Outgassing (minor, on your world) | steam vents break through your crust after a big meal; free air, steam veil | only when hot and holding air |

**Living world**

| Event | What you see and do | Size, rarity, needs |
|---|---|---|
| Life-bearing comet (minor, opener) | a small icy comet with faint green glints; merge it gently for life progress and water | 0.5–2%, ≤ 2 own D/s; ~1 per 5 min |
| Shooting-star shower (minor, spectacle) | dozens of small rocks burn up in your air; the dust joins you | below the burn-up share; ~1 per 4 min |
| Dinosaur killer (major, threat) | a large rock on a slow collision course, visible > 10 s out; block it with a moon, set it as your priority, or move. **Needs a rework:** a slow 8–12% hit now delivers ~2,000–3,700 K and wipes life | 8–12% at 4–6 own D/s; settled ≤ 1 per 10 min |
| Supervolcano (minor, on your world) | lava glow and an ash veil for 30 s; cools you 20–40 K, +gas | ~1 per 8 min with a hot interior |
| Life bloom (minor, reward) | green spreads across the seas; life speed × 2 for 60 s when all four scores > 0.6 | once per life stage |
| Nebula crossing (major, place) | the sky fills with coloured fog; +gas and ice from dust, but −15 K while inside | 6–15 screens of filament; place-driven |
| Gamma-ray burst (epic, spectacle / threat) | a distant flare and a beam sweeping the sky for 4 s; field, air and shield protect; unprotected a soft setback | at most once per run, ≥ 15 min in |

**Civilization**

| Event | What you see and do | Size, rarity, needs |
|---|---|---|
| Trade convoy (minor, opener) | neutral freighters cross between two worlds; leave them for +10–20 ore, or raid their cargo and anger rival civs for 5 min **[D 8]** | 4–8 ships; ~1 per 4 min |
| Refugee fleet (minor, opportunity) | a fleet fleeing a dying world, sometimes chased by pirates; let them land for +0.5–1 bn people | 5–12 ships; ~1 per 6 min |
| Derelict alien probe (minor, opportunity) | a tiny dark probe drifting; touch it slowly or Command it; reward to be redesigned (it named a tech step); 15% it wakes and fires for 20 s **[D 7]** | point-size; ~1 per 6 min, metal regions × 2 |
| Golden asteroid (minor, opportunity) | a gleaming metal body passing slowly; catch it as a moon for metal × 3 to your miners | 0.5–3%; ~1 per 6 min |
| Rival civ war (major, spectacle → choice) | two rival worlds fight beside you; join one side or loot the loser | ~1 per 7 min with ≥ 2 rivals loaded |
| Pirate flagship cache | a marauder drops a cache when destroyed; needs a new reward (the tech ladder is gone) | fleets of 10+ |
| Richer targets | fleets come more often to richer targets (a mining moon doubling the weight) | pirates |

**Star takeover**

| Event | What you see and do | Size, rarity, needs |
|---|---|---|
| Superflare / CME (major, threat, opener) | a prominence swells 4–6 s, then a plasma cloud expands; the shield absorbs it, a moon's shadow cuts the dose, link progress pauses | dose × 10 for 8 s; ~1 per 3 min near a star |
| Sungrazer (minor, opportunity) | a comet dives at the star and breaks up; catch the fragments | 1–5%; ~1 per 4 min near a star |
| Rival star claim (major, threat) | another civ's filaments reach for your star; out-link them or break the filaments | ~1 per 8 min while linking |
| Planet migration (major, spectacle) | a gas giant of the system drifts inward, scattering moons and rocks | ~1 per 10 min per system |
| Pirate Dyson raid (major, threat) | pirates attack Dyson segments and haul off panels; a lost segment can be rebuilt | ~1 per 6 min with ≥ 2 segments |

**Expansion** (needs systems and colonies, not built)

| Event | What you see and do | Size, rarity, needs |
|---|---|---|
| Supernova shock (epic) | the sky flashes, a shell front crosses over 60–90 s; protected you get a dusting of heavy metals | once per 20 min at most |
| Black hole passage (epic) | a lensing disc crosses a void; slingshot past it or drag pirates in; too close is death **[D 6]** | 10–100× you, ≤ 1 own D/s, ≥ 1 view away |
| Ancient megastructure (major, discovery) | a broken ring at a web node; stay 30 s for two Dyson segments or a colony ship | 1 per ~40 screens |
| Colony aftermath (minor, place) | a colony raided while you were away; hunt the raiders for its stock | loss capped at 10% |
| Invasion fleet (epic) | waves of a rival system's ships (the old game's Invaders missions) | ≤ 3 waves of ≤ 30 ships |
| Stellar nursery (major, discovery) | protostars flicker on inside a nebula: a new star to take over | 1 per ~30 screens of filament |

### Verification (proposed)

- Director (`director.test.ts`, proposed): a simulated hour per stage; gaps within ±20% of the pacing table, never two majors at once, ≥ 3 distinct events per 5 min.
- Each event in game through a dev-only hook (proposed; today's dev hook is `window.__g()`), in a visible test tab; cost inside rule 7.
- Fairness soak: 20 min parked per stage: 0 deaths or stock losses from events not on screen ≥ `T_SEE` first.
- Realism: pirates, probes and convoys are fiction inside the same physics; rogue planets, black holes and supernovae are scaled down to shows and setbacks.

## Open issues

- **[B] Pirates go unseen** (playtest, undated): in Age I a fleet was on screen in 0 of 138 samples (closest 33 R); in Age II the attack on you was never due in ~380 s.
- **[B] What "avoid them" means for an asteroid** (Q2) is open beyond competing for food: before LIFE they never target you, only crack and haul rocks, and die if rammed.
- **[M]** A raid on you costs 3–4 shuttles per 20 s (measured, undated).
- **[B]** Chipped water / air pieces leave at 2 R/s and mostly fall back (very easy to catch).
- The flagship cache and the derelict probe reward named "the current tech step", which no longer exists.
- The director and catalogue are a 2026-11-13 plan; none of [D 1]–[D 12] has been answered.
- Natural infall on a parked Age II world: [vision.md](vision.md) → Open issues.

## Decisions

Standing ([README.md](README.md)): fun first, then realism; danger is seen, never told; fast things are small, big
things drift; **pirates never destroy a world or kill you**.

- 2026-11-13 (user): the civilization starts at LIFE with defence ships and the mass driver, so the events plan's "first raid on you only after Defence ships or the Mass driver" is void: raids on you start with the civilization.
- 2026-11-13 (user): pirates loop round their target between waypoints (the old game's way), [shipsandflight.md](shipsandflight.md).
- **Q2, when pirates appear** (user, 2026-11-13): always present, avoided as an asteroid, random-size groups, attacks only after LIFE, unpredictable and rare ([vision.md](vision.md) → Open decisions).
- **Pirate harm** (user, 2026-11-13): capped. With your shield down and stock empty, hits knock a little water / air off as catchable pieces (≤ ~2% a raid). Pirates still never destroy a world or kill you.
- **Pirate fleet size** (user, 2026-11-13): random, no escalation: 1–14 raiders, mostly small, sometimes huge; the "next one will be bigger" toast goes.

Pending, from the events plan (2026-11-13; "Recommended" is the game master's default):

| # | Decision | Recommended | Status |
|---|---|---|---|
| D1 | Pacing: a featured event every ~40 s (Asteroid) to ~75 s (Living), never two big ones at once, calm windows after each | yes | open |
| D2 | Novelty bonus remembered per device (`gravolve.seen`) | yes | open |
| D3 | Pirates from the Civilization stage with one sighting in Living | Civilization + sighting | settled by Q2: pirates roam from the Asteroid Age; no sighting |
| D4 | Pirates can never destroy a world or kill you | yes | settled: kept, with the capped chip |
| D5 | Every event leaves something; ignoring is always valid | yes | open |
| D6 | Black hole passage can kill if you fly into it (alternative: it only shreds your moons) | yes | open |
| D7 | Derelict probe has a 15% bad outcome | yes | open |
| D8 | Raiding trade convoys angers rival civs for 5 min | yes | open |
| D9 | Name events in a toast on first sight per run (alternative: no names) | yes | open |
| D10 | Clash sizes: 3–12× in Asteroid, 0.5–3× from Forging on | yes | open |
| D11 | Living world while settled: only spectacles and opportunities, threats inside the calm budget | yes | open |
| D12 | Build order: director and clash first | yes | open |
