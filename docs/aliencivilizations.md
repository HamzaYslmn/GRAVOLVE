# Alien civilizations

Rivals: Age I cores, the named roster and its off-screen ledger, rival worlds that forge and grow life, rival
civilizations you fight, defeat and spoils. Labels and standing decisions: [README.md](README.md). **[J]**, **[M]** =
package IDs ([vision.md](vision.md)).

Code (`app/src/evolution/`): `asteroid/rival.ts` (steering, the guard moon), `asteroid/field.ts` (arrival),
`rivals/ledger.ts` (roster, off-screen life, pure stance, wave, engine and pursuit rules), `civilization/rivals.ts`,
`civilization/away.ts` (ships away) and the rival block of `civilization/rules.ts`. Tests: `test/rivals/ledger.test.ts`;
`away.ts` in `test/civilization/flight.test.ts`. Flight and art: [shipsandflight.md](shipsandflight.md). Pirates:
[gameevents.md](gameevents.md) → Pirates.

## Built

### Age I cores

`asteroid/rival.ts`: steer like you with drag 0.1 and 55% of your thrust.

- Look every 0.6–1.1 s and aim at a rough guess of the prey's path (a sidestep makes them overshoot); chase at 7 own
  diameters/s (≤ 7 of yours), tire after 4–7 s, drift 2–3.5 s.
- Hunt bodies 2–80% of their mass, flee heavier, want you 3× a rock your mass; violet halo (`0xb48cff`).
- **Recipe hunger** (`asteroid/rules.ts` `need`): dry wants ice ×3, metal-poor metal ×2, near the gas line gas ×0.2.
- **No fast hits:** they dodge anything on course within 2 s closing faster than the stick speed, and brake to half the
  stick speed on approach (0 of 14 hits bounced, 2026-11-13).
- **Arrival** (`field.ts`): ≤ 3 loaded, one per 20 s, none in the first 15 s, by distance travelled (stopped while
  parked), few across a void, more along the web. The first is a hunter 1.4–1.8× you from a side edge, on screen a few
  seconds before it can reach a still you; others 0.35–2× (≤ M_MAX); past M_MAX 0.3–0.9×, and ~1 in 3 a hunter 1.2–2× at
  3 D/s (`BIG_HUNTER` 0.35).

### Roster and ledger

`rivals/ledger.ts`: 4 named rivals a run (Hungry, Careful, Raider, one random) from a table of 12 ("Vorr", "Kael",
"Ithra", "Sundo"…).

- Off the map they ease toward 1.15× / 0.6× / 0.9× your mass (Hungry / Careful / Raider) over ~40 s, within 0.3–1.5×,
  starting at 0.4–0.9× (at 20:00 all 0.30–1.01×, 2026-11-16).
- Top-ups after the first hunter bring the next one in round robin (away longest) with its ledger mass and make-up;
  leaving returns it, dying ends it ("… is gone"). The first hunter and top-ups while all four are out stay unnamed.
- Names show in the target panel and the game-over line.

### Rival worlds (forging and living)

- From 3,162 a named rival melts through once and runs your climate and life rules on and off the map; never past the
  gas line.
- **Eats by its weakest condition** (`want`): water < 30% → Frost Reach mix, air < 0.7 atm with gas < 12% → Veil Nebula,
  metal < 9% → Iron Graveyard, else Stone Drift; nothing within 10 K of boiling; on the map such prey counts ≤ ×3.
- Melts at 132–174 s, reaches LIFE 198–207 s later (2026-11-16).
- On the map they never hunt you: feeding trips ≤ 1.5 D/s, drift at 1, back off at ≤ 3. The target panel shows their life
  chips; your hits set their life back ("… 's life set back").
- **Guard moon** (`tendMoon`): once life starts it holds one body of 0.5–5% within 10 radii on a circle easing to 3 radii,
  swinging it (≤ 2.5 rad/s) at the most urgent fast body ≤ 2× the moon on course. Stolen like any moon (user, 2026-11-17): fly onto a free
  ring and match its speed; let go when its life ends, it counts as stolen for 30 s. You can break it.

### Rival civilizations

`civilization/rivals.ts`; they come only once you host a civilization.

