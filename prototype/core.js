// Noyau : état, sauvegarde locale, rendu auto-lié, pan/zoom, carte flottante.
(function () {
  const KEY = 'archipel-demo-v2';
  const APP = (window.APP = { views: {} });

  // ---------- état ----------
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.version === 2 && Array.isArray(s.entries)) return s;
      }
    } catch (e) { /* stockage indisponible : on repart du monde d'exemple */ }
    return makeSeed();
  }
  APP.state = load();
  TERRAIN.init(APP.state);
  APP.ui = { view: 'entries', entryId: null, editing: false, history: [], chapterId: APP.state.chapters[0] && APP.state.chapters[0].id, mode: 'write', listMode: true };

  let saveTimer = null;
  APP.save = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(APP.state)); }
      catch (e) { APP.toast("Sauvegarde locale impossible (image trop lourde ?)"); }
    }, 300);
  };
  APP.reset = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    APP.state = makeSeed();
    TERRAIN.init(APP.state);
    APP.invalidate();
  };

  APP.uid = (p) => p + Math.random().toString(36).slice(2, 8);
  APP.entry = (id) => APP.state.entries.find((e) => e.id === id) || null;
  APP.type = (e) => TYPES[e && e.type] || TYPES.personnage;
  APP.color = (e) => APP.type(e).color;
  APP.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- petit constructeur DOM ----------
  APP.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([p, val]) => el.style.setProperty(p, val));
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
  APP.svg = function (tag, attrs, ...kids) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
    kids.flat().forEach((k) => k != null && el.append(k.nodeType ? k : document.createTextNode(String(k))));
    return el;
  };

  // ---------- reconnaissance des noms (le cœur du wiki auto-lié) ----------
  let matcher = null;
  const norm = (s) => s.toLocaleLowerCase('fr').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]").replace(/\s+/g, '\\s+');
  APP.invalidate = function () { matcher = null; };
  function getMatcher() {
    if (matcher) return matcher;
    const lookup = new Map();
    for (const e of APP.state.entries) {
      for (const n of [e.name, ...(e.aliases || [])]) {
        const k = norm(n || '');
        if (k.length >= 2 && !lookup.has(k)) lookup.set(k, e.id);
      }
    }
    const names = [...lookup.keys()].sort((a, b) => b.length - a.length);
    const re = names.length ? new RegExp('(?<![\\p{L}\\p{N}])(' + names.map(esc).join('|') + ')(?![\\p{L}\\p{N}])', 'giu') : null;
    return (matcher = { re, lookup });
  }
  APP.tokenize = function (text) {
    const { re, lookup } = getMatcher();
    const out = [];
    if (!re || !text) return [{ t: 'text', v: text || '' }];
    let last = 0;
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
      out.push({ t: 'link', v: m[0], id: lookup.get(norm(m[0])) });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
    return out;
  };
  APP.mentions = function (text, exceptId) {
    const counts = new Map();
    for (const tk of APP.tokenize(text)) if (tk.t === 'link' && tk.id !== exceptId) counts.set(tk.id, (counts.get(tk.id) || 0) + 1);
    return counts;
  };
  APP.inline = function (text, opts = {}) {
    const frag = document.createDocumentFragment();
    for (const tk of APP.tokenize(text)) {
      if (tk.t === 'text') { frag.append(tk.v); continue; }
      const e = APP.entry(tk.id);
      if (tk.id === opts.selfId) { frag.append(APP.h('span', { class: 'self-mention' }, tk.v)); continue; }
      frag.append(APP.h('a', { class: 'lk', href: '#', 'data-id': tk.id, 'data-ctx': opts.ctx || null, style: { '--c': APP.color(e) } }, tk.v));
    }
    return frag;
  };
  APP.prose = function (text, opts = {}) {
    const frag = document.createDocumentFragment();
    for (const block of (text || '').split(/\n{2,}/)) {
      const b = block.trim();
      if (!b) continue;
      const lines = b.split('\n');
      let start = 0;
      if (lines[0].startsWith('# ')) { frag.append(APP.h('h3', null, APP.inline(lines[0].slice(2), opts))); start = 1; }
      const rest = lines.slice(start);
      if (!rest.length) continue;
      const p = APP.h('p');
      rest.forEach((ln, i) => { if (i) p.append(APP.h('br')); p.append(APP.inline(ln, opts)); });
      frag.append(p);
    }
    return frag;
  };

  // ---------- pan / zoom / glisser (souris, tactile, pincement) ----------
  APP.PanZoom = class {
    constructor(svg, vp, o = {}) {
      Object.assign(this, { svg, vp, o, t: { x: 0, y: 0, k: 1 }, ptrs: new Map(), mode: null, min: o.min || 0.25, max: o.max || 3.5 });
      svg.addEventListener('pointerdown', (e) => this.down(e));
      svg.addEventListener('pointermove', (e) => this.move(e));
      svg.addEventListener('pointerup', (e) => this.up(e, false));
      svg.addEventListener('pointercancel', (e) => this.up(e, true));
      svg.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(this.local(e), Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    }
    local(e) { const r = this.svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    world(p) { return { x: (p.x - this.t.x) / this.t.k, y: (p.y - this.t.y) / this.t.k }; }
    apply() { this.vp.setAttribute('transform', `translate(${this.t.x} ${this.t.y}) scale(${this.t.k})`); }
    zoomAt(p, f) {
      const k = APP.clamp(this.t.k * f, this.min, this.max), r = k / this.t.k;
      this.t = { k, x: p.x - (p.x - this.t.x) * r, y: p.y - (p.y - this.t.y) * r };
      this.apply();
    }
    zoomCenter(f) { const r = this.svg.getBoundingClientRect(); this.zoomAt({ x: r.width / 2, y: r.height / 2 }, f); }
    fit(b, pad = 48) {
      const r = this.svg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const k = APP.clamp(Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h), this.min, this.max);
      this.t = { k, x: (r.width - b.w * k) / 2 - b.x * k, y: (r.height - b.h * k) / 2 - b.y * k };
      this.apply();
    }
    down(e) {
      if (e.button) return;
      APP.hidePeek();
      try { this.svg.setPointerCapture(e.pointerId); } catch (_) {}
      const p = this.local(e);
      this.ptrs.set(e.pointerId, p);
      if (this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.values()];
        this.mode = 'pinch';
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, t: { ...this.t } };
        this.target = null;
        return;
      }
      this.target = this.o.hit ? this.o.hit(e) : null;
      this.start = { p, t: { ...this.t } };
      this.moved = false;
      this.mode = this.target && this.o.drag ? 'drag' : 'pan';
      if (this.mode === 'drag' && this.o.dragStart) this.o.dragStart(this.target, this.world(p));
    }
    move(e) {
      if (!this.ptrs.has(e.pointerId)) return;
      const p = this.local(e);
      this.ptrs.set(e.pointerId, p);
      if (this.mode === 'pinch' && this.ptrs.size >= 2) {
        const [a, b] = [...this.ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const P = this.pinch, k = APP.clamp(P.t.k * d / P.d, this.min, this.max), r = k / P.t.k;
        this.t = { k, x: m.x - (P.m.x - P.t.x) * r, y: m.y - (P.m.y - P.t.y) * r };
        this.apply();
        return;
      }
      if (!this.start) return;
      const dx = p.x - this.start.p.x, dy = p.y - this.start.p.y;
      if (!this.moved && Math.hypot(dx, dy) < 6) return;
      this.moved = true;
      if (this.mode === 'pan') {
        this.svg.classList.add('panning');
        this.t = { k: this.t.k, x: this.start.t.x + dx, y: this.start.t.y + dy };
        this.apply();
      } else if (this.mode === 'drag') this.o.drag(this.target, this.world(p));
    }
    up(e, cancel) {
      if (!this.ptrs.has(e.pointerId)) return;
      this.ptrs.delete(e.pointerId);
      this.svg.classList.remove('panning');
      if (this.mode === 'pinch') {
        if (this.ptrs.size === 1) { const [p] = [...this.ptrs.values()]; this.mode = 'pan'; this.start = { p, t: { ...this.t } }; this.moved = true; }
        else { this.mode = null; this.start = null; }
        return;
      }
      if (!cancel && !this.moved && this.o.tap) this.o.tap(this.target, e, this.world(this.local(e)));
      if (this.mode === 'drag' && this.moved && this.o.dragEnd) this.o.dragEnd(this.target);
      this.mode = null; this.start = null; this.target = null;
    }
  };

  // ---------- carte flottante (aperçu d'une fiche) ----------
  const peek = () => document.getElementById('peek');
  APP.showPeek = function (content, x, y) {
    const el = peek();
    el.replaceChildren(content);
    el.hidden = false;
    const w = el.offsetWidth, hgt = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    el.style.left = APP.clamp(x - w / 2, 16, vw - w - 16) + 'px';
    el.style.top = (y + 14 + hgt < vh - 16 ? y + 14 : Math.max(16, y - hgt - 14)) + 'px';
  };
  APP.hidePeek = function () { const el = peek(); if (el) el.hidden = true; };
  APP.entryCard = function (e, extra) {
    const h = APP.h;
    return h('div', null,
      h('span', { class: 'chip', style: { '--c': APP.color(e) } }, h('span', { class: 'dot', style: { '--c': APP.color(e) } }), APP.type(e).label),
      h('h4', null, e.name),
      h('p', null, e.summary || 'Pas encore de résumé.'),
      h('div', { class: 'peek-actions' },
        h('button', { class: 'btn btn-accent', onclick: () => { APP.hidePeek(); APP.openEntry(e.id); } }, 'Ouvrir la fiche'),
        extra || null));
  };

  let toastTimer = null;
  APP.toast = function (msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2400);
  };
})();
