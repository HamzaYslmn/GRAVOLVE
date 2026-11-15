// One run score (YouTube Playables keeps one best score; the game-over card shows the breakdown). Pure, Node-safe.
// Each part pays at the stage where it happens; mass is logarithmic, so every ×10 is worth the same at any stage.
export type ScoreInput = {
  peak: number; start: number; seconds: number; // peak and start mass; run time (s)
  life: boolean; tier: number; ships: number; worlds: number; // Age II done; highest civ tier; enemy ships shot; rival worlds beaten
  linked: boolean; cover: number; // a star taken; highest Dyson cover 0..1
};
export type Part = { label: string; points: number };

const AGE_GOAL = 10 ** 3.5; // asteroid/rules.ts AGE_GOAL (kept import-free)
const MASS = 2000; // per ×10 of mass
const TIME_CAP = 1200; // s; scaled by Age I progress, so idling small earns nothing
const LIFE = 3000, TIER = 400, SHIP = 40, SHIPS_CAP = 100, WORLD = 1500, WORLDS_CAP = 4, STAR = 3000, DYSON = 8000;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const log = (peak: number, start: number) => Math.max(0, Math.log10(peak / start));

/** The mass part alone: old saves' best score (a lower bound of what that run scored). */
export const massScore = (peak: number, start: number) => Math.round(MASS * log(peak, start));

export function scoreOf(i: ScoreInput): { total: number; parts: Part[] } {
  const d = log(i.peak, i.start), ships = Math.min(i.ships, SHIPS_CAP), worlds = Math.min(i.worlds, WORLDS_CAP);
  const parts: Part[] = [
    { label: 'Mass', points: massScore(i.peak, i.start) },
    { label: 'Time', points: Math.round(Math.min(i.seconds, TIME_CAP) * clamp01(d / Math.log10(AGE_GOAL / i.start))) },
    { label: 'Life', points: i.life ? LIFE : 0 },
    { label: `Civilization · tier ${i.tier}`, points: TIER * i.tier },
    { label: `Ships ×${ships}`, points: SHIP * ships },
    { label: `Rival worlds ×${worlds}`, points: WORLD * worlds },
    { label: 'Star taken', points: i.linked ? STAR : 0 },
    { label: `Dyson ${Math.round(i.cover * 100)}%`, points: Math.round(DYSON * clamp01(i.cover)) },
  ].filter((p) => p.points > 0);
  return { total: parts.reduce((s, p) => s + p.points, 0), parts };
}
