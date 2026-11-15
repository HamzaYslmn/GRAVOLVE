# Game events

What happens to you rather than what you do: meteors, comets, giant clashes, pirates, and the planned events director with
its catalogue. Owning code: `app/src/evolution/asteroid/field.ts` (meteors, first-run shower, comets, great comets, giant
clash, discoveries, places, encounters), `app/src/evolution/civilization/pirates.ts` and the pirate block of
`civilization/rules.ts`. Rivals have their own file ([aliencivilizations.md](aliencivilizations.md)); ship flight is in
[shipsandflight.md](shipsandflight.md); the field the events run in is in [worldgen.md](worldgen.md).

Labels: **measured** = run in the game or in a sim on the real formulas; **checked** = read in the code; **computed** =
worked out from cited constants; **structural** = design reasoning, to be measured when built. **[D n]** = a decision for
the user (Decisions below). **[B]**, **[M]** = package IDs (`vision.md` → Wave plan; [B] is built, [M] too except the Marauder capital).

## Built

### What runs today (checked against the code)

All of these are **ambient**: independent Poisson clocks with no awareness of each other. There is no notion of "an
event is running", no novelty, no quiet periods. The old game had the same shape: one-shot spawners plus monitors per
mission (`analysis/SOLAR/07-missions-and-meta.md` §1, toolkit list), nomad fleets that sweep the player's area
(`08-ships-ai-and-loose-ends.md` §1.11), and no director.

