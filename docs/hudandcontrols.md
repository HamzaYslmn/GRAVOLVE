# HUD and controls

How you steer and act (Fire / Command), what the HUD shows in each stage, debug mode, hints and toasts, the game-over
card, achievements, records and settings. Code: `core/input.ts`, `ui/` (reticle, toast, game over, achievements,
settings, debug, minimap), the stage HUDs `evolution/asteroid/hud.ts`, `evolution/planet/hud.ts`,
`evolution/civilization/hud.ts`, `evolution/star/hud.ts`, and `core/achievements.ts`. The HUD is DOM over the canvas;
each UI module imports its own CSS, sharing the `.ui-panel` look and `--ui-*` tokens from `styles/base.css`.

## Built

### Controls

`core/input.ts`, `ui/reticle.ts`.

| Verb | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows (raw thrust) | joystick (deadzone 0.12): sets the velocity you want (top speed × tilt², thrust closes the gap over 0.35 s, braking off drift); a still finger at the centre brakes to a stop (near a moon candidate already within 4 D/s of you: to its speed, the touch assist, `moons.frame()`), a lifted finger coasts (`core/entity.ts` `stickThrust`; user 2026-11-14: mobile control too hard) |
| **Fire** | left mouse (at the cursor); Space (at the HUD target) | a tap (shorter than 0.25 s, never left the deadzone); a second finger |
| **Command** | right mouse on a moon or body (no context menu over the game); E (the moon nearest the cursor) | a 0.5 s long press |
| Hold (a Command kept down 0.4 s) | right mouse or E held | long press held |

