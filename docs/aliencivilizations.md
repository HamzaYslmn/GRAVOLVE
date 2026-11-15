# Alien civilizations

Rivals: the Age I rival cores, the named roster and its off-screen ledger, rival worlds that forge and grow life, rival
civilizations you fight, and defeat and spoils. Labels and standing decisions: [README.md](README.md). **[J]**, **[M]**
are package IDs ([vision.md](vision.md)).

Code (under `app/src/evolution/`): `asteroid/rival.ts` (steering for every rival body, the guard moon), `asteroid/field.ts`
(when rivals come in), `rivals/ledger.ts` (roster, off-screen life, the pure stance, wave and engine rules),
`civilization/rivals.ts` (rival civilizations), `civilization/away.ts` (their ships away from home) and the rival block
of `civilization/rules.ts`. Tests: `app/test/rivals/ledger.test.ts`; `away.ts` is flown in
`app/test/civilization/flight.test.ts`. Ship factions, flight and art: [shipsandflight.md](shipsandflight.md). Pirates:
[gameevents.md](gameevents.md) → Pirates.

## Built

### Age I cores

`asteroid/rival.ts`. Rival cores steer like you, with drag 0.1 and 55% of your thrust.

- They look around every 0.6–1.1 s and aim at a rough guess of the prey's path, so a sidestep makes them overshoot.
  They chase at 7 own diameters/s (≤ 7 of yours), tire after 4–7 s and drift 2–3.5 s.
- They hunt bodies 2–80% of their mass, flee heavier ones, and want you 3× as much as a rock your mass. A violet halo
  (`0xb48cff`) tells them apart.
- **Recipe hunger** (`asteroid/rules.ts` `need`): a dry rival wants icy prey up to ×3, a metal-poor one metal up to ×2,
  one near the gas line wants gas-rich prey only ×0.2.
- **No fast hits:** they dodge sideways anything on course within 2 s that closes faster than the stick speed (not their
  prey); their own approach brakes to half the stick speed (0 of 14 rival hits were bounces, measured 2026-11-13).
- **Arrival** (`field.ts`): up to 3 loaded, one per 20 s, none in the first 15 s; the timer runs by distance travelled
  (stopped while parked), and few cross a void. The run's first rival is a hunter 1.4–1.8× you from a side edge, on
  screen a few seconds before it can reach a still you. Others: 0.35–2× you (≤ M_MAX). Past M_MAX they are 0.3–0.9× you,
  and about 1 in 3 is a hunter 1.2–2× you at 3 own diameters/s (`BIG_HUNTER` 0.35). Rivals spawn more along the cosmic
  web ([worldgen.md](worldgen.md)).

### Roster and ledger

`rivals/ledger.ts`: 4 named rivals per run (Hungry, Careful, Raider, plus one random), named from a table of 12 ("Vorr",
"Kael", "Ithra", "Sundo"…).

- Off the map they ease toward 1.15× / 0.6× / 0.9× your mass (Hungry / Careful / Raider) over ~40 s, held within
  0.3–1.5× you; they start at 0.4–0.9× you. Checked (ledger.test.ts, 2026-11-16): at 20:00 every rival is 0.30–1.01× you.
- Each rival top-up after the first hunter brings the next one in with its ledger mass and make-up (round robin: the one
  away longest). Leaving the map returns it to the ledger; dying ends it for the run ("… is gone" toast). The first
  hunter, and top-ups while all four are out, stay wild (unnamed).
- Names show in the target panel and the game-over line ([hudandcontrols.md](hudandcontrols.md)).

### Rival worlds (forging and living)

- From 3,162 (`ledger.ts`) a named rival melts through once and runs your climate and life rules (cooling, boiling,
  `climate`, `habitability`, `lifeStep`), off the map and on it. It never crosses the gas line.
- **It eats by its weakest condition** (`want`): water < 30% → the Frost Reach mix, air < 0.7 atm with gas < 12% → Veil
  Nebula, metal < 9% → Iron Graveyard, else Stone Drift; nothing within 10 K of boiling. Off the map its growth takes
  that mix; on it, prey rich in that element counts up to ×3.
- Checked (ledger.test.ts, 2026-11-16): each rival melts at 132–174 s, starts life 108–114 s later and reaches LIFE
  198–207 s after melting through.
