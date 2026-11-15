# Planet gameplay (Age II)

Age II, from the Planetoid (AGE_GOAL 10^3.5 = 3,162) to LIFE: world tiers and the gas line, water, air and climate,
burn-up, calm, life, moons, your surface, and how a living world survives. It covers stages 2 (Forging a world) and 3
(Living world) of the stage table in [`README.md`](README.md). Code: `evolution/planet/` (`rules.ts`, `stage.ts`,
`moons.ts`, `hud.ts`), `core/water.ts`, `core/orbits.ts`; paths are under `app/src/`. The handover into Age II (melt-through)
is in [`asteroidgameplay.md`](asteroidgameplay.md); what happens from LIFE on is in
[`civilizationgameplay.md`](civilizationgameplay.md). Your HUD card and the controls are in
[`hudandcontrols.md`](hudandcontrols.md).

Labels: **measured** = run in the game or in a sim on the real formulas; **computed** = from the formulas; the rest are rules.

## Built

### World tiers and the gas line (`planet/rules.ts`)

- **Above AGE_GOAL** (`planet/rules.ts` `tierName`/`tierIndex`/`nextGoal`, the single source): Protoplanet (molten) / Dwarf planet 10^4; Planet (Rocky planet if solids ≥ 60%) 10^4.5; Super-Earth / Mini-Neptune 10^5; Ice giant 10^5.5 (ice+gas ≥ 60%); Gas giant 10^6 (gas ≥ 70%); Super-Jupiter 10^6.5; Brown dwarf 10^7 (never ignites).
- **Gas line:** in at gas ≥ 20%, out below 15% (sticky). From 15% at ≥ Planet mass the HUD warns once. A gas world leaves the life path and ends at Brown dwarf.
  - In code the life path closes on the gas line only from Super-Earth mass (`envelope`: m ≥ 10^5 and on the line; `planet/stage.ts:145`). Below that a gas-line world still runs life and can start a civilization. The warning toast says the same: "20% gas makes a gas world from Super-Earth mass: no surface, no life".
- A world never reads as an asteroid again: dropping below AGE_GOAL (lost steam) still names a planetoid. One toast per mass step; a rocky world past Super-Earth has no next tier, its goal is "make it habitable".

### Your surface

- **Your surface** (Age II, `setSurface`): seas in the low ground of the sphere's own relief, glint, frozen seas, frost, green lowlands as life fills, teal seas when habitable, lava seams, city lights as a separate bake. One 256² bake per state, crossfaded 0.6 s.

### Water, air and climate (`core/water.ts`, `planet/rules.ts`)

- **Water** (player only): T = 120 + 430 × heat K; melts 273 K, boils 373 K at 1 atm, 273 K at the 0.05 atm triple point (below it ice sublimates). Steam held from 0 at 10^3 to all at 10^4.5 (log). Pressure = gas × hold × 4 × max(1, m/10^4.5)^(2/3). Boils 2%/s at ≥ 200 K over; latent 40 heat per share.
- **Climate:** heat settles toward 120 K + 200·p^0.25 at rate 1 / (`RELAX_S` × (1 + excess heat units)), `RELAX_S` 10 s: a little warmth fades in seconds, a magma ocean after a moon-sized hit (+1000–4000 K) takes minutes (user, 2026-11-14; 60 s boiled the seas at ~0.9 K/s of feeding, 10 s holds liquid seas up to ~2.6 K/s, measured): liquid at rest from 0.34 to 2.56 atm (0.4 / 1 / 2.5 atm → 279 / 320 / 371 K). Vapour rains out below boiling − 5 K, leaks 0.5%/s above boiling. **First rain** returns up to 90% of the water you brought (stands in for outgassing).
- Heat itself (impact heat, cooling, radioactive heating, molten states): [`asteroidgameplay.md`](asteroidgameplay.md) → Heat. In Age III a star's light adds warmth to the climate target: [`stargameplay.md`](stargameplay.md).

### Burn-up

