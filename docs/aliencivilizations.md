# Alien civilizations

Rivals: Age I cores, the named roster and its off-screen ledger, rival worlds that forge and grow life, rival
civilizations you fight, defeat and spoils. Labels and standing decisions: [README.md](README.md). **[J]**, **[M]** =
package IDs ([vision.md](vision.md)).

Code (`app/src/evolution/`): `asteroid/rival.ts` (steering, the guard moon), `asteroid/field.ts` (arrival),
`rivals/ledger.ts` (roster, personas and memory, off-screen life, pure stance, wave, engine and pursuit rules), `civilization/rivals.ts`,
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
- **Personas** (`asteroid/persona.ts` `CORE`). The numbers above are the Grazer's. A named core reads its temper; a wild
  core draws Hunter 25%, Lunger 20%, Shadow 15%, Skittish 15%, Grazer 25%. The scripted hunters (the first one, and big
  hunters with no name) stay Grazers.

  | Core | Hunt you | Meal | Nerve | Stamina × | Rest × | Chase × | Reads as |
  |---|---|---|---|---|---|---|---|
  | Grazer | 3 | 0.8 | 1 | 1 | 1 | 1 | today's core |
  | Hunter | 6 | 0.87 | 1.3 | 2 | 0.5 | 1 | aggressive: comes for you once it is 1.15× you, long chases |
  | Skittish | 0 | 0.8 | 0.8 | 1 | 1 | 1 | hesitant: never hunts you, bolts at ≥ 0.8× its mass |
  | Lunger | 4 | 0.8 | 1 | 0.35 | 2 | 1 | tests the waters: a 1.4–2.45 s lunge, then drifts off if you sidestep or run |
  | Shadow | 3 | 0.8 | 1.1 | 4 | 0.5 | 0.7 | slow and relentless, back soon |

  - Hunt you: how much it wants you over a rock of your mass, × (1 + spite).
  - Meal: the biggest share of its mass it goes for.
  - Nerve: it flees bodies heavier than nerve × its mass.
  - Stamina, rest and chase multiply the 4–7 s chase, the 2–3.5 s rest and the 7 D/s chase speed.
  - Temper → core: Brute and Raider → Hunter; Stalker → Shadow; Prober and Jackal → Lunger; Careful → Skittish; Hungry
    and Grudger → Grazer.

### Roster and ledger

`rivals/ledger.ts`: 5 named rivals a run from a table of 12 ("Vorr", "Kael", "Ithra", "Sundo"…), one persona each
(`PROFILE`, never shown), drawn by group: bold, mid, cautious, bold, bold-or-mid, no persona twice (never a passive
roster). Seed 292: Stalker, Hungry, Grudger, Brute, Raider.

- Off the map they ease toward their persona's share of your mass (table) over ~40 s, within 0.3–1.5×, starting at
  0.4–0.9× (over a 20-minute run 0.30–1.07×, at 20:00 0.70–1.04×, 2026-11-17).
- Top-ups after the first hunter bring the next one in round robin (away longest) with its ledger mass and make-up;
  leaving returns it, dying ends it ("… is gone"). The first hunter and top-ups while all five are out stay unnamed.
- Names show in the target panel and the game-over line.
- **Memory** (`remember`, `Entry.spite` −1..1, for the run): when a rival civilization leaves the map, you beat it
  (bold +1, mid and cautious −1), else hurt it (bold and mid +0.5, cautious −0.5), else its wave burnt your stock (+0.5).
  Spite lowers the odds it attacks at (× 1 − 0.5 spite) and stretches its patience (× 1 + spite, ≥ ×0.5).
  `Entry.met` counts its meetings as a civilization: the second toasts "… is back".

#### Personas

Rival civilizations read the row of their roster entry's temper (unnamed: Hungry). Odds are the least strength ratio it
attacks at, × hurt once you have killed some of its people, × weak while your shield is under half.

