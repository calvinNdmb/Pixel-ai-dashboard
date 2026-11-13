// Interface : le monde, les modes, les outils, les fiches et les habitants.
(function () {
  const T = TERRAIN, G = TOWN, KEY = 'archipel2-world-v1';
  const APP = (window.APP = {});
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const ICONS = {
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.500l-2 5-5 2 2-5z"/>', brush: '<path d="M14 4l6 6-9 9H5v-6z"/><path d="M12 6l6 6"/>',
    undo: '<path d="M7 6L3 10l4 4"/><path d="M3 10h10a5 5 0 0 1 0 10h-2"/>', mountain: '<path d="M3 19l6-11 4 7 2-3 6 7z"/>',
    drop: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>', house: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
    waves: '<path d="M3 9c3-3 6 3 9 0s6 3 9 0"/><path d="M3 15c3-3 6 3 9 0s6 3 9 0"/>', route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 18h4a4 4 0 0 0 0-8h-1a2.500 2.500 0 0 1 0-5h5"/>',
    tower: '<path d="M8 21V9l4-6 4 6v12z"/><path d="M11 21v-4h2v4"/>', field: '<path d="M4 18c4-2 12-2 16 0M4 13c4-2 12-2 16 0M4 8c4-2 12-2 16 0"/>',
    eraser: '<path d="M3 17l9-9 6 6-5 5H7z"/><path d="M13 20h7"/>', search: '<circle cx="11" cy="11" r="6.500"/><path d="M16 16l4.500 4.500"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 15h.01M12 12h.01"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>', eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.500"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.300"/><path d="M16 14.500a5 5 0 0 1 5 5"/>',
  };
  function icon(name, size) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size || 22); s.setAttribute('height', size || 22); s.setAttribute('aria-hidden', 'true'); s.innerHTML = ICONS[name]; return s; }
  const btn = (label, onclick, cls, ic) => h('button', { class: 'btn ' + (cls || ''), onclick }, ic ? icon(ic, 18) : null, label);

  // ---------- le monde : chargement, exemple, sauvegarde ----------
  function seed() {
    const s = makeSeed();
    s.towns = [{ id: 't-portsel', entryId: 'portsel', seed: 3, discs: [[372, 456, 27, 1], [348, 452, 19, 1], [396, 452, 19, 1], [372, 436, 19, 1]] }];
    s.features = { rivers: [], roads: [], monuments: [], fields: [] };
    const oren = s.entries.find((e) => e.id === 'oren'); oren.home = { town: 't-portsel' }; oren.job = 'cartographe';
    const res = (id, name, job, summary) => s.entries.push({ id, type: 'personnage', name, aliases: [], summary, body: '', job, home: { town: 't-portsel' } });
    res('maren', 'Maren Tallec', 'saunière', 'Elle récolte le sel des trois collines.');
    res('corwin', 'Corwin Madec', 'passeur', 'Sa barque fait la navette entre les quais.');
    res('odile', 'Odile Guern', 'aubergiste', 'Elle tient une des pires tavernes du port, et en est fière.');
    return s;
  }
  function flatten(x, y, r) { // le pinceau ville aplanit le sol sous lui
    const { H } = T.raw(), SEA = T.SEA, GW = T.GW, GH = T.GH, cx = (x / 1000) * (GW - 1), cy = (y / 700) * (GH - 1), gr = (r / 1000) * (GW - 1) * 1.4;
    const c = H[clamp(Math.round(cy), 0, GH - 1) * GW + clamp(Math.round(cx), 0, GW - 1)], target = clamp(c, SEA + 6, SEA + 46);
    for (let gy = Math.max(0, Math.floor(cy - gr)); gy <= Math.min(GH - 1, Math.ceil(cy + gr)); gy++) for (let gx = Math.max(0, Math.floor(cx - gr)); gx <= Math.min(GW - 1, Math.ceil(cx + gr)); gx++) {
      const d = Math.hypot(gx - cx, gy - cy) / gr; if (d > 1) continue;
      const i = gy * GW + gx; if (H[i] < SEA) continue;
      let w = d < 0.7 ? 1 : 1 - (d - 0.7) / 0.3; w = w * w * (3 - 2 * w);
      H[i] = Math.round(H[i] + (target - H[i]) * w * 0.9);
    }
    T.version++;
  }
  let S = null;
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.version === 2 && Array.isArray(s.towns)) S = s; } } catch (e) {}
  const fresh = !S; if (fresh) S = seed();
  function adopt(state) {
    S = APP.state = state; S.towns = S.towns || []; S.pins = S.pins || []; S.relations = S.relations || [];
    S.features = Object.assign({ rivers: [], roads: [], monuments: [], fields: [] }, S.features || {});
    T.init(S); S.towns.forEach((t) => G.bbox(t));
  }
  adopt(S);
  if (fresh) { S.towns.forEach((t) => t.discs.forEach((d) => flatten(d[0], d[1], d[2]))); T.save(S); }
  let saveT = null;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { T.save(S); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Sauvegarde impossible sur cet appareil'); } }, 400); }
  const entry = (id) => S.entries.find((e) => e.id === id) || null;
  const townOf = (id) => S.towns.find((t) => t.id === id) || null;
  const residents = (townId) => S.entries.filter((e) => e.home && e.home.town === townId);

  // ---------- annuler ----------
  const undoStack = [];
  function snap() { const { H, B } = T.raw(); undoStack.push({ json: JSON.stringify({ towns: S.towns, features: S.features, entries: S.entries, pins: S.pins }), H: H.slice(), B: B.slice() }); if (undoStack.length > 14) undoStack.shift(); drawTop(); }
  function undo() { const u = undoStack.pop(); if (!u) return; const raw = T.raw(); raw.H.set(u.H); raw.B.set(u.B); T.version++; Object.assign(S, JSON.parse(u.json)); S.towns.forEach((t) => G.bbox(t)); closeSheet(); refresh(); drawTop(); toast('Annulé'); }

  // ---------- état de l'interface ----------
  const ui = (APP.ui = { shaping: false, tool: 'ville', relief: 'raise', biome: 3, monument: 'phare', crop: 'lavande', sizes: { relief: 30, biome: 26, ville: 14, gomme: 14 } });
  const TOOLS = [['relief', 'Relief', 'mountain'], ['biome', 'Biomes', 'drop'], ['ville', 'Ville', 'house'], ['riviere', 'Rivière', 'waves'], ['route', 'Route', 'route'], ['monument', 'Monument', 'tower'], ['champs', 'Champs', 'field'], ['gomme', 'Gomme', 'eraser']];
  const HINTS = {
    relief: 'Glisse pour modeler le terrain.', biome: 'Glisse pour peindre le sol.', ville: 'Glisse sur la terre : les rues et les maisons se posent toutes seules.',
    riviere: 'Touche un versant : la rivière descend jusqu’à la mer.', route: 'Glisse pour tracer une route. Un pont se pose à chaque rivière.',
    monument: 'Choisis, puis touche l’endroit.', champs: 'Touche ou glisse pour semer.', gomme: 'Glisse sur une ville pour la réduire. Touche un détail pour l’enlever.',
  };
  const sized = () => ui.sizes[ui.tool];
  let rbT = null;
  function refresh() { clearTimeout(rbT); rbT = null; SC.rebuild(); labels(); }
  function soon() { if (!rbT) rbT = setTimeout(refresh, 150); }

  // ---------- gestes d'outil ----------
  let stroke = null;
  SC.input.tool = () => (ui.shaping ? ui.tool : null);
  SC.input.hover = (g) => (g && sized() ? SC.ring(g[0], g[1], sized()) : SC.ring(null));
  SC.input.strokeStart = (g) => { snap(); stroke = { last: g, town: null, isNew: false, road: null }; apply(g, true); };
  SC.input.stroke = (g) => stroke && apply(g, false);
  SC.input.strokeEnd = () => { if (stroke) finish(); };
  SC.input.tap = (hit) => onTap(hit);
  const land = (x, y) => T.heightAtWorld(x, y) >= T.SEA / 255 + 0.004;

  function apply(g, first) {
    const [x, y] = g, tool = ui.tool, F = S.features;
    if (sized()) SC.ring(x, y, sized());
    if (tool === 'relief') { T.brush(ui.relief, x, y, sized()); SC.terrainOnly(); }
    else if (tool === 'biome') { T.brush('paint', x, y, sized(), ui.biome); SC.terrainOnly(); }
    else if (tool === 'ville') {
      if (first) { stroke.town = S.towns.find((t) => G.near(t, x, y, 10)) || null; if (!stroke.town) { stroke.town = { id: uid('t'), entryId: null, seed: 1 + Math.floor(Math.random() * 9000), discs: [] }; stroke.isNew = true; S.towns.push(stroke.town); } }
      if (G.stamp(stroke.town, x, y, sized(), 1)) { flatten(x, y, sized()); soon(); }
    } else if (tool === 'gomme') {
      let hitTown = false;
      S.towns.forEach((t) => { if (G.near(t, x, y, sized()) && G.stamp(t, x, y, sized(), -1)) hitTown = true; });
      if (first && !hitTown) {
        const near = (L, f) => { const i = L.findIndex(f); if (i >= 0) { L.splice(i, 1); return true; } return false; };
        near(F.monuments, (m) => Math.hypot(m.x - x, m.y - y) < 12) || near(F.fields, (f) => Math.hypot(f.x - x, f.y - y) < 14) || near(F.roads, (r) => r.pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < 9)) || near(F.rivers, (r) => G.riverPath(r.from).some((p) => Math.hypot(p[0] - x, p[1] - y) < 9));
      }
      soon();
    } else if (tool === 'riviere') { if (first) { if (land(x, y)) { F.rivers.push({ id: uid('rv'), from: [Math.round(x), Math.round(y)] }); soon(); } else toast('Une rivière naît sur la terre : touche un versant.'); } }
    else if (tool === 'route') {
      if (first) { stroke.road = { id: uid('rd'), pts: [[Math.round(x), Math.round(y)]] }; F.roads.push(stroke.road); }
      else { const l = stroke.road.pts[stroke.road.pts.length - 1]; if (Math.hypot(l[0] - x, l[1] - y) >= 6) { stroke.road.pts.push([Math.round(x), Math.round(y)]); soon(); } }
    } else if (tool === 'monument') {
      if (first) { if (!land(x, y)) return toast('Un monument se pose sur la terre.'); const t = nearestTown(x, y, 60), kind = ui.monument, base = SC.monumentKinds[kind]; F.monuments.push({ id: uid('m'), kind, x: Math.round(x), y: Math.round(y), rot: Math.random() * 6.28, name: t && entry(t.entryId) ? `${base} de ${entry(t.entryId).name}` : base }); soon(); }
    } else if (tool === 'champs') {
      if ((first || Math.hypot(stroke.last[0] - x, stroke.last[1] - y) >= 24) && land(x, y)) { const gx = T.heightAtWorld(x + 5, y) - T.heightAtWorld(x - 5, y), gy = T.heightAtWorld(x, y + 5) - T.heightAtWorld(x, y - 5); F.fields.push({ id: uid('f'), x: Math.round(x), y: Math.round(y), ang: Math.abs(gx) + Math.abs(gy) < 1e-4 ? 0.4 : Math.atan2(gy, gx) + Math.PI / 2, crop: ui.crop }); stroke.last = g; soon(); }
    }
  }
  function finish() {
    const st = stroke; stroke = null; SC.ring(null);
    if (st.road && (st.road.pts.length < 2 || Math.hypot(st.road.pts[0][0] - st.road.pts[st.road.pts.length - 1][0], st.road.pts[0][1] - st.road.pts[st.road.pts.length - 1][1]) < 10)) { S.features.roads = S.features.roads.filter((r) => r !== st.road); if (st.road.pts.length < 2) toast('Glisse pour tracer la route.'); }
    refresh();
    // villes nées ou disparues
    S.towns.slice().forEach((t) => {
      const gen = SC.towns[t.id], n = gen ? gen.houses.length : 0;
      if (!n) { S.towns = S.towns.filter((x) => x !== t); const e = entry(t.entryId); if (e && !e.body && !e.summary) { S.entries = S.entries.filter((x) => x !== e); S.pins = S.pins.filter((p) => p.entryId !== e.id); } S.entries.forEach((p) => { if (p.home && p.home.town === t.id) delete p.home; }); if (t === st.town && st.isNew) toast('Peins un peu plus large, sur la terre ferme.'); }
      else if (!t.entryId) { const taken = new Set(S.entries.map((e) => e.name.toLowerCase())), name = G.townName(G.rng(t.seed * 7 + 11), taken), e = { id: uid('e'), type: 'lieu', kind: 'ville', name, aliases: [], summary: '', body: '' }; S.entries.push(e); t.entryId = e.id; toast(`${name} est née. Touche son nom pour la découvrir.`); }
    });
    refresh(); save();
  }
  function nearestTown(x, y, max) { let best = null, bd = max || 1e9; S.towns.forEach((t) => { const gen = SC.towns[t.id]; if (!gen) return; const d = Math.hypot(gen.cx - x, gen.cy - y) - gen.meanR; if (d < bd) { bd = d; best = t; } }); return best; }

  // ---------- étiquettes sur la carte ----------
  function labels() {
    const specs = [];
    S.towns.forEach((t) => { const gen = SC.towns[t.id], e = entry(t.entryId); if (gen && gen.houses.length) specs.push({ kind: 'town', text: e ? e.name : 'Nouvelle ville', x: gen.cx, y: gen.cy, up: 17, onTap: () => openTown(t.id) }); });
    S.pins.forEach((p) => { const e = entry(p.entryId); if (e && e.type === 'lieu' && !S.towns.some((t) => t.entryId === e.id)) specs.push({ kind: 'place', text: e.name, x: p.x, y: p.y, up: 8, onTap: () => openEntry(e.id) }); });
    SC.monuments.forEach((m) => specs.push({ kind: 'mon', text: m.name, x: m.x, y: m.y, up: m.up + 2, maxDist: 520, onTap: () => openMonument(m.id) }));
    SC.walkers.forEach((w) => { const e = w.entry && entry(w.entry); if (e) specs.push({ kind: 'res', text: (e.aliases && e.aliases[0]) || e.name.split(' ')[0], maxDist: 250, pos: () => [w.x, w.y, 3.6], onTap: () => openResident(e.id) }); });
    SC.setLabels(specs);
  }

  // ---------- fiches (panneau du bas) ----------
  const sheet = $('sheet');
  function openSheet(...kids) { sheet.replaceChildren(h('button', { class: 'sheet-x icon-btn', 'aria-label': 'Fermer', onclick: closeSheet }, icon('close', 18)), ...kids); sheet.hidden = false; sheet.scrollTop = 0; $('app').classList.add('has-sheet'); }
  function closeSheet() { sheet.hidden = true; $('app').classList.remove('has-sheet'); }
  const tag = (t) => h('span', { class: 'tag' }, t);
  const avatar = (e) => h('span', { class: 'avatar' }, (e.name[0] || '?').toUpperCase());
  function confirmBtn(label, fn) { let armed = false; const b = h('button', { class: 'btn danger', onclick: () => { if (armed) return fn(); armed = true; b.textContent = 'Confirmer'; setTimeout(() => { armed = false; b.textContent = label; }, 3000); } }, label); return b; }
  function field(label, input) { const id = uid('f'); input.id = id; return h('div', { class: 'field' }, h('label', { for: id }, label), input); }

  function openTown(id) {
    const t = townOf(id), gen = SC.towns[id]; if (!t || !gen) return;
    const e = entry(t.entryId), res = residents(id), pop = Math.round(gen.houses.length * 4.6);
    const name = h('input', { class: 'title-input', value: e.name, 'aria-label': 'Nom de la ville', oninput: (ev) => { e.name = ev.target.value.trim() || 'Sans nom'; save(); labels(); } });
    const b = T.bAt(Math.round((gen.cx / 1000) * (T.GW - 1)), Math.round((gen.cy / 700) * (T.GH - 1)));
    openSheet(
      h('div', { class: 'row' }, name, h('button', { class: 'icon-btn', 'aria-label': 'Proposer un autre nom', onclick: () => { e.name = G.townName(G.rng(Date.now() % 1e9), new Set(S.entries.map((x) => x.name.toLowerCase()))); name.value = e.name; save(); labels(); } }, icon('dice', 18))),
      h('div', { class: 'tags' }, tag(gen.tier), tag(gen.houses.length + ' maisons'), tag('≈ ' + pop + ' habitants'), tag(gen.quay ? 'Port' : T.BIOMES[b || 2].name)),
      h('div', { class: 'actions' }, btn('Entrer dans la ville', () => { closeSheet(); SC.flyTo({ x: gen.cx, y: gen.cy, dist: clamp(gen.meanR * 2.6, 70, 130), phi: 1.05 }, 1100); }, 'accent'), btn('Agrandir', () => { closeSheet(); shape(true, 'ville'); SC.flyTo({ x: gen.cx, y: gen.cy, dist: clamp(gen.meanR * 6, 180, 360) }, 700); })),
      h('h3', null, 'Habitants connus', h('span', { class: 'count' }, res.length)),
      res.length ? h('div', { class: 'list' }, res.map((p) => h('button', { class: 'person', onclick: () => openResident(p.id) }, avatar(p), h('span', { class: 'grow' }, h('b', null, p.name), h('small', null, p.job || 'sans métier connu'))))) : h('p', { class: 'muted' }, 'Personne n’a encore de nom ici. Touche un passant ou une maison, ou ajoute quelqu’un.'),
      h('div', { class: 'actions' }, btn('Habitant', () => addResident(id, true), '', 'plus'), btn('Peupler (5)', () => { for (let i = 0; i < 5; i++) addResident(id, false, null, true); refresh(); save(); openTown(id); toast('5 habitants ont emménagé.'); }, '', 'people')),
      h('div', { class: 'actions end' }, confirmBtn('Supprimer la ville', () => { snap(); S.towns = S.towns.filter((x) => x !== t); S.entries.forEach((p) => { if (p.home && p.home.town === id) delete p.home; }); S.entries = S.entries.filter((x) => x !== e); closeSheet(); refresh(); save(); toast('Ville supprimée')}))
    );
  }
  function freeHouse(townId) { const gen = SC.towns[townId]; if (!gen || !gen.houses.length) return null; const taken = residents(townId).filter((p) => p.home.x != null); const free = gen.houses.filter((hs) => !taken.some((p) => Math.hypot(p.home.x - hs.x, p.home.y - hs.y) < 3)); const L = free.length ? free : gen.houses; return L[Math.floor(Math.random() * L.length)]; }
  function addResident(townId, open, house, quiet) {
    const taken = new Set(S.entries.map((e) => e.name.toLowerCase())), p = G.person(G.rng((Date.now() % 1e9) + S.entries.length * 7919), taken), hs = house || freeHouse(townId);
    const e = { id: uid('e'), type: 'personnage', name: p.name, aliases: [], summary: '', body: '', job: p.job, home: { town: townId, x: hs ? Math.round(hs.x * 10) / 10 : null, y: hs ? Math.round(hs.y * 10) / 10 : null } };
    S.entries.push(e); if (quiet) return e;
    refresh(); save(); if (open) openResident(e.id); return e;
  }
  function openResident(id) {
    const e = entry(id); if (!e) return;
    const t = e.home && townOf(e.home.town), te = t && entry(t.entryId), w = SC.walkers.find((x) => x.entry === id);
    const follow = h('button', { class: 'btn' + (SC.follow === w && w ? ' on' : ''), onclick: () => { if (!w) return; if (SC.follow === w) SC.follow = null; else { SC.flyTo({ x: w.x, y: w.y, dist: 44, phi: 1.12 }, 700); setTimeout(() => (SC.follow = w), 720); } follow.classList.toggle('on'); follow.lastChild.textContent = follow.classList.contains('on') ? 'Ne plus suivre' : 'Suivre dans la rue'; } }, icon('eye', 18), 'Suivre dans la rue');
    const notes = h('textarea', { rows: 3, placeholder: 'Qui est-ce ? Que veut cette personne ?', oninput: (ev) => { e.summary = ev.target.value; save(); } }); notes.value = e.summary || '';
    openSheet(
      h('div', { class: 'row' }, avatar(e), h('input', { class: 'title-input', value: e.name, 'aria-label': 'Nom', oninput: (ev) => { e.name = ev.target.value.trim() || 'Sans nom'; save(); labels(); } })),
      field('Métier', h('input', { value: e.job || '', placeholder: 'pêcheuse, forgeron, scribe…', oninput: (ev) => { e.job = ev.target.value; save(); } })),
      te ? h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => openTown(t.id) }, icon('house', 18), 'Habite à ' + te.name), w ? follow : null) : h('p', { class: 'muted' }, 'Sans domicile connu.'),
      field('Notes', notes),
      h('div', { class: 'actions end' }, confirmBtn('Supprimer', () => { S.entries = S.entries.filter((x) => x !== e); S.relations = S.relations.filter((r) => r.from !== id && r.to !== id); closeSheet(); refresh(); save(); }))
    );
  }
  function openMonument(id) {
    const m = S.features.monuments.find((x) => x.id === id); if (!m) return;
    openSheet(h('div', { class: 'row' }, h('input', { class: 'title-input', value: m.name, 'aria-label': 'Nom du monument', oninput: (ev) => { m.name = ev.target.value.trim() || SC.monumentKinds[m.kind]; save(); labels(); } })),
      h('div', { class: 'tags' }, tag(SC.monumentKinds[m.kind])),
      h('div', { class: 'actions end' }, confirmBtn('Enlever', () => { snap(); S.features.monuments = S.features.monuments.filter((x) => x !== m); closeSheet(); refresh(); save(); })));
  }
  function openEntry(id) {
    const e = entry(id); if (!e) return; if (e.home) return openResident(id); const t = S.towns.find((x) => x.entryId === id); if (t) return openTown(t.id);
    const pin = S.pins.find((p) => p.entryId === id), notes = h('textarea', { rows: 3, oninput: (ev) => { e.summary = ev.target.value; save(); } }); notes.value = e.summary || '';
    openSheet(h('div', { class: 'row' }, h('input', { class: 'title-input', value: e.name, 'aria-label': 'Nom', oninput: (ev) => { e.name = ev.target.value.trim() || 'Sans nom'; save(); labels(); } })),
      h('div', { class: 'tags' }, tag((TYPES[e.type] || TYPES.lieu).label), Number.isFinite(e.year) ? tag('an ' + e.year) : null), field('Résumé', notes),
      pin && e.type === 'lieu' ? h('div', { class: 'actions' }, btn('Peindre une ville ici', () => { closeSheet(); shape(true, 'ville'); SC.flyTo({ x: pin.x, y: pin.y, dist: 260 }, 700); }, 'accent', 'house')) : null);
  }
  function onTap(hit) {
    if (!hit) return closeSheet();
    if (hit.type === 'town') return openTown(hit.data.town.id);
    if (hit.type === 'monument') return openMonument(hit.data.id);
    if (hit.type === 'walker') {
      const w = hit.data; if (w.entry) return openResident(w.entry);
      const te = entry((townOf(w.town) || {}).entryId);
      return openSheet(h('h2', null, 'Un passant'), h('p', { class: 'muted' }, `Quelqu’un de ${te ? te.name : 'la ville'}, sans nom pour l’instant.`), h('div', { class: 'actions' }, btn('Lui donner un nom', () => addResident(w.town, true), 'accent', 'plus'), btn('Voir la ville', () => openTown(w.town))));
    }
    if (hit.type === 'house') {
      const { town, house } = hit.data, p = residents(town.id).find((r) => r.home.x != null && Math.hypot(r.home.x - house.x, r.home.y - house.y) < 3.2);
      if (p) return openResident(p.id);
      const te = entry(town.entryId);
      return openSheet(h('h2', null, 'Maison libre'), h('p', { class: 'muted' }, `Personne n’habite encore cette maison de ${te ? te.name : 'la ville'}.`), h('div', { class: 'actions' }, btn('Installer quelqu’un', () => addResident(town.id, true, house), 'accent', 'plus'), btn('Voir la ville', () => openTown(town.id))));
    }
  }

  // ---------- barres : haut, outils, bas ----------
  function shape(on, tool) { ui.shaping = on; if (tool) ui.tool = tool; if (!on) SC.ring(null); $('app').classList.toggle('shaping', on); if (on) closeSheet(); drawTop(); drawRail(); drawPanel(); }
  function drawTop() {
    $('top').replaceChildren(
      ui.shaping ? h('button', { class: 'btn accent big', id: 'done-btn', onclick: () => shape(false) }, 'Terminé') : h('button', { class: 'pill', id: 'world-btn', onclick: worldMenu }, h('span', { class: 'badge' }, icon('compass', 20)), S.world.name),
      ui.shaping ? h('button', { class: 'icon-btn big', id: 'undo-btn', 'aria-label': 'Annuler', disabled: !undoStack.length, onclick: undo }, icon('undo')) : h('button', { class: 'pill', id: 'shape-btn', onclick: () => shape(true) }, icon('brush', 20), 'Façonner'));
  }
  function drawRail() { $('rail').replaceChildren(...TOOLS.map(([id, label, ic]) => h('button', { class: 'tool', id: 'tool-' + id, 'aria-label': label, title: label, 'aria-pressed': String(ui.tool === id), onclick: () => { ui.tool = id; SC.ring(null); drawRail(); drawPanel(); } }, icon(ic)))); }
  function slider() { return h('label', { class: 'slider' }, 'Taille', h('input', { type: 'range', id: 'size', min: '6', max: '60', value: String(sized()), oninput: (e) => (ui.sizes[ui.tool] = +e.target.value) })); }
  function drawPanel() {
    const p = $('panel'), tool = ui.tool, name = TOOLS.find((t) => t[0] === tool)[1], kids = [h('div', { class: 'panel-head' }, h('b', null, name), h('span', null, HINTS[tool]))];
    if (tool === 'relief') kids.push(h('div', { class: 'seg' }, [['raise', 'Relever'], ['lower', 'Creuser'], ['smooth', 'Adoucir']].map(([id, l]) => h('button', { 'aria-pressed': String(ui.relief === id), onclick: () => { ui.relief = id; drawPanel(); } }, l))));
    if (tool === 'biome') kids.push(h('div', { class: 'swatches' }, T.BIOMES.map((b, i) => h('button', { class: 'swatch', 'aria-pressed': String(ui.biome === i), onclick: () => { ui.biome = i; drawPanel(); } }, h('i', { style: `background: rgb(${b.color.join(',')})` }), b.name))));
    if (tool === 'monument') kids.push(h('div', { class: 'swatches' }, Object.entries(SC.monumentKinds).map(([id, l]) => h('button', { class: 'swatch', 'aria-pressed': String(ui.monument === id), onclick: () => { ui.monument = id; drawPanel(); } }, l))));
    if (tool === 'champs') kids.push(h('div', { class: 'swatches' }, Object.entries(SC.crops).map(([id, c]) => h('button', { class: 'swatch', 'aria-pressed': String(ui.crop === id), onclick: () => { ui.crop = id; drawPanel(); } }, h('i', { style: `background: ${c[1]}` }), c[0]))));
    if (sized()) kids.push(slider());
    p.replaceChildren(...kids);
  }
  function drawBar() {
    const results = h('div', { class: 'results', id: 'results', hidden: true });
    const input = h('input', { id: 'search', type: 'search', placeholder: 'Chercher une ville, un habitant…', autocomplete: 'off', 'aria-label': 'Chercher', oninput: () => {
      const q = input.value.trim().toLocaleLowerCase('fr'); if (!q) { results.hidden = true; return; }
      const found = S.entries.filter((e) => (e.name + ' ' + (e.job || '')).toLocaleLowerCase('fr').includes(q)).slice(0, 6);
      results.replaceChildren(...(found.length ? found.map((e) => h('button', { class: 'person', onclick: () => { input.value = ''; results.hidden = true; input.blur(); jump(e); } }, avatar(e), h('span', { class: 'grow' }, h('b', null, e.name), h('small', null, e.job || (S.towns.some((t) => t.entryId === e.id) ? 'ville' : (TYPES[e.type] || TYPES.lieu).label.toLowerCase()))))) : [h('p', { class: 'muted' }, 'Rien à ce nom.')]));
      results.hidden = false;
    } });
    $('bar').replaceChildren(results, h('div', { class: 'searchbox' }, icon('search', 20), input),
      h('div', { class: 'chips' }, btn('Ville', () => { shape(true, 'ville'); toast('Glisse sur la terre pour peindre une ville.'); }, 'chip', 'plus'), btn('Habitant', () => { const t = nearestTown(SC.cam.x, SC.cam.y); if (!t) return toast('Peins d’abord une ville.'); addResident(t.id, true); }, 'chip', 'plus')));
  }
  function jump(e) {
    const t = S.towns.find((x) => x.entryId === e.id) || (e.home && townOf(e.home.town)), gen = t && SC.towns[t.id], pin = S.pins.find((p) => p.entryId === e.id);
    if (gen) SC.flyTo({ x: gen.cx, y: gen.cy, dist: clamp(gen.meanR * 4, 110, 260), phi: 0.95 }, 900); else if (pin) SC.flyTo({ x: pin.x, y: pin.y, dist: 300 }, 900);
    openEntry(e.id);
  }

  // ---------- menu du monde : renommer, exporter, importer, repartir de l'exemple ----------
  let downloads = null;
  if (window.claude && typeof window.claude.use === 'function') window.claude.use('downloads').then((d) => (downloads = d)).catch(() => {});
  function worldMenu() {
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (ev) => { const f = ev.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const w = JSON.parse(r.result); if (!w || w.version !== 2 || !Array.isArray(w.entries)) throw 0; adopt(w); undoStack.length = 0; closeSheet(); refresh(); save(); drawTop(); toast('Monde importé'); } catch (e) { toast('Ce fichier n’est pas un monde Archipel.'); } }; r.readAsText(f); } });
    openSheet(field('Nom du monde', h('input', { value: S.world.name, oninput: (ev) => { S.world.name = ev.target.value.trim() || 'Monde sans nom'; save(); drawTop(); } })),
      h('div', { class: 'tags' }, tag(S.towns.length + (S.towns.length > 1 ? ' villes' : ' ville')), tag(S.entries.filter((e) => e.home).length + ' habitants connus')),
      h('div', { class: 'actions' }, downloads ? btn('Exporter (.json)', async () => { T.save(S); try { await downloads.save({ filename: 'archipel-monde.json', data: JSON.stringify(S, null, 1) }); } catch (e) { toast('Export annulé'); } }) : null, btn('Importer', () => file.click()), file),
      h('div', { class: 'actions end' }, confirmBtn('Repartir du monde d’exemple', () => { try { localStorage.removeItem(KEY); } catch (e) {} adopt(seed()); S.towns.forEach((t) => t.discs.forEach((d) => flatten(d[0], d[1], d[2]))); undoStack.length = 0; closeSheet(); refresh(); save(); drawTop(); })));
  }

  let toastT = null;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }
  APP.toast = toast;

  // ---------- démarrage ----------
  APP.state = S;
  if (!SC.ok || !SC.init($('stage'), $('labels'))) { $('fallback').hidden = false; return; }
  SC.terrainOnly = SC.terrainOnly || (() => SC.rebuild());
  refresh();
  // les habitants sans maison précise en reçoivent une
  let moved = false; S.entries.forEach((e) => { if (e.home && e.home.x == null && SC.towns[e.home.town]) { const hs = freeHouse(e.home.town); if (hs) { e.home.x = Math.round(hs.x * 10) / 10; e.home.y = Math.round(hs.y * 10) / 10; moved = true; } } });
  if (moved) refresh();
  const first = S.towns[0] && SC.towns[S.towns[0].id];
  if (first && first.houses.length) Object.assign(SC.cam, { x: first.cx + 4, y: first.cy + 14, dist: innerWidth < 640 ? 150 : 170, theta: 0.3, phi: 1.0 });
  drawTop(); drawRail(); drawPanel(); drawBar(); save();
  if (fresh) setTimeout(() => toast('Bienvenue à Port-Sel. Touche un passant, ou « Façonner » pour peindre une ville.'), 900);
})();
