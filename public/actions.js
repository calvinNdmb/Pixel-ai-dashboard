// Catalogue des interactions. Partagé par l'affichage, la manette,
// le serveur (validation) et le bot Discord (commandes slash).

export const ACTIONS = [
  { id: 'taper', label: 'Taper', icon: '✋', key: 't', target: true, description: 'Mettre une claque à quelqu’un', done: 'Tu as tapé {cible} !' },
  { id: 'bonk', label: 'Bonk', icon: '🔨', key: 'b', target: true, description: 'Un coup de marteau sur la tête', done: 'BONK sur {cible} !' },
  { id: 'tomate', label: 'Tomate', icon: '🍅', key: 'l', target: true, description: 'Lancer une tomate sur quelqu’un', done: 'Tomate lancée sur {cible} !' },
  { id: 'calin', label: 'Câlin', icon: '🤗', key: 'c', target: true, description: 'Faire un câlin à quelqu’un', done: 'Câlin envoyé à {cible} !' },
  { id: 'danse', label: 'Danse', icon: '💃', key: 'd', target: false, description: 'Faire danser ton personnage', done: 'Ton perso danse !' },
  { id: 'saut', label: 'Saut', icon: '🦘', key: ' ', keyLabel: 'Espace', target: false, description: 'Faire sauter ton personnage', done: 'Hop !' },
  { id: 'coucou', label: 'Coucou', icon: '👋', key: 's', target: false, description: 'Faire coucou de la main', done: 'Coucou !' },
];

export const EMOTES = [
  { id: 'rire', label: 'Rire', emoji: '😂', key: 'r' },
  { id: 'coeur', label: 'Cœur', emoji: '❤️', key: 'a' },
  { id: 'wow', label: 'Wow', emoji: '😮', key: 'o' },
  { id: 'colere', label: 'Colère', emoji: '😡', key: 'g' },
  { id: 'pouce', label: 'Pouce', emoji: '👍', key: 'p' },
  { id: 'mort', label: 'Mort de rire', emoji: '💀', key: 'm' },
];
