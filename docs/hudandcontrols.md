# HUD and controls

Steering and acting (Fire / Command), the HUD, hints and toasts, game over and score, debug mode, achievements, records,
settings, YouTube Playables. Code: `core/input.ts`, `core/score.ts`, `core/achievements.ts`, `ui/` (reticle, toast,
gameover, achievements, settings, debug, minimap, `panel.ts`, `rows.ts`, `tip.ts`, `pick.ts`, `hud.css`), stage HUDs
`evolution/asteroid/hud.ts`, `planet/hud.ts`, `civilization/hud.ts` (+ `slots.ts`), `star/hud.ts`. DOM over the canvas;
each UI module imports its own CSS and shares `.ui-panel` and the `--ui-*` tokens of `styles/base.css`.

## Built

### Controls

`core/input.ts`, `ui/reticle.ts`.

| Verb | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows (raw thrust) | joystick (deadzone 0.12): wanted velocity = top × tilt², closing over 0.35 s (`entity.ts` `stickThrust`); still finger at centre brakes, lifted coasts |
| **Fire** | left mouse (cursor); Space (HUD target) | a tap (< 0.25 s, inside the deadzone); a quick second finger |
| **Command** | right mouse on a body (no context menu); E (cursor) | 0.5 s long press |
| Hold | Command kept 0.4 s | long press kept 0.4 s more |
| Zoom | wheel, 0.25–3× (`camera.ts`) | pinch (steering pauses) |
| HUD section | left click on a header: open / fold, never Fire | tap on the header (a drag from it still steers) |
| Restart | game over: Enter / Space / R; after Age I Enter / Space / C continues as a planetoid, R new run | the card's buttons |

- **Fire** launches a guided rocket from LIFE, locking the ship, rocket or body under the aim
  ([civilizationgameplay.md](civilizationgameplay.md) → Rockets); a click that cannot fire notes "No ore" or "Reloading".
  Space aims at the HUD target: the heaviest body on screen within ±30° of your heading.
- **Command** on a body (not you or your moons), rival world or enemy ship sets the priority target
  ([civilizationgameplay.md](civilizationgameplay.md) → Priority target, which holds the note texts). On a moon it
  selects it; a hold grinds it 1.5% of your mass a second, no heat. Moons are caught by flying
  ([planetgameplay.md](planetgameplay.md) → Moons).
- **Reticle:** while you hold a weapon, a soft reticle with a cooldown ring (full = ready); no aim line. Over a HUD card
  the OS cursor returns.

### HUD

Two cards, a marker, one tooltip. `asteroid/hud.ts` builds the cards; each stage adds its section. Builders (row, cell,
header, icons, tooltip registry) in `ui/rows.ts`, CSS in `ui/hud.css`. Cards update 12 times a second (`panel.ts`
`PERIOD`), the marker every frame. `#game-hud` is `pointer-events: none` except section headers. One rule for every
scale: the needle is you, the band is where life wants it, the value green inside (amber weak, red missing).

| Where | What |
|---|---|
| Your card, bottom left (cyan; 320 px, 340 from 1000 px tall) | head, one section per stage, tip |
| Target card, top right (224 px, composition bar 200 px) | the body you head for or the selected moon: verdict square, rival name (violet) or size class, × your mass, one line; from Age II a **Moon-size** chip (`moons.ts` `sizeOk`); composition bar; a rival's life chips; near a star with no target the star and link %. **Composition only** |
| Marker | the cards' corner brackets round the target in the verdict colour (moon blue); a rival's name in violet. Names, never warns |
| Tooltip | one glass panel beside the hovered card |

**Your card** — each section a header (icon, caption, chevron, live summary) and a foldable body:

