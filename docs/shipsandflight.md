# Ships and flight

How every ship flies (yours, rivals', pirates'), its routes, guns, rockets, plumes and art. Labels and standing
decisions: [README.md](README.md).

Code (`app/src/`): `evolution/civilization/flight.ts` (model, routes), `nav.ts` (steering round bodies, home steppers,
siege ring), `crash.ts` (collisions), `guns.ts` (rounds, rockets, targeting), `away.ts` (rival ships away), `escape.ts`
(pirate shields, rout, jump) — all pure, tested in `app/test/civilization/`; then `ships.ts`, `bolts.ts` (projectile
looks), `view.ts`, `pirates.ts`, `rivals.ts`, `star/colony.ts`, `render/shipArt.ts`, `render/tech.ts`. Economy and shield:
[civilizationgameplay.md](civilizationgameplay.md); pirate raids: [gameevents.md](gameevents.md) → Pirates; rival
strategy: [aliencivilizations.md](aliencivilizations.md).

## Built

### Flight model (every faction)

Nose first, one main engine (`flight.ts` `thrust`; user, 2026-11-14). Steering sets the wanted velocity; the nose eases
toward it (4 × its error a second, ≤ the turn rate, so turns are arcs) and the engine burns along the nose only: half
power at 90° off, a weak retro (0.4), never backwards; slip bleeds off over 0.08 s. Arcade, not Newtonian. Sub-steps
≤ 1/60 s (frames ≤ 0.1 s): same paths at any frame rate. `burn` (0–1) sets the plume.

| Faction | Unit | Main thrust | Turn | Speeds |
|---|---|---|---|---|
| Your + rival fighters | home R | 12 R/s² | 3 rad/s | patrol 3, home ≤ 6, run 5.5 R/s |
| Frigate | R | 8 R/s² | 2.2 rad/s | patrol 2.4 R/s |
| Miner shuttles | R | 8 R/s² | 3 rad/s | 3 R/s; brakes 2.4 R/s² |
| Pirates | your R | 4 × their speed | 1.2–2.2 rad/s | Pirate flight |
| Rival ships away | your R | 4 × cruise | 2.2 rad/s (frigate 1.8) | 5 R/s; tops: Rival ships away from home [J] |
| Colony fleets | R★ | 2 R★/s² | 3 rad/s | 2 R★/s |

| File | Pieces |
|---|---|
| `flight.ts` | `thrust` (`top` caps speed in space), `avoid`, `circuit`, `follow`, `pairUp`, `formation`, `strafe`, `arrive`, `approach`, `keepOut` (`slam`), `chase`, `leash`, `lowPass`, `bearing`, `leadAt`, `inArc`, `startJink`, `jinkStep`, `wedge` (pirate slots), `rivalTop` |
| `nav.ts` | `scan` + `clear`, `scanRel`, `free`, `reachOf`; home steppers `guard`, `homeStep`, `runStep`, `breakOff`, `breakStep`, `ferry`; siege `siegeRing`, `ringStep`, `siegePost` |
| `crash.ts` | `swept`, `touch`, `bump`, `crash`, `homeContact` |
| `guns.ts` | `createShots`, `pull`, `nearest`, `pick`, `menace`, `createRockets`, `guide` |
| `away.ts` | `plan`, `step`, `settle` |

Measured (flight.test.ts, 2026-11-16): patrol slip median 2.3°, p90 9.1°; war waves p90 9.3°; pirates p90 8.5°. Never
backwards, never over the turn cap.

### Patrol (defence ships)

- Fighters fly in **pairs**: a leader on its `circuit`, a wingman 0.45 R behind, 0.35 R beside (`pairUp`); the two
  flights go round opposite ways. Waypoints alternate 2.0–2.6 R and 3.8–4.6 R, 1.3–1.9 rad on (seeded), faster far out
  (≤ 6 R/s); planned round the world at 1.25 R; flown relative to their world.
- The circuit crosses your first moon slots ([planetgameplay.md](planetgameplay.md) → Moons); patrols steer round moons
  and rocks and can still hit them (user, 2026-11-13: no low orbit).
- Checked (2026-11-16): 1.0–4.8 R out, all 8 sides seen, wingmen within 0.3–1.2 R 100% of the time at 30–120 fps.