- **Arrival** (user, 2026-11-17: isolated space should feel isolated): by travel × local pace (`rules.ts` `pace`: fill at
  you ÷ 0.2, clamped 0.02–1.5, sampled each second). View widths between rivals: void 400 (effectively never), median
  plain belt 28, median Kuiper 17, fill 0.2 8, dense biome 5.3. First at 3 paced view widths into your civilization, then
  every 8; ≤ 2 loaded, at the quietest of six spots 1.25–1.6 half-diagonals ahead, ≥ 12 R from you. One dropping out of
  reach makes the next wait a full 8, so fleeing never summons one.
- **Mass by temper** (`RIVAL_MASS`): Careful 0.5–0.7×, Raider 0.7–1×, Hungry (and unnamed) 0.9–1.08×; none eats you on a
  touch. Violet lights and veil, seas, a fixed make-up.
- **Named** [J]: the next free roster rival ("Maru's civilization · Violet lights on a world nearby · they will shoot once
  they see you"; else "Another civilization"); its temper is never shown; leaving writes its mass back, swallowed it is
  gone.
- **Level** (`rivalLevel`): Careful yours − 1, Hungry yours, Raider yours + 1; +1 per 5 min, ≤ yours + 1 (yours = shield
  level, ≥ 1). Extra veils show it.
- **Rock moon:** a passive guard on its circle, turning against the world's orbit round you; never thrown; stealable
  mid-fight by matching it on a free ring of yours; a new one in 30 s ([planetgameplay.md](planetgameplay.md) → Stealing).
- **Gravity and engines** (user, 2026-11-14: its gravity must affect you): an ordinary gravity body all its life
  (`WORLD_FLAGS` = `held` + `pulls`). Within 30 R and while it follows you, its engines (`stationStep`, ≤ `A_ENG` 0.6 R/s²)
  put it on an orbit 8–12 R off you at the pair's circular speed, so the worlds waltz; it keeps 6 R from other rival
  worlds and dodges your rockets. Beaten: engines off, your gravitating companion. One plume quad.
  - **Giving up** (user, 2026-11-17; `pursueStep`): time outside its kept distance + 2 R with the gap not shrinking builds
    up (closing drains it); past its patience (Careful 5 s, Hungry 20 s, Raider 40 s) its engines go off and it lets you
    go for 90 s, stance held at gather. Station-keeping beside you never gives up.
  - Computed (2026-11-16): alive it holds 10.0 R for 120 s; beaten and parked it falls in at 9.9 s and melts you.
- **Stances** [J] (`stance`, each second):
  - *Attack:* a wave is out, or stock ≥ `WAVE_COST` (Hungry 10, Careful 14, Raider 7) × `waveFighters(L)` and the odds
    suit (`ODDS` Careful 1.2, Hungry 0.8, Raider 0.6; strength = fighters + 5 × frigates + 2 × shield level).
  - *Defend:* a Careful rival's shield under 80%, or no home fleet; an open world stays here.
  - *Explore:* you out of reach or seen < 15 s: one harmless probe circles you 10 s (≤ one per 25 s, on screen only).
  - *Gather:* a miner digs the nearest free rock (0.01–3%) within 8 rival radii for 2 s, takes 30%, brings 4 stock; stock
    also grows 0.15 × level a second. Also held while it rests after giving up.

#### War waves

[J]; weapons and roles: [civilizationgameplay.md](civilizationgameplay.md) → Battles.

- `waveFighters(L)` = 1/2/3/3 fighters from stock, plus every frigate (`rivalFrigates` 0/1/1/2 at L1–4; a lost one rebuilt
  in 60 s for 4 wave ships' stock).
- Masses 20 s with its world on screen (seen, never told): fighters in a V, frigates on their battery circuit.
- Out, fighters strafe you in wings of three, 3 rounds at 6/s, picking your frigate, then ships and miners within 8 R,
  else your world (0.2 K a round on the shield, ore once down). Flight: [shipsandflight.md](shipsandflight.md) → Rival
  ships away from home [J].
- Frigates stay home and lance (3 × 7.5 K every 10 s after a 1.5 s glow, clear line only); the pad keeps launching salvos.
- **Home** at 40% losses (a wave of 3–4 at its 2nd), a frigate lost, after 35 s, outrun, a Careful shield under 80%, or
  your people at the raid floor (≤ 45% a wave).

#### Rocket volleys, ships, damage

- **Rocket volleys** [M] (user, 2026-11-17: rivals use your rockets): only within their fire range (2 × their mining reach,
  `fireReach`; the lance has the same gate). After 6 s on screen (`T_SEE`) the pad glows `RIVAL_GLOW` 1.5 s facing you
  (the tell), then `rivalSalvo(L, SALVO_LEAD)` rockets (level + Careful 0, Hungry 2, Raider 1, ≤ 4) ripple out 0.25 s
  apart every `RIVAL_SALVO` 8 s. Outside a wave: none while your shield is down and 30 s after (`REST_S`), and a hit kills
  none of your people; with a wave out its raid caps apply. An L1 shield under salvos of 2 (half land) for 10 min is down
  83% without the rest, 33% with it (2026-11-17).
- **Ships:** home patrols (≤ 4, level + 1) break rocks heading home, hunt your ships near it and pirates [M]; a lost patrol
  is rebuilt every 20 s up to `YARD` 2 fleets. Ships away steer round rocks and die on contact.
- **Damage** via `weaponHit` like yours: shield first (`shieldShot`, 3 s stun); through an open one your rounds burn 0.2 u
  of their stock (≤ 20 u a sortie) and heavy fire lands every 20 K (people × 0.8). Bodies meet their shell by your rules.
  No heat on their crust.

#### Defeat

- **Fleet gone = open** [J]: yard spent and home fleet empty: no rebuilds, shield stops mending, waves go home ("Their
  fleet is gone"); a site of 300·L ore + 100·L volatiles (`SITE`) your miners work at 2.5
  ([civilizationgameplay.md](civilizationgameplay.md) → Roaming miners and the mining link [G]).
- **Beaten at 20% people:** lights out, ships gone, 6 metal-rich pieces (1.5% of the world) sprayed slowly ("Rival
  beaten"); the dead world stays your companion until you leave it; mined to moon size it is catchable. Swallowed with its
  people: "A world swallowed". Achievement "Duelist".

### Fighting a rival world

User: early encounters should feel dangerous, sometimes forcing an escape.

- **The siege** starts from 18 R (`RECALL`) when the world is your priority, by itself within 14 R (`STRIKE`); geometry:
  [shipsandflight.md](shipsandflight.md) → Strike.
- **Duels by temper** (ledger.test.ts, 2026-11-17, rockets both sides; win / lose, median time):

  | You | Careful | Hungry | Raider |
  |---|---|---|---|
  | tier 1 (L1, 2 fighters, 10 ore) | L1: 0 / 0% (hold) | L1: 0 / 73%, 625 s; L2: 0 / 100%, 263 s | L2: 0 / 100%, 243 s (run) |
  | tier 3 (L2, 4 fighters, frigate, 60 ore) | L1: 100 / 0%, 50 s | L2: 100 / 0%, 91 s; L3: 99 / 1%, 141 s | L3: 92 / 8%, 142 s |
  | tier 5 (L3, 6 fighters, 2 frigates, 120 ore) | L2: 100 / 0%, 40 s | L3 60 s, L4 67 s, 100 / 0% | L4: 100 / 0%, 80 s |

  A new civilization never wins and keeps ≥ 50% of its people for the first minute: time to leave. Fleeing from 10 R at
  2 R/s² clears their 30 R in 5.3 s.
- **Sustained K/s on a shield:** fighter 0.48, frigate 2.03, your rockets 3.3 (20 K per 6 s); a rival's salvo × 20 K per 8 s.
- **Time to break an equal shield** L1 / L2 / L3 (s; rules.test.ts, 2026-11-17, measured with the stun):

  | Fire | Measured |
  |---|---|
  | 2 strike fighters | 34 / 65 / 95 |
  | 3 fighters | 24 / 44 / 65 |
  | frigate alone | 15 / 35 / 55 |
  | frigate + 2 fighters | 13 / 23 / 33 |
  | rival rockets, all / half land (salvo = level) | 12 / 28 |
  | your rockets, all land | 9 / 21 / 33 |

- **Ground phase** (people 1 → 0.2, 2026-11-16): a frigate 79 s, frigate + rival rockets 35 s, fighters never; a lone
  frigate cannot keep a shield down (10 s reload > 3 s stun).
- **A rival world dodges your rockets** (`DODGE`, `evade`): reacts after 0–0.4 s, builds thrust over 0.3 s across the
  rocket's line of sight up to 5 R/s, brakes 1.2 s back. Salvos of 1–3 land 65 / 58% from 8 / 12 R, 53% over its kept
  8–12 R, 100% if it only cruises; every salvo of 2–3 lands one (2026-11-17).
- **A rival's salvo at you** (in your radii, so size does not matter): holding still, coasting or reacting late, every
  rocket lands; a burn across just after launch slips about half; an early burn away outruns it. Rocket flight:
  [shipsandflight.md](shipsandflight.md) → Rockets.

### Rule: no undefeatable guided rockets

Concept 8: "we want realistic enemies here, not enemies with guided missiles that can never be defeated." Rounds and bolts
fly straight; rockets fly by real thrust (nose ≤ 2.6 rad/s, 16 R/s²) and only the fire range, so an early burn, a 10 R/s ship, a round or any body
beats them ([shipsandflight.md](shipsandflight.md) → Rockets). Rival ships can be shot and die on rocks.

## Planned

A rival is you on another seed: the same ladder and rules with a small AI for meals and stances; you meet the same names
again. Concept 8: strategic opponents that protect their systems, harass, compete and slow you.

| Their stage | Goal | Towards you | Status |
|---|---|---|---|
| Asteroid | grow to 3,162 | hunts you when ≥ 1.15×, flees when lighter | Built |
| Forging | a habitable recipe | competes for rocks | Built, except stealing your moon |
| Living | keep life | avoids you; defends its moon | Built |
| Civilization | army, then war | waves when stock and odds allow | Built in part [J] |
| Star | Dyson, link | rival star claims ([gameevents.md](gameevents.md) → Event catalogue) | Planned |

Not built: progress toasts; temperament weights for meals and risk; population and army strength on the ledger (war by
the target's defence: 1.5× Raider, 2.5× Careful); never a stage ahead of you before civilization; home direction and
biome make-up; rebirth from a far biome; biome travel; rad in the meal plan (≤ 8%); stealing your moon when you are weaker;
rival-vs-rival war; no fire until the army is ready; carriers; a red verdict edge for a wave on course; shots at Dyson
haulers; rebuilding after defeat; an open world as a colony target.

## Open issues

- **[J] Rival worlds collide:** one swallowed another (playtest).
- **[J] One-hit wipes after volleys** (playtest): volleys took the shield 90 → 0 K in ~13 s, then one rock killed 88%;
  with `worldHeat` it now wipes life ([civilizationgameplay.md](civilizationgameplay.md) → Open issues).
- **[J] Two kinds of rival world:** a rival civilization takes a roster name but spawns on the spot, not grown from its
  ledger entry.
- **Age II rivals swallow parked worlds:** [vision.md](vision.md) → Open issues. **Still newcomer:** the 15 s hunter eats a
  player who never moves. The war wave's threat is not re-played since 2026-11-15 and 2026-11-17.

## Decisions

Standing (README): you cyan, rivals violet; danger is seen, never told; fun first (the rubber band).

- **The rivals request** (user): rivals grow and keep a habitable world, may attack you as asteroids, build an army before
  attacking planets.
- **One life step** (2026-11-13): rival worlds use LIFE as you do.
- **Rivals by temper** (user, 2026-11-15: "rivals can beat me, some don't"): only Careful turtles; salvos grow by temper
  (`SALVO_LEAD` +0 / +2 / +1). Careful cannot beat a new civilization (hold), Hungry beats it if it stays, Raider fast (run).
- **No rival throw** (user, 2026-11-15): the rock moon only circles as a passive guard; you can steal it.
- **Rival worlds with their own goals** (user, 2026-11-17: know when to engage, retreat, abandon a pursuit or ignore you;
  isolated regions feel isolated): engines within 30 R; give up an outflown chase by temper and mine 90 s; arrive by
  travel × density.
- **Rockets both sides, in range** (user, 2026-11-17): rivals launch your rocket instead of slugs and a silo, only in range.

Pending (rivals plan): 1. Roster size: 4 named, or 2–3 more personal? 2. Alliances (the design doc's "pull them to your
side") now or later? 3. Rivals at the star stage? 4. Rivals eating each other in Age I?
