import './hud.css';
import { DOSE_SAFE, FLEET, FUEL_LOW, FUEL_RESERVE, NEED, P0, ROCKET, salvo, SHIELD_E, SHIELD_LEVELS, shieldCost, TIER_MAX, WORK_E } from './rules';
import { energyTint } from './lattice';
import { YOU } from '../../render/tech';
import type { CivState } from './stage';
import { balance, fuelLeft, MAKE, SLOTS, track, USE, type Slot, type Track } from './slots';
import { SHIP_ART } from '../../render/shipArt';
import { bar as pct, finder, fit, hex, label, throttle } from '../../ui/panel';
import { addTips, cell, head, icon, num, row, signed, type IconKey } from '../../ui/rows';
import { innerPx, PHONE } from '../asteroid/hud';

// The civilization's sections in your card (asteroid/hud.ts), docs/hudandcontrols.md, each a header with a live summary and a
// body its header opens: People (population, rad), Energy (used / capacity and one bar of the sources
// always; opened: Sources and Uses), Stocks (ore, volatiles, fuel with net rates always; opened: home mines, income by source
// and spending), Defence (the shield always; opened: one row per class slots.ts returns, the yard). Data-driven: a source, use or fleet class slots.ts drops
// simply has no row.

// Energy sources and uses: name, short name in the bar, icon. Keys slots.ts does not return are skipped; unknown ones never show.
const SRC: Record<string, [string, string, IconKey]> = { geo: ['Inner heat', 'Heat', 'geo'], solar: ['Solar farms', 'Solar', 'sun'], dyson: ['Dyson', 'Dyson', 'dyson'], fuel: ['Reactors', 'Reactor', 'rad'] };
const USES: Record<string, string> = { people: 'People', shield: 'Shield', yard: 'Yard', mend: 'Mending', rockets: 'Rockets' };
const SRC_TIP: Record<string, string> = {
  geo: 'free, from your world\'s own heat; grows with size and metal.',
  solar: `free: panel fields on your ground from tier 2 (one more per tier), only in starlight and strongest near a star; up to half a reactor.`,
  dyson: 'your star\'s light, caught by the sphere.',
  fuel: 'burn fuel for what the free sources leave, and only that.',
};
const USE_TIP: Record<string, string> = {
  people: `${NEED} E/s per bn.`, shield: `${SHIELD_E} E/s per level.`, yard: `${WORK_E} E/s while building.`,
  mend: `${WORK_E} E/s while the shield recharges.`, rockets: `${WORK_E} E/s while your magazine refills.`,
};
const STOCK = ['ore', 'vol', 'fuel'] as const;
type Stock = (typeof STOCK)[number];
const IDLE: Record<NonNullable<CivState['homeIdle']>, [string, string]> = {
  busy: ['miners busy', 'paused: your miners have moons or rocks to work'], vol: ['volatiles full', 'volatiles full (20)'],
  ice: ['world needs water', 'your world needs its water'], metal: ['no metal to spare', 'your world needs its metal (or has none)'], asleep: ['no life', 'no life'],
};
// Fleet classes: name, art (ships 2:1, the rocket square), the tooltip.
const DOSE_MAX = 3;
const svg = (box: string, body: string) => `<svg class="art" viewBox="${box}" aria-hidden="true">${body}</svg>`;
const LINE = 'fill="none" stroke="currentColor" stroke-width="1"';
const SHIP: Record<string, { name: string; art: string; tip: (q: Slot) => string }> = {
  probe: { name: 'Probes', art: svg('20 18 130 64', SHIP_ART.you.probe), tip: (q) => `Probes ${q.n}/${q.cap}: weak, slow lasers; one per tier. ${FLEET.probe.ore} ore.` },
  fighter: { name: 'Fighters', art: svg('20 18 130 64', SHIP_ART.you.fighter), tip: (q) => `Fighters ${q.n}/${q.cap}: fast, light guns; 2, plus one per 20 metal your miners bring in, up to 6. ${FLEET.fighter.ore} ore.` },
  frigate: { name: 'Frigates', art: svg('20 18 130 64', SHIP_ART.you.frigate), tip: (q) => `Frigates ${q.n}/${q.cap}: slow heavy lasers that break big rocks (to ${FLEET.frigate.breaks * 100}% of you); one from tier 3, two from tier 5. ${FLEET.frigate.ore} ore.` },
  rocket: { name: 'Rockets', art: svg('0 0 12 12', `<path d="M1.5 6h5.5l3-2v4l-3-2M3 4.2 1.5 6 3 7.8" ${LINE}/>`),
    tip: (q) => `Rockets ${q.n}/${q.cap}: left-click (or tap) launches one at what you aim at, ${ROCKET.ore} ore each. Your magazine holds ${salvo(1)}, ${salvo(3)}, ${salvo(5)} from tiers 1, 3, 5 (double-click ripples a pair); one refills every ${ROCKET.reload} s (slower when energy is short).` },
};
const span = (s: number) => (s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1);
const perMin = (x: number) => `${signed(x * 60)}/min`;
/** Population: bn, millions under 0.1 bn. */
const people = (P: number) => (P < 0.1 ? `${Math.round(P * 1000)} M` : `${P.toFixed(P >= 10 ? 0 : 1)} bn`);
const STOCK_ICON: Record<Stock, IconKey> = { ore: 'ore', vol: 'water', fuel: 'rad' };
const STOCK_NAME: Record<Stock, string> = { ore: 'Ore', vol: 'Volatiles', fuel: 'Fuel' }; // shown on phones (no tooltips)