| Section | Header summary | Shown folded (desktop) | Body |
|---|---|---|---|
| Head (always) | | Age chip, tier, mass; **goal bar**: Age I next tier ("→ Medium asteroid · ~4 meals"), Age II life %, gas line brown dwarf, "Civilization · T2/6", "No life · dying out" (red), star link then Dyson ("62% · 4.1 E/s") | |
| World | temperature · air (water or field when worst) | | **Speed** log gauge (eat, rough, bounce) with a predicted-impact needle; **Composition** stacked bar (every element ≥ 0.5% icon · share, names where room, `widths`); **Climate** cells Temp (liquid band), Air (0.7–10 atm), Water (30–60%), Field; **Moons**, **Limits** |
| People | "13 bn · Rad 0.1" | | population (fill = pop / capacity) and Rad dose (0–3, safe to 1), two labelled cells |
| Energy | "1.8 / 2.5 E/s" ("Work 80% · " while short, red) | source bar (Inner heat, Solar farms, Dyson, Reactors), hollow idle-reactor tail, red past supply, a notch at use | **Sources** (four + Idle reactor) and **Uses** (People, Shield, Yard, Mending, Rockets) |
| Stocks | "Fuel 3.5h · " while burning, then "Home mines +1.4/min" or "paused" | Ore, Volatiles, Fuel: amount · net rate a minute; Fuel amber under `FUEL_RESERVE` 30, red while reactors dim | **Home mines** row; per-minute table Home / Mining & other / Spent × Ore, Vol, Fuel |
| Defence | "4 ready · Yard idle" (phones: "Shield 69% · " first) | **Shield** row: "Lv3 69%" in lattice colour, or "down" (red) | a row per class (`slots.ts`): art · name · a pip per ship filled by its reload, hollow to the cap · count / cap (rockets: the magazine); with a priority set, classes that take it bright. **Yard:** job, progress, ore cost while waiting |
| Star | name · "2.4 R★" | | **Orbit** (0–8 R★, band = liquid seas) and **Planets** ("n/cap · k col"); a why line |
| Tip (always) | | what limits you most; hidden when nothing is wrong | |

- **Age I:** World has no header: speed, composition, then Temp, Water (Ice / Liquid / Steam), Air once there is
  something to tell; the tip lists tags earned and the nearest one.
- **Moons row:** a pip per ring and "2/4 · next ×3.2" (`nextMoonMass`; nothing after the fifth).
- **Limits row:** the nearer limit, no blink or sound. **Seas boil** (surface world, liquid seas): log scale 10^3.5 to
  2 × the boiling mass, amber from 30 K under boiling, red past; "×6.0 mass" (`airLimits`). **Gas world** (from 5% gas):
  scale to 25%, amber 15–20%, red past 20%; takes the row from 15%.
- **Stock rates:** floored amounts; net = income − spending a minute, smoothed over 45 s (`track`, `FLOW_S`) from `CivState`
  counters `got` and `home`; "Mining & other" = `got − home` (hauls, open worlds, Dyson lift, salvage, loot). Fuel time
  left = spare fuel ÷ burn (`fuelLeft`).
- **Home mines row:** "+1.4 ore/min · +0.3 vol", else "Paused ·" and why (`homeIdle`): miners busy, volatiles full, world
  needs water, no metal to spare, no life. Rule: [civilizationgameplay.md](civilizationgameplay.md) → Stocks.

**Opening and folding.** A header click or tap toggles it (right press does nothing). Headers are claimed via
`input.claim`: a press there never fires or commands (a drag still steers); pointer cursor over a header. After a toggle
the card swallows presses for 400 ms (`GUARD_MS`). Defaults: World open; with a civilization Defence instead (under 900 px
tall one section besides World at a time; from 900 px World and Defence). Your toggles win, saved in `gravolve.hudOpen` (space-separated
`section:1|0`, newest last).

**Tooltips** (`ui/tip.ts`): every `[data-tip]` element explains itself on hover (meaning, live numbers, thresholds,
breakdowns). Stages register texts (`addTips`, latest first). Mouse only: the stored pointer is hit-tested against card
rects once a frame, innermost wins (`pick.ts`, `test/ui/tip.test.ts`); refreshed every `PERIOD`; "label\tvalue" lines
become two columns; ≤ 280 px wide, right of the card, flipped and clamped; hidden under settings or game over; the reticle
steps aside (`overCard`).

**Layout** (`base.css` tokens, `ui/hud.css`): spacing 2 / 4 / 8 / 12 px (`--ui-s1`–`s4`); padding 12, 8 between sections, 2
between rows; icons 12 (section 16), rows 16, tracks 4, stacked bars 14; type 10 / 12 / 14, nothing under 10; from 1000 px
tall one step up (icons 14 / 18, value 13, title 15, rows 18, card 340). Every row on one grid (`.row`): icon 16 · label
72 · track · value 64 right-aligned. Text trimmed to cap height (`text-box: trim-both cap alphabetic`; fallback
`--ui-optical` −0.085 em); icon vs cap centre |Δ| ≤ 0.25 px (measured, 2026-11-17).

