// Mode démo : simule un salon vocal sans Discord, pour tester l'affichage
// (et vérifier que l'autre écran/appareil le reçoit bien).
import { ACTIONS, EMOTES } from '../public/actions.js';

const FAKE_MEMBERS = [
  { id: 'demo-1', name: 'Pixel', avatar: null },
  { id: 'demo-2', name: 'Bobby', avatar: null },
  { id: 'demo-3', name: 'Luna', avatar: null },
  { id: 'demo-4', name: 'Kiko', avatar: null },
];

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

export function startDemo({ display, actions = true }) {
  console.log('[démo] salon vocal simulé (aucun token Discord utilisé)');
  display.setChannel({ name: 'Salon démo' });
  display.setMembers(FAKE_MEMBERS);

  // Chaque faux membre parle par "phrases" : des rafales de mots entrecoupées de pauses.
  for (const member of FAKE_MEMBERS) {
    const talk = () => {
      let words = 3 + Math.floor(Math.random() * 10);
      const word = () => {
        display.setSpeaking(member.id, true);
        setTimeout(() => {
          display.setSpeaking(member.id, false);
          if (--words > 0) setTimeout(word, 60 + Math.random() * 180);
          else setTimeout(talk, 1500 + Math.random() * 6000);
        }, 150 + Math.random() * 450);
      };
      word();
    };
    setTimeout(talk, Math.random() * 3000);
  }

  // De temps en temps, un faux membre en embête un autre (ou danse, ou réagit).
  if (!actions) return;
  const act = () => {
    const from = pickOne(FAKE_MEMBERS);
    if (Math.random() < 0.3) {
      display.triggerAction({ from: from.id, action: 'emote', emote: pickOne(EMOTES).id });
    } else {
      const def = pickOne(ACTIONS);
      const target = pickOne(FAKE_MEMBERS.filter((m) => m !== from));
      display.triggerAction({ from: from.id, action: def.id, target: def.target ? target.id : undefined });
    }
    setTimeout(act, 2500 + Math.random() * 4000);
  };
  setTimeout(act, 2000);
}
