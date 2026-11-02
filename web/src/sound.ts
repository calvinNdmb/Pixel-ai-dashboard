// Carillons 8-bit (WebAudio, aucun fichier son) : demande d'autorisation,
// rapport du Chef, fin de tour. Le son ne démarre qu'après une action de
// l'utilisateur (règle des navigateurs) : l'activation via le bouton suffit.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'square', volume = 0.05): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

export const sounds = {
  /** À appeler depuis un clic : déverrouille l'audio. */
  unlock(): void {
    audio();
  },
  /** « Ding-dong » : quelqu'un a besoin de toi. */
  attention(): void {
    tone(988, 0, 0.11);
    tone(740, 0.13, 0.2);
  },
  /** Petit arpège : rapport du Chef. */
  report(): void {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.11, 'triangle', 0.06));
  },
  /** Bip discret : fin de tour. */
  done(): void {
    tone(1318, 0, 0.06, 'square', 0.03);
    tone(1760, 0.07, 0.08, 'square', 0.03);
  },
};
