# Alien civilizations

Rivals: the Age I rival cores, the named roster and its off-screen ledger, rival worlds that forge and grow life, rival
civilizations you fight, their strategy AI, and defeat and spoils. Owning code: `app/src/evolution/asteroid/rival.ts`
(steering for every rival body, guard moon), `asteroid/field.ts` (when rivals come in), `evolution/rivals/ledger.ts`
(roster, off-screen life, and the pure stance and war-wave rules, checked by `ledger.test.ts`), `civilization/rivals.ts`
and the rival block of `civilization/rules.ts` (rival civilizations).
Ship factions, classes and art: [shipsandflight.md](shipsandflight.md). Pirates: [gameevents.md](gameevents.md) →
Pirates.

Labels: **measured** = run in the game or in a sim on the real formulas; **computed** = from the formulas; **checked** =
read in the code; *start value* = a first guess to tune by measurement. **[J]**, **[M]** = planned package IDs
(`vision.md`).

## Built

### Status by piece (checked against the code, 2026-11-13)

The old "plan only, nothing built" no longer holds: build steps 1–5 are done (step 1, the ship art, is in
[shipsandflight.md](shipsandflight.md)).

| Piece | File | What it does | Gap against the plan |
|---|---|---|---|
| Age I rival cores | `asteroid/rival.ts`, `field.ts` | Hunt 2–80% of their mass, flee heavier, want you 3×, tire after 4–7 s, ≤ 3 loaded; recipe hunger and a sideways dodge (step 2) | none for Age I |
| Roster + ledger | `rivals/ledger.ts`, `field.ts` | 4 named rivals per run, off-screen growth toward a share of your mass (step 3) | off-screen composition drift only by plan; no rebirth when one dies |
| Rival worlds (forging, living) | `rivals/ledger.ts`, `asteroid/rival.ts` | melt, climate, life, eat by plan, guard moon, life setbacks (steps 4–5) | no biome travel on the map; never reach civilization |
| Rival civilizations | `civilization/rivals.ts`, `rivals/ledger.ts` | The next free named roster rival, 0.5–0.9× you; stances (explore, gather, defend, attack), war waves, slug volleys, shield, ≤ 4 ships; open once the defence fleet is gone ([J], [M]) | spawn as full civilizations on the spot (not grown from the ledger entry); slugs from sight in every stance; waves only at you, no rival-vs-rival war |
| Pirates | `civilization/pirates.ts` | Fleets in every age (always a hauler, a marauder from 10 ships): crack and haul rocks, raid rival worlds (named ones too) and you from LIFE when an attack is due; shoot ships first; steal shield/stock, die on touch; rivals' ships away steer round bodies the same way (`scan` + `clear`, 2026-11-14) | [gameevents.md](gameevents.md) → Pirates |
| Design doc | `docs/gamedesign.html` | Classes: Probe, Miner (Tip 0); Fighter, Frigate, Colonizer (Tip I); Carrier, Dyson builder (Tip II); World ship (Tip III). Tendencies: Industry (metal ≥ 35%), Ocean (ocean world), Swarm (gas + water ≥ 40%), Energy (radioactive/volcanic). Materials: hull ← metal, shield ← energy, speed ← gas, upkeep ← water. Stances: Defend, Gather, Explore, Attack. "Rival cores' civilizations build the same classes with their own tendency." | — |

### Age I rival cores

`rival.ts`. Drag 0.1, 55% of your thrust. They look around every 0.6–1.1 s and aim at a rough guess of the prey's path (a
sidestep makes them overshoot); chase at 7 own D/s, ≤ 7 of yours; tire after 4–7 s, drift 2–3.5 s. Hunt 2–80% of their
mass, flee heavier, want you 3×; violet halo (`0xb48cff`, `rival.ts` `HALO`, the same violet as rival worlds). Recipe hunger (`rules.ts` `need`): a dry rival
wants icy prey up to ×3, a metal-poor one metal up to ×2, one near the gas line gas-rich prey only ×0.2. They dodge
sideways anything on course within 2 s that closes faster than the stick speed in their diameters (not their prey);
their own approach brakes to half the stick speed (0 of 14 rival hits were bounces in 120 s, measured).

