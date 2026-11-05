// Vue « Toile » : cartes-portraits sur un plan pointillé, en réseau libre ou en arbre.
(function () {
  const { h, svg: s } = APP;
  const S = () => APP.state, U = () => APP.ui;
  let built = false, fitted = false, pz, stage, vp, gEdges, gLabels, gNodes, bar, selected = null, anim = null, treePos = null;
  const CW = 60, CH = 76;
  const tree = () => U().graphLayout === 'tree';

  function edges() {
    const out = [], seen = new Set();
    for (const r of S().relations) {
      if (!APP.entry(r.from) || !APP.entry(r.to) || r.from === r.to) continue;
      out.push({ from: r.from, to: r.to, label: r.label, kind: 'rel' });
      seen.add(r.from + '|' + r.to); seen.add(r.to + '|' + r.from);
    }
    if (U().showMentions !== false && !tree()) {
      for (const e of S().entries) for (const id of APP.mentions(e.body, e.id).keys()) {
        if (seen.has(e.id + '|' + id)) continue;
        seen.add(e.id + '|' + id); seen.add(id + '|' + e.id);
        out.push({ from: e.id, to: id, kind: 'mention' });
      }
    }
    return out;
  }

  // ---------- disposition en réseau (forces) ----------
  function tick(ents, links, temp) {
    const n = ents.length, fx = new Float64Array(n), fy = new Float64Array(n);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      let dx = ents[a].x - ents[b].x, dy = ents[a].y - ents[b].y, d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      const d = Math.sqrt(d2), f = 46000 / Math.max(d2, 2500);
      fx[a] += (dx / d) * f; fy[a] += (dy / d) * f; fx[b] -= (dx / d) * f; fy[b] -= (dy / d) * f;
    }
    for (const [a, b, w] of links) {
      const dx = ents[b].x - ents[a].x, dy = ents[b].y - ents[a].y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 175) * 0.05 * w;
      fx[a] += (dx / d) * f; fy[a] += (dy / d) * f; fx[b] -= (dx / d) * f; fy[b] -= (dy / d) * f;
    }
    for (let a = 0; a < n; a++) {
      fx[a] -= ents[a].x * 0.018; fy[a] -= ents[a].y * 0.018;
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
    missing.forEach((e, i) => { const a = (i / missing.length) * Math.PI * 2; e.x = Math.cos(a) * (fresh ? 260 : 90); e.y = Math.sin(a) * (fresh ? 260 : 90); });
    const links = linksFor(ents);
    for (let i = 0; i < (fresh ? 420 : 140); i++) tick(ents, links, 32 * (1 - i / 420) + 0.5);
    APP.save();
  }

  // ---------- disposition en arbre (couches, parents au-dessus) ----------
  function treeLayout() {
    const ents = S().entries, ids = new Set(ents.map((e) => e.id));
    const rels = S().relations.filter((r) => ids.has(r.from) && ids.has(r.to) && r.from !== r.to);
    const layer = new Map(ents.map((e) => [e.id, 0])), linked = new Set();
    rels.forEach((r) => { linked.add(r.from); linked.add(r.to); });
    for (let it = 0; it < ents.length; it++) {
      let changed = false;
      for (const r of rels) { const v = Math.min(layer.get(r.from) + 1, 7); if (layer.get(r.to) < v) { layer.set(r.to, v); changed = true; } }
      if (!changed) break;
    }
    const rows = [];
    ents.filter((e) => linked.has(e.id)).forEach((e) => { const l = layer.get(e.id); (rows[l] = rows[l] || []).push(e.id); });
    const pos = new Map(), GX = 138, GY = 196;
    const bary = (id) => { const ps = rels.filter((r) => r.to === id && pos.has(r.from)).map((r) => pos.get(r.from).x); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0; };
    rows.forEach((row, l) => {
      if (l > 0) row.sort((a, b) => bary(a) - bary(b));
      row.forEach((id, i) => pos.set(id, { x: (i - (row.length - 1) / 2) * GX, y: l * GY }));
    });
    const loose = ents.filter((e) => !linked.has(e.id)).map((e) => e.id);
    loose.forEach((id, i) => pos.set(id, { x: (i - (loose.length - 1) / 2) * GX, y: rows.length * GY + 30 }));
    return pos;
  }
  const P = (e) => (tree() ? treePos.get(e.id) || { x: 0, y: 0 } : e);

  function bounds() {
    const pts = S().entries.map(P);
    if (!pts.length) return { x: -200, y: -200, w: 400, h: 400 };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x = Math.min(...xs) - 90, y = Math.min(...ys) - 70;
    return { x, y, w: Math.max(...xs) + 90 - x, h: Math.max(...ys) + 90 - y };
  }

  // ---------- construction ----------
  function build() {
    const root = document.getElementById('view-graph');
    stage = s('svg', { class: 'stage canvas-bg', id: 'graph-stage', role: 'img', 'aria-label': 'Toile des fiches et de leurs relations' },
      s('defs', null,
        s('pattern', { id: 'dots', width: '26', height: '26', patternUnits: 'userSpaceOnUse' }, s('circle', { cx: '13', cy: '13', r: '1.2', class: 'dot-grid' })),
        s('clipPath', { id: 'card-clip' }, s('rect', { x: -26, y: -34, width: 52, height: 52, rx: 6 })),
        s('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, s('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow' }))),
      (vp = s('g', null, s('rect', { x: -6000, y: -6000, width: 12000, height: 12000, fill: 'url(#dots)' }), (gEdges = s('g')), (gLabels = s('g')), (gNodes = s('g')))));
    bar = h('div', { class: 'toolbar' });
    root.append(stage, bar,
      h('div', { class: 'legend' }, Object.values(TYPES).map((t) => h('span', null, h('span', { class: 'dot', style: { '--c': t.color } }, ''), t.plural)),
        h('span', { style: { color: 'var(--muted)' } }, '— relation · - - mention')));
    pz = new APP.PanZoom(stage, vp, {
      hit: (e) => { const g = e.target.closest && e.target.closest('[data-node]'); return g ? g.getAttribute('data-node') : null; },
      dragStart: () => stopAnim(),
      drag: (id, w) => { const e = APP.entry(id); if (!e) return; const p = P(e); p.x = w.x; p.y = w.y; draw(); },
      dragEnd: () => { if (!tree()) APP.save(); },
      tap: (id, ev) => { selected = id; draw(); if (id) APP.showPeek(APP.entryCard(APP.entry(id)), ev.clientX, ev.clientY); },
    });
    gNodes.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse' && !pz.mode) { const g = e.target.closest('[data-node]'); if (g) highlight(g.getAttribute('data-node')); } });
    gNodes.addEventListener('pointerout', (e) => { if (e.pointerType === 'mouse') highlight(null); });
    built = true;
  }

  function renderBar() {
    const root = document.getElementById('view-graph');
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Disposition' },
      h('button', { 'aria-pressed': String(!tree()), id: 'g-net', onclick: () => { U().graphLayout = 'net'; fitted = false; APP.go('graph'); } }, 'Réseau'),
      h('button', { 'aria-pressed': String(tree()), id: 'g-tree', onclick: () => { U().graphLayout = 'tree'; fitted = false; APP.go('graph'); } }, 'Arbre'));
    const mBtn = tree() ? null : h('button', { class: 'btn' + (U().showMentions !== false ? ' on' : ''), id: 'g-mentions', 'aria-pressed': String(U().showMentions !== false), onclick: () => { U().showMentions = U().showMentions === false; renderBar(); draw(); } }, 'Mentions');
    bar.replaceChildren(...[seg,
      tree() ? null : h('button', { class: 'btn', id: 'g-relayout', onclick: relayout }, 'Réorganiser'), mBtn,
      h('button', { class: 'btn', 'aria-label': 'Zoom avant', onclick: () => pz.zoomCenter(1.25) }, '+'),
      h('button', { class: 'btn', 'aria-label': 'Zoom arrière', onclick: () => pz.zoomCenter(0.8) }, '−'),
      h('button', { class: 'btn', onclick: () => pz.fit(bounds()) }, 'Tout voir'),
      h('button', { class: 'btn btn-accent ai-only', id: 'g-ai', onclick: () => APP.ai.openLinksPanel(root, () => { if (tree()) treePos = treeLayout(); draw(); }) }, 'Liens par l’IA')].filter(Boolean));
  }

  function highlight(id) {
    const near = new Set(id ? [id] : []);
    if (id) edges().forEach((ed) => { if (ed.from === id) near.add(ed.to); if (ed.to === id) near.add(ed.from); });
    stage.querySelectorAll('[data-node]').forEach((n) => n.classList.toggle('dim', !!id && !near.has(n.getAttribute('data-node'))));
    stage.querySelectorAll('[data-edge]').forEach((l) => { const [a, b] = l.getAttribute('data-edge').split('|'); l.classList.toggle('dim', !!id && a !== id && b !== id); });
  }

  function draw() {
    gEdges.replaceChildren(); gLabels.replaceChildren(); gNodes.replaceChildren();
    for (const ed of edges()) {
      const a = P(APP.entry(ed.from)), b = P(APP.entry(ed.to)), key = ed.from + '|' + ed.to;
      if (tree() && b.y - a.y > CH) {
        const y1 = a.y + CH / 2, y2 = b.y - CH / 2 - 18, ym = (y1 + y2) / 2;
        gEdges.append(s('path', { class: 'g-edge elbow', 'data-edge': key, d: `M${a.x},${y1} V${ym} H${b.x} V${y2}`, 'marker-end': 'url(#arrow)' }));
        gLabels.append(s('text', { class: 'g-elabel', 'data-edge': key, x: b.x, y: y2 - 6, 'text-anchor': 'middle' }, ed.label));
        continue;
      }
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, r = 46;
      if (d < r * 2) continue;
      const x1 = a.x + (dx / d) * r, y1 = a.y + (dy / d) * r, x2 = b.x - (dx / d) * (r + 4), y2 = b.y - (dy / d) * (r + 4);
      gEdges.append(s('line', { class: 'g-edge' + (ed.kind === 'mention' ? ' mention' : ''), 'data-edge': key, x1, y1, x2, y2, 'marker-end': ed.kind === 'rel' ? 'url(#arrow)' : null }));
      if (ed.label) gLabels.append(s('text', { class: 'g-elabel', 'data-edge': key, x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 4, 'text-anchor': 'middle' }, ed.label));
    }
    for (const e of S().entries) {
      const p = P(e), init = (e.name.replace(/^(le|la|les|l')\s*/i, '')[0] || '?').toUpperCase();
      gNodes.append(s('g', { class: 'g-node g-card' + (selected === e.id ? ' sel' : ''), 'data-node': e.id, transform: `translate(${p.x} ${p.y})`, style: `--c:${APP.color(e)}` },
        s('rect', { class: 'card', x: -CW / 2, y: -CH / 2, width: CW, height: CH, rx: 8 }),
        e.image ? s('image', { href: e.image, x: -26, y: -34, width: 52, height: 52, preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'url(#card-clip)' })
          : s('g', null, s('rect', { class: 'portrait', x: -26, y: -34, width: 52, height: 52, rx: 6 }), s('text', { class: 'initial', y: -1 }, init)),
        s('text', { class: 'kind', y: 31 }, APP.type(e).label + (Number.isFinite(e.year) ? ' · ' + e.year : '')),
        s('text', { class: 'name', y: CH / 2 + 17 }, e.name)));
    }
  }

  function stopAnim() { if (anim) cancelAnimationFrame(anim); anim = null; }
  function relayout() {
    stopAnim();
    const ents = S().entries, links = linksFor(ents);
    ents.forEach((e) => { e.x += (Math.random() - 0.5) * 140; e.y += (Math.random() - 0.5) * 140; });
    let i = 0; const N = 110;
    const step = () => {
      for (let k = 0; k < 3; k++) tick(ents, links, 30 * (1 - i / N) + 0.6);
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
      treePos = tree() ? treeLayout() : null;
      renderBar(); draw();
      const focus = U().focusNode && APP.entry(U().focusNode);
      if (focus) {
        selected = focus.id; U().focusNode = null; draw();
        const r = stage.getBoundingClientRect(), k = Math.max(pz.t.k, 1.1), p = P(focus);
        pz.t = { k, x: r.width / 2 - p.x * k, y: r.height / 2 - p.y * k }; pz.apply(); fitted = true;
      } else if (!fitted) { pz.fit(bounds()); fitted = true; }
    },
    leave() { stopAnim(); },
  };
})();
