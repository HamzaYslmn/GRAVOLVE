# Ships and flight

How every ship flies (yours, rivals', pirates'), the routes they fly, the guns they fire, missiles and rockets, the
engine plumes, and the ship art. Labels and standing decisions: [README.md](README.md).

Code (under `app/src/`), by owner: `evolution/civilization/flight.ts` (flight model, routes), `nav.ts` (steering round
bodies, home steppers, the siege ring), `crash.ts` (collisions), `guns.ts` (rounds, missiles, targeting), `away.ts`
(rival ships away from home); all pure and checked in `app/test/civilization/`. Then `ships.ts` (your defence, frigate,
rockets, silo), `bolts.ts` (projectile looks), `view.ts` (miner shuttles, your ships), `pirates.ts`, `rivals.ts`,
`star/colony.ts` (colony fleets), `render/shipArt.ts` and `render/tech.ts` (art). What ships do for the economy and
the shield: [civilizationgameplay.md](civilizationgameplay.md); pirate raids as events: [gameevents.md](gameevents.md)
→ Pirates; rival strategy: [aliencivilizations.md](aliencivilizations.md).

## Built

### Flight model (every faction)

Every ship flies nose first, like a ship with one main engine (`flight.ts` `thrust`; user, 2026-11-14). Steering sets
the velocity it wants; the nose eases toward it (4 × its error a second, at most the ship's turn rate, so a turn is an
arc) and the engine burns along the nose only. It throttles back in a turn (half power at 90° off), brakes with a weak
retro (0.4 of the main thrust) and never flies backwards; sideways slip bleeds off over 0.08 s. Arcade, not Newtonian.
Frames are cut into sub-steps ≤ 1/60 s (frames ≤ 0.1 s): the same paths at any frame rate. `burn` (0–1) sets the plume.

| Faction | Unit | Main thrust | Turn | Speeds |
|---|---|---|---|---|
| Your + rival fighters | home R | 12 R/s² | 3 rad/s | patrol 3, home ≤ 6, attack run 5.5 R/s |
| Frigate | R | 8 R/s² | 2.2 rad/s | patrol 2.4 R/s |
| Miner shuttles | R | 8 R/s² | 3 rad/s | 3 R/s; brakes at 0.75 × retro = 2.4 R/s² |
| Pirate raiders | your R | 4 × cruise | 2.2 rad/s | cruise 4–5.5 R/s; top (space) 2 × cruise |
| Pirate haulers | your R | 4 × their speed | 1.6 rad/s | 0.8 × cruise; top 1.3 × their speed |
| Pirate marauder | your R | 4 × its speed | 1.2 rad/s | 0.8 × cruise; top 1.6 × its speed |
| Rival ships away | your R | 4 × cruise | 2.2 rad/s (frigate 1.8) | 5 R/s; tops below (Rival ships away from home [J]) |
| Colony fleets | R★ | 2 R★/s² | 3 rad/s | 2 R★/s |