- **Burn-up** (`burnShare`, `reachGround`, `field.ts` `burn`): s_b = 0.004·√min(p, 10) of your mass (0.2 / 0.4 / 0.8 / 1.26% at 0.24 / 1 / 4 / 10 atm). Arriving at ≥ stick speed below s_b: burns up, mass joins you as dust and warms you by a quarter of the heat it would have delivered (BURN_HEAT; user: burn-ups should still warm a little), no hit; up to 4·s_b partly lands; slow arrivals land in Age I; from Age II (mass ≥ `AGE_GOAL`) any body under min(4 × s_b, `BURN_MAX` 1% of you) burns whatever its speed, and nothing from 1% up (a moon) is slowed by air at all (user, 2026-11-14), and nothing lighter than 1.15× you merges by a hit: [asteroidgameplay.md](asteroidgameplay.md) → differences table. Once per body. Streak: embers and a small flash above the limb; no shake, sound or text.

### Calm

- **Calm:** rivals arrive by distance travelled; bombardment B = 0.15 + 0.85·exp(−S/120) (S = seconds under 2 own D/s, reset after a full view) multiplies Age II meteors, aimed share and comets; voids are quiet. Parked at 31.6k (measured): void 0 hits ≥ 20 K in 30 min; settled dense belt 1 per 10 min; fresh belt ~1 per 1.5 min, nearly all slow infall of big neighbours.
- The meteors and comets that B scales: [`gameevents.md`](gameevents.md).

### Life

Code: `planet/rules.ts`, `planet/stage.ts`.

Concept 1's life conditions (water, metal, magnetic field, temperature balance) are built as four scores; air is the fourth.