Arrival (`field.ts`): up to 3 loaded, one per 20 s, timer × min(1, speed / 2 own D/s), none before 15 s. First rival in
Age I: a hunter 1.4–1.8× from a side edge (visible 3.9 s before reaching a still player, measured). Mass 0.35–2× (≤ M_MAX);
past M_MAX 0.3–0.9×, about 1 in 3 a hunter 1.2–2× at 3 own D/s (`BIG_HUNTER` 0.35, was 0.25: early danger, 2026-11-14). Rivals spawn by travel, scaled by the cosmic web
([worldgen.md](worldgen.md)).

### Roster and ledger

`rivals/ledger.ts`: 4 named rivals per run (Hungry, Careful, Raider + one random), names drawn from a table of 12 ("Vorr",
"Kael", "Ithra", "Sundo"…); off the map they ease toward 1.15× / 0.6× / 0.9× of your mass over ~40 s, held in 0.3–1.5× you
(checked over a simulated 20-minute run; start mass 0.4–0.9× you); each rival top-up after the first hunter brings the
next one in with its ledger mass and make-up (round robin: the one away longest); leaving the map returns it to the
ledger, dying ends it for the run ("… is gone" toast). The first hunter and top-ups while all four are out stay wild
(unnamed). Names show in the target panel and the game-over line ([hudandcontrols.md](hudandcontrols.md)).

### Rival worlds (forging and living)

From 3,162 (`ledger.ts`): they melt through once and run your climate and life (cooling, boiling, `climate`,
`habitability`, `lifeStep`), off the map and on it; they eat by their weakest condition (water < 30% → Frost Reach mix, air
< 0.7 atm with gas < 12% → Veil Nebula, metal < 9% → Iron Graveyard, else Stone Drift) and nothing within 10 K of boiling.
Off the map their growth takes that mix; on it, prey rich in that element counts up to ×3. Simulated: each rival melts at
132–174 s, life starts 104–112 s after melting through, LIFE ~210 s after (one life step since 2026-11-13); it never
crosses the gas line. On the map they never hunt you, trip at ≤ 1.5 own D/s, drift at 1, back off at ≤ 3; the target
panel shows their four life chips and stage. Hits set their life back by your `impact` rule (heat delivered: its own
when it is the actor, else `impactHeat`; "… 's life set back" toast).

A living rival world keeps one guard moon (`rival.ts` `tendMoon`): once life starts it catches one body of 0.5–5% of its
mass within 10 radii, keeps it `held` on a circle easing to 3 radii, and swings it (≤ 2.5 rad/s) toward the most urgent
body on course that closes faster than the stick speed and weighs ≤ 2× the moon; it lets go when the moon is broken
(held, it is not yours to catch: [planetgameplay.md](planetgameplay.md) → Moons), when life is gone, or when the world leaves the map.

### Rival civilizations (rival worlds in combat)

`civilization/rivals.ts` flies them; numbers in `civilization/rules.ts`; the pure strategy rules in `rivals/ledger.ts`
(Node cannot load `rivals.ts`). Only once you host a civilization.

