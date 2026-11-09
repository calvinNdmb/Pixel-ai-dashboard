/* Scene pack « moments » — little moments for the animations added to the pack in Pixel OS (web/pack52: casque, pause-cafe,
   jaloux, gene, trepigne, compte-a-rebours, ding, popcorn, froid, chaud, vent, orage). The other new ones play in the scenes
   they were made for: his meals (web/scenes/nourrir.js), the exercises (web/scenes/exos.js), the snow (web/scenes/travail.js).
   See the top of web/persona.js: scenes are defined with S('id', 'Label', 'group', { ... }) on one line each (pixel/scenes.py
   reads them), groups tap / fache / calin / retour / vie / evt, plus "on" (events) and "pool" (touch pools). These scenes have
   no props of their own: the animations carry theirs (the headphones, the cup, the clock...). */
(window.PixelScenePacks ||= []).push(({ S, L, seg, bump, jumps }) => {
const fade = (e, a, b, c, d) => seg(e, a, b) * (1 - seg(e, c, d));
const summer = c => c.mo >= 5 && c.mo <= 8;

// ---- alone: music, a break, a film, the clock ----
S('moment-casque', 'Le casque sur les oreilles', 'vie', { dur: 8200, w: 2, when: c => !c.night, anim: [[0, 'casque'], [7200, 'content']], mood: 'content',
  say: [[500, 3200, L('♪ Mmm mmm mmm…', '♪ La la la…', '♪ Boum tchak…')], [3800, 7000, L('J’adore ce morceau !', 'Tu veux écouter ?', 'Encore une fois !')]],
  move: e => ({ x: 12 * Math.sin(e / 520) * fade(e, 0, 600, 6800, 7400), r: 0.04 * Math.sin(e / 260) * fade(e, 0, 600, 6800, 7400) }) });
S('moment-cafe', 'La pause café', 'vie', { dur: 8400, w: 2, when: c => c.day, anim: [[0, 'idle-etire'], [1600, 'pause-cafe'], [7400, 'content']], mood: 'content',
  say: [[1800, 4400, L('Une petite pause…', 'Mmm, ça sent bon.', 'Ça, c’est la belle vie.')], [4800, 8000, L('Ça fait du bien.', 'Toi aussi, fais une pause !', 'Encore cinq minutes…')]],
  move: e => ({ y: 4 * fade(e, 1600, 2400, 7000, 7800) }) });
S('moment-cine', 'La séance de cinéma', 'vie', { dur: 9000, w: 1, when: c => c.h >= 17 && !c.night, anim: [[0, 'curieux'], [1200, 'popcorn'], [6400, 'rire'], [8000, 'content']], mood: 'excite',
  say: [[300, 1200, L('Chut, ça commence !', 'Mon film préféré !')], [2600, 6000, L('Oh non, pas par là !', 'Trop bien, cette scène.', 'Attention, derrière toi !')], [6500, 8800, L('Encore un épisode ?', 'J’adore la fin.', 'Hi hi hi !')]],
  move: e => ({ y: 2 * Math.abs(Math.sin(e / 140)) * fade(e, 1400, 1800, 6000, 6400) }) });
S('moment-heure', 'L’heure tourne', 'vie', { dur: 7600, w: 1, when: c => c.day, anim: [[0, 'idle-heure'], [1800, 'compte-a-rebours'], [5200, 'ding'], [6800, 'soulage']], mood: 'surpris',
  say: [[400, 1700, L('Quelle heure il est ?', 'Tiens, déjà ?')], [2200, 5000, L('Plus que trois secondes…', 'Tic, tac, tic, tac…', 'Ça y est presque !')], [5300, 7400, L('Ding ! Pile à l’heure.', 'Ouf, juste à temps !', 'Et voilà !')]],
  move: e => ({ y: jumps(Math.max(0, e - 5200), 500, 16) * fade(e, 5200, 5300, 6300, 6700) }) });

// ---- the weather on his face ----
S('moment-froid', 'Brrr, quel froid', 'vie', { dur: 7200, w: 2, when: c => c.kind === 'neige' || (c.xmas && !c.night), anim: [[0, 'froid'], [5400, 'timide'], [6400, 'content']], mood: 'malade',
  say: [[400, 3000, L('Brrr !', 'Ça caille !', 'J’ai les pixels gelés.')], [3400, 6800, L('Un chocolat chaud ?', 'Mets ton bonnet !', 'Vivement le printemps.')]],
  move: e => ({ x: 3 * Math.sin(e / 22) * fade(e, 200, 600, 5000, 5400) }) });
S('moment-canicule', 'Trop chaud', 'vie', { dur: 7600, w: 2, when: c => c.sunny && summer(c) && c.h >= 11 && c.h < 19, anim: [[0, 'chaud'], [5600, 'idee'], [6800, 'content']], mood: 'baille',
  say: [[400, 3200, L('Pfiou, quelle chaleur !', 'Je fonds…', 'Il fait trop chaud.')], [3600, 7200, L('Une glace ?', 'Bois un grand verre d’eau !', 'Vite, de l’ombre !')]],
  move: e => ({ y: 8 * fade(e, 0, 900, 5200, 5800), sy: 1 - 0.04 * fade(e, 0, 900, 5200, 5800) }) });
S('moment-bourrasque', 'La bourrasque', 'vie', { dur: 6400, w: 1, when: c => c.kind === 'nuage' && !c.night, anim: [[0, 'curieux'], [900, 'vent'], [4900, 'rire']], mood: 'surpris',
  say: [[1100, 3400, L('Wooo, ça souffle !', 'Mon chapeau !', 'Accroche-toi !')], [4900, 6200, L('Tout décoiffé.', 'Pfiou !', 'Même pas peur.')]],
  move: e => ({ x: 30 * fade(e, 1300, 2300, 3600, 4700) }) });
S('moment-eclair', 'Un éclair', 'vie', { dur: 6800, w: 2, when: c => c.kind === 'orage', anim: [[0, 'idle-haut'], [800, 'orage'], [4800, 'gene']], mood: 'surpris',
  say: [[1500, 3200, L('Aaah !', 'Un éclair !', 'Boum !')], [3400, 4700, L('Un… deux… trois…', 'Il est loin ?')], [4900, 6600, L('J’ai pas eu peur.', 'Enfin… un peu.', 'On ferme les volets ?')]],
  move: e => ({ y: -18 * bump(seg(e, 1500, 1900)) }) });

// ---- when you touch him ----
S('moment-gene', 'Tout gêné', 'tap', { pool: 'calm', dur: 2600, anim: [[0, 'gene']], mood: 'amoureux', say: [[150, 2400, L('Euh… oui ?', 'Hi hi, pardon.', 'Tu m’as surpris !', 'Je rêvassais…')]],
  move: e => ({ x: -8 * fade(e, 0, 500, 2000, 2600) }) });
S('moment-trepigne', 'Il trépigne', 'fache', { pool: 'annoyed', dur: 2400, anim: [[0, 'trepigne']], mood: 'fache', say: [[100, 2200, L('Bon, on y va ?', 'Allez, allez !', 'J’ai pas toute la journée !', 'C’est pour aujourd’hui ?')]] });
S('moment-jaloux', 'Un peu jaloux', 'fache', { pool: 'annoyed', dur: 2800, anim: [[0, 'jaloux'], [2200, 'boudeur']], mood: 'fache', say: [[150, 2600, L('Tu préfères ton téléphone ?', 'Et moi, alors ?', 'Pff, même pas jaloux.', 'Occupe-toi de moi !')]],
  move: e => ({ r: -0.05 * fade(e, 0, 500, 2200, 2800) }) });
});