- **Scores** 0..1: water 10% → 30% (full to 60%, halves toward 90%); temperature only while liquid, full from 281 K to boiling − 30 K; air 0.2 → 0.7 atm (falls past 10–30); magnetic field = min(2, metal × diff / 6%) × size, capped at 1 (log mass planetoid → planet, radio helps; user 2026-11-15: more metal makes it stronger, so up to 12% sunk metal makes up for a small world's weak dynamo).
- **Life speed** = min(water, temp, air) × (0.5 + 0.5·field) × radioLife(radioactive share), all four > 0 to start.
- **Radioactive rock and life** (user, 2026-11-15: "low radiation levels should still allow life to develop"; `radioLife`): a little warms the crust and stirs mutation, too much slows life, never to a stop: 0% ×1.00, 0.5% ×1.13, 1% ×1.25 (best), 2% ×1.13, 3% ×1.00 (the tier-1 safe share), 5% ×0.83, 8% ×0.58, ≥ 12% ×0.25 (computed, `rules.test.ts`). Before a civilization, at ×0.6 or less (≥ ~8%) the tip reads "Very radioactive: life is slow · eat plain rock to thin it". Once it exists the share is a dose and its people dig it out into fuel: [`civilizationgameplay.md`](civilizationgameplay.md) → Energy and dose.
- **One step: LIFE** (user: the six-stage ladder took too long; the doc had soup → intelligent over 480 s): while all four conditions hold, life fills for 30 s at speed 1 ("Life emerging"), then LIFE appears, an intelligent species: Age II ends and the civilization starts. It keeps filling to 45 s, a buffer, so a short spell of bad conditions (0.5 s/s) or an impact winter does not end LIFE at once; frozen seas only pause.
- **Setbacks** by delivered heat: ≥ 20 K −10 s ("Impact winter"), ≥ 150 K wipes life out, it fills again from zero ("Mass extinction"). Never ends the run.
- At the measured typical speed ~0.55 (Planet, metal 9%, water 25%, 0.5 atm, a moon): LIFE ~55 s after the conditions hold (computed).
- The civilization starts at LIFE (toast "Age II complete · An intelligent species looks up at you") unless the world is past Super-Earth on the gas line. Once it exists, a body meets its shield's shell before your ground (held whole, or a share of it stopped as the shield breaks); what gets through hits the people first: [`civilizationgameplay.md`](civilizationgameplay.md) → Shield.
- The life chips, bar and tips on screen: [`hudandcontrols.md`](hudandcontrols.md) → HUD.

### Moons

Code: `core/orbits.ts`, `planet/moons.ts`.

- **Slots:** 1 / 2 / 3 / 4 / 5 at 10^3.5 / 10^4 / 10^4.5 / 10^5 / 10^5.5 (≤ 5). Slot k at R·(2.4 + 1.25k) (user: moons were too close to control, so 3.2 + 1.5k; then compressed with the star system, user 2026-11-14: "same for planet moons, sizes etc": the first moon has 1.4 R of room; then 2026-11-15, user: moons looked too large and overlapped on neighbouring rings, "around 5 moons instead of 7": five slots 1.25 R apart, the fifth at 7.4 R, and moons no wider than `MOON_R` 0.45 R, so two of the widest pass 0.35 R clear at any phase, 0.05 R even stretched 1.33× as rough rocks, body.ts asDebris), spring 0.25 s, rate √(μ/a³). Kinematic, the old game's way (real gravity cannot hold a moon against your thrust). `moons.fit()` widens the camera past ~10^5.5 so the outer slot stays on screen (within the 1.6× cap). Free slots show as faint drifting dashed circles (alpha 0.045 each, all alike; the candidate's ring brightens and closes during a catch while the others dim to 0.025: Capture by match); your HUD card shows a pip per slot.
- **Capture by match** (user, 2026-11-14: "match our planet's velocity with the target's velocity to bring it into orbit … like in old game"; `planet/rules.ts` `catchStep`, `core/orbits.ts` `matchQuality`/`matchStep`). No click and no automatic catch: bring a free body of 0.2–12.5% of you and no wider than 0.45 R (`MOON_SHARE` by mass, `MOON_R` by size: `moonCap` gives the most a body of that make-up may weigh; 12.5% is also `GIANT_HIT`, the giant-impact line; the widest catchable share is ~9% stony / 12.5% metallic / ~3% icy / ~3% gas-rich at 10^4, ~1.7% / 3.4% / 0.6% / 0.5% at 10^7; where the size cap is tight, bodies down to a quarter of it still fit even under 0.2%: coordinator, 2026-11-15) onto the lane round **any free slot** (user, 2026-11-15: "I should be able to place moons in any orbit I choose, as long as they meet the requirements"; the slot is the free ring the body sits nearest, `pickSlot`) (`LANE` ±0.5 R: lanes sit 0.25 R apart, the inner one 1.9–2.9 R clears contact with a 12.5% moon) and match its speed. Inside the window (`MATCH_V` 1 D/s = V_STICK / 8, the old game's ~0.9; or `MATCH_ORBIT` 0.6 × the slot's circular speed if larger, from ~10^7) a ring fills at q = 1 − (v / window)²: `MATCH_S` 1.5 s at a perfect match, 2 s at half the window, ~8 s at 0.9 of it; out of the lane or the window it drains (`MATCH_DRAIN` 0.5 s full to empty: a 0.1 s blip costs 20%). Full: the body is your moon where it is, keeping its sense of travel (`capture`), and springs onto the slot. **Grip**: while the candidate is in the lane of your lowest free ring slower than 2 × the window (or escape speed if larger: `gripWindow`), or in any other ring's lane matched to at least `GRIP_Q` 0.5 (2026-11-15: a wide grip on every ring held slow drifters up across the whole zone: 217 of 400 landed at 10^5.5 instead of 272), `moons.ts` cancels your pull on it (μ/d² · dt outward; `planet.update` runs before `field.update`), so a matched body floats instead of falling on you. One candidate at a time: the one filling (its ring locked while it fills; leaving the lane drains it, then it re-picks), else an in-size body within `APPROACH` 2 R of a free lane, one that would fill now ahead of the rest, then the slowest. At an empty ring a candidate keeps its ring until another free ring is `STAY` 0.15 R nearer (no flicker on the line between two lanes). Candidates: any free body (meteors too) and a rival's rock on its circle (Stealing), not your moons or your star's planets, a rival world or core, a held body (guard moons, great comets), nor one let go < 3 s ago. Leaving the lane or the window, a hit, being eaten or shattered, growing or shrinking out of the size range, the slot filling: the ring drains or the candidate goes. Lucky drift-ins go through the same ring (no separate rule). Known limit: from ~10^6.8 your pull at the innermost slot exceeds your thrust (5.6 vs 2.1 D/s² at 10^7): a hard catch, accepted. A captured body keeps its look: a comet its sprite, coma and tail, a rock pile its rocks (`keepShape`; only a molten past rounds it: [asteroidgameplay.md](asteroidgameplay.md) → Rough bodies). Moons (`Body.moon`) never store with chunks, skip free gravity; yours (and your star's planets) never touch you. A rival's rock on its circle is a moon of another world: it meets your shell (thrown back, or vaporised in part) and your ground like any body (`hitWorld`: a ~3% rock bounces and heats your world by hundreds of K), leaving its circle the moment it touches either (coordinator, 2026-11-15: danger and consistency; your guard's `own`, `planet/stage.ts`). **Break** above √2 × circular speed or when shattered. A moon flown into a rival world meets its shell and ground like a free body: thrown back (knocked loose), or vaporised and shattered. A held moon never exceeds 12.5% of you nor 0.45 R (`moonCap`): what it outgrows rains on you as dust.
  - **Feedback** (no text): every free ring is equally faint (alpha 0.045); with a candidate near, its ring brightens (0.12 + 0.3·q) and closes as it fills (dash share 0.35 → 1) while the other free rings dim to 0.025; on the candidate a faint ring (max(1.5 r, 14 px)) and a bright arc from 12 o'clock sweeping with the progress (cyan; green if it will count as stolen) (no velocity line: user, 2026-11-14). A body too big sitting matched in the lane shows the dashed moon-size ring (the size it may be). Sounds (existing ids): `grip` 0.4 when the grip first bites, `snap` 0.4 when a ring past 30% is lost, `capture` / `steal` with the spark ring on the catch. One calm hint toast the first time a candidate comes near ("Catch a moon"). A beaten rival world mined down to ≤ 12.5% is a free body, caught the same way.
  - **Playing it**: keyboard: fly to it, brake so it sits on the lit ring, feather until the arc starts filling, hold 1.5 s (one 60 fps frame of thrust is 0.12 D/s at Age II start). Touch (`player.ts`, `moons.frame()`): near the lane with a candidate already within 4 D/s of you, the stick's wanted velocity is measured from the candidate's, so centring the stick matches it instead of braking to rest.
