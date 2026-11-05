// Vue « Monde » : terrain peint en 2D (pinceaux), vue 3D, repères, événements datés, chronologie.
(function () {
  const { h, svg: s } = APP;
  const T = TERRAIN, S = () => APP.state, U = () => APP.ui;
  const WW = T.WW, WH = T.WH;
  let built = false, fitted = false, pz, stage, vp, gPins, gPeaks, canvas, wrap2d, wrap3d, labels3d, bar, dock, timeline, hint, selected = null, rafPaint = 0, undo = [];
  const TOOLS = [['pan', 'Déplacer'], ['raise', 'Relever'], ['lower', 'Creuser'], ['smooth', 'Adoucir'], ['paint', 'Peindre']];
  const tool = () => U().tool || 'pan';
  const mode = () => (U().mapMode === '3d' && R3D.ok ? '3d' : '2d');

  // ---------- chronologie ----------
  const years = () => S().entries.filter((e) => e.type === 'evenement' && Number.isFinite(e.year)).map((e) => e.year);
  const yearMax = () => (U().year != null ? U().year : Math.max(...years(), 0));
  function visiblePins() {
    const L = layers();
    return S().pins.filter((p) => { const e = APP.entry(p.entryId); if (!e) return false; const ev = e.type === 'evenement'; if (ev ? !L.evenements : !L.reperes) return false; return !(ev && Number.isFinite(e.year) && e.year > yearMax()); });
  }

  function repaint() { if (!rafPaint) rafPaint = requestAnimationFrame(() => { rafPaint = 0; T.render2D(canvas, drawOpts()); }); }

  function drawPins() {
    gPins.replaceChildren(); gPeaks.replaceChildren();
    if (layers().sommets) for (const pk of T.peaks(4)) gPeaks.append(s('g', { class: 'peak', transform: `translate(${pk.x} ${pk.y})` }, s('path', { d: 'M-7,5 L0,-7 L7,5 Z' }), s('text', { x: 10, y: 4 }, pk.alt.toLocaleString('fr') + ' m')));
    const sc = 1 / Math.sqrt(Math.max(pz ? pz.t.k : 1, 0.3));
    for (const p of visiblePins()) {
      const e = APP.entry(p.entryId), ev = e.type === 'evenement';
      gPins.append(s('g', { class: 'pin' + (ev ? ' ev' : '') + (selected === p.id ? ' sel' : ''), 'data-pin': p.id, transform: `translate(${p.x} ${p.y}) scale(${sc})`, style: `--c:${APP.color(e)}` },
        ev ? s('path', { d: 'M0,0 L-9,-14 L0,-28 L9,-14 Z' }) : s('path', { d: 'M0,0 C-6,-9 -11,-14 -11,-21 A11,11 0 1 1 11,-21 C11,-14 6,-9 0,0 Z' }),
        ev ? null : s('circle', { cy: -21, r: 4 }),
        s('text', { y: 18 }, e.name),
        ev && Number.isFinite(e.year) ? s('text', { y: 33, class: 'yr' }, 'an ' + e.year) : null));
    }
    if (mode() === '3d') R3D.setLabels(visiblePins().map((p) => { const e = APP.entry(p.entryId); return { x: p.x, y: p.y, name: e.name, color: APP.color(e), kind: e.type === 'evenement' ? 'event' : 'place', onClick: (ev) => showPinCard(p, ev.clientX, ev.clientY) }; }));
  }

  function showPinCard(p, cx, cy) {
    const e = APP.entry(p.entryId);
    APP.showPeek(APP.entryCard(e, h('button', { class: 'btn', onclick: () => { S().pins = S().pins.filter((x) => x.id !== p.id); selected = null; APP.save(); drawPins(); APP.hidePeek(); APP.toast('Repère retiré'); } }, 'Retirer')), cx, cy);
  }

  // ---------- poser un repère ou un événement ----------
  function setPlacing(kind) {
    U().placing = kind || null;
    const e = APP.entry(U().placeFor);
    hint.hidden = !kind;
    hint.firstChild.textContent = kind === 'event' ? "Touche l'endroit où l'événement a eu lieu" : e ? `Touche la carte pour placer « ${e.name} »` : 'Touche la carte pour placer un repère';
  }
  function screenOf(w) { const r = stage.getBoundingClientRect(); return [r.left + pz.t.x + w.x * pz.t.k, r.top + pz.t.y + w.y * pz.t.k]; }
  function placeAt(w) {
    const [cx, cy] = screenOf(w);
    if (U().placing === 'event') {
      const title = h('input', { id: 'ev-title', placeholder: 'Ce qui s’est passé', 'aria-label': 'Titre' });
      const year = h('input', { id: 'ev-year', type: 'number', value: String(yearMax() || 312), 'aria-label': 'Année' });
      const text = h('textarea', { id: 'ev-text', rows: 3, placeholder: 'Qui était là ? Les noms des fiches deviendront des liens.', 'aria-label': 'Récit' });
      const create = () => {
        const name = title.value.trim(); if (!name) { title.focus(); return; }
        const body = text.value.trim(), e = { id: APP.uid('e'), type: 'evenement', name, aliases: [], year: Math.round(Number(year.value) || 0), summary: body.split(/(?<=[.!?])\s/)[0] || '', body };
        S().entries.push(e); S().pins.push({ id: APP.uid('p'), entryId: e.id, x: w.x, y: w.y });
        U().year = null; APP.invalidate(); APP.save(); setPlacing(null); APP.hidePeek(); APP.renderSidebar(); renderTimeline(); drawPins(); APP.toast('Événement ajouté à la carte');
      };
      APP.showPeek(h('form', { class: 'mini-form', onsubmit: (ev) => { ev.preventDefault(); create(); } }, h('h4', null, 'Nouvel événement'), title, year, text,
        h('div', { class: 'peek-actions' }, h('button', { class: 'btn btn-accent', type: 'submit' }, 'Créer'), h('button', { class: 'btn', type: 'button', onclick: () => { APP.hidePeek(); setPlacing(null); } }, 'Annuler'))), cx, cy);
      setTimeout(() => title.focus(), 0);
      return;
    }
    const finish = (entryId) => {
      const ex = S().pins.find((p) => p.entryId === entryId);
      if (ex) Object.assign(ex, { x: w.x, y: w.y }); else S().pins.push({ id: APP.uid('p'), entryId, x: w.x, y: w.y });
      U().placeFor = null; setPlacing(null); APP.save(); drawPins(); APP.hidePeek(); APP.toast('Repère placé');
    };
    if (APP.entry(U().placeFor)) return finish(U().placeFor);
    const sel = h('select', { id: 'pin-entry', 'aria-label': 'Fiche à placer' }, S().entries.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((e) => h('option', { value: e.id, selected: e.type === 'lieu' && !S().pins.some((p) => p.entryId === e.id) }, e.name)));
    APP.showPeek(h('div', null, h('h4', null, 'Nouveau repère'), sel, h('div', { class: 'peek-actions' }, h('button', { class: 'btn btn-accent', onclick: () => finish(sel.value) }, 'Placer ici'), h('button', { class: 'btn', onclick: () => { APP.hidePeek(); setPlacing(null); } }, 'Annuler'))), cx, cy);
  }

  // ---------- en-tête, calques et dock d'outils ----------
  const layers = () => (U().layers = U().layers || { forets: true, courbes: true, reperes: true, evenements: true, sommets: true });
  const LAYERS = [['forets', 'Forêts'], ['courbes', 'Courbes de niveau'], ['reperes', 'Lieux et repères'], ['evenements', 'Événements'], ['sommets', 'Sommets']];
  const drawOpts = () => ({ trees: layers().forets, contours: layers().courbes });
  function layersMenu(ev) {
    ev.stopPropagation();
    const r = ev.currentTarget.getBoundingClientRect();
    APP.showPeek(h('div', { class: 'menu' }, h('span', { class: 'menu-label' }, 'Calques'),
      LAYERS.map(([k, label]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'layer-' + k, checked: layers()[k], onchange: (e) => {
        layers()[k] = e.target.checked;
        if (k === 'forets' && R3D.ok) R3D.setTrees(e.target.checked);
        if (mode() === '2d') T.render2D(canvas, drawOpts());
        drawPins();
      } }), label))), r.left + 140, r.bottom - 6);
  }
  function renderBar() {
    const m = mode();
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Vue' },
      h('button', { 'aria-pressed': String(m === '2d'), onclick: () => { U().mapMode = '2d'; APP.views.map.render(); } }, 'Carte 2D'),
      h('button', { 'aria-pressed': String(m === '3d'), disabled: !R3D.ok, title: R3D.ok ? '' : 'WebGL indisponible sur cet appareil', onclick: () => { U().mapMode = '3d'; APP.views.map.render(); } }, 'Relief 3D'));
    const tlOn = U().showTimeline !== false;
    bar.replaceChildren(...[
      h('span', { class: 'map-name' }, h('span', { class: 'mn-k' }, 'Carte'), S().world.name),
      seg,
      h('button', { class: 'btn', id: 'm-layers', onclick: layersMenu }, 'Calques'),
      years().length ? h('button', { class: 'btn' + (tlOn ? ' on' : ''), id: 'm-tl', 'aria-pressed': String(tlOn), onclick: () => { U().showTimeline = !tlOn; renderBar(); renderTimeline(); } }, 'Chronologie') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', id: 'm-add', onclick: () => { U().placeFor = null; U().mapMode = '2d'; APP.views.map.render(); setPlacing('pin'); } }, '+ Repère'),
      h('button', { class: 'btn btn-accent', id: 'm-event', onclick: () => { U().mapMode = '2d'; APP.views.map.render(); setPlacing('event'); } }, '+ Événement'),
      m === '3d' ? h('button', { class: 'btn', onclick: () => R3D.reset() }, 'Recentrer') : null,
      hint].filter(Boolean));
    dock.hidden = m !== '2d';
    if (m === '2d') {
      const tools = h('div', { class: 'seg tools', role: 'group', 'aria-label': 'Outil' }, TOOLS.map(([id, label]) => h('button', { 'aria-pressed': String(tool() === id), id: 'tool-' + id, onclick: () => { U().tool = id; renderBar(); } }, label)));
      const size = tool() !== 'pan' ? h('label', { class: 'size' }, 'Taille', h('input', { type: 'range', id: 'brush-size', min: '10', max: '90', value: String(U().brush || 32), oninput: (e) => (U().brush = +e.target.value) })) : null;
      const undoBtn = h('button', { class: 'btn', id: 'm-undo', disabled: !undo.length, onclick: () => { const snap = undo.pop(); if (!snap) return; const raw = T.raw(); raw.H.set(snap.H); raw.B.set(snap.B); T.version++; T.save(S()); APP.save(); repaint(); renderBar(); } }, 'Annuler');
      const pal = tool() === 'paint' ? h('div', { class: 'palette' }, T.BIOMES.map((bm, i) => h('button', { class: 'swatch', 'aria-pressed': String((U().biome ?? 3) === i), style: { '--sw': `rgb(${bm.color.join(',')})` }, onclick: () => { U().biome = i; renderBar(); } }, h('span', { class: 'sw' }), bm.name))) : null;
      dock.replaceChildren(...[pal, h('div', { class: 'dock-row' }, tools, size, undoBtn)].filter(Boolean));
    }
    stage.classList.toggle('brushing', m === '2d' && tool() !== 'pan');
  }

  function renderTimeline() {
    const ys = years();
    timeline.hidden = !ys.length || U().showTimeline === false;
    if (timeline.hidden) return;
    const min = Math.min(...ys), max = Math.max(...ys), val = Math.min(max, Math.max(min, yearMax()));
    const n = S().entries.filter((e) => e.type === 'evenement' && Number.isFinite(e.year) && e.year <= val).length;
    timeline.replaceChildren(h('span', { class: 'tl-label' }, 'Chronologie'),
      h('input', { type: 'range', id: 'timeline', min: String(min), max: String(max), value: String(val), 'aria-label': 'Afficher les événements jusqu’à l’année', oninput: (e) => { U().year = +e.target.value; renderTimeline(); drawPins(); } }),
      h('span', { class: 'tl-year' }, 'an ' + val), h('span', { class: 'tl-count' }, n + (n > 1 ? ' événements' : ' événement')));
  }

  function build() {
    const root = document.getElementById('view-map');
    canvas = h('canvas', { class: 'terrain', width: '2000', height: '1400' });
    wrap2d = h('div', { class: 'map2d' }, canvas);
    labels3d = h('div', { class: 'labels3d' });
    wrap3d = h('div', { class: 'map3d', hidden: true }, labels3d);
    stage = s('svg', { class: 'stage overlay', id: 'map-stage', role: 'img', 'aria-label': 'Carte du monde avec repères' }, (vp = s('g', null, (gPeaks = s('g')), (gPins = s('g')))));
    hint = h('span', { class: 'place-hint', hidden: true }, '', ' ', h('button', { class: 'link-btn', style: { color: 'inherit', textDecoration: 'underline' }, onclick: () => { U().placeFor = null; setPlacing(null); APP.hidePeek(); } }, 'Annuler'));
    bar = h('div', { class: 'toolbar' });
    dock = h('div', { class: 'dock' });
    timeline = h('div', { class: 'timeline', hidden: true });
    root.append(wrap2d, stage, wrap3d, h('div', { class: 'map-ui' }, bar, timeline), dock);
    pz = new APP.PanZoom(stage, vp, {
      min: 0.3, max: 8,
      hit: (e) => { if (tool() !== 'pan' && !U().placing) return '__brush'; const g = e.target.closest && e.target.closest('[data-pin]'); return g ? g.getAttribute('data-pin') : null; },
      dragStart: (id, w) => { if (id === '__brush') { const raw = T.raw(); undo.push({ H: raw.H.slice(), B: raw.B.slice() }); if (undo.length > 25) undo.shift(); stroke(w); } },
      drag: (id, w) => { if (id === '__brush') return stroke(w); const p = S().pins.find((x) => x.id === id); if (p) { p.x = w.x; p.y = w.y; drawPins(); } },
      dragEnd: (id) => { if (id === '__brush') { T.save(S()); renderBar(); } APP.save(); },
      tap: (id, ev, w) => {
        if (id === '__brush') { T.save(S()); APP.save(); renderBar(); return; }
        if (id) { selected = id; drawPins(); showPinCard(S().pins.find((p) => p.id === id), ev.clientX, ev.clientY); }
        else if (U().placing) placeAt(w);
        else if (selected) { selected = null; drawPins(); }
      },
    });
    const apply = pz.apply.bind(pz);
    pz.apply = () => {
      apply();
      canvas.style.transform = `translate(${pz.t.x}px, ${pz.t.y}px) scale(${pz.t.k})`;
      const sc = 1 / Math.sqrt(Math.max(pz.t.k, 0.3));
      gPeaks.querySelectorAll('.peak').forEach((g) => { const m = /translate\(([^ ]+) ([^)]+)\)/.exec(g.getAttribute('transform')); if (m) g.setAttribute('transform', `translate(${m[1]} ${m[2]}) scale(${sc})`); });
      gPins.querySelectorAll('[data-pin]').forEach((g) => { const p = S().pins.find((x) => x.id === g.getAttribute('data-pin')); if (p) g.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${sc})`); });
    };
    built = true;
  }
  function stroke(w) { T.brush(tool(), w.x, w.y, U().brush || 32, U().biome ?? 3); repaint(); }

  APP.views.map = {
    render() {
      if (!built) build();
      const m = mode();
      wrap2d.hidden = m !== '2d'; stage.style.display = m === '2d' ? '' : 'none'; wrap3d.hidden = m !== '3d';
      renderBar(); renderTimeline();
      if (m === '2d') {
        R3D.ok && R3D.unmount();
        T.render2D(canvas, drawOpts());
        if (!fitted) { const r = stage.getBoundingClientRect(); pz.fit(r.width < r.height ? { x: 170, y: 150, w: 470, h: 470 } : { x: 0, y: 0, w: WW, h: WH }, 12); fitted = true; }
        else pz.apply();
        if (U().placeFor) setPlacing('pin');
      } else if (!R3D.mount(wrap3d, labels3d)) { U().mapMode = '2d'; return APP.views.map.render(); }
      drawPins();
      const p = U().focusPin && S().pins.find((x) => x.id === U().focusPin);
      if (p) {
        U().focusPin = null; selected = p.id; drawPins();
        if (m === '3d') R3D.focus(p.x, p.y);
        else { const r = stage.getBoundingClientRect(), k = Math.max(pz.t.k, 1.4); pz.t = { k, x: r.width / 2 - p.x * k, y: r.height / 2 - p.y * k }; pz.apply(); showPinCard(p, r.left + r.width / 2, r.top + r.height / 2); }
      }
    },
    leave() { U().placing = null; U().placeFor = null; if (R3D.ok) R3D.unmount(); },
  };
})();
