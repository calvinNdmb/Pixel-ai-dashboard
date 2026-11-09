/* Pixel Lab: the Pixel de poche (../poche.js). "Voir sur un téléphone" turns the monitor into a phone held sideways: the same
   canvas, now his pocket twin, to touch, press long and stroke. The buttons pretend what the phone feels (shaken, tilted,
   its battery, the Pi out of reach, out of the pocket) and what happens to the other Pixel, through the fake server
   (demo-hub.js mirrors pixel/poche.py): the lab shows both sides of the two Pixels, one at a time. */
(() => {
const $ = id => document.getElementById(id), PP = window.PixelPoche, hub = window.PixelHub;
if (!PP || !hub || !$('pocheView')) return;
PP.lab({ send: (action, args) => hub.dispatch(action, args), frame: $('lab') });
const press = (e, on) => e.setAttribute('aria-pressed', String(!!on));
const act = (action, args) => () => hub.dispatch(action, args);
const button = ([label, fn]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', () => { fn(); setTimeout(render, 50); }); return b; };
const VOYAGE = [['Viens dans ma poche', act('poche.voyage', { to: 'poche' })], ['Rentre à la maison', act('poche.voyage', { to: 'pi' })]];
const TWIN = {                        // what happens to the other Pixel
  pi: [['Il s’allume', act('poche.touch', { kind: 'bonjour', by: 'poche' })], ['On le touche', act('poche.touch', { kind: 'tape', by: 'poche' })],
    ['On le caresse', act('poche.touch', { kind: 'caresse', by: 'poche' })], ['On le secoue', act('poche.touch', { kind: 'secoue', by: 'poche' })]],
  poche: [['On touche celui du Pi', act('poche.touch', { kind: 'tape', by: 'pi' })], ['On caresse celui du Pi', act('poche.touch', { kind: 'caresse', by: 'pi' })]],
};
const SENSE = [['Secouer', () => PP.sim.shake()], ['Pencher à gauche', () => PP.sim.tilt(-1)], ['Pencher à droite', () => PP.sim.tilt(1)],
  ['Batterie à 12 %', () => PP.sim.battery(0.12, false)], ['Brancher le chargeur', () => PP.sim.battery(0.5, true)],
  ['Pi injoignable', () => PP.sim.link(false)], ['Pi retrouvé', () => PP.sim.link(true)], ['Sorti de la poche', () => PP.sim.pocket(5 * 60000)]];
let shown = null;
function render() {
  const v = PP.on, b = $('pocheView');
  press(b, v); b.textContent = v ? 'Revenir à l’écran du Pi' : 'Voir sur un téléphone';
  $('pocheTwinTitle').textContent = v ? 'Le Pixel du Pi, à la maison' : 'Son jumeau, sur le téléphone';
  $('pocheSenseBox').hidden = !v;
  $('pocheNote').textContent = v
    ? 'Le cadre est un téléphone en mode paysage. Touche Pixel, appuie longtemps pour un câlin, ou caresse-le du doigt. Les boutons font comme si le téléphone était secoué, penché, presque vide ou loin du Pi.'
    : 'Ces boutons font comme si on touchait, caressait ou secouait son jumeau sur le téléphone : regarde le Pixel du Pi réagir (jaloux !). Le voyage l’envoie une minute dans ta poche.';
  if (shown === v) return; shown = v;
  $('pocheTwin').replaceChildren(...[...TWIN[v ? 'poche' : 'pi'], ...VOYAGE].map(button));
  $('pocheSense').replaceChildren(...SENSE.map(button));
}
$('pocheView').addEventListener('click', () => { PP.view(!PP.on); render(); });
addEventListener('hashchange', () => { if (window.PixelLab && PixelLab.kiosk && PP.on) { PP.view(false); render(); } });   // the bare 800x480 screen is the Pi's
render();
})();
