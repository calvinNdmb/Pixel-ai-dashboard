// Manette : choisis ton perso, une cible, et déclenche des actions
// (boutons ou raccourcis clavier). Fonctionne sur téléphone comme sur PC.
import { ACTIONS, EMOTES } from './actions.js';
import { CHAR_W, drawCharacter, lookFor, newAnim, preloadSprites } from './character.js';
import { connect } from './connection.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch { /* navigation privée */ }
  },
};

// ?me=ID permet de préparer un lien personnel pour chaque ami.
const params = new URLSearchParams(location.search);
if (params.get('me')) store.set('me', params.get('me'));

const state = {
  connected: false,
  error: null,
  channel: null,
  members: [],
  characters: {},
  me: store.get('me'),
  target: store.get('target'),
};
const anims = new Map();
const animFor = (id) => anims.get(id) ?? anims.set(id, newAnim(id)).get(id);

const conn = connect({
  onStatus({ connected, error }) {
    state.connected = connected;
    state.error = error;
    render();
  },
  onMessage(msg) {
    if (msg.type === 'state') {
      state.channel = msg.channel;
      state.members = msg.members;
      state.characters = msg.characters ?? {};
      preloadSprites(state.characters);
      render();
    } else if (msg.type === 'speaking') {
      const m = state.members.find((x) => x.id === msg.id);
      if (m) {
        m.speaking = msg.speaking;
        const a = animFor(m.id);
        a.speakingSince = msg.speaking ? a.speakingSince || performance.now() : 0;
      }
    } else if (msg.type === 'error') {
      toast(msg.message);
    }
  },
});

const meMember = () => state.members.find((m) => m.id === state.me);
const others = () => state.members.filter((m) => m.id !== state.me);

// ---------- Boutons d'action (créés une seule fois) ----------
const buttons = new Map();
function makeButton(parent, key, { icon, label, keyLabel, title }, onPress) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'action';
  btn.title = title ?? label;
  btn.innerHTML = `<span class="icon"></span>${label ? '<span class="label"></span>' : ''}<kbd></kbd>`;
  btn.querySelector('.icon').textContent = icon;
  if (label) btn.querySelector('.label').textContent = label;
  btn.querySelector('kbd').textContent = keyLabel;
  btn.addEventListener('click', () => {
    btn.blur(); // sinon la barre d'espace "recliquerait" ce bouton
    onPress();
  });
  parent.append(btn);
  buttons.set(key, btn);
}
for (const a of ACTIONS) {
  makeButton(a.target ? $('target-actions') : $('self-actions'), a.id, {
    icon: a.icon,
    label: a.label,
    keyLabel: a.keyLabel ?? a.key.toUpperCase(),
    title: a.description,
  }, () => fire(a.id));
}
for (const e of EMOTES) {
  makeButton($('emotes'), `emote:${e.id}`, { icon: e.emoji, keyLabel: e.key.toUpperCase(), title: e.label }, () => fire('emote', e.id));
}

function fire(action, emote) {
  const me = meMember();
  if (!me) return openPicker();
  const def = ACTIONS.find((a) => a.id === action);
  if (def?.target && !state.target) return toast('Personne à viser !');
  const sent = conn.send({ type: 'action', from: me.id, action, target: def?.target ? state.target : undefined, emote });
  if (!sent) return toast('Pas connecté au serveur');
  const btn = buttons.get(emote ? `emote:${emote}` : action);
  btn?.classList.add('fired');
  setTimeout(() => btn?.classList.remove('fired'), 140);
  navigator.vibrate?.(12);
}

// ---------- Mini persos animés ----------
const previews = [];
function preview(id) {
  const canvas = document.createElement('canvas');
  canvas.className = 'preview';
  const s = Math.max(1, Math.floor(2 * (window.devicePixelRatio || 1)));
  canvas.width = CHAR_W * s;
  canvas.height = 32 * s;
  previews.push({ canvas, ctx: canvas.getContext('2d'), id, s });
  return canvas;
}