export function createCivHud(panel: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'civ';
  const li = (cls: string, k: string, name: string) => `<div class="li ${cls}-${k}" data-tip="${cls}-${k}"><i class="sw s-${k}"></i><em class="lb">${name}</em><span class="v"></span></div>`;
  const src = MAKE.filter((k) => SRC[k]), use = USE.filter((k) => USES[k]);
  el.innerHTML = `<div class="sec people" data-s="people">${head('people', 'people', 'People')}<div class="body"><div class="cells">${cell('pop', 'people', 'People', 'bar')}${cell('dose', 'rad', 'Rad dose', 'scale')}</div></div></div>
    <div class="sec energy" data-s="energy">${head('energy', 'bolt', 'Energy')}
      <div class="track">${src.map((k) => `<i class="s-${k}" data-tip="src-${k}">${icon(SRC[k][2])}<em></em></i>`).join('')}<i class="s-idle" data-tip="src-idle"></i><u data-tip="short"></u><s class="need"></s></div>
      <div class="body lists"><div class="list"><em class="cap">Sources</em>${src.map((k) => li('src', k, SRC[k][0])).join('')}${li('src', 'idle', 'Idle reactor')}</div><div class="list"><em class="cap">Uses</em>${use.map((k) => li('use', k, USES[k])).join('')}</div></div></div>
    <div class="sec stocks" data-s="stocks">${head('stocks', 'crate', 'Stocks')}<div class="cells c3 amt">${STOCK.map((k) => `<div class="cell st ${k}" data-tip="${k}">${icon(STOCK_ICON[k])}<em class="lb">${STOCK_NAME[k]}</em><span class="v n"></span><span class="v r"></span></div>`).join('')}</div>
      <div class="body">${row('home', 'mine', 'Home mines')}<div class="tab"><em class="cap per">Per min</em><em class="cap">Ore</em><em class="cap">Vol</em><em class="cap">Fuel</em>${(['in-home', 'in-other', 'out'] as const).map((k) => `<div class="tr ${k}" data-tip="${k}"><em class="lb">${k === 'in-home' ? 'Home' : k === 'in-other' ? 'Mining & other' : 'Spent'}</em>${STOCK.map((s) => `<span class="v ${s}"></span>`).join('')}</div>`).join('')}</div></div></div>
    <div class="sec fleet" data-s="fleet">${head('fleet', 'ship', 'Defence')}${row('shield', 'shield', 'Shield', 'bar')}<div class="body"><div class="ships"></div>
      <div class="row yard" data-tip="yard">${icon('yard')}<em class="lb">Yard</em><span class="job"><em class="lb"></em><div class="bar"><i></i></div></span><span class="v"></span></div></div></div>`;
  panel.querySelector(':scope > .tip')?.before(el);
  const $ = finder(el), due = throttle();
  $('.dose .band').style.cssText = `left:0;width:${pct(DOSE_SAFE / DOSE_MAX)}`;
  const shown = {} as Record<string, { key: string; p: number[] }>;
  const rates = Object.fromEntries(STOCK.map((k) => [k, {} as { inc?: Track; out?: Track; home?: Track }])) as Record<Stock, { inc?: Track; out?: Track; home?: Track }>;
  let acc = 0, ships = '', last: CivState | undefined;
  const said: Record<string, string> = {};
  const text = (node: Element, t: string, cls?: string) => {
    if (node.textContent !== t) node.textContent = t;
    if (cls !== undefined && node.className !== cls) node.className = cls;
  };
  const cellState = (cls: string, v: string, state: string, fill?: number) => {
    const r = $(`:is(.cell, .row).${cls}`), want = `${r.classList[0]} ${cls} ${state}`;
    text(r.querySelector('.v')!, v);
    if (r.className !== want) r.className = want;
    if (fill !== undefined) r.querySelector<HTMLElement>('.bar > i')!.style.width = pct(fill);
  };
  /** u/s in, spent, from home, net, of a stock (smoothed over slots.ts FLOW_S). */
  const rate = (k: Stock) => {
    const r = rates[k], inc = r.inc?.v ?? 0, out = r.out?.v ?? 0, home = r.home?.v ?? 0;
    return { inc, out, home, other: Math.max(0, inc - home), net: inc - out };
  };
  const untip = addTips((key) => (last ? tipFor(key, last) : null));

  /** The tooltip for `key`, from the latest state. */
  function tipFor(key: string, s: CivState): string | null {
    const b = balance(s.power, s.energy), tr = (n: string, x: number) => `${n}\t${num(x)}`;
    if (key.startsWith('src-') || key.startsWith('use-')) {
      const k = key.slice(4), e = key[0] === 's' ? (k === 'idle' ? b.idle : b.sources.find((x) => x.k === k)?.e) : b.uses.find((x) => x.k === k)?.e;
      if (e === undefined) return null;
      if (k === 'idle') return `Idle reactor ${num(e)} E/s: capacity you are not using. Reactors burn only what you need.`;
      return key[0] === 's' ? `${SRC[k][0]} ${num(e)} E/s: ${SRC_TIP[k]}` : `${USES[k]} ${num(e)} E/s: ${USE_TIP[k]}`;
    }
    if (key.startsWith('fleet-')) {
      const k = key.slice(6), q = s.slots[k as keyof typeof s.slots];
      return q && SHIP[k] ? `${SHIP[k].tip(q)}\nA filled pip is a loaded ship (it fills as it reloads). Bright: it acts on your priority; dim: it cannot.` : null;
    }
    const o = rate('ore'), v = rate('vol'), f = rate('fuel'), T = s.tier;
    switch (key) {
      case 'people': return 'Your people: how many live and the rad they take.';
      case 'pop': return `${s.pop.toFixed(1)} bn people; your world and energy can feed ${s.cap.toFixed(1)} bn.${s.trend > 0 ? ' Growing.' : s.trend < 0 ? ' Shrinking.' : ''}\nMore people: a higher tier, more ships.${T < TIER_MAX ? ` Tier ${T + 1} at ${(P0 * 2 ** T).toFixed(1)} bn.` : ''}`;
      case 'dose': return `Rad dose ${s.dose.toFixed(2)}: safe up to ${DOSE_SAFE}; past it people die.\n${tr('From your rad rock', s.rad)}\n${tr('From space', s.dose - s.rad)}\nAir and the magnetic field cut the space part; your people dig rad rock out into fuel.`;
      case 'shield': return `Shield level ${s.level} of ${SHIELD_LEVELS}, ${Math.round((100 * Math.max(0, s.shield)) / Math.max(1e-6, s.shieldMax))}% charged. A shell just outside your world: it stops hits it can pay for and burns up its share of bigger ones.\nUpkeep ${SHIELD_E} E/s per level; mending draws ${WORK_E} E/s.${s.level < SHIELD_LEVELS ? `\nNext level: ${shieldCost(s.level + 1).ore} ore and ${shieldCost(s.level + 1).vol} volatiles.` : ''}`;
      case 'energy': return `Using ${num(b.used)} of ${num(b.capacity)} E/s${b.short > 0 ? `, short by ${num(b.short)}` : ''}.\nSources\n${[...b.sources.filter((x) => SRC[x.k]).map((x) => tr(SRC[x.k][0], x.e)), tr('Idle reactor', b.idle)].join('\n')}\nUses\n${b.uses.filter((x) => USES[x.k]).map((x) => tr(USES[x.k], x.e)).join('\n')}\nEnergy feeds your people (10 bn per E/s the shield leaves). Short of it, builds, reloads and mending slow${s.fed < 1 ? ` (now ${Math.round(s.fed * 100)}%)` : ''}; nothing dies at once.`;
      case 'short': return b.short > 0 ? `Short ${num(b.short)} E/s: uses past what you make. Builds, reloads and mending run at ${Math.round(s.fed * 100)}%.` : null;
      case 'stocks': return `What your people store, net change a minute (averaged over 45 s).\n${STOCK.map((k) => `${STOCK_NAME[k]}\t${perMin(rate(k).net)}`).join('\n')}`;
      case 'ore': return `Ore ${Math.floor(s.ore)}, ${perMin(o.net)}.\nHome mines\t${perMin(o.home)}\nMining & other\t${perMin(o.other)}\nSpent\t${perMin(-o.out)}\nBuilds: probe ${FLEET.probe.ore}, fighter ${FLEET.fighter.ore}, frigate ${FLEET.frigate.ore}, shield level 10 × level. Rockets ${ROCKET.ore} each. Enemy rounds through your shield burn ore.`;
      case 'vol': return `Volatiles ${Math.floor(s.vol)}, ${perMin(v.net)}: water your people store.\nHome mines\t${perMin(v.home)}\nMining & other\t${perMin(v.other)}\nSpent\t${perMin(-v.out)}\nA shield level costs 10; home mines dig water only while you hold under 20.`;
      case 'fuel': {
        const left = fuelLeft(s.spare, f.out);
        return `Fuel ${Math.floor(s.fuel)}${Number.isFinite(left) ? `, lasts ${span(left)} before the reactors dim` : ''}.\nRefined from your rock\t${perMin(f.home)}\nMining & other\t${perMin(f.other)}\nBurnt\t${perMin(-f.out)}\nRad ore from miners and the rad your people dig out of your own world. Under ${FUEL_LOW} the reactors throttle down; out of fuel everything slows, nothing dies at once.${s.fuel < FUEL_RESERVE ? ` Under ${FUEL_RESERVE} miners seek rad ore first.` : ''}`;
      }
      case 'home': return `Home mines: with nothing else to mine, your people dig your own world: ore at 3 × tier × its metal share a minute (metal counted to 20%), and water while you hold under 20 volatiles; never what your world lacks. Slow: moons and rocks give far more.\n${s.homeIdle ? `Now ${IDLE[s.homeIdle][1]}.` : `Now ${signed(o.home * 60)} ore/min${v.home > 1e-4 ? `, ${signed(v.home * 60)} volatiles/min` : ''}.`}`;
      case 'in-home': return 'Home: your home mines (ore, volatiles) and the rad your people refine out of your own rock (fuel).';
      case 'in-other': return 'Mining & other: miners\' hauls from moons, rocks and beaten worlds, the Dyson lift, salvage and loot.';
      case 'out': return 'Spent: builds, rockets and raid losses (ore); shield levels (volatiles); the reactors\' burn (fuel).';
      case 'fleet': return 'Your defence: the shield over your world, and your fleet, built automatically, one ship at a time, each class up to its own cap. Right-click a target (or E) to set the fleet\'s priority.';
      case 'yard': {
        const y = s.yard, cost = y ? `${Math.ceil(y.ore)} ore${y.vol > 0 ? ` and ${Math.ceil(y.vol)} volatiles` : ''}` : '';
        return `${!y ? 'Yard idle: every class at its cap.' : y.wait ? `Next: ${y.kind}, waits for ${cost} (you have ${Math.floor(s.ore)} ore).` : y.prog > 0 ? `Building a ${y.kind}: ${Math.round(y.prog * 100)}% (paid ${cost}).` : `Next: ${y.kind}, ${cost}.`}\nCosts: probe ${FLEET.probe.ore}, fighter ${FLEET.fighter.ore}, frigate ${FLEET.frigate.ore} ore; a shield level 10 × level ore and 10 volatiles. More people build faster; short energy slows it.`;
      }
    }
    return null;
  }

  return {
    update(dt: number, s: CivState) {
      acc += dt;
      last = s;
      if (!due(dt)) return;
      const wall = acc;
      acc = 0;
      // People: population (bar to what the world and energy can feed, trend), rad dose (safe band); Defence's shield row (level, charge).
      const down = !s.active || s.trend < 0;
      cellState('pop', `${people(s.pop)}${down ? ' ▼' : s.trend > 0 ? ' ▲' : ''}`, down ? 'bad' : s.trend > 0 ? 'ok' : '', s.pop / Math.max(1e-6, s.cap));
      cellState('dose', s.dose.toFixed(1), s.harm > 0 ? 'bad' : 'ok');
      $('.dose .needle').style.left = pct(s.dose / DOSE_MAX);
      const charge = Math.max(0, s.shield) / Math.max(1e-6, s.shieldMax);
      cellState('shield', s.shield > 0 ? `Lv${s.level} ${Math.round(charge * 100)}%` : 'down', s.shield > 0 ? '' : 'bad', charge);
      text($('.people .hd .v'), `${people(s.pop)} · Rad ${s.dose.toFixed(1)}`);
      $('.row.shield').style.color = s.shield > 0 ? hex(energyTint(YOU, charge)) : ''; // down: the .bad red

      // Energy: used / capacity (and the work rate when short); the sources labelled in one bar in MAKE order, the idle reactor
      // hollow, red past supply, a white notch at what is used.
      const b = balance(s.power, s.energy), scale = Math.max(b.capacity, b.used, 1e-6), px = innerPx($('.track'));
      text($('.energy .hd .v'), `${s.fed < 1 ? `Work ${Math.round(s.fed * 100)}% · ` : ''}${num(b.used)} / ${num(b.capacity)} E/s`, `v ${b.short > 0 ? 'bad' : ''}`);
      for (const { k, e } of b.sources) {
        if (!SRC[k]) continue;
        const i = $(`.track .s-${k}`), f = e / scale, room = fit(f * px, SRC[k][1], num(e)), t = label(room, SRC[k][1], num(e));
        i.style.width = pct(f);
        if (said[k] !== `${room}${t}`) [said[k], i.querySelector('em')!.textContent] = [`${room}${t}`, t], i.classList.toggle('bare', room < 1);
        text($(`.li.src-${k} .v`), num(e));
        $(`.li.src-${k}`).classList.toggle('zero', e < 0.05);
      }
      $('.s-idle').style.width = pct(b.idle / scale);
      text($('.li.src-idle .v'), num(b.idle));
      $('.li.src-idle').classList.toggle('zero', b.idle < 0.05);
      for (const { k, e } of b.uses) {
        if (!USES[k]) continue;
        text($(`.li.use-${k} .v`), num(e));
        $(`.li.use-${k}`).classList.toggle('zero', e < 0.05);
      }
      $('.energy u').style.cssText = `left:${pct(b.capacity / scale)};width:${pct(b.short / scale)}`;
      $('.need').style.left = pct(Math.min(b.used, scale) / scale);

      // Stocks: amount and net rate a minute (income and spend smoothed: slots.ts track), fuel's time left, home mines.
      for (const k of STOCK) {
        const r = rates[k];
        [r.inc, r.out, r.home] = [track(r.inc, s.got[k], wall), track(r.out, s.got[k] - s[k], wall), track(r.home, s.home[k], wall)];
      }
      const lasts = fuelLeft(s.spare, rate('fuel').out), left = Number.isFinite(lasts) ? span(lasts) : '';
      for (const k of STOCK) [text($(`.st.${k} .n`), `${Math.floor(s[k])}`), text($(`.st.${k} .r`), perMin(rate(k).net))];
      const fc = `cell st fuel ${s.burn > 0 && s.spare <= 0 ? 'bad' : s.fuel < FUEL_RESERVE ? 'warn' : ''}`; // reactors dimming: red; under the reserve: amber
      if ($('.st.fuel').className !== fc) $('.st.fuel').className = fc;
      // The summary: the fuel's time left while the reactors burn, the home mines; phones fold the amounts in (ore, fuel).
      const ho = rate('ore').home, hv = rate('vol').home;
      text($('.stocks .hd .v'), PHONE.matches ? `Ore ${Math.floor(s.ore)} · Fuel ${left || Math.floor(s.fuel)}`
        : `${left ? `Fuel ${left} · ` : ''}Home mines ${s.homeIdle ? 'paused' : `${signed(ho * 60)}/min`}`);
      text($('.home .t'), s.homeIdle ? `Paused · ${IDLE[s.homeIdle][0]}` : `${signed(ho * 60)} ore/min${hv > 1e-4 ? ` · ${signed(hv * 60)} vol` : ''}`);
      $('.row.home').classList.toggle('idle', !!s.homeIdle);
      for (const k of STOCK) {
        const r = rate(k);
        text($(`.tr.in-home .${k}`), signed(r.home * 60));
        text($(`.tr.in-other .${k}`), signed(r.other * 60));
        text($(`.tr.out .${k}`), signed(-r.out * 60));
      }

      // Fleet: one row per class slots.ts returns (built only when the set changes), one pip per ship (its own reload), faint
      // hollow ones up to the cap.
      const keys = SLOTS.filter((k) => SHIP[k] && s.slots[k] && (s.slots[k].cap || s.slots[k].pips.length));
      if (keys.join() !== ships) {
        $('.ships').innerHTML = SLOTS.map((k) => !keys.includes(k) ? '' : `<div class="row ship ${k}" data-tip="fleet-${k}">${SHIP[k].art}<em class="lb">${SHIP[k].name}</em><span class="pips"></span><span class="v"></span></div>`).join('');
        ships = keys.join();
        for (const k in shown) delete shown[k];
      }
      for (const k of keys) {
        const q = s.slots[k], g = $(`.ship.${k}`), was = shown[k];
        g.className = `row ship ${k} ${s.active ? q.look : 'none'}`; // an empty magazine is 'none' (slots.ts)
        text(g.querySelector('.v')!, `${q.n}/${q.cap}`);
        const hollow = Math.max(0, q.cap - q.pips.length), key = `${q.pips.length}/${hollow}`;
        if (was?.key !== key) {
          g.querySelector('.pips')!.innerHTML = '<i></i>'.repeat(q.pips.length) + '<i class="e"></i>'.repeat(hollow);
          shown[k] = { key, p: [] };
        }
        const pips = g.querySelectorAll<HTMLElement>('.pips > i:not(.e)'), seen = shown[k].p;
        q.pips.forEach((v, i) => {
          if (seen[i] === undefined || Math.abs(v - seen[i]) >= 0.125 || (v >= 1 && seen[i] < 1) || (v <= 0 && seen[i] > 0)) {
            seen[i] = v;
            pips[i].style.setProperty('--p', v.toFixed(3));
          }
        });
      }
      // Yard: what it builds and its progress; the cost while it waits for ore (amber); idle. The header: ready ships, the yard.
      const y = s.yard, ready = keys.reduce((a, k) => a + s.slots[k].pips.filter((v) => v >= 1).length, 0);
      text($('.fleet .hd .v'), `${PHONE.matches ? `Shield ${s.shield > 0 ? `${Math.round(charge * 100)}%` : 'down'} · ` : ''}${ready} ready ·${!y ? 'Yard idle' : y.wait ? `${cap1(y.kind)} needs ${Math.ceil(y.ore)} ore` : `${cap1(y.kind)} ${Math.round(y.prog * 100)}%`}`);
      text($('.job .lb'), y ? cap1(y.kind) : '');
      $('.job i').style.width = pct(y?.prog ?? 0);
      text($('.yard .v'), !y ? 'idle' : y.wait ? `${Math.ceil(y.ore)} ore` : `${Math.round(y.prog * 100)}%`, `v ${y?.wait ? 'warn' : ''}`);
    },
    destroy() {
      untip();
      el.remove();
    },
  };
}
