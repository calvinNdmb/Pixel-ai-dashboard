// Vue « Manuscrit » : éditeur qui surligne les noms de l'univers, fiches de référence à côté.
(function () {
  const { h } = APP;
  const S = () => APP.state, U = () => APP.ui;
  let openRef = null, refsTimer = null, els = {};

  const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const chapter = () => S().chapters.find((c) => c.id === U().chapterId) || S().chapters[0];

  function paintBackdrop(text) {
    const frag = document.createDocumentFragment();
    for (const tk of APP.tokenize(text)) {
      if (tk.t === 'text') frag.append(tk.v);
      else frag.append(h('mark', { style: { '--c': APP.color(APP.entry(tk.id)) } }, tk.v));
    }
    if (text.endsWith('\n')) frag.append('​');
    els.backdrop.replaceChildren(frag);
  }
  function autosize() {
    const ta = els.ta, desk = els.desk, top = desk.scrollTop;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    desk.scrollTop = top;
  }

  function renderChapterList() {
    const c = chapter();
    els.list.replaceChildren(...S().chapters.map((ch) => h('button', { class: 'ch-item', 'aria-current': ch.id === c.id ? 'true' : null, onclick: () => { U().chapterId = ch.id; APP.views.write.render(); } },
      ch.title || 'Sans titre', h('small', null, words(ch.text) + ' mots'))));
    els.select.replaceChildren(...S().chapters.map((ch) => h('option', { value: ch.id, selected: ch.id === c.id }, ch.title || 'Sans titre')));
  }

  function renderRefs() {
    const c = chapter(), counts = APP.mentions(c.text);
    const ids = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
    els.refsBtn.textContent = `Fiches (${ids.length})`;
    els.wc.textContent = words(c.text) + ' mots';
    els.refsList.replaceChildren();
    if (!ids.length) { els.refsList.append(h('p', { class: 'empty-note' }, "Écris le nom d'une fiche (Ysolde, Port-Sel…) : elle apparaîtra ici.")); return; }
    for (const id of ids) {
      const e = APP.entry(id), open = openRef === id;
      els.refsList.append(h('div', { class: 'ref-card' + (open ? ' open' : ''), style: { '--c': APP.color(e) }, id: 'ref-' + id },
        h('button', { class: 'ref-head', 'aria-expanded': String(open), onclick: () => { openRef = open ? null : id; renderRefs(); } },
          h('span', { class: 'dot', style: { '--c': APP.color(e) } }), e.name, h('span', { class: 'count' }, '×' + counts.get(id))),
        open ? h('p', null, e.summary || 'Pas encore de résumé.') : null,
        open ? h('button', { class: 'btn', onclick: () => APP.openEntry(id) }, 'Ouvrir la fiche') : null));
    }
  }

  function newChapter() {
    const n = S().chapters.length + 1, ch = { id: APP.uid('c'), title: `Chapitre ${n}`, text: '' };
    S().chapters.push(ch); U().chapterId = ch.id; U().mode = 'write'; APP.save(); APP.views.write.render();
    setTimeout(() => { const t = document.getElementById('ch-title'); t && t.select(); }, 0);
  }

  APP.views.write = {
    focusRef(id) {
      openRef = id; renderRefs();
      els.refs.classList.add('show');
      const card = document.getElementById('ref-' + id);
      if (card) card.scrollIntoView({ block: 'nearest' });
    },
    render() {
      const root = document.getElementById('view-write');
      const c = chapter();
      if (!c) return;
      U().chapterId = c.id;
      const mode = U().mode || 'write';
      const seg = (m, label) => h('button', { 'aria-pressed': String(mode === m), onclick: () => { U().mode = m; APP.views.write.render(); } }, label);

      els.list = h('div');
      els.select = h('select', { class: 'ch-select', id: 'ch-select', 'aria-label': 'Chapitre', onchange: (e) => { U().chapterId = e.target.value; APP.views.write.render(); } });
      els.wc = h('span', { class: 'wc' });
      els.refsBtn = h('button', { class: 'btn refs-toggle', onclick: () => els.refs.classList.toggle('show') });
      els.refsList = h('div');
      els.refs = h('aside', { class: 'refs', 'aria-label': 'Fiches citées' },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('h3', null, 'Dans ce chapitre'),
          h('button', { class: 'link-btn refs-toggle', onclick: () => els.refs.classList.remove('show') }, 'Fermer')),
        els.refsList);

      const title = h('input', { class: 'ch-title', id: 'ch-title', value: c.title, 'aria-label': 'Titre du chapitre', oninput: (e) => { c.title = e.target.value; APP.save(); renderChapterList(); } });
      let body;
      if (mode === 'write') {
        els.backdrop = h('div', { class: 'backdrop', 'aria-hidden': 'true' });
        els.ta = h('textarea', { id: 'ch-text', spellcheck: 'true', 'aria-label': 'Texte du chapitre', placeholder: 'Il était une fois…' });
        els.ta.value = c.text;
        els.ta.addEventListener('input', () => {
          c.text = els.ta.value; paintBackdrop(c.text); autosize(); APP.save();
          clearTimeout(refsTimer); refsTimer = setTimeout(() => { renderRefs(); renderChapterList(); }, 200);
        });
        body = h('div', { class: 'ink' }, els.backdrop, els.ta);
      } else {
        body = h('div', { class: 'prose read-view' }, c.text.trim() ? APP.prose(c.text, { ctx: 'write' }) : h('p', { class: 'empty-note' }, 'Ce chapitre est vide.'));
      }
      const del = h('button', { class: 'btn btn-danger', disabled: S().chapters.length < 2 }, 'Supprimer le chapitre');
      let armed = null;
      del.onclick = () => {
        if (armed) { clearTimeout(armed); S().chapters = S().chapters.filter((x) => x.id !== c.id); U().chapterId = S().chapters[0].id; APP.save(); APP.toast('Chapitre supprimé'); APP.views.write.render(); return; }
        del.classList.add('armed'); del.textContent = 'Confirmer';
        armed = setTimeout(() => { armed = null; del.classList.remove('armed'); del.textContent = 'Supprimer le chapitre'; }, 3000);
      };

      els.desk = h('div', { class: 'desk' }, h('div', { class: 'desk-inner' },
        h('div', { class: 'desk-bar' }, els.select, h('div', { class: 'seg', role: 'group', 'aria-label': 'Mode' }, seg('write', 'Écrire'), seg('read', 'Lire')), els.refsBtn, h('button', { class: 'btn refs-toggle', onclick: newChapter }, '+ Chapitre'), els.wc),
        title, body,
        h('div', { class: 'entry-actions', style: { marginTop: '28px' } }, del)));

      root.replaceChildren(h('div', { class: 'write' },
        h('nav', { class: 'chapters', 'aria-label': 'Chapitres' }, h('h3', null, 'Chapitres'), els.list,
          h('button', { class: 'link-btn', style: { padding: '8px', color: 'var(--accent)' }, onclick: newChapter }, '+ Nouveau chapitre')),
        els.desk, els.refs));
      renderChapterList(); renderRefs();
      if (mode === 'write') { paintBackdrop(c.text); requestAnimationFrame(autosize); }
    },
  };
})();