| Stream | Code | Rate | Note |
|---|---|---|---|
| Meteors | `asteroid/field.ts` `meteors` | Poisson mean 10 s, 1 in 10 a shower of 2–4; 1–20% of you in Age I, 0.1–1% from Age II (a world: fast things stay small and mostly burn up; `METEOR_SHARE_AGE2`) (≤ 10^4), cross the screen in 0.8–1.3 s | 12% aimed near you (20% in Age I); Age II rate × bombardment × local density, none aimed in voids |
| First-run shower | `field.ts` SHOWER_AT | once, 20–30 s into Age I | 3–4 meteors of 2–10%, missing a still player by ≥ 4 radii |
| World comets | `field.ts` `comets` | mean 75 s (× bombardment in Age II), 1–12% of you, 3–7 own D/s | never aimed |
| Great comets | `field.ts` `greatComets` | mean 240 s, 0.5–3× you, 1.5–3 own D/s | pass 0.5–0.8 view half-diagonals away, `held`, shed up to 40 ice crumbs (catalogue "Forging a world" → Great comet, built) |
| Rivals | `field.ts`, `asteroid/rival.ts` | up to 3 loaded, one per 20 s of travel (timer × speed / 2 own D/s), none before 15 s | first one in Age I is a hunter 1.4–1.8× you; past M_MAX 1 in 4 a slow hunter. Rules: [aliencivilizations.md](aliencivilizations.md) |
| Giant clash | `field.ts` `giants` | mean 300 s, 3–12× you | Age I only (skipped once the giants would pass M_MAX); fragments are ordinary shatter pieces |
| Discoveries | `field.ts` `discover` | 0.12 per screen | swarm / moonlets / stream (with comet head); see [worldgen.md](worldgen.md) |
| Places | `field.ts` `discover` | fields 0.06, giants 0.02 per screen | fields on web filaments only; giants 20–200× you, drifting |
| Encounters | `field.ts` | 0.25 per screen | 1.5–6× you, drifting |
| Pirates | `civilization/pirates.ts` (the run's one combat, `main.ts`) | fleets in every age: first 30–60 s in, then one at a time, Poisson mean 40 s apart; attacks on you from LIFE, every 60 s + Poisson mean 180 s | 1–14 ships, always a hauler, a marauder from 10; they crack and haul rocks, raid worlds, shoot nearby ships first (catalogue "Civilization" → Pirate fleet) |
| Rival worlds | `civilization/rivals.ts` | by travel: 3 view widths after the civilization, then every 8; ≤ 2 loaded | named roster rivals; stances, massing war waves with bolts, slug volleys. Rules: [aliencivilizations.md](aliencivilizations.md) |
| Star flares | `star/stage.ts` | Poisson mean 20 s near a star | heat and dose pulse; a shield takes them. Rules: [stargameplay.md](stargameplay.md) |

### Meteors

Poisson mean 10 s, 1 in 10 a shower of 2–4; 1–20% of you in Age I, 0.1–1% from Age II (`METEOR_SHARE_AGE2`) (≤ 10^4); cross the screen in 0.8–1.3 s; local material, 25%
piles, 10% binaries, tumbling. 12% aimed through your area (20% in Age I), the rest through a disc 3× the view; simulated
37% cross the screen, 3% would hit a still player. First-run shower at 20–30 s: 3–4 of 2–10%, missing a still you by ≥ 4
radii. Age II: × bombardment × max(0.05, density), none aimed in voids. A hit on your world (Age II on) heats it by `worldHeat` (2026-11-14): +8 K at 0.2%, +91 K at 1%, +256 K at 2%, +1012 K at 5%, +2862 K at 10%, +4000 K at 12.5% (slow touch; × (V / stick speed)² faster), so a 5–20% meteor now melts or wipes a world (`asteroid/rules.ts`, [asteroidgameplay.md](asteroidgameplay.md) → Heat); bodies under 1% burn up in the air first. (Bombardment and calm:
[planetgameplay.md](planetgameplay.md) → Calm. The meteor belt biome (Firefall Belt) quadruples the rate, Frost Reach makes world comets 1.75× as often: [worldgen.md](worldgen.md).)

### Comets

World comets: mean 75 s (× bombardment in Age II), 1–12% of you, 3–7 own D/s, random lines, never aimed; coma + vapour
tail. A world comet of 1–12% hits your world with the same `worldHeat` (+91 K at 1%, +2862 K at 10%). Great comets: mean 240 s, 0.5–3× you, 1.5–3 of your D/s, passing 0.5–0.8 view half-diagonals away, `held` (out of
gravity), shedding up to 40 ice crumbs; parked 1,275 s: 5 passes, 0 contacts (measured).

### Giant clash

Age I only. Poisson 300 s: two giants 3–12× you meet beside you (d 1.2–3), shatter; dust ring, flash, boom, scaled shake,
0.6 s slow motion; never killed a still player in 120 s (measured). The clash is skipped when the heavier giant would
pass M_MAX (10^4), so it is an Age I show (checked, `field.ts` `giants`). Clashes at every size: Planned → Clash at every
size.

### Pirates

Nomad fleets in every age (user, Q2) that crack rocks, haul the pieces off and raid worlds when they can. Redesigned
from scratch on 2026-11-14 (user: "they end up flying straight into planets … every pirate group should have at least one
cargo ship … redesign their entire lifecycle"). Numbers in `civilization/rules.ts` (pirate block); behaviour in
`civilization/pirates.ts`, flown in Node by `pirates.test.ts` (a fake world: bodies, moons, `field.spawn`, the real shot
pool). `main.ts` makes one combat per run (`combat`, in `window.__g()`): in Age I it flies only the pirates; at Age II the
planet stage attaches its moons and drives it, so the pirates fly on (2026-11-14). A respawn builds a fresh one.

- **When:** one fleet at a time; the first 30–60 s in (into the run, and again into Age II), the next a Poisson gap of
  mean 40 s after one is gone. Attacks on you are due from LIFE, every 60 s + Poisson mean 180 s (unchanged).
- **Composition:** `fleetSize(u)` = 1 + ⌊14u²⌋ ships in all (1–14, no escalation); haulers max(1, round(n/5)) (every group
  has one), a marauder from 10 ships (every age), the rest raiders. 1 ship: a lone scavenger hauler (no gun, takes loose
  pieces, leaves). Checked over 1000 launched rolls: 1–14 ships, always a hauler, marauder only from 10 (27% lone
  scavengers, 20% with a marauder over that uniform spread of u). Hulls: raider 1 round, hauler 2, marauder 4; slugs, the
  beam and any body kill outright. Raider: cruise 4–5.5 R/s, gun 6 R off the target, ±0.25 rad, bursts of 3 at 6/s, 0.9 s
  apart. Hauler: 0.8 × cruise, holds 100 u (≤ 20 u of it your stolen stock). Marauder: 0.8 ×, turn 1.2 rad/s, gun 9 R,
  ±0.2 rad, bursts of 5 at 5/s, 1.5 s apart, 3 rock hits a round. Bone hulls, orange flares and rounds.
- **Lifecycle:** cruise → work (a rock) or raid (a world) → leave. A fleet appears 1.05 camera half-diagonals out, already
  in formation, on a straight lane aimed within 0.4 view half-widths of the view centre (so it crosses the screen); two
  lanes with nothing and it leaves. Every 0.5 s it thinks: score = value / (1 + distance / 10 R) over what is on screen
  within 0.75 half-diagonals: you 3 (only while an attack is due and your civilization is awake), a rival world 2, a
  rock of 0.5–25% of you 0.5 + its ice and metal share + 0.2 a such rock within 4 R (≤ +1), a loose piece of 0.1–0.5%
  0.4 (while a hauler has room); never moons, meteors, comets, fast or held bodies, rival bodies, rocks whose gun runs
  would cross your moon system. A target is kept ≥ 4 s. They leave when the holds are full, after 60–90 s about, with
  half the ships lost or no hauler left, or when a raid ends (20–40 s, the leash, the target gone).
- **Formation:** one formation round a virtual lead (the flag) that steers round every body with the formation's
  half-width added; fixed slots (marauder or a raider at the point, haulers on the centreline, two raiders beside each
  hauler, the rest in a V behind), redone only when a ship dies; 0.8 × cruise with a hauler or marauder.
- **Jobs:** gun (strafing runs at its target, ≤ 3 a target), haul (a claimed piece: brake beside it, 0.8 s on the tractor
  line, aboard), guard (circling a stand-off point 3.5 R past the target, moved off every body and out of your moon
  system by the circuit's 2.2 R + 1 R; never round a hauling hauler, whose tractored piece crosses that circle), form.
  An enemy ship within 6 R of a hauler or 4 R of the fleet centre draws up to 2 raiders until it dies or is 9 R off.
- **Their own pieces** (browser test 2026-11-14: guards and gun ships died on pieces their fleet had just cracked, 3 in
  4 fleets): a rock one raider burst from cracking (≤ 3 hits left, or any a marauder aims at) keeps the flag, guards and
  haulers out of its pieces' fling (its keep-out grows by its radius + 5 ship radii); a piece of their own work up to 1%
  of you drifting onto a ship within 4 ship radii has its own drift off that ship brought up to 0.3 R/s by the ship's
  tractor (a faint line; never at the ship's speed, so nothing is pushed ahead of it); pieces spawn ±0.1 rad round their
  even spread (no overlap at birth). Measured (Node, a fake world with gravity, merging and bouncing like the field's:
  40 runs of 10 ships at five rocks of 1.5–6% 14–17 R out, 60 s): 0 body deaths, 252 cracks, 309 pieces hauled, 102
  shoves; before the shove 2–4 deaths per 100 such runs.
- **Work:** guns crack a rock in clamp(round(3 + 40 × share), 3, 12) hits into 2–5 pieces of 0.25% of you each (80% of
  it, flung out at 0.6–1.2 of its radii a second; the rest is dust); pieces over 0.5% of you are cracked again, 0.1–0.5%
  hauled whole. Cracked pieces are real bodies: you can take them first. Measured (Node, a 5-ship group at a 4% rock,
  40 runs at 30 and 120 fps, a still field): every run cracked and loaded cargo within 60 s, 235 cracks, 160 pieces
  hauled, 58% of 1361 rounds hit a rock they were working (worst run 34%), no ship lost to a body; holds full and gone in
  ~25–30 s.
- **Raid:** gun runs at you or a rival world, ships first (your shuttles and fighters within 6 R while it is on you, rival
  ships), once on screen 6 s (`T_SEE`); rocks need no wait. Rules unchanged: a shielded world loses 3 K a round, an open
  one 1 u of stock into a hauler (≤ 20 u each), then a chip of 0.02% of your mass as water or air, ≤ 2% of your water
  and air a raid. Your moons are cover: any body stops a round and the fleet holds fire when one is on the line.
  Haulers and guards wait outside your moon system (its outer filled slot + 1.5 R, 2.5 R with no moons); only gun runs
  go in. Measured (Node, world + 4 moons + 5 rocks, fleets of 8, attacks from 30 s, 4 runs × 120 s at 30 and 120 fps):
  8 raids each, no body deaths, closest 7.1 ship radii off a big body, haulers ≥ 1.11 × the moon-system keep-out
  (gravity on: the rocks fall toward you), 0.90–0.92 hits a second a raid (3 gun ships; ~0.3 a raider). A leaving fleet
  forms up on its haulers, out of your moon system, not on the fleet centre (gun ships may be inside it). A raid on an empty store chipped at most 64% of
  its cap; a hauler stole at most its 20 u.
- **Fire discipline:** one target a wing, kept; the trigger held while closing on it (the inbound leg), in range, the
  lead point in the arc and nothing but rocks they work on the line; bursts repeat while the gun bears. A rock's run
  turns out 1.2 turn radii + 1 R past its keep-out, swings out 0.5 rad off straight out and comes back past 3.5 R more.
  Measured: a pass every 4.3–4.9 s on a lone rock; among cracked pieces the longest dry spell a run is 5.5 s (median),
  over two passes (9 s) in 8 of 40 runs, at most 13.4 s.
- **Evasion:** a raider jinks (1.2 rad off its velocity away from the threat's line at 1.25 × speed for 0.6 s, then
  0.8 rad back for 0.4 s, 1.5 s cooldown) when an enemy ship closes on it nose-on within 4 R or an enemy round will pass
  within 5 ship radii in 0.25 s; a hauler drops its line and runs 2 s to the nearest guard. A moving body on course for
  the formation scatters it for 2 s, each ship across the body's track on its own side. Measured (Node): a fighter
  closing 3 R behind sets a jink off within 0.03 s; one burst from a fighter run 6 R behind kills a straight raider 67%,
  a jinking one 45% (200 seeded bursts); a 1 R body closing at 2 × cruise kills none of 8, at 4 × it kills all 8.
- **Leaving:** everyone forms up round the haulers and flies straight out from the view centre (±0.3 rad); gone past 1.3
  half-diagonals; ships still on screen after 14 s jump out with a flash, haulers first. Measured: full holds → leaving
  within 0.5 s, each hauler's nearest raider ≤ 0.34 R, gone after 9.1 s.
- **Fighting back:** ram them, drag them through a belt (bodies closing faster than 3 × their cruise are not
  dodged); slugs and the beam kill any ship; rounds take hull hits. A tractoring hauler is nearly stopped: the moment to
  hit it. A destroyed hauler bursts: 80% of its hold as 1–4 pieces of ≥ 0.1% of you (the field keeps them) and your
  stolen stock × 1.5 ("Loot recovered"). Your defence ships and rival home patrols hunt them.
- **Toasts:** "Pirate fleet" once the fleet is on screen; "Pirate fleet destroyed · Burst haulers spill what they stole".
- Achievement "Bounty": destroy a pirate fleet ([hudandcontrols.md](hudandcontrols.md)). Flight: [shipsandflight.md](shipsandflight.md) → Pirate flight.
- Not yet measured in the browser (all numbers above are Node, a fake world with no field gravity or collisions between
  rocks). Cost: `pirates.update` 0.13 ms mean, 0.22 ms p95 for 14 ships among 400 bodies (Node).

Standing rule: **pirates never destroy a world or kill you** (README).

## Planned

### [M] Pirate capital

Built (2026-11-14 redesign): the Marauder flies in every fleet of 10+ ships, every age (Built → Pirates). Still planned:
nothing beyond the catalogue entry below.

### The events director

Game-master plan for the user's request: "constantly show users something new … a pirate fleet that fires on random
planets and steals their resources … other random events too. Let's increase fun." Design rule: **fun first, then
realism**. It is the next step after the stage phases A1–G (all built; how they work is in the gameplay files) and takes
over phase **A3** (clashes at every size with debris). The director and most catalogue events are not built; "What runs
today" lists what exists. Planned after wave 2 (`vision.md`).

"Phase" columns name the system an event needs: B (air, calm), C (web, great comets), V (world overlays), D (moons), E
(civilization), F (combat), G (stars) all exist, so those events need only the director; H (expansion) is not built.

#### Ground rules for every event

1. **Ignoring is always valid, and always leaves something.** Every event ends with collectable bodies, a visible change,
   or both. No event is a pure loss.
2. **Danger is seen, never told.** No arrows, alerts, warning or verdict text (standing). A threat is shown by its body
   on screen, the existing aura wells (`wells.ts`), a natural pre-cue in the world (a prominence swelling, a shock front
   crossing the sky, a rumble) and its sound.
3. **Visible approach.** A threat's first frame on screen is at least `T_SEE` before it can touch a still player at its
   own speed: 3 s Asteroid, 6 s from Forging on, 10 s for epic events. Event bodies are always sensed while on screen
   (wells), not only inside the 3 s course look-ahead.
4. **Fast things are small, big things drift** (README, standing decisions). > 5 own D/s only for bodies ≤ 15 % of you;
   bodies ≥ 0.5× you ≤ 3 own D/s relative to you; anything ≥ `EATEN_MARGIN` 1.15× you (`asteroid/rules.ts`) is never on
   a path that meets a still player (miss distance ≥ both radii + 2 of your radii). Planets never rain.
5. **Shows happen where you look.** Events place their action 0.5–1.0 view half-sizes from you (like the clash in
   `field.ts`), or on a path that crosses the view. Off-screen effects (a colony raided) are capped and leave visible
   aftermath; you discover it, nobody tells you.
6. **Small rocks stay common.** Events add bodies on top of the field; none removes the belt.
7. **Budget.** Loaded bodies ≤ 400 + 120 event bodies at peak; event sprites ≤ 300 (ships share the 200-ship,
   1-draw-call container, [shipsandflight.md](shipsandflight.md)); event CPU ≤ 0.3 ms mean per frame at 1280×720;
   director bookkeeping ≤ 0.02 ms. Each row below gives its own share (structural until measured).

#### Director (`core/director.ts` + `director.test.ts`)

Ambient streams keep their own clocks (they are the texture). The director runs **featured events** on top.

Event definition:
```ts
type EventDef = {
  id: string; stages: Stage[];
  tier: 'minor' | 'major' | 'epic';           // major/epic: one at a time
  kind: 'spectacle' | 'opportunity' | 'threat';
  every: number;                               // target mean minutes between, when eligible
  cooldown: number;                            // s before the same id may run again
  weight(ctx): number;                         // place + state (region, density, web, star near, stocks)
  ready(ctx): boolean;                         // prerequisites (moon, tech, civ level, a star in range)
  start(ctx): EventHandle;                     // returns { done(): boolean, bodies: number }
};
```
`ctx` = player state, stage, region sample at the player (density, `kindMix`, web, palette), seconds settled S,
bombardment B ([planetgameplay.md](planetgameplay.md) → Calm), active events, seen set. Stage modules register their defs
(`evolution/<stage>/events.ts`); `field.ts` exposes a small spawn API (body, cluster, fragments, region sample) instead
of each event reaching into it. The clash moves out of `field.ts` into the director as its first event (A3).

Scheduling:
- **Three clocks.** Spectacles tick with real time (a settled world still watches the sky). Threats tick with dt × B
  (settling quiets them, [planetgameplay.md](planetgameplay.md) → Calm). Opportunities tick with dt × (0.4 + 0.6 ·
  min(1, speed / 2 own D/s)) (roaming finds more). One seeded rng per run (`seed + 7`).
- **Featured gap** = `poissonGap(mean)` clamped to [min, max] per stage (Pacing per stage). When due, candidates = defs
  for this stage that are `ready`, off cooldown, fit the concurrency rules and the threat budget.
- **Weight** = base (from `every`) × place × **novelty** (× 2 if not seen this run, × 3 if never seen on this device:
  `localStorage gravolve.seen`, wrapped in try/catch) × 0.3 if the same `kind` ran last. No candidate: retry in 5 s.
- **Concurrency:** at most 1 major/epic at a time; at most 2 minors; no new major within the **calm window** after one
  ends. During a major, meteor rate × 0.5 and rival top-up paused, so the show reads.
- **Threat budget:** minimum gap between two threats that could deliver ≥ 20 K ([planetgameplay.md](planetgameplay.md) →
  Life) or a stock loss to a still player. Living-world values are the calm targets in
  [planetgameplay.md](planetgameplay.md) → Calm.
- **Stage opener:** the first featured event of each stage comes 20–40 s after the handover and is the stage's signature
  (column "opener" below). Each new stage starts with a show.
- **First sighting naming:** the first time per run an event is on screen, the shared toast queue (`ui/toast.ts`,
  [hudandcontrols.md](hudandcontrols.md)) names it ("A rogue planet"). Never before it is visible, never a verdict.
  **[D 9]**

#### Pacing per stage (structural targets; ambient streams run underneath)

| Stage | Featured mean gap (min–max) | Major share | Calm after major | Threat min gap | Featured events per stage (computed from length) | Opener |
|---|---|---|---|---|---|---|
| Asteroid (2.5–3 min) | 40 s (20–90) | 25 % | 30 s | 60 s | ~4 | meteor storm |
| Forging (3–5 min) | 50 s (25–110) | 30 % | 40 s | 90 s | ~5 | planet clash beside you |
| Living (8–12 min) | 75 s (35–180), spectacles only past S > 4 min except per budget | 25 % | 60 s | settled 10 min, roaming 3 min, void 15 min | ~8 | life-bearing comet |
| Civilization (12–15 min) | 55 s (30–120) | 30 % | 45 s | 3 min | ~15 | trade convoy |
| Star takeover (10–15 min/star) | 60 s (30–130) | 35 % | 50 s | 2.5 min | ~12 | superflare |
| Expansion (open) | 50 s (25–110) | 35 % | 45 s | 2 min | ~1.2/min | ancient megastructure sighting |

Novelty target (the user's "constantly something new"): **≥ 3 distinct event ids seen per 5 min at every stage**, plus
ambient. Checked in `director.test.ts` (simulated hour per stage, fake ctx) and in game logs.

### Clash at every size

Phase A3: the clash at every size with debris (Asteroid 3–12×, Forging+ 0.5–3×), as a director event. See the catalogue
rows "Clash" (Asteroid) and "Planet clash" (Forging a world).

### Event catalogue

Columns: **Play** = ignore / chase / defend / exploit. Sizes and speeds are relative to you (own diameters per second =
own D/s). "Phase" = stage-plan phase it ships with. Everything here is Planned unless the row says Built.

#### Asteroid

| Event | Fantasy, on screen | Play, reward / risk | Size, speed, rarity | Reuses, budget, phase |
|---|---|---|---|---|
| **Meteor storm** (minor, threat) | A swarm crossing your sky: the first 2 pass wide (natural cue), then 8–16 over 6–10 s from one side | dodge, or match course and eat them; risk a shatter | each 0.3–5 % of you, today's meteor speeds; ~1 per 2.5 min | `meteors()` with a count and one source angle; ≤ 16 bodies, culled as meteors; A3 |
| **Clash** (major, spectacle → opportunity) | Two battered giants meet beside you: dust ring, flash, boom, slow-mo (exists, Built as the ambient giant clash); now leaves 20–40 kept fragments each | watch, then harvest; fragments fly at 0.1–0.3 of closing speed | 3–12× you as today; ~1 per 4 min in belts, none in voids | `giants()` → director; fragment count raised for clash bodies only (`body.ts` shatter); ≤ 80 bodies; **A3** |
| **Migrating swarm** (minor, opportunity) | A herd of 30–80 small rocks flowing across the screen as one river | fly into its flow and graze-feed; rivals join the feast | 0.05–1 % each, belt flow × 2; ~1 per 3 min, belts | `discover` swarm with shared velocity; ≤ 80 bodies (counts to the cap); A3 |
| **Rival brawl** (minor, spectacle → opportunity) | Two rivals fight over a big rock; one shatters | wait and take the wreck, or snipe the winner while it is chipped | rivals 0.35–2× you (`field.ts` RIVAL_MASS); ~1 per 3 min | `rival.ts` targeting each other; 0 new bodies beyond 2 rivals; A3 |
| **Comet breakup** (minor, opportunity) | A comet crosses and splits into 3–6 nuclei, each with a small coma (realism: Shoemaker–Levy 9) | chase the fragments for ice | comet 2–12 % of you, fragments ¼ each, comet speed; ~1 per 4 min, ice regions × 2 | `comets()` + `coma()`; ≤ 7 bodies; C |
| **Hot vein** (minor, opportunity) | A cluster of 5–10 radioactive rocks glowing green in a dark stretch | eat for a heat window (melt early, differentiate), risk overheating | 0.5–3 % each, drifting; ~1 per 5 min, metal regions × 2 | `COMP.radioactive`, `radioGlow`; ≤ 10 bodies; C |

#### Forging a world

| Event | Fantasy, on screen | Play, reward / risk | Size, speed, rarity | Reuses, budget, phase |
|---|---|---|---|---|
| **Planet clash** (major, opener) | Two young worlds collide beside you: one ice-rich, one differentiated; a ring of fragments and a dust cloud of up to 400 grains | harvest water (ice pieces) and iron (metal-rich core debris, `body.ts:286`); the field stays in its chunks, so you can come back | peers 0.5–3× you, 0.7–1.0 half-views away; mean 180 s in belts, none in voids (approved stage-plan decision 11) | clash event, `debrisComp`, chunk-kept fragments, tech-artist debris cloud; ≤ 80 bodies + 400 grains (1 draw call); **A3** |
| **Great comet** (major, opportunity) — **Built** as an ambient stream (What runs today) | A huge dark nucleus, curved dust tail and straight ion tail, shedding ice crumbs | fly in its tail and harvest; catch it as an icy moon (Phase D); never comes closer than half a view diagonal unless you go to it | 0.5–3× you, 1.5–3 own D/s, mean 240 s (approved stage-plan decision 11) | comet code + trail; ≤ 1 body + ≤ 30 crumbs; C |
| **Comet storm** (major, threat/opportunity) | 5–12 comets on parallel lines from one ice region over 30–45 s (realism: late heavy bombardment delivered water) | stand in it to gain water fast (heat cost), or step aside | 1–8 % of you each, 3–7 own D/s; ~1 per 6 min, near ice regions | `comets()` batch; ≤ 12 bodies; C |
| **Rogue planet** (major, spectacle) | A dark wanderer out of a void; its gravity drags a wake of belt rocks behind it and tugs moons | eat the rocks it stirs up, slingshot past it; it may steal a moon (D) | 2–8× you, ≤ 1.5 own D/s, passes 0.6–1 view away; ~1 per 6 min, voids × 3 | encounter spawn + gravity (it is a source); 1 body; C |
| **Easy moon** (minor, opportunity) | A slow binary asteroid pair wandering close: one is the right size for a moon | match its speed on a free ring: capture by match ([planetgameplay.md](planetgameplay.md) → Moons) | 0.5–5 % of you, belt speed; ~1 per 4 min while a slot is free | moonlets discovery; ≤ 3 bodies; D |
| **Outgassing** (minor, on your world) | Vents of steam break through your crust after a big meal or radioactive heat | free atmosphere (+0.5 % gas held), steam veil | your body; only when hot and holding air | `core/water.ts` steam, steam overlay; 0 bodies; V |

#### Living world (calm first: [planetgameplay.md](planetgameplay.md) → Calm)

| Event | Fantasy, on screen | Play, reward / risk | Size, speed, rarity | Reuses, budget, phase |
|---|---|---|---|---|
| **Life-bearing comet** (minor, opportunity, opener) | A small icy comet on a slow pass, faint green glints in its coma (panspermia) | merge it gently (< v_m): +60 s life progress and +water; ramming it loses the bonus | 0.5–2 % of you, ≤ 2 own D/s; ~1 per 5 min | comet + `comp` tag; 1 body; B |
| **Shooting-star shower** (minor, spectacle) | Dozens of small rocks burn up in your air as streaks and flashes | none needed: your air is working; the dust joins you | each below the burn-up share s_b ([planetgameplay.md](planetgameplay.md) → Calm); ~1 per 4 min | meteor storm + burn-up visuals; ≤ 20 bodies; B |
| **Dinosaur killer** (major, threat) | A large rock on a slow collision course, visible > 10 s out, red well | put an orbiting moon in its path, order your ships at it (they push what they cannot break), or move (resets settling); a hit is a soft setback, not death | 8–12 % of you at 4–6 own D/s. **Needs a rework:** the 46–90 K here is from the old Age II heat table; with `worldHeat` (2026-11-14) a slow 8–12% body delivers ~2,000–3,700 K (+2862 K at 10%, ×(V / stick speed)² faster, cap 4420 K), which wipes life and melts the crust, not a soft setback; air does nothing (> 4·s_b) | meteor spawn aimed once; under the threat budget only (settled ≤ 1 per 10 min); 1 body; D |
| **Supervolcano** (minor, on your world) | Lava glow and an ash veil spread over your surface for 30 s | cools you 20–40 K (rescues a hot world, hurts a cold one), +gas | your body; ~1 per 8 min when radio share > 0 or hot interior | lava/steam overlays; 0 bodies; V |
| **Life bloom** (minor, reward) | Green spreads across the seas in waves | life speed × 2 for 60 s when all four scores > 0.6 | your body; once per life stage | planet rules + tint; 0 bodies; V |
| **Nebula crossing** (major, place) | The sky fills with coloured fog; the stars dim; fine dust rains on you | +gas and ice from dust (0.2 %/min of you), but cooling −15 K while inside: ice-age risk on a cold world | 6–15 screens of web filament; place-driven, not timed | backdrop nebula (`background.ts`), climate hook; full-screen sprite (~1 plain sprite, measured cost class of the backdrop); C |
| **Gamma-ray burst** (epic, spectacle/threat) | A distant point flares white, a thin beam sweeps the sky for 4 s | protected by magnetic field, air and shield; unprotected: soft setback (−60 s), never more | screen-wide, no bodies; at most once per run, ≥ 15 min into the run | sky flash sprite, dose formula ([civilizationgameplay.md](civilizationgameplay.md), dose); 2 sprites; V |
| **Pirate sighting** (minor, spectacle) — **removed** (wave 1 [B]): fleets roaming from the Asteroid Age replace it | Far off, a small fleet strips a giant asteroid with tracer fire and leaves | ignore; it shows what comes later; leftovers to eat | ships tiny, ≥ 0.7 view away; once in Living | pirate AI in "raid others only" mode; ≤ 8 ships; E **[D 3]** |

#### Civilization

##### Pirate fleet (major, threat → opportunity) — the flagship event

Mostly **Built** (see Built → Pirates for the numbers as they are); what is still planned is marked.

- **Fantasy:** raiders who live off other people's worlds. They fire on planets and moons, knock resources off them and
  haul the loot away.
- **Composition** (borrowed from the old game's nomad fleets, `08-…md` §1.11: small 1–3 strikers, medium 3–5 +
  capitals, large 6–11 + capitals + heavies): **raiders** (fast, shoot), **haulers** (slow, carry loot, a tractor line to
  the pieces they collect), and in large fleets a **flagship**. Built as random size: 1–14 ships, always a hauler, a
  marauder (the flagship) from 10, no escalation (user). ≤ 20 ships.
- **AI:** the old game's two states plus a waypoint (`08-…md` §1.1, §1.3: Idle and Attack, constant speed, eased heading,
  overshoot loops that read as orbiting), round-robin thinking 10 ships per tick. Ships die on touching any body (old
  game rule), so they skirt belts. Built as: a fleet state machine (cruise, work, raid, leave) thinking every 0.5 s, one
  job a ship, on the shared ship flight model ([shipsandflight.md](shipsandflight.md)); they turn on you only while an attack is due (Q2).
- **The raid:** the fleet enters along a web filament at the view edge and picks a target in view by value: your mined
  moon or colony > a rival civ world > an ice/metal-rich body ≥ 5 % of you. Raiders circle it and fire (tracer
  particles). Every 2 s the target loses 0.5 % of its mass as 2–3 pieces flung off (`events.debris`, comp of the
  target). Haulers collect half of the pieces; the other half stays loose. They leave after 20–40 s or when the haulers
  are full, at 1.5× speed. Built as: a fleet on a lane across the view (not along a web filament) that cracks
  rocks with its guns and hauls the pieces, raids your world (not your moons) only while an attack is due, and leaves
  in formation (Built → Pirates); pieces come from `field.spawn` (no `events.debris`).
- **Against your world:** while your shield > 0 it absorbs the shots (veil ripple). With the shield down each hit steals 1
  ore or volatile from the stocks; a hauler holds up to 20 (about one minute of mining a 2 % rocky moon,
  [civilizationgameplay.md](civilizationgameplay.md): 20 ore/min). Pirate shots can never destroy a world or kill you: one
  shot is a quarter of your slug (your slug does nothing to a 3 % moon or a planet,
  [civilizationgameplay.md](civilizationgameplay.md) → Mass driver). With shield and stock gone, a capped chip of water or
  air (≤ 2% a raid). Built.
- **Play:**
  - *Ignore:* the target loses 5–15 % of its mass; half lies around as collectable pieces. (Built: 0.5% per 2 s for
    20–40 s, ~5–10%, computed.)
  - *Defend:* defence ships engage automatically; one slug kills a raider
    ([civilizationgameplay.md](civilizationgameplay.md) → Mass driver); or **ram them
    with your planet** (they die on contact). Built; bodies are swept against ships, so a fast body kills every ship
    on its line.
  - *Hunt:* a destroyed hauler bursts into its loot: pieces with the victim's composition totalling ~80 % of what it
    held, and stolen ore returns × 1.5 (Built). A flagship drops a cache: +40 ore and +25 % on the current tech step
    (Planned; the tech ladder is gone, so the cache needs a new reward).
  - *Exploit:* drag them into a dense belt or past a giant: ships that touch bodies die. Built.
- **Escalation:** dropped (user: random size, no escalation). Not built: fleets coming more often to richer targets (a
  mining moon doubling the weight).
- **Size, speed, rarity:** ships drawn ≥ 8 px (README), cruise 4–5.5 of your radii/s (fast, so small by rule 4); in every
  age a new fleet a Poisson mean 40 s after the last is gone; attacks on you from LIFE every 60 s + Poisson mean 180 s
  (Built). Budget: ≤ 20 ships, ≤ 60
  tracer particles, ≤ 20 pieces per raid.
- **Phase:** full fleet in **F**, roaming and pursuit in [B] (built; the sighting went with [B]).

| Event | Fantasy, on screen | Play, reward / risk | Size, speed, rarity | Reuses, budget, phase |
|---|---|---|---|---|
| **Trade convoy** (minor, opportunity, opener) | A line of neutral freighters crossing between two worlds | leave them: +10–20 ore when they pass within one view (your civ trades); raid them: their cargo drops, but rival civs hold a grudge (+1 aggression for 5 min) **[D 8]** | 4–8 ships, slow; ~1 per 4 min | ship container, hauler loot code; ≤ 8 ships; E |
| **Refugee fleet** (minor, opportunity) | A ragged fleet fleeing a dying world (after a clash or supernova), sometimes chased by pirates | let them land: +0.5–1 bn population; defend them from pursuers for a bigger thank-you | 5–12 ships; ~1 per 6 min, more after a nearby clash | ships; pirate combo in F; ≤ 20 ships; E/F |
| **Derelict alien probe** (minor, opportunity) | A tiny dark probe drifting, one blinking light | touch it slowly or Command it: the current tech step −50 % time; 15 % it wakes and fires slugs at you for 20 s before dying **[D 7]** | point-size, belt speed; ~1 per 6 min, metal regions × 2 | ship sprite, `collide()` slugs; 1 ship; E/F |
| **Golden asteroid** (minor, opportunity) | A gleaming metal body passing slowly | catch it as a moon: your miners get metal × 3 from it | 0.5–3 % of you, belt speed; ~1 per 6 min | golden metal atlas material, civilization miners; 1 body; E |
| **Rival civ war** (major, spectacle → choice) | Two rival worlds trade slugs and ships beside you | join one side (the other turns friendly: trade), or wait and loot the loser's wrecked moons | rival levels per [aliencivilizations.md](aliencivilizations.md); ~1 per 7 min with ≥ 2 rivals loaded | `rivals.ts`, `weapon.ts`; ≤ 40 ships; F |

Note: the probe's "tech step −50 % time" predates the removal of the tech ladder (2026-11-13); it needs a new reward.

#### Star takeover

| Event | Fantasy, on screen | Play, reward / risk | Size, speed, rarity | Reuses, budget, phase |
|---|---|---|---|---|
| **Superflare / CME** (major, threat, opener) | A prominence arc swells on the star's limb 4–6 s, then a plasma cloud expands outward at visible speed | shield absorbs it; park a moon between you and the star (its shadow cuts the dose); link progress pauses | dose × 10 for 8 s; ~1 per 3 min near a star | star sprites, dose ([stargameplay.md](stargameplay.md)); ≤ 3 sprites; G |
| **Sungrazer** (minor, opportunity) | A comet dives at the star, its tail swings round, it breaks up at closest approach | catch the fragments (ice) on their way out | 1–5 % of you; ~1 per 4 min near a star | comet breakup; ≤ 7 bodies; G |
| **Rival star claim** (major, threat) | Another civ's light filaments reach for your star | out-link them (stay in the band) or break their filaments with slugs/ships | rival level ±1; ~1 per 8 min while linking | link code, rivals; ≤ 20 ships; G |
| **Planet migration** (major, spectacle) | A gas giant of the system drifts inward, scattering its moons and belt | collect the scattered moons and rocks | giant on its kinematic orbit, slow; ~1 per 10 min per system | orbits; ≤ 30 bodies; G |
| **Pirate Dyson raid** (major, threat) | Pirates attack Dyson segments and haul off panels | as the pirate fleet; a lost segment can be rebuilt | as pirates; ~1 per 6 min with ≥ 2 segments | pirate event, Dyson panels; ≤ 20 ships; G |

#### Expansion

| Event | Fantasy, on screen | Play, reward / risk | Size, speed, rarity | Reuses, budget, phase |
|---|---|---|---|---|
| **Supernova shock** (epic, threat/reward) | A distant star blows: the sky flashes, then a glowing shell front crosses the sky over 60–90 s | shield, air and field protect; unprotected: soft setback; afterwards a dusting of heavy metals (+metal, a rare "r-process" element bonus) and new stars ignite in the shell | screen-wide, once per 20 min at most | expanding ring sprite, dose; 3 sprites; H |
| **Black hole passage** (epic, spectacle/threat) | A dark disc with a lensing ring and accretion glow crosses a void; rocks stream into it in spirals | slingshot past it for huge speed; drag pirates into it; fly too close and the deadly well means death (visible, slow, never aimed) **[D 6]** | 10–100× you, ≤ 1 own D/s, passes ≥ 1 view away; ~1 per 15 min of void travel | gravity source, lens sprite, tidal shredding = fracture; 1 body + ≤ 3 sprites; H |
| **Ancient megastructure** (major, discovery) | A broken ring of a dead civilization at a web node | stay near it 30 s: two free Dyson segments or a free colony ship | landmark, still; 1 per ~40 screens explored | tech page panels; ≤ 60 panels (Dyson draw path); H |
| **Colony aftermath** (minor, place) | Arriving at a colony you find dimmer lights and debris: it was raided while you were away | hunt the raiders still nearby for its stock back | colony loss capped at 10 % (rule 5) | pirates; H |
| **Invasion fleet** (epic, threat) | Waves of a rival system's ships (the old game's Invaders missions: 3–4 waves of growing size, `07-…md` §2) | defend; each cleared wave drops wreck metal | ≤ 3 waves of ≤ 30 ships; ~1 per 15 min | pirate AI, ship container; ≤ 60 ships; H |
| **Stellar nursery** (major, discovery) | Inside a nebula, protostars flicker on | a new star to take over, nearer than usual | 1 per ~30 screens of filament | stars, nebula; H |

### Phase placement (smallest first)

| Phase | Events | Why here |
|---|---|---|
| **A3** | director skeleton + check; clash at every size with debris (Asteroid 3–12×, Forging+ 0.5–3×); meteor storm; migrating swarm; rival brawl | the director is small, the clash is the user's named wish; the rest reuse existing spawners |
| **B** | life-bearing comet, shooting-star shower; director threat clock × B and the threat budget | needs burn-up and calm ([planetgameplay.md](planetgameplay.md) → Calm) |
| **C** | great comet, comet storm, comet breakup, hot vein, rogue planet, nebula crossing | needs voids, web and large comets |
| **V** | outgassing, supervolcano, life bloom, gamma-ray burst | needs the world overlays |
| **D** | easy moon, dinosaur killer (a moon in its path blocks it), rogue planet steals a moon | needs moons |
| **E** | trade convoy, refugee fleet, derelict probe, golden asteroid | needs ships and stocks |
| **F** | **pirate fleet**, rival civ war, refugee chase | needs weapons |
| **G** | superflare/CME, sungrazer, rival star claim, planet migration, pirate Dyson raid | needs stars |
| **H** | supernova shock, black hole passage, ancient megastructure, colony aftermath, invasion fleet, stellar nursery | needs systems and colonies |

Already built outside the director: the great comet (C), the pirate fleet (F, roaming since [B]). The pirate sighting
(E) was removed with [B].

### Verification

- **Director (Node, `director.test.ts`):** a simulated hour per stage with a fake ctx: mean and min featured gap within ±
  20 % of the pacing table; never two majors at once; calm windows held; threat gaps ≥ the budget; ≥ 3 distinct ids per 5
  min; the novelty bonus makes every eligible id appear within its first 2 × `every`.
- **Each event in game:** a dev-only hook (`import.meta.env.DEV`: `window.__director.force(id)`) in a visible test tab,
  audio suspended in the page (standing). Measure loaded bodies, event sprites, field update mean / p95 at 69.5 / 3.2k /
  31.6k / 316k / 796k where the stage allows; must stay inside rule 7.
- **Fairness soak:** 20 min parked still player per stage with all events forced eligible: **0 deaths and 0 stock losses
  caused by director events that were not on screen ≥ `T_SEE` first**; log each threat's first-visible time vs contact
  time. Living-world parked soaks must still meet the calm targets (≥ 10 min between ≥ 20 K hits settled in a belt).
- **Per-event checks:** clash: seen within ~6 min of belt flying at 31.6k and 796k, fragments kept after flying away and
  back (phase A3); pirates: ignore / defend / hunt each scripted once, stolen ore ≤ hauler capacity, no shot ever lowers
  a planet's mass below its start; comet storm and dinosaur killer: delivered ΔT logged against the impact heat table
  ([asteroidgameplay.md](asteroidgameplay.md) → Heat); black hole: a still player 1 view off its path is never pulled in
  (compute the pull from `pullMass` before building).

### Open realism notes (fun wins, stated honestly)

- Pirates, probes, megastructures and convoys are fiction; they are there because the user asked for things happening.
  Their numbers live inside the same physics (`collide()`, stocks, dose).
- A real rogue planet or black hole passing this close would be an extinction-level rarity; here it is a minutes-scale
  spectacle that never aims at you.
- Supernova and GRB effects are scaled down to setbacks; real ones near a world would sterilize it.

## Open issues

- **[B] Pirates go unseen** (playtest): in Age I a fleet was on screen in 0 of 138 samples (closest 33 R); in Age II
  the attack on you was never due in ~380 s.
- **[B] What "avoid them" means for an asteroid** (Q2) is open beyond competing for food: before LIFE they never target
  you, only crack and haul rocks, and die if rammed.
- **[M]** A raid on you costs 3–4 shuttles per 20 s (measured).
- Fixed 2026-11-14 (one combat and one news latch a run, `main.ts` `runNews`): Bounty is awarded for Age I kills too,
  and the "Pirate fleet" toast shows once a run.
- **[B] A due attack lands late:** only ~30% of fleets turned on you while it was due (before the 2026-11-14 redesign;
  you now score highest whenever you are on screen, not re-measured in the browser).
- **[B]** Chipped water / air pieces leave at 2 R/s and mostly fall back (very easy to catch).
- **[F] Natural infall on a parked Age II world** (measured 2026-11-14, not fixed, user to decide): a moon-sized body falls on it about every 1.5 min (2.5% → +363 K, 1.8% → +224 K, 4.3% → +819 K); the first big hit wipes life and the civilization sleeps and stops defending. Also in [vision.md](vision.md) → Open issues.
- **Flagship cache and the derelict probe reward** name "the current tech step", which no longer exists.
- The events director, catalogue and its decisions are a 2026-11-13 plan; none of [D 1]–[D 12] has been answered.

## Decisions

Standing (README): fun first, then realism; danger is seen, never told (no arrows, alerts, verdict or meteor warnings);
fast things are small, big things drift; **pirates never destroy a world or kill you**.

- 2026-11-13 (user): the civilization starts at LIFE with defence ships and the mass driver, so the events plan's "first
  raid on you only after Defence ships or the Mass driver" is void: raids on you start with the civilization.
- 2026-11-13 (user): pirates loop round their target between waypoints (the old game's way), [shipsandflight.md](shipsandflight.md).

Pending, from the events plan (2026-11-13; "Recommended" is the game master's default):

1. **Pacing:** a featured event every ~40 s (Asteroid) to ~75 s (Living), never two big ones at once, calm windows after
   each (Pacing per stage). Recommended: yes.
2. **Novelty bonus remembered per device** (`gravolve.seen`), so a new player meets every event type early. Recommended:
   yes.
3. **Pirates from the Civilization stage** (they raid what is worth stealing), with one harmless sighting in the Living
   stage. Alternative: alien raiders from the Forging stage. Recommended: Civilization + sighting. (Settled by Q2:
   pirates roam from the Asteroid Age; the sighting is gone.)
4. **Pirates can never destroy a world or kill you;** the worst is stocks, shield, a moon's mass. Recommended: yes. (Kept;
   built with a capped habitability chip, never a kill.)
5. **Every event leaves something to collect, ignoring is always valid.** Recommended: yes.
6. **Black hole passage can kill** if you fly into it (deadly well, slow, never aimed, voids only). Recommended: yes;
   alternative: it only shreds your moons.
7. **Derelict probe has a 15 % bad outcome** (wakes up and shoots for 20 s). Recommended: yes (surprise is fun, the risk
   is small).
8. **Raiding trade convoys angers rival civs** for 5 min. Recommended: yes (a real choice).
9. **Name events in a toast on first sight per run** (after they are visible, never as a warning). Recommended: yes;
   alternative: no names at all.
10. **Clash sizes:** 3–12× you in the Asteroid stage (as today), 0.5–3× from Forging on (approved stage-plan decision
    11). Recommended: yes.
11. **Living world while settled:** only spectacles and opportunities, threats only inside the calm budget
    ([planetgameplay.md](planetgameplay.md) → Calm). Recommended: yes.
12. **Phase placement** as in Phase placement, director + clash first in A3. Recommended: yes.

The concept's three pirate conflicts (player seeking, habitability, random size) are settled by the decisions below and
built ([B]).

### Decided 2026-11-13 (open decisions Q1–Q7)

- **Q2, when pirates appear** (user, 2026-11-13): "Pirates will always be present in the game. During the Asteroid Age, players must avoid them. Pirate groups of varying sizes, from small to large fleets, will appear randomly throughout the world. Pirates will only begin attacking players after the Life Age. Attacks should be unpredictable and relatively infrequent to avoid frustrating players." Replaces "pirates from the civilization, one sighting before".
- **Pirate harm** (user, 2026-11-13): capped. With your shield down and stock empty, hits knock a little water / air off as catchable pieces (≤ ~2% a raid). Pirates still never destroy a world or kill you.
- **Pirate fleet size** (user, 2026-11-13): random, no escalation: 1–14 raiders, mostly small, sometimes huge; the "next one will be bigger" toast goes.
