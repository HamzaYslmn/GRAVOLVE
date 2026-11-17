# HUD and controls

How you steer and act (Fire / Command), what the HUD shows, hints and toasts, the game-over card and score, debug mode,
achievements, records, settings and YouTube Playables. Code: `core/input.ts`, `core/score.ts`, `core/achievements.ts`,
`ui/` (reticle, toast, gameover, achievements, settings, debug, minimap, `panel.ts`, `rows.ts`, `tip.ts`, `pick.ts`,
`hud.css`), the stage HUDs `evolution/asteroid/hud.ts`, `planet/hud.ts`, `civilization/hud.ts` (+ `civilization/slots.ts`),
`star/hud.ts`. The HUD
is DOM over the canvas; each UI module imports its own CSS and shares the `.ui-panel` look and `--ui-*` tokens of
`styles/base.css`.

## Built

### Controls

`core/input.ts`, `ui/reticle.ts`.

| Verb | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows (raw thrust) | joystick (deadzone 0.12): sets the velocity you want, top speed × tilt², thrust closing the gap over 0.35 s (`core/entity.ts` `stickThrust`); a still finger at the centre brakes, a lifted finger coasts |
| **Fire** | left mouse (at the cursor); Space (at the HUD target) | a tap (< 0.25 s, never left the deadzone); a quick second finger |
| **Command** | right mouse on a body (no context menu over the game); E (at the cursor) | a 0.5 s long press |
| Hold | Command kept down 0.4 s | long press kept 0.4 s more |
| Zoom | mouse wheel, 0.25–3× (`core/camera.ts`) | two-finger pinch (sent to the camera as a wheel event; steering pauses) |
| HUD section | left click on a section header of your card: opens or folds it, never Fire (a right press there does nothing) | a tap on the header (a drag from it still steers) |
| Restart | game-over card: Enter / Space / R; after Age I, Enter / Space / C continues as a planetoid, R starts a new run | the card's buttons |

- **Fire** is the mass driver from LIFE (civilizationgameplay.md → Mass driver); from Dyson 20% the energy beam (stargameplay.md → Energy beam [K]). A click that cannot fire notes "No ore" or "Charging" at the reticle. Space aims at the HUD target: the heaviest body on screen within ±30° of your heading.
- **Command** on any body but you and your moons, a rival world or an enemy ship sets your priority target; the same target clears it, another replaces it; it fires nothing by itself (civilizationgameplay.md → Priority target). Command on a moon selects it; a hold on a moon grinds it, 1.5% of your mass a second as dust, no heat. Moons are caught by flying, never by a click (planetgameplay.md → Moons).
- **Priority notes** (`civilization/orders.ts`), a small muted note over the target: "Priority set", "Rockets chip it", "Reloading · N s", "Ships busy", "Not enough ore", "Shield down · fleet holds", "Out of range", "No fighters", "Nothing can hurt it", "No life · fleet idle", "Already beaten", "Priority cleared"; before LIFE "No fleet yet" (`planet/moons.ts`).
- **Reticle:** while you hold a weapon, a soft reticle with a cooldown ring replaces the cursor; full ring = ready. No aim line, no numbers. Over a HUD card the OS cursor comes back (a pointer over a section header).

### HUD

Two cards, a marker and one tooltip, plain DOM over the canvas. `evolution/asteroid/hud.ts` builds the cards; each stage
adds its section (`planet/hud.ts`, `civilization/hud.ts`, `star/hud.ts`). The markup builders (row, cell, section header,
icons, the tooltip text registry) live in `ui/rows.ts` and the shared CSS in `ui/hud.css`. Cards update 12 times a second
(`ui/panel.ts` `PERIOD`), the marker every frame. `#game-hud` stays `pointer-events: none`, so a press on a card steers or
fires like anywhere else; the one exception is a section header (Opening and folding, below). Icons come first, each row
with its label. One rule for every scale: the needle is you, the band is where life wants it, and the value is green inside
(amber weak, red missing).

