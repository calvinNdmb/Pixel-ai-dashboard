// Vue « Fiches » : page wiki (image + document), éditeur, vue d'ensemble du monde.
(function () {
  const { h } = APP;
  const S = () => APP.state, U = () => APP.ui;
  const typeKeys = Object.keys(TYPES);

  // ---------- navigation ----------
  APP.openEntry = function (id, push = true) {
    const u = U();
    if (push && u.entryId && u.entryId !== id) u.history.push(u.entryId);
    Object.assign(u, { entryId: id, editing: false, listMode: false });
    APP.go('entries');
    document.getElementById('view-entries').scrollTop = 0;
  };
  APP.newEntry = function (type = 'personnage', name = 'Nouvelle fiche') {
    const e = { id: APP.uid('e'), type, name, aliases: [], summary: '', body: '' };
    S().entries.push(e);
    APP.invalidate(); APP.save();
    Object.assign(U(), { entryId: e.id, editing: true, newId: e.id, listMode: false });
    APP.go('entries');
    return e;
  };
  APP.deleteEntry = function (id) {
    const s = S();
    s.entries = s.entries.filter((e) => e.id !== id);
    s.relations = s.relations.filter((r) => r.from !== id && r.to !== id);
    s.pins = s.pins.filter((p) => p.entryId !== id);
    APP.invalidate(); APP.save();
    Object.assign(U(), { entryId: null, editing: false, listMode: true });
    APP.toast('Fiche supprimée');
    APP.go('entries');
  };

  APP.views.entries = {
    render() {
      const root = document.getElementById('view-entries');
      const e = APP.entry(U().entryId);
      root.replaceChildren(!e ? overview() : U().editing ? editor(e) : page(e));
    },
  };

  const backBtn = () => h('button', { class: 'back-btn', onclick: () => { U().listMode = true; APP.layout(); } }, '← Toutes les fiches');
  const chip = (e) => h('span', { class: 'chip', style: { '--c': APP.color(e) } }, h('span', { class: 'dot', style: { '--c': APP.color(e) } }), APP.type(e).label);
  function nameNode(id, selfId, note) {
    const e = APP.entry(id);
    if (!e) return h('span', null, '?');
    if (id === selfId) return h('strong', null, e.name);
    return h('button', { class: 'pill-link', title: note || null, style: { '--c': APP.color(e) }, onclick: () => APP.openEntry(id) }, h('span', { class: 'dot', style: { '--c': APP.color(e) } }), e.name);
  }
  const initial = (e) => (e.name.replace(/^(le|la|les|l')\s*/i, '')[0] || '?').toUpperCase();

  // Situation sur la carte, lue dans le terrain (même échelle que le serveur MCP)
  function placeInfo(pin) {
    const T = TERRAIN, hh = T.heightAtWorld(pin.x, pin.y), sea = T.SEA / 255;
    if (hh < sea) return `En mer · environ ${Math.round(((sea - hh) / sea) * 90)} m de fond`;
    const t = (hh - sea) / (1 - sea);
    const b = T.bAt(Math.round((pin.x / T.WW) * (T.GW - 1)), Math.round((pin.y / T.WH) * (T.GH - 1)));
    return `${t > 0.8 ? 'Neiges' : T.BIOMES[b].name} · ${Math.round(t * 1800)} m d'altitude`;
  }
  function sections(body) {
    const out = [{ title: 'Aperçu', text: '' }];
    for (const line of (body || '').split('\n')) {
      if (line.startsWith('# ')) out.push({ title: line.slice(2).trim(), text: '' });
      else out[out.length - 1].text += line + '\n';
    }
    return out.filter((sct, i) => sct.text.trim() || i > 0);
  }
  const slug = (t, i) => 'sec-' + i + '-' + t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-');
  const jump = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  // ---------- page wiki ----------
  function page(e) {
    const s = S();
    const pin = s.pins.find((p) => p.entryId === e.id);
    const del = h('button', { class: 'btn btn-danger', id: 'del-btn' }, 'Supprimer');
    let armed = null;
    del.onclick = () => {
      if (armed) { clearTimeout(armed); APP.deleteEntry(e.id); return; }
      del.classList.add('armed'); del.textContent = 'Confirmer';
      armed = setTimeout(() => { armed = null; del.classList.remove('armed'); del.textContent = 'Supprimer'; }, 3000);
    };
    const secs = sections(e.body);
    const rels = s.relations.filter((r) => r.from === e.id || r.to === e.id);
    const fromEntries = s.entries.filter((x) => x.id !== e.id && APP.mentions(x.body).has(e.id));
    const fromChapters = s.chapters.filter((c) => APP.mentions(c.text).has(e.id));

    // propriétés : type, année, situation, relations groupées
    const outgoing = new Map();
    rels.filter((r) => r.from === e.id).forEach((r) => { if (!outgoing.has(r.label)) outgoing.set(r.label, []); outgoing.get(r.label).push(r.to); });
    const incoming = rels.filter((r) => r.to === e.id);
    const prop = (k, v) => h('div', { class: 'prop' }, h('dt', null, k), h('dd', null, v));
    const props = h('dl', { class: 'props' },
      prop('Type', chip(e)),
      Number.isFinite(e.year) ? prop('Année', 'an ' + e.year) : null,
      e.aliases && e.aliases.length ? prop('Autres noms', e.aliases.join(', ')) : null,
      pin ? prop('Situation', h('span', null, placeInfo(pin), ' · ', h('button', { class: 'link-btn inline', onclick: () => { U().focusPin = pin.id; APP.go('map'); } }, 'voir'))) : null,
      [...outgoing].map(([label, ids]) => prop(label.charAt(0).toUpperCase() + label.slice(1), h('span', { class: 'pills' }, ids.map((id) => nameNode(id, e.id))))),
      incoming.length ? prop('Lié à', h('span', { class: 'pills' }, incoming.map((r) => nameNode(r.from, e.id, `${APP.entry(r.from) ? APP.entry(r.from).name : ''} ${r.label} ${e.name}`)))) : null);
    const toc = h('ol', { class: 'toc' },
      secs.map((sct, i) => h('li', null, h('button', { class: 'link-btn', onclick: () => jump(slug(sct.title, i)) }, sct.title))),
      h('li', null, h('button', { class: 'link-btn', onclick: () => jump('sec-relations') }, 'Relations')),
      h('li', null, h('button', { class: 'link-btn', onclick: () => jump('sec-mentions') }, 'Mentionné dans')));

    const relList = h('ul', { class: 'rel-list' }, rels.map((r) => h('li', { class: 'rel' },
      nameNode(r.from, e.id), h('span', { class: 'verb' }, r.label), nameNode(r.to, e.id),
      h('button', { class: 'x', 'aria-label': 'Supprimer la relation', onclick: () => { s.relations = s.relations.filter((x) => x.id !== r.id); APP.save(); APP.rerender(); } }, '×'))));
    const others = s.entries.filter((x) => x.id !== e.id).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const sel = h('select', { id: 'rel-target', 'aria-label': 'Fiche liée' }, others.map((o) => h('option', { value: o.id }, o.name)));
    const verb = h('input', { id: 'rel-label', placeholder: 'ex. allié de, rival de…', 'aria-label': 'Nature de la relation' });
    const relForm = h('form', { class: 'rel-form', onsubmit: (ev) => {
      ev.preventDefault();
      const label = verb.value.trim();
      if (!label) { verb.focus(); return; }
      s.relations.push({ id: APP.uid('r'), from: e.id, to: sel.value, label });
      APP.save(); APP.rerender(); APP.toast('Relation ajoutée');
    } }, verb, sel, h('button', { class: 'btn', type: 'submit' }, 'Relier'));

    const media = h('div', { class: 'wiki-media' },
      e.image ? h('img', { class: 'wiki-img', src: e.image, alt: 'Illustration : ' + e.name })
        : h('div', { class: 'wiki-ph' }, h('div', { class: 'seal big', 'aria-hidden': 'true' }, initial(e)), h('p', null, 'Pas encore d’image pour cette fiche.')),
      imgActions(e, pin));
    const doc = h('div', { class: 'wiki-doc' },
      backBtn(),
      h('div', { class: 'wiki-bar' },
        h('span', { class: 'crumbs' }, S().world.name, ' / ', TYPES[e.type] ? TYPES[e.type].plural : ''),
        h('div', { class: 'wiki-actions' },
          h('button', { class: 'btn btn-accent', id: 'edit-btn', onclick: () => { U().editing = true; APP.rerender(); } }, 'Modifier'),
          h('button', { class: 'btn', onclick: () => { U().focusNode = e.id; APP.go('graph'); } }, 'Toile'),
          pin ? h('button', { class: 'btn', onclick: () => { U().focusPin = pin.id; APP.go('map'); } }, 'Carte')
              : h('button', { class: 'btn', onclick: () => { U().placeFor = e.id; APP.go('map'); } }, 'Placer'),
          del)),
      h('h1', { class: 'wiki-title' }, e.name),
      e.summary ? h('p', { class: 'lead' }, e.summary) : null,
      h('div', { class: 'wiki-boxes' },
        h('nav', { class: 'box', 'aria-label': 'Sommaire' }, h('h2', null, 'Sommaire'), toc),
        h('section', { class: 'box' }, h('h2', null, 'Propriétés'), props)),
      secs.length ? secs.map((sct, i) => h('section', { class: 'wiki-sec' }, h('h2', { class: 'sec-h', id: slug(sct.title, i) }, sct.title), h('div', { class: 'prose' }, APP.prose(sct.text, { selfId: e.id }))))
        : h('p', { class: 'empty-note' }, 'Cette fiche est encore vide. Clique sur Modifier pour écrire son histoire.'),
      h('section', { class: 'wiki-sec' }, h('h2', { class: 'sec-h', id: 'sec-relations' }, 'Relations'), rels.length ? relList : h('p', { class: 'empty-note' }, 'Aucune relation pour le moment.'), relForm),
      h('section', { class: 'wiki-sec' }, h('h2', { class: 'sec-h', id: 'sec-mentions' }, 'Mentionné dans'),
        fromEntries.length || fromChapters.length
          ? h('div', { class: 'backlinks' }, fromEntries.map((x) => nameNode(x.id)), fromChapters.map((c) => h('button', { class: 'pill-link', onclick: () => { U().chapterId = c.id; U().mode = 'read'; APP.go('write'); } }, '¶ ', c.title)))
          : h('p', { class: 'empty-note' }, 'Aucun texte ne cite encore cette fiche.')));
    return h('article', { class: 'wiki', style: { '--c': APP.color(e) } }, media, doc);
  }

  // ---------- image de la fiche ----------
  function downscale(url, cb) {
    const img = new Image();
    img.onload = () => { const k = Math.min(1, 1200 / img.naturalWidth), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => APP.toast('Image illisible');
    img.src = url;
  }
  function imgActions(e, pin) {
    const status = h('span', { class: 'img-status', role: 'status' });
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, id: 'img-file', onchange: (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      const r = new FileReader(); r.onload = () => downscale(r.result, (url) => { e.image = url; APP.save(); APP.rerender(); APP.toast('Image ajoutée'); }); r.readAsDataURL(f);
    } });
    let ctl = null;
    const label = e.image ? 'Nouvelle illustration IA' : 'Illustrer avec l’IA';
    const aiBtn = h('button', { class: 'btn ai-only', id: 'ai-illustrate', onclick: async () => {
      if (ctl) { ctl.abort(); return; }
      ctl = new AbortController(); aiBtn.textContent = 'Arrêter'; status.textContent = 'Claude dessine… (jusqu’à une minute)';
      try { e.image = await APP.ai.illustrate(e, ctl.signal); APP.save(); APP.rerender(); APP.toast('Illustration ajoutée'); }
      catch (err) { status.textContent = APP.ai.copy(err); aiBtn.textContent = label; }
      finally { ctl = null; }
    } }, label);
    return h('div', { class: 'media-actions' },
      pin && window.R3D && R3D.ok ? h('button', { class: 'btn', id: 'cap-3d', onclick: () => {
        const url = R3D.capture(pin.x, pin.y);
        if (url) { e.image = url; APP.save(); APP.rerender(); APP.toast('Vue 3D capturée'); } else APP.toast('La 3D n’est pas disponible sur cet appareil');
      } }, 'Vue 3D du lieu') : null,
      aiBtn, h('button', { class: 'btn', onclick: () => file.click() }, 'Importer'),
      e.image ? h('button', { class: 'btn', onclick: () => { delete e.image; APP.save(); APP.rerender(); } }, 'Retirer') : null, file, status);
  }

  // ---------- vue d'ensemble ----------
  function overview() {
    const s = S();
    const counts = typeKeys.map((t) => [t, s.entries.filter((e) => e.type === t).length]).filter(([, n]) => n);
    const words = s.chapters.reduce((n, c) => n + (c.text.trim() ? c.text.trim().split(/\s+/).length : 0), 0);
    const step = (k, title, text, view) => h('li', null, h('span', { class: 'k' }, k),
      h('div', null, h('strong', null, title), ' ', text, ' ', view ? h('button', { class: 'link-btn', style: { color: 'var(--accent)' }, onclick: () => APP.go(view) }, 'Ouvrir →') : null));
    return h('div', { class: 'entry overview' },
      backBtn(),
      h('p', { class: 'crumbs' }, 'Monde'),
      h('h1', { class: 'wiki-title' }, s.world.name),
      h('p', { class: 'tagline' }, s.world.tagline),
      h('div', { class: 'stats' },
        counts.map(([t, n]) => h('span', { class: 'stat', style: { '--c': TYPES[t].color } }, h('b', null, n), n > 1 ? TYPES[t].plural.toLowerCase() : TYPES[t].label.toLowerCase())),
        h('span', { class: 'stat', style: { '--c': 'var(--accent)' } }, h('b', null, words), 'mots écrits')),
      h('ul', { class: 'how' },
        step('1', 'Fiches.', "Chaque personnage, lieu, faction ou objet a sa page. Écris le nom d'une autre fiche dans un texte : il devient un lien, sans rien faire.", null),
        step('2', 'Toile et arbre.', 'Toutes les fiches et leurs relations, en réseau libre ou en arbre.', 'graph'),
        step('3', 'Monde.', "Peins le relief et les biomes, passe en 3D, et note chaque événement à l'endroit où il a eu lieu. La chronologie rejoue l'histoire année par année.", 'map'),
        step('4', 'Manuscrit.', "L'éditeur repère les noms de ton univers pendant que tu écris et affiche leurs fiches à côté.", 'write'),
        step('5', 'IA.', "Claude propose des liens entre tes personnages (sur la Toile) et illustre tes lieux (sur leur page). Rien n'est ajouté sans ton accord.", 'graph')),
      h('div', { class: 'entry-actions', style: { marginTop: '26px' } },
        h('button', { class: 'btn btn-accent', onclick: () => APP.openEntry('ysolde') }, 'Commencer par Ysolde Varn'),
        h('button', { class: 'btn', onclick: () => APP.newEntry() }, '+ Nouvelle fiche')),
      h('section', { class: 'sec' }, h('h2', null, 'Échanger avec une IA (MCP)'),
        h('p', { class: 'hint' }, "Le serveur MCP Archipel permet à une IA (Claude, Cursor…) de lire et modifier ton monde. Exporte-le en JSON pour qu'elle travaille dessus, puis réimporte le résultat."),
        h('div', { class: 'entry-actions' },
          h('button', { class: 'btn dl-only', id: 'export-btn', onclick: () => APP.exportWorld() }, 'Exporter le monde (.json)'),
          h('button', { class: 'btn', id: 'import-btn', onclick: () => document.getElementById('import-file').click() }, 'Importer un monde'),
          h('input', { type: 'file', id: 'import-file', accept: 'application/json,.json', hidden: true, onchange: (ev) => APP.importWorld(ev.target.files[0]) }))));
  }

  // ---------- éditeur ----------
  function editor(e) {
    const f = (id, label, input) => h('div', { class: 'field' }, h('label', { for: id }, label), input);
    const name = h('input', { id: 'f-name', value: e.name, required: true });
    const type = h('select', { id: 'f-type' }, Object.entries(TYPES).map(([k, t]) => h('option', { value: k, selected: k === e.type }, t.label)));
    const aliases = h('input', { id: 'f-aliases', value: (e.aliases || []).join(', '), placeholder: 'Séparés par des virgules' });
    const year = h('input', { id: 'f-year', type: 'number', value: Number.isFinite(e.year) ? String(e.year) : '', placeholder: 'Pour les événements' });
    const summary = h('input', { id: 'f-summary', value: e.summary || '', placeholder: 'Une phrase pour la présenter' });
    const body = h('textarea', { id: 'f-body', placeholder: 'Raconte. Les noms des autres fiches deviendront des liens tout seuls.' });
    body.value = e.body || '';
    const cancel = () => {
      if (U().newId === e.id) { S().entries = S().entries.filter((x) => x.id !== e.id); APP.invalidate(); APP.save(); Object.assign(U(), { entryId: null, listMode: true }); }
      U().editing = false; U().newId = null; APP.rerender();
    };
    const form = h('form', { class: 'form', onsubmit: (ev) => {
      ev.preventDefault();
      const n = name.value.trim();
      if (!n) { name.focus(); APP.toast('Donne un nom à la fiche'); return; }
      Object.assign(e, { name: n, type: type.value, summary: summary.value.trim(), body: body.value,
        aliases: aliases.value.split(',').map((a) => a.trim()).filter(Boolean),
        year: year.value.trim() === '' ? undefined : Math.round(Number(year.value)) });
      APP.invalidate(); APP.save();
      U().editing = false; U().newId = null;
      APP.rerender(); APP.toast('Fiche enregistrée');
    } },
      h('div', { class: 'row2' }, f('f-name', 'Nom', name), f('f-type', 'Type', type)),
      h('div', { class: 'row2' }, f('f-aliases', 'Autres noms', aliases), f('f-year', 'Année', year)),
      f('f-summary', 'Résumé', summary),
      f('f-body', 'Texte', body),
      h('p', { class: 'hint' }, 'Une ligne qui commence par « # » ouvre une nouvelle section, qui apparaît dans le sommaire.'),
      h('div', { class: 'entry-actions' }, h('button', { class: 'btn btn-accent', type: 'submit', id: 'save-btn' }, 'Enregistrer'), h('button', { class: 'btn', type: 'button', onclick: cancel }, 'Annuler')));
    setTimeout(() => (U().newId === e.id ? name.select() : null), 0);
    return h('div', { class: 'entry' }, h('h1', { class: 'wiki-title', style: { fontSize: '30px' } }, U().newId === e.id ? 'Nouvelle fiche' : 'Modifier la fiche'), form);
  }
})();
