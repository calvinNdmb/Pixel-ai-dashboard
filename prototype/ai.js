// IA (capacité « sample » de Claude) : liens suggérés entre fiches, illustrations de lieux.
(function () {
  const { h } = APP;
  const S = () => APP.state;
  const AI = (APP.ai = { sample: null });

  // La fonctionnalité n'apparaît que si la page peut demander à Claude.
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('sample').then((fn) => {
      if (!fn) return;
      AI.sample = fn;
      document.documentElement.classList.add('has-ai');
      APP.rerender();
    }).catch(() => {});
  }

  AI.copy = function (e) {
    const c = e && e.code;
    if (c === 'not_granted' || c === 'sampling_disabled' || c === 'not_declared' || c === 'capability_disabled') return "L'accès à Claude n'est pas autorisé pour cette page.";
    if (c === 'rate_limited') return 'Trop de demandes pour le moment. Réessaie dans un instant.';
    if (c === 'session_expired') return 'Ta session a expiré : reconnecte-toi à Claude.';
    if (c === 'invalid_json' || c === 'empty_completion') return "La réponse n'était pas exploitable. Tu peux relancer.";
    if (c === 'refused') return 'Claude a refusé cette demande.';
    if (c === 'cancelled') return 'Arrêté.';
    return 'La demande a échoué. Tu peux relancer.';
  };

  function worldDigest() {
    const s = S();
    const entries = s.entries.map((e) => ({ id: e.id, type: e.type, nom: e.name, annee: e.year, resume: e.summary, texte: (e.body || '').slice(0, 700) }));
    const rels = s.relations.map((r) => `${r.from} -[${r.label}]-> ${r.to}`);
    const chapters = s.chapters.map((c) => `## ${c.title}\n${c.text.slice(0, 1500)}`).join('\n\n');
    return { entries, rels, chapters };
  }

  // ---------- liens suggérés ----------
  AI.suggestLinks = async function (signal) {
    const d = worldDigest();
    const prompt = [
      "Tu aides un auteur à construire l'univers de son roman. Voici ses fiches, les relations déjà notées et des extraits de chapitres.",
      'Propose jusqu’à 8 NOUVELLES relations plausibles et intéressantes entre ces fiches, en t’appuyant sur ce que disent les textes. Privilégie les liens entre personnages, puis entre personnages et lieux, factions ou objets.',
      'Règles : utilise uniquement les id fournis ; aucune relation qui existe déjà, dans un sens ou dans l’autre ; "label" est un groupe verbal court en français qui se lit « from label to » (ex. « rival de », « a trahi », « protège », « cache un secret à ») ; "why" justifie en une phrase en citant le texte quand c’est possible ; "confidence" entre 0 et 1.',
      'Réponds uniquement avec un tableau JSON : [{"from":"id","to":"id","label":"…","why":"…","confidence":0.7}]',
      '', 'FICHES :', JSON.stringify(d.entries), '', 'RELATIONS EXISTANTES :', d.rels.join('\n') || '(aucune)', '', 'EXTRAITS DES CHAPITRES :', d.chapters,
    ].join('\n');
    const out = await AI.sample.json(prompt, { signal, cache: false });
    const seen = new Set(S().relations.flatMap((r) => [r.from + '|' + r.to, r.to + '|' + r.from]));
    return (Array.isArray(out) ? out : []).filter((x) => x && APP.entry(String(x.from)) && APP.entry(String(x.to)) && x.from !== x.to && !seen.has(x.from + '|' + x.to) && typeof x.label === 'string')
      .map((x) => ({ from: String(x.from), to: String(x.to), label: x.label.trim().slice(0, 48), why: String(x.why || '').slice(0, 280), confidence: Number(x.confidence) || 0.5 }))
      .slice(0, 8);
  };

  AI.openLinksPanel = function (host, onChange) {
    const old = host.querySelector('.ai-panel');
    if (old) old.remove();
    let ctl = new AbortController();
    const status = h('p', { class: 'ai-status' }, 'Claude lit tes fiches et tes chapitres…');
    const list = h('div', { class: 'ai-list' });
    const stop = h('button', { class: 'btn', onclick: () => ctl.abort() }, 'Arrêter');
    const panel = h('aside', { class: 'ai-panel', 'aria-label': 'Liens proposés par Claude' },
      h('div', { class: 'ai-head' }, h('h3', null, 'Liens proposés'), h('button', { class: 'link-btn', onclick: () => { ctl.abort(); panel.remove(); } }, 'Fermer')),
      status, list, h('div', { class: 'peek-actions' }, stop));
    host.append(panel);
    const add = (sug, row) => {
      S().relations.push({ id: APP.uid('r'), from: sug.from, to: sug.to, label: sug.label, ai: true });
      APP.save(); row.classList.add('done'); row.querySelector('.ai-actions').replaceChildren(h('span', { class: 'ok' }, 'Ajouté'));
      onChange && onChange();
    };
    AI.suggestLinks(ctl.signal).then((sugs) => {
      stop.remove();
      if (!sugs.length) { status.textContent = 'Aucun nouveau lien évident. Écris un peu plus, puis relance.'; return; }
      status.textContent = sugs.length + ' liens à examiner. Rien n’est ajouté sans ton accord.';
      const rows = sugs.map((sug) => {
        const a = APP.entry(sug.from), b = APP.entry(sug.to);
        const row = h('div', { class: 'ai-row' },
          h('div', { class: 'ai-rel' }, h('b', { style: { color: APP.color(a) } }, a.name), ' ', h('i', null, sug.label), ' ', h('b', { style: { color: APP.color(b) } }, b.name)),
          h('p', null, sug.why),
          h('div', { class: 'ai-actions' },
            h('button', { class: 'btn btn-accent', onclick: () => add(sug, row) }, 'Ajouter'),
            h('button', { class: 'btn', onclick: () => row.remove() }, 'Ignorer'),
            h('span', { class: 'conf' }, Math.round(sug.confidence * 100) + ' %')));
        return row;
      });
      list.replaceChildren(...rows);
      panel.lastChild.replaceChildren(h('button', { class: 'btn', onclick: () => rows.forEach((r, i) => r.isConnected && !r.classList.contains('done') && add(sugs[i], r)) }, 'Tout ajouter'),
        h('button', { class: 'btn', onclick: () => AI.openLinksPanel(host, onChange) }, 'Relancer'));
    }).catch((e) => { stop.remove(); status.textContent = AI.copy(e); });
  };

  // ---------- illustration d'une fiche (SVG dessiné par Claude) ----------
  function cleanSvg(text) {
    const m = String(text).match(/<svg[\s\S]*<\/svg>/i);
    if (!m) return null;
    let svg = m[0]
      .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/\s(xlink:)?href\s*=\s*("https?:[^"]*"|'https?:[^']*')/gi, '');
    if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  AI.illustrate = async function (e, signal) {
    const kind = (TYPES[e.type] || TYPES.lieu).label.toLowerCase();
    const prompt = [
      `Dessine l'illustration de la fiche « ${e.name} » (${kind}) d'un univers de fiction maritime et mélancolique.`,
      `Résumé : ${e.summary || '—'}`, `Texte : ${(e.body || '').slice(0, 900)}`, '',
      'Contraintes : un seul document SVG valide avec viewBox="0 0 800 450", width="800" height="450".',
      'Style : peinture en aplats, plans successifs (ciel, lointain, plan moyen, premier plan), lumière marquée, palette naturelle et atmosphérique, dégradés linéaires et radiaux. Paysage ou scène, sans personnage en gros plan.',
      'Interdit : texte, lettres, images externes, <script>, <foreignObject>. Reste sous 12 Ko.',
      'Réponds uniquement avec le SVG, de <svg à </svg>.',
    ].join('\n');
    const { text } = await AI.sample(prompt, { signal, cache: false });
    const url = cleanSvg(text);
    if (!url) throw { code: 'empty_completion' };
    return url;
  };
})();