| Where | What |
|---|---|
| Your card, bottom left (cyan; 320 px wide, 340 from 1000 px tall) | The head, then one section per stage that exists, then the tip (table below) |
| Target card, top right under the gear (224 px, composition bar 200 px) | The body you are heading for, or the moon you selected. A square in the verdict colour, the rival's name (violet) or size class, × your mass, one line ("Medium asteroid · Stony rival", `Moon · <rock name>`). From Age II a **Moon-size** chip, lit when the body passes the catch's size gate (`planet/moons.ts` `sizeOk`). Its composition bar. A rival world adds its life chips. Near a star with no body target: the star and its link %. **Composition only** |
| Marker, on the target body | The cards' corner brackets around the target, in the verdict colour (a moon: its blue); a named rival's name above in violet. It names the body; it warns of nothing |
| Tooltip | One glass panel beside the hovered card (Tooltips, below) |

**Your card.** Each section is a header (16 px icon, caption, chevron, a live one-line summary at the right) and a body the
header opens or folds:

| Section | Header summary | Shown even when folded (desktop) | Body |
|---|---|---|---|
| Head (always shown) | | Age chip (Age I / II / III), tier, mass. **Goal bar** and its label: Age I the next tier ("→ Medium asteroid · ~4 meals"); Age II life %, on the gas line the brown dwarf; with a civilization "Civilization · T2/6"; life lost "No life · dying out" (red); near or owning a star the link, then the Dyson ("62% · 4.1 E/s") | |
| World | Temperature · air (and water or field when that is the worst condition) · "Moons 2/4"; the worst condition coloured while under good; a gas world only its moons | | **Speed:** a log gauge (eat, rough and bounce zones) with a second needle for the predicted impact speed. **Composition:** one stacked bar labelled inside: every element from 0.5% keeps icon · share, the biggest also get their name while there is room (`ui/panel.ts` `widths`), so a segment's width follows its label, not its share. **Climate**, four cells: Temp (band = liquid water at your pressure), Air (band 0.7–10 atm), Water (band 30–60%), Field (Strong / Weak / None); none on a gas world. **Moons** and **Limits** rows (below) |
| People | "13 bn · Rad 0.1 · Shield Lv3" | | Three cells: population (fill = population / capacity, ▲ / ▼), Rad dose (scale 0–3, safe band to 1), Shield "Lv3 69%" in the lattice's colour (cyan, amber at 40%, red from 15%) or "down" |
| Energy | "1.8 / 2.5 E/s"; "Work 80% · " in front only while short; red while short | One bar of the sources in a fixed order (Inner heat, Solar farms, Dyson, Reactors), each labelled inside as far as it fits; a hollow tail of idle reactor capacity, red past supply, a white notch at what is used | Two lists, E/s each, zero rows dim: **Sources** (the four and Idle reactor) and **Uses** (People, Shield, Yard, Mending, Rockets) |
| Stocks | "Fuel 3.5h · " while the reactors burn, then "Home mines +1.4/min" or "Home mines paused" | Three-up row: Ore, Volatiles, Fuel, each icon · amount · net rate a minute; Fuel amber under `FUEL_RESERVE` 30, red while the reactors dim | **Home mines** row; a per-minute table: Home, Mining & other, Spent × Ore, Vol, Fuel |
| Fleet | "4 ready · Yard idle" ("Fighter needs 12 ore", "Fighter 40%") | | One row per class `slots.ts` returns: art · name · one pip per ship filled by its own reload, faint hollow pips up to the cap · count / cap (rockets "×n", what the ore buys; the missile silo counts 0 while ore < `RESERVE` 20 + salvo × 4). With a priority set a class that takes it is bright, one that cannot dims. **Yard:** the job, its progress bar, its ore cost while it waits (amber) |
| Star (near a star or owning one) | Name · "2.4 R★" in the star's colour | | **Orbit** ("Distance" before the link; 0–8 R★, band = where seas stay liquid; green inside, amber outside, red if nowhere) and **Planets** ("n/cap · k col", once yours); a why line (the first thing that waits, "+n" for the rest) |
| Tip (always shown) | | One line, what limits you most; hidden when nothing is wrong | |

- **Age I:** the World section has no header and never folds: speed, composition, then Temp, Water (Ice / Liquid / Steam)
  and Air cells, each only once there is something to tell. The tip lists the tags earned and the nearest one to earn.
- **Moons row:** a pip per ring (hollow = free) and "2/4 · next ×3.2": the mass ratio at which the next ring opens
  (`planet/rules.ts` `nextMoonMass`; nothing after the fifth).
