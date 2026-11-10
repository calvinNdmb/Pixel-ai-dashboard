/* Scene pack « amis » — les amis de Pixel: the Pixels of his friends, from house to house (pixel/amis.py, web/amis.js).
   A visit: his friend walks in on this screen and they play little two-Pixel scenes for about 3 minutes (the host's server
   sets the programme: pixel/amis.py programme(), which reads the durations below). Each such scene has two parts: the host's
   (an ordinary scene, S(...) below, played on this Pixel's face, which web/amis.js moves to the left and shrinks) and the
   visitor's (DUO[id] below: his animation, his motion, his lines and his props, that web/amis.js draws beside him, in the
   host's theme, with the visitor's own look through PixelLook.with). The host's lines can name the visitor: ami() reads
   web/amis.js's PixelAmis.duo. On the visitor's own screen: ami-part / ami-absent while he is away, ami-revient (he tells
   what they did) or ami-bredouille (why he could not go) when he comes home; and the news: a new friend, a « coucou », a
   sticker, someone knocking (« me demander avant »), the coucou or sticker this Pixel sends.
   See the top of web/persona.js: scenes are S('id', 'Label', 'group', { dur: …, … }) on one line each (pixel/scenes.py
   reads them, and pixel/amis.py reads « dur » of the visit's scenes right after the group).
   Also here, for web/amis.js and the phone's panel: PixelAmisArt, the fixed stickers (K(id, name, 12 x 12 sprite): what
   pixel/amis.py accepts, one per line) and the props, and the words for what they did (A(id, « on a … », « ils ont … »),
   one per line, read by pixel/amis.py for the memories). No free text ever goes from one house to another. */