- **Fire** is the mass driver (nothing before LIFE; [civilizationgameplay.md](civilizationgameplay.md#mass-driver)); from Dyson 20% the energy beam replaces the slug (no ore, 3 s cooldown on the reticle ring; like a gun, every shot bites a share of your mass off what it hits, more with a bigger star and more cover, until the body shatters; a rival world's shield soaks it first), and below 0.3 suns Fire sends slugs again ([stargameplay.md](stargameplay.md#energy-beam-k)). A click that cannot fire notes "No ore" or "Charging" at the reticle. Space fires at the HUD target, the heaviest body on screen within ±30° of your heading ([asteroidgameplay.md](asteroidgameplay.md) → Age I play).
- **Command** (user, 2026-11-14), decided by the body under the pointer (E off the canvas: the HUD target). A tap on anything but you and your moons (a body, a rival world, an enemy ship or missile; a ship under the tap first) makes it your priority target (user, 2026-11-15): nothing fires at once; each weapon takes it first as it comes ready and can hurt and reach it (the same target again clears it, another replaces it; on a fighting rival world it brings the siege on). A small muted note over the target says how it stands: "Priority set", "Reloading · 2 s", "Ships busy", "Not enough ore", "Out of range", "No fighters", "Nothing can hurt it", "No life · fleet idle", "Already beaten" (a fizzle), "Priority cleared", before LIFE "No fleet yet"; a cyan glow under the cursor shows what a tap would take ([civilizationgameplay.md](civilizationgameplay.md) → Priority target). A tap on a moon selects it (the target panel shows it). A hold on a moon grinds it down gradually, 1.5% of you a second as dust, no heat ([planetgameplay.md](planetgameplay.md#moons)); a hold on anything else does nothing. Moons are caught by flying, never by a click: match a small body's speed on your free ring ([planetgameplay.md](planetgameplay.md#moons) → Capture by match). On touch a Command is a long press (0.5 s still), a hold that press kept 0.4 s more.
- **Reticle:** a soft reticle with a cooldown ring replaces the cursor while you hold a weapon (the mass driver or the beam); full ring = ready. No aim line, numbers or mode switch; only one shows at a time.
- After Age I a death offers "Continue as a planetoid" (Enter / Space / C) or "New run" (R); before that, "Play again" (Enter / Space / R) ([asteroidgameplay.md](asteroidgameplay.md) → respawn).

### HUD

Refactored 2026-11-14 (user: the corner cards took too much room and did not work on mobile, and it was hard to
tell which enemy the target card meant). Two cards and a marker, built around what each stage needs; the cards update
~12 times a second (`PERIOD` 1/12 s), the marker every frame. Icons first, each with a short visible caption
(2026-11-14, user: "something in the bottom-left corner that I can't see properly"; the cards take no pointer input, so
hover titles never showed). One visual rule for every scale:
the needle is you, the band is where life wants it, the value is green inside (amber weak, red missing).

| Where | What |
|---|---|
| Your card, bottom left (`.me`, cyan, 256 px; redesigned 2026-11-15, user: "simplify, minimize and put all useful info") | Everything about your own body, in one card. **Head:** age chip (Age I / II / III), tier in 13 px (never cut off: wraps to a second line past ~130 px), mass (100k, 21.3M). **Goal bar:** the stage's one goal with its label: Age I the next tier ("→ Medium asteroid · ~4 meals"); Age II life ("Life emerging 40%", striped while stalled) or, on the gas line, the brown dwarf; with a living civilization its tier (T2/6); a civilization that lost life: "No life · dying out" with the life %, the bar red (striped red while life cannot regrow); near or owning a star the link, then the Dyson sphere with its energy. The moon pips sit on the label, right of the goal (hollow = free, filled in the moons' blue; Age II+). **Readout cells** (every stage row): icon · 9 px caption · 12 px value on one line, the track full width under them. **Speed**, one line: icon · caption · log gauge (x = ln(1+v/8)/ln(33): eat zone ~20%, rough, bounce; red against a heavier target) · value; a second needle in the verdict colour is the predicted impact speed. **Composition:** one 12 px stacked bar labelled inside like a phone's storage bar (user 2026-11-15: "write inside the bar, icons etc"): each segment shows icon · name · share, icon · share, or the icon as its width allows (`ui/panel.ts` `fit`); every element from 1% keeps its icon, Rad from 0.5% its share too. No legend row. **Stage rows**, see below. **Tip:** one line marked ›: in Age I the tags earned and the closest one not earned yet ("Water-rich in ~3 meals"), from Age II what limits life most; hidden when nothing is wrong. Legend, label, sub lines and tip 12 px |
| Target card, top right under the gear (`.target`) | The body you are heading for (the heaviest on screen within ±30° of your heading) or the moon you selected. Head: a square in the verdict colour, the rival's name (violet) or the size class, × your mass; one line of what it is ("Medium asteroid · Stony rival", "Orbit moon · …"); from Age II a **Moon-size** chip, lit (orbit-moon blue) when the body passes the catch's size gate (`planet/moons.ts` `sizeOk`: from min(0.2% of you, ¼ cap) to 1.01 × `planet/rules.ts` `moonCap`, which is 12.5% of you and no wider than 0.45 of your radius) and neither held nor a rival, dim otherwise, hidden for a selected moon; its composition as the same labelled bar. A rival world adds its three life chips and life stage. Without a body target near a star: the star (name, M☉, K) and "Link 40%". **Composition only** (user): no density, hardness, durability or change line |
| Marker, on the target body | The cards' two corner brackets around the target itself, in the same verdict colour (a moon: its blue), so card and body read as one; a named rival gets its name above in violet. It names which body the card means and adds no warning: the danger stays the well's colour |

Stage rows in your card:

| Stage | Rows |
|---|---|
| Age I | Temp (bar + K), Water (Ice / Liquid / Steam) and Air (atm, "at 1.0k" once it is near), each only once there is something to tell |
| Age II (`planet/hud.ts`) | four cells: Temp (°C, log, band = liquid water at your pressure, hatched when the air is too thin), Air (atm, log 0.01–30, band 0.7–10), Water (share, band 30–60%), Field (Strong / Weak / None); "Next: tier · ×mass" and the gas-line warning. With a living civilization the four shrink to one line (icon + value, coloured green / amber / red) and "Next:" hides; when life is lost they expand back to full scales |
| Civilization (`civilization/hud.ts`, compact rewrite 2026-11-15) | Four rows (captions only on Energy and Fuel): **vitals** (three equal columns: icon and value over a full-width track) People "6.4B▲" (fill = population / capacity; red ▼ while life is lost), "Rad 0.8" (scale 0–3, band = safe ≤ 1; player text says Rad, never Radiation), Shield "Lv3 69%" (Lv = shield level; fill = charge, "down" in red; in the lattice's colour: cyan, amber at 40%, red from 15%); **energy** one bar (user 2026-11-15: "why 3 same fuel bars, one is enough, more unified"): the sources Geothermal · Sun · Dyson · Fuel labelled inside like the composition bar (icons, E/s), a hollow end of unused reactor capacity, a white tick at what the people use and red past supply, on one scale (max of supply and use); under it a 3 px strip of the uses (people, shield, yard, mend, rockets; colours only); "+made" over "−used" at the right; **fuel** one line of text, no bar: "42 · 14m · −0.9 +0.3/min" (amber under FUEL_RESERVE, red while the reactors dim): time left = spare / averaged burn (none while nothing burns), then burn and inflow averaged over 45 s (`slots.ts` `flow`, each only while it moves); **fleet pips** (`slots.ts` `pips`): per class an icon, one pip per ship filled by its own reload, faint hollow pips up to the cap; the rocket rack pip plus "×n" (what the ore buys); the missile silo's salvo pips, dim while ore is short; a class with neither cap nor pips hides; with a priority set a class that takes it gets a cyan edge, one that cannot dims (orders.ts `by`); **yard** at the fleet row's right end (wraps to its own line when the row is full): what is building (or the first wanted job), progress, cost / stock "20/208 ore · 10/30 vol" (amber while it waits for ore); "Ore 984 · Vol 735" while idle; `stage.ts` gives `power`, `burn`, `spare` and `yard` in its state. The mass driver stays on the reticle. Landscape phones (≤ 500 px tall): your card takes two columns, the civilization in the second |
| Star (`star/hud.ts`, card gets `data-star`) | the star in its colour (name, M☉, K); two cells: **Orbit** ("Distance" before the link; scale 0–8 R★, band = where seas stay liquid, needle = you, "3.2 R★" green inside, amber outside, red when no band) and **Planets** (owned only: fill = carried / cap, "2/4 · 1 col") [I], [L]; a why line for the Dyson, the colony fleet and the beam [K]. No engine row: from the link your thrust steers the star |

**Always open, scaled on phones** (user, 2026-11-14: "show always expanded, but in phone dpi, need resizing"; an
earlier tap-to-fold was removed). Phones keep the same cards and scale them from their corner with `transform: scale`:
0.72 up to 640 px wide, 0.6 up to 500 px tall (transform works in every browser; `zoom` would also scale offsets).
Your card, measured 2026-11-15 (256 px card, `getBoundingClientRect`, debug jumps):

| Stage | 1280×720 | 375×812 | 814×376 |
|---|---|---|---|
| Age I (Water cell shown) | 256×175 | 184×124 | 154×103 |
| Age II (debug Planet) | 256×231 | 184×163 | 154×136 |
| Civilization (debug Life) | 256×273 (was 279) | 218×232 at scale 0.85 (was 184×202 at 0.72) | 400×141, two columns at 0.8 (was 154×168 at 0.6) |
| Civilization, life lost | 256×320 | 184×231 | 154×192 |
| Star owned + civilization (debug Star) | 256×379 | 184×274 | 154×228 |

The Civilization (debug Life) row was re-measured after the compact rewrite (2026-11-15); the life-lost and star rows predate it.

The cards take no pointer input, so a touch on them still steers. The bottom right is free (the debug biome map sits there).

Removed in the refactor as redundant: the top-left tier and World panels (merged into your card), the bottom-centre
speed card (into your card), the bottom-right status panel (Age I rows), the biome name on the speed card (the arrival
toast names it), the "needle in band = good" captions, the tags' trade notes, the life-needs chips (the cells say the
same), the duplicate stage line and its bar, and the 70% phone `zoom`. In the 2026-11-15 redesign: the dead hover titles
(the HUD takes no pointer input), the star's distance and planets sentences (now two cells), and "asleep" (now "No life
· dying out" on the goal).

### Hints and toasts

- **Hints** (`gravolve.hints`, each once, each tied to something on screen): first "WASD / arrows · Drag on touch · no drag in space: you keep your speed, push against it to brake"; after 2 fast bounces "Too fast to eat · Thrust against your motion · below 8 diam/s rocks stick" and a red needle flash.
- **Toasts:** one queue (`ui/toast.ts`), 3 pending, 3.2 s each: `toast(title, sub, keep)`. When more than 3 wait, the oldest routine toast drops; milestones (`keep`: Age I complete, and the planet stage's `age2`, `civ`, `needsun`, `starlink`, `age3`, `type2`) never drop. Biome names, stage news, miner news ("Miners bring water / air / iron", "Miners roam", "Mining link"), fleet news ("Fighters break it up", "Frigate", "Frigate strike"), impacts ("Impact · N% of the people died", no verdict clause), rival news ("… is gone", "… 's life set back", "Maru's civilization", "Their fleet is gone"), pirate news ("Pirate fleet" once a fleet is on screen, "Pirate fleet destroyed", "Loot recovered"), star news ("Your people need a sun" at contact, "Linking", "Star linked · … your thrust steers it …", "A planet joins your star", "Energy beam", "Colony fleet", "Colony", "Star lost", "A star swallowed", "Your colony carries on", "Age III complete" at Dyson 50%, "Type II civilization") and achievements all use it. Achievement toasts only when no other banner waits. Toasts never warn about something off screen. Playtest: 11 toasts queued back to back at the Age I → II handover; `keep` was added for that.

### Game over

`ui/gameover.ts`: what hit you and how fast, the rule behind that death said once on the card (never in the target panel), Age I
progress, a few numbers (time, peak, meals), bests and this run's achievements. The four lessons: eaten (a red aura
means it outweighs you), destroyed (too fast: below 8 diam/s you merge, up to 24 you keep part, faster both sides
break), crumbled (every hard bounce chips you), star (the Roche limit at ~1.3–1.6 star radii; link from 2–4).

### Debug mode

Settings "Debug mode" (`gravolve.debug`, off by default):
- **Biome map** (`ui/minimap.ts`): 56² samples of `field.biomeAt` over 24 of your views, 4 rows a frame; your dot and view frame.
- **Debug buttons** (`ui/debug.ts`: panel, actions and the stage-jump `step`, reading the game through main.ts getters; user, 2026-11-14: "simplify debug, easy to use"): a small DBG button left of the settings gear opens a dropdown (closes on a click elsewhere; closed it covers nothing; user: "debug window conflicts with others"), buttons in three rows (Jump / Boost / Star); a button greys out with the reason on hover while it can't run (polled twice a second). Jumps run their steps over the next frames (stop after 20 s): **Planet** (a habitable Super-Earth, held at 300 K through the Age II melt), **Life** (that, then LIFE: the civilization starts), **Star** (that, then star contact and an instant link; measured: from a fresh Age I run to a linked star in 4 frames, life still growing and the civilization awake 15 s later). Helpers: **Grow ×3**, **Dyson +30%** (3 segments), **Star type** (your star cycles red dwarf → sun-like → blue giant, via `star/stage.ts` `debug`), **Add planet** (a 10^3.6–10^4.6 metal-rich world at rest 0.5 R★ into your star's catch zone, caught within a tick), **Ore +500** (+200 volatiles). Labels are short (Dyson, Type, +Planet, +Ore); the star helpers need a linked star, +Ore a civilization.
- A transformed run is `run.debug`: no achievements, no fastest-age or peak records ("this run saves no records" toast).

### Achievements

`core/achievements.ts`: a pure list `{id, name, hint, group, secret?, test(snap)}`; `ui/achievements.ts` draws them and `main.ts` feeds them.
`main.ts` builds a snapshot twice a second from existing state (your body, the run, the planet stage's `WorldState`
with `civ` and `star`, its news keys, `field.webHere()`) and reports moments the snapshot cannot see (meal, shatter, a
heavier body broken, setback, Age I, respawn, death cause). Each unlocks once, ever.

**Shown without alerts.** A toast only after the fact, on first unlock, and only when no other banner waits. A gallery
of tiles: a row on the game-over card (this run's new ones lit) and the full grid behind a settings button. Locked
tiles show name and hint; secrets show "?".

39 achievements in five groups (checked, `core/achievements.ts:60–102`):

| Group | Name | Unlock condition |
|---|---|---|
| Milestone (11) | First bite | first meal eaten whole |
| | Planetesimal | mass ≥ `AGE_GOAL` (10^3.5) |
| | Planet | mass ≥ 10^4.5 |
| | First rain | liquid water and water share ≥ 1% |
| | Moonrise | a moon |
| | Spark | life begins to stir (the four conditions hold) |
| | They look up | LIFE |
| | Bound to a sun | star link complete |
| | Half a sphere | Dyson ≥ 50% (Age III complete) |
| | Type II | Dyson 100% |
| | Failed star | gas line and mass ≥ 10^7 (Brown dwarf) |
| Mastery (12) | Sprinter | Age I within 70 s |
| | Untouched | Age I with no hit that shattered you |
| | Giant killer | a heavier body destroyed by your hit, and you live |
| | Eden | life speed ≥ 0.9 for 60 s in a row |
| | Unbroken chain | LIFE with no setback since it began to fill |
| | Full house | 4 moon slots, all filled |
| | Fast thinker | LIFE within 15 min of the run |
| | Duelist | a rival world beaten |
| | Bounty | a pirate fleet destroyed |
| | Moon thief | catch a moon another host just lost |
| | Master thief | steal 10 moons in one run |
| | Sun tamer | own a star of ≥ 4 suns |
| Discovery (7) | Comet catcher | eat a comet |
| | Green glow | eat a body ≥ 20% radioactive (a green rock is 25%; user, 2026-11-14: was 50%, which no rock reached) |
| | Into the dark | 30 s in a row in a void |
| | In a giant's shadow | 5 s within 3 of its radii of a body ≥ 20× you, alive |
| | Four elements | rock, metal, water and gas each ≥ 10% at once |
| | Iron heart | magnetic field ≥ 0.9 |
| | Stargazer | 3 star types seen as the nearest star in one run |
| Style (5) | Comet life | 60 s as a comet in one run |
| | Slingshot | speed ≥ 100 own diameters/s |
| | Pacifist | own a star without beating a rival |
| | Iron world | Age I complete with metal ≥ 40% |
| | Water world | Age I complete with water ≥ 40% |
| Secret (4) | Icarus | fall into a star |
| | Swallowed whole | eaten by a body ≥ 20× your mass |
| | Phoenix | LIFE in a run that used "Continue as a planetoid" |
| | Life under the ice | life on a world with frozen seas for 60 s |

Pattern from the old game: a milestone plus one self-imposed constraint costs a boolean or two
(`analysis/SOLAR/07-missions-and-meta.md`).

### Records and settings

- `localStorage` (every access in try/catch; blocked storage keeps unlocks for the session and drops bests):
  - `gravolve.ach`: `{id: time}`, merged across tabs before every save, so a save never drops another tab's unlocks.
  - `gravolve.best`: peak mass and the fastest Age I / II / III (run seconds), saved the moment an age completes; shown on the game-over card.
  - `gravolve.hints`: the hints already shown.
  - Settings `gravolve.*`: FPS cap (VSync, 30, 60, 120, 240, Unlimited (benchmark)), show FPS (off by default), sound, debug mode, volume (default 20%).
- Settings: a gear button opening a small panel with those choices, the achievements gallery button and a collapsible "How to play" (controls, eating, the goal, a fun fact: metal rocks are about twice as sturdy as stone).

Also built in waves 2–4: the mining reach as a faint gold gauge, a thin line with inward ticks (the moon slots are broken cyan circles) [G]; the grain line of a mining link was deleted 2026-11-14, the only stream left is the manual moon grind
([civilizationgameplay.md](civilizationgameplay.md#roaming-miners-and-the-mining-link-g)); no priority UI. Q3: with a
living colony your world's death shows no card, the run carries on there ("Your colony carries on"); without one the
game-over card shows once, as before.

## Planned

- **Events director:** names an event in a toast on its first sighting per run, after it is visible, never as a warning (events plan decision 9, [gameevents.md](gameevents.md)).
- **Suspend and resume** a run (roadmap item 4, [vision.md](vision.md#roadmap)): today only bests, achievements, hints and settings persist.

## Open issues

- Touch was checked with synthetic events only, never on a device.
- Test tabs share `localStorage` with the player: don't pollute `gravolve.best`, `gravolve.ach`, `gravolve.hints` ([techandperformance.md](techandperformance.md#testing)).
- **Debug LIFE route collapses** (playtest): after the debug LIFE transform the air rains out and the civilization sleeps within 15–35 s ([planetgameplay.md](planetgameplay.md#open-issues)).

## Decisions

- **Danger is seen, never told** (user): no off-screen arrows or alerts (tried and removed), no verdict text (only the well colour and the target panel edge), no meteor warnings. Toasts name what is already visible.
- **Target panel: composition only** (user): no density / hardness / durability, no change line.
- **Icons first** in the HUD (user), each readout with a short visible caption (2026-11-14: hover titles never show, the cards take no pointer input); no Seas chip (user).
- **One card for your own body** (user, 2026-11-14): bottom left, always open, scaled down on phones; the target card and the marker on the body share one colour.
- **Watch and feed** (user): no build menu, no priority toggle.
- Achievements and hints never interrupt: toast only when no other banner waits; the gallery lives on the game-over card and in settings.