| File | Pieces |
|---|---|
| `flight.ts` | `thrust` (the model; `top` caps a ship's speed in space); `avoid` (round a circle on its tangent); `circuit` (one way round a centre, waypoints alternating inner and outer bands); `follow` (a wingman's slot); `pairUp`; `formation` (a leader's route, the rest on slots); `strafe` (runs at a centre, turn out, back in); `arrive`, `approach` (brake onto a moving point); `keepOut` (never inside the world; its `slam` is a hard landing); `chase`, `leash`, `lowPass` (a fleet centre's pursuit); `bearing`, `leadAt`, `inArc` (the lead point and the gun arc); `startJink`, `jinkStep` (a pirate's jink); `rivalTop` |
| `nav.ts` | `scan` + `clear` (steer round bodies in reach), `scanRel` (in the world's frame), `free` (move a goal out of bodies), `reachOf` (one pre-filter a frame); home steppers `guard` (patrol), `homeStep`, `runStep`, `breakOff`, `breakStep`, `ferry` (a shuttle's leg); the siege `siegeRing`, `ringStep`, `siegePost` |
| `crash.ts` | `swept`, `touch` (contact along this frame's motion, no tunnelling), `bump` (first contact or near miss), `crash` (its grade), `homeContact` |
| `guns.ts` | `createShots` (the round pool), `pull` (a gun's trigger), `nearest`, `pick` (targets), `menace` (a threat to a pirate), `createMissiles`, `steer` (missile and rocket seeker) |
| `away.ts` | `plan`, `step`, `settle` (rival ships away, once a frame / each sub-step / after) |

Measured (flight.test.ts, 2026-11-16): on patrol, slip off the nose median 2.3°, p90 9.1°; burn median 0.16, p90 0.64;
the nose turns 8.7 full turns a minute. War waves: p90 9.3°, max 16.4°. Pirate fleets: p90 8.5° (pirates.test.ts). Never
backwards, the turn rate never over its cap; from rest, asked 90° off its nose, a ship slips 0.049 R before the nose is
within 30°.

### Patrol (defence ships)

- Fighters fly in **pairs**: a leader on its `circuit`, a wingman 0.45 R behind and 0.35 R beside it (`pairUp`, every
  frame; a wingman whose leader is lost takes its route). The two flights go round the world opposite ways.
- Waypoints alternate between 2.0–2.6 R and 3.8–4.6 R, each 1.3–1.9 rad on (seeded), so a ship runs one way round its
  world, swinging in and out, faster far out (up to 6 R/s). It plans round its world at 1.25 R. Ships fly relative to
  their world, so they keep up at any speed.
- The circuit crosses your first moon slots (2.4, 3.65, 4.9 R, `core/orbits.ts`; [planetgameplay.md](planetgameplay.md)
  → Moons); patrols steer round moons and rocks and can still hit them (user, 2026-11-13: no low orbit).
- Checked (flight.test.ts, 2026-11-16; 4 fighters, 60 s): 1.0–4.8 R from the world, all 8 sides seen, in-out swing
  ≥ 2.2 R, never under 1.85 R/s; wingmen median 0.62–0.65 R from their leader, within 0.3–1.2 R 100% of the time; ≤ 0.66 R
  apart between 30 and 120 fps.

### Strike

- **Who runs at what:** your ships fly at rocks only as your priority ([civilizationgameplay.md](civilizationgameplay.md)
  → Priority target). Rival home patrols look 6 s ahead (`LOOK_S`) for bodies that would hurt their world and get past
  its shield; the nearest idle ship takes each, soonest first. Idle ships of both sides hunt enemy ships within 9 R of
  their world with the same run; a round that hits breaks the ship. Rival patrols (`rivals.ts` calls the same `defend`,
  ≤ 4 ships) also hunt pirate raiders.
- **Patrol → run → break → patrol:** the ship runs at 5.5 R/s toward the predicted meeting point (lead ≤ 3 s), round its
  own world. Inside gun range (9 R off the target's surface) it points its nose at the lead point and fires while the gun
  bears. It breaks off once closer than 1 R + 0.4 s × the closing speed off the surface, or once the target is gone, or (yours)
  off course or the run's rounds are spent: it turns 80° away for 1.2 s, then picks up its circuit. A wingman follows its
  leader through the run and fires whenever its own gun bears.
- Your fighters break a body ≤ 2% of you, probes ≤ 0.5%, into pieces your air can take
  ([civilizationgameplay.md](civilizationgameplay.md) → Breaking into food); rival ships break bodies ≤ 0.5% of their
  world. Heavier bodies get a sixth of the sideways kick that makes them miss per hit (≤ 1 D/s in all).
- Checked (flight.test.ts, 2026-11-16; a 0.4 R body falling from 20 R at 4 R/s, 5 sides, 30 and 120 fps): the first round
  leaves 8.9–9.0 R off its surface 1.82–2.18 s in; 5 of 5 rounds hit, the first at 2.11–2.47 s with the body still
  10.1–11.6 R out; the ship breaks ~0.16 s after the first hit, passes no closer than 1.05 R off the surface and is back
  at 2.43–2.63 R after 12 s.

#### The siege

Your fleet engaged on a rival world ([civilizationgameplay.md](civilizationgameplay.md) → Battles; `rules.ts` `SIEGE`,
`ships.ts` `defend`, `nav.ts` `ringStep`, `siegePost`). User, 2026-11-14: "surround an enemy planet, invade its orbit,
engage defences, break shields".

- The wing, recounted every frame, is every fighter but one, at most 5 (`siegeWing`), paired among itself. It leaves
  threats to the home ships.
- Its leaders fly a ring 3–3.8 of your radii past the enemy world's surface (aimed at 3.4; never nearer than 2.5 R to
  your centre), counter-clockwise in the enemy's frame, spread evenly round it; wingmen follow. Idle ring ships take
  enemy ships within 6 R of the enemy world.
- **The strafing turn:** every 4 s one free leader swings 3 R further out, then makes the usual run in with its wingman,
  breaks, cools and rejoins the ring. Straight from the ring its nose would not come round before it broke off.
- **The frigate's post** is on the ring, on the bearing from the enemy to you (two frigates ±0.5 rad). It shifts round
  the ring while a body blocks the line, charges its nose 1.5 s and lances the world. At its last hull point it falls
  back to 5 R off you on the far side.
- Checked (nav.test.ts, 2026-11-16; a 0.89 R world 10 R off drifting 0.5 R/s): the wing is on the ring in 2.4 s, holds it,
  never comes nearer than 3.27 R to its surface and makes 1.6 turns in 30 s, the same at 30, 60 and 120 fps. Not tried
  in a test tab.

### Frigate [F]

- Your frigates fly their own circuits (`frigateStep`, `guard`, 2.4 R/s). Every 10 s (`ARMS.lance.reload`, × the energy
  fed) one takes its target ([civilizationgameplay.md](civilizationgameplay.md) → Frigate [F]), turns its nose onto the
  lead point and fires 3 heavy bolts 0.15 s apart while the target stays within ±0.1 rad of the nose. It gives up
  lining up after 4 s. In a siege it lances the world from its post (The siege).
- Checked (guns.test.ts, 2026-11-16; 300 salvos at rocks 2–25% of you drifting under gravity): 900 of 900 bolts hit,
  median flight 0.73 s.

### Rockets

- Your world launches guided rockets from its surface (`ships.ts` `rockets`, the missile pool, `guns.ts` `steer`): from
  tier 1, only at your priority within 8 + 2T radii, one every 8 s. Numbers and flight: Missiles and rockets below; what
  they break: [civilizationgameplay.md](civilizationgameplay.md) → Rockets.

### Guns (every faction)

One pooled list of rounds for every ship of every side (`guns.ts` `createShots`, 96 rounds, made by `combat.ts` as
`ctx.shots`; a full pool fires nothing). A gun belongs to its owner (side, round speed, life, arc, aim error, tint, the
bodies it flies through, its effect). A round fires only while the lead point (`bearing`) is inside the arc ahead of
the nose, is aimed once, then flies straight: no guided rounds (concept 8). Each frame after the field's collisions,
rounds are swept along their path: an enemy ship in the way breaks; any body (not the gun's own world and moons) stops a
round with a flash; only the body it was aimed at gets the effect (and, for pirates, the rocks their fleet works:
`Gun.takes`). A pirate gun holds fire while another body is on its line.

| Gun | Range | Arc | Round speed, life | Pattern | Aim error a burst | Effect |
|---|---|---|---|---|---|---|
| Fighter | 9 R off the surface | ±0.2 rad | 22 R/s, 0.68 s | yours: 2 bursts of 8 at 16/s a run, 1.5 s cool; probes 1 burst of 3 at 4/s, 5 s cool; rival patrols bursts of 6 at 10/s, 0.6 s apart | ±0.04 rad | breaks a small body (yours: only what you cannot take safely); a big one gets 1/6 of the kick |
| Frigate lance | its target; a world from its post | ±0.1 rad | 22 R/s, 2.7 s | 3 bolts 0.15 s apart every 10 s; on a world after a 1.5 s nose glow, only on a clear line | ±0.01 rad | a rock: ≤ 8 pieces; a world: 7.5 K a bolt (`weaponHit`); any ship it meets dies |
| Missile (silos) | the enemy world | any | 11 of your radii/s, guided, 3 s | a salvo of 1–4 fanned ±0.08 rad every 20 s, 1 s after a lance salvo | kicked ±0.9 rad, sides alternating | 20 K on the world; enemy ships within 0.6 R die |
| Rocket (your surface) | your priority within 8 + 2T R | any | 12 R/s on top of you, guided | one every 8 s | 0.08·(6 − T)/5 rad, kicked ±0.8 rad | ≤ 25%: ≤ 8 pieces; bigger: a chip; ships within 0.3 R die |
| Pirate raider | 6 R off the surface | ±0.25 rad | 20 R/s, 0.5 s | bursts of 3 at 6/s, 0.9 s apart, while closing | ±0.06 rad | a rock they work; your shield (`PIRATE_K`), then stock, then a chip |
| Pirate marauder | 9 R off the surface | ±0.2 rad | 20 R/s, 0.62 s | bursts of 5 at 5/s, 1.5 s apart, while closing | ±0.04 rad | as a raider; 3 hits on a rock |
| Rival wave fighter | 8 R | ±0.25 rad | 22 R/s, 0.68 s | 3 a run at 6/s | ±0.06 rad | your frigate first (`pick`), ships, miners, else your world: 0.2 K on your shield, then 0.2 u of ore |

- A run's burst reloads after 1.5 s without the gun bearing (`pull`).
- **Targets:** `pick` (distance × class weight: missile 0.5, frigate 0.7, fighter 1, probe and miner 1.5) for your home
  ships and rival wave fighters; `nearest` for pirates.
- Checked (guns.test.ts, 2026-11-16): a still fighter's burst at a ship crossing its nose 5 R out at 4 R/s kills it 58%
  of the time; a 22 R/s round at 30 fps does not tunnel through a ship; a lead point outside the arc fires nothing.
  Pirates (pirates.test.ts, 2026-11-16): one burst from a fighter run 6 R behind kills a straight raider 73%, a jinking
  one 41% (× 0.56). Raids land 0.71–0.72 hits a second (175–177 of 175–177 rounds on target); at a 4% rock 60% of
  rounds hit (worst run 44%); at most 10 rounds in flight of 96.

#### Missiles and rockets

Guided, one family (`guns.ts` `steer`, `createMissiles`; `rules.ts` `ARMS.missile`, `ROCKET`). User, 2026-11-15: "they should
travel at a slightly wider angle and move more slowly … the opponent shouldn't be able to dodge every single rocket".

| | Missile (silo) | Rocket (your surface) |
|---|---|---|
| Cruise | 11 R/s (the shooter's radii; a rival's in yours) | 12 R/s on top of you |
| Leaves the pad at | 0.22 × cruise, then 8 R/s² | 0.3 × cruise, then 14 R/s² |
| Kick off the aim line | ±0.9 rad, sides alternating in a salvo; less from nearer than 5.5 R | ±0.8 rad, alternating; less from nearer than 6 R |
| Seeker | closes its aim error at 4 / the time to go | 6 / the time to go |
| Turn at cruise (lateral limit) | 0.9 rad/s (9.9 R/s² sideways) | 1.4 rad/s (~17 R/s²) |
| Seeker on | the whole 3 s flight, cone 1.4 rad | 2.8 s, cone 1.4 rad |
| Lets go | 0.15 s from the target | 0.1 s from the target |
| Life | 3 s | the range + 2 R at cruise + 0.5 s |

- One pool of 12 holds missiles and rockets (`ARMS.missile.max`). To rounds a missile is a small target (0.12 × a ship's
  hit radius). Any body stops one; a round, slug or beam kills it. Once the seeker lets go it flies straight.
- Checked (guns.test.ts, 2026-11-16; a world crossing at 1 R/s, both kick sides):
  - From 16 R a steady target is hit (the seeker lets go 0.13 s out, flight 1.85 s); so is a target turning back 0.2 s
    after launch, and a launch 0.08 rad off. Outside the cone it misses.
  - A held 7.5 R/s² burn from 0.8 s at 8 R is hit. From 0.3 s at 10 R, one kick side hits and the other misses by
    1.34–2.10 R.
  - Random sidesteps (any moment, 0–8 R/s²) let 88% land.
  - Point defence: one fighter's bursts stop 41% of inbound missiles from 7–11 R.
  - Without a seeker: a target holding course is hit (0.04 R); one turning back 0.2 s after launch is missed (2.79 R).
- Checked (orders.test.ts, 2026-11-16): a rocket at a rock 9 R out pushed sideways at 4 R/s² hits from both kick sides;
  the same shot without a seeker misses by 0.21 R.
- Browser (debug Life, 2026-11-15): your silo of 2 at a dodging L1 rival 8–17 R off, 10 salvos: 9 of 20 landed, 9 of 10
  salvos landed one. A rival world's dodge and what a rival salvo does to you: [aliencivilizations.md](aliencivilizations.md)
  → Fighting a rival world.

#### Look

`bolts.ts` `drawBolts`, on combat's additive layer (user, 2026-11-14: "much more visible, larger"). Shape and motion say
the weapon, hue the faction.

- Every bolt is a glow quad in the gun's tint stretched along its path round a white core, never under a few screen
  pixels, so it stays easy to follow zoomed out. Rounds: fighters cyan, rivals violet, pirates orange; probes pale
  blue; marauder shells larger; lances long cyan or violet bolts with a halo.
- Missiles and rockets (amber yours, violet rivals'): a teardrop head round a white core and a flickering flame, full
  while the motor runs up, shorter at cruise, a dim stub once the seeker lets go; smoke embers. Worst glow frame 279 of
  400 quads (guns.test.ts, 2026-11-16).
- Slugs: steel white (`STEEL`), a hair-thin long streak and a white head, no halo; a short shock ring on your surface.
- A flash at each launch; each hit a hot flash, tinted light and sparks thrown back along the round's path (more for a
  ship kill or a lance); a missile burst is bigger. One quiet `hit` sound per burst on screen, at most every 0.25 s.

### Rival ships away from home [J]

- War-wave frigates and fighters, probes and miners (`away.ts`: `plan` once a frame, `step` each sub-step, `settle`
  after) cruise at 5 of your radii/s, `scan` + `clear` round rocks, and die touching any body. Home patrols steer round
  bodies and graze or wreck as yours do (Navigation and collisions).
- A massing wave's fighters fly a V round their world (1.5–2.1 rival radii); out, they fly wings of three on strafing
  runs at you and chase on a leash. Its frigates are batteries: a circuit at 1.9–2.1 rival radii round their own world,
  slowing with the nose on you to lance. Probes make strafing runs round you between your outer moon slot + 1.5 and
  + 4 R, for 10 s. A rival frigate takes 2 hits.
- **Tops in space** (`flight.ts` `rivalTop`, 2026-11-15): wave fighters 2 × cruise (10 R/s), probes 1.5 × (7.5 R/s); a
  ship working a body (homing, massing, a battery, a miner at its rock) 2 × cruise on top of that body's speed; velocity
  change ≤ `GEE` × thrust for all. A frame faster than the top (you charging a probe) is not flown in.
- Checked (flight.test.ts, 2026-11-16, the real `away.ts`, 30/120 fps and dt 0.1): every ship stays within max(top, its
  last speed) and `GEE`. You still or drifting 3 R/s: wave ships ≤ 9.2 R/s; you charging at 12 R/s: 10.00 R/s, 3 of 6
  rammed (2 at dt 0.1); you fleeing at 12: the wave turns home after 17 s. A probe ≤ 7.5 R/s, about 9 s within 8 R of
  you drifting 5 R/s. A miner lands on a 6 R/s rock in 1.8 s. Ships homing from 40 R all dock by 8.4 s.
- War waves (flight.test.ts, 2026-11-16; 6 ships): a raid round you crosses 3.2 R 14 times a ship in 30 s at 4 R/s and 18
  at 5.5 R/s, 1.1–7.6 R out, with 7–9 gun windows a ship in 25 s. Leaving at 20 R/s you are dropped after 8.4 s; at
  5 R/s they keep up (farthest ship 7.0–7.2 R).
- What they do: [aliencivilizations.md](aliencivilizations.md).

### Miner shuttles

Miner shuttles use the same flight model, relative to your world (`ferry`): they lift off, cruise at 3 R/s and brake onto
their site's near side (2.4 R/s²): a moon, a free body, a debris cluster or an open rival world [G]. They round your
world at 1.25 R on the way out, land within 0.25 R of the spot, dig, then fly straight home and land 0.08 R off the
surface. Both legs steer round bodies with a 2 ship-radii pad and can hit them; a leg over 15 s gives up. Checked
(nav.test.ts, 2026-11-16; a moon on a 3.2 R circle): out in 2.1–2.2 s, home in 1.5 s at 30 and 120 fps. Trips and what
they bring: [civilizationgameplay.md](civilizationgameplay.md) → Miners on moons.

### Colony fleets [L]

A carrier and a colonizer (or one miner on a terraforming trip) fly from your world to a system planet with `arrive` and
`thrust` at 2 R★/s and 2 R★/s² (braking at 0.6 R★/s²), turning 3 rad/s, relative to the star (`star/colony.ts`). They
steer round the star, the planets and nearby bodies (threaded) and land on contact. A graze hurts a ship; a wreck loses
it (the star always wrecks); a lost colony ship leaves the planet unclaimed and the next fleet pays again. What they do:
[stargameplay.md](stargameplay.md) → Colonies and terraforming.

### Pirate flight

Speeds are in your radii (R), so they scale with you. Behaviour, raids and their checks:
[gameevents.md](gameevents.md) → Pirates.

- **Cruise** 4–5.5 R/s per fleet; main thrust = a ship's speed × 4 /s; raiders turn 2.2 rad/s, haulers 1.6 rad/s and the
  marauder 1.2 rad/s at 0.8 × cruise.
- **Top speed in space** (user, 2026-11-15: a pirate "suddenly starts accelerating alongside me … an unrealistically
  high speed"): raider 2 ×, marauder 1.6 ×, hauler 1.3 × its speed (`P_TOP`, `M_TOP`, `H_TOP`; the flag 1.5 × cruise).
  Velocity changes by at most `GEE` 2 × the main thrust a second, turns included; above its top a ship only slows. A
  frame faster than the ship's top (you on the move) is not flown in; slow rocks keep their frame. **Sidestep**
  (`clear`'s `top`): a ship ahead of a faster body steps across its track at its top. Home ships have no top.
  Timings (flight.test.ts, 2026-11-16; 5.5 R/s cruise): raider 0 → cruise 0.25 s, 0 → 95% top 0.82 s, an 85° turn at
  its top 1.12 s; hauler 0.38 / 0.75 / 1.29 s; marauder 0.28 / 0.77 / 1.53 s.
- **Formation:** a virtual lead (the flag) flies the fleet's course (0.8 rad/s toward the lane's end, or onto the
  stand-off point at ≤ 1.5 × cruise) and `clear`s every body with the formation's half-width added. Each ship `follow`s
  its slot on the flag (5 ship radii back and 4 out a row; marauder or a raider at the point, haulers on the centreline
  with two raiders beside each, the rest in a V), catching up at 1.3 × its speed.
- **Steering round bodies** (`scan` + `clear`, every ship away from home, rivals' too): each frame a ship lists the ≤ 4
  bodies in reach (keep-out = radius + 5 ship radii + 0.1 s × relative speed; reach = 1.2 s + two turn radii). Crumbs
  under 0.25 ship radii and bodies closing faster than 3 × cruise are left out. Each sub-step `clear` bends the course
  round each keep-out on the side the ship already passes (so it never flips); among two or more it slows to 0.6 ×
  cruise; still bent by two and heading into one, it brakes away. Inside a keep-out it slides and climbs out. `free`
  moves every goal out of every keep-out.
- **Your moon system** is one keep-out disc for the flag, formation ships, guards and haulers: the outer filled slot +
  1.5 R (2.5 R with no moons). Only gun runs at you go inside.
- **Gun runs** (`strafe`): in at the target; inside the turn-out (~4.6–5.4 R at you, ~4.3 R at a 4% rock) the run swings
  out 0.5 rad off straight out on its own side, back in past 3.5 R further out. The 2nd and 3rd ship of a wing come in
  0.1 rad off the 1st one's line.
- **Jink** (`menace` + `startJink` + `jinkStep`): 1.2 rad off its velocity, away from the threat's line, at 1.25 ×
  cruise for 0.6 s, then 0.8 rad back for 0.4 s, 1.5 s cooldown. Threats: an enemy ship within 4 R closing nose-on, or
  an enemy round passing within 5 ship radii in the next 0.25 s.
- **Bodies kill:** a ship dies touching any body (the old game's rule), tested with `swept`, so a fast body kills every
  ship on its line; a hauler's claimed piece is spared.

### Navigation and collisions

User, 2026-11-14: ships should collide with consequences, yet fly round what is in their way, weave and adapt;
threats stay dangerous.

- **Collisions** (`bump` + `crash`, after the field moves): a body under 0.25 ship radii does nothing. A pebble (under 2
  ship radii, never a moon or a held world) only grazes and breaks to dust. A body as big closing at ≥ 1.5 R/s
  (`WRECK_V`), or the star, wrecks. Slower is a graze: pushed out to its surface + 0.6 ship radii, normal speed
  reflected × 0.3, tangential × 0.8, the nose kicked 0.9 rad away, hurt 6 s (60% thrust, embers). A graze while hurt
  wrecks; a frigate (3 hull points) loses one a graze instead. On your own world a landing from 0.9 R/s grazes, from
  2 R/s wrecks. A wreck flashes and sparks, and heats the body 40 K × (ship radius / its radius)³ (never your world or a
  held one). Pirates and rival ships away die on any touch. Dev counter: `window.__g().combat.bumps`.
- **Navigation** (`scan`, `clear`): home ships (yours, rivals' patrols, frigates, shuttles) and colony ships scan once a
  frame from a list `reachOf` pre-filters per world, passing bodies closing up to 12 × cruise. **Threaded:** a pair's
  surface gap of 6–10 ship radii squeezes both pads to 0.45 × the gap (flown down the middle, slower while it bends);
  under 6 the pair is one disc. Your world is `skirt`ed like a body (1.25 R). A patrol waypoint inside a keep-out moves to
  its edge; a wingman whose slot lies in a keep-out takes the other side of its leader. Pirates and rival ships away are
  unthreaded (`CROWD`, `STUCK` and the brake-away stay).
- **Bank** (visual): `thrust` eases `bank` toward turn rate / its cap over 0.15 s; `drawShip` narrows the hull up to 40%
  across the nose and the engines outside the turn burn up to 50% longer. **Near-miss sparks:** a pass within 2.5 ship
  radii faster than 2 R/s throws 3 embers, at most every 0.5 s a ship.
- Checked (nav.test.ts, 2026-11-16, 30 and 120 fps): grades (head-on 3 R/s wreck, skim 0.5 R/s graze then clear, hurt
  graze wreck, pebble graze, crumb nothing, a 120 R/s body at 30 fps wreck); every stepper flown at a body on its path
  bumps it before its centre is inside; an 8 ship-radii gap flown through 0.4 ship radii off its middle, a 4 radii gap
  flown round, a jittering goal never flips side. Steering (raiders and haulers): head-on, turn-in, goal inside a body,
  a second body and a belt all 0 hits of 84 (closest 1.9–8.6 ship radii).
- **Crowded field** (crowd.test.ts, 2026-11-16; your world + 3 moons, a belt of one body per 18 R², 4 fighters, a run every
  8 s, 6 seeds × 120 s): wrecks a fighter-minute 0.04–0.19 at rest, 0.10–0.23 with the world drifting 2 R/s, 0.85–1.17
  at 8 R/s; 74–78 of 84 runs fired on their body. Shuttles to a moon behind two others through 20 rocks: 39 of 40 trips,
  1 wreck. A rival patrol round its rock: closest 3.1–4.5 ship radii, no wreck (nav.test.ts).

### Engine plumes and scale

- **Plumes** (user, 2026-11-14): every ship's engines show a plume drawn live behind the hull in the same
  ParticleContainer (`render/tech.ts` `drawShip`): per engine a tinted glow and a short white core from the engine points
  in `render/shipArt.ts` `ENGINES`. Length = nozzle × (3 + 9 × burn), width nozzle × 2.2. Yours steady cyan; rivals one
  long thin violet trail (length × 1.6, width × 0.7, alpha 0.55); pirates unequal orange flares. Docked and digging ships
  show none. 2–6 quads a ship: the combat container holds 600 quads, your civilization's 460.
- Ships are world-sized (`SHIP_SCALE`: a fleet cell = 0.4 of your radius for every faction, and with it plumes, rounds
  and hit radii; never under `SHIP_MIN_PX` 8 px a cell). A ship's hit radius is ~0.09 R (`shipR`: 6 × 0.4 R ÷ 28).

### Ship art

- **Built** (`render/shipArt.ts`): an SVG per faction and class (you and rivals: probe, miner, fighter, frigate,
  colonizer, carrier; pirates: raider, hauler, marauder), 15 in all, baked once in colour into the 1024² tech page with
  Pixi `Graphics.svg`, 128 × 80 cells at one scale so classes stay to scale, drawn with tint white (`SHIP_PX` 28 art px a
  cell: a fighter ≈ 14). All ships stay in one draw call. Stations stay shader art; Dyson haulers are star-page shader
  art (`star/look.ts`).
- The spec (user: "design better 2D", one-winged looked weird): bold symmetric silhouettes with wings on both sides, a
  clear nose → cockpit → hull → engine axis, three hull tones plus a faction accent, glowing nozzles, few thin lines.
  Each faction is told apart three ways, so it reads at 8–14 px even without colour: silhouette language, a signature
  detail, and its palette.

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
| Mood | clean, calm, engineered | elegant, alien: a mirror of you | crude, dangerous, opportunist |

Life cargo is the same everywhere: a green `#6cf0a0` core (Colonizer), so "this ship carries life" reads across
factions.

#### Classes

Lengths relative to a fighter (1.0 ≈ 14 px at the start zoom). The design doc's names; Tip = unlock tier.

| Class | Tip | Length | You | Rivals | Pirates | Role today |
|---|---|---|---|---|---|---|
| Probe | 0 | 0.6 | a compact T with a white sensor pill | a four-point lacewing round a small diamond core | — | yours: the light laser class, cap = tier, breaks ≤ 0.5%; rivals': circle you 10 s, harmless |
| Miner | 0 | 0.9 | a squat cargo hexagon, three ore wells | two hooked claw blades cradling an amber ore crystal | **Hauler** 1.25: an enclosed cargo safe, rust patches, two flares | your shuttles to moons and sites; rival miners strip free rocks; pirate haulers carry loot |
| Fighter | I | 1.0 | a cruciform interceptor, long white canopy | two tall moth wings, a short beak | **Raider** 1.0: a stepped gunboat with paired cannons | your patrols (2 at LIFE), break ≤ 2%; rival patrols and waves; pirate raiders |
| Frigate | I | 1.5 | an elongated shield hull, three armour bands, twin engines | a six-point carapace shield round the core | — | yours from tier 3, a 3-bolt lance every 10 s at 2–25% rocks or an enemy world; rivals' a battery at home (0/1/1/2 at L1–4), 2 hits |
| Colonizer | I | 1.1 | a rounded greenhouse ark | a faceted flower halo round a green garden | — | carries life ([stargameplay.md](stargameplay.md)) |
| Carrier | II | 2.2 | a long bracket hull with two launch mouths | a blade crown with two open hangars | **Marauder** 2.5: a castellated fortress with six turret blocks | the colony ship's escort (no fighters); the marauder is the pirate capital in fleets of 10+ (4 hulls, a heavy gun) |
| Dyson builder | II | 1.5 | a frame with solar fins (to draw) | — | — | today star-page haulers |

#### Rendering

- **Baked in colour, not white:** each faction's cells carry their own palette; tint stays free for hit flashes and
  the harmed state.
- **Shading through value, not lines** (2026-11-13, from concept art; v2 for you and pirates, v3 for rivals): one linear gradient per faction, broad value planes, glowing engines and cores. The gradients do not
  render (Open issues).
- **Texture:** 15 cells of 128 × 80 on the page's lower half, one seed each, no tendency layers yet.
- **Readability target:** every class recognised at 8 px with colour off, factions told apart at 14 px; still one draw
  call for all ships.

## Planned

- **Tendency layers** (the design doc: a civilization's style comes from its planet's tendency), one add-on per
  tendency over any class, in each side's palette (pirates have none):

  | Tendency (doc rule) | Add-on | Stat it shows |
  |---|---|---|
  | Industry (metal ≥ 35%) | armour plates along both sides | hull +40% |
  | Ocean (ocean world) | one or two shield arcs ahead | shield and repair |
  | Swarm (gas + water ≥ 40%) | ships drawn at 0.55× and built ×3 | many, fragile |
  | Energy (radioactive / volcanic) | a long beam spine with a glowing tip | range, energy cost |

- **Lights and flares as dots:** engine flares, wingtip lights and the rival ion trail as `dot` sprites in the same
  container, so they can flicker or pulse without a re-bake.
- **The Dyson builder** art.
- **The 8 px colour-off readability check.**
- Every class flies the one flight model; roles differ only in route and weapon. No guided missile that cannot be
  dodged (concept 8): distance and an early burn across beat missiles and rockets.

## Open issues

- **Flying your world fast through a belt costs fighters:** 0.85–1.17 wrecks a fighter-minute at 8 R/s and 0.10–0.23 at
  2 R/s (crowd.test.ts, 2026-11-16), against the plan's 0.5 and 0.1. Not yet seen in the game.
- **Ship gradients dropped:** Pixi's SVG parser skips `<defs>` / `<linearGradient>` at the ship-page bake, so every ship
  draws without its gradient fills (bake warnings: [techandperformance.md](techandperformance.md)).
- The bank's look at 8 px is unchecked (drop it if it reads as wobble).

## Decisions

- **Ships ≥ 8 px; you cyan, rivals violet** (user, standing).
- **Ship art** (user, 2026-11-13): "design better 2D"; one-winged looked weird. Built: the faction spec above.
- **Flight of all ships** (user, 2026-11-13, concept 7): "We also need to change the flight behavior of all spaceships.
  They do not necessarily have to fly in planetary orbits; simply flying around and following the planet, as in the old
  game, is sufficient. This will allow early-stage players to hit pirate ships using moons. If they try to fly in low
  orbit, the player can never reach them. Bring back a similar mechanic from the old game." Built: the first version
  copied the old game's ship rules (eased turning, moving waypoints, strafing passes, die on touch); the nose-first
  model replaced it; still kept: ships fly relative to their world, enemy ships away die on any touch.
- **Ships fly and fire like spaceships** (user, 2026-11-14): "Our destroyer ships are attacking like rockets—actually,
  they need to open fire, fix that. … I want ships that move more like actual spaceships, with visible propulsion from
  their rear thrusters. This should apply to all ships: our ships, alien ships, and pirate ships." Built: the nose-first
  model, circuits in pairs, formations and strafing runs, attack runs that break off, one pool of aimed rounds, live
  engine plumes.
- **Pirate fleets redesigned from scratch** (user, 2026-11-14): "Pirate groups still aren't following proper flight
  paths. They end up flying straight into planets. … every pirate group should have at least one cargo ship … Let's
  completely redesign and improve their entire lifecycle from scratch". Built: Pirate flight (formation, steering, the
  moon-system keep-out, gun runs, jinks); the fleet's lifecycle in [gameevents.md](gameevents.md) → Pirates. Keep them
  dangerous, but never flying into planets.
- **Ships collide with consequences and navigate** (user, 2026-11-14): "They should still be able to collide with
  objects, and those collisions should have consequences. However, their flight paths need to dynamically adjust to
  their surroundings. … The goal isn't to eliminate collisions entirely, but to make their navigation intelligent and
  visually convincing." Built: Navigation and collisions.
- **Tops in space** (user, 2026-11-15): pirates and rival ships away have a top speed and never ride your velocity; fly
  faster than ~10 R/s and you outrun a raid, and you can run ships down. Built: Pirate flight, Rival ships away from home.