### Strike

- Your ships fly at rocks only as your priority ([civilizationgameplay.md](civilizationgameplay.md) → Priority target).
  Rival patrols look 6 s ahead (`LOOK_S`) for bodies that would get past their shield; the nearest idle ship takes each.
  Idle ships of both sides hunt enemy ships within 9 R of their world; rival patrols (≤ 4) also hunt pirates.
- **Run:** 5.5 R/s toward the meeting point (lead ≤ 3 s); inside 9 R of the target's surface it fires while the gun
  bears; breaks off inside 1 R + 0.4 s × closing speed, when the target is gone, or (yours) off course or out of rounds:
  80° away for 1.2 s, then back on its circuit. A wingman follows and fires when its gun bears.
- Yours break ≤ 2% (probes ≤ 0.5%) into food ([civilizationgameplay.md](civilizationgameplay.md) → Breaking into food);
  rival ships ≤ 0.5% of their world; heavier bodies get 1/6 of the kick a hit (≤ 1 D/s).
- Checked (2026-11-16, a body falling from 20 R at 4 R/s): 5 of 5 rounds hit, the first with the body 10.1–11.6 R out.

#### The siege

Your fleet engaged on a rival world (`SIEGE`, `ships.ts` `defend`, `nav.ts` `ringStep`, `siegePost`; user, 2026-11-14:
surround, invade orbit, engage defences, break shields).

- The wing: every fighter but one, ≤ 5 (`siegeWing`), paired; threats are left to the home ships.
- Leaders fly a ring 3–3.8 R past the enemy surface (aimed 3.4; ≥ 2.5 R from your centre), counter-clockwise, spread
  evenly; idle ring ships take ships within 6 R of that world.
- **Strafing turn:** every 4 s one free leader swings 3 R out, runs in with its wingman, breaks and rejoins.
- **Frigate's post:** on the ring on the enemy-to-you bearing (two frigates ±0.5 rad); shifts while a body blocks the
  line, glows 1.5 s and lances. At its last hull point it falls back 5 R behind you.
- Checked (nav.test.ts, 2026-11-16): on the ring in 2.4 s, never nearer than 3.27 R to the surface, at 30–120 fps. Not
  tried in a test tab.

### Frigate [F]

- Own circuits (`frigateStep`, 2.4 R/s). Every 10 s × energy fed one takes its target
  ([civilizationgameplay.md](civilizationgameplay.md) → Frigate [F]), turns onto the lead point and fires 3 bolts 0.15 s
  apart while it stays within ±0.1 rad; gives up after 4 s. In a siege: The siege. Checked: 900 of 900 bolts hit
  (2026-11-16).

### Guns (every faction)

