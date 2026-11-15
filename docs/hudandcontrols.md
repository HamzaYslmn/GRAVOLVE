# HUD and controls

How you steer and act (Fire / Command), what the HUD shows, hints and toasts, the game-over card and score, debug mode,
achievements, records, settings and YouTube Playables. Code: `core/input.ts`, `core/score.ts`, `core/achievements.ts`,
`ui/` (reticle, toast, gameover, achievements, settings, debug, minimap, `panel.ts`), the stage HUDs
`evolution/asteroid/hud.ts`, `planet/hud.ts`, `civilization/hud.ts` (+ `civilization/slots.ts`), `star/hud.ts`. The HUD
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
| Restart | game-over card: Enter / Space / R; after Age I, Enter / Space / C continues as a planetoid, R starts a new run | the card's buttons |

- **Fire** is the mass driver from LIFE (civilizationgameplay.md → Mass driver); from Dyson 20% the energy beam (stargameplay.md → Energy beam [K]). A click that cannot fire notes "No ore" or "Charging" at the reticle. Space aims at the HUD target: the heaviest body on screen within ±30° of your heading.
- **Command** on any body but you and your moons, a rival world or an enemy ship sets your priority target; the same target clears it, another replaces it; it fires nothing by itself (civilizationgameplay.md → Priority target). Command on a moon selects it; a hold on a moon grinds it, 1.5% of your mass a second as dust, no heat. Moons are caught by flying, never by a click (planetgameplay.md → Moons).
- **Priority notes** (`civilization/orders.ts`), a small muted note over the target: "Priority set", "Rockets chip it", "Reloading · N s", "Ships busy", "Not enough ore", "Shield down · fleet holds", "Out of range", "No fighters", "Nothing can hurt it", "No life · fleet idle", "Already beaten", "Priority cleared"; before LIFE "No fleet yet" (`planet/moons.ts`).
- **Reticle:** while you hold a weapon, a soft reticle with a cooldown ring replaces the cursor; full ring = ready. No aim line, no numbers.

### HUD

Two cards and a marker. Cards update 12 times a second (`ui/panel.ts` `PERIOD`), the marker every frame. Icons first,
each with a short visible caption (the cards take no pointer input, so hover titles never show and a touch on them still
steers). One rule for every scale: the needle is you, the band is where life wants it, the value is green inside (amber
weak, red missing).

| Where | What |
|---|---|
| Your card, bottom left (cyan, 256 px) | **Head:** age chip, tier, mass. **Goal bar:** the stage's one goal: Age I the next tier ("→ Medium asteroid · ~4 meals"); Age II life %, or on the gas line the brown dwarf; with a civilization "Civilization · T2/6"; with life lost "No life · dying out" (red); near or owning a star the link, then the Dyson. Moon pips beside it (hollow = free). **Speed:** a log gauge with a second needle for the predicted impact speed. **Composition:** one stacked bar labelled inside (icon · name · share as width allows; `ui/panel.ts` `fit`). **Stage rows** (below). **Tip:** one line, what limits you most; hidden when nothing is wrong |
| Target card, top right under the gear (200 px) | The body you are heading for, or the moon you selected. A square in the verdict colour, the rival's name (violet) or size class, × your mass, one line ("Medium asteroid · Stony rival", `Moon · <rock name>`); from Age II a **Moon-size** chip, lit when the body passes the catch's size gate (`planet/moons.ts` `sizeOk`); its composition bar. A rival world adds its life chips. Near a star with no body target: the star and its link %. **Composition only** |
| Marker, on the target body | The cards' corner brackets around the target, in the verdict colour (a moon: its blue); a named rival's name above in violet. It names the body; it warns of nothing |

| Stage | Rows in your card |
|---|---|
| Age I | Temp, Water (Ice / Liquid / Steam), Air: each only once there is something to tell |
| Age II (`planet/hud.ts`) | four cells: Temp (band = liquid water at your pressure), Air (band 0.7–10 atm), Water (band 30–60%), Field (Strong / Weak / None); "Next: tier" and the gas-line warning. With a living civilization they shrink to one line |
| Civilization (`civilization/hud.ts`) | **vitals:** People (fill = population / capacity), Rad, Shield "Lv3 69%" in the lattice's colour (cyan, amber at 40%, red from 15%); **energy:** one bar of the sources (Geothermal, Sun, Dyson, Fuel), a tick at what the people use, and a strip of the uses; **fuel:** "stock · time left · burn / inflow per min", averaged over 45 s (`slots.ts` `FLOW_S`); **fleet slots** (`slots.ts`): probe, fighter, frigate, rocket, missile; one pip per ship filled by its reload, faint pips up to the cap; the rocket rack shows "×n" (what the ore buys); the missile silo's salvo shows only while ore ≥ `RESERVE` 20 + salvo × 4; with a priority set a class that takes it gets a cyan edge, one that cannot dims; **yard:** what is building and its cost / stock |
| Star (`star/hud.ts`) | the star (name, M☉, K); **Orbit** ("Distance" before the link; 0–8 R★, band = where seas stay liquid) and **Planets** ("n/cap · k col"); a why line for the Dyson, the colony fleet and the beam |

**Phones:** the same cards, always open, scaled from their corner (`asteroid/hud.css`): 0.85 up to 640 px wide, 0.8 up
to 500 px tall. Under a civilization on a landscape phone your card takes two columns, 500 px wide. The bottom right is
free (the debug biome map sits there). Card sizes were not re-measured since these scales.

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
- HUD card sizes not re-measured since the 0.85 / 0.8 phone scales.

## Decisions

- **Danger is seen, never told** (user): no off-screen arrows or alerts (tried and removed), no verdict text (only the well colour and the panel edge), no meteor warnings. Toasts name what is already visible.
- **Target panel: composition only** (user): no density / hardness / durability, no change line.
- **Icons first** (user), each readout with a short visible caption; no Seas chip (user).
- **One card for your own body** (user, 2026-11-14): bottom left, always open, scaled on phones (user: "show always expanded, but in phone dpi, need resizing"); target card and marker share one colour.
- **Watch and feed** (user): no build menu; the one order is the priority target.
- Achievements and hints never interrupt: a toast only when no other banner waits.
