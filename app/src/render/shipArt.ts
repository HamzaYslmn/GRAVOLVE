// Ship art for the three factions (docs/shipsandflight.md), redrawn from the concept sheets in .claude/ship-concepts/ (v2: you,
// pirates; v3: rivals). SVG markup in a 160 × 100 box, nose +x, baked once by Pixi Graphics.svg in render/tech.ts.
// Large value planes survive game scale.
const n = (v: number) => +v.toFixed(2);
// Absolute M/L/C/Q/Z paths only; every second coordinate is y.
const mirror = (d: string) => {
  let i = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (v) => (i++ % 2 ? String(n(100 - Number(v))) : v));
};
const pair = (d: string) => `${d} ${mirror(d)}`;
const path = (d: string, fill: string, rim?: string, width = 1) =>
  `<path d="${d}" fill="${fill}"${rim ? ` stroke="${rim}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"` : ''}/>`;
const oval = (x: number, y: number, rx: number, ry: number, fill: string, opacity = 1) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}/>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const linear = (id: string, dark: string, light: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.5" stop-color="${dark}"/><stop offset="1" stop-color="${light}"/></linearGradient>`;
const radial = (id: string, light: string, dark: string) =>
  `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`;
const garden = (id: string) => radial(id, '#6cf0a0', '#1f4a35');

const YD = `<defs>${linear('yHull', '#1f4a5a', '#5fb4cc')}${garden('yGarden')}</defs>`;
const yh = (d: string, fill = 'url(#yHull)', width = 1.2) => path(d, fill, '#7fe8ff', width);
const yEngine = (x: number, y = 50, size = 3) => oval(x - 2, y, n(size * 1.9), size, '#7fe8ff') + oval(x - 1, y, size, n(size * 0.65), '#e8fbff');
const nav = (x: number, y: number) =>
  oval(x, y, 2.3, 2.3, '#ff6b6b', 0.3) + oval(x, y, 1.1, 1.1, '#ff6b6b') +
  oval(x, 100 - y, 2.3, 2.3, '#6cf0a0', 0.3) + oval(x, 100 - y, 1.1, 1.1, '#6cf0a0');
const ySeam = (d: string) => path(d, 'none', '#12303c', 0.9);

// The rocket (both sides; guns.ts createRockets): a 4:1 pale tube, a nose cone a quarter of its length, two swept tail fins
// spanning 2.2 × its width and one band, nose, fins and band in the side's hue so it reads at 14 px; a dark nozzle bell.
const rocket = (hue: string, deep: string) =>
  path(pair('M24 36 L15 18 Q15 16 18 16 L27 16 Q30 16 32 19 L50 36Z'), hue, deep, 1.4) + path('M21 41 L12 37 L12 63 L21 59Z', '#3a4650', '#1d252b', 1) +
  path('M20 37 Q20 35 23 35 L110 35 L110 65 L23 65 Q20 65 20 63Z', '#e3edf2', '#8fa6b2', 1.4) + rect(23, 39, 87, 5, '#ffffff', 2.5) + rect(23, 57, 87, 4, '#b9cad3', 2) +
  rect(84, 35, 7, 30, hue) + path('M110 35 Q130 37 140 50 Q130 63 110 65Z', hue, deep, 1.4) + path('M24 50 L52 50', 'none', deep, 2.5);

const YOU = finish({
  // T-shaped sensor beam and broad stern crossbar.
  probe: YD + yEngine(62, 50, 2.5) + yh('M67 33 Q62 33 62 38 L62 44 L65 44 L65 56 L62 56 L62 62 Q62 67 67 67 L71 67 Q75 67 75 62 L75 59 Q75 56 81 56 L103 56 Q108 56 108 50 Q108 44 103 44 L81 44 Q75 44 75 41 L75 38 Q75 33 71 33Z') +
    path('M64 38 Q64 35 69 35 L72 35 L72 43 Q72 47 78 47 L104 47 L104 50 L72 50 L72 39Z', '#5fb4cc') +
    rect(61, 45, 4, 10, '#1f4a5a', 1.5) + rect(87, 46.5, 19, 7, '#1f4a5a', 3.5) + rect(88.5, 48, 15.5, 4, '#e8fbff', 2) + ySeam('M75 44.5 L75 55.5 M65 41 L72 41 M65 59 L72 59') + nav(68, 36.5),

  // Clipped cargo hexagon, three ore wells and a blunt intake.
  miner: YD + yEngine(51) + yh('M51 43 L61 32 Q63 30 67 30 L75 30 Q77 34 80 34 L86 34 Q89 34 91 30 L101 30 Q104 30 107 33 L117 42 L117 58 L107 67 Q104 70 101 70 L91 70 Q89 66 86 66 L80 66 Q77 66 75 70 L67 70 Q63 70 61 68 L51 57 L54 57 L54 43Z') +
    path(pair('M53 42 L64 33 L74 33 L77 38 L101 38 Q106 38 112 43 L106 46 L63 46 Q59 41 53 44Z'), '#5fb4cc') +
    path('M58 45 Q62 40 68 40 L98 40 Q106 40 110 45 L110 55 Q106 60 98 60 L68 60 Q62 60 58 55Z', '#2f7088') +
    [68, 83, 98].map((x) => oval(x, 50, 7.7, 7.7, '#5fb4cc') + oval(x, 50, 6.5, 6.5, '#12303c') + path(`M${x - 3.5} 48 Q${x - 3} 45 ${x + 1} 45`, 'none', '#7fe8ff', 1.1)).join('') +
    rect(110, 42, 6, 16, '#1f4a5a', 2.5) + [45, 49, 53].map((y) => rect(112, y, 3, 2, '#e8fbff', 0.8)).join('') + rect(51, 45, 3, 10, '#1f4a5a', 1) + ySeam('M64 33 L64 38 M101 31 L101 38 M64 67 L64 62 M101 69 L101 62') + nav(64, 34),

  // Straight cross-wing, narrow fuselage and long white canopy.
  fighter: YD + yEngine(46, 50, 3) + yh('M47 40 Q47 39 50 39 L59 39 Q67 41 67 35 L67 23 Q67 20 71 20 L77 20 Q81 20 81 24 L81 39 Q81 43 88 43 C102 42 114 44 122 48 Q125 50 122 52 C114 56 102 58 88 57 Q81 57 81 61 L81 76 Q81 80 77 80 L71 80 Q67 80 67 77 L67 65 Q67 59 59 61 L50 61 Q47 61 47 60 L52 57 L54 57 L54 43 L52 43Z') +
    path(pair('M69 23 L74 23 L74 38 Q74 45 64 45 L51 44 L54 41 L61 42 Q69 43 69 35Z'), '#5fb4cc') +
    path('M54 46 L77 46 Q82 45 88 45 C104 44 117 47 122 50 C117 53 104 56 88 55 Q82 55 77 54 L54 54Z', '#2f7088') +
    oval(101, 50, 16, 4.8, '#1f4a5a') + oval(102, 50, 14, 3.4, '#e8fbff') + rect(48, 43, 6, 14, '#1f4a5a', 2.5) + rect(68.5, 27, 11, 2.6, '#7fe8ff', 1.3) + rect(68.5, 70.4, 11, 2.6, '#7fe8ff', 1.3) + ySeam('M67.5 39 L80.5 39 M67.5 61 L80.5 61 M60 46 L60 54') + nav(74, 23),

  // One shield hull with nested curved armor bands and recessed engines.
  frigate: YD + yEngine(26, 43, 2.8) + yEngine(26, 57, 2.8) + yh('M26 36 L36 28 L54 28 Q59 28 62 25 L107 25 Q115 25 122 30 L139 40 Q143 43 143 50 Q143 57 139 60 L122 70 Q115 75 107 75 L62 75 Q59 72 54 72 L36 72 L26 64 L26 61 L33 61 Q37 61 37 57 Q37 53 33 53 L27 53 L27 47 L33 47 Q37 47 37 43 Q37 39 33 39 L26 39Z') +
    path('M37 39 L50 31 L63 31 Q86 36 91 50 Q86 64 63 69 L50 69 L37 61 L41 57 L41 43Z', '#2f7088') +
    path('M64 27 L107 26.2 Q114.5 26.2 121 31 L138 41 Q141.8 43.5 141.8 50 Q141.8 56.5 138 59 L121 69 Q114.5 73.8 107 73.8 L64 73 Q91 65 91 50 Q91 35 64 27Z', '#12303c') +
    [0, 20, 40].map((dx) => yh(`M${62 + dx} 26 L${75 + dx} 26 Q${104 + dx} 37 ${104 + dx} 50 Q${104 + dx} 63 ${75 + dx} 74 L${62 + dx} 74 Q${91 + dx} 65 ${91 + dx} 50 Q${91 + dx} 35 ${62 + dx} 26Z`, '#5fb4cc', 0.9)).join('') +
    rect(40, 46, 59, 8, '#1f4a5a', 4) + rect(50, 48, 46, 4, '#7fe8ff', 2) + rect(58, 49, 30, 2, '#e8fbff', 1) + nav(37, 31),

  // Enclosed greenhouse capsule with short paddles and two canopy ribs.
  colonizer: YD + yEngine(42, 50, 3) + yh('M43 43 Q46 30 63 30 L70 30 L70 27 Q70 23 80 23 L89 23 Q99 23 99 27 L99 30 L106 30 Q126 30 128 50 Q126 70 106 70 L99 70 L99 73 Q99 77 89 77 L80 77 Q70 77 70 73 L70 70 L63 70 Q46 70 43 57 L46 57 L46 43Z') +
    path('M48 42 Q54 33 65 33 L105 33 Q117 34 122 43 L121 57 Q117 66 105 67 L65 67 Q54 67 48 58Z', '#2f7088') +
    oval(85, 50, 32, 15.5, '#1f4a5a') + oval(85, 50, 30, 13.8, 'url(#yGarden)') +
    [67, 84, 102].map((x) => oval(x, 50, 7.5, 7.5, '#6cf0a0') + oval(x + 2, 50, 4.5, 6, '#5fbf77')).join('') +
    path('M57 46 Q68 37 85 38 Q102 37 113 46', 'none', '#6cf0a0', 1.6) +
    path('M75 33 C67 43 67 57 75 67 M96 33 C104 43 104 57 96 67', 'none', '#1f4a5a', 4) +
    path('M75 33 C67 43 67 57 75 67 M96 33 C104 43 104 57 96 67', 'none', '#7fe8ff', 2.4) +
    rect(71, 24, 27, 7, '#2f7088', 3.5) + rect(71, 69, 27, 7, '#2f7088', 3.5) + rect(42, 43, 4, 14, '#1f4a5a', 1.5) + path('M58 49 Q60 44 66 42', 'none', '#c8f6ff', 1.2) + ySeam('M56 34 L56 40 M114 34 L114 40 M56 66 L56 60 M114 66 L114 60') + nav(84, 26.5),

  // Blunt capital hull, deep paired launch recesses and an aft oval reactor.
  carrier: YD + yEngine(14, 50, 3.3) + yh('M14 35 Q14 30 20 27 L29 21 L65 21 Q69 21 72 25 Q75 28 80 28 L106 28 Q111 28 114 24 Q117 21 121 21 L128 21 C144 21 153 34 153 50 C153 66 144 79 128 79 L121 79 Q117 79 114 76 Q111 72 106 72 L80 72 Q75 72 72 75 Q69 79 65 79 L29 79 L20 73 Q14 70 14 65 L17 65 L17 35Z', 'url(#yHull)', 1.4) +
    path(pair('M16 40 Q29 31 48 31 Q61 31 65 39 L130 39 Q140 39 145 46 L151 46 Q150 28 129 24 L123 24 Q119 36 110 39 L79 39 Q68 39 66 24 L47 24 Q39 29 36 30 Q23 30 16 36Z'), '#5fb4cc') +
    path(pair('M69 23 Q74 33 81 33 L106 33 Q114 32 119 23 L113 35 Q111 38 105 38 L80 38 Q73 38 69 23Z'), '#1f4a5a') +
    rect(78, 29, 30, 6, '#2f7088', 3) + rect(78, 65, 30, 6, '#2f7088', 3) + rect(81, 30.5, 24, 3, '#e8fbff', 1.5) + rect(81, 66.5, 24, 3, '#e8fbff', 1.5) +
    rect(45, 46, 98, 8, '#5fb4cc', 2.5) + rect(64, 48.8, 76, 2.4, '#12303c', 1) + [72, 86, 100, 114, 128].map((x) => rect(x, 49.2, 5, 1.6, '#e8fbff', 0.8)).join('') + oval(44, 50, 21, 14, '#1f4a5a') + oval(44, 50, 17, 11, '#5fb4cc') + oval(44, 50, 13, 8, '#2f7088') + oval(44, 50, 10, 6, '#7fe8ff') + oval(44, 50, 6.5, 3.5, '#e8fbff') + rect(14, 40, 3, 20, '#1f4a5a', 1.5) + nav(29, 25),
  rocket: rocket('#7fe8ff', '#1f4a5a'),
});

// Approved v3 rivals: open blade silhouettes and central diamond lights.
const RD = `<defs>${linear('rShell', '#3b2763', '#8a63d6')}</defs>`;
const rh = (d: string, fill = 'url(#rShell)', width = 1.1) =>
  path(d, fill, '#b48cff', width).replace('stroke-linejoin="round" stroke-linecap="round"', 'stroke-linejoin="bevel"');
const rStern = (x: number, hub: number, size = 2.5) =>
  rh(`M${x} ${50 - size} L${hub} ${50 - size * 1.8} L${hub + 4} 50 L${hub} ${50 + size * 1.8} L${x} ${50 + size}Z`, '#3b2763', 0.7) +
  rect(x, 50 - size, 1, size * 2, '#b48cff');
const rCore = (x: number, rx: number, ry: number) =>
  oval(x, 50, rx + 3, ry + 2, '#b48cff', 0.16) + oval(x, 50, rx + 1, ry + 1, '#b48cff', 0.24) +
  path(`M${x - rx} 50 L${x} ${50 - ry} L${x + rx} 50 L${x} ${50 + ry}Z`, '#f1e6ff', '#b48cff', 0.8);

const RIVAL = finish({
  // Four swept kite panels, deep notches and a tiny diamond hub.
  probe: RD + rStern(68, 80, 1.8) +
    rh(pair('M72 26 L85 33 L82 36 L88 49 L78 45 L66 46 Q76 34 72 26Z M106 26 L99 44 L89 49 L94 38 Q96 35 93 34Z')) +
    path(pair('M72 26 L82 36 L78 45 L66 46 Q76 34 72 26Z'), '#55398a') +
    path(pair('M72 26 L85 33 L82 36Z M106 26 L98 38 L89 49 L99 44Z'), '#8a63d6') + path(pair('M82 36 L88 49 L78 45Z'), '#2a1a4a') +
    path(pair('M72 26 L85 33 L83.5 34.5 L75 30Z M106 26 L99 44 L98.5 41 L103.5 30Z'), '#d6bcff') +
    rh('M78 50 L88 44 L98 50 L88 56Z', '#55398a', 0.8) + rCore(88, 4.2, 2.8),

  // Open hooked blades cradle one amber crystal, ahead of the small light.
  miner: RD + rStern(58, 72) +
    rh(pair('M76 21 L99 28 L117 45 L99 37 L86 37 L74 50 L65 47 L57 46 L78 27Z')) +
    path(pair('M76 21 L99 28 L117 45 L99 37 L84 32Z'), '#8a63d6') + path(pair('M76 21 L99 28 L117 45 L110 40.5 L98 30.5 L79 23.5Z'), '#d6bcff') +
    path(pair('M78 27 L84 32 L68 46 L57 46Z'), '#55398a') +
    rh('M68 50 L83 35 L86 37 L75 50 L86 63 L83 65Z', '#3b2763', 0.8) +
    rh('M72 50 L79 44 L86 50 L79 56Z', '#55398a', 0.8) + rCore(79, 4, 3.2) +
    oval(99, 50, 13, 9.5, '#e8b04a', 0.14) + path('M88 50 L99 42 L110 50 L99 58Z', '#e8b04a', '#ffd27a', 1) +
    path(pair('M88 50 L99 42 L96 50Z M99 42 L110 50 L103 50Z'), '#ffd27a') +
    path('M96 50 L99 42 L103 50 L99 58Z', '#e8b04a'),

  // Tall hooked moth wings, open forward cutouts and a short diamond beak.
  fighter: RD + rStern(57, 73) +
    rh(pair('M53 10 C77 10 105 25 115 39 Q97 29 91 40 L88 43 L74 45 L56 46 L69 30 L75 34 Q71 19 53 10Z')) +
    path(pair('M53 10 L85 24 L77 43 L56 46 L69 30 L75 34 Q71 19 53 10Z'), '#55398a') +
    path(pair('M53 10 C77 10 105 25 115 39 L98 31 L85 24Z'), 'url(#rShell)') + path(pair('M56 46 L69 30 L75 34 L74 45Z'), '#2a1a4a') +
    path(pair('M53 10 C77 10 105 25 115 39 L107 33.5 C96 23 78 14.5 62 12.5Z'), '#d6bcff') +
    path(pair('M85 24 L98 31 L91 40 L88 43 L77 43Z'), '#8a63d6') +
    rh('M67 50 L84 42 L102 50 L84 58Z', '#55398a', 0.9) +
    path(pair('M67 50 L84 42 L102 50 L84 46Z'), '#8a63d6') +
    rh('M99 50 L106 44 L120 50 L106 56Z', 'url(#rShell)', 0.9) + rCore(84, 7, 2.8),

  // Six-point shield: overlapping triangular carapaces and a split prow.
  frigate: RD + rStern(47, 65, 3) +
    rh('M46 45 L61 26 L96 23 L121 36 L140 46 L124 47 L115 50 L124 53 L140 54 L121 64 L96 77 L61 74 L46 55 L58 50Z') +
    rh(pair('M77 9 L112 16 L128 34 L109 26 L93 23Z')) +
    path(pair('M77 9 L112 16 L93 23Z'), '#8a63d6') +
    rh(pair('M109 26 L142 46 L125 47 L127 43 L98 44 L96 41Z'), '#55398a') +
    path(pair('M109 26 L142 46 L127 43Z'), '#8a63d6') +
    rh(pair('M43 46 L53 34 L59 44 L88 49 L61 49Z'), '#2a1a4a', 0.8) +
    rh(pair('M41 15 L110 26 L89 40 L59 44Z')) +
    path(pair('M41 15 L110 26 L89 40Z'), '#8a63d6') + path(pair('M41 15 L110 26 L103 27.5 L51 19.5Z M77 9 L112 16 L128 34 L121 29 L109 18.5 L85 12Z'), '#d6bcff') +
    rh('M72 50 L88 40 L105 50 L88 60Z', '#55398a', 0.8) + rCore(88, 8.5, 4),

  // Sharp radial petals frame a green diamond garden and a brief pointed prow.
  colonizer: `<defs>${linear('rShell', '#3b2763', '#8a63d6')}${garden('rGarden')}</defs>` + rStern(53, 60, 2.5) +
    rh('M57 50 L83 29 L109 50 L83 71Z', '#3b2763') +
    rh(pair('M55 23 L60 38 L49 47 L62 44 L73 41 L66 30Z M83 12 L77 29 L73 41 L65 31 L75 25Z M83 12 L91 30 L94 41 L102 31 L92 25Z M109 24 L104 39 L94 41 L107 45 L116 44 L111 36Z')) +
    path(pair('M55 23 L66 30 L73 41 L60 38Z M83 12 L77 29 L73 41 L75 25Z M109 24 L104 39 L94 41 L102 31Z'), '#8a63d6') +
    path(pair('M83 12 L92 25 L102 31 L94 41 L91 30Z M55 23 L60 38 L49 47Z'), '#55398a') +
    rh('M109 44 L125 50 L109 56 L113 50Z', '#55398a', 0.9) +
    path(pair('M109 44 L125 50 L113 50Z'), '#8a63d6') +
    path('M61 50 L83 33 L105 50 L83 67Z', 'url(#rGarden)', '#6cf0a0', 1.2) +
    path(pair('M63 50 L83 35 L76 45Z M87 43 L103 50 L94 48Z'), '#6cf0a0') +
    path(pair('M67 48 L72 44 L77 48 L73 48 L73 50 L71 50 L71 48Z M89 47 L93 44 L98 48 L94 48 L94 50 L92 50 L92 48Z'), '#1f4a35') + rCore(83, 2, 2.5),

  // Blade crown with two open hangars, inset fighters and three claw points.
  carrier: RD + rStern(48, 67, 3) +
    rh('M56 50 L75 42 L88 43 L112 48 L125 48 L132 50 L125 52 L112 52 L88 57 L75 58Z', '#55398a') +
    rh(pair('M24 19 L66 17 L71 23 L46 22 L64 39 L75 42 L65 44 L43 45 L50 36 L42 26Z')) +
    path(pair('M24 19 L46 22 L64 39 L65 44 L50 36 L42 26Z'), '#8a63d6') +
    rh(pair('M43 45 L65 38 L75 40 L101 35 L116 39 L94 45 L83 43 L68 47Z'), '#55398a', 0.8) +
    rh(pair('M54 7 L82 13 L107 22 L116 39 L100 35 L92 28 L71 23Z')) +
    path(pair('M54 7 L82 13 L107 22 L92 28 L71 23Z'), '#8a63d6') + path(pair('M54 7 L82 13 L107 22 L102 23 L80 15.5 L62 10.5Z M24 19 L66 17 L64 19.5 L32 20.5Z'), '#d6bcff') +
    path(pair('M107 22 L116 39 L100 35 L92 28Z'), '#55398a') +
    rh(pair('M114 40 L126 34 L151 41 L135 41 L128 47 L117 47 L131 39Z'), '#55398a', 0.9) +
    path(pair('M126 34 L151 41 L135 41Z'), '#8a63d6') +
    rh('M124 50 L134 45 L155 50 L134 55Z', 'url(#rShell)', 0.9) +
    [73, 83, 93].map((x) => path(pair(`M${x} 28 L${x + 5} 30 L${x} 32 L${x + 1.5} 30Z`), '#d6bcff')).join('') +
    rh('M74 50 L87 39 L100 50 L87 61Z', '#55398a', 1) +
    rh('M78 50 L87 44 L96 50 L87 56Z', '#3b2763', 0.7) + rCore(87, 6, 3),
  rocket: rocket('#b48cff', '#3b2763'),
});

const PIRATE_SCALE = { raider: 1.15, hauler: 1.15 };
const PD = `<defs>${linear('pPlate', '#5a4c3a', '#8a7a60')}</defs>`;
const INK = '#1c1712', RUST_DARK = '#8a4428';
const ph = (d: string, fill = 'url(#pPlate)', width = 1.2) => path(d, fill, '#d9cfbf', width);
const hazards = (x: number, y: number, count: number, size = 4) =>
  path(Array.from({ length: count }, (_, i) => `M${x + i * size * 1.7} ${y} L${x + i * size * 1.7 + size} ${y} L${x + i * size * 1.7} ${y + size * 1.4} L${x + i * size * 1.7 - size} ${y + size * 1.4}Z`).join(' '), '#e8b04a');
// Turret pair: a light barrel under a ringed dome, mirrored across the keel.
const gun = (x: number, y: number, r: number, length: number) => [y, 100 - y].map((cy) =>
  rect(x, n(cy - r * 0.3), length, n(r * 0.6), '#d9cfbf', 0.5) +
  oval(x, cy, r, r, INK) + oval(x, cy, n(r * 0.8), n(r * 0.8), '#8a7a60') + oval(x, cy, n(r * 0.48), n(r * 0.48), '#3a3229') +
  oval(n(x - r * 0.3), n(cy - r * 0.3), n(r * 0.26), n(r * 0.26), '#f0e6d2')).join('');
const rust = (d: string, seams: string) => path(d, '#c4683c', RUST_DARK, 0.8) + path(seams, 'none', RUST_DARK, 0.8);
const seam = (d: string) => path(d, 'none', INK, 0.9);
const rivets = (...at: number[][]) => at.map(([x, y]) => oval(x, y, 0.9, 0.9, '#d9cfbf')).join('');
const nozzles = (x: number, ...ys: number[]) => ys.map((y) => ph(`M${x} ${y - 4} L${x + 8} ${y - 3.5} L${x + 8} ${y + 3.5} L${x} ${y + 4}Z`, '#3a3229', 0.8)).join('');

const PIRATE = finish({
  // Chunky gunboat: brick-rust shoulder plate, amber cab and two bolted turret pods.
  raider: PD + nozzles(47, 43, 57) +
    ph('M54 37 L59 33 L97 33 L106 38 L113 45 L113 55 L106 62 L97 67 L59 67 L54 63Z', '#3a3229', 1.3) +
    rust('M58 37 L71 37 L71 39 L95 39 L99 44 L95 49 L62 49 L58 45Z', 'M58 43 L98 43 M68 37 L68 43 M81 39 L81 43 M74 43 L74 49 M88 43 L88 49') +
    path('M58 53 L79 53 L79 65 L60 65 L58 62Z', '#5a4c3a') + path('M60 55 L77 55 L77 59 L60 59Z', '#8a7a60') + seam('M56 51 L98 51 M69 53 L69 65') +
    rect(81, 53.5, 21, 7.5, INK, 1) + hazards(86, 55, 3, 3.2) +
    path('M99 42 L108 44 L111 47 L111 53 L104 55 L99 52Z', INK) + path('M100.5 44 L107 45.5 L109.5 48 L109.5 52 L104 53.5 L100.5 51Z', '#ffd9a0') + path('M100.5 48.5 L109.5 49.5 L109.5 52 L104 53.5 L100.5 51Z', '#e8b04a') +
    rivets([61, 62.5], [76, 62.5], [107, 58], [57, 40]) +
    ph(pair('M72 36 L72 24 L76 20 L90 20 L94 24 L94 36Z'), '#5a4c3a', 1.1) + path(pair('M74 28 L74 25 L77 22 L89 22 L92 25 L92 28Z'), '#8a7a60') + gun(83, 28, 5, 19),

  // Fat hex freighter: a dark bay of three framed crates, a bright bulkhead band and a slit-window cab.
  hauler: PD + nozzles(39, 43, 57) +
    ph('M44 37 L50 31 L57 31 L62 24 L91 24 L96 30 L103 35 L111 38 L120 45 L120 55 L111 62 L103 65 L96 70 L91 76 L62 76 L57 69 L50 69 L44 63Z', '#3a3229', 1.3) +
    path('M47 38 L51 34 L58 34 L63 27 L90 27 L94 32 L100 37 L100 63 L94 68 L90 73 L63 73 L58 66 L51 66 L47 62Z', '#5a4c3a') +
    path('M63 27 L75 27 L73 33 L59 33Z M80 67.5 L93 67.5 L90 73 L78 73Z', INK) + hazards(65, 28.4, 3, 2.2) + hazards(82, 68.7, 3, 2.2) +
    rust('M77 27 L90 27 L94 32 L98.5 36.5 L82 36.5 L80 33Z', 'M80 32 L94 32 M85 27 L85 32 M89 32 L89 36.5') + rust('M55 63.5 L74 63.5 L77 67 L75 73 L63 73 L58 66Z', 'M58 68 L76 68 M66 63.5 L66 68 M70 68 L70 73') +
    rect(49, 39, 47.5, 22, INK, 3) +
    [51, 66, 81].map((x, i) => rect(x, 41, 13, 18, '#d9cfbf', 2) + rect(x + 0.8, 41.8, 11.4, 16.4, i === 1 ? '#c4683c' : '#8a7a60', 1.5) + rect(x + 2.8, 44, 7.4, 12, i === 1 ? RUST_DARK : '#3a3229', 1) + rect(x + 3.8, 45, 5.4, 10, i === 1 ? '#c4683c' : 'url(#pPlate)', 0.6)).join('') +
    rect(96, 33, 6, 34, '#d9cfbf', 1) + rect(98.2, 36, 1.6, 28, '#8a7a60') +
    path('M103 38.5 L110 40.5 L118 46 L118 54 L110 59.5 L103 61.5Z', '#5a4c3a') + rust('M103 55.5 L113 57.5 L110 59.5 L103 61.5Z', 'M107 56.5 L107 60.5') + rect(107, 45.5, 11.5, 9, INK, 1.5) + rect(108.5, 47, 9, 2.8, '#ffd9a0', 0.8) + rect(108.5, 50.6, 9, 2.2, '#e8b04a', 0.8) +
    rivets([53, 36.5], [53, 63.5], [104.5, 41], [104.5, 59], [66, 70], [88, 30]),

  // Long slab warship: three bolted turret pods a side, brick-rust repairs and a twin-slit prow.
  marauder: PD + nozzles(18, 35, 50, 65) +
    ph('M24 30 L28 27 L138 27 L146 33 L151 40 L151 60 L146 67 L138 73 L28 73 L24 70Z', '#3a3229', 1.3) +
    path('M30 36 L66 36 L70 33 L108 33 L112 37 L140 37 L140 63 L112 63 L108 67 L70 67 L66 64 L30 64Z', '#5a4c3a') +
    rust('M32 36 L50 36 L50 41 L60 41 L60 49 L32 49Z', 'M32 42.5 L50 42.5 M41 36 L41 42.5 M46 42.5 L46 49 M55 41 L55 49') +
    rust('M64 52 L86 52 L86 58 L78 58 L78 66 L64 66Z', 'M64 59 L78 59 M71 52 L71 59 M82 52 L82 58') +
    rust('M108 37 L128 37 L128 44 L120 44 L120 50 L108 50Z', 'M108 43.5 L120 43.5 M114 37 L114 43.5 M124 37 L124 44') + rust('M114 57 L127 57 L127 66 L114 66Z', 'M114 61.5 L127 61.5') +
    ph('M34 54 L56 54 L56 64 L34 64Z', 'url(#pPlate)', 0.6) + path('M68 36 L81 36 L81 42 L68 42Z M130 52 L140 52 L140 63 L130 63Z', '#8a7a60') +
    seam('M28 51 L62 51 M110 53 L140 53 M62 35 L62 65 M110 35 L110 65 M45 54 L45 64') +
    rect(83.5, 44, 23, 8.5, INK, 1) + hazards(89, 45.7, 3, 3.6) +
    path('M141 38 L147 38 L150 41 L150 59 L147 62 L141 62Z', '#5a4c3a') + rect(140, 41.5, 10.5, 5.5, INK, 1) + rect(140, 53, 10.5, 5.5, INK, 1) + rect(141.5, 42.9, 8, 2.7, '#ffd9a0', 0.6) + rect(141.5, 54.4, 8, 2.7, '#ffd9a0', 0.6) +
    rivets([29, 31], [29, 69], [37, 61], [53, 61]) +
    ph(pair('M41 33 L41 20 L45 16 L57 16 L61 20 L61 33Z M73 33 L73 17 L77 13 L97 13 L101 17 L101 33Z M114 33 L114 20 L118 16 L130 16 L134 20 L134 33Z'), '#5a4c3a', 1.2) +
    path(pair('M43 24 L43 21 L46 18 L56 18 L59 21 L59 24Z M75 21 L75 18 L78 15 L96 15 L99 18 L99 21Z M116 24 L116 21 L119 18 L129 18 L132 21 L132 24Z'), '#8a7a60') +
    gun(51, 24.5, 5.2, 16) + gun(87, 23.5, 6.5, 21) + gun(124, 24.5, 5.2, 16),
}, PIRATE_SCALE);

// Scale coordinates at generation time; emitted SVG never contains transforms.
function finish<T extends Record<string, string>>(ships: T, scales: Partial<Record<keyof T, number>> = {}): T {
  return Object.fromEntries(Object.entries(ships).map(([name, art]) => {
    const scale = scales[name as keyof T] ?? 1;
    const markup = art.replace(/<(path|rect|ellipse)\b[^>]*>/g, (tag) => {
      let i = 0;
      return tag.replace(/ d="([^"]*)"/, (_, d: string) => ` d="${d.replace(/-?\d+(?:\.\d+)?/g, (v) => {
        const center = i++ % 2 ? 50 : 80;
        return String(n(center + (Number(v) - center) * scale));
      }).replace(/ (?=[MLCQZ])/g, '')}"`).replace(/ (x|y|cx|cy|rx|ry|width|height|stroke-width)="([\d.]+)"/g, (_, attr: string, v: string) => {
        const center = attr === 'x' || attr === 'cx' ? 80 : attr === 'y' || attr === 'cy' ? 50 : 0;
        return ` ${attr}="${n(center + (Number(v) - center) * scale)}"`;
      });
    }).replace(/ stroke-linejoin="round" stroke-linecap="round"/g, '').replace(/ rx="0"/g, '');
    return [name, `<g stroke-linejoin="round" stroke-linecap="round">${markup}</g>`];
  })) as T;
}