**Phones** (`PHONE`: `(pointer: coarse) and (max-width: 640px), (max-height: 500px)`): same DOM, real sizes, 6 px from
the corner, ≤ 320 px. Compact by default (every section folded; World keeps speed; Stocks reads "Ore 412 · Fuel 3.5h"); a
tap opens one section at a time; toggles never saved. Opened cells spell out labels (no tooltips on touch). Landscape: other
folded sections step aside. Headers 28 px on touch (`--ui-tap`); bottom right stays free.

**Sizes** (measured, 2026-11-17): card with a civilization near a star, World open (before the shield moved): 393 px at 720 / 768 px tall, ~420 at
1080; phone compact card 325 px. Civilization default (Defence open, the rest folded): 335 px at 661 px tall.

### Hints and toasts

- **Hints** (`gravolve.hints`, each once, tied to something on screen): move, fast ("Too fast to eat", red needle flash),
  safe ("Green glow"), deadly ("Red glow").
- **Toasts** (`ui/toast.ts`): one queue, 3 pending, 3.2 s each; the oldest routine one drops, milestones (`keep`) never.
  Biome names after 0.5 s in a new place, not repeated within 40 s. Achievement toasts only when no banner waits. Toasts
  never warn about anything off screen. Texts live in the topic docs.

### Game over

`ui/gameover.ts`: what hit you and how fast, the rule behind that death said once, Age I progress, **Score** (best marked),
**Best score**, parts, peak mass, rocks eaten, time, fastest ages, achievements. Lessons: eaten (a red aura outweighs
you), destroyed (below 8 diam/s you merge, to 24 you keep part, faster both break), crumbled (hard bounces chip you), star
(Roche limit ~1.3–1.6 star radii; link from 2–4). With a living colony no card: "Your colony carries on" (Q3).

### Score

`core/score.ts` `scoreOf`: Mass 2000 per ×10 of peak over start; Time 1 a second to 1200 s × Age I progress; Life 3000
once LIFE holds (or brown dwarf); Civilization 400 a tier; Ships 40 an enemy ship, ≤ 100 ships; Rival worlds 1500 each,
≤ 4; Star taken 3000; Dyson ≤ 8000 at full cover. Best in `gravolve.best`; debug runs bank nothing.

### Debug mode

Only on the localhost dev server (`settings.ts` `DEBUG`); deployed builds carry no debug code, so nobody can cheat the
scores. Settings "Debug mode" (`gravolve.debug`, off by default):
- **Biome map** (`ui/minimap.ts`): 56² samples of `field.biomeAt` over 24 views, a pass every 0.5 s.
- **DBG** button (`ui/debug.ts`): **Jump** Planet (habitable Super-Earth), Life, Star (contact and instant link), each
  stopping after 20 s; **Boost** Grow ×3, +Ore (500 ore, 200 volatiles, 100 fuel); **Star** Dyson +30%, Type (red dwarf
  0.4 → sun 1 → blue giant 8 suns), +Planet. Greyed buttons say why on hover.
- A touched run (`run.debug`) unlocks nothing and saves no records.

### Achievements

`core/achievements.ts`: pure `{id, name, hint, group, secret?, test(snap)}`; `main.ts` feeds a snapshot twice a second
plus moments (meal, shatter, a heavier body broken, setback, Age I, respawn, death cause). Each once, ever; a toast only
when no banner waits; tiles on the game-over card and a full grid in settings (Escape closes). Locked tiles show name and
hint, secrets "?". 39 in five groups:

- **Milestone (11):** First bite (first meal whole) · Planetesimal (mass ≥ `AGE_GOAL` 10^3.5) · Planet (≥ 10^4.5) · First
  rain (liquid water ≥ 1%) · Moonrise (a moon) · Spark (life stirs) · They look up (LIFE) · Bound to a sun (link) · Half a
  sphere (Dyson ≥ 50%) · Type II (Dyson 100%) · Failed star (gas line, ≥ 10^7).