window.PixelAmisArt = (() => {
/* a sprite's letters are the theme's colours (like web/scenes/nourrir.js): o its line, a its accent, p its pink, d its dim
   colour, h its highlight, l a light fill (the paper in Manga, Croquis and LCD), k a dark mark on a fill; . is empty */
const K = (id, nom, art) => ({ id, nom, art });
const STICKERS = [
  K('coeur', 'un cœur', ['............', '.oooo..oooo.', 'oppppooppppo', 'opllpppppppo', 'oplppppppppo', 'oppppppppppo', 'oppppppppppo', '.oppppppppo.', '..oppppppo..', '...oppppo...', '....oppo....', '.....oo.....']),
  K('etoile', 'une étoile', ['.....oo.....', '....oaao....', '....oaao....', '...oaaaao...', 'ooooaaaaoooo', 'oaaaaaaaaaao', '.oaaaaaaaao.', '..oaaaaaao..', '..oaaaaaao..', '.oaaaooaaao.', '.oaoo..ooao.', '.oo......oo.']),
  K('soleil', 'un soleil', ['.....aa.....', '.a...aa...a.', '..a......a..', '....oooo....', '...oaaaao...', 'aa.oalaao.aa', 'aa.oaaaao.aa', '...oaaaao...', '....oooo....', '..a......a..', '.a...aa...a.', '.....aa.....']),
  K('arc', 'un arc-en-ciel', ['............', '....pppp....', '..pppppppp..', '.ppaaaaaapp.', '.paaaaaaaap.', 'ppaahhhhaapp', 'paahh..hhaap', 'pahh....hhap', 'pah......hap', 'ooo......ooo', 'olo......olo', 'ooo......ooo']),
  K('pouce', 'un pouce levé', ['....oo......', '...oaao.....', '...oaao.....', '...oaao.....', '..oaaaoooo..', 'oooaaaaaaao.', 'olo.aaaoooo.', 'olo.aaaaaao.', 'olo.aaaoooo.', 'olo.aaaaaao.', 'olooaaaaoo..', 'ooooooooo...']),
  K('rire', 'un fou rire', ['...oooooo...', '..oaaaaaao..', '.oaaaaaaaao.', 'oaaoaaaaoaao', 'oaoaoaaoaoao', 'oaaaaaaaaaao', 'oaooooooooao', 'oaokkkkkkoao', 'oaaokppkoaao', '.oaaooooaao.', '..oaaaaaao..', '...oooooo...']),
  K('fleur', 'une fleur', ['....pppp....', '...pppppp...', '.pp.pppp.pp.', 'pppp.aa.pppp', 'ppppaaaapppp', '.pp.aaaa.pp.', '...p.aa.p...', '....pppp....', '.....dd.....', '.dd..dd.....', '..dddd......', '.....dd.....']),
  K('gateau', 'un gâteau', ['..a..a..a...', '..o..o..o...', '..l..l..l...', '.oooooooooo.', 'oppppppppppo', 'opllpllpllpo', 'oppppppppppo', 'oaaaaaaaaaao', 'oaaaaaaaaaao', 'oppppppppppo', 'oooooooooooo', '............']),
  K('fusee', 'une fusée', ['.....oo.....', '....oaao....', '...oaaaao...', '...ollllo...', '...olhhlo...', '...olhhlo...', '...ollllo...', '..oollllloo.', '.oaollllloao', '.oaoooooooao', '....a..a....', '...a.aa.a...']),
  K('cadeau', 'un cadeau', ['..oo....oo..', '.oaao..oaao.', '..oaaooaao..', 'oooooaaooooo', 'oppppaappppo', 'oooooaaooooo', '.oppppaappo.', '.oppppaappo.', '.oppppaappo.', '.oppppaappo.', '.oppppaappo.', '.oooooooooo.']),
  K('musique', 'une note de musique', ['......oooo..', '......oaaao.', '......o.oao.', '......o..oo.', '......o.....', '......o.....', '......o.....', '..ooooo.....', '.oaaaao.....', '.oaaaao.....', '..oooo......', '............']),
  K('bisou', 'un bisou', ['............', '............', '..pp....pp..', '.pppp..pppp.', 'pppppppppppp', 'pkkkkkkkkkkp', '.pppppppppp.', '..pppppppp..', '...pppppp...', '............', '............', '............']),
];
/* the props web/amis.js draws (not stickers: nobody sends them) */
const PROPS = {
  valise: ['............', '....oooo....', '....o..o....', '.oooooooooo.', 'oaaaaoaaaaao', 'oaaaaoaaaaao', 'oooooooooooo', 'oaaaaoaaaaao', 'oaaaaoaaaaao', 'oaaaaoaaaaao', '.oooooooooo.', '..o......o..'],
  photo: ['............', '...ooo......', 'oooooooooooo', 'ollllllllllo', 'olllooooollo', 'ollokkkkollo', 'ollokhkkollo', 'ollokkkkollo', 'olllooooollo', 'ollllllllllo', 'oooooooooooo', '............'],
  assiette: ['............', '............', '............', '............', '............', '............', '............', '............', '.dddddddddd.', 'dlllllllllld', '.dddddddddd.', '............'],
  lune: ['....oooo....', '..oohhh.....', '.ohhhh......', '.ohhh.......', 'ohhhh.......', 'ohhhh.......', 'ohhhh.......', 'ohhhhh......', '.ohhhhh....o', '.oohhhhhhoo.', '...oooooo...', '............'],
  biscuit: ['............', '...oooooo...', '..oaaaaaao..', '.oakaaaakao.', 'oaaaaaaaaaao', 'oaaakaaaaaao', 'oaaaaaaakaao', 'oakaaaaaaaao', '.oaaaakaaao.', '..oaaaaaao..', '...oooooo...', '............'],
};
const BY = Object.fromEntries(STICKERS.map(s => [s.id, s]));
/* what they did, as the visitor tells it (« on a … ») and as his memories keep it (« ils ont … ») */
const A = (id, nous, eux) => ({ id, nous, eux });
const FAIT = Object.fromEntries([
  A('ami-danse', 'on a dansé', 'ils ont dansé'),
  A('ami-tape', 'on s’est tapé dans les mains', 'ils se sont tapé dans les mains'),
  A('ami-course', 'on a fait la course', 'ils ont fait la course'),
  A('ami-gouter', 'on a goûté ensemble', 'ils ont goûté ensemble'),
  A('ami-cache', 'on a joué à cache-cache', 'ils ont joué à cache-cache'),
  A('ami-blague', 'on s’est raconté des blagues', 'ils se sont raconté des blagues'),
  A('ami-bavarde', 'on a bavardé', 'ils ont bavardé'),
  A('ami-photo', 'on a fait une photo souvenir', 'ils ont fait une photo souvenir'),
  A('ami-dodo', 'on s’est endormis côte à côte', 'ils se sont endormis côte à côte'),
].map(a => [a.id, a]));
const story = (fait, n = 2) => {                       // « On a dansé, et on a fait la course ! »: two of them (one if two make too long a line)
  const order = ['ami-danse', 'ami-course', 'ami-cache', 'ami-tape', 'ami-gouter', 'ami-blague', 'ami-photo', 'ami-dodo', 'ami-bavarde'];
  const got = order.filter(id => (fait || []).includes(id)).slice(0, n).map(id => FAIT[id].nous);
  if (!got.length) return 'On n’a pas eu le temps de jouer beaucoup !';
  const s = got.join(', et ');
  if (s.length > 42 && got.length > 1) return story(fait, 1);
  return s[0].toUpperCase() + s.slice(1) + ' !';
};
/* colours of a theme for the letters (persona.js D.col: fg, acc, pink, dim, hi, bg) */
const rgb = h => { const s = String(h || '#000').replace('#', ''), f = s.length === 3 ? s.split('').map(c => c + c).join('') : s.padEnd(6, '0'); return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0); };
const lum = h => { const [r, g, b] = rgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const mix = (a, b, k) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * k).toString(16).padStart(2, '0')).join('');
const theme = c => ({ fg: c.fg, acc: c.accent || c.fg, pink: c.pink || c.accent || c.fg, dim: c.dim || c.fg, hi: c.hi || c.fg, bg: c.bg });
function colours(col) {
  const light = lum(col.bg) > 0.5, a = col.acc === col.fg ? mix(col.dim, col.bg, 0.45) : col.acc;   // LCD: its accent is its ink
  return { o: col.fg, a, p: col.pink === col.fg ? mix(col.dim, col.bg, 0.25) : col.pink, d: col.dim, h: col.hi === col.fg ? mix(col.fg, col.bg, 0.6) : col.hi,
    l: light ? col.bg : col.hi, k: light ? col.fg : col.bg };
}
const cache = new Map();
function sprite(id, col) {                            // a 12 x 12 canvas, cached per theme
  const art = (BY[id] && BY[id].art) || PROPS[id]; if (!art || typeof document === 'undefined' || !document.createElement) return null;
  const key = `${id}|${col.fg}|${col.acc}|${col.pink}|${col.dim}|${col.hi}|${col.bg}`;
  let c = cache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = 12; c.height = 12;
  const g = c.getContext('2d'), P = colours(col);
  art.forEach((row, y) => { for (let x = 0; x < 12; x++) { const ch = row[x]; if (P[ch]) { g.fillStyle = P[ch]; g.fillRect(x, y, 1, 1); } } });
  if (cache.size > 400) cache.clear();
  cache.set(key, c); return c;
}
function draw(g, id, x, y, px, col) {                 // its top left corner at x, y; px: one sprite pixel
  const c = sprite(id, col); if (!c) return;
  const s0 = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false; g.drawImage(c, Math.round(x), Math.round(y), 12 * px, 12 * px); g.imageSmoothingEnabled = s0;
}
return { STICKERS, BY, PROPS, FAIT, story, theme, colours, sprite, draw };
})();

