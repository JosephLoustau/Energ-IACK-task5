(() => {
  // Pristine copy of the page, captured before rendering, for the HTML download.
  const SOURCE = '<!doctype html>\n' + document.documentElement.outerHTML;
  const D = JSON.parse(document.getElementById('report-data').textContent);
  const M = D.meta;
  const state = { strategy: M.selectedStrategy, comfort: '0', budget: M.defaultBudget, scc: M.defaultScc, sortKey: 'worksYear', sortDir: 1, query: '', showList: false, editing: false, texts: {} };
  // Text edits made in the report (contenteditable), saved with the HTML download.
  try { Object.assign(state.texts, JSON.parse(document.getElementById('report-texts')?.textContent || '{}')); } catch { /* no saved edits */ }
  const SLOT = { conservative: 1, ambitious: 2, custom: 3 };
  const color = (id) => `var(--s${SLOT[id] ?? 1})`;
  const byId = Object.fromEntries(D.strategies.map((s) => [s.id, s]));
  const last = (a) => a[a.length - 1];

  // ---------- formatting ----------
  const nf = (v, d = 0) => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const mchf = (v) => `${nf(v / 1e6, Math.abs(v) >= 1e8 ? 0 : 1)} MCHF`;
  const tco2 = (v) => `${nf(v)} tCO₂e`;
  const pct = (v) => `${nf(v * 100)} %`;
  const signed = (v, fmt) => v === 0 ? '=' : `${v > 0 ? '+' : '−'}${fmt(Math.abs(v))}`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Wording comes from texts.ts (M.texts); `{name}` placeholders are filled with formatted values.
  const fill = (template, vars = {}) => String(template).replace(/\{(\w+)\}/g, (_, k) => k in vars ? String(vars[k]) : '');
  const T = (key, vars) => key in M.texts ? fill(M.texts[key], vars) : `[${key}]`;
  const budgetLabel = (key) => key === 'none' ? 'sans plafond' : `${nf(Number(key) / 1e6)} MCHF/an`;
  const comfortLabel = (c) => c === '0' ? 'thermostat inchangé' : `thermostat −${c} °C`;

  // ---------- model accessors ----------
  const cur = (sid = state.strategy, c = state.comfort) => byId[sid].comfort[c];
  const plan = (sid = state.strategy, b = state.budget, c = state.comfort) => cur(sid, c).plans[b];
  const factor = (c = state.comfort) => Math.max(0, 1 - M.savingPerDegree * Number(c));
  const baselineCum = D.baseline * D.years.length;
  // tCO2e/yr avoided versus today once all works are done (thermostat + renovation).
  const yearlyAvoided = (p, c = state.comfort) => D.baseline - (D.baselineByComfort[c] - p.carbonSaved);
  // Social cost of carbon: emissions baseYear–horizon valued at state.scc CHF/t, undiscounted.
  const carbonCost = (t) => state.scc * t;
  const fullCost = (p) => p.totalCost + carbonCost(p.cumulative);
  const cohortOf = (due) => due === null ? 'safe' : due === M.baseYear ? 'now' : due <= M.baseYear + 5 ? 'five' : 'ten';
  const COHORTS = { now: `Dès ${M.baseYear}`, five: `${M.baseYear + 1}–${M.baseYear + 5}`, ten: `${M.baseYear + 6}–${M.baseYear + 10}`, safe: 'Aucun seuil franchi' };
  const area = D.buildings.reduce((s, b) => s + b.area, 0);

  // ---------- SVG charts ----------
  const CW = 680, CH = 260;
  const niceMax = (v) => { const p = 10 ** Math.floor(Math.log10(v || 1)); return Math.ceil(v / p) * p; };
  function axes(P, yMax, yFmt) {
    const sx = (i) => P.l + i / (D.years.length - 1) * (CW - P.l - P.r);
    const sy = (v) => CH - P.b - v / yMax * (CH - P.t - P.b);
    let g = [0, .25, .5, .75, 1].map((f) => f * yMax).map((v) => `<line class="grid" x1="${P.l}" x2="${CW - P.r}" y1="${sy(v)}" y2="${sy(v)}"/><text class="tick" x="${P.l - 8}" y="${sy(v) + 4}" text-anchor="end">${yFmt(v)}</text>`).join('');
    g += D.years.map((x, i) => x % 5 === 0 || i === 0 ? `<text class="tick" x="${sx(i)}" y="${CH - P.b + 16}" text-anchor="middle">${x}</text>` : '').join('');
    return { sx, sy, g: g + `<line class="axis" x1="${P.l}" x2="${CW - P.r}" y1="${sy(0)}" y2="${sy(0)}"/>` };
  }
  function lineChart({ series, unit, yFmt, tipFmt, label }) {
    const P = { t: 16, r: 150, b: 30, l: 52 };
    const { sx, sy, g } = axes(P, niceMax(Math.max(...series.flatMap((s) => s.values))), yFmt);
    const lines = series.map((s) => `<path class="line${s.dash ? ' dash' : ''}" style="stroke:${s.color}" d="${s.values.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join('')}"/>`).join('');
    const ends = series.map((s) => ({ s, y: sy(last(s.values)) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
    const labels = ends.map(({ s, y }) => `<circle class="dot" cx="${sx(D.years.length - 1)}" cy="${sy(last(s.values))}" r="3.5" style="fill:${s.color}"/><text class="end-label" x="${CW - P.r + 8}" y="${y + 4}">${esc(s.name)}</text>`).join('');
    const step = (CW - P.l - P.r) / (D.years.length - 1);
    const hits = D.years.map((year, i) => `<rect class="hit" x="${sx(i) - step / 2}" y="${P.t}" width="${step}" height="${CH - P.t - P.b}" data-x="${sx(i)}" data-tip="${esc(`<b>${year}</b>` + series.map((s) => `<div><i style="background:${s.color}"></i>${esc(s.name)} <b>${tipFmt(s.values[i])}</b></div>`).join(''))}"/>`).join('');
    return `<svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${esc(label)}"><text class="unit" x="${P.l - 8}" y="8" text-anchor="end">${unit}</text>${g}<line class="cross" x1="0" x2="0" y1="${P.t}" y2="${CH - P.b}"/>${lines}${labels}${hits}</svg>`;
  }
  function barChart({ values, fill, cap, label, tip }) {
    const P = { t: 16, r: 90, b: 30, l: 52 };
    const { sx, sy, g } = axes(P, niceMax(Math.max(...values, cap ?? 0)), (v) => nf(v / 1e6));
    const bw = Math.max(4, (CW - P.l - P.r) / D.years.length - 3);
    const bar = (x, y, w, h) => { const r = Math.min(3, h, w / 2); return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`; };
    const bars = values.map((v, i) => v > 0 ? `<path class="bar" style="fill:${fill}" d="${bar(sx(i) - bw / 2, sy(v), bw, sy(0) - sy(v))}" data-tip="${esc(tip(i))}"/>` : '').join('');
    const capLine = cap ? `<line class="cap" x1="${P.l}" x2="${CW - P.r}" y1="${sy(cap)}" y2="${sy(cap)}"/><text class="end-label" x="${CW - P.r + 8}" y="${sy(cap) + 4}">Plafond</text>` : '';
    return `<svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${esc(label)}"><text class="unit" x="${P.l - 8}" y="8" text-anchor="end">MCHF</text>${g}${bars}${capLine}</svg>`;
  }
  // Building map: shape = usage, size ∝ √SRE, colour given by `paint(i)`; 1st–99th percentile extent.
  function mapSvg(paint, tip, label) {
    const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(f * (s.length - 1))]; };
    const lats = D.buildings.map((b) => b.lat), lons = D.buildings.map((b) => b.lon), m = 0.004;
    const [la0, la1, lo0, lo1] = [q(lats, .01) - m, q(lats, .99) + m, q(lons, .01) - m, q(lons, .99) + m];
    const inside = (b) => b.lat >= la0 && b.lat <= la1 && b.lon >= lo0 && b.lon <= lo1;
    const k = Math.cos((la0 + la1) / 2 * Math.PI / 180), MW = CW, pad = 12;
    const scale = (MW - 2 * pad) / ((lo1 - lo0) * k || 1), MH = (la1 - la0) * scale + 2 * pad;
    const x = (lon) => pad + (lon - lo0) * k * scale, y = (lat) => pad + (la1 - lat) * scale;
    const order = D.buildings.map((_, i) => i).filter((i) => inside(D.buildings[i])).sort((a, b) => D.buildings[b].area - D.buildings[a].area);
    const marks = order.map((i) => {
      const b = D.buildings[i], r = 2.4 + 6.5 * Math.sqrt(Math.min(b.area, 25000) / 25000);
      return `<path class="pt" d="${M.shapes[b.use]}" transform="translate(${x(b.lon).toFixed(1)} ${y(b.lat).toFixed(1)}) scale(${r.toFixed(2)})" style="fill:${paint(i)}" data-tip="${esc(tip(i))}"/>`;
    }).join('');
    const outside = D.buildings.length - order.length;
    return { svg: `<svg class="chart map" viewBox="0 0 ${MW} ${MH.toFixed(0)}" role="img" aria-label="${esc(label)}">${marks}</svg>`, outside };
  }
  const shapeIcon = (use, fill = '#fff') => `<svg class="ico" viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true"><path d="${M.shapes[use]}" style="fill:${fill}"/></svg>`;
  const buildingTip = (i, extra) => { const b = D.buildings[i]; return `<b>${esc(b.name)}</b><div>${esc(b.district)} · ${esc(b.use)} · ${nf(b.area)} m²</div><div>${extra}</div>`; };

  // ---------- page scaffolding ----------
  let pageNo = 0;
  const page = (body, cls = '') => `<article class="page ${cls}">${body}<footer class="page-foot"><span>${T('pageFooter')}</span><span>${++pageNo}</span></footer></article>`;
  // Editable text block: generated html unless the reader has rewritten it.
  const ed = (id, html, tag = 'p', cls = '') => `<${tag} class="ed ${cls}${id in state.texts ? ' edited' : ''}" data-ed="${id}"${state.editing ? ' contenteditable="true"' : ''}>${state.texts[id] ?? html}</${tag}>`;
  const head = (id, eyebrow, title, claim, note = '') => `<header class="sec-head"><div class="eyebrow">${eyebrow}</div>${ed(`${id}-title`, title, 'h2')}<div class="claim-row">${ed(`${id}-claim`, claim, 'p', 'claim')}${note ? `<p class="side-note">${note}</p>` : ''}</div></header>`;
  const figure = (n, title, source, body, legend = '') => `<figure><div class="fig-body">${body}</div>${legend}<figcaption><b>Figure ${n} — ${title}</b><span>${source}</span></figcaption></figure>`;
  const band = (id, text, note = '') => text ? `<div class="band">${ed(id, text)}${note ? `<p class="side-note">${note}</p>` : ''}</div>` : '';

  // ---------- 1. Synthèse ----------
  function synthesis() {
    const s = byId[state.strategy], c = cur(), p = plan();
    const date = new Date(M.generatedAt).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const counts = { now: 0, five: 0, ten: 0, safe: 0 };
    c.due.forEach((d) => counts[cohortOf(d)]++);
    const reduction = yearlyAvoided(p) / D.baseline;
    const kpis = [
      [mchf(p.totalCost), T('kpiInvestment'), T('kpiInvestmentSub', { count: nf(p.works.length), budget: budgetLabel(state.budget) })],
      [mchf(fullCost(p)), T('kpiFullCost'), T('kpiFullCostSub', { scc: nf(state.scc) })],
      [`−${pct(reduction)}`, T('kpiEmissions'), T('kpiEmissionsSub', { avoided: tco2(yearlyAvoided(p)) })],
      [p.completionYear ?? '—', T('kpiEnd'), T('kpiEndSub', { firstYear: M.firstWorksYear })],
    ];
    const { svg, outside } = mapSvg(
      (i) => { const co = cohortOf(c.due[i]); return M.shades[co][Math.min(3, Math.max(1, c.triggers[i].length)) - 1]; },
      (i) => buildingTip(i, c.due[i] ? `Premier seuil franchi en <b>${c.due[i]}</b> : ${c.triggers[i].map((t) => M.criteria[t]).join(', ')}` : `Aucun seuil franchi d’ici ${M.baseYear + 10}`),
      'Carte de la situation actuelle');
    const uses = Object.keys(M.shapes);
    const legend = `<div class="legend"><div>${['now', 'five', 'ten', 'safe'].map((k) => `<span><span class="sw">${(k === 'safe' ? [M.shades.safe[0]] : M.shades[k]).map((col) => `<i style="background:${col}"></i>`).join('')}</span>${COHORTS[k]} <b>${counts[k]}</b></span>`).join('')}</div><div>${uses.map((u) => `<span>${shapeIcon(u)}${esc(u)}</span>`).join('')}</div></div>`;
    const text = T('summary', {
      buildings: nf(D.buildings.length), area: nf(area), emissions: tco2(D.baseline), strategy: esc(s.name),
      thermostatClause: state.comfort !== '0' ? T('summaryThermostat', { degrees: state.comfort }) : '',
      now: counts.now, due: counts.now + counts.five + counts.ten, dueHorizon: M.baseYear + 10,
      budget: budgetLabel(state.budget), firstYear: M.firstWorksYear, end: p.completionYear ?? '—', reduction: pct(reduction),
      residualClause: p.residual ? T('summaryResidual', { residual: p.residual }) : '',
    });
    return page(`
      <div class="cover-top"><div class="eyebrow">${T('coverEyebrow')}</div><span class="date">${date}</span></div>
      ${ed('title', T('coverTitle'), 'h1')}
      ${ed('subtitle', T('coverSubtitle', { strategy: esc(s.name), thermostat: comfortLabel(state.comfort), budget: budgetLabel(state.budget), scope: esc(M.scopeLabel) }), 'p', 'claim')}
      <div class="kpi-band">${kpis.map(([v, k, sub]) => `<div><strong>${v}</strong><span>${k}</span><small>${sub}</small></div>`).join('')}</div>
      <section class="summary"><div class="eyebrow">${T('s1Eyebrow')}</div>${ed('summary', text)}</section>
      ${figure(1, T('s1Figure', { year: M.baseYear }), T('s1FigureSource', { strategy: esc(s.name) }) + (outside ? T('s1FigureOutside', { outside }) : ''), svg, legend)}
      ${band('s1-read', T('s1Read'), T('s1ReadNote'))}
    `, 'first');
  }

  // ---------- 2. Feuille de route ----------
  function roadmap() {
    const s = byId[state.strategy], p = plan();
    const cap = state.budget === 'none' ? null : Number(state.budget);
    const works = new Map(p.works.map((w) => [w[0], w]));
    const y0 = M.firstWorksYear, y1 = Math.max(y0 + 1, p.completionYear ?? y0 + 1);
    const ramp = (yr) => `color-mix(in oklab, var(--seq-hi) ${100 - (yr - y0) / (y1 - y0) * 100}%, var(--seq-lo))`;
    const { svg } = mapSvg(
      (i) => works.has(i) ? ramp(works.get(i)[1]) : '#fff',
      (i) => { const w = works.get(i); return buildingTip(i, w ? `Travaux <b>${w[1]}</b> · ${mchf(w[2])} · −${nf(w[3], 1)} tCO₂e/an` : 'Surveillance, pas de travaux'); },
      'Carte de la feuille de route');
    const legendMap = `<div class="legend"><div><span class="ramp"><b>${y0}</b><i></i><b>${y1}</b></span><span>Année des travaux</span><span><i class="sw-safe"></i>Surveillance</span></div></div>`;
    const bars = barChart({ values: p.capex, fill: color(s.id), cap, label: 'Investissement annuel', tip: (i) => `<b>${D.years[i]}</b><div>${mchf(p.capex[i])}</div><div>${p.count[i]} bâtiments</div>` });
    const lots = D.years.map((y, i) => ({ y, cost: p.capex[i], count: p.count[i] })).filter((l) => l.count > 0);
    const g0 = M.baseYear, g1 = Math.max(M.baseYear + 10, y1 + 1), span = g1 - g0 + 1;
    const gx = (y) => `${(y - g0) / span * 100}%`, gw = (n) => `${n / span * 100}%`;
    const ph = (cls, from, n, t) => `<span class="ph ${cls}" style="left:${gx(from)};width:${gw(n)}" title="${t}"></span>`;
    const gantt = `<div class="gantt"><div class="g-head">${Array.from({ length: span }, (_, i) => `<span style="left:${gx(g0 + i)}">${(g0 + i) % 2 === 0 ? g0 + i : ''}</span>`).join('')}</div>
      ${lots.map((l) => `<div class="g-row"><div class="g-label"><b>Lot ${l.y}</b><small>${l.count} bât. · ${mchf(l.cost)}</small></div><div class="g-track">${ph('study', Math.max(g0, l.y - 2), Math.max(1, l.y - 1 - Math.max(g0, l.y - 2)), 'Études')}${ph('tender', l.y - 1, 1, 'Appel d’offres')}${ph('works', l.y, 1, 'Travaux')}${ph('gain', l.y + 1, g1 - l.y, 'Gains effectifs')}</div></div>`).join('')}
      <div class="legend"><div><span><i class="ph study"></i>Études</span><span><i class="ph tender"></i>Appel d’offres</span><span><i class="ph works"></i>Travaux</span><span><i class="ph gain"></i>Gains effectifs</span></div></div></div>`;
    let acc = 0; const milestones = []; const targets = [.5, 1];
    for (const w of [...p.works].sort((a, b) => a[1] - b[1])) { acc += w[3]; while (targets.length && acc >= targets[0] * p.carbonSaved - 1e-6) milestones.push([targets.shift(), w[1] + 1]); }
    const immediate = p.works.filter((w) => cur().due[w[0]] === M.baseYear).length;
    const beyond = p.works.filter((w) => w[1] > M.horizonYear).length;
    return page(`
      ${head('s2', T('s2Eyebrow'), T('s2Title', { strategy: esc(s.name) }), T('s2Claim', { count: nf(p.works.length), firstYear: M.firstWorksYear, end: p.completionYear ?? '—', budget: budgetLabel(state.budget) }), T('s2Note'))}
      ${figure(2, T('s2Figure'), T('s2FigureSource'), svg, legendMap)}
      ${band('s2-pace', T('s2Pace', { immediate, year: M.baseYear, half: milestones[0]?.[1] ?? '—', full: milestones[1]?.[1] ?? '—' }), T('s2PaceNote'))}
    `) + page(`
      ${figure(3, T('s2Capex'), T('s2CapexSource', { year: M.baseYear }) + (beyond ? T('s2CapexBeyond', { beyond, horizon: M.horizonYear }) : ''), bars)}
      ${figure(4, T('s2Gantt'), T('s2GanttSource'), gantt)}
    `);
  }

  // ---------- 3. Comparaison ----------
  function comparison() {
    const p = plan(), s = byId[state.strategy];
    const trajectory = lineChart({
      label: 'Trajectoire des émissions', unit: 'tCO₂e/an', yFmt: (v) => `${nf(v / 1000)} k`, tipFmt: tco2,
      series: [{ name: 'Sans action', color: 'var(--muted)', dash: true, values: D.years.map(() => D.baseline) }]
        .concat(state.comfort !== '0' ? [{ name: `Thermostat seul (−${state.comfort} °C)`, color: 'var(--ink)', dash: true, values: D.years.map(() => D.baselineByComfort[state.comfort]) }] : [])
        .concat(D.strategies.map((st) => ({ name: st.name, color: color(st.id), values: plan(st.id).emissions }))),
    });
    const row = (name, q, swatch, cls = '') => `<tr class="${cls}"><th><i style="background:${swatch}"></i>${name}</th><td>${q ? mchf(q.totalCost) : '—'}</td><td>${q ? mchf(fullCost(q)) : mchf(carbonCost(baselineCum))}</td><td>${tco2(q ? q.cumulative : baselineCum)}</td><td>${tco2(q ? last(q.emissions) : D.baseline)}</td><td>${q ? q.completionYear ?? '—' : '—'}</td></tr>`;
    const table = `<table class="data"><thead><tr><th>Scénario</th><th>Investissement</th><th>Coût complet</th><th>CO₂ émis ${M.baseYear}–${M.horizonYear}</th><th>Émissions ${M.horizonYear}</th><th>Fin</th></tr></thead><tbody>
      ${row('Sans action', null, 'var(--muted)')}${D.strategies.map((st) => row(esc(st.name), plan(st.id), color(st.id), st.id === state.strategy ? 'current' : '')).join('')}</tbody></table>`;
    // Levers: change one input at a time, then the best combination of all inputs.
    const levers = [];
    for (const st of D.strategies) if (st.id !== state.strategy) levers.push([`Stratégie ${esc(st.name)}`, plan(st.id)]);
    for (const c of M.comfortLevels) if (c !== state.comfort) levers.push([c === '0' ? 'Thermostat inchangé' : `Thermostat −${c} °C`, plan(state.strategy, state.budget, c)]);
    const keys = M.budgets.map((b) => b.key), bi = keys.indexOf(state.budget);
    for (const k of new Set([keys[bi + 1], 'none'])) if (k && k !== state.budget) levers.push([`Budget ${budgetLabel(k)}`, plan(state.strategy, k)]);
    const combos = D.strategies.flatMap((st) => M.comfortLevels.flatMap((c) => keys.map((k) => ({ st, c, k, q: plan(st.id, k, c) }))));
    const best = (f) => combos.reduce((a, b) => f(b.q) < f(a.q) ? b : a);
    const comboName = (x) => `${esc(x.st.name)}, ${comfortLabel(x.c)}, ${budgetLabel(x.k)}`;
    const bestFull = best(fullCost), bestCo2 = best((q) => q.cumulative);
    const lever = ([name, q], cls = '') => `<tr class="${cls}"><th>${name}</th><td>${signed(q.totalCost - p.totalCost, mchf)}</td><td>${signed(fullCost(q) - fullCost(p), mchf)}</td><td>${signed(q.cumulative - p.cumulative, tco2)}</td><td>${q.completionYear ?? '—'}</td></tr>`;
    const leverTable = `<table class="data"><thead><tr><th>Si l’on avait choisi…</th><th>Investissement</th><th>Coût complet</th><th>CO₂ émis ${M.baseYear}–${M.horizonYear}</th><th>Fin</th></tr></thead><tbody>
      ${levers.map((l) => lever(l)).join('')}
      ${lever([`<span class="tag">Coût complet minimal</span> ${comboName(bestFull)}`, bestFull.q], 'best')}
      ${bestCo2 !== bestFull ? lever([`<span class="tag">Émissions minimales</span> ${comboName(bestCo2)}`, bestCo2.q], 'best') : ''}</tbody></table>`;
    const cons = byId.conservative && plan('conservative'), amb = byId.ambitious && plan('ambitious');
    let claim = T('s3ClaimGeneric');
    let prudence = '';
    if (cons && amb) {
      const dCost = amb.totalCost - cons.totalCost, dCo2 = cons.cumulative - amb.cumulative;
      claim = T('s3Claim', { dCost: mchf(dCost), dCo2: tco2(dCo2), horizon: M.horizonYear });
      if (dCo2 > 0 && dCost > 0) prudence = T('s3PerTonne', { perTonne: nf(dCost / dCo2) })
        + (dCost / dCo2 <= state.scc ? T('s3Worth', { scc: nf(state.scc) }) : T('s3NotWorth', { scc: nf(state.scc), horizon: M.horizonYear }));
    }
    const sobriety = state.comfort !== '0' && last(p.emissions) > last(plan(state.strategy, state.budget, '0').emissions) ? T('s3Sobriety', { horizon: M.horizonYear }) : '';
    const scenario = `${esc(s.name)}, ${comfortLabel(state.comfort)}, ${budgetLabel(state.budget)}`;
    return page(`
      ${head('s3', T('s3Eyebrow'), T('s3Title'), claim, T('s3Note', { scc: nf(state.scc), year: M.baseYear, horizon: M.horizonYear }))}
      ${figure(5, T('s3Figure'), T('s3FigureSource', { budget: budgetLabel(state.budget), thermostat: comfortLabel(state.comfort) }), trajectory)}
      ${table}
      ${band('s3-prudence', `${prudence}${sobriety}`, T('s3PrudenceNote'))}
      <h3 class="sub">${T('s3Levers', { scenario })}</h3>
      ${leverTable}
      ${band('s3-best', T('s3Best', { combos: combos.length, best: comboName(bestFull), bestCost: mchf(fullCost(bestFull.q)), currentCost: mchf(fullCost(p)), bestCo2Clause: bestCo2 !== bestFull ? T('s3BestCo2', { bestCo2: comboName(bestCo2) }) : '' }), T('s3BestNote'))}
    `);
  }

  // ---------- Annexes ----------
  function tableRows() {
    const c = cur(), f = factor(), p = plan();
    const works = new Map(p.works.map((w) => [w[0], w]));
    const q = state.query.trim().toLowerCase();
    const rows = D.buildings.map((b, i) => {
      const w = works.get(i);
      return { b, idc: Math.round(b.idc * f), co2: b.co2 * f, due: c.due[i], worksYear: w ? w[1] : null, cost: w ? w[2] : 0, saved: w ? w[3] : 0, net: w ? w[2] - carbonCost(w[3] * Math.max(0, M.horizonYear - w[1])) : 0, residual: w ? w[4] : 0, triggers: c.triggers[i] };
    }).filter((r) => !q || `${r.b.name} ${r.b.district} ${r.b.use} ${r.b.id}`.toLowerCase().includes(q));
    const key = state.sortKey, dir = state.sortDir, val = (r) => key in r ? r[key] : r.b[key];
    return rows.sort((a, b) => { const va = val(a) ?? Infinity, vb = val(b) ?? Infinity; return (va > vb ? 1 : va < vb ? -1 : 0) * dir; });
  }
  function buildingTable() {
    const rows = tableRows();
    const cols = [['name', 'Bâtiment'], ['area', 'SRE m²'], ['idc', 'IDC'], ['co2', 'CO₂'], ['due', 'Échéance'], ['worksYear', 'Travaux'], ['cost', 'Coût CHF'], ['net', 'Net CSC'], ['saved', 'tCO₂e/an']];
    return `<div id="batiments"><div class="table-tools"><input type="search" id="q" placeholder="Filtrer : adresse, quartier, usage, EGID…" value="${esc(state.query)}"><span>${rows.length} bâtiments</span><button class="btn" data-action="list">Masquer la liste</button><button class="btn" data-action="csv">Export CSV</button></div>
      <table class="data sortable"><thead><tr>${cols.map(([k, l]) => `<th><button data-sort="${k}">${l}${state.sortKey === k ? (state.sortDir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead><tbody>
      ${rows.map((r) => `<tr><td><b>${esc(r.b.name)}</b><small>${esc(r.b.use)} · ${esc(r.b.district)} · ${esc(r.b.id)}${r.triggers.length ? ` · ${r.triggers.map((t) => M.criteria[t]).join(', ')}` : ''}${r.residual ? ' · <span class="flag">à étudier</span>' : ''}</small></td><td>${nf(r.b.area)}</td><td>${r.idc}</td><td>${nf(r.co2, 1)}</td><td>${r.due ?? '—'}</td><td>${r.worksYear ?? '<span class="muted">—</span>'}</td><td>${r.cost ? nf(r.cost) : '—'}</td><td>${r.worksYear ? nf(r.net) : '—'}</td><td>${r.saved ? nf(r.saved, 1) : '—'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function listSummary() {
    const p = plan();
    return `<div class="list-summary"><p>${T('a1Summary', { buildings: nf(D.buildings.length), works: nf(p.works.length), safe: nf(D.buildings.length - p.works.length) })}</p>
      <div class="actions"><button class="btn" data-action="list">Afficher la liste</button><button class="btn" data-action="csv">Export CSV</button></div></div>`;
  }
  function annexes() {
    const s = byId[state.strategy], R = M.renovation;
    const th = (t) => `IDC &gt; ${nf(t.idc)} MJ/m²/an · état &lt; ${nf(t.condition, 2)} · CO₂ &gt; ${nf(t.carbon)} kg/m²/an`;
    const inputs = [
      ['Périmètre', `${esc(M.scopeLabel)} · ${nf(D.buildings.length)} bâtiments · ${nf(area)} m²`],
      ['Stratégie', `${esc(s.name)} : ${th(s.thresholds)}${s.changes.length ? `<br>${s.changes.map((c) => `dès ${c.year} : ${th(c.thresholds)}`).join('<br>')}` : ''}`],
      ...D.strategies.filter((x) => x.id !== s.id).map((x) => [`Comparée : ${esc(x.name)}`, th(x.thresholds)]),
      ['Thermostat', `${comfortLabel(state.comfort)} (−${nf(M.savingPerDegree * 100)} % de demande par °C)`],
      ['Budget annuel', budgetLabel(state.budget)],
      ['Coût social du carbone', `${nf(state.scc)} CHF/tCO₂e`],
      ['Année de référence · horizon', `${M.baseYear} · ${M.horizonYear}`],
    ];
    const vars = {
      year: M.baseYear, dueHorizon: M.baseYear + 10, heat: nf(R.heatReduction * 100), target: R.targetCondition, lowCarbon: R.lowCarbonFactor,
      fixed: R.fixedCostPerM2, variable: R.conditionCostPerM2, firstYear: M.firstWorksYear, saving: nf(M.savingPerDegree * 100), horizon: M.horizonYear,
    };
    const scenario = `${esc(s.name)}, ${comfortLabel(state.comfort)}, ${budgetLabel(state.budget)}`;
    return page(`
      ${head('a1', T('a1Eyebrow'), T('a1Title'), T('a1Claim', { scenario }) + (state.showList ? T('a1ClaimSort') : ''), T('a1Note', { horizon: M.horizonYear }))}
      ${state.showList ? buildingTable() : listSummary()}
    `, 'annex') + page(`
      ${head('a2', T('a2Eyebrow'), T('a2Title'), T('a2Claim'))}
      <table class="data defs"><thead><tr><th colspan="2">Paramètres du rapport</th></tr></thead><tbody>${inputs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>
      <dl class="hyp">${M.texts.hypotheses.map(([k, v]) => `<dt>${k}.</dt><dd>${fill(v, vars)}</dd>`).join('')}</dl>
      <p class="foot-note">${T('a2Footer', { date: new Date(M.generatedAt).toLocaleString('fr-CH') })}</p>
    `);
  }

  // ---------- toolbar ----------
  const help = (label, title, body) => `<details class="help"><summary aria-label="${label}">?</summary><div class="help-panel"><b>${title}</b>${body}</div></details>`;
  function toolbar() {
    const seg = (items, attr, active) => `<div class="seg">${items.map(([k, l]) => `<button data-${attr}="${k}" aria-pressed="${k === active}">${l}</button>`).join('')}</div>`;
    const edits = Object.keys(state.texts).length;
    return `<nav class="toolbar" aria-label="Paramètres du rapport"><div class="tb-inner">
      <div class="control"><span>Thermostat</span>${help('Qu’est-ce que le levier thermostat ?', T('helpThermostatTitle'), T('helpThermostat', { saving: nf(M.savingPerDegree * 100), year: M.baseYear }))}${seg(M.comfortLevels.map((c) => [c, c === '0' ? '0' : `−${c}`]), 'comfort', state.comfort)}<small>°C</small></div>
      <div class="control"><span>Budget</span>${seg(M.budgets.map((b) => [b.key, b.key === 'none' ? '∞' : nf(Number(b.key) / 1e6)]), 'budget', state.budget)}<small>MCHF/an</small></div>
      <div class="control"><span>CSC</span>${help('Qu’est-ce que le coût social du carbone ?', T('helpSccTitle'), T('helpScc', { year: M.baseYear, horizon: M.horizonYear, defaultScc: M.defaultScc }))}<input type="number" id="scc" min="0" step="1" value="${state.scc}" aria-label="Coût social du carbone en CHF par tonne"><small>CHF/t</small></div>
      <div class="actions-right">${edits ? `<button class="btn ghost" data-action="reset-texts" title="Revenir aux textes générés">Rétablir (${edits})</button>` : ''}<button class="btn ghost" data-action="edit" aria-pressed="${state.editing}">${state.editing ? '✓ Terminer' : '✎ Modifier le texte'}</button><button class="btn primary" data-action="html">Télécharger</button></div>
    </div></nav>`;
  }

  // ---------- downloads ----------
  function save(content, type, name) {
    const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // Downloaded HTML = original page + current text edits (replacing any saved earlier).
  function withTexts(html) {
    // Only touch the part before the data block, so the runtime's own source is never matched.
    const tag = (id) => `<script type="application/json" id="${id}">`;
    const at = html.indexOf(tag('report-data'));
    const before = html.slice(0, at).replace(new RegExp(`${tag('report-texts')}[\\s\\S]*?<\\/script>`), '');
    const json = JSON.stringify(state.texts).replace(/</g, '\\u003c');
    return before + (Object.keys(state.texts).length ? `${tag('report-texts')}${json}<\/script>` : '') + html.slice(at);
  }
  function exportCsv() {
    const s = byId[state.strategy];
    const rows = [
      ['Données SITG / QuantHome (indice d’état = proxy)', `Stratégie : ${s.name}`, `Budget : ${budgetLabel(state.budget)}`, `Thermostat : ${comfortLabel(state.comfort)}`, `CSC : ${state.scc} CHF/tCO2e`, `Périmètre : ${M.scopeLabel}`],
      ['ID', 'Adresse', 'Quartier', 'Usage', 'Surface m²', 'IDC MJ/m²/an', 'CO2 kg/m²/an', 'État actuel', 'Échéance', 'Année travaux', 'Coût CHF', 'Gain tCO2e/an', `Coût net CSC CHF (jusqu’en ${M.horizonYear})`, 'Motifs', 'À étudier'],
      ...tableRows().map((r) => [r.b.id, r.b.name, r.b.district, r.b.use, r.b.area, r.idc, r.co2.toFixed(1), r.b.cond, r.due ?? 'Surveillance', r.worksYear ?? '', r.cost || '', r.saved || '', r.worksYear ? Math.round(r.net) : '', r.triggers.map((t) => M.criteria[t]).join(', '), r.residual ? 'oui' : '']),
    ];
    save('﻿' + rows.map((row) => row.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(';')).join('\r\n'), 'text/csv', `${M.fileName}-c${state.comfort}-${state.budget}.csv`);
  }

  // ---------- render & interaction ----------
  const root = document.getElementById('report');
  const tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip);
  function render() {
    const scroll = window.scrollY;
    pageNo = 0;
    root.innerHTML = toolbar() + `<main class="pages">${synthesis()}${roadmap()}${comparison()}${annexes()}</main>`;
    window.scrollTo(0, scroll);
  }
  function renderTable() {
    document.getElementById('batiments').outerHTML = buildingTable();
    const q = document.getElementById('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length);
  }
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.comfort) { state.comfort = t.dataset.comfort; render(); }
    else if (t.dataset.budget) { state.budget = t.dataset.budget; render(); }
    else if (t.dataset.action === 'csv') exportCsv();
    else if (t.dataset.action === 'list') { state.showList = !state.showList; render(); }
    else if (t.dataset.action === 'edit') { state.editing = !state.editing; render(); }
    else if (t.dataset.action === 'reset-texts' && confirm('Revenir aux textes générés ? Vos modifications seront perdues.')) { state.texts = {}; render(); }
    else if (t.dataset.action === 'html') save(withTexts(SOURCE), 'text/html', `${M.fileName}.html`);
    else if (t.dataset.sort) { state.sortDir = state.sortKey === t.dataset.sort ? -state.sortDir : 1; state.sortKey = t.dataset.sort; renderTable(); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id !== 'scc') return;
    const v = Number(e.target.value);
    if (e.target.value !== '' && Number.isFinite(v) && v >= 0) state.scc = v;
    render();
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === 'q') { state.query = e.target.value; renderTable(); return; }
    const block = e.target.closest?.('[data-ed]');
    if (block) { state.texts[block.dataset.ed] = block.innerHTML; block.classList.add('edited'); }
  });
  // Paste as plain text so edited blocks keep the report's styling.
  root.addEventListener('paste', (e) => {
    if (!e.target.closest?.('[data-ed]')) return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  root.addEventListener('mousemove', (e) => {
    const t = e.target.closest('[data-tip]');
    root.querySelectorAll('.cross.on').forEach((c) => c.classList.remove('on'));
    if (!t) { tip.style.display = 'none'; return; }
    tip.innerHTML = t.dataset.tip; tip.style.display = 'block';
    tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8)}px`; tip.style.top = `${e.clientY + 14}px`;
    if (t.dataset.x) { const c = t.closest('svg').querySelector('.cross'); c.setAttribute('x1', t.dataset.x); c.setAttribute('x2', t.dataset.x); c.classList.add('on'); }
  });
  // Keep help popovers inside the viewport.
  root.addEventListener('toggle', (e) => {
    const panel = e.target.open && e.target.querySelector('.help-panel'); if (!panel) return;
    // Fixed panel (the toolbar scrolls horizontally): anchor it under its "?" and keep it on screen.
    const r = e.target.querySelector('summary').getBoundingClientRect();
    panel.style.top = `${r.bottom}px`;
    panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 8 - panel.offsetWidth))}px`;
  }, true);
  root.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  render();
})();