| Persona | Group | Share | Mass × you | Lead | Salvo + | Wave ship | Odds (× hurt, × weak) | Defend | Explore / mass / wave s | Retreat | Patience / rest s | Engines R/s², close R/s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hungry | mid | 1.15 | 0.9–1.08 | 1 | 2 | 10 | 0.8 | – | 15 / 20 / 35 | 40% | 20 / 90 | 0.6, 3 |
| Careful | cautious | 0.6 | 0.5–0.7 | 0 | 0 | 14 | 1.2 | 80% | 15 / 20 / 35 | 40% | 5 / 90 | 0.6, 3 |
| Raider | bold | 0.9 | 0.7–1 | 2 | 1 | 7 | 0.6 | – | 15 / 20 / 35 | 40% | 40 / 90 | 0.6, 3 |
| Brute | bold | 1.3 | 0.9–1.08 | 1 | 2 | 6 | 0.3 (× 0.5 hurt) | – | 8 / 14 / 45 | 70% | 25 / 30 | 1.5, 6 |
| Stalker | bold | 1.25 | 0.8–1 | 1 | 1 | 9 | 0.7 (× 0.7 weak) | – | 12 / 20 / 35 | 40% | 120 / 10 | 1.2, 8 |
| Jackal | mid | 0.8 | 0.6–0.85 | 1 | 1 | 8 | 1.6 (× 0.3 weak) | 50% | 20 / 16 / 30 | 30% | 30 / 45 | 0.9, 5 |
| Prober | cautious | 0.75 | 0.6–0.9 | 0 | 1 | 5 | 0.5 (× 2.5 hurt) | 50% | 8 / 12 / 15 | first loss | 4 / 45 | 0.6, 3 |
| Grudger | cautious | 0.7 | 0.6–0.9 | 1 | 2 | 8 | 9 (× 0 hurt) | – | 25 / 16 / 45 | 60% | 60 / 15 | 1.0, 5 |

How each reads: Hungry balanced; Careful turtles and lets you go in 5 s; Raider an extra veil, cheap fast waves, follows
40 s; Brute closes fast, attacks outgunned, fights to 70% losses, angrier when hurt, quits at 25 s but is back in 30 s;
Stalker follows 120 s at up to 8 R/s and rests 10 s; Jackal shadows and volleys, waves the moment your shield is under
half, goes home on light losses; Prober small early jabs, its wave home at the first loss or 15 s, quits in 4 s if you
back off, stops once hurt; Grudger never starts a wave, once hurt attacks at any odds, follows 60 s, back in 15 s.

Its pad's tell before a salvo (2026-11-18; Rocket volleys → `TELL`): Hungry an even 1.5 s build; Careful a long, small
2 s glow; Raider snaps bright early and holds 1.2 s; Brute the hottest and shortest, 1 s; Stalker a long slow 2.6 s
swell; Jackal dim unless your shield is under half; Prober four flickers, then commits; Grudger two slow throbs, then
commits.

### Rival worlds (forging and living)

- From 3,162 a named rival melts through once and runs your climate and life rules on and off the map; never past the
  gas line.
- **Eats by its weakest condition** (`want`): water < 30% → Frost Reach mix, air < 0.7 atm with gas < 12% → Veil Nebula,
  metal < 9% → Iron Graveyard, else Stone Drift; nothing within 10 K of boiling; on the map such prey counts ≤ ×3.
- Melts at 126–163 s, reaches LIFE 195–205 s later (2026-11-17).
- On the map they never hunt you: feeding trips ≤ 1.5 D/s, drift at 1, back off at ≤ 3. The target panel shows their life
  chips; your hits set their life back ("… 's life set back").
