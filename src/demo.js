// Mode démo : simule un salon vocal sans Discord, pour tester l'affichage
// (et vérifier que l'autre écran/appareil le reçoit bien).
const FAKE_MEMBERS = [
  { id: 'demo-1', name: 'Pixel', avatar: null },
  { id: 'demo-2', name: 'Bobby', avatar: null },
  { id: 'demo-3', name: 'Luna', avatar: null },
  { id: 'demo-4', name: 'Kiko', avatar: null },
];

export function startDemo({ display }) {
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
}
