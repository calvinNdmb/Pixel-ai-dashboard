// Coque de l'application : onglets de documents, arborescence latérale, vignettes, menu du monde.
(function () {
  const { h } = APP;
  const S = () => APP.state, U = () => APP.ui;
  const typeKeys = Object.keys(TYPES);
  const ICONS = {
    map: 'M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2zM9 4.5v13M15 6.5v13',
    graph: 'M6 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.3 8.2l2.6 7.4M15.8 7.3l-2.7 8.4',
    tree: 'M12 3v5M12 8H6v4M12 8h6v4M6 12v3M18 12v3M4 15h4v5H4zM16 15h4v5h-4zM10 3h4v5h-4z',
    write: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19zM14.5 6.5l3 3',
    home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  };
  const icon = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = `<path d="${d}"/>`; return s; };
  const collapsed = () => (U().collapsed = U().collapsed || {});

  // ---------- arborescence ----------
  APP.renderSidebar = function () {
    const q = (document.getElementById('search').value || '').toLocaleLowerCase('fr').trim();
    const list = document.getElementById('side-list');
    const view = U().view, cur = U().entryId;
    const node = (label, opts) => h('button', { class: 'tree-item' + (opts.sub ? ' sub' : ''), 'aria-current': opts.current ? 'true' : null, onclick: opts.onclick, id: opts.id || null },
      opts.thumb ? h('img', { class: 'ti-thumb', src: opts.thumb, alt: '' }) : opts.icon ? icon(opts.icon) : h('span', { class: 'dot', style: { '--c': opts.color } }),
      h('span', { class: 'nm' }, label), opts.meta ? h('span', { class: 'meta' }, opts.meta) : null);
    const group = (key, title, count, items) => {
      const shut = !q && collapsed()[key];
      return h('div', { class: 'tree-group' + (shut ? ' shut' : '') },
        h('button', { class: 'tree-head', 'aria-expanded': String(!shut), onclick: () => { collapsed()[key] = !collapsed()[key]; APP.renderSidebar(); } },
          h('span', { class: 'tw', 'aria-hidden': 'true' }), title, count != null ? h('span', { class: 'meta' }, count) : null),
        shut ? null : h('div', { class: 'tree-body' }, items));
    };
    const blocks = [];
    if (!q) {
      blocks.push(group('vues', 'Espaces', null, [
        node("Vue d'ensemble", { icon: ICONS.home, current: view === 'entries' && !cur, onclick: () => { Object.assign(U(), { entryId: null, editing: false, listMode: false }); APP.go('entries'); } }),
        node('Carte du monde', { icon: ICONS.map, current: view === 'map', onclick: () => APP.go('map') }),
        node('Toile des relations', { icon: ICONS.graph, current: view === 'graph' && U().graphLayout !== 'tree', onclick: () => { U().graphLayout = 'net'; APP.go('graph'); } }),
        node('Arbre des relations', { icon: ICONS.tree, current: view === 'graph' && U().graphLayout === 'tree', onclick: () => { U().graphLayout = 'tree'; APP.go('graph'); } }),
      ]));
    }
    for (const t of typeKeys) {
      const items = S().entries.filter((e) => e.type === t && (!q || (e.name + ' ' + (e.aliases || []).join(' ') + ' ' + (e.summary || '')).toLocaleLowerCase('fr').includes(q)))
        .sort((a, b) => (t === 'evenement' ? (a.year ?? 1e9) - (b.year ?? 1e9) : 0) || a.name.localeCompare(b.name, 'fr'));
      if (!items.length) continue;
      blocks.push(group('t-' + t, TYPES[t].plural, items.length, items.map((e) => node(e.name, {
        id: 'side-' + e.id, sub: true, color: APP.color(e), thumb: e.image || null, meta: Number.isFinite(e.year) ? 'an ' + e.year : null,
        current: view === 'entries' && cur === e.id, onclick: () => APP.openEntry(e.id),
      }))));
    }
    const chapters = S().chapters.filter((c) => !q || c.title.toLocaleLowerCase('fr').includes(q));
    if (chapters.length) blocks.push(group('chap', 'Manuscrit', chapters.length, chapters.map((c) => node(c.title || 'Sans titre', {
      icon: ICONS.write, sub: true, current: view === 'write' && U().chapterId === c.id, onclick: () => { U().chapterId = c.id; APP.go('write'); },
    }))));
    list.replaceChildren(...blocks);
    if (!blocks.length) list.append(h('p', { class: 'empty-note', style: { padding: '8px 12px' } }, 'Rien ne correspond.'));
    renderThumbs();
  };

  function renderThumbs() {
    const el = document.getElementById('thumbs');
    const withImg = S().entries.filter((e) => e.image).slice(0, 8);
    el.hidden = !withImg.length;
    el.replaceChildren(...withImg.map((e) => h('button', { class: 'thumb', title: e.name, 'aria-label': e.name, onclick: () => APP.openEntry(e.id) }, h('img', { src: e.image, alt: '' }))));
  }

  // ---------- onglets de documents ----------
  const keyNow = () => (U().view === 'entries' ? (U().entryId ? 'entry:' + U().entryId : 'home') : U().view);
  function label(key) {
    const [kind, id] = key.split(':');
    if (kind === 'entry') { const e = APP.entry(id); return e ? { text: e.name, color: APP.color(e) } : null; }
    return { home: { text: S().world.name, icon: ICONS.home }, graph: { text: U().graphLayout === 'tree' ? 'Arbre' : 'Toile', icon: ICONS.graph }, map: { text: 'Monde', icon: ICONS.map }, write: { text: 'Manuscrit', icon: ICONS.write } }[kind] || null;
  }
  function activate(key) {
    const [kind, id] = key.split(':');
    if (kind === 'entry') APP.openEntry(id, false);
    else if (kind === 'home') { Object.assign(U(), { entryId: null, editing: false, listMode: false }); APP.go('entries'); }
    else APP.go(kind);
  }
  function renderTabs(active) {
    const bar = document.getElementById('doctabs');
    bar.replaceChildren(...U().tabs.map((key) => {
      const L = label(key);
      if (!L) return null;
      const close = h('span', { class: 'tab-x', role: 'button', 'aria-label': 'Fermer ' + L.text, onclick: (ev) => {
        ev.stopPropagation();
        const i = U().tabs.indexOf(key);
        U().tabs.splice(i, 1);
        if (!U().tabs.length) U().tabs.push('home');
        if (key === active) activate(U().tabs[Math.max(0, i - 1)]); else renderTabs(active);
      } }, '×');
      return h('button', { class: 'doctab', role: 'tab', 'aria-selected': String(key === active), onclick: () => activate(key) },
        L.icon ? icon(L.icon) : h('span', { class: 'dot', style: { '--c': L.color } }), h('span', { class: 'tl' }, L.text), close);
    }).filter(Boolean));
    const sel = bar.querySelector('[aria-selected="true"]');
    if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  APP.shell = {
    sync() {
      const key = keyNow();
      let tabs = (U().tabs || ['home']).filter((k) => !k.startsWith('entry:') || APP.entry(k.slice(6)));
      if (!tabs.includes(key)) {
        tabs.push(key);
        while (tabs.length > 8) tabs.splice(tabs.findIndex((k) => k !== key), 1);
      }
      U().tabs = tabs;
      renderTabs(key);
    },
  };

  // ---------- menu du monde ----------
  document.getElementById('world-switch').addEventListener('click', (ev) => {
    ev.stopPropagation();
    const name = h('input', { id: 'world-rename', value: S().world.name, 'aria-label': 'Nom du monde', onchange: (e) => { const v = e.target.value.trim(); if (v) { S().world.name = v; APP.save(); APP.rerender(); APP.toast('Monde renommé'); } } });
    const reset = h('button', { class: 'menu-item danger', onclick: () => {
      if (reset.dataset.armed) {
        APP.reset();
        Object.assign(U(), { entryId: null, editing: false, history: [], chapterId: S().chapters[0].id, listMode: false, tabs: ['home'], year: null });
        APP.hidePeek(); APP.go('entries'); APP.toast('Démo réinitialisée');
        return;
      }
      reset.dataset.armed = '1'; reset.textContent = 'Confirmer la réinitialisation';
    } }, 'Réinitialiser la démo');
    const r = ev.currentTarget.getBoundingClientRect();
    APP.showPeek(h('div', { class: 'menu' },
      h('label', { class: 'menu-label', for: 'world-rename' }, 'Monde'), name,
      h('button', { class: 'menu-item', onclick: () => { APP.hidePeek(); Object.assign(U(), { entryId: null, editing: false, listMode: false }); APP.go('entries'); } }, "Vue d'ensemble"),
      h('button', { class: 'menu-item dl-only', onclick: () => { APP.hidePeek(); APP.exportWorld(); } }, 'Exporter le monde (.json)'),
      h('button', { class: 'menu-item', onclick: () => { APP.hidePeek(); APP.go('entries'); Object.assign(U(), { entryId: null }); APP.go('entries'); setTimeout(() => { const f = document.getElementById('import-file'); f && f.click(); }, 50); } }, 'Importer un monde…'),
      reset), r.left + 150, r.bottom - 8);
  });
  document.getElementById('rail-new').addEventListener('click', () => APP.newEntry());
})();
