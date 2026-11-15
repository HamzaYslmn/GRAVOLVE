# Ships and flight

How every ship flies (yours, rivals', pirates'), the routes they fly (patrol, strike, miner trips, pirate loops, rival
war waves, colony fleets), the guns they fire (one pool of rounds), the engine plumes, the ship classes and their roles, and the faction art
spec. Code: `app/src/evolution/civilization/` `flight.ts` (pure flight model and routes), `nav.ts` (steering round bodies,
the home steppers), `crash.ts` (collisions), `guns.ts` (rounds, missiles), all pure and checked in `app/test/civilization/`, `ships.ts` (defence logic, the frigate), `view.ts` (miner shuttles, drawing your ships), `pirates.ts`
(pirate routes), `rivals.ts` (rival ships), `star/colony.ts` (colony fleets), `render/shipArt.ts` and `render/tech.ts`
(art). What ships do for
the economy and the shield: [civilizationgameplay.md](civilizationgameplay.md); pirate raids as events:
[gameevents.md](gameevents.md) → Pirates; rival strategy: [aliencivilizations.md](aliencivilizations.md). Labels and
conventions: [README.md](README.md).

## Built

### Flight model (every faction)

Every ship of every faction flies nose first, like a ship with one main engine (`flight.ts` `thrust`, pure; user,
2026-11-14, Decisions). Steering sets the velocity it wants; the nose eases toward it (4 × its error a second, at most the
ship's turn rate, so a turn is an arc of radius speed ÷ turn rate) and the engine burns along the nose only. It throttles
back into a turn (half power at 90° off), brakes with a weak retro (`RETRO` 0.4 of the main thrust) and never flies
backwards; sideways slip bleeds off over 0.08 s (`GRIP`). Arcade, not Newtonian. Frames are cut into sub-steps ≤ 1/60 s
(dt ≤ 0.1 s): the same paths at any frame rate. `burn` (0–1: forward thrust plus the turn's share) sets the plume.

| Faction | Unit | Main thrust | Turn | Speeds |
|---|---|---|---|---|
| Your + rival fighters | home R | 12 R/s² | 3 rad/s | patrol 3, home ≤ 6, attack run 5.5 R/s |
| Frigate | R | 8 R/s² | 2.2 rad/s | patrol 2.4 R/s |
| Miner shuttles | R | 8 R/s² | 3 rad/s | 3 R/s; brakes at 0.75 × retro = 2.4 R/s² |
| Pirate raiders | your R | 4 × cruise | 2.2 rad/s | cruise 4–5.5 R/s |
| Pirate haulers | your R | 4 × their speed | 1.6 rad/s | 0.8 × cruise |
| Pirate marauder | your R | 4 × its speed | 1.2 rad/s | 0.8 × cruise |
| Rival ships away | your R | 4 × cruise | 2.2 rad/s (frigate 1.8) | 5 R/s |
| Colony fleets | R★ | 2 R★/s² | 3 rad/s | 2 R★/s |

| Piece | What it does |
|---|---|
| `avoid` | round a circle on its tangent, planned from afar; inside the circle it slides along and climbs out |
| `circuit` | one way round a centre: each waypoint 1.3–1.9 rad on in the ship's own sense, alternately in an inner and an outer band, picked once it passes the last one or comes within a turn radius of it |
| `follow` | a wingman's slot behind and beside its leader's nose: steer at a point ahead of the slot at the leader's speed, faster while it lags |
| `formation` | a fleet: a leader flies a route, the rest hold slots (a V on the lead, or wings of three); a follower farther than 8 R from its leader flies the route on its own |
| `strafe` | runs at a centre (or a ship): in at it, bent round a keep-out circle; inside the turn-out radius straight on out (or, with `swing`, turning away off straight out), past the turn-back radius round and in again |
| `guard` | one home-patrol sub-step: circuit or wing, round its scanned bodies (`clearRel`) and its world (`skirt`); a waypoint inside a keep-out moves out to its edge; a wingman whose slot lies in a keep-out takes the other side of its leader |
| `runStep`, `breakOff`, `breakStep` | a fighter's attack run and its break (Strike below) |
| `siegeRing`, `ringStep`, `siegePost` | the siege (`nav.ts`): the ring's radius round an enemy world (3.4 R past its surface, never within 2.5 R of your centre); one ring sub-step (radial error closed at 3/s, its slot held by ±50% pace, counter-clockwise in the enemy's frame); the frigate's post on it, on the bearing to you ± a side |
| `arrive`, `approach`, `ferry` | brake onto a moving point (stopping short of it; `ferry`: a shuttle's leg) |
| `keepOut` | never inside the world; the inward speed it took off is the frame's `slam` (a hard landing) |
| `chase`, `leash` | a fleet centre follows a target, never faster than a cap; the pursuit gives up: too far from you for 3 s, or outpaced for 20 s |
| `lowPass` | a fleet's frame velocity follows its centre's over 1 s |
| `swept`, `touch`, `bump`, `crash` | did a body cross a ship (or a round) along this frame's relative motion (no tunnelling); `bump`: the first contact with its normal and closing speed, or a near miss; `crash`: its grade (Navigation and collisions) |
| `scan` + `clear`, `free`, `reachOf` | every ship steers round the bodies in reach (keep-out 5 ship radii + lag), passing on the side it already flies; crumbs under `SPECK` 0.25 ship radii are ignored; threaded scans thread gaps (Navigation and collisions); `scanRel`/`clearRel` for ships in their world's frame; `free` moves a goal out of bodies; `reachOf` pre-filters once a frame |
| `menace`, `startJink`, `jinkStep` | a threat to a pirate (a ship closing nose-on, a round about to pass) and its two-leg jink |
| `leadAt`, `inArc`, `nearest` | the lead point for a round, whether it is in a gun's arc, the nearest foe in range |
| `createShots`, `pull`, `aim` | the pooled rounds and a gun's trigger (Guns below) |

Measured (Node, the real `flight.ts`, 60 fps; before = the 2026-11-13 model with sideways thrust): slip off the nose
15.8° median / 34.3° p90 → 2.3° / 8.7° on patrol, 19.3° / 35.8° → 4.6° / 8.8° for pirates; burn 0.02 / 0.08 → 0.16 /
0.64 on patrol, 0.12 / 0.28 → 0.29 / 0.60 for pirates; the nose turns 12.4 → 8.7 full turns a minute on patrol (8.6 of
them are laps round the world) and 14.2 → 11.1 for pirates.

### Patrol (defence ships)

Fighters fly in **pairs**: a leader on its `circuit`, a wingman 0.45 R behind and 0.35 R beside it, on the outside of
the hard turns in toward the world (`pairUp`, every frame: a lone ship joins the first leader without a wing; a wingman
whose leader is lost takes its route). The two flights go round the world opposite ways. Waypoints alternate between 2.0–
2.6 R and 3.8–4.6 R, each 1.3–1.9 rad on (seeded: the same at any frame rate), so a ship runs one way round its world,
swinging in and out; faster when far out (up to 6 R/s); it plans round its world at 1.25 R. Ships fly relative to their
world, so they keep up at any speed.

The circuit crosses your first moon slots (2.4, 3.4 and 4.4 R from your centre, `core/orbits.ts` slotRadius,
[planetgameplay.md](planetgameplay.md) → Moons); patrols steer round moons and rocks there and can still hit them
(Navigation and collisions) (user, 2026-11-13: no low orbit).

### Strike (attack run)

- Ships look 6 s ahead for bodies on course to hit the world that the shield cannot stop and that would hurt; the
  nearest idle ship takes each, soonest first ([civilizationgameplay.md](civilizationgameplay.md) → Shield).
- **Patrol → run → break → patrol:** the ship runs at 5.5 R/s toward the predicted meeting point (lead ≤ 3 s), round its
  own world; inside gun range (9 R off the target's surface) it points its nose at the lead point and fires bursts while
  the gun bears (Guns). It breaks off once closer than 1 R + 0.4 s × the closing speed off the surface (or once the
  target is gone, or yours: off course, or the run's rounds are spent, `FLEET.bursts` × `rounds`, then it cools `FLEET.cool`): it turns 80° off its velocity, away from the target, for 1.2 s, then picks up its circuit from
  where it is; what it shot is an ordinary obstacle again from the next frame (a run leaves its target out of its scan).
- Your fighters' first hit breaks a body ≤ 2% of you [F] into pieces your air burns up, and only bodies you cannot take safely ([civilizationgameplay.md](civilizationgameplay.md) → Breaking into food; probes' lasers only ≤ 0.5%, pushing 0.4× as hard, patrolling at 0.7× the pace; `FLEET.*.breaks`); rival ships' hits break bodies ≤ 0.5% of their
  world; heavier bodies get a sixth of the sideways kick that makes them miss per hit (≤ 1 D/s in all).
- A wingman follows its leader through the run and fires at the leader's target whenever its own gun bears.
- Idle ships hunt enemy ships (pirates, rival ships) within 9 R with the same run: a round that hits breaks the ship.
- **Rival home patrols fly the same** (`rivals.ts` calls the same `defend`, violet rounds, ≤ 4 ships); they also hunt
  pirate raiders (`rivals.watch`) [M].
- **The siege** (your fleet engaged on a rival world, [civilizationgameplay.md](civilizationgameplay.md) → Battles): the
  siege wing (every fighter but one, ≤ 5) leaves the threat duty to the home ships and flies `ringStep` round the enemy
  world, leaders spread evenly round it, wingmen on their slots (`guard`/`follow`; `pairUp` once for home ships, once for
  the wing). Idle ring ships run at enemy ships within 6 R of it. The strafing turn (every 4 s, one free leader): out on a
  ring 3 R wider, then a run in (above) once 2.5 R further out; it breaks and cools as usual and `ringStep` takes it back.
  Measured (Node, the run stepper alone, a 0.89 R world): straight from the ring a run broke off 2.4 R out with 0 rounds
  fired (the nose never came round); from 3 R further out, a 1.4 s run and one 6-round burst. Checked (`nav.test.ts`):
  from your world to the ring of a world 10 R off drifting 0.5 R/s in 2.4 s, held 20 s, ≥ 3.27 R off its surface, 1.6
  turns in 30 s at 30/60/120 fps. Not yet tried in a test tab.
- Measured (`flight.test.ts`, a 0.4 R body falling from 20 R at 4 R/s, 5 sides, 30 and 120 fps): the first round
  leaves 8.9–9.0 R off its surface 1.8–2.2 s in (the same within 0.02 s at both frame rates), 5 of 5 rounds hit, the
  first at 2.05–2.41 s with the body still 10.4–11.8 R out; the ship breaks 0.45 s later, passes no closer than 1.05 R
  off the surface and is back at 2.4–2.6 R after 12 s (2026-11-14, its world skirted like a body).

### Frigate [F]

- Your frigates (cap 0 below tier 3, 1 at tiers 3–4, 2 at 5–6) fly their own circuits (`frigateStep`, `guard`, 2.4 R/s). Every 8 s (`ARMS.lance.reload`, × the energy fed) one picks its
  target ([civilizationgameplay.md](civilizationgameplay.md#frigate-f)), turns its nose onto the lead point and fires a
  salvo of 3 heavy laser bolts (`ARMS.lance`) 0.15 s apart while the target stays within ±0.1 rad of the nose; bolts fly
  22 R/s on top of it for 2.7 s (~60 R), drawn as long cyan bolts with a white core and a soft halo. With your fleet engaged and no rock to break, it
  flies to its post on the siege ring (`siegePost`: on the bearing from the enemy world to you, two frigates ±0.5 rad; at
  its last hull point 5 R off you on the far side), shifts round the ring while a body blocks the line, charges its nose
  1.5 s and lances the world ([civilizationgameplay.md](civilizationgameplay.md) →
  Battles). The first bolt that meets the target breaks it into up to 8 pieces your air can take; it gives up lining up after
  4 s. Measured (Node, with the earlier 20 R/s shells, a 0.3 R body crossing 10 R out at 4 R/s, 200 trials): it lined up in 1.48 s on average and every
  salvo hit. At 22 R/s (Node, `guns.test.ts`, 300 salvos at rocks 2–25% of you drifting 5–25 R out under the world's gravity, the frigate circling 3 R out): 900 of 900 bolts hit, median flight 0.73 s (0.58 s at 30 R/s, also 900 of 900).

### Rockets

- Your world launches guided rockets from its surface (`rockets` in `ships.ts`, the missile pool and `guns.ts` `steer`; numbers in [civilizationgameplay.md](civilizationgameplay.md#rockets)): from tier 1, only at your priority target within 8 + 2T radii, one a reload, 0.3 × cruise off the pad up to 26 R/s on top of you, the seeker on for 0.6 s at most and off within 0.25 s of the target, reload 5 s. A hit breaks a 1–25% body into up to 8 pieces your air can take, chips a bigger one or a rival's rock, kills ships within 0.3 R.

### Guns (every faction)

One pooled list of rounds for every ship of every side (`guns.ts` `createShots`, 96 rounds, plain objects swapped out;
created by `combat.ts` as `ctx.shots`; a full pool fires nothing). A gun belongs to its owner (side, round speed, life,
arc, aim error, tint, the bodies it flies through, its effect). A round fires only while the lead point is inside the
arc ahead of the nose, is aimed once at it (`aim`'s intercept, plus the burst's aim error and a fifth of that per
round), then flies straight: no guided rounds (concept 8). Each frame after the field's collisions (`combat.contacts`)
rounds are swept along their path: an enemy ship in the way breaks; any body (not the gun's own world and moons) stops a
round with a flash; only the body it was aimed at gets the gun's effect.

| Gun | Range | Arc | Round speed, life | Pattern | Aim error a burst | Effect |
|---|---|---|---|---|---|---|
| Fighter (yours, rival patrols) | 9 R off the surface | ±0.2 rad | 22 R/s, 0.68 s | bursts of 6 at 10/s, 0.6 s apart (yours: at most 2 a run, then 3 s cool; probes 1 burst of 4, 4 s) | ±0.04 rad | first hit breaks a small body (yours: into food, only unsafe ones); a big one gets 1/6 of the kick |
| Frigate lance (yours, rivals') | its target; a world from its post (yours: on the siege ring) | ±0.1 rad | 22 R/s, 2.7 s | 3 heavy bolts 0.15 s apart every 8 s; on a world after a 1.5 s nose glow, only on a clear line | ±0.01 rad | a rock: first hit breaks it into ≤ 8 pieces; a world: 6 K a bolt (`weaponHit`); any ship it meets dies |
| Missile (silos) | the enemy world | any | 14 of the shooter's radii/s (guided), 2.6 s | a salvo of 1–3 fanned ±0.08 rad every 12 s, 1 s after a lance salvo | none; seeker 0.5 rad/s, off within 0.6 s of the target | 12 K on the world (`weaponHit`), enemy ships within 0.6 R die; a round (it is 0.18 × a ship's size to rounds: one burst stops about half), slug or beam kills it |
| Rocket (your surface) | your priority within 8 + 2T R | any | 26 R/s on top of you (guided) | one every 5 s | 0.08·(6 − T)/5 rad at launch; seeker 0.8 rad/s, off within 0.25 s | breaks ≤ 25% into ≤ 8 pieces, chips bigger, ships within 0.3 R die |
| Pirate raider | 6 R off the surface | ±0.25 rad | 20 R/s, 0.5 s | bursts of 3 at 6/s, 0.9 s apart, while closing | ±0.06 rad | a rock they work: a hit (it cracks at its count); your shield `PIRATE_K`, then stock, then a chip; a rival's shield, then stock |
| Pirate marauder | 9 R off the surface | ±0.2 rad | 20 R/s, 0.62 s | bursts of 5 at 5/s, 1.5 s apart, while closing | ±0.04 rad | as a raider; 3 hits on a rock |
| Rival wave fighter | 8 R | ±0.25 rad | 22 R/s, 0.68 s | 3 a run at 6/s | ±0.06 rad | your frigate first (`pick`), ships, miners, else your world: 0.3 K on your shield, then 0.2 u of ore (`weaponHit`) |

- A run's burst reloads after 1.5 s without the gun bearing (`pull`).
- Look (2026-11-14, user: "much more visible, larger"): every bolt is drawn on one additive layer over the ships
  (`combat.ts`, the tech page's `dot`, `guns.ts` `BOLT`): a glow quad in the gun's tint stretched along the path round a
  white core, sized `least(k, px)` = k ship units but never under px screen pixels, so it stays easy to follow zoomed out.
  Bright middle (0.2 of the quad) at least: rounds 2.8 × 11 px (fighters cyan, rival violet, pirates orange with a warm
  core), probes 2.2 px (pale blue), shells 4 px (marauders orange), lances 4.8 × 14 px plus a 40 px halo (yours cyan,
  rivals' violet). Missiles and rockets (2026-11-15, one family, two sizes; amber yours, violet rivals'): a teardrop head
  (bright middle 5.2 / 4 px) round a white core, a flickering flame ≥ 12 × 48 px in the side's tint round a white-yellow
  jet, full while the motor runs up, shorter at cruise, a dim stub once the seeker lets go (rockets keep half), smoke
  embers; 4 quads each, worst glow frame 279 of 400 quads (`guns.test.ts`). Slugs (2026-11-15): steel white (`STEEL`),
  a hair-thin streak ≥ 7 × 170 px and a white head, no halo; a 0.12 s shock ring on your surface; sound `boom`. A flash at each round's launch point for 0.07 s (18 px, lances and shells 30 px). Each
  hit: a hot flash, light in the gun's tint (≥ 18 px across, lances and shells 2.2 ×) and 4 sparks thrown back along the
  round's path (8 for a ship kill or a lance); a ship also bursts. A missile burst: ≥ 26 px flash, ≥ 36 px tinted light
  for 0.35 s, 12 sparks. One quiet `hit` sound per burst on screen, at most every 0.25 s (heavy guns lower, louder).
- Speeds (2026-11-14, user: "slightly slower"): rounds and lances 30 → 22 R/s, life raised to keep the reach (rounds
  0.5 → 0.68 s, 15 R; lances 2 → 2.7 s, ~60 R); pirates 25 → 20 R/s (0.4/0.5 → 0.5/0.62 s). Missiles, rockets and slugs
  unchanged (slug damage depends on its speed).
- Measured (Node, 400 seeded bursts, `guns.test.ts`): a still fighter's burst at a ship crossing its nose 5 R out at
  4 R/s kills it 58% of the time (59% at 30 R/s); one home fighter burst kills an inbound missile 55% (53%). A 22 R/s
  round at 30 fps does not tunnel through a 0.09 R ship; a lead point outside the arc fires nothing. One burst from a
  fighter run 6 R behind kills a straight raider 73% (67%), a jinking one 41% (45%): × 0.56 (0.68) (`pirates.test.ts`).
- Measured (Node, before the 2026-11-14 pirate redesign): raiders hit your world 0.48–0.50 times a second a ship; rival
  wave ships hit 0.36 times a second and broke 6 of 15 shuttles (their 2 K rounds then did nothing to a shield: under its
  old 5 K minimum; weapon fire has had none since). After it (fleets of 8 over your world + 4 moons): 0.92–0.93 hits a second a raid (three gun ships, ~0.3 a
  raider); at 20 R/s 0.87–0.90 (220 of 222 and 213 of 217 rounds on target); at a 4% rock 60% of the rounds hit (62% at
  25 R/s, worst run 44%); at most 9 rounds in flight in those runs (pool 96).
- Weapon fire now always lands on a shield (`shieldShot`, 3 s stun). Pirate raid harm (Node, `pirates.test.ts` 8b, 60 s
  attack on a 500 u store, 3 seeds; old rule against new): L1 stolen 20.3 → 16.3 u, first theft 10.4 → 13.2 s, shield
  down 0 → 22 s; L2 stolen 20.3 → 10.7 u, first theft 10.4 → 23.2 s, down 0 → 14 s; an empty store at L1 chipped 0.52 →
  0.31% of you (water and air).
- Targets: `pick` (distance × class weight: missile 0.5, frigate 0.7, fighter 1, probe and miner 1.5) for your home ships
  and rival wave fighters; `nearest` stays for pirates.
- A pirate gun holds fire while another body is on its line, bar the rocks its fleet works, which take the hit too
  (`Gun.takes`).

### Rival ships away from home [J]

- War-wave frigates and fighters, probes and miners cruise at 5 of your radii/s, `scan` + `clear` round rocks (Pirate flight), and
  die touching any body; home patrols steer round bodies and graze or wreck on them as yours do (Navigation and collisions). A massing wave's
  fighters fly a V on the first of them round their world (1.5–2.1 rival radii); out, they fly wings of three in trail on
  strafing runs at you (`strafe`, straight on past) and chase on a leash (≤ 1.5× cruise). Its frigates are batteries:
  they keep a circuit at 1.9–2.1 rival radii round their own world and, reloaded, slow with the nose on you to lance
  (Guns). Probes make strafing runs round you between your outer moon slot + 1.5 and + 4 R. A rival frigate takes 2
  hits. What they do: [aliencivilizations.md](aliencivilizations.md).

### Miner shuttles

Miner shuttles use the same flight model, relative to your world (`ferry`): they lift off your surface, cruise at 3 R/s
and brake onto their site's near side (2.4 R/s²): a moon, a free body, a debris cluster or an open rival world [G].
They round your world at 1.25 R on the way out, land within 0.25 R of the spot, dig, then fly straight home and land
0.08 R off the surface; both legs steer round bodies with a 2 ship-radii pad (so they reach sites in debris) and can
hit them. A leg longer than 15 s gives up. Measured (`flight.test.ts`, a moon on a 3.2 R circle, nothing else): out
in 2.1 s, home in 1.5 s at 30 and 120 fps. Trip timing, numbers and what they bring:
[civilizationgameplay.md](civilizationgameplay.md) → Miners on moons, Roaming miners and the mining link.

### Colony fleets [L]

A carrier and a colonizer (or one miner on a terraforming trip) fly from your world to a system planet with `arrive` and
`thrust` at 2 R★/s cruise and 2 R★/s² (braking at 0.6 R★/s²: 0.75 × retro), turning 3 rad/s, relative to the star
(`star/colony.ts`, drawn through one ParticleContainer), round the star, the planets and the bodies near them
(threaded), and land on contact. A graze hurts a ship; a wreck loses it (the star always wrecks); a lost colony ship
leaves the planet unclaimed and the next fleet pays again. What they do:
[stargameplay.md](stargameplay.md#colonies-and-terraforming-l).

### Pirate flight

Redesigned 2026-11-14 (Decisions). Speeds are in your radii (R), so they scale with you; behaviour and numbers:
[gameevents.md](gameevents.md) → Pirates.

- **Cruise** 4–5.5 R/s per fleet; main thrust = a ship's speed × 4 /s; raiders turn 2.2 rad/s at cruise, haulers
  1.6 rad/s and the marauder 1.2 rad/s at 0.8 × cruise.
- **Formation:** a virtual lead (the flag) flies the fleet's course (`thrust` at 0.8 rad/s toward the lane's end, or onto
  the stand-off point at ≤ 1.5 × cruise) and `clear`s every body with the formation's half-width added to each keep-out;
  each ship `follow`s its fixed slot on the flag (5 ship radii back and 4 out a row; marauder or a raider at the point,
  haulers on the centreline with two raiders beside each, the rest in a V behind), catching up at 1.3 × its speed.
- **Steering round bodies** (`scan` + `clear`, every ship away from home, rivals' too): once a frame each ship lists
  the ≤ 4 bodies in reach: keep-out = radius + 5 ship radii + 0.1 s × the speed relative to it (at most another radius),
  reach = 1.2 s + two turn radii at that speed (at least half its cruise); crumbs under 0.25 ship radii and bodies
  closing faster than 3 × its cruise are left out. Every sub-step `clear` bends the wanted course round each keep-out in
  the body's frame, on the side the ship already passes (its velocity, so the side never flips), nearest last, twice;
  among two or more it slows to 0.6 × cruise; still bent by two and heading into one, it brakes away from the nearest,
  slowly while its nose still points at it (a nose-first ship keeps half the asked speed into a turn). Inside a keep-out
  it slides and climbs out, harder when deeper or closing, at full speed (a stalled ship is what a drifting piece hits).
  `grow` widens one body's keep-out (a pirate rock about to crack). `free` moves every
  goal (lane end, stand-off point, spawn with 2 R room, exit) out of every keep-out.
- **Your moon system** is one keep-out disc for the flag, formation ships, guards and haulers: the outer filled slot +
  1.5 R (2.5 R with no moons). Only gun runs at you go inside.
- **Gun runs** (`strafe`): in at the target; within the turn-out (target radius + 5 ship radii + 1.2 turn radii + 1 R;
  ~4.6–5.4 R at you, ~4.3 R at a 4% rock) the run swings out 0.5 rad off straight out from the target on its own side
  (`strafe`'s `swing`; prey ships: straight on past them), back in past 3.5 R further out. The target's own keep-out
  (and the rocks and pieces the fleet works) bends a run only inside its turn-out; the 2nd and 3rd ship of a wing come
  in 0.1 rad off the 1st one's line. Frame: the target body's velocity.
- **Jink** (`menace` + `startJink` + `jinkStep`): 1.2 rad off its velocity away from the threat's line at 1.25 ×
  cruise for 0.6 s, then 0.8 rad back for 0.4 s, 1.5 s cooldown; threats: an enemy ship within 4 R closing nose-on
  (±0.35 rad), or an enemy round passing within 5 ship radii in the next 0.25 s.
- **Bodies kill:** a ship dies touching any body (the old game's rule), tested with `swept` along this frame's relative
  motion, so a fast body (a meteor) kills every ship on its line; a hauler's claimed piece is spared.

### Navigation and collisions (2026-11-14)

User: ships should collide with consequences, yet fly round what is in their way, weave and adapt, cinematic; threats
stay dangerous. Plan: Fable (2026-11-14); what was built, measured in `nav.test.ts` and `crowd.test.ts`:

- **Collisions** (`bump` + `crash`, after the field moves, combat.ts contacts): a body under 0.25 ship radii does nothing;
  a pebble (under `PEBBLE` 2 ship radii, never a moon or a held world) only grazes and breaks to dust; a body as big
  closing at ≥ 1.5 R/s (`WRECK_V`), or the star wrecks; slower, a graze: pushed out to its surface + 0.6
  ship radii, normal speed reflected × 0.3, tangential × 0.8, the nose kicked 0.9 rad away, hurt 6 s (60% thrust, an
  ember every ~0.15 s). A graze while hurt wrecks; a frigate (3 hull points, rounds take them too) loses one a graze
  instead. Your own world: a landing from 0.9 R/s grazes, from 2 R/s wrecks (`keepOut`'s `slam`). A wreck flashes and
  sparks in the body's tint and heats it 40 K × (ship radius / its radius)³ (never your world or a held one).
  Pirates and rival ships away still die on any touch. Dev counter: `window.__g().combat.bumps` (wrecks, grazes and
  sparked near misses by faction: you, rival, pirate, colony).
- **Navigation** (`scan`, `clear`): home ships (yours, rivals' patrols, frigates, shuttles) and colony ships scan once a
  frame from a list `reachOf` pre-filters once a frame per world, threaded, passing bodies closing up to 12 × cruise
  (they fly in their world's frame); every sub-step each body is carried on by the time since the scan (`clearRel`: the
  craft shifted by its world's motion). Threaded: a pair's surface gap on arrival of 6–10 ship radii squeezes both pads
  to 0.45 × the gap (flown down the middle, at (0.5 + 0.5 × the pad share left) × cruise while it bends); under 6 the
  pair is one disc; a bent course keeps only its speed along the tangent (at least 0.3 of it: a hard bend slows the
  ship so it can turn). The side is the one the ship already flies (its velocity). Your world is `skirt`ed like a body
  (CLEAR 1.25 R, reach at least its look-ahead at its speed). A patrol waypoint inside a keep-out moves to its edge; a
  wingman whose slot lies in a keep-out takes the other side of its leader and, with a body within 1 R of its keep-out,
  catches up at most 0.5 R/s faster than its leader.
- **Not built from the plan, measured worse** (Node: `crowd.test.ts` and a moons-only patrol rig, 12
  runs × 120 s × 4 fighters): the side picked once by cost and kept (66 events; 10 with turn-circle flips added, still
  worse than the velocity side in every belt run), the late hard break along a free tangent at 1.25 × thrust (more
  wrecks: the break turned ships across other bodies), dropping a blocked waypoint (it put waypoints behind the world:
  slams). With the break gone its plume flare went too. Pirates and rival ships away stay unthreaded: step two failed
  their checks (3 body deaths, a hauler at 0.86 × the moon-system keep-out), so `CROWD`, `STUCK` and the brake-away stay.
- **Bank** (visual): `thrust` eases `bank` toward turn rate / its cap over 0.15 s; `drawShip` narrows the hull up to 40%
  across the nose (length kept) and the engines outside the turn burn up to 50% longer. **Near-miss sparks:** a pass
  within 2.5 ship radii faster than 2 R/s, 3 embers streaking back, at most every 0.5 s a ship, on screen.
- Measured (Node, 30/120 fps): the crowded field (your world + 3 moons on slots 0–2, a belt of one body per 18 R²,
  4 fighters, a run every 8 s at a 0.3 R body falling in at 4 R/s): wrecks a fighter-minute 0.10 at rest, 0.20 with the
  world drifting 2 R/s, ~1.0 at 8 R/s (18, 18 and 12 seeds × 120 s); grazes 0.1–0.3 a fighter-minute at ≤ 2 R/s; ~89%
  of runs still fire on their body. Plan targets were 0.1 / 0.1 / 0.5 (Open issues). Shuttles to a slot-2 moon behind
  slots 0–1 and 20 rocks 2–6 R out: 40/40 trips, 0 wrecks. A rival patrol round its rock, you and a rock in its band:
  closest 3.1–4.5 ship radii, no wreck (unsteered: 68–204 bumps on the rock). 30 home ships among 400 bodies: 0.18 ms a
  frame (p95 0.20; 0.02 without steering): +5 µs a ship.

### Engine plumes and scale

- **Plumes, not dots** (user, 2026-11-14): every ship's engines show a plume drawn live behind the hull through the same
  ParticleContainer (`render/tech.ts` `drawShip`: plumes, then the hull; no extra draw call): per engine two stretched
  `dot` quads, a tinted glow and a short white core, from the engine points in `render/shipArt.ts` `ENGINES`. Length =
  nozzle × (3 + 9 × burn) art units, width nozzle × 2.2. Yours steady cyan (±12% flicker); rivals one long thin violet
  trail (length × 1.6, width × 0.7, alpha 0.55); pirates unequal orange flares (±30% sputter). Docked and digging ships
  show none. The baked flames are gone from the art (the rival trails, the pirate flares, the halo round your nozzles).
  2–6 quads a ship (computed), so the combat container holds 600 quads and your civilization's 360.
- Ships are world-sized, not screen-sized (`render/tech.ts` `SHIP_SCALE`: a fleet cell = 0.4 of your radius for every
  faction, and with it plumes, rounds and the pirates' hit radius; never under `SHIP_MIN_PX` 8 px a cell when zoomed
  far out). A ship's hit radius is ~0.09 R (computed: 6 × 0.4 R ÷ 28).

### Checks

`app/test/civilization/` (flight, guns, nav, crowd and pirates tests; Node, the real flight modules, 30 and 120 fps; measured 2026-11-14):

- **Model:** slip off the nose p90 9.1° (patrols) / 9.3° (rival war waves) / 8.6° (pirate fleets, per frame), max 16.4°; never backwards; the turn rate never over
  its cap; from rest, asked 90° off its nose, 0.049 R of slip off the nose before the nose is within 30° (it drifts
  0.20 R toward the wanted course from forward thrust while it turns).
- **Patrol** (4 fighters, 60 s): 1.0–4.8 R from the world, all 8 sides, in-out swing ≥ 2.2 R, never under 1.85 R/s;
  wingmen 0.62–0.65 R from their leader (median, max 1.15, min 0.43), 100% of the time within 0.3–1.2 R; the two flights
  opposite ways; 0.66 R apart across frame rates; a wingman takes its lost leader's route.
- **Strike** and **Guns:** as measured above; the pool holds 96 at most and spent rounds leave it.
- **Siege ring** (`ringStep`, `siegePost`): as above; the frigate's post lies on the ring, on the bearing to you ± its
  side, never within 2.5 R of your centre (a close enemy shrinks the ring to keep that).
- **Rival war waves** (6 ships, wings in trail, at pirate cruise speeds): a raid round you crosses 3.2 R 14 times a ship
  in 30 s at 4 R/s and 18 at 5.5 R/s, 1.1–7.6 R out, 7–9 gun windows a ship in 25 s; leaving at 20 R/s you are dropped
  after 8.4 s, at 5 R/s they keep up (farthest ship 7.0–7.2 R); `swept` catches a 120 R/s pass at 30 fps (a point test
  misses it), a pass 1 R off is clear.
- **Steering** (`scan` + `clear`, raiders and haulers at 4 and 5.5 R/s cruise, 30/60/120 fps): head-on 0/84 hits
  (closest 8.6 ship radii), turn-in at a body beside the course 0/84 (1.9), goal inside a body 0/336 (6.0), a second
  body 0/84 (2.3), a belt (one body per 18 R², 0.001–0.05 of you) 0/84 (3.4). A denser belt of 1–5% rocks (one per
  12 R²) still hit 1–2 of 84 while tuning (not a check).
- **Pirate fleets** (`pirates.ts` in a fake world with gravity and rock-on-rock merging or bouncing like the field's;
  numbers in [gameevents.md](gameevents.md) → Pirates): a hauler in every group over 1000 launches; keep-out over your
  world + 4 moons + 5 rocks with raids (no body deaths, closest 7.1 ship radii, haulers ≥ 1.11 × the moon-system
  keep-out); rocks cracked and hauled in 40 of 40 runs (a still field), 58% of rounds on a worked rock, the longest dry
  spell a run median 5.5 s; their own pieces: 0 deaths in 40 runs of 10 ships cracking five rocks under gravity; full holds → leaving in 0.5 s, gone in 9.1 s; jinks (× 0.68 deaths
  from one burst), scatter (a 1 R body at 2 × cruise kills none, at 4 × all 8); retreat at half lost or no hauler; the
  raiding rules kept; the same states at 30 and 120 fps, the first crack within 0.7%.
- **Shuttle:** out to a moon on a 3.2 R circle and home within 15 s at both frame rates.
- **Navigation and collisions:** consequence grades (head-on 3 R/s wreck, skim 0.5 R/s graze then clear, hurt graze
  wreck, pebble graze, crumb nothing, a 120 R/s body at 30 fps wreck) the same at 30 and 120 fps, the first graze
  within 0.03 s; every stepper (guard, run + break, frigate, ferry both legs, approach, arrive) flown at a body on its
  path bumps it before its centre is inside; an 8 ship-radii gap flown through 0.4 ship radii off its middle, a 4 radii
  gap flown round, a jittering goal: no side change, a closing gap: no bump; the same path within 0.011 R after 10 s at
  both frame rates; the crowded field, shuttles, rival patrol and cost as above.

### The old game's mechanic, and what was copied

The user asked for ship flight "as in the old game" (Decisions, 2026-11-13). Replaced on 2026-11-14 by the nose-first model, circuits and strafing runs above (Decisions); the table records what the first version copied. The old game's ships (source:
`analysis/SOLAR/decompile/Solar2.Core/Solar2/{Ship,Striker,Heavy,Capital}.cs`; notes in
`analysis/SOLAR/08-ships-ai-and-loose-ends.md` §1.2–1.7) have no orbit code at all; the orbiting look comes from five
small rules:

| The old game | Where | GRAVOLVE |
|---|---|---|
| **Steer at a moving waypoint:** a civilisation ship re-reads its home planet's position every frame, so its waypoints follow a moving planet | `Ship.cs:148–153` | waypoints are stored relative to the world and ships fly in its frame (`nav.ts` `guard`, `homeStep`) |
| **Eased turning, no arrival:** the heading eases toward the waypoint by 1/rotationEase per 60 Hz tick (Striker 16, Heavy 20, Capital 18) and thrust never drops near it, so a ship overshoots and loops | `Striker.cs:72–91`; `Heavy.cs:27–35`; `Capital.cs:29–37` | `loop`: the course turns 4× its error a second, at most 3 rad/s; no braking at the waypoint |
| **Idle waypoints in a cone on the ship's side of home:** home + (home → ship direction) × 360–900 units, rotated within ±90° | `Ship.cs:249–276` | `pick`: 1.8–3.6 R, within ±90° of the ship's side |
| **Strafing passes past the target:** a Striker fires, then while reloading sets its waypoint 1800 units beyond the target on the far side, flies through and turns back; a Capital retreats the same way between missile volleys | `Striker.cs:104–137`; `Capital.cs:114–146` | after a shot: a waypoint 2 R ahead along the motion, then a wide swing home (out to ~16 R in the check) |
| **Body-avoid turn:** within body radius + avoidBodyRange the heading eases straight away from the body, fighting the seek, so ships skim round it; touching a body kills | `Ship.cs:188–206`; kill `Ship.cs:173–186, 282–329` | `avoid` bends the course itself (`c.course` is reset to the bent course); ships away from home steer round every body in reach (`scan` + `clear`, not fast ones) and die on contact |
| **A velocity that fades:** an outside push (inherited planet velocity, knockback) decays ×0.98 a frame | `Ship.cs:136–140` | the velocity error burns away over 0.3 s (TAU), frame-rate independent by sub-steps |

What was not copied: the old game's frame-rate dependent turning (ships turned half as fast at 30 fps), its home → out
→ home petal (GRAVOLVE picks the next waypoint from wherever the ship is), and its lack of ship–ship separation.

### Ship art

- **Built** (`render/shipArt.ts`): SVG per faction and class (you: probe, miner, fighter, frigate, colonizer, carrier;
  rivals the same; pirates: raider, hauler, marauder), baked once in colour into the 1024² tech page with Pixi
  `Graphics.svg`, 128 × 80 cells at one scale so classes stay to scale; drawn with tint white, the art 28 px across a
  cell (`SHIP_PX`: a fighter ≈ 14 of them). Bake 153 ms (was 149, measured, before the polish pass below). All 15 ships
  then got a polish pass (pirates ~2–2.7× the elements), still baked once at startup; no bake time recorded since.
  Stations stay shader art. In use: your fighters, frigate, miners, carrier and colonizer; rival fighters, frigates,
  probes and miners; pirate raiders and haulers. Still to do: tendency layers, light and flare dots, the Dyson builder
  (Dyson haulers are star-page shader art today, `star/look.ts`), and working gradients (Rendering below).
- All ships stay in one draw call: the bake change was noise (149 → 153 ms, measured); same single texture and
  ParticleContainer, so still 1 draw call (structural); checked at 28 px cells (fighter ≈ 14 px).

The spec follows (user: "design better 2D", one-winged looked weird): bold symmetric silhouettes with wings on both
sides, a clear nose → cockpit → hull → engine axis, three hull tones plus a faction accent, engine nozzles with a glow,
few thin lines (they vanish at 14 px). Each faction is told apart three ways, so it reads at 8–14 px even without
colour: **silhouette language** (curves / facets / boxes), a **signature detail**, and its **palette**. Concept art:
shown in the session on 2026-11-13 (top-down, nose to the right).

#### Faction identity

| | **You** | **Rivals** | **Pirates** |
|---|---|---|---|
| Shape language | smooth engineered capsules and crosses, rounded corners, symmetric; each class its own outline (T probe, cargo hexagon, cruciform fighter, banded shield frigate, greenhouse ark, bracket carrier) | sharp faceted blades and petals, wide rather than long, symmetric: lacewing, claw, moth wings, six-point shield, flower halo, blade crown | boxy welded scrap, symmetric outline with **mismatched details**: patch plates, gun mounts, castellated turret blocks, uneven flares |
| Signature detail | red / green nav lights; long white canopy or sensor pill; glowing cyan inset strips | one bright diamond core at the centre of mass (never at the nose); a short tapered ion trail | amber hazard chevrons; rust patch plates; rivets |
| Hull dark / mid / light | `#1f4a5a` / `#2f7088` / `#5fb4cc` | `#3b2763` / `#55398a` / `#8a63d6` | `#3a3229` / `#5a4c3a` / `#8a7a60` |
| Outline | cyan `#7fe8ff` | violet `#b48cff` | bone `#d9cfbf` |
| Highlight | canopy `#e8fbff` | core `#f1e6ff` | cockpit window `#ffd9a0` |
| Accent | cyan stripes `#7fe8ff`; wingtips `#ff6b6b` / `#6cf0a0` | — (the core is the accent) | rust `#c4683c` and amber `#e8b04a` warning stripes |
| Engines | twin round thrusters, steady cyan `#7fe8ff` | one long trail, violet `#b48cff` at ~55% | uneven, sputtering flares, orange `#ff7a50`, two sizes |
| Panel lines | nested hull bands, recessed sockets (engineered) | triangular facet planes on each blade | plate seams, bin lids, turret rings |
| Mood | clean, calm, engineered | elegant, alien: a mirror of you | crude, dangerous, opportunist |

Life cargo is the same everywhere: a green `#6cf0a0` core (Colonizer), so "this ship carries life" reads across
factions.

#### Classes and sizes

Lengths are relative to a fighter (1.0 ≈ 14 px at the start zoom; ships scale with the world like everything else). The
design doc's names; Tip = unlock tier. Roles in play today and planned: [Planned](#planned) → Class roles.

| Class | Tip | Length | You | Rivals | Pirates | Role |
|---|---|---|---|---|---|---|
| Probe | 0 | 0.6 | a compact T: broad stern bar, narrow rounded beam ahead with a white sensor pill | a four-point lacewing around a small diamond core | — | scouting, harmless |
| Miner | 0 | 0.9 | a squat clipped-corner cargo hexagon, three dark ore wells along the axis, a barred intake ahead | two hooked claw blades cradling an amber ore crystal | **Hauler** 1.25: an enclosed cargo safe with three bin lids, rust patches, a window nose, two flares | carries matter |
| Fighter | I | 1.0 | a cruciform interceptor: one thick wing bar across a long rounded fuselage, long white canopy | two tall hooked crescent (moth) wings and a short pointed beak | **Raider** 1.0: a stepped gunboat with paired cannons on side mounts, rust patches, two flares | intercept, escort |
| Frigate | I | 1.5 | a solid elongated shield hull with three curved armour bands and twin recessed engines | a heavy six-point shield of overlapping carapace plates around the core, split prow | — | fleet tank |
| Colonizer | I | 1.1 | a rounded greenhouse ark: a green garden under canopy ribs, two short side paddles | a faceted flower halo of petals around a green diamond garden | — | carries life |
| Carrier | II | 2.2 | a long blunt bracket hull: two side launch mouths, an aft reactor ring, a cyan spine | a blade crown: layered swept wings, two open hangars with fighter chevrons, three claw points ahead | **Marauder** 2.5: a castellated fortress hull with six turret blocks, hazard chevrons, three flares | carries fighters (capital) |
| Dyson builder | II | 1.5 | a frame with solar fins (to draw) | — | — | Dyson |

#### Tendency on the same class (planned)

The design doc: a civilization's style comes from its planet's tendency. One add-on layer per tendency, drawn over any
class (shown on the fighter):

| Tendency (doc rule) | Add-on | Stat it shows (doc: materials → stats) |
|---|---|---|
| Industry (metal ≥ 35%) | armour plates along both sides | hull +40% |
| Ocean (ocean world) | one or two shield arcs ahead | shield and repair |
| Swarm (gas + water ≥ 40%) | ships drawn at 0.55× and built ×3 | many, fragile |
| Energy (radioactive / volcanic) | a long beam spine with a glowing tip | range, energy cost |

Rivals and you both use them (in your own palette); pirates have no tendency (scrap is scrap).

#### Rendering

- **Baked in colour, not white** (built): each faction's cells are baked in their own palette (wingtip lights, rust
  stripes, green life core) and drawn with tint white; tint stays free for hit flashes and the harmed state.
- **Shading reads at 8 px through value, not lines** (redesigned 2026-11-13 from Codex concept art,
  `.claude/ship-concepts/` v2 for you and pirates, v3 for rivals; the first v2 rivals were dropped as they read
  phallic): one linear gradient per faction (`yHull`, `rShell`, `pPlate`), broad value planes, glowing engines and
  cores. **The gradients do not render:** Pixi's SVG parser drops `<defs>` / `<linearGradient>` (~95 "[SVG parser] …
  unsupported" warnings at the ship-page bake, measured in the playtest), so the ships lose their gradient fills.
- **Lights and flares are dots** (planned): engine flares, wingtip lights and the rival ion trail as `dot` sprites in
  the same container (still one draw call), so they can flicker (pirates) or pulse (rival core) without a re-bake.
- **Texture budget:** the plan was 3 factions × 7 classes × 2 seeds + 4 tendency layers ≈ 46 cells of 64² (carriers and
  the Marauder 128 × 64) on a 1024² page (4 MB, mipmapped) instead of 512². Built: 15 cells of 128 × 80 (8 a row, the
  page's lower half), one seed each, no tendency layers yet.
- **Readability check:** every class must be recognised at 8 px with colour off (a grey screenshot), and factions told
  apart at 14 px. *Measure:* bake time and draw calls before and after (target: still 1 draw call for all ships).

## Planned

### Class roles

| Class | Role | Status |
|---|---|---|
| Fighter | your defence ships: 2 at LIFE, patrol, strike, dogfight, break bodies ≤ 2% of you into pieces your air burns up; rival home patrols and war-wave escorts | Built ([F], [J]) |
| Miner | your shuttles on round trips to moons and roaming sites (≤ 2 a site, count from metal); rival miners strip free rocks | Built ([G], [J]) |
| Frigate | yours: 0 below tier 3, 1 at tiers 3–4, 2 at 5–6, a 3-bolt heavy laser salvo at 2–25% bodies every 8 s, then the enemy world when engaged; rivals': 0/1/1/2 at L1–4, a battery at home lancing your world, takes 2 hits | Built ([F], [J]) |
| Carrier | carries fighters (capital); escorts the colony ship | Built as the colony ship's escort [L] (it carries no fighters) |
| Colonizer | carries life | Built [L]: 60 ore + 40 volatiles + 1 bn people ([stargameplay.md](stargameplay.md#colonies-and-terraforming-l)) |
| Probe | yours: the light patrol class, cap = tier, lasers break ≤ 0.5% bodies (built 2026-11-14); rivals': circle you 10 s [J] | Built |
| Dyson builder | carries Dyson panels | art to draw; today star-page haulers |
| Raider / Hauler | pirates | Built: crack rocks, haul, raid, shoot ships first, evade (redesign 2026-11-14) |
| Marauder | pirate capital in fleets of 10+ | Built (2026-11-14): 4 hulls, a heavy gun ([gameevents.md](gameevents.md) → Pirates) |

- Every class flies the one flight model above; roles differ only in route and weapon. No guided missiles that cannot be
  dodged (concept 8): rounds are aimed once and fly straight (Guns); missiles and rockets steer only briefly and let go
  before they arrive (the flame dims), so a timed sidestep beats them (2026-11-15).

### Art still to do

Tendency layers, light and flare dots, the Dyson builder, and the readability check at 8 px with colour off.

## Open issues

- **Flying your world fast through a belt costs fighters:** ~1 wreck a fighter-minute at 8 R/s and 0.2 at 2 R/s
  (measured, Node), against the plan's 0.5 and 0.1; wingmen take most of it. Not yet seen in the game.
- **Ship gradients dropped** (playtest): Pixi's SVG parser skips `<defs>` / `<linearGradient>` at the ship-page bake
  (~95 warnings), so every ship draws without its gradient fills.
- **[M]** Raiders killed 3–4 of your shuttles per 20 s raid (measured, before guns); an 8-raider fleet took out a
  rival's patrols in 3 of 3 runs. Not re-measured in the game since rounds replaced the dice (Node: 4–12 of 15 shuttles
  a minute, Guns).
- The flight and gun rework and the navigation and collisions (2026-11-14) are checked in Node only, not yet played in a
  test tab; the bank's look at 8 px (drop it if it reads as wobble) is unchecked.
- The 8 px colour-off readability check is not recorded.

## Decisions

- **Ships ≥ 8 px; you cyan, rivals violet** (user, standing; [README.md](README.md)).
- **Ship art:** "design better 2D"; one-winged looked weird (user, 2026-11-13). The first v2 rival concepts were dropped
  (2026-11-13).
- **Patrol:** the old game's ships fly round their world, not on a close orbit (user, 2026-11-13).
- **Flight of all ships (concept 7)** (user, 2026-11-13): "We also need to change the flight behavior of all
  spaceships. They do not necessarily have to fly in planetary orbits; simply flying around and following the planet,
  as in the old game, is sufficient. This will allow early-stage players to hit pirate ships using moons. If they try to
  fly in low orbit, the player can never reach them. Bring back a similar mechanic from the old game." Built for
  patrols and, since [B], for pirates (`flight.ts`).
- **Ships fly and fire like spaceships** (user, 2026-11-14): "Our destroyer ships are attacking like rockets—actually,
  they need to open fire, fix that. Also, pirate ships and other ships don't move as if they are being propelled by rear
  thrusters. They move in cloud-like patterns and spin around their own axes. I want ships that move more like actual
  spaceships, with visible propulsion from their rear thrusters. This should apply to all ships: our ships, alien ships,
  and pirate ships. Plan with fable, delete current mechanics and improve them, make it better". Built for every faction:
  the nose-first model (no sideways or reverse thrust), circuits in pairs, formations and strafing runs instead of loops
  round a point, attack runs that break off instead of ramming, one pool of aimed rounds instead of zaps, missiles,
  bolts, tracers and dogfight dice, and live engine plumes instead of exhaust dots. Defaults taken: fighters and the
  frigate both get guns (a 3-shell salvo, no rocket; superseded the same day: heavy laser bolts, plus surface rockets from tier 1); one hit breaks a small rock; pirates may shoot your fighters during
  a raid; no flip-and-burn; plume only, no wake; pairs for you and rivals, threes for pirates; balance by aim error only.
- **Pirate fleets redesigned from scratch** (user, 2026-11-14): "Pirate groups still aren't following proper flight
  paths. They end up flying straight into planets. … every pirate group should have at least one cargo ship … They also
  don't perform proper evasive maneuvers, their shooting behavior is inconsistent, and they just fly around randomly. …
  Let's completely redesign and improve their entire lifecycle from scratch". Built: a fleet state machine (cruise,
  work, raid, leave) with one job a ship; a hauler in every group and a marauder from 10; `scan` + `clear` + `free`
  replace `obstacle` + `skirt` (rivals' ships away too); the flag (a virtual lead) and your moon system as one keep-out;
  rocks cracked by rounds and hauled; fire discipline; jinks and scatter. Deleted: home-point hopping, the roaming
  circuit, the strip timer, per-frame nearest aiming, `free.indexOf` formation slots, moon targeting. Standing: keep them
  dangerous (counterplay over nerfs), but never flying into planets. Defaults taken: your moons are cover, not targets;
  the marauder in every age at 10+; raiders still dive into your moon system, haulers never; hulls 2 / 4; stray rounds do
  nothing to you as an asteroid; hold 100 u, theft 20 u a hauler; the jump flash only for ships still on screen after
  14 s; rival war waves get `scan` + `clear` now, their run geometry later. Departures from the plan, measured: a gun
  run turns away 0.5 rad off straight out at the turn-out instead of flying straight on past the target (a pass every
  4.3–4.9 s instead of ~6.4 s), the trigger is held while closing on the target rather than only on `strafe`'s in leg,
  rounds that hit any rock the fleet works count on it (`Gun.takes`), and the jink's second leg turns back 0.8 rad from
  the first (a jinking raider died × 0.68 as often as a straight one; × 0.71 with both legs measured from the start
  heading).

- **Ships collide with consequences and navigate** (user, 2026-11-14): "The ships are now passing straight through
  objects, but that's not what we wanted. They should still be able to collide with objects, and those collisions should
  have consequences. However, their flight paths need to dynamically adjust to their surroundings. … The goal isn't to
  eliminate collisions entirely, but to make their navigation intelligent and visually convincing." Built: Navigation and
  collisions (Fable's plan, defaults taken: enemies away keep die-on-any-touch, rival home patrols mirror yours,
  frigates take rounds with 3 hull points, a hard hit on your world wrecks, a hurt ship flies on at 60% for 6 s, a lost
  colonizer is paid again, your ships dodge everything they can, the pebble class raised to 2 ship radii because 8 R/s
  was over 1 wreck a minute). Departures, measured: the velocity side instead of a side picked by cost, no late break,
  waypoints moved out of keep-outs instead of dropped, shuttles' test belt 2–6 R out, pirates and rival ships away left
  unthreaded (step two failed their checks), crowded-field bounds 0.15 / 0.3 / 1.3 wrecks a fighter-minute instead of
  0.1 / 0.1 / 0.5.

### Decided 2026-11-13 (open decisions Q1–Q7)

- Pirates roam the whole world from the Asteroid Age (Q2, see `gameevents.md`); built in [B] as a roaming route, the raid loop and the pursuit leash.
