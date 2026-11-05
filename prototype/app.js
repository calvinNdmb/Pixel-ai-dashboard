// Assemblage : navigation entre vues, thème, raccourcis, démarrage.
(function () {
  const U = () => APP.ui;
  const VIEWS = ['entries', 'graph', 'map', 'write'];
  const mobile = () => window.matchMedia('(max-width: 860px)').matches;

  APP.layout = function () {
    document.getElementById('app').classList.toggle('list-mode', mobile() && U().view === 'entries' && U().listMode);
  };

  APP.go = function (view) {
    const prev = U().view;
    if (prev !== view && APP.views[prev] && APP.views[prev].leave) APP.views[prev].leave();
    U().view = view;
    VIEWS.forEach((v) => (document.getElementById('view-' + v).hidden = v !== view));
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'));
    APP.hidePeek();
    APP.layout();
    APP.renderSidebar();
    APP.views[view].render();
    APP.shell.sync();
  };

  APP.rerender = function () {
    document.getElementById('world-name').textContent = APP.state.world.name;
    APP.layout();
    APP.renderSidebar();
    APP.views[U().view].render();
    APP.shell.sync();
  };

  // onglets (haut et bas)
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.view;
    if (v === 'entries' && U().view === 'entries' && mobile()) { U().listMode = true; APP.layout(); APP.renderSidebar(); return; }
    if (v === 'entries' && mobile() && !U().entryId) U().listMode = true;
    APP.go(v);
  }));

  // index latéral
  document.getElementById('search').addEventListener('input', APP.renderSidebar);
  document.getElementById('new-entry').addEventListener('click', () => APP.newEntry());

  // liens auto-générés dans les textes
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a.lk');
    if (!a) return;
    e.preventDefault();
    APP.hidePeek();
    if (a.dataset.ctx === 'write') APP.views.write.focusRef(a.dataset.id);
    else APP.openEntry(a.dataset.id);
  });

  // aperçu au survol (souris uniquement)
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const peekEl = document.getElementById('peek');
  let showT = null, hideT = null;
  document.addEventListener('mouseover', (e) => {
    if (!fine.matches) return;
    const a = e.target.closest && e.target.closest('a.lk');
    if (!a) return;
    clearTimeout(hideT); clearTimeout(showT);
    showT = setTimeout(() => {
      const ent = APP.entry(a.dataset.id), r = a.getBoundingClientRect();
      if (ent) APP.showPeek(APP.entryCard(ent), r.left + r.width / 2, r.bottom - 6);
    }, 280);
  });
  document.addEventListener('mouseout', (e) => {
    if (!fine.matches || !(e.target.closest && e.target.closest('a.lk'))) return;
    clearTimeout(showT);
    hideT = setTimeout(APP.hidePeek, 260);
  });
  peekEl.addEventListener('mouseenter', () => clearTimeout(hideT));
  peekEl.addEventListener('mouseleave', () => { if (fine.matches && !peekEl.querySelector('select')) hideT = setTimeout(APP.hidePeek, 200); });
  document.addEventListener('pointerdown', (e) => {
    if (peekEl.hidden || peekEl.contains(e.target) || (e.target.closest && e.target.closest('.stage'))) return;
    APP.hidePeek();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') APP.hidePeek(); });

  // thème
  const root = document.documentElement;
  try { const t = localStorage.getItem('archipel-theme'); if (t === 'dark' || t === 'light') root.dataset.theme = t; } catch (e) {}
  document.getElementById('theme-btn').addEventListener('click', () => {
    const cur = root.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    root.dataset.theme = cur === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('archipel-theme', root.dataset.theme); } catch (e) {}
  });

  let rT = null;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(APP.layout, 120); });

  // échange avec le serveur MCP : export / import du monde en JSON
  let downloads = null;
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then((d) => { if (d) { downloads = d; root.classList.add('has-dl'); } }).catch(() => {});
  }
  APP.exportWorld = async function () {
    if (!downloads) return;
    const slug = APP.state.world.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'monde';
    try { const r = await downloads.save({ filename: `archipel-${slug}.json`, data: JSON.stringify(APP.state, null, 1) }); if (r && r.status === 'saved') APP.toast('Monde exporté'); }
    catch (e) { APP.toast(e && e.code === 'unavailable' ? "L'export n'est pas disponible ici" : 'Export annulé'); }
  };
  APP.importWorld = function (file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let w;
      try { w = JSON.parse(reader.result); } catch (e) { APP.toast('Ce fichier n’est pas du JSON valide'); return; }
      if (!w || w.version !== 2 || !Array.isArray(w.entries)) { APP.toast('Ce fichier n’est pas un monde Archipel'); return; }
      const h = APP.h, name = (w.world && w.world.name) || 'Monde importé';
      APP.showPeek(h('div', null, h('h4', null, `Importer « ${name} » ?`),
        h('p', null, `${w.entries.length} fiches, ${(w.chapters || []).length} chapitres. Ton monde actuel sera remplacé.`),
        h('div', { class: 'peek-actions' },
          h('button', { class: 'btn btn-accent', id: 'import-confirm', onclick: () => {
            w.world = w.world || { name, tagline: '' }; w.relations = w.relations || []; w.pins = w.pins || [];
            w.map = w.map || { image: null, seed: 11 };
            w.chapters = w.chapters && w.chapters.length ? w.chapters : [{ id: 'c1', title: 'Chapitre 1', text: '' }];
            w.entries.forEach((e) => { e.aliases = e.aliases || []; e.summary = e.summary || ''; e.body = e.body || ''; });
            APP.state = w; TERRAIN.init(APP.state); APP.invalidate(); APP.save();
            Object.assign(U(), { entryId: null, editing: false, history: [], chapterId: w.chapters[0].id, listMode: false, year: null });
            APP.hidePeek(); APP.go('entries'); APP.toast('Monde importé');
          } }, 'Remplacer'),
          h('button', { class: 'btn', onclick: APP.hidePeek }, 'Annuler'))), window.innerWidth / 2, 140);
    };
    reader.readAsText(file);
  };

  // démarrage
  U().listMode = false;
  document.getElementById('world-name').textContent = APP.state.world.name;
  APP.go('entries');
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (U().view === 'write') APP.views.write.render(); });
})();