- **Mastery (12):** Sprinter (Age I within 70 s) · Untouched (Age I with no shattering hit) · Giant killer (a heavier body
  destroyed, you live) · Eden (life speed ≥ 0.9 for 60 s) · Unbroken chain (LIFE with no setback) · Full house (≥ 4 moon
  slots, all filled) · Fast thinker (LIFE within 15 min) · Duelist (a rival world beaten) · Bounty (a pirate fleet
  destroyed) · Moon thief (catch a moon another host just lost) · Master thief (10 steals in a run) · Sun tamer (a star of
  ≥ 4 suns).
- **Discovery (7):** Comet catcher (eat a comet) · Green glow (eat a body ≥ 20% radioactive) · Into the dark (30 s in a
  void) · In a giant's shadow (5 s within 3 radii of a body ≥ 20× you) · Four elements (rock, metal, water, gas each
  ≥ 10%) · Iron heart (field ≥ 0.9) · Stargazer (3 star types nearest in a run).
- **Style (5):** Comet life (60 s as a comet) · Slingshot (≥ 100 own D/s) · Pacifist (own a star without beating a rival)
  · Iron world / Water world (Age I with metal / water ≥ 40%).
- **Secret (4):** Icarus (fall into a star) · Swallowed whole (eaten by ≥ 20× you) · Phoenix (LIFE after "Continue as a
  planetoid") · Life under the ice (life with frozen seas 60 s).

Pattern from the old game: a milestone plus one self-imposed constraint (`analysis/SOLAR/07-missions-and-meta.md`).

### Records and settings

- `gravolve.*` via `settings.ts` `load` / `save` (try/catch; blocked storage keeps unlocks for the session): `.ach`
  (`{id: time}`, merged across tabs), `.best` (best score, peak, fastest Age I / II / III), `.hints`, `.hudOpen` (not on
  phones); settings FPS cap (VSync, 30, 60, 120, 240, Unlimited), show FPS (off), sound, debug (dev only), volume (20%).
- A gear opens the panel with those, the achievements button and a collapsible "How to play".

### YouTube Playables

One cloud record instead of `localStorage`, loaded first, saved in 0.5 s bursts and on YouTube's pause; that pause stops
the loop and banks the run score; its mute is the only mute; the best is sent at start and on each save (`sendBest`);
Escape is never blocked.

## Planned

- **Events director toast:** names an event on first sight, never as a warning ([gameevents.md](gameevents.md)).
- **Suspend and resume** ([vision.md](vision.md) → Roadmap).

## Open issues

- Touch checked with synthetic events only. Test tabs share `localStorage` with the user (`.claude/CLAUDE.md` → Testing).
- Debug Life route collapses within 15–35 s ([planetgameplay.md](planetgameplay.md) → Open issues).
- A touch tablet outside the phone query gets the desktop card: no tooltips, unlabelled Stocks cells.

## Decisions

- **Danger is seen, never told** (user): no off-screen arrows or alerts (tried and removed), no verdict text (well colour
  and panel edge only), no meteor warnings; toasts name what is visible.
- **Target panel: composition only** (user): no density / hardness / durability, no change line.
- **Icons first** (user), each with a short caption; no Seas chip. Since 2026-11-17 Stocks cells show labels
  only on phones; desktop names them on hover.
- **Shield under Defence** (user, 2026-11-17): the shield is a defence shell, not population: an always-visible row in Defence
  (was Fleet); People keeps population and Rad dose. In a civilization the card opens Defence, World folds to its header.
- **One card for your own body** (user, 2026-11-14): bottom left; target card and marker share one colour. Its phone half
  (always open, scaled) reversed 2026-11-17.
- **Watch and feed** (user): no build menu; the one order is the priority target.
- Achievements and hints never interrupt.
- **HUD redesign** (user, 2026-11-17): your card from scratch, PC first; everything explains itself on hover; thresholds
  with the distance to them (Limits); energy sources and uses; stock rates and home mines; one spacing scale, optical
  centring. Phones compact, a tap expands in place, desktop not compromised. After Stellaris, Frostpunk 2, Oxygen Not
  Included, RimWorld and Dyson Sphere Program: headline rows, breakdowns on hover, sections pinned by a header click.