- **Arrival:** by travel (3 view widths after your civilization, then every 8; none while the view has no size), ≤ 2
  loaded, at the quietest of six spots 1.25–1.6 camera half-diagonals ahead of you, never nearer than 12 of your radii.
  Fleeing never summons the next one at once (2026-11-14): when a rival drops out of reach the next arrival waits a full
  8 view widths from there (running used to bring the next one straight in). Mass by temper (`RIVAL_MASS`): Careful
  0.5–0.7×, Raider 0.7–1×, Hungry (and unnamed) 0.9–1.08× you, never 1.1× (none eats you on a touch); violet lights and veil, seas and green lowlands, ≤ 4 ships (level + 1), a rock moon (a passive guard on its circle, turning against the world's orbit round you; never thrown; you can steal it on its circle mid-fight by a match, a new one grows 30 s later, 2026-11-15: [planetgameplay.md](planetgameplay.md) → Stealing).
- **Named** [J]: a rival civilization takes the next free named rival of the run's roster (`next(field.roster)`) and is
  named in toasts ("Maru's civilization · Violet lights on a world nearby · they will shoot once they see you"; with no
  free name "Another civilization"). Leaving writes its mass back to the ledger; swallowed, it is gone for the run. Dropped from the list while far away (more than 4 listed, or beaten), it lives on the ledger only and its body leaves the field, so its stored world never comes back as an unmanaged duplicate (fixed 2026-11-14; measured: a beaten Maru left behind 40 view widths was dropped, no orphan world at its old spot on return, and Maru later came back once, from the ledger). Its
  temperament (never shown) sets its thresholds below.
- **Level** (by temper since 2026-11-14, `rivalLevel(t, yours, RIVAL_LEAD)`): Careful yours − 1, Hungry yours, Raider yours + 1; +1 per 5 min, ≤ yours + 1 (yours = your shield level, at least 1). About one encounter in three starts a level above you (its extra veil shows it). Early danger (user: "early-game encounters should feel more dangerous, sometimes forcing players to escape"): a new civilization (L1 shield, two fighters, 10 ore, no anti-world weapon) never wins a duel (rounds take no people) and by temper (measured, `ledger.test.ts` duel, 2026-11-15, 300 runs a row): a Careful L1 cannot beat it (0% lose: hold); a Hungry L1 beats it if it stays (100%, median 7.6 min); a Raider L2 beats it fast (100%, 4.1 min: run). It keeps ≥ 50% of its people for the first minute in every run: time to leave. Fleeing works: from 10 R at 2 R/s² you are past their 30 R reach in 5.3 s (`stationStep`, ≤ 0.6 R/s²). With a frigate (tier 3, L2 shield) you beat a Careful L1 and a Hungry L2–L3 (100%, 91–131 s, keeping 83–100% of your people), and a Raider L3 is a contest (83% win, 17% lose); at tier 5 (two frigates, L3) in 40–49 s against L2–L4.
- **Gravity and engines** (2026-11-14, user: "that planet's gravity doesn't affect my planet at all"): a rival world is an
  ordinary gravity body all its life (`WORLD_FLAGS` = `held` + `pulls`; `asteroid/rules.ts` `gravitates`), alive, beaten
  or open. `held` still means hands-off (ships, miners, your capture). Within 30 of your radii its engines (`ledger.ts`
  `stationStep`, ≤ `A_ENG` = 0.6 of your radii/s², after the field's gravity) steer it onto an orbit 8–12 of your radii
  off you: the sideways goal is the pair's circular speed √(a·d), so gravity supplies the turn and the two worlds waltz;
  it keeps 6 R clear of another rival world and dodges your missiles as you do (`DODGE`: it sees the launch, 0–0.4 s later builds its own thrust over 0.3 s across the missile's line, up to 5 R/s, then brakes 1.2 s; each missile kicked to alternating sides and arcing in: 58 / 50 / 52 / 72% land from 8 / 12 / 16 / 20 R, a salvo of 2–3 always lands one; its own silo flies in your radii, so its size no longer matters). Beaten: engines off; it stays your gravitating companion. Computed
  (`ledger.test.ts`, you 1e5 and a 0.551× rival from 10 R): alive it holds 10.0 R for 120 s with engines ≤ 0.6 R/s² and
  moves you up to 0.77 R/s (its pull on you at 10 R: 0.041 R/s²); beaten and parked at rest it falls in at 9.9 s (the
  giant-impact rule then applies: it merges and melts you); beaten on its orbit it stays bound and never touches. One plume
  quad shows its thrust, out when beaten.
- **Stances** [J] (`stance`, re-picked each second):
  - *Attack:* a war wave is out, or stock ≥ `WAVE_COST` (Hungry 10, Careful 14, Raider 7) × `waveSize(L)` and the odds
    suit its temper (`ODDS`: Careful 1.2, Hungry 0.8, Raider 0.6; odds = its strength ÷ yours, strength = fighters + 5 ×
    frigates + 2 × shield level, `civilization/rules.ts` `strength`).
  - *Defend:* a Careful rival with its shield under 80% (Hungry and Raider keep attacking, 2026-11-15), or no home fleet left. An open world stays here.
  - *Explore:* you are out of its reach, or it has seen you for under 15 s: one harmless probe circles you for 10 s (top
    7.5 R/s in space: a faster you leaves it behind; at most one per 25 s, only while the world is on screen).
  - *Gather:* a miner digs the nearest free rock (0.01–3% of its mass) within 8 rival radii for 2 s, takes 30% of it and
    brings home 4 stock. Stock also grows 0.15 × level a second by itself.
- **War waves** [J] (planetary combat, 2026-11-14; the weapons, roles and numbers are in
  [civilizationgameplay.md](civilizationgameplay.md) → Battles): `waveSize(L)` = 1/2/3/3 fighters bought from stock plus
  every frigate it has (`rivalFrigates`: 0/1/1/2 at L1–4; a lost one is rebuilt in 60 s for 4 wave ships' worth of
  stock). A wave masses 20 s with its world on screen (the danger is seen, never told): fighters in a V round their world,
  frigates on their battery circuit (1.9–2.1 rival radii), the silo glowing. Out, the fighters make strafing runs at you
  in wings of three like pirates (chases at ≤ 1.5× cruise, gives up when outrun, ships ≤ 2× cruise (10 R/s) in space), a burst of 3 at 6/s a run whenever a
  gun bears (±0.25 rad, 22 R/s, 0.68 s), picked your frigate first, then ships and miners within 8 R (`guns.ts` `pick`),
  else your world: 0.2 K a round on your shield, ore once it is down. The frigates stay home and lance your world (3
  bolts of 7.5 K a salvo every 10 s, 1.5 s nose glow, only on a clear line: any body takes a bolt); the silo loads while the wave masses
  (its glow is the warning) and fires `rivalSalvo(L, SALVO_LEAD)` 20 K missiles 1 s after a lance salvo (Careful +0, Hungry +2, Raider +1, ≤ 4). Home at 40% losses, a frigate lost, 35 s, outrun, a Careful one's shield under
  its Defend threshold, or your people at the raid's floor (one wave kills ≤ 45% of them). Rounds and bolts share one pool
  with every other ship ([shipsandflight.md](shipsandflight.md) → Guns).
- **Slug volleys** [M]: hold fire 6 s on screen (`T_SEE`), then a slug every 4–6 s (45% aimed true, the rest wide by
  1.5–3 of your radii), in volleys: none while their wave is out, none while
  your shield is down, and none for 30 s after it is back (`REST_S`). Their rock moon is never thrown (removed 2026-11-15): it only circles their world, where you can steal it by matching it on a free ring of yours (no defeat needed).
- **Ships:** home patrols break rocks heading for their world, hunt your ships near it and hunt pirate raiders
  (`rivals.watch`) [M]. Ships away from home (waves, probes, miners) steer round rocks (`scan` + `clear`) and die on any contact; top speeds: [shipsandflight.md](shipsandflight.md); home patrols die
  only to a body or you (hit radius 6 ship units). A lost patrol is rebuilt every 20 s, up to `YARD` = 2 fleets'
  worth. Ship flight: [shipsandflight.md](shipsandflight.md).
- **Damage:** weapon fire goes through `weaponHit` like yours: slugs, rounds, lance bolts, missiles, pirate rounds and the
  beam always land on their shield (`shieldShot`, the 3 s stun); through an open one your rounds burn 0.2 u of their stock
  (≤ 20 u a sortie), heavy fire lands every 20 K (people × 0.8). Other
  bodies meet their shield's shell like yours (`shieldMeet` through `Body.guard`: held whole, or a share stopped as it
  breaks; the same burn-up line: under 20 K it is not the shield's business);
  their air (1 atm) burns your small slugs once it is down. Weapon fire leaves no heat on their crust.
- **Defeat = the fleet gone** [J]: once the yard is spent and the home fleet is empty the world is `open`: no rebuilds,
  its shield stops regenerating, a wave out goes home, toast "Their fleet is gone". It then holds a site of 300·L ore +
  100·L volatiles (`SITE`) that your miners work at efficiency 2.5 (`combat.rivals.sites()`,
  [civilizationgameplay.md](civilizationgameplay.md#roaming-miners-and-the-mining-link-g)).
- **Beaten at 20% people:** lights out, every ship gone, the world opens if it was not yet, and wreckage: 6 metal-rich
  pieces of 0.25% of the world each, sprayed out slowly (`rivals.ts` `beat`). The fixed +50 ore / +20 vol spoils are
  gone. The dead world, engines off, stays your gravitating companion until you leave it behind. A world swallowed with
  its people: "A world swallowed".
- Measured (`ledger.test.ts` duel, 2026-11-15, each rival at the level it meets you; win / lose):

  | You | Careful | Hungry | Raider |
  |---|---|---|---|
  | tier 1 (L1, 2 fighters) | L1: 0 / 0% (hold) | L1: 0 / 100%, 7.6 min | L2: 0 / 100%, 4.1 min (run) |
  | tier 3 (L2, a frigate) | L1: 100 / 0% | L2: 100 / 0%; L3: 100 / 0% | L3: 83 / 17% |
  | tier 5 (L3, two frigates) | L2: 100 / 0% | L3–L4: 100 / 0% | L4: 100 / 0% |

  Tier 5 breaks any rival in 40–50 s, before a wave leaves (late rivals need another lever). A wave of 3 or 4 ships turns home at its 2nd loss, any wave at its frigate's loss. Measured
  before this change: `rivals.update` 0.06–0.09 ms (not re-measured: no browser).
- Achievement "Duelist": beat a rival world ([hudandcontrols.md](hudandcontrols.md)).

### Rule: no undefeatable guided missiles

Concept 8: "we want realistic enemies here, not enemies with guided missiles that can never be defeated." Built (checked):
rival slugs are aimed once with `intercept` (`civilization/rules.ts`) at where you will be and then fly
straight; only 45% are aimed true. War-wave rounds, lance bolts and silo missiles are aimed once and never steered; any
body stops them. Missiles fly at 6 of the shooter's radii/s: sidestep after launch and they miss; a round, slug or beam
kills one. Slugs can be dodged, absorbed by your shield or burnt by your air. Rival ships are ships, not missiles: they can be shot (one slug or round; a frigate takes 2
hits) and die on rocks. Age I cores look only every 0.6–1.1 s and tire. Checked by `ledger.test.ts`: a bolt's
velocity never changes after launch, and a target that turns after launch is missed.

### Build log (rivals plan, steps 2–5)

| # | Step | Files | Check |
|---|---|---|---|
| 2 | ✅ Age I rival rules (done 2026-11-13): recipe hunger (`rules.ts` `need`: dry → ice ×3, metal-poor → metal ×2, near the gas line → gas ×0.2) and a sideways dodge of anything on course within 2 s that closes faster than the stick speed in their diameters. Braking was already enough: 14 of 14 rival hits in a 120 s run were slow merges, 0 bounces (measured before the change), so the approach is unchanged | `asteroid/rival.ts`, `asteroid/rules.ts` | `rules.test.ts` (need); in the page: a 9 D/s rock on course is dodged sideways at full thrust, a 1 D/s one is not, a dry rival picks the icy of two equal rocks; the hunter path is unchanged (you are never dodged as prey) |
| 3 | ✅ Roster + ledger (done 2026-11-13): `rivals/ledger.ts` makes 4 named rivals per run (one Hungry, one Careful, one Raider, one random), each easing off screen toward its share of your mass (Hungry 1.15×, Careful 0.6×, Raider 0.9×, 40 s) inside 0.3–1.5× you; the field brings the next one in at each rival top-up with its mass and make-up, writes it back each frame, returns it to the ledger when it leaves the map (no stored copy) and marks it gone when it dies; the first hunter and top-ups while all four are out stay wild. Names in the target panel, the game-over line and a "… is gone" toast. Off-screen composition drift is not modelled yet (step 4) | `rivals/ledger.ts` + `.test.ts`, `asteroid/field.ts`, `rival.ts`, `hud.ts`, `main.ts` | ledger check: over a simulated 20-minute run every rival stays 0.30–1.15× you |
| 4 | ✅ Forging-world AI (done 2026-11-13): from 3,162 a named rival melts through once and runs your climate and life rules (`ledger.ts` `live`: cooling, water boiling, `climate`, `habitability`, `lifeStep`), off the map and on it. It eats by plan (`want`): nothing while within 10 K of boiling (molten, steaming), else water < 30% → Frost Reach meals, air < 0.7 atm with gas < 12% → Veil Nebula, metal < 9% → Iron Graveyard, else Stone Drift (off the map its growth takes that mix; on it, prey rich in that element counts up to ×3). On the map a rival world never hunts you, trips at ≤ 1.5 own D/s, drifts at 1, backs off at ≤ 3. The target panel shows its four life chips and life stage. Biome travel on the map (heading for the biome it needs) is not built yet | `rivals/ledger.ts`, `asteroid/rival.ts`, `field.ts`, `hud.ts` | ledger check: each rival melts at 132–174 s, starts life 104–112 s later, LIFE ~210 s after melting (one life step since 2026-11-13), never crosses the gas line; in the page: melt-through → wait, cooled → "water" plan, chips shown |
| 5 | ✅ Living world (done 2026-11-13): life already runs on the ledger (step 4). Hits on a living rival world read the heat delivered (its own when it is the actor, else `impactHeat`, as civilization rivals do) through your `impact` rule (`ledger.ts` `struck`); each lost stage toasts "… 's life set back". A guard moon (`rival.ts` `tendMoon`): once life starts it catches one body of 0.5–5% of its mass within 10 radii, keeps it `held` on a circle easing to 3 radii, and swings it (≤ 2.5 rad/s) toward the most urgent body on course that closes faster than the stick speed and weighs ≤ 2× the moon; it lets go when the moon is broken or taken (your lasso: moons.ts), when life is gone, or when the world leaves the map | `rivals/ledger.ts`, `asteroid/rival.ts`, `field.ts`, `hud.ts` | in the page: moon caught at 2%; a 10 D/s rock from 90° broke on the moon (life 140 → 140); from the far side at 12 D/s it got through (−60 s, a soft setback); a 20% rock at 15 D/s took life 140 → 0 with the toast |

Note: the "−60 s" in step 5 was measured before the life rules changed; today's soft setback is −10 s
([planetgameplay.md](planetgameplay.md) → Life).

## Planned

### The design: a rival is you on another seed

The user's request: rivals should not just attack. They are cores like you, trying to grow a habitable world and keep it
alive (water, air, temperature, field, radiation, metal), avoiding fast hits. In the asteroid stage they may attack you
directly, so play stays tense. From the planet stage on, they build a habitable world, then an army, and only then attack
other planets. There are three ship factions with their own look (you, pirates, rivals), consistent with the ship classes
in `docs/gamedesign.html` ("Gemi sınıfları", "Uygarlık eğilimi", "Düşman filolar"); the factions are in
[shipsandflight.md](shipsandflight.md).

**A rival is you on another seed.** It walks the same ladder (asteroid → world → life → civilization → star) under the
same rules (`asteroid/rules.ts`, `planet/rules.ts`, `civilization/rules.ts`), with a small AI choosing meals and stances.
You meet the same named rivals again and again during a run. What they do to you depends on their stage:

| Their stage | Their goal | Towards you | Seen as | Status |
|---|---|---|---|---|
| Asteroid | grow to 3,162 | hunts you when ≥ 1.15× you (eats you), flees when lighter | violet halo, today's behaviour | Built |
| Forging world | a habitable recipe | ignores you; competes for the same rocks; may steal your moon (existing theft rule) | violet world, its life chips in the target panel | Built, except stealing your moon |
| Living world | keep life going, calm | avoids you; defends its moons | violet seas and green lowlands (same `setSurface`) | Built (guard moon) |
| Civilization | army first, then war | none until its army is ready; then a war wave at the weakest world in reach (you, another rival) | ships gathering in orbit **before** they leave (danger seen, never told) | Built in part [J]: named from the roster, stances and massing war waves; still: slugs from sight, waves only at you, spawned as full civilizations |
| Star | Dyson, link | rival star claims (`vision.md` roadmap; [gameevents.md](gameevents.md) → Rival star claim) | later, out of scope here | Planned |

### The rival roster (rest of the design)

Built parts are in Built → Roster and ledger. Still planned:

- **Toasts on progress** ("Kael reached Life"). No "enemy" label: they are neighbours you can watch.
- **Temperament** (one of three, *start values*): *Hungry* (eats more, hotter, risks more), *Careful* (keeps calm,
  slower), *Raider* (builds army sooner, attacks at a lower margin). It nudges the AI weights below; it is never shown as
  text, only through what they do. (Built: the mass share it grows toward, and as a civilization its defend threshold and wave cost [J]. Planned: the meal and risk weights.)
- **Off screen they keep living** on a cheap ledger: mass, composition, heat, life progress, population, army strength,
  ticked once a second with the same rule functions (no bodies, no physics). This is where "they are trying to develop"
  comes from: when you meet Kael again 4 minutes later, Kael has grown. (Built: mass, composition, heat, sinking metal,
  sky, life. Planned: population, army strength.)
- **Rubber band** (fun first): a rival's ledger growth is scaled so its mass stays within 0.3–1.5× yours (*start value*;
  Built), and it is never more than one stage ahead of you before you reach civilization (Planned). So the
  asteroid-stage threat stays real, and the planet stage never opens with a rival already at war.
- **Where they show up**: the loader picks one of the 4 roster rivals (round robin, Built); planned: the nearest by home
  direction and stage, spawned at the view edge. Each rival's home direction and a starting composition from the biome
  they start in are not built (today every rival starts with your composition). Extra unnamed "wild" cores still fill
  Age I so it stays busy; only roster rivals walk the whole ladder.
- **When one dies** (eaten, destroyed): it is gone for the run, toast "Kael is gone" (Built). If the roster empties
  before your civilization, a new one is "born" from a big body in a far biome (keeps the war phase alive) (Planned).

### Rival AI, stage by stage (rest of the design)

**Asteroid stage (threat stays): Built.** Keep `rival.ts` (look every 0.6–1.1 s, rough lead, tire, flee) with three rules:
1. **Recipe hunger.** Prey score × a *need* weight from what their recipe lacks (same thresholds as yours in
   `planet/rules.ts`): water under 10% → icy rocks and comets ×3; metal under 10% → metal rocks ×2; gas over 15% →
   gas-rich rocks ×0.2 (they avoid the gas line) (Built, `asteroid/rules.ts` `need`). A Hungry rival weights mass more, a
   Careful one weights need more (temperament weights: Planned).
2. **No fast hits.** Dodge anything on course within 2 s with a closing speed over the stick speed, including meteors.
   *Measure:* share of rival hits that are bounces (target: under 10%; measured 0 of 14).
3. **Hunting you** stays as today when they are ≥ 1.15× you (they can eat you; the first hunter at 15 s stays). Below
   that they flee you.

**Forging a world (from 3,162): mostly Built.** They stop chasing like an asteroid and act like a world:
- **Station keeping** like the rival civilizations (`held`, slow drift), so planets never fly at you (standing rule).
  They feed through their **gravity well** (rocks fall in, as yours do) and short slow **feeding trips** toward a chosen
  rock: ≤ 1.5 own D/s, never at bodies ≥ 1.15× them. (Built: trips and drift speeds.)
- **The habitability plan**: every 2 s (*start value*) they score their own conditions with `planet/rules.ts`
  (`habitability`, water, air, temperature, field) plus two of the doc's extra factors:
  - **Radiation**: radioactive share ≤ 8% (the doc's radiation storm) but ≥ 1% if their tendency is Energy (power).
    (Planned.)
  - **Metal**: ≥ 10% for a magnetic field (`FIELD_METAL`) and industry later. (Built as metal < 9% → Iron Graveyard.)
  - The weakest factor picks what they want next: water → icy rocks, comets, Frost Reach, Kuiper Rim; air → gas-rich
    rocks, Veil Nebula; field → metal, Iron Graveyard; radiation low → green rocks, Kuiper Rim; **too hot → they stop
    eating** and drift until they cool (the same `settle` climate as yours). (Built except radiation.)
- **Biome travel** (Planned): if what they need is not in reach, they drift toward the biome that has it (they read
  `place()` like the field does). You will see a thirsty rival heading for Frost Reach. This is also where you can
  **compete**: take the comet before they do.
- **What you see**: the target panel shows a rival world's four life chips (Built). No text about intent.

**Living world: mostly Built.**
- Life runs on the ledger with your life rules (`LIFE` stages, `lifeSpeed`). Big impacts set their life back exactly as
  yours. (Built.)
- **They protect it**: they get Guard moons (Built: one guard moon), avoid fast meals, and drift away from you if you
  come close at speed.
- **What you can do to them**: steal a moon (capture by match off its host, or within 30 s of its host letting go), take their
  comets. What they do to you: the same, at a low rate, only when you are weaker (Planned for roster worlds).

### [J] Alien civilizations as strategic opponents, the rest

Concept 8: "Alien civilizations are not simple raiders but strategic opponents. While protecting their own systems, they
harass the player, compete for resources, and attempt to slow down the player's technological development." Built in
[J]: stances, massing war waves with bursts (bolts until 2026-11-14), gather miners, defeat = the fleet gone, open worlds, named rivals (Built →
Rival civilizations). The design below is the full plan; only the parts marked *not built* are still open.

**Army first, war later** (rivals plan). Same population, energy, tech and stock rules as yours (`civilization/rules.ts`),
on the ledger. Their **stance** cycles like the doc's four stances:

| Stance | When | Ships built | On screen |
|---|---|---|---|
| **Explore** | first minute of civilization | Probes | probes crossing the view, harmless |
| **Gather** | stocks low | Miners | miners carrying grains from rocks to their world (the Mine-moon look) |
| **Defend** | always keeps a floor | Fighters | fighter petals around their world (today's defence ships) |
| **Attack** | army ready (below) | Frigates, then Carriers | the fleet **masses in orbit for 20 s** (*start value*), then leaves as one wave |

- **Army strength** (*not built*) = Σ ship cost × the tendency's multiplier (Industry hulls +40%, Swarm count ×2 at half
  hull…, the doc's table; [shipsandflight.md](shipsandflight.md)). Built instead: a stock threshold per temperament.
- **War decision** (*not built*): attack when strength ≥ 1.5 × the target's defence (shield + fighters + guard moons) for
  a Raider temperament, 2.5× for Careful (*start values*). Targets: the weakest **world** in reach: you, another rival, or
  a pirate base later. Built: waves go only at you; rival-vs-rival war is open.
- **No fire until the army is ready** (*not built*): today slug volleys start once a rival has seen you 6 s, in any
  stance.
- **Carriers** (Tip II) carrying fighters further (*not built*); waves are a frigate and fighters.
- **Danger is seen, never told**: no warning text (built: the wave masses 20 s in view). *Not built:* the target panel's
  verdict edge turning red when a wave is on course.
- **Harassment:** bursts at your miners and ships (built); shots at Dyson haulers (*not built*); competing for free rocks
  (built: their miners strip rocks near their world); never homing fire.
- **After defeat** (*not built*): a beaten rival stays alive on the ledger and can rebuild slowly, or a roster slot frees
  for a new one. An open world as a colony target ([stargameplay.md](stargameplay.md)) is not built either: only caught
  lifeless field worlds are colonized.

### Remaining build order (rivals plan)

Mining defeated worlds ([M], concept 9) is built: open worlds are sites at efficiency 2.5
([civilizationgameplay.md](civilizationgameplay.md#mining-ai-e-rules-wired-in-by-g)).

| # | Step | Files | Check |
|---|---|---|---|
| 6 | Civilization: built in [J] (stances, waves, defeat by fleet); left: army strength, war decision by defence, rival-vs-rival | `civilization/rivals.ts`, `rivals/ledger.ts` | built: duel check by temper (2026-11-15): a Careful rival cannot beat a new civilization, a Hungry one beats it if it stays, a Raider fast; with a frigate you win (Raider one level up: 83%); a wave masses ≥ 20 s on screen before it leaves |
| 7 | Pirates raid rivals: built in [M] (they raid named rival worlds and shoot rival ships); the Marauder capital built in the 2026-11-14 redesign ([gameevents.md](gameevents.md) → Pirates) | `pirates.ts` | built: an 8-raider fleet took out a rival's patrols in 3 of 3 runs (measured) |

Budget for all of it (standing rules): field update ≤ 0.6 ms at rest, ≤ 400 loaded bodies, ships within the 200-ship
container ([techandperformance.md](techandperformance.md)).

## Open issues

- **[J] The war wave reads harmless** (playtest): waves came home 3 of 3 times without touching your shield.
- **[J] Rival worlds collide:** two rival worlds met and one swallowed the other ("A world swallowed", playtest).
- **[J] One-hit wipes after volleys** (playtest): rival volleys took your shield 90 → 0 K in ~13 s (~25 K steps every
  4 s), then one rock killed 88% of your people ([civilizationgameplay.md](civilizationgameplay.md#open-issues)). With `worldHeat` that rock now delivers ~300–1,100 K (computed: a 1.5–2.7% rock at 1.4–1.7× the stick speed), so the same sequence wipes life outright: the infall / rival-rock balance issue (measured 2026-11-14, not fixed, user to decide; a parked world also takes a moon-sized natural infall about every 1.5 min, +224 to +819 K at 1.8–4.3%).
- **[J] Two kinds of rival world:** roster rivals stop at the living world on the ledger; a rival civilization takes a
  roster name but is spawned on the spot as a full civilization (0.5–0.9× you, a fixed make-up), not grown from its
  ledger entry.
- **Age II rivals can grow and swallow a parked world** (a 0.48× rival grew to 1.3× and ate a parked 21k world at 385 s);
  ideas in `vision.md` open issues: rivals stop hunting you once they outweigh you past Age I.
- **Still newcomer:** the 15 s hunter eats a player who never moves (visible 3.9 s before).

## Decisions

Standing (README): you cyan, rivals violet; danger is seen, never told; fun first, then realism (the rubber band).

- User (rivals request): rivals should not just attack; they grow a habitable world and keep it alive, may attack you
  directly in the asteroid stage, and build an army before they attack other planets (the design above).
- 2026-11-13: life has one step (LIFE); rival worlds use it (LIFE ~210 s after melting through).

Pending, from the rivals plan:
1. **Roster size**: 4 named rivals per run, or fewer and more personal (2–3)?
2. **Alliances**: the design doc says you can "pull them to your side with an alliance". Plan it now (a peaceful rival
   that sends fighters to help) or later?
3. **Rivals at the star stage**: stop at civilization for now (this plan), or also let them claim stars?
4. **Should rivals eat each other** in Age I (two roster rivals meeting)? Fun spectacle, but it can empty the roster
   early.