One pooled list of rounds for every side (`createShots`, 96, `ctx.shots`; a full pool fires nothing). A round fires only
while the lead point is inside the arc, is aimed once and flies straight (no guided rounds, concept 8). Swept each frame
after collisions: an enemy ship in the way breaks; any body (not the gun's own world and moons) stops it; only the aimed
body takes the effect (pirates: also their fleet's rocks, `Gun.takes`). A pirate gun holds fire with a body on its line.

| Gun | Range | Arc | Round speed, life | Pattern | Aim error | Effect |
|---|---|---|---|---|---|---|
| Fighter | 9 R off surface | ±0.2 | 22 R/s, 0.68 s (15 R) | yours 2 × 8 at 16/s, 1.5 s cool; probes 1 × 3 at 4/s, 5 s; rival patrols 6 at 10/s, 0.6 s apart | ±0.04 | breaks a small body; a big one gets 1/6 kick |
| Frigate lance | target; world from post | ±0.1 | 22 R/s, 2.7 s (~60 R) | 3 bolts 0.15 s apart / 10 s; on a world after 1.5 s glow, clear line only | ±0.01 | rock ≤ 8 pieces; world 7.5 K a bolt; any ship it meets dies |
| Rocket | 2 × mining reach | guided | 12 R/s, 16 R/s², nose ≤ 2.6 rad/s | Rockets | Rockets | [civilizationgameplay.md](civilizationgameplay.md) → Rockets |
| Pirate raider | 6 R off surface | ±0.25 | 20 R/s, 0.5 s | 3 at 6/s, 0.9 s apart, closing | ±0.06 | their rock; your shield (`PIRATE_K`), stock, a chip |
| Pirate marauder | 9 R off surface | ±0.2 | 20 R/s, 0.62 s | 5 at 5/s, 1.5 s apart | ±0.04 | as raider; 3 hits on a rock |
| Rival wave fighter | 8 R | ±0.25 | 22 R/s, 0.68 s | 3 a run at 6/s | ±0.06 | your frigate first, ships, miners, else 0.2 K on your shield then 0.2 u ore |

- A burst reloads after 1.5 s without the gun bearing (`pull`). **Targets:** `pick` (distance × weight: rocket 0.5,
  frigate 0.7, fighter 1, probe and miner 1.5) for your home ships and wave fighters; `nearest` for pirates.
- Checked (guns / pirates tests, 2026-11-16): a fighter burst kills a 4 R/s crosser at 5 R 58%; a burst from 6 R behind
  kills a straight raider 73%, a jinking one 41%, on a bare hull (shields: [gameevents.md](gameevents.md) → Pirates); no
  tunnelling at 30 fps; ≤ 10 rounds in flight of 96.

#### Rockets

One rocket for every side (`createRockets`, `guide`; `rules.ts` `ROCKET`; user, 2026-11-17: limited manoeuvre, no
sudden 90° turn). Yours on Fire (`combat.ts`), rival worlds' from their pad (`rivals.ts`).

- **Launch:** from the shooter's surface, `pad` ±0.7 rad off the aim (±0.3 at a ship; less inside 10 R), sides
  alternating, off the pad at 2 R/s; it pitches over at once.
- **Real thrust** (`guide`, 2026-11-17; flight.ts untouched): in its launch frame it wants the lead velocity (12 R/s),
  the error closed over 0.2 s (`TAU`); the nose turns ≤ 2.6 rad/s toward that push (plus a 0.2 × `acc` pull back onto
  its path, `TRIM`), and the motor pushes 16 R/s² along the nose only. The path lags the nose: it slips through turns
  (up to 1.4 rad) and needs > 1.1 s for a 90° swing at speed (turning radius ≥ 9 R). Lock lost for good past 1.6 rad off
  its velocity or when the target is gone; unlocked it flies straight. A point shot steers to the clicked point (still in
  the launch frame: where you clicked, while you coast), passes over it and flies on.
- **Fuel is range:** distance flown = the fire range (2 × mining reach, `fireReach`); turning costs range; then it
  fizzles.
- **Hits:** any body stops it (not its own world or moons). Within 0.6 R of a ship: the direct hit (`kill(true)`, through
  a pirate's shield), others within 0.6 R the blast. To rounds a small target (0.12 × a ship's hit radius); a locked
  rocket can stop an enemy rocket.
- Checked (guns.test.ts, 2026-11-17, real thrust): nose ≤ 2.6 rad/s, push ≤ 15.7 R/s², slip up to 1.39 rad, top 12.5
  R/s at 30–240 fps; straight shot within 0.3 R of range, no slip; point shots pass within 0.21 R of the point from either
  pad; on a ship orbiting 3 R/s 100%, crossing 7 R/s 100%, closing 6 R/s 100%, crossing 10 R/s 0% (no undefeatable
  rocket), a 6 R/s crosser breaking 90° at 0.6 s 21%; a 45° path swing at speed 1.32 s; a fighter stops 35% of inbound
  rockets; lift-off burn ≥ 0.81. Rival dodge and salvos at you: [aliencivilizations.md](aliencivilizations.md) → Fighting
  a rival world.

#### Look

`bolts.ts` `drawBolts` on combat's additive layer (user, 2026-11-14: much more visible). Shape and motion say the weapon,
hue the faction.

- Bolts: a glow quad in the gun's tint along its path round a white core, never under a few px. Fighters cyan, rivals
  violet, pirates orange, probes pale blue; marauder shells larger; lances long bolts with a halo.
- Rockets (`render/shipArt.ts`, baked; cyan trim yours, violet rivals'): pale 4:1 tube, nose a quarter of its length, two
  swept fins, a band; `ROCKET.len` 0.07 in the ships' unit (0.7× the smallest ship at every zoom). Pad flash and dust; a
  flame that grows with thrust (long off the pad and in turns), embers streaming back from the nozzle; a hit bursts (`blast`), a shot-down one flares, out of fuel fizzles
  grey. Worst glow frame 327 of 400 quads (2026-11-17).
- A flash at launch; hits flash and throw sparks back along the path; one quiet `hit` sound per burst, ≤ every 0.25 s.

### Rival ships away from home [J]

- War-wave frigates and fighters, probes and miners (`away.ts`) cruise at 5 R/s, `scan` + `clear` round rocks, die
  touching any body. Home patrols steer and graze as yours do.
- A massing wave's fighters fly a V round their world (1.5–2.1 rival radii); out, wings of three strafe you and chase on
  a leash. Frigates are batteries circling 1.9–2.1 rival radii out, slowing with the nose on you. Probes strafe round you
  between your outer slot + 1.5 and + 4 R for 10 s. A rival frigate takes 2 hits.
- **Tops in space** (`rivalTop`, 2026-11-15): wave fighters 2 × cruise (10 R/s), probes 1.5 × (7.5 R/s); a ship working a
  body 2 × cruise on top of its speed; Δv ≤ `GEE` × thrust; a frame faster than the top is not flown in.
- Checked (2026-11-16): you charging at 12 R/s rams 3 of 6 wave ships; fleeing at 12 R/s the wave turns home after 17 s;
  at 20 R/s you are dropped after 8.4 s, at 5 R/s they keep up.

### Miner shuttles

Same model relative to your world (`ferry`): lift off, 3 R/s, brake onto the site's near side (moon, free body, debris,
open rival world [G]); round your world at 1.25 R; land within 0.25 R; dig; fly home and land 0.08 R off the surface. Both
legs steer round bodies and can hit them; > 15 s gives up. Out 2.1 s, home 1.5 s to a 3.2 R moon (2026-11-16). Trips:
[civilizationgameplay.md](civilizationgameplay.md) → Miners on moons.

### Colony fleets [L]

A carrier and a colonizer (or a miner on a terraforming trip) fly to a system planet (`arrive` + `thrust`, 2 R★/s,
2 R★/s², braking 0.6, turning 3 rad/s, relative to the star; `star/colony.ts`), steering round star, planets and bodies,
landing on contact. A graze hurts, a wreck loses the ship (the star always wrecks) and the planet stays unclaimed.
[stargameplay.md](stargameplay.md) → Colonies and terraforming.

### Pirate flight

In your radii, so they scale with you. Behaviour: [gameevents.md](gameevents.md) → Pirates.

- **Cruise** 4–5.5 R/s a fleet; thrust = speed × 4/s; turns: raider 2.2, hauler 1.6, marauder 1.2 rad/s (at 0.8 × cruise).
- **Top speed** (user, 2026-11-15: no pirate suddenly matching your speed): raider 2 ×, marauder 1.6 ×, hauler 1.3 × its
  speed (`P_TOP`, `M_TOP`, `H_TOP`; flag 1.5 × cruise), about 4–11 R/s; Δv ≤ `GEE` 2 × thrust a second; above top only
  slowing; a frame faster than the top is not flown in. **Sidestep** (`clear` `top`): ahead of a faster body it steps
  across the track. Home ships have no top. Raider 0 → 95% top in 0.82 s (2026-11-16).
- **Formation:** a virtual flag flies the course (0.8 rad/s to the lane's end, or the stand-off point at ≤ 1.5 × cruise),
  clearing bodies by the formation's half-width; ships `follow` slots (`wedge`: 5 ship radii back, 4 out a row; marauder
  or raider at the point, haulers on the centreline flanked by raiders, the rest a V), catching up at 1.3×.
- **Steering** (`scan` + `clear`, every ship away): ≤ 4 bodies in reach (keep-out = radius + 5 ship radii + 0.1 s ×
  relative speed); crumbs and bodies closing over 3 × cruise ignored; bends round each keep-out on the side it already
  passes; slows to 0.6× among two; brakes away when boxed; `free` moves goals out of keep-outs.
- **Your moon system** is one keep-out for the flag, formation, guards and haulers: outer filled slot + 1.5 R (2.5 R with
  no moons). Only gun runs go inside.
- **Gun runs** (`strafe`): in at the target, turn out ~4.6–5.4 R from you (4.3 R at a 4% rock), swing 0.5 rad off, back
  in past 3.5 R further out; wingmates 0.1 rad off the lead's line.
- **Jink** (`menace`, `startJink`, `jinkStep`): 1.2 rad off away from the threat at 1.25 × cruise for 0.6 s, 0.8 rad back
  for 0.4 s, 1.5 s cooldown; threats: a ship within 4 R nose-on, or a round passing within 5 ship radii in 0.25 s.
- **Bodies kill:** any touch (`swept`; the old game's rule); a hauler's claimed piece is spared.

### Navigation and collisions

User, 2026-11-14: collisions with consequences, yet ships fly round what is in their way; threats stay dangerous.

- **Collisions** (`bump` + `crash`): under 0.25 ship radii nothing; a pebble (< 2 ship radii, not a moon or held world)
  grazes and breaks to dust; a body as big closing ≥ 1.5 R/s (`WRECK_V`), or the star, wrecks; slower grazes (pushed out,
  bounced × 0.3 / 0.8, nose kicked 0.9 rad, hurt 6 s at 60% thrust). A graze while hurt wrecks; a frigate loses a hull
  point instead. On your own world 0.9 R/s grazes, 2 R/s wrecks. A wreck heats the body 40 K × (ship / body radius)³ (not
  your or a held world). Pirates and rival ships away die on any touch. Dev: `__g().combat.bumps`.
- **Navigation:** home and colony ships scan once a frame from a `reachOf` list (bodies closing ≤ 12 × cruise).
  **Threaded:** a gap of 6–10 ship radii squeezes both pads to 0.45 × the gap; under 6 the pair is one disc. Your world
  is skirted at 1.25 R. Waypoints in a keep-out move to its edge. Pirates and rival ships away are unthreaded.
- **Bank** (visual): the hull narrows ≤ 40% across the nose in turns, outer engines ≤ 50% longer. Near misses within
  2.5 ship radii over 2 R/s throw 3 embers (≤ every 0.5 s).
- Checked (2026-11-16): every stepper bumps a body on its path before its centre is inside; steering 0 hits of 84;
  crowded belt: 0.04–0.19 wrecks a fighter-minute at rest, 0.85–1.17 at 8 R/s; shuttles 39 of 40 trips through 20 rocks.

### Engine plumes and scale

- **Plumes** (user, 2026-11-14; `render/tech.ts` `drawShip`, engine points `shipArt.ts` `ENGINES`): per engine a tinted
  glow and white core, length nozzle × (3 + 9 × burn). Yours steady cyan; rivals one long thin violet trail; pirates
  uneven orange flares (`RUST`, full while a drive spools). Docked or digging: none. 2–6 quads a ship (combat container
  600, your civilization's 460). Pirate shields and jumps: [gameevents.md](gameevents.md) → Pirates.
- Ships are world-sized (`SHIP_SCALE`: a cell = 0.4 of your radius for every faction, plumes, rounds and hit radii
  alike; ≥ `SHIP_MIN_PX` 8 px). Hit radius ~0.09 R.

### Ship art

- `render/shipArt.ts`: an SVG per faction and class (you and rivals: probe, miner, fighter, frigate, colonizer, carrier,
  rocket; pirates: raider, hauler, marauder), baked once in colour into the 1024² tech page (`Graphics.svg`, 128 × 80
  cells, one scale; `SHIP_PX` 28 art px a cell, a fighter ≈ 14). One draw call for all ships. Stations stay shader art;
  Dyson haulers are star-page art (`star/look.ts`).
- Spec (user: "design better 2D"; one-winged looked weird): bold symmetric silhouettes, nose → cockpit → hull → engine
  axis, three hull tones plus an accent, glowing nozzles. Each faction told apart by silhouette, a signature detail and
  palette, readable at 8–14 px.

#### Faction identity

| | **You** | **Rivals** | **Pirates** |
|---|---|---|---|
| Shape | smooth capsules and crosses, rounded, symmetric; each class its own outline | sharp faceted blades and petals, wide | boxy welded scrap, mismatched details |
| Signature | red / green nav lights; white canopy; cyan inset strips | one bright diamond core at the centre of mass; short ion trail | amber hazard chevrons, rust patches, rivets |
| Hull dark / mid / light | `#1f4a5a` / `#2f7088` / `#5fb4cc` | `#3b2763` / `#55398a` / `#8a63d6` | `#3a3229` / `#5a4c3a` / `#8a7a60` |
| Outline | cyan `#7fe8ff` | violet `#b48cff` | bone `#d9cfbf` |
| Highlight | canopy `#e8fbff` | core `#f1e6ff` | window `#ffd9a0` |
| Accent | cyan `#7fe8ff`; wingtips `#ff6b6b` / `#6cf0a0` | the core | rust `#c4683c`, amber `#e8b04a` |
| Engines | twin round, steady cyan | one long violet trail ~55% | uneven orange `#ff7a50` flares |
| Mood | clean, calm, engineered | elegant, alien | crude, dangerous |

Life cargo is a green `#6cf0a0` core everywhere (Colonizer).

#### Classes

Length relative to a fighter (≈ 14 px at the start zoom); Tip = unlock tier.

| Class | Tip | Length | You | Rivals | Pirates |
|---|---|---|---|---|---|
| Probe | 0 | 0.6 | compact T, sensor pill | four-point lacewing | — |
| Miner | 0 | 0.9 | cargo hexagon, three ore wells | claw blades round an ore crystal | **Hauler** 1.25: cargo safe, two flares |
| Fighter | I | 1.0 | cruciform interceptor | tall moth wings | **Raider** 1.0: stepped gunboat |
| Frigate | I | 1.5 | banded shield hull, twin engines | six-point carapace | — |
| Colonizer | I | 1.1 | greenhouse ark | flower halo, green garden | — |
| Carrier | II | 2.2 | bracket hull, two launch mouths | blade crown, two hangars | **Marauder** 2.5: fortress, six turrets (fleets of 10+) |
| Dyson builder | II | 1.5 | to draw | — | — |

#### Rendering

- Baked in colour (tint stays free for hit flashes). Shading by value planes, one gradient per faction (2026-11-13; v2
  you and pirates, v3 rivals) — the gradients do not render (Open issues). Target: every class recognised at 8 px colour
  off, factions told apart at 14 px.

## Planned

- **Tendency layers** (design doc: style from the planet's tendency), one add-on over any class (pirates none): Industry
  (metal ≥ 35%) armour plates, hull +40%; Ocean shield arcs, shield and repair; Swarm (gas + water ≥ 40%) 0.55× ships
  built ×3; Energy (radioactive / volcanic) a long beam spine, range.
- Flares, wingtip lights and the ion trail as `dot` sprites (flicker without a re-bake); Dyson builder art; the 8 px
  colour-off check.

## Open issues

- **Fast flight through a belt costs fighters:** 0.85–1.17 wrecks a fighter-minute at 8 R/s (plan 0.5). Not seen in game.
- **Ship gradients dropped:** Pixi's SVG parser skips `<linearGradient>` at bake ([techandperformance.md](techandperformance.md)).
- The bank's look at 8 px is unchecked.

## Decisions

- **Ships ≥ 8 px; you cyan, rivals violet** (user, standing).
- **One flight model, no undodgeable rocket** (concept 8): roles differ only in route and weapon; distance, speed and an
  early burn beat rockets.
- **Ship art** (user, 2026-11-13): "design better 2D".
- **Flight of all ships** (user, 2026-11-13, concept 7): ships follow their planet as in the old game, not low orbits, so
  early players can hit pirates with moons. Kept: ships fly relative to their world; enemy ships away die on any touch.
- **Ships fly and fire like spaceships** (user, 2026-11-14): open fire instead of ramming, visible rear thrust, for every
  faction.
- **Pirate fleets redesigned** (user, 2026-11-14): proper flight paths, never into planets, every group with a cargo ship;
  keep them dangerous.
- **Ships collide with consequences and navigate** (user, 2026-11-14): collisions stay, paths adapt intelligently.
- **Tops in space** (user, 2026-11-15): pirates and rival ships away have a top speed and never ride your velocity; over
  ~10 R/s you outrun a raid and can run ships down.