- **Personas** (`persona.ts` `WORLD`, read from the temper; the numbers above are the Settler's). None of them hunts you.

  | World | Trip D/s | Nerve | Contest | Shy | Flinch D/s | Reads as |
  |---|---|---|---|---|---|---|
  | Settler | 1.5 | 1 | 0 | no | – | today's world |
  | Rustler | 2.5 | 1.3 | 2 | no | – | aggressive: goes for the rocks nearest you, won't make way |
  | Hermit | 1.5 | 0.8 | 0 | yes | – | hesitant: backs away from you whatever your mass |
  | Edger | 2 | 1 | 2 | no | 2 | tests the waters: feeds beside you, backs off the moment you close |

  - Contest: prey score × (1 + contest × closeness to you), where closeness is 1 at your surface and 0 from half its
    sense range.
  - Shy: you always count as a threat. Flinch: you count as one while closing faster than this.
  - Temper → world: Brute, Raider and Hungry → Rustler; Prober, Jackal and Stalker → Edger; Careful → Hermit; Grudger →
    Settler.
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
  - **Quiet clock** (user, 2026-11-17: less passive; `rules.ts` `QUIET`, `hurry`): with no live rival near, travel
    counts × (1 + quiet s / 60), ≤ ×4 after 3 min. It multiplies travel, so a parked world still gets none and a void
    stays near empty (400 → 100 view widths).
  - **Co-moving spawn** (`SPAWN_IN` 2): a new world takes your velocity less up to 2 R/s, plus its own slow drift, so one
    met at cruise slides in ahead of you instead of flashing past.
- **Mass by persona** (`PROFILE` mass, table): 0.5–1.08×, never 1.1×; none eats you on a touch. Violet lights and veil,
  seas, a fixed make-up.
- **Named** [J]: the next free roster rival ("Maru's civilization · Violet lights on a world nearby · they will shoot once
  they see you"; again: "Maru is back"; else "Another civilization"); its persona is never shown; leaving writes its mass
  and memory back, swallowed it is gone.
- **Level** (`rivalLevel`): yours − 1 + its persona's lead (Careful and Prober yours − 1, Raider yours + 1, the rest
  yours); +1 per 5 min, ≤ yours + 1 (yours = shield level, ≥ 1). Extra veils show it.
- **Rock moon:** a passive guard on its circle, turning against the world's orbit round you; never thrown; stealable
  mid-fight by matching it on a free ring of yours; a new one in 30 s ([planetgameplay.md](planetgameplay.md) → Stealing).
- **Gravity and engines** (user, 2026-11-14: its gravity must affect you): an ordinary gravity body all its life
  (`WORLD_FLAGS` = `held` + `pulls`). Within 30 R and while it follows you, its engines (`stationStep`, ≤ its persona's
  0.6–1.5 R/s², closing ≤ 3–8 R/s) put it on an orbit 8–12 R off you at the pair's circular speed, so the worlds waltz;
  it keeps 6 R from other rival worlds and dodges your rockets. Beaten: engines off, your gravitating companion. One
  plume quad.
  - **Giving up** (user, 2026-11-17; `pursueStep`): time outside its kept distance + 2 R with the gap not shrinking builds
    up (closing drains it); past its persona's patience (4–120 s, × 1 + spite, ≥ ×0.5) its engines go off and it lets
    you go for its rest (10–90 s), stance held at gather, its wave called home. Station-keeping beside you never gives up.
  - Computed (ledger.test.ts, 2026-11-17): passed at 6 R/s on its kept 10 R, Brute, Stalker and Grudger are back on
    station in 15 / 18 / 20 s; the others fall past 30 R in 4–6 s.
  - Computed (2026-11-16): alive it holds 10.0 R for 120 s; beaten and parked it falls in at 9.9 s and melts you.
- **Stances** [J] (`stance`, each second):
  - *Attack:* a wave is out, or stock ≥ its wave ship cost × `waveFighters(L)` and the odds suit: strength ratio ≥ its
    odds × hurt × weak × (1 − 0.5 spite) (table; strength = fighters + 5 × frigates + 2 × shield level).
  - *Defend:* its shield under its persona's share (Careful 80%, Jackal and Prober 50%), or no home fleet; an open world
    stays here.
  - *Explore:* you out of reach or seen < its explore s (8–25): one harmless probe circles you 10 s (≤ one per 25 s, on
    screen only).
  - *Gather:* a miner digs the nearest free rock (0.01–3%) within 8 rival radii for 2 s, takes 30%, brings 4 stock; stock
    also grows 0.15 × level a second. Also held while it rests after giving up.

#### War waves

[J]; weapons and roles: [civilizationgameplay.md](civilizationgameplay.md) → Battles.

- `waveFighters(L)` = 1/2/3/3 fighters from stock, plus every frigate (`rivalFrigates` 0/1/1/2 at L1–4; a lost one rebuilt
  in 60 s for 4 wave ships' stock).
- Masses its persona's 12–20 s with its world on screen (seen, never told): fighters in a V, frigates on their battery
  circuit.
- Out, fighters strafe you in wings of three, 3 rounds at 6/s, picking your frigate, then ships and miners within 8 R,
  else your world (0.2 K a round on the shield, ore once down). Flight: [shipsandflight.md](shipsandflight.md) → Rival
  ships away from home [J].
- Frigates stay home and lance (3 × 7.5 K every 10 s after a 1.5 s glow, clear line only); the pad keeps launching salvos.
- **Home** at its persona's losses (40%: a wave of 3–4 at its 2nd; Prober the first loss, Jackal 30%, Grudger 60%,
  Brute 70%), a frigate lost, after its wave s (15–45), outrun, its shield under its defend share, your people at the
  raid floor (≤ 45% a wave), or once its world gives up following you.

#### Rocket volleys, ships, damage

- **Rocket volleys** [M] (user, 2026-11-17: rivals use your rockets): armed only within 2 × their mining reach (`armReach`;
  the lance has the same gate); a rocket's fuel is the fire range (3 ×, `fireReach`). After 6 s on screen (`T_SEE`) the pad glows facing you
  for its persona's tell (`ledger.ts` `TELL`, table below; was `RIVAL_GLOW` 1.5 s for all until 2026-11-18), then `rivalSalvo(L, salvo)` rockets (level + its persona's 0–2, ≤ 4) ripple out 0.25 s
  apart every `RIVAL_SALVO` 8 s. Outside a wave: none while your shield is down and 30 s after (`REST_S`), and a hit kills
  none of your people; with a wave out its raid caps apply. An L1 shield under salvos of 2 (half land) for 10 min is down
  83% without the rest, 33% with it (2026-11-17).