- On the map they never hunt you; they make feeding trips at ≤ 1.5 own diameters/s, drift at 1, back off at ≤ 3. The
  target panel shows their four life chips and stage. Hits set their life back by your `impact` rule ("… 's life set
  back" toast).
- **Guard moon** (`rival.ts` `tendMoon`): once life starts, the world catches one body of 0.5–5% of its mass within 10
  radii and keeps it `held` on a circle easing to 3 radii. It swings the moon (≤ 2.5 rad/s) toward the most urgent body
  on course that closes faster than the stick speed and weighs ≤ 2× the moon. Held, it is not yours to catch; you can
  break it. It lets go when the moon is broken, when life is gone, or when the world leaves the map.

### Rival civilizations

`civilization/rivals.ts` flies them; numbers in `civilization/rules.ts`; the pure rules in `rivals/ledger.ts`. They come
only once you host a civilization.

- **Arrival:** by travel (3 view widths after your civilization starts, then every 8), ≤ 2 loaded, at the quietest of
  six spots 1.25–1.6 camera half-diagonals ahead of you, never nearer than 12 of your radii. When one drops out of reach,
  the next waits a full 8 view widths from there, so fleeing never summons the next at once.
- **Mass by temper** (`RIVAL_MASS`): Careful 0.5–0.7×, Raider 0.7–1×, Hungry (and unnamed) 0.9–1.08× you; none eats you
  on a touch. Violet lights and veil, seas and green lowlands, a fixed make-up.
- **Named** [J]: it takes the next free named rival of the roster (toast "Maru's civilization · Violet lights on a world
  nearby · they will shoot once they see you"; with no free name "Another civilization"). Leaving writes its mass back
  to the ledger; swallowed, it is gone for the run. Dropped from the list while far away (more than 4 listed, or
  beaten), it lives on in the ledger only. Its temperament is never shown.
- **Level** (`rivalLevel`): Careful yours − 1, Hungry yours, Raider yours + 1; +1 per 5 min, never above yours + 1 (yours
  = your shield level, at least 1). Its extra veils show it.
- **Rock moon:** a passive guard on its circle, turning against the world's orbit round you; never thrown. You can steal
  it on its circle mid-fight by matching it on a free ring of yours; a new one grows 30 s later
  ([planetgameplay.md](planetgameplay.md) → Stealing).
- **Gravity and engines** (user, 2026-11-14: "that planet's gravity doesn't affect my planet at all"): a rival world is
  an ordinary gravity body all its life (`WORLD_FLAGS` = `held` + `pulls`), alive, beaten or open; `held` still means
  hands-off. Within 30 of your radii its engines (`ledger.ts` `stationStep`, ≤ `A_ENG` 0.6 of your radii/s²) steer it
  onto an orbit 8–12 of your radii off you, sideways at the pair's circular speed, so gravity supplies the turn and the
  two worlds waltz. It keeps 6 R clear of another rival world and dodges your missiles (Fighting a rival world).
  Beaten: engines off; it stays your gravitating companion. One plume quad shows its thrust.
  - Computed (ledger.test.ts, 2026-11-16; you 10⁵, a 0.551× rival from 10 R): alive it holds 10.0 R for 120 s with
    engines ≤ 0.6 R/s² and moves you up to 0.77 R/s; beaten and parked it falls in at 9.9 s (then it merges and melts
    you); beaten on its orbit it never touches.
- **Stances** [J] (`stance`, re-picked each second):
  - *Attack:* a war wave is out, or stock ≥ `WAVE_COST` (Hungry 10, Careful 14, Raider 7) × `waveFighters(L)` and the
    odds suit its temper (`ODDS`: Careful 1.2, Hungry 0.8, Raider 0.6; odds = its strength ÷ yours, strength = fighters
    + 5 × frigates + 2 × shield level).
  - *Defend:* a Careful rival with its shield under 80% (Hungry and Raider keep attacking), or no home fleet left. An
    open world stays here.
  - *Explore:* you are out of its reach, or it has seen you for under 15 s: one harmless probe circles you for 10 s (at
    most one per 25 s, only while the world is on screen).
  - *Gather:* a miner digs the nearest free rock (0.01–3% of its mass) within 8 rival radii for 2 s, takes 30% of it and
    brings home 4 stock. Stock also grows 0.15 × level a second by itself.

#### War waves

[J], planetary combat (weapons and roles: [civilizationgameplay.md](civilizationgameplay.md) → Battles).

- A wave is `waveFighters(L)` = 1/2/3/3 fighters bought from stock, plus every frigate it has (`rivalFrigates`: 0/1/1/2
  at L1–4; a lost one is rebuilt in 60 s for 4 wave ships' worth of stock).
- It masses 20 s with its world on screen (the danger is seen, never told): fighters in a V round their world, frigates
  on their battery circuit, the silo glowing.
- Out, the fighters make strafing runs at you in wings of three, a burst of 3 at 6/s whenever a gun bears; they pick
  your frigate first, then ships and miners within 8 R (`guns.ts` `pick`), else your world: 0.2 K a round on your shield,
  ore once it is down. Flight and top speeds: [shipsandflight.md](shipsandflight.md) → Rival ships away from home [J].
- The frigates stay home and lance your world (3 bolts of 7.5 K a salvo every 10 s, after a 1.5 s nose glow, only on a
  clear line). The silo fires `rivalSalvo(L, SALVO_LEAD)` 20 K missiles 1 s after a lance salvo (level + Careful 0,
  Hungry 2, Raider 1, ≤ 4).
- **Home** at 40% losses (a wave of 3 or 4 at its 2nd loss), a frigate lost, after 35 s, outrun, a Careful one's shield
  under 80%, or your people at the raid's floor (one wave kills ≤ 45% of them).

#### Slug volleys, ships, damage

- **Slug volleys** [M]: they hold fire 6 s on screen (`T_SEE`), then fire a slug every 4–6 s (45% aimed true at where you
  will be, the rest wide by 1.5–3 of your radii). None while their wave is out, none while your shield is down, and none
  for 30 s after it is back (`REST_S`). Checked (ledger.test.ts, 2026-11-16): an L1 shield under a peer's slugs for 10
  min is down 76% of the time without volleys, 22% with them.
- **Ships:** home patrols (≤ 4, level + 1) break rocks heading for their world, hunt your ships near it and hunt pirate
  raiders [M]. A lost patrol is rebuilt every 20 s, up to `YARD` 2 fleets' worth. Ships away from home (waves, probes,
  miners) steer round rocks and die on any contact.
- **Damage:** weapon fire goes through `weaponHit` like yours: everything lands on their shield first (`shieldShot`, the
  3 s stun). Through an open one your rounds burn 0.2 u of their stock (≤ 20 u a sortie) and heavy fire lands every
  20 K (people × 0.8). Other bodies meet their shield's shell like yours, by the same burn-up line. Their air (1 atm)
  burns your small slugs once the shield is down. Weapon fire leaves no heat on their crust.

#### Defeat

- **The fleet gone = open** [J]: once the yard is spent and the home fleet is empty, the world is `open`: no rebuilds,
  its shield stops mending, a wave out goes home, toast "Their fleet is gone". It holds a site of 300·L ore + 100·L
  volatiles (`SITE`) that your miners work at efficiency 2.5 ([civilizationgameplay.md](civilizationgameplay.md) →
  Roaming miners and the mining link [G]).
- **Beaten at 20% people:** lights out, every ship gone, the world opens if it was not yet, and wreckage: 6 unequal
  metal-rich pieces, 1.5% of the world in all, sprayed out slowly (`rivals.ts` `beat`). Toast "Rival beaten". The dead
  world, engines off, stays your gravitating companion until you leave it behind; beamed down to moon size, it is a free
  body you can catch. A world swallowed with its people: "A world swallowed".
- Achievement "Duelist": beat a rival world ([hudandcontrols.md](hudandcontrols.md)).

### Fighting a rival world

User: "early-game encounters should feel more dangerous, sometimes forcing players to escape".

- **The siege starts** from 18 R (`RECALL`) when the world is your priority, and by itself within 14 R (`STRIKE`). Its
  geometry: [shipsandflight.md](shipsandflight.md) → Strike.
- **Duels by temper** (ledger.test.ts, 2026-11-16, each rival at the level it meets you; win / lose, median time):

  | You | Careful | Hungry | Raider |
  |---|---|---|---|
  | tier 1 (L1, 2 fighters, 10 ore) | L1: 0 / 0% (hold) | L1: 0 / 100%, 453 s; L2: 0 / 100%, 256 s | L2: 0 / 100%, 245 s (run) |
  | tier 3 (L2, 4 fighters, a frigate) | L1: 100 / 0%, 91 s | L2: 100 / 0%, 118 s; L3: 100 / 0%, 131 s | L3: 83 / 17%, 121 s |
  | tier 5 (L3, 6 fighters, two frigates) | L2: 100 / 0%, 40 s | L3: 40 s; L4: 50 s, both 100 / 0% | L4: 100 / 0%, 50 s |

  A new civilization (no anti-world weapon) never wins a duel, and keeps ≥ 50% of its people for the first minute in
  every run: time to leave. **Fleeing works:** from 10 R at 2 R/s² you are past their 30 R reach in 5.3 s. Tier 5 breaks
  any rival before a wave leaves (late rivals need another lever).
- **Sustained K/s on a shield** (computed): a fighter 0.48 (16 rounds × 0.2 K × 75% a 5 s run), a frigate 2.03, your
  driver 3.1; missiles one salvo × 20 K per 20 s. Ring ships hunting enemy ships add nothing on the shield.
- **Time to break an equal shield** L1 / L2 / L3, in s (rules.test.ts, 2026-11-16; planned = mean rates, measured = real
  `shieldShot` and `shieldRegen` with the stun, volley by volley, over 20 start phases):

  | Fire | Planned | Measured |
  |---|---|---|
  | 2 strike fighters | 31 / 62 / 94 | 34 / 65 / 95 |
  | 3 fighters | 21 / 42 / 62 | 24 / 44 / 65 |
  | frigate alone | 16 / 37 / 63 | 15 / 35 / 55 |
  | frigate + 2 fighters | 10 / 20 / 30 | 13 / 23 / 33 |
  | missiles, all land (salvo = level) | 40 | 30 |
  | missiles, half land | 122 | 110 |
  | your driver | 10 / 19 / 29 | 10 / 18 / 30 |

  Volleys land whole, so the measured time can be up to one firing cycle off the mean.
- **Ground phase** (rules.test.ts, 2026-11-16; people 1 → 0.2 from an open shield): a frigate alone 79 s of fire,
  frigate + missiles 53 s; fighters alone never. A lone frigate cannot keep a shield down (its 10 s reload is longer
  than the 3 s stun); fighters can.
- **A rival world dodges your missiles** (`ledger.ts` `DODGE`, `evade`): it sees the launch, reacts after 0–0.4 s,
  builds its own thrust over 0.3 s across the missile's line of sight, the way it already crosses it, up to 5 R/s, then
  brakes 1.2 s back onto its station. Checked (ledger.test.ts, 2026-11-16; salvos of 1–3 from your surface, burn 7
  R/s²): 58 / 50 / 52 / 72% land from 8 / 12 / 16 / 20 R, 52% over its kept 8–12 R (burn 5 R/s²: 64%, 14 R/s²: 50%),
  100% on its cruise engines alone; every salvo of 2–3 lands at least one.
- **A rival's salvo at you:** its silo flies in your radii, so its size does not matter. Holding still, coasting or
  reacting late, every missile lands; a burn across just after the flash slips about half; an early burn straight away
  outruns the salvo (scratch sim and browser, 2026-11-15). Missile flight: [shipsandflight.md](shipsandflight.md) →
  Missiles and rockets.

### Rule: no undefeatable guided missiles

Concept 8: "we want realistic enemies here, not enemies with guided missiles that can never be defeated."

- Rival slugs are aimed once with `intercept` at where you will be, then fly straight; only 45% are aimed true. Slugs
  can be dodged, absorbed by your shield or burnt by your air. Rounds and lance bolts fly straight; any body stops them.
- Silo missiles are guided (11 of your radii/s, kicked ±0.9 rad to alternating sides, seeker on until 0.15 s out) but
  turn only so hard: an early burn across or away beats them, and a round (41% for one fighter), a slug, the beam or any
  body stops one. Unguided, the same missile misses a target that turns back (guns.test.ts).
- Rival ships are ships, not missiles: they can be shot (a frigate takes 2 hits) and die on rocks. Age I cores look only
  every 0.6–1.1 s and tire.

## Planned

The design (user's rivals request): a rival is you on another seed. It walks the same ladder under the same rules, with a
small AI choosing meals and stances; you meet the same named rivals again and again. Concept 8: "Alien civilizations are
not simple raiders but strategic opponents. While protecting their own systems, they harass the player, compete for
resources, and attempt to slow down the player's technological development."

| Their stage | Their goal | Towards you | Status |
|---|---|---|---|
| Asteroid | grow to 3,162 | hunts you when ≥ 1.15× you, flees when lighter | Built |
| Forging world | a habitable recipe | ignores you; competes for the same rocks | Built, except stealing your moon |
| Living world | keep life going | avoids you; defends its moon | Built (one guard moon) |
| Civilization | army first, then war | waves at you when its stock and odds allow | Built in part [J]: named, stances, massing waves; spawned as full civilizations |
| Star | Dyson, link | rival star claims ([gameevents.md](gameevents.md) → Rival star claim) | Planned |

Not built yet:

- Progress toasts ("Kael reached Life"); no "enemy" label.
- Temperament weights for meals and risk (built: its mass share, defend threshold, wave cost, level and salvo).
- Population and army strength on the ledger.
- Never more than one stage ahead of you before you reach civilization.
- Each rival's home direction and a start make-up from its biome (today every rival starts with your composition).
- Rebirth: if the roster empties before your civilization, a new rival born from a big body in a far biome.
- Biome travel: a rival drifting toward the biome it needs (you could take the comet before it does).
- Radiation in the meal plan (≤ 8%, ≥ 1% for an Energy tendency).
- Rivals stealing your moon, at a low rate, only when you are weaker.
- Army strength (ship cost × tendency) and a war decision by the target's defence (1.5× for a Raider, 2.5× Careful).
- Rival-vs-rival war; targets beyond you.
- No fire until the army is ready (today slugs start once a rival has seen you 6 s, in any stance).
- Carriers carrying fighters further.
- The target panel's verdict edge turning red when a wave is on course.
- Shots at Dyson haulers.
- After defeat: a beaten rival rebuilding slowly on the ledger, or a fresh roster slot.
- An open world as a colony target (only caught lifeless worlds are colonized today).

## Open issues

- **[J] Rival worlds collide:** two rival worlds met and one swallowed the other ("A world swallowed", playtest).
- **[J] One-hit wipes after volleys** (playtest): rival volleys took your shield 90 → 0 K in ~13 s, then one rock killed
  88% of your people. With `worldHeat` such a rock now wipes life outright: the infall issue in
  [civilizationgameplay.md](civilizationgameplay.md) → Open issues.
- **[J] Two kinds of rival world:** roster rivals stop at the living world on the ledger; a rival civilization takes a
  roster name but is spawned on the spot as a full civilization (0.5–1.08× you by temper, a fixed make-up), not grown
  from its ledger entry.
- **Age II rivals can grow and swallow a parked world** (a 0.48× rival grew to 1.3× and ate a parked 21k world at
  385 s); ideas in [vision.md](vision.md) → Open issues.
- **Still newcomer:** the 15 s hunter eats a player who never moves.
- The war wave's threat has not been re-played since the 2026-11-15 tempers.

## Decisions

Standing (README): you cyan, rivals violet; danger is seen, never told; fun first, then realism (the rubber band).

- **The rivals request** (user): rivals should not just attack; they grow a habitable world and keep it alive, may
  attack you directly in the asteroid stage, and build an army before they attack other planets.
- **One life step** (2026-11-13): rival worlds use LIFE as you do.
- **Rivals by temper** (user, 2026-11-15: "rivals can beat me, some don't"): only a Careful rival turtles; a Hungry or
  Raider one keeps attacking, and their silo loads while the wave masses (`SALVO_LEAD` Careful +0, Hungry +2, Raider
  +1). A Careful one cannot beat a new civilization (hold), a Hungry one beats it if it stays, a Raider fast (run).
- **No rival throw** (user, 2026-11-15): rivals never launch their rock moon; it only circles their world as a passive
  guard, and you can steal it there.

Pending, from the rivals plan:

1. **Roster size:** 4 named rivals per run, or fewer and more personal (2–3)?
2. **Alliances:** the design doc says you can "pull them to your side with an alliance". Plan it now (a peaceful rival
   that sends fighters to help) or later?
3. **Rivals at the star stage:** stop at civilization for now, or also let them claim stars?
4. **Should rivals eat each other** in Age I (two roster rivals meeting)? Fun spectacle, but it can empty the roster
   early.