export const SHIP_ART = { you: YOU, rival: RIVAL, pirate: PIRATE };

/** Engines by ship: [x, y, nozzle size] in the art box (scaled like the art); render/tech.ts drawShip puts the plumes there. */
const at = (scale: number, ...e: number[][]) => e.map(([x, y, s]) => [n(80 + (x - 80) * scale), n(50 + (y - 50) * scale), n(s * scale)]);
export const ENGINES: { [F in keyof typeof SHIP_ART]: Record<keyof (typeof SHIP_ART)[F], number[][]> } = {
  you: { probe: [[62, 50, 2.5]], miner: [[51, 50, 3]], fighter: [[46, 50, 3]], frigate: [[26, 43, 2.8], [26, 57, 2.8]], colonizer: [[42, 50, 3]], carrier: [[14, 50, 3.3]], rocket: [[12, 50, 3]] },
  rival: { probe: [[68, 50, 1.7]], miner: [[58, 50, 2.2]], fighter: [[57, 50, 2.2]], frigate: [[47, 50, 2.6]], colonizer: [[53, 50, 2.5]], carrier: [[48, 50, 3]], rocket: [[12, 50, 3]] },
  pirate: { raider: at(PIRATE_SCALE.raider, [48, 43, 3.4], [48, 57, 3]), hauler: at(PIRATE_SCALE.hauler, [40, 43, 3.4], [40, 57, 3.4]), marauder: [[20, 35, 3.6], [20, 50, 3.2], [20, 65, 3]] },
};
export const ART_W = 160;
export const ART_H = 100;