- **Tell** (2026-11-18; `ledger.ts` `TELL`, `tell`; drawn in `rivals.ts` `look`: size max(R × (0.1 + 0.15 k), 6 px),
  alpha min(1, 0.4 + 0.5 k)): brightness k = u^pow × hot (u the share of `s` gone); a blinking tell flickers sin² `blink`
  times, then builds steadily over its last `COMMIT` 40%; × dim unless your shield is under half. No tell under `TELL_MIN` 1 s,
  each under its wave's massing.

  | Persona | s | pow | hot | blink | dim |
  |---|---|---|---|---|---|
  | Hungry | 1.5 | 1 | 1 | – | 1 |
  | Careful | 2.0 | 1 | 0.8 | – | 1 |
  | Raider | 1.2 | 0.5 | 1.1 | – | 1 |
  | Brute | 1.0 | 0.5 | 1.5 | – | 1 |
  | Stalker | 2.6 | 2.5 | 1 | – | 1 |
  | Jackal | 1.5 | 1 | 1 | – | 0.4 |
  | Prober | 1.8 | 1 | 1 | 4 (commits 0.72 s) | 1 |
  | Grudger | 1.6 | 1 | 1.2 | 2 (commits 0.64 s) | 1 |

  Brute's 1 s checked against the dodge window (2026-11-18, 300 seeded salvos of 3–4 from 8–12 R, a 7.5 R/s² burn across
  begun 0.5–1 s before the first launch: a 1 s tell less 0–0.5 s reaction): 25–55% of its rockets land, under the 85% that
  would lengthen it; at least one rocket of every salvo still lands (a burn 1.2 s ahead: 49% of salvos). Kept at 1 s.
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
- **Duels by persona** (ledger.test.ts, 2026-11-18, rockets both sides, each at the level it meets you; win / lose,
  median time of the side that won most; the sim lands 61% of yours, the dodge sim below over its keep, and half of
  theirs):

  | Persona | tier 1 (L1, 2 fighters, 10 ore) | tier 3 (L2, 4 fighters, frigate, 60 ore) | tier 5 (L3, 6 fighters, 2 frigates, 120 ore) |
  |---|---|---|---|
  | Careful | L1: 0 / 0% (hold) | L1: 100 / 0%, 43 s | L2: 100 / 0%, 31 s |
  | Hungry | L1: 0 / 76%, 619 s; L2: 0 / 100%, 267 s | L2: 100 / 0%, 70 s; L3: 100 / 0%, 100 s | L3 50 s, L4 60 s, 100 / 0% |
  | Raider | L2: 0 / 100%, 243 s (run) | L3: 95 / 5%, 111 s | L4: 100 / 0%, 60 s |
  | Brute | L1: 0 / 98%, 424 s (run) | L2: 75 / 25%, 70 s | – |
  | Stalker | L1: 0 / 42%, 739 s | L2: 100 / 0%, 70 s | – |
  | Jackal | L1: 0 / 0% (hold) | L2: 100 / 0%, 70 s | – |
  | Prober | L1: 0 / 1% (hold) | L1: 100 / 0%, 50 s | – |
  | Grudger | L1: 0 / 0% (hold) | L2: 100 / 0%, 80 s | – |

  A new civilization never wins and keeps ≥ 50% of its people for the first minute against every persona: time to
  leave. Fleeing from 10 R at 2 R/s² clears their 30 R in 5.3 s (Hungry, Careful, Raider, Prober), Jackal 5.9, Grudger
  6.2, Stalker 6.8, Brute 8.4 s.
