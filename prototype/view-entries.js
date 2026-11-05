// Vue « Fiches » : index latéral, page d'une fiche, éditeur, vue d'ensemble.
(function () {
  const { h } = APP;
  const S = () => APP.state, U = () => APP.ui;
  const typeKeys = Object.keys(TYPES);

  // ---------- index latéral ----------
  APP.renderSidebar = function () {
    const q = (document.getElementById('search').value || '').toLocaleLowerCase('fr').trim();
    const list = document.getElementById('side-list');
    list.replaceChildren();
    for (const t of typeKeys) {
      const items = S().entries
        .filter((e) => e.type === t && (!q || (e.name + ' ' + (e.aliases || []).join(' ')).toLocaleLowerCase('fr').includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      if (!items.length) continue;
      list.append(h('div', { class: 'side-group' },
        h('h3', null, TYPES[t].plural, h('span', null, items.length)),
        items.map((e) => h('button', {
          class: 'side-item', id: 'side-' + e.id,
          'aria-current': U().view === 'entries' && U().entryId === e.id ? 'true' : null,
          onclick: () => APP.openEntry(e.id),
        }, h('span', { class: 'dot', style: { '--c': APP.color(e) } }), h('span', { class: 'nm' }, e.name)))));
    }
    if (!list.children.length) list.append(h('p', { class: 'empty-note', style: { padding: '8px' } }, 'Aucune fiche ne correspond.'));
  };

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

  // ---------- rendu ----------
  APP.views.entries = {
    render() {
      const root = document.getElementById('view-entries');
      const e = APP.entry(U().entryId);
      root.replaceChildren(!e ? overview() : U().editing ? editor(e) : page(e));
    },
  };

  function backBtn() {
    return h('button', { class: 'back-btn', onclick: () => { U().listMode = true; APP.layout(); } }, '← Toutes les fiches');
  }

  function overview() {
    const s = S();
    const counts = typeKeys.map((t) => [t, s.entries.filter((e) => e.type === t).length]).filter(([, n]) => n);
    const words = s.chapters.reduce((n, c) => n + (c.text.trim() ? c.text.trim().split(/\s+/).length : 0), 0);
    const step = (k, title, text, view) => h('li', null, h('span', { class: 'k' }, k),
      h('div', null, h('strong', null, title), ' ', text, ' ', view ? h('button', { class: 'link-btn', style: { color: 'var(--accent)' }, onclick: () => APP.go(view) }, 'Ouvrir →') : null));
    return h('div', { class: 'entry overview' },
      backBtn(),
      h('h1', null, s.world.name),
      h('p', { class: 'tagline' }, s.world.tagline),
      h('div', { class: 'stats' },
        counts.map(([t, n]) => h('span', { class: 'stat', style: { '--c': TYPES[t].color } }, h('b', null, n), n > 1 ? TYPES[t].plural.toLowerCase() : TYPES[t].label.toLowerCase())),
        h('span', { class: 'stat', style: { '--c': 'var(--accent)' } }, h('b', null, words), 'mots écrits')),
      h('ul', { class: 'how' },
        step('1', 'Fiches.', "Chaque personnage, lieu, faction ou objet a sa fiche. Écris le nom d'une autre fiche dans un texte : il devient un lien, sans rien faire.", null),
        step('2', 'Toile.', 'Toutes les fiches et leurs relations sur une toile que tu peux déplacer, zoomer et réorganiser.', 'graph'),
        step('3', 'Monde.', "Peins le relief et les biomes, passe en 3D, et note chaque événement à l'endroit où il a eu lieu. La chronologie rejoue l'histoire année par année.", 'map'),
        step('4', 'Manuscrit.', "L'éditeur repère les noms de ton univers pendant que tu écris et affiche leurs fiches à côté.", 'write'),
        step('5', 'IA.', "Claude propose des liens entre tes personnages (sur la Toile) et illustre tes lieux (sur leur fiche). Rien n'est ajouté sans ton accord.", 'graph')),
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

  function nameNode(id, selfId) {
    const e = APP.entry(id);
    if (!e) return h('span', null, '?');
    if (id === selfId) return h('strong', null, e.name);
    return h('button', { class: 'pill-link', style: { '--c': APP.color(e) }, onclick: () => APP.openEntry(id) }, h('span', { class: 'dot', style: { '--c': APP.color(e) } }), e.name);
  }

  function page(e) {
    const s = S();
    const pin = s.pins.find((p) => p.entryId === e.id);
    const del = h('button', { class: 'btn btn-danger', id: 'del-btn' }, 'Supprimer');
    let armed = null;
    del.onclick = () => {
      if (armed) { clearTimeout(armed); APP.deleteEntry(e.id); return; }
      del.classList.add('armed'); del.textContent = 'Confirmer la suppression';
      armed = setTimeout(() => { armed = null; del.classList.remove('armed'); del.textContent = 'Supprimer'; }, 3000);
    };

    // relations
    const rels = s.relations.filter((r) => r.from === e.id || r.to === e.id);
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

    // mentions entrantes : fiches et chapitres qui citent ce nom
    const fromEntries = s.entries.filter((x) => x.id !== e.id && APP.mentions(x.body).has(e.id));
    const fromChapters = s.chapters.filter((c) => APP.mentions(c.text).has(e.id));
    const back = fromEntries.length || fromChapters.length
      ? h('div', { class: 'backlinks' },
          fromEntries.map((x) => nameNode(x.id)),
          fromChapters.map((c) => h('button', { class: 'pill-link', onclick: () => { U().chapterId = c.id; U().mode = 'read'; APP.go('write'); } }, '¶ ', c.title)))
      : h('p', { class: 'empty-note' }, "Aucun texte ne cite encore cette fiche.");

    return h('article', { class: 'entry', style: { '--c': APP.color(e) } },
      backBtn(),
      e.image ? h('img', { class: 'hero-img', src: e.image, alt: 'Illustration : ' + e.name }) : null,
      h('div', { class: 'entry-head' },
        h('div', { class: 'seal', 'aria-hidden': 'true' }, (e.name.replace(/^(le|la|les|l')\s*/i, '')[0] || '?').toUpperCase()),
        h('div', { style: { minWidth: 0 } },
          h('span', { class: 'chip', style: { '--c': APP.color(e) } }, h('span', { class: 'dot', style: { '--c': APP.color(e) } }), APP.type(e).label + (Number.isFinite(e.year) ? ' · an ' + e.year : '')),
          h('h1', null, e.name),
          e.aliases && e.aliases.length ? h('div', { class: 'aliases' }, 'Aussi appelé : ', e.aliases.join(', ')) : null)),
      e.summary ? h('p', { class: 'lead' }, e.summary) : null,
      h('div', { class: 'entry-actions' },
        h('button', { class: 'btn btn-accent', id: 'edit-btn', onclick: () => { U().editing = true; APP.rerender(); } }, 'Modifier'),
        h('button', { class: 'btn', onclick: () => { U().focusNode = e.id; APP.go('graph'); } }, 'Voir sur la toile'),
        pin ? h('button', { class: 'btn', onclick: () => { U().focusPin = pin.id; APP.go('map'); } }, 'Voir sur la carte')
            : h('button', { class: 'btn', onclick: () => { U().placeFor = e.id; APP.go('map'); } }, 'Placer sur la carte'),
        del),
      imgActions(e),
      h('div', { class: 'prose' }, e.body ? APP.prose(e.body, { selfId: e.id }) : h('p', { class: 'empty-note' }, 'Cette fiche est encore vide. Clique sur Modifier pour écrire son histoire.')),
      h('section', { class: 'sec' }, h('h2', null, 'Relations'), rels.length ? relList : h('p', { class: 'empty-note' }, 'Aucune relation pour le moment.'), relForm),
      h('section', { class: 'sec' }, h('h2', null, 'Mentionné dans'), back));
  }

  function downscale(url, cb) {
    const img = new Image();
    img.onload = () => { const k = Math.min(1, 1200 / img.naturalWidth), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => APP.toast('Image illisible');
    img.src = url;
  }
  function imgActions(e) {
    const pin = S().pins.find((p) => p.entryId === e.id);
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
    return h('div', { class: 'img-actions' }, h('span', { class: 'img-label' }, 'Image'),
      pin && window.R3D && R3D.ok ? h('button', { class: 'btn', id: 'cap-3d', onclick: () => {
        const url = R3D.capture(pin.x, pin.y);
        if (url) { e.image = url; APP.save(); APP.rerender(); APP.toast('Vue 3D capturée'); } else APP.toast('La 3D n’est pas disponible sur cet appareil');
      } }, 'Vue 3D du lieu') : null,
      aiBtn, h('button', { class: 'btn', onclick: () => file.click() }, 'Importer'),
      e.image ? h('button', { class: 'btn', onclick: () => { delete e.image; APP.save(); APP.rerender(); } }, 'Retirer') : null, file, status);
  }

  function editor(e) {
    const f = (id, label, input) => h('div', { class: 'field' }, h('label', { for: id }, label), input);
    const name = h('input', { id: 'f-name', value: e.name, required: true });
    const type = h('select', { id: 'f-type' }, Object.entries(TYPES).map(([k, t]) => h('option', { value: k, selected: k === e.type }, t.label)));
    const aliases = h('input', { id: 'f-aliases', value: (e.aliases || []).join(', '), placeholder: 'Séparés par des virgules' });
    const year = h('input', { id: 'f-year', type: 'number', value: Number.isFinite(e.year) ? String(e.year) : '', placeholder: 'Pour les événements' });
    const summary = h('input', { id: 'f-summary', value: e.summary || '', placeholder: 'Une phrase pour la présenter' });
    const body = h('textarea', { id: 'f-body', placeholder: "Raconte. Les noms des autres fiches deviendront des liens tout seuls." });
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
      h('p', { class: 'hint' }, 'Une ligne qui commence par « # » devient un intertitre.'),
      h('div', { class: 'entry-actions' }, h('button', { class: 'btn btn-accent', type: 'submit', id: 'save-btn' }, 'Enregistrer'), h('button', { class: 'btn', type: 'button', onclick: cancel }, 'Annuler')));
    setTimeout(() => (U().newId === e.id ? name.select() : null), 0);
    return h('div', { class: 'entry' }, h('h1', { style: { fontSize: '30px' } }, U().newId === e.id ? 'Nouvelle fiche' : 'Modifier la fiche'), form);
  }
})();