function loop(now) {
  for (let i = previews.length - 1; i >= 0; i--) {
    const p = previews[i];
    if (!p.canvas.isConnected) {
      previews.splice(i, 1);
      continue;
    }
    p.ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
    const m = state.members.find((x) => x.id === p.id);
    if (!m) continue;
    const a = animFor(m.id);
    a.energy += ((m.speaking ? 1 : 0) - a.energy) * 0.15;
    p.ctx.imageSmoothingEnabled = false;
    drawCharacter({ ctx: p.ctx, id: m.id, look: lookFor(m, state.characters), x: 0, y: p.s, s: p.s, now, anim: a, speaking: m.speaking });
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Affichage de la page ----------
function chip(m, index, selected, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `chip${selected ? ' selected' : ''}`;
  if (index < 9) {
    const k = document.createElement('kbd');
    k.textContent = String(index + 1);
    el.append(k);
  }
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = lookFor(m, state.characters).name;
  el.append(preview(m.id), name);
  el.addEventListener('click', () => {
    el.blur();
    onClick();
  });
  return el;
}

function info(title, sub) {
  const box = document.createElement('div');
  const t = document.createElement('div');
  t.className = 'name';
  t.textContent = title;
  const s = document.createElement('div');
  s.className = 'sub';
  s.textContent = sub;
  box.append(t, s);
  return box;
}

function selectTarget(id) {
  state.target = id;
  store.set('target', id);
  render();
}

function render() {
  const connEl = $('conn');
  connEl.classList.toggle('ok', state.connected && Boolean(state.channel));
  connEl.textContent = state.error ?? (!state.connected ? 'Connexion…' : state.channel ? state.channel.name : 'Aucun salon');

  const empty = state.error ?? (!state.connected ? 'Connexion au serveur…' : !state.channel ? 'Le bot n’est dans aucun salon vocal pour l’instant.' : null);
  $('empty').hidden = !empty;
  $('empty').textContent = empty ?? '';
  $('controls').hidden = Boolean(empty);

  const me = meMember();
  const list = others();
  if (!list.some((m) => m.id === state.target)) state.target = list[0]?.id ?? null;

  const meEl = $('me');
  meEl.replaceChildren();
  if (me) meEl.append(preview(me.id), info(lookFor(me, state.characters).name, 'C’est toi'));
  else if (state.me) meEl.append(info('Pas dans le salon', 'Rejoins le salon vocal, ou choisis un autre perso.'));
  else meEl.append(info('Personne', 'Choisis ton perso.'));

  const targetsEl = $('targets');
  targetsEl.replaceChildren(...list.map((m, i) => chip(m, i, m.id === state.target, () => selectTarget(m.id))));
  if (!list.length) targetsEl.append(info('', 'Personne d’autre dans le salon.'));

  for (const a of ACTIONS) buttons.get(a.id).disabled = !me || (a.target && !state.target);
  for (const e of EMOTES) buttons.get(`emote:${e.id}`).disabled = !me;

  if (!$('picker').hidden) renderPicker();
  else if (!empty && !state.me && state.members.length) openPicker();
}

// ---------- Choix de son perso ----------
function renderPicker() {
  $('picker-list').replaceChildren(
    ...state.members.map((m, i) =>
      chip(m, i, m.id === state.me, () => {
        state.me = m.id;
        store.set('me', m.id);
        $('picker').hidden = true;
        render();
      }),
    ),
  );
}
function openPicker() {
  $('picker').hidden = false;
  renderPicker();
}
$('change-me').addEventListener('click', openPicker);
$('picker').addEventListener('click', (e) => {
  if (e.target === $('picker') && meMember()) $('picker').hidden = true;
});

// ---------- Clavier ----------
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('picker').hidden) {
    if (e.key === 'Escape' && meMember()) $('picker').hidden = true;
    return;
  }
  if (e.repeat) return e.key === ' ' && e.preventDefault();

  const list = others();
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code); // marche aussi en AZERTY
  if (digit) {
    const m = list[Number(digit[1]) - 1];
    if (m) selectTarget(m.id);
    e.preventDefault();
    return;
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    if (list.length) {
      const i = list.findIndex((m) => m.id === state.target);
      const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
      selectTarget(list[next].id);
    }
    e.preventDefault();
    return;
  }
  const key = e.key.toLowerCase();
  const action = ACTIONS.find((a) => a.key === key);
  if (action) {
    e.preventDefault();
    fire(action.id);
    return;
  }
  const emote = EMOTES.find((x) => x.key === key);
  if (emote) {
    e.preventDefault();
    fire('emote', emote.id);
  }
});

// ---------- Messages ----------
let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

render();