- **Sustained K/s on a shield:** fighter 0.48, frigate 2.03, your rockets 3.3 (20 K per 6 s); a rival's salvo × 20 K per 8 s.
- **Time to break an equal shield** L1 / L2 / L3 (s; rules.test.ts, 2026-11-18, measured with the stun):

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
- **A rival world dodges your rockets** (`DODGE`, `evade`; user, 2026-11-18: a small margin to dodge, bots and players
  alike): it waits until a rocket is within 1.2 s (`t`), reacts after 0–0.4 s, builds thrust over 0.15 s across the
  rocket's line of sight up to 5 R/s, brakes 1.2 s back. Salvos of 1–3 land 98 / 24% from 8 / 12 R, 61% over its kept
  8–12 R (burn 5 / 14 R/s²: 99 / 35%), 100% if it only cruises; a salvo can be slipped whole (2026-11-18, rockets 9 R/s).
- **A rival's salvo at you** (in your radii, so size does not matter; the same rocket): holding still, coasting, reacting
  late, at half thrust or burning away, every rocket lands; a full burn across slips 22–45% at 6–7.5 R/s² (5 R/s²: none).
  Deliberate change (2026-11-18): burning away no longer outruns a rocket, only range does. Rocket flight:
  [shipsandflight.md](shipsandflight.md) → Rockets.

### Rule: no undefeatable guided rockets

Concept 8: "we want realistic enemies here, not enemies with guided missiles that can never be defeated." Rounds and bolts
fly straight; rockets fly by real thrust (nose ≤ 2.8 rad/s, 11.7 R/s²) and only the fire range; the seeker lets go 0.57 s
before the hit, so a hard burn across in the rocket's last half second, range, a round or any body beats them ([shipsandflight.md](shipsandflight.md) → Rockets). Rival ships can be shot and die on rocks.

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

Not built: progress toasts; temperament weights for meals; population and army strength on the ledger (war by
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
  (`PROFILE` salvo +0 / +2 / +1). Careful cannot beat a new civilization (hold), Hungry beats it if it stays, Raider fast (run).
- **No rival throw** (user, 2026-11-15): the rock moon only circles as a passive guard; you can steal it.
- **Rival worlds with their own goals** (user, 2026-11-17: know when to engage, retreat, abandon a pursuit or ignore you;
  isolated regions feel isolated): engines within 30 R; give up an outflown chase by temper and mine 90 s; arrive by
  travel × density.
- **Rockets both sides, in range** (user, 2026-11-17): rivals launch your rocket instead of slugs and a silo, only in range.
- **Personas and memory** (user, 2026-11-17: less passive rivals, each with its own character): 8 personas in one table,
  a roster of 5 drawn by group (never passive); patience by persona replaces 5 / 20 / 40 s; a Jackal waves while your
  shield is down; spite and meetings kept on the ledger for the run ("… is back"); a quiet clock speeds arrival up to
  ×4; a new world moves with you, at most 2 R/s slower.
- **Personas by stage** (user, 2026-11-17: asteroid and planet rivals each need their own). Each stage has its own table
  (cores, worlds, civilizations), and every table reads the rival's one temper. Bold named cores may eat you: a Hunter
  comes for you once it is 1.15× you.

Pending (rivals plan): 1. Alliances (the design doc's "pull them to your side") now or later? 2. Rivals at the star
stage? 3. Rivals eating each other in Age I?
