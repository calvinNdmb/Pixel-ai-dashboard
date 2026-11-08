/* Pixel's voice: little robot bleeps made on the spot with WebAudio, no sound files.
   It only plays on the Pi's own screen (?kiosk=1, or ?son=1 to try it elsewhere), through the Pi's audio output: plug a
   small speaker into its headphone jack. persona.js tells it when Pixel starts a scene (scene) and when a speech bubble
   appears (say): a little tune for the scene, then a babble as long as the line. The volume is set in the quick menu and
   kept by that screen (localStorage). kiosk.sh lets Chromium play without a touch (--autoplay-policy); anywhere else the
   first touch unlocks it. */
window.PixelSon = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ON = typeof location !== 'undefined' && /[?&](kiosk|son)\b/.test(location.search);
  let ac = null, out = null, vol = 0.6, busyUntil = 0;
  try { const v = parseFloat(localStorage.getItem('pixel.volume')); if (v >= 0 && v <= 1) vol = v; } catch (e) { /* private mode */ }

  function ready() {
    if (!ON || !AC || vol <= 0) return null;
    try {
      if (!ac) { ac = new AC(); out = ac.createGain(); out.connect(ac.destination); }
      if (ac.state === 'suspended') ac.resume().catch(() => {});
    } catch (e) { return null; }
    out.gain.value = 0.25 * vol * vol;               // square waves are loud; squared so that each step sounds as big
    return ac;
  }
  if (ON) addEventListener('pointerdown', () => { if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); }, { passive: true });

  /* one note: f0 to f1 Hz in dur s, a quick attack and a short fade; 'noise' is a puff of noise (the sneeze) */
  function note(t, f0, f1, dur, type, g) {
    const e = ac.createGain();
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + 0.008); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    e.connect(out);
    if (type === 'noise') {
      const n = Math.max(1, Math.round(ac.sampleRate * dur)), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = ac.createBufferSource(); s.buffer = b; s.connect(e); s.start(t); return;
    }
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(e); o.start(t); o.stop(t + dur + 0.03);
  }
  const n = (d, f0, f1, dur, type = 'square', g = 0.5) => [d, f0, f1, dur, type, g];
  const tune = (notes, step, type = 'square', g = 0.5) => notes.map(([f, beats = 1], i, a) => n(a.slice(0, i).reduce((s, x) => s + (x[1] || 1), 0) * step, f, 0, beats * step * 0.85, type, g));
  const E5 = 659, G5 = 784, C5 = 523, D5 = 587;
  const SOUNDS = {
    bip: [n(0, 880, 1320, 0.07), n(0.09, 1320, 1760, 0.08)],
    salut: tune([[660], [880], [1320, 2]], 0.09),
    youpi: tune([[660], [990], [1320], [1760, 2]], 0.08),
    rire: [0, 1, 2, 3, 4, 5].map(i => n(i * 0.07, i % 2 ? 1300 : 1000, i % 2 ? 1700 : 1400, 0.05, 'square', 0.35)),
    aie: [n(0, 1500, 450, 0.2, 'square', 0.45)],
    bonk: [n(0, 240, 80, 0.18, 'triangle', 0.9)],
    hmm: [n(0, 320, 300, 0.12, 'square', 0.35), n(0.16, 270, 240, 0.18, 'square', 0.35)],
    grr: [n(0, 150, 120, 0.45, 'sawtooth', 0.3)],
    peur: tune([[1200], [1400], [1200], [1400]], 0.07, 'square', 0.35),
    boude: [n(0, 520, 330, 0.22, 'square', 0.35), n(0.25, 330, 190, 0.32, 'square', 0.3)],
    bisou: [n(0, 900, 1800, 0.06, 'sine', 0.8), n(0.1, 1600, 2400, 0.05, 'sine', 0.6)],
    ronron: [0, 1, 2, 3, 4].map(i => n(i * 0.13, 115, 100, 0.11, 'triangle', 0.7)),
    baille: [n(0, 700, 250, 0.7, 'triangle', 0.6)],
    bulles: [0, 1, 2, 3].map(i => n(i * 0.22, 320 + i * 50, 950 + i * 70, 0.09, 'sine', 0.9)),
    hic: [n(0, 600, 1500, 0.06, 'square', 0.45)],
    atchoum: [n(0, 500, 800, 0.25, 'triangle', 0.5), n(0.3, 0, 0, 0.25, 'noise', 0.5)],
    bzz: [n(0, 190, 210, 0.7, 'sawtooth', 0.12)],
    siffle: tune([[1568], [1760], [1976], [1760], [1568], [1319, 2]], 0.15, 'sine', 0.6),
    danse: tune([[523], [659], [784], [659], [523], [659], [784], [1047, 2]], 0.12, 'square', 0.35),
    coucou: [n(0, 784, 0, 0.2, 'triangle', 0.8), n(0.28, 622, 0, 0.32, 'triangle', 0.8)],      // the cuckoo
    alarme: [0, 0.16, 0.32, 0.64, 0.8, 0.96].map(d => n(d, 1760, 0, 0.1, 'square', 0.45)),
    pfiou: [n(0, 950, 320, 0.55, 'triangle', 0.6)],
    perdu: [n(0, 880, 0, 0.12), n(0.15, 660, 0, 0.12), n(0.3, 494, 247, 0.35)],
    clochette: tune([[E5], [E5], [E5, 2], [E5], [E5], [E5, 2], [E5], [G5], [C5, 1.5], [D5, 0.5], [E5, 4]], 0.16, 'triangle', 0.7),   // Jingle Bells
  };
  const SCENE = {
    coucou: 'salut', content: 'bip', chatouilles: 'rire', oeil: 'aie', bonk: 'bonk', pousse: 'aie', ou: 'bip', saut: 'youpi', pirouette: 'youpi',
    timide: 'bip', bisou: 'bisou', idee: 'bip', amour: 'bisou', 'nuit-tap': 'baille',
    he: 'hmm', impatient: 'hmm', esquive: 'rire', colere: 'grr', panique: 'peur', boude: 'boude', pardon: 'salut',
    caresse: 'ronron', ronron: 'ronron', calme: 'bip',
    retour: 'salut', manque: 'salut', bonjour: 'salut', bonsoir: 'salut', reveille: 'peur', 'joyeux-noel': 'clochette', 'bonne-annee': 'youpi',
    poisson: 'bulles', joie: 'youpi', gym: 'youpi', atchoum: 'atchoum', hoquet: 'hic', mouche: 'bzz', sifflote: 'siffle', danse: 'danse',
    faim: 'hmm', nuit: 'baille', sieste: 'baille', neige: 'clochette',
    noir: 'peur', lumiere: 'youpi', heure: 'coucou', rdv: 'alarme', 'rdv-fin': 'bip', chaud: 'pfiou', wifi: 'perdu', 'wifi-ok': 'youpi',
  };

  function play(name) {
    const a = ready(), s = SOUNDS[name]; if (!a || !s) return;
    const t0 = a.currentTime + 0.02; let end = t0;
    for (const [d, f0, f1, dur, type, g] of s) { note(t0 + d, f0, f1, dur, type, g); end = Math.max(end, t0 + d + dur); }
    busyUntil = end + 0.05;
  }
  function say(text) {                                // a babble as long as the line, after the scene's tune
    const a = ready(); if (!a) return;
    const k = Math.min(8, Math.max(2, Math.round(String(text).length / 5))), t0 = Math.max(a.currentTime + 0.02, busyUntil);
    for (let i = 0; i < k; i++) { const f = 520 + Math.random() * 480; note(t0 + i * 0.075, f, f * (Math.random() < 0.3 ? 1.25 : 1), 0.05, 'square', 0.22); }
    busyUntil = t0 + k * 0.075;
  }
  return {
    on: ON,
    scene(id) { play(SCENE[id]); },
    say,
    play,
    get volume() { return vol; },
    setVolume(v) {
      vol = Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
      try { localStorage.setItem('pixel.volume', String(vol)); } catch (e) { /* private mode */ }
      play('bip');                                    // so you hear the new level
    },
    sounds: Object.keys(SOUNDS),
  };
})();