- **Limits row:** one at a time, the nearer limit (the other in its tooltip), in its own state colour; no blink, toast or
  sound. **Seas boil**, on a world with a surface while its seas are liquid: a log scale from 10^3.5 to 2 × the boiling mass, an
  amber band from where the seas start to suffer (30 K under boiling) to where they boil, red past it; value "×6.0 mass".
  Both masses come from `planet/rules.ts` `airLimits(m, gas, warm)` at today's gas share and starlight. **Gas world**, on a
  world with a surface from 5% gas: a scale to 25%, an amber band from 15% to 20%, red past 20%; value "8% / 20%"; it takes the row
  from 15% or when the seas row is off.
- **Stock rates:** amounts are floored. Each net rate is income minus spending a minute, each smoothed over 45 s
  (`slots.ts` `track`, `FLOW_S`) from cumulative counters on `CivState`: `got` (every gain since LIFE), `home` (home mines
  and refined fuel); spending is `got` minus the stock. "Mining & other" is `got − home`: miners' hauls, open worlds, the
  Dyson lift, salvage and loot. Fuel's time left is the spare fuel over the burn (`fuelLeft`).
- **Home mines row:** "+1.4 ore/min · +0.3 vol" while digging, else "Paused ·" and why (`CivState.homeIdle`): miners busy
  (a mineable moon or a miner site), volatiles full (20), world needs water, no metal to spare, no life. The rule:
  civilizationgameplay.md → Stocks.

**Opening and folding.** A left click on a section header, or a tap, opens or folds it (a right press there does nothing). Headers are claimed
through `input.claim` (`core/input.ts`): a press there never fires, commands or reaches the game (a drag that starts there
still steers), and the canvas shows a pointer over a header. The rest of the card claims nothing. After a toggle the whole
card swallows presses for 400 ms (`GUARD_MS`): the header just moved, and a quick second click must not fire.
- Defaults by window height: under 900 px World only; from 900 px World, People and Energy. Under 900 px one section
  besides World is open at a time (opening another folds the last).
- Your toggles win over the defaults and are saved in `gravolve.hudOpen`: space-separated `section:1` or `section:0`,
  newest last ("energy:1 world:0"). Nothing saved: the defaults.

**Tooltips** (`ui/tip.ts`). Every `[data-tip]` element explains itself on hover: what it is, what it means, its live
numbers and thresholds, and the breakdowns (every energy source and use; per stock home, mining & other, spent; a bar
segment names itself). Each stage registers its texts (`ui/rows.ts` `addTips`; the latest registered answers first). Mouse
only: a passive window `pointermove` stores the point, and once a frame the cards' rects are hit-tested, then their
`[data-tip]` elements, the innermost winning (`ui/pick.ts` `pick`, `app/test/ui/tip.test.ts`). The text refreshes every `PERIOD`
while shown; a line "label\tvalue" becomes a two-column row. The panel sits right of the card, level with the hovered
element, at most 280 px wide, flipped left when it does not fit and clamped to the screen. Anything else on top (settings,
game over) hides it. Over a card the soft reticle steps aside for the OS cursor (`overCard`).

**Layout** (tokens in `styles/base.css`, primitives in `ui/hud.css`):
- Spacing scale 2 / 4 / 8 / 12 px (`--ui-s1` to `--ui-s4`): card padding 12 on every side, 8 between sections, 2 between
  rows. Icons 12 px (section icons 16), rows 16 px, tracks 4 px, labelled stacked bars 14 px. Three type sizes: caption
  10, value 12, title 14; nothing under 10 px. From 1000 px tall one step up, at real sizes: icons 14 / 18, value 13,
  title 15, rows 18, card 340.
- Every row is on the same columns (`.row`): icon (16) · label (72) · track (the rest) · value (64, right-aligned), so
  every track starts and ends at the same x and every value shares one edge. Fleet art takes a double icon column with the
  same track start.
- Text is trimmed to its cap height and baseline (`text-box: trim-both cap alphabetic`), so a label's ink centre is its
  box centre and lines up with its icon by the box alone. Browsers without it nudge the icons by `--ui-optical` −0.085 em
  (measured) under `@supports not`. Icon centre against cap centre: |Δ| ≤ 0.25 px (measured, 2026-11-17).
- The composition and energy bars' labels keep 12 px icons at every size (`ui/panel.ts` `fit` and `widths` measure them).

**Phones** (`asteroid/hud.ts` `PHONE`: `(pointer: coarse) and (max-width: 640px), (max-height: 500px)`): the same DOM,
real sizes, no transform. The card sits 6 px from its corner, at most 320 px or the screen width less 12 px.
- Compact by default: every section folded to its header and summary. World keeps the speed row; Energy's bar and the
  stock amounts fold into their headers (Stocks reads "Ore 412 · Fuel 3.5h").