- **Stealing** (the old game's rule: a body that left one parent and gained another within 30 s is stolen): a catch is a theft if the body orbited another host when its ring started filling (`hostOf`: bound to a ≥ 4× body within 8 of its radii, moving ≥ 0.5 × circular round it; judged once per candidate) or another host let it go within 30 s (`markFreed`: a rival's rock dropped). Theft: green arc, green sparks, "stolen" popup, green-tinted trail, toast on the first. A rival's rock still on its circle can be stolen mid-fight, no defeat needed (user, 2026-11-15: "I should be able to steal it during combat if I manage to match their speed"): fly beside it so it sits on one of your free rings and match it until the ring closes (a theft: it orbits a ≥ 4× host). No grip on it (its world re-places it each frame); you have to keep matching it with your thrust, since it curves out of the lane within a second if you coast (`capture.test.ts` 8a: matched beside it, every ring closes in ~1.5 s up to 10^6.5). Taken, it leaves the rival (`rivals.ts` drops a rock you own; a new one grows after 30 s, so thefts repeat: coordinator, 2026-11-15). The rock turns against its world's orbit round you (−turn), so a player sitting still on station never matches it by luck (8b: the ring never starts in 270 still runs, the test bound is 0.3; with the old sense 70 of 270 were caught). Above ~10^6.75 the rock of a heavy rival is too wide to hold (the dashed size gauge; from 10^7 only a ×0.5 rival's still fits, none at 10^7.5). Flying into it still hits you: it lands or meets your shell, then is a free body. Rivals no longer tether your moons (they still threaten them physically: slugs chip them). The lasso, tether, tug of war, the click-on-a-body capture and the rival tether were removed 2026-11-14. Achievements "Moon thief" (first) and "Master thief" (10 in a run).
- **Measured** (Node model, `test/planet/capture.test.ts`: `catchStep` + `entity.step`, real constants): a naive pilot from 30 D away catches a 2% body drifting at 0.5 D/s in 6.9–7.0 s at 10^3.5, 9.9–10.1 s at 10^5.5, 11.2–11.3 s at 10^6.5, within 0.04 s across 30/60/144 fps; fly-bys at 3 and 20 D/s never start the ring; 0.1% and 20% bodies held matched 10 s are never caught, 0.2% and 12.5% close in 1.5 s ± a frame (a 2% body on the outer slot at 10^5.5 too); a body dropped from 8 R at 10^6.5 falls through the inner lane uncaught; parked with no input, belt bodies (0.5 D/s flow, 0.07–0.26 D/s scatter) entering the inner lane were caught 0% at 10^3.5 / 10^5.5 / 10^6.5 (59 / 73 / 92% landed on you); with every lane free (any ring catches, 2026-11-15) 0 / 1.5 / 0%, and about as many land as with the inner lane alone (of 400 sent, seed 7: 187 / 272 / 369 inner, 187 / 256 / 369 all lanes; the old wide grip on every ring let only 217 / 283 land at 10^5.5 / 10^6.5; on 1.25 R rings the outer lanes sit farther out where drifters are slower: seeds 1–5 at 10^4.5–10^5.5 catch 1.3–4.5% and land 1–4% fewer than inner-only, against 0–2.3% and ≤ ~1% on the old 1 R rings); a pilot putting the body on the outer ring (7.4 R) catches it in 7.0 / 9.5–9.7 / 10.8–11.0 s (10^3.5 has one ring).
- **A moon orbits** its slot: that is the guarding, whatever crosses its path hits it (no guard mode, no running to meet threats: user, 2026-11-14). No roles, no Sling (user, 2026-11-14: it made combat too easy; early survival should come from life, civilization and its military). No moon makes energy: the Collector role was removed (Q6), and star energy comes from the Dyson sphere ([`stargameplay.md`](stargameplay.md)).
  - Every moon you hold is also mined by the civilization and used up: [`civilizationgameplay.md`](civilizationgameplay.md) → Miners on moons; free bodies and debris near you are mined without capture (Roaming miners and the mining link).
- **Select and grind** (user, 2026-11-14): a right-click / E tap on a moon selects it: the top-right target panel shows that moon (name, × ratio, composition, "Moon · name", edge in the moons' blue) instead of the nearest body. The selection clears on a Command elsewhere or when the moon is lost (`moons.inspect()`). Holding Command on a moon grinds it down gradually (the body under the pointer decides: a hold on a free body does nothing): `FEED` 0.015 of your mass a second streams onto you as dust (no hit, no heat, like burning up in the air; a 12.5% moon takes ~8 s), a thin grain stream flows moon → world with dust puffs at the cut; letting go keeps what is left; the last crumbs come down at once and the moon is gone ("Moon ground down"). The old shrink-to-contact eat (~36 K, an impact winter) is gone.
- **Controls** (Command: a tap selects a moon or sets the fleet priority on any other body or ship, a hold grinds a moon down; Fire is the mass driver's): [`hudandcontrols.md`](hudandcontrols.md) → Controls. Priority target: [`civilizationgameplay.md`](civilizationgameplay.md) → Priority target.
- Measured: 0.08 ms with 4 moons (before the capture rework).

### Planetary survival (concept 6, what exists today)

What keeps a living world alive now, collected from the rules above and the civilization's:

| Threat | What protects the world | Where |
|---|---|---|
| Fast small bodies | burn-up in your air (s_b grows with pressure) | Burn-up |
| Impacts (Age II) | every hit heats the world by asteroid/rules.ts `worldHeat` (+90 K at 1%, +1000 K at 5%, +4000 K at 12.5%, ×(v/v_stick)²); only bodies under 1% burn up; a body ≥ 12.5% merges and melts the world; while molten everything merges as in Age I; on a solid world smaller ones bounce and shatter; big heat cools over minutes | [asteroidgameplay.md](asteroidgameplay.md) → differences table |
| Medium hits | Moons in the path (orbiting moons block what crosses them); from LIFE the shield, a shell before your ground (paid from energy first; each level holds 2.5% of you at the stick speed, and a breaking shield still stops its share), fighters that break bodies ≤ 2% of you you cannot take safely into pieces your air burns up, and push heavier ones, rockets from tier 1 and, from tier 3, a frigate whose heavy lasers break 2–25% bodies the same way; probes break only ≤ 0.5% | Moons; [`civilizationgameplay.md`](civilizationgameplay.md) → Shield, Defence ships (fighters), Frigate |
| Bombardment | settling: B falls to 0.15 after a few minutes under 2 own D/s; voids are quiet | Calm |
| Hits that get through | ≥ 20 K −10 s of life, ≥ 150 K wipes life; never ends the run | Life |
| Losing a condition | life drains 0.5 s/s (frozen seas only pause); the 45 s buffer covers short spells | Life |
| Gas | the sticky gas line; past Super-Earth a gas world has no surface for life | World tiers and the gas line |
| Pirates (from LIFE, rare) | shield, then stock; with both gone each hit knocks 0.02% of you off as a water or air piece, ≤ 2% of your water + air a raid; never a world kill | [`gameevents.md`](gameevents.md) → Pirates |
| Losing your world after star control | a living colony: you carry on as that world (Q3, smallest version) | [`stargameplay.md`](stargameplay.md#colonies-and-terraforming-l) |

Losing LIFE hurts [F]: the civilization sleeps, people fall 1/min, nothing is mined or built and the shield goes out,
unless a colony keeps it awake: [`civilizationgameplay.md`](civilizationgameplay.md) → Start.

- **Destabilized planets** [L] (concept 5: "Excessive or unsuitable resource accumulation can destabilize planets"): the
  gas-line rule is the trigger for system planets and colonies: gas ≥ 20% at ≥ 10^5 → a gas world that leaves its ring
  (a colony is lost with it). Your home world keeps the sticky gas line, the Brown dwarf ending and "growth never stops
  play". Colonies and terraforming (20 volatiles = +0.1 atm or +2% water):
  [`stargameplay.md`](stargameplay.md#colonies-and-terraforming-l).

## Planned

Concept 6's survival loop ("balance resource collection, defending planets that support life, maintaining environmental
stability, and expanding") is now carried by built systems: shield upkeep and lost habitability [F], the mining AI [E],
[G], colonies [L], and the capped pirate chip [B]. Nothing new is planned for Age II itself:

- A gas world becoming a brown dwarf (concept 5) is not in any package.

## Open issues

- **Q3 What ends a run after star control** (decided, mostly built): a lost star can be replaced by linking another, and a living colony carries the run on; the carry-on is the smallest version (star, Dyson, moons, stock and people are lost) ([`stargameplay.md`](stargameplay.md)). Affects how harsh planetary survival can be.
- Orbiting moons only block bodies that happen to cross their path.
- **Debug LIFE route collapses** (playtest): after debug LIFE the air rains out and the civilization falls asleep within 15–35 s.
- Age II items tracked in [`vision.md`](vision.md) → Open issues: parked worlds swallowed by rivals or a drifting 2.8× body; infall growth (a parked world grew 50k → 250k in 10 min and stayed near boiling); durability's m^0.2 to revisit for Age II; pacing and life sims not re-run after the web, burn-up and calm changes; not built: steam venting below 1000 mass, banded gas giants (a Brown dwarf draws as a cratered rock), gas stripping and impact moons, wider voids in Age II.

## Decisions

Standing decisions for every stage are in [`README.md`](README.md). The ones that shape Age II, oldest first (dates where the source has one):

- **Growth never stops play** (user): no "keep going" card; one body, one run; after Age I a death offers "Continue as a planetoid".
- **Moons sit well clear of you** (user): slot k at R·(2.4 + 1.25k), at most 5, moons no wider than 0.45 R so neighbours never touch (compressed with the star system 2026-11-14; 1.25 R and 5 slots 2026-11-15), free slots visible but faint; moons are caught by matching speed on any free ring (no lasso, no inside-out order: user, 2026-11-15), and a lost moon is won back the same way or stolen (the old game's theft rule).
- **Burn-ups still warm a little** (user): a quarter of the heat (BURN_HEAT).
- **One life step: LIFE** (user, 2026-11-13: the six-stage ladder took too long; the doc had soup → intelligent over 480 s). Setbacks are now −10 s and a wipe at ≥ 150 K; Pass 1's −60 s / one stage / three stages went with the ladder.
- **Moon gifts and passive moon effects removed** (user, 2026-11-13: "remove moon effects too, radioactive moon gives energy etc"; miners use every moon instead); the Collector role went later with Q6.

### Decided 2026-11-13 (open decisions Q1–Q7)

- **Q1, orbits round your star** (user, 2026-11-13): "As with moons, this should happen automatically. All habitable planets must be within the habitable zone. Uninhabitable or lifeless planets, such as resource-poor dwarf planets, can exist inside or outside this zone. Planets undergoing terraforming will automatically be moved into the habitable zone." No orbit control: living and terraforming planets ease into the liquid band by themselves; lifeless ones keep any ring.
- **Q3, what ends a run after star control** (user, 2026-11-13): "Star maybe can die but our game over should be last living planet. maybe i collide to other star wrongly, but if there is life, i can found another star." Game over = your last living planet is lost; a star can be lost (a bad star collision) and, while life remains, you can link to another star.
- **Q6, Collector moon role** (user, 2026-11-13): remove it, the last passive moon effect. Moons are Orbit (guarding by being there), Sling and ore for miners; star energy comes from the link and the Dyson sphere. (The Sling went 2026-11-14.)