(window.PixelScenePacks ||= []).push(({ S, L, sm, out, inn, seg, bump, jumps, pick }) => {
const DUO = (window.PixelAmisDuo ||= {});           // the visitor's part of each two-Pixel scene (web/amis.js draws him)
const ART = window.PixelAmisArt;
// names in a line: his friend's (web/amis.js PixelAmis.duo while a friend is here, or the event's data), the host's own;
// a friend called « Pixel » keeps his name (persona.js would put the host's own name in place of « Pixel »)
const keep = n => String(n).replace(/Pixel/g, 'Pix⁠el');
const duo = () => (window.PixelAmis && window.PixelAmis.duo) || {};
const ami = o => keep((o && o.ami) || duo().ami || 'mon copain');
const hote = () => keep(duo().hote || 'Pixel');
const choose = list => list[((duo().seed || 0) >>> 0) % list.length];   // the same pick for the host and the visitor (one seed a scene)
const walk = e => -8 * Math.abs(Math.sin(e / 160)), sway = e => 0.04 * Math.sin(e / 160), run = e => -10 * Math.abs(Math.sin(e / 90));
const still = (e, a, b) => sm(seg(e, a, a + 500)) * (1 - sm(seg(e, b - 500, b)));      // 0 -> 1 -> 0 between a and b

// ---- a visit, on the host's screen: the host's part here, the visitor's in DUO ----
S('ami-arrive', 'De la visite', 'evt', { dur: 10000, anim: [[0, 'curieux'], [2600, 'surpris'], [3400, 'etoiles'], [6000, 'salut']], mood: 'excite',
  say: [[300, 2400, L('Tiens ? De la visite !', 'Oh ? Quelqu’un arrive !')], [6100, 8400, o => `${ami(o)} ! Entre, entre !`]],
  move: e => ({ x: 30 * still(e, 0, 2800), r: 0.05 * still(e, 0, 2800), y: e > 2600 && e < 4600 ? -26 * bump(seg(e, 2600, 3300)) - 18 * bump(seg(e, 3300, 4000)) : 0 }) });
DUO['ami-arrive'] = { anim: [[0, 'content'], [3800, 'salut'], [6200, 'content']], mood: 'content', valise: e => 1 - seg(e, 8200, 9200),
  say: [[3900, 6000, () => `Coucou ${hote()} !`], [8500, 9900, L('Me voilà !', 'Je suis venu !')]],
  move: e => (e < 3800 ? { x: 760 * (1 - out(seg(e, 0, 3800))), y: walk(e), r: sway(e), f: true } : { y: -14 * bump(seg(e, 3800, 4300)) }) };

S('ami-danse', 'On danse ensemble', 'evt', { dur: 26000, anim: [[0, 'idee'], [2000, 'danse'], [24000, 'content']], mood: 'excite',
  say: [[300, 1900, L('On danse ?', 'Une petite danse ?')], [17000, 19000, L('Waouh !', 'Trop fort !')], [24100, 25800, L('Quel duo !', 'On est les rois !')]],
  move: e => { const k = seg(e, 2000, 2600) * (1 - seg(e, 23400, 24000)); return { y: -18 * Math.abs(Math.sin(e / 260)) * k, r: 0.12 * Math.sin(e / 520) * k, x: 30 * Math.sin(e / 1040) * k }; },
  props: (D, e) => { if (e > 2000 && e < 24000) D.notes(e); } });
DUO['ami-danse'] = { anim: [[0, 'curieux'], [2100, 'etoiles'], [3000, 'danse'], [24000, 'content']], mood: 'excite', notes: [3000, 24000],
  say: [[2100, 3900, L('Oh oui !', 'Trop bien !')], [14000, 16400, L('Regarde mon pas !', 'Et hop !')]],
  move: e => { const k = seg(e, 3000, 3600) * (1 - seg(e, 23400, 24000)); const spin = e > 14500 && e < 15300 ? 2 * Math.PI * sm(seg(e, 14500, 15300)) : 0;
    return { y: -18 * Math.abs(Math.sin(e / 260)) * k, r: -0.12 * Math.sin(e / 520) * k + spin, x: -30 * Math.sin(e / 1040) * k }; } };

S('ami-tape', 'Tape là', 'evt', { dur: 10000, anim: [[0, 'content'], [3000, 'surpris'], [3400, 'etoiles'], [7800, 'content']], mood: 'excite',
  say: [[200, 1800, L('Tape là !', 'Tope là !')], [5600, 7700, L('Ouais !', 'Trop bien !')]],
  move: e => ({ x: 110 * out(seg(e, 1500, 3000)) * (1 - sm(seg(e, 3300, 4800))), y: e > 4800 && e < 7400 ? jumps(e - 4800, 650, 26) : 0, r: 0.08 * bump(seg(e, 2600, 3400)) }) });
DUO['ami-tape'] = { anim: [[0, 'content'], [3000, 'surpris'], [3400, 'etoiles'], [7800, 'content']], mood: 'excite',
  say: [[3500, 5300, L('Clac !', 'Bien joué !')]],
  move: e => ({ x: -110 * out(seg(e, 1500, 3000)) * (1 - sm(seg(e, 3300, 4800))), y: e > 4900 && e < 7500 ? jumps(e - 4900, 650, 26) : 0, r: -0.08 * bump(seg(e, 2600, 3400)) }),
  shared: (k, e) => { if (e > 2900 && e < 4400) k.boum(seg(e, 2900, 4400)); } };

S('ami-course', 'Attrape-moi', 'evt', { dur: 20000, anim: [[0, 'surpris'], [2600, 'rire'], [12000, 'fatigue'], [17000, 'content']], mood: 'excite',
  say: [[1900, 3500, L('Hé, attends-moi !', 'Je vais t’attraper !')], [12400, 14600, L('Pfiou ! T’es rapide !', 'Ouf ! Quelle course !')], [17000, 19400, L('Plus tard…', 'Je reprends mon souffle !')]],
  move: e => (e < 2600 ? { x: 0 } : e < 4600 ? { x: 1500 * inn(seg(e, 2600, 4600)), y: run(e), r: sway(e) } : e < 9600 ? { x: 2000 }
    : e < 12000 ? { x: -1000 * (1 - out(seg(e, 9600, 12000))), y: run(e), r: sway(e) } : { y: 6 * Math.sin(e / 180) * (1 - seg(e, 15000, 16000)) }) });
DUO['ami-course'] = { anim: [[0, 'rire'], [11500, 'fatigue'], [17000, 'rire']], mood: 'content',
  say: [[200, 1800, L('Attrape-moi !', 'Tu ne m’auras pas !')], [14800, 16800, L('Encore une ?', 'J’ai gagné !')]],
  move: e => (e < 1500 ? { y: -16 * bump(seg(e, 200, 700)) } : e < 3600 ? { x: 900 * inn(seg(e, 1500, 3600)), y: run(e), r: sway(e) } : e < 8600 ? { x: 2000 }
    : e < 11500 ? { x: -1430 * (1 - out(seg(e, 8600, 11500))), y: run(e), r: sway(e) } : { y: 6 * Math.sin(e / 170) * (1 - seg(e, 15000, 16000)) }) };

S('ami-gouter', 'Le goûter', 'evt', { dur: 16000, anim: [[0, 'idee'], [2400, 'content'], [6000, 'bisou'], [7300, 'content'], [12600, 'amoureux']], mood: 'content',
  say: [[300, 2300, L('On goûte ?', 'C’est l’heure du goûter !')], [7300, 9200, L('Miam !', 'Hmm, trop bon !')], [12800, 15400, L('On partage tout !', 'Merci d’être là !')]],
  move: e => ({ x: 80 * still(e, 5800, 7400), y: 26 * still(e, 5800, 7400), r: 0.1 * still(e, 5800, 7400) }) });
DUO['ami-gouter'] = { anim: [[0, 'content'], [4000, 'bisou'], [5600, 'content'], [10000, 'amoureux']], mood: 'content',
  say: [[4300, 5900, L('Miam !', 'Croc !')], [10000, 12500, L('C’était trop bon !', 'Délicieux !')]],
  move: e => ({ x: -80 * still(e, 3800, 5400), y: 26 * still(e, 3800, 5400), r: -0.1 * still(e, 3800, 5400) }),
  shared: (k, e) => { if (e > 600 && e < 14800) k.gouter(e, seg(e, 600, 1200) * (1 - seg(e, 14200, 14800)), e < 5000 ? 0 : e < 7000 ? 1 : 2); } };

S('ami-cache', 'Cache-cache', 'evt', { dur: 22000, anim: [[0, 'curieux'], [2600, 'timide'], [6200, 'recherche'], [14000, 'surpris'], [14400, 'rire'], [19000, 'content']], mood: 'ecoute',
  say: [[2600, 4200, L('Je compte : 1… 2… 3…', '1… 2… 3…')], [4300, 6000, L('…4… 5 ! J’arrive !', '…4… 5 ! Prêt ?')], [6400, 8400, L('Où es-tu ?', 'Hou hou ?')], [9000, 11200, o => `Tu es où, ${ami(o)} ?`], [14200, 16200, L('Trouvé !', 'Je t’ai trouvé !')], [19000, 21500, L('À moi de me cacher !', 'Encore une partie ?')]],
  move: e => (e < 6200 ? { y: 6 * still(e, 2600, 6000) } : e < 12000 ? { x: 60 * Math.sin((e - 6200) / 700), r: 0.06 * Math.sin((e - 6200) / 700) } : e > 14000 && e < 18500 ? { y: jumps(e - 14000, 600, 22) } : {}) });
DUO['ami-cache'] = { anim: [[0, 'clin-oeil'], [2600, 'rire'], [12000, 'clin-oeil'], [13000, 'rire'], [19000, 'content']], mood: 'content',
  say: [[200, 2400, L('Cache-cache ! Tu comptes ?', 'On joue à cache-cache ?')], [12400, 14000, L('Coucou !', 'Bouh !')], [16500, 18700, L('Hihi ! Bien joué !', 'Tu m’as eu !')]],
  move: e => (e < 2600 ? {} : e < 4400 ? { y: 1000 * inn(seg(e, 2600, 4400)) } : e < 12000 ? { y: 1000 } : e < 13000 ? { y: 1000 - 820 * out(seg(e, 12000, 13000)) } : e < 13800 ? { y: 180 * (1 - out(seg(e, 13000, 13800))) - 30 * bump(seg(e, 13000, 13800)) } : { y: e > 14000 && e < 18500 ? jumps(e - 14000, 600, 22) : 0 }) };

/* a joke in two parts: one Pixel asks, the other says « Non ! », the first answers (no free text: these are all of them) */
const BLAGUES = [['Tu connais la blague du Wi-Fi ?', 'Elle ne capte rien !'], ['Tu connais la blague de la pile ?', 'Elle est super chargée !'],
  ['Quel est le dessert des robots ?', 'Les puces au chocolat !'], ['Pourquoi l’écran est triste ?', 'Il a perdu un pixel !'], ['Que boit un robot ?', 'Du jus… électrique !']];
const blague = () => choose(BLAGUES);
S('ami-blague', 'La blague', 'evt', { dur: 14000, anim: [[0, 'ecoute'], [2800, 'curieux'], [7400, 'rire'], [12000, 'content']], mood: 'ecoute',
  say: [[2800, 4400, L('Non, raconte !', 'Non ! Dis-moi !')], [8000, 10400, L('Hahaha !', 'Hihihi ! Trop drôle !')]],
  move: e => ({ r: e > 7400 && e < 11800 ? 0.1 * Math.sin(e / 45) * (1 - seg(e, 10800, 11800)) : 0, y: e > 7400 && e < 11800 ? -6 * Math.abs(Math.sin(e / 90)) : 0 }) });
DUO['ami-blague'] = { anim: [[0, 'parle'], [2800, 'ecoute'], [4600, 'parle'], [7400, 'rire'], [12000, 'content']], mood: 'content',
  say: [[300, 2600, () => blague()[0]], [4600, 7300, () => blague()[1]], [10600, 12800, L('Elle est bonne, hein ?', 'J’en ai plein d’autres !')]],
  move: e => ({ r: e > 7400 && e < 11800 ? -0.1 * Math.sin(e / 45) * (1 - seg(e, 10800, 11800)) : 0, y: e > 7400 && e < 11800 ? -6 * Math.abs(Math.sin(e / 90)) : 0 }) };

/* a little chat: four lines, two each (the visitor starts) */
const CAUSETTES = [['Tu as mangé quoi, toi ?', 'Une pizza !', 'Moi, des frites !', 'Miam…'], ['Tu fais quoi, ce soir ?', 'Je regarde les étoiles.', 'Moi aussi !', 'On se fera coucou !'],
  ['J’ai appris un truc !', 'Ah oui ? Quoi ?', '2 et 2 font 4 !', 'Trop fort !'], ['Tu as vu ce nuage ?', 'On dirait un lapin !', 'Ou une pizza !', 'Hihi !'],
  ['Chez moi, il pleut !', 'Ici, il fait beau.', 'Vive les flaques !', 'Plouf !'], ['J’ai fait un rêve…', 'Raconte !', 'J’étais une fusée !', 'Waouh !']];
const causette = () => choose(CAUSETTES);
S('ami-bavarde', 'On bavarde', 'evt', { dur: 18000, anim: [[0, 'ecoute'], [3600, 'parle'], [6200, 'ecoute'], [10800, 'parle'], [13400, 'content']], mood: 'ecoute',
  say: [[3800, 6000, () => causette()[1]], [11000, 13200, () => causette()[3]]],
  move: e => ({ r: 0.05 * still(e, 0, 3400) + 0.05 * still(e, 6200, 10600), x: 16 * still(e, 3600, 6200) }) });
DUO['ami-bavarde'] = { anim: [[0, 'parle'], [3600, 'ecoute'], [6200, 'parle'], [10800, 'ecoute'], [13400, 'rire']], mood: 'content',
  say: [[300, 3400, () => causette()[0]], [6400, 10600, () => causette()[2]]],
  move: e => ({ r: -0.05 * still(e, 3600, 6200) - 0.05 * still(e, 10800, 13400), x: -16 * still(e, 6200, 10600), y: e > 13400 ? -8 * bump(seg(e, 13400, 14000)) : 0 }) };

S('ami-photo', 'La photo souvenir', 'evt', { dur: 9000, anim: [[0, 'idee'], [2400, 'content'], [5400, 'etoiles'], [6200, 'content']], mood: 'content',
  say: [[300, 2300, L('Une photo souvenir ?', 'Une photo de nous deux !')], [6100, 8400, L('Elle est super !', 'On est trop beaux !')]],
  move: e => ({ x: 70 * still(e, 2600, 5800), r: 0.06 * still(e, 2600, 5800) }) });
DUO['ami-photo'] = { anim: [[0, 'content'], [2400, 'clin-oeil'], [5400, 'etoiles'], [6200, 'content']], mood: 'content', flash: 5000,
  say: [[2500, 4200, L('Ouistiti !', 'Souriez !')]],
  move: e => ({ x: -70 * still(e, 2600, 5800), r: -0.06 * still(e, 2600, 5800) }),
  shared: (k, e) => { if (e > 2200 && e < 6200) k.photo(e, seg(e, 2200, 2600) * (1 - seg(e, 5700, 6200))); if (e > 5000 && e < 5900) k.flash(1 - seg(e, 5000, 5900)); } };

S('ami-dodo', 'Dodo côte à côte', 'evt', { dur: 26000, anim: [[0, 'baille'], [5000, 'idle-somnole'], [7000, 'sommeil'], [22000, 'reveil'], [23600, 'salut']], mood: 'endormi',
  say: [[300, 2600, L('Il est tard…', 'Je baille…')], [22800, 25200, L('Déjà ?', 'Oh… bonne nuit !')]],
  move: e => ({ y: 16 * sm(seg(e, 5000, 8000)) * (1 - sm(seg(e, 21500, 22500))), r: 0.08 * sm(seg(e, 5000, 8000)) * (1 - sm(seg(e, 21500, 22500))) }),
  props: (D, e) => { if (e > 7000 && e < 21500) D.zzz(e - 7000, 1); } });
DUO['ami-dodo'] = { anim: [[0, 'baille'], [4800, 'idle-somnole'], [6800, 'sommeil'], [20000, 'reveil'], [21000, 'surpris'], [22000, 'content']], mood: 'endormi', zzz: [7000, 20000],
  say: [[2800, 4800, L('Moi aussi…', 'On fait dodo ?')], [20400, 22600, L('Oh ! Je dois rentrer !', 'Oups, il est tard !')]],
  move: e => ({ y: 16 * sm(seg(e, 4800, 7800)) * (1 - sm(seg(e, 19800, 20600))), r: -0.08 * sm(seg(e, 4800, 7800)) * (1 - sm(seg(e, 19800, 20600))) }),
  shared: (k, e) => { if (e > 4000 && e < 21000) k.nuit(e, seg(e, 4000, 5000) * (1 - seg(e, 20000, 21000))); } };

S('ami-aurevoir', 'Au revoir', 'evt', { dur: 9000, anim: [[0, 'content'], [2800, 'salut'], [7600, 'content']], mood: 'content',
  say: [[2800, 5000, o => `Au revoir ${ami(o)} ! Reviens vite !`]],
  move: e => ({ x: 30 * still(e, 5000, 9000), r: 0.05 * still(e, 5000, 9000) }) });
DUO['ami-aurevoir'] = { anim: [[0, 'amoureux'], [2800, 'content'], [5000, 'salut']], mood: 'content', valise: e => seg(e, 4400, 5000),
  say: [[300, 2600, () => `Merci ${hote()}, c’était super !`], [5100, 6600, L('Salut !', 'À bientôt !')]],
  move: e => (e < 5000 ? {} : { x: 760 * inn(seg(e, 5000, 8600)), y: walk(e), r: sway(e) }) };

/* when the host is busy with something else (a touch, a cuddle): the visitor watches him */
DUO[''] = { anim: [[0, 'curieux']], mood: 'ecoute', move: () => ({}) };

// ---- on the visitor's own screen: he goes, he is away, he comes home ----
// ami-part and ami-absent last a minute, then he walks back in by himself: while the visit goes on, web/amis.js plays ami-absent
// again just before (AWAY_END), and puts the return (ami-revient, ami-bredouille) in their place when it ends
S('ami-part', 'Il part chez un ami', 'evt', { dur: 60000, anim: [[0, 'salut'], [1300, 'content'], [56000, 'curieux'], [58200, 'salut']], mood: 'content',
  say: [[200, 1500, o => `Je vais voir ${ami(o)} !`], [58300, 59800, L('Me revoilà !')]],
  move: e => (e < 1300 ? { y: -16 * bump(e / 650) } : e < 3600 ? { x: 760 * inn(seg(e, 1300, 3600)), y: walk(e), r: sway(e) } : e < 56000 ? { x: 2000 }
    : { x: 760 * (1 - out(seg(e, 56000, 58200))), y: e < 58200 ? walk(e) : 0, r: e < 58200 ? sway(e) : 0, f: e < 58200 }),
  props: (D, e) => { if (e < 3600 || e > 56000) D.valise(e, e < 3600 ? 1 : seg(e, 56000, 56400)); } });
S('ami-absent', 'Il est chez un ami', 'evt', { dur: 60000, anim: [[0, 'curieux'], [58200, 'salut']], mood: 'content',
  move: e => (e < 56000 ? { x: 2000 } : { x: 760 * (1 - out(seg(e, 56000, 58200))), y: e < 58200 ? walk(e) : 0, r: e < 58200 ? sway(e) : 0, f: e < 58200 }) });
const REFUS = { 'pas-de-reponse': n => `${n} n’a pas répondu… il doit dormir.`, dort: n => `Chut… ${n} fait dodo. On ira demain !`,
  occupe: n => `${n} est occupé. On ira plus tard !`, exo: n => `${n} fait des maths ! On ira après.`, absent: n => `${n} n’était pas chez lui !`,
  visite: n => `${n} a déjà de la visite !`, ferme: n => `${n} ne reçoit pas de visite en ce moment.`, non: n => `${n} ne peut pas jouer maintenant.`,
  'pas-repondu': n => `Personne n’a ouvert chez ${n}…`, croise: n => `On s’est croisés ! ${n} venait me voir !`, reseau: () => 'Je n’ai pas trouvé le chemin… pas d’Internet ?' };
S('ami-revient', 'Il rentre de chez un ami', 'evt', { dur: 9600, on: ['ami-retour'], when: d => !d.refus, anim: [[0, 'curieux'], [3600, 'salut'], [6300, 'etoiles'], [8800, 'content']], mood: 'excite',
  say: [[3700, 6200, o => (o.par === 'rappel' ? 'Me revoilà ! Tu m’as appelé ?' : o.par === 'dodo' ? 'Me revoilà ! C’est l’heure du dodo.' : `J’ai joué avec ${ami(o)} !`)],
    [6300, 9400, o => (o.par === 'rappel' ? `${ami(o)} te dit coucou !` : o.par === 'dodo' ? `${ami(o)} te dit bonne nuit !` : ART ? ART.story(o.fait) : 'C’était super !')]],
  move: e => (e < 1500 ? { x: 2000 } : e < 3600 ? { x: 760 * (1 - out(seg(e, 1500, 3600))), y: walk(e), r: sway(e), f: true } : { y: e > 6300 && e < 8200 ? jumps(e - 6300, 620, 30) : 0 }),
  props: (D, e) => { if (e < 4600) D.valise(e, 1 - seg(e, 4000, 4600)); if (e > 6300) D.stars(e - 6300); } });
S('ami-bredouille', 'Il rentre bredouille', 'evt', { dur: 7800, on: ['ami-retour'], when: d => !!d.refus, anim: [[0, 'curieux'], [3600, 'confus'], [5800, 'content']], mood: 'confus',
  say: [[3700, 7600, o => (REFUS[o.refus] || REFUS.non)(ami(o))]],
  move: e => (e < 1500 ? { x: 2000 } : e < 3600 ? { x: 760 * (1 - out(seg(e, 1500, 3600))), y: walk(e), r: sway(e), f: true } : { r: 0.06 * still(e, 3600, 5800) }),
  props: (D, e) => { if (e < 4600) D.valise(e, 1 - seg(e, 4000, 4600)); } });

// ---- the news ----
S('ami-nouveau', 'Un nouvel ami', 'evt', { dur: 7600, on: ['ami-nouveau'], anim: [[0, 'surpris'], [800, 'etoiles'], [4200, 'amoureux']], mood: 'excite',
  say: [[300, 3000, L('J’ai un nouvel ami !', 'Un nouveau copain !')], [3200, 7200, o => `Il s’appelle ${ami(o)} !`]],
  move: e => ({ y: e < 3000 ? jumps(e, 600, 30) : 0, x: -40 * still(e, 3200, 7600) }), props: (D, e) => { if (e < 4200) D.stars(e); else D.hearts(e - 4200, 1); } });
S('ami-coucou', 'Un ami fait coucou', 'evt', { dur: 5200, on: ['ami-coucou'], anim: [[0, 'surpris'], [700, 'salut'], [3200, 'content']], mood: 'content',
  say: [[800, 3000, o => `Oh ! ${ami(o)} me fait coucou !`], [3200, 5000, L('Coucou !', 'Salut, toi !')]],
  move: e => ({ x: -50 * still(e, 0, 5200), r: -0.05 * still(e, 0, 5200) }) });
const MERCI = { coeur: 'Trop mignon !', rire: 'Hahaha !', bisou: 'Smack !', gateau: 'Miam !', fusee: 'Décollage !', musique: '♪ La la la !', soleil: 'Quel beau soleil !' };
S('ami-sticker', 'Un autocollant d’un ami', 'evt', { dur: 5600, on: ['ami-sticker'], anim: [[0, 'surpris'], [800, 'etoiles'], [3400, 'content']], mood: 'excite',
  say: [[300, 2900, o => `${ami(o)} m’envoie ${o.sn || 'un cadeau'} !`], [3000, 5400, o => MERCI[o.s] || 'Merci !']],
  move: e => ({ x: -60 * still(e, 0, 5600), y: -14 * bump(seg(e, 800, 1300)) }) });
S('ami-envoi', 'Il fait coucou à un ami', 'evt', { dur: 3800, on: ['ami-envoi'], anim: [[0, 'salut'], [2600, 'content']], mood: 'content',
  say: [[200, 3400, o => (o.sn ? `Hop ! ${o.sn[0].toUpperCase() + o.sn.slice(1)} pour ${ami(o)} !` : `Coucou ${ami(o)} !`)]],
  move: e => ({ x: 40 * still(e, 0, 3800), y: -12 * bump(seg(e, 200, 700)) }) });
S('ami-toc', 'On frappe', 'evt', { dur: 4200, on: ['ami-question'], anim: [[0, 'surpris'], [900, 'curieux'], [2400, 'etoiles']], mood: 'ecoute',
  say: [[300, 2200, L('Toc toc ? On frappe !', 'Quelqu’un frappe ?')], [2400, 4000, o => `C’est ${ami(o)} !`]],
  move: e => ({ x: 40 * still(e, 0, 2400), y: -16 * bump(seg(e, 2400, 2900)) }), props: (D, e) => { if (e < 2200) D.knock(e); } });
});