- A tap on a header opens it, one at a time; a second tap folds it. Phone toggles live in memory only, never saved: a
  phone starts compact and never edits the desktop set.
- Opened, the cells spell out their labels (no tooltips on touch): People, Rad dose, Shield; Ore, Volatiles, Fuel; "Per
  min" over the table.
- Landscape (under 500 px tall): while a section is open the other folded ones step aside (World's header and speed stay).
- Headers are 28 px tall on any touch screen (`--ui-tap`, `(pointer: coarse)`). The bottom right stays free (the debug
  biome map sits there).

**Sizes** (measured, 2026-11-17): your card under a civilization near a star, World open only, is 393 px tall at 720 and
at 768 px tall, ~420 px at 1080 px tall; on phones the compact card is 325 px tall in portrait and in landscape.

### Hints and toasts

- **Hints** (`gravolve.hints`, each once, each tied to something on screen): move ("WASD / arrows"), fast ("Too fast to eat", with a red needle flash), safe ("Green glow"), deadly ("Red glow").
- **Toasts:** one queue (`ui/toast.ts`), 3 pending, 3.2 s each. When more wait, the oldest routine toast drops; milestones (`keep`: Age I complete and the planet stage's milestones) never drop. Biome names show after 0.5 s in a new place, never the same within 40 s (`asteroid/hud.ts`). Stage, miner, fleet, impact, rival, pirate and star news and achievements all use it; their texts live in the topic docs. Achievement toasts only when no other banner waits. Toasts never warn about something off screen.

### Game over

`ui/gameover.ts`: what hit you and how fast, the rule behind that death said once (never in the target panel), Age I
progress, **Score** (marked best on a record), **Best score**, the score's parts, peak mass, rocks eaten, time, fastest
ages, and this run's achievements. The four lessons: eaten (a red aura means it outweighs you), destroyed (below 8
diam/s you merge, up to 24 you keep part, faster both sides break), crumbled (every hard bounce chips you), star (the
Roche limit at ~1.3–1.6 star radii; link from 2–4). With a living colony your world's death shows no card: the run
carries on there ("Your colony carries on"; Q3, stargameplay.md).

### Score

`core/score.ts` `scoreOf`, one number per run, shown as parts on the game-over card:

| Part | Points |
|---|---|
| Mass | 2000 per ×10 of peak over start mass |
| Time | 1 a second up to 1200 s, scaled by Age I progress (idling small earns nothing) |
| Life | 3000 once LIFE holds (or the world becomes a brown dwarf) |
| Civilization | 400 a tier reached |
| Ships | 40 an enemy ship shot down, up to 100 ships |
| Rival worlds | 1500 a world beaten, up to 4 |
| Star taken | 3000 |
| Dyson | up to 8000 at full cover |

The best score is kept in `gravolve.best` (old saves fall back to the mass part); debug runs bank nothing.

### Debug mode

Exists only on the localhost dev server (`ui/settings.ts` `DEBUG`); deployed builds have no debug code and no checkbox,
so nobody can cheat the scores. There, Settings has "Debug mode" (`gravolve.debug`, off by default):
- **Biome map** (`ui/minimap.ts`): 56² samples of `field.biomeAt` across 24 of your views, a full pass every 0.5 s; your dot and view frame.
- **DBG button** left of the gear (`ui/debug.ts`): a dropdown in three rows; a greyed button says why on hover (checked every 0.5 s while open). **Jump:** Planet (a habitable Super-Earth), Life (that, then LIFE), Star (that, then contact and an instant link); a jump stops after 20 s. **Boost:** Grow ×3, +Ore (500 ore, 200 volatiles, 100 fuel; needs a civilization). **Star** (needs a linked star): Dyson (+30%), Type (red dwarf 0.4 → sun 1 → blue giant 8 suns), +Planet (a metal-rich world in your star's catch zone).
- A touched run (`run.debug`) unlocks no achievements and saves no records or score ("Debug runs save no records" in the menu).

### Achievements

`core/achievements.ts`: a pure list `{id, name, hint, group, secret?, test(snap)}`; `ui/achievements.ts` draws them and
`main.ts` feeds them a snapshot twice a second plus moments the snapshot cannot see (meal, shatter, a heavier body broken,
setback, Age I, respawn, death cause). Each unlocks once, ever. A toast only after the fact and only when no other
banner waits. A gallery of tiles: a row on the game-over card and the full grid behind a settings button (Escape closes
it). Locked tiles show name and hint; secrets show "?".

39 achievements in five groups (checked, `core/achievements.ts`):

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
| | Full house | four or more moon slots, all filled |
| | Fast thinker | LIFE within 15 min of the run |
| | Duelist | a rival world beaten |
| | Bounty | a pirate fleet destroyed |
| | Moon thief | catch a moon another host just lost |
| | Master thief | steal 10 moons in one run |
| | Sun tamer | own a star of ≥ 4 suns |
| Discovery (7) | Comet catcher | eat a comet |
| | Green glow | eat a body ≥ 20% radioactive (a green rock) |
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

- Storage `gravolve.*` through `ui/settings.ts` `load` / `save` (every access in try/catch; blocked storage keeps unlocks for the session and drops bests):
  - `gravolve.ach`: `{id: time}`, merged across tabs before every save.
  - `gravolve.best`: best score, peak mass and the fastest Age I / II / III, saved the moment an age completes.
  - `gravolve.hints`: hints already shown.
  - `gravolve.hudOpen`: your card's section toggles, newest last ("energy:1 world:0"; see HUD). Phones save none.
  - Settings: FPS cap (VSync, 30, 60, 120, 240, Unlimited (benchmark)), show FPS (off by default), sound, debug mode (dev only), volume (default 20%).
- Settings: a gear button opening a small panel with those choices, the achievements gallery button and a collapsible "How to play".

### YouTube Playables

- Storage is one cloud record instead of `localStorage`, loaded before anything reads it, saved in bursts (0.5 s) and on YouTube's pause (`ui/settings.ts`).
- YouTube's pause stops the frame loop and banks the run score; its mute is the only mute (no Sound checkbox there).
- The best score is sent to YouTube at start and whenever the best record is saved (`ui/gameover.ts` `sendBest`).
- Escape is never blocked (the gallery closes on it without `preventDefault`).

## Planned

- **Events director toast:** names an event on its first sighting per run, after it is visible, never as a warning (gameevents.md). Not built.
- **Suspend and resume** a run (vision.md → Roadmap): today only bests, achievements, hints and settings persist.

## Open issues

- Touch was checked with synthetic events only, never on a device.
- Test tabs share `localStorage` with the user (techandperformance.md → Testing).
- **Debug Life route collapses:** the air rains out and the civilization sleeps within 15–35 s (planetgameplay.md → Open issues).
- A touch tablet outside the phone query gets the desktop card: no tooltips (mouse only), and the People and Stocks cells show
  icons without labels.

## Decisions

- **Danger is seen, never told** (user): no off-screen arrows or alerts (tried and removed), no verdict text (only the well colour and the panel edge), no meteor warnings. Toasts name what is already visible.
- **Target panel: composition only** (user): no density / hardness / durability, no change line.
- **Icons first** (user), each readout with a short visible caption; no Seas chip (user). Since 2026-11-17 the three-up
  People and Stocks cells show their labels only on phones; on desktop the hover tooltip names them.
- **One card for your own body** (user, 2026-11-14): bottom left, always open, scaled on phones (user: "show always expanded, but in phone dpi, need resizing"); target card and marker share one colour. The phone half (always open, scaled) was reversed on 2026-11-17 (below).
- **Watch and feed** (user): no build menu; the one order is the priority target.
- Achievements and hints never interrupt: a toast only when no other banner waits.
- **HUD redesign** (user, 2026-11-17): redesign your card from scratch, PC first. Every element explains itself on hover;
  critical thresholds show with the distance to them (the Limits row); energy shows where it comes from and goes; stocks
  show rates and the home mines; icons and labels optically centred on one spacing scale. Phones: compact by default, a tap
  expands a section in place (not a modal), and desktop is not compromised for them. After researching Stellaris,
  Frostpunk 2 (hover breakdowns), Oxygen Not Included, RimWorld (pinnable, collapsible lists) and Dyson Sphere Program
  (generation, demand, capacity): a compact card with headline rows always shown, full breakdowns in the hover tooltip, and
  sections pinned open by a click on their header. This reverses the 2026-11-14 phone rule (always open, scaled): phones
  fold everything and scale nothing.
