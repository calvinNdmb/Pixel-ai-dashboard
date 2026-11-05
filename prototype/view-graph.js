// Vue « Toile » : graphe des fiches, relations explicites et mentions détectées.
(function () {
  const { h, svg: s } = APP;
  const S = () => APP.state, U = () => APP.ui;
  let built = false, fitted = false, pz, stage, vp, gEdges, gLabels, gNodes, selected = null, anim = null;

  const radius = (deg) => 10 + Math.min(deg, 8) * 1.7;

  function edges() {
    const out = [], seen = new Set();
    for (const r of S().relations) {
      if (!APP.entry(r.from) || !APP.entry(r.to)) continue;
      out.push({ from: r.from, to: r.to, label: r.label, kind: 'rel' });
      seen.add(r.from + '|' + r.to); seen.add(r.to + '|' + r.from);
    }
    if (U().showMentions !== false) {
      for (const e of S().entries) {
        for (const id of APP.mentions(e.body, e.id).keys()) {
          if (seen.has(e.id + '|' + id)) continue;
          seen.add(e.id + '|' + id); seen.add(id + '|' + e.id);
          out.push({ from: e.id, to: id, kind: 'mention' });
        }
      }
    }
    return out;
  }

  function tick(ents, links, temp) {
    const n = ents.length, fx = new Float64Array(n), fy = new Float64Array(n);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      let dx = ents[a].x - ents[b].x, dy = ents[a].y - ents[b].y, d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      const d = Math.sqrt(d2), f = 26000 / Math.max(d2, 900);
      fx[a] += (dx / d) * f; fy[a] += (dy / d) * f; fx[b] -= (dx / d) * f; fy[b] -= (dy / d) * f;
    }
    for (const [a, b, w] of links) {
      const dx = ents[b].x - ents[a].x, dy = ents[b].y - ents[a].y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 140) * 0.06 * w;
      fx[a] += (dx / d) * f; fy[a] += (dy / d) * f; fx[b] -= (dx / d) * f; fy[b] -= (dy / d) * f;
    }
    for (let a = 0; a < n; a++) {
      fx[a] -= ents[a].x * 0.02; fy[a] -= ents[a].y * 0.02;
      const m = Math.hypot(fx[a], fy[a]), k = m > temp ? temp / m : 1;
      ents[a].x += fx[a] * k; ents[a].y += fy[a] * k;
    }
  }
  function linksFor(ents) {
    const idx = new Map(ents.map((e, i) => [e.id, i]));
    return edges().map((ed) => [idx.get(ed.from), idx.get(ed.to), ed.kind === 'rel' ? 1 : 0.35]).filter(([a, b]) => a != null && b != null);
  }
  function placeMissing() {
    const ents = S().entries, missing = ents.filter((e) => typeof e.x !== 'number');
    if (!missing.length) return;
    const fresh = missing.length === ents.length;
    missing.forEach((e, i) => {
      const a = (i / missing.length) * Math.PI * 2;
      e.x = (fresh ? 0 : 60) + Math.cos(a) * (fresh ? 220 : 80) + Math.random() * 10;
      e.y = Math.sin(a) * (fresh ? 220 : 80) + Math.random() * 10;
    });
    const links = linksFor(ents);
    for (let i = 0; i < (fresh ? 400 : 120); i++) tick(ents, links, 30 * (1 - i / 400) + 0.5);
    APP.save();
  }

  function bounds() {
    const ents = S().entries;
    if (!ents.length) return { x: -200, y: -200, w: 400, h: 400 };
    const xs = ents.map((e) => e.x), ys = ents.map((e) => e.y);
    const x = Math.min(...xs) - 80, y = Math.min(...ys) - 50;
    return { x, y, w: Math.max(...xs) + 80 - x, h: Math.max(...ys) + 70 - y };
  }

  function build() {
    const root = document.getElementById('view-graph');
    stage = s('svg', { class: 'stage', id: 'graph-stage', role: 'img', 'aria-label': 'Toile des fiches et de leurs relations' },
      s('defs', null, s('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, s('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow' }))),
      (vp = s('g', null, (gEdges = s('g')), (gLabels = s('g')), (gNodes = s('g')))));
    const mBtn = h('button', { class: 'btn on', id: 'g-mentions', 'aria-pressed': 'true', onclick: () => {
      U().showMentions = U().showMentions === false; mBtn.classList.toggle('on', U().showMentions !== false);
      mBtn.setAttribute('aria-pressed', String(U().showMentions !== false)); draw();
    } }, 'Mentions');
    root.append(stage,
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn', id: 'g-relayout', onclick: relayout }, 'Réorganiser'), mBtn,
        h('button', { class: 'btn', 'aria-label': 'Zoom avant', onclick: () => pz.zoomCenter(1.25) }, '+'),
        h('button', { class: 'btn', 'aria-label': 'Zoom arrière', onclick: () => pz.zoomCenter(0.8) }, '−'),
        h('button', { class: 'btn', onclick: () => pz.fit(bounds()) }, 'Tout voir'),
        h('button', { class: 'btn btn-accent ai-only', id: 'g-ai', onclick: () => APP.ai.openLinksPanel(root, () => draw()) }, 'Liens par l’IA')),
      h('div', { class: 'legend' }, Object.values(TYPES).map((t) => h('span', null, h('span', { class: 'dot', style: { '--c': t.color } }, ''), t.plural)),
        h('span', { style: { color: 'var(--muted)' } }, '— relation · - - mention')));
    pz = new APP.PanZoom(stage, vp, {
      hit: (e) => { const g = e.target.closest && e.target.closest('[data-node]'); return g ? g.getAttribute('data-node') : null; },
      dragStart: () => stopAnim(),
      drag: (id, w) => { const e = APP.entry(id); if (e) { e.x = w.x; e.y = w.y; draw(); } },
      dragEnd: () => APP.save(),
      tap: (id, ev) => {
        selected = id; draw();
        if (id) APP.showPeek(APP.entryCard(APP.entry(id)), ev.clientX, ev.clientY);
      },
    });
    gNodes.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse' && !pz.mode) { const g = e.target.closest('[data-node]'); if (g) highlight(g.getAttribute('data-node')); } });
    gNodes.addEventListener('pointerout', (e) => { if (e.pointerType === 'mouse') highlight(null); });
    built = true;
  }

  function highlight(id) {
    const near = new Set(id ? [id] : []);
    if (id) edges().forEach((ed) => { if (ed.from === id) near.add(ed.to); if (ed.to === id) near.add(ed.from); });
    stage.querySelectorAll('[data-node]').forEach((n) => n.classList.toggle('dim', !!id && !near.has(n.getAttribute('data-node'))));
    stage.querySelectorAll('[data-edge]').forEach((l) => { const [a, b] = l.getAttribute('data-edge').split('|'); l.classList.toggle('dim', !!id && a !== id && b !== id); });
  }

  function draw() {
    const eds = edges(), deg = new Map();
    eds.forEach((ed) => { deg.set(ed.from, (deg.get(ed.from) || 0) + 1); deg.set(ed.to, (deg.get(ed.to) || 0) + 1); });
    gEdges.replaceChildren(); gLabels.replaceChildren(); gNodes.replaceChildren();
    for (const ed of eds) {
      const a = APP.entry(ed.from), b = APP.entry(ed.to);
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const ra = radius(deg.get(a.id) || 0) + 4, rb = radius(deg.get(b.id) || 0) + 5;
      if (d < ra + rb) continue;
      const x1 = a.x + (dx / d) * ra, y1 = a.y + (dy / d) * ra, x2 = b.x - (dx / d) * rb, y2 = b.y - (dy / d) * rb;
      gEdges.append(s('line', { class: 'g-edge' + (ed.kind === 'mention' ? ' mention' : ''), 'data-edge': a.id + '|' + b.id, x1, y1, x2, y2, 'marker-end': ed.kind === 'rel' ? 'url(#arrow)' : null }));
      if (ed.label) gLabels.append(s('text', { class: 'g-elabel', 'data-edge': a.id + '|' + b.id, x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 4, 'text-anchor': 'middle' }, ed.label));
    }
    for (const e of S().entries) {
      const r = radius(deg.get(e.id) || 0);
      gNodes.append(s('g', { class: 'g-node' + (selected === e.id ? ' sel' : ''), 'data-node': e.id, transform: `translate(${e.x} ${e.y})`, style: `--c:${APP.color(e)}` },
        s('circle', { class: 'halo', r: r + 5 }), s('circle', { class: 'c', r }), s('text', { y: r + 18 }, e.name)));
    }
  }

  function stopAnim() { if (anim) cancelAnimationFrame(anim); anim = null; }
  function relayout() {
    stopAnim();
    const ents = S().entries, links = linksFor(ents);
    ents.forEach((e) => { e.x += (Math.random() - 0.5) * 120; e.y += (Math.random() - 0.5) * 120; });
    let i = 0; const N = 110;
    const step = () => {
      for (let k = 0; k < 3; k++) tick(ents, links, 28 * (1 - i / N) + 0.6);
      draw();
      if (++i < N) anim = requestAnimationFrame(step);
      else { anim = null; pz.fit(bounds()); APP.save(); }
    };
    anim = requestAnimationFrame(step);
  }

  APP.views.graph = {
    render() {
      if (!built) build();
      placeMissing();
      draw();
      const focus = U().focusNode && APP.entry(U().focusNode);
      if (focus) {
        selected = focus.id; U().focusNode = null; draw();
        const r = stage.getBoundingClientRect(), k = Math.max(pz.t.k, 1.1);
        pz.t = { k, x: r.width / 2 - focus.x * k, y: r.height / 2 - focus.y * k }; pz.apply(); fitted = true;
      } else if (!fitted) { pz.fit(bounds()); fitted = true; }
    },
    leave() { stopAnim(); },
  };
})();
